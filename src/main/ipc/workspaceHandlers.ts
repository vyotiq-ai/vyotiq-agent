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

  // ==========================================================================
  // AGENTS.md Support
  // ==========================================================================

  /**
   * Get AGENTS.md status for the active workspace.
   * Returns discovered AGENTS.md files and their status.
   */
  ipcMain.handle('workspace:agents-md-status', async () => {
    try {
      const workspacePath = getActiveWorkspacePath();
      if (!workspacePath) {
        return {
          enabled: false,
          files: [],
          primaryFile: null,
          error: 'No active workspace',
        };
      }

      const { getAgentsMdReader } = await import('../agent/workspace/AgentsMdReader');
      const reader = getAgentsMdReader();
      reader.setWorkspace(workspacePath);

      // Get full context which includes parsed files
      const context = await reader.getContextForFile(undefined);
      
      if (!context.found || context.allFiles.length === 0) {
        return {
          enabled: false,
          files: [],
          primaryFile: null,
          error: null,
        };
      }

      return {
        enabled: true,
        files: context.allFiles.map(f => ({
          path: f.filePath,
          relativePath: f.relativePath,
          depth: f.depth,
          sectionCount: f.sections.length,
          size: f.content.length,
        })),
        primaryFile: context.primary ? {
          path: context.primary.relativePath,
          sections: context.primary.sections.map(s => s.heading),
        } : null,
        error: null,
      };
    } catch (error) {
      logger.error('Failed to get AGENTS.md status', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        enabled: false,
        files: [],
        primaryFile: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Refresh AGENTS.md cache for the active workspace.
   */
  ipcMain.handle('workspace:agents-md-refresh', async () => {
    try {
      const workspacePath = getActiveWorkspacePath();
      if (!workspacePath) {
        return { success: false, error: 'No active workspace' };
      }

      const { getAgentsMdReader } = await import('../agent/workspace/AgentsMdReader');
      const reader = getAgentsMdReader();
      reader.clearCache();
      reader.setWorkspace(workspacePath);

      const files = await reader.discoverFiles();
      logger.info('AGENTS.md cache refreshed', { fileCount: files.length });

      return { success: true, fileCount: files.length };
    } catch (error) {
      logger.error('Failed to refresh AGENTS.md cache', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // ==========================================================================
  // Instruction Files Support (Extended AGENTS.md)
  // ==========================================================================

  /**
   * Get all instruction files status for the active workspace.
   * Returns all discovered instruction files with their types and status.
   */
  ipcMain.handle('workspace:instruction-files-status', async () => {
    try {
      const workspacePath = getActiveWorkspacePath();
      if (!workspacePath) {
        return {
          found: false,
          files: [],
          enabledCount: 0,
          byType: {},
          error: 'No active workspace',
        };
      }

      const { getInstructionFilesReader } = await import('../agent/workspace/InstructionFilesReader');
      const reader = getInstructionFilesReader();
      reader.setWorkspace(workspacePath);

      const summary = await reader.getSummary();
      
      return {
        ...summary,
        error: null,
      };
    } catch (error) {
      logger.error('Failed to get instruction files status', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        found: false,
        files: [],
        enabledCount: 0,
        byType: {},
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Refresh instruction files cache for the active workspace.
   */
  ipcMain.handle('workspace:instruction-files-refresh', async () => {
    try {
      const workspacePath = getActiveWorkspacePath();
      if (!workspacePath) {
        return { success: false, error: 'No active workspace' };
      }

      const { getInstructionFilesReader } = await import('../agent/workspace/InstructionFilesReader');
      const reader = getInstructionFilesReader();
      reader.clearCache();
      reader.setWorkspace(workspacePath);

      const summary = await reader.getSummary();
      logger.info('Instruction files cache refreshed', { fileCount: summary.fileCount });

      return { success: true, fileCount: summary.fileCount, enabledCount: summary.enabledCount };
    } catch (error) {
      logger.error('Failed to refresh instruction files cache', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  /**
   * Toggle an instruction file's enabled status.
   */
  ipcMain.handle('workspace:instruction-files-toggle', async (_event, relativePath: string, enabled: boolean) => {
    try {
      const workspacePath = getActiveWorkspacePath();
      if (!workspacePath) {
        return { success: false, error: 'No active workspace' };
      }

      const { getInstructionFilesReader } = await import('../agent/workspace/InstructionFilesReader');
      const reader = getInstructionFilesReader();
      reader.setWorkspace(workspacePath);
      reader.toggleFile(relativePath, enabled);

      logger.info('Instruction file toggled', { relativePath, enabled });

      return { success: true };
    } catch (error) {
      logger.error('Failed to toggle instruction file', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  /**
   * Update instruction files configuration.
   */
  ipcMain.handle('workspace:instruction-files-config', async (_event, config: Record<string, unknown>) => {
    try {
      const workspacePath = getActiveWorkspacePath();
      if (!workspacePath) {
        return { success: false, error: 'No active workspace' };
      }

      const { getInstructionFilesReader } = await import('../agent/workspace/InstructionFilesReader');
      const reader = getInstructionFilesReader();
      reader.setWorkspace(workspacePath);
      reader.setConfig(config as Partial<import('../../shared/types').InstructionFilesConfig>);

      logger.info('Instruction files config updated', { config });

      return { success: true };
    } catch (error) {
      logger.error('Failed to update instruction files config', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  /**
   * Get instruction files context for the active file.
   */
  ipcMain.handle('workspace:instruction-files-context', async (_event, activeFilePath?: string) => {
    try {
      const workspacePath = getActiveWorkspacePath();
      if (!workspacePath) {
        return {
          found: false,
          allFiles: [],
          enabledFiles: [],
          combinedContent: '',
          scannedAt: Date.now(),
          errors: [],
        };
      }

      const { getInstructionFilesReader } = await import('../agent/workspace/InstructionFilesReader');
      const reader = getInstructionFilesReader();
      reader.setWorkspace(workspacePath);

      const context = await reader.getContextForFile(activeFilePath);
      
      return context;
    } catch (error) {
      logger.error('Failed to get instruction files context', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        found: false,
        allFiles: [],
        enabledFiles: [],
        combinedContent: '',
        scannedAt: Date.now(),
        errors: [{ path: '', error: error instanceof Error ? error.message : 'Unknown error' }],
      };
    }
  });
}
