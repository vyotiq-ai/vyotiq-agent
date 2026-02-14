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
import { withErrorGuard } from './guards';
import { getWorkspacePath } from './fileHandlers';
import type { IpcContext } from './types';

const logger = createLogger('IPC:LSP');

// Cache module imports to avoid repeated dynamic import overhead per IPC call
let cachedLSPModule: typeof import('../lsp') | null = null;
let cachedTSModule: typeof import('../agent/workspace/TypeScriptDiagnosticsService') | null = null;

const getLSPModuleCached = async () => {
  if (!cachedLSPModule) {
    cachedLSPModule = await import('../lsp');
  }
  return cachedLSPModule;
};

const getTSModuleCached = async () => {
  if (!cachedTSModule) {
    cachedTSModule = await import('../agent/workspace/TypeScriptDiagnosticsService');
  }
  return cachedTSModule;
};

// ---------------------------------------------------------------------------
// LSP Manager guard – DRYs the repeated get-module / get-manager / null-check
// pattern shared by 18+ handlers.
// ---------------------------------------------------------------------------
type LSPManager = NonNullable<Awaited<ReturnType<typeof getLSPModuleCached>>['getLSPManager'] extends (...args: unknown[]) => infer R ? R : never>;

/**
 * Wraps an LSP handler that requires a ready manager.
 * Handles module caching, null-check, try/catch and error logging in one place.
 *
 * @param operationName  Human-readable label for error logs
 * @param handler        Receives the non-null manager and returns the success payload
 * @param defaults       Extra fields merged into the error response (e.g. `{ clients: [] }`)
 */
