/**
 * useDiagnosticsStream Hook
 * 
 * Subscribes to real-time diagnostics updates from both LSP and TypeScript services.
 * Automatically syncs diagnostics to Monaco markers for all open models.
 * 
 * This hook provides:
 * - Real-time push updates (no polling)
 * - Automatic Monaco marker synchronization
 * - Aggregated diagnostics from all sources
 * - Debounced updates for performance
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import * as monaco from 'monaco-editor';
import { useWorkspaceContext, type WorkspaceDiagnostic } from '../../../state/WorkspaceContextProvider';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('DiagnosticsStream');

// =============================================================================
// Types
// =============================================================================

export interface DiagnosticsStats {
  errorCount: number;
  warningCount: number;
  infoCount: number;
  hintCount: number;
  totalCount: number;
  filesWithIssues: number;
}

interface LSPDiagnosticsEvent {
  filePath: string;
  diagnostics: Array<{
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
    message: string;
    severity: 'error' | 'warning' | 'info' | 'hint';
    source?: string;
    code?: string | number;
  }>;
  source: 'lsp' | 'typescript';
  timestamp: number;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert severity string to Monaco MarkerSeverity
 */
function toMonacoSeverity(severity: string): monaco.MarkerSeverity {
  switch (severity) {
    case 'error':
      return monaco.MarkerSeverity.Error;
    case 'warning':
      return monaco.MarkerSeverity.Warning;
    case 'info':
      return monaco.MarkerSeverity.Info;
    case 'hint':
      return monaco.MarkerSeverity.Hint;
    default:
      return monaco.MarkerSeverity.Info;
  }
}

/**
 * Normalize file path for cross-platform compatibility
 */
function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase();
}

/**
 * Get Monaco model by file path
 */
function getModelByPath(filePath: string): monaco.editor.ITextModel | null {
  const normalized = normalizeFilePath(filePath);
  const models = monaco.editor.getModels();
  
  for (const model of models) {
    const modelPath = normalizeFilePath(model.uri.fsPath || model.uri.path);
    if (modelPath === normalized || modelPath.endsWith(normalized)) {
      return model;
    }
  }
  
  return null;
}

/**
 * Apply diagnostics to a Monaco model as markers
 */
function applyDiagnosticsToModel(
  filePath: string,
  diagnostics: WorkspaceDiagnostic[],
  source: string
): void {
  const model = getModelByPath(filePath);
  if (!model) return;

  const markers: monaco.editor.IMarkerData[] = diagnostics.map(d => ({
    severity: toMonacoSeverity(d.severity),
    message: d.message,
    startLineNumber: d.line,
    startColumn: d.column,
    endLineNumber: d.endLine || d.line,
    endColumn: d.endColumn || d.column + 1,
    source: d.source || source,
    code: d.code?.toString(),
  }));

  monaco.editor.setModelMarkers(model, source, markers);
}

// =============================================================================
// Hook Implementation
// =============================================================================

interface UseDiagnosticsStreamOptions {
  /** Whether to auto-sync diagnostics to Monaco markers */
  syncToMonaco?: boolean;
  /** Debounce delay for marker updates (ms) */
  debounceMs?: number;
}

interface UseDiagnosticsStreamReturn {
  /** All current diagnostics */
  diagnostics: WorkspaceDiagnostic[];
  /** Aggregated statistics */
  stats: DiagnosticsStats;
  /** Whether diagnostics are being loaded */
  isLoading: boolean;
  /** Manually refresh all diagnostics */
  refresh: () => Promise<void>;
  /** Force sync all diagnostics to Monaco markers */
  syncToMonaco: () => void;
}

