/**
 * Context Builder
 * Builds terminal and workspace context for system prompts.
 * Integrates with the Rust backend for indexed workspace search, semantic search,
 * and file discovery.
 */

import type { TerminalManager } from '../../tools';
import type { Logger } from '../../logger';
import type { TerminalContextInfo, TerminalProcessInfo, WorkspaceStructureContext, InternalTerminalSettings } from '../systemPrompt';
import { mainRustBackend } from '../resources/mainRustBackendClient';
import type { MainSemanticSearchResult } from '../resources/mainRustBackendClient';

/**
 * Default terminal settings for AI context (hardcoded since terminal settings UI was removed)
 */
const DEFAULT_TERMINAL_SETTINGS: InternalTerminalSettings = {
  defaultShell: 'system',
  defaultTimeout: 30000,
  maxConcurrentProcesses: 5,
};

export class ContextBuilder {
  private readonly terminalManager: TerminalManager;
  private readonly logger: Logger;
  
  /**
   * Cache of workspace paths that have been confirmed as indexed.
   * Prevents redundant HTTP requests to the Rust backend on every message.
   * Maps workspacePath -> { workspaceId, confirmedAt }
   */
  private readonly indexedWorkspaceCache = new Map<string, { workspaceId: string; confirmedAt: number }>();
  
  /** How long to trust the cached "indexed" status (5 minutes) */
  private static readonly INDEX_CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(
    terminalManager: TerminalManager,
    logger: Logger
  ) {
    this.terminalManager = terminalManager;
    this.logger = logger;
  }

