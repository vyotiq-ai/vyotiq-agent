/**
 * LSP (Language Server Protocol) IPC Handlers
 * 
 * Handles all LSP-related IPC operations including:
 * - Language server management
 * - Code intelligence (hover, definitions, references)
 * - Diagnostics refresh
 */

import { ipcMain } from 'electron';
import { createLogger } from '../logger';
import type { IpcContext } from './types';

const logger = createLogger('IPC:LSP');

export function registerLspHandlers(context: IpcContext): void {
  const { getMainWindow, getActiveWorkspacePath } = context;

  // ==========================================================================
  // LSP Manager
  // ==========================================================================

  ipcMain.handle('lsp:initialize', async (_event, workspacePath: string) => {
    try {
      const { initLSPManager, getLSPManager } = await import('../lsp');
      
      let manager = getLSPManager();
      if (!manager) {
        manager = initLSPManager(logger);
      }
      
      await manager.initialize(workspacePath);
      
      return { 
        success: true, 
        availableServers: manager.getAvailableServers(),
      };
    } catch (error) {
      logger.error('Failed to initialize LSP manager', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('lsp:get-clients', async () => {
    try {
      const { getLSPManager } = await import('../lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: true, clients: [] };
      }
      
      return { success: true, clients: manager.getClientInfo() };
    } catch (error) {
      logger.error('Failed to get LSP clients', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message, clients: [] };
    }
  });

  ipcMain.handle('lsp:get-available-servers', async () => {
    try {
      const { getLSPManager } = await import('../lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: true, servers: [] };
      }
      
      return { success: true, servers: manager.getAvailableServers() };
    } catch (error) {
      logger.error('Failed to get available servers', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message, servers: [] };
    }
  });

  ipcMain.handle('lsp:start-server', async (_event, language: string) => {
    try {
      const { getLSPManager, isLanguageSupported } = await import('../lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      if (!isLanguageSupported(language)) {
        return { success: false, error: `Language not supported: ${language}` };
      }
      
      const started = await manager.startServer(language as Parameters<typeof manager.startServer>[0]);
      return { success: started, error: started ? undefined : 'Failed to start server' };
    } catch (error) {
      logger.error('Failed to start LSP server', { language, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('lsp:stop-server', async (_event, language: string) => {
    try {
      const { getLSPManager, isLanguageSupported } = await import('../lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      if (!isLanguageSupported(language)) {
        return { success: false, error: `Language not supported: ${language}` };
      }
      
      await manager.stopServer(language as Parameters<typeof manager.stopServer>[0]);
      return { success: true };
    } catch (error) {
      logger.error('Failed to stop LSP server', { language, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  // ==========================================================================
  // Code Intelligence
  // ==========================================================================

  ipcMain.handle('lsp:hover', async (_event, filePath: string, line: number, column: number) => {
    try {
      const { getLSPManager } = await import('../lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      const hover = await manager.getHover(filePath, line, column);
      return { success: true, hover };
    } catch (error) {
      logger.error('Failed to get hover', { filePath, line, column, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('lsp:definition', async (_event, filePath: string, line: number, column: number) => {
    try {
      const { getLSPManager } = await import('../lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      const locations = await manager.getDefinition(filePath, line, column);
      return { success: true, locations };
    } catch (error) {
      logger.error('Failed to get definition', { filePath, line, column, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('lsp:references', async (_event, filePath: string, line: number, column: number, includeDeclaration?: boolean) => {
    try {
      const { getLSPManager } = await import('../lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      const locations = await manager.getReferences(filePath, line, column, includeDeclaration ?? true);
      return { success: true, locations };
    } catch (error) {
      logger.error('Failed to get references', { filePath, line, column, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('lsp:document-symbols', async (_event, filePath: string) => {
    try {
      const { getLSPManager } = await import('../lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      const symbols = await manager.getDocumentSymbols(filePath);
      return { success: true, symbols };
    } catch (error) {
      logger.error('Failed to get document symbols', { filePath, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('lsp:workspace-symbols', async (_event, query: string) => {
    try {
      const { getLSPManager } = await import('../lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      const symbols = await manager.searchWorkspaceSymbols(query);
      return { success: true, symbols };
    } catch (error) {
      logger.error('Failed to search workspace symbols', { query, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('lsp:completions', async (_event, filePath: string, line: number, column: number) => {
    try {
      const { getLSPManager } = await import('../lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      const completions = await manager.getCompletions(filePath, line, column);
      return { success: true, completions };
    } catch (error) {
      logger.error('Failed to get completions', { filePath, line, column, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('lsp:diagnostics', async (_event, filePath?: string) => {
    try {
      const { getLSPManager } = await import('../lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      const diagnostics = filePath 
        ? await manager.getDiagnostics(filePath)
        : manager.getAllDiagnostics();
      
      return { success: true, diagnostics };
    } catch (error) {
      logger.error('Failed to get diagnostics', { filePath, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('lsp:code-actions', async (_event, filePath: string, startLine: number, startColumn: number, endLine: number, endColumn: number) => {
    try {
      const { getLSPManager } = await import('../lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      const actions = await manager.getCodeActions(filePath, startLine, startColumn, endLine, endColumn);
      return { success: true, actions };
    } catch (error) {
      logger.error('Failed to get code actions', { filePath, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('lsp:signature-help', async (_event, filePath: string, line: number, column: number) => {
    try {
      const { getLSPManager } = await import('../lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      const signatureHelp = await manager.getSignatureHelp(filePath, line, column);
      return { success: true, signatureHelp };
    } catch (error) {
      logger.error('Failed to get signature help', { filePath, line, column, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('lsp:format', async (_event, filePath: string) => {
    try {
      const { getLSPManager } = await import('../lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      const edits = await manager.formatDocument(filePath);
      return { success: true, edits };
    } catch (error) {
      logger.error('Failed to format document', { filePath, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('lsp:rename', async (_event, filePath: string, line: number, column: number, newName: string) => {
    try {
      const { getLSPManager } = await import('../lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      const edits = await manager.renameSymbol(filePath, line, column, newName);
      return { success: true, edits };
    } catch (error) {
      logger.error('Failed to rename symbol', { filePath, line, column, newName, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  // ==========================================================================
  // Document Management
  // ==========================================================================

  ipcMain.handle('lsp:open-document', async (_event, filePath: string, content?: string) => {
    try {
      const { getLSPManager } = await import('../lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      await manager.openDocument(filePath, content);
      return { success: true };
    } catch (error) {
      logger.error('Failed to open document', { filePath, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('lsp:update-document', async (_event, filePath: string, content: string) => {
    try {
      const { getLSPManager } = await import('../lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      manager.updateDocument(filePath, content);
      return { success: true };
    } catch (error) {
      logger.error('Failed to update document', { filePath, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('lsp:close-document', async (_event, filePath: string) => {
    try {
      const { getLSPManager } = await import('../lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      manager.closeDocument(filePath);
      return { success: true };
    } catch (error) {
      logger.error('Failed to close document', { filePath, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('lsp:shutdown', async () => {
    try {
      const { shutdownLSPManager } = await import('../lsp');
      await shutdownLSPManager();
      return { success: true };
    } catch (error) {
      logger.error('Failed to shutdown LSP manager', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  // ==========================================================================
  // Diagnostics Refresh
  // ==========================================================================

  ipcMain.handle('lsp:refresh-diagnostics', async () => {
    try {
      const workspacePath = getActiveWorkspacePath();
      if (!workspacePath) {
        return { success: false, error: 'No active workspace' };
      }

      const { getTypeScriptDiagnosticsService } = await import('../agent/workspace/TypeScriptDiagnosticsService');
      const tsService = getTypeScriptDiagnosticsService();
      let tsSnapshot = null;
      if (tsService?.isReady()) {
        tsSnapshot = await tsService.refreshAll();
      }

      const { getLSPManager } = await import('../lsp');
      const lspManager = getLSPManager();
      const lspDiagnostics = lspManager?.getAllDiagnostics() ?? [];

      return {
        success: true,
        typescript: tsSnapshot ? {
          errorCount: tsSnapshot.errorCount,
          warningCount: tsSnapshot.warningCount,
          diagnosticsCount: tsSnapshot.diagnostics.length,
        } : null,
        lsp: {
          diagnosticsCount: lspDiagnostics.length,
        },
      };
    } catch (error) {
      logger.error('Failed to refresh diagnostics', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('lsp:restart-typescript-server', async () => {
    try {
      const workspacePath = getActiveWorkspacePath();
      if (!workspacePath) {
        return { success: false, error: 'No active workspace' };
      }

      logger.info('Restarting TypeScript Language Server');

      const { getTypeScriptDiagnosticsService } = await import('../agent/workspace/TypeScriptDiagnosticsService');
      const tsService = getTypeScriptDiagnosticsService();
      
      if (!tsService) {
        return { success: false, error: 'TypeScript Diagnostics Service not initialized' };
      }

      const success = await tsService.reinitialize();
      if (!success) {
        return { success: false, error: 'Failed to reinitialize TypeScript service' };
      }

      const snapshot = tsService.getSnapshot();

      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send('diagnostics:updated', {
          diagnostics: snapshot.diagnostics,
          errorCount: snapshot.errorCount,
          warningCount: snapshot.warningCount,
          filesWithErrors: snapshot.filesWithErrors,
          timestamp: snapshot.timestamp,
        });
      }

      logger.info('TypeScript Language Server restarted successfully', {
        errorCount: snapshot.errorCount,
        warningCount: snapshot.warningCount,
      });

      return {
        success: true,
        diagnostics: {
          errorCount: snapshot.errorCount,
          warningCount: snapshot.warningCount,
          diagnosticsCount: snapshot.diagnostics.length,
        },
      };
    } catch (error) {
      logger.error('Failed to restart TypeScript server', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });
}
