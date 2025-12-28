import type { RendererEvent, AgentEvent } from '../../shared/types';
import type { TerminalManager } from '../tools';
import type { Logger } from '../logger';

export class TerminalEventHandler {
    constructor(
        private readonly terminalManager: TerminalManager,
        private readonly logger: Logger,
        private readonly emitEvent: (event: RendererEvent | AgentEvent) => void
    ) { }

    public setupEventListeners(): void {
        // Forward terminal output events to UI for real-time visibility
        // Note: This only applies to the 'run' tool (run_terminal_command), not git_* tools
        this.terminalManager.on('stdout', ({ pid, chunk }: { pid: number; chunk: string }) => {
            this.emitEvent({
                type: 'terminal-output',
                pid,
                data: chunk,
                stream: 'stdout',
                timestamp: Date.now(),
            } as RendererEvent);
        });

        this.terminalManager.on('stderr', ({ pid, chunk }: { pid: number; chunk: string }) => {
            this.emitEvent({
                type: 'terminal-output',
                pid,
                data: chunk,
                stream: 'stderr',
                timestamp: Date.now(),
            } as RendererEvent);
        });

        // Forward terminal exit events to UI so it can mark commands as complete
        this.terminalManager.on('exit', ({ pid, code }: { pid: number; code: number | null }) => {
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
            this.logger.error('Terminal process error', { pid, error });
            this.emitEvent({
                type: 'terminal-error',
                pid,
                error,
                timestamp: Date.now(),
            } as RendererEvent);
        });
    }
}
