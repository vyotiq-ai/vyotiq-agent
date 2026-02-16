/**
 * Editor Panel Component
 * 
 * Full-featured tabbed code editor powered by Monaco Editor.
 * Provides VS Code-like editing experience with:
 * - Monaco Editor for real code editing with IntelliSense
 * - Syntax highlighting, bracket matching, auto-completion
 * - Tab management with dirty state indicators
 * - Diff view using Monaco's built-in diff editor
 * - Preview mode for Markdown/HTML
 * - File save via Ctrl+S
 * - Status bar with cursor position, language, encoding
 * - Tab context menu for tab management
 * - Breadcrumb navigation
 */

import React, { memo, useCallback, useMemo, useState, lazy, Suspense } from 'react';
import { X, FileText, Eye, Code2, GitCompare, Loader2 } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { sanitizeHtml } from '../../../utils/sanitizeHtml';
import {
  useEditorStore,
  openFile as openFileAction,
  type EditorViewMode,
} from '../store/editorStore';
import { MarkdownRenderer } from '../../../components/ui/MarkdownRenderer';
import { EditorBreadcrumb } from './EditorBreadcrumb';
import { EditorStatusBar } from './EditorStatusBar';
import { TabContextMenu, type TabContextAction } from './TabContextMenu';

// Lazy-load Monaco components for better initial load performance
const MonacoEditor = lazy(() =>
  import('../monaco/MonacoWrapper').then(m => ({ default: m.MonacoEditor }))
);
const MonacoDiffEditor = lazy(() =>
  import('../monaco/MonacoWrapper').then(m => ({ default: m.MonacoDiffEditor }))
);

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
// Loading Fallback
// =============================================================================

const EditorLoading = memo(() => (
  <div className="flex items-center justify-center h-full bg-[var(--color-surface-base)]">
    <div className="flex flex-col items-center gap-2 text-[var(--color-text-dim)]">
      <Loader2 size={16} className="animate-spin" />
      <span className="text-[10px] font-mono">loading editor</span>
    </div>
  </div>
));
EditorLoading.displayName = 'EditorLoading';

// =============================================================================
// Tab Component
// =============================================================================

interface TabProps {
  id: string;
  fileName: string;
  isActive: boolean;
  isPreview: boolean;
  isDirty: boolean;
  isSaving?: boolean;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
}

const Tab = memo<TabProps>(({ fileName, isActive, isPreview, isDirty, isSaving, onClick, onClose, onContextMenu, onDoubleClick }) => (
  <button
    onClick={onClick}
    onContextMenu={onContextMenu}
    onDoubleClick={onDoubleClick}
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
    {isDirty && !isSaving && (
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent-primary)] flex-shrink-0" />
    )}
    {isSaving && (
      <Loader2 size={10} className="animate-spin flex-shrink-0 text-[var(--color-accent-primary)]" />
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
// Markdown Preview
// =============================================================================

const PREVIEW_LANGUAGES = new Set(['markdown', 'html']);

const MarkdownPreview = memo<{ content: string; language: string }>(({ content, language }) => {
  if (language === 'html') {
    return (
      <div className="p-4 h-full overflow-auto">
        <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }} />
      </div>
    );
  }
  return (
    <div className="p-4 h-full overflow-auto">
      <MarkdownRenderer content={content} />
    </div>
  );
});
MarkdownPreview.displayName = 'MarkdownPreview';

// =============================================================================
// Editor Panel
// =============================================================================

