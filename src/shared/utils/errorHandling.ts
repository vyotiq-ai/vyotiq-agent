/**
 * Error Handling Utilities
 * 
 * Centralized error handling patterns to reduce code duplication
 * and provide consistent error reporting across the application.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Context information for error reporting
 */
export interface ErrorContext {
  /** Name of the operation being performed */
  operation: string;
  /** Component/module where the error occurred */
  component: string;
  /** Session ID if available */
  sessionId?: string;
  /** Additional context information */
  additionalInfo?: Record<string, unknown>;
}

/**
 * Options for error handling behavior
 */
export interface ErrorHandlingOptions<T> {
  /** Number of retry attempts (default: 0) */
  retries?: number;
  /** Delay between retries in ms (default: 1000) */
  retryDelay?: number;
  /** Exponential backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Maximum delay between retries in ms (default: 30000) */
  maxRetryDelay?: number;
  /** Callback when a retry is about to happen */
  onRetry?: (error: Error, attempt: number, nextDelay: number) => void;
  /** Fallback value to return on error (if set, won't throw) */
  fallback?: T;
  /** Custom error filter - return true to retry, false to fail immediately */
  shouldRetry?: (error: Error) => boolean;
  /** Custom logger (default: no-op) */
  logger?: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Result of an error-handled operation
 */
export interface ErrorHandlingResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalDurationMs: number;
}

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Base error class with additional context
 */
export class ContextualError extends Error {
  public readonly context: ErrorContext;
  public readonly originalError?: Error;
  public readonly timestamp: number;
  
  constructor(message: string, context: ErrorContext, originalError?: Error) {
    super(message);
    this.name = 'ContextualError';
    this.context = context;
    this.originalError = originalError;
    this.timestamp = Date.now();
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ContextualError);
    }
  }
  
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      context: this.context,
      originalError: this.originalError?.message,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

/**
 * Error for retryable operations that exhausted all attempts
 */
export class RetryExhaustedError extends ContextualError {
  public readonly attempts: number;
  public readonly lastError: Error;
  
  constructor(context: ErrorContext, attempts: number, lastError: Error) {
    super(
      `Operation '${context.operation}' failed after ${attempts} attempts`,
      context,
      lastError
    );
    this.name = 'RetryExhaustedError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

// =============================================================================
// Main Error Handling Function
// =============================================================================

/**
 * Execute an async operation with error handling, retries, and logging
 * 
 * @param operation - The async function to execute
 * @param context - Error context for logging
 * @param options - Error handling options
 * @returns The result of the operation
 * 
 * @example
 * ```typescript
 * const result = await withErrorHandling(
 *   () => fetchData(url),
 *   { operation: 'fetchData', component: 'DataService' },
 *   { retries: 3, fallback: [] }
 * );
 * ```
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: ErrorContext,
  options: ErrorHandlingOptions<T> = {}
): Promise<T> {
  const {
    retries = 0,
    retryDelay = 1000,
    backoffMultiplier = 2,
    maxRetryDelay = 30000,
    onRetry,
    fallback,
    shouldRetry = () => true,
    logger = () => {}, // No-op logger
  } = options;
  
  const startTime = Date.now();
  let lastError: Error | undefined;
  let currentDelay = retryDelay;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      const isLastAttempt = attempt === retries;
      
      // Check if we should retry
      if (!isLastAttempt && shouldRetry(lastError)) {
        // Notify about retry
        if (onRetry) {
          onRetry(lastError, attempt + 1, currentDelay);
        }
        
        // Wait before retrying
        await sleep(currentDelay);
        
        // Calculate next delay with exponential backoff
        currentDelay = Math.min(currentDelay * backoffMultiplier, maxRetryDelay);
        continue;
      }
      
      // Log the error
      logger(`[${context.component}] ${context.operation} failed`, {
        error: lastError.message,
        attempts: attempt + 1,
        duration: Date.now() - startTime,
        ...context.additionalInfo,
      });
      
      // Return fallback if provided
      if (fallback !== undefined) {
        return fallback;
      }
      
      // Throw contextual error
      throw new ContextualError(
        `${context.operation} failed: ${lastError.message}`,
        context,
        lastError
      );
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw new Error('Unreachable');
}

/**
 * Execute an operation with full result tracking (doesn't throw)
 */
export async function withErrorHandlingResult<T>(
  operation: () => Promise<T>,
  context: ErrorContext,
  options: Omit<ErrorHandlingOptions<T>, 'fallback'> = {}
): Promise<ErrorHandlingResult<T>> {
  const startTime = Date.now();
  let attempts = 0;
  
  try {
    const data = await withErrorHandling(operation, context, {
      ...options,
      onRetry: (error, attempt, nextDelay) => {
        attempts = attempt;
        options.onRetry?.(error, attempt, nextDelay);
      },
    });
    
    return {
      success: true,
      data,
      attempts: attempts + 1,
      totalDurationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error as Error,
      attempts: attempts + 1,
      totalDurationMs: Date.now() - startTime,
    };
  }
}

// =============================================================================
// Sync Version
// =============================================================================

/**
 * Execute a sync operation with error handling
 */
export function withErrorHandlingSync<T>(
  operation: () => T,
  context: ErrorContext,
  options: { fallback?: T; logger?: (msg: string, meta?: Record<string, unknown>) => void } = {}
): T {
  const { fallback, logger = () => {} } = options; // No-op logger
  
  try {
    return operation();
  } catch (error) {
    const err = error as Error;
    
    logger(`[${context.component}] ${context.operation} failed`, {
      error: err.message,
      ...context.additionalInfo,
    });
    
    if (fallback !== undefined) {
      return fallback;
    }
    
    throw new ContextualError(
      `${context.operation} failed: ${err.message}`,
      context,
      err
    );
  }
}

// =============================================================================
// Error Classification Helpers
// =============================================================================

/**
 * Check if an error is retryable (network, timeout, rate limit)
 */
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  const retryablePatterns = [
    'timeout',
    'timed out',
    'econnreset',
    'econnrefused',
    'enotfound',
    'network',
    'socket hang up',
    '429',
    'rate limit',
    'too many requests',
    '500',
    '502',
    '503',
    '504',
    'internal server error',
    'bad gateway',
    'service unavailable',
    'gateway timeout',
  ];
  
  return retryablePatterns.some(pattern => message.includes(pattern));
}

/**
 * Check if an error is a rate limit error
 */
export function isRateLimitError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return message.includes('429') || 
         message.includes('rate limit') || 
         message.includes('too many requests');
}

