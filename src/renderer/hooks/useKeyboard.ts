/**
 * useKeyboard Hook
 * 
 * Provides keyboard shortcut handling with support for
 * modifier keys and key combinations.
 */
import { useEffect, useCallback, useRef } from 'react';

// =============================================================================
// Types
// =============================================================================

type ModifierKey = 'ctrl' | 'alt' | 'shift' | 'meta';

interface KeyboardShortcut {
    /** Key or key combination (e.g., 'k', 'ctrl+k', 'ctrl+shift+p') */
    key: string;
    /** Handler function */
    handler: (event: KeyboardEvent) => void;
    /** Whether to prevent default browser behavior */
    preventDefault?: boolean;
    /** Whether the shortcut is enabled */
    enabled?: boolean;
    /** Description for documentation purposes */
    description?: string;
}

interface UseKeyboardOptions {
    /** Whether keyboard handling is globally enabled */
    enabled?: boolean;
    /** Element to attach listeners to (defaults to document) */
    target?: HTMLElement | Document | null;
}

// =============================================================================
// Key Parsing Utilities
// =============================================================================

function parseKeyCombo(combo: string): { key: string; modifiers: Set<ModifierKey> } {
    const parts = combo.toLowerCase().split('+').map(p => p.trim());
    const modifiers = new Set<ModifierKey>();
    let key = '';

    for (const part of parts) {
        if (part === 'ctrl' || part === 'control') {
            modifiers.add('ctrl');
        } else if (part === 'alt' || part === 'option') {
            modifiers.add('alt');
        } else if (part === 'shift') {
            modifiers.add('shift');
        } else if (part === 'meta' || part === 'cmd' || part === 'command' || part === 'win') {
            modifiers.add('meta');
        } else {
            key = part;
        }
    }

    return { key, modifiers };
}

function matchesShortcut(event: KeyboardEvent, combo: string): boolean {
    const { key: targetKey, modifiers: targetModifiers } = parseKeyCombo(combo);
    const eventKey = event.key.toLowerCase();

    // Check modifiers
    const hasCtrl = event.ctrlKey === targetModifiers.has('ctrl');
    const hasAlt = event.altKey === targetModifiers.has('alt');
    const hasShift = event.shiftKey === targetModifiers.has('shift');
    const hasMeta = event.metaKey === targetModifiers.has('meta');

    if (!hasCtrl || !hasAlt || !hasShift || !hasMeta) {
        return false;
    }

    // Check key - handle special cases
    if (targetKey === 'escape' || targetKey === 'esc') {
        return eventKey === 'escape';
    }
    if (targetKey === 'enter' || targetKey === 'return') {
        return eventKey === 'enter';
    }
    if (targetKey === 'space') {
        return eventKey === ' ';
    }
    if (targetKey === 'backspace') {
        return eventKey === 'backspace';
    }
    if (targetKey === 'delete' || targetKey === 'del') {
        return eventKey === 'delete';
    }
    if (targetKey === 'tab') {
        return eventKey === 'tab';
    }
    // Arrow keys
    if (targetKey === 'up' || targetKey === 'arrowup') {
        return eventKey === 'arrowup';
    }
    if (targetKey === 'down' || targetKey === 'arrowdown') {
        return eventKey === 'arrowdown';
    }
    if (targetKey === 'left' || targetKey === 'arrowleft') {
        return eventKey === 'arrowleft';
    }
    if (targetKey === 'right' || targetKey === 'arrowright') {
        return eventKey === 'arrowright';
    }

    return eventKey === targetKey;
}

// =============================================================================
// useKeyboard Hook
// =============================================================================

export function useKeyboard(
    shortcuts: KeyboardShortcut[],
    options: UseKeyboardOptions = {}
): void {
    const { enabled = true, target } = options;
    const shortcutsRef = useRef(shortcuts);

    // Keep shortcuts ref updated
    useEffect(() => {
        shortcutsRef.current = shortcuts;
    }, [shortcuts]);

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        // Skip if disabled
        if (!enabled) return;

        // Skip if typing in an input (unless modifier keys are pressed)
        const target = event.target as HTMLElement;
        const isInput = target.tagName === 'INPUT' || 
                       target.tagName === 'TEXTAREA' || 
                       target.isContentEditable;
        
        // Allow shortcuts with modifiers even in inputs
        const hasModifier = event.ctrlKey || event.metaKey || event.altKey;
        
        for (const shortcut of shortcutsRef.current) {
            if (shortcut.enabled === false) continue;
            
            if (matchesShortcut(event, shortcut.key)) {
                // Skip non-modified shortcuts in inputs
                if (isInput && !hasModifier) continue;
                
                if (shortcut.preventDefault !== false) {
                    event.preventDefault();
                }
                shortcut.handler(event);
                return;
            }
        }
    }, [enabled]);

    useEffect(() => {
        const targetElement = target ?? document;
        targetElement.addEventListener('keydown', handleKeyDown as EventListener);
        
        return () => {
            targetElement.removeEventListener('keydown', handleKeyDown as EventListener);
        };
    }, [handleKeyDown, target]);
}

// =============================================================================
// useHotkey Hook (Single shortcut variant)
// =============================================================================

export function useHotkey(
    key: string,
    handler: (event: KeyboardEvent) => void,
    options: Omit<UseKeyboardOptions, 'shortcuts'> & { 
        preventDefault?: boolean;
        enabled?: boolean;
    } = {}
): void {
    const { preventDefault = true, enabled = true, target } = options;
    
    useKeyboard(
        [{ key, handler, preventDefault, enabled }],
        { enabled, target }
    );
}

// =============================================================================
// useEscapeKey Hook
// =============================================================================

export function useEscapeKey(
    handler: () => void,
    enabled = true
): void {
    useHotkey('escape', handler, { enabled });
}

// =============================================================================
// Platform Detection
// =============================================================================

export const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

export function formatShortcut(shortcut: string): string {
    return shortcut
        .split('+')
        .map(part => {
            const p = part.trim().toLowerCase();
            if (p === 'ctrl' || p === 'control') return isMac ? '⌃' : 'Ctrl';
            if (p === 'alt' || p === 'option') return isMac ? '⌥' : 'Alt';
            if (p === 'shift') return isMac ? '⇧' : 'Shift';
            if (p === 'meta' || p === 'cmd' || p === 'command') return isMac ? '⌘' : 'Win';
            if (p === 'enter' || p === 'return') return '↵';
            if (p === 'escape' || p === 'esc') return 'Esc';
            if (p === 'backspace') return '⌫';
            if (p === 'delete') return 'Del';
            if (p === 'tab') return '⇥';
            if (p === 'space') return '␣';
            if (p === 'up' || p === 'arrowup') return '↑';
            if (p === 'down' || p === 'arrowdown') return '↓';
            if (p === 'left' || p === 'arrowleft') return '←';
            if (p === 'right' || p === 'arrowright') return '→';
            return p.toUpperCase();
        })
        .join(isMac ? '' : '+');
}
