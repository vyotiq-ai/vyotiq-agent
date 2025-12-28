/**
 * EditorView Component
 * 
 * Standalone editor view that uses the EditorProvider context.
 * Can be placed anywhere in the app layout.
 * Includes loading states and revert functionality.
 * 
 * Syncs with agent's streaming diff state to show real-time
 * file change diffs during tool execution.
 * 
 * VS Code Features:
 * - Command Palette (Ctrl+Shift+P)
 * - Quick Open / Go to File (Ctrl+P)
 * - Go to Symbol (Ctrl+Shift+O)
 * - Keyboard shortcuts
 * - Breadcrumbs navigation
 */

import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { Loader2, Save, Settings, FolderOpen, FileText, GitBranch, RotateCcw, Layout, Code, Terminal, Moon, Type, Keyboard } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useEditor } from '../../state/EditorProvider';
import { useAgentSelector } from '../../state/AgentProvider';
import {
  EditorTabBar,
  MonacoEditor,
  DiffEditor,
  OperationDiffEditor,
  EditorStatusBar,
  EditorSettingsMenu,
  EditorEmptyState,
  AIResultPanel,
  CommandPalette,
  QuickOpen,
  GoToSymbol,
  Breadcrumbs,
} from './components';
import type { Command } from './components/CommandPalette';
import type { QuickOpenFile } from './components/QuickOpen';
import type { DocumentSymbol } from './components/GoToSymbol';
import { useEditorAI, type EditorAIAction } from './hooks/useEditorAI';
import { useKeyboardShortcuts as _useKeyboardShortcuts, formatShortcut } from './hooks/useKeyboardShortcuts';
import { useDocumentSymbols as _useDocumentSymbols } from './hooks/useDocumentSymbols';
import { useActiveWorkspace } from '../../hooks/useActiveWorkspace';

// Re-export formatShortcut for external use
export { formatShortcut };

interface EditorViewProps {
  className?: string;
}

