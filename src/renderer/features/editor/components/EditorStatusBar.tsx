/**
 * Editor Status Bar Component
 * 
 * VS Code-like status bar showing cursor position, selection info,
 * language, encoding, line ending, and editor toggles.
 */

import React, { memo, useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
  Type,
  WrapText,
  Map,
  ZoomIn,
  ZoomOut,
  Save,
  RotateCcw,
  Code2,
  Eye,
  GitCompare,
  Columns,
  ChevronDown,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { EditorTab, EditorViewMode } from '../store/editorStore';

// =============================================================================
// Types
// =============================================================================

interface EditorStatusBarProps {
  tab: EditorTab;
  wordWrap: 'on' | 'off';
  showMinimap: boolean;
  fontSize: number;
  onSave: () => void;
  onRevert: () => void;
  onToggleWordWrap: () => void;
  onToggleMinimap: () => void;
  onIncreaseFontSize: () => void;
  onDecreaseFontSize: () => void;
  onSetViewMode: (mode: EditorViewMode) => void;
  onChangeLineEnding?: (lineEnding: 'LF' | 'CRLF') => void;
  onChangeEncoding?: (encoding: string) => void;
}

// =============================================================================
// Status Item Component
// =============================================================================

interface StatusItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  active?: boolean;
  className?: string;
}

const StatusItem = memo<StatusItemProps>(({ children, onClick, title, active, className }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    title={title}
    className={cn(
      'flex items-center gap-1 px-1.5 py-0 h-full text-[10px] font-mono',
      'transition-colors duration-75',
      onClick
        ? 'hover:bg-[var(--color-surface-2)] cursor-pointer'
        : 'cursor-default',
      active
        ? 'text-[var(--color-accent-primary)]'
        : 'text-[var(--color-text-dim)]',
      className
    )}
  >
    {children}
  </button>
));
StatusItem.displayName = 'StatusItem';

// =============================================================================
// Language Selector
// =============================================================================

const LanguageSelector = memo<{ language: string }>(({ language }) => {
  const displayLang = useMemo(() => {
    const langMap: Record<string, string> = {
      typescript: 'TypeScript',
      typescriptreact: 'TypeScript React',
      javascript: 'JavaScript',
      javascriptreact: 'JavaScript React',
      json: 'JSON',
      markdown: 'Markdown',
      css: 'CSS',
      scss: 'SCSS',
      less: 'LESS',
      html: 'HTML',
      xml: 'XML',
      python: 'Python',
      ruby: 'Ruby',
      go: 'Go',
      rust: 'Rust',
      java: 'Java',
      kotlin: 'Kotlin',
      swift: 'Swift',
      c: 'C',
      cpp: 'C++',
      csharp: 'C#',
      php: 'PHP',
      sql: 'SQL',
      yaml: 'YAML',
      toml: 'TOML',
      shell: 'Shell',
      powershell: 'PowerShell',
      bat: 'Batch',
      vue: 'Vue',
      svelte: 'Svelte',
      graphql: 'GraphQL',
      dockerfile: 'Dockerfile',
      plaintext: 'Plain Text',
    };
    return langMap[language] ?? language;
  }, [language]);

  return (
    <StatusItem title={`Language: ${displayLang}`}>
      <Code2 size={10} />
      <span>{displayLang}</span>
    </StatusItem>
  );
});
LanguageSelector.displayName = 'LanguageSelector';

// =============================================================================
// Editor Status Bar
// =============================================================================

