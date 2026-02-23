/**
 * useDiagnostics Hook
 * 
 * Manages workspace-wide diagnostics by aggregating both LSP and TypeScript
 * diagnostics sources. Subscribes to real-time updates from:
 * - LSP servers (per-file diagnostics via textDocument/publishDiagnostics)
 * - TypeScript Diagnostics Service (workspace-wide snapshots)
 * - Per-file TypeScript diagnostics updates
 * 
 * The main process `lsp:diagnostics` and `lsp:refresh-diagnostics` handlers
 * now merge and deduplicate diagnostics from all sources (LSP cache + TS service),
 * so a single IPC call returns workspace-wide results.
 * 
 * Real-time subscriptions incrementally patch the local state as files change.
 * 
 * Key features for VS Code-like behaviour:
 * - Real-time event subscriptions are ALWAYS active (not just when tab is visible)
 * - Periodic polling ensures stale data is refreshed
 * - Workspace change triggers full re-initialization of diagnostics services
 * - File change events are forwarded to diagnostics system
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('useDiagnostics');

// =============================================================================
// Constants
// =============================================================================

/** Interval for periodic background refresh (ms) */
const POLL_INTERVAL_MS = 30_000;

/** Delay before fetching diagnostics after workspace change (ms) */
const WORKSPACE_CHANGE_DELAY_MS = 2_000;

// =============================================================================
// Types
// =============================================================================

export interface DiagnosticItem {
  filePath: string;
  fileName?: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  source?: string;
  code?: string | number;
}

export interface DiagnosticCounts {
  errors: number;
  warnings: number;
  infos: number;
}

