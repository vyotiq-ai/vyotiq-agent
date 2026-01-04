/**
 * EditorProvider
 * 
 * Global state provider for the code editor.
 * Manages open files, tabs, and editor settings across the app.
 * Syncs with global EditorAISettings from the settings store.
 * 
 * Performance optimizations:
 * - Batched state updates to reduce re-renders
 * - Memoized context value to prevent unnecessary consumer re-renders
 * - Debounced localStorage persistence
 * - Optimized tab operations with minimal state mutations
 */

import React, { createContext, useContext, useCallback, useState, useRef, useEffect, useMemo } from 'react';
import type * as monaco from 'monaco-editor';
import { useWorkspaceContext } from './WorkspaceContextProvider';
import { useAgentSelector } from './AgentProvider';
import type { EditorTab, EditorSettings } from '../features/editor/types';
import { DEFAULT_EDITOR_SETTINGS } from '../features/editor/types';
import { getLanguageFromPath, getFileName, isTextFile } from '../features/editor/utils/languageUtils';
import { createLogger } from '../utils/logger';

const logger = createLogger('EditorProvider');

const STORAGE_KEY = 'vyotiq-editor-tabs';
const SETTINGS_KEY = 'vyotiq-editor-settings';

// Utility function for debouncing
const debounce = <T extends (...args: unknown[]) => void>(fn: T, delay: number) => {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

// Utility function for decoding file content
const decodeFileContent = (content: string, encoding?: string) => {
  if (encoding === 'base64') {
    try {
      return atob(content);
    } catch {
      try {
        const binaryString = atob(content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return new TextDecoder('utf-8').decode(bytes);
      } catch {
        return content;
      }
    }
  }
  return content;
};

interface EditorContextValue {
  // State
  tabs: EditorTab[];
  activeTabId: string | null;
  activeTab: EditorTab | null;
  settings: EditorSettings;
  isEditorVisible: boolean;

  // Pending navigation for when switching tabs
  pendingNavigation: { line: number; column: number } | null;
  clearPendingNavigation: () => void;

  // Tab operations
  openFile: (path: string) => Promise<void>;
  closeTab: (tabId: string) => void;
  closeAllTabs: () => void;
  closeOtherTabs: (tabId: string) => void;
  closeSavedTabs: () => void;
  setActiveTab: (tabId: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;

  // Content operations
  updateContent: (tabId: string, content: string) => void;
  saveFile: (tabId: string) => Promise<boolean>;
  saveAllFiles: () => Promise<void>;
  revertFile: (tabId: string) => void;

  // View state
  updateViewState: (tabId: string, viewState: monaco.editor.ICodeEditorViewState | null) => void;
  updateCursorPosition: (tabId: string, position: { lineNumber: number; column: number }) => void;

  // Settings
  updateSettings: (settings: Partial<EditorSettings>) => void;

  // Navigation
  nextTab: () => void;
  prevTab: () => void;
  goToFileAndLine: (filePath: string, line: number, column?: number) => Promise<void>;

  // Visibility
  showEditor: () => void;
  hideEditor: () => void;
  toggleEditor: () => void;

  // Queries
  hasUnsavedChanges: () => boolean;
  getUnsavedTabs: () => EditorTab[];
  isFileOpen: (path: string) => boolean;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export const useEditor = (): EditorContextValue => {
  const context = useContext(EditorContext);
  if (!context) {
    if (import.meta.env.DEV) {
      console.warn('useEditor: EditorContext is null, likely used outside EditorProvider');
    }
    throw new Error('useEditor must be used within EditorProvider');
  }
  return context;
};

interface EditorProviderProps {
  children: React.ReactNode;
}

export const EditorProvider: React.FC<EditorProviderProps> = ({ children }) => {
  // Get global EditorAI settings from AgentProvider
  const globalEditorAISettings = useAgentSelector(
    (s) => s.settings?.editorAISettings,
    (a, b) => a === b,
  );

  // Get workspace diagnostics from context
  const { state: workspaceState, addRecentFile } = useWorkspaceContext();

  // Initialize tabs from localStorage
  const [tabs, setTabs] = useState<EditorTab[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.map((tab: Partial<EditorTab>) => ({
          ...tab,
          content: '',
          originalContent: '',
          isLoading: true,
          isDirty: false,
          hasError: false,
        }));
      }
    } catch (err) {
      logger.debug('Failed to restore tabs from localStorage', { error: err });
    }
    return [];
  });

  const [activeTabId, setActiveTabId] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed[0]?.id || null;
      }
    } catch {
      return null;
    }
    return null;
  });

  const [settings, setSettings] = useState<EditorSettings>(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        return { ...DEFAULT_EDITOR_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (err) {
      logger.debug('Failed to restore settings from localStorage', { error: err });
    }
    return DEFAULT_EDITOR_SETTINGS;
  });

  const [isEditorVisible, setIsEditorVisible] = useState(true);
  const [pendingNavigation, setPendingNavigation] = useState<{ line: number; column: number } | null>(null);

  const tabHistoryRef = useRef<string[]>([]);
  const viewStateUpdateRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cursorUpdateRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Debounced persist functions
  const debouncedPersistTabs = useMemo(
    () => debounce((tabsToStore: EditorTab[]) => {
      try {
        const toStore = tabsToStore.map(tab => ({
          id: tab.id,
          path: tab.path,
          name: tab.name,
          language: tab.language,
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
      } catch (err) {
        logger.debug('Failed to persist tabs', { error: err });
      }
    }, 300),
    []
  );

  const debouncedPersistSettings = useMemo(
    () => debounce((settingsToStore: EditorSettings) => {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsToStore));
      } catch (err) {
        logger.debug('Failed to persist settings', { error: err });
      }
    }, 300),
    []
  );

  useEffect(() => {
    debouncedPersistTabs(tabs);
  }, [tabs, debouncedPersistTabs]);

  useEffect(() => {
    debouncedPersistSettings(settings);
  }, [settings, debouncedPersistSettings]);

  // Subscribe to file change events
  useEffect(() => {
    const unsubscribe = window.vyotiq.files.onFileChange((event) => {
      if (event.type === 'delete') {
        setTabs(prev => {
          const deletedTab = prev.find(t => t.path === event.path);
          if (!deletedTab) return prev;
          return prev.filter(t => t.path !== event.path);
        });
        setActiveTabId(prev => {
          if (prev !== event.path) return prev;
          const validHistory = tabHistoryRef.current.filter(id => id !== event.path);
          if (validHistory.length > 0) {
            return validHistory[validHistory.length - 1];
          }
          return null;
        });
      } else if (event.type === 'rename') {
        setTabs(prev => prev.map(t => {
          if (t.path === event.oldPath) {
            logger.debug('Updating tab path for renamed file', { oldPath: event.oldPath, newPath: event.path });
            return {
              ...t,
              id: event.path,
              path: event.path,
              name: getFileName(event.path),
              language: getLanguageFromPath(event.path),
            };
          }
          return t;
        }));
        setActiveTabId(prev => prev === event.oldPath ? event.path : prev);
        tabHistoryRef.current = tabHistoryRef.current.map(id => 
          id === event.oldPath ? event.path : id
        );
      }
    });
    return () => unsubscribe();
  }, []);

  // Sync global EditorAI settings
  useEffect(() => {
    if (globalEditorAISettings) {
      setSettings(prev => ({
        ...prev,
        enableAI: globalEditorAISettings.enableCodeActions,
        enableInlineCompletions: globalEditorAISettings.enableInlineCompletions,
        enableQuickFixes: globalEditorAISettings.enableQuickFixes,
        inlineCompletionDebounceMs: globalEditorAISettings.inlineCompletionDebounceMs,
        inlineCompletionMaxTokens: globalEditorAISettings.inlineCompletionMaxTokens,
        contextLinesBefore: globalEditorAISettings.contextLinesBefore,
        contextLinesAfter: globalEditorAISettings.contextLinesAfter,
      }));
    }
  }, [globalEditorAISettings]);

  // Sync editor state to main process
  useEffect(() => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    const diagnostics = workspaceState.diagnostics.map(d => ({
      filePath: d.filePath,
      message: d.message,
      severity: d.severity,
      line: d.line,
      column: d.column,
      endLine: d.endLine,
      endColumn: d.endColumn,
      source: d.source,
      code: d.code,
    }));

    window.vyotiq.agent.updateEditorState({
      openFiles: tabs.map(t => t.path),
      activeFile: activeTab?.path || null,
      cursorPosition: activeTab?.cursorPosition || null,
      diagnostics,
    }).catch(err => {
      logger.debug('Failed to sync editor state', { error: err });
    });
  }, [tabs, activeTabId, workspaceState.diagnostics]);

  // Load file content
  const loadFileContent = useCallback(async (path: string) => {
    try {
      const result = await window.vyotiq.files.read([path]);
      if (result && result.length > 0 && result[0].content) {
        return { content: decodeFileContent(result[0].content, result[0].encoding), error: null };
      }
      return { content: '', error: 'Failed to read file' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { content: '', error: message };
    }
  }, []);

  // Load content for restored tabs on mount
  useEffect(() => {
    const loadRestoredTabs = async () => {
      const tabsToLoad = tabs.filter(t => t.isLoading);
      if (tabsToLoad.length === 0) return;

      logger.debug('Loading content for restored tabs', { count: tabsToLoad.length });

      const results = await Promise.all(
        tabsToLoad.map(async (tab) => {
          const { content, error } = await loadFileContent(tab.path);
          return { id: tab.id, content, error };
        })
      );

      setTabs(prev => prev.map(tab => {
        const result = results.find(r => r.id === tab.id);
        if (!result) return tab;
        return {
          ...tab,
          content: result.content,
          originalContent: result.content,
          isLoading: false,
          hasError: !!result.error,
          errorMessage: result.error,
        };
      }));
    };

    loadRestoredTabs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openFile = useCallback(async (path: string) => {
    if (!isTextFile(path)) {
      await window.vyotiq.files.open(path);
      return;
    }

    const existingTab = tabs.find(t => t.path === path);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      setIsEditorVisible(true);

      if (existingTab.isLoading && !existingTab.content) {
        const { content } = await loadFileContent(path);
        setTabs(prev => prev.map(t =>
          t.id === existingTab.id
            ? { ...t, content, originalContent: content, isLoading: false }
            : t
        ));
      }
      return;
    }

    const newTab: EditorTab = {
      id: path,
      path,
      name: getFileName(path),
      content: '',
      originalContent: '',
      language: getLanguageFromPath(path),
      isDirty: false,
      isLoading: true,
      hasError: false,
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTabId(path);
    setIsEditorVisible(true);
    addRecentFile(path);
    tabHistoryRef.current.push(path);

    const { content, error } = await loadFileContent(path);
    setTabs(prev => prev.map(t =>
      t.id === path
        ? { ...t, content, originalContent: content, isLoading: false, hasError: !!error, errorMessage: error }
        : t
    ));

    logger.debug('Opened file', { path });
  }, [tabs, loadFileContent, addRecentFile]);

  const closeTab = useCallback((tabId: string) => {
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;

    setTabs(prev => prev.filter(t => t.id !== tabId));

    if (activeTabId === tabId) {
      const history = tabHistoryRef.current.filter(id => id !== tabId);
      if (history.length > 0) {
        setActiveTabId(history[history.length - 1]);
      } else if (tabs.length > 1) {
        const newIndex = Math.min(tabIndex, tabs.length - 2);
        setActiveTabId(tabs[newIndex].id);
      } else {
        setActiveTabId(null);
      }
    }

    tabHistoryRef.current = tabHistoryRef.current.filter(id => id !== tabId);
  }, [tabs, activeTabId]);

  const closeAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTabId(null);
    tabHistoryRef.current = [];
  }, []);

  const closeOtherTabs = useCallback((tabId: string) => {
    setTabs(prev => prev.filter(t => t.id === tabId));
    setActiveTabId(tabId);
    tabHistoryRef.current = [tabId];
  }, []);

  const closeSavedTabs = useCallback(() => {
    const dirtyTabs = tabs.filter(t => t.isDirty);
    setTabs(dirtyTabs);
    if (activeTabId && !dirtyTabs.some(t => t.id === activeTabId)) {
      setActiveTabId(dirtyTabs[0]?.id || null);
    }
    tabHistoryRef.current = tabHistoryRef.current.filter(id => dirtyTabs.some(t => t.id === id));
  }, [tabs, activeTabId]);

  const setActiveTabHandler = useCallback((tabId: string) => {
    if (tabs.some(t => t.id === tabId)) {
      setActiveTabId(tabId);
      tabHistoryRef.current.push(tabId);
    }
  }, [tabs]);

  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabs(prev => {
      const newTabs = [...prev];
      const [removed] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, removed);
      return newTabs;
    });
  }, []);

  const updateContent = useCallback((tabId: string, content: string) => {
    setTabs(prev => {
      const tabIndex = prev.findIndex(t => t.id === tabId);
      if (tabIndex === -1) return prev;
      
      const tab = prev[tabIndex];
      if (tab.content === content) return prev;
      
      const isDirty = content !== tab.originalContent;
      if (tab.content !== content || tab.isDirty !== isDirty) {
        const newTabs = [...prev];
        newTabs[tabIndex] = { ...tab, content, isDirty };
        return newTabs;
      }
      return prev;
    });
  }, []);

  const saveFile = useCallback(async (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab || !tab.isDirty) return true;

    try {
      const result = await window.vyotiq.files.write(tab.path, tab.content);
      if (result.success) {
        setTabs(prev => prev.map(t =>
          t.id === tabId ? { ...t, originalContent: t.content, isDirty: false } : t
        ));
        return true;
      }
      logger.error('Failed to save file', { path: tab.path, error: result.error });
      return false;
    } catch (err) {
      logger.error('Failed to save file', { path: tab.path, error: err });
      return false;
    }
  }, [tabs]);

  const saveAllFiles = useCallback(async () => {
    const dirtyTabs = tabs.filter(t => t.isDirty);
    await Promise.all(dirtyTabs.map(tab => saveFile(tab.id)));
  }, [tabs, saveFile]);

  const revertFile = useCallback((tabId: string) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, content: t.originalContent, isDirty: false } : t
    ));
  }, []);

  const updateViewState = useCallback((tabId: string, viewState: monaco.editor.ICodeEditorViewState | null) => {
    if (viewStateUpdateRef.current) {
      clearTimeout(viewStateUpdateRef.current);
    }
    viewStateUpdateRef.current = setTimeout(() => {
      setTabs(prev => {
        const tabIndex = prev.findIndex(t => t.id === tabId);
        if (tabIndex === -1) return prev;
        const newTabs = [...prev];
        newTabs[tabIndex] = { ...prev[tabIndex], viewState };
        return newTabs;
      });
    }, 100);
  }, []);

  const updateCursorPosition = useCallback((tabId: string, position: { lineNumber: number; column: number }) => {
    if (cursorUpdateRef.current) {
      clearTimeout(cursorUpdateRef.current);
    }
    cursorUpdateRef.current = setTimeout(() => {
      setTabs(prev => {
        const tabIndex = prev.findIndex(t => t.id === tabId);
        if (tabIndex === -1) return prev;
        const tab = prev[tabIndex];

        if (tab.cursorPosition?.lineNumber === position.lineNumber && 
            tab.cursorPosition?.column === position.column) {
          return prev;
        }
        const newTabs = [...prev];
        newTabs[tabIndex] = { ...tab, cursorPosition: position };
        return newTabs;
      });
    }, 50);
  }, []);

  const updateSettings = useCallback((newSettings: Partial<EditorSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const nextTab = useCallback(() => {
    if (tabs.length === 0) return;
    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    const nextIndex = (currentIndex + 1) % tabs.length;
    setActiveTabId(tabs[nextIndex].id);
  }, [tabs, activeTabId]);

  const prevTab = useCallback(() => {
    if (tabs.length === 0) return;
    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    const prevIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
    setActiveTabId(tabs[prevIndex].id);
  }, [tabs, activeTabId]);

  const goToFileAndLine = useCallback(async (filePath: string, line: number, column = 1) => {
    const existingTab = tabs.find(t => t.path === filePath);
    if (existingTab) {
      setActiveTabId(existingTab.id);
    } else {
      await openFile(filePath);
    }
    setPendingNavigation({ line, column });
    setIsEditorVisible(true);
  }, [tabs, openFile]);

  const clearPendingNavigation = useCallback(() => {
    setPendingNavigation(null);
  }, []);

  const showEditor = useCallback(() => setIsEditorVisible(true), []);
  const hideEditor = useCallback(() => setIsEditorVisible(false), []);
  const toggleEditor = useCallback(() => setIsEditorVisible(prev => !prev), []);

  const hasUnsavedChanges = useCallback(() => tabs.some(t => t.isDirty), [tabs]);
  const getUnsavedTabs = useCallback(() => tabs.filter(t => t.isDirty), [tabs]);
  const isFileOpen = useCallback((path: string) => tabs.some(t => t.path === path), [tabs]);

  const activeTab = useMemo(
    () => tabs.find(t => t.id === activeTabId) || null,
    [tabs, activeTabId]
  );

  const value: EditorContextValue = useMemo(() => ({
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
    setActiveTab: setActiveTabHandler,
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
    showEditor,
    hideEditor,
    toggleEditor,
    hasUnsavedChanges,
    getUnsavedTabs,
    isFileOpen,
  }), [
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
    setActiveTabHandler,
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
    showEditor,
    hideEditor,
    toggleEditor,
    hasUnsavedChanges,
    getUnsavedTabs,
    isFileOpen,
  ]);

  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  );
};