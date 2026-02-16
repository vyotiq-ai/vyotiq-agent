/**
 * useFileTree Hook
 * 
 * Manages file tree state, operations, and interactions.
 * Provides VS Code-like file tree functionality with:
 * - Multi-selection (Ctrl/Cmd + Click, Shift + Click)
 * - Cut/Copy/Paste operations
 * - Drag and drop support
 * - Keyboard navigation
 * - Git status decorations
 * - Compact folders
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createLogger } from '../../utils/logger';
import { useStableCallback } from '../../utils/performance';
import { useToast } from '../../components/ui/Toast';
import type { 
  FileTreeNode, 
  ContextMenuState, 
  FileTreePreferences,
  ClipboardState,
  DragDropState,
  GitFileStatus
} from './types';

const logger = createLogger('FileTree');

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_PREFERENCES: FileTreePreferences = {
  sortBy: 'type',
  sortDirection: 'asc',
  showHiddenFiles: true,
  compactFolders: true,
  autoRevealActiveFile: true,
  showGitDecorations: true,
  confirmDelete: true,
  singleClickToOpen: false,
};

const EXCLUDED_PATTERNS = [
  'node_modules',
  '.git',
  '.DS_Store',
  'Thumbs.db',
];

const FILE_TREE_PREFS_KEY = 'vyotiq-file-tree-prefs';
const FILE_TREE_EXPANDED_KEY = 'vyotiq-file-tree-expanded';

// =============================================================================
// Helper Functions
// =============================================================================

/** Load preferences from localStorage */
const loadPreferences = (): FileTreePreferences => {
  try {
    const stored = localStorage.getItem(FILE_TREE_PREFS_KEY);
    return stored ? { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) } : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
};

/** Save preferences to localStorage */
const savePreferences = (prefs: FileTreePreferences): void => {
  try {
    localStorage.setItem(FILE_TREE_PREFS_KEY, JSON.stringify(prefs));
  } catch (err) {
    logger.debug('Failed to save file tree preferences', { error: err });
  }
};

/** Load expanded paths from localStorage */
const loadExpandedPaths = (workspacePath: string): Set<string> => {
  try {
    const stored = localStorage.getItem(`${FILE_TREE_EXPANDED_KEY}-${workspacePath}`);
    return stored ? new Set(JSON.parse(stored)) : new Set([workspacePath]);
  } catch {
    return new Set([workspacePath]);
  }
};

/** Save expanded paths to localStorage */
const saveExpandedPaths = (workspacePath: string, paths: Set<string>): void => {
  try {
    localStorage.setItem(`${FILE_TREE_EXPANDED_KEY}-${workspacePath}`, JSON.stringify([...paths]));
  } catch (err) {
    logger.debug('Failed to save expanded paths', { error: err });
  }
};

/** Get file extension */
const getExtension = (filename: string): string => {
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.slice(lastDot + 1).toLowerCase() : '';
};

/** Check if path should be excluded */
const shouldExclude = (name: string, showHidden: boolean): boolean => {
  if (!showHidden && name.startsWith('.')) return true;
  return EXCLUDED_PATTERNS.some(pattern => name === pattern);
};

/** Sort nodes */
const sortNodes = (nodes: FileTreeNode[], sortBy: string, sortDirection: string): FileTreeNode[] => {
  return [...nodes].sort((a, b) => {
    // Directories first
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    
    let comparison = 0;
    if (sortBy === 'name') {
      comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    } else if (sortBy === 'type') {
      const extA = getExtension(a.name);
      const extB = getExtension(b.name);
      comparison = extA.localeCompare(extB) || a.name.localeCompare(b.name, undefined, { numeric: true });
    }
    
    return sortDirection === 'desc' ? -comparison : comparison;
  });
};

/** Compact single-child folders into one node */
const compactFolders = (nodes: FileTreeNode[]): FileTreeNode[] => {
  return nodes.map(node => {
    if (node.type !== 'directory' || !node.children) return node;
    
    // Recursively compact children first
    const compactedChildren = compactFolders(node.children);
    
    // Check if this folder has exactly one child that is also a folder
    if (compactedChildren.length === 1 && compactedChildren[0].type === 'directory') {
      const child = compactedChildren[0];
      return {
        ...node,
        name: `${node.name}/${child.name}`,
        path: child.path,
        children: child.children,
        isCompact: true,
        compactChildren: [{ ...node, children: compactedChildren }],
      };
    }
    
    return { ...node, children: compactedChildren };
  });
};

