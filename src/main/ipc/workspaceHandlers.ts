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
  // Multi-Workspace Tab Management
  // ==========================================================================

  /**
   * Get the current multi-workspace state including open tabs
   */
  ipcMain.handle('workspace:get-tabs', () => {
    try {
      const manager = getWorkspaceManager();
      const state = manager.getMultiWorkspaceState();
      const tabs = state.tabs.map(tab => {
        const workspace = manager.list().find(w => w.id === tab.workspaceId);
        return {
          ...tab,
          workspace: workspace || null,
        };
      });
      return {
        success: true,
        tabs,
        focusedTabId: state.focusedTabId,
        maxTabs: state.maxTabs,
      };
    } catch (error) {
      logger.error('Failed to get workspace tabs', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Open a workspace in a new tab (or focus existing)
   */
  ipcMain.handle('workspace:open-tab', async (_event, workspaceId: string) => {
    try {
      const manager = getWorkspaceManager();
      const tabs = await manager.openTab(workspaceId);
      const state = manager.getMultiWorkspaceState();
      
      // Emit tab update event
      emitToRenderer({
        type: 'workspace-tabs-update',
        tabs,
        focusedTabId: state.focusedTabId,
      });

      // Also emit workspace update for backward compatibility
      const entries = manager.list();
      emitToRenderer({ type: 'workspace-update', workspaces: entries });

      // Initialize services for the newly opened workspace
      const workspace = entries.find(e => e.id === workspaceId);
      if (workspace) {
        await initializeWorkspaceServices(workspace.path);
      }

      return { success: true, tabs, focusedTabId: state.focusedTabId };
    } catch (error) {
      logger.error('Failed to open workspace tab', {
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Close a workspace tab
   */
  ipcMain.handle('workspace:close-tab', async (_event, workspaceId: string) => {
    try {
      const manager = getWorkspaceManager();
      const tabs = await manager.closeTab(workspaceId);
      const state = manager.getMultiWorkspaceState();
      
      emitToRenderer({
        type: 'workspace-tabs-update',
        tabs,
        focusedTabId: state.focusedTabId,
      });

      const entries = manager.list();
      emitToRenderer({ type: 'workspace-update', workspaces: entries });

      return { success: true, tabs, focusedTabId: state.focusedTabId };
    } catch (error) {
      logger.error('Failed to close workspace tab', {
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Focus a workspace tab
   */
  ipcMain.handle('workspace:focus-tab', async (_event, workspaceId: string) => {
    try {
      const manager = getWorkspaceManager();
      const tabs = await manager.focusTab(workspaceId);
      const state = manager.getMultiWorkspaceState();
      
      emitToRenderer({
        type: 'workspace-tabs-update',
        tabs,
        focusedTabId: state.focusedTabId,
      });

      const entries = manager.list();
      emitToRenderer({ type: 'workspace-update', workspaces: entries });

      // Initialize services for the focused workspace
      const workspace = entries.find(e => e.id === workspaceId);
      if (workspace) {
        await initializeWorkspaceServices(workspace.path);
      }

      return { success: true, tabs, focusedTabId: state.focusedTabId };
    } catch (error) {
      logger.error('Failed to focus workspace tab', {
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Reorder workspace tabs
   */
  ipcMain.handle('workspace:reorder-tabs', async (_event, workspaceId: string, newOrder: number) => {
    try {
      const manager = getWorkspaceManager();
      const tabs = await manager.reorderTabs(workspaceId, newOrder);
      const state = manager.getMultiWorkspaceState();
      
      emitToRenderer({
        type: 'workspace-tabs-update',
        tabs,
        focusedTabId: state.focusedTabId,
      });

      return { success: true, tabs, focusedTabId: state.focusedTabId };
    } catch (error) {
      logger.error('Failed to reorder workspace tabs', {
        workspaceId,
        newOrder,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Get active workspaces (workspaces with open tabs)
   */
  ipcMain.handle('workspace:get-active-workspaces', () => {
    try {
      const manager = getWorkspaceManager();
      const activeWorkspaces = manager.getActiveWorkspaces();
      return { success: true, workspaces: activeWorkspaces };
    } catch (error) {
      logger.error('Failed to get active workspaces', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Set maximum tabs limit
   */
  ipcMain.handle('workspace:set-max-tabs', async (_event, maxTabs: number) => {
    try {
      const manager = getWorkspaceManager();
      await manager.setMaxTabs(maxTabs);
      return { success: true, maxTabs };
    } catch (error) {
      logger.error('Failed to set max tabs', {
        maxTabs,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Helper to initialize workspace services (file watcher, LSP, diagnostics)
   */
  const initializeWorkspaceServices = async (workspacePath: string): Promise<void> => {
    // Initialize git service
    await getGitService().init(workspacePath);

    // Start file watcher
    try {
      const { watchWorkspace, setLSPChangeHandler } = await import('../workspaces/fileWatcher');
      await watchWorkspace(workspacePath);

      const { getLSPBridge } = await import('../lsp');
      setLSPChangeHandler((filePath, changeType) => {
        const bridge = getLSPBridge();
        if (bridge) {
          bridge.onFileChanged(filePath, changeType);
        }
      });
      logger.debug('File watcher started for workspace', { workspacePath });
    } catch (error) {
      logger.warn('Failed to start file watcher', {
        workspacePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Initialize LSP manager
    try {
      const { getLSPManager } = await import('../lsp');
      const lspManager = getLSPManager();
      if (lspManager) {
        await lspManager.initialize(workspacePath);
        logger.debug('LSP manager initialized for workspace', { workspacePath });
      }
    } catch (error) {
      logger.warn('Failed to initialize LSP manager', {
        workspacePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Initialize TypeScript diagnostics
    try {
      const existingService = getTypeScriptDiagnosticsService();
      if (existingService) {
        existingService.dispose();
      }
      const tsDiagnosticsService = initTypeScriptDiagnosticsService(logger);
      await tsDiagnosticsService.initialize(workspacePath);
      logger.debug('TypeScript diagnostics initialized for workspace', { workspacePath });
    } catch (error) {
      logger.warn('Failed to initialize TypeScript diagnostics', {
        workspacePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

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

  // ==========================================================================
  // Workspace Resource Management (Multi-workspace Concurrent Sessions)
  // ==========================================================================

  /**
   * Get resource metrics for all active workspaces
   */
  ipcMain.handle('workspace:get-resource-metrics', () => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) {
        return { success: false, error: 'Orchestrator not initialized' };
      }

      const metricsMap = orchestrator.getWorkspaceResourceMetrics();
      const metrics = Array.from(metricsMap.entries()).map(([id, m]) => ({
        workspaceId: id,
        ...m,
      }));

      return { success: true, metrics };
    } catch (error) {
      logger.error('Failed to get workspace resource metrics', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Get resource metrics for a specific workspace
   */
  ipcMain.handle('workspace:get-workspace-metrics', (_event, workspaceId: string) => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) {
        return { success: false, error: 'Orchestrator not initialized' };
      }

      const metrics = orchestrator.getWorkspaceMetrics(workspaceId);
      if (!metrics) {
        return { success: true, metrics: null };
      }

      return { success: true, metrics };
    } catch (error) {
      logger.error('Failed to get workspace metrics', {
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Get total active sessions across all workspaces
   */
  ipcMain.handle('workspace:get-total-active-sessions', () => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) {
        return { success: false, error: 'Orchestrator not initialized' };
      }

      const count = orchestrator.getTotalActiveSessionCount();
      return { success: true, count };
    } catch (error) {
      logger.error('Failed to get total active sessions', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Get resource limits configuration
   */
  ipcMain.handle('workspace:get-resource-limits', () => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) {
        return { success: false, error: 'Orchestrator not initialized' };
      }

      const limits = orchestrator.getResourceLimits();
      return { success: true, limits };
    } catch (error) {
      logger.error('Failed to get resource limits', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Update resource limits configuration
   */
  ipcMain.handle('workspace:update-resource-limits', (_event, limits: {
    maxSessionsPerWorkspace?: number;
    maxToolExecutionsPerWorkspace?: number;
    rateLimitWindowMs?: number;
    maxRequestsPerWindow?: number;
  }) => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) {
        return { success: false, error: 'Orchestrator not initialized' };
      }

      orchestrator.updateResourceLimits(limits);
      logger.info('Updated workspace resource limits', { limits });
      return { success: true };
    } catch (error) {
      logger.error('Failed to update resource limits', {
        limits,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Initialize workspace resources (for pre-warming)
   */
  ipcMain.handle('workspace:init-resources', (_event, workspaceId: string) => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) {
        return { success: false, error: 'Orchestrator not initialized' };
      }

      orchestrator.initializeWorkspaceResources(workspaceId);
      logger.debug('Initialized workspace resources', { workspaceId });
      return { success: true };
    } catch (error) {
      logger.error('Failed to initialize workspace resources', {
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Cleanup workspace resources
   */
  ipcMain.handle('workspace:cleanup-resources', (_event, workspaceId: string) => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) {
        return { success: false, error: 'Orchestrator not initialized' };
      }

      orchestrator.cleanupWorkspaceResources(workspaceId);
      logger.debug('Cleaned up workspace resources', { workspaceId });
      return { success: true };
    } catch (error) {
      logger.error('Failed to cleanup workspace resources', {
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: (error as Error).message };
    }
  });
}
