/**
 * Editor Types
 * 
 * Type definitions for the Monaco Editor feature.
 */

import type * as monaco from 'monaco-editor';

/** Represents an open file tab */
export interface EditorTab {
  /** Unique identifier (file path) */
  id: string;
  /** File path */
  path: string;
  /** File name */
  name: string;
  /** File content */
  content: string;
  /** Original content (for dirty detection) */
  originalContent: string;
  /** Language ID for syntax highlighting */
  language: string;
  /** Whether the file has unsaved changes */
  isDirty: boolean;
  /** Whether the file is currently loading */
  isLoading: boolean;
  /** Whether the file failed to load */
  hasError: boolean;
  /** Error message if loading failed */
  errorMessage?: string;
  /** Cursor position */
  cursorPosition?: { lineNumber: number; column: number };
  /** Scroll position */
  scrollPosition?: { scrollTop: number; scrollLeft: number };
  /** View state for restoring editor state */
  viewState?: monaco.editor.ICodeEditorViewState | null;
}

/** Editor state */
export interface EditorState {
  /** All open tabs */
  tabs: EditorTab[];
  /** Currently active tab ID */
  activeTabId: string | null;
  /** Tab history for navigation */
  tabHistory: string[];
  /** Whether the editor panel is visible */
  isVisible: boolean;
  /** Editor settings */
  settings: EditorSettings;
}

/** Editor settings */
export interface EditorSettings {
  /** Font size in pixels */
  fontSize: number;
  /** Font family */
  fontFamily: string;
  /** Tab size */
  tabSize: number;
  /** Insert spaces instead of tabs */
  insertSpaces: boolean;
  /** Word wrap mode */
  wordWrap: 'off' | 'on' | 'wordWrapColumn' | 'bounded';
  /** Show minimap */
  minimap: boolean;
  /** Show line numbers */
  lineNumbers: 'on' | 'off' | 'relative' | 'interval';
  /** Theme */
  theme: 'vs-dark' | 'vs' | 'hc-black' | 'vyotiq-dark';
  /** Auto save delay in ms (0 = disabled) */
  autoSaveDelay: number;
  /** Show whitespace */
  renderWhitespace: 'none' | 'boundary' | 'selection' | 'trailing' | 'all';
  /** Bracket pair colorization */
  bracketPairColorization: boolean;
  /** Smooth scrolling */
  smoothScrolling: boolean;
  /** Cursor blinking style */
  cursorBlinking: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid';
  /** Cursor style */
  cursorStyle: 'line' | 'block' | 'underline' | 'line-thin' | 'block-outline' | 'underline-thin';
  /** Enable AI features */
  enableAI?: boolean;
  /** Enable inline completions (ghost text) */
  enableInlineCompletions?: boolean;
  /** Enable AI quick fixes */
  enableQuickFixes?: boolean;
  /** Enable selection toolbar */
  enableSelectionToolbar?: boolean;
  /** Enable Code Lens AI actions */
  enableCodeLens?: boolean;
  /** Debounce delay for inline completions (ms) - synced from global settings */
  inlineCompletionDebounceMs?: number;
  /** Max tokens for inline completions - synced from global settings */
  inlineCompletionMaxTokens?: number;
  /** Context lines before cursor - synced from global settings */
  contextLinesBefore?: number;
  /** Context lines after cursor - synced from global settings */
  contextLinesAfter?: number;
}

/** Default editor settings */
export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  fontSize: 13,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace",
  tabSize: 2,
  insertSpaces: true,
  wordWrap: 'off',
  minimap: true,
  lineNumbers: 'on',
  theme: 'vyotiq-dark',
  autoSaveDelay: 0,
  renderWhitespace: 'selection',
  bracketPairColorization: true,
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  cursorStyle: 'line',
  enableAI: true,
  enableInlineCompletions: true,
  enableQuickFixes: true,
  enableSelectionToolbar: true,
  enableCodeLens: true,
  inlineCompletionDebounceMs: 300,
  inlineCompletionMaxTokens: 128,
  contextLinesBefore: 50,
  contextLinesAfter: 10,
};

/** Editor context menu action */
export type EditorContextAction =
  | 'cut'
  | 'copy'
  | 'paste'
  | 'selectAll'
  | 'undo'
  | 'redo'
  | 'find'
  | 'replace'
  | 'goToLine'
  | 'formatDocument'
  | 'commentLine'
  | 'foldAll'
  | 'unfoldAll';

/** File change event from external source */
export interface FileChangeEvent {
  type: 'created' | 'modified' | 'deleted';
  path: string;
  timestamp: number;
}

/** Editor keyboard shortcut */
export interface EditorShortcut {
  key: string;
  modifier: string;
  action: string;
  description: string;
}

/** Editor keyboard shortcuts */
export const EDITOR_SHORTCUTS: EditorShortcut[] = [
  { key: 's', modifier: 'ctrl', action: 'save', description: 'Save file' },
  { key: 'w', modifier: 'ctrl', action: 'closeTab', description: 'Close tab' },
  { key: 'Tab', modifier: 'ctrl', action: 'nextTab', description: 'Next tab' },
  { key: 'Tab', modifier: 'ctrl+shift', action: 'prevTab', description: 'Previous tab' },
  { key: 'f', modifier: 'ctrl', action: 'find', description: 'Find' },
  { key: 'h', modifier: 'ctrl', action: 'replace', description: 'Find and replace' },
  { key: 'g', modifier: 'ctrl', action: 'goToLine', description: 'Go to line' },
  { key: 'z', modifier: 'ctrl', action: 'undo', description: 'Undo' },
  { key: 'y', modifier: 'ctrl', action: 'redo', description: 'Redo' },
  { key: '/', modifier: 'ctrl', action: 'commentLine', description: 'Toggle comment' },
  { key: 'd', modifier: 'ctrl', action: 'duplicateLine', description: 'Duplicate line' },
  { key: 'l', modifier: 'ctrl+shift', action: 'deleteLine', description: 'Delete line' },
];
