/**
 * Undo History Hook
 * 
 * Custom hook for managing undo history state and operations.
 */
import { useCallback, useEffect, useState } from 'react';
import type { FileChange, RunChangeGroup, UndoResult, UndoRunResult } from './types';
import { createLogger } from '../../utils/logger';

const logger = createLogger('useUndoHistory');

interface UseUndoHistoryOptions {
  sessionId: string | null;
  refreshInterval?: number;
}

interface UseUndoHistoryReturn {
  history: FileChange[];
  groupedHistory: RunChangeGroup[];
  undoableCount: number;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  undoChange: (changeId: string) => Promise<UndoResult>;
  redoChange: (changeId: string) => Promise<UndoResult>;
  undoRun: (runId: string) => Promise<UndoRunResult>;
  clearHistory: () => Promise<void>;
  undoLastChange: () => Promise<UndoResult | null>;
  undoAllSession: () => Promise<UndoRunResult>;
}

export function useUndoHistory({
  sessionId,
  refreshInterval = 0,
}: UseUndoHistoryOptions): UseUndoHistoryReturn {
  const [history, setHistory] = useState<FileChange[]>([]);
  const [groupedHistory, setGroupedHistory] = useState<RunChangeGroup[]>([]);
  const [undoableCount, setUndoableCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setHistory([]);
      setGroupedHistory([]);
      setUndoableCount(0);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [historyData, groupedData, count] = await Promise.all([
        window.vyotiq?.undo?.getHistory(sessionId),
        window.vyotiq?.undo?.getGroupedHistory(sessionId),
        window.vyotiq?.undo?.getUndoableCount(sessionId),
      ]);

      setHistory((historyData as unknown as FileChange[]) || []);
      setGroupedHistory((groupedData as unknown as RunChangeGroup[]) || []);
      setUndoableCount((count as number) || 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load undo history';
      logger.error('Failed to load undo history', { sessionId, error: message });
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (refreshInterval <= 0 || !sessionId) return;
    const interval = setInterval(() => void refresh(), refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval, sessionId, refresh]);

  const undoChange = useCallback(async (changeId: string): Promise<UndoResult> => {
    if (!sessionId) return { success: false, message: 'No session selected' };
    try {
      const result = await window.vyotiq?.undo?.undoChange(sessionId, changeId);
      if (result?.success) await refresh();
      return result || { success: false, message: 'Unknown error' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to undo change';
      logger.error('Failed to undo change', { sessionId, changeId, error: message });
      return { success: false, message };
    }
  }, [sessionId, refresh]);

  const redoChange = useCallback(async (changeId: string): Promise<UndoResult> => {
    if (!sessionId) return { success: false, message: 'No session selected' };
    try {
      const result = await window.vyotiq?.undo?.redoChange(sessionId, changeId);
      if (result?.success) await refresh();
      return result || { success: false, message: 'Unknown error' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to redo change';
      logger.error('Failed to redo change', { sessionId, changeId, error: message });
      return { success: false, message };
    }
  }, [sessionId, refresh]);

  const undoRun = useCallback(async (runId: string): Promise<UndoRunResult> => {
    if (!sessionId) return { success: false, message: 'No session selected', count: 0, results: [] };
    try {
      const result = await window.vyotiq?.undo?.undoRun(sessionId, runId) as UndoRunResult | undefined;
      if (result?.success || (result?.count && result.count > 0)) await refresh();
      return result || { success: false, message: 'Unknown error', count: 0, results: [] };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to undo run';
      logger.error('Failed to undo run', { sessionId, runId, error: message });
      return { success: false, message, count: 0, results: [] };
    }
  }, [sessionId, refresh]);

  const clearHistory = useCallback(async (): Promise<void> => {
    if (!sessionId) return;
    try {
      await window.vyotiq?.undo?.clearHistory(sessionId);
      setHistory([]);
      setGroupedHistory([]);
      setUndoableCount(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to clear history';
      logger.error('Failed to clear history', { sessionId, error: message });
      setError(message);
    }
  }, [sessionId]);

  // Undo the most recent undoable change
  const undoLastChange = useCallback(async (): Promise<UndoResult | null> => {
    if (!sessionId || history.length === 0) return null;
    const lastUndoable = history.find(c => c.status === 'undoable');
    if (!lastUndoable) return null;
    return undoChange(lastUndoable.id);
  }, [sessionId, history, undoChange]);

  // Undo all changes in the session
  const undoAllSession = useCallback(async (): Promise<UndoRunResult> => {
    if (!sessionId) return { success: false, message: 'No session selected', count: 0, results: [] };
    
    const undoableChanges = history.filter(c => c.status === 'undoable');
    if (undoableChanges.length === 0) {
      return { success: true, message: 'No changes to undo', count: 0, results: [] };
    }

    const results: UndoResult[] = [];
    let successCount = 0;

    // Undo in reverse order (newest first)
    for (const change of undoableChanges) {
      try {
        const result = await window.vyotiq?.undo?.undoChange(sessionId, change.id);
        if (result) {
          results.push(result);
          if (result.success) successCount++;
        }
      } catch (err) {
        results.push({ success: false, message: err instanceof Error ? err.message : 'Failed' });
      }
    }

    await refresh();

    return {
      success: successCount === undoableChanges.length,
      message: `Undid ${successCount} of ${undoableChanges.length} changes`,
      count: successCount,
      results,
    };
  }, [sessionId, history, refresh]);

  return {
    history,
    groupedHistory,
    undoableCount,
    isLoading,
    error,
    refresh,
    undoChange,
    redoChange,
    undoRun,
    clearHistory,
    undoLastChange,
    undoAllSession,
  };
}

export default useUndoHistory;
