import type { RendererEvent, AgentEvent } from '../../shared/types';
import type { TerminalManager } from '../tools';
import type { Logger } from '../logger';

/**
 * Configuration for terminal output throttling
 * Balances real-time feedback with performance
 */
const TERMINAL_BATCH_INTERVAL_MS = 50; // Batch terminal output every 50ms
const TERMINAL_MAX_BUFFER_SIZE = 4096; // Force flush if buffer exceeds 4KB

interface TerminalBuffer {
    chunks: Array<{ stream: 'stdout' | 'stderr'; data: string; timestamp: number }>;
    timer: NodeJS.Timeout | null;
}

export class TerminalEventHandler {
    /**
     * Buffers for batching terminal output per PID
     * This reduces the number of IPC messages sent to the renderer
     */
    private terminalBuffers = new Map<number, TerminalBuffer>();

    /**
     * Stored references to bound event listeners for proper cleanup.
     * Using bound references ensures removeListener removes only our handlers.
     */
    private boundListeners: {
        stdout?: (data: { pid: number; chunk: string }) => void;
        stderr?: (data: { pid: number; chunk: string }) => void;
        exit?: (data: { pid: number; code: number | null }) => void;
        error?: (data: { pid: number; error: string }) => void;
        warning?: (data: { pid: number; message: string }) => void;
    } = {};

    constructor(
        private readonly terminalManager: TerminalManager,
        private readonly logger: Logger,
        private readonly emitEvent: (event: RendererEvent | AgentEvent) => void
    ) { }

    /**
     * Flush buffered terminal output for a specific PID
     */
    private flushTerminalBuffer(pid: number): void {
        const buffer = this.terminalBuffers.get(pid);
        if (!buffer || buffer.chunks.length === 0) return;

        // Clear the timer if set
        if (buffer.timer) {
            clearTimeout(buffer.timer);
            buffer.timer = null;
        }

        // Combine all chunks into a single output
        const combinedData = buffer.chunks.map(c => c.data).join('');
        const lastStream = buffer.chunks[buffer.chunks.length - 1]?.stream ?? 'stdout';

        // Clear the buffer
        buffer.chunks = [];

        // Emit batched terminal output
        if (combinedData) {
            this.emitEvent({
                type: 'terminal-output',
                pid,
                data: combinedData,
                stream: lastStream,
                timestamp: Date.now(),
            } as RendererEvent);
        }
    }

    /**
     * Schedule a flush for a terminal buffer
     */
    private scheduleFlush(pid: number): void {
        const buffer = this.terminalBuffers.get(pid);
        if (!buffer || buffer.timer) return;

        buffer.timer = setTimeout(() => {
            this.flushTerminalBuffer(pid);
        }, TERMINAL_BATCH_INTERVAL_MS);
    }

    /**
     * Add a chunk to the terminal buffer
     */
    private bufferTerminalOutput(pid: number, stream: 'stdout' | 'stderr', data: string): void {
        let buffer = this.terminalBuffers.get(pid);
        if (!buffer) {
            buffer = { chunks: [], timer: null };
            this.terminalBuffers.set(pid, buffer);
        }

        buffer.chunks.push({ stream, data, timestamp: Date.now() });

        // Calculate total buffer size
        const totalSize = buffer.chunks.reduce((sum, c) => sum + c.data.length, 0);

        // Force flush if buffer exceeds max size
        if (totalSize >= TERMINAL_MAX_BUFFER_SIZE) {
            this.flushTerminalBuffer(pid);
        } else {
            this.scheduleFlush(pid);
        }
    }

    /**
     * Cleanup buffers for a terminated process
     */
    private cleanupTerminalBuffer(pid: number): void {
        const buffer = this.terminalBuffers.get(pid);
        if (buffer) {
            // Flush any remaining data
            this.flushTerminalBuffer(pid);
            this.terminalBuffers.delete(pid);
        }
    }

    public setupEventListeners(): void {
        // Store bound listener references so we can remove only our handlers later
        this.boundListeners.stdout = ({ pid, chunk }: { pid: number; chunk: string }) => {
            this.bufferTerminalOutput(pid, 'stdout', chunk);
        };

        this.boundListeners.stderr = ({ pid, chunk }: { pid: number; chunk: string }) => {
            this.bufferTerminalOutput(pid, 'stderr', chunk);
        };

        this.boundListeners.exit = ({ pid, code }: { pid: number; code: number | null }) => {
            // Flush any remaining buffered output before sending exit
            this.cleanupTerminalBuffer(pid);
            
            this.emitEvent({
                type: 'terminal-exit',
                pid,
                code: code ?? 0,
                timestamp: Date.now(),
            } as RendererEvent);
        };

        // Handle terminal error events (timeouts, spawn failures, etc.)
        // This is critical - unhandled 'error' events on EventEmitter cause uncaught exceptions
        this.boundListeners.error = ({ pid, error }: { pid: number; error: string }) => {
            // Cleanup buffer on error
            this.cleanupTerminalBuffer(pid);
            
            // Use warn level for timeouts (expected behavior), error for actual failures
            const isTimeout = error.toLowerCase().includes('timed out');
            if (isTimeout) {
                this.logger.warn('Terminal process timed out', { pid, error });
            } else {
                this.logger.error('Terminal process error', { pid, error });
            }
            this.emitEvent({
                type: 'terminal-error',
                pid,
                error,
                timestamp: Date.now(),
            } as RendererEvent);
        };

        // Handle terminal warning events (e.g., long-running commands)
        // Note: warnings are logged but not emitted as RendererEvent 
        // since the type system doesn't include terminal-warning
        this.boundListeners.warning = ({ pid, message }: { pid: number; message: string }) => {
            this.logger.warn('Terminal process warning', { pid, message });
        };

        // Register all bound listeners
        this.terminalManager.on('stdout', this.boundListeners.stdout);
        this.terminalManager.on('stderr', this.boundListeners.stderr);
        this.terminalManager.on('exit', this.boundListeners.exit);
        this.terminalManager.on('error', this.boundListeners.error);
        this.terminalManager.on('warning', this.boundListeners.warning);
    }

    /**
     * Remove only this handler's event listeners from the terminal manager.
     * Uses stored bound references to avoid removing listeners registered by other code.
     */
    public removeEventListeners(): void {
        // Clear all pending flush timers
        for (const [_pid, buffer] of this.terminalBuffers) {
            if (buffer.timer) {
                clearTimeout(buffer.timer);
            }
        }
        this.terminalBuffers.clear();

        // Remove only our specific listeners (not all listeners on the emitter)
        if (this.boundListeners.stdout) {
            this.terminalManager.removeListener('stdout', this.boundListeners.stdout);
        }
        if (this.boundListeners.stderr) {
            this.terminalManager.removeListener('stderr', this.boundListeners.stderr);
        }
        if (this.boundListeners.exit) {
            this.terminalManager.removeListener('exit', this.boundListeners.exit);
        }
        if (this.boundListeners.error) {
            this.terminalManager.removeListener('error', this.boundListeners.error);
        }
        if (this.boundListeners.warning) {
            this.terminalManager.removeListener('warning', this.boundListeners.warning);
        }
        this.boundListeners = {};
        
        this.logger.debug('Terminal event listeners removed');
    }
}
