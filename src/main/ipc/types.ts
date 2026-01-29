/**
 * IPC Handler Types
 * 
 * Shared types for modular IPC handlers.
 */

import type { BrowserWindow } from 'electron';
import type { AgentOrchestrator } from '../agent/orchestrator';
import type { SettingsStore } from '../agent/settingsStore';
import type { WorkspaceManager } from '../workspaces/workspaceManager';

/**
 * Context object passed to all IPC handlers
 * Provides access to core services without tight coupling
 */
export interface IpcContext {
  getOrchestrator: () => AgentOrchestrator | null;
  getSettingsStore: () => SettingsStore;
  getWorkspaceManager: () => WorkspaceManager;
  getMainWindow: () => BrowserWindow | null;
  emitToRenderer: (event: Record<string, unknown>) => void;
  getActiveWorkspacePath: () => string | undefined;
}

/**
 * Handler registration function type
 * Each handler module exports a function that registers its handlers
 */
export type IpcHandlerRegistrar = (context: IpcContext) => void;
