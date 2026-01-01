/**
 * EditorContextMenu Component
 * 
 * Custom right-click context menu for the code editor with terminal-style aesthetics.
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
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
    highlight?: boolean;
}

interface EditorContextMenuProps {
    isOpen: boolean;
    position: { x: number; y: number };
    canSave: boolean;
    fileName?: string;
    onAction: (action: EditorContextMenuAction) => void;
    onClose: () => void;
}

const menuItems: ContextMenuItem[] = [
    { action: 'cut', label: 'cut', icon: <Scissors size={12} />, shortcut: 'Ctrl+X' },
    { action: 'copy', label: 'copy', icon: <Copy size={12} />, shortcut: 'Ctrl+C' },
    { action: 'paste', label: 'paste', icon: <Clipboard size={12} />, shortcut: 'Ctrl+V', divider: true },
    { action: 'selectAll', label: 'select all', icon: <MousePointer2 size={12} />, shortcut: 'Ctrl+A', divider: true },
    { action: 'aiActions', label: 'ai actions', icon: <Sparkles size={12} />, shortcut: 'Ctrl+Shift+A', isSubmenu: true, highlight: true, divider: true },
    { action: 'save', label: 'save', icon: <Save size={12} />, shortcut: 'Ctrl+S' },
    { action: 'format', label: 'format document', icon: <Type size={12} />, divider: true },
    { action: 'showDiff', label: 'show changes', icon: <FileCode size={12} />, shortcut: 'Ctrl+D' },
];

export const EditorContextMenu: React.FC<EditorContextMenuProps> = ({
    isOpen,
    position,
    canSave,
    fileName,
    onAction,
    onClose,
}) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

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

        menu.style.left = `${Math.max(8, adjustedX)}px`;
        menu.style.top = `${Math.max(8, adjustedY)}px`;
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
                'fixed z-50 min-w-[160px] max-w-[240px] max-h-[60vh] overflow-y-auto',
                'bg-[var(--color-surface-base)] border border-[var(--color-border-subtle)]',
                'shadow-2xl font-mono text-[11px]',
                'animate-in fade-in-0 slide-in-from-top-1 duration-100',
                'scrollbar-thin scrollbar-thumb-[var(--color-border-subtle)] scrollbar-track-transparent'
            )}
            style={{ left: position.x, top: position.y }}
            role="menu"
            aria-label="Editor context menu"
        >
            {/* Header */}
            {fileName && (
                <div className="sticky top-0 px-2.5 py-1.5 bg-[var(--color-surface-base)] border-b border-[var(--color-border-subtle)]">
                    <span className="text-[var(--color-text-muted)] text-[9px] uppercase tracking-wide">
                        editor
                    </span>
                    <div className="text-[var(--color-text-primary)] truncate text-[10px] mt-0.5 max-w-[200px]" title={fileName}>
                        {fileName}
                    </div>
                </div>
            )}

            <div className="py-1">
                {menuItems.map((item, index) => {
                    const isDisabled = item.disabled || (item.action === 'save' && !canSave);
                    const isHovered = hoveredIndex === index;

                    return (
                        <React.Fragment key={`${item.action}-${index}`}>
                            <button
                                type="button"
                                className={cn(
                                    'w-full flex items-center gap-2 px-2.5 py-1 text-left transition-colors duration-75',
                                    'focus-visible:outline-none focus-visible:bg-[var(--color-surface-2)]',
                                    isDisabled 
                                        ? 'text-[var(--color-text-dim)] cursor-not-allowed' 
                                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]',
                                    isHovered && !isDisabled && 'bg-[var(--color-surface-2)] text-[var(--color-text-primary)]'
                                )}
                                onClick={() => handleItemClick(item.action, isDisabled)}
                                onMouseEnter={() => setHoveredIndex(index)}
                                onMouseLeave={() => setHoveredIndex(null)}
                                disabled={isDisabled}
                                role="menuitem"
                            >
                                <span className={cn(
                                    'shrink-0 transition-colors duration-75',
                                    isDisabled 
                                        ? 'text-[var(--color-text-dim)]' 
                                        : item.highlight
                                            ? 'text-[var(--color-accent-primary)]'
                                            : 'text-[var(--color-text-muted)]'
                                )}>
                                    {item.icon}
                                </span>
                                <span className="flex-1 truncate">{item.label}</span>
                                {item.isSubmenu ? (
                                    <ChevronRight size={10} className="text-[var(--color-text-placeholder)] opacity-60" />
                                ) : item.shortcut && (
                                    <span className="text-[9px] shrink-0 ml-2 text-[var(--color-text-placeholder)] opacity-60">
                                        {item.shortcut}
                                    </span>
                                )}
                            </button>
                            {item.divider && (
                                <div className="my-0.5 mx-2 border-t border-[var(--color-border-subtle)]/50" />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};
