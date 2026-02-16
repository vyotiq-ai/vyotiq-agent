/**
 * Editor Tab Context Menu
 * 
 * Right-click context menu for editor tabs with tab management actions.
 */

import React, { useRef, useEffect, useCallback, memo } from 'react';
import {
  X,
  XCircle,
  ArrowRightToLine,
  Save,
  RotateCcw,
  Copy,
  FolderOpen,
  Columns,
} from 'lucide-react';
import { cn } from '../../../utils/cn';

// =============================================================================
// Types
// =============================================================================

export type TabContextAction =
  | 'close'
  | 'closeOthers'
  | 'closeToRight'
  | 'closeAll'
  | 'save'
  | 'revert'
  | 'copyPath'
  | 'copyRelativePath'
  | 'revealInExplorer';

interface TabContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  tabId: string | null;
  fileName: string | null;
  filePath: string | null;
  isDirty: boolean;
  onAction: (action: TabContextAction) => void;
  onClose: () => void;
}

// =============================================================================
// Component
// =============================================================================

export const TabContextMenu: React.FC<TabContextMenuProps> = memo(({
  isOpen,
  position,
  tabId,
  fileName,
  filePath,
  isDirty,
  onAction,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handleClick), 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [isOpen, onClose]);

  // Position adjustment
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;
    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    let x = position.x;
    let y = position.y;
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
    menu.style.left = `${Math.max(8, x)}px`;
    menu.style.top = `${Math.max(8, y)}px`;
  }, [isOpen, position]);

  const handleAction = useCallback((action: TabContextAction) => {
    onAction(action);
    onClose();
  }, [onAction, onClose]);

  if (!isOpen || !tabId) return null;

  const items: Array<{
    action: TabContextAction;
    label: string;
    icon: React.ReactNode;
    shortcut?: string;
    disabled?: boolean;
    divider?: boolean;
  }> = [
    { action: 'close', label: 'close', icon: <X size={12} />, shortcut: 'Ctrl+W' },
    { action: 'closeOthers', label: 'close others', icon: <XCircle size={12} /> },
    { action: 'closeToRight', label: 'close to the right', icon: <ArrowRightToLine size={12} />, divider: true },
    { action: 'closeAll', label: 'close all', icon: <XCircle size={12} />, divider: true },
    { action: 'save', label: 'save', icon: <Save size={12} />, shortcut: 'Ctrl+S', disabled: !isDirty },
    { action: 'revert', label: 'revert file', icon: <RotateCcw size={12} />, disabled: !isDirty, divider: true },
    { action: 'copyPath', label: 'copy path', icon: <Copy size={12} /> },
    { action: 'copyRelativePath', label: 'copy relative path', icon: <Copy size={12} />, divider: true },
    { action: 'revealInExplorer', label: 'reveal in explorer', icon: <FolderOpen size={12} /> },
  ];

  return (
    <div
      ref={menuRef}
      className={cn(
        'fixed z-50 min-w-[180px] max-w-[260px]',
        'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]/60',
        'rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.25)] font-mono text-[11px]',
        'animate-in fade-in-0 slide-in-from-top-1 duration-100'
      )}
      style={{ left: position.x, top: position.y }}
      role="menu"
    >
      {/* Header */}
      <div className="px-2.5 py-1.5 border-b border-[var(--color-border-subtle)]/30 rounded-t-lg">
        <div className="text-[var(--color-text-primary)] truncate text-[10px]" title={filePath ?? ''}>
          {fileName}
        </div>
      </div>

      <div className="py-1">
        {items.map((item, i) => (
          <React.Fragment key={item.action}>
            <button
              type="button"
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors duration-75',
                item.disabled
                  ? 'text-[var(--color-text-dim)] cursor-not-allowed'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]'
              )}
              onClick={() => !item.disabled && handleAction(item.action)}
              disabled={item.disabled}
              role="menuitem"
            >
              <span className="shrink-0 text-[var(--color-text-muted)]">{item.icon}</span>
              <span className="flex-1 truncate">{item.label}</span>
              {item.shortcut && (
                <span className="text-[9px] shrink-0 ml-2 text-[var(--color-text-placeholder)] opacity-50">
                  {item.shortcut}
                </span>
              )}
            </button>
            {item.divider && (
              <div className="my-1 mx-2 border-t border-[var(--color-border-subtle)]/40" />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
});

TabContextMenu.displayName = 'TabContextMenu';
