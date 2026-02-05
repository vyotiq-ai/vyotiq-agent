/**
 * ProblemsPanel Component
 * 
 * VS Code-style problems panel showing errors and warnings from both:
 * - Monaco markers (for open files)
 * - Workspace diagnostics (TypeScript service + LSP for all files)
 * 
 * Provides real-time updates via push events, no polling required.
 */

import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import * as monaco from 'monaco-editor';
import { 
  AlertCircle, 
  AlertTriangle, 
  Info,
  ChevronRight,
  ChevronDown,
  X,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { getFileIcon } from '../../fileTree/utils/fileIcons';
import { useWorkspaceContext } from '../../../state/WorkspaceContextProvider';

export interface Problem {
  file: string;
  fileName: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  source?: string;
  code?: string | number;
}

interface FileProblems {
  file: string;
  fileName: string;
  problems: Problem[];
  errorCount: number;
  warningCount: number;
}

interface ProblemsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onProblemClick: (problem: Problem) => void;
  className?: string;
}

const severityIcons: Record<Problem['severity'], React.ElementType> = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  hint: Info,
};

const severityColors: Record<Problem['severity'], string> = {
  error: 'text-[var(--color-error)]',
  warning: 'text-[var(--color-warning)]',
  info: 'text-[var(--color-info)]',
  hint: 'text-[var(--color-text-muted)]',
};

/**
 * Convert Monaco marker severity to our severity type
 */
function markerSeverityToType(severity: monaco.MarkerSeverity): Problem['severity'] {
  switch (severity) {
    case monaco.MarkerSeverity.Error:
      return 'error';
    case monaco.MarkerSeverity.Warning:
      return 'warning';
    case monaco.MarkerSeverity.Info:
      return 'info';
    case monaco.MarkerSeverity.Hint:
      return 'hint';
    default:
      return 'info';
  }
}

/**
 * Get file name from path
 */
function getFileName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || filePath;
}

/**
 * Normalize file path for comparison
 */
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase();
}

/**
 * Create a unique key for deduplication
 */
function problemKey(p: Problem): string {
  return `${normalizePath(p.file)}:${p.line}:${p.column}:${p.message}`;
}

