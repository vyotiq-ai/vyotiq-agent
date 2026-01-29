/**
 * RetryStrategy
 *
 * Simple retry with exponential backoff for transient errors.
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

export const RETRY_STRATEGY: RecoveryStrategy = {
  type: 'retry',
  name: 'Retry with Backoff',
  description: 'Retry the failed operation with exponential backoff delay',
  priority: 1, // Try first
  applicableCategories: ['transient', 'external'],
  applicableSeverities: ['low', 'medium', 'high'],
  maxAttempts: 3,
  timeoutMs: 30000,
  requiresUserInteraction: false,
};

// =============================================================================
// RetryExecutor
// =============================================================================

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  jitterPercent?: number;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterPercent: 20,
};

export class RetryExecutor {
  private readonly logger: RecoveryDeps['logger'];
  private readonly options: Required<RetryOptions>;

  constructor(deps: RecoveryDeps, options: RetryOptions = {}) {
    this.logger = deps.logger;
    this.options = { ...DEFAULT_RETRY_OPTIONS, ...options };
  }

  /**
   * Check if this strategy can handle the error
   */
  canHandle(error: ClassifiedError): boolean {
    return (
      error.isRetryable &&
      RETRY_STRATEGY.applicableCategories.includes(error.category) &&
      RETRY_STRATEGY.applicableSeverities.includes(error.severity)
    );
  }

  /**
   * Execute retry strategy
   */
  async execute<T>(
    error: ClassifiedError,
    operation: () => Promise<T>,
    attemptNumber: number = 1
  ): Promise<{ result?: T; attempt: RecoveryAttempt }> {
    const attemptId = randomUUID();
    const startedAt = Date.now();

    const attempt: RecoveryAttempt = {
      id: attemptId,
      strategy: 'retry',
      attemptNumber,
      startedAt,
      outcome: 'failed',
      actionsTaken: [],
    };

    try {
      // Check if we've exceeded max attempts
      if (attemptNumber > (error.maxRetries || this.options.maxAttempts)) {
        attempt.outcome = 'failed';
        attempt.error = `Max retry attempts (${error.maxRetries || this.options.maxAttempts}) exceeded`;
        attempt.endedAt = Date.now();
        attempt.durationMs = attempt.endedAt - startedAt;
        return { attempt };
      }

      // Calculate delay with exponential backoff
      const delay = this.calculateDelay(attemptNumber, error.suggestedRetryDelayMs);
      attempt.actionsTaken.push(`Waiting ${delay}ms before retry`);

      this.logger.debug('Retry strategy: waiting before attempt', {
        attemptNumber,
        delayMs: delay,
      });

      // Wait
      await this.sleep(delay);

      // Execute operation
      attempt.actionsTaken.push('Executing operation');
      const result = await operation();

      // Success!
      attempt.outcome = 'success';
      attempt.actionsTaken.push('Operation succeeded');
      attempt.endedAt = Date.now();
      attempt.durationMs = attempt.endedAt - startedAt;

      this.logger.info('Retry strategy: succeeded', { attemptNumber });

      return { result, attempt };
    } catch (retryError) {
      attempt.outcome = 'failed';
      attempt.error = retryError instanceof Error ? retryError.message : String(retryError);
      attempt.actionsTaken.push(`Attempt failed: ${attempt.error}`);
      attempt.endedAt = Date.now();
      attempt.durationMs = attempt.endedAt - startedAt;

      this.logger.warn('Retry strategy: attempt failed', {
        attemptNumber,
        error: attempt.error,
      });

      return { attempt };
    }
  }

  /**
   * Execute with automatic retry loop
   */
  async executeWithRetries<T>(
    error: ClassifiedError,
    operation: () => Promise<T>
  ): Promise<{ result?: T; attempts: RecoveryAttempt[]; finalOutcome: RecoveryOutcome }> {
    const attempts: RecoveryAttempt[] = [];
    const maxAttempts = error.maxRetries || this.options.maxAttempts;

    for (let i = 1; i <= maxAttempts; i++) {
      const { result, attempt } = await this.execute(error, operation, i);
      attempts.push(attempt);

      if (attempt.outcome === 'success') {
        return { result, attempts, finalOutcome: 'success' };
      }
    }

    return { attempts, finalOutcome: 'failed' };
  }

  private calculateDelay(attemptNumber: number, suggestedDelay?: number): number {
    // Use suggested delay if provided for first attempt
    if (attemptNumber === 1 && suggestedDelay) {
      return this.addJitter(suggestedDelay);
    }

    // Exponential backoff
    const baseDelay = this.options.initialDelayMs * Math.pow(this.options.backoffMultiplier, attemptNumber - 1);
    const cappedDelay = Math.min(baseDelay, this.options.maxDelayMs);
    return this.addJitter(cappedDelay);
  }

  private addJitter(delay: number): number {
    const jitterRange = delay * (this.options.jitterPercent / 100);
    const jitter = (Math.random() - 0.5) * 2 * jitterRange;
    return Math.max(0, Math.round(delay + jitter));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
