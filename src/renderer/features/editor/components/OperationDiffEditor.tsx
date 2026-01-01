/**
 * OperationDiffEditor Component
 * 
 * Displays file operation diffs (write/edit/create) with action buttons.
 * Shows the diff in a Monaco diff editor with options to:
 * - Open the file in editor
 * - Copy the new content
 * - Close the diff view
 */

import React, { useRef, useEffect, useCallback, memo, useState } from 'react';
import * as monaco from 'monaco-editor';
import { 
  X, 
  Columns, 
  AlignJustify, 
  ExternalLink, 
  Copy, 
  Check,
  FilePlus,
  FileCode,
  Plus,
  Minus,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { registerCustomThemes } from '../utils/themeUtils';
import { getLanguageFromPath, getFileName } from '../utils/languageUtils';
import type { EditorSettings, DiffViewMode } from '../types';
import type { OperationDiff } from '../../../state/EditorProvider';

// Ensure themes are registered
let themesRegistered = false;
function ensureThemesRegistered() {
  if (!themesRegistered) {
    registerCustomThemes(monaco);
    themesRegistered = true;
  }
}

interface OperationDiffEditorProps {
  operationDiff: OperationDiff;
  settings: EditorSettings;
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  onClose: () => void;
  onOpenFile: () => void;
  className?: string;
}

export const OperationDiffEditor: React.FC<OperationDiffEditorProps> = memo(({
  operationDiff,
  settings,
  viewMode,
  onViewModeChange,
  onClose,
  onOpenFile,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const [copied, setCopied] = useState(false);
  
  const language = getLanguageFromPath(operationDiff.path);
  const fileName = getFileName(operationDiff.path);
  
  const isNewFile = !operationDiff.originalContent || operationDiff.originalContent.length === 0;
  
  // Compute diff stats
  const diffStats = React.useMemo(() => {
    const originalLines = operationDiff.originalContent?.split('\n') || [];
    const newLines = operationDiff.newContent.split('\n');
    
    if (isNewFile) {
      return { added: newLines.length, removed: 0 };
    }
    
    let added = 0;
    let removed = 0;
    
    // Simple diff calculation
    const originalSet = new Set(originalLines);
    const newSet = new Set(newLines);
    
    for (const line of newLines) {
      if (!originalSet.has(line)) added++;
    }
    for (const line of originalLines) {
      if (!newSet.has(line)) removed++;
    }
    
    return { added, removed };
  }, [operationDiff.originalContent, operationDiff.newContent, isNewFile]);
  
  // Initialize diff editor
  useEffect(() => {
    if (!containerRef.current) return;

    ensureThemesRegistered();

    const originalContent = operationDiff.originalContent || '';
    const modifiedContent = operationDiff.newContent;

    const originalModel = monaco.editor.createModel(originalContent, language);
    const modifiedModel = monaco.editor.createModel(modifiedContent, language);

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

    // Auto-scroll to first change for better UX
    setTimeout(() => {
      const changes = editor.getLineChanges();
      if (changes && changes.length > 0) {
        const firstChange = changes[0];
        const modifiedEditor = editor.getModifiedEditor();
        const targetLine = firstChange.modifiedStartLineNumber || firstChange.modifiedEndLineNumber;
        modifiedEditor.revealLineInCenter(targetLine);
        modifiedEditor.setPosition({ lineNumber: targetLine, column: 1 });
      }
    }, 100);

    return () => {
      editor.dispose();
      originalModel.dispose();
      modifiedModel.dispose();
      editorRef.current = null;
    };
  }, [operationDiff.originalContent, operationDiff.newContent, operationDiff.path]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update editor options when settings change
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
  
  // Handle copy
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(operationDiff.newContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [operationDiff.newContent]);
  
  // Get action label
  const actionLabel = React.useMemo(() => {
    switch (operationDiff.action) {
      case 'create':
      case 'created':
        return 'Created';
      case 'write':
      case 'modified':
        return 'Modified';
      case 'edit':
        return 'Edited';
      default:
        return isNewFile ? 'Created' : 'Modified';
    }
  }, [operationDiff.action, isNewFile]);
  
  const ActionIcon = isNewFile ? FilePlus : FileCode;
  
  return (
    <div className={cn('flex flex-col h-full bg-[var(--color-surface-1)]', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--color-surface-header)] border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* File icon */}
          <ActionIcon 
            size={14} 
            className={cn(
              isNewFile ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'
            )} 
          />
          
          {/* File name */}
          <span className="text-[12px] font-mono text-[var(--color-text-primary)] truncate">
            {fileName}
          </span>
          
          {/* Action badge */}
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded font-medium',
            isNewFile 
              ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]' 
              : 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]'
          )}>
            {actionLabel}
          </span>
          
          {/* Diff stats */}
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
          
          {/* Full path tooltip */}
          <span 
            className="text-[10px] text-[var(--color-text-dim)] truncate hidden sm:block"
            title={operationDiff.path}
          >
            {operationDiff.path}
          </span>
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* View mode toggle */}
          <button
            type="button"
            className={cn(
              'p-1 rounded text-[var(--color-text-muted)]',
              'hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]',
              'transition-colors'
            )}
            onClick={() => onViewModeChange(viewMode === 'side-by-side' ? 'inline' : 'side-by-side')}
            title={viewMode === 'side-by-side' ? 'Switch to inline view' : 'Switch to side-by-side view'}
          >
            {viewMode === 'side-by-side' ? <AlignJustify size={14} /> : <Columns size={14} />}
          </button>
          
          {/* Copy button */}
          <button
            type="button"
            className={cn(
              'p-1 rounded text-[var(--color-text-muted)]',
              'hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]',
              'transition-colors'
            )}
            onClick={handleCopy}
            title="Copy new content"
          >
            {copied ? <Check size={14} className="text-[var(--color-success)]" /> : <Copy size={14} />}
          </button>
          
          {/* Open in editor button */}
          <button
            type="button"
            className={cn(
              'p-1 rounded text-[var(--color-text-muted)]',
              'hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]',
              'transition-colors'
            )}
            onClick={onOpenFile}
            title="Open file in editor"
          >
            <ExternalLink size={14} />
          </button>
          
          {/* Close button */}
          <button
            type="button"
            className={cn(
              'p-1 rounded text-[var(--color-text-muted)]',
              'hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]',
              'transition-colors'
            )}
            onClick={onClose}
            title="Close diff view"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      
      {/* Diff editor */}
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  );
});

OperationDiffEditor.displayName = 'OperationDiffEditor';
