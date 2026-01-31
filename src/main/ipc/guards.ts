/**
 * IPC Handler Guards and Utilities
 * 
 * Provides reusable guard functions for IPC handlers to ensure
 * consistent null safety, validation, and error handling patterns.
 */

import type { IpcContext } from './types';
import { createLogger } from '../logger';

const logger = createLogger('IPC:Guards');

// =============================================================================
// Types
// =============================================================================

/**
 * Result of an IPC operation
 */
export interface IpcResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/**
 * Error codes for IPC operations
 */
export const IpcErrorCodes = {
  ORCHESTRATOR_NOT_READY: 'ORCHESTRATOR_NOT_READY',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  WORKSPACE_NOT_FOUND: 'WORKSPACE_NOT_FOUND',
  OPERATION_FAILED: 'OPERATION_FAILED',
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'CANCELLED',
} as const;

export type IpcErrorCode = typeof IpcErrorCodes[keyof typeof IpcErrorCodes];

// =============================================================================
// Guard Functions
// =============================================================================

/**
 * Guard that ensures orchestrator is available before executing handler logic.
 * Returns a consistent error response if orchestrator is not ready.
 * 
 * @example
 * ```typescript
 * ipcMain.handle('agent:action', async (_event, payload) => {
 *   return withOrchestratorGuard(context, async (orchestrator) => {
 *     return orchestrator.doAction(payload);
 *   });
 * });
 * ```
 */
export async function withOrchestratorGuard<T>(
  context: IpcContext,
  handler: (orchestrator: NonNullable<ReturnType<IpcContext['getOrchestrator']>>) => T | Promise<T>,
  options?: {
    operationName?: string;
    returnOnError?: T;
  }
): Promise<T | IpcResult<T>> {
  const orchestrator = context.getOrchestrator();
  
  if (!orchestrator) {
    const error = 'Agent orchestrator not initialized';
    if (options?.operationName) {
      logger.warn(`${options.operationName} failed: ${error}`);
    }
    
    if (options?.returnOnError !== undefined) {
      return options.returnOnError;
    }
    
    return {
      success: false,
      error,
      code: IpcErrorCodes.ORCHESTRATOR_NOT_READY,
    };
  }
  
  return handler(orchestrator);
}

/**
 * Guard that wraps handler in try/catch with consistent error handling.
 * 
 * @example
 * ```typescript
 * ipcMain.handle('agent:action', async (_event, payload) => {
 *   return withErrorGuard('agent:action', async () => {
 *     return orchestrator.doAction(payload);
 *   });
 * });
 * ```
 */
export async function withErrorGuard<T>(
  operationName: string,
  handler: () => T | Promise<T>,
  options?: {
    logError?: boolean;
    returnOnError?: T;
    additionalContext?: Record<string, unknown>;
  }
): Promise<T | IpcResult<T>> {
  try {
    return await handler();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (options?.logError !== false) {
      logger.error(`${operationName} failed`, {
        error: errorMessage,
        ...options?.additionalContext,
      });
    }
    
    if (options?.returnOnError !== undefined) {
      return options.returnOnError;
    }
    
    return {
      success: false,
      error: errorMessage,
      code: IpcErrorCodes.OPERATION_FAILED,
    };
  }
}

/**
 * Combined guard that ensures orchestrator is available and wraps in try/catch.
 * This is the recommended pattern for most IPC handlers.
 * 
 * @example
 * ```typescript
 * ipcMain.handle('agent:action', async (_event, payload) => {
 *   return withSafeHandler(context, 'agent:action', async (orchestrator) => {
 *     return orchestrator.doAction(payload);
 *   });
 * });
 * ```
 */
export async function withSafeHandler<T>(
  context: IpcContext,
  operationName: string,
  handler: (orchestrator: NonNullable<ReturnType<IpcContext['getOrchestrator']>>) => T | Promise<T>,
  options?: {
    logError?: boolean;
    returnOnError?: T;
    additionalContext?: Record<string, unknown>;
  }
): Promise<T | IpcResult<T>> {
  const orchestrator = context.getOrchestrator();
  
  if (!orchestrator) {
    const error = 'Agent orchestrator not initialized';
    logger.warn(`${operationName} failed: ${error}`);
    
    if (options?.returnOnError !== undefined) {
      return options.returnOnError;
    }
    
    return {
      success: false,
      error,
      code: IpcErrorCodes.ORCHESTRATOR_NOT_READY,
    };
  }
  
  try {
    return await handler(orchestrator);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (options?.logError !== false) {
      logger.error(`${operationName} failed`, {
        error: errorMessage,
        ...options?.additionalContext,
      });
    }
    
    if (options?.returnOnError !== undefined) {
      return options.returnOnError;
    }
    
    return {
      success: false,
      error: errorMessage,
      code: IpcErrorCodes.OPERATION_FAILED,
    };
  }
}

