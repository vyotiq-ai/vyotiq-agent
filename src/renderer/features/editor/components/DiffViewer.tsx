/**
 * DiffViewer Component
 * 
 * Monaco-based diff editor with modern features:
 * - Split view (side-by-side) and unified view modes
 * - Word-level highlighting for precise change detection
 * - Navigation between changes
 * - Accept/Reject actions
 */

import React, { useRef, useEffect, useCallback, useState, memo, useMemo } from 'react';
import * as monaco from 'monaco-editor';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  SplitSquareHorizontal,
  AlignJustify,
  RotateCcw,
  FileCode,
  Loader2,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { RendererLogger } from '../../../utils/logger';
import { registerCustomThemes } from '../utils/themeUtils';
import type { EditorSettings } from '../types';

const logger = new RendererLogger('diff-viewer');

let themesRegistered = false;
function ensureThemesRegistered() {
  if (!themesRegistered) {
    registerCustomThemes(monaco);
    themesRegistered = true;
  }
}

export type DiffViewMode = 'split' | 'unified';

export interface DiffViewerProps {
  original: string;
  modified: string;
  language?: string;
  originalLabel?: string;
  modifiedLabel?: string;
  settings?: Partial<EditorSettings>;
  viewMode?: DiffViewMode;
  onAcceptAll?: () => void;
  onRejectAll?: () => void;
  onCopy?: (content: string, type: 'original' | 'modified') => void;
  readOnly?: boolean;
  className?: string;
  height?: string | number;
}

