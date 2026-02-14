/**
 * Session Queue Manager
 * Handles per-session execution queues for proper serialization
 */

import type { InternalSession } from '../types';
import type { Logger } from '../../logger';

interface QueuedExecution {
  session: InternalSession;
  resolve: () => void;
  reject: (err: Error) => void;
}

interface SessionQueueData {
  queue: QueuedExecution[];
  isProcessing: boolean;
}

export class SessionQueueManager {
  private readonly logger: Logger;
  private readonly sessionQueues = new Map<string, SessionQueueData>();
  private readonly executeSession: (session: InternalSession) => Promise<void>;

  constructor(
    logger: Logger,
    executeSession: (session: InternalSession) => Promise<void>
  ) {
    this.logger = logger;
    this.executeSession = executeSession;
  }

  /**
   * Queue a session for execution
   */
  queueExecution(session: InternalSession): Promise<void> {
    const sessionId = session.state.id;

    return new Promise((resolve, reject) => {
      let sessionQueueData = this.sessionQueues.get(sessionId);
      if (!sessionQueueData) {
        sessionQueueData = { queue: [], isProcessing: false };
        this.sessionQueues.set(sessionId, sessionQueueData);
      }

      const queuePosition = sessionQueueData.queue.length;
      const isFirstInQueue = queuePosition === 0 && !sessionQueueData.isProcessing;

      this.logger.debug('Queueing session execution', {
        sessionId,
        queuePosition,
        isFirstInQueue,
        isProcessing: sessionQueueData.isProcessing,
      });

      sessionQueueData.queue.push({ session, resolve, reject });

      this.processSessionQueue(sessionId).catch(err => {
        this.logger.error('Session queue processing error', {
          sessionId,
          error: err instanceof Error ? err.message : String(err)
        });
      });
    });
  }

  /**
   * Clear any queued executions for a session
   */
  clearSessionQueue(sessionId: string): number {
    const sessionQueueData = this.sessionQueues.get(sessionId);
    if (!sessionQueueData) {
      return 0;
    }

    const clearedCount = sessionQueueData.queue.length;

    for (const { reject } of sessionQueueData.queue) {
      reject(new Error('Session execution cancelled'));
    }

    sessionQueueData.queue = [];
    // Also mark as not processing and remove from map to prevent stale entries
    sessionQueueData.isProcessing = false;
    this.sessionQueues.delete(sessionId);

    this.logger.debug('Cleared session queue', {
      sessionId,
      clearedCount,
    });

    return clearedCount;
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): { totalSessions: number; totalQueued: number; sessionsProcessing: number } {
    let totalQueued = 0;
    let sessionsProcessing = 0;

    for (const [, data] of this.sessionQueues) {
      totalQueued += data.queue.length;
      if (data.isProcessing) {
        sessionsProcessing++;
      }
    }

    return {
      totalSessions: this.sessionQueues.size,
      totalQueued,
      sessionsProcessing,
    };
  }

  /**
   * Process a specific session's queue sequentially
   */
  private async processSessionQueue(sessionId: string): Promise<void> {
    const sessionQueueData = this.sessionQueues.get(sessionId);
    if (!sessionQueueData) {
      return;
    }

    if (sessionQueueData.isProcessing) {
      this.logger.debug('Session queue already processing, skipping', { sessionId });
      return;
    }

    sessionQueueData.isProcessing = true;
    this.logger.debug('Starting session queue processing', {
      sessionId,
      queueLength: sessionQueueData.queue.length
    });

    try {
      while (sessionQueueData.queue.length > 0) {
        const { session, resolve, reject } = sessionQueueData.queue.shift()!;

        this.logger.info('Processing queued session execution', {
          sessionId,
          remainingInQueue: sessionQueueData.queue.length,
        });

        try {
          await this.executeSession(session);
          resolve();
        } catch (error) {
          this.logger.error('Session execution failed', {
            sessionId,
            error: error instanceof Error ? error.message : String(error),
          });
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    } finally {
      sessionQueueData.isProcessing = false;
      this.logger.debug('Session queue processing complete', { sessionId });

      if (sessionQueueData.queue.length > 0) {
        this.logger.debug('New items queued during processing, restarting', {
          sessionId,
          newQueueLength: sessionQueueData.queue.length,
        });
        this.processSessionQueue(sessionId).catch(err => {
          this.logger.error('Session queue processing error in retry', {
            sessionId,
            error: err instanceof Error ? err.message : String(err)
          });
        });
      } else {
        this.sessionQueues.delete(sessionId);
        this.logger.debug('Cleaned up empty session queue', { sessionId });
      }
    }
  }
}