// =============================================================================
// Validation Utilities
// =============================================================================

/**
 * Validates that required fields are present in payload
 */
export function validateRequired<T extends Record<string, unknown>>(
  payload: T,
  fields: (keyof T)[]
): IpcResult<void> | null {
  for (const field of fields) {
    if (payload[field] === undefined || payload[field] === null) {
      return {
        success: false,
        error: `Missing required field: ${String(field)}`,
        code: IpcErrorCodes.INVALID_PAYLOAD,
      };
    }
  }
  return null; // All fields present
}

/**
 * Validates string field is non-empty
 */
export function validateNonEmptyString(
  value: unknown,
  fieldName: string
): IpcResult<void> | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return {
      success: false,
      error: `${fieldName} must be a non-empty string`,
      code: IpcErrorCodes.INVALID_PAYLOAD,
    };
  }
  return null;
}

/**
 * Validates value is a positive number
 */
export function validatePositiveNumber(
  value: unknown,
  fieldName: string
): IpcResult<void> | null {
  if (typeof value !== 'number' || value <= 0 || !Number.isFinite(value)) {
    return {
      success: false,
      error: `${fieldName} must be a positive number`,
      code: IpcErrorCodes.INVALID_PAYLOAD,
    };
  }
  return null;
}

// =============================================================================
// Timeout Utilities
// =============================================================================

/**
 * Execute handler with a timeout
 */
export async function withTimeout<T>(
  handler: () => Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    
    handler()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Execute handler with a timeout and fallback value
 */
export async function withTimeoutFallback<T>(
  handler: () => Promise<T>,
  timeoutMs: number,
  fallback: T,
  operationName: string
): Promise<T> {
  try {
    return await withTimeout(handler, timeoutMs, operationName);
  } catch {
    logger.warn(`${operationName} timed out, using fallback value`);
    return fallback;
  }
}

// =============================================================================
// Session Utilities
// =============================================================================

/**
 * Guard that validates session exists
 */
export function validateSession(
  context: IpcContext,
  sessionId: string
): IpcResult<void> | null {
  const orchestrator = context.getOrchestrator();
  if (!orchestrator) {
    return {
      success: false,
      error: 'Orchestrator not available',
      code: IpcErrorCodes.ORCHESTRATOR_NOT_READY,
    };
  }
  
  const sessions = orchestrator.getSessions();
  const session = sessions.find(s => s.id === sessionId);
  
  if (!session) {
    return {
      success: false,
      error: `Session not found: ${sessionId}`,
      code: IpcErrorCodes.SESSION_NOT_FOUND,
    };
  }
  
  return null;
}

// =============================================================================
// Mutex/Lock Utilities
// =============================================================================

/**
 * Simple mutex for preventing concurrent operations
 */
export class Mutex {
  private locked = false;
  private waitQueue: Array<() => void> = [];
  
  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }
  
  release(): void {
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      next?.();
    } else {
      this.locked = false;
    }
  }
  
  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// Global mutexes for critical operations
export const sessionCreationMutex = new Mutex();

// =============================================================================
// IPC Payload Schemas and Validation
// =============================================================================

/**
 * Schema definition for IPC payload validation
 */
interface IpcSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array';
  required?: string[];
  properties?: Record<string, IpcSchemaProperty>;
  items?: IpcSchemaProperty;
}

interface IpcSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: unknown[];
  optional?: boolean;
}

/**
 * Common IPC payload schemas for critical channels
 */
export const IpcSchemas = {
  // Agent operations
  'agent:start-session': {
    type: 'object',
    required: ['config'],
    properties: {
      config: { type: 'object' },
    },
  },
  
  'agent:send-message': {
    type: 'object',
    required: ['sessionId', 'content'],
    properties: {
      sessionId: { type: 'string', minLength: 1 },
      content: { type: 'string', minLength: 1 },
    },
  },
  
  'agent:confirm-tool': {
    type: 'object',
    required: ['sessionId', 'callId', 'approved'],
    properties: {
      sessionId: { type: 'string', minLength: 1 },
      callId: { type: 'string', minLength: 1 },
      approved: { type: 'boolean' },
    },
  },
  
  // File operations
  'files:create': {
    type: 'object',
    required: ['filePath'],
    properties: {
      filePath: { type: 'string', minLength: 1 },
      content: { type: 'string', optional: true },
    },
  },
  
  'files:write': {
    type: 'object',
    required: ['filePath', 'content'],
    properties: {
      filePath: { type: 'string', minLength: 1 },
      content: { type: 'string' },
    },
  },
  
  // Terminal operations
  'terminal:spawn': {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', minLength: 1 },
      cwd: { type: 'string', optional: true },
    },
  },
  
  'terminal:write': {
    type: 'object',
    required: ['id', 'data'],
    properties: {
      id: { type: 'string', minLength: 1 },
      data: { type: 'string' },
    },
  },
} as const satisfies Record<string, IpcSchema>;

