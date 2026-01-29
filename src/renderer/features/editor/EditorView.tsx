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
 * - Integrated Terminal (Ctrl+`)
 * - Problems Panel (Ctrl+Shift+M)
 */

import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { Loader2, Save, Settings, FolderOpen, FileText, RotateCcw, Layout, Code, Terminal, Moon, Type, Keyboard, GitCompare, Search, Replace, AlignJustify, Hash, AlertCircle } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useEditor } from '../../state/EditorProvider';
import { useUI } from '../../state/UIProvider';
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
  GoToLine,
  Breadcrumbs,
  DiffPanel,
  BottomPanel,
} from './components';
import type { Problem } from './components/ProblemsPanel';
import type { PanelTab } from './components/BottomPanel';
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
    diffState,
    showDiff,
    hideDiff,
    acceptDiff,
    rejectDiff,
    bottomPanelOpen,
    bottomPanelActiveTab,
    setBottomPanelOpen,
    setBottomPanelActiveTab,
  } = useEditor();
  
  // Get UI functions for keyboard shortcuts modal
  const { openShortcuts } = useUI();
  
  const isLoading = tabs.some(t => t.isLoading);
  
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [showAIResult, setShowAIResult] = useState(false);
  
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [goToSymbolOpen, setGoToSymbolOpen] = useState(false);
  const [goToLineOpen, setGoToLineOpen] = useState(false);
  
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
      id: 'nav.goToLine',
      label: 'Go to Line...',
      icon: Hash,
      category: 'Navigation',
      shortcut: 'Ctrl+G',
      action: () => setGoToLineOpen(true),
      when: () => !!activeTab,
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
      id: 'editor.format',
      label: 'Format Document',
      icon: AlignJustify,
      category: 'Editor',
      shortcut: 'Shift+Alt+F',
      action: () => {
        // Monaco's built-in format action - triggered via the editor ref
        document.dispatchEvent(new CustomEvent('vyotiq:editor:formatDocument'));
      },
      when: () => !!activeTab,
    },
    {
      id: 'editor.find',
      label: 'Find',
      icon: Search,
      category: 'Edit',
      shortcut: 'Ctrl+F',
      action: () => {
        // Trigger Monaco's built-in find widget
        document.dispatchEvent(new CustomEvent('vyotiq:editor:find'));
      },
      when: () => !!activeTab,
    },
    {
      id: 'editor.replace',
      label: 'Replace',
      icon: Replace,
      category: 'Edit',
      shortcut: 'Ctrl+H',
      action: () => {
        // Trigger Monaco's built-in find/replace widget
        document.dispatchEvent(new CustomEvent('vyotiq:editor:replace'));
      },
      when: () => !!activeTab,
    },
    {
      id: 'workspace.openFolder',
      label: 'Open Folder...',
      icon: FolderOpen,
      category: 'Workspace',
      action: () => window.vyotiq?.workspace?.add?.(),
    },
    {
      id: 'view.problems',
      label: bottomPanelOpen && bottomPanelActiveTab === 'problems' ? 'Hide Problems' : 'Show Problems',
      icon: AlertCircle,
      category: 'View',
      shortcut: 'Ctrl+Shift+M',
      action: () => {
        if (bottomPanelOpen && bottomPanelActiveTab === 'problems') {
          setBottomPanelOpen(false);
        } else {
          setBottomPanelActiveTab('problems');
          setBottomPanelOpen(true);
        }
      },
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
      label: bottomPanelOpen && bottomPanelActiveTab === 'terminal' ? 'Hide Terminal' : 'Show Terminal',
      icon: Terminal,
      category: 'View',
      shortcut: 'Ctrl+`',
      action: () => {
        if (bottomPanelOpen && bottomPanelActiveTab === 'terminal') {
          setBottomPanelOpen(false);
        } else {
          setBottomPanelActiveTab('terminal');
          setBottomPanelOpen(true);
        }
      },
    },
    {
      id: 'output.toggle',
      label: bottomPanelOpen && bottomPanelActiveTab === 'output' ? 'Hide Output' : 'Show Output',
      category: 'View',
      shortcut: 'Ctrl+Shift+U',
      action: () => {
        if (bottomPanelOpen && bottomPanelActiveTab === 'output') {
          setBottomPanelOpen(false);
        } else {
          setBottomPanelActiveTab('output');
          setBottomPanelOpen(true);
        }
      },
    },
    {
      id: 'debugConsole.toggle',
      label: bottomPanelOpen && bottomPanelActiveTab === 'debug-console' ? 'Hide Debug Console' : 'Show Debug Console',
      category: 'View',
      shortcut: 'Ctrl+Shift+Y',
      action: () => {
        if (bottomPanelOpen && bottomPanelActiveTab === 'debug-console') {
          setBottomPanelOpen(false);
        } else {
          setBottomPanelActiveTab('debug-console');
          setBottomPanelOpen(true);
        }
      },
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
      action: openShortcuts,
    },
    {
      id: 'diff.compareWithSaved',
      label: 'Compare with Saved',
      icon: GitCompare,
      category: 'File',
      action: () => {
        if (activeTab && activeTab.isDirty) {
          showDiff({
            original: activeTab.originalContent,
            modified: activeTab.content,
            filePath: activeTab.path,
            language: activeTab.language,
            originalLabel: 'Saved',
            modifiedLabel: 'Current',
          });
        }
      },
      when: () => !!activeTab?.isDirty,
    },
    // VSCode Editor Features
    {
      id: 'editor.stickyScroll.toggle',
      label: settings.stickyScroll ? 'Disable Sticky Scroll' : 'Enable Sticky Scroll',
      category: 'Editor',
      action: () => updateSettings({ stickyScroll: !settings.stickyScroll }),
    },
    {
      id: 'editor.fontLigatures.toggle',
      label: settings.fontLigatures ? 'Disable Font Ligatures' : 'Enable Font Ligatures',
      category: 'Editor',
      action: () => updateSettings({ fontLigatures: !settings.fontLigatures }),
    },
    {
      id: 'editor.linkedEditing.toggle',
      label: settings.linkedEditing ? 'Disable Linked Editing' : 'Enable Linked Editing',
      category: 'Editor',
      action: () => updateSettings({ linkedEditing: !settings.linkedEditing }),
    },
    {
      id: 'editor.inlayHints.toggle',
      label: settings.inlayHints ? 'Hide Inlay Hints' : 'Show Inlay Hints',
      category: 'Editor',
      action: () => updateSettings({ inlayHints: !settings.inlayHints }),
    },
    {
      id: 'editor.bracketPairColorization.toggle',
      label: settings.bracketPairColorization ? 'Disable Bracket Colorization' : 'Enable Bracket Colorization',
      category: 'Editor',
      action: () => updateSettings({ bracketPairColorization: !settings.bracketPairColorization }),
    },
    {
      id: 'editor.formatOnSave.toggle',
      label: settings.formatOnSave ? 'Disable Format on Save' : 'Enable Format on Save',
      category: 'Editor',
      action: () => updateSettings({ formatOnSave: !settings.formatOnSave }),
    },
    {
      id: 'editor.trimWhitespace.toggle',
      label: settings.trimTrailingWhitespace ? 'Disable Trim Trailing Whitespace' : 'Enable Trim Trailing Whitespace',
      category: 'Editor',
      action: () => updateSettings({ trimTrailingWhitespace: !settings.trimTrailingWhitespace }),
    },
    {
      id: 'editor.renderWhitespace.cycle',
      label: `Render Whitespace: ${settings.renderWhitespace || 'selection'}`,
      category: 'Editor',
      action: () => {
        const modes: Array<'none' | 'boundary' | 'selection' | 'trailing' | 'all'> = ['none', 'selection', 'trailing', 'boundary', 'all'];
        const current = settings.renderWhitespace || 'selection';
        const nextIndex = (modes.indexOf(current) + 1) % modes.length;
        updateSettings({ renderWhitespace: modes[nextIndex] });
      },
    },
    // TypeScript / Language Server commands
    {
      id: 'typescript.restartServer',
      label: 'TypeScript: Restart TS Server',
      description: 'Restart the TypeScript Language Server to pick up new type definitions',
      icon: RotateCcw,
      category: 'TypeScript',
      action: async () => {
        try {
          // Import Monaco dynamically to access its API
          const monaco = await import('monaco-editor');
          
          // Clear all existing TypeScript/LSP markers from all models
          const models = monaco.editor.getModels();
          for (const model of models) {
            // Clear markers from various sources
            monaco.editor.setModelMarkers(model, 'typescript', []);
            monaco.editor.setModelMarkers(model, 'lsp', []);
            monaco.editor.setModelMarkers(model, 'javascript', []);
          }
          
          // Restart the backend TypeScript Diagnostics Service
          const result = await window.vyotiq?.lsp?.restartTypeScriptServer?.();
          
          if (result?.success) {
            console.log('TypeScript server restarted successfully', result.diagnostics);
            
            // Force Monaco to re-validate by touching each TypeScript/JavaScript model
            for (const model of models) {
              const uri = model.uri;
              const path = uri.path.toLowerCase();
              if (path.endsWith('.ts') || path.endsWith('.tsx') || path.endsWith('.js') || path.endsWith('.jsx')) {
                // Trigger a change event to force re-validation
                const content = model.getValue();
                model.setValue(content);
              }
            }
          } else {
            console.error('Failed to restart TypeScript server:', result?.error);
          }
        } catch (err) {
          console.error('Error restarting TypeScript server:', err);
        }
      },
    },
    {
      id: 'typescript.refreshDiagnostics',
      label: 'TypeScript: Refresh Diagnostics',
      description: 'Refresh all TypeScript and LSP diagnostics',
      icon: RotateCcw,
      category: 'TypeScript',
      action: async () => {
        try {
          // Import Monaco dynamically
          const monaco = await import('monaco-editor');
          
          // Clear all existing markers
          const models = monaco.editor.getModels();
          for (const model of models) {
            monaco.editor.setModelMarkers(model, 'typescript', []);
            monaco.editor.setModelMarkers(model, 'lsp', []);
            monaco.editor.setModelMarkers(model, 'javascript', []);
          }
          
          // Refresh diagnostics from backend
          const result = await window.vyotiq?.lsp?.refreshDiagnostics?.();
          
          if (result?.success) {
            console.log('Diagnostics refreshed', result);
            
            // Force Monaco to re-validate
            for (const model of models) {
              const uri = model.uri;
              const path = uri.path.toLowerCase();
              if (path.endsWith('.ts') || path.endsWith('.tsx') || path.endsWith('.js') || path.endsWith('.jsx')) {
                const content = model.getValue();
                model.setValue(content);
              }
            }
          } else {
            console.error('Failed to refresh diagnostics:', result?.error);
          }
        } catch (err) {
          console.error('Error refreshing diagnostics:', err);
        }
      },
    },
  ], [
    activeTab, activeTabId, tabs, settings, bottomPanelOpen, bottomPanelActiveTab,
    handleSave, saveAllFiles, handleRevertFile, closeTab, closeAllTabs,
    nextTab, prevTab, updateSettings, showDiff, openShortcuts, setBottomPanelActiveTab, setBottomPanelOpen,
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

      // Ctrl+G - Go to Line
      if (modKey && !e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        setGoToLineOpen(true);
        return;
      }

      // Ctrl+Shift+M - Toggle Problems Panel
      if (modKey && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        if (bottomPanelOpen && bottomPanelActiveTab === 'problems') {
          setBottomPanelOpen(false);
        } else {
          setBottomPanelActiveTab('problems');
          setBottomPanelOpen(true);
        }
        return;
      }

      // Ctrl+` - Toggle Terminal
      if (modKey && e.key === '`') {
        e.preventDefault();
        if (bottomPanelOpen && bottomPanelActiveTab === 'terminal') {
          setBottomPanelOpen(false);
        } else {
          setBottomPanelActiveTab('terminal');
          setBottomPanelOpen(true);
        }
        return;
      }

      // Ctrl+Shift+U - Toggle Output Panel
      if (modKey && e.shiftKey && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        if (bottomPanelOpen && bottomPanelActiveTab === 'output') {
          setBottomPanelOpen(false);
        } else {
          setBottomPanelActiveTab('output');
          setBottomPanelOpen(true);
        }
        return;
      }

      // Ctrl+Shift+Y - Toggle Debug Console
      if (modKey && e.shiftKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (bottomPanelOpen && bottomPanelActiveTab === 'debug-console') {
          setBottomPanelOpen(false);
        } else {
          setBottomPanelActiveTab('debug-console');
          setBottomPanelOpen(true);
        }
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
  }, [activeTabId, handleSave, saveAllFiles, closeTab, nextTab, prevTab, handleRevertFile, bottomPanelOpen, bottomPanelActiveTab, setBottomPanelActiveTab, setBottomPanelOpen]);
  
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

  // Panel toggle events are now handled in EditorProvider
  // The Home component now shows EditorView when bottomPanelOpen is true
  // so we don't need a separate hidden render path
  
  return (
    <div className={cn('flex flex-col h-full bg-[var(--color-surface-base)]', className)}>
      {/* Only show tab bar and editor content when there are tabs */}
      {tabs.length > 0 && (
        <>
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
            
            {activeTab ? (
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

          <GoToLine
            isOpen={goToLineOpen}
            onClose={() => setGoToLineOpen(false)}
            onGoToLine={(line, column) => activeTab && goToFileAndLine(activeTab.path, line, column || 1)}
            currentLine={activeTab?.cursorPosition?.lineNumber || 1}
            totalLines={activeTab?.content?.split('\n').length || 1}
          />

          <DiffPanel
            isOpen={diffState.isVisible}
            original={diffState.original}
            modified={diffState.modified}
            language={diffState.language}
            originalLabel={diffState.originalLabel}
            modifiedLabel={diffState.modifiedLabel}
            settings={settings}
            viewMode={diffState.viewMode}
            onClose={hideDiff}
            onAcceptAll={acceptDiff}
            onRejectAll={rejectDiff}
            position="bottom"
          />
        </>
      )}

      {/* Show empty state when no tabs are open and bottom panel is closed */}
      {tabs.length === 0 && !bottomPanelOpen && isEditorVisible && (
        <EditorEmptyState
          onOpenFile={() => setQuickOpenOpen(true)}
          className="flex-1"
        />
      )}

      {/* Bottom panel - fills remaining space when no tabs are open */}
      <div className={cn(tabs.length === 0 ? 'flex-1 min-h-0' : '')}>
        <BottomPanel
          isOpen={bottomPanelOpen}
          onClose={() => setBottomPanelOpen(false)}
          activeTab={bottomPanelActiveTab as PanelTab}
          onTabChange={setBottomPanelActiveTab}
          workspacePath={activeWorkspace?.path}
          onProblemClick={(problem: Problem) => {
            goToFileAndLine(problem.file, problem.line, problem.column);
          }}
          fillHeight={tabs.length === 0}
        />
      </div>
    </div>
  );
};
