/**
 * DiffEditor Component
 * 
 * Monaco Diff Editor for showing file changes with:
 * - Side-by-side and inline view modes
 * - Syntax highlighting
 * - Navigation between changes
 * - Diff statistics display
 * - Undo history navigation (prev/next change)
 * - History timeline bar
 */

import React, { useRef, useEffect, useCallback, memo, useMemo, useState } from 'react';
import * as monaco from 'monaco-editor';
import { 
  X, 
  Columns, 
  AlignJustify, 
  RefreshCw, 
  ChevronUp, 
  ChevronDown, 
  ChevronLeft,
  ChevronRight,
  Plus, 
  Minus, 
  Check, 
  XCircle, 
  Loader2, 
  RotateCcw, 
  RotateCw,
  Clock,
  History,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { registerCustomThemes } from '../utils/themeUtils';
import { getLanguageFromPath, getFileName } from '../utils/languageUtils';
import type { FileDiff, DiffViewMode, EditorSettings, HistoryChangeEntry } from '../types';

let themesRegistered = false;
function ensureThemesRegistered() {
  if (!themesRegistered) {
    registerCustomThemes(monaco);
    themesRegistered = true;
  }
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

interface DiffEditorProps {
  diff: FileDiff;
  settings: EditorSettings;
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  onClose: () => void;
  onRefresh: () => void;
  onAccept?: () => Promise<void>;
  onDiscard?: () => Promise<void>;
  onUndo?: () => Promise<void>;
  onRedo?: () => Promise<void>;
  fileHistory?: HistoryChangeEntry[];
  currentHistoryIndex?: number;
  onHistoryNavigate?: (change: HistoryChangeEntry) => void;
  className?: string;
}

export const DiffEditor: React.FC<DiffEditorProps> = memo(({
  diff,
  settings,
  viewMode,
  onViewModeChange,
  onClose,
  onRefresh,
  onAccept,
  onDiscard,
  onUndo,
  onRedo,
  fileHistory = [],
  currentHistoryIndex = 0,
  onHistoryNavigate,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const [changeCount, setChangeCount] = useState(0);
  const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
  const [actionStatus, setActionStatus] = useState<'idle' | 'accepting' | 'discarding' | 'undoing' | 'redoing'>('idle');
  
  const language = getLanguageFromPath(diff.path);
  const fileName = getFileName(diff.path);
  
  const isUndoHistoryDiff = !!diff.undoChangeId;
  const canUndo = isUndoHistoryDiff && diff.undoStatus === 'undoable' && !!onUndo;
  const canRedo = isUndoHistoryDiff && diff.undoStatus === 'undone' && !!onRedo;
  
  const hasHistoryNav = fileHistory.length > 1 && !!onHistoryNavigate;
  const hasPrevHistory = hasHistoryNav && currentHistoryIndex > 0;
  const hasNextHistory = hasHistoryNav && currentHistoryIndex < fileHistory.length - 1;
  
  const diffStats = useMemo(() => {
    const originalLines = diff.original?.split('\n') || [];
    const modifiedLines = diff.modified?.split('\n') || [];
    
    if (!diff.original || diff.original.length === 0) {
      return { added: modifiedLines.length, removed: 0 };
    }
    
    let added = 0;
    let removed = 0;
    
    const originalSet = new Set(originalLines);
    const modifiedSet = new Set(modifiedLines);
    
    for (const line of modifiedLines) {
      if (!originalSet.has(line)) added++;
    }
    for (const line of originalLines) {
      if (!modifiedSet.has(line)) removed++;
    }
    
    return { added, removed };
  }, [diff.original, diff.modified]);
  
  useEffect(() => {
    if (!containerRef.current || diff.isLoading) return;

    ensureThemesRegistered();

    const originalModel = monaco.editor.createModel(diff.original, language);
    const modifiedModel = monaco.editor.createModel(diff.modified, language);

    const editor = monaco.editor.createDiffEditor(containerRef.current, {
      theme: settings.theme,
      fontSize: settings.fontSize,
      fontFamily: settings.fontFamily,
      readOnly: true,
      renderSideBySide: viewMode === 'side-by-side',
      automaticLayout: true,
      scrollBeyondLastLine: false,
      minimap: { enabled: false },
      lineNumbers: settings.lineNumbers,
      renderWhitespace: settings.renderWhitespace,
      smoothScrolling: settings.smoothScrolling,
      padding: { top: 8, bottom: 8 },
      folding: true,
      renderIndicators: true,
      originalEditable: false,
    });

    editor.setModel({
      original: originalModel,
      modified: modifiedModel,
    });

    editorRef.current = editor;

    setTimeout(() => {
      const changes = editor.getLineChanges();
      setChangeCount(changes?.length || 0);
      
      if (changes && changes.length > 0) {
        const firstChange = changes[0];
        const modifiedEditor = editor.getModifiedEditor();
        const targetLine = firstChange.modifiedStartLineNumber || firstChange.modifiedEndLineNumber;
        modifiedEditor.revealLineInCenter(targetLine);
        modifiedEditor.setPosition({ lineNumber: targetLine, column: 1 });
        setCurrentChangeIndex(1);
      }
    }, 100);

    return () => {
      editor.dispose();
      originalModel.dispose();
      modifiedModel.dispose();
      editorRef.current = null;
    };
  }, [diff.isLoading, diff.original, diff.modified, diff.path]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({
        renderSideBySide: viewMode === 'side-by-side',
      });
    }
  }, [viewMode]);

  useEffect(() => {
    monaco.editor.setTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({
        fontSize: settings.fontSize,
        fontFamily: settings.fontFamily,
        lineNumbers: settings.lineNumbers,
        renderWhitespace: settings.renderWhitespace,
        smoothScrolling: settings.smoothScrolling,
      });
    }
  }, [settings]);
  
  const goToNextChange = useCallback(() => {
    if (editorRef.current) {
      const changes = editorRef.current.getLineChanges();
      if (changes && changes.length > 0) {
        const modifiedEditor = editorRef.current.getModifiedEditor();
        const currentLine = modifiedEditor.getPosition()?.lineNumber || 0;
        
        const nextChangeIdx = changes.findIndex(change => 
          (change.modifiedStartLineNumber || change.modifiedEndLineNumber) > currentLine
        );
        
        if (nextChangeIdx !== -1) {
          const nextChange = changes[nextChangeIdx];
          modifiedEditor.revealLineInCenter(nextChange.modifiedStartLineNumber || nextChange.modifiedEndLineNumber);
          modifiedEditor.setPosition({
            lineNumber: nextChange.modifiedStartLineNumber || nextChange.modifiedEndLineNumber,
            column: 1,
          });
          setCurrentChangeIndex(nextChangeIdx + 1);
        } else if (changes.length > 0) {
          const firstChange = changes[0];
          modifiedEditor.revealLineInCenter(firstChange.modifiedStartLineNumber || firstChange.modifiedEndLineNumber);
          modifiedEditor.setPosition({
            lineNumber: firstChange.modifiedStartLineNumber || firstChange.modifiedEndLineNumber,
            column: 1,
          });
          setCurrentChangeIndex(1);
        }
      }
    }
  }, []);
  
  const goToPrevChange = useCallback(() => {
    if (editorRef.current) {
      const changes = editorRef.current.getLineChanges();
      if (changes && changes.length > 0) {
        const modifiedEditor = editorRef.current.getModifiedEditor();
        const currentLine = modifiedEditor.getPosition()?.lineNumber || Infinity;
        
        const prevChanges = changes.filter(change => 
          (change.modifiedStartLineNumber || change.modifiedEndLineNumber) < currentLine
        );
        
        if (prevChanges.length > 0) {
          const prevChange = prevChanges[prevChanges.length - 1];
          modifiedEditor.revealLineInCenter(prevChange.modifiedStartLineNumber || prevChange.modifiedEndLineNumber);
          modifiedEditor.setPosition({
            lineNumber: prevChange.modifiedStartLineNumber || prevChange.modifiedEndLineNumber,
            column: 1,
          });
          setCurrentChangeIndex(prevChanges.length);
        } else if (changes.length > 0) {
          const lastChange = changes[changes.length - 1];
          modifiedEditor.revealLineInCenter(lastChange.modifiedStartLineNumber || lastChange.modifiedEndLineNumber);
          modifiedEditor.setPosition({
            lineNumber: lastChange.modifiedStartLineNumber || lastChange.modifiedEndLineNumber,
            column: 1,
          });
          setCurrentChangeIndex(changes.length);
        }
      }
    }
  }, []);

  const handleAccept = useCallback(async () => {
    if (!onAccept || actionStatus !== 'idle') return;
    setActionStatus('accepting');
    try {
      await onAccept();
    } finally {
      setActionStatus('idle');
    }
  }, [onAccept, actionStatus]);

  const handleDiscard = useCallback(async () => {
    if (!onDiscard || actionStatus !== 'idle') return;
    setActionStatus('discarding');
    try {
      await onDiscard();
    } finally {
      setActionStatus('idle');
    }
  }, [onDiscard, actionStatus]);

  const handleUndo = useCallback(async () => {
    if (!onUndo || actionStatus !== 'idle') return;
    setActionStatus('undoing');
    try {
      await onUndo();
    } finally {
      setActionStatus('idle');
    }
  }, [onUndo, actionStatus]);

  const handleRedo = useCallback(async () => {
    if (!onRedo || actionStatus !== 'idle') return;
    setActionStatus('redoing');
    try {
      await onRedo();
    } finally {
      setActionStatus('idle');
    }
  }, [onRedo, actionStatus]);

  const handlePrevHistory = useCallback(() => {
    if (!hasPrevHistory || !onHistoryNavigate) return;
    const prevChange = fileHistory[currentHistoryIndex - 1];
    if (prevChange) onHistoryNavigate(prevChange);
  }, [hasPrevHistory, onHistoryNavigate, fileHistory, currentHistoryIndex]);

  const handleNextHistory = useCallback(() => {
    if (!hasNextHistory || !onHistoryNavigate) return;
    const nextChange = fileHistory[currentHistoryIndex + 1];
    if (nextChange) onHistoryNavigate(nextChange);
  }, [hasNextHistory, onHistoryNavigate, fileHistory, currentHistoryIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!containerRef.current?.contains(document.activeElement)) return;
      
      if (e.key === 'ArrowDown' && e.altKey) {
        e.preventDefault();
        goToNextChange();
      } else if (e.key === 'ArrowUp' && e.altKey) {
        e.preventDefault();
        goToPrevChange();
      } else if (e.key === 'ArrowLeft' && e.altKey && hasPrevHistory) {
        e.preventDefault();
        handlePrevHistory();
      } else if (e.key === 'ArrowRight' && e.altKey && hasNextHistory) {
        e.preventDefault();
        handleNextHistory();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNextChange, goToPrevChange, hasPrevHistory, hasNextHistory, handlePrevHistory, handleNextHistory]);
  
  if (diff.isLoading) {
    return (
      <div className={cn('flex items-center justify-center h-full bg-[var(--color-surface-1)]', className)}>
        <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-[11px] font-mono">Loading diff...</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className={cn('flex flex-col h-full bg-[var(--color-surface-1)]', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--color-surface-header)] border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-[11px] font-mono text-[var(--color-text-primary)] truncate">
            {fileName}
          </span>
          <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
            (diff)
          </span>
          
          <span className="flex items-center gap-1.5 text-[10px] font-mono ml-2">
            {diffStats.added > 0 && (
              <span className="flex items-center gap-0.5 text-[var(--color-success)]">
                <Plus size={10} />
                {diffStats.added}
              </span>
            )}
            {diffStats.removed > 0 && (
              <span className="flex items-center gap-0.5 text-[var(--color-error)]">
                <Minus size={10} />
                {diffStats.removed}
              </span>
            )}
          </span>
          
          {changeCount > 0 && (
            <span className="text-[10px] text-[var(--color-text-dim)] ml-2">
              {currentChangeIndex > 0 ? `${currentChangeIndex}/` : ''}{changeCount} change{changeCount !== 1 ? 's' : ''}
            </span>
          )}

          {diff.timestamp && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-dim)] ml-2">
              <Clock size={10} />
              {formatRelativeTime(diff.timestamp)}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-1">
          {onAccept && (
            <button
              onClick={handleAccept}
              disabled={actionStatus !== 'idle'}
              className={cn(
                'px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1 transition-colors',
                'bg-[var(--color-success)]/10 text-[var(--color-success)]',
                'hover:bg-[var(--color-success)]/20',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              title="Accept changes"
            >
              {actionStatus === 'accepting' ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
              Accept
            </button>
          )}
          {onDiscard && (
            <button
              onClick={handleDiscard}
              disabled={actionStatus !== 'idle'}
              className={cn(
                'px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1 transition-colors',
                'bg-[var(--color-error)]/10 text-[var(--color-error)]',
                'hover:bg-[var(--color-error)]/20',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              title="Discard changes"
            >
              {actionStatus === 'discarding' ? <Loader2 size={10} className="animate-spin" /> : <XCircle size={10} />}
              Discard
            </button>
          )}
          
          {(onAccept || onDiscard) && <div className="w-px h-4 bg-[var(--color-border-subtle)] mx-1" />}
          
          {canUndo && (
            <button
              onClick={handleUndo}
              disabled={actionStatus !== 'idle'}
              className={cn(
                'px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1 transition-colors',
                'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
                'hover:bg-[var(--color-warning)]/20',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              title="Undo this change"
            >
              {actionStatus === 'undoing' ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
              Undo
            </button>
          )}
          {canRedo && (
            <button
              onClick={handleRedo}
              disabled={actionStatus !== 'idle'}
              className={cn(
                'px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1 transition-colors',
                'bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]',
                'hover:bg-[var(--color-accent-primary)]/20',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              title="Redo this change"
            >
              {actionStatus === 'redoing' ? <Loader2 size={10} className="animate-spin" /> : <RotateCw size={10} />}
              Redo
            </button>
          )}
          
          {(canUndo || canRedo) && <div className="w-px h-4 bg-[var(--color-border-subtle)] mx-1" />}
          
          <button
            onClick={goToPrevChange}
            className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            title="Previous change (Alt+↑)"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={goToNextChange}
            className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            title="Next change (Alt+↓)"
          >
            <ChevronDown size={14} />
          </button>
          
          <div className="w-px h-4 bg-[var(--color-border-subtle)] mx-1" />
          
          <button
            onClick={() => onViewModeChange('side-by-side')}
            className={cn(
              'p-1 rounded transition-colors',
              viewMode === 'side-by-side'
                ? 'bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]'
                : 'hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            )}
            title="Side by side"
          >
            <Columns size={14} />
          </button>
          <button
            onClick={() => onViewModeChange('inline')}
            className={cn(
              'p-1 rounded transition-colors',
              viewMode === 'inline'
                ? 'bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]'
                : 'hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            )}
            title="Inline"
          >
            <AlignJustify size={14} />
          </button>
          
          <div className="w-px h-4 bg-[var(--color-border-subtle)] mx-1" />
          
          <button
            onClick={onRefresh}
            className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
          
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            title="Close diff"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* History navigation bar */}
      {hasHistoryNav && (
        <DiffHistoryBar
          changes={fileHistory}
          currentIndex={currentHistoryIndex}
          onSelect={(change) => onHistoryNavigate?.(change)}
          onPrev={handlePrevHistory}
          onNext={handleNextHistory}
          hasPrev={hasPrevHistory}
          hasNext={hasNextHistory}
        />
      )}
      
      {/* Diff editor container */}
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  );
});

DiffEditor.displayName = 'DiffEditor';

/** History navigation bar component */
interface DiffHistoryBarProps {
  changes: HistoryChangeEntry[];
  currentIndex: number;
  onSelect: (change: HistoryChangeEntry) => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

const DiffHistoryBar: React.FC<DiffHistoryBarProps> = memo(({
  changes,
  currentIndex,
  onSelect,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}) => {
  const currentChange = changes[currentIndex];
  
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-surface-base)] border-b border-[var(--color-border-subtle)]">
      <div className="flex items-center gap-1">
        <History size={12} className="text-[var(--color-accent-primary)]" />
        <span className="text-[10px] font-medium text-[var(--color-text-muted)]">
          History
        </span>
      </div>
      
      <button
        onClick={onPrev}
        disabled={!hasPrev}
        className={cn(
          'p-0.5 rounded transition-colors',
          hasPrev 
            ? 'hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            : 'text-[var(--color-text-dim)] cursor-not-allowed'
        )}
        title="Previous version (Alt+←)"
      >
        <ChevronLeft size={14} />
      </button>
      
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {changes.map((change, idx) => (
          <button
            key={change.id}
            onClick={() => onSelect(change)}
            className={cn(
              'w-2 h-2 rounded-full transition-all',
              idx === currentIndex
                ? 'bg-[var(--color-accent-primary)] scale-125'
                : change.status === 'undone'
                  ? 'bg-[var(--color-warning)]/50 hover:bg-[var(--color-warning)]'
                  : 'bg-[var(--color-surface-3)] hover:bg-[var(--color-text-muted)]'
            )}
            title={`${change.description} - ${formatRelativeTime(change.timestamp)}`}
          />
        ))}
      </div>
      
      <button
        onClick={onNext}
        disabled={!hasNext}
        className={cn(
          'p-0.5 rounded transition-colors',
          hasNext 
            ? 'hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            : 'text-[var(--color-text-dim)] cursor-not-allowed'
        )}
        title="Next version (Alt+→)"
      >
        <ChevronRight size={14} />
      </button>
      
      <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
        <span className="font-mono">{currentIndex + 1}/{changes.length}</span>
        {currentChange && (
          <>
            <span className="text-[var(--color-text-dim)]">•</span>
            <span className="truncate max-w-[150px]" title={currentChange.description}>
              {currentChange.description}
            </span>
            <span className={cn(
              'px-1 py-0.5 rounded text-[9px]',
              currentChange.status === 'undoable' && 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]',
              currentChange.status === 'undone' && 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
              currentChange.status === 'redoable' && 'bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]'
            )}>
              {currentChange.status}
            </span>
          </>
        )}
      </div>
    </div>
  );
});

DiffHistoryBar.displayName = 'DiffHistoryBar';
