/**
 * useKeyboardShortcuts Hook
 * 
 * Manages VS Code-style keyboard shortcuts globally.
 * Provides registration, conflict detection, and shortcut display.
 */

import { useEffect, useRef } from 'react';

export interface KeyboardShortcut {
  id: string;
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  action: () => void;
  when?: () => boolean;
  description?: string;
  category?: string;
}

/**
 * Parse a shortcut string like "Ctrl+Shift+P" into components
 */
export function parseShortcut(shortcut: string): Omit<KeyboardShortcut, 'id' | 'action'> {
  const parts = shortcut.toLowerCase().split('+');
  const key = parts[parts.length - 1];
  
  return {
    key,
    ctrl: parts.includes('ctrl') || parts.includes('control'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    meta: parts.includes('meta') || parts.includes('cmd') || parts.includes('command'),
  };
}

/**
 * Format a shortcut for display
 */
export function formatShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];
  
  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.alt) parts.push('Alt');
  if (shortcut.shift) parts.push('Shift');
  if (shortcut.meta) parts.push('⌘');
  
  // Capitalize key
  const keyDisplay = shortcut.key.length === 1 
    ? shortcut.key.toUpperCase() 
    : shortcut.key.charAt(0).toUpperCase() + shortcut.key.slice(1);
  parts.push(keyDisplay);
  
  return parts.join('+');
}

/**
 * Check if a keyboard event matches a shortcut
 */
function matchesShortcut(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
  const key = event.key.toLowerCase();
  
  // Handle special keys
  const shortcutKey = shortcut.key.toLowerCase();
  const keyMatches = key === shortcutKey || 
    // Handle F1-F12
    (shortcutKey.startsWith('f') && key === shortcutKey) ||
    // Handle escape
    (shortcutKey === 'escape' && key === 'escape') ||
    // Handle arrow keys
    (shortcutKey === 'arrowup' && key === 'arrowup') ||
    (shortcutKey === 'arrowdown' && key === 'arrowdown') ||
    (shortcutKey === 'arrowleft' && key === 'arrowleft') ||
    (shortcutKey === 'arrowright' && key === 'arrowright');
  
  if (!keyMatches) return false;
  
  // Check modifiers
  if (!!shortcut.ctrl !== event.ctrlKey) return false;
  if (!!shortcut.shift !== event.shiftKey) return false;
  if (!!shortcut.alt !== event.altKey) return false;
  if (!!shortcut.meta !== event.metaKey) return false;
  
  // Check condition
  if (shortcut.when && !shortcut.when()) return false;
  
  return true;
}

interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
}

/**
 * Hook to register and handle keyboard shortcuts
 */
export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions) {
  const { shortcuts, enabled = true } = options;
  const shortcutsRef = useRef(shortcuts);
  
  // Keep shortcuts ref updated
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip if we're in an input/textarea (unless it's a global shortcut)
      const target = event.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || 
                      target.tagName === 'TEXTAREA' || 
                      target.isContentEditable;
      
      for (const shortcut of shortcutsRef.current) {
        if (matchesShortcut(event, shortcut)) {
          // For most shortcuts, don't trigger when in input
          // Exception: Escape, Ctrl+S, Ctrl+Shift+P, etc.
          if (isInput && !shortcut.ctrl && !shortcut.meta && shortcut.key !== 'escape') {
            continue;
          }
          
          event.preventDefault();
          event.stopPropagation();
          shortcut.action();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled]);
}

/**
 * Default VS Code shortcuts configuration
 */
export const defaultShortcuts = {
  commandPalette: { key: 'p', ctrl: true, shift: true },
  quickOpen: { key: 'p', ctrl: true },
  goToSymbol: { key: 'o', ctrl: true, shift: true },
  goToLine: { key: 'g', ctrl: true },
  findInFiles: { key: 'f', ctrl: true, shift: true },
  find: { key: 'f', ctrl: true },
  replace: { key: 'h', ctrl: true },
  save: { key: 's', ctrl: true },
  saveAll: { key: 's', ctrl: true, shift: true },
  closeTab: { key: 'w', ctrl: true },
  undo: { key: 'z', ctrl: true },
  redo: { key: 'y', ctrl: true },
  cut: { key: 'x', ctrl: true },
  copy: { key: 'c', ctrl: true },
  paste: { key: 'v', ctrl: true },
  selectAll: { key: 'a', ctrl: true },
  toggleSidebar: { key: 'b', ctrl: true },
  toggleTerminal: { key: '`', ctrl: true },
  zoomIn: { key: '=', ctrl: true },
  zoomOut: { key: '-', ctrl: true },
  zoomReset: { key: '0', ctrl: true },
  formatDocument: { key: 'f', shift: true, alt: true },
  commentLine: { key: '/', ctrl: true },
  duplicateLine: { key: 'd', ctrl: true, shift: true },
  deleteLine: { key: 'k', ctrl: true, shift: true },
  moveLineUp: { key: 'arrowup', alt: true },
  moveLineDown: { key: 'arrowdown', alt: true },
  newFile: { key: 'n', ctrl: true },
  openSettings: { key: ',', ctrl: true },
};

export default useKeyboardShortcuts;