export const ProblemsPanel: React.FC<ProblemsPanelProps> = memo(({
  isOpen,
  onClose,
  onProblemClick,
  className,
}) => {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [filterSeverity, setFilterSeverity] = useState<Problem['severity'] | 'all'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Get workspace diagnostics from context (real-time updates)
  const { state: workspaceState, refreshDiagnostics } = useWorkspaceContext();
  const { diagnostics: workspaceDiagnostics, diagnosticsLoading } = workspaceState;

  /**
   * Merge Monaco markers with workspace diagnostics
   * Monaco markers take priority for open files (more up-to-date)
   * Workspace diagnostics provide coverage for closed files
   */
  const mergeProblems = useCallback(() => {
    const problemMap = new Map<string, Problem>();
    
    // First, add workspace diagnostics (all files including closed)
    for (const diag of workspaceDiagnostics) {
      const problem: Problem = {
        file: diag.filePath,
        fileName: diag.fileName || getFileName(diag.filePath),
        line: diag.line,
        column: diag.column,
        endLine: diag.endLine,
        endColumn: diag.endColumn,
        message: diag.message,
        severity: diag.severity,
        source: diag.source,
        code: diag.code,
      };
      problemMap.set(problemKey(problem), problem);
    }
    
    // Then, add/override with Monaco markers (most current for open files)
    const models = monaco.editor.getModels();
    for (const model of models) {
      const markers = monaco.editor.getModelMarkers({ resource: model.uri });
      
      for (const marker of markers) {
        const problem: Problem = {
          file: model.uri.fsPath || model.uri.path,
          fileName: getFileName(model.uri.path),
          line: marker.startLineNumber,
          column: marker.startColumn,
          endLine: marker.endLineNumber,
          endColumn: marker.endColumn,
          message: marker.message,
          severity: markerSeverityToType(marker.severity),
          source: marker.source,
          code: marker.code?.toString(),
        };
        // Monaco markers override workspace diagnostics for the same issue
        problemMap.set(problemKey(problem), problem);
      }
    }

    // Convert to array and sort
    const allProblems = Array.from(problemMap.values());
    
    // Sort by severity (errors first), then by file, then by line
    allProblems.sort((a, b) => {
      const severityOrder = { error: 0, warning: 1, info: 2, hint: 3 };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      
      const fileDiff = a.file.localeCompare(b.file);
      if (fileDiff !== 0) return fileDiff;
      
      return a.line - b.line;
    });

    setProblems(allProblems);
    
    // Auto-expand files with errors
    const filesWithErrors = new Set(
      allProblems.filter(p => p.severity === 'error').map(p => p.file)
    );
    setExpandedFiles(prev => new Set([...prev, ...filesWithErrors]));
  }, [workspaceDiagnostics]);

  /**
   * Manual refresh - fetches latest diagnostics from backend
   */
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshDiagnostics();
      // Also trigger Monaco marker refresh
      mergeProblems();
    } finally {
      // Small delay for visual feedback
      setTimeout(() => setIsRefreshing(false), 300);
    }
  }, [refreshDiagnostics, mergeProblems]);

  // Merge problems when panel opens or workspace diagnostics change
  useEffect(() => {
    if (isOpen) {
      mergeProblems();
    }
  }, [isOpen, mergeProblems, workspaceDiagnostics]);

  // Listen for Monaco marker changes (real-time for open files)
  useEffect(() => {
    if (!isOpen) return;

    const disposable = monaco.editor.onDidChangeMarkers(() => {
      // Debounce marker changes to avoid too frequent updates
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      refreshTimeoutRef.current = setTimeout(() => {
        mergeProblems();
        refreshTimeoutRef.current = null;
      }, 100);
    });

    return () => {
      disposable.dispose();
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [isOpen, mergeProblems]);

  // Subscribe to real-time LSP diagnostics updates
  useEffect(() => {
    if (!isOpen) return;

    const unsubscribeLsp = window.vyotiq?.lsp?.onDiagnosticsUpdated?.(() => {
      // Trigger merge when LSP diagnostics arrive
      mergeProblems();
    });

    const unsubscribeFile = window.vyotiq?.workspace?.onFileDiagnosticsChange?.(() => {
      // Trigger merge when file diagnostics arrive
      mergeProblems();
    });

    return () => {
      unsubscribeLsp?.();
      unsubscribeFile?.();
    };
  }, [isOpen, mergeProblems]);

  // Group problems by file
  const fileProblems: FileProblems[] = React.useMemo(() => {
    const filtered = filterSeverity === 'all' 
      ? problems 
      : problems.filter(p => p.severity === filterSeverity);

    const grouped = new Map<string, FileProblems>();
    
    for (const problem of filtered) {
      if (!grouped.has(problem.file)) {
        grouped.set(problem.file, {
          file: problem.file,
          fileName: problem.fileName,
          problems: [],
          errorCount: 0,
          warningCount: 0,
        });
      }
      
      const group = grouped.get(problem.file)!;
      group.problems.push(problem);
      if (problem.severity === 'error') group.errorCount++;
      if (problem.severity === 'warning') group.warningCount++;
    }

    return Array.from(grouped.values());
  }, [problems, filterSeverity]);

  // Calculate totals
  const totals = React.useMemo(() => {
    let errors = 0;
    let warnings = 0;
    let infos = 0;
    
    for (const problem of problems) {
      if (problem.severity === 'error') errors++;
      else if (problem.severity === 'warning') warnings++;
      else infos++;
    }
    
    return { errors, warnings, infos };
  }, [problems]);

  const toggleFile = useCallback((file: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(file)) {
        next.delete(file);
      } else {
        next.add(file);
      }
      return next;
    });
  }, []);

  if (!isOpen) return null;

  return (
    <div className={cn(
      'flex flex-col bg-[var(--color-surface-1)] border-t border-[var(--color-border-subtle)]',
      'h-[200px] max-h-[300px]',
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-header)]">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium text-[var(--color-text-primary)]">
            Problems
          </span>
          
          {/* Totals */}
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className={cn('flex items-center gap-1', severityColors.error)}>
              <AlertCircle size={10} />
              {totals.errors}
            </span>
            <span className={cn('flex items-center gap-1', severityColors.warning)}>
              <AlertTriangle size={10} />
              {totals.warnings}
            </span>
            <span className={cn('flex items-center gap-1', severityColors.info)}>
              <Info size={10} />
              {totals.infos}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Loading indicator */}
          {(isRefreshing || diagnosticsLoading) && (
            <Loader2 size={12} className="text-[var(--color-text-muted)] animate-spin" />
          )}
          
          {/* Filter dropdown */}
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value as typeof filterSeverity)}
            className="text-[10px] bg-[var(--color-surface-input)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] rounded px-1.5 py-0.5"
          >
            <option value="all">All</option>
            <option value="error">Errors</option>
            <option value="warning">Warnings</option>
            <option value="info">Info</option>
          </select>
          
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || diagnosticsLoading}
            className={cn(
              "p-1 rounded transition-colors",
              isRefreshing || diagnosticsLoading
                ? "text-[var(--color-text-muted)] cursor-not-allowed"
                : "hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            )}
            title="Refresh diagnostics"
          >
            <RefreshCw size={12} className={cn(isRefreshing && "animate-spin")} />
          </button>
          
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            title="Close"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Problems list */}
      <div className="flex-1 overflow-auto">
        {fileProblems.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--color-text-muted)] text-[11px]">
            No problems detected
          </div>
        ) : (
          <div className="py-1">
            {fileProblems.map((fp) => (
              <div key={fp.file}>
                {/* File header */}
                <button
                  onClick={() => toggleFile(fp.file)}
                  className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-[var(--color-surface-hover)] text-left"
                >
                  {expandedFiles.has(fp.file) ? (
                    <ChevronDown size={12} className="text-[var(--color-text-muted)]" />
                  ) : (
                    <ChevronRight size={12} className="text-[var(--color-text-muted)]" />
                  )}
                  
                  {React.createElement(getFileIcon(fp.fileName) || 'span', { size: 12 })}
                  
                  <span className="text-[11px] text-[var(--color-text-primary)] truncate">
                    {fp.fileName}
                  </span>
                  
                  <span className="text-[10px] text-[var(--color-text-muted)] ml-auto flex items-center gap-2">
                    {fp.errorCount > 0 && (
                      <span className={severityColors.error}>{fp.errorCount}</span>
                    )}
                    {fp.warningCount > 0 && (
                      <span className={severityColors.warning}>{fp.warningCount}</span>
                    )}
                  </span>
                </button>

                {/* Problems list */}
                {expandedFiles.has(fp.file) && (
                  <div className="pl-6">
                    {fp.problems.map((problem, idx) => {
                      const Icon = severityIcons[problem.severity];
                      return (
                        <button
                          key={`${problem.line}-${problem.column}-${idx}`}
                          onClick={() => onProblemClick(problem)}
                          className="w-full flex items-start gap-2 px-2 py-1 hover:bg-[var(--color-surface-hover)] text-left"
                        >
                          <Icon 
                            size={12} 
                            className={cn('flex-shrink-0 mt-0.5', severityColors[problem.severity])} 
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-[var(--color-text-primary)] break-words">
                              {problem.message}
                            </p>
                            <p className="text-[10px] text-[var(--color-text-muted)]">
                              {problem.source && `[${problem.source}] `}
                              Ln {problem.line}, Col {problem.column}
                              {problem.code && ` (${problem.code})`}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

ProblemsPanel.displayName = 'ProblemsPanel';

export default ProblemsPanel;
