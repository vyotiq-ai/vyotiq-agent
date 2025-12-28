/**
 * DiffEditor Component
 * 
 * Monaco Diff Editor for showing file changes with:
 * - Side-by-side and inline view modes
 * - Syntax highlighting
 * - Navigation between changes
 */

import React, { useRef, useEffect, useCallback, memo } from 'react';
import * as monaco from 'monaco-editor';
import { X, Columns, AlignJustify, RefreshCw, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { registerCustomThemes } from '../utils/themeUtils';
import { getLanguageFromPath, getFileName } from '../utils/languageUtils';
import type { FileDiff, DiffViewMode, EditorSettings } from '../types';
import { Loader2 } from 'lucide-react';

// Ensure themes are registered
let themesRegistered = false;
function ensureThemesRegistered() {
  if (!themesRegistered) {
    registerCustomThemes(monaco);
    themesRegistered = true;
  }
}

interface DiffEditorProps {
  diff: FileDiff;
  settings: EditorSettings;
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  onClose: () => void;
  onRefresh: () => void;
  className?: string;
}

export const DiffEditor: React.FC<DiffEditorProps> = memo(({
  diff,
  settings,
  viewMode,
  onViewModeChange,
  onClose,
  onRefresh,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  
  const language = getLanguageFromPath(diff.path);
  const fileName = getFileName(diff.path);
  
  // Initialize diff editor
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

    return () => {
      editor.dispose();
      originalModel.dispose();
      modifiedModel.dispose();
      editorRef.current = null;
    };
  }, [diff.isLoading, diff.original, diff.modified, diff.path]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update view mode
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({
        renderSideBySide: viewMode === 'side-by-side',
      });
    }
  }, [viewMode]);

  // Update theme
  useEffect(() => {
    monaco.editor.setTheme(settings.theme);
  }, [settings.theme]);

  // Update editor options
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
  
  // Navigate to next change
  const goToNextChange = useCallback(() => {
    if (editorRef.current) {
      const changes = editorRef.current.getLineChanges();
      if (changes && changes.length > 0) {
        const modifiedEditor = editorRef.current.getModifiedEditor();
        const currentLine = modifiedEditor.getPosition()?.lineNumber || 0;
        
        const nextChange = changes.find(change => 
          (change.modifiedStartLineNumber || change.modifiedEndLineNumber) > currentLine
        );
        
        if (nextChange) {
          modifiedEditor.revealLineInCenter(nextChange.modifiedStartLineNumber || nextChange.modifiedEndLineNumber);
          modifiedEditor.setPosition({
            lineNumber: nextChange.modifiedStartLineNumber || nextChange.modifiedEndLineNumber,
            column: 1,
          });
        } else if (changes.length > 0) {
          const firstChange = changes[0];
          modifiedEditor.revealLineInCenter(firstChange.modifiedStartLineNumber || firstChange.modifiedEndLineNumber);
          modifiedEditor.setPosition({
            lineNumber: firstChange.modifiedStartLineNumber || firstChange.modifiedEndLineNumber,
            column: 1,
          });
        }
      }
    }
  }, []);
  
  // Navigate to previous change
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
        } else if (changes.length > 0) {
          const lastChange = changes[changes.length - 1];
          modifiedEditor.revealLineInCenter(lastChange.modifiedStartLineNumber || lastChange.modifiedEndLineNumber);
          modifiedEditor.setPosition({
            lineNumber: lastChange.modifiedStartLineNumber || lastChange.modifiedEndLineNumber,
            column: 1,
          });
        }
      }
    }
  }, []);
  
  // Loading state
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
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-[var(--color-text-primary)]">
            {fileName}
          </span>
          <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
            (diff)
          </span>
        </div>
        
        <div className="flex items-center gap-1">
          {/* Navigation buttons */}
          <button
            onClick={goToPrevChange}
            className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            title="Previous change"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={goToNextChange}
            className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            title="Next change"
          >
            <ChevronDown size={14} />
          </button>
          
          <div className="w-px h-4 bg-[var(--color-border-subtle)] mx-1" />
          
          {/* View mode toggle */}
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
          
          {/* Refresh button */}
          <button
            onClick={onRefresh}
            className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
          
          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            title="Close diff"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      
      {/* Diff editor container */}
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  );
});

DiffEditor.displayName = 'DiffEditor';
