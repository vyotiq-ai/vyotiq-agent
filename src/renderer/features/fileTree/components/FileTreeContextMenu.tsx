/**
 * FileTreeContextMenu Component
 * 
 * Right-click context menu for file tree items with VS Code-like actions.
 */

import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import {
  FilePlus,
  FolderPlus,
  Pencil,
  Trash2,
  Copy,
  ClipboardCopy,
  Clipboard,
  Scissors,
  FolderOpen,
  Terminal,
  RefreshCw,
  ChevronsDownUp,
  ChevronsUpDown,
  Search,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { ContextMenuAction, ContextMenuPosition } from '../types';

interface ContextMenuItem {
  action: ContextMenuAction;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  divider?: boolean;
  show?: 'file' | 'directory' | 'both';
}

interface FileTreeContextMenuProps {
  isOpen: boolean;
  position: ContextMenuPosition;
  targetPath: string | null;
  targetType: 'file' | 'directory' | null;
  canPaste: boolean;
  onAction: (action: ContextMenuAction, targetPath: string, targetType: 'file' | 'directory') => void;
  onClose: () => void;
}

const createMenuItems = (canPaste: boolean): ContextMenuItem[] => [
  { action: 'newFile', label: 'New File', icon: <FilePlus size={14} />, show: 'directory' },
  { action: 'newFolder', label: 'New Folder', icon: <FolderPlus size={14} />, show: 'directory', divider: true },
  { action: 'newFile', label: 'New File...', icon: <FilePlus size={14} />, show: 'file' },
  { action: 'newFolder', label: 'New Folder...', icon: <FolderPlus size={14} />, show: 'file', divider: true },
  { action: 'cut', label: 'Cut', icon: <Scissors size={14} />, shortcut: 'Ctrl+X', show: 'both' },
  { action: 'copy', label: 'Copy', icon: <Copy size={14} />, shortcut: 'Ctrl+C', show: 'both' },
  { action: 'paste', label: 'Paste', icon: <Clipboard size={14} />, shortcut: 'Ctrl+V', show: 'both', disabled: !canPaste, divider: true },
  { action: 'rename', label: 'Rename', icon: <Pencil size={14} />, shortcut: 'F2', show: 'both' },
  { action: 'delete', label: 'Delete', icon: <Trash2 size={14} />, shortcut: 'Del', show: 'both', divider: true },
  { action: 'copyPath', label: 'Copy Path', icon: <Copy size={14} />, shortcut: 'Ctrl+Shift+C', show: 'both' },
  { action: 'copyRelativePath', label: 'Copy Relative Path', icon: <ClipboardCopy size={14} />, show: 'both', divider: true },
  { action: 'revealInExplorer', label: 'Reveal in File Explorer', icon: <FolderOpen size={14} />, show: 'both' },
  { action: 'openInTerminal', label: 'Open in Terminal', icon: <Terminal size={14} />, show: 'directory' },
  { action: 'findInFolder', label: 'Find in Folder...', icon: <Search size={14} />, show: 'directory', divider: true },
  { action: 'refresh', label: 'Refresh', icon: <RefreshCw size={14} />, show: 'both' },
  { action: 'collapseAll', label: 'Collapse All', icon: <ChevronsDownUp size={14} />, show: 'directory' },
  { action: 'expandAll', label: 'Expand All', icon: <ChevronsUpDown size={14} />, show: 'directory' },
];

export const FileTreeContextMenu: React.FC<FileTreeContextMenuProps> = ({
  isOpen,
  position,
  targetPath,
  targetType,
  canPaste,
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
    
    // Small delay to prevent immediate close when menu opens
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
  
  // Handle menu item click - call action first, then close
  const handleItemClick = useCallback((action: ContextMenuAction, disabled?: boolean) => {
    if (disabled) {
      return;
    }
    
    if (!targetPath || !targetType) {
      return;
    }
    
    // Capture values before any state changes
    const path = targetPath;
    const type = targetType;
    
    // Call action first with captured values
    onAction(action, path, type);
    
    // Then close menu
    onClose();
  }, [onAction, onClose, targetPath, targetType]);
  
  // Memoize menu items
  const menuItems = useMemo(() => createMenuItems(canPaste), [canPaste]);
  
  // Filter items based on target type
  const visibleItems = useMemo(() => {
    return menuItems.filter(item => {
      if (item.show === 'both') return true;
      return item.show === targetType;
    });
  }, [menuItems, targetType]);
  
  if (!isOpen || !targetPath) return null;
  
  return (
    <div
      ref={menuRef}
      className={cn(
        'fixed z-50 min-w-[200px] py-1',
        'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]',
        'rounded-md shadow-lg font-mono text-[11px]',
        'animate-in fade-in-0 zoom-in-95 duration-100'
      )}
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label="File tree context menu"
    >
      {visibleItems.map((item, index) => (
        <React.Fragment key={`${item.action}-${index}`}>
          <button
            type="button"
            className={cn(
              'w-full flex items-center gap-2 px-3 py-1.5 text-left',
              'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]',
              'hover:text-[var(--color-text-primary)] transition-colors',
              'focus-visible:outline-none focus-visible:bg-[var(--color-surface-2)]',
              item.disabled && 'opacity-50 cursor-not-allowed hover:bg-transparent'
            )}
            onClick={() => handleItemClick(item.action, item.disabled)}
            disabled={item.disabled}
            role="menuitem"
          >
            <span className="text-[var(--color-text-dim)] shrink-0">
              {item.icon}
            </span>
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <span className="text-[9px] text-[var(--color-text-placeholder)] shrink-0 ml-4">
                {item.shortcut}
              </span>
            )}
          </button>
          {item.divider && (
            <div className="my-1 border-t border-[var(--color-border-subtle)]" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
