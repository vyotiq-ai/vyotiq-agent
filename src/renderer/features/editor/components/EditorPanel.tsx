/**
 * Editor Panel Component
 * 
 * Tabbed code viewer with syntax-highlighted file content display.
 * Supports preview tabs, diff view mode, and code view.
 */

import React, { memo, useCallback, useMemo, useRef, useEffect } from 'react';
import { X, FileText, Eye, Code2, GitCompare } from 'lucide-react';
import hljs from 'highlight.js';
import { cn } from '../../../utils/cn';
import { useEditorStore, openFile as openFileAction, type EditorViewMode } from '../store/editorStore';
import { MarkdownRenderer } from '../../../components/ui/MarkdownRenderer';

// =============================================================================
// Imperative API — exported for use across the app
// =============================================================================

/**
 * Open a file in the editor panel
 */
export function openFileInEditor(filePath: string, options?: { preview?: boolean; viewMode?: EditorViewMode }): void {
  openFileAction(filePath, options);
}

// =============================================================================
// Sub-components
// =============================================================================

interface TabProps {
  id: string;
  fileName: string;
  isActive: boolean;
  isPreview: boolean;
  isDirty: boolean;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
}

const Tab = memo<TabProps>(({ fileName, isActive, isPreview, isDirty, onClick, onClose }) => (
  <button
    onClick={onClick}
    className={cn(
      'group flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono',
      'border-r border-[var(--color-border-subtle)]/30',
      'transition-colors duration-100',
      isActive
        ? 'bg-[var(--color-surface-base)] text-[var(--color-text-primary)] border-b-2 border-b-[var(--color-accent-primary)]'
        : 'bg-[var(--color-surface-1)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-secondary)]',
      isPreview && 'italic'
    )}
    title={fileName}
    aria-selected={isActive}
    role="tab"
  >
    <FileText size={11} className="flex-shrink-0 opacity-60" />
    <span className="truncate max-w-[120px]">{fileName}</span>
    {isDirty && (
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent-primary)] flex-shrink-0" />
    )}
    <span
      onClick={onClose}
      className={cn(
        'ml-0.5 p-0.5 rounded-sm flex-shrink-0',
        'opacity-0 group-hover:opacity-100 transition-opacity',
        'hover:bg-[var(--color-surface-3)] text-[var(--color-text-dim)]',
        isActive && 'opacity-60'
      )}
      role="button"
      aria-label={`Close ${fileName}`}
    >
      <X size={10} />
    </span>
  </button>
));
Tab.displayName = 'Tab';

// =============================================================================
// Syntax-highlighted code viewer
// =============================================================================

/** Map editor store language names to highlight.js language identifiers */
function mapLanguage(lang: string): string {
  const map: Record<string, string> = {
    typescriptreact: 'typescript', javascriptreact: 'javascript',
    shell: 'bash', batch: 'dos', plaintext: 'plaintext',
  };
  return map[lang] ?? lang;
}

const HighlightedCode = memo<{ content: string; language: string }>(({ content, language }) => {
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!codeRef.current || !content) return;
    const hljsLang = mapLanguage(language);
    try {
      if (hljsLang !== 'plaintext' && hljs.getLanguage(hljsLang)) {
        const result = hljs.highlight(content, { language: hljsLang, ignoreIllegals: true });
        codeRef.current.innerHTML = result.value;
      } else {
        codeRef.current.textContent = content;
      }
    } catch {
      codeRef.current.textContent = content;
    }
  }, [content, language]);

  const lines = content.split('\n');

  return (
    <div className="flex h-[calc(100%-28px)] overflow-auto">
      {/* Line numbers gutter */}
      <div className="flex-shrink-0 select-none pr-3 pl-3 pt-3 pb-3 text-right border-r border-[var(--color-border-subtle)]/20 bg-[var(--color-surface-1)]/30">
        {lines.map((_, i) => (
          <div key={i} className="text-[10px] font-mono leading-relaxed text-[var(--color-text-dim)] opacity-50">
            {i + 1}
          </div>
        ))}
      </div>
      {/* Code content with syntax highlighting */}
      <pre className="flex-1 p-3 text-[11px] font-mono leading-relaxed whitespace-pre overflow-x-auto">
        <code ref={codeRef} className={cn('hljs', `language-${mapLanguage(language)}`)}>{content}</code>
      </pre>
    </div>
  );
});
HighlightedCode.displayName = 'HighlightedCode';