export function useDiagnosticsStream(
  options: UseDiagnosticsStreamOptions = {}
): UseDiagnosticsStreamReturn {
  const { syncToMonaco: autoSync = true, debounceMs = 100 } = options;
  
  // Get workspace diagnostics from context
  const { state, refreshDiagnostics } = useWorkspaceContext();
  const { diagnostics, diagnosticsLoading } = state;
  
  // Track per-file diagnostics for incremental updates
  const fileDiagnosticsRef = useRef<Map<string, WorkspaceDiagnostic[]>>(new Map());
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Track last sync time for debugging (prefix with _ to satisfy lint)
  const [_lastSyncTime, setLastSyncTime] = useState(0);
  
  // Calculate stats
  const stats: DiagnosticsStats = {
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
    hintCount: 0,
    totalCount: diagnostics.length,
    filesWithIssues: 0,
  };
  
  const fileSet = new Set<string>();
  for (const d of diagnostics) {
    switch (d.severity) {
      case 'error':
        stats.errorCount++;
        break;
      case 'warning':
        stats.warningCount++;
        break;
      case 'info':
        stats.infoCount++;
        break;
      case 'hint':
        stats.hintCount++;
        break;
    }
    fileSet.add(d.filePath);
  }
  stats.filesWithIssues = fileSet.size;

  /**
   * Sync all diagnostics to Monaco markers
   */
  const performSync = useCallback(() => {
    // Group diagnostics by file
    const byFile = new Map<string, WorkspaceDiagnostic[]>();
    for (const d of diagnostics) {
      const existing = byFile.get(d.filePath) || [];
      existing.push(d);
      byFile.set(d.filePath, existing);
    }
    
    // Update markers for each file
    for (const [filePath, fileDiags] of byFile) {
      applyDiagnosticsToModel(filePath, fileDiags, 'workspace');
    }
    
    // Clear markers for files that no longer have diagnostics
    const prevFiles = fileDiagnosticsRef.current;
    for (const [prevPath] of prevFiles) {
      if (!byFile.has(prevPath)) {
        const model = getModelByPath(prevPath);
        if (model) {
          monaco.editor.setModelMarkers(model, 'workspace', []);
        }
      }
    }
    
    fileDiagnosticsRef.current = byFile;
    setLastSyncTime(Date.now());
  }, [diagnostics]);

  /**
   * Debounced sync to Monaco
   */
  const debouncedSync = useCallback(() => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = setTimeout(() => {
      performSync();
      syncTimerRef.current = null;
    }, debounceMs);
  }, [performSync, debounceMs]);

  // Subscribe to real-time LSP diagnostics updates
  useEffect(() => {
    const unsubscribeLsp = window.vyotiq?.lsp?.onDiagnosticsUpdated?.((event: LSPDiagnosticsEvent) => {
      logger.debug('Received LSP diagnostics update', {
        filePath: event.filePath,
        count: event.diagnostics.length,
        source: event.source,
      });
      
      // Apply directly to Monaco for immediate feedback
      if (autoSync) {
        const model = getModelByPath(event.filePath);
        if (model) {
          const markers: monaco.editor.IMarkerData[] = event.diagnostics.map(d => ({
            severity: toMonacoSeverity(d.severity),
            message: d.message,
            startLineNumber: d.line,
            startColumn: d.column,
            endLineNumber: d.endLine || d.line,
            endColumn: d.endColumn || d.column + 1,
            source: d.source || event.source,
            code: d.code?.toString(),
          }));
          monaco.editor.setModelMarkers(model, 'lsp', markers);
        }
      }
    });

    return () => {
      unsubscribeLsp?.();
    };
  }, [autoSync]);

  // Subscribe to file-specific diagnostics updates
  useEffect(() => {
    const unsubscribeFile = window.vyotiq?.workspace?.onFileDiagnosticsChange?.((event) => {
      logger.debug('Received file diagnostics update', {
        filePath: event.filePath,
        count: event.diagnostics?.length ?? 0,
      });
      
      // Apply directly to Monaco for immediate feedback
      if (autoSync && event.filePath && event.diagnostics) {
        const model = getModelByPath(event.filePath);
        if (model) {
          const markers: monaco.editor.IMarkerData[] = event.diagnostics.map((d: WorkspaceDiagnostic) => ({
            severity: toMonacoSeverity(d.severity),
            message: d.message,
            startLineNumber: d.line,
            startColumn: d.column,
            endLineNumber: d.endLine || d.line,
            endColumn: d.endColumn || d.column + 1,
            source: d.source || 'typescript',
            code: d.code?.toString(),
          }));
          monaco.editor.setModelMarkers(model, 'typescript', markers);
        }
      }
    });

    return () => {
      unsubscribeFile?.();
    };
  }, [autoSync]);

  // Sync diagnostics to Monaco when they change
  useEffect(() => {
    if (autoSync && diagnostics.length > 0) {
      debouncedSync();
    }
  }, [diagnostics, autoSync, debouncedSync]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
    };
  }, []);

  return {
    diagnostics,
    stats,
    isLoading: diagnosticsLoading,
    refresh: refreshDiagnostics,
    syncToMonaco: performSync,
  };
}

export default useDiagnosticsStream;