export const EditorView: React.FC<EditorViewProps> = ({ className }) => {
  const {
    tabs,
    activeTabId,
    activeTab,
    settings,
    isEditorVisible,
    diff,
    isDiffVisible,
    diffViewMode,
    operationDiff,
    isOperationDiffVisible,
    pendingNavigation,
    clearPendingNavigation,
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
    goToPosition,
    hideDiff,
    setDiffViewMode,
    showDiff,
    showGitDiff,
    hideOperationDiff,
    openOperationDiffFile,
    hasUnsavedChanges,
    getFileDiff,
  } = useEditor();
  
  // Track loading state for files
  const isLoading = tabs.some(t => t.isLoading);
  const isDiffLoading = diff?.isLoading ?? false;
  
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [showAIResult, setShowAIResult] = useState(false);
  
  // VS Code feature states
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [goToSymbolOpen, setGoToSymbolOpen] = useState(false);
  
  // Monaco editor ref for symbol extraction (reserved for future use with useDocumentSymbols)
  const _editorRef = useRef<{ getEditor: () => unknown } | null>(null);
  
  // Track previous active tab to detect tab switches
  const prevActiveTabIdRef = useRef<string | undefined>(activeTabId);
  
  // Restore diff when switching tabs (if there's a stored diff for the new tab)
  useEffect(() => {
    // Only trigger on tab change, not on mount
    if (prevActiveTabIdRef.current === activeTabId) return;
    prevActiveTabIdRef.current = activeTabId;
    
    if (!activeTab?.path) return;
    
    // Check if there's a stored diff for this file
    const storedDiff = getFileDiff(activeTab.path);
    if (storedDiff) {
      // Restore the diff view for this file
      showDiff(activeTab.path, storedDiff.original, storedDiff.modified);
    }
  }, [activeTabId, activeTab?.path, getFileDiff, showDiff]);
  
  // File list for Quick Open (from workspace context if available)
  const [workspaceFiles, setWorkspaceFiles] = useState<QuickOpenFile[]>([]);
  
  // Get active workspace from context
  const activeWorkspace = useActiveWorkspace();
  
  // Load workspace files
  useEffect(() => {
    const loadFiles = async () => {
      try {
        // Get files from the active workspace
        if (activeWorkspace?.path) {
          const result = await window.vyotiq?.files?.listDir?.(activeWorkspace.path, { recursive: true, maxDepth: 5 });
          if (result?.success && result.files) {
            // Flatten and filter to only files (not directories)
            const flattenFiles = (files: Array<{ name: string; path: string; type: 'file' | 'directory'; children?: unknown[] }>): Array<{ name: string; path: string }> => {
              const result: Array<{ name: string; path: string }> = [];
              for (const f of files) {
                if (f.type === 'file') {
                  result.push({ name: f.name, path: f.path });
                } else if (f.type === 'directory' && Array.isArray(f.children)) {
                  result.push(...flattenFiles(f.children as Array<{ name: string; path: string; type: 'file' | 'directory'; children?: unknown[] }>));
                }
              }
              return result;
            };
            const fileEntries = flattenFiles(result.files);
            setWorkspaceFiles(fileEntries.map((f) => ({
              path: f.path,
              name: f.name,
              relativePath: f.path.replace(activeWorkspace.path, '').replace(/^[/\\]/, ''),
            })));
          }
        }
      } catch (error) {
        console.error('Failed to load workspace files:', error);
      }
    };
    loadFiles();
  }, [activeWorkspace?.path]);

  // AI hook for tab-level actions
  const {
    actionState,
    executeAction,
    clearActionResult,
  } = useEditorAI();

  // Get streaming diff from agent state for real-time file change display
  const streamingDiff = useAgentSelector(
    (s) => s.streamingDiff,
    (a, b) => a === b,
  );

  // Sync with streaming diff for live updates during tool execution
  useEffect(() => {
    if (streamingDiff && isEditorVisible) {
      // Auto-switch to diff view for streaming edits
      showDiff(
        streamingDiff.path,
        streamingDiff.originalContent,
        streamingDiff.modifiedContent
      );
    }
  }, [streamingDiff, showDiff, isEditorVisible]);
  
  // Handle content change
  const handleContentChange = useCallback((content: string) => {
    if (activeTabId) {
      updateContent(activeTabId, content);
      
      // Update diff if visible
      if (isDiffVisible && diff && activeTab) {
        showDiff(activeTab.path, activeTab.originalContent, content);
      }
    }
  }, [activeTabId, updateContent, isDiffVisible, diff, activeTab, showDiff]);
  
  // Handle save
  const handleSave = useCallback(async () => {
    if (activeTabId) {
      await saveFile(activeTabId);
    }
  }, [activeTabId, saveFile]);
  
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
  
  // Handle refresh diff
  const handleRefreshDiff = useCallback(() => {
    if (activeTab && diff) {
      showDiff(activeTab.path, activeTab.originalContent, activeTab.content);
    }
  }, [activeTab, diff, showDiff]);

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

  // Handle revert file to original content
  const handleRevertFile = useCallback(() => {
    if (activeTabId && activeTab?.isDirty) {
      revertFile(activeTabId);
      // Hide diff if showing the reverted file
      if (isDiffVisible && diff?.path === activeTab.path) {
        hideDiff();
      }
    }
  }, [activeTabId, activeTab, revertFile, isDiffVisible, diff, hideDiff]);

  // Handle Quick Open file selection - uses the openFile from useEditor
  const handleQuickOpenSelect = useCallback((path: string) => {
    openFile(path);
  }, [openFile]);

  // Handle Go to Symbol selection
  const handleSymbolSelect = useCallback((symbol: DocumentSymbol) => {
    if (activeTab) {
      goToPosition(activeTab.path, symbol.line, symbol.column);
    }
  }, [activeTab, goToPosition]);

  // Symbols for current file (simple extraction - will be enhanced with useDocumentSymbols)
  const [documentSymbols, setDocumentSymbols] = useState<DocumentSymbol[]>([]);

  // Extract symbols from active file content (basic implementation)
  useEffect(() => {
    if (!activeTab?.content) {
      setDocumentSymbols([]);
      return;
    }

    const symbols: DocumentSymbol[] = [];
    const lines = activeTab.content.split('\n');
    
    // Simple regex patterns for common patterns
    const patterns = [
      { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm, kind: 'function' as const },
      { regex: /^(?:export\s+)?class\s+(\w+)/gm, kind: 'class' as const },
      { regex: /^(?:export\s+)?interface\s+(\w+)/gm, kind: 'interface' as const },
      { regex: /^(?:export\s+)?type\s+(\w+)/gm, kind: 'type' as const },
      { regex: /^(?:export\s+)?const\s+(\w+)\s*=/gm, kind: 'constant' as const },
      { regex: /^(?:export\s+)?(?:let|var)\s+(\w+)/gm, kind: 'variable' as const },
      { regex: /^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/gm, kind: 'method' as const },
    ];

    lines.forEach((line, index) => {
      for (const { regex, kind } of patterns) {
        regex.lastIndex = 0;
        const match = regex.exec(line);
        if (match) {
          symbols.push({
            name: match[1],
            kind,
            line: index + 1,
            column: match.index + 1,
          });
          break;
        }
      }
    });

    setDocumentSymbols(symbols);
  }, [activeTab?.content]);

  // Command palette commands
  const commands = useMemo<Command[]>(() => [
    // File commands
    {
      id: 'file.save',
      label: 'Save',
      icon: Save,
      category: 'File',
      shortcut: 'Ctrl+S',
      action: handleSave,
      when: () => !!activeTab?.isDirty,
    },
    {
      id: 'file.saveAll',
      label: 'Save All',
      icon: Save,
      category: 'File',
      shortcut: 'Ctrl+Shift+S',
      action: saveAllFiles,
    },
    {
      id: 'file.revert',
      label: 'Revert File',
      icon: RotateCcw,
      category: 'File',
      action: handleRevertFile,
      when: () => !!activeTab?.isDirty,
    },
    {
      id: 'file.close',
      label: 'Close Editor',
      icon: FileText,
      category: 'File',
      shortcut: 'Ctrl+W',
      action: () => activeTabId && closeTab(activeTabId),
      when: () => !!activeTabId,
    },
    {
      id: 'file.closeAll',
      label: 'Close All Editors',
      category: 'File',
      action: closeAllTabs,
      when: () => tabs.length > 0,
    },

    // Navigation commands
    {
      id: 'nav.quickOpen',
      label: 'Go to File...',
      icon: FileText,
      category: 'Navigation',
      shortcut: 'Ctrl+P',
      action: () => setQuickOpenOpen(true),
    },
    {
      id: 'nav.goToSymbol',
      label: 'Go to Symbol in Editor...',
      icon: Code,
      category: 'Navigation',
      shortcut: 'Ctrl+Shift+O',
      action: () => setGoToSymbolOpen(true),
      when: () => !!activeTab,
    },
    {
      id: 'nav.nextTab',
      label: 'Next Editor',
      category: 'Navigation',
      shortcut: 'Ctrl+Tab',
      action: nextTab,
      when: () => tabs.length > 1,
    },
    {
      id: 'nav.prevTab',
      label: 'Previous Editor',
      category: 'Navigation',
      shortcut: 'Ctrl+Shift+Tab',
      action: prevTab,
      when: () => tabs.length > 1,
    },

    // View commands
    {
      id: 'view.diff',
      label: isDiffVisible ? 'Hide Diff' : 'Show Git Diff',
      icon: GitBranch,
      category: 'View',
      shortcut: 'Ctrl+D',
      action: () => {
        if (isDiffVisible) {
          hideDiff();
        } else if (activeTab) {
          showGitDiff(activeTab.path);
        }
      },
      when: () => !!activeTab,
    },
    {
      id: 'view.settings',
      label: 'Open Editor Settings',
      icon: Settings,
      category: 'View',
      action: () => setSettingsMenuOpen(true),
    },

    // Editor commands
    {
      id: 'editor.fontSize.increase',
      label: 'Increase Font Size',
      icon: Type,
      category: 'Editor',
      action: () => updateSettings({ fontSize: (settings.fontSize || 14) + 1 }),
    },
    {
      id: 'editor.fontSize.decrease',
      label: 'Decrease Font Size',
      icon: Type,
      category: 'Editor',
      action: () => updateSettings({ fontSize: Math.max(8, (settings.fontSize || 14) - 1) }),
    },
    {
      id: 'editor.minimap.toggle',
      label: settings.minimap ? 'Hide Minimap' : 'Show Minimap',
      category: 'Editor',
      action: () => updateSettings({ minimap: !settings.minimap }),
    },
    {
      id: 'editor.wordWrap.toggle',
      label: settings.wordWrap === 'on' ? 'Disable Word Wrap' : 'Enable Word Wrap',
      category: 'Editor',
      action: () => updateSettings({ wordWrap: settings.wordWrap === 'on' ? 'off' : 'on' }),
    },

    // Workspace commands
    {
      id: 'workspace.openFolder',
      label: 'Open Folder...',
      icon: FolderOpen,
      category: 'Workspace',
      action: () => window.vyotiq?.workspace?.add?.(),
    },

    // Layout commands
    {
      id: 'layout.toggle',
      label: 'Toggle Layout',
      icon: Layout,
      category: 'View',
      action: () => {
        // Toggle between different editor layouts
        updateSettings({ 
          minimap: !settings.minimap 
        });
      },
    },

    // Terminal commands
    {
      id: 'terminal.toggle',
      label: 'Toggle Terminal',
      icon: Terminal,
      category: 'View',
      shortcut: 'Ctrl+`',
      action: () => {
        // This would be connected to terminal panel toggle
        console.log('Toggle terminal requested');
      },
    },

    // Theme commands
    {
      id: 'theme.toggle',
      label: 'Toggle Dark/Light Theme',
      icon: Moon,
      category: 'Preferences',
      action: () => {
        // Toggle editor theme
        const newTheme = settings.theme === 'vyotiq-dark' ? 'vs' : 'vyotiq-dark';
        updateSettings({ theme: newTheme });
      },
    },

    // Keyboard shortcuts
    {
      id: 'keyboard.showShortcuts',
      label: 'Show Keyboard Shortcuts',
      icon: Keyboard,
      category: 'Help',
      shortcut: 'Ctrl+K Ctrl+S',
      action: () => {
        // Open keyboard shortcuts panel
        console.log('Show keyboard shortcuts requested');
      },
    },
  ], [
    activeTab, activeTabId, tabs, settings, isDiffVisible,
    handleSave, saveAllFiles, handleRevertFile, closeTab, closeAllTabs,
    nextTab, prevTab, hideDiff, showGitDiff,
    updateSettings,
  ]);
  
  // Keyboard shortcuts
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
      
      // Ctrl/Cmd + D to show git diff
      if (modKey && e.key === 'd' && !e.shiftKey) {
        e.preventDefault();
        if (isDiffVisible) {
          hideDiff();
        } else if (activeTab) {
          showGitDiff(activeTab.path);
        }
        return;
      }

      // Ctrl/Cmd + Z + Shift - Revert file (discard changes)
      if (modKey && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        handleRevertFile();
        return;
      }

      // Ctrl/Cmd + Shift + P - Command Palette
      if (modKey && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      // Ctrl/Cmd + P - Quick Open
      if (modKey && !e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setQuickOpenOpen(true);
        return;
      }

      // Ctrl/Cmd + Shift + O - Go to Symbol
      if (modKey && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        setGoToSymbolOpen(true);
        return;
      }

      // F1 - Command Palette (alternative)
      if (e.key === 'F1') {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabId, handleSave, saveAllFiles, closeTab, nextTab, prevTab, isDiffVisible, hideDiff, activeTab, showGitDiff, handleRevertFile]);
  
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
  
  if (!isEditorVisible) {
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
        enableAI={settings.enableAI !== false}
      />

      {/* Breadcrumbs - file path and symbol navigation */}
      {activeTab && (
        <Breadcrumbs
          filePath={activeTab.path}
          symbols={documentSymbols.slice(0, 3)} // Show top-level symbols only
          onSymbolClick={handleSymbolSelect}
          onShowSymbolPicker={() => setGoToSymbolOpen(true)}
        />
      )}
      
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
        
        {/* Priority 1: Operation diff (file operation results) */}
        {isOperationDiffVisible && operationDiff ? (
          <OperationDiffEditor
            operationDiff={operationDiff}
            settings={settings}
            viewMode={diffViewMode}
            onViewModeChange={setDiffViewMode}
            onClose={hideOperationDiff}
            onOpenFile={openOperationDiffFile}
          />
        ) : tabs.length === 0 ? (
          <EditorEmptyState />
        ) : isDiffVisible && diff ? (
          <DiffEditor
            diff={diff}
            settings={settings}
            viewMode={diffViewMode}
            onViewModeChange={setDiffViewMode}
            onClose={hideDiff}
            onRefresh={handleRefreshDiff}
          />
        ) : activeTab ? (
          <MonacoEditor
            tab={activeTab}
            settings={settings}
            onChange={handleContentChange}
            onSave={handleSave}
            onViewStateChange={handleViewStateChange}
            onCursorChange={handleCursorChange}
            pendingNavigation={pendingNavigation}
            onNavigationHandled={clearPendingNavigation}
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
        onSettingsChange={updateSettings}
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

      {/* Command Palette (Ctrl+Shift+P) */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={commands}
        placeholder="Type a command..."
      />

      {/* Quick Open (Ctrl+P) */}
      <QuickOpen
        isOpen={quickOpenOpen}
        onClose={() => setQuickOpenOpen(false)}
        files={workspaceFiles}
        recentFiles={tabs.map(t => t.path)}
        onFileSelect={handleQuickOpenSelect}
        onGoToLine={(line) => activeTab && goToPosition(activeTab.path, line, 1)}
      />

      {/* Go to Symbol (Ctrl+Shift+O) */}
      <GoToSymbol
        isOpen={goToSymbolOpen}
        onClose={() => setGoToSymbolOpen(false)}
        symbols={documentSymbols}
        onSymbolSelect={handleSymbolSelect}
        currentLine={activeTab ? 1 : undefined}
      />
    </div>
  );
};
