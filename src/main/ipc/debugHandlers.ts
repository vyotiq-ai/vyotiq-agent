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
import type { ToolHistoryEntry, QueuedMessage } from '../agent/debugging/StateInspector';

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
  // Breakpoint Management
  // ==========================================================================

  ipcMain.handle('debug:set-breakpoint', async (_event, sessionId: string, breakpoint: {
    type: 'tool' | 'error' | 'condition';
    enabled: boolean;
    toolName?: string;
    condition?: string;
  }) => {
    try {
      const { getBreakpointManager } = await import('../agent/debugging');
      const manager = getBreakpointManager();
      
      // Map frontend breakpoint types to backend types
      const typeMap: Record<string, 'on-tool-call' | 'on-error' | 'conditional'> = {
        'tool': 'on-tool-call',
        'error': 'on-error',
        'condition': 'conditional',
      };
      
      const bp = manager.setBreakpoint(typeMap[breakpoint.type] || 'on-error', {
        enabled: breakpoint.enabled,
        toolFilter: breakpoint.toolName ? [breakpoint.toolName] : undefined,
        description: breakpoint.condition,
      });
      
      return { 
        success: true, 
        breakpoint: {
          id: bp.id,
          type: breakpoint.type,
          enabled: bp.enabled,
          toolName: breakpoint.toolName,
          condition: breakpoint.condition,
        }
      };
    } catch (error) {
      logger.error('Failed to set breakpoint', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('debug:get-breakpoints', async (_event, _sessionId: string) => {
    try {
      const { getBreakpointManager } = await import('../agent/debugging');
      const manager = getBreakpointManager();
      const breakpoints = manager.getBreakpoints();
      
      // Map backend breakpoints to frontend format
      return breakpoints.map(bp => ({
        id: bp.id,
        type: bp.type === 'on-tool-call' ? 'tool' : bp.type === 'on-error' ? 'error' : 'condition',
        enabled: bp.enabled,
        toolName: bp.toolFilter?.[0],
        condition: bp.description,
      }));
    } catch (error) {
      logger.error('Failed to get breakpoints', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  ipcMain.handle('debug:remove-breakpoint', async (_event, breakpointId: string) => {
    try {
      const { getBreakpointManager } = await import('../agent/debugging');
      const manager = getBreakpointManager();
      const removed = manager.removeBreakpoint(breakpointId);
      return { success: removed };
    } catch (error) {
      logger.error('Failed to remove breakpoint', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('debug:toggle-breakpoint', async (_event, breakpointId: string) => {
    try {
      const { getBreakpointManager } = await import('../agent/debugging');
      const manager = getBreakpointManager();
      const enabled = manager.toggleBreakpoint(breakpointId);
      return { success: true, enabled };
    } catch (error) {
      logger.error('Failed to toggle breakpoint', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('debug:clear-breakpoints', async () => {
    try {
      const { getBreakpointManager } = await import('../agent/debugging');
      const manager = getBreakpointManager();
      manager.clearBreakpoints();
      return { success: true };
    } catch (error) {
      logger.error('Failed to clear breakpoints', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  // ==========================================================================
  // State Inspection
  // ==========================================================================

  ipcMain.handle('debug:get-session-state', async (_event, sessionId: string) => {
    try {
      const { getStateInspector } = await import('../agent/debugging');
      const inspector = getStateInspector();
      const state = inspector.getAgentState(sessionId);
      
      if (!state) {
        // Return default state structure when no state is captured yet
        return {
          context: {
            maxTokens: 200000,
            usedTokens: 0,
            utilization: '0%',
            messageCount: 0,
            systemPromptTokens: 0,
            toolResultTokens: 0,
          },
          messages: {
            pending: 0,
            processing: 0,
            completed: 0,
            lastMessageAt: null,
          },
          tools: {
            totalCalls: 0,
            successRate: '0%',
            avgDuration: '0ms',
            mostUsed: 'none',
            lastTool: null,
          },
          resources: {
            memoryMb: 0,
            cpuPercent: 0,
            activeConnections: 0,
            cacheHitRate: '0%',
            pendingRequests: 0,
          },
        };
      }
      
      // Transform state to frontend format
      const toolHistory: ToolHistoryEntry[] = state.toolHistory || [];
      const successfulTools = toolHistory.filter((t: ToolHistoryEntry) => t.success).length;
      const toolDurations = toolHistory.filter((t: ToolHistoryEntry) => t.durationMs).map((t: ToolHistoryEntry) => t.durationMs!);
      const avgDuration = toolDurations.length > 0 
        ? Math.round(toolDurations.reduce((a: number, b: number) => a + b, 0) / toolDurations.length)
        : 0;
      
      // Count tool usage
      const toolUsage: Record<string, number> = {};
      for (const t of toolHistory) {
        toolUsage[t.toolName] = (toolUsage[t.toolName] || 0) + 1;
      }
      const mostUsedTool = Object.entries(toolUsage).sort((a, b) => b[1] - a[1])[0];
      
      // Message queue processing
      const messageQueue: QueuedMessage[] = state.messageQueue || [];
      
      return {
        context: {
          maxTokens: 200000,
          usedTokens: 0, // Would need to get from context manager
          utilization: '0%',
          messageCount: messageQueue.length,
          systemPromptTokens: 0,
          toolResultTokens: 0,
        },
        messages: {
          pending: messageQueue.filter((m: QueuedMessage) => m.status === 'pending').length,
          processing: messageQueue.filter((m: QueuedMessage) => m.status === 'processing').length,
          completed: messageQueue.filter((m: QueuedMessage) => m.status === 'delivered').length,
          lastMessageAt: messageQueue[messageQueue.length - 1]?.enqueuedAt || null,
        },
        tools: {
          totalCalls: toolHistory.length,
          successRate: toolHistory.length > 0 
            ? `${Math.round((successfulTools / toolHistory.length) * 100)}%`
            : '0%',
          avgDuration: `${avgDuration}ms`,
          mostUsed: mostUsedTool ? `${mostUsedTool[0]} (${mostUsedTool[1]} calls)` : 'none',
          lastTool: toolHistory[toolHistory.length - 1]?.toolName || null,
        },
        resources: {
          memoryMb: state.resourceUsage?.memoryMb ?? Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          cpuPercent: state.resourceUsage?.cpuPercent || 0,
          activeConnections: state.resourceUsage?.activeConnections || 0,
          cacheHitRate: '0%', // Would need to get from cache manager
          pendingRequests: state.resourceUsage?.pendingOperations || 0,
        },
      };
    } catch (error) {
      logger.error('Failed to get session state', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });

  ipcMain.handle('debug:take-state-snapshot', async (_event, sessionId: string) => {
    try {
      const { getStateInspector } = await import('../agent/debugging');
      const inspector = getStateInspector();
      const snapshot = inspector.takeSnapshot(sessionId, 'manual');
      return { success: true, snapshotId: snapshot?.id };
    } catch (error) {
      logger.error('Failed to take state snapshot', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('debug:get-state-snapshots', async (_event, sessionId: string) => {
    try {
      const { getStateInspector } = await import('../agent/debugging');
      const inspector = getStateInspector();
      return inspector.getSnapshots(sessionId);
    } catch (error) {
      logger.error('Failed to get state snapshots', { error: error instanceof Error ? error.message : String(error) });
      return [];
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

  // ==========================================================================
  // Throttle Control Status (for debugging background throttling behavior)
  // ==========================================================================

  ipcMain.handle('debug:get-throttle-status', () => {
    try {
      const { getThrottleStatus } = require('./eventBatcher');
      return getThrottleStatus();
    } catch (error) {
      logger.error('Failed to get throttle status', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });

  ipcMain.handle('debug:get-batcher-stats', () => {
    try {
      const { getBatcherStats } = require('./eventBatcher');
      return getBatcherStats();
    } catch (error) {
      logger.error('Failed to get batcher stats', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });
}
