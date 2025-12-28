/**
 * EditorContextMenu Component
 * 
 * Custom right-click context menu for the code editor.
 * Matches the application's design system and provides standard editor actions.
 * Includes AI actions submenu trigger.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import {
    Copy,
    Scissors,
    Clipboard,
    Save,
    FileCode,
    Type,
    MousePointer2,
    Sparkles,
    ChevronRight,
} from 'lucide-react';
import { cn } from '../../../utils/cn';

export type EditorContextMenuAction =
    | 'copy'
    | 'cut'
    | 'paste'
    | 'selectAll'
    | 'save'
    | 'format'
    | 'showDiff'
    | 'aiActions';

interface ContextMenuItem {
    action: EditorContextMenuAction;
    label: string;
    icon: React.ReactNode;
    shortcut?: string;
    disabled?: boolean;
    divider?: boolean;
    isSubmenu?: boolean;
}

interface EditorContextMenuProps {
    isOpen: boolean;
    position: { x: number; y: number };
    canSave: boolean;
    onAction: (action: EditorContextMenuAction) => void;
    onClose: () => void;
}

const menuItems: ContextMenuItem[] = [
    { action: 'cut', label: 'Cut', icon: <Scissors size={14} />, shortcut: 'Ctrl+X' },
    { action: 'copy', label: 'Copy', icon: <Copy size={14} />, shortcut: 'Ctrl+C' },
    { action: 'paste', label: 'Paste', icon: <Clipboard size={14} />, shortcut: 'Ctrl+V', divider: true },
    { action: 'selectAll', label: 'Select All', icon: <MousePointer2 size={14} />, shortcut: 'Ctrl+A', divider: true },
    { action: 'aiActions', label: 'AI Actions', icon: <Sparkles size={14} className="text-[var(--color-accent-primary)]" />, shortcut: 'Ctrl+Shift+A', isSubmenu: true, divider: true },
    { action: 'save', label: 'Save', icon: <Save size={14} />, shortcut: 'Ctrl+S' },
    { action: 'format', label: 'Format Document', icon: <Type size={14} />, divider: true },
    { action: 'showDiff', label: 'Show Changes', icon: <FileCode size={14} />, shortcut: 'Ctrl+D' },
];

export const EditorContextMenu: React.FC<EditorContextMenuProps> = ({
    isOpen,
    position,
    canSave,
    onAction,
    onClose,
}) => {
    const menuRef = useRef<HTMLDivElement>(null);

    // Close on escape key
    useEffect(() => {
        if (!isOpen) return;

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    // Close on click outside
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const timeoutId = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 50);

        return () => {
            clearTimeout(timeoutId);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    // Adjust position to stay within viewport
    useEffect(() => {
        if (!isOpen || !menuRef.current) return;

        const menu = menuRef.current;
        const rect = menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let adjustedX = position.x;
        let adjustedY = position.y;

        if (position.x + rect.width > viewportWidth) {
            adjustedX = viewportWidth - rect.width - 8;
        }

        if (position.y + rect.height > viewportHeight) {
            adjustedY = viewportHeight - rect.height - 8;
        }

        menu.style.left = `${adjustedX}px`;
        menu.style.top = `${adjustedY}px`;
    }, [isOpen, position]);

    const handleItemClick = useCallback((action: EditorContextMenuAction, disabled?: boolean) => {
        if (disabled) return;
        onAction(action);
        onClose();
    }, [onAction, onClose]);

    if (!isOpen) return null;

    return (
        <div
            ref={menuRef}
            className={cn(
                'fixed z-50 min-w-[180px] py-1',
                'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]',
                'rounded-md shadow-lg font-mono text-[11px]',
                'animate-in fade-in-0 zoom-in-95 duration-100'
            )}
            style={{ left: position.x, top: position.y }}
            role="menu"
            aria-label="Editor context menu"
        >
            {menuItems.map((item, index) => {
                const isDisabled = item.disabled || (item.action === 'save' && !canSave);

                return (
                    <React.Fragment key={`${item.action}-${index}`}>
                        <button
                            type="button"
                            className={cn(
                                'w-full flex items-center gap-2 px-3 py-1.5 text-left',
                                'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]',
                                'hover:text-[var(--color-text-primary)] transition-colors',
                                'focus-visible:outline-none focus-visible:bg-[var(--color-surface-2)]',
                                isDisabled && 'opacity-50 cursor-not-allowed hover:bg-transparent'
                            )}
                            onClick={() => handleItemClick(item.action, isDisabled)}
                            disabled={isDisabled}
                            role="menuitem"
                        >
                            <span className={cn(
                                'shrink-0',
                                item.action === 'aiActions' ? '' : 'text-[var(--color-text-dim)]'
                            )}>
                                {item.icon}
                            </span>
                            <span className="flex-1">{item.label}</span>
                            {item.isSubmenu ? (
                                <ChevronRight size={12} className="text-[var(--color-text-placeholder)]" />
                            ) : item.shortcut && (
                                <span className="text-[9px] text-[var(--color-text-placeholder)] shrink-0 ml-4">
                                    {item.shortcut}
                                </span>
                            )}
                        </button>
                        {item.divider && (
                            <div className="my-1 border-t border-[var(--color-border-subtle)]" />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};
