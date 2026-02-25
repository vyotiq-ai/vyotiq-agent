/**
 * Editor Store
 * 
 * Manages editor tab state, file content, view modes, and editing operations.
 * Uses a simple reactive store pattern consistent with the rest of the app.
 * Supports real file editing with save, undo, redo, and dirty state tracking.
 * Listens for external file changes and reloads affected tabs automatically.
 */

import { useCallback, useSyncExternalStore, useEffect } from 'react';
import { createLogger } from '../../../utils/logger';
import { getFileName } from '../../../utils/pathHelpers';

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
  selection?: { startLine: number; startColumn: number; endLine: number; endColumn: number } | null;
  encoding?: string;
  lineEnding?: 'LF' | 'CRLF';
  lineCount?: number;
  isSaving?: boolean;
}

export interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  isVisible: boolean;
  wordWrap: 'on' | 'off';
  showMinimap: boolean;
  fontSize: number;
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
  wordWrap: 'off',
  showMinimap: true,
  fontSize: 12,
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

// getFileName imported from utils/pathHelpers

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
 * Update the content of a tab (called when user edits in Monaco).
 * Content is stored immediately; metadata (lineCount, lineEnding) is
 * debounced to avoid expensive string scans on every keystroke.
 */
const pendingMetadata = new Map<string, ReturnType<typeof setTimeout>>();

export function updateTabContent(tabId: string, content: string): void {
  const tab = store.state.tabs.find(t => t.id === tabId);
  if (!tab) return;

  const isDirty = content !== (tab.originalContent ?? '');

  // Immediate update: content + dirty flag (cheap)
  const updatedTabs = store.state.tabs.map(t =>
    t.id === tabId ? { ...t, content, isDirty } : t
  );
  setState({ tabs: updatedTabs });

  // Debounced update: expensive metadata (lineCount, lineEnding)
  const existing = pendingMetadata.get(tabId);
  if (existing) clearTimeout(existing);
  pendingMetadata.set(tabId, setTimeout(() => {
    pendingMetadata.delete(tabId);
    const currentTab = store.state.tabs.find(t => t.id === tabId);
    if (!currentTab) return;
    const lineCount = currentTab.content.split('\n').length;
    const lineEnding = currentTab.content.includes('\r\n') ? 'CRLF' as const : 'LF' as const;
    if (currentTab.lineCount !== lineCount || currentTab.lineEnding !== lineEnding) {
      const metaTabs = store.state.tabs.map(t =>
        t.id === tabId ? { ...t, lineCount, lineEnding } : t
      );
      setState({ tabs: metaTabs });
    }
  }, 150));
}

/**
 * Save the active tab's content to disk
 */
