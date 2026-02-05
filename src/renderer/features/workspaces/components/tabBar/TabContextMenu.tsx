/**
 * Tab Context Menu Component
 * 
 * Context menu for workspace tab actions like close, close others, etc.
 */
import React, { memo, useRef, useEffect, useCallback } from 'react';
import { cn } from '../../../../utils/cn';
import { useWorkspaceTabsActions } from '../../../../state/WorkspaceTabsProvider';
import type { ContextMenuProps } from './types';

// Menu item type
interface MenuItem {
  type?: 'item' | 'divider';
  label?: string;
  action?: () => void;
  disabled?: boolean;
  hint?: string;
}

export const TabContextMenu = memo<ContextMenuProps>(({ x, y, workspaceId, onClose }) => {
  const actions = useWorkspaceTabsActions();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleCloseTab = useCallback(() => {
    actions.closeTab(workspaceId);
    onClose();
  }, [actions, workspaceId, onClose]);

  const handleCloseOthers = useCallback(() => {
    actions.closeOtherTabs(workspaceId);
    onClose();
  }, [actions, workspaceId, onClose]);

  const handleCloseRight = useCallback(() => {
    actions.closeTabsToRight(workspaceId);
    onClose();
  }, [actions, workspaceId, onClose]);

  // Menu items configuration
  const menuItems: MenuItem[] = [
    { type: 'item', label: 'close tab', action: handleCloseTab },
    { type: 'item', label: 'close others', action: handleCloseOthers },
    { type: 'item', label: 'close to the right', action: handleCloseRight },
    { type: 'divider' },
    { type: 'item', label: 'pin tab', action: () => {}, disabled: true, hint: 'coming soon' },
  ];

  return (
    <div
      ref={menuRef}
      className={cn(
        'fixed z-50 min-w-[160px] py-1',
        'bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)]',
        'rounded-sm shadow-lg',
        'animate-in fade-in zoom-in-95 duration-100',
        'font-mono text-xs'
      )}
      style={{ left: x, top: y }}
      role="menu"
    >
      {menuItems.map((item, index) => {
        if (item.type === 'divider') {
          return (
            <div 
              key={`divider-${index}`} 
              className="my-1 border-t border-[var(--color-border-subtle)]" 
            />
          );
        }
        
        return (
          <button
            key={item.label || `item-${index}`}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={cn(
              'w-full px-3 py-1.5 text-left text-xs font-mono',
              'transition-colors focus:outline-none',
              item.disabled
                ? 'text-[var(--color-text-dim)] cursor-not-allowed'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-active)] focus-visible:bg-[var(--color-surface-active)]'
            )}
            onClick={item.action}
          >
            <span className="flex items-center justify-between">
              <span>{item.label}</span>
              {item.hint && (
                <span className="text-[9px] text-[var(--color-text-placeholder)]">
                  {item.hint}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
});

TabContextMenu.displayName = 'TabContextMenu';

export default TabContextMenu;
