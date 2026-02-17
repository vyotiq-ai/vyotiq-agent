/**
 * useEditorActions Hook
 * 
 * Provides imperative actions for the Monaco editor instance.
 * Actions like "Go to Definition", "Find References", "Rename Symbol", etc.
 * are triggered via Monaco's built-in commands.
 */

import { useCallback, useRef } from 'react';
import * as monaco from 'monaco-editor';
import { openFileInEditor } from '../components/EditorPanel';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('useEditorActions');

// =============================================================================
// Types
// =============================================================================

export interface EditorActions {
  /** Trigger Go to Definition at current cursor position */
  goToDefinition: () => void;
  /** Trigger Go to Type Definition */
  goToTypeDefinition: () => void;
  /** Trigger Go to Implementation */
  goToImplementation: () => void;
  /** Trigger Find All References */
  findReferences: () => void;
  /** Trigger Peek Definition */
  peekDefinition: () => void;
  /** Trigger Peek References */
  peekReferences: () => void;
  /** Trigger Rename Symbol (F2) */
  renameSymbol: () => void;
  /** Format the entire document */
  formatDocument: () => void;
  /** Format the current selection */
  formatSelection: () => void;
  /** Trigger Code Actions / Quick Fix */
  triggerCodeAction: () => void;
  /** Trigger Quick Fix specifically */
  triggerQuickFix: () => void;
  /** Go to a specific line */
  goToLine: (line: number, column?: number) => void;
  /** Trigger the Go to Symbol command */
  goToSymbol: () => void;
  /** Execute clipboard cut */
  cut: () => void;
  /** Execute clipboard copy */
  copy: () => void;
  /** Execute clipboard paste */
  paste: () => void;
  /** Select all content */
  selectAll: () => void;
  /** Open a file by navigating from LSP location */
  openLocation: (filePath: string, line: number, column: number) => void;
  /** Toggle word wrap */
  toggleWordWrap: () => void;
  /** Set the active editor reference */
  setEditorRef: (editor: monaco.editor.IStandaloneCodeEditor | null) => void;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook that provides imperative editor actions.
 * Must be provided with a reference to the active Monaco editor.
 */
export function useEditorActions(): EditorActions {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  const setEditorRef = useCallback((editor: monaco.editor.IStandaloneCodeEditor | null) => {
    editorRef.current = editor;
  }, []);

  const triggerAction = useCallback((actionId: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      editor.trigger('context-menu', actionId, undefined);
    } catch (err) {
      logger.debug('Failed to trigger action', { actionId, error: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const goToDefinition = useCallback(() => {
    triggerAction('editor.action.revealDefinition');
  }, [triggerAction]);

  const goToTypeDefinition = useCallback(() => {
    triggerAction('editor.action.goToTypeDefinition');
  }, [triggerAction]);

  const goToImplementation = useCallback(() => {
    triggerAction('editor.action.goToImplementation');
  }, [triggerAction]);

  const findReferences = useCallback(() => {
    triggerAction('editor.action.goToReferences');
  }, [triggerAction]);

  const peekDefinition = useCallback(() => {
    triggerAction('editor.action.peekDefinition');
  }, [triggerAction]);

  const peekReferences = useCallback(() => {
    triggerAction('editor.action.referenceSearch.trigger');
  }, [triggerAction]);

  const renameSymbol = useCallback(() => {
    triggerAction('editor.action.rename');
  }, [triggerAction]);

  const formatDocument = useCallback(() => {
    triggerAction('editor.action.formatDocument');
  }, [triggerAction]);

  const formatSelection = useCallback(() => {
    triggerAction('editor.action.formatSelection');
  }, [triggerAction]);

  const triggerCodeAction = useCallback(() => {
    triggerAction('editor.action.codeAction');
  }, [triggerAction]);

  const triggerQuickFix = useCallback(() => {
    triggerAction('editor.action.quickFix');
  }, [triggerAction]);

  const goToLine = useCallback((line: number, column?: number) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.revealLineInCenter(line);
    editor.setPosition({
      lineNumber: line,
      column: column ?? 1,
    });
    editor.focus();
  }, []);

  const goToSymbol = useCallback(() => {
    triggerAction('editor.action.quickOutline');
  }, [triggerAction]);

  const cut = useCallback(() => {
    triggerAction('editor.action.clipboardCutAction');
  }, [triggerAction]);

  const copy = useCallback(() => {
    triggerAction('editor.action.clipboardCopyAction');
  }, [triggerAction]);

  const paste = useCallback(() => {
    // Paste requires async clipboard access — use executeCommand instead
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand('paste');
  }, []);

  const selectAll = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    editor.setSelection(model.getFullModelRange());
  }, []);

  const openLocation = useCallback((filePath: string, line: number, column: number) => {
    openFileInEditor(filePath, { preview: false });
    // After file opens, navigate to position
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const editors = monaco.editor.getEditors();
        for (const editor of editors) {
          const model = editor.getModel();
          if (model && model.uri.path.includes(filePath.replace(/\\/g, '/'))) {
            editor.revealLineInCenter(line);
            editor.setPosition({ lineNumber: line, column });
            editor.focus();
            break;
          }
        }
      });
    });
  }, []);

  const toggleWordWrap = useCallback(() => {
    triggerAction('editor.action.toggleWordWrap');
  }, [triggerAction]);

  return {
    goToDefinition,
    goToTypeDefinition,
    goToImplementation,
    findReferences,
    peekDefinition,
    peekReferences,
    renameSymbol,
    formatDocument,
    formatSelection,
    triggerCodeAction,
    triggerQuickFix,
    goToLine,
    goToSymbol,
    cut,
    copy,
    paste,
    selectAll,
    openLocation,
    toggleWordWrap,
    setEditorRef,
  };
}

export default useEditorActions;
