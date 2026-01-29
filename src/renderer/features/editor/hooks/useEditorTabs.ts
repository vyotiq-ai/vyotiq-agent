/**
 * useEditorTabs Hook
 * 
 * Manages editor tabs state including opening, closing, and switching tabs.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type * as monaco from 'monaco-editor';
import type { EditorTab, EditorSettings } from '../types';
import { DEFAULT_EDITOR_SETTINGS } from '../types';
import { getLanguageFromPath, getFileName } from '../utils/languageUtils';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('EditorTabs');

const STORAGE_KEY = 'vyotiq-editor-tabs';
const SETTINGS_KEY = 'vyotiq-editor-settings';

interface UseEditorTabsOptions {
  maxTabs?: number;
  persistTabs?: boolean;
}

interface UseEditorTabsReturn {
  tabs: EditorTab[];
  activeTabId: string | null;
  activeTab: EditorTab | null;
  settings: EditorSettings;
  isLoading: boolean;
  
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
  
  // Queries
  hasUnsavedChanges: () => boolean;
  getUnsavedTabs: () => EditorTab[];
}

export function useEditorTabs(options: UseEditorTabsOptions = {}): UseEditorTabsReturn {
  const { maxTabs = 20, persistTabs = true } = options;
  
  const [tabs, setTabs] = useState<EditorTab[]>(() => {
    if (persistTabs) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          // Clear content on restore - will reload when tab becomes active
          return parsed.map((tab: EditorTab) => ({
            ...tab,
            content: '',
            originalContent: '',
            isLoading: true,
            isDirty: false,
          }));
        }
      } catch (err) {
        logger.debug('Failed to restore tabs', { error: err });
      }
    }
    return [];
  });
  
  const [activeTabId, setActiveTabId] = useState<string | null>(() => {
    if (persistTabs && tabs.length > 0) {
      return tabs[0]?.id || null;
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
  
  const [isLoading, setIsLoading] = useState(false);
  const tabHistoryRef = useRef<string[]>([]);
  
  // Persist tabs to localStorage
  useEffect(() => {
    if (persistTabs) {
      try {
        const toStore = tabs.map(tab => ({
          id: tab.id,
          path: tab.path,
          name: tab.name,
          language: tab.language,
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
      } catch (err) {
        logger.debug('Failed to persist tabs', { error: err });
      }
    }
  }, [tabs, persistTabs]);
  
  // Persist settings
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {
      logger.debug('Failed to persist settings', { error: err });
    }
  }, [settings]);
  
  // Load file content
  const loadFileContent = useCallback(async (path: string): Promise<{ content: string; error?: string }> => {
    try {
      const result = await window.vyotiq.files.read([path]);
      if (result && result.length > 0 && result[0].content) {
        return { content: result[0].content };
      }
      return { content: '', error: 'Failed to read file' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read file';
      return { content: '', error: message };
    }
  }, []);
  
  // Open file
  const openFile = useCallback(async (path: string) => {
    // Check if already open
    const existingTab = tabs.find(t => t.path === path);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      
      // Reload content if it was cleared
      if (existingTab.isLoading || !existingTab.content) {
        setIsLoading(true);
        const { content, error } = await loadFileContent(path);
        setTabs(prev => prev.map(t => 
          t.id === existingTab.id 
            ? { 
                ...t, 
                content, 
                originalContent: content, 
                isLoading: false,
                hasError: !!error,
                errorMessage: error,
              }
            : t
        ));
        setIsLoading(false);
      }
      return;
    }
    
    // Check max tabs
    if (tabs.length >= maxTabs) {
      // Close oldest non-dirty tab
      const oldestClean = tabs.find(t => !t.isDirty);
      if (oldestClean) {
        setTabs(prev => prev.filter(t => t.id !== oldestClean.id));
      }
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
    tabHistoryRef.current.push(path);
    
    // Load content
    setIsLoading(true);
    const { content, error } = await loadFileContent(path);
    
    setTabs(prev => prev.map(t => 
      t.id === path 
        ? { 
            ...t, 
            content, 
            originalContent: content, 
            isLoading: false,
            hasError: !!error,
            errorMessage: error,
          }
        : t
    ));
    setIsLoading(false);
    
    logger.debug('Opened file', { path, language: newTab.language });
  }, [tabs, maxTabs, loadFileContent]);
  
  // Close tab
  const closeTab = useCallback((tabId: string) => {
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;
    
    setTabs(prev => prev.filter(t => t.id !== tabId));
    
    // Update active tab
    if (activeTabId === tabId) {
      // Try to activate previous tab from history
      const history = tabHistoryRef.current.filter(id => id !== tabId && tabs.some(t => t.id === id));
      if (history.length > 0) {
        setActiveTabId(history[history.length - 1]);
      } else if (tabs.length > 1) {
        // Activate adjacent tab
        const newIndex = Math.min(tabIndex, tabs.length - 2);
        setActiveTabId(tabs[newIndex === tabIndex ? newIndex + 1 : newIndex]?.id || null);
      } else {
        setActiveTabId(null);
      }
    }
    
    // Remove from history
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
  
  // Update content
  const updateContent = useCallback((tabId: string, content: string) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t;
      const isDirty = content !== t.originalContent;
      return { ...t, content, isDirty };
    }));
  }, []);
  
  // Save file
  const saveFile = useCallback(async (tabId: string): Promise<boolean> => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab || !tab.isDirty) return true;
    
    try {
      const result = await window.vyotiq.files.create(tab.path, tab.content);
      if (result.success) {
        setTabs(prev => prev.map(t => 
          t.id === tabId 
            ? { ...t, originalContent: t.content, isDirty: false }
            : t
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
      t.id === tabId 
        ? { ...t, content: t.originalContent, isDirty: false }
        : t
    ));
  }, []);
  
  // Update view state
  const updateViewState = useCallback((tabId: string, viewState: monaco.editor.ICodeEditorViewState | null) => {
    setTabs(prev => prev.map(t => 
      t.id === tabId ? { ...t, viewState } : t
    ));
  }, []);
  
  // Update cursor position
  const updateCursorPosition = useCallback((tabId: string, position: { lineNumber: number; column: number }) => {
    setTabs(prev => prev.map(t => 
      t.id === tabId ? { ...t, cursorPosition: position } : t
    ));
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
  
  // Has unsaved changes
  const hasUnsavedChanges = useCallback(() => {
    return tabs.some(t => t.isDirty);
  }, [tabs]);
  
  // Get unsaved tabs
  const getUnsavedTabs = useCallback(() => {
    return tabs.filter(t => t.isDirty);
  }, [tabs]);
  
  // Get active tab
  const activeTab = tabs.find(t => t.id === activeTabId) || null;
  
  return {
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
    hasUnsavedChanges,
    getUnsavedTabs,
  };
}
