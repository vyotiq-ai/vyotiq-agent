/**
 * Process Terminal Manager
 * 
 * Manages terminal processes for executing shell commands.
 * Uses node-pty for pseudo-terminal support with proper signal handling.
 * 
 * Features:
 * - Run commands with timeout support
 * - Background process management
 * - Real-time stdout/stderr streaming via events
 * - Process tracking and cleanup
 */
import { EventEmitter } from 'node:events';
import * as os from 'node:os';
import * as path from 'node:path';
import type * as pty from 'node-pty';
import { createLogger } from '../logger';
import type {
  TerminalManager,
  TerminalRunOptions,
  TerminalGetOutputOptions,
  TerminalProcessState,
  TerminalOutputPayload,
  TerminalExitPayload,
  TerminalErrorPayload,
} from './types';

const logger = createLogger('TerminalManager');

// Cache for invalid regex filter strings to avoid logging the same error repeatedly.
// Bounded to prevent unbounded memory growth in long-running sessions.
const MAX_INVALID_FILTER_CACHE = 500;
const invalidOutputFilterCache = new Set<string>();

// Lazy load node-pty to avoid issues in renderer process
let nodePty: typeof pty | null = null;
let nodePtyLoadError: Error | null = null;
let nodePtyLoadPromise: Promise<typeof pty> | null = null;

async function getPty(): Promise<typeof pty> {
  if (nodePtyLoadError) {
    throw nodePtyLoadError;
  }
  if (nodePty) {
    return nodePty;
  }

  if (!nodePtyLoadPromise) {
    nodePtyLoadPromise = import('node-pty')
      .then((mod) => {
        nodePty = mod as unknown as typeof pty;
        return nodePty;
      })
      .catch((error) => {
        nodePtyLoadError = new Error(
          `Failed to load node-pty: ${error instanceof Error ? error.message : String(error)}. ` +
            'This may be due to missing native dependencies or platform incompatibility.'
        );
        throw nodePtyLoadError;
      });
  }

  return nodePtyLoadPromise;
}


interface ProcessInfo {
  pty: pty.IPty;
  command: string;
  description?: string;
  stdout: string;
  stderr: string;
  startedAt: number;
  finishedAt?: number;
  exitCode: number | null;
  isRunning: boolean;
  lastReadIndex: number;
  timeout?: NodeJS.Timeout;
  warningTimeout?: NodeJS.Timeout;
}

// Default and maximum timeout values
const DEFAULT_TIMEOUT_MS = 240000; // 4 minutes (increased from 3)
const MAX_TIMEOUT_MS = 1200000; // 20 minutes (increased from 15)
const MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB max output per process
const TIMEOUT_WARNING_THRESHOLD_MS = 90000; // Warn after 1.5 minutes (increased from 1)

// Terminal session limits for multi-session concurrent execution safety
const MAX_CONCURRENT_TERMINALS = 20; // Maximum concurrent terminal processes globally

/**
 * Process Terminal Manager implementation using node-pty
 */
