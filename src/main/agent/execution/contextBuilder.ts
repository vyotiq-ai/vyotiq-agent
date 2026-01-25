/**
 * Context Builder
 * Builds terminal and workspace context for system prompts
 */

import type { TerminalManager } from '../../tools';
import type { Logger } from '../../logger';
import type { TerminalContextInfo, TerminalProcessInfo, WorkspaceStructureContext, InternalTerminalSettings } from '../systemPrompt';

/**
 * Default terminal settings for AI context (hardcoded since terminal settings UI was removed)
 */
const DEFAULT_TERMINAL_SETTINGS: InternalTerminalSettings = {
  defaultShell: 'system',
  defaultTimeout: 30000,
  maxConcurrentProcesses: 5,
};

/**
 * Callback type to get workspace structure from SemanticIndexer
 * Returns rich workspace analysis if available, undefined otherwise
 */
export type WorkspaceStructureGetter = () => Promise<WorkspaceStructureContext | undefined>;

// Module-level getter for semantic workspace structure
let semanticWorkspaceStructureGetter: WorkspaceStructureGetter | null = null;

/**
 * Set the semantic workspace structure getter
 * Called by main process to provide access to SemanticIndexer's workspace analysis
 */
export function setSemanticWorkspaceStructureGetter(getter: WorkspaceStructureGetter): void {
  semanticWorkspaceStructureGetter = getter;
}

export class ContextBuilder {
  private readonly terminalManager: TerminalManager;
  private readonly logger: Logger;

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
   * Uses SemanticIndexer's rich workspace analysis when available,
   * falls back to basic detection otherwise
   */
  async buildWorkspaceStructureContext(
    workspacePath?: string
  ): Promise<WorkspaceStructureContext | undefined> {
    if (!workspacePath) {
      return undefined;
    }

    // Try to get rich workspace structure from SemanticIndexer first
    if (semanticWorkspaceStructureGetter) {
      try {
        const semanticStructure = await semanticWorkspaceStructureGetter();
        if (semanticStructure) {
          this.logger.debug('Using semantic workspace structure', {
            projectType: semanticStructure.projectType,
            framework: semanticStructure.framework,
          });
          return semanticStructure;
        }
      } catch (error) {
        this.logger.warn('Failed to get semantic workspace structure, falling back to basic detection', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Fallback to basic workspace detection
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
}
