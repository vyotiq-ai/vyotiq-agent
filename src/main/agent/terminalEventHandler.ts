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
        // Forward terminal output events to UI for real-time visibility
        // Note: This only applies to the 'run' tool (run_terminal_command), not git_* tools
        // Output is now batched to reduce IPC message frequency
        this.terminalManager.on('stdout', ({ pid, chunk }: { pid: number; chunk: string }) => {
            this.bufferTerminalOutput(pid, 'stdout', chunk);
        });

        this.terminalManager.on('stderr', ({ pid, chunk }: { pid: number; chunk: string }) => {
            this.bufferTerminalOutput(pid, 'stderr', chunk);
        });

        // Forward terminal exit events to UI so it can mark commands as complete
        this.terminalManager.on('exit', ({ pid, code }: { pid: number; code: number | null }) => {
            // Flush any remaining buffered output before sending exit
            this.cleanupTerminalBuffer(pid);
            
            this.emitEvent({
                type: 'terminal-exit',
                pid,
                code: code ?? 0,
                timestamp: Date.now(),
            } as RendererEvent);
        });

        // Handle terminal error events (timeouts, spawn failures, etc.)
        // This is critical - unhandled 'error' events on EventEmitter cause uncaught exceptions
        this.terminalManager.on('error', ({ pid, error }: { pid: number; error: string }) => {
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
        });
    }

    /**
     * Remove all event listeners from the terminal manager.
     * Should be called during orchestrator cleanup to prevent memory leaks.
     */
    public removeEventListeners(): void {
        // Clear all pending flush timers
        for (const [pid, buffer] of this.terminalBuffers) {
            if (buffer.timer) {
                clearTimeout(buffer.timer);
            }
        }
        this.terminalBuffers.clear();

        // Remove all listeners from terminal manager
        this.terminalManager.removeAllListeners('stdout');
        this.terminalManager.removeAllListeners('stderr');
        this.terminalManager.removeAllListeners('exit');
        this.terminalManager.removeAllListeners('error');
        
        this.logger.debug('Terminal event listeners removed');
    }
}