// =============================================================================
// Inline Diff Viewer for editor panel
// =============================================================================

const InlineDiffView = memo<{ original: string; modified: string; language: string }>(({ original, modified }) => {
  const originalLines = (original || '').split('\n');
  const modifiedLines = (modified || '').split('\n');

  // Simple line-by-line diff (added/removed/unchanged)
  const diffLines = useMemo(() => {
    const result: Array<{ type: 'added' | 'removed' | 'unchanged'; content: string; lineNum: number }> = [];
    const maxLen = Math.max(originalLines.length, modifiedLines.length);
    let origIdx = 0;
    let modIdx = 0;

    while (origIdx < originalLines.length || modIdx < modifiedLines.length) {
      const origLine = origIdx < originalLines.length ? originalLines[origIdx] : undefined;
      const modLine = modIdx < modifiedLines.length ? modifiedLines[modIdx] : undefined;

      if (origLine === modLine) {
        result.push({ type: 'unchanged', content: modLine ?? '', lineNum: modIdx + 1 });
        origIdx++;
        modIdx++;
      } else if (origLine !== undefined && !modifiedLines.includes(origLine)) {
        result.push({ type: 'removed', content: origLine, lineNum: origIdx + 1 });
        origIdx++;
      } else if (modLine !== undefined && !originalLines.includes(modLine)) {
        result.push({ type: 'added', content: modLine, lineNum: modIdx + 1 });
        modIdx++;
      } else {
        // Changed line
        if (origLine !== undefined) {
          result.push({ type: 'removed', content: origLine, lineNum: origIdx + 1 });
          origIdx++;
        }
        if (modLine !== undefined) {
          result.push({ type: 'added', content: modLine, lineNum: modIdx + 1 });
          modIdx++;
        }
      }

      // Safety: prevent infinite loop on very large files
      if (result.length > maxLen * 3) break;
    }
    return result;
  }, [originalLines, modifiedLines]);

  if (!original && !modified) {
    return (
      <div className="flex items-center justify-center h-[calc(100%-28px)] text-[var(--color-text-dim)] text-[10px] font-mono">
        <div className="text-center space-y-1">
          <GitCompare size={16} className="mx-auto opacity-40" />
          <p>no changes detected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100%-28px)] overflow-auto">
      <pre className="text-[11px] font-mono leading-relaxed">
        {diffLines.map((line, i) => (
          <div
            key={i}
            className={cn(
              'flex',
              line.type === 'added' && 'bg-[var(--color-diff-added-bg)] text-[var(--color-diff-added-text)]',
              line.type === 'removed' && 'bg-[var(--color-diff-removed-bg)] text-[var(--color-diff-removed-text)]',
              line.type === 'unchanged' && 'text-[var(--color-text-secondary)]',
            )}
          >
            <span className="w-8 text-right pr-2 flex-shrink-0 select-none text-[10px] opacity-50">
              {line.lineNum}
            </span>
            <span className="w-4 flex-shrink-0 select-none text-center text-[10px] opacity-70">
              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
            </span>
            <span className="flex-1 whitespace-pre px-2">{line.content}</span>
          </div>
        ))}
      </pre>
    </div>
  );
});
InlineDiffView.displayName = 'InlineDiffView';

// =============================================================================
// Markdown Preview
// =============================================================================

const PREVIEW_LANGUAGES = new Set(['markdown', 'html']);

