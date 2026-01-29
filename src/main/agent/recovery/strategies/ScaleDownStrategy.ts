/**
 * ScaleDownStrategy
 *
 * Reduce scope or simplify operation when resources are exhausted.
 * Used for context overflow, memory limits, and complexity reduction.
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

export const SCALE_DOWN_STRATEGY: RecoveryStrategy = {
  type: 'scale-down',
  name: 'Scale Down',
  description: 'Reduce scope or simplify the operation to work within constraints',
  priority: 4,
  applicableCategories: ['resource', 'logic'],
  applicableSeverities: ['medium', 'high', 'critical'],
  maxAttempts: 2,
  timeoutMs: 60000,
  requiresUserInteraction: false,
};

// =============================================================================
// Scale Down Types
// =============================================================================

export type ScaleDownType =
  | 'reduce-context'      // Reduce conversation context
  | 'simplify-task'       // Break into smaller subtasks
  | 'limit-output'        // Limit expected output size
  | 'reduce-parallel'     // Reduce parallel operations
  | 'downgrade-model'     // Use simpler/smaller model
  | 'skip-optional';      // Skip optional parts

export interface ScaleDownAction {
  type: ScaleDownType;
  description: string;
  reduction: {
    from: number | string;
    to: number | string;
    unit: string;
  };
  estimatedSavings: string;
}

export interface ScaleDownResult {
  appliedActions: ScaleDownAction[];
  newConstraints: Record<string, unknown>;
  canProceed: boolean;
  warning?: string;
}

// =============================================================================
// ScaleDownExecutor
// =============================================================================

export class ScaleDownExecutor {
  private readonly logger: RecoveryDeps['logger'];

  constructor(deps: RecoveryDeps) {
    this.logger = deps.logger;
  }

  /**
   * Check if this strategy can handle the error
   */
  canHandle(error: ClassifiedError): boolean {
    return (
      SCALE_DOWN_STRATEGY.applicableCategories.includes(error.category) &&
      SCALE_DOWN_STRATEGY.applicableSeverities.includes(error.severity)
    );
  }

  /**
   * Analyze error and suggest scale down actions
   */
  analyzeScaleDownOptions(error: ClassifiedError): ScaleDownAction[] {
    const actions: ScaleDownAction[] = [];

    // Context overflow - reduce context
    if (/token.?limit|context.?length|too.?long/i.test(error.original.message)) {
      actions.push({
        type: 'reduce-context',
        description: 'Summarize older messages and compress tool results',
        reduction: { from: '100%', to: '50%', unit: 'context size' },
        estimatedSavings: '50% token reduction',
      });

      actions.push({
        type: 'downgrade-model',
        description: 'Switch to model with larger context window',
        reduction: { from: 'current', to: 'larger-context', unit: 'model' },
        estimatedSavings: 'Increased capacity',
      });
    }

    // Memory exhaustion - reduce parallel operations
    if (/memory|heap|ENOMEM/i.test(error.original.message)) {
      actions.push({
        type: 'reduce-parallel',
        description: 'Reduce number of parallel operations',
        reduction: { from: 5, to: 2, unit: 'agents' },
        estimatedSavings: '60% memory reduction',
      });

      actions.push({
        type: 'skip-optional',
        description: 'Skip optional analysis and proceed with core task',
        reduction: { from: 'full', to: 'minimal', unit: 'scope' },
        estimatedSavings: 'Significant resource reduction',
      });
    }

    // General resource issues
    if (error.category === 'resource') {
      actions.push({
        type: 'simplify-task',
        description: 'Break task into smaller sequential steps',
        reduction: { from: 1, to: 3, unit: 'subtasks' },
        estimatedSavings: 'Reduced per-step resource usage',
      });

      actions.push({
        type: 'limit-output',
        description: 'Request more concise output',
        reduction: { from: 'detailed', to: 'concise', unit: 'verbosity' },
        estimatedSavings: '30% output reduction',
      });
    }

    // Logic errors - simplify approach
    if (error.category === 'logic') {
      actions.push({
        type: 'simplify-task',
        description: 'Use simpler, more direct approach',
        reduction: { from: 'complex', to: 'simple', unit: 'approach' },
        estimatedSavings: 'Reduced complexity',
      });
    }

    return actions;
  }

  /**
   * Execute scale down strategy
   */
  async execute(
    error: ClassifiedError,
    actions: ScaleDownAction[],
    applyScaleDown: (action: ScaleDownAction) => Promise<void>,
    retryOperation: () => Promise<unknown>
  ): Promise<{ result?: unknown; attempt: RecoveryAttempt }> {
    const attemptId = randomUUID();
    const startedAt = Date.now();

    const attempt: RecoveryAttempt = {
      id: attemptId,
      strategy: 'scale-down',
      attemptNumber: 1,
      startedAt,
      outcome: 'failed',
      actionsTaken: [],
      sideEffects: [],
    };

    try {
      if (actions.length === 0) {
        attempt.outcome = 'skipped';
        attempt.error = 'No scale down actions available';
        attempt.endedAt = Date.now();
        attempt.durationMs = attempt.endedAt - startedAt;
        return { attempt };
      }

      this.logger.info('Scale down strategy: applying reductions', {
        actionCount: actions.length,
      });

      // Apply scale down actions
      for (const action of actions) {
        attempt.actionsTaken.push(`Applying: ${action.description}`);
        await applyScaleDown(action);
        attempt.sideEffects!.push(`${action.type}: ${action.reduction.from} → ${action.reduction.to}`);
      }

      // Retry operation with reduced scope
      attempt.actionsTaken.push('Retrying operation with reduced scope');
      const result = await retryOperation();

      attempt.outcome = 'success';
      attempt.actionsTaken.push('Scaled-down operation succeeded');
      attempt.endedAt = Date.now();
      attempt.durationMs = attempt.endedAt - startedAt;

      this.logger.info('Scale down strategy: succeeded', {
        appliedActions: actions.length,
      });

      return { result, attempt };
    } catch (scaleDownError) {
      attempt.outcome = 'failed';
      attempt.error = scaleDownError instanceof Error ? scaleDownError.message : String(scaleDownError);
      attempt.actionsTaken.push(`Scale down failed: ${attempt.error}`);
      attempt.endedAt = Date.now();
      attempt.durationMs = attempt.endedAt - startedAt;

      this.logger.warn('Scale down strategy: failed', { error: attempt.error });

      return { attempt };
    }
  }

  /**
   * Get recommended context reduction percentage
   */
  getRecommendedContextReduction(error: ClassifiedError): number {
    // Extract token info if available
    const message = error.original.message;
    const currentMatch = message.match(/(\d+)\s*tokens?\s*(used|provided)/i);
    const limitMatch = message.match(/limit\s*(?:of|is)?\s*(\d+)/i);

    if (currentMatch && limitMatch) {
      const current = parseInt(currentMatch[1], 10);
      const limit = parseInt(limitMatch[1], 10);
      const reductionNeeded = ((current - limit) / current) * 100;
      return Math.min(80, Math.max(20, reductionNeeded + 10)); // Add 10% buffer
    }

    // Default 50% reduction
    return 50;
  }

  /**
   * Get recommended parallel limit
   */
  getRecommendedParallelLimit(currentLimit: number): number {
    return Math.max(1, Math.floor(currentLimit / 2));
  }
}
