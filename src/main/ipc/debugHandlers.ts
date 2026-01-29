/**
 * Debug IPC Handlers
 * 
 * Handles all debug-related IPC operations including:
 * - Debug traces
 * - Undo history
 * - Debug configuration
 */

import { ipcMain, dialog } from 'electron';
import { promises as fs } from 'node:fs';
import { createLogger } from '../logger';
import type { IpcContext } from './types';

const logger = createLogger('IPC:Debug');

export function registerDebugHandlers(context: IpcContext): void {
  const { getOrchestrator, getMainWindow } = context;

  // ==========================================================================
  // Debug Traces
  // ==========================================================================

  ipcMain.handle('debug:get-traces', (_event, sessionId: string) => {
    try {
      return getOrchestrator()?.getDebugTracesForSession(sessionId) ?? [];
    } catch (error) {
      logger.error('Failed to get debug traces', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  ipcMain.handle('debug:get-active-trace', () => {
    try {
      return getOrchestrator()?.getActiveDebugTrace() ?? null;
    } catch (error) {
      logger.error('Failed to get active debug trace', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });

  ipcMain.handle('debug:get-trace', (_event, traceId: string) => {
    try {
      return getOrchestrator()?.getTrace(traceId) ?? null;
    } catch (error) {
      logger.error('Failed to get trace', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });

  ipcMain.handle('debug:set-enabled', (_event, enabled: boolean) => {
    try {
      getOrchestrator()?.setDebugEnabled(enabled);
      return { success: true };
    } catch (error) {
      logger.error('Failed to set debug enabled', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('debug:export-trace', (_event, traceId: string, format: 'json' | 'markdown' | 'html' = 'json') => {
    try {
      const exported = getOrchestrator()?.exportTrace(traceId, format);
      return { success: true, content: exported };
    } catch (error) {
      logger.error('Failed to export trace', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('debug:update-config', (_event, config: {
    verbose?: boolean;
    captureFullPayloads?: boolean;
    stepMode?: boolean;
    exportOnError?: boolean;
    exportFormat?: 'json' | 'markdown';
  }) => {
    try {
      getOrchestrator()?.updateDebugConfig(config);
      return { success: true };
    } catch (error) {
      logger.error('Failed to update debug config', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('debug:clear-traces', (_event, sessionId: string) => {
    try {
      getOrchestrator()?.clearTracesForSession(sessionId);
      return { success: true };
    } catch (error) {
      logger.error('Failed to clear traces', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('debug:save-trace-to-file', async (_event, traceId: string, format: 'json' | 'markdown' = 'json') => {
    try {
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        return { success: false, error: 'No main window available' };
      }

      const exported = getOrchestrator()?.exportTrace(traceId, format);
      if (!exported) {
        return { success: false, error: 'Failed to export trace' };
      }

      const extension = format === 'markdown' ? 'md' : 'json';
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Trace',
        defaultPath: `trace-${traceId.slice(0, 8)}.${extension}`,
        filters: [
          { name: format === 'markdown' ? 'Markdown' : 'JSON', extensions: [extension] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Save cancelled' };
      }

      await fs.writeFile(result.filePath, exported, 'utf-8');
      return { success: true, path: result.filePath };
    } catch (error) {
      logger.error('Failed to save trace to file', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('debug:get-all-traces', () => {
    try {
      return getOrchestrator()?.getAllTraces() ?? [];
    } catch (error) {
      logger.error('Failed to get all traces', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  ipcMain.handle('debug:get-debug-config', () => {
    try {
      return getOrchestrator()?.getDebugConfig() ?? null;
    } catch (error) {
      logger.error('Failed to get debug config', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });

  // ==========================================================================
  // Undo History
  // ==========================================================================

  ipcMain.handle('undo:get-history', async (_event, sessionId: string) => {
    try {
      const { undoHistory } = await import('../agent/undoHistory');
      return await undoHistory.getSessionHistory(sessionId);
    } catch (error) {
      logger.error('Failed to get undo history', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  ipcMain.handle('undo:get-grouped-history', async (_event, sessionId: string) => {
    try {
      const { undoHistory } = await import('../agent/undoHistory');
      return await undoHistory.getGroupedHistory(sessionId);
    } catch (error) {
      logger.error('Failed to get grouped undo history', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  ipcMain.handle('undo:undo-change', async (_event, sessionId: string, changeId: string) => {
    try {
      const { undoHistory } = await import('../agent/undoHistory');
      return await undoHistory.undoChange(sessionId, changeId);
    } catch (error) {
      logger.error('Failed to undo change', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, message: (error as Error).message };
    }
  });

  ipcMain.handle('undo:redo-change', async (_event, sessionId: string, changeId: string) => {
    try {
      const { undoHistory } = await import('../agent/undoHistory');
      return await undoHistory.redoChange(sessionId, changeId);
    } catch (error) {
      logger.error('Failed to redo change', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, message: (error as Error).message };
    }
  });

  ipcMain.handle('undo:undo-run', async (_event, sessionId: string, runId: string) => {
    try {
      const { undoHistory } = await import('../agent/undoHistory');
      return await undoHistory.undoRun(sessionId, runId);
    } catch (error) {
      logger.error('Failed to undo run', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, message: (error as Error).message, count: 0 };
    }
  });

  ipcMain.handle('undo:get-undoable-count', async (_event, sessionId: string) => {
    try {
      const { undoHistory } = await import('../agent/undoHistory');
      return await undoHistory.getUndoableCount(sessionId);
    } catch (error) {
      logger.error('Failed to get undoable count', { error: error instanceof Error ? error.message : String(error) });
      return 0;
    }
  });

  ipcMain.handle('undo:clear-history', async (_event, sessionId: string) => {
    try {
      const { undoHistory } = await import('../agent/undoHistory');
      await undoHistory.clearSessionHistory(sessionId);
      return { success: true };
    } catch (error) {
      logger.error('Failed to clear undo history', { error: error instanceof Error ? error.message : String(error) });
      return { success: false };
    }
  });
}
