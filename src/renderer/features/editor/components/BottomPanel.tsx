/**
 * BottomPanel Component
 * 
 * VS Code-style bottom panel with tabs for Terminal, Problems, Output, Debug Console.
 * Matches the exact design of VS Code's integrated panel.
 */

import React, { useState, useCallback, useEffect, memo, useRef } from 'react';
import {
  Terminal as TerminalIcon,
  AlertCircle,
  AlertTriangle,
  Info,
  Maximize2,
  Minimize2,
  X,
  GripHorizontal,
  FileOutput,
  Bug,
  ChevronDown,
  ChevronRight,
  Copy,
  RefreshCw,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { IntegratedTerminal } from './IntegratedTerminal';
import { OutputPanel } from './OutputPanel';
import { DebugConsole } from './DebugConsole';
import { getFileIcon } from '../../fileTree/utils/fileIcons';
import type { Problem } from './ProblemsPanel';

export type PanelTab = 'problems' | 'terminal' | 'output' | 'debug-console';

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
}

interface BottomPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab?: PanelTab;
  onTabChange?: (tab: PanelTab) => void;
  workspacePath?: string;
  onProblemClick?: (problem: Problem) => void;
  className?: string;
  /** Initial height in pixels */
  initialHeight?: number;
  /** Minimum height in pixels */
  minHeight?: number;
  /** Maximum height in pixels */
  maxHeight?: number;
  /** When true, panel fills available height (for when no editor tabs are open) */
  fillHeight?: boolean;
}

interface PanelCounts {
  errors: number;
  warnings: number;
}

