/**
 * FileTreeItem Component
 * 
 * Individual file/folder item in the tree with:
 * - Expand/collapse for directories
 * - File/folder icons with color coding
 * - Selection and multi-selection support
 * - Inline rename support
 * - Drag and drop support
 * - Git status decorations
 * - Keyboard navigation
 */

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { getFileIcon, getFolderIcon, getIconColorClass, getGitStatusColor } from '../utils/fileIcons';
import type { FileTreeNode, DragDropState } from '../types';

interface FileTreeItemProps {
  node: FileTreeNode;
  isExpanded: boolean;
  isSelected: boolean;
  isRenaming: boolean;
  isFocused: boolean;
  dragDrop: DragDropState;
  onToggleExpand: (path: string) => void;
  onSelect: (path: string, mode?: 'single' | 'toggle' | 'range') => void;
  onDoubleClick: (path: string, type: 'file' | 'directory') => void;
  onContextMenu: (e: React.MouseEvent, path: string, type: 'file' | 'directory') => void;
  onRename: (oldPath: string, newName: string) => Promise<boolean>;
  onCancelRename: () => void;
  onDragStart: (path: string, type: 'file' | 'directory') => void;
  onDragOver: (path: string) => void;
  onDragEnd: () => void;
  onDrop: (targetPath: string) => Promise<boolean>;
}

