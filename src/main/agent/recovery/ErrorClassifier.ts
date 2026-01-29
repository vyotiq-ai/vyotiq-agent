/**
 * ErrorClassifier
 *
 * Categorizes errors by type, determines recovery strategies,
 * and assesses error severity based on patterns and context.
 */

import type {
  ErrorCategory,
  ErrorSeverity,
  ClassifiedError,
  ErrorContext,
  ErrorClassifierConfig,
  RecoveryDeps,
} from './types';
import { DEFAULT_ERROR_CLASSIFIER_CONFIG } from './types';

// =============================================================================
// Error Patterns
// =============================================================================

interface ErrorPattern {
  pattern: RegExp | string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  isRetryable: boolean;
  suggestedRetryDelayMs?: number;
  maxRetries?: number;
}

const BUILT_IN_PATTERNS: ErrorPattern[] = [
  // Rate limit errors
  {
    pattern: /rate.?limit|too.?many.?requests|429/i,
    category: 'transient',
    severity: 'medium',
    isRetryable: true,
    suggestedRetryDelayMs: 60000,
    maxRetries: 3,
  },
  // Timeout errors
  {
    pattern: /timeout|timed.?out|ETIMEDOUT|ESOCKETTIMEDOUT/i,
    category: 'transient',
    severity: 'medium',
    isRetryable: true,
    suggestedRetryDelayMs: 5000,
    maxRetries: 3,
  },
  // Network errors
  {
    pattern: /ECONNREFUSED|ECONNRESET|ENOTFOUND|network|connection/i,
    category: 'transient',
    severity: 'medium',
    isRetryable: true,
    suggestedRetryDelayMs: 3000,
    maxRetries: 5,
  },
  // Service unavailable
  {
    pattern: /503|service.?unavailable|temporarily.?unavailable/i,
    category: 'transient',
    severity: 'medium',
    isRetryable: true,
    suggestedRetryDelayMs: 10000,
    maxRetries: 3,
  },
  // Authentication errors
  {
    pattern: /401|unauthorized|invalid.?api.?key|authentication/i,
    category: 'configuration',
    severity: 'high',
    isRetryable: false,
  },
  // Permission errors
  {
    pattern: /403|forbidden|permission.?denied|access.?denied/i,
    category: 'configuration',
    severity: 'high',
    isRetryable: false,
  },
  // Invalid request errors
  {
    pattern: /400|bad.?request|invalid.?request|malformed/i,
    category: 'validation',
    severity: 'medium',
    isRetryable: false,
  },
  // Not found errors
  {
    pattern: /404|not.?found|does.?not.?exist/i,
    category: 'logic',
    severity: 'medium',
    isRetryable: false,
  },
  // Token/context limit errors
  {
    pattern: /token.?limit|context.?length|max.?tokens|too.?long/i,
    category: 'resource',
    severity: 'high',
    isRetryable: false,
  },
  // Memory errors
  {
    pattern: /out.?of.?memory|heap|memory.?limit|ENOMEM/i,
    category: 'resource',
    severity: 'critical',
    isRetryable: false,
  },
  // Quota/billing errors
  {
    pattern: /quota|billing|exceeded|insufficient.?funds/i,
    category: 'configuration',
    severity: 'critical',
    isRetryable: false,
  },
  // OpenRouter credit/token limit errors (different from context overflow)
  {
    pattern: /requires more credits|can only afford|fewer max_tokens/i,
    category: 'resource',
    severity: 'high',
    isRetryable: true,
    suggestedRetryDelayMs: 500,
    maxRetries: 2,
  },
  // File system errors
  {
    pattern: /ENOENT|EACCES|EEXIST|file.?system|no.?such.?file/i,
    category: 'external',
    severity: 'medium',
    isRetryable: false,
  },
  // JSON parsing errors
  {
    pattern: /JSON|parse|syntax.?error|unexpected.?token/i,
    category: 'validation',
    severity: 'medium',
    isRetryable: false,
  },
  // Internal server errors
  {
    pattern: /500|internal.?server.?error|internal.?error/i,
    category: 'external',
    severity: 'high',
    isRetryable: true,
    suggestedRetryDelayMs: 5000,
    maxRetries: 2,
  },
  // Model/provider errors
  {
    pattern: /model.?not.?found|unsupported.?model|invalid.?model/i,
    category: 'configuration',
    severity: 'high',
    isRetryable: false,
  },
  // Tool execution errors
  {
    pattern: /tool.?execution|tool.?failed|tool.?error/i,
    category: 'logic',
    severity: 'medium',
    isRetryable: true,
    suggestedRetryDelayMs: 1000,
    maxRetries: 2,
  },
];

