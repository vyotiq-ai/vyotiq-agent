/**
 * Workspace IPC Handlers
 * 
 * Handles all workspace-related IPC operations including:
 * - Workspace management (list, add, remove, set active)
 * - Diagnostics services
 */

import { ipcMain, dialog } from 'electron';
import {
  initTypeScriptDiagnosticsService,
  getTypeScriptDiagnosticsService,
  type DiagnosticsEvent,
  type DiagnosticsSnapshot,
} from '../agent/workspace/TypeScriptDiagnosticsService';
import { createLogger } from '../logger';
import { getGitService } from '../git';
import type { IpcContext } from './types';

const logger = createLogger('IPC:Workspace');

// Track active diagnostics listener for cleanup
let diagnosticsListener: ((event: DiagnosticsEvent) => void) | null = null;

export function registerWorkspaceHandlers(context: IpcContext): void {
  const { getWorkspaceManager, getMainWindow, emitToRenderer, getOrchestrator, getActiveWorkspacePath } = context;

  /**
   * Initialize the TypeScript Diagnostics Service for the active workspace.
   */
  const initDiagnosticsServiceForWorkspace = async (): Promise<boolean> => {
    const workspacePath = getActiveWorkspacePath();
    if (!workspacePath) {
      logger.debug('No active workspace for diagnostics service');
      return false;
    }

    let service = getTypeScriptDiagnosticsService();
    if (service && service.isReady()) {
      return true;
    }

    const diagnosticsLogger = createLogger('TypeScriptDiagnostics');
    service = initTypeScriptDiagnosticsService(diagnosticsLogger);

    const success = await service.initialize(workspacePath);
    if (!success) {
      logger.debug('TypeScript diagnostics service not available for workspace', { workspacePath });
      return false;
    }

    logger.info('TypeScript diagnostics service initialized', { workspacePath });
    return true;
  };

  // ==========================================================================
  // Workspace Management
  // ==========================================================================

  ipcMain.handle('workspace:list', () => {
    return getWorkspaceManager().list();
  });

  ipcMain.handle('workspace:add', async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return getWorkspaceManager().list();
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return getWorkspaceManager().list();
    await getWorkspaceManager().add(result.filePaths[0]);
    const entries = getWorkspaceManager().list();
    emitToRenderer({ type: 'workspace-update', workspaces: entries });

    const active = entries.find((entry) => entry.isActive);
    if (active) {
      try {
        const { watchWorkspace } = await import('../workspaces/fileWatcher');
        await watchWorkspace(active.path);
        logger.info('File watcher started for new workspace', { workspacePath: active.path });
      } catch (error) {
        logger.warn('Failed to start file watcher for new workspace', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return entries;
  });

  ipcMain.handle('workspace:set-active', async (_event, workspaceId: string) => {
    await getWorkspaceManager().setActive(workspaceId);
    const entries = getWorkspaceManager().list();
    emitToRenderer({ type: 'workspace-update', workspaces: entries });

    const active = entries.find((entry) => entry.isActive);
    if (active) {
      await getGitService().init(active.path);

      try {
        const { watchWorkspace, setLSPChangeHandler } = await import('../workspaces/fileWatcher');
        await watchWorkspace(active.path);

        const { getLSPBridge } = await import('../lsp');
        setLSPChangeHandler((filePath, changeType) => {
          const bridge = getLSPBridge();
          if (bridge) {
            bridge.onFileChanged(filePath, changeType);
          }
        });

        logger.info('File watcher updated for workspace', { workspacePath: active.path });
      } catch (error) {
        logger.warn('Failed to update file watcher for workspace', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      try {
        const { getLSPManager } = await import('../lsp');
        const lspManager = getLSPManager();
        if (lspManager) {
          await lspManager.initialize(active.path);
          logger.info('LSP manager initialized for workspace', { workspacePath: active.path });
        }
      } catch (error) {
        logger.warn('Failed to initialize LSP manager for workspace', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      try {
        const existingService = getTypeScriptDiagnosticsService();
        if (existingService) {
          existingService.dispose();
        }
        const tsDiagnosticsService = initTypeScriptDiagnosticsService(logger);
        await tsDiagnosticsService.initialize(active.path);

        // Note: Event listener is set up in workspace:diagnostics-subscribe
        // This ensures consistent event format and avoids duplicate listeners

        logger.info('TypeScript diagnostics service initialized for workspace', { workspacePath: active.path });
      } catch (error) {
        logger.warn('Failed to initialize TypeScript diagnostics service', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return entries;
  });

  ipcMain.handle('workspace:remove', async (_event, workspaceId: string) => {
    await getWorkspaceManager().remove(workspaceId);
    const entries = getWorkspaceManager().list();
    emitToRenderer({ type: 'workspace-update', workspaces: entries });
    return entries;
  });

  // ==========================================================================
  // Workspace Diagnostics
  // ==========================================================================

  ipcMain.handle('workspace:get-diagnostics', async (_event, options?: { forceRefresh?: boolean }) => {
    try {
      logger.debug('workspace:get-diagnostics called', { forceRefresh: options?.forceRefresh });

      const initialized = await initDiagnosticsServiceForWorkspace();
      const service = getTypeScriptDiagnosticsService();

      if (!initialized || !service) {
        const orchestrator = getOrchestrator();
        if (!orchestrator) {
          return { success: false, error: 'Orchestrator not initialized' };
        }

        const diagnostics = await orchestrator.getWorkspaceDiagnostics();
        if (!diagnostics) {
          return { success: true, diagnostics: [], message: 'No active workspace' };
        }

        return {
          success: true,
          diagnostics: diagnostics.diagnostics,
          errorCount: diagnostics.errorCount,
          warningCount: diagnostics.warningCount,
          filesWithErrors: diagnostics.filesWithErrors,
          collectedAt: diagnostics.collectedAt,
        };
      }

      let snapshot: DiagnosticsSnapshot;
      if (options?.forceRefresh) {
        await service.reinitialize();
        snapshot = service.getSnapshot();
      } else {
        snapshot = service.getSnapshot();
      }

      logger.debug('workspace:get-diagnostics: Returning diagnostics', {
        count: snapshot.diagnostics.length,
        errorCount: snapshot.errorCount,
        warningCount: snapshot.warningCount,
      });

      return {
        success: true,
        diagnostics: snapshot.diagnostics,
        errorCount: snapshot.errorCount,
        warningCount: snapshot.warningCount,
        filesWithErrors: snapshot.filesWithErrors,
        collectedAt: snapshot.timestamp,
      };
    } catch (error) {
      logger.error('Failed to get workspace diagnostics', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('workspace:diagnostics-subscribe', async () => {
    try {
      const initialized = await initDiagnosticsServiceForWorkspace();
      const service = getTypeScriptDiagnosticsService();
      const mainWindow = getMainWindow();

      if (!initialized || !service || !mainWindow) {
        logger.debug('Diagnostics subscription not available');
        return { success: false, error: 'Diagnostics service not available' };
      }

      if (diagnosticsListener) {
        service.removeListener('diagnostics', diagnosticsListener);
      }

      diagnosticsListener = (event: DiagnosticsEvent) => {
        if (event.type === 'diagnostics-updated' && event.snapshot) {
          mainWindow.webContents.send('diagnostics:updated', {
            diagnostics: event.snapshot.diagnostics,
            errorCount: event.snapshot.errorCount,
            warningCount: event.snapshot.warningCount,
            filesWithErrors: event.snapshot.filesWithErrors,
            timestamp: event.snapshot.timestamp,
          });
        } else if (event.type === 'file-diagnostics' && event.filePath && event.diagnostics) {
          mainWindow.webContents.send('diagnostics:file-updated', {
            filePath: event.filePath,
            diagnostics: event.diagnostics,
          });
        } else if (event.type === 'diagnostics-cleared') {
          mainWindow.webContents.send('diagnostics:cleared', {});
        }
      };

      service.on('diagnostics', diagnosticsListener);
      logger.info('Diagnostics subscription started');

      const snapshot = service.getSnapshot();
      mainWindow.webContents.send('diagnostics:updated', {
        diagnostics: snapshot.diagnostics,
        errorCount: snapshot.errorCount,
        warningCount: snapshot.warningCount,
        filesWithErrors: snapshot.filesWithErrors,
        timestamp: snapshot.timestamp,
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to subscribe to diagnostics', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('workspace:diagnostics-unsubscribe', () => {
    try {
      const service = getTypeScriptDiagnosticsService();

      if (service && diagnosticsListener) {
        service.removeListener('diagnostics', diagnosticsListener);
        diagnosticsListener = null;
        logger.info('Diagnostics subscription stopped');
      }

      return { success: true };
    } catch (error) {
      logger.error('Failed to unsubscribe from diagnostics', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: (error as Error).message };
    }
  });
}
