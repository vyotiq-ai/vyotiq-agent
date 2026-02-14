/**
 * FileTreeContextMenu Component
 * 
 * Right-click context menu for file tree items with terminal-style aesthetics.
 */

import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
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
  FileCode2,
  GitCompareArrows,
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
  danger?: boolean;
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
  { action: 'openInEditor', label: 'open in editor', icon: <FileCode2 size={12} />, show: 'file' },
  { action: 'openDiff', label: 'open diff', icon: <GitCompareArrows size={12} />, show: 'file', divider: true },
  { action: 'newFile', label: 'new file', icon: <FilePlus size={12} />, show: 'directory' },
  { action: 'newFolder', label: 'new folder', icon: <FolderPlus size={12} />, show: 'directory', divider: true },
  { action: 'newFile', label: 'new file', icon: <FilePlus size={12} />, show: 'file' },
  { action: 'newFolder', label: 'new folder', icon: <FolderPlus size={12} />, show: 'file', divider: true },
  { action: 'cut', label: 'cut', icon: <Scissors size={12} />, shortcut: 'Ctrl+X', show: 'both' },
  { action: 'copy', label: 'copy', icon: <Copy size={12} />, shortcut: 'Ctrl+C', show: 'both' },
  { action: 'paste', label: 'paste', icon: <Clipboard size={12} />, shortcut: 'Ctrl+V', show: 'both', disabled: !canPaste, divider: true },
  { action: 'rename', label: 'rename', icon: <Pencil size={12} />, shortcut: 'F2', show: 'both' },
  { action: 'delete', label: 'delete', icon: <Trash2 size={12} />, shortcut: 'Del', show: 'both', divider: true, danger: true },
  { action: 'copyPath', label: 'copy path', icon: <Copy size={12} />, shortcut: 'Shift+C', show: 'both' },
  { action: 'copyRelativePath', label: 'copy relative path', icon: <ClipboardCopy size={12} />, show: 'both', divider: true },
  { action: 'revealInExplorer', label: 'reveal in explorer', icon: <FolderOpen size={12} />, show: 'both' },
  { action: 'openInTerminal', label: 'open in terminal', icon: <Terminal size={12} />, show: 'directory' },
  { action: 'findInFolder', label: 'find in folder', icon: <Search size={12} />, show: 'directory', divider: true },
  { action: 'refresh', label: 'refresh', icon: <RefreshCw size={12} />, show: 'both' },
  { action: 'collapseAll', label: 'collapse all', icon: <ChevronsDownUp size={12} />, show: 'directory' },
  { action: 'expandAll', label: 'expand all', icon: <ChevronsUpDown size={12} />, show: 'directory' },
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
  
  const handleItemClick = useCallback((action: ContextMenuAction, disabled?: boolean) => {
    if (disabled) return;
    if (!targetPath || !targetType) return;
    
    const path = targetPath;
    const type = targetType;
    
    onAction(action, path, type);
    onClose();
  }, [onAction, onClose, targetPath, targetType]);
  
  const menuItems = useMemo(() => createMenuItems(canPaste), [canPaste]);
  
  const visibleItems = useMemo(() => {
    return menuItems.filter(item => {
      if (item.show === 'both') return true;
      return item.show === targetType;
    });
  }, [menuItems, targetType]);
  
  if (!isOpen || !targetPath) return null;
  
  const fileName = targetPath.split(/[/\\]/).pop() || targetPath;
  
  return (
    <div
      ref={menuRef}
      className={cn(
        'fixed z-50 min-w-[180px] max-w-[280px] max-h-[70vh] overflow-y-auto',
        'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]/60',
        'rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.25)] font-mono text-[11px]',
        'animate-in fade-in-0 slide-in-from-top-1 duration-100',
        'scrollbar-thin scrollbar-thumb-[var(--color-border-subtle)] scrollbar-track-transparent'
      )}
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label="File tree context menu"
    >
      {/* Header */}
      <div className="sticky top-0 px-2.5 py-1.5 bg-[var(--color-surface-1)] border-b border-[var(--color-border-subtle)]/30 rounded-t-lg">
        <div className="flex items-center gap-1.5">
          <span className="text-[var(--color-text-muted)] text-[9px] uppercase tracking-wide">
            {targetType === 'directory' ? 'folder' : 'file'}
          </span>
        </div>
        <div className="text-[var(--color-text-primary)] truncate text-[10px] mt-0.5 max-w-[240px]" title={targetPath}>
          {fileName}
        </div>
      </div>
      
      <div className="py-1">
        {visibleItems.map((item, index) => (
          <React.Fragment key={`${item.action}-${index}`}>
            <button
              type="button"
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors duration-75',
                'focus-visible:outline-none focus-visible:bg-[var(--color-surface-2)]',
                item.disabled 
                  ? 'text-[var(--color-text-dim)] cursor-not-allowed' 
                  : item.danger
                    ? 'text-[var(--color-text-secondary)] hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]',
                hoveredIndex === index && !item.disabled && !item.danger && 'bg-[var(--color-surface-2)] text-[var(--color-text-primary)]',
                hoveredIndex === index && !item.disabled && item.danger && 'bg-[var(--color-error)]/10 text-[var(--color-error)]'
              )}
              onClick={() => handleItemClick(item.action, item.disabled)}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              disabled={item.disabled}
              role="menuitem"
            >
              <span className={cn(
                'shrink-0 transition-colors duration-75',
                item.disabled 
                  ? 'text-[var(--color-text-dim)]' 
                  : item.danger && hoveredIndex === index
                    ? 'text-[var(--color-error)]'
                    : 'text-[var(--color-text-muted)]'
              )}>
                {item.icon}
              </span>
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
};