export const EditorPanel: React.FC = memo(() => {
  const {
    state,
    closeTab,
    setActiveTab,
    closeAllTabs,
    updateTabContent,
    saveActiveTab,
    saveTab,
    updateCursorPosition,
    updateSelection,
    toggleWordWrap,
    toggleMinimap,
    increaseFontSize,
    decreaseFontSize,
    setViewMode,
    revertTab,
    closeOtherTabs,
    closeTabsToRight,
  } = useEditorStore();

  const activeTab = useMemo(
    () => state.tabs.find(t => t.id === state.activeTabId),
    [state.tabs, state.activeTabId]
  );

  // Tab context menu state
  const [tabContextMenu, setTabContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    tabId: string | null;
  }>({ isOpen: false, position: { x: 0, y: 0 }, tabId: null });

  const handleTabClose = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    closeTab(tabId);
  }, [closeTab]);

  const handleTabContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setTabContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      tabId,
    });
  }, []);

  const handleTabDoubleClick = useCallback((tabId: string) => {
    // Double-click a preview tab to pin it
    const tab = state.tabs.find(t => t.id === tabId);
    if (tab?.isPreview) {
      openFileAction(tab.filePath, { preview: false, viewMode: tab.viewMode });
    }
  }, [state.tabs]);

  const handleTabContextAction = useCallback((action: TabContextAction) => {
    const tabId = tabContextMenu.tabId;
    if (!tabId) return;

    const tab = state.tabs.find(t => t.id === tabId);
    if (!tab) return;

    switch (action) {
      case 'close':
        closeTab(tabId);
        break;
      case 'closeOthers':
        closeOtherTabs(tabId);
        break;
      case 'closeToRight':
        closeTabsToRight(tabId);
        break;
      case 'closeAll':
        closeAllTabs();
        break;
      case 'save':
        void saveTab(tabId);
        break;
      case 'revert':
        revertTab(tabId);
        break;
      case 'copyPath':
        void navigator.clipboard?.writeText(tab.filePath);
        break;
      case 'copyRelativePath': {
        // Best effort relative path
        const workspacePath = (window as Record<string, unknown>).__vyotiq_workspace_path as string | undefined;
        const relative = workspacePath
          ? tab.filePath.replace(workspacePath, '').replace(/^[/\\]/, '')
          : tab.filePath;
        void navigator.clipboard?.writeText(relative);
        break;
      }
      case 'revealInExplorer':
        void window.vyotiq?.files?.reveal?.(tab.filePath);
        break;
    }
  }, [tabContextMenu.tabId, state.tabs, closeTab, closeOtherTabs, closeTabsToRight, closeAllTabs, saveTab, revertTab]);

  const closeTabContextMenu = useCallback(() => {
    setTabContextMenu(prev => ({ ...prev, isOpen: false }));
  }, []);

  // Monaco event handlers
  const handleContentChange = useCallback((value: string) => {
    if (activeTab) {
      updateTabContent(activeTab.id, value);
    }
  }, [activeTab, updateTabContent]);

  const handleSave = useCallback((value: string) => {
    if (activeTab) {
      updateTabContent(activeTab.id, value);
      void saveActiveTab();
    }
  }, [activeTab, updateTabContent, saveActiveTab]);

  const handleCursorChange = useCallback((position: { line: number; column: number }) => {
    if (activeTab) {
      updateCursorPosition(activeTab.id, position);
    }
  }, [activeTab, updateCursorPosition]);

  const handleSelectionChange = useCallback(
    (selection: { startLine: number; startColumn: number; endLine: number; endColumn: number } | null) => {
      if (activeTab) {
        updateSelection(activeTab.id, selection);
      }
    },
    [activeTab, updateSelection]
  );

  const handleStatusBarSave = useCallback(() => {
    void saveActiveTab();
  }, [saveActiveTab]);

  const handleStatusBarRevert = useCallback(() => {
    if (activeTab) {
      revertTab(activeTab.id);
    }
  }, [activeTab, revertTab]);

  const handleSetViewMode = useCallback((mode: EditorViewMode) => {
    setViewMode(mode);
  }, [setViewMode]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const modKey = e.ctrlKey || e.metaKey;

    // Ctrl+S: Save
    if (modKey && e.key === 's') {
      e.preventDefault();
      void saveActiveTab();
      return;
    }

    // Ctrl+W: Close active tab
    if (modKey && e.key === 'w') {
      e.preventDefault();
      if (activeTab) closeTab(activeTab.id);
      return;
    }

    // Ctrl+Tab: Next tab
    if (modKey && e.key === 'Tab') {
      e.preventDefault();
      const currentIndex = state.tabs.findIndex(t => t.id === state.activeTabId);
      const nextIndex = e.shiftKey
        ? (currentIndex - 1 + state.tabs.length) % state.tabs.length
        : (currentIndex + 1) % state.tabs.length;
      setActiveTab(state.tabs[nextIndex].id);
      return;
    }
  }, [activeTab, closeTab, saveActiveTab, setActiveTab, state.tabs, state.activeTabId]);

  if (state.tabs.length === 0) {
    return null;
  }

  // Get context menu tab info
  const contextMenuTab = tabContextMenu.tabId
    ? state.tabs.find(t => t.id === tabContextMenu.tabId)
    : null;

  return (
    <div
      className="flex flex-col h-full bg-[var(--color-surface-base)] border-l border-[var(--color-border-subtle)]/40"
      onKeyDown={handleKeyDown}
    >
      {/* Tab bar */}
      <div className="flex items-center bg-[var(--color-surface-1)] border-b border-[var(--color-border-subtle)]/40 overflow-x-auto scrollbar-none shrink-0">
        <div className="flex items-center min-w-0 flex-1" role="tablist">
          {state.tabs.map(tab => (
            <Tab
              key={tab.id}
              id={tab.id}
              fileName={tab.fileName}
              isActive={tab.id === state.activeTabId}
              isPreview={tab.isPreview}
              isDirty={tab.isDirty}
              isSaving={tab.isSaving}
              onClick={() => setActiveTab(tab.id)}
              onClose={(e) => handleTabClose(e, tab.id)}
              onContextMenu={(e) => handleTabContextMenu(e, tab.id)}
              onDoubleClick={() => handleTabDoubleClick(tab.id)}
            />
          ))}
        </div>
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

      {/* Breadcrumb */}
      {activeTab && (
        <EditorBreadcrumb filePath={activeTab.filePath} language={activeTab.language} />
      )}

      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-hidden" role="tabpanel">
        {activeTab ? (
          <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0">
              {activeTab.viewMode === 'diff' ? (
                <Suspense fallback={<EditorLoading />}>
                  <MonacoDiffEditor
                    filePath={activeTab.filePath}
                    original={activeTab.originalContent || ''}
                    modified={activeTab.content || ''}
                    language={activeTab.language}
                    className="h-full"
                  />
                </Suspense>
              ) : activeTab.viewMode === 'preview' && PREVIEW_LANGUAGES.has(activeTab.language) ? (
                <MarkdownPreview content={activeTab.content || ''} language={activeTab.language} />
              ) : activeTab.viewMode === 'preview' ? (
                <div className="flex items-center justify-center h-full text-[var(--color-text-dim)] text-[10px] font-mono">
                  <div className="text-center space-y-1">
                    <Eye size={16} className="mx-auto opacity-40" />
                    <p>preview not available for {activeTab.language} files</p>
                    <p className="text-[9px] opacity-50">preview is available for markdown and html files</p>
                  </div>
                </div>
              ) : (
                <Suspense fallback={<EditorLoading />}>
                  <MonacoEditor
                    filePath={activeTab.filePath}
                    content={activeTab.content || ''}
                    language={activeTab.language}
                    readOnly={false}
                    onChange={handleContentChange}
                    onSave={handleSave}
                    onCursorChange={handleCursorChange}
                    onSelectionChange={handleSelectionChange}
                    scrollPosition={activeTab.scrollPosition}
                    cursorPosition={activeTab.cursorPosition}
                    showMinimap={state.showMinimap}
                    wordWrap={state.wordWrap}
                    fontSize={state.fontSize}
                  />
                </Suspense>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--color-text-dim)] text-[10px] font-mono">
            no file open
          </div>
        )}
      </div>

      {/* Status bar */}
      {activeTab && (
        <EditorStatusBar
          tab={activeTab}
          wordWrap={state.wordWrap}
          showMinimap={state.showMinimap}
          fontSize={state.fontSize}
          onSave={handleStatusBarSave}
          onRevert={handleStatusBarRevert}
          onToggleWordWrap={toggleWordWrap}
          onToggleMinimap={toggleMinimap}
          onIncreaseFontSize={increaseFontSize}
          onDecreaseFontSize={decreaseFontSize}
          onSetViewMode={handleSetViewMode}
        />
      )}

      {/* Tab context menu */}
      <TabContextMenu
        isOpen={tabContextMenu.isOpen}
        position={tabContextMenu.position}
        tabId={tabContextMenu.tabId}
        fileName={contextMenuTab?.fileName ?? null}
        filePath={contextMenuTab?.filePath ?? null}
        isDirty={contextMenuTab?.isDirty ?? false}
        onAction={handleTabContextAction}
        onClose={closeTabContextMenu}
      />
    </div>
  );
});

EditorPanel.displayName = 'EditorPanel';
