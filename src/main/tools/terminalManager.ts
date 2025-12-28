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
}

// Default and maximum timeout values
const DEFAULT_TIMEOUT_MS = 120000; // 2 minutes
const MAX_TIMEOUT_MS = 600000; // 10 minutes
const MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB max output per process

/**
 * Process Terminal Manager implementation using node-pty
 */
export class ProcessTerminalManager extends EventEmitter implements TerminalManager {
  private processes = new Map<number, ProcessInfo>();
  private pidCounter = 1;

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

    const effectiveTimeout = Math.min(timeout, MAX_TIMEOUT_MS);
    const pid = this.pidCounter++;
    const startedAt = Date.now();

    // Determine shell based on platform
    const isWindows = os.platform() === 'win32';
    const shell = isWindows ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');
    const shellArgs = isWindows ? ['-NoLogo', '-NoProfile', '-Command', command] : ['-c', command];

    const ptyModule = await getPty();

    return new Promise((resolve, reject) => {
      try {
        const ptyProcess = ptyModule.spawn(shell, shellArgs, {
          name: 'xterm-256color',
          cols: 120,
          rows: 30,
          cwd: path.resolve(cwd),
          env: { ...process.env } as Record<string, string>,
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

          // Emit exit event
          this.emit('exit', { pid, code: exitCode } as TerminalExitPayload);

          if (waitForExit) {
            resolve(this.getProcessState(pid)!);
          }
        });

        // Set up timeout
        if (waitForExit && effectiveTimeout > 0) {
          processInfo.timeout = setTimeout(() => {
            if (processInfo.isRunning) {
              processInfo.stderr += `\n[Process timed out after ${effectiveTimeout}ms]`;
              processInfo.isRunning = false;
              processInfo.exitCode = -1;
              processInfo.finishedAt = Date.now();
              
              try {
                ptyProcess.kill();
              } catch (error) {
                logger.debug('Failed to kill timed-out process', {
                  pid,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
              
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
