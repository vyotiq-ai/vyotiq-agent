/**
 * IPC Handler Registration
 * 
 * This file serves as the entry point for all IPC handlers.
 * The handlers are organized into modular files in the `./ipc/` directory.
 * 
 * Structure:
 * - ipc/agentHandlers.ts      - Session, run, message, branch management
 * - ipc/settingsHandlers.ts   - Settings, cache, provider models
 * - ipc/fileHandlers.ts       - File CRUD, selection dialogs
 * - ipc/workspaceHandlers.ts  - Workspace management, diagnostics
 * - ipc/gitHandlers.ts        - Git operations and agent integration
 * - ipc/browserHandlers.ts    - Browser automation and security
 * - ipc/debugHandlers.ts      - Debug traces, undo history
 * - ipc/lspHandlers.ts        - Language Server Protocol
 * - ipc/editorAiHandlers.ts   - Editor AI completions and actions
 * - ipc/claudeHandlers.ts     - Claude subscription OAuth
 * - ipc/terminalHandlers.ts   - Interactive terminal sessions
 */

import type { BrowserWindow } from 'electron';
import type { AgentOrchestrator } from './agent/orchestrator';
import type { SettingsStore } from './agent/settingsStore';
import type { WorkspaceManager } from './workspaces/workspaceManager';
import type { RendererEvent } from '../shared/types';
import { registerAllHandlers, cleanupTerminalSessions } from './ipc/index';
import { createLogger } from './logger';

const logger = createLogger('IPC');

interface IpcContext {
  getOrchestrator: () => AgentOrchestrator | null;
  getSettingsStore: () => SettingsStore;
  getWorkspaceManager: () => WorkspaceManager;
  getMainWindow: () => BrowserWindow | null;
  emitToRenderer: (event: RendererEvent) => void;
}

/**
 * Register all IPC handlers for the main process.
 * This function delegates to modular handlers in the `./ipc/` directory.
 */
export const registerIpcHandlers = (context: IpcContext) => {
  const { getOrchestrator, getSettingsStore, getWorkspaceManager, getMainWindow, emitToRenderer } = context;

  /** Get the active workspace path or undefined */
  const getActiveWorkspacePath = (): string | undefined => {
    const active = getWorkspaceManager().getActive();
    return active?.path ?? undefined;
  };

  logger.info('Registering modular IPC handlers');

  // Delegate to modular handler registration
  registerAllHandlers(
    getOrchestrator,
    getSettingsStore,
    getWorkspaceManager,
    getMainWindow,
    emitToRenderer as (event: Record<string, unknown>) => void,
    getActiveWorkspacePath
  );

  logger.info('IPC handlers registered successfully');
};

// Re-export cleanup function for use in app shutdown
export { cleanupTerminalSessions };