export const DiffViewer: React.FC<DiffViewerProps> = memo(({
  original,
  modified,
  language = 'plaintext',
  originalLabel = 'Original',
  modifiedLabel = 'Modified',
  settings = {},
  viewMode: initialViewMode = 'split',
  onAcceptAll,
  onRejectAll,
  onCopy,
  readOnly = true,
  className,
  height = '100%',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  
  const [viewMode, setViewMode] = useState<DiffViewMode>(initialViewMode);
  const [copied, setCopied] = useState<'original' | 'modified' | null>(null);
  const [diffStats, setDiffStats] = useState({ additions: 0, deletions: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const computeDiffStats = useCallback((editor: monaco.editor.IStandaloneDiffEditor) => {
    try {
      const lineChanges = editor.getLineChanges();
      if (!lineChanges) {
        setDiffStats({ additions: 0, deletions: 0 });
        return;
      }

      let additions = 0;
      let deletions = 0;

      lineChanges.forEach(change => {
        if (change.originalStartLineNumber === 0 || change.originalEndLineNumber === 0) {
          additions += change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1;
        } else if (change.modifiedStartLineNumber === 0 || change.modifiedEndLineNumber === 0) {
          deletions += change.originalEndLineNumber - change.originalStartLineNumber + 1;
        } else {
          const origLines = change.originalEndLineNumber - change.originalStartLineNumber + 1;
          const modLines = change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1;
          if (modLines > origLines) additions += modLines - origLines;
          else if (origLines > modLines) deletions += origLines - modLines;
        }
      });

      setDiffStats({ additions, deletions });
    } catch (err) {
      logger.warn('Failed to compute diff stats', { error: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  // Create diff editor - only recreate when content/language changes
  useEffect(() => {
    if (!containerRef.current) return;

    setIsLoading(true);
    ensureThemesRegistered();

    // Set theme globally for Monaco
    monaco.editor.setTheme(settings.theme || 'vyotiq-dark');

    const originalModel = monaco.editor.createModel(original, language);
    const modifiedModel = monaco.editor.createModel(modified, language);

    const diffEditor = monaco.editor.createDiffEditor(containerRef.current, {
      fontSize: settings.fontSize || 13,
      fontFamily: settings.fontFamily || "'JetBrains Mono', 'Fira Code', monospace",
      readOnly,
      renderSideBySide: viewMode === 'split',
      enableSplitViewResizing: true,
      ignoreTrimWhitespace: false,
      renderIndicators: true,
      originalEditable: false,
      lineNumbers: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      padding: { top: 8, bottom: 8 },
      folding: true,
      glyphMargin: true,
      renderWhitespace: 'selection',
      diffAlgorithm: 'advanced',
      // Unicode highlighting - consistent with MonacoEditor
      unicodeHighlight: {
        ambiguousCharacters: false,
        invisibleCharacters: true,
        nonBasicASCII: false,
        includeComments: false,
        includeStrings: false,
        allowedCharacters: {
          '\u251C': true, '\u2502': true, '\u2514': true, '\u2500': true, '\u250C': true, '\u2510': true,
          '\u2518': true, '\u2524': true, '\u252C': true, '\u2534': true, '\u253C': true,
          '\u2554': true, '\u2557': true, '\u255A': true, '\u255D': true, '\u2551': true, '\u2550': true,
          '\u2192': true, '\u2190': true, '\u2191': true, '\u2193': true, '\u21D2': true, '\u21D0': true,
          '\u2713': true, '\u2717': true, '\u2714': true, '\u2718': true,
          '\u2022': true, '\u25E6': true, '\u25AA': true, '\u25AB': true,
          '\u00A9': true, '\u00AE': true, '\u2122': true,
          '\u00B0': true, '\u00B1': true, '\u00D7': true, '\u00F7': true,
          '\u2026': true, '\u2014': true, '\u2013': true,
          '\u2018': true, '\u2019': true, '\u201C': true, '\u201D': true,
          '\u00AB': true, '\u00BB': true,
          '\u20AC': true, '\u00A3': true, '\u00A5': true,
        },
        allowedLocales: { _os: true, _vscode: true },
      },
    });

    diffEditor.setModel({ original: originalModel, modified: modifiedModel });
    diffEditorRef.current = diffEditor;

    const updateDisposable = diffEditor.onDidUpdateDiff(() => {
      computeDiffStats(diffEditor);
      setIsLoading(false);
    });

    setTimeout(() => {
      computeDiffStats(diffEditor);
      setIsLoading(false);
    }, 100);

    return () => {
      updateDisposable.dispose();
      diffEditor.dispose();
      originalModel.dispose();
      modifiedModel.dispose();
      diffEditorRef.current = null;
    };
    // Note: settings and viewMode are handled by separate effects to avoid full recreation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original, modified, language, readOnly, computeDiffStats]);

  useEffect(() => {
    if (diffEditorRef.current) {
      diffEditorRef.current.updateOptions({ renderSideBySide: viewMode === 'split' });
    }
  }, [viewMode]);

  useEffect(() => {
    if (diffEditorRef.current) {
      // Theme must be set globally, not via updateOptions
      monaco.editor.setTheme(settings.theme || 'vyotiq-dark');
      diffEditorRef.current.updateOptions({
        fontSize: settings.fontSize || 13,
        fontFamily: settings.fontFamily || "'JetBrains Mono', 'Fira Code', monospace",
      });
    }
  }, [settings]);

  const handleCopy = useCallback(async (type: 'original' | 'modified') => {
    const content = type === 'original' ? original : modified;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
      onCopy?.(content, type);
    } catch (err) {
      logger.error('Failed to copy', { error: err instanceof Error ? err.message : String(err) });
    }
  }, [original, modified, onCopy]);

  const navigateChange = useCallback((direction: 'next' | 'prev') => {
    if (!diffEditorRef.current) return;
    
    const lineChanges = diffEditorRef.current.getLineChanges();
    if (!lineChanges || lineChanges.length === 0) return;

    const modifiedEditor = diffEditorRef.current.getModifiedEditor();
    const currentLine = modifiedEditor.getPosition()?.lineNumber || 1;

    let targetChange: monaco.editor.ILineChange | null = null;

    if (direction === 'next') {
      targetChange = lineChanges.find(c => c.modifiedStartLineNumber > currentLine) || lineChanges[0];
    } else {
      const reversed = [...lineChanges].reverse();
      targetChange = reversed.find(c => c.modifiedStartLineNumber < currentLine) || lineChanges[lineChanges.length - 1];
    }

    if (targetChange) {
      modifiedEditor.revealLineInCenter(targetChange.modifiedStartLineNumber);
      modifiedEditor.setPosition({ lineNumber: targetChange.modifiedStartLineNumber, column: 1 });
    }
  }, []);

  const hasChanges = useMemo(() => original !== modified, [original, modified]);

  return (
    <div className={cn('flex flex-col bg-[var(--color-surface-base)] font-mono', className)} style={{ height }}>
      {/* Header bar - clean, modern design */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--color-border-subtle)]/30 bg-gradient-to-r from-[var(--color-surface-1)]/70 via-[var(--color-surface-1)]/60 to-[var(--color-surface-1)]/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <FileCode size={14} className="text-[#61afef]" />
            <span className="text-[11px] text-[var(--color-text-secondary)] font-medium">
              {originalLabel}
              <span className="text-[var(--color-text-dim)]/50 mx-1.5">→</span>
              {modifiedLabel}
            </span>
          </div>
          
          {/* Diff stats - enhanced display with icons */}
          {!isLoading && hasChanges && (
            <div className="flex items-center gap-2.5 text-[10px] font-mono tabular-nums">
              {diffStats.additions > 0 && (
                <span className="text-[#98c379] font-semibold">
                  add {diffStats.additions}
                </span>
              )}
              {diffStats.deletions > 0 && (
                <span className="text-[#e06c75] font-semibold">
                  remove {diffStats.deletions}
                </span>
              )}
            </div>
          )}
          
          {!hasChanges && !isLoading && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-surface-2)]/60 text-[var(--color-text-muted)] ring-1 ring-inset ring-[var(--color-border-subtle)]/20">
              No changes
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* View mode toggle - refined button group */}
          <div className="flex items-center border border-[var(--color-border-subtle)]/40 rounded-md overflow-hidden bg-[var(--color-surface-1)]/30">
            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={cn(
                'p-1.5 transition-all duration-150',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/30',
                viewMode === 'split' 
                  ? 'bg-[var(--color-surface-2)] text-[var(--color-accent-primary)]' 
                  : 'text-[var(--color-text-dim)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]/50'
              )}
              title="Split view (side-by-side)"
              aria-label="Split view mode"
            >
              <SplitSquareHorizontal size={14} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('unified')}
              className={cn(
                'p-1.5 transition-all duration-150',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/30',
                viewMode === 'unified' 
                  ? 'bg-[var(--color-surface-2)] text-[var(--color-accent-primary)]' 
                  : 'text-[var(--color-text-dim)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]/50'
              )}
              title="Unified view (inline)"
            >
              <AlignJustify size={14} />
            </button>
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center border-l border-[var(--color-border-subtle)]/30 ml-1.5 pl-1.5">
            <button
              type="button"
              onClick={() => navigateChange('prev')}
              className="p-1.5 rounded-md text-[var(--color-text-dim)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]/60 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/30"
              title="Previous change"
              aria-label="Navigate to previous change"
              disabled={!hasChanges}
            >
              <ChevronUp size={14} />
            </button>
            <button
              type="button"
              onClick={() => navigateChange('next')}
              className="p-1.5 rounded-md text-[var(--color-text-dim)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]/60 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/30"
              title="Next change"
              aria-label="Navigate to next change"
              disabled={!hasChanges}
            >
              <ChevronDown size={14} />
            </button>
          </div>

          {/* Copy button */}
          <div className="flex items-center border-l border-[var(--color-border-subtle)]/30 ml-1.5 pl-1.5">
            <button
              type="button"
              onClick={() => handleCopy('modified')}
              className={cn(
                'p-1.5 rounded-md transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/30',
                copied === 'modified' 
                  ? 'text-[#98c379]' 
                  : 'text-[var(--color-text-dim)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]/60'
              )}
              title="Copy modified content"
              aria-label="Copy modified content to clipboard"
            >
              {copied === 'modified' ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>

          {/* Accept/Reject actions */}
          {(onAcceptAll || onRejectAll) && hasChanges && (
            <div className="flex items-center border-l border-[var(--color-border-subtle)]/30 ml-1.5 pl-1.5 gap-1.5">
              {onRejectAll && (
                <button
                  type="button"
                  onClick={onRejectAll}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-medium transition-all duration-150',
                    'text-[#e06c75] bg-[#e06c75]/10 border border-[#e06c75]/20',
                    'hover:bg-[#e06c75]/20 hover:border-[#e06c75]/30',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#e06c75]/30'
                  )}
                  title="Reject all changes"
                  aria-label="Reject all changes"
                >
                  <RotateCcw size={11} />
                  <span>Reject</span>
                </button>
              )}
              {onAcceptAll && (
                <button
                  type="button"
                  onClick={onAcceptAll}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-medium transition-all duration-150',
                    'text-[#98c379] bg-[#98c379]/10 border border-[#98c379]/20',
                    'hover:bg-[#98c379]/20 hover:border-[#98c379]/30',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#98c379]/30'
                  )}
                  title="Accept all changes"
                  aria-label="Accept all changes"
                >
                  <Check size={11} />
                  <span>Accept</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Monaco diff editor container */}
      <div className="flex-1 min-h-0 relative">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--color-surface-base)]/80 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-[11px]">Computing diff...</span>
            </div>
          </div>
        )}
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  );
});

DiffViewer.displayName = 'DiffViewer';