export const EditorStatusBar: React.FC<EditorStatusBarProps> = memo(({
  tab,
  wordWrap,
  showMinimap,
  fontSize,
  onSave,
  onRevert,
  onToggleWordWrap,
  onToggleMinimap,
  onIncreaseFontSize,
  onDecreaseFontSize,
  onSetViewMode,
  onChangeLineEnding,
  onChangeEncoding,
}) => {
  const [lineEndingOpen, setLineEndingOpen] = useState(false);
  const [encodingOpen, setEncodingOpen] = useState(false);
  const lineEndingRef = useRef<HTMLDivElement>(null);
  const encodingRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    if (!lineEndingOpen && !encodingOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (lineEndingOpen && lineEndingRef.current && !lineEndingRef.current.contains(e.target as Node)) {
        setLineEndingOpen(false);
      }
      if (encodingOpen && encodingRef.current && !encodingRef.current.contains(e.target as Node)) {
        setEncodingOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [lineEndingOpen, encodingOpen]);
  // Cursor position display
  const cursorInfo = useMemo(() => {
    if (!tab.cursorPosition) return 'Ln 1, Col 1';
    return `Ln ${tab.cursorPosition.line}, Col ${tab.cursorPosition.column}`;
  }, [tab.cursorPosition]);

  // Selection info
  const selectionInfo = useMemo(() => {
    if (!tab.selection) return null;
    const { startLine, startColumn, endLine, endColumn } = tab.selection;
    if (startLine === endLine) {
      const chars = endColumn - startColumn;
      return `${chars} selected`;
    }
    const lines = endLine - startLine + 1;
    return `${lines} lines selected`;
  }, [tab.selection]);

  // Line count
  const lineCount = useMemo(() => {
    return tab.lineCount ?? (tab.content?.split('\n').length ?? 0);
  }, [tab.lineCount, tab.content]);

  return (
    <div className={cn(
      'flex items-center justify-between h-[22px] px-1',
      'bg-[var(--color-surface-1)] border-t border-[var(--color-border-subtle)]/40',
      'select-none shrink-0'
    )}>
      {/* Left section */}
      <div className="flex items-center h-full">
        {/* Cursor position */}
        <StatusItem title="Cursor position">
          <span>{cursorInfo}</span>
        </StatusItem>

        {/* Selection info */}
        {selectionInfo && (
          <StatusItem title="Selection">
            <span className="text-[var(--color-accent-primary)]">{selectionInfo}</span>
          </StatusItem>
        )}

        {/* Separator */}
        <div className="w-px h-3 bg-[var(--color-border-subtle)]/30 mx-0.5" />

        {/* Line count */}
        <StatusItem title={`${lineCount} lines`}>
          <span>{lineCount} lines</span>
        </StatusItem>
      </div>

      {/* Right section */}
      <div className="flex items-center h-full">
        {/* Save indicator */}
        {tab.isDirty && (
          <StatusItem
            onClick={onSave}
            title="Save (Ctrl+S)"
            active
          >
            <Save size={10} />
            <span>{tab.isSaving ? 'saving' : 'unsaved'}</span>
          </StatusItem>
        )}

        {/* Revert */}
        {tab.isDirty && (
          <StatusItem onClick={onRevert} title="Revert changes">
            <RotateCcw size={10} />
          </StatusItem>
        )}

        {/* Separator */}
        <div className="w-px h-3 bg-[var(--color-border-subtle)]/30 mx-0.5" />

        {/* View mode selector */}
        <StatusItem
          onClick={() => onSetViewMode('code')}
          title="Code view"
          active={tab.viewMode === 'code'}
        >
          <Code2 size={10} />
        </StatusItem>
        <StatusItem
          onClick={() => onSetViewMode('diff')}
          title="Diff view"
          active={tab.viewMode === 'diff'}
        >
          <GitCompare size={10} />
        </StatusItem>
        <StatusItem
          onClick={() => onSetViewMode('preview')}
          title="Preview"
          active={tab.viewMode === 'preview'}
        >
          <Eye size={10} />
        </StatusItem>

        {/* Separator */}
        <div className="w-px h-3 bg-[var(--color-border-subtle)]/30 mx-0.5" />

        {/* Font size */}
        <StatusItem onClick={onDecreaseFontSize} title="Decrease font size">
          <ZoomOut size={10} />
        </StatusItem>
        <StatusItem title={`Font size: ${fontSize}`}>
          <span>{fontSize}px</span>
        </StatusItem>
        <StatusItem onClick={onIncreaseFontSize} title="Increase font size">
          <ZoomIn size={10} />
        </StatusItem>

        {/* Separator */}
        <div className="w-px h-3 bg-[var(--color-border-subtle)]/30 mx-0.5" />

        {/* Word wrap toggle */}
        <StatusItem
          onClick={onToggleWordWrap}
          title={`Word wrap: ${wordWrap}`}
          active={wordWrap === 'on'}
        >
          <WrapText size={10} />
        </StatusItem>

        {/* Minimap toggle */}
        <StatusItem
          onClick={onToggleMinimap}
          title={`Minimap: ${showMinimap ? 'shown' : 'hidden'}`}
          active={showMinimap}
        >
          <Map size={10} />
        </StatusItem>

        {/* Separator */}
        <div className="w-px h-3 bg-[var(--color-border-subtle)]/30 mx-0.5" />

        {/* Line ending — clickable dropdown */}
        <div className="relative" ref={lineEndingRef}>
          <StatusItem
            onClick={onChangeLineEnding ? () => setLineEndingOpen(prev => !prev) : undefined}
            title={`Line ending: ${tab.lineEnding ?? 'LF'}${onChangeLineEnding ? ' (click to change)' : ''}`}
          >
            <span>{tab.lineEnding ?? 'LF'}</span>
            {onChangeLineEnding && <ChevronDown size={8} />}
          </StatusItem>
          {lineEndingOpen && (
            <div className="absolute bottom-full right-0 mb-1 bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]/60 rounded shadow-[var(--shadow-dropdown)] py-0.5 min-w-[80px] z-50">
              {(['LF', 'CRLF'] as const).map(le => (
                <button
                  key={le}
                  type="button"
                  onClick={() => { onChangeLineEnding?.(le); setLineEndingOpen(false); }}
                  className={cn(
                    'w-full text-left px-2 py-1 text-[10px] font-mono',
                    'hover:bg-[var(--color-surface-2)] transition-colors',
                    (tab.lineEnding ?? 'LF') === le
                      ? 'text-[var(--color-accent-primary)]'
                      : 'text-[var(--color-text-secondary)]',
                  )}
                >
                  {le}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Encoding — clickable dropdown */}
        <div className="relative" ref={encodingRef}>
          <StatusItem
            onClick={onChangeEncoding ? () => setEncodingOpen(prev => !prev) : undefined}
            title={`Encoding: ${tab.encoding ?? 'UTF-8'}${onChangeEncoding ? ' (click to change)' : ''}`}
          >
            <span>{tab.encoding ?? 'UTF-8'}</span>
            {onChangeEncoding && <ChevronDown size={8} />}
          </StatusItem>
          {encodingOpen && (
            <div className="absolute bottom-full right-0 mb-1 bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]/60 rounded shadow-[var(--shadow-dropdown)] py-0.5 min-w-[100px] z-50 max-h-[200px] overflow-auto scrollbar-thin">
              {['UTF-8', 'UTF-16 LE', 'UTF-16 BE', 'ASCII', 'ISO-8859-1', 'Windows-1252', 'Shift_JIS', 'EUC-JP', 'GB2312', 'Big5', 'KOI8-R'].map(enc => (
                <button
                  key={enc}
                  type="button"
                  onClick={() => { onChangeEncoding?.(enc); setEncodingOpen(false); }}
                  className={cn(
                    'w-full text-left px-2 py-1 text-[10px] font-mono',
                    'hover:bg-[var(--color-surface-2)] transition-colors',
                    (tab.encoding ?? 'UTF-8') === enc
                      ? 'text-[var(--color-accent-primary)]'
                      : 'text-[var(--color-text-secondary)]',
                  )}
                >
                  {enc}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Language */}
        <LanguageSelector language={tab.language} />
      </div>
    </div>
  );
});

EditorStatusBar.displayName = 'EditorStatusBar';
