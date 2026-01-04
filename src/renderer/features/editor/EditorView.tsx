/**
 * EditorView Component
 * 
 * Standalone editor view that uses the EditorProvider context.
 * Can be placed anywhere in the app layout.
 * Includes loading states and revert functionality.
 * 
 * VS Code Features:
 * - Command Palette (Ctrl+Shift+P)
 * - Quick Open / Go to File (Ctrl+P)
 * - Go to Symbol (Ctrl+Shift+O)
 * - Keyboard shortcuts
 * - Breadcrumbs navigation
 */

import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { Loader2, Save, Settings, FolderOpen, FileText, RotateCcw, Layout, Code, Terminal, Moon, Type, Keyboard } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useEditor } from '../../state/EditorProvider';
import {
  EditorTabBar,
  MonacoEditor,
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
    goToFileAndLine,
    hasUnsavedChanges,
  } = useEditor();
  
  const isLoading = tabs.some(t => t.isLoading);
  
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [showAIResult, setShowAIResult] = useState(false);
  
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [goToSymbolOpen, setGoToSymbolOpen] = useState(false);
  
  const _editorRef = useRef<{ getEditor: () => unknown } | null>(null);
  
  const [workspaceFiles, setWorkspaceFiles] = useState<QuickOpenFile[]>([]);
  const activeWorkspace = useActiveWorkspace();
  
  useEffect(() => {
    const loadFiles = async () => {
      try {
        if (activeWorkspace?.path) {
          const result = await window.vyotiq?.files?.listDir?.(activeWorkspace.path, { recursive: true, maxDepth: 5 });
          if (result?.success && result.files) {
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

  const {
    actionState,
    executeAction,
    clearActionResult,
  } = useEditorAI();
  
  const handleContentChange = useCallback((content: string) => {
    if (activeTabId) {
      updateContent(activeTabId, content);
    }
  }, [activeTabId, updateContent]);
  
  const handleSave = useCallback(async () => {
    if (activeTabId) {
      await saveFile(activeTabId);
    }
  }, [activeTabId, saveFile]);
  
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

  const handleRevertFile = useCallback(() => {
    if (activeTabId && activeTab?.isDirty) {
      revertFile(activeTabId);
    }
  }, [activeTabId, activeTab, revertFile]);

  const handleQuickOpenSelect = useCallback((path: string) => {
    openFile(path);
  }, [openFile]);

  const handleSymbolSelect = useCallback((symbol: DocumentSymbol) => {
    if (activeTab) {
      goToFileAndLine(activeTab.path, symbol.line, symbol.column);
    }
  }, [activeTab, goToFileAndLine]);

  const [documentSymbols, setDocumentSymbols] = useState<DocumentSymbol[]>([]);

  useEffect(() => {
    if (!activeTab?.content) {
      setDocumentSymbols([]);
      return;
    }

    const symbols: DocumentSymbol[] = [];
    const lines = activeTab.content.split('\n');
    
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

  const commands = useMemo<Command[]>(() => [
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
    {
      id: 'view.settings',
      label: 'Open Editor Settings',
      icon: Settings,
      category: 'View',
      action: () => setSettingsMenuOpen(true),
    },
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
    {
      id: 'workspace.openFolder',
      label: 'Open Folder...',
      icon: FolderOpen,
      category: 'Workspace',
      action: () => window.vyotiq?.workspace?.add?.(),
    },
    {
      id: 'layout.toggle',
      label: 'Toggle Layout',
      icon: Layout,
      category: 'View',
      action: () => updateSettings({ minimap: !settings.minimap }),
    },
    {
      id: 'terminal.toggle',
      label: 'Toggle Terminal',
      icon: Terminal,
      category: 'View',
      shortcut: 'Ctrl+`',
      action: () => console.log('Toggle terminal requested'),
    },
    {
      id: 'theme.toggle',
      label: 'Toggle Dark/Light Theme',
      icon: Moon,
      category: 'Preferences',
      action: () => {
        const newTheme = settings.theme === 'vyotiq-dark' ? 'vs' : 'vyotiq-dark';
        updateSettings({ theme: newTheme });
      },
    },
    {
      id: 'keyboard.showShortcuts',
      label: 'Show Keyboard Shortcuts',
      icon: Keyboard,
      category: 'Help',
      shortcut: 'Ctrl+K Ctrl+S',
      action: () => console.log('Show keyboard shortcuts requested'),
    },
  ], [
    activeTab, activeTabId, tabs, settings,
    handleSave, saveAllFiles, handleRevertFile, closeTab, closeAllTabs,
    nextTab, prevTab, updateSettings,
  ]);
  
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

      if (modKey && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      if (modKey && !e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setQuickOpenOpen(true);
        return;
      }

      if (modKey && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        setGoToSymbolOpen(true);
        return;
      }

      if (e.key === 'F1') {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabId, handleSave, saveAllFiles, closeTab, nextTab, prevTab, handleRevertFile]);
  
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

      {activeTab && (
        <Breadcrumbs
          filePath={activeTab.path}
          symbols={documentSymbols.slice(0, 3)}
          onSymbolClick={handleSymbolSelect}
          onShowSymbolPicker={() => setGoToSymbolOpen(true)}
        />
      )}
      
      <div className="flex-1 min-h-0 relative">
        {isLoading && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-[var(--color-surface-base)]/80 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
              <Loader2 size={16} className="animate-spin" />
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
            pendingNavigation={pendingNavigation}
            onNavigationHandled={clearPendingNavigation}
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
        onSettingsChange={updateSettings}
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

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={commands}
        placeholder="Type a command..."
      />

      <QuickOpen
        isOpen={quickOpenOpen}
        onClose={() => setQuickOpenOpen(false)}
        files={workspaceFiles}
        recentFiles={tabs.map(t => t.path)}
        onFileSelect={handleQuickOpenSelect}
        onGoToLine={(line) => activeTab && goToFileAndLine(activeTab.path, line, 1)}
      />

      <GoToSymbol
        isOpen={goToSymbolOpen}
        onClose={() => setGoToSymbolOpen(false)}
        symbols={documentSymbols}
        onSymbolSelect={handleSymbolSelect}
      />
    </div>
  );
};
