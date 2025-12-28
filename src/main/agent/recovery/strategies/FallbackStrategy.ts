/**
 * FallbackStrategy
 *
 * Use alternative approach when primary fails.
 * Includes provider fallback, tool alternatives, and method substitution.
 */

import type {
  RecoveryStrategy,
  RecoveryAttempt,
  RecoveryOutcome,
  ClassifiedError,
  RecoveryDeps,
} from '../types';
import { randomUUID } from 'node:crypto';

// =============================================================================
// Strategy Definition
// =============================================================================

export const FALLBACK_STRATEGY: RecoveryStrategy = {
  type: 'fallback',
  name: 'Use Alternative',
  description: 'Switch to an alternative approach, provider, or tool',
  priority: 2,
  applicableCategories: ['transient', 'external', 'configuration', 'resource'],
  applicableSeverities: ['medium', 'high'],
  maxAttempts: 2,
  timeoutMs: 60000,
  requiresUserInteraction: false,
};

// =============================================================================
// Fallback Types
// =============================================================================

export type FallbackType = 'provider' | 'tool' | 'method' | 'model';

export interface FallbackOption {
  type: FallbackType;
  primary: string;
  alternative: string;
  description: string;
  isAvailable: boolean;
}

export interface FallbackContext {
  currentProvider?: string;
  currentTool?: string;
  currentModel?: string;
  availableProviders?: string[];
  availableTools?: string[];
  availableModels?: string[];
}

// =============================================================================
// FallbackExecutor
// =============================================================================

export class FallbackExecutor {
  private readonly logger: RecoveryDeps['logger'];

  constructor(deps: RecoveryDeps) {
    this.logger = deps.logger;
  }

  /**
   * Check if this strategy can handle the error
   */
  canHandle(error: ClassifiedError, context?: FallbackContext): boolean {
    // Can handle if there are alternatives available
    if (!context) return false;

    return (
      FALLBACK_STRATEGY.applicableCategories.includes(error.category) &&
      FALLBACK_STRATEGY.applicableSeverities.includes(error.severity) &&
      this.hasAlternatives(error, context)
    );
  }

  /**
   * Find available fallback options
   */
  findFallbackOptions(error: ClassifiedError, context: FallbackContext): FallbackOption[] {
    const options: FallbackOption[] = [];

    // Provider fallback
    if (context.currentProvider && context.availableProviders?.length) {
      const alternatives = context.availableProviders.filter(p => p !== context.currentProvider);
      for (const alt of alternatives) {
        options.push({
          type: 'provider',
          primary: context.currentProvider,
          alternative: alt,
          description: `Switch from ${context.currentProvider} to ${alt}`,
          isAvailable: true,
        });
      }
    }

    // Model fallback
    if (context.currentModel && context.availableModels?.length) {
      const alternatives = context.availableModels.filter(m => m !== context.currentModel);
      for (const alt of alternatives) {
        options.push({
          type: 'model',
          primary: context.currentModel,
          alternative: alt,
          description: `Switch from ${context.currentModel} to ${alt}`,
          isAvailable: true,
        });
      }
    }

    // Tool fallback (only if tool-related error)
    if (error.context.toolName && context.availableTools?.length) {
      const alternatives = this.findToolAlternatives(error.context.toolName, context.availableTools);
      for (const alt of alternatives) {
        options.push({
          type: 'tool',
          primary: error.context.toolName,
          alternative: alt,
          description: `Use ${alt} instead of ${error.context.toolName}`,
          isAvailable: true,
        });
      }
    }

    return options;
  }

  /**
   * Execute fallback strategy
   */
  async execute<T>(
    error: ClassifiedError,
    fallbackOption: FallbackOption,
    fallbackOperation: () => Promise<T>
  ): Promise<{ result?: T; attempt: RecoveryAttempt }> {
    const attemptId = randomUUID();
    const startedAt = Date.now();

    const attempt: RecoveryAttempt = {
      id: attemptId,
      strategy: 'fallback',
      attemptNumber: 1,
      startedAt,
      outcome: 'failed',
      actionsTaken: [],
    };

    try {
      attempt.actionsTaken.push(`Switching from ${fallbackOption.primary} to ${fallbackOption.alternative}`);
      this.logger.info('Fallback strategy: switching to alternative', {
        type: fallbackOption.type,
        from: fallbackOption.primary,
        to: fallbackOption.alternative,
      });

      // Execute with fallback
      const result = await fallbackOperation();

      attempt.outcome = 'success';
      attempt.actionsTaken.push('Fallback operation succeeded');
      attempt.endedAt = Date.now();
      attempt.durationMs = attempt.endedAt - startedAt;

      this.logger.info('Fallback strategy: succeeded', {
        alternative: fallbackOption.alternative,
      });

      return { result, attempt };
    } catch (fallbackError) {
      attempt.outcome = 'failed';
      attempt.error = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      attempt.actionsTaken.push(`Fallback failed: ${attempt.error}`);
      attempt.endedAt = Date.now();
      attempt.durationMs = attempt.endedAt - startedAt;

      this.logger.warn('Fallback strategy: failed', {
        alternative: fallbackOption.alternative,
        error: attempt.error,
      });

      return { attempt };
    }
  }

  /**
   * Try multiple fallback options in sequence
   */
  async executeWithOptions<T>(
    error: ClassifiedError,
    options: FallbackOption[],
    createOperation: (option: FallbackOption) => () => Promise<T>
  ): Promise<{ result?: T; attempts: RecoveryAttempt[]; finalOutcome: RecoveryOutcome }> {
    const attempts: RecoveryAttempt[] = [];

    for (const option of options) {
      if (!option.isAvailable) continue;

      const operation = createOperation(option);
      const { result, attempt } = await this.execute(error, option, operation);
      attempts.push(attempt);

      if (attempt.outcome === 'success') {
        return { result, attempts, finalOutcome: 'success' };
      }
    }

    return { attempts, finalOutcome: 'failed' };
  }

  private hasAlternatives(error: ClassifiedError, context: FallbackContext): boolean {
    // Check for provider alternatives
    if (context.currentProvider && context.availableProviders?.length) {
      if (context.availableProviders.some(p => p !== context.currentProvider)) {
        return true;
      }
    }

    // Check for model alternatives
    if (context.currentModel && context.availableModels?.length) {
      if (context.availableModels.some(m => m !== context.currentModel)) {
        return true;
      }
    }

    return false;
  }

  private findToolAlternatives(toolName: string, availableTools: string[]): string[] {
    // Simple heuristic: find tools with similar names or purposes
    const alternatives: string[] = [];

    // File operation alternatives (using canonical tool names)
    const fileTools = ['read', 'write', 'edit', 'ls'];
    if (fileTools.includes(toolName)) {
      alternatives.push(...fileTools.filter(t => t !== toolName && availableTools.includes(t)));
    }

    // Search alternatives
    const searchTools = ['grep', 'glob'];
    if (searchTools.includes(toolName)) {
      alternatives.push(...searchTools.filter(t => t !== toolName && availableTools.includes(t)));
    }

    return alternatives.slice(0, 3);
  }
}
