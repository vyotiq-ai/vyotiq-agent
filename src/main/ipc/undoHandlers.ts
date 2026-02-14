/**
 * Undo History IPC Handlers
 *
 * Handles all undo/redo operations for agent sessions including:
 * - Get history / grouped history
 * - Undo / redo individual changes
 * - Undo entire runs
 * - Get undoable count
 * - Clear history
 */

import { ipcMain } from 'electron';
import { createLogger } from '../logger';

const logger = createLogger('IPC:Undo');

export function registerUndoHandlers(): void {
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
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('undo:redo-change', async (_event, sessionId: string, changeId: string) => {
    try {
      const { undoHistory } = await import('../agent/undoHistory');
      return await undoHistory.redoChange(sessionId, changeId);
    } catch (error) {
      logger.error('Failed to redo change', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('undo:undo-run', async (_event, sessionId: string, runId: string) => {
    try {
      const { undoHistory } = await import('../agent/undoHistory');
      return await undoHistory.undoRun(sessionId, runId);
    } catch (error) {
      logger.error('Failed to undo run', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message, count: 0 };
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