export type IpcSchemaKey = keyof typeof IpcSchemas;

/**
 * Validates an IPC payload against a schema
 */
export function validateIpcPayload<T = unknown>(
  channel: string,
  payload: unknown
): IpcResult<T> | null {
  const schema = IpcSchemas[channel as IpcSchemaKey];
  
  // If no schema defined, skip validation
  if (!schema) {
    return null;
  }
  
  // Check payload is an object
  if (typeof payload !== 'object' || payload === null) {
    return {
      success: false,
      error: `Invalid payload for ${channel}: expected object`,
      code: IpcErrorCodes.INVALID_PAYLOAD,
    };
  }
  
  const obj = payload as Record<string, unknown>;
  
  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (obj[field] === undefined || obj[field] === null) {
        return {
          success: false,
          error: `Missing required field '${field}' for ${channel}`,
          code: IpcErrorCodes.INVALID_PAYLOAD,
        };
      }
    }
  }
  
  // Validate properties
  if (schema.properties) {
    for (const [field, propSchema] of Object.entries(schema.properties)) {
      const value = obj[field];
      
      // Skip optional fields that are undefined
      if (propSchema.optional && value === undefined) {
        continue;
      }
      
      // Type check
      if (value !== undefined) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== propSchema.type) {
          return {
            success: false,
            error: `Invalid type for '${field}' in ${channel}: expected ${propSchema.type}, got ${actualType}`,
            code: IpcErrorCodes.INVALID_PAYLOAD,
          };
        }
        
        // String validations
        if (propSchema.type === 'string' && typeof value === 'string') {
          if (propSchema.minLength !== undefined && value.length < propSchema.minLength) {
            return {
              success: false,
              error: `Field '${field}' must be at least ${propSchema.minLength} characters`,
              code: IpcErrorCodes.INVALID_PAYLOAD,
            };
          }
          if (propSchema.maxLength !== undefined && value.length > propSchema.maxLength) {
            return {
              success: false,
              error: `Field '${field}' must be at most ${propSchema.maxLength} characters`,
              code: IpcErrorCodes.INVALID_PAYLOAD,
            };
          }
          if (propSchema.pattern && !propSchema.pattern.test(value)) {
            return {
              success: false,
              error: `Field '${field}' does not match required pattern`,
              code: IpcErrorCodes.INVALID_PAYLOAD,
            };
          }
        }
        
        // Number validations
        if (propSchema.type === 'number' && typeof value === 'number') {
          if (propSchema.min !== undefined && value < propSchema.min) {
            return {
              success: false,
              error: `Field '${field}' must be at least ${propSchema.min}`,
              code: IpcErrorCodes.INVALID_PAYLOAD,
            };
          }
          if (propSchema.max !== undefined && value > propSchema.max) {
            return {
              success: false,
              error: `Field '${field}' must be at most ${propSchema.max}`,
              code: IpcErrorCodes.INVALID_PAYLOAD,
            };
          }
        }
        
        // Enum validation
        if (propSchema.enum && !propSchema.enum.includes(value)) {
          return {
            success: false,
            error: `Field '${field}' must be one of: ${propSchema.enum.join(', ')}`,
            code: IpcErrorCodes.INVALID_PAYLOAD,
          };
        }
      }
    }
  }
  
  return null; // Validation passed
}

/**
 * Helper to wrap IPC handler with payload validation
 */
export function withValidatedPayload<T, R>(
  channel: string,
  handler: (payload: T) => R | Promise<R>
): (payload: unknown) => Promise<R | IpcResult<void>> {
  return async (payload: unknown) => {
    const validationError = validateIpcPayload(channel, payload);
    if (validationError) {
      logger.warn(`IPC validation failed for ${channel}`, { error: validationError.error });
      return validationError as IpcResult<void>;
    }
    return handler(payload as T);
  };
}
