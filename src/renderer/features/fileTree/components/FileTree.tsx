/**
 * FileTree Component
 * 
 * Main file tree container with VS Code-like functionality:
 * - Virtualized rendering for performance
 * - Multi-selection support
 * - Keyboard navigation
 * - Drag and drop
 * - Context menu
 * - Search/filter
 */

import React, { useCallback, useState, useRef, useEffect } from 'react';
import { 
  RefreshCw, 
  FolderPlus, 
  FilePlus, 
  Eye, 
  EyeOff, 
  Search,
  ChevronRight,
  FolderTree,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { useFileTree } from '../useFileTree';
import { FileTreeItem } from './FileTreeItem';
import { FileTreeContextMenu } from './FileTreeContextMenu';
import { NewItemInput } from './NewItemInput';
import { FileTreeSearch } from './FileTreeSearch';
import { useConfirm } from '../../../components/ui/ConfirmModal';
import type { ContextMenuAction } from '../types';

interface FileTreeProps {
  workspacePath: string | null;
  collapsed?: boolean;
  onFileOpen?: (path: string) => void;
}

export const FileTree: React.FC<FileTreeProps> = ({ workspacePath, collapsed = false, onFileOpen }) => {
  const {
    flatNodes,
    isLoading,
    error,
    preferences,
    contextMenu,
    renamingPath,
    searchQuery,
    dragDrop,
    focusedPath,
    refresh,
    toggleExpand,
    expandPath,
    selectPath,
    createFile,
    createFolder,
    rename,
    deleteItem,
    copyPath,
    revealInExplorer,
    openFile,
    cut,
    copy,
    paste,
    canPaste,
    startDrag,
    updateDropTarget,
    endDrag,
    handleDrop,
    openContextMenu,
    closeContextMenu,
    startRenaming,
    cancelRenaming,
    toggleHiddenFiles,
    toggleCompactFolders,
    collapseAll,
    expandAll,
    setSearchQuery,
    clearSearch,
    navigateUp,
    navigateDown,
    navigateInto,
    navigateOut,
    setFocusedPath,
  } = useFileTree({ workspacePath, onFileOpen });
  
  const { confirm, ConfirmDialog } = useConfirm();
  
  const [newItemState, setNewItemState] = useState<{
    type: 'file' | 'folder';
    parentPath: string;
  } | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Handle double click - expand folder or open file
  const handleDoubleClick = useCallback((path: string, type: 'file' | 'directory') => {
    if (type === 'directory') {
      toggleExpand(path);
    } else {
      openFile(path);
    }
  }, [toggleExpand, openFile]);
  
  // Handle context menu open
  const handleContextMenu = useCallback((e: React.MouseEvent, path: string, type: 'file' | 'directory') => {
    openContextMenu(e.clientX, e.clientY, path, type);
    selectPath(path);
  }, [openContextMenu, selectPath]);

  // Handle context menu action
  const handleContextMenuAction = useCallback((action: ContextMenuAction, targetPath: string, targetType: 'file' | 'directory') => {
    switch (action) {
      case 'newFile': {
        const fileParent = targetType === 'directory' ? targetPath : targetPath.substring(0, targetPath.lastIndexOf('/'));
        expandPath(fileParent);
        setNewItemState({ type: 'file', parentPath: fileParent });
        break;
      }
        
      case 'newFolder': {
        const folderParent = targetType === 'directory' ? targetPath : targetPath.substring(0, targetPath.lastIndexOf('/'));
        expandPath(folderParent);
        setNewItemState({ type: 'folder', parentPath: folderParent });
        break;
      }
        
      case 'rename':
        startRenaming(targetPath);
        break;
        
      case 'delete':
        if (!preferences.confirmDelete) {
          void deleteItem(targetPath);
        } else {
          void (async () => {
            const confirmed = await confirm({
              title: 'Delete Item',
              message: `Are you sure you want to delete "${targetPath.split('/').pop()}"?`,
              confirmLabel: 'Delete',
              variant: 'destructive',
            });
            if (confirmed) {
              void deleteItem(targetPath);
            }
          })();
        }
        break;
        
      case 'cut':
        cut([targetPath]);
        break;
        
      case 'copy':
        copy([targetPath]);
        break;
        
      case 'paste':
        if (canPaste()) {
          void paste(targetPath);
        }
        break;
        
      case 'copyPath':
        copyPath(targetPath, false);
        break;
        
      case 'copyRelativePath':
        copyPath(targetPath, true);
        break;
        
      case 'revealInExplorer':
        revealInExplorer(targetPath);
        break;
        
      case 'openInTerminal': {
        // Reveal in system file explorer which can then open terminal
        const terminalDir = targetType === 'directory' ? targetPath : targetPath.substring(0, targetPath.lastIndexOf('/'));
        revealInExplorer(terminalDir);
        break;
      }
        
      case 'findInFolder': {
        // Open search with folder filter
        setShowSearch(true);
        break;
      }
        
      case 'refresh':
        void refresh();
        break;
        
      case 'collapseAll':
        collapseAll();
        break;
        
      case 'expandAll':
        expandAll();
        break;
    }
  }, [expandPath, startRenaming, deleteItem, cut, copy, paste, canPaste, copyPath, revealInExplorer, refresh, collapseAll, expandAll, preferences.confirmDelete, confirm]);
  
  // Handle new item creation
  const handleNewItemSubmit = useCallback(async (name: string) => {
    if (!newItemState) return;
    
    const success = newItemState.type === 'file'
      ? await createFile(newItemState.parentPath, name)
      : await createFolder(newItemState.parentPath, name);
    
    if (success) {
      setNewItemState(null);
    }
  }, [newItemState, createFile, createFolder]);
  
  const handleNewItemCancel = useCallback(() => {
    setNewItemState(null);
  }, []);
  
  // Handle root context menu (empty area)
  const handleRootContextMenu = useCallback((e: React.MouseEvent) => {
    if (!workspacePath) return;
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, workspacePath, 'directory');
  }, [workspacePath, openContextMenu]);
  
  // Toolbar actions
  const handleNewFile = useCallback(() => {
    if (!workspacePath) return;
    setNewItemState({ type: 'file', parentPath: workspacePath });
  }, [workspacePath]);
  
  const handleNewFolder = useCallback(() => {
    if (!workspacePath) return;
    setNewItemState({ type: 'folder', parentPath: workspacePath });
  }, [workspacePath]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (flatNodes.length === 0 || renamingPath || newItemState) return;
    
    // Handle keyboard shortcuts
    const isMac = navigator.platform.toLowerCase().includes('mac');
    const modKey = isMac ? e.metaKey : e.ctrlKey;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        navigateDown();
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        navigateUp();
        break;
        
      case 'ArrowRight':
        e.preventDefault();
        navigateInto();
        break;
        
      case 'ArrowLeft':
        e.preventDefault();
        navigateOut();
        break;
        
      case 'Enter':
        e.preventDefault();
        if (focusedPath) {
          const node = flatNodes.find(n => n.path === focusedPath);
          if (node) {
            if (node.type === 'directory') {
              toggleExpand(node.path);
            } else {
              openFile(node.path);
            }
          }
        }
        break;
        
      case 'F2':
        e.preventDefault();
        if (focusedPath) {
          startRenaming(focusedPath);
        }
        break;
        
      case 'Delete':
      case 'Backspace':
        if (!modKey) {
          e.preventDefault();
          if (focusedPath) {
            const node = flatNodes.find(n => n.path === focusedPath);
            if (node) {
              if (!preferences.confirmDelete) {
                deleteItem(focusedPath);
              } else {
                void (async () => {
                  const confirmed = await confirm({
                    title: 'Delete Item',
                    message: `Are you sure you want to delete "${node.name}"?`,
                    confirmLabel: 'Delete',
                    variant: 'destructive',
                  });
                  if (confirmed) {
                    deleteItem(focusedPath);
                  }
                })();
              }
            }
          }
        }
        break;
        
      case ' ':
        e.preventDefault();
        if (focusedPath) {
          selectPath(focusedPath, 'toggle');
        }
        break;
        
      case 'a':
        if (modKey) {
          e.preventDefault();
          // Select all visible nodes
          flatNodes.forEach(node => selectPath(node.path, 'toggle'));
        }
        break;
        
      case 'c':
        if (modKey) {
          e.preventDefault();
          copy();
        }
        break;
        
      case 'x':
        if (modKey) {
          e.preventDefault();
          cut();
        }
        break;
        
      case 'v':
        if (modKey && canPaste() && focusedPath) {
          e.preventDefault();
          paste(focusedPath);
        }
        break;
        
      case 'f':
        if (modKey) {
          e.preventDefault();
          setShowSearch(true);
        }
        break;
        
      case 'Escape':
        if (showSearch) {
          clearSearch();
          setShowSearch(false);
        }
        break;
    }
  }, [flatNodes, renamingPath, newItemState, focusedPath, navigateDown, navigateUp, navigateInto, navigateOut, toggleExpand, openFile, startRenaming, deleteItem, selectPath, copy, cut, paste, canPaste, showSearch, clearSearch, preferences.confirmDelete, confirm]);
  
  // Focus container when clicking empty area
  const handleContainerClick = useCallback(() => {
    containerRef.current?.focus();
  }, []);
  
  // Initialize focus on first item
  useEffect(() => {
    if (flatNodes.length > 0 && !focusedPath) {
      setFocusedPath(flatNodes[0].path);
    }
  }, [flatNodes, focusedPath, setFocusedPath]);
  
  if (collapsed) return null;
  
  if (!workspacePath) {
    return (
      <div className="px-2 py-3 text-[10px] text-[var(--color-text-dim)] font-mono">
        <span className="text-[var(--color-text-placeholder)]"># no workspace</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full font-mono">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewFile}
            className="p-1 text-[var(--color-text-dim)] hover:text-[var(--color-accent-primary)] transition-colors rounded-sm"
            title="New File (Ctrl+N)"
          >
            <FilePlus size={12} />
          </button>
          <button
            onClick={handleNewFolder}
            className="p-1 text-[var(--color-text-dim)] hover:text-[var(--color-accent-primary)] transition-colors rounded-sm"
            title="New Folder"
          >
            <FolderPlus size={12} />
          </button>
          <button
            onClick={refresh}
            disabled={isLoading}
            className="p-1 text-[var(--color-text-dim)] hover:text-[var(--color-accent-primary)] transition-colors rounded-sm disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={collapseAll}
            className="p-1 text-[var(--color-text-dim)] hover:text-[var(--color-accent-primary)] transition-colors rounded-sm"
            title="Collapse All"
          >
            <ChevronRight size={12} />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={cn(
              'p-1 transition-colors rounded-sm',
              showSearch || searchQuery
                ? 'text-[var(--color-accent-primary)]' 
                : 'text-[var(--color-text-dim)] hover:text-[var(--color-accent-primary)]'
            )}
            title="Search Files (Ctrl+F)"
          >
            <Search size={12} />
          </button>
          <button
            onClick={toggleCompactFolders}
            className={cn(
              'p-1 transition-colors rounded-sm',
              preferences.compactFolders 
                ? 'text-[var(--color-accent-primary)]' 
                : 'text-[var(--color-text-dim)] hover:text-[var(--color-accent-primary)]'
            )}
            title={preferences.compactFolders ? 'Disable Compact Folders' : 'Enable Compact Folders'}
          >
            <FolderTree size={12} />
          </button>
          <button
            onClick={toggleHiddenFiles}
            className={cn(
              'p-1 transition-colors rounded-sm',
              preferences.showHiddenFiles 
                ? 'text-[var(--color-accent-primary)]' 
                : 'text-[var(--color-text-dim)] hover:text-[var(--color-accent-primary)]'
            )}
            title={preferences.showHiddenFiles ? 'Hide Hidden Files' : 'Show Hidden Files'}
          >
            {preferences.showHiddenFiles ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
        </div>
      </div>
      
      {/* Search input */}
      {showSearch && (
        <FileTreeSearch
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => {
            clearSearch();
            setShowSearch(false);
          }}
        />
      )}
      
      {/* Error message */}
      {error && (
        <div className="px-2 py-1 text-[10px] text-[var(--color-error)] bg-[var(--color-error)]/10">
          {error}
        </div>
      )}
      
      {/* File tree */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin focus:outline-none"
        onContextMenu={handleRootContextMenu}
        onKeyDown={handleKeyDown}
        onClick={handleContainerClick}
        tabIndex={0}
        role="tree"
        aria-label="File explorer"
      >
        {isLoading && flatNodes.length === 0 ? (
          <div className="flex items-center justify-center py-4">
            <RefreshCw size={14} className="animate-spin text-[var(--color-text-dim)]" />
          </div>
        ) : flatNodes.length === 0 ? (
          <div className="px-2 py-3 text-[10px] text-[var(--color-text-dim)]">
            <span className="text-[var(--color-text-placeholder)]"># empty directory</span>
          </div>
        ) : (
          <>
            {/* New item input at root level */}
            {newItemState && newItemState.parentPath === workspacePath && (
              <NewItemInput
                type={newItemState.type}
                depth={0}
                onSubmit={handleNewItemSubmit}
                onCancel={handleNewItemCancel}
              />
            )}
            
            {flatNodes.map((node) => (
              <React.Fragment key={node.id}>
                <FileTreeItem
                  node={node}
                  isExpanded={node.isExpanded || false}
                  isSelected={node.isSelected || false}
                  isRenaming={node.isRenaming || false}
                  isFocused={node.isFocused || false}
                  dragDrop={dragDrop}
                  onToggleExpand={toggleExpand}
                  onSelect={selectPath}
                  onDoubleClick={handleDoubleClick}
                  onContextMenu={handleContextMenu}
                  onRename={rename}
                  onCancelRename={cancelRenaming}
                  onDragStart={startDrag}
                  onDragOver={(path) => updateDropTarget(path, 'inside')}
                  onDragEnd={endDrag}
                  onDrop={handleDrop}
                />
                
                {/* New item input inside expanded folder */}
                {newItemState && 
                 newItemState.parentPath === node.path && 
                 node.type === 'directory' && 
                 node.isExpanded && (
                  <NewItemInput
                    type={newItemState.type}
                    depth={node.depth + 1}
                    onSubmit={handleNewItemSubmit}
                    onCancel={handleNewItemCancel}
                  />
                )}
              </React.Fragment>
            ))}
          </>
        )}
      </div>
      
      {/* Context menu */}
      <FileTreeContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        targetPath={contextMenu.targetPath}
        targetType={contextMenu.targetType}
        canPaste={canPaste()}
        onAction={handleContextMenuAction}
        onClose={closeContextMenu}
      />
      <ConfirmDialog />
    </div>
  );
};
