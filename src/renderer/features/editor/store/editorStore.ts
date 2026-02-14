/**
 * Editor Store
 * 
 * Manages editor tab state, file content, and view modes.
 * Uses a simple reactive store pattern consistent with the rest of the app.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('EditorStore');

// =============================================================================
// Types
// =============================================================================

export type EditorViewMode = 'code' | 'diff' | 'preview';

export interface EditorTab {
  id: string;
  filePath: string;
  fileName: string;
  language: string;
  content: string;
  originalContent?: string;
  isDirty: boolean;
  isPreview: boolean;
  viewMode: EditorViewMode;
  scrollPosition?: { top: number; left: number };
  cursorPosition?: { line: number; column: number };
}

export interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  isVisible: boolean;
}

interface EditorStore {
  state: EditorState;
  listeners: Set<() => void>;
}

// =============================================================================
// Store
// =============================================================================

const initialState: EditorState = {
  tabs: [],
  activeTabId: null,
  isVisible: false,
};

const store: EditorStore = {
  state: initialState,
  listeners: new Set(),
};

function emitChange(): void {
  for (const listener of store.listeners) {
    listener();
  }
}

function setState(update: Partial<EditorState>): void {
  store.state = { ...store.state, ...update };
  emitChange();
}

// =============================================================================
// Actions
// =============================================================================

function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescriptreact',
    js: 'javascript', jsx: 'javascriptreact',
    json: 'json', md: 'markdown', mdx: 'markdown',
    css: 'css', scss: 'scss', less: 'less',
    html: 'html', htm: 'html', xml: 'xml',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
    java: 'java', kt: 'kotlin', swift: 'swift',
    c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
    cs: 'csharp', php: 'php', sql: 'sql',
    yaml: 'yaml', yml: 'yaml', toml: 'toml',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    ps1: 'powershell', bat: 'batch',
    vue: 'vue', svelte: 'svelte',
    graphql: 'graphql', gql: 'graphql',
  };
  return langMap[ext] ?? 'plaintext';
}

function getFileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() ?? filePath;
}

export function openFile(
  filePath: string,
  options: { preview?: boolean; viewMode?: EditorViewMode; content?: string } = {}
): void {
  const { preview = true, viewMode = 'code', content = '' } = options;

  // Check if already open
  const existingTab = store.state.tabs.find(t => t.filePath === filePath);
  if (existingTab) {
    // If opening a preview tab as non-preview, upgrade it
    if (!preview && existingTab.isPreview) {
      const updatedTabs = store.state.tabs.map(t =>
        t.id === existingTab.id ? { ...t, isPreview: false, viewMode } : t
      );
      setState({ tabs: updatedTabs, activeTabId: existingTab.id, isVisible: true });
    } else {
      setState({ activeTabId: existingTab.id, isVisible: true });
    }
    return;
  }

  // Close existing preview tabs when opening a new preview
  let tabs = store.state.tabs;
  if (preview) {
    tabs = tabs.filter(t => !t.isPreview);
  }

  const newTab: EditorTab = {
    id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    filePath,
    fileName: getFileName(filePath),
    language: getLanguageFromPath(filePath),
    content,
    originalContent: content,
    isDirty: false,
    isPreview: preview,
    viewMode,
  };

  setState({
    tabs: [...tabs, newTab],
    activeTabId: newTab.id,
    isVisible: true,
  });

  // Load file content asynchronously
  loadFileContent(newTab.id, filePath);
}

async function loadFileContent(tabId: string, filePath: string): Promise<void> {
  try {
    const result = await window.vyotiq?.files?.read?.([filePath]);
    if (result?.[0]?.content) {
      const updatedTabs = store.state.tabs.map(t =>
        t.id === tabId ? { ...t, content: result[0].content, originalContent: result[0].content } : t
      );
      setState({ tabs: updatedTabs });
    }
  } catch (err) {
    logger.warn('Failed to load file content', { tabId, filePath, error: err instanceof Error ? err.message : String(err) });
  }
}

export function closeTab(tabId: string): void {
  const tabs = store.state.tabs.filter(t => t.id !== tabId);
  let activeTabId = store.state.activeTabId;

  if (activeTabId === tabId) {
    // Activate the nearest tab
    const closedIndex = store.state.tabs.findIndex(t => t.id === tabId);
    activeTabId = tabs[Math.min(closedIndex, tabs.length - 1)]?.id ?? null;
  }

  setState({
    tabs,
    activeTabId,
    isVisible: tabs.length > 0,
  });
}

export function setActiveTab(tabId: string): void {
  setState({ activeTabId: tabId });
}

export function closeAllTabs(): void {
  setState({ tabs: [], activeTabId: null, isVisible: false });
}

export function toggleEditor(): void {
  setState({ isVisible: !store.state.isVisible });
}

/**
 * Imperative file open — for use outside React components (event handlers, dynamic imports)
 */
export function openFileImperative(
  filePath: string,
  options: { preview?: boolean; viewMode?: EditorViewMode } = {}
): void {
  openFile(filePath, options);
}

// =============================================================================
// React Hook
// =============================================================================

function subscribe(listener: () => void): () => void {
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

function getSnapshot(): EditorState {
  return store.state;
}

export function useEditorStore() {
  const state = useSyncExternalStore(subscribe, getSnapshot);

  const actions = {
    openFile: useCallback((filePath: string, options?: { preview?: boolean; viewMode?: EditorViewMode; content?: string }) => {
      openFile(filePath, options);
    }, []),
    closeTab: useCallback((tabId: string) => closeTab(tabId), []),
    setActiveTab: useCallback((tabId: string) => setActiveTab(tabId), []),
    closeAllTabs: useCallback(() => closeAllTabs(), []),
    toggleEditor: useCallback(() => toggleEditor(), []),
  };

  return { state, ...actions };
}
