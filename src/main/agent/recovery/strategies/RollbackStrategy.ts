/**
 * RollbackStrategy
 *
 * Undo recent changes and try again from a clean state.
 * Used when partial changes have been made before failure.
 */

import type {
  RecoveryStrategy,
  RecoveryAttempt,
  ClassifiedError,
  RecoveryDeps,
} from '../types';
import { randomUUID } from 'node:crypto';

// =============================================================================
// Strategy Definition
// =============================================================================

export const ROLLBACK_STRATEGY: RecoveryStrategy = {
  type: 'rollback',
  name: 'Rollback and Retry',
  description: 'Undo recent changes and attempt the operation again',
  priority: 3,
  applicableCategories: ['logic', 'validation', 'external'],
  applicableSeverities: ['medium', 'high'],
  maxAttempts: 1,
  timeoutMs: 120000,
  requiresUserInteraction: false,
};

// =============================================================================
// Rollback Types
// =============================================================================

export interface RollbackAction {
  id: string;
  type: 'file' | 'terminal' | 'state' | 'context';
  description: string;
  targetPath?: string;
  previousState?: unknown;
  canRollback: boolean;
}

export interface RollbackPoint {
  id: string;
  timestamp: number;
  description: string;
  actions: RollbackAction[];
}

// =============================================================================
// RollbackExecutor
// =============================================================================

export class RollbackExecutor {
  private readonly logger: RecoveryDeps['logger'];
  private rollbackPoints: Map<string, RollbackPoint> = new Map();

  constructor(deps: RecoveryDeps) {
    this.logger = deps.logger;
  }

  /**
   * Check if this strategy can handle the error
   */
  canHandle(error: ClassifiedError, runId?: string): boolean {
    // Can handle if we have rollback points for this run
    if (!runId) return false;

    const hasRollbackPoints = this.hasRollbackPoints(runId);
    return (
      hasRollbackPoints &&
      ROLLBACK_STRATEGY.applicableCategories.includes(error.category) &&
      ROLLBACK_STRATEGY.applicableSeverities.includes(error.severity)
    );
  }

  /**
   * Create a rollback point
   */
  createRollbackPoint(runId: string, description: string, actions: RollbackAction[]): string {
    const pointId = `${runId}_${randomUUID()}`;

    const point: RollbackPoint = {
      id: pointId,
      timestamp: Date.now(),
      description,
      actions: actions.filter(a => a.canRollback),
    };

    this.rollbackPoints.set(pointId, point);

    this.logger.debug('Created rollback point', {
      pointId,
      description,
      actionCount: point.actions.length,
    });

    return pointId;
  }

  /**
   * Record a file change for potential rollback
   */
  recordFileChange(
    runId: string,
    filePath: string,
    previousContent: string | null
  ): RollbackAction {
    return {
      id: randomUUID(),
      type: 'file',
      description: previousContent === null
        ? `Delete created file: ${filePath}`
        : `Restore file: ${filePath}`,
      targetPath: filePath,
      previousState: previousContent,
      canRollback: true,
    };
  }

  /**
   * Record a state change for potential rollback
   */
  recordStateChange(
    description: string,
    previousState: unknown
  ): RollbackAction {
    return {
      id: randomUUID(),
      type: 'state',
      description,
      previousState,
      canRollback: true,
    };
  }

  /**
   * Execute rollback strategy
   */
  async execute(
    error: ClassifiedError,
    runId: string,
    rollbackFn: (actions: RollbackAction[]) => Promise<void>,
    retryFn?: () => Promise<unknown>
  ): Promise<{ attempt: RecoveryAttempt }> {
    const attemptId = randomUUID();
    const startedAt = Date.now();

    const attempt: RecoveryAttempt = {
      id: attemptId,
      strategy: 'rollback',
      attemptNumber: 1,
      startedAt,
      outcome: 'failed',
      actionsTaken: [],
      sideEffects: [],
    };

    try {
      // Get rollback points for this run
      const points = this.getRollbackPoints(runId);
      if (points.length === 0) {
        attempt.outcome = 'skipped';
        attempt.error = 'No rollback points available';
        attempt.endedAt = Date.now();
        attempt.durationMs = attempt.endedAt - startedAt;
        return { attempt };
      }

      // Get most recent point
      const latestPoint = points[points.length - 1];
      attempt.actionsTaken.push(`Rolling back to: ${latestPoint.description}`);

      this.logger.info('Rollback strategy: executing rollback', {
        pointId: latestPoint.id,
        actionCount: latestPoint.actions.length,
      });

      // Execute rollback
      await rollbackFn(latestPoint.actions);

      for (const action of latestPoint.actions) {
        attempt.actionsTaken.push(`Rolled back: ${action.description}`);
        attempt.sideEffects!.push(action.description);
      }

      // Clear used rollback point
      this.rollbackPoints.delete(latestPoint.id);

      // Retry if function provided
      if (retryFn) {
        attempt.actionsTaken.push('Retrying operation after rollback');
        await retryFn();
        attempt.actionsTaken.push('Retry succeeded');
      }

      attempt.outcome = 'success';
      attempt.endedAt = Date.now();
      attempt.durationMs = attempt.endedAt - startedAt;

      this.logger.info('Rollback strategy: succeeded');

      return { attempt };
    } catch (rollbackError) {
      attempt.outcome = 'failed';
      attempt.error = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      attempt.actionsTaken.push(`Rollback failed: ${attempt.error}`);
      attempt.endedAt = Date.now();
      attempt.durationMs = attempt.endedAt - startedAt;

      this.logger.error('Rollback strategy: failed', { error: attempt.error });

      return { attempt };
    }
  }

  /**
   * Get rollback points for a run
   */
  getRollbackPoints(runId: string): RollbackPoint[] {
    const points: RollbackPoint[] = [];

    for (const [id, point] of this.rollbackPoints) {
      if (id.startsWith(runId)) {
        points.push(point);
      }
    }

    return points.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Check if run has rollback points
   */
  hasRollbackPoints(runId: string): boolean {
    for (const id of this.rollbackPoints.keys()) {
      if (id.startsWith(runId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Clear rollback points for a run
   */
  clearRollbackPoints(runId: string): void {
    for (const id of this.rollbackPoints.keys()) {
      if (id.startsWith(runId)) {
        this.rollbackPoints.delete(id);
      }
    }
  }

  /**
   * Clear all rollback points
   */
  clearAll(): void {
    this.rollbackPoints.clear();
  }

  /**
   * Get statistics
   */
  getStats(): { totalPoints: number; totalActions: number } {
    let totalActions = 0;
    for (const point of this.rollbackPoints.values()) {
      totalActions += point.actions.length;
    }

    return {
      totalPoints: this.rollbackPoints.size,
      totalActions,
    };
  }
}
