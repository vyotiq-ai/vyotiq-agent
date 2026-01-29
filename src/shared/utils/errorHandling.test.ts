/**
 * Error Handling Utilities Tests
 */

import { describe, it, expect, vi } from 'vitest';
import {
  withErrorHandling,
  withErrorHandlingResult,
  withErrorHandlingSync,
  withTimeout,
  isRetryableError,
  isRateLimitError,
  isAuthError,
  isValidationError,
  ContextualError,
  RetryExhaustedError,
  aggregateErrors,
} from './errorHandling';

describe('errorHandling', () => {
  describe('withErrorHandling', () => {
    it('should return result on success', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await withErrorHandling(
        operation,
        { operation: 'test', component: 'TestService' }
      );
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });
    
    it('should throw ContextualError on failure', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('test error'));
      
      await expect(withErrorHandling(
        operation,
        { operation: 'test', component: 'TestService' },
        { logger: vi.fn() }
      )).rejects.toThrow(ContextualError);
    });
    
    it('should return fallback on failure when provided', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('test error'));
      
      const result = await withErrorHandling(
        operation,
        { operation: 'test', component: 'TestService' },
        { fallback: 'default', logger: vi.fn() }
      );
      
      expect(result).toBe('default');
    });
    
    it('should retry on failure', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');
      
      const onRetry = vi.fn();
      
      const result = await withErrorHandling(
        operation,
        { operation: 'test', component: 'TestService' },
        { retries: 2, retryDelay: 10, onRetry }
      );
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
      expect(onRetry).toHaveBeenCalledTimes(2);
    });
    
    it('should respect shouldRetry filter', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('non-retryable'));
      
      await expect(withErrorHandling(
        operation,
        { operation: 'test', component: 'TestService' },
        { 
          retries: 3, 
          shouldRetry: () => false,
          logger: vi.fn()
        }
      )).rejects.toThrow();
      
      // Should only try once since shouldRetry returns false
      expect(operation).toHaveBeenCalledTimes(1);
    });
    
    it('should include context in error', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('original'));
      
      try {
        await withErrorHandling(
          operation,
          { 
            operation: 'testOp', 
            component: 'TestService',
            sessionId: 'session-123',
            additionalInfo: { extra: 'data' }
          },
          { logger: vi.fn() }
        );
      } catch (error) {
        expect(error).toBeInstanceOf(ContextualError);
        const ctxError = error as ContextualError;
        expect(ctxError.context.operation).toBe('testOp');
        expect(ctxError.context.component).toBe('TestService');
        expect(ctxError.context.sessionId).toBe('session-123');
      }
    });
  });
  
  describe('withErrorHandlingResult', () => {
    it('should return success result', async () => {
      const operation = vi.fn().mockResolvedValue('data');
      
      const result = await withErrorHandlingResult(
        operation,
        { operation: 'test', component: 'TestService' }
      );
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('data');
      expect(result.attempts).toBe(1);
    });
    
    it('should return failure result without throwing', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('fail'));
      
      const result = await withErrorHandlingResult(
        operation,
        { operation: 'test', component: 'TestService' },
        { logger: vi.fn() }
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.data).toBeUndefined();
    });
  });
  
  describe('withErrorHandlingSync', () => {
    it('should return result on success', () => {
      const operation = vi.fn().mockReturnValue('success');
      
      const result = withErrorHandlingSync(
        operation,
        { operation: 'test', component: 'TestService' }
      );
      
      expect(result).toBe('success');
    });
    
    it('should throw on failure', () => {
      const operation = vi.fn().mockImplementation(() => {
        throw new Error('sync error');
      });
      
      expect(() => withErrorHandlingSync(
        operation,
        { operation: 'test', component: 'TestService' },
        { logger: vi.fn() }
      )).toThrow(ContextualError);
    });
    
    it('should return fallback on failure', () => {
      const operation = vi.fn().mockImplementation(() => {
        throw new Error('sync error');
      });
      
      const result = withErrorHandlingSync(
        operation,
        { operation: 'test', component: 'TestService' },
        { fallback: 'default', logger: vi.fn() }
      );
      
      expect(result).toBe('default');
    });
  });
  
  describe('withTimeout', () => {
    it('should return result if operation completes in time', async () => {
      const operation = new Promise<string>(resolve => {
        setTimeout(() => resolve('done'), 50);
      });
      
      const result = await withTimeout(operation, 200);
      expect(result).toBe('done');
    });
    
    it('should throw on timeout', async () => {
      const operation = new Promise<string>(resolve => {
        setTimeout(() => resolve('done'), 500);
      });
      
      await expect(withTimeout(operation, 50, 'slowOp'))
        .rejects.toThrow('timed out');
    });
  });
  
  describe('error classification', () => {
    it('should identify retryable errors', () => {
      expect(isRetryableError(new Error('connection timeout'))).toBe(true);
      expect(isRetryableError(new Error('429 too many requests'))).toBe(true);
      expect(isRetryableError(new Error('500 internal server error'))).toBe(true);
      expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
      expect(isRetryableError(new Error('validation failed'))).toBe(false);
    });
    
    it('should identify rate limit errors', () => {
      expect(isRateLimitError(new Error('429 rate limit'))).toBe(true);
      expect(isRateLimitError(new Error('too many requests'))).toBe(true);
      expect(isRateLimitError(new Error('500 error'))).toBe(false);
    });
    
    it('should identify auth errors', () => {
      expect(isAuthError(new Error('401 unauthorized'))).toBe(true);
      expect(isAuthError(new Error('invalid api key'))).toBe(true);
      expect(isAuthError(new Error('403 forbidden'))).toBe(true);
      expect(isAuthError(new Error('500 error'))).toBe(false);
    });
    
    it('should identify validation errors', () => {
      expect(isValidationError(new Error('400 bad request'))).toBe(true);
      expect(isValidationError(new Error('invalid input'))).toBe(true);
      expect(isValidationError(new Error('500 error'))).toBe(false);
    });
  });
  
  describe('ContextualError', () => {
    it('should preserve context and original error', () => {
      const original = new Error('original');
      const error = new ContextualError(
        'wrapped',
        { operation: 'test', component: 'TestService' },
        original
      );
      
      expect(error.message).toBe('wrapped');
      expect(error.context.operation).toBe('test');
      expect(error.originalError).toBe(original);
      expect(error.timestamp).toBeDefined();
    });
    
    it('should serialize to JSON', () => {
      const error = new ContextualError(
        'test error',
        { operation: 'test', component: 'TestService' }
      );
      
      const json = error.toJSON();
      expect(json.message).toBe('test error');
      expect(json.context).toEqual({ operation: 'test', component: 'TestService' });
    });
  });
  
  describe('RetryExhaustedError', () => {
    it('should include retry information', () => {
      const lastError = new Error('last');
      const error = new RetryExhaustedError(
        { operation: 'test', component: 'TestService' },
        3,
        lastError
      );
      
      expect(error.attempts).toBe(3);
      expect(error.lastError).toBe(lastError);
      expect(error.message).toContain('3 attempts');
    });
  });
  
  describe('aggregateErrors', () => {
    it('should return single error as-is', () => {
      const error = new Error('single');
      const result = aggregateErrors([error]);
      expect(result).toBe(error);
    });
    
    it('should combine multiple errors', () => {
      const errors = [
        new Error('error 1'),
        new Error('error 2'),
        new Error('error 3'),
      ];
      
      const result = aggregateErrors(errors);
      expect(result.message).toContain('Multiple errors');
      expect(result.message).toContain('error 1');
      expect(result.message).toContain('error 2');
      expect(result.message).toContain('error 3');
    });
    
    it('should handle empty array', () => {
      const result = aggregateErrors([]);
      expect(result.message).toBe('Unknown error');
    });
  });
});
