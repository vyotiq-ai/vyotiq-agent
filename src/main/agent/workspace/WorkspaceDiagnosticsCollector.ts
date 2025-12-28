/**
 * Workspace Diagnostics Collector
 *
 * Collects diagnostics (errors, warnings) from the entire workspace
 * by running TypeScript compiler (tsc) and optionally ESLint.
 * This provides the agent with complete visibility into all codebase issues,
 * not just those from files currently open in the editor.
 */

import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Logger } from '../../logger';

// =============================================================================
// Types
// =============================================================================

export interface WorkspaceDiagnostic {
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  source: 'typescript' | 'eslint';
  code?: string | number;
}

export interface WorkspaceDiagnosticsResult {
  diagnostics: WorkspaceDiagnostic[];
  errorCount: number;
  warningCount: number;
  filesWithErrors: string[];
  collectedAt: number;
  durationMs: number;
  source: 'typescript' | 'eslint' | 'both';
}

export interface WorkspaceDiagnosticsConfig {
  /** Maximum time to wait for diagnostics collection (ms) */
  timeout: number;
  /** Whether to run ESLint in addition to TypeScript */
  includeEslint: boolean;
  /** Maximum number of diagnostics to return */
  maxDiagnostics: number;
  /** Cache duration before refresh (ms) */
  cacheDurationMs: number;
  /** Whether to auto-refresh on file changes */
  autoRefresh: boolean;
  /** Debounce time for auto-refresh (ms) */
  refreshDebounceMs: number;
}

export const DEFAULT_WORKSPACE_DIAGNOSTICS_CONFIG: WorkspaceDiagnosticsConfig = {
  timeout: 60000, // 1 minute
  includeEslint: false, // TypeScript only by default (faster)
  maxDiagnostics: 500,
  cacheDurationMs: 30000, // 30 seconds
  autoRefresh: true,
  refreshDebounceMs: 5000, // 5 seconds
};

// =============================================================================
// WorkspaceDiagnosticsCollector
// =============================================================================

