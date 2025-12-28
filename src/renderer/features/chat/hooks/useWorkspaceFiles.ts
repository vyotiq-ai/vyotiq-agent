/**
 * useWorkspaceFiles Hook
 * 
 * Fetches and caches file list from the active workspace for @ mentions.
 * Provides filtered and searchable file paths.
 * 
 * @example
 * ```tsx
 * const { files, isLoading, error, refresh } = useWorkspaceFiles(workspacePath);
 * ```
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('WorkspaceFiles');

// =============================================================================
// Types
// =============================================================================

/** File entry from the listDir API */
interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileEntry[];
}

/** Workspace file with type information */
export interface WorkspaceFile {
  path: string;
  type: 'file' | 'directory';
}

export interface UseWorkspaceFilesOptions {
  /** Path to the workspace root */
  workspacePath?: string | null;
  /** Maximum depth for recursive search */
  maxDepth?: number;
  /** Maximum number of files to return */
  maxFiles?: number;
  /** File extensions to include (empty = all) */
  includeExtensions?: string[];
  /** Patterns to exclude */
  excludePatterns?: string[];
  /** Whether to auto-load on mount */
  autoLoad?: boolean;
}

export interface UseWorkspaceFilesReturn {
  /** List of file paths (for backwards compatibility) */
  files: string[];
  /** List of files with type information */
  filesWithType: WorkspaceFile[];
  /** Whether currently loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Manually refresh the file list */
  refresh: () => Promise<void>;
  /** Last refresh timestamp */
  lastRefreshed: number | null;
}

// =============================================================================
// Constants
// =============================================================================

/** Default patterns to exclude */
const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  '.cache',
  '__pycache__',
  '.venv',
  'venv',
  '.env',
  '.DS_Store',
  'Thumbs.db',
  '*.log',
  '*.lock',
];

/** Cache duration in ms (5 minutes) */
const CACHE_DURATION = 5 * 60 * 1000;

// =============================================================================
// File Cache
// =============================================================================

interface CacheEntry {
  files: WorkspaceFile[];
  timestamp: number;
}

const fileCache = new Map<string, CacheEntry>();

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for fetching workspace files
 */
export function useWorkspaceFiles(options: UseWorkspaceFilesOptions): UseWorkspaceFilesReturn {
  const {
    workspacePath,
    maxDepth = 10,
    maxFiles = 2000,
    excludePatterns = DEFAULT_EXCLUDE_PATTERNS,
    autoLoad = true,
  } = options;

  const [filesWithType, setFilesWithType] = useState<WorkspaceFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<number | null>(null);

  // Prevent duplicate fetches
  const fetchingRef = useRef(false);

  /**
   * Filter files based on exclusion patterns
   */
  const filterFiles = useCallback((fileList: WorkspaceFile[]): WorkspaceFile[] => {
    return fileList.filter(file => {
      const normalizedPath = file.path.replace(/\\/g, '/');
      return !excludePatterns.some(pattern => {
        // Simple pattern matching
        if (pattern.startsWith('*.')) {
          const ext = pattern.slice(1);
          return normalizedPath.endsWith(ext);
        }
        return normalizedPath.includes(`/${pattern}/`) || 
               normalizedPath.includes(`/${pattern}`) ||
               normalizedPath.startsWith(`${pattern}/`);
      });
    });
  }, [excludePatterns]);

  /**
   * Fetch files from workspace
   */
  const fetchFiles = useCallback(async () => {
    if (!workspacePath || fetchingRef.current) return;

    // Check cache first
    const cached = fileCache.get(workspacePath);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setFilesWithType(cached.files);
      setLastRefreshed(cached.timestamp);
      return;
    }

    fetchingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      // Use the files API to list directory recursively
      const result = await window.vyotiq.files.listDir(workspacePath, {
        recursive: true,
        maxDepth,
        showHidden: false,
      });

      if (result?.files) {
        // Extract files with type information from the structured result
        const extractFiles = (entries: FileEntry[]): WorkspaceFile[] => {
          const files: WorkspaceFile[] = [];
          for (const entry of entries) {
            // Include both files and directories with their type
            files.push({ path: entry.path, type: entry.type });
            // Recursively extract from children
            if (entry.children && entry.children.length > 0) {
              files.push(...extractFiles(entry.children));
            }
          }
          return files;
        };

        const allFiles = extractFiles(result.files as FileEntry[]);
        
        // Filter and limit files
        let filteredFiles = filterFiles(allFiles);
        
        // Sort by path for consistent ordering
        filteredFiles = filteredFiles.sort((a, b) => a.path.localeCompare(b.path));
        
        // Limit to maxFiles
        filteredFiles = filteredFiles.slice(0, maxFiles);

        // Update cache
        const now = Date.now();
        fileCache.set(workspacePath, { files: filteredFiles, timestamp: now });

        setFilesWithType(filteredFiles);
        setLastRefreshed(now);
        
        logger.debug('Workspace files loaded', { 
          path: workspacePath, 
          count: filteredFiles.length 
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load files';
      setError(message);
      logger.error('Failed to fetch workspace files', { error: err });
    } finally {
      setIsLoading(false);
      fetchingRef.current = false;
    }
  }, [workspacePath, maxDepth, maxFiles, filterFiles]);

  /**
   * Manual refresh
   */
  const refresh = useCallback(async () => {
    // Clear cache for this workspace
    if (workspacePath) {
      fileCache.delete(workspacePath);
    }
    await fetchFiles();
  }, [workspacePath, fetchFiles]);

  // Auto-load on mount or workspace change
  useEffect(() => {
    if (autoLoad && workspacePath) {
      fetchFiles();
    }
  }, [autoLoad, workspacePath, fetchFiles]);

  // Clear files when workspace changes to null
  useEffect(() => {
    if (!workspacePath) {
      setFilesWithType([]);
      setError(null);
    }
  }, [workspacePath]);

  // Extract just paths for backwards compatibility
  const files = useMemo(() => filesWithType.map(f => f.path), [filesWithType]);

  return {
    files,
    filesWithType,
    isLoading,
    error,
    refresh,
    lastRefreshed,
  };
}