// =============================================================================
// Hook Interface
// =============================================================================

export interface UseFileTreeOptions {
  workspacePath?: string | null;
  maxDepth?: number;
  onFileOpen?: (path: string) => void;
}

export interface UseFileTreeReturn {
  // State
  nodes: FileTreeNode[];
  flatNodes: FileTreeNode[];
  expandedPaths: Set<string>;
  selectedPaths: Set<string>;
  isLoading: boolean;
  error: string | null;
  preferences: FileTreePreferences;
  contextMenu: ContextMenuState;
  renamingPath: string | null;
  searchQuery: string;
  clipboard: ClipboardState;
  dragDrop: DragDropState;
  focusedPath: string | null;
  
  // Actions
  refresh: () => Promise<void>;
  toggleExpand: (path: string) => void;
  expandPath: (path: string) => void;
  collapsePath: (path: string) => void;
  collapseAll: () => void;
  expandAll: () => void;
  selectPath: (path: string, mode?: 'single' | 'toggle' | 'range') => void;
  clearSelection: () => void;
  setFocusedPath: (path: string | null) => void;
  
  // File operations
  createFile: (parentPath: string, name: string) => Promise<boolean>;
  createFolder: (parentPath: string, name: string) => Promise<boolean>;
  rename: (oldPath: string, newName: string) => Promise<boolean>;
  deleteItem: (path: string) => Promise<boolean>;
  deleteSelected: () => Promise<boolean>;
  copyPath: (path: string, relative?: boolean) => void;
  revealInExplorer: (path: string) => void;
  openFile: (path: string) => void;
  
  // Clipboard operations
  cut: (paths?: string[]) => void;
  copy: (paths?: string[]) => void;
  paste: (targetPath: string) => Promise<boolean>;
  canPaste: () => boolean;
  
  // Drag and drop
  startDrag: (path: string, type: 'file' | 'directory') => void;
  updateDropTarget: (path: string | null, position: 'before' | 'inside' | 'after' | null) => void;
  endDrag: () => void;
  handleDrop: (targetPath: string) => Promise<boolean>;
  
  // Context menu
  openContextMenu: (x: number, y: number, path: string, type: 'file' | 'directory') => void;
  closeContextMenu: () => void;
  
  // Rename mode
  startRenaming: (path: string) => void;
  cancelRenaming: () => void;
  
  // Preferences
  updatePreferences: (prefs: Partial<FileTreePreferences>) => void;
  toggleHiddenFiles: () => void;
  toggleCompactFolders: () => void;
  
  // Search
  setSearchQuery: (query: string) => void;
  clearSearch: () => void;
  
  // Navigation
  navigateUp: () => void;
  navigateDown: () => void;
  navigateInto: () => void;
  navigateOut: () => void;
  navigateToFirst: () => void;
  navigateToLast: () => void;
  navigatePageUp: () => void;
  navigatePageDown: () => void;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useFileTree(options: UseFileTreeOptions): UseFileTreeReturn {
  const { workspacePath, maxDepth = 20, onFileOpen } = options;
  const { toast } = useToast();
  
  // State
  const [nodes, setNodes] = useState<FileTreeNode[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<FileTreePreferences>(loadPreferences);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardState>({ operation: null, paths: [] });
  const [dragDrop, setDragDrop] = useState<DragDropState>({
    isDragging: false,
    draggedPath: null,
    draggedType: null,
    dropTargetPath: null,
    dropPosition: null,
  });
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    targetPath: null,
    targetType: null,
  });
  const [gitStatus, setGitStatus] = useState<Map<string, GitFileStatus>>(new Map());
  
  const fetchingRef = useRef(false);
  const lastWorkspaceRef = useRef<string | null>(null);
  const fileChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingChangesRef = useRef<Set<string>>(new Set());

  // ==========================================================================
  // Build tree from API response
  // ==========================================================================
  
