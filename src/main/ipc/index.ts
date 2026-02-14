/**
 * IPC Handlers - Modular Registration System
 * 
 * This module exports all IPC handler registration functions and provides
 * a unified `registerAllHandlers` function for the main process.
 */


import type { IpcContext } from './types';

// Import all handler modules
import { registerAgentHandlers } from './agentHandlers';
import { registerSettingsHandlers } from './settingsHandlers';
import { registerFileHandlers } from './fileHandlers';
import { registerGitHandlers } from './gitHandlers';
import { registerBrowserHandlers } from './browserHandlers';
import { registerDebugHandlers } from './debugHandlers';
import { registerLspHandlers } from './lspHandlers';
import { registerClaudeHandlers } from './claudeHandlers';
import { registerTerminalHandlers, cleanupTerminalSessions } from './terminalHandlers';
import { registerGLMHandlers } from './glmHandlers';
import { registerProviderHandlers } from './providerHandlers';
import { registerCacheHandlers } from './cacheHandlers';
import { registerMCPHandlers } from './mcpHandlers';
import { registerThrottleHandlers } from './throttleHandlers';
import { registerRustBackendHandlers } from './rustBackendHandlers';
import { registerToolHandlers } from './toolHandlers';
import { registerUndoHandlers } from './undoHandlers';

// Re-export types
export type { IpcContext } from './types';

// Re-export cleanup functions
export { cleanupTerminalSessions };

// Re-export event batcher for performance optimization
export {
  IpcEventBatcher,
  initIpcEventBatcher,
  getIpcEventBatcher,
  sendBatchedEvent,
  getEventPriority,
  EventPriority,
  setAgentRunning,
  setSessionRunning,
  isAgentRunning,
  getThrottleStatus,
  getBatcherStats,
  type EventPriority as EventPriorityType,
} from './eventBatcher';

// Re-export request coalescer for deduplication
export {
  RequestCoalescer,
  initRequestCoalescer,
  getRequestCoalescer,
  coalesceRequest,
} from './requestCoalescer';

// Re-export guards and utilities
export {
  withOrchestratorGuard,
  withErrorGuard,
  withSafeHandler,
  withTimeout,
  withTimeoutFallback,
  validateRequired,
  validateNonEmptyString,
  validatePositiveNumber,
  validateSession,
  Mutex,
  sessionCreationMutex,
  IpcErrorCodes,
  type IpcResult,
  type IpcErrorCode,
} from './guards';

/**
 * Register all IPC handlers using the modular handler system
 */
export function registerIpcHandlers(context: IpcContext): void {

  // Register handlers in logical groups
  registerAgentHandlers(context);
  registerSettingsHandlers(context);
  registerFileHandlers(context);
  registerGitHandlers(context);
  registerBrowserHandlers(context);
  registerDebugHandlers(context);
  registerLspHandlers(context);
  registerClaudeHandlers(context);
  registerTerminalHandlers(context);
  registerGLMHandlers(context);
  registerProviderHandlers(context);
  registerCacheHandlers(context);
  registerMCPHandlers(context);
  registerThrottleHandlers();
  registerRustBackendHandlers(context);
  registerToolHandlers(context);
  registerUndoHandlers();
}

// Export individual handler registration functions for testing/selective use
