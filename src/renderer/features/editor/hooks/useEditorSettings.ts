/**
 * useEditorSettings Hook
 * 
 * Listens for editor settings changes (dispatched via custom events)
 * and applies them to all active Monaco editor instances.
 * 
 * Also loads persisted settings from localStorage on mount.
 */

import { useEffect, useMemo } from 'react';
import * as monaco from 'monaco-editor';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('useEditorSettings');

// =============================================================================
// Persisted Settings
// =============================================================================

export interface EditorExtendedSettings {
  tabSize: number;
  insertSpaces: boolean;
  renderWhitespace: string;
  cursorStyle: string;
  cursorBlinking: string;
  bracketPairColorization: boolean;
  stickyScroll: boolean;
  lineNumbers: string;
  formatOnSave: boolean;
  formatOnPaste: boolean;
  autoClosingBrackets: string;
  quickSuggestions: boolean;
  parameterHints: boolean;
  suggestOnTriggerCharacters: boolean;
}

/**
 * Load editor extended settings from localStorage
 */
export function loadEditorSettings(): EditorExtendedSettings {
  const get = (key: string, fallback: string): string => {
    try { return localStorage.getItem(`vyotiq-editor-${key}`) ?? fallback; } catch { return fallback; }
  };

  return {
    tabSize: Number(get('tabSize', '2')) || 2,
    insertSpaces: get('insertSpaces', 'true') !== 'false',
    renderWhitespace: get('renderWhitespace', 'selection'),
    cursorStyle: get('cursorStyle', 'line'),
    cursorBlinking: get('cursorBlinking', 'smooth'),
    bracketPairColorization: get('bracketColors', 'true') !== 'false',
    stickyScroll: get('stickyScroll', 'true') !== 'false',
    lineNumbers: get('lineNumbers', 'on'),
    formatOnSave: get('formatOnSave', 'false') === 'true',
    formatOnPaste: get('formatOnPaste', 'true') !== 'false',
    autoClosingBrackets: get('autoClosingBrackets', 'always'),
    quickSuggestions: get('quickSuggestions', 'true') !== 'false',
    parameterHints: get('parameterHints', 'true') !== 'false',
    suggestOnTriggerCharacters: get('suggestOnTrigger', 'true') !== 'false',
  };
}

/**
 * Apply settings to all active Monaco editors
 */
function applySettingsToEditors(options: monaco.editor.IEditorOptions): void {
  const editors = monaco.editor.getEditors();
  for (const editor of editors) {
    try {
      editor.updateOptions(options);
    } catch (err) {
      logger.debug('Failed to update editor options', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook that manages editor settings state and applies changes to Monaco.
 * Should be used once at the editor panel level.
 */
export function useEditorSettings(): EditorExtendedSettings {
  const settings = useMemo(() => loadEditorSettings(), []);

  // Apply initial settings
  useEffect(() => {
    const options = settingsToMonacoOptions(settings);
    // Defer to ensure Monaco editors are mounted
    const id = requestAnimationFrame(() => applySettingsToEditors(options));
    return () => cancelAnimationFrame(id);
  }, [settings]);

  // Listen for setting change events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;

      const monacoOpts: Record<string, unknown> = {};

      // Map custom event properties to Monaco options
      if (detail.tabSize !== undefined) monacoOpts.tabSize = detail.tabSize;
      if (detail.insertSpaces !== undefined) monacoOpts.insertSpaces = detail.insertSpaces;
      if (detail.renderWhitespace !== undefined) monacoOpts.renderWhitespace = detail.renderWhitespace;
      if (detail.cursorStyle !== undefined) monacoOpts.cursorStyle = detail.cursorStyle;
      if (detail.cursorBlinking !== undefined) monacoOpts.cursorBlinking = detail.cursorBlinking;
      if (detail.lineNumbers !== undefined) monacoOpts.lineNumbers = detail.lineNumbers;
      if (detail.formatOnPaste !== undefined) monacoOpts.formatOnPaste = detail.formatOnPaste;
      if (detail.autoClosingBrackets !== undefined) monacoOpts.autoClosingBrackets = detail.autoClosingBrackets;
      if (detail.quickSuggestions !== undefined) monacoOpts.quickSuggestions = detail.quickSuggestions;
      if (detail.parameterHints !== undefined) monacoOpts.parameterHints = detail.parameterHints;
      if (detail.suggestOnTriggerCharacters !== undefined) monacoOpts.suggestOnTriggerCharacters = detail.suggestOnTriggerCharacters;
      if (detail.bracketPairColorization !== undefined) monacoOpts.bracketPairColorization = detail.bracketPairColorization;
      if (detail.stickyScroll !== undefined) monacoOpts.stickyScroll = detail.stickyScroll;

      if (Object.keys(monacoOpts).length > 0) {
        applySettingsToEditors(monacoOpts as monaco.editor.IEditorOptions);
      }
    };

    document.addEventListener('vyotiq:editor-settings-changed', handler);
    return () => document.removeEventListener('vyotiq:editor-settings-changed', handler);
  }, []);

  return settings;
}

/**
 * Convert our settings object to Monaco editor options.
 * Exported for use by MonacoWrapper and other consumers.
 */
export function settingsToMonacoOptions(settings: EditorExtendedSettings): Record<string, unknown> {
  return {
    tabSize: settings.tabSize,
    insertSpaces: settings.insertSpaces,
    renderWhitespace: settings.renderWhitespace as monaco.editor.IEditorOptions['renderWhitespace'],
    cursorStyle: settings.cursorStyle as monaco.editor.IEditorOptions['cursorStyle'],
    cursorBlinking: settings.cursorBlinking as monaco.editor.IEditorOptions['cursorBlinking'],
    lineNumbers: settings.lineNumbers as monaco.editor.IEditorOptions['lineNumbers'],
    formatOnPaste: settings.formatOnPaste,
    autoClosingBrackets: settings.autoClosingBrackets as monaco.editor.IEditorOptions['autoClosingBrackets'],
    quickSuggestions: settings.quickSuggestions
      ? { other: true, comments: false, strings: true }
      : false,
    parameterHints: { enabled: settings.parameterHints },
    suggestOnTriggerCharacters: settings.suggestOnTriggerCharacters,
    bracketPairColorization: { enabled: settings.bracketPairColorization },
    stickyScroll: { enabled: settings.stickyScroll },
  };
}

export default useEditorSettings;
