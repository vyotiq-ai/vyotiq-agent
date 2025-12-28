/**
 * File Tree Feature
 * 
 * VS Code-style file tree explorer for the sidebar.
 * Provides file/folder browsing, creation, renaming, deletion,
 * and other file management operations.
 */

// Components
export { 
  FileTree, 
  FileTreeItem, 
  FileTreeContextMenu,
  FileTreeSearch,
  NewItemInput,
  SidebarFileTree 
} from './components';

// Hooks
export { useFileTree } from './useFileTree';
export type { UseFileTreeOptions, UseFileTreeReturn } from './useFileTree';
export { useFileTreeKeyboard } from './hooks';

// Types
export type {
  FileTreeNode,
  FileTreeState,
  ContextMenuAction,
  ContextMenuItem,
  ContextMenuPosition,
  ContextMenuState,
  FileTreePreferences,
  SortOption,
  SortDirection,
  DragDropState,
  ClipboardState,
  GitFileStatus,
  FileTreeEventHandlers,
} from './types';

// Utils
export { getFileIcon, getFolderIcon, getIconColorClass, getGitStatusColor } from './utils/fileIcons';