/**
 * Check if an error is an authentication error
 */
export function isAuthError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return message.includes('401') ||
         message.includes('403') ||
         message.includes('unauthorized') ||
         message.includes('forbidden') ||
         message.includes('api key') ||
         message.includes('authentication');
}

/**
 * Check if an error is a validation error (non-retryable)
 */
export function isValidationError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return message.includes('400') ||
         message.includes('bad request') ||
         message.includes('invalid') ||
         message.includes('validation');
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a timeout error
 */
export function createTimeoutError(operation: string, timeoutMs: number): Error {
  return new Error(`Operation '${operation}' timed out after ${timeoutMs}ms`);
}

/**
 * Wrap an operation with a timeout
 */
export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  operationName = 'operation'
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(createTimeoutError(operationName, timeoutMs));
    }, timeoutMs);
  });
  
  try {
    const result = await Promise.race([operation, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Aggregate multiple errors into one
 */
export function aggregateErrors(errors: Error[]): Error {
  if (errors.length === 0) {
    return new Error('Unknown error');
  }
  if (errors.length === 1) {
    return errors[0];
  }
  
  const messages = errors.map((e, i) => `[${i + 1}] ${e.message}`).join('\n');
  const aggregated = new Error(`Multiple errors occurred:\n${messages}`);
  (aggregated as Error & { errors: Error[] }).errors = errors;
  return aggregated;
}

/**
 * Serialize an Error object to a plain object that can be JSON stringified.
 * Error objects don't serialize properly because their properties aren't enumerable.
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const serialized: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
    // Include any additional properties that might have been added (e.g., code, errno)
    for (const key of Object.getOwnPropertyNames(error)) {
      if (key !== 'name' && key !== 'message' && key !== 'stack') {
        serialized[key] = (error as unknown as Record<string, unknown>)[key];
      }
    }
    return serialized;
  }
  if (error && typeof error === 'object') {
    // Handle non-Error objects
    try {
      return JSON.parse(JSON.stringify(error)) as Record<string, unknown>;
    } catch {
      // Serialization may fail for cyclic structures; fall back to string.
      return { value: String(error) };
    }
  }
  return { value: String(error) };
}

/**
 * Safely extract error message from any error type.
 * Handles Error objects, strings, and unknown types.
 * 
 * @param error - The error to extract message from
 * @returns A string error message
 * 
 * @example
 * ```typescript
 * try { ... } catch (error) {
 *   logger.error('Operation failed', { error: getErrorMessage(error) });
 * }
 * ```
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}
