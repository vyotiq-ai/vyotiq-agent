/**
 * IPC Retry Utilities
 * 
 * Provides robust retry logic for IPC calls that may fail during
 * app initialization when handlers are not yet registered.
 * 
 * @module utils/ipcRetry
 */

import { createLogger } from './logger';

const logger = createLogger('IpcRetry');

/** Configuration for retry behavior */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Delay between retries in milliseconds (default: 500) */
  retryDelayMs?: number;
  /** Whether to use exponential backoff (default: false) */
  exponentialBackoff?: boolean;
  /** Optional label for logging purposes */
  operationLabel?: string;
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxAttempts: 3,
  retryDelayMs: 500,
  exponentialBackoff: false,
  operationLabel: 'IPC operation',
};

/**
 * Check if an error indicates that the IPC handler is not registered yet
 */
export function isHandlerNotRegisteredError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.includes('No handler registered');
  }
  return String(err).includes('No handler registered');
}

/**
 * Delay execution for a specified time
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute an IPC call with automatic retry on "No handler registered" errors.
 * 
 * This utility handles the race condition where the renderer may try to call
 * IPC handlers before they are fully registered in the main process.
 * 
 * @param operation - Async function that performs the IPC call
 * @param config - Optional retry configuration
 * @returns The result of the operation
 * @throws The last error if all retries fail
 * 
 * @example
 * ```ts
 * const sessions = await withIpcRetry(
 *   () => window.vyotiq.agent.getSessions(),
 *   { operationLabel: 'agent:get-sessions' }
 * );
 * ```
 */
export async function withIpcRetry<T>(
  operation: () => Promise<T>,
  config?: RetryConfig
): Promise<T> {
  const {
    maxAttempts,
    retryDelayMs,
    exponentialBackoff,
    operationLabel,
  } = { ...DEFAULT_RETRY_CONFIG, ...config };

  let lastError: unknown;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      
      // Only retry if the error is due to handler not being registered
      if (!isHandlerNotRegisteredError(err)) {
        throw err;
      }
      
      // If this was the last attempt, don't retry
      if (attempt >= maxAttempts) {
        logger.warn(`${operationLabel} failed after ${maxAttempts} attempts`, {
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
      
      // Calculate delay (with optional exponential backoff)
      const delayMs = exponentialBackoff
        ? retryDelayMs * Math.pow(2, attempt - 1)
        : retryDelayMs;
      
      logger.debug(`${operationLabel} - IPC handler not ready, retrying...`, {
        attempt,
        maxAttempts,
        nextRetryMs: delayMs,
      });
      
      await delay(delayMs);
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Execute multiple IPC operations in parallel with retry logic.
 * 
 * @param operations - Array of operations to execute
 * @param config - Optional retry configuration (applied to all operations)
 * @returns Array of results in the same order as operations
 */
export async function withIpcRetryAll<T extends unknown[]>(
  operations: { [K in keyof T]: () => Promise<T[K]> },
  config?: RetryConfig
): Promise<T> {
  const results = await Promise.all(
    (operations as Array<() => Promise<unknown>>).map((op, index) => 
      withIpcRetry(op, {
        ...config,
        operationLabel: config?.operationLabel 
          ? `${config.operationLabel}[${index}]` 
          : `Operation[${index}]`,
      })
    )
  );
  return results as T;
}