  const buildTree = useCallback((
    files: Array<{ name: string; path: string; type: 'file' | 'directory'; children?: unknown[] }>,
    depth: number = 0
  ): FileTreeNode[] => {
    const result: FileTreeNode[] = [];
    
    for (const file of files) {
      if (shouldExclude(file.name, preferences.showHiddenFiles)) continue;
      
      const node: FileTreeNode = {
        id: file.path,
        name: file.name,
        path: file.path,
        type: file.type,
        depth,
        extension: file.type === 'file' ? getExtension(file.name) : undefined,
        gitStatus: gitStatus.get(file.path) || null,
        isCut: clipboard.operation === 'cut' && clipboard.paths.includes(file.path),
      };
      
      if (file.type === 'directory' && file.children && Array.isArray(file.children)) {
        node.children = buildTree(
          file.children as Array<{ name: string; path: string; type: 'file' | 'directory'; children?: unknown[] }>,
          depth + 1
        );
      }
      
      result.push(node);
    }
    
    const sorted = sortNodes(result, preferences.sortBy, preferences.sortDirection);
    return preferences.compactFolders ? compactFolders(sorted) : sorted;
  }, [preferences.showHiddenFiles, preferences.sortBy, preferences.sortDirection, preferences.compactFolders, gitStatus, clipboard]);

  // ==========================================================================
  // Fetch files (with cache for instant loading)
  // ==========================================================================
  
