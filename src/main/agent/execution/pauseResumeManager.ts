/**
 * Pause/Resume Manager
 * Handles pausing and resuming of agent runs
 */

import type { RendererEvent, AgentEvent, AgentStatusEvent } from '../../../shared/types';
import type { Logger } from '../../logger';

interface PauseState {
  pausedAt: number;
  resumeResolve?: () => void;
}

export class PauseResumeManager {
  private readonly logger: Logger;
  private readonly emitEvent: (event: RendererEvent | AgentEvent) => void;
  private readonly pausedSessions = new Map<string, PauseState>();

  constructor(
    logger: Logger,
    emitEvent: (event: RendererEvent | AgentEvent) => void
  ) {
    this.logger = logger;
    this.emitEvent = emitEvent;
  }

  /**
   * Pause an active run
   */
  pauseRun(sessionId: string, hasActiveController: boolean): boolean {
    if (this.pausedSessions.has(sessionId)) {
      this.logger.warn('pauseRun: Session already paused', { sessionId });
      return false;
    }

    if (!hasActiveController) {
      this.logger.warn('pauseRun: No active run to pause', { sessionId });
      return false;
    }

    this.logger.info('pauseRun: Pausing session', { sessionId });
    this.pausedSessions.set(sessionId, { pausedAt: Date.now() });

    this.emitEvent({
      type: 'agent-status',
      sessionId,
      timestamp: Date.now(),
      status: 'paused',
      message: 'Paused',
      metadata: {
        paused: true,
      },
    } as AgentStatusEvent);

    return true;
  }

  /**
   * Resume a paused run
   */
  resumeRun(sessionId: string): boolean {
    const pauseState = this.pausedSessions.get(sessionId);
    if (!pauseState) {
      this.logger.warn('resumeRun: Session not paused', { sessionId });
      return false;
    }

    this.logger.info('resumeRun: Resuming session', {
      sessionId,
      pausedDuration: Date.now() - pauseState.pausedAt
    });

    if (pauseState.resumeResolve) {
      pauseState.resumeResolve();
    }

    this.pausedSessions.delete(sessionId);

    this.emitEvent({
      type: 'agent-status',
      sessionId,
      timestamp: Date.now(),
      status: 'executing',
      message: 'Resumed',
      metadata: {
        paused: false,
      },
    } as AgentStatusEvent);

    return true;
  }

  /**
   * Check if a session is paused
   */
  isRunPaused(sessionId: string): boolean {
    return this.pausedSessions.has(sessionId);
  }

  /**
   * Wait if the session is paused
   */
  async waitIfPaused(sessionId: string): Promise<void> {
    const pauseState = this.pausedSessions.get(sessionId);
    if (!pauseState) return;

    this.logger.debug('waitIfPaused: Waiting for resume', { sessionId });

    await new Promise<void>((resolve) => {
      pauseState.resumeResolve = resolve;
    });
  }

  /**
   * Clear pause state for a session (used during cancellation)
   */
  clearPauseState(sessionId: string): void {
    const pauseState = this.pausedSessions.get(sessionId);
    if (pauseState?.resumeResolve) {
      pauseState.resumeResolve();
    }
    this.pausedSessions.delete(sessionId);
  }
}
