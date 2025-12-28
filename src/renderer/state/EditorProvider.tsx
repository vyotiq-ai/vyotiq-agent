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
import type { EditorTab, EditorSettings, FileDiff, DiffViewMode } from '../features/editor/types';
import { DEFAULT_EDITOR_SETTINGS } from '../features/editor/types';
import { getLanguageFromPath, getFileName, isTextFile } from '../features/editor/utils/languageUtils';
import { createLogger } from '../utils/logger';

const logger = createLogger('EditorProvider');

const STORAGE_KEY = 'vyotiq-editor-tabs';
const SETTINGS_KEY = 'vyotiq-editor-settings';

// Debounce helper for localStorage persistence
const debounce = <T extends (...args: unknown[]) => void>(fn: T, ms: number) => {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
};

// Helper to decode file content from API response
const decodeFileContent = (content: string, encoding?: string): string => {
  if (encoding === 'base64') {
    try {
      // First try simple atob
      return atob(content);
    } catch {
      // If atob fails, try using TextDecoder for binary data
      try {
        const binaryString = atob(content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return new TextDecoder('utf-8').decode(bytes);
      } catch {
        // Return original if decoding fails completely
        return content;
      }
    }
  }
  return content;
};

/** Operation diff state for showing file operation results */
export interface OperationDiff {
  path: string;
  originalContent: string | null;
  newContent: string;
  action: 'write' | 'edit' | 'create' | 'modified' | 'created';
  toolCallId?: string;
  timestamp: number;
}

interface EditorContextValue {
  // State
  tabs: EditorTab[];
  activeTabId: string | null;
  activeTab: EditorTab | null;
  settings: EditorSettings;
  isEditorVisible: boolean;

  // Diff state
  diff: FileDiff | null;
  isDiffVisible: boolean;
  diffViewMode: DiffViewMode;

  // Operation diff state - for showing diffs even without open tabs
  operationDiff: OperationDiff | null;
  isOperationDiffVisible: boolean;

  // Pending navigation - used to scroll to a position after tab switch
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
  updateSettings: (newSettings: Partial<EditorSettings>) => void;

  // Navigation
  nextTab: () => void;
  prevTab: () => void;
  goToPosition: (filePath: string, line: number, column: number) => Promise<void>;

  // Visibility
  showEditor: () => void;
  hideEditor: () => void;
  toggleEditor: () => void;

  // Diff operations
  showDiff: (path: string, original: string, modified: string) => void;
  showGitDiff: (path: string) => Promise<void>;
  hideDiff: () => void;
  setDiffViewMode: (mode: DiffViewMode) => void;
  getFileDiff: (path: string) => { original: string; modified: string } | undefined;
  clearFileDiff: (path: string) => void;

  // Operation diff operations - for showing file operation results
  showOperationDiff: (diff: Omit<OperationDiff, 'timestamp'>) => void;
  hideOperationDiff: () => void;
  openOperationDiffFile: () => Promise<void>;

  // Queries
  hasUnsavedChanges: () => boolean;
  getUnsavedTabs: () => EditorTab[];
  isFileOpen: (path: string) => boolean;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export const useEditor = (): EditorContextValue => {
  const context = useContext(EditorContext);
  if (!context) {
    // During HMR, the context might temporarily be null
    // This is a development-only issue that resolves on next render
    if (import.meta.env?.DEV) {
      console.warn('useEditor: EditorContext is null, likely due to HMR. Will retry on next render.');
    }
    throw new Error('useEditor must be used within an EditorProvider');
  }
  return context;
};

interface EditorProviderProps {
  children: React.ReactNode;
}

export const EditorProvider: React.FC<EditorProviderProps> = ({ children }) => {
  // Get global settings from AgentProvider
  const globalEditorAISettings = useAgentSelector(
    (s) => s.settings?.editorAISettings,
    (a, b) => a === b,
  );

  // Load initial state from localStorage
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
      logger.debug('Failed to restore tabs', { error: err });
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
      logger.debug('Failed to restore settings', { error: err });
    }
    return DEFAULT_EDITOR_SETTINGS;
  });

  const [isEditorVisible, setIsEditorVisible] = useState(true);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [isDiffVisible, setIsDiffVisible] = useState(false);
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>('side-by-side');

  // Store diffs per file path so they persist when switching tabs
  const fileDiffsRef = useRef<Map<string, { original: string; modified: string }>>(new Map());

  // Operation diff state - for showing file operation results even without tabs
  const [operationDiff, setOperationDiff] = useState<OperationDiff | null>(null);
  const [isOperationDiffVisible, setIsOperationDiffVisible] = useState(false);

  // Pending navigation - set when we need to scroll to a position after file opens
  const [pendingNavigation, setPendingNavigation] = useState<{ line: number; column: number } | null>(null);

  const { addRecentFile } = useWorkspaceContext();

  const tabHistoryRef = useRef<string[]>([]);

  // Debounced persist functions to reduce localStorage writes
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

  // Persist tabs with debounce
  useEffect(() => {
    debouncedPersistTabs(tabs);
  }, [tabs, debouncedPersistTabs]);

  // Persist settings with debounce
  useEffect(() => {
    debouncedPersistSettings(settings);
  }, [settings, debouncedPersistSettings]);

  // Subscribe to file change events - close tabs when files are deleted
  useEffect(() => {
    const unsubscribe = window.vyotiq.files.onFileChange((event) => {
      if (event.type === 'delete') {
        // Close any tabs for the deleted file
        setTabs(prev => {
          const deletedTab = prev.find(t => t.path === event.path);
          if (!deletedTab) return prev;
          
          logger.debug('Closing tab for deleted file', { path: event.path });
          
          // Remove from history
          tabHistoryRef.current = tabHistoryRef.current.filter(id => id !== deletedTab.id);
          
          return prev.filter(t => t.path !== event.path);
        });
        
        // Update active tab if the deleted file was active
        setActiveTabId(prev => {
          if (prev !== event.path) return prev;
          
          // Find a new tab to activate from history or remaining tabs
          const validHistory = tabHistoryRef.current.filter(id => id !== event.path);
          if (validHistory.length > 0) {
            return validHistory[validHistory.length - 1];
          }
          return null;
        });
      } else if (event.type === 'rename' && event.oldPath) {
        // Update tab path when file is renamed
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
        
        // Update active tab id if it was the renamed file
        setActiveTabId(prev => prev === event.oldPath ? event.path : prev);
        
        // Update history
        tabHistoryRef.current = tabHistoryRef.current.map(id => 
          id === event.oldPath ? event.path : id
        );
      }
    });
    
    return () => unsubscribe();
  }, []); // No dependencies - uses functional updates

  // Sync global EditorAISettings with local EditorSettings
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
      logger.debug('Synced global EditorAI settings to local editor settings', {
        enableInlineCompletions: globalEditorAISettings.enableInlineCompletions,
        enableQuickFixes: globalEditorAISettings.enableQuickFixes,
        enableCodeActions: globalEditorAISettings.enableCodeActions,
        debounceMs: globalEditorAISettings.inlineCompletionDebounceMs,
        maxTokens: globalEditorAISettings.inlineCompletionMaxTokens,
      });
    }
  }, [globalEditorAISettings]);

  // Sync editor state to main process for agent context
  useEffect(() => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    window.vyotiq.agent.updateEditorState({
      openFiles: tabs.map(t => t.path),
      activeFile: activeTab?.path || null,
      cursorPosition: activeTab?.cursorPosition || null,
    }).catch((err: unknown) => {
      logger.debug('Failed to sync editor state', { error: err });
    });
  }, [tabs, activeTabId]);

  // Load file content
  const loadFileContent = useCallback(async (filePath: string): Promise<{ content: string; error?: string }> => {
    try {
      const result = await window.vyotiq.files.read([filePath]);
      if (result && result.length > 0 && result[0].content) {
        const content = decodeFileContent(result[0].content, result[0].encoding);
        return { content };
      }
      return { content: '', error: 'Failed to read file' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read file';
      return { content: '', error: message };
    }
  }, []);

  // Load content for restored tabs on mount
  useEffect(() => {
    const loadRestoredTabs = async () => {
      const tabsToLoad = tabs.filter(t => t.isLoading);
      if (tabsToLoad.length === 0) return;

      logger.debug('Loading content for restored tabs', { count: tabsToLoad.length });

      // Load all tabs in parallel
      const results = await Promise.all(
        tabsToLoad.map(async (tab) => {
          const { content, error } = await loadFileContent(tab.path);
          return { tabId: tab.id, content, error };
        })
      );

      // Update all tabs at once
      setTabs(prev => prev.map(tab => {
        const result = results.find(r => r.tabId === tab.id);
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
    // Only run once on mount - loadFileContent is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open file
  const openFile = useCallback(async (path: string) => {
    // Check if it's a text file
    if (!isTextFile(path)) {
      // Open in system default app
      await window.vyotiq.files.open(path);
      return;
    }

    // Check if already open
    const existingTab = tabs.find(t => t.path === path);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      setIsEditorVisible(true);

      // Reload content if needed
      if (existingTab.isLoading || !existingTab.content) {
        const { content, error } = await loadFileContent(path);
        setTabs(prev => prev.map(t =>
          t.id === existingTab.id
            ? { ...t, content, originalContent: content, isLoading: false, hasError: !!error, errorMessage: error }
            : t
        ));
      }
      return;
    }

    // Create new tab
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

    // Load content
    const { content, error } = await loadFileContent(path);
    setTabs(prev => prev.map(t =>
      t.id === path
        ? { ...t, content, originalContent: content, isLoading: false, hasError: !!error, errorMessage: error }
        : t
    ));

    logger.debug('Opened file', { path });
  }, [tabs, loadFileContent, addRecentFile]);

  // Close tab
  const closeTab = useCallback((tabId: string) => {
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;

    setTabs(prev => prev.filter(t => t.id !== tabId));

    if (activeTabId === tabId) {
      const history = tabHistoryRef.current.filter(id => id !== tabId && tabs.some(t => t.id === id));
      if (history.length > 0) {
        setActiveTabId(history[history.length - 1]);
      } else if (tabs.length > 1) {
        const newIndex = Math.min(tabIndex, tabs.length - 2);
        setActiveTabId(tabs[newIndex === tabIndex ? newIndex + 1 : newIndex]?.id || null);
      } else {
        setActiveTabId(null);
      }
    }

    tabHistoryRef.current = tabHistoryRef.current.filter(id => id !== tabId);
  }, [tabs, activeTabId]);

  // Close all tabs
  const closeAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTabId(null);
    tabHistoryRef.current = [];
  }, []);

  // Close other tabs
  const closeOtherTabs = useCallback((tabId: string) => {
    setTabs(prev => prev.filter(t => t.id === tabId));
    setActiveTabId(tabId);
    tabHistoryRef.current = [tabId];
  }, []);

  // Close saved tabs
  const closeSavedTabs = useCallback(() => {
    const dirtyTabs = tabs.filter(t => t.isDirty);
    setTabs(dirtyTabs);
    if (activeTabId && !dirtyTabs.some(t => t.id === activeTabId)) {
      setActiveTabId(dirtyTabs[0]?.id || null);
    }
    tabHistoryRef.current = tabHistoryRef.current.filter(id => dirtyTabs.some(t => t.id === id));
  }, [tabs, activeTabId]);

  // Set active tab
  const setActiveTabHandler = useCallback((tabId: string) => {
    if (tabs.some(t => t.id === tabId)) {
      setActiveTabId(tabId);
      tabHistoryRef.current.push(tabId);
    }
  }, [tabs]);

  // Reorder tabs
  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabs(prev => {
      const newTabs = [...prev];
      const [removed] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, removed);
      return newTabs;
    });
  }, []);

  // Update content - optimized to avoid unnecessary state updates
  const updateContent = useCallback((tabId: string, content: string) => {
    setTabs(prev => {
      const tabIndex = prev.findIndex(t => t.id === tabId);
      if (tabIndex === -1) return prev;
      
      const tab = prev[tabIndex];
      // Skip update if content hasn't changed
      if (tab.content === content) return prev;
      
      const isDirty = content !== tab.originalContent;
      // Skip update if only content changed but dirty state is same
      if (tab.content !== content || tab.isDirty !== isDirty) {
        const newTabs = [...prev];
        newTabs[tabIndex] = { ...tab, content, isDirty };
        return newTabs;
      }
      return prev;
    });
  }, []);

  // Save file
  const saveFile = useCallback(async (tabId: string): Promise<boolean> => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab || !tab.isDirty) return true;

    try {
      const result = await window.vyotiq.files.write(tab.path, tab.content);
      if (result.success) {
        setTabs(prev => prev.map(t =>
          t.id === tabId ? { ...t, originalContent: t.content, isDirty: false } : t
        ));
        logger.debug('Saved file', { path: tab.path });
        return true;
      }
      logger.error('Failed to save file', { path: tab.path, error: result.error });
      return false;
    } catch (err) {
      logger.error('Failed to save file', { path: tab.path, error: err });
      return false;
    }
  }, [tabs]);

  // Save all files
  const saveAllFiles = useCallback(async () => {
    const dirtyTabs = tabs.filter(t => t.isDirty);
    await Promise.all(dirtyTabs.map(t => saveFile(t.id)));
  }, [tabs, saveFile]);

  // Revert file
  const revertFile = useCallback((tabId: string) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, content: t.originalContent, isDirty: false } : t
    ));
  }, []);

  // Debounced view state update to reduce re-renders during scrolling
  const viewStateUpdateRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const updateViewState = useCallback((tabId: string, viewState: monaco.editor.ICodeEditorViewState | null) => {
    // Debounce view state updates as they happen frequently during scrolling
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

  // Debounced cursor position update to reduce re-renders during navigation
  const cursorUpdateRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const updateCursorPosition = useCallback((tabId: string, position: { lineNumber: number; column: number }) => {
    // Debounce cursor updates as they happen frequently during typing/navigation
    if (cursorUpdateRef.current) {
      clearTimeout(cursorUpdateRef.current);
    }
    cursorUpdateRef.current = setTimeout(() => {
      setTabs(prev => {
        const tabIndex = prev.findIndex(t => t.id === tabId);
        if (tabIndex === -1) return prev;
        const tab = prev[tabIndex];
        // Skip if position hasn't changed
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

  // Update settings
  const updateSettings = useCallback((newSettings: Partial<EditorSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  // Next tab
  const nextTab = useCallback(() => {
    if (tabs.length === 0) return;
    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    const nextIndex = (currentIndex + 1) % tabs.length;
    setActiveTabId(tabs[nextIndex].id);
  }, [tabs, activeTabId]);

  // Previous tab
  const prevTab = useCallback(() => {
    if (tabs.length === 0) return;
    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    const prevIndex = currentIndex <= 0 ? tabs.length - 1 : currentIndex - 1;
    setActiveTabId(tabs[prevIndex].id);
  }, [tabs, activeTabId]);

  // Go to specific position in a file (opens file if not open)
  const goToPosition = useCallback(async (filePath: string, line: number, column: number) => {
    // Check if file is already open
    const existingTab = tabs.find(t => t.path === filePath);
    if (existingTab) {
      setActiveTabId(existingTab.id);
    } else {
      // Open the file first
      await openFile(filePath);
    }
    
    // Set pending navigation - MonacoEditor will pick this up and scroll
    setPendingNavigation({ line, column });
    setIsEditorVisible(true);
  }, [tabs, openFile]);

  // Clear pending navigation (called by MonacoEditor after handling)
  const clearPendingNavigation = useCallback(() => {
    setPendingNavigation(null);
  }, []);

  // Visibility
  const showEditor = useCallback(() => setIsEditorVisible(true), []);
  const hideEditor = useCallback(() => setIsEditorVisible(false), []);
  const toggleEditor = useCallback(() => setIsEditorVisible(prev => !prev), []);

  // Show diff - stores diff per file path so it persists
  const showDiff = useCallback((path: string, original: string, modified: string) => {
    // Store in the map for persistence
    fileDiffsRef.current.set(path, { original, modified });
    setDiff({ path, original, modified, isLoading: false });
    setIsDiffVisible(true);
  }, []);

  // Get stored diff for a file
  const getFileDiff = useCallback((path: string) => {
    return fileDiffsRef.current.get(path);
  }, []);

  // Clear stored diff for a file
  const clearFileDiff = useCallback((path: string) => {
    fileDiffsRef.current.delete(path);
  }, []);

  // Show git diff
  const showGitDiff = useCallback(async (path: string) => {
    setDiff({ path, original: '', modified: '', isLoading: true });
    setIsDiffVisible(true);

    try {
      // Load current file content using the proper decoder
      const { content: currentContent, error } = await loadFileContent(path);
      if (error) {
        logger.error('Failed to read file for diff', { path, error });
        setDiff(null);
        setIsDiffVisible(false);
        return;
      }

      // Try to get original from git using the git service (not terminal to avoid escape codes)
      let originalContent = '';
      try {
        const gitResult = await window.vyotiq.git.showFile(path, 'HEAD');
        if (gitResult.content !== null) {
          originalContent = gitResult.content;
        }
        // If error, originalContent stays empty (new file or not tracked)
      } catch {
        // Git command failed, show current content vs empty
        originalContent = '';
      }

      setDiff({ path, original: originalContent, modified: currentContent, isLoading: false });
    } catch (err) {
      logger.error('Failed to load git diff', { path, error: err });
      setDiff(null);
      setIsDiffVisible(false);
    }
  }, [loadFileContent]);

  // Hide diff
  const hideDiff = useCallback(() => {
    setIsDiffVisible(false);
    setDiff(null);
  }, []);

  // Show operation diff - for showing file operation results even without tabs
  const showOperationDiff = useCallback((diffData: Omit<OperationDiff, 'timestamp'>) => {
    const opDiff: OperationDiff = {
      ...diffData,
      timestamp: Date.now(),
    };
    setOperationDiff(opDiff);
    setIsOperationDiffVisible(true);
    setIsEditorVisible(true);
    logger.debug('Showing operation diff', { path: opDiff.path, action: opDiff.action });
  }, []);

  // Hide operation diff
  const hideOperationDiff = useCallback(() => {
    setIsOperationDiffVisible(false);
    setOperationDiff(null);
  }, []);

  // Open the file from operation diff in editor
  const openOperationDiffFile = useCallback(async () => {
    if (operationDiff) {
      await openFile(operationDiff.path);
      hideOperationDiff();
    }
  }, [operationDiff, openFile, hideOperationDiff]);

  // Queries
  const hasUnsavedChanges = useCallback(() => tabs.some(t => t.isDirty), [tabs]);
  const getUnsavedTabs = useCallback(() => tabs.filter(t => t.isDirty), [tabs]);
  const isFileOpen = useCallback((path: string) => tabs.some(t => t.path === path), [tabs]);

  // Memoize active tab to prevent unnecessary re-renders
  const activeTab = useMemo(
    () => tabs.find(t => t.id === activeTabId) || null,
    [tabs, activeTabId]
  );

  // Memoize the context value to prevent unnecessary re-renders of consumers
  // Split into stable references (functions) and changing values (state)
  const stableActions = useMemo(() => ({
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
    goToPosition,
    clearPendingNavigation,
    showEditor,
    hideEditor,
    toggleEditor,
    showDiff,
    showGitDiff,
    hideDiff,
    setDiffViewMode,
    getFileDiff,
    clearFileDiff,
    showOperationDiff,
    hideOperationDiff,
    openOperationDiffFile,
    hasUnsavedChanges,
    getUnsavedTabs,
    isFileOpen,
  }), [
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
    goToPosition,
    clearPendingNavigation,
    showEditor,
    hideEditor,
    toggleEditor,
    showDiff,
    showGitDiff,
    hideDiff,
    getFileDiff,
    clearFileDiff,
    showOperationDiff,
    hideOperationDiff,
    openOperationDiffFile,
    hasUnsavedChanges,
    getUnsavedTabs,
    isFileOpen,
  ]);

  const value: EditorContextValue = useMemo(() => ({
    // State values
    tabs,
    activeTabId,
    activeTab,
    settings,
    isEditorVisible,
    diff,
    isDiffVisible,
    diffViewMode,
    // Operation diff state
    operationDiff,
    isOperationDiffVisible,
    // Pending navigation
    pendingNavigation,
    // Spread stable actions
    ...stableActions,
  }), [
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
    stableActions,
  ]);

  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  );
};