export const FileTreeItem: React.FC<FileTreeItemProps> = memo(({
  node,
  isExpanded,
  isSelected,
  isRenaming,
  isFocused,
  dragDrop,
  onToggleExpand,
  onSelect,
  onDoubleClick,
  onContextMenu,
  onRename,
  onCancelRename,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}) => {
  const [renameValue, setRenameValue] = useState(node.name);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRef = useRef<HTMLDivElement>(null);
  
  // Focus input when entering rename mode
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      // Select filename without extension
      const lastDot = node.name.lastIndexOf('.');
      if (lastDot > 0 && node.type === 'file') {
        inputRef.current.setSelectionRange(0, lastDot);
      } else {
        inputRef.current.select();
      }
    }
  }, [isRenaming, node.name, node.type]);
  
  // Reset rename value when node changes
  useEffect(() => {
    setRenameValue(node.name);
  }, [node.name]);
  
  // Scroll into view when focused
  useEffect(() => {
    if (isFocused && itemRef.current) {
      itemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isFocused]);
  
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Determine selection mode based on modifier keys
    let mode: 'single' | 'toggle' | 'range' = 'single';
    if (e.ctrlKey || e.metaKey) {
      mode = 'toggle';
    } else if (e.shiftKey) {
      mode = 'range';
    }
    
    onSelect(node.path, mode);
    
    // VS Code behavior: single click expands folders and opens files
    // (unless using modifier keys for multi-select)
    if (mode === 'single') {
      if (node.type === 'directory') {
        onToggleExpand(node.path);
      } else {
        onDoubleClick(node.path, node.type); // Opens the file
      }
    }
  }, [node.path, node.type, onSelect, onToggleExpand, onDoubleClick]);
  
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Double-click still works for opening files (redundant but expected)
    onDoubleClick(node.path, node.type);
  }, [node.path, node.type, onDoubleClick]);
  
  const handleChevronClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand(node.path);
  }, [node.path, onToggleExpand]);
  
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, node.path, node.type);
  }, [node.path, node.type, onContextMenu]);
  
  const handleRenameSubmit = useCallback(async () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== node.name) {
      const success = await onRename(node.path, trimmed);
      if (!success) {
        setRenameValue(node.name);
      }
    } else {
      onCancelRename();
    }
  }, [renameValue, node.name, node.path, onRename, onCancelRename]);
  
  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setRenameValue(node.name);
      onCancelRename();
    }
  }, [handleRenameSubmit, node.name, onCancelRename]);
  
  const handleRenameBlur = useCallback(() => {
    handleRenameSubmit();
  }, [handleRenameSubmit]);

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', node.path);
    onDragStart(node.path, node.type);
  }, [node.path, node.type, onDragStart]);
  
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only allow drop on directories or to reorder
    if (node.type === 'directory' || dragDrop.draggedType === 'file') {
      e.dataTransfer.dropEffect = 'move';
      setIsDragOver(true);
      onDragOver(node.path);
    }
  }, [node.type, node.path, dragDrop.draggedType, onDragOver]);
  
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);
  
  const handleDragEnd = useCallback(() => {
    setIsDragOver(false);
    onDragEnd();
  }, [onDragEnd]);
  
  const handleDropEvent = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    if (node.type === 'directory') {
      await onDrop(node.path);
    }
  }, [node.type, node.path, onDrop]);
  
  // Get appropriate icon
  const Icon = node.type === 'directory' 
    ? getFolderIcon(node.name, isExpanded)
    : getFileIcon(node.name);
  
  const iconColorClass = getIconColorClass(node.name, node.type);
  const gitStatusColor = node.gitStatus ? getGitStatusColor(node.gitStatus) : null;
  
  // Calculate indentation (16px per level + 4px base)
  const indent = node.depth * 16 + 4;
  
  // Check if this is a drop target
  const isDropTarget = isDragOver && node.type === 'directory' && dragDrop.draggedPath !== node.path;
  
  return (
    <div
      ref={itemRef}
      className={cn(
        'flex items-center h-[22px] cursor-pointer select-none group transition-colors',
        'hover:bg-[var(--color-surface-2)]/50',
        isSelected && 'bg-[var(--color-accent-primary)]/10',
        isSelected && 'hover:bg-[var(--color-accent-primary)]/15',
        isFocused && 'ring-1 ring-inset ring-[var(--color-accent-primary)]/40',
        node.isCut && 'opacity-50',
        isDropTarget && 'bg-[var(--color-accent-primary)]/20 ring-1 ring-[var(--color-accent-primary)]',
      )}
      style={{ paddingLeft: indent }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      draggable={!isRenaming}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDragEnd={handleDragEnd}
      onDrop={handleDropEvent}
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={node.type === 'directory' ? isExpanded : undefined}
      tabIndex={isFocused ? 0 : -1}
      data-path={node.path}
    >
      {/* Expand/Collapse chevron for directories */}
      <span 
        className={cn(
          'w-4 h-4 flex items-center justify-center shrink-0 transition-transform',
          node.type === 'file' && 'invisible'
        )}
        onClick={node.type === 'directory' ? handleChevronClick : undefined}
      >
        {node.type === 'directory' && (
          isExpanded 
            ? <ChevronDown size={12} className="text-[var(--color-text-dim)]" />
            : <ChevronRight size={12} className="text-[var(--color-text-dim)]" />
        )}
      </span>
      
      {/* File/Folder icon */}
      <span className={cn('w-[18px] h-[18px] flex items-center justify-center shrink-0 mr-1', iconColorClass)}>
        <Icon size={15} strokeWidth={1.75} />
      </span>
      
      {/* Name or rename input */}
      {isRenaming ? (
        <input
          ref={inputRef}
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={handleRenameKeyDown}
          onBlur={handleRenameBlur}
          className={cn(
            'flex-1 min-w-0 px-1 py-0 text-[11px] font-mono',
            'bg-[var(--color-surface-1)] border border-[var(--color-accent-primary)]',
            'text-[var(--color-text-primary)] outline-none rounded-sm'
          )}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span 
          className={cn(
            'flex-1 min-w-0 truncate text-[11px] font-mono',
            isSelected 
              ? 'text-[var(--color-accent-primary)]' 
              : 'text-[var(--color-text-secondary)]',
            'group-hover:text-[var(--color-text-primary)]',
            gitStatusColor
          )}
          title={node.path}
        >
          {node.name}
        </span>
      )}
      
      {/* Git status indicator */}
      {node.gitStatus && !isRenaming && (
        <span className={cn(
          'w-2 h-2 rounded-full mr-1 shrink-0',
          node.gitStatus === 'modified' && 'bg-[var(--color-warning)]',
          node.gitStatus === 'added' && 'bg-[var(--color-success)]',
          node.gitStatus === 'deleted' && 'bg-[var(--color-error)]',
          node.gitStatus === 'untracked' && 'bg-[var(--color-text-muted)]',
          node.gitStatus === 'staged' && 'bg-[var(--color-info)]',
        )} />
      )}
    </div>
  );
});

FileTreeItem.displayName = 'FileTreeItem';