export interface UseDiagnosticsResult {
  diagnostics: DiagnosticItem[];
  isLoading: boolean;
  counts: DiagnosticCounts;
  refresh: () => Promise<void>;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Normalize a raw diagnostic (from LSP or TypeScript) into a DiagnosticItem.
 */
function normalizeDiagnostic(raw: Record<string, unknown>): DiagnosticItem | null {
  const message = raw.message as string;
  if (!message) return null;

  const filePath = (raw.filePath as string) || '';
  const severity = (raw.severity as DiagnosticItem['severity']) || 'info';

  return {
    filePath,
    fileName: (raw.fileName as string) || filePath.split(/[\\/]/).pop() || '',
    line: (raw.line as number) ?? 1,
    column: (raw.column as number) ?? 1,
    endLine: raw.endLine as number | undefined,
    endColumn: raw.endColumn as number | undefined,
    message,
    severity,
    source: (raw.source as string) || undefined,
    code: raw.code as string | number | undefined,
  };
}

/**
 * Generate a unique key for deduplication.
 */
function diagnosticKey(d: DiagnosticItem): string {
  return `${d.filePath}:${d.line}:${d.column}:${d.severity}:${d.message}`;
}

/**
 * Merge diagnostics, replacing all entries for a given file when an update arrives.
 */
function patchDiagnosticsForFile(
  existing: DiagnosticItem[],
  filePath: string,
  incoming: DiagnosticItem[],
): DiagnosticItem[] {
  const otherFiles = existing.filter(d => d.filePath !== filePath);
  return [...otherFiles, ...incoming];
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook that manages workspace-wide diagnostics from all sources.
 * 
 * Real-time subscriptions are ALWAYS active regardless of `enabled`.
 * When `enabled` is true, it also performs an initial fetch and periodic polling.
 * When `enabled` is false, it still accumulates realtime diagnostics in background.
 * 
 * @param enabled - When true, performs initial fetch and periodic polling
 * @param workspacePath - Current workspace path. Changes trigger re-initialization.
 */
export function useDiagnostics(enabled: boolean, workspacePath?: string | null): UseDiagnosticsResult {
  // Single source of truth — merged diagnostics from the IPC response
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastWorkspaceRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // -------------------------------------------------------------------------
  // Fetch all workspace diagnostics from the main process.
  // `lsp:diagnostics` (no filePath) now returns merged LSP + TS diagnostics.
  // -------------------------------------------------------------------------
  const fetchAllDiagnostics = useCallback(async () => {
    const lsp = window.vyotiq?.lsp;
    if (!lsp?.diagnostics) return;

    try {
      const result = await lsp.diagnostics();
      if (!mountedRef.current) return;

      if (result.success && result.diagnostics) {
        const items = (result.diagnostics as Record<string, unknown>[])
          .map(normalizeDiagnostic)
          .filter((d): d is DiagnosticItem => d !== null);
        setDiagnostics(items);
      }
    } catch (err) {
      logger.debug('Failed to fetch all diagnostics', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  // -------------------------------------------------------------------------
  // Full refresh — triggers TS service `refreshAll()` and returns merged data.
  // -------------------------------------------------------------------------
  const fullRefresh = useCallback(async () => {
    const lsp = window.vyotiq?.lsp;
    if (!lsp?.refreshDiagnostics) {
      // Fallback to regular fetch if refreshDiagnostics not available
      await fetchAllDiagnostics();
      return;
    }

    try {
      const result = await lsp.refreshDiagnostics();
      if (!mountedRef.current) return;

      if (result.success && result.diagnostics) {
        // Use the merged diagnostics returned directly from the refresh call
        const items = (result.diagnostics as Record<string, unknown>[])
          .map(normalizeDiagnostic)
          .filter((d): d is DiagnosticItem => d !== null);
        setDiagnostics(items);
      } else {
        // Refresh didn't return diagnostics — fallback to fetch
        await fetchAllDiagnostics();
      }
    } catch (err) {
      logger.debug('Failed to refresh diagnostics', {
        error: err instanceof Error ? err.message : String(err),
      });
      // Fallback
      await fetchAllDiagnostics();
    }
  }, [fetchAllDiagnostics]);

  // -------------------------------------------------------------------------
  // Public refresh
  // -------------------------------------------------------------------------
  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      await fullRefresh();
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [fullRefresh]);

  // -------------------------------------------------------------------------
  // Workspace change: re-initialize diagnostics services
  // -------------------------------------------------------------------------
  useEffect(() => {
    // Skip if no workspace or workspace hasn't changed
    if (!workspacePath || workspacePath === lastWorkspaceRef.current) return;
    lastWorkspaceRef.current = workspacePath;

    const lsp = window.vyotiq?.lsp;
    if (!lsp?.initializeWorkspaceDiagnostics) return;

    // Clear existing diagnostics when workspace changes
    setDiagnostics([]);

    // Delay to allow workspace to settle (e.g., after npm install)
    const timer = setTimeout(async () => {
      if (!mountedRef.current) return;

      logger.debug('Initializing diagnostics for workspace', { workspacePath });
      setIsLoading(true);

      try {
        const result = await lsp.initializeWorkspaceDiagnostics(workspacePath);
        if (!mountedRef.current) return;

        if (result.success && result.diagnostics) {
          const items = (result.diagnostics as Record<string, unknown>[])
            .map(normalizeDiagnostic)
            .filter((d): d is DiagnosticItem => d !== null);
          setDiagnostics(items);
        }

        logger.debug('Workspace diagnostics initialized', {
          ts: result.typescript?.ready,
          lsp: result.lsp?.ready,
          count: result.diagnostics?.length ?? 0,
        });
      } catch (err) {
        logger.debug('Failed to initialize workspace diagnostics', {
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    }, WORKSPACE_CHANGE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [workspacePath]);

  // -------------------------------------------------------------------------
  // Real-time subscriptions — ALWAYS active for background accumulation.
  // These incrementally patch local state as files change.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const lsp = window.vyotiq?.lsp;
    if (!lsp) return;

    const unsubs: Array<() => void> = [];

    // 1. Per-file LSP diagnostics (textDocument/publishDiagnostics from lang servers)
    if (lsp.onDiagnosticsUpdated) {
      const unsub = lsp.onDiagnosticsUpdated((event) => {
        if (!mountedRef.current) return;

        const newItems = (event.diagnostics as Record<string, unknown>[])
          .map(raw => normalizeDiagnostic({ ...raw, filePath: (raw as Record<string, unknown>).filePath || event.filePath }))
          .filter((d): d is DiagnosticItem => d !== null);

        setDiagnostics(prev => patchDiagnosticsForFile(prev, event.filePath, newItems));
      });
      unsubs.push(unsub);
    }

    // 2. Workspace-wide TypeScript diagnostics snapshot
    //    Replaces ALL TS diagnostics at once when the service does a full scan.
    if (lsp.onDiagnosticsSnapshot) {
      const unsub = lsp.onDiagnosticsSnapshot((event) => {
        if (!mountedRef.current) return;

        const tsItems = (event.diagnostics as Record<string, unknown>[])
          .map(normalizeDiagnostic)
          .filter((d): d is DiagnosticItem => d !== null);

        // Replace: remove all existing TS-sourced diagnostics, add new snapshot
        setDiagnostics(prev => {
          const nonTs = prev.filter(d => d.source !== 'typescript');

          // Deduplicate the merged result
          const seen = new Set<string>();
          const merged: DiagnosticItem[] = [];
          for (const d of [...nonTs, ...tsItems]) {
            const key = diagnosticKey(d);
            if (!seen.has(key)) {
              seen.add(key);
              merged.push(d);
            }
          }
          return merged;
        });
      });
      unsubs.push(unsub);
    }

    // 3. Per-file TypeScript diagnostics incremental updates
    if (lsp.onFileDiagnosticsUpdated) {
      const unsub = lsp.onFileDiagnosticsUpdated((event) => {
        if (!mountedRef.current) return;

        const newItems = (event.diagnostics as Record<string, unknown>[])
          .map(raw => normalizeDiagnostic({ ...raw, filePath: (raw as Record<string, unknown>).filePath || event.filePath }))
          .filter((d): d is DiagnosticItem => d !== null);

        setDiagnostics(prev => patchDiagnosticsForFile(prev, event.filePath, newItems));
      });
      unsubs.push(unsub);
    }

    // 4. Diagnostics cleared (workspace closed, etc.)
    if (lsp.onDiagnosticsCleared) {
      const unsub = lsp.onDiagnosticsCleared(() => {
        if (!mountedRef.current) return;
        setDiagnostics([]);
      });
      unsubs.push(unsub);
    }

    return () => {
      for (const unsub of unsubs) {
        try { unsub(); } catch { /* ignore */ }
      }
    };
  }, []); // No deps — subscriptions are stable and always active

  // -------------------------------------------------------------------------
  // Initial fetch + periodic polling when enabled
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!enabled) {
      // Clear poll timer when disabled
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    const lsp = window.vyotiq?.lsp;
    if (!lsp) return;

    // Kick off initial load
    setIsLoading(true);
    fullRefresh().finally(() => {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    });

    // Periodic polling to catch any missed updates
    pollTimerRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      // Silent background refresh — don't set isLoading to avoid UI flicker
      fetchAllDiagnostics().catch(() => { /* ignore background refresh errors */ });
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [enabled, fullRefresh, fetchAllDiagnostics]);

  // -------------------------------------------------------------------------
  // Listen for file change events from preload and notify diagnostics system
  // -------------------------------------------------------------------------
  useEffect(() => {
    const files = window.vyotiq?.files;
    const lsp = window.vyotiq?.lsp;
    if (!files?.onFileChange || !lsp?.notifyFileChanged) return;

    const unsub = files.onFileChange((event) => {
      if (!event?.path) return;

      // Map the file change event type to diagnostics-compatible change type
      const changeType = event.type === 'delete' ? 'delete'
        : event.type === 'create' || event.type === 'createDir' ? 'create'
        : 'change';

      lsp.notifyFileChanged(event.path, changeType).catch(() => { /* ignore */ });
    });

    return () => { unsub(); };
  }, []);

  // -------------------------------------------------------------------------
  // Derived counts
  // -------------------------------------------------------------------------
  const counts: DiagnosticCounts = useMemo(() => ({
    errors: diagnostics.filter(d => d.severity === 'error').length,
    warnings: diagnostics.filter(d => d.severity === 'warning').length,
    infos: diagnostics.filter(d => d.severity === 'info' || d.severity === 'hint').length,
  }), [diagnostics]);

  return {
    diagnostics,
    isLoading,
    counts,
    refresh,
  };
}