const MarkdownPreview = memo<{ content: string; language: string }>(({ content, language }) => {
  if (language === 'html') {
    return (
      <div className="p-4 h-[calc(100%-28px)] overflow-auto">
        <div className="prose prose-sm prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: content }} />
      </div>
    );
  }
  return (
    <div className="p-4 h-[calc(100%-28px)] overflow-auto">
      <MarkdownRenderer content={content} />
    </div>
  );
});
MarkdownPreview.displayName = 'MarkdownPreview';

export const EditorPanel: React.FC = memo(() => {
  const { state, closeTab, setActiveTab, closeAllTabs } = useEditorStore();
  const activeTab = useMemo(
    () => state.tabs.find(t => t.id === state.activeTabId),
    [state.tabs, state.activeTabId]
  );

  const handleTabClose = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    closeTab(tabId);
  }, [closeTab]);

  if (state.tabs.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface-base)] border-l border-[var(--color-border-subtle)]/40">
      {/* Tab bar */}
      <div className="flex items-center bg-[var(--color-surface-1)] border-b border-[var(--color-border-subtle)]/40 overflow-x-auto scrollbar-none">
        <div className="flex items-center min-w-0 flex-1" role="tablist">
          {state.tabs.map(tab => (
            <Tab
              key={tab.id}
              id={tab.id}
              fileName={tab.fileName}
              isActive={tab.id === state.activeTabId}
              isPreview={tab.isPreview}
              isDirty={tab.isDirty}
              onClick={() => setActiveTab(tab.id)}
              onClose={(e) => handleTabClose(e, tab.id)}
            />
          ))}
        </div>
        {/* View mode indicator */}
        {activeTab && (
          <div className="flex items-center gap-1 px-2 flex-shrink-0">
            {activeTab.viewMode === 'code' && <Code2 size={11} className="text-[var(--color-text-dim)]" />}
            {activeTab.viewMode === 'diff' && <GitCompare size={11} className="text-[var(--color-text-dim)]" />}
            {activeTab.viewMode === 'preview' && <Eye size={11} className="text-[var(--color-text-dim)]" />}
          </div>
        )}
        {state.tabs.length > 1 && (
          <button
            onClick={closeAllTabs}
            className="px-2 py-1 text-[9px] font-mono text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors flex-shrink-0"
            title="Close all tabs"
            aria-label="Close all editor tabs"
          >
            close all
          </button>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto" role="tabpanel">
        {activeTab ? (
          <div className="h-full">
            {/* File path breadcrumb */}
            <div className="flex items-center gap-1 px-3 py-1 bg-[var(--color-surface-1)]/50 border-b border-[var(--color-border-subtle)]/20">
              <span className="text-[9px] font-mono text-[var(--color-text-dim)] truncate">
                {activeTab.filePath}
              </span>
              <span className="text-[8px] font-mono text-[var(--color-text-dim)] opacity-50 flex-shrink-0">
                {activeTab.language}
              </span>
            </div>
            {/* Code content */}
            {activeTab.viewMode === 'diff' ? (
              <InlineDiffView
                original={activeTab.originalContent || ''}
                modified={activeTab.content || ''}
                language={activeTab.language}
              />
            ) : activeTab.viewMode === 'preview' && PREVIEW_LANGUAGES.has(activeTab.language) ? (
              <MarkdownPreview content={activeTab.content || ''} language={activeTab.language} />
            ) : activeTab.viewMode === 'preview' ? (
              <div className="flex items-center justify-center h-[calc(100%-28px)] text-[var(--color-text-dim)] text-[10px] font-mono">
                <div className="text-center space-y-1">
                  <Eye size={16} className="mx-auto opacity-40" />
                  <p>preview not available for {activeTab.language} files</p>
                  <p className="text-[8px] opacity-50">preview is available for markdown and html files</p>
                </div>
              </div>
            ) : (
              <HighlightedCode content={activeTab.content || ''} language={activeTab.language} />
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--color-text-dim)] text-[10px] font-mono">
            No file open
          </div>
        )}
      </div>
    </div>
  );
});

EditorPanel.displayName = 'EditorPanel';
