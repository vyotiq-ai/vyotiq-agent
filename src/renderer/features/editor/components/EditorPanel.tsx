/**
 * Editor Panel Component
 * 
 * Tabbed code viewer with syntax-highlighted file content display.
 * Supports preview tabs, diff view mode, and code view.
 */

import React, { memo, useCallback, useMemo } from 'react';
import { X, FileText, Eye, Code2, GitCompare } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { useEditorStore, openFile as openFileAction, type EditorViewMode } from '../store/editorStore';

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
// Main Component
// =============================================================================

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
            <pre className="p-3 text-[11px] font-mono leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap break-words overflow-auto h-[calc(100%-28px)]">
              <code>{activeTab.content || 'Loading...'}</code>
            </pre>
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
