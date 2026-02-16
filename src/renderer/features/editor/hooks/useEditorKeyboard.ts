/**
 * useEditorKeyboard Hook
 * 
 * Global keyboard shortcuts for the editor panel.
 * Handles file saving, tab navigation, and editor toggles.
 */

import { useEffect, useCallback } from 'react';
import {
  saveActiveTab,
  saveAllTabs,
  toggleWordWrap,
  toggleMinimap,
  increaseFontSize,
  decreaseFontSize,
} from '../store/editorStore';
import { useEditorStore } from '../store/editorStore';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('EditorKeyboard');

interface UseEditorKeyboardOptions {
  /** Whether the keyboard shortcuts are enabled */
  enabled?: boolean;
}

/**
 * Hook that registers global keyboard shortcuts for the editor.
 * Should be used in the top-level layout or editor panel.
 */
export function useEditorKeyboard(options: UseEditorKeyboardOptions = {}): void {
  const { enabled = true } = options;
  const { state, closeTab, setActiveTab } = useEditorStore();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;

    // Don't intercept if user is typing in an input/textarea (except Monaco)
    const target = e.target as HTMLElement;
    const isMonaco = target.closest('.monaco-editor');
    const isInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    if (isInput && !isMonaco) return;

    const modKey = e.ctrlKey || e.metaKey;

    // Ctrl+S: Save active file
    if (modKey && e.key === 's' && !e.shiftKey) {
      e.preventDefault();
      void saveActiveTab();
      return;
    }

    // Ctrl+Shift+S: Save all files
    if (modKey && e.key === 'S' && e.shiftKey) {
      e.preventDefault();
      void saveAllTabs();
      return;
    }

    // Ctrl+W: Close active tab (only when editor is focused)
    if (modKey && e.key === 'w' && isMonaco) {
      e.preventDefault();
      if (state.activeTabId) {
        closeTab(state.activeTabId);
      }
      return;
    }

    // Ctrl+=: Increase font size
    if (modKey && (e.key === '=' || e.key === '+') && isMonaco) {
      e.preventDefault();
      increaseFontSize();
      return;
    }

    // Ctrl+-: Decrease font size
    if (modKey && e.key === '-' && isMonaco) {
      e.preventDefault();
      decreaseFontSize();
      return;
    }

    // Alt+Z: Toggle word wrap
    if (e.altKey && e.key === 'z' && isMonaco) {
      e.preventDefault();
      toggleWordWrap();
      return;
    }
  }, [enabled, state.activeTabId, closeTab, setActiveTab]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);
}

export default useEditorKeyboard;