// =============================================================================
// ErrorClassifier
// =============================================================================

export class ErrorClassifier {
  private readonly logger: RecoveryDeps['logger'];
  private readonly config: ErrorClassifierConfig;
  private readonly patterns: ErrorPattern[];
  private recentOperations: string[] = [];

  constructor(
    deps: RecoveryDeps,
    config: Partial<ErrorClassifierConfig> = {}
  ) {
    this.logger = deps.logger;
    this.config = { ...DEFAULT_ERROR_CLASSIFIER_CONFIG, ...config };

    // Combine built-in and custom patterns
    this.patterns = [
      ...BUILT_IN_PATTERNS,
      ...(this.config.customPatterns?.map(p => ({
        pattern: p.pattern instanceof RegExp ? p.pattern : new RegExp(p.pattern, 'i'),
        category: p.category,
        severity: p.severity,
        isRetryable: p.category === 'transient',
      })) || []),
    ];
  }

  // ===========================================================================
  // Classification Methods
  // ===========================================================================

  /**
   * Classify an error
   */
  classify(error: Error | unknown, contextInfo?: Partial<ErrorContext>): ClassifiedError {
    const normalizedError = this.normalizeError(error);
    const match = this.findMatchingPattern(normalizedError);

    const context: ErrorContext = {
      ...contextInfo,
      recentOperations: [...this.recentOperations],
      stack: this.config.includeStackTraces ? normalizedError.stack : undefined,
      timestamp: Date.now(),
    };

    const classified: ClassifiedError = {
      original: normalizedError,
      category: match?.category || 'unknown',
      severity: match?.severity || this.inferSeverity(normalizedError),
      isRetryable: match?.isRetryable ?? false,
      suggestedRetryDelayMs: match?.suggestedRetryDelayMs,
      maxRetries: match?.maxRetries,
      code: this.extractErrorCode(normalizedError),
      httpStatus: this.extractHttpStatus(normalizedError),
      context,
    };

    this.logger.debug('Classified error', {
      message: normalizedError.message,
      category: classified.category,
      severity: classified.severity,
      isRetryable: classified.isRetryable,
    });

    return classified;
  }

  /**
   * Get severity for an error
   */
  getSeverity(error: Error | unknown): ErrorSeverity {
    const classified = this.classify(error);
    return classified.severity;
  }

  /**
   * Check if error is retryable
   */
  isRetryable(error: Error | unknown): boolean {
    const classified = this.classify(error);
    return classified.isRetryable;
  }

  /**
   * Get error context
   */
  getContext(error: Error | unknown): ErrorContext {
    const classified = this.classify(error);
    return classified.context;
  }

  /**
   * Record an operation (for context)
   */
  recordOperation(operation: string): void {
    this.recentOperations.push(operation);
    if (this.recentOperations.length > this.config.recentOperationsLimit) {
      this.recentOperations.shift();
    }
  }

  /**
   * Clear operation history
   */
  clearOperations(): void {
    this.recentOperations = [];
  }

  // ===========================================================================
  // Specific Error Checks
  // ===========================================================================

  /**
   * Check if error is rate limit related
   */
  isRateLimitError(error: Error | unknown): boolean {
    const classified = this.classify(error);
    return classified.category === 'transient' && /rate.?limit|429/i.test(classified.original.message);
  }