export class WorkspaceDiagnosticsCollector extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: WorkspaceDiagnosticsConfig;
  private cachedResult: WorkspaceDiagnosticsResult | null = null;
  private isCollecting = false;
  private refreshTimeout: NodeJS.Timeout | null = null;

  constructor(logger: Logger, config: Partial<WorkspaceDiagnosticsConfig> = {}) {
    super();
    this.logger = logger;
    this.config = { ...DEFAULT_WORKSPACE_DIAGNOSTICS_CONFIG, ...config };
  }

  /**
   * Collect diagnostics from the entire workspace
   */
  async collect(workspacePath: string, forceRefresh = false): Promise<WorkspaceDiagnosticsResult> {
    // Return cached result if still valid
    if (
      !forceRefresh &&
      this.cachedResult &&
      Date.now() - this.cachedResult.collectedAt < this.config.cacheDurationMs
    ) {
      this.logger.debug('Returning cached workspace diagnostics', {
        errorCount: this.cachedResult.errorCount,
        warningCount: this.cachedResult.warningCount,
        age: Date.now() - this.cachedResult.collectedAt,
      });
      return this.cachedResult;
    }

    // Prevent concurrent collection
    if (this.isCollecting) {
      this.logger.debug('Diagnostics collection already in progress, waiting...');
      // Wait for current collection to complete
      return new Promise((resolve) => {
        const handler = (result: WorkspaceDiagnosticsResult) => {
          this.off('collected', handler);
          resolve(result);
        };
        this.on('collected', handler);
      });
    }

    this.isCollecting = true;
    const startTime = Date.now();

    try {
      this.logger.info('Collecting workspace diagnostics', { workspacePath });

      // Check if tsconfig.json exists
      const hasTsConfig = await this.fileExists(path.join(workspacePath, 'tsconfig.json'));
      
      let diagnostics: WorkspaceDiagnostic[] = [];
      let source: 'typescript' | 'eslint' | 'both' = 'typescript';

      if (hasTsConfig) {
        // Run TypeScript compiler
        const tsDiagnostics = await this.runTypeScriptDiagnostics(workspacePath);
        diagnostics.push(...tsDiagnostics);
      }

      // Optionally run ESLint
      if (this.config.includeEslint) {
        const hasEslint = await this.fileExists(path.join(workspacePath, 'node_modules', '.bin', 'eslint'));
        if (hasEslint) {
          const eslintDiagnostics = await this.runEslintDiagnostics(workspacePath);
          diagnostics.push(...eslintDiagnostics);
          source = hasTsConfig ? 'both' : 'eslint';
        }
      }

      // Limit diagnostics count
      if (diagnostics.length > this.config.maxDiagnostics) {
        diagnostics = diagnostics.slice(0, this.config.maxDiagnostics);
      }

      // Calculate stats
      const errorCount = diagnostics.filter(d => d.severity === 'error').length;
      const warningCount = diagnostics.filter(d => d.severity === 'warning').length;
      const filesWithErrors = [...new Set(
        diagnostics.filter(d => d.severity === 'error').map(d => d.filePath)
      )];

      const result: WorkspaceDiagnosticsResult = {
        diagnostics,
        errorCount,
        warningCount,
        filesWithErrors,
        collectedAt: Date.now(),
        durationMs: Date.now() - startTime,
        source,
      };

      this.cachedResult = result;
      this.emit('collected', result);

      this.logger.info('Workspace diagnostics collected', {
        errorCount,
        warningCount,
        totalDiagnostics: diagnostics.length,
        filesWithErrors: filesWithErrors.length,
        durationMs: result.durationMs,
        source,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to collect workspace diagnostics', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      // Return empty result on error
      const emptyResult: WorkspaceDiagnosticsResult = {
        diagnostics: [],
        errorCount: 0,
        warningCount: 0,
        filesWithErrors: [],
        collectedAt: Date.now(),
        durationMs: Date.now() - startTime,
        source: 'typescript',
      };
      
      return emptyResult;
    } finally {
      this.isCollecting = false;
    }
  }

  /**
   * Get cached diagnostics without triggering collection
   */
  getCached(): WorkspaceDiagnosticsResult | null {
    return this.cachedResult;
  }

  /**
   * Clear cached diagnostics
   */
  clearCache(): void {
    this.cachedResult = null;
    this.logger.debug('Workspace diagnostics cache cleared');
  }

  /**
   * Schedule a refresh (debounced)
   */
  scheduleRefresh(workspacePath: string): void {
    if (!this.config.autoRefresh) return;

    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }

    this.refreshTimeout = setTimeout(() => {
      this.collect(workspacePath, true).catch(err => {
        this.logger.error('Failed to refresh workspace diagnostics', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, this.config.refreshDebounceMs);
  }

  /**
   * Run TypeScript compiler to get diagnostics
   */
  private async runTypeScriptDiagnostics(workspacePath: string): Promise<WorkspaceDiagnostic[]> {
    return new Promise((resolve) => {
      const diagnostics: WorkspaceDiagnostic[] = [];
      let output = '';

      // Use tsc with --noEmit to just check for errors
      const tsc = spawn('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
        cwd: workspacePath,
        shell: true,
        timeout: this.config.timeout,
      });

      tsc.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });

      tsc.stderr.on('data', (data: Buffer) => {
        output += data.toString();
      });

      tsc.on('close', () => {
        // Parse TypeScript output
        // Format: path/to/file.ts(line,column): error TS2345: message
        const lines = output.split('\n');
        const regex = /^(.+)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/;

        for (const line of lines) {
          const match = line.match(regex);
          if (match) {
            const [, filePath, lineStr, colStr, severity, code, message] = match;
            diagnostics.push({
              filePath: path.isAbsolute(filePath) ? filePath : path.join(workspacePath, filePath),
              line: parseInt(lineStr, 10),
              column: parseInt(colStr, 10),
              message: message.trim(),
              severity: severity === 'error' ? 'error' : 'warning',
              source: 'typescript',
              code,
            });
          }
        }

        resolve(diagnostics);
      });

      tsc.on('error', (err) => {
        this.logger.error('TypeScript process error', { error: err.message });
        resolve([]);
      });
    });
  }

  /**
   * Run ESLint to get diagnostics
   */
  private async runEslintDiagnostics(workspacePath: string): Promise<WorkspaceDiagnostic[]> {
    return new Promise((resolve) => {
      const diagnostics: WorkspaceDiagnostic[] = [];
      let output = '';

      // Run ESLint with JSON output
      const eslint = spawn('npx', ['eslint', '.', '--format', 'json', '--ext', '.ts,.tsx,.js,.jsx'], {
        cwd: workspacePath,
        shell: true,
        timeout: this.config.timeout,
      });

      eslint.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });

      eslint.on('close', () => {
        try {
          // Find JSON array in output
          const jsonMatch = output.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const results = JSON.parse(jsonMatch[0]) as Array<{
              filePath: string;
              messages: Array<{
                line: number;
                column: number;
                endLine?: number;
                endColumn?: number;
                message: string;
                severity: 1 | 2;
                ruleId: string | null;
              }>;
            }>;

            for (const result of results) {
              for (const msg of result.messages) {
                diagnostics.push({
                  filePath: result.filePath,
                  line: msg.line,
                  column: msg.column,
                  endLine: msg.endLine,
                  endColumn: msg.endColumn,
                  message: msg.message,
                  severity: msg.severity === 2 ? 'error' : 'warning',
                  source: 'eslint',
                  code: msg.ruleId || undefined,
                });
              }
            }
          }
        } catch (error) {
          this.logger.debug('Failed to parse ESLint output', {
            error: error instanceof Error ? error.message : String(error),
          });
        }

        resolve(diagnostics);
      });

      eslint.on('error', (err) => {
        this.logger.error('ESLint process error', { error: err.message });
        resolve([]);
      });
    });
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }
    this.removeAllListeners();
  }
}

// =============================================================================
// Singleton Access
// =============================================================================

let instance: WorkspaceDiagnosticsCollector | null = null;

export function initWorkspaceDiagnosticsCollector(
  logger: Logger,
  config?: Partial<WorkspaceDiagnosticsConfig>
): WorkspaceDiagnosticsCollector {
  if (instance) {
    instance.dispose();
  }
  instance = new WorkspaceDiagnosticsCollector(logger, config);
  return instance;
}

export function getWorkspaceDiagnosticsCollector(): WorkspaceDiagnosticsCollector | null {
  return instance;
}
