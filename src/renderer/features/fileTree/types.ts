/**
 * File Tree Types
 * 
 * Type definitions for the VS Code-style file tree feature.
 */

/** Git status for a file */
export type GitFileStatus = 
  | 'modified' 
  | 'added' 
  | 'deleted' 
  | 'renamed' 
  | 'untracked' 
  | 'ignored' 
  | 'conflicted'
  | 'staged'
  | null;

/** File tree node representing a file or directory */
export interface FileTreeNode {
  /** Unique identifier (full path) */
  id: string;
  /** File or directory name */
  name: string;
  /** Full path to the file/directory */
  path: string;
  /** Node type */
  type: 'file' | 'directory';
  /** Child nodes (for directories) */
  children?: FileTreeNode[];
  /** Whether directory is expanded */
  isExpanded?: boolean;
  /** Whether node is selected */
  isSelected?: boolean;
  /** Whether node is being renamed */
  isRenaming?: boolean;
  /** Whether node is being cut (for cut/paste visual) */
  isCut?: boolean;
  /** Whether node is focused (keyboard navigation) */
  isFocused?: boolean;
  /** File extension (for files) */
  extension?: string;
  /** Depth level in tree */
  depth: number;
  /** Git status for decorations */
  gitStatus?: GitFileStatus;
  /** Whether this is a compact folder path (e.g., "src/components") */
  isCompact?: boolean;
  /** Original children before compacting (for expand) */
  compactChildren?: FileTreeNode[];
}

/** File tree state */
export interface FileTreeState {
  /** Root nodes of the tree */
  nodes: FileTreeNode[];
  /** Set of expanded directory paths */
  expandedPaths: Set<string>;
  /** Currently selected path(s) */
  selectedPaths: Set<string>;
  /** Path being renamed */
  renamingPath: string | null;
  /** Path being cut (for cut/paste) */
  cutPath: string | null;
  /** Path being copied (for copy/paste) */
  copiedPath: string | null;
  /** Search/filter query */
  searchQuery: string;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Last selected path for shift-click range selection */
  lastSelectedPath: string | null;
  /** Focused path for keyboard navigation */
  focusedPath: string | null;
}

/** Context menu action types */
export type ContextMenuAction =
  | 'newFile'
  | 'newFolder'
  | 'rename'
  | 'delete'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'copyPath'
  | 'copyRelativePath'
  | 'revealInExplorer'
  | 'openInTerminal'
  | 'openInEditor'
  | 'openDiff'
  | 'refresh'
  | 'collapseAll'
  | 'expandAll'
  | 'findInFolder';

/** Context menu item */
export interface ContextMenuItem {
  action: ContextMenuAction;
  label: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  divider?: boolean;
}

/** Context menu position */
export interface ContextMenuPosition {
  x: number;
  y: number;
}

/** File tree context menu state */
export interface ContextMenuState {
  isOpen: boolean;
  position: ContextMenuPosition;
  targetPath: string | null;
  targetType: 'file' | 'directory' | null;
}

/** File icon mapping by extension */
export interface FileIconMapping {
  [extension: string]: string;
}

/** Folder icon mapping by name */
export interface FolderIconMapping {
  [name: string]: string;
}

/** File tree sort options */
export type SortOption = 'name' | 'type' | 'modified';
export type SortDirection = 'asc' | 'desc';

/** File tree preferences */
export interface FileTreePreferences {
  sortBy: SortOption;
  sortDirection: SortDirection;
  showHiddenFiles: boolean;
  compactFolders: boolean;
  autoRevealActiveFile: boolean;
  showGitDecorations: boolean;
  confirmDelete: boolean;
  singleClickToOpen: boolean;
}

/** Drag and drop state */
export interface DragDropState {
  isDragging: boolean;
  draggedPath: string | null;
  draggedType: 'file' | 'directory' | null;
  dropTargetPath: string | null;
  dropPosition: 'before' | 'inside' | 'after' | null;
}

/** Clipboard state for cut/copy/paste */
export interface ClipboardState {
  operation: 'cut' | 'copy' | null;
  paths: string[];
}

/** File tree event handlers */
export interface FileTreeEventHandlers {
  onFileOpen?: (path: string) => void;
  onFileSelect?: (paths: string[]) => void;
  onFileCreate?: (path: string) => void;
  onFileDelete?: (path: string) => void;
  onFileRename?: (oldPath: string, newPath: string) => void;
  onFileMove?: (sourcePath: string, targetPath: string) => void;
  onError?: (error: string) => void;
}