async function withLSPManager<T extends Record<string, unknown>>(
  operationName: string,
  handler: (manager: LSPManager) => T | Promise<T>,
  defaults?: Partial<T>,
): Promise<(T & { success: true }) | { success: false; error: string } & Partial<T>> {
  try {
    const { getLSPManager } = await getLSPModuleCached();
    const manager = getLSPManager();
    if (!manager) {
      return { success: false as const, error: 'LSP manager not initialized', ...defaults } as { success: false; error: string } & Partial<T>;
    }
    const result = await handler(manager);
    return { success: true as const, ...result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to ${operationName}`, { error: errorMessage });
    return { success: false as const, error: errorMessage, ...defaults } as { success: false; error: string } & Partial<T>;
  }
}

export function registerLspHandlers(context: IpcContext): void {
  const { getMainWindow } = context;
  const getActiveWorkspacePath = (): string => getWorkspacePath() || '';

  // ==========================================================================
  // LSP Manager
  // ==========================================================================

  // Initialize has special logic: creates manager if needed
  ipcMain.handle('lsp:initialize', async (_event, workspacePath: string) => {
    return withErrorGuard('lsp:initialize', async () => {
      const { initLSPManager, getLSPManager } = await getLSPModuleCached();
      let manager = getLSPManager();
      if (!manager) {
        manager = initLSPManager(logger);
      }
      await manager.initialize(workspacePath);
      return { success: true, availableServers: manager.getAvailableServers() };
    });
  });

  // Returns empty arrays when manager is null (not an error)
  ipcMain.handle('lsp:get-clients', async () => {
    return withErrorGuard<{ success: boolean; clients: unknown[]; error?: string }>('lsp:get-clients', async () => {
      const { getLSPManager } = await getLSPModuleCached();
      const manager = getLSPManager();
      return { success: true, clients: manager ? manager.getClientInfo() : [] };
    }, { returnOnError: { success: false, error: 'Failed to get LSP clients', clients: [] } });
  });

  ipcMain.handle('lsp:get-available-servers', async () => {
    return withErrorGuard<{ success: boolean; servers: unknown[]; error?: string }>('lsp:get-available-servers', async () => {
      const { getLSPManager } = await getLSPModuleCached();
      const manager = getLSPManager();
      return { success: true, servers: manager ? manager.getAvailableServers() : [] };
    }, { returnOnError: { success: false, error: 'Failed to get available servers', servers: [] } });
  });

  // Start/stop-server have extra isLanguageSupported check
  ipcMain.handle('lsp:start-server', async (_event, language: string) => {
    return withErrorGuard('lsp:start-server', async () => {
      const { getLSPManager, isLanguageSupported } = await getLSPModuleCached();
      const manager = getLSPManager();
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      if (!isLanguageSupported(language)) {
        return { success: false, error: `Language not supported: ${language}` };
      }
      const started = await manager.startServer(language as Parameters<typeof manager.startServer>[0]);
      return { success: started, error: started ? undefined : 'Failed to start server' };
    });
  });

  ipcMain.handle('lsp:stop-server', async (_event, language: string) => {
    return withErrorGuard('lsp:stop-server', async () => {
      const { getLSPManager, isLanguageSupported } = await getLSPModuleCached();
      const manager = getLSPManager();
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      if (!isLanguageSupported(language)) {
        return { success: false, error: `Language not supported: ${language}` };
      }
      await manager.stopServer(language as Parameters<typeof manager.stopServer>[0]);
      return { success: true };
    });
  });

  // ==========================================================================
  // Code Intelligence
  // ==========================================================================

  ipcMain.handle('lsp:hover', async (_event, filePath: string, line: number, column: number) => {
    return withLSPManager('get hover', async (manager) => {
      const hover = await manager.getHover(filePath, line, column);
      return { hover };
    });
  });

  ipcMain.handle('lsp:definition', async (_event, filePath: string, line: number, column: number) => {
    return withLSPManager('get definition', async (manager) => {
      const locations = await manager.getDefinition(filePath, line, column);
      return { locations };
    });
  });

  ipcMain.handle('lsp:type-definition', async (_event, filePath: string, line: number, column: number) => {
    return withLSPManager('get type definition', async (manager) => {
      const locations = await manager.getTypeDefinition(filePath, line, column);
      return { locations };
    });
  });

  ipcMain.handle('lsp:implementations', async (_event, filePath: string, line: number, column: number) => {
    return withLSPManager('get implementations', async (manager) => {
      const locations = await manager.getImplementation(filePath, line, column);
      return { locations };
    });
  });

  ipcMain.handle('lsp:prepare-rename', async (_event, filePath: string, line: number, column: number) => {
    return withLSPManager('prepare rename', async (manager) => {
      const result = await manager.prepareRename(filePath, line, column);
      return { result };
    });
  });

  ipcMain.handle('lsp:references', async (_event, filePath: string, line: number, column: number, includeDeclaration?: boolean) => {
    return withLSPManager('get references', async (manager) => {
      const locations = await manager.getReferences(filePath, line, column, includeDeclaration ?? true);
      return { locations };
    });
  });

  ipcMain.handle('lsp:document-symbols', async (_event, filePath: string) => {
    return withLSPManager('get document symbols', async (manager) => {
      const symbols = await manager.getDocumentSymbols(filePath);
      return { symbols };
    });
  });

  ipcMain.handle('lsp:workspace-symbols', async (_event, query: string) => {
    return withLSPManager('search workspace symbols', async (manager) => {
      const symbols = await manager.searchWorkspaceSymbols(query);
      return { symbols };
    });
  });

  ipcMain.handle('lsp:completions', async (_event, filePath: string, line: number, column: number) => {
    return withLSPManager('get completions', async (manager) => {
      const completions = await manager.getCompletions(filePath, line, column);
      return { completions };
    });
  });

  ipcMain.handle('lsp:diagnostics', async (_event, filePath?: string) => {
    return withLSPManager('get diagnostics', async (manager) => {
      const diagnostics = filePath
        ? await manager.getDiagnostics(filePath)
        : manager.getAllDiagnostics();
      return { diagnostics };
    });
  });

  ipcMain.handle('lsp:code-actions', async (_event, filePath: string, startLine: number, startColumn: number, endLine: number, endColumn: number) => {
    return withLSPManager('get code actions', async (manager) => {
      const actions = await manager.getCodeActions(filePath, startLine, startColumn, endLine, endColumn);
      return { actions };
    });
  });

  ipcMain.handle('lsp:signature-help', async (_event, filePath: string, line: number, column: number) => {
    return withLSPManager('get signature help', async (manager) => {
      const signatureHelp = await manager.getSignatureHelp(filePath, line, column);
      return { signatureHelp };
    });
  });

  ipcMain.handle('lsp:format', async (_event, filePath: string) => {
    return withLSPManager('format document', async (manager) => {
      const edits = await manager.formatDocument(filePath);
      return { edits };
    });
  });

  ipcMain.handle('lsp:rename', async (_event, filePath: string, line: number, column: number, newName: string) => {
    return withLSPManager('rename symbol', async (manager) => {
      const edits = await manager.renameSymbol(filePath, line, column, newName);
      return { edits };
    });
  });

  // ==========================================================================
  // Document Management
  // ==========================================================================

  ipcMain.handle('lsp:open-document', async (_event, filePath: string, content?: string) => {
    return withLSPManager('open document', async (manager) => {
      await manager.openDocument(filePath, content);
      return {};
    });
  });

  ipcMain.handle('lsp:update-document', async (_event, filePath: string, content: string) => {
    return withLSPManager('update document', (manager) => {
      manager.updateDocument(filePath, content);
      return {};
    });
  });

  ipcMain.handle('lsp:close-document', async (_event, filePath: string) => {
    return withLSPManager('close document', (manager) => {
      manager.closeDocument(filePath);
      return {};
    });
  });

  ipcMain.handle('lsp:shutdown', async () => {
    return withErrorGuard('lsp:shutdown', async () => {
      const { shutdownLSPManager } = await getLSPModuleCached();
      await shutdownLSPManager();
      return { success: true };
    });
  });

  // ==========================================================================
  // Diagnostics Refresh
  // ==========================================================================

  ipcMain.handle('lsp:refresh-diagnostics', async () => {
    return withErrorGuard('lsp:refresh-diagnostics', async () => {
      const workspacePath = getActiveWorkspacePath();
      if (!workspacePath) {
        return { success: false, error: 'No active workspace' };
      }

      const { getTypeScriptDiagnosticsService } = await getTSModuleCached();
      const tsService = getTypeScriptDiagnosticsService();
      let tsSnapshot = null;
      if (tsService?.isReady()) {
        tsSnapshot = await tsService.refreshAll();
      }

      const { getLSPManager } = await getLSPModuleCached();
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
    });
  });

  ipcMain.handle('lsp:restart-typescript-server', async () => {
    return withErrorGuard('lsp:restart-typescript-server', async () => {
      const workspacePath = getActiveWorkspacePath();
      if (!workspacePath) {
        return { success: false, error: 'No active workspace' };
      }

      logger.info('Restarting TypeScript Language Server');

      const { getTypeScriptDiagnosticsService } = await getTSModuleCached();
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
    });
  });
}
