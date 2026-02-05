/**
 * IPC Handlers - Modular Registration System
 * 
 * This module exports all IPC handler registration functions and provides
 * a unified `registerAllHandlers` function for the main process.
 */

import type { BrowserWindow } from 'electron';
import type { AgentOrchestrator } from '../agent/orchestrator';
import type { SettingsStore } from '../agent/settingsStore';
import type { WorkspaceManager } from '../workspaces/workspaceManager';
import type { IpcContext } from './types';

// Import all handler modules
import { registerAgentHandlers } from './agentHandlers';
import { registerSettingsHandlers } from './settingsHandlers';
import { registerFileHandlers } from './fileHandlers';
import { registerWorkspaceHandlers } from './workspaceHandlers';
import { registerGitHandlers } from './gitHandlers';
import { registerBrowserHandlers } from './browserHandlers';
import { registerDebugHandlers } from './debugHandlers';
import { registerLspHandlers } from './lspHandlers';
import { registerEditorAiHandlers } from './editorAiHandlers';
import { registerClaudeHandlers } from './claudeHandlers';
import { registerTerminalHandlers, cleanupTerminalSessions } from './terminalHandlers';
import { registerGLMHandlers } from './glmHandlers';
import { registerProviderHandlers } from './providerHandlers';
import { registerCacheHandlers } from './cacheHandlers';
import { registerMCPHandlers } from './mcpHandlers';
import { registerThrottleHandlers } from './throttleHandlers';

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
export function registerAllHandlers(
  getOrchestrator: () => AgentOrchestrator | null,
  getSettingsStore: () => SettingsStore,
  getWorkspaceManager: () => WorkspaceManager,
  getMainWindow: () => BrowserWindow | null,
  emitToRenderer: (event: Record<string, unknown>) => void,
  getActiveWorkspacePath: () => string | undefined
): void {
  // Build context object that all handlers share
  const context: IpcContext = {
    getOrchestrator,
    getSettingsStore,
    getWorkspaceManager,
    getMainWindow,
    emitToRenderer,
    getActiveWorkspacePath,
  };

  // Register handlers in logical groups
  registerAgentHandlers(context);
  registerSettingsHandlers(context);
  registerFileHandlers(context);
  registerWorkspaceHandlers(context);
  registerGitHandlers(context);
  registerBrowserHandlers(context);
  registerDebugHandlers(context);
  registerLspHandlers(context);
  registerEditorAiHandlers(context);
  registerClaudeHandlers(context);
  registerTerminalHandlers(context);
  registerGLMHandlers(context);
  registerProviderHandlers(context);
  registerCacheHandlers(context);
  registerMCPHandlers(context);
  registerThrottleHandlers();
}

// Export individual handler registration functions for testing/selective use
export {
  registerAgentHandlers,
  registerSettingsHandlers,
  registerFileHandlers,
  registerWorkspaceHandlers,
  registerGitHandlers,
  registerBrowserHandlers,
  registerDebugHandlers,
  registerLspHandlers,
  registerEditorAiHandlers,
  registerClaudeHandlers,
  registerTerminalHandlers,
  registerGLMHandlers,
  registerProviderHandlers,
  registerCacheHandlers,
  registerMCPHandlers,
  registerThrottleHandlers,
};

