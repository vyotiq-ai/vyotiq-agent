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
    return withErrorGuard('lsp:diagnostics', async () => {
      const { getLSPManager } = await getLSPModuleCached();
      const manager = getLSPManager();

      // Per-file: delegate to LSP manager only
      if (filePath) {
        if (!manager) {
          return { success: false, error: 'LSP manager not initialized', diagnostics: [] };
        }
        const diagnostics = await manager.getDiagnostics(filePath);
        return { success: true, diagnostics };
      }

      // Workspace-wide: merge LSP cache + TypeScript service snapshot
      const lspDiagnostics = manager?.getAllDiagnostics() ?? [];

      // Also include TypeScript diagnostics service snapshot
      let tsDiagnostics: unknown[] = [];
      try {
        const { getTypeScriptDiagnosticsService } = await getTSModuleCached();
        const tsService = getTypeScriptDiagnosticsService();
        if (tsService?.isReady()) {
          const snapshot = tsService.getSnapshot();
          if (snapshot?.diagnostics) {
            tsDiagnostics = snapshot.diagnostics;
          }
        }
      } catch {
        // TS service may not be available — that's fine
      }

      // Deduplicate by filePath:line:column:message
      const seen = new Set<string>();
      const merged: unknown[] = [];

      for (const d of lspDiagnostics) {
        const key = `${d.filePath}:${d.line}:${d.column}:${d.message}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(d);
        }
      }

      for (const d of tsDiagnostics) {
        const td = d as { filePath?: string; line?: number; column?: number; message?: string };
        const key = `${td.filePath ?? ''}:${td.line ?? 0}:${td.column ?? 0}:${td.message ?? ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(d);
        }
      }

      return { success: true, diagnostics: merged };
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

      // Deduplicate and merge all diagnostics for the response
      const seen = new Set<string>();
      const allDiagnostics: unknown[] = [];

      for (const d of lspDiagnostics) {
        const key = `${d.filePath}:${d.line}:${d.column}:${d.message}`;
        if (!seen.has(key)) {
          seen.add(key);
          allDiagnostics.push(d);
        }
      }

      if (tsSnapshot?.diagnostics) {
        for (const d of tsSnapshot.diagnostics) {
          const key = `${d.filePath}:${d.line}:${d.column}:${d.message}`;
          if (!seen.has(key)) {
            seen.add(key);
            allDiagnostics.push(d);
          }
        }
      }

      return {
        success: true,
        diagnostics: allDiagnostics,
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

  // ==========================================================================
  // Workspace Diagnostics Initialization
  // ==========================================================================

  /**
   * Initialize diagnostics for a workspace path.
   * Called by the renderer when workspace changes or on first load.
   * Re-initializes both TypeScript diagnostics and LSP for the given workspace.
   */
  ipcMain.handle('lsp:initialize-workspace-diagnostics', async (_event, workspacePath: string) => {
    return withErrorGuard('lsp:initialize-workspace-diagnostics', async () => {
      if (!workspacePath) {
        return { success: false, error: 'No workspace path provided' };
      }

      logger.info('Initializing workspace diagnostics', { workspacePath });

      let tsReady = false;
      let lspReady = false;

      // Initialize or re-initialize TypeScript diagnostics service
      try {
        const { getTypeScriptDiagnosticsService, initTypeScriptDiagnosticsService } = await getTSModuleCached();
        let tsService = getTypeScriptDiagnosticsService();
        
        if (!tsService) {
          // Service not yet created — import logger and create it
          const { createLogger: createLog } = await import('../logger');
          tsService = initTypeScriptDiagnosticsService(createLog('TSDiagnostics'));
        }

        if (tsService.isReady()) {
          // Already initialized — reinitialize for new workspace
          await tsService.reinitialize();
        } else {
          await tsService.initialize(workspacePath);
        }

        tsReady = tsService.isReady();

        // Forward events to renderer if a new service was created
        const mainWindow = getMainWindow();
        if (mainWindow && tsService) {
          // Re-emit the current snapshot immediately
          const snapshot = tsService.getSnapshot();
          if (snapshot.diagnostics.length > 0) {
            mainWindow.webContents.send('diagnostics:updated', {
              diagnostics: snapshot.diagnostics,
              errorCount: snapshot.errorCount,
              warningCount: snapshot.warningCount,
              filesWithErrors: snapshot.filesWithErrors,
              timestamp: snapshot.timestamp,
            });
          }
        }
      } catch (err) {
        logger.debug('TypeScript diagnostics init failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Initialize LSP manager for the workspace
      try {
        const { getLSPManager } = await getLSPModuleCached();
        const lspManager = getLSPManager();
        if (lspManager) {
          await lspManager.initialize(workspacePath);
          lspReady = true;
        }
      } catch (err) {
        logger.debug('LSP initialization failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Now do a full refresh to return merged diagnostics
      const allDiagnostics: unknown[] = [];
      const seen = new Set<string>();

      try {
        const { getLSPManager } = await getLSPModuleCached();
        const lspManager = getLSPManager();
        const lspDiags = lspManager?.getAllDiagnostics() ?? [];
        for (const d of lspDiags) {
          const key = `${d.filePath}:${d.line}:${d.column}:${d.message}`;
          if (!seen.has(key)) {
            seen.add(key);
            allDiagnostics.push(d);
          }
        }
      } catch { /* ignore */ }

      try {
        const { getTypeScriptDiagnosticsService } = await getTSModuleCached();
        const tsService = getTypeScriptDiagnosticsService();
        if (tsService?.isReady()) {
          const snapshot = tsService.getSnapshot();
          for (const d of snapshot.diagnostics) {
            const key = `${d.filePath}:${d.line}:${d.column}:${d.message}`;
            if (!seen.has(key)) {
              seen.add(key);
              allDiagnostics.push(d);
            }
          }
        }
      } catch { /* ignore */ }

      logger.info('Workspace diagnostics initialized', {
        workspacePath,
        tsReady,
        lspReady,
        diagnosticsCount: allDiagnostics.length,
      });

      return {
        success: true,
        diagnostics: allDiagnostics,
        typescript: { ready: tsReady },
        lsp: { ready: lspReady },
      };
    });
  });

  /**
   * Notify the diagnostics system about a file change
   * (used by renderer to proactively push file changes when editor saves)
   */
  ipcMain.handle('lsp:notify-file-changed', async (_event, filePath: string, changeType: 'create' | 'change' | 'delete') => {
    return withErrorGuard('lsp:notify-file-changed', async () => {
      if (!filePath) {
        return { success: false, error: 'No file path provided' };
      }

      // Forward to LSP Bridge which handles both LSP + TS diagnostics
      try {
        const { getLSPBridge } = await getLSPModuleCached();
        const bridge = getLSPBridge();
        if (bridge) {
          bridge.onFileChanged(filePath, changeType);
        }
      } catch { /* ignore */ }

      // Also directly notify TypeScript diagnostics service for faster response
      try {
        const { getTypeScriptDiagnosticsService } = await getTSModuleCached();
        const tsService = getTypeScriptDiagnosticsService();
        if (tsService?.isReady()) {
          tsService.onFileChanged(filePath, changeType);
        }
      } catch { /* ignore */ }

      return { success: true };
    });
  });
}