  /**
   * Build terminal context for system prompt
   * Provides agent with visibility into active/recent terminal processes
   */
  buildTerminalContext(workspacePath?: string): TerminalContextInfo | undefined {
    try {
      const terminalSettings = DEFAULT_TERMINAL_SETTINGS;
      const processes: TerminalProcessInfo[] = [];

      if (this.terminalManager.listProcesses) {
        const rawProcesses = this.terminalManager.listProcesses();
        const recentProcesses = rawProcesses.slice(-10);

        for (const proc of recentProcesses) {
          const processInfo: TerminalProcessInfo = {
            pid: proc.pid,
            command: proc.command,
            isRunning: proc.isRunning,
            description: proc.description,
          };

          const output = this.terminalManager.getOutput(proc.pid);
          if (output) {
            processInfo.exitCode = output.exitCode;
            if (output.finishedAt && output.startedAt) {
              processInfo.durationMs = output.finishedAt - output.startedAt;
            }
            if (proc.isRunning && output.stdout) {
              processInfo.recentOutput = output.stdout.slice(-500);
            }
          }

          processes.push(processInfo);
        }
      }

      const isWindows = process.platform === 'win32';
      let defaultShell: string;

      if (terminalSettings.defaultShell === 'system') {
        defaultShell = isWindows ? 'PowerShell' : (process.env.SHELL || '/bin/bash');
      } else {
        defaultShell = terminalSettings.defaultShell;
      }

      return {
        processes,
        settings: terminalSettings,
        defaultShell,
        cwd: workspacePath,
      };
    } catch (error) {
      this.logger.error('Failed to build terminal context', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Build workspace structure context for system prompt
   * Performs basic workspace detection for project type and structure
   */
  async buildWorkspaceStructureContext(
    workspacePath?: string
  ): Promise<WorkspaceStructureContext | undefined> {
    if (!workspacePath) {
      return undefined;
    }

    // Basic workspace detection
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');

      const configFiles: string[] = [];
      const sourceDirectories: string[] = [];
      const testDirectories: string[] = [];
      let projectType: string | undefined;
      let framework: string | undefined;
      let packageManager: string | undefined;

      const filesToCheck = [
        'package.json', 'tsconfig.json', 'vite.config.ts', 'vite.config.js',
        'next.config.js', 'next.config.mjs', 'next.config.ts',
        'angular.json', 'vue.config.js', 'svelte.config.js',
        'Cargo.toml', 'go.mod', 'requirements.txt', 'pyproject.toml',
        '.eslintrc.js', '.eslintrc.json', '.prettierrc',
        'pnpm-lock.yaml', 'yarn.lock', 'package-lock.json', 'bun.lockb',
      ];

      for (const file of filesToCheck) {
        try {
          await fs.access(path.join(workspacePath, file));
          configFiles.push(file);
        } catch {
          // File doesn't exist
        }
      }

      // Detect project type and framework
      if (configFiles.includes('package.json')) {
        projectType = 'javascript';
        if (configFiles.includes('tsconfig.json')) {
          projectType = 'typescript';
        }
        
        if (configFiles.some(f => f.startsWith('next.config'))) {
          framework = 'Next.js';
        } else if (configFiles.some(f => f.startsWith('vite.config'))) {
          framework = 'Vite';
        } else if (configFiles.includes('angular.json')) {
          framework = 'Angular';
        } else if (configFiles.includes('vue.config.js')) {
          framework = 'Vue';
        } else if (configFiles.includes('svelte.config.js')) {
          framework = 'Svelte';
        }
      } else if (configFiles.includes('Cargo.toml')) {
        projectType = 'rust';
      } else if (configFiles.includes('go.mod')) {
        projectType = 'go';
      } else if (configFiles.includes('requirements.txt') || configFiles.includes('pyproject.toml')) {
        projectType = 'python';
      }

      // Detect package manager
      if (configFiles.includes('pnpm-lock.yaml')) {
        packageManager = 'pnpm';
      } else if (configFiles.includes('yarn.lock')) {
        packageManager = 'yarn';
      } else if (configFiles.includes('bun.lockb')) {
        packageManager = 'bun';
      } else if (configFiles.includes('package-lock.json')) {
        packageManager = 'npm';
      }

      // Check for common directories
      const dirsToCheck = ['src', 'lib', 'app', 'pages', 'components', 'test', 'tests', '__tests__', 'spec'];
      for (const dir of dirsToCheck) {
        try {
          const stat = await fs.stat(path.join(workspacePath, dir));
          if (stat.isDirectory()) {
            if (['test', 'tests', '__tests__', 'spec'].includes(dir)) {
              testDirectories.push(dir);
            } else {
              sourceDirectories.push(dir);
            }
          }
        } catch {
          // Directory doesn't exist
        }
      }

      if (!projectType && configFiles.length === 0 && sourceDirectories.length === 0) {
        return undefined;
      }

      return {
        projectType,
        framework,
        packageManager,
        configFiles: configFiles.slice(0, 10),
        sourceDirectories: sourceDirectories.slice(0, 5),
        testDirectories: testDirectories.slice(0, 3),
      };
    } catch (error) {
      this.logger.error('Failed to build workspace structure context', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  // ===========================================================================
  // Rust Backend Integration
  // ===========================================================================

  /**
   * Search the indexed workspace using the Rust backend full-text search.
   * Returns relevant code snippets for a given query.
   * Falls back gracefully if the Rust backend is not available.
   */
  async searchWorkspaceIndex(
    workspacePath: string,
    query: string,
    options?: { limit?: number; fuzzy?: boolean; filePattern?: string },
  ): Promise<Array<{ path: string; snippet: string; score: number }>> {
    try {
      const available = await mainRustBackend.isAvailable();
      if (!available) return [];

      const workspace = await mainRustBackend.findWorkspaceByPath(workspacePath);
      if (!workspace) return [];

      const response = await mainRustBackend.search(workspace.id, query, {
        limit: options?.limit ?? 20,
        fuzzy: options?.fuzzy ?? true,
        file_pattern: options?.filePattern,
      });

      return response.results.map((r) => ({
        path: r.relative_path || r.path,
        snippet: r.snippet,
        score: r.score,
      }));
    } catch (error) {
      this.logger.debug('Workspace index search failed (non-critical)', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Grep for a pattern across the indexed workspace.
   * Falls back gracefully if the Rust backend is not available.
   */
  async grepWorkspace(
    workspacePath: string,
    pattern: string,
    options?: { caseSensitive?: boolean; isRegex?: boolean; maxResults?: number },
  ): Promise<Array<{ path: string; line: number; content: string }>> {
    try {
      const available = await mainRustBackend.isAvailable();
      if (!available) return [];

      const workspace = await mainRustBackend.findWorkspaceByPath(workspacePath);
      if (!workspace) return [];

      const response = await mainRustBackend.grep(workspace.id, pattern, {
        case_sensitive: options?.caseSensitive,
        is_regex: options?.isRegex,
        limit: options?.maxResults ?? 50,
      });

      return response.results.map((m) => ({
        path: m.relative_path || m.path,
        line: m.line_number,
        content: m.line_content,
      }));
    } catch (error) {
      this.logger.debug('Workspace grep failed (non-critical)', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Ensure a workspace is registered and indexed in the Rust backend.
   * Called during session initialization to set up backend workspace state.
   * Uses a short-lived cache to avoid redundant HTTP requests on every message.
   * Will wait for indexing to complete (with timeout) on first call only.
   */
  async ensureWorkspaceIndexed(workspacePath: string): Promise<string | null> {
    if (!workspacePath) return null;
    
    // Check cache — if we recently confirmed this workspace is indexed, skip the HTTP roundtrip
    const cached = this.indexedWorkspaceCache.get(workspacePath);
    if (cached && (Date.now() - cached.confirmedAt) < ContextBuilder.INDEX_CACHE_TTL_MS) {
      return cached.workspaceId;
    }
    
    try {
      const available = await mainRustBackend.isAvailable();
      if (!available) return null;

      let workspace = await mainRustBackend.findWorkspaceByPath(workspacePath);
      let needsWait = false;

      if (!workspace) {
        const name = workspacePath.split(/[/\\]/).pop() || 'workspace';
        workspace = await mainRustBackend.createWorkspace(name, workspacePath);
        // Trigger indexing for new workspace (both full-text and vector)
        await mainRustBackend.triggerIndex(workspace.id);
        needsWait = true;
        this.logger.info('Registered and triggered indexing for workspace', {
          workspaceId: workspace.id,
          path: workspacePath,
        });
      } else {
        // Check if indexing is needed (not yet indexed)
        const status = await mainRustBackend.getIndexStatus(workspace.id);
        if (!status.indexed && !status.is_indexing) {
          await mainRustBackend.triggerIndex(workspace.id);
          needsWait = true;
          this.logger.info('Triggered re-indexing for existing workspace', {
            workspaceId: workspace.id,
          });
        } else if (status.is_indexing) {
          needsWait = true;
        }
      }

      // Wait for full-text AND vector indexing to complete (max 30s) so searches return results
      if (needsWait && workspace) {
        const maxWaitMs = 30_000;
        const pollIntervalMs = 500;
        const deadline = Date.now() + maxWaitMs;
        let fullTextReady = false;
        let vectorReady = false;

        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, pollIntervalMs));
          try {
            const status = await mainRustBackend.getIndexStatus(workspace.id);
            if (status.indexed && !fullTextReady) {
              fullTextReady = true;
              this.logger.info('Full-text indexing completed', { workspaceId: workspace.id });
            }
            if (status.vector_ready && !vectorReady) {
              vectorReady = true;
              this.logger.info('Vector indexing completed', { workspaceId: workspace.id });
            }
            // Exit once both are ready
            if (fullTextReady && vectorReady) {
              break;
            }
          } catch {
            // Status endpoint may fail transiently; keep polling
          }
        }

        if (!vectorReady) {
          this.logger.warn('Vector indexing did not complete within timeout, semantic search may use fallback', {
            workspaceId: workspace.id,
            fullTextReady,
          });
        }
      }

      // Cache the workspace as indexed to avoid redundant checks on subsequent messages
      if (workspace) {
        this.indexedWorkspaceCache.set(workspacePath, {
          workspaceId: workspace.id,
          confirmedAt: Date.now(),
        });
      }

      return workspace.id;
    } catch (error) {
      this.logger.debug('Failed to ensure workspace indexed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Perform true semantic search using vector embeddings.
   * Returns code chunks ranked by meaning similarity, not keyword match.
   * Falls back to full-text search if vector index is not available.
   */
  async semanticSearchWorkspace(
    workspacePath: string,
    query: string,
    options?: { limit?: number },
  ): Promise<Array<{ path: string; chunk: string; score: number; lineStart: number; lineEnd: number; language: string }>> {
    try {
      const available = await mainRustBackend.isAvailable();
      if (!available) return [];

      const workspace = await mainRustBackend.findWorkspaceByPath(workspacePath);
      if (!workspace) return [];

      const response = await mainRustBackend.semanticSearch(workspace.id, query, {
        limit: options?.limit ?? 15,
      });

      return response.results.map((r: MainSemanticSearchResult) => ({
        path: r.relative_path,
        chunk: r.chunk_text,
        score: r.score,
        lineStart: r.line_start,
        lineEnd: r.line_end,
        language: r.language,
      }));
    } catch (error) {
      this.logger.debug('Semantic search failed, falling back to full-text', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Fallback to full-text search
      return (await this.searchWorkspaceIndex(workspacePath, query, { limit: options?.limit }))
        .map((r) => ({
          path: r.path,
          chunk: r.snippet,
          score: r.score,
          lineStart: 0,
          lineEnd: 0,
          language: '',
        }));
    }
  }

  /**
   * Build relevant code context from the workspace for the current user query.
   * Uses semantic search to find the most relevant code snippets.
   * Returns formatted context string for system prompt injection.
   */
  async buildWorkspaceCodeContext(
    workspacePath: string,
    userQuery: string,
    maxSnippets: number = 10,
  ): Promise<string | undefined> {
    if (!workspacePath || !userQuery) return undefined;

    try {
      const results = await this.semanticSearchWorkspace(workspacePath, userQuery, {
        limit: maxSnippets,
      });

      if (results.length === 0) return undefined;

      const snippets = results
        .filter((r) => r.score > 0.3) // Only include reasonably relevant results
        .slice(0, maxSnippets)
        .map((r) => {
          const lineInfo = r.lineStart > 0 ? ` (lines ${r.lineStart}-${r.lineEnd})` : '';
          return `### ${r.path}${lineInfo}\n\`\`\`${r.language}\n${r.chunk}\n\`\`\``;
        });

      if (snippets.length === 0) return undefined;

      return `<relevant_code>\nThe following code snippets from the workspace are semantically relevant to the current query:\n\n${snippets.join('\n\n')}\n</relevant_code>`;
    } catch (error) {
      this.logger.debug('Failed to build workspace code context', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }
}
