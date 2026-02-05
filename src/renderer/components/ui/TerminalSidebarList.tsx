import React from 'react';
import { cn } from '../../utils/cn';

export interface ListItem {
    id: string;
    label: string;
    isActive?: boolean;
    metadata?: string | number;
    tooltip?: string;
    badge?: string;
}

export interface ListGroup {
    label: string;
    items: ListItem[];
}

interface TerminalSidebarListProps {
    collapsed: boolean;
    groups: ListGroup[];
    onSelect: (id: string) => void;
    onRemove?: (e: React.MouseEvent, id: string) => void;
    /** Called on middle-click or Ctrl+click to open in new tab */
    onMiddleClick?: (id: string) => void;
    isLoading?: boolean;
    typeLabel?: string;
    emptyState?: {
        message: string;
        actionLabel?: string;
        onAction?: () => void;
    };
    warning?: string;
}

export const TerminalSidebarList: React.FC<TerminalSidebarListProps> = ({
    collapsed,
    groups,
    onSelect,
    onRemove,
    onMiddleClick,
    isLoading,
    typeLabel,
    emptyState,
    warning,
}) => {
    const totalItems = groups.reduce((acc, g) => acc + g.items.length, 0);

    // Handle click with modifier keys
    const handleItemClick = (e: React.MouseEvent, id: string) => {
        // Middle-click or Ctrl+click opens in new tab
        if ((e.button === 1 || e.ctrlKey || e.metaKey) && onMiddleClick) {
            e.preventDefault();
            onMiddleClick(id);
        } else if (e.button === 0) {
            onSelect(id);
        }
    };

    // Handle middle-click specifically
    const handleMouseDown = (e: React.MouseEvent, id: string) => {
        if (e.button === 1 && onMiddleClick) {
            e.preventDefault();
            onMiddleClick(id);
        }
    };

    return (
        <div className={collapsed ? 'mt-1' : 'mt-1 text-[10px] min-w-0 overflow-hidden'}>
            {/* List header */}
            {!collapsed && totalItems > 0 && typeLabel && (
                <div className="flex items-center gap-1.5 px-1.5 py-1 text-[9px] text-[var(--color-text-placeholder)] border-b border-[var(--color-border-subtle)]">
                    <span className="text-[var(--color-accent-primary)]/60">›</span>
                    <span className="text-[var(--color-text-dim)]">{typeLabel}</span>
                </div>
            )}

            {/* Warning state */}
            {warning && !collapsed && (
                <div className="flex items-center gap-2 px-1.5 py-2 text-[10px] text-[var(--color-text-dim)]">
                    <span className="text-[var(--color-warning)]">[!]</span>
                    <span>{warning}</span>
                </div>
            )}

            {/* Empty state */}
            {totalItems === 0 && emptyState && !collapsed && (
                <div className="py-2 px-1.5">
                    <div className="text-[10px] text-[var(--color-text-dim)] mb-1.5">
                        <span className="text-[var(--color-text-placeholder)]"># {emptyState.message}</span>
                    </div>
                    {emptyState.onAction && (
                        <button
                            className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)] transition-colors disabled:opacity-50 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
                            onClick={emptyState.onAction}
                            disabled={isLoading}
                        >
                            <span className="text-[var(--color-accent-primary)]/60">+</span>
                            <span>{isLoading ? 'processing...' : emptyState.actionLabel || 'add new'}</span>
                        </button>
                    )}
                </div>
            )}

            {/* List content */}
            {groups.map((group) => {
                if (group.items.length === 0) return null;
                return (
                    <div key={group.label} className="mt-1">
                        {!collapsed && group.label !== 'default' && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] text-[var(--color-text-placeholder)] min-w-0 overflow-hidden">
                                <span className="text-[var(--color-text-dim)] flex-shrink-0">├──</span>
                                <span className="text-[var(--color-info)]/60 truncate">{group.label}/</span>
                            </div>
                        )}
                        {group.items.map((item, idx) => {
                            const isLast = idx === group.items.length - 1;
                            return (
                                <div key={item.id} className="group relative">
                                    <div
                                        className={cn(
                                            'flex items-center gap-1.5 px-1.5 py-1 cursor-pointer transition-all duration-150 rounded-sm min-w-0 overflow-hidden',
                                            item.isActive
                                                ? 'text-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/5'
                                                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]/50',
                                            isLoading && 'opacity-50 pointer-events-none'
                                        )}
                                        onClick={(e) => handleItemClick(e, item.id)}
                                        onMouseDown={(e) => handleMouseDown(e, item.id)}
                                        title={item.tooltip || item.label}
                                    >
                                        {!collapsed && (
                                            <span className="text-[var(--color-text-dim)] text-[9px] flex-shrink-0">
                                                {isLast ? '└──' : '├──'}
                                            </span>
                                        )}
                                        {item.isActive && (
                                            <span className="text-[var(--color-accent-primary)] text-[9px] flex-shrink-0">❯</span>
                                        )}
                                        <span className="truncate min-w-0 flex-1">{item.label}</span>
                                        {!collapsed && item.badge && (
                                            <span className="text-[9px] text-[var(--color-accent-secondary)] flex-shrink-0">
                                                {item.badge}
                                            </span>
                                        )}
                                        {!collapsed && item.metadata !== undefined && (
                                            <span className="text-[9px] text-[var(--color-text-dim)] flex-shrink-0">
                                                [{item.metadata}]
                                            </span>
                                        )}
                                    </div>
                                    {!collapsed && onRemove && (
                                        <button
                                            onClick={(e) => onRemove(e, item.id)}
                                            className="absolute right-1 top-1/2 -translate-y-1/2 px-1 py-0.5 text-[9px] text-[var(--color-text-placeholder)] hover:text-[var(--color-error)] opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 rounded-sm focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
                                            title={`rm --${typeLabel || 'item'}`}
                                            disabled={isLoading}
                                        >
                                            rm
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                );
            })}

            {/* Footer */}
            {!collapsed && totalItems > 0 && typeLabel && (
                <div className="flex items-center gap-1 px-1.5 py-1 text-[9px] text-[var(--color-text-placeholder)] border-t border-[var(--color-border-subtle)] mt-1">
                    <span className="text-[var(--color-success)]/60">[ok]</span>
                    <span>
                        {totalItems} {typeLabel}
                        {totalItems !== 1 ? 's' : ''}
                    </span>
                </div>
            )}
        </div>
    );
};
