/**
 * FileTree Component
 * 
 * Main file tree container with VS Code-like functionality:
 * - Virtualized rendering for large workspace performance
 * - Multi-selection support
 * - Keyboard navigation
 * - Drag and drop
 * - Context menu
 * - Search/filter
 */

import React, { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { 
  RefreshCw, 
  FolderPlus, 
  FilePlus, 
  Eye, 
  EyeOff, 
  Search,
  ChevronsDownUp,
  FolderTree,
  Crosshair,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { createLogger } from '../../../utils/logger';
import { useFileTree } from '../useFileTree';
import { useFileTreeKeyboard } from '../hooks/useFileTreeKeyboard';
import { FileTreeItem } from './FileTreeItem';
import { FileTreeContextMenu } from './FileTreeContextMenu';
import { NewItemInput } from './NewItemInput';
import { FileTreeSearch } from './FileTreeSearch';
import { useConfirm } from '../../../components/ui/ConfirmModal';
import { VirtualizedList } from '../../../components/ui/VirtualizedList';
import type { ContextMenuAction, FileTreeNode } from '../types';

const logger = createLogger('FileTree');

interface FileTreeProps {
  workspacePath: string | null;
  collapsed?: boolean;
  onFileOpen?: (path: string) => void;
}

export const FileTree: React.FC<FileTreeProps> = ({ workspacePath, collapsed = false, onFileOpen }) => {
  const {
    nodes,
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
    navigateToFirst,
    navigateToLast,
    navigatePageUp,
    navigatePageDown,
    setFocusedPath,
  } = useFileTree({ workspacePath, onFileOpen });
  
  const { confirm, ConfirmDialog } = useConfirm();

  // Count total files for search match indicator
  const totalFileCount = useMemo(() => {
    function countNodes(items: FileTreeNode[]): number {
      let count = 0;
      for (const n of items) {
        count++;
        if (n.children) count += countNodes(n.children);
      }
      return count;
    }
    return countNodes(nodes);
  }, [nodes]);
  
  const [newItemState, setNewItemState] = useState<{
    type: 'file' | 'folder';
    parentPath: string;
  } | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Handle open — supports preview mode for single-click, full open for double-click
  const handleOpen = useCallback((path: string, type: 'file' | 'directory', preview = false) => {
    if (type === 'directory') {
      toggleExpand(path);
    } else {
      // Dispatch open event with preview flag
      document.dispatchEvent(new CustomEvent('vyotiq:open-file', {
        detail: { filePath: path, preview },
      }));
    }
  }, [toggleExpand]);
  
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

      case 'duplicate': {
        // Duplicate file: copy in-place with " copy" suffix
        void (async () => {
          try {
            const fileName = targetPath.split('/').pop() ?? '';
            const parentDir = targetPath.substring(0, targetPath.lastIndexOf('/'));
            const dotIdx = fileName.lastIndexOf('.');
            const baseName = dotIdx > 0 ? fileName.substring(0, dotIdx) : fileName;
            const ext = dotIdx > 0 ? fileName.substring(dotIdx) : '';

            // Find a non-conflicting name
            let suffix = 1;
            let newName = `${baseName} copy${ext}`;
            let newPath = `${parentDir}/${newName}`;
            while (true) {
              try {
                const exists = await window.vyotiq?.files?.stat?.(newPath);
                if (!exists?.success) break;
                suffix++;
                newName = `${baseName} copy ${suffix}${ext}`;
                newPath = `${parentDir}/${newName}`;
              } catch {
                break;
              }
            }

            // Read and write for files
            if (targetType === 'file') {
              const readRes = await window.vyotiq?.files?.read?.(targetPath);
              if (readRes?.success && readRes.content !== undefined) {
                await window.vyotiq?.files?.write?.(newPath, readRes.content);
              }
            } else {
              // For directories, just create a new empty folder
              await window.vyotiq?.files?.mkdir?.(newPath);
            }
            void refresh();
          } catch (err) {
            logger.warn('Failed to duplicate item', { targetPath, error: err instanceof Error ? err.message : String(err) });
          }
        })();
        break;
      }
        
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
        // Open the integrated terminal at the target directory
        const terminalDir = targetType === 'directory' ? targetPath : targetPath.substring(0, targetPath.lastIndexOf('/'));
        void (async () => {
          try {
            // Spawn a new terminal session with the cwd set to the target directory
            const result = await window.vyotiq?.terminal?.spawn?.({ id: `filetree-${Date.now()}`, cwd: terminalDir });
            if (!result?.success) {
              logger.warn('Terminal spawn returned error, falling back to explorer', { terminalDir, error: result?.error });
              revealInExplorer(terminalDir);
            }
          } catch (err) {
            logger.warn('Failed to open terminal at directory, falling back to explorer', { terminalDir, error: err instanceof Error ? err.message : String(err) });
            revealInExplorer(terminalDir);
          }
        })();
        break;
      }
      
      case 'openInEditor': {
        // Dispatch global event for editor to pick up
        document.dispatchEvent(new CustomEvent('vyotiq:open-file', {
          detail: { filePath: targetPath },
        }));
        break;
      }

      case 'openDiff': {
        // Open file in diff view mode
        document.dispatchEvent(new CustomEvent('vyotiq:open-file-diff', {
          detail: { filePath: targetPath },
        }));
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

  // Keyboard navigation — delegated to useFileTreeKeyboard hook
  const handleSelect = useCallback(() => {
    if (focusedPath) {
      const node = flatNodes.find(n => n.path === focusedPath);
      if (node) {
        if (node.type === 'directory') {
          toggleExpand(node.path);
        } else {
          handleOpen(node.path, 'file', false);
        }
      }
    }
  }, [focusedPath, flatNodes, toggleExpand, handleOpen]);

  const handleToggleSelect = useCallback(() => {
    if (focusedPath) {
      selectPath(focusedPath, 'toggle');
    }
  }, [focusedPath, selectPath]);

  const handleRename = useCallback(() => {
    if (focusedPath) {
      startRenaming(focusedPath);
    }
  }, [focusedPath, startRenaming]);

  const handleDelete = useCallback(() => {
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
  }, [focusedPath, flatNodes, deleteItem, preferences.confirmDelete, confirm]);

  const handleCopy = useCallback(() => {
    copy();
  }, [copy]);

  const handleCut = useCallback(() => {
    cut();
  }, [cut]);

  const handlePaste = useCallback(() => {
    if (canPaste() && focusedPath) {
      paste(focusedPath);
    }
  }, [canPaste, focusedPath, paste]);

  const handleSearch = useCallback(() => {
    setShowSearch(true);
  }, []);

  const handleEscape = useCallback(() => {
    if (showSearch) {
      clearSearch();
      setShowSearch(false);
    }
  }, [showSearch, clearSearch]);

  const handleSelectAll = useCallback(() => {
    flatNodes.forEach(node => selectPath(node.path, 'toggle'));
  }, [flatNodes, selectPath]);

  useFileTreeKeyboard({
    containerRef,
    isEnabled: flatNodes.length > 0 && !renamingPath && !newItemState,
    onNavigateUp: navigateUp,
    onNavigateDown: navigateDown,
    onNavigateInto: navigateInto,
    onNavigateOut: navigateOut,
    onSelect: handleSelect,
    onToggleSelect: handleToggleSelect,
    onRename: handleRename,
    onDelete: handleDelete,
    onCopy: handleCopy,
    onCut: handleCut,
    onPaste: handlePaste,
    onSearch: handleSearch,
    onEscape: handleEscape,
    onSelectAll: handleSelectAll,
    onHome: navigateToFirst,
    onEnd: navigateToLast,
    onPageUp: navigatePageUp,
    onPageDown: navigatePageDown,
  });
  
  // Focus container when clicking empty area
  const handleContainerClick = useCallback(() => {
    containerRef.current?.focus();
  }, []);
  
  // Reveal active file in tree (scroll + expand + focus)
  const revealActiveFile = useCallback(() => {
    document.dispatchEvent(new CustomEvent('vyotiq:reveal-active-file'));
  }, []);

  // Listen for reveal-in-tree events (dispatched by MainLayout after resolving active file)
  useEffect(() => {
    const handleRevealInTree = (e: Event) => {
      const detail = (e as CustomEvent<{ filePath: string }>).detail;
      if (!detail?.filePath) return;

      // Expand all ancestor directories
      const pathParts = detail.filePath.replace(/\\/g, '/').split('/');
      for (let i = 1; i < pathParts.length; i++) {
        const ancestorPath = pathParts.slice(0, i).join('/');
        expandPath(ancestorPath);
      }

      // Focus and select the target file
      setTimeout(() => {
        setFocusedPath(detail.filePath);
        selectPath(detail.filePath);
      }, 50);
    };
    document.addEventListener('vyotiq:reveal-in-tree', handleRevealInTree);
    return () => document.removeEventListener('vyotiq:reveal-in-tree', handleRevealInTree);
  }, [expandPath, setFocusedPath, selectPath]);

  // Initialize focus on first item
  useEffect(() => {
    if (flatNodes.length > 0 && !focusedPath) {
      setFocusedPath(flatNodes[0].path);
    }
  }, [flatNodes, focusedPath, setFocusedPath]);
  
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
            <ChevronsDownUp size={12} />
          </button>
          <button
            onClick={revealActiveFile}
            className="p-1 text-[var(--color-text-dim)] hover:text-[var(--color-accent-primary)] transition-colors rounded-sm"
            title="Reveal Active File in Explorer"
          >
            <Crosshair size={12} />
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
          matchCount={searchQuery ? flatNodes.length : undefined}
          totalCount={searchQuery ? totalFileCount : undefined}
        />
      )}
      
      {/* Error message */}
      {error && (
        <div className="px-2 py-1 text-[10px] text-[var(--color-error)] bg-[var(--color-error)]/10">
          {error}
        </div>
      )}
      
      {/* File tree - virtualized for large workspace performance */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden focus:outline-none"
        onContextMenu={handleRootContextMenu}
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
          <FileTreeVirtualized
            flatNodes={flatNodes}
            workspacePath={workspacePath}
            newItemState={newItemState}
            dragDrop={dragDrop}
            containerRef={containerRef}
            toggleExpand={toggleExpand}
            selectPath={selectPath}
            handleOpen={handleOpen}
            handleContextMenu={handleContextMenu}
            rename={rename}
            cancelRenaming={cancelRenaming}
            startDrag={startDrag}
            updateDropTarget={updateDropTarget}
            endDrag={endDrag}
            handleDrop={handleDrop}
            handleNewItemSubmit={handleNewItemSubmit}
            handleNewItemCancel={handleNewItemCancel}
          />
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

// =============================================================================
// Virtualized File Tree - renders only visible items for large workspaces
// =============================================================================

const ITEM_HEIGHT = 22; // Each file tree row is 22px

interface FileTreeVirtualizedProps {
  flatNodes: FileTreeNode[];
  workspacePath: string | null;
  newItemState: { type: 'file' | 'folder'; parentPath: string } | null;
  dragDrop: import('../types').DragDropState;
  containerRef: React.RefObject<HTMLDivElement | null>;
  toggleExpand: (path: string) => void;
  selectPath: (path: string, mode?: 'single' | 'toggle' | 'range') => void;
  handleOpen: (path: string, type: 'file' | 'directory', preview?: boolean) => void;
  handleContextMenu: (e: React.MouseEvent, path: string, type: 'file' | 'directory') => void;
  rename: (oldPath: string, newName: string) => Promise<boolean>;
  cancelRenaming: () => void;
  startDrag: (path: string, type: 'file' | 'directory') => void;
  updateDropTarget: (path: string | null, position: 'before' | 'inside' | 'after' | null) => void;
  endDrag: () => void;
  handleDrop: (targetPath: string) => Promise<boolean>;
  handleNewItemSubmit: (name: string) => Promise<void>;
  handleNewItemCancel: () => void;
}

const FileTreeVirtualized: React.FC<FileTreeVirtualizedProps> = React.memo(({
  flatNodes,
  workspacePath,
  newItemState,
  dragDrop,
  containerRef,
  toggleExpand,
  selectPath,
  handleOpen,
  handleContextMenu,
  rename,
  cancelRenaming,
  startDrag,
  updateDropTarget,
  endDrag,
  handleDrop,
  handleNewItemSubmit,
  handleNewItemCancel,
}) => {
  // Compute container height from the actual ref
  const [containerHeight, setContainerHeight] = useState(400);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(container);
    setContainerHeight(container.clientHeight || 400);

    return () => observer.disconnect();
  }, [containerRef]);

  // Stable drag-over callback
  const handleDragOver = useCallback(
    (nodePath: string) => updateDropTarget(nodePath, 'inside'),
    [updateDropTarget]
  );

  // Build augmented nodes with new-item inserts for rendering
  const renderNodes = useMemo(() => {
    if (!newItemState) return flatNodes;

    // Insert new-item placeholder after the parent node or at root
    const result: (FileTreeNode | { isNewItem: true; type: 'file' | 'folder'; parentPath: string; depth: number })[] = [];

    if (newItemState.parentPath === workspacePath) {
      result.push({ isNewItem: true, type: newItemState.type, parentPath: newItemState.parentPath, depth: 0 });
    }

    for (const node of flatNodes) {
      result.push(node);
      if (
        newItemState.parentPath === node.path &&
        node.type === 'directory' &&
        node.isExpanded
      ) {
        result.push({ isNewItem: true, type: newItemState.type, parentPath: newItemState.parentPath, depth: node.depth + 1 });
      }
    }

    return result;
  }, [flatNodes, newItemState, workspacePath]);

  const getKey = useCallback(
    (item: FileTreeNode | { isNewItem: true; type: string; parentPath: string; depth: number }) =>
      'isNewItem' in item ? `new-${item.parentPath}` : item.id,
    []
  );

  const renderTreeItem = useCallback(
    (item: FileTreeNode | { isNewItem: true; type: 'file' | 'folder'; parentPath: string; depth: number }) => {
      if ('isNewItem' in item) {
        return (
          <NewItemInput
            type={item.type}
            depth={item.depth}
            onSubmit={handleNewItemSubmit}
            onCancel={handleNewItemCancel}
          />
        );
      }

      return (
        <FileTreeItem
          node={item}
          isExpanded={item.isExpanded || false}
          isSelected={item.isSelected || false}
          isRenaming={item.isRenaming || false}
          isFocused={item.isFocused || false}
          dragDrop={dragDrop}
          onToggleExpand={toggleExpand}
          onSelect={selectPath}
          onOpen={handleOpen}
          onContextMenu={handleContextMenu}
          onRename={rename}
          onCancelRename={cancelRenaming}
          onDragStart={startDrag}
          onDragOver={handleDragOver}
          onDragEnd={endDrag}
          onDrop={handleDrop}
        />
      );
    },
    [dragDrop, toggleExpand, selectPath, handleOpen, handleContextMenu, rename, cancelRenaming, startDrag, handleDragOver, endDrag, handleDrop, handleNewItemSubmit, handleNewItemCancel]
  );

  return (
    <VirtualizedList
      items={renderNodes}
      itemHeight={ITEM_HEIGHT}
      containerHeight={containerHeight}
      renderItem={renderTreeItem}
      overscan={10}
      getKey={getKey}
      className="scrollbar-thin"
    />
  );
});

FileTreeVirtualized.displayName = 'FileTreeVirtualized';