  const fetchFiles = useCallback(async () => {
    if (!workspacePath || fetchingRef.current) return;
    
    fetchingRef.current = true;
    setIsLoading(true);
    setError(null);
    
    try {
      // Use cache for instant loading - the backend will serve from cache if available
      const result = await window.vyotiq.files.listDir(workspacePath, {
        recursive: true,
        maxDepth,
        showHidden: preferences.showHiddenFiles,
        useCache: true, // Enable instant loading from cache
      });
      
      if (result?.success && result.files) {
        const tree = buildTree(result.files);
        setNodes(tree);
        
        // Initialize expanded paths for new workspace
        if (lastWorkspaceRef.current !== workspacePath) {
          const savedExpanded = loadExpandedPaths(workspacePath);
          setExpandedPaths(savedExpanded);
          lastWorkspaceRef.current = workspacePath;
        }
        
        logger.debug('File tree loaded', { 
          path: workspacePath, 
          count: tree.length,
          cached: !!result.cached,
        });
      } else {
        setError(result?.error || 'Failed to load files');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load files';
      setError(message);
      logger.error('Failed to fetch file tree', { error: err });
    } finally {
      setIsLoading(false);
      fetchingRef.current = false;
    }
  }, [workspacePath, maxDepth, preferences.showHiddenFiles, buildTree]);

  // ==========================================================================
  // Fetch git status
  // ==========================================================================
  
  const fetchGitStatus = useCallback(async () => {
    if (!workspacePath || !preferences.showGitDecorations) return;
    
    try {
      const status = await window.vyotiq.git.status();
      if ('error' in status) return;
      
      const statusMap = new Map<string, GitFileStatus>();
      
      // Map staged files
      status.staged?.forEach((file: { path: string }) => {
        statusMap.set(file.path, 'staged');
      });
      
      // Map unstaged (modified) files
      status.unstaged?.forEach((file: { path: string }) => {
        if (!statusMap.has(file.path)) {
          statusMap.set(file.path, 'modified');
        }
      });
      
      // Map untracked files
      status.untracked?.forEach((file: { path: string }) => {
        statusMap.set(file.path, 'untracked');
      });
      
      // Map conflicted files
      status.conflicted?.forEach((file: { path: string }) => {
        statusMap.set(file.path, 'conflicted');
      });
      
      setGitStatus(statusMap);
    } catch (err) {
      logger.debug('Failed to fetch git status', { error: err });
    }
  }, [workspacePath, preferences.showGitDecorations]);

  // ==========================================================================
  // Flatten tree for rendering
  // ==========================================================================
  
  const flatNodes = useMemo(() => {
    const result: FileTreeNode[] = [];
    const query = searchQuery.toLowerCase().trim();
    
    // Helper to check if node or any descendant matches search
    const nodeMatchesSearch = (node: FileTreeNode): boolean => {
      if (!query) return true;
      if (node.name.toLowerCase().includes(query)) return true;
      if (node.children) {
        return node.children.some(child => nodeMatchesSearch(child));
      }
      return false;
    };
    
    const flatten = (nodeList: FileTreeNode[], parentDepth: number = -1) => {
      for (const node of nodeList) {
        // Skip nodes that don't match search
        if (query && !nodeMatchesSearch(node)) continue;
        
        const actualDepth = node.isCompact ? parentDepth + 1 : node.depth;
        
        result.push({
          ...node,
          depth: actualDepth,
          isExpanded: query ? true : expandedPaths.has(node.path),
          isSelected: selectedPaths.has(node.path),
          isRenaming: renamingPath === node.path,
          isFocused: focusedPath === node.path,
          isCut: clipboard.operation === 'cut' && clipboard.paths.includes(node.path),
          gitStatus: gitStatus.get(node.path) || null,
        });
        
        // When searching, show all matching descendants
        // When not searching, only show children of expanded folders
        const shouldShowChildren = query 
          ? node.type === 'directory' && node.children
          : node.type === 'directory' && expandedPaths.has(node.path) && node.children;
        
        if (shouldShowChildren && node.children) {
          flatten(node.children, actualDepth);
        }
      }
    };
    
    flatten(nodes);
    return result;
  }, [nodes, expandedPaths, selectedPaths, renamingPath, searchQuery, focusedPath, clipboard, gitStatus]);

  // ==========================================================================
  // Expand/Collapse actions
  // ==========================================================================
  
  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      if (workspacePath) saveExpandedPaths(workspacePath, next);
      return next;
    });
  }, [workspacePath]);
  
  const expandPath = useCallback((path: string) => {
    setExpandedPaths(prev => {
      if (prev.has(path)) return prev;
      const next = new Set(prev);
      next.add(path);
      if (workspacePath) saveExpandedPaths(workspacePath, next);
      return next;
    });
  }, [workspacePath]);
  
  const collapsePath = useCallback((path: string) => {
    setExpandedPaths(prev => {
      if (!prev.has(path)) return prev;
      const next = new Set(prev);
      next.delete(path);
      if (workspacePath) saveExpandedPaths(workspacePath, next);
      return next;
    });
  }, [workspacePath]);
  
  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set());
    if (workspacePath) saveExpandedPaths(workspacePath, new Set());
  }, [workspacePath]);
  
  const expandAll = useCallback(() => {
    const allDirs = new Set<string>();
    const collectDirs = (nodeList: FileTreeNode[]) => {
      for (const node of nodeList) {
        if (node.type === 'directory') {
          allDirs.add(node.path);
          if (node.children) collectDirs(node.children);
        }
      }
    };
    collectDirs(nodes);
    setExpandedPaths(allDirs);
    if (workspacePath) saveExpandedPaths(workspacePath, allDirs);
  }, [nodes, workspacePath]);

  // ==========================================================================
  // Selection actions (with multi-select support)
  // ==========================================================================
  
  const selectPath = useCallback((path: string, mode: 'single' | 'toggle' | 'range' = 'single') => {
    setSelectedPaths(prev => {
      if (mode === 'single') {
        setLastSelectedPath(path);
        return new Set([path]);
      }
      
      if (mode === 'toggle') {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
          setLastSelectedPath(path);
        }
        return next;
      }
      
      if (mode === 'range' && lastSelectedPath) {
        // Find indices in flat list
        const startIdx = flatNodes.findIndex(n => n.path === lastSelectedPath);
        const endIdx = flatNodes.findIndex(n => n.path === path);
        
        if (startIdx !== -1 && endIdx !== -1) {
          const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          const next = new Set(prev);
          for (let i = from; i <= to; i++) {
            next.add(flatNodes[i].path);
          }
          return next;
        }
      }
      
      setLastSelectedPath(path);
      return new Set([path]);
    });
    setFocusedPath(path);
  }, [lastSelectedPath, flatNodes]);
  
  const clearSelection = useCallback(() => {
    setSelectedPaths(new Set());
    setLastSelectedPath(null);
  }, []);

  // ==========================================================================
  // File operations
  // ==========================================================================
  
  const createFile = useCallback(async (parentPath: string, name: string): Promise<boolean> => {
    try {
      const filePath = `${parentPath}/${name}`.replace(/\\/g, '/');
      const result = await window.vyotiq.files.create(filePath, '');
      if (result.success) {
        await fetchFiles();
        expandPath(parentPath);
        selectPath(filePath);
        return true;
      }
      setError(result.error || 'Failed to create file');
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create file');
      return false;
    }
  }, [fetchFiles, expandPath, selectPath]);
  
  const createFolder = useCallback(async (parentPath: string, name: string): Promise<boolean> => {
    try {
      const dirPath = `${parentPath}/${name}`.replace(/\\/g, '/');
      const result = await window.vyotiq.files.createDir(dirPath);
      if (result.success) {
        await fetchFiles();
        expandPath(parentPath);
        selectPath(dirPath);
        return true;
      }
      setError(result.error || 'Failed to create folder');
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder');
      return false;
    }
  }, [fetchFiles, expandPath, selectPath]);
  
  const rename = useCallback(async (oldPath: string, newName: string): Promise<boolean> => {
    try {
      const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
      const newPath = `${parentPath}/${newName}`.replace(/\\/g, '/');
      const result = await window.vyotiq.files.rename(oldPath, newPath);
      if (result.success) {
        setRenamingPath(null);
        await fetchFiles();
        selectPath(newPath);
        return true;
      }
      setError(result.error || 'Failed to rename');
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename');
      return false;
    }
  }, [fetchFiles, selectPath]);
  
  const deleteItem = useCallback(async (path: string): Promise<boolean> => {
    try {
      const result = await window.vyotiq.files.delete(path);
      if (result.success) {
        await fetchFiles();
        clearSelection();
        return true;
      }
      setError(result.error || 'Failed to delete');
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
      return false;
    }
  }, [fetchFiles, clearSelection]);
  
  const deleteSelected = useCallback(async (): Promise<boolean> => {
    if (selectedPaths.size === 0) return false;
    
    try {
      const paths = Array.from(selectedPaths);
      // Batch delete: fire all deletes concurrently instead of sequentially
      const results = await Promise.allSettled(
        paths.map(p => window.vyotiq.files.delete(p))
      );
      
      let allSuccess = true;
      for (const result of results) {
        if (result.status === 'rejected' || (result.status === 'fulfilled' && !result.value.success)) {
          allSuccess = false;
          if (result.status === 'fulfilled') {
            setError(result.value.error || 'Failed to delete');
          }
        }
      }
      
      await fetchFiles();
      clearSelection();
      return allSuccess;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
      return false;
    }
  }, [selectedPaths, fetchFiles, clearSelection]);

  const copyPath = useCallback((path: string, relative = false) => {
    const textToCopy = relative && workspacePath 
      ? path.replace(workspacePath, '').replace(/^[/\\]/, '')
      : path;
    navigator.clipboard.writeText(textToCopy);
    toast({ type: 'success', message: 'Path copied to clipboard' });
  }, [workspacePath, toast]);
  
  const revealInExplorer = useCallback((path: string) => {
    window.vyotiq.files.reveal(path);
  }, []);
  
  const openFile = useCallback((path: string) => {
    if (onFileOpen) {
      onFileOpen(path);
    } else {
      window.vyotiq.files.open(path);
    }
  }, [onFileOpen]);

  // ==========================================================================
  // Clipboard operations (Cut/Copy/Paste)
  // ==========================================================================
  
  const cut = useCallback((paths?: string[]) => {
    const pathsToCut = paths || Array.from(selectedPaths);
    if (pathsToCut.length === 0) return;
    setClipboard({ operation: 'cut', paths: pathsToCut });
  }, [selectedPaths]);
  
  const copy = useCallback((paths?: string[]) => {
    const pathsToCopy = paths || Array.from(selectedPaths);
    if (pathsToCopy.length === 0) return;
    setClipboard({ operation: 'copy', paths: pathsToCopy });
  }, [selectedPaths]);
  
  const paste = useCallback(async (targetPath: string): Promise<boolean> => {
    if (!clipboard.operation || clipboard.paths.length === 0) return false;
    
    try {
      // Determine target directory
      const targetNode = flatNodes.find(n => n.path === targetPath);
      const targetDir = targetNode?.type === 'directory' ? targetPath : targetPath.substring(0, targetPath.lastIndexOf('/'));
      
      for (const sourcePath of clipboard.paths) {
        const fileName = sourcePath.split(/[/\\]/).pop() || '';
        const newPath = `${targetDir}/${fileName}`.replace(/\\/g, '/');
        
        if (clipboard.operation === 'cut') {
          // Move operation
          await window.vyotiq.files.rename(sourcePath, newPath);
        } else {
          // Copy operation - read content and write to new location
          try {
            const results = await window.vyotiq.files.read([sourcePath]);
            if (results.length > 0 && results[0].content) {
              await window.vyotiq.files.write(newPath, results[0].content);
            }
          } catch (copyErr) {
            // If read/write fails (e.g., binary file), log and continue
            logger.warn('Failed to copy file', { sourcePath, newPath, error: copyErr });
          }
        }
      }
      
      // Clear clipboard after cut operation
      if (clipboard.operation === 'cut') {
        setClipboard({ operation: null, paths: [] });
      }
      
      await fetchFiles();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to paste');
      return false;
    }
  }, [clipboard, flatNodes, fetchFiles]);
  
  const canPaste = useCallback(() => {
    return clipboard.operation !== null && clipboard.paths.length > 0;
  }, [clipboard]);

  // ==========================================================================
  // Drag and Drop
  // ==========================================================================
  
  const startDrag = useCallback((path: string, type: 'file' | 'directory') => {
    setDragDrop({
      isDragging: true,
      draggedPath: path,
      draggedType: type,
      dropTargetPath: null,
      dropPosition: null,
    });
  }, []);
  
  const updateDropTarget = useCallback((path: string | null, position: 'before' | 'inside' | 'after' | null) => {
    setDragDrop(prev => ({
      ...prev,
      dropTargetPath: path,
      dropPosition: position,
    }));
  }, []);
  
  const endDrag = useCallback(() => {
    setDragDrop({
      isDragging: false,
      draggedPath: null,
      draggedType: null,
      dropTargetPath: null,
      dropPosition: null,
    });
  }, []);
  
  const handleDrop = useCallback(async (targetPath: string): Promise<boolean> => {
    if (!dragDrop.draggedPath) return false;
    
    try {
      const targetNode = flatNodes.find(n => n.path === targetPath);
      const targetDir = targetNode?.type === 'directory' ? targetPath : targetPath.substring(0, targetPath.lastIndexOf('/'));
      
      const fileName = dragDrop.draggedPath.split(/[/\\]/).pop() || '';
      const newPath = `${targetDir}/${fileName}`.replace(/\\/g, '/');
      
      // Don't move to same location
      if (newPath === dragDrop.draggedPath) {
        endDrag();
        return false;
      }
      
      // Don't move parent into child
      if (newPath.startsWith(dragDrop.draggedPath + '/')) {
        setError('Cannot move a folder into itself');
        endDrag();
        return false;
      }
      
      await window.vyotiq.files.rename(dragDrop.draggedPath, newPath);
      await fetchFiles();
      endDrag();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move');
      endDrag();
      return false;
    }
  }, [dragDrop.draggedPath, flatNodes, fetchFiles, endDrag]);

  // ==========================================================================
  // Context menu
  // ==========================================================================
  
  const openContextMenu = useCallback((x: number, y: number, path: string, type: 'file' | 'directory') => {
    setContextMenu({
      isOpen: true,
      position: { x, y },
      targetPath: path,
      targetType: type,
    });
  }, []);
  
  const closeContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, isOpen: false }));
  }, []);

  // ==========================================================================
  // Rename mode
  // ==========================================================================
  
  const startRenaming = useCallback((path: string) => {
    setRenamingPath(path);
    closeContextMenu();
  }, [closeContextMenu]);
  
  const cancelRenaming = useCallback(() => {
    setRenamingPath(null);
  }, []);

  // ==========================================================================
  // Preferences
  // ==========================================================================
  
  const updatePreferences = useCallback((prefs: Partial<FileTreePreferences>) => {
    setPreferences(prev => {
      const next = { ...prev, ...prefs };
      savePreferences(next);
      return next;
    });
  }, []);
  
  const toggleHiddenFiles = useCallback(() => {
    updatePreferences({ showHiddenFiles: !preferences.showHiddenFiles });
  }, [preferences.showHiddenFiles, updatePreferences]);
  
  const toggleCompactFolders = useCallback(() => {
    updatePreferences({ compactFolders: !preferences.compactFolders });
  }, [preferences.compactFolders, updatePreferences]);

  // ==========================================================================
  // Search
  // ==========================================================================
  
  const clearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  // ==========================================================================
  // Keyboard Navigation
  // ==========================================================================
  
  // Build path-to-index map for O(1) navigation lookups instead of O(n) findIndex
  const pathIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < flatNodes.length; i++) {
      map.set(flatNodes[i].path, i);
    }
    return map;
  }, [flatNodes]);

  const navigateUp = useCallback(() => {
    if (flatNodes.length === 0) return;
    
    const currentIdx = focusedPath ? (pathIndexMap.get(focusedPath) ?? -1) : -1;
    const newIdx = currentIdx > 0 ? currentIdx - 1 : 0;
    const newPath = flatNodes[newIdx]?.path;
    
    if (newPath) {
      setFocusedPath(newPath);
      selectPath(newPath);
    }
  }, [flatNodes, focusedPath, selectPath, pathIndexMap]);
  
  const navigateDown = useCallback(() => {
    if (flatNodes.length === 0) return;
    
    const currentIdx = focusedPath ? (pathIndexMap.get(focusedPath) ?? -1) : -1;
    const newIdx = currentIdx < flatNodes.length - 1 ? currentIdx + 1 : flatNodes.length - 1;
    const newPath = flatNodes[newIdx]?.path;
    
    if (newPath) {
      setFocusedPath(newPath);
      selectPath(newPath);
    }
  }, [flatNodes, focusedPath, selectPath, pathIndexMap]);
  
  const navigateInto = useCallback(() => {
    if (!focusedPath) return;
    
    const node = flatNodes.find(n => n.path === focusedPath);
    if (!node) return;
    
    if (node.type === 'directory') {
      if (!expandedPaths.has(node.path)) {
        expandPath(node.path);
      } else if (node.children && node.children.length > 0) {
        // Move to first child
        const firstChild = flatNodes.find(n => n.depth === node.depth + 1 && n.path.startsWith(node.path + '/'));
        if (firstChild) {
          setFocusedPath(firstChild.path);
          selectPath(firstChild.path);
        }
      }
    } else {
      openFile(node.path);
    }
  }, [focusedPath, flatNodes, expandedPaths, expandPath, selectPath, openFile]);
  
  const navigateOut = useCallback(() => {
    if (!focusedPath) return;
    
    const node = flatNodes.find(n => n.path === focusedPath);
    if (!node) return;
    
    if (node.type === 'directory' && expandedPaths.has(node.path)) {
      collapsePath(node.path);
    } else {
      // Move to parent
      const parentPath = node.path.substring(0, node.path.lastIndexOf('/'));
      const parent = flatNodes.find(n => n.path === parentPath);
      if (parent) {
        setFocusedPath(parent.path);
        selectPath(parent.path);
      }
    }
  }, [focusedPath, flatNodes, expandedPaths, collapsePath, selectPath]);

  const navigateToFirst = useCallback(() => {
    if (flatNodes.length === 0) return;
    const firstPath = flatNodes[0].path;
    setFocusedPath(firstPath);
    selectPath(firstPath);
  }, [flatNodes, selectPath]);

  const navigateToLast = useCallback(() => {
    if (flatNodes.length === 0) return;
    const lastPath = flatNodes[flatNodes.length - 1].path;
    setFocusedPath(lastPath);
    selectPath(lastPath);
  }, [flatNodes, selectPath]);

  const PAGE_SIZE = 10;

  const navigatePageUp = useCallback(() => {
    if (flatNodes.length === 0) return;
    const currentIdx = focusedPath ? (pathIndexMap.get(focusedPath) ?? 0) : 0;
    const newIdx = Math.max(0, currentIdx - PAGE_SIZE);
    const newPath = flatNodes[newIdx].path;
    setFocusedPath(newPath);
    selectPath(newPath);
  }, [flatNodes, focusedPath, selectPath, pathIndexMap]);

  const navigatePageDown = useCallback(() => {
    if (flatNodes.length === 0) return;
    const currentIdx = focusedPath ? (pathIndexMap.get(focusedPath) ?? 0) : 0;
    const newIdx = Math.min(flatNodes.length - 1, currentIdx + PAGE_SIZE);
    const newPath = flatNodes[newIdx].path;
    setFocusedPath(newPath);
    selectPath(newPath);
  }, [flatNodes, focusedPath, selectPath, pathIndexMap]);

  // ==========================================================================
  // Effects
  // ==========================================================================
  
  // Load files when workspace changes
  // PERFORMANCE: Defer initial file tree load to avoid blocking the UI during startup.
  // requestAnimationFrame ensures the browser has painted the initial frame first.
  useEffect(() => {
    if (workspacePath) {
      let cancelled = false;
      // Defer to next idle frame so the UI renders before heavy I/O
      const rafId = requestAnimationFrame(() => {
        if (cancelled) return;
        fetchFiles();
        fetchGitStatus();
      });
      return () => { cancelled = true; cancelAnimationFrame(rafId); };
    } else {
      setNodes([]);
      setExpandedPaths(new Set());
      setSelectedPaths(new Set());
    }
  }, [workspacePath]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Refetch when preferences change
  useEffect(() => {
    if (workspacePath && lastWorkspaceRef.current === workspacePath) {
      fetchFiles();
    }
  }, [preferences.showHiddenFiles, preferences.sortBy, preferences.sortDirection, preferences.compactFolders]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Listen for git status changes
  useEffect(() => {
    if (!workspacePath || !preferences.showGitDecorations) return;
    
    const unsubscribe = window.vyotiq.git.onStatusChange(() => {
      fetchGitStatus();
    });
    
    return unsubscribe;
  }, [workspacePath, preferences.showGitDecorations, fetchGitStatus]);
  
  // Debounced file change handler - batches rapid file changes
  // instead of refreshing the entire tree on every single change
  const debouncedRefresh = useStableCallback(() => {
    pendingChangesRef.current.clear();
    fetchFiles();
    if (preferences.showGitDecorations) {
      fetchGitStatus();
    }
  });

  // Listen for file changes (from IPC file operations and agent tools)
  useEffect(() => {
    if (!workspacePath) return;
    
    const unsubscribe = window.vyotiq.files.onFileChange((event) => {
      // Only refresh if the changed file is within our workspace
      const normalizedPath = event.path.replace(/\\/g, '/');
      const normalizedWorkspace = workspacePath.replace(/\\/g, '/');
      
      if (normalizedPath.startsWith(normalizedWorkspace)) {
        // Batch rapid file changes with debouncing (300ms)
        // This prevents the tree from refreshing hundreds of times
        // during bulk operations (git checkout, npm install, etc.)
        pendingChangesRef.current.add(event.path);
        
        if (fileChangeTimerRef.current) {
          clearTimeout(fileChangeTimerRef.current);
        }
        fileChangeTimerRef.current = setTimeout(() => {
          fileChangeTimerRef.current = null;
          debouncedRefresh();
        }, 300);
      }
    });
    
    return () => {
      unsubscribe();
      if (fileChangeTimerRef.current) {
        clearTimeout(fileChangeTimerRef.current);
        fileChangeTimerRef.current = null;
      }
    };
  }, [workspacePath, debouncedRefresh]);

  return {
    nodes,
    flatNodes,
    expandedPaths,
    selectedPaths,
    isLoading,
    error,
    preferences,
    contextMenu,
    renamingPath,
    searchQuery,
    clipboard,
    dragDrop,
    focusedPath,
    refresh: fetchFiles,
    toggleExpand,
    expandPath,
    collapsePath,
    collapseAll,
    expandAll,
    selectPath,
    clearSelection,
    setFocusedPath,
    createFile,
    createFolder,
    rename,
    deleteItem,
    deleteSelected,
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
    updatePreferences,
    toggleHiddenFiles,
    toggleCompactFolders,
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
  };
}