export const BottomPanel: React.FC<BottomPanelProps> = memo(({
  isOpen,
  onClose,
  activeTab: externalActiveTab,
  onTabChange,
  workspacePath,
  onProblemClick,
  className,
  initialHeight = 250,
  minHeight = 150,
  maxHeight = 600,
  fillHeight = false,
}) => {
  const [internalActiveTab, setInternalActiveTab] = useState<PanelTab>('terminal');
  const activeTab = externalActiveTab ?? internalActiveTab;
  const setActiveTab = useCallback((tab: PanelTab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalActiveTab(tab);
    }
  }, [onTabChange]);
  const [height, setHeight] = useState(initialHeight);
  const [isMaximized, setIsMaximized] = useState(false);
  const [problemCounts, setProblemCounts] = useState<PanelCounts>({ errors: 0, warnings: 0 });
  const [isResizing, setIsResizing] = useState(false);
  
  // Handle resize drag
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    
    const startY = e.clientY;
    const startHeight = height;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = startY - moveEvent.clientY;
      const newHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + deltaY));
      setHeight(newHeight);
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [height, maxHeight, minHeight]);
  
  // Toggle maximize
  const toggleMaximize = useCallback(() => {
    if (isMaximized) {
      setHeight(initialHeight);
    } else {
      setHeight(maxHeight);
    }
    setIsMaximized(!isMaximized);
  }, [isMaximized, initialHeight, maxHeight]);
  
  // Update problem counts from ProblemsPanel
  const handleProblemCountsChange = useCallback((counts: PanelCounts) => {
    setProblemCounts(counts);
  }, []);
  
  if (!isOpen) {
    return null;
  }
  
  // When fillHeight is true, take full available space; otherwise use fixed/maximized height
  const effectiveHeight = fillHeight ? '100%' : (isMaximized ? 'calc(100vh - 100px)' : `${height}px`);
  
  return (
    <div
      className={cn(
        'flex flex-col border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]',
        isResizing && 'select-none',
        className
      )}
      style={{ height: effectiveHeight }}
    >
      {/* Resize handle - hidden when filling height */}
      {!fillHeight && (
        <div
          onMouseDown={handleResizeStart}
          className={cn(
            'h-1 cursor-ns-resize flex items-center justify-center hover:bg-[var(--color-accent-primary)]/20 transition-colors',
            isResizing && 'bg-[var(--color-accent-primary)]/30'
          )}
        >
          <GripHorizontal size={10} className="text-[var(--color-text-placeholder)]" />
        </div>
      )}
      
      {/* Panel header with tabs */}
      <div className="flex items-center justify-between px-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-header)] min-w-0 gap-1">
        {/* Tabs */}
        <div className="flex items-center gap-0.5 min-w-0 overflow-x-auto scrollbar-none flex-shrink">
          {/* Problems tab */}
          <button
            onClick={() => setActiveTab('problems')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium transition-colors border-b-2 flex-shrink-0 whitespace-nowrap',
              activeTab === 'problems'
                ? 'text-[var(--color-text-primary)] border-[var(--color-accent-primary)]'
                : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-secondary)]'
            )}
          >
            <AlertCircle size={12} />
            <span>Problems</span>
            {(problemCounts.errors > 0 || problemCounts.warnings > 0) && (
              <span className="flex items-center gap-1 ml-1 text-[10px] font-mono">
                {problemCounts.errors > 0 && (
                  <span className="text-[var(--color-error)]">{problemCounts.errors}</span>
                )}
                {problemCounts.warnings > 0 && (
                  <span className="text-[var(--color-warning)]">{problemCounts.warnings}</span>
                )}
              </span>
            )}
          </button>
          
          {/* Terminal tab */}
          <button
            onClick={() => setActiveTab('terminal')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium transition-colors border-b-2 flex-shrink-0 whitespace-nowrap',
              activeTab === 'terminal'
                ? 'text-[var(--color-text-primary)] border-[var(--color-accent-primary)]'
                : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-secondary)]'
            )}
          >
            <TerminalIcon size={12} />
            <span>Terminal</span>
          </button>

          {/* Output tab */}
          <button
            onClick={() => setActiveTab('output')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium transition-colors border-b-2 flex-shrink-0 whitespace-nowrap',
              activeTab === 'output'
                ? 'text-[var(--color-text-primary)] border-[var(--color-accent-primary)]'
                : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-secondary)]'
            )}
          >
            <FileOutput size={12} />
            <span>Output</span>
          </button>

          {/* Debug Console tab */}
          <button
            onClick={() => setActiveTab('debug-console')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium transition-colors border-b-2 flex-shrink-0 whitespace-nowrap',
              activeTab === 'debug-console'
                ? 'text-[var(--color-text-primary)] border-[var(--color-accent-primary)]'
                : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-secondary)]'
            )}
          >
            <Bug size={12} />
            <span>Debug Console</span>
          </button>
        </div>
        
        {/* Panel actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={toggleMaximize}
            className="p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors"
            title={isMaximized ? 'Restore panel size' : 'Maximize panel'}
          >
            {isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors"
            title="Close panel"
          >
            <X size={12} />
          </button>
        </div>
      </div>
      
      {/* Panel content */}
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        {activeTab === 'problems' && (
          <ProblemsPanelWrapper
            onProblemClick={onProblemClick}
            onCountsChange={handleProblemCountsChange}
          />
        )}
        {activeTab === 'terminal' && (
          <IntegratedTerminal workspacePath={workspacePath} />
        )}
        {activeTab === 'output' && (
          <OutputPanel />
        )}
        {activeTab === 'debug-console' && (
          <DebugConsole />
        )}
      </div>
    </div>
  );
});

BottomPanel.displayName = 'BottomPanel';

/**
 * Wrapper for ProblemsPanel that works within the BottomPanel
 * Adapts the standalone ProblemsPanel to work as an embedded tab
 */
interface ProblemsPanelWrapperProps {
  onProblemClick?: (problem: Problem) => void;
  onCountsChange?: (counts: PanelCounts) => void;
}