export async function saveTab(tabId: string): Promise<boolean> {
  const tab = store.state.tabs.find(t => t.id === tabId);
  if (!tab || !tab.isDirty) return true;

  // Mark as saving
  const savingTabs = store.state.tabs.map(t =>
    t.id === tabId ? { ...t, isSaving: true } : t
  );
  setState({ tabs: savingTabs });

  try {
    const result = await window.vyotiq?.files?.write?.(tab.filePath, tab.content);
    if (result?.success) {
      const savedTabs = store.state.tabs.map(t =>
        t.id === tabId
          ? { ...t, isDirty: false, originalContent: tab.content, isSaving: false }
          : t
      );
      setState({ tabs: savedTabs });
      logger.info('File saved', { filePath: tab.filePath });
      return true;
    } else {
      const errorTabs = store.state.tabs.map(t =>
        t.id === tabId ? { ...t, isSaving: false } : t
      );
      setState({ tabs: errorTabs });
      logger.warn('Failed to save file', { filePath: tab.filePath, error: result?.error });
      return false;
    }
  } catch (err) {
    const errorTabs = store.state.tabs.map(t =>
      t.id === tabId ? { ...t, isSaving: false } : t
    );
    setState({ tabs: errorTabs });
    logger.error('Error saving file', {
      filePath: tab.filePath,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Save the currently active tab
 */
export async function saveActiveTab(): Promise<boolean> {
  if (!store.state.activeTabId) return false;
  return saveTab(store.state.activeTabId);
}

/**
 * Save all dirty tabs
 */
export async function saveAllTabs(): Promise<void> {
  const dirtyTabs = store.state.tabs.filter(t => t.isDirty);
  for (const tab of dirtyTabs) {
    await saveTab(tab.id);
  }
}

/**
 * Update cursor position for a tab
 */
export function updateCursorPosition(tabId: string, position: { line: number; column: number }): void {
  const updatedTabs = store.state.tabs.map(t =>
    t.id === tabId ? { ...t, cursorPosition: position } : t
  );
  setState({ tabs: updatedTabs });
}

/**
 * Update selection for a tab
 */
export function updateSelection(tabId: string, selection: { startLine: number; startColumn: number; endLine: number; endColumn: number } | null): void {
  const updatedTabs = store.state.tabs.map(t =>
    t.id === tabId ? { ...t, selection } : t
  );
  setState({ tabs: updatedTabs });
}

/**
 * Update scroll position for a tab
 */
export function updateScrollPosition(tabId: string, scrollPosition: { top: number; left: number }): void {
  const updatedTabs = store.state.tabs.map(t =>
    t.id === tabId ? { ...t, scrollPosition } : t
  );
  setState({ tabs: updatedTabs });
}

/**
 * Set the view mode for the active or specified tab
 */
export function setViewMode(viewMode: EditorViewMode, tabId?: string): void {
  const targetId = tabId ?? store.state.activeTabId;
  if (!targetId) return;

  const updatedTabs = store.state.tabs.map(t =>
    t.id === targetId ? { ...t, viewMode } : t
  );
  setState({ tabs: updatedTabs });
}

/**
 * Toggle word wrap for the editor
 */
export function toggleWordWrap(): void {
  setState({ wordWrap: store.state.wordWrap === 'off' ? 'on' : 'off' });
}

/**
 * Toggle minimap visibility
 */
export function toggleMinimap(): void {
  setState({ showMinimap: !store.state.showMinimap });
}

/**
 * Change editor font size
 */
export function setEditorFontSize(size: number): void {
  setState({ fontSize: Math.min(Math.max(size, 8), 32) });
}

/**
 * Increase font size
 */
export function increaseFontSize(): void {
  setEditorFontSize(store.state.fontSize + 1);
}

/**
 * Decrease font size
 */
export function decreaseFontSize(): void {
  setEditorFontSize(store.state.fontSize - 1);
}

/**
 * Revert a tab to its original content
 */
export function revertTab(tabId: string): void {
  const tab = store.state.tabs.find(t => t.id === tabId);
  if (!tab || !tab.originalContent) return;

  const updatedTabs = store.state.tabs.map(t =>
    t.id === tabId
      ? { ...t, content: t.originalContent ?? '', isDirty: false }
      : t
  );
  setState({ tabs: updatedTabs });
}

/**
 * Close all tabs except the specified one
 */
export function closeOtherTabs(keepTabId: string): void {
  const keptTab = store.state.tabs.find(t => t.id === keepTabId);
  if (!keptTab) return;

  setState({
    tabs: [keptTab],
    activeTabId: keepTabId,
    isVisible: true,
  });
}

/**
 * Close all tabs to the right of the specified tab
 */
export function closeTabsToRight(tabId: string): void {
  const tabIndex = store.state.tabs.findIndex(t => t.id === tabId);
  if (tabIndex === -1) return;

  const tabs = store.state.tabs.slice(0, tabIndex + 1);
  let activeTabId = store.state.activeTabId;
  if (!tabs.find(t => t.id === activeTabId)) {
    activeTabId = tabs[tabs.length - 1]?.id ?? null;
  }

  setState({ tabs, activeTabId, isVisible: tabs.length > 0 });
}

/**
 * Get the count of dirty (unsaved) tabs
 */
export function getDirtyTabCount(): number {
  return store.state.tabs.filter(t => t.isDirty).length;
}

/**
 * Get the file path of the currently active editor tab.
 * Returns null if no tab is active.
 */
export function getActiveFilePath(): string | null {
  const activeId = store.state.activeTabId;
  if (!activeId) return null;
  const tab = store.state.tabs.find(t => t.id === activeId);
  return tab?.filePath ?? null;
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
// External File Change Handler
// =============================================================================

/** Debounce map for reload requests to avoid rapid reloads */
const reloadDebounce = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Handle an external file change event. Reloads file content for open tabs
 * that aren't currently dirty (being edited by the user).
 *
 * For dirty tabs, marks them with an `externallyChanged` flag so the UI
 * can prompt the user to reload.
 */
export function handleExternalFileChange(event: { type: string; path: string; oldPath?: string }): void {
  const normalizedPath = event.path.replace(/\\/g, '/');

  if (event.type === 'delete') {
    // Mark deleted file tabs as having no backing file
    const tabs = store.state.tabs;
    const affectedTab = tabs.find(t => t.filePath.replace(/\\/g, '/') === normalizedPath);
    if (affectedTab) {
      const updatedTabs = tabs.map(t =>
        t.id === affectedTab.id ? { ...t, isDirty: true, originalContent: '' } : t
      );
      setState({ tabs: updatedTabs });
      logger.debug('File deleted externally', { filePath: normalizedPath });
    }
    return;
  }

  if (event.type === 'rename' && event.oldPath) {
    // Handle renamed files: update the tab's path
    const normalizedOldPath = event.oldPath.replace(/\\/g, '/');
    const tabs = store.state.tabs;
    const affectedTab = tabs.find(t => t.filePath.replace(/\\/g, '/') === normalizedOldPath);
    if (affectedTab) {
      const updatedTabs = tabs.map(t =>
        t.id === affectedTab.id
          ? {
              ...t,
              filePath: normalizedPath,
              fileName: getFileName(normalizedPath),
              language: getLanguageFromPath(normalizedPath),
            }
          : t
      );
      setState({ tabs: updatedTabs });
      logger.debug('File renamed externally', { oldPath: normalizedOldPath, newPath: normalizedPath });
    }
    return;
  }

  if (event.type === 'write' || event.type === 'create') {
    // Reload content for non-dirty tabs
    const tabs = store.state.tabs;
    const affectedTab = tabs.find(t => t.filePath.replace(/\\/g, '/') === normalizedPath);
    if (!affectedTab) return;

    // Don't reload if the tab is currently being saved by the user
    if (affectedTab.isSaving) return;

    // Debounce reload to avoid rapid reloads during bulk writes
    const existing = reloadDebounce.get(affectedTab.id);
    if (existing) clearTimeout(existing);

    reloadDebounce.set(affectedTab.id, setTimeout(() => {
      reloadDebounce.delete(affectedTab.id);

      // Re-check tab state (may have changed during debounce)
      const currentTab = store.state.tabs.find(t => t.id === affectedTab.id);
      if (!currentTab) return;

      if (currentTab.isDirty) {
        // Tab has unsaved changes — don't silently overwrite, user must decide
        logger.debug('External change on dirty tab, skipping reload', { filePath: normalizedPath });
        return;
      }

      // Reload content from disk
      loadFileContent(affectedTab.id, normalizedPath);
      logger.debug('Reloading externally changed file', { filePath: normalizedPath });
    }, 250));
  }
}

// =============================================================================
// File Metadata Helpers
// =============================================================================

/**
 * Detect line ending format from content.
 */
export function detectLineEnding(content: string): 'LF' | 'CRLF' {
  const crlfCount = (content.match(/\r\n/g) || []).length;
  const lfCount = (content.match(/(?<!\r)\n/g) || []).length;
  return crlfCount > lfCount ? 'CRLF' : 'LF';
}

/**
 * Convert line endings in content.
 */
export function convertLineEndings(content: string, target: 'LF' | 'CRLF'): string {
  // First normalize to LF, then convert if needed
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return target === 'CRLF' ? normalized.replace(/\n/g, '\r\n') : normalized;
}

/**
 * Update file metadata for a tab (encoding, line endings, etc.)
 */
export function updateTabMetadata(tabId: string, metadata: Partial<Pick<EditorTab, 'encoding' | 'lineEnding' | 'lineCount'>>): void {
  const updatedTabs = store.state.tabs.map(t =>
    t.id === tabId ? { ...t, ...metadata } : t
  );
  setState({ tabs: updatedTabs });
}

/**
 * Change the line ending for a tab and convert its content.
 */
export function changeTabLineEnding(tabId: string, lineEnding: 'LF' | 'CRLF'): void {
  const tab = store.state.tabs.find(t => t.id === tabId);
  if (!tab) return;

  const converted = convertLineEndings(tab.content, lineEnding);
  const updatedTabs = store.state.tabs.map(t =>
    t.id === tabId
      ? { ...t, content: converted, lineEnding, isDirty: converted !== (t.originalContent ?? '') }
      : t
  );
  setState({ tabs: updatedTabs });
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

  // Subscribe to external file change events for real-time editor updates
  useEffect(() => {
    const unsubscribe = window.vyotiq?.files?.onFileChange?.((event) => {
      handleExternalFileChange(event);
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const actions = {
    openFile: useCallback((filePath: string, options?: { preview?: boolean; viewMode?: EditorViewMode; content?: string }) => {
      openFile(filePath, options);
    }, []),
    closeTab: useCallback((tabId: string) => closeTab(tabId), []),
    setActiveTab: useCallback((tabId: string) => setActiveTab(tabId), []),
    closeAllTabs: useCallback(() => closeAllTabs(), []),
    toggleEditor: useCallback(() => toggleEditor(), []),
    updateTabContent: useCallback((tabId: string, content: string) => updateTabContent(tabId, content), []),
    saveTab: useCallback((tabId: string) => saveTab(tabId), []),
    saveActiveTab: useCallback(() => saveActiveTab(), []),
    saveAllTabs: useCallback(() => saveAllTabs(), []),
    updateCursorPosition: useCallback((tabId: string, pos: { line: number; column: number }) => updateCursorPosition(tabId, pos), []),
    updateSelection: useCallback((tabId: string, sel: { startLine: number; startColumn: number; endLine: number; endColumn: number } | null) => updateSelection(tabId, sel), []),
    updateScrollPosition: useCallback((tabId: string, pos: { top: number; left: number }) => updateScrollPosition(tabId, pos), []),
    setViewMode: useCallback((viewMode: EditorViewMode, tabId?: string) => setViewMode(viewMode, tabId), []),
    toggleWordWrap: useCallback(() => toggleWordWrap(), []),
    toggleMinimap: useCallback(() => toggleMinimap(), []),
    setEditorFontSize: useCallback((size: number) => setEditorFontSize(size), []),
    increaseFontSize: useCallback(() => increaseFontSize(), []),
    decreaseFontSize: useCallback(() => decreaseFontSize(), []),
    revertTab: useCallback((tabId: string) => revertTab(tabId), []),
    closeOtherTabs: useCallback((tabId: string) => closeOtherTabs(tabId), []),
    closeTabsToRight: useCallback((tabId: string) => closeTabsToRight(tabId), []),
    changeTabLineEnding: useCallback((tabId: string, lineEnding: 'LF' | 'CRLF') => changeTabLineEnding(tabId, lineEnding), []),
    updateTabMetadata: useCallback((tabId: string, meta: Partial<Pick<EditorTab, 'encoding' | 'lineEnding' | 'lineCount'>>) => updateTabMetadata(tabId, meta), []),
  };

  return { state, ...actions };
}
