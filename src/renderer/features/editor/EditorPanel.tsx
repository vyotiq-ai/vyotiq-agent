/**
 * EditorPanel Component
 * 
 * Main editor panel integrating all editor components:
 * - Tab bar for managing open files
 * - Monaco Editor for code editing
 * - Diff editor for viewing changes
 * - Status bar with file info
 * - Settings menu
 * - Loading states and revert functionality
 */

import React, { useCallback, useState, useEffect, memo } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useEditorTabs, useFileDiff, useEditorAI } from './hooks';
import { useAgentSelector } from '../../state/AgentProvider';
import {
  EditorTabBar,
  MonacoEditor,
  DiffEditor,
  EditorStatusBar,
  EditorSettingsMenu,
  EditorEmptyState,
  AIResultPanel,
} from './components';
import type { EditorSettings } from './types';
import type { EditorAIAction } from './hooks/useEditorAI';

interface EditorPanelProps {
  /** Initial file to open */
  initialFile?: string;
  /** Callback when a file is opened */
  onFileOpen?: (path: string) => void;
  /** Callback when a file is saved */
  onFileSave?: (path: string) => void;
  /** Whether the panel is visible */
  isVisible?: boolean;
  /** Additional class name */
  className?: string;
}

export const EditorPanel: React.FC<EditorPanelProps> = memo(({
  initialFile,
  onFileOpen,
  onFileSave,
  isVisible = true,
  className,
}) => {
  const {
    tabs,
    activeTabId,
    activeTab,
    settings,
    isLoading,
    openFile,
    closeTab,
    closeAllTabs,
    closeOtherTabs,
    closeSavedTabs,
    setActiveTab,
    reorderTabs,
    updateContent,
    saveFile,
    saveAllFiles,
    revertFile,
    updateViewState,
    updateCursorPosition,
    updateSettings,
    nextTab,
    prevTab,
    hasUnsavedChanges,
  } = useEditorTabs();

  const {
    diff,
    isLoading: isDiffLoading,
    viewMode,
    isVisible: isDiffVisible,
    loadDiff,
    loadGitDiff,
    clearDiff,
    setViewMode,
    hideDiff,
    refresh: refreshDiff,
  } = useFileDiff();

  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [showAIResult, setShowAIResult] = useState(false);

  // AI hook for tab-level actions
  const {
    actionState,
    executeAction,
    clearActionResult,
  } = useEditorAI();

  // Open initial file
  useEffect(() => {
    if (initialFile) {
      openFile(initialFile);
    }
  }, [initialFile, openFile]);

  const streamingDiff = useAgentSelector(
    (s) => s.streamingDiff,
    (a, b) => a === b,
  );

  // Sync with streaming diff for live updates
  useEffect(() => {
    if (streamingDiff && isVisible) {
      // Auto-switch to diff view for streaming edits
      loadDiff(
        streamingDiff.path,
        streamingDiff.originalContent,
        streamingDiff.modifiedContent
      );
    }
  }, [streamingDiff, loadDiff, isVisible]);

  // Handle file open callback
  useEffect(() => {
    if (activeTab && onFileOpen) {
      onFileOpen(activeTab.path);
    }
  }, [activeTab?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle content change
  const handleContentChange = useCallback((content: string) => {
    if (activeTabId) {
      updateContent(activeTabId, content);

      // Update diff if visible
      if (isDiffVisible && diff && activeTab) {
        loadDiff(activeTab.path, activeTab.originalContent, content);
      }
    }
  }, [activeTabId, updateContent, isDiffVisible, diff, activeTab, loadDiff]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (activeTabId) {
      const success = await saveFile(activeTabId);
      if (success && onFileSave && activeTab) {
        onFileSave(activeTab.path);
      }
    }
  }, [activeTabId, saveFile, onFileSave, activeTab]);

  // Handle view state change
  const handleViewStateChange = useCallback((viewState: Parameters<typeof updateViewState>[1]) => {
    if (activeTabId) {
      updateViewState(activeTabId, viewState);
    }
  }, [activeTabId, updateViewState]);

  // Handle cursor change
  const handleCursorChange = useCallback((position: { lineNumber: number; column: number }) => {
    if (activeTabId) {
      updateCursorPosition(activeTabId, position);
    }
  }, [activeTabId, updateCursorPosition]);

  // Handle settings change
  const handleSettingsChange = useCallback((newSettings: Partial<EditorSettings>) => {
    updateSettings(newSettings);
  }, [updateSettings]);

  // Handle show diff
  const handleShowDiff = useCallback(() => {
    if (activeTab) {
      loadDiff(activeTab.path, activeTab.originalContent, activeTab.content);
    }
  }, [activeTab, loadDiff]);

  // Handle show git diff
  const handleShowGitDiff = useCallback(() => {
    if (activeTab) {
      loadGitDiff(activeTab.path);
    }
  }, [activeTab, loadGitDiff]);

  // Handle revert file to original content
  const handleRevertFile = useCallback(() => {
    if (activeTabId && activeTab?.isDirty) {
      revertFile(activeTabId);
      // Clear diff view if showing the reverted file
      if (isDiffVisible && diff?.path === activeTab.path) {
        clearDiff();
      }
    }
  }, [activeTabId, activeTab, revertFile, isDiffVisible, diff, clearDiff]);

  // Handle AI action from tab menu
  const handleTabAIAction = useCallback(async (tabId: string, action: EditorAIAction) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    setShowAIResult(true);
    await executeAction({
      action,
      filePath: tab.path,
      language: tab.language,
      fileContent: tab.content,
    });
  }, [tabs, executeAction]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in input/textarea (except our editor)
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      const isMac = navigator.platform.toLowerCase().includes('mac');
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      // Ctrl/Cmd + S - Save
      if (modKey && e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        handleSave();
        return;
      }

      // Ctrl/Cmd + Shift + S - Save All
      if (modKey && e.shiftKey && e.key === 's') {
        e.preventDefault();
        saveAllFiles();
        return;
      }

      // Ctrl/Cmd + W - Close tab
      if (modKey && e.key === 'w' && !e.shiftKey) {
        e.preventDefault();
        if (activeTabId) {
          closeTab(activeTabId);
        }
        return;
      }

      // Ctrl/Cmd + Tab - Next tab
      if (modKey && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        nextTab();
        return;
      }

      // Ctrl/Cmd + Shift + Tab - Previous tab
      if (modKey && e.shiftKey && e.key === 'Tab') {
        e.preventDefault();
        prevTab();
        return;
      }

      // Ctrl/Cmd + D - Show diff
      if (modKey && e.key === 'd' && !e.shiftKey) {
        e.preventDefault();
        if (isDiffVisible) {
          hideDiff();
        } else {
          handleShowDiff();
        }
        return;
      }

      // Ctrl/Cmd + Shift + D - Show git diff
      if (modKey && e.shiftKey && e.key === 'd') {
        e.preventDefault();
        handleShowGitDiff();
        return;
      }

      // Ctrl/Cmd + Z + Shift - Revert file (discard changes)
      if (modKey && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        handleRevertFile();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeTabId,
    handleSave,
    saveAllFiles,
    closeTab,
    nextTab,
    prevTab,
    isDiffVisible,
    hideDiff,
    handleShowDiff,
    handleShowGitDiff,
    handleRevertFile
  ]);

  // Warn before closing with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className={cn('flex flex-col h-full bg-[var(--color-surface-base)]', className)}>
      {/* Tab bar */}
      <EditorTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabClick={setActiveTab}
        onTabClose={closeTab}
        onTabCloseOthers={closeOtherTabs}
        onTabCloseAll={closeAllTabs}
        onTabCloseSaved={closeSavedTabs}
        onReorder={reorderTabs}
        onAIAction={handleTabAIAction}
        enableAI={true}
      />

      {/* Editor area */}
      <div className="flex-1 min-h-0 relative">
        {/* Global loading overlay */}
        {(isLoading || isDiffLoading) && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-[var(--color-surface-base)]/80 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-[11px] font-mono">
                {isDiffLoading ? 'Loading diff...' : 'Loading...'}
              </span>
            </div>
          </div>
        )}
        
        {tabs.length === 0 ? (
          <EditorEmptyState />
        ) : isDiffVisible && diff ? (
          <DiffEditor
            diff={diff}
            settings={settings}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onClose={hideDiff}
            onRefresh={refreshDiff}
          />
        ) : activeTab ? (
          <MonacoEditor
            tab={activeTab}
            settings={settings}
            onChange={handleContentChange}
            onSave={handleSave}
            onViewStateChange={handleViewStateChange}
            onCursorChange={handleCursorChange}
          />
        ) : null}
      </div>

      {/* Status bar */}
      <EditorStatusBar
        tab={activeTab}
        settings={settings}
        onSettingsClick={() => setSettingsMenuOpen(true)}
        onRevertClick={activeTab?.isDirty ? handleRevertFile : undefined}
        isLoading={isLoading}
      />

      {/* Settings menu */}
      <EditorSettingsMenu
        isOpen={settingsMenuOpen}
        settings={settings}
        onClose={() => setSettingsMenuOpen(false)}
        onSettingsChange={handleSettingsChange}
      />

      {/* AI Result Panel (floating) */}
      {showAIResult && (
        <div className="absolute bottom-16 right-4 w-[420px] z-50">
          <AIResultPanel
            isOpen={showAIResult}
            isLoading={actionState.isLoading}
            action={actionState.action}
            result={actionState.result}
            error={actionState.error}
            provider={actionState.provider}
            latencyMs={actionState.latencyMs}
            onClose={() => {
              setShowAIResult(false);
              clearActionResult();
            }}
          />
        </div>
      )}
    </div>
  );
});

EditorPanel.displayName = 'EditorPanel';

// Export a function to open files from outside the component
export type EditorPanelRef = {
  openFile: (path: string) => Promise<void>;
  saveFile: (path: string) => Promise<boolean>;
  closeFile: (path: string) => void;
};