const ProblemsPanelWrapper: React.FC<ProblemsPanelWrapperProps> = memo(({
  onProblemClick,
  onCountsChange,
}) => {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [workspaceDiagnostics, setWorkspaceDiagnostics] = useState<Problem[]>([]);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [filterSeverity, setFilterSeverity] = useState<Problem['severity'] | 'all'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState & { problemText?: string }>({
    isOpen: false,
    x: 0,
    y: 0,
    problemText: undefined,
  });
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.isOpen) {
        setContextMenu(prev => ({ ...prev, isOpen: false }));
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu.isOpen]);
  
  // Handle copy - copy selected text or specific problem
  const handleCopy = useCallback(async () => {
    try {
      const selection = window.getSelection()?.toString();
      if (selection) {
        await navigator.clipboard.writeText(selection);
      } else if (contextMenu.problemText) {
        await navigator.clipboard.writeText(contextMenu.problemText);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [contextMenu.problemText]);
  
  // Handle copy all problems
  const handleCopyAll = useCallback(async () => {
    try {
      const allProblemsText = problems
        .map(p => `[${p.severity.toUpperCase()}] ${p.fileName}:${p.line}:${p.column} - ${p.message}${p.source ? ` (${p.source})` : ''}`)
        .join('\n');
      await navigator.clipboard.writeText(allProblemsText);
    } catch (err) {
      console.error('Failed to copy all:', err);
    }
  }, [problems]);
  
  // Handle select all
  const handleSelectAll = useCallback(() => {
    if (contentRef.current) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(contentRef.current);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, []);
  
  // Handle context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, problemText?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      problemText,
    });
  }, []);
  
  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        handleCopy();
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        handleSelectAll();
      }
    }
  }, [handleCopy, handleSelectAll]);

  // Refresh workspace diagnostics manually (force refresh)
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const result = await window.vyotiq?.workspace?.getDiagnostics?.({ forceRefresh: true });
      if (result?.success && result.diagnostics) {
        const mapped: Problem[] = result.diagnostics.map((d: {
          filePath: string;
          fileName?: string;
          line: number;
          column: number;
          endLine?: number;
          endColumn?: number;
          message: string;
          severity: 'error' | 'warning' | 'info' | 'hint';
          source: string;
          code?: string | number;
        }) => ({
          file: d.filePath,
          fileName: d.fileName || d.filePath.split(/[/\\]/).pop() || d.filePath,
          line: d.line,
          column: d.column,
          endLine: d.endLine,
          endColumn: d.endColumn,
          message: d.message,
          severity: d.severity,
          source: d.source,
          code: d.code,
        }));
        setWorkspaceDiagnostics(mapped);
      }
    } catch (err) {
      console.error('Failed to refresh diagnostics:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Subscribe to workspace diagnostics from TypeScript service
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let isSubscribed = false;

    const setupWorkspaceDiagnostics = async () => {
      try {
        // Subscribe to real-time updates first
        const subscribeResult = await window.vyotiq?.workspace?.subscribeToDiagnostics?.();
        if (subscribeResult?.success) {
          isSubscribed = true;
        }

        // Get initial diagnostics
        const result = await window.vyotiq?.workspace?.getDiagnostics?.({ forceRefresh: false });
        if (result?.success && result.diagnostics) {
          const mapped: Problem[] = result.diagnostics.map((d: {
            filePath: string;
            fileName?: string;
            line: number;
            column: number;
            endLine?: number;
            endColumn?: number;
            message: string;
            severity: 'error' | 'warning' | 'info' | 'hint';
            source: string;
            code?: string | number;
          }) => ({
            file: d.filePath,
            fileName: d.fileName || d.filePath.split(/[/\\]/).pop() || d.filePath,
            line: d.line,
            column: d.column,
            endLine: d.endLine,
            endColumn: d.endColumn,
            message: d.message,
            severity: d.severity,
            source: d.source,
            code: d.code,
          }));
          setWorkspaceDiagnostics(mapped);
        }

        // Listen for real-time updates
        unsubscribe = window.vyotiq?.workspace?.onDiagnosticsChange?.((event) => {
          const mapped: Problem[] = (event.diagnostics ?? []).map((d: {
            filePath: string;
            fileName?: string;
            line: number;
            column: number;
            endLine?: number;
            endColumn?: number;
            message: string;
            severity: 'error' | 'warning' | 'info' | 'hint';
            source: string;
            code?: string | number;
          }) => ({
            file: d.filePath,
            fileName: d.fileName || d.filePath.split(/[/\\]/).pop() || d.filePath,
            line: d.line,
            column: d.column,
            endLine: d.endLine,
            endColumn: d.endColumn,
            message: d.message,
            severity: d.severity,
            source: d.source,
            code: d.code,
          }));
          setWorkspaceDiagnostics(mapped);
        });
      } catch {
        // Ignore errors during diagnostics setup
      }
    };

    setupWorkspaceDiagnostics();

    return () => {
      unsubscribe?.();
      // Unsubscribe from diagnostics when component unmounts
      if (isSubscribed) {
        window.vyotiq?.workspace?.unsubscribeFromDiagnostics?.().catch(() => {
          // Ignore errors during cleanup
        });
      }
    };
  }, []);

  // Auto-refresh diagnostics when terminal commands complete (e.g., npm install)
  useEffect(() => {
    const handleTerminalOutput = (event: CustomEvent<{ output: string }>) => {
      const output = event.detail?.output?.toLowerCase() || '';
      // Detect npm/yarn/pnpm install completion
      if (
        output.includes('added') && output.includes('packages') ||
        output.includes('up to date') ||
        output.includes('success') && (output.includes('install') || output.includes('add'))
      ) {
        // Auto-refresh after a brief delay to let file system settle
        setTimeout(() => {
          handleRefresh();
        }, 1500);
      }
    };

    document.addEventListener('vyotiq:terminal:output', handleTerminalOutput as EventListener);
    return () => {
      document.removeEventListener('vyotiq:terminal:output', handleTerminalOutput as EventListener);
    };
  }, [handleRefresh]);

  // Import Monaco dynamically to get markers
  useEffect(() => {
    let disposed = false;
    let disposable: { dispose: () => void } | undefined;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    
    const loadProblems = async () => {
      try {
        const monaco = await import('monaco-editor');
        
        if (disposed) return;
        
        const refreshProblems = () => {
          if (disposed) return;
          
          const models = monaco.editor.getModels();
          const allProblems: Problem[] = [];
          
          for (const model of models) {
            const markers = monaco.editor.getModelMarkers({ resource: model.uri });
            
            for (const marker of markers) {
              const severityMap: Record<number, Problem['severity']> = {
                [monaco.MarkerSeverity.Error]: 'error',
                [monaco.MarkerSeverity.Warning]: 'warning',
                [monaco.MarkerSeverity.Info]: 'info',
                [monaco.MarkerSeverity.Hint]: 'hint',
              };
              
              allProblems.push({
                file: model.uri.fsPath || model.uri.path,
                fileName: model.uri.path.split('/').pop() || model.uri.path,
                line: marker.startLineNumber,
                column: marker.startColumn,
                endLine: marker.endLineNumber,
                endColumn: marker.endColumn,
                message: marker.message,
                severity: severityMap[marker.severity] || 'info',
                source: marker.source,
                code: marker.code?.toString(),
              });
            }
          }
          
          // Sort by severity, then file, then line
          allProblems.sort((a, b) => {
            const severityOrder = { error: 0, warning: 1, info: 2, hint: 3 };
            const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
            if (severityDiff !== 0) return severityDiff;
            const fileDiff = a.file.localeCompare(b.file);
            if (fileDiff !== 0) return fileDiff;
            return a.line - b.line;
          });
          
          setProblems(allProblems);
        };
        
        // Initial refresh
        refreshProblems();
        
        // Listen for marker changes
        disposable = monaco.editor.onDidChangeMarkers(() => {
          refreshProblems();
        });
        
        // Also poll every 2 seconds as a fallback for real-time updates
        intervalId = setInterval(refreshProblems, 2000);
        
      } catch (error) {
        console.error('Failed to load Monaco for problems:', error);
      }
    };
    
    loadProblems();
    
    return () => {
      disposed = true;
      disposable?.dispose();
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  // Merge Monaco markers with workspace diagnostics
  const allProblems = React.useMemo(() => {
    // Create a set of Monaco problem keys to avoid duplicates
    const monacoKeys = new Set(
      problems.map(p => `${p.file}:${p.line}:${p.column}:${p.message}`)
    );

    // Filter out workspace diagnostics that are already in Monaco
    const uniqueWorkspaceDiagnostics = workspaceDiagnostics.filter(
      p => !monacoKeys.has(`${p.file}:${p.line}:${p.column}:${p.message}`)
    );

    // Merge and sort
    const merged = [...problems, ...uniqueWorkspaceDiagnostics];
    merged.sort((a, b) => {
      const severityOrder = { error: 0, warning: 1, info: 2, hint: 3 };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      const fileDiff = a.file.localeCompare(b.file);
      if (fileDiff !== 0) return fileDiff;
      return a.line - b.line;
    });

    return merged;
  }, [problems, workspaceDiagnostics]);

  // Report counts when problems change
  useEffect(() => {
    const errorCount = allProblems.filter(p => p.severity === 'error').length;
    const warningCount = allProblems.filter(p => p.severity === 'warning').length;
    onCountsChange?.({ errors: errorCount, warnings: warningCount });

    // Dispatch global event for sidebar and other components
    document.dispatchEvent(new CustomEvent('vyotiq:problems:counts', {
      detail: { errors: errorCount, warnings: warningCount }
    }));

    // Auto-expand files with errors
    const filesWithErrors = new Set(
      allProblems.filter(p => p.severity === 'error').map(p => p.file)
    );
    setExpandedFiles(prev => new Set([...prev, ...filesWithErrors]));
  }, [allProblems, onCountsChange]);
  
  // Group problems by file
  const groupedProblems = React.useMemo(() => {
    const filtered = filterSeverity === 'all'
      ? allProblems
      : allProblems.filter(p => p.severity === filterSeverity);
    
    const grouped = new Map<string, { fileName: string; problems: Problem[]; errorCount: number; warningCount: number }>();
    
    for (const problem of filtered) {
      if (!grouped.has(problem.file)) {
        grouped.set(problem.file, {
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
    
    return Array.from(grouped.entries());
  }, [allProblems, filterSeverity]);
  
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
  
  const totalErrors = allProblems.filter(p => p.severity === 'error').length;
  const totalWarnings = allProblems.filter(p => p.severity === 'warning').length;
  const totalInfos = allProblems.filter(p => p.severity === 'info' || p.severity === 'hint').length;
  
  return (
    <div 
      className="h-full flex flex-col min-w-0 overflow-hidden bg-[var(--color-surface-1)]"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Filter bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-border-subtle)] min-w-0">
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value as typeof filterSeverity)}
          className="text-[10px] bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] rounded px-1.5 py-0.5 focus:outline-none focus:border-[var(--color-accent-primary)]"
        >
          <option value="all">All</option>
          <option value="error">Errors</option>
          <option value="warning">Warnings</option>
          <option value="info">Info</option>
        </select>
        
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className={cn('flex items-center gap-1', severityColors.error)}>
            <AlertCircle size={10} />
            {totalErrors}
          </span>
          <span className={cn('flex items-center gap-1', severityColors.warning)}>
            <AlertTriangle size={10} />
            {totalWarnings}
          </span>
          <span className={cn('flex items-center gap-1', severityColors.info)}>
            <Info size={10} />
            {totalInfos}
          </span>
        </div>
        
        {/* Refresh button */}
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className={cn(
            "ml-auto p-1 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors",
            isRefreshing && "opacity-50 cursor-not-allowed"
          )}
          title="Refresh Diagnostics"
        >
          <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
        </button>
        
        {/* Copy all button */}
        <button
          onClick={handleCopyAll}
          className="p-1 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          title="Copy All Problems (Ctrl+Shift+C)"
        >
          <Copy size={12} />
        </button>
      </div>
      
      {/* Problems list */}
      <div 
        ref={contentRef}
        className="flex-1 min-h-0 min-w-0 overflow-auto select-text"
        onContextMenu={(e) => handleContextMenu(e)}
      >
        {groupedProblems.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--color-text-muted)] text-[11px]">
            No problems detected
          </div>
        ) : (
          <div className="py-1">
            {groupedProblems.map(([file, group]) => (
              <div key={file}>
                {/* File header */}
                <button
                  onClick={() => toggleFile(file)}
                  onContextMenu={(e) => handleContextMenu(e, `${group.fileName}`)}
                  className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-[var(--color-surface-hover)] text-left"
                >
                  {expandedFiles.has(file) ? (
                    <ChevronDown size={12} className="text-[var(--color-text-muted)] flex-shrink-0" />
                  ) : (
                    <ChevronRight size={12} className="text-[var(--color-text-muted)] flex-shrink-0" />
                  )}
                  
                  {React.createElement(getFileIcon(group.fileName) || 'span', { 
                    size: 12, 
                    className: 'flex-shrink-0' 
                  })}
                  
                  <span className="text-[11px] text-[var(--color-text-primary)] truncate">
                    {group.fileName}
                  </span>
                  
                  <span className="text-[10px] text-[var(--color-text-muted)] ml-auto flex items-center gap-2 flex-shrink-0">
                    {group.errorCount > 0 && (
                      <span className={severityColors.error}>{group.errorCount}</span>
                    )}
                    {group.warningCount > 0 && (
                      <span className={severityColors.warning}>{group.warningCount}</span>
                    )}
                  </span>
                </button>
                
                {/* Problems list */}
                {expandedFiles.has(file) && (
                  <div className="pl-6">
                    {group.problems.map((problem, idx) => {
                      const Icon = severityIcons[problem.severity];
                      const problemText = `[${problem.severity.toUpperCase()}] ${problem.fileName}:${problem.line}:${problem.column} - ${problem.message}${problem.source ? ` (${problem.source})` : ''}`;
                      return (
                        <button
                          key={`${problem.line}-${problem.column}-${idx}`}
                          onClick={() => onProblemClick?.(problem)}
                          onContextMenu={(e) => handleContextMenu(e, problemText)}
                          className="w-full flex items-start gap-2 px-2 py-1 hover:bg-[var(--color-surface-hover)] text-left"
                        >
                          <Icon
                            size={12}
                            className={cn('flex-shrink-0 mt-0.5', severityColors[problem.severity])}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-[var(--color-text-primary)] break-words select-text">
                              {problem.message}
                            </p>
                            <p className="text-[10px] text-[var(--color-text-muted)] select-text">
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
      
      {/* Context Menu */}
      {contextMenu.isOpen && (
        <div
          className="fixed z-50 min-w-[160px] py-1 bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              handleCopy();
              setContextMenu(prev => ({ ...prev, isOpen: false }));
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] text-left"
          >
            <Copy size={12} />
            Copy
            <span className="ml-auto text-[var(--color-text-muted)]">Ctrl+C</span>
          </button>
          <button
            onClick={() => {
              handleCopyAll();
              setContextMenu(prev => ({ ...prev, isOpen: false }));
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] text-left"
          >
            <Copy size={12} />
            Copy All Problems
          </button>
          <div className="my-1 border-t border-[var(--color-border-subtle)]" />
          <button
            onClick={() => {
              handleSelectAll();
              setContextMenu(prev => ({ ...prev, isOpen: false }));
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] text-left"
          >
            Select All
            <span className="ml-auto text-[var(--color-text-muted)]">Ctrl+A</span>
          </button>
        </div>
      )}
    </div>
  );
});

ProblemsPanelWrapper.displayName = 'ProblemsPanelWrapper';

export default BottomPanel;