  /**
   * Check if error is authentication related
   */
  isAuthError(error: Error | unknown): boolean {
    const classified = this.classify(error);
    return classified.category === 'configuration' && /401|unauthorized|api.?key/i.test(classified.original.message);
  }

  /**
   * Check if error is resource exhaustion
   */
  isResourceError(error: Error | unknown): boolean {
    const classified = this.classify(error);
    return classified.category === 'resource';
  }

  /**
   * Check if error is context overflow
   */
  isContextOverflowError(error: Error | unknown): boolean {
    const normalized = this.normalizeError(error);
    return /token.?limit|context.?length|max.?tokens|too.?long/i.test(normalized.message);
  }

  /**
   * Check if error warrants fallback to different provider
   */
  shouldTryFallback(error: Error | unknown): boolean {
    const classified = this.classify(error);
    // Fallback for: provider errors, rate limits, quota issues
    return (
      classified.category === 'external' ||
      (classified.category === 'transient' && !classified.isRetryable) ||
      this.isRateLimitError(error) ||
      /quota|billing/i.test(classified.original.message)
    );
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    if (typeof error === 'string') {
      return new Error(error);
    }
    if (error && typeof error === 'object' && 'message' in error) {
      const e = new Error(String((error as { message: unknown }).message));
      if ('stack' in error) {
        e.stack = String((error as { stack: unknown }).stack);
      }
      if ('name' in error) {
        e.name = String((error as { name: unknown }).name);
      }
      return e;
    }
    return new Error(String(error));
  }

  private findMatchingPattern(error: Error): ErrorPattern | null {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();
    const combined = `${name} ${message}`;

    for (const pattern of this.patterns) {
      const regex = pattern.pattern instanceof RegExp
        ? pattern.pattern
        : new RegExp(pattern.pattern, 'i');

      if (regex.test(combined)) {
        return pattern;
      }
    }

    return null;
  }

  private inferSeverity(error: Error): ErrorSeverity {
    const message = error.message.toLowerCase();

    // Critical indicators
    if (/fatal|critical|panic|crash|corrupt/i.test(message)) {
      return 'critical';
    }

    // High severity indicators
    if (/fail|error|unable|cannot|denied/i.test(message)) {
      return 'high';
    }

    // Medium severity indicators
    if (/warn|timeout|retry|limit/i.test(message)) {
      return 'medium';
    }

    return 'low';
  }

  private extractErrorCode(error: Error): string | undefined {
    // Check common error code properties
    const errorWithCode = error as Error & { code?: string | number; errno?: number };

    if (errorWithCode.code) {
      return String(errorWithCode.code);
    }
    if (errorWithCode.errno) {
      return String(errorWithCode.errno);
    }

    // Try to extract from message
    const codeMatch = error.message.match(/\b(E[A-Z]+|[A-Z_]{3,})\b/);
    if (codeMatch) {
      return codeMatch[1];
    }

    return undefined;
  }

  private extractHttpStatus(error: Error): number | undefined {
    const errorWithStatus = error as Error & {
      status?: number;
      statusCode?: number;
      response?: { status?: number };
    };

    if (errorWithStatus.status) {
      return errorWithStatus.status;
    }
    if (errorWithStatus.statusCode) {
      return errorWithStatus.statusCode;
    }
    if (errorWithStatus.response?.status) {
      return errorWithStatus.response.status;
    }

    // Try to extract from message
    const statusMatch = error.message.match(/\b(4\d{2}|5\d{2})\b/);
    if (statusMatch) {
      return parseInt(statusMatch[1], 10);
    }

    return undefined;
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get classifier statistics
   */
  getStats(): {
    patternsCount: number;
    recentOperationsCount: number;
  } {
    return {
      patternsCount: this.patterns.length,
      recentOperationsCount: this.recentOperations.length,
    };
  }
}