export class ProcessTerminalManager extends EventEmitter implements TerminalManager {
  private processes = new Map<number, ProcessInfo>();
  private pidCounter = 1;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    // Periodic cleanup of completed processes (every 5 minutes)
    this.cleanupTimer = setInterval(() => this.cleanup(), 300000);
  }

  /**
   * Dispose of the terminal manager and clear the cleanup timer
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    // Kill any remaining running processes
    for (const [pid, info] of this.processes) {
      if (info.isRunning) {
        try {
          this.kill(pid);
        } catch {
          // Best effort cleanup
        }
      }
    }
    this.processes.clear();
  }

  /**
   * Get sanitized environment variables for terminal processes.
   * Filters out sensitive keys (API keys, tokens, secrets) to prevent
   * accidental exposure through child processes.
   */
  private getSanitizedEnv(): Record<string, string> {
    const sensitivePatterns = [
      /^(ANTHROPIC|OPENAI|GOOGLE|AZURE|AWS|GITHUB|GITLAB|HUGGING|COHERE|MISTRAL|GROQ|TOGETHER|FIREWORKS|PERPLEXITY|DEEPSEEK)_.*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i,
      /^(?:API_KEY|SECRET_KEY|ACCESS_TOKEN|PRIVATE_KEY|AUTH_TOKEN|BEARER_TOKEN)$/i,
      /^NPM_TOKEN$/i,
      /^DOCKER_PASSWORD$/i,
    ];

    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value === undefined) continue;
      const isSensitive = sensitivePatterns.some(pattern => pattern.test(key));
      if (!isSensitive) {
        env[key] = value;
      }
    }
    return env;
  }

  /**
   * Get statistics about terminal usage for multi-session monitoring.
   */
  getTerminalStats(): {
    totalProcesses: number;
    runningProcesses: number;
    limits: { maxGlobal: number };
  } {
    let runningProcesses = 0;

    for (const [, info] of this.processes) {
      if (info.isRunning) runningProcesses++;
    }

    return {
      totalProcesses: this.processes.size,
      runningProcesses,
      limits: {
        maxGlobal: MAX_CONCURRENT_TERMINALS,
      },
    };
  }

  /**
   * Check if a new terminal can be started (enforces limits).
   */
  canStartTerminal(): { allowed: boolean; reason?: string } {
    // Count running processes globally
    let runningCount = 0;
    for (const [, info] of this.processes) {
      if (info.isRunning) runningCount++;
    }

    if (runningCount >= MAX_CONCURRENT_TERMINALS) {
      return {
        allowed: false,
        reason: `Maximum concurrent terminal limit reached (${MAX_CONCURRENT_TERMINALS})`,
      };
    }

    return { allowed: true };
  }

  /**
   * Run a command in a pseudo-terminal
   */
  async run(command: string, options: TerminalRunOptions = {}): Promise<TerminalProcessState> {
    const {
      cwd = process.cwd(),
      waitForExit = true,
      timeout = DEFAULT_TIMEOUT_MS,
      description,
    } = options;

    // Enforce terminal limits for multi-session safety
    const limitCheck = this.canStartTerminal();
    if (!limitCheck.allowed) {
      logger.warn('Terminal limit reached', {
        reason: limitCheck.reason,
        command: command.slice(0, 100),
      });
      throw new Error(`Cannot start terminal: ${limitCheck.reason}`);
    }

    const effectiveTimeout = Math.min(timeout, MAX_TIMEOUT_MS);
    const pid = this.pidCounter++;
    const startedAt = Date.now();

    // Determine shell based on platform
    const isWindows = os.platform() === 'win32';
    const shell = isWindows ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');
    
    // Convert bash-style command chaining to PowerShell syntax on Windows
    // && (AND) -> ; (sequential) - PowerShell doesn't support && in older versions
    // || (OR) -> ; if ($LASTEXITCODE -ne 0) { ... } - but we simplify to just ;
    let effectiveCommand = command;
    if (isWindows) {
      // Replace && and || with ; for PowerShell compatibility, but only outside quoted strings
      effectiveCommand = command.replace(
        /(['"`])(?:(?!\1)[\s\S])*?\1|(\s*&&\s*)|(\s*\|\|\s*)/g,
        (match, quote, andOp, orOp) => {
          if (quote) return match; // Inside quotes, keep as-is
          if (andOp) return ' ; ';
          if (orOp) return ' ; ';
          return match;
        }
      );
      
      // Log if command was modified
      if (effectiveCommand !== command) {
        logger.debug('Converted bash-style command to PowerShell syntax', {
          original: command.slice(0, 100),
          converted: effectiveCommand.slice(0, 100),
        });
      }
    }
    
    const shellArgs = isWindows ? ['-NoLogo', '-NoProfile', '-Command', effectiveCommand] : ['-c', command];

    const ptyModule = await getPty();

    return new Promise((resolve, reject) => {
      try {
        const ptyProcess = ptyModule.spawn(shell, shellArgs, {
          name: 'xterm-256color',
          cols: 120,
          rows: 30,
          cwd: path.resolve(cwd),
          env: this.getSanitizedEnv(),
        });

        const processInfo: ProcessInfo = {
          pty: ptyProcess,
          command,
          description,
          stdout: '',
          stderr: '',
          startedAt,
          exitCode: null,
          isRunning: true,
          lastReadIndex: 0,
        };

        this.processes.set(pid, processInfo);

        // Handle output (node-pty combines stdout/stderr)
        ptyProcess.onData((data: string) => {
          if (processInfo.stdout.length < MAX_OUTPUT_SIZE) {
            processInfo.stdout += data;
            // Trim if exceeded
            if (processInfo.stdout.length > MAX_OUTPUT_SIZE) {
              processInfo.stdout = processInfo.stdout.slice(0, MAX_OUTPUT_SIZE) + '\n[Output truncated]';
            }
          }
          
          // Emit real-time output event
          this.emit('stdout', { pid, chunk: data } as TerminalOutputPayload);
        });

        // Handle process exit
        ptyProcess.onExit(({ exitCode }) => {
          processInfo.isRunning = false;
          processInfo.exitCode = exitCode;
          processInfo.finishedAt = Date.now();

          // Clear timeout if set
          if (processInfo.timeout) {
            clearTimeout(processInfo.timeout);
            processInfo.timeout = undefined;
          }
          // Clear warning timeout if set
          if (processInfo.warningTimeout) {
            clearTimeout(processInfo.warningTimeout);
            processInfo.warningTimeout = undefined;
          }

          // Emit exit event
          this.emit('exit', { pid, code: exitCode } as TerminalExitPayload);

          if (waitForExit) {
            resolve(this.getProcessState(pid)!);
          }
        });

        // Set up timeout with progressive warnings
        if (waitForExit && effectiveTimeout > 0) {
          // Warning timeout - emit warning after threshold
          if (effectiveTimeout > TIMEOUT_WARNING_THRESHOLD_MS) {
            const warningTimeout = setTimeout(() => {
              if (processInfo.isRunning) {
                logger.info('Long-running command in progress', {
                  pid,
                  command: command.slice(0, 100),
                  elapsedMs: TIMEOUT_WARNING_THRESHOLD_MS,
                  remainingMs: effectiveTimeout - TIMEOUT_WARNING_THRESHOLD_MS,
                });
                // Emit a warning event (not error) so UI can show progress
                this.emit('warning', {
                  pid,
                  message: `Command running for ${Math.round(TIMEOUT_WARNING_THRESHOLD_MS / 1000)}s, will timeout in ${Math.round((effectiveTimeout - TIMEOUT_WARNING_THRESHOLD_MS) / 1000)}s`,
                });
              }
            }, TIMEOUT_WARNING_THRESHOLD_MS);
            
            // Store warning timeout for cleanup
            processInfo.warningTimeout = warningTimeout;
          }

          processInfo.timeout = setTimeout(() => {
            if (processInfo.isRunning) {
              const elapsedMs = Date.now() - processInfo.startedAt;
              processInfo.stderr += `\n[Process timed out after ${effectiveTimeout}ms (elapsed: ${elapsedMs}ms)]`;
              processInfo.isRunning = false;
              processInfo.exitCode = -1;
              processInfo.finishedAt = Date.now();
              
              // Clear warning timeout if set
              const extendedInfo = processInfo as ProcessInfo & { warningTimeout?: NodeJS.Timeout };
              if (extendedInfo.warningTimeout) {
                clearTimeout(extendedInfo.warningTimeout);
              }
              
              try {
                ptyProcess.kill();
              } catch (error) {
                logger.debug('Failed to kill timed-out process', {
                  pid,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
              
              logger.warn('Terminal process timed out', {
                pid,
                error: `Process timed out after ${effectiveTimeout}ms`,
              });
              
              // Emit error event only once
              this.emit('error', { 
                pid, 
                error: `Process timed out after ${effectiveTimeout}ms` 
              } as TerminalErrorPayload);
              
              // Resolve with the current state so caller doesn't hang forever
              resolve(this.getProcessState(pid)!);
            }
          }, effectiveTimeout);
        }

        // For background processes, resolve immediately
        if (!waitForExit) {
          resolve(this.getProcessState(pid)!);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.emit('error', { pid, error: errorMessage } as TerminalErrorPayload);
        reject(new Error(`Failed to start process: ${errorMessage}`));
      }
    });
  }


  /**
   * Get output from a process
   */
  getOutput(pid: number, options: TerminalGetOutputOptions = {}): TerminalProcessState | undefined {
    const processInfo = this.processes.get(pid);
    if (!processInfo) return undefined;

    const state = this.getProcessState(pid)!;
    const { filter, incrementalOnly = false } = options;

    // Get output based on options
    let stdout = incrementalOnly 
      ? processInfo.stdout.slice(processInfo.lastReadIndex)
      : processInfo.stdout;

    // Update last read index for incremental reads
    if (incrementalOnly) {
      processInfo.lastReadIndex = processInfo.stdout.length;
    }

    // Apply filter if provided
    if (filter) {
      try {
        const regex = new RegExp(filter, 'gm');
        const lines = stdout.split('\n');
        stdout = lines.filter(line => regex.test(line)).join('\n');
      } catch (error) {
        // Invalid regex, return unfiltered output (log once per filter to avoid noise)
        if (!invalidOutputFilterCache.has(filter)) {
          // Evict oldest entries if cache is full to prevent unbounded growth
          if (invalidOutputFilterCache.size >= MAX_INVALID_FILTER_CACHE) {
            const first = invalidOutputFilterCache.values().next().value;
            if (first !== undefined) invalidOutputFilterCache.delete(first);
          }
          invalidOutputFilterCache.add(filter);
          logger.debug('Invalid output filter regex', {
            pid,
            filter,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return {
      ...state,
      stdout,
    };
  }

  /**
   * Kill a process
   */
  async kill(pid: number): Promise<boolean> {
    const processInfo = this.processes.get(pid);
    if (!processInfo || !processInfo.isRunning) return false;

    try {
      processInfo.pty.kill();
      processInfo.isRunning = false;
      processInfo.exitCode = -1;
      processInfo.finishedAt = Date.now();
      
      if (processInfo.timeout) {
        clearTimeout(processInfo.timeout);
        processInfo.timeout = undefined;
      }

      return true;
    } catch (error) {
      logger.debug('Failed to kill process', {
        pid,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Kill all running processes
   */
  async killAll(): Promise<number> {
    let killed = 0;
    for (const [pid, processInfo] of this.processes) {
      if (processInfo.isRunning) {
        const success = await this.kill(pid);
        if (success) killed++;
      }
    }
    return killed;
  }

  /**
   * List all tracked processes
   */
  listProcesses(): Array<{ pid: number; command: string; isRunning: boolean; description?: string }> {
    return Array.from(this.processes.entries()).map(([pid, info]) => ({
      pid,
      command: info.command,
      isRunning: info.isRunning,
      description: info.description,
    }));
  }

  /**
   * Check if a process is running
   */
  isRunning(pid: number): boolean {
    return this.processes.get(pid)?.isRunning ?? false;
  }

  /**
   * Clean up old completed processes
   */
  cleanup(maxAgeMs = 3600000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [pid, info] of this.processes) {
      if (!info.isRunning && info.finishedAt && (now - info.finishedAt) > maxAgeMs) {
        this.processes.delete(pid);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get process state
   */
  private getProcessState(pid: number): TerminalProcessState | undefined {
    const info = this.processes.get(pid);
    if (!info) return undefined;

    return {
      pid,
      command: info.command,
      stdout: info.stdout,
      stderr: info.stderr,
      exitCode: info.exitCode,
      startedAt: info.startedAt,
      finishedAt: info.finishedAt,
      isRunning: info.isRunning,
    };
  }
}
