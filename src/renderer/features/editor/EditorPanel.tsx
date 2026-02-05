/**
 * EditorPanel Component
 * 
 * Main editor panel integrating all editor components:
 * - Tab bar for managing open files
 * - Monaco Editor for code editing
 * - Status bar with file info
 * - Settings menu
 * - Loading states and revert functionality
 */

import React, { useCallback, useState, useEffect, memo } from 'react';
import { cn } from '../../utils/cn';
import { Spinner } from '../../components/ui/LoadingState';
import { useEditorTabs, useEditorAI } from './hooks';
import {
  EditorTabBar,
  MonacoEditor,
  EditorStatusBar,
  EditorSettingsMenu,
  EditorEmptyState,
  AIResultPanel,
} from './components';
import type { EditorSettings } from './types';
import type { EditorAIAction } from './hooks/useEditorAI';

interface EditorPanelProps {
  initialFile?: string;
  onFileOpen?: (path: string) => void;
  onFileSave?: (path: string) => void;
  isVisible?: boolean;
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

  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [showAIResult, setShowAIResult] = useState(false);

  const {
    actionState,
    executeAction,
    clearActionResult,
  } = useEditorAI();

  useEffect(() => {
    if (initialFile) {
      openFile(initialFile);
    }
  }, [initialFile, openFile]);

  useEffect(() => {
    if (activeTab && onFileOpen) {
      onFileOpen(activeTab.path);
    }
  }, [activeTab?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleContentChange = useCallback((content: string) => {
    if (activeTabId) {
      updateContent(activeTabId, content);
    }
  }, [activeTabId, updateContent]);

  const handleSave = useCallback(async () => {
    if (activeTabId) {
      const success = await saveFile(activeTabId);
      if (success && onFileSave && activeTab) {
        onFileSave(activeTab.path);
      }
    }
  }, [activeTabId, saveFile, onFileSave, activeTab]);

  const handleViewStateChange = useCallback((viewState: Parameters<typeof updateViewState>[1]) => {
    if (activeTabId) {
      updateViewState(activeTabId, viewState);
    }
  }, [activeTabId, updateViewState]);

  const handleCursorChange = useCallback((position: { lineNumber: number; column: number }) => {
    if (activeTabId) {
      updateCursorPosition(activeTabId, position);
    }
  }, [activeTabId, updateCursorPosition]);

  const handleSettingsChange = useCallback((newSettings: Partial<EditorSettings>) => {
    updateSettings(newSettings);
  }, [updateSettings]);

  const handleRevertFile = useCallback(() => {
    if (activeTabId && activeTab?.isDirty) {
      revertFile(activeTabId);
    }
  }, [activeTabId, activeTab, revertFile]);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      const isMac = navigator.platform.toLowerCase().includes('mac');
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      if (modKey && e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        handleSave();
        return;
      }

      if (modKey && e.shiftKey && e.key === 's') {
        e.preventDefault();
        saveAllFiles();
        return;
      }

      if (modKey && e.key === 'w' && !e.shiftKey) {
        e.preventDefault();
        if (activeTabId) {
          closeTab(activeTabId);
        }
        return;
      }

      if (modKey && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        nextTab();
        return;
      }

      if (modKey && e.shiftKey && e.key === 'Tab') {
        e.preventDefault();
        prevTab();
        return;
      }

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
    handleRevertFile
  ]);

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

      <div className="flex-1 min-h-0 relative">
        {isLoading && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-[var(--color-surface-base)]/80 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
              <Spinner size="sm" />
              <span className="text-[11px] font-mono">Loading...</span>
            </div>
          </div>
        )}
        
        {tabs.length === 0 ? (
          <EditorEmptyState />
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

      <EditorStatusBar
        tab={activeTab}
        settings={settings}
        onSettingsClick={() => setSettingsMenuOpen(true)}
        onRevertClick={activeTab?.isDirty ? handleRevertFile : undefined}
        isLoading={isLoading}
      />

      <EditorSettingsMenu
        isOpen={settingsMenuOpen}
        settings={settings}
        onClose={() => setSettingsMenuOpen(false)}
        onSettingsChange={handleSettingsChange}
      />

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

export type EditorPanelRef = {
  openFile: (path: string) => Promise<void>;
  saveFile: (path: string) => Promise<boolean>;
  closeFile: (path: string) => void;
};
