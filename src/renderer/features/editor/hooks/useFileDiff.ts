/**
 * useFileDiff Hook
 * 
 * Manages file diff state for showing changes in real-time.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { FileDiff, DiffViewMode } from '../types';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('FileDiff');

// Helper to decode file content from API response
const decodeFileContent = (content: string, encoding?: string): string => {
  if (encoding === 'base64') {
    try {
      return atob(content);
    } catch {
      try {
        const binaryString = atob(content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return new TextDecoder('utf-8').decode(bytes);
      } catch {
        return content;
      }
    }
  }
  return content;
};

interface UseFileDiffOptions {
  /** Auto-refresh interval in ms (0 = disabled) */
  autoRefreshInterval?: number;
}

interface UseFileDiffReturn {
  /** Current diff data */
  diff: FileDiff | null;
  /** Whether diff is loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Current view mode */
  viewMode: DiffViewMode;
  /** Whether diff panel is visible */
  isVisible: boolean;
  
  // Actions
  /** Load diff for a file */
  loadDiff: (path: string, originalContent?: string, modifiedContent?: string) => Promise<void>;
  /** Load git diff for a file */
  loadGitDiff: (path: string, staged?: boolean) => Promise<void>;
  /** Clear diff */
  clearDiff: () => void;
  /** Set view mode */
  setViewMode: (mode: DiffViewMode) => void;
  /** Toggle visibility */
  toggleVisibility: () => void;
  /** Show diff panel */
  showDiff: () => void;
  /** Hide diff panel */
  hideDiff: () => void;
  /** Refresh current diff */
  refresh: () => Promise<void>;
}

export function useFileDiff(options: UseFileDiffOptions = {}): UseFileDiffReturn {
  const { autoRefreshInterval = 0 } = options;
  
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<DiffViewMode>('side-by-side');
  const [isVisible, setIsVisible] = useState(false);
  
  const currentPathRef = useRef<string | null>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Load diff with provided content
  const loadDiff = useCallback(async (
    path: string, 
    originalContent?: string, 
    modifiedContent?: string
  ) => {
    setIsLoading(true);
    setError(null);
    currentPathRef.current = path;
    
    try {
      const original = originalContent || '';
      let modified = modifiedContent || '';
      
      // If no content provided, load from file
      if (!originalContent || !modifiedContent) {
        const result = await window.vyotiq.files.read([path]);
        if (result && result.length > 0 && result[0].content) {
          modified = decodeFileContent(result[0].content, result[0].encoding);
        }
      }
      
      setDiff({
        path,
        original,
        modified,
        isLoading: false,
      });
      setIsVisible(true);
      
      logger.debug('Loaded diff', { path });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load diff';
      setError(message);
      logger.error('Failed to load diff', { path, error: err });
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // Load git diff for a file
  const loadGitDiff = useCallback(async (path: string, staged = false) => {
    setIsLoading(true);
    setError(null);
    currentPathRef.current = path;
    
    try {
      // Get current file content with proper decoding
      const fileResult = await window.vyotiq.files.read([path]);
      let currentContent = '';
      if (fileResult && fileResult.length > 0 && fileResult[0].content) {
        currentContent = decodeFileContent(fileResult[0].content, fileResult[0].encoding);
      }
      
      // Get git diff
      const gitDiff = await window.vyotiq.git.diff(path, staged);
      
      if ('error' in gitDiff) {
        throw new Error(gitDiff.error);
      }
      
      // Find the diff for this file
      const fileDiff = gitDiff.find(d => d.path === path || d.path.endsWith(path.split(/[/\\]/).pop() || ''));
      
      if (fileDiff) {
        // Parse the diff to get original content
        let originalContent = '';
        
        if (fileDiff.status !== 'added') {
          // Try to get the original content from git using the git service (not terminal)
          try {
            const gitResult = await window.vyotiq.git.showFile(path, 'HEAD');
            if (gitResult.content !== null) {
              originalContent = gitResult.content;
            }
          } catch {
            originalContent = '';
          }
        }
        
        setDiff({
          path,
          original: originalContent,
          modified: currentContent,
          isLoading: false,
        });
        setIsVisible(true);
        
        logger.debug('Loaded git diff', { path, status: fileDiff.status });
      } else {
        // No changes in git
        setDiff({
          path,
          original: currentContent,
          modified: currentContent,
          isLoading: false,
        });
        setIsVisible(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load git diff';
      setError(message);
      logger.error('Failed to load git diff', { path, error: err });
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // Clear diff
  const clearDiff = useCallback(() => {
    setDiff(null);
    setError(null);
    currentPathRef.current = null;
  }, []);
  
  // Toggle visibility
  const toggleVisibility = useCallback(() => {
    setIsVisible(prev => !prev);
  }, []);
  
  // Show diff
  const showDiff = useCallback(() => {
    setIsVisible(true);
  }, []);
  
  // Hide diff
  const hideDiff = useCallback(() => {
    setIsVisible(false);
  }, []);
  
  // Refresh current diff
  const refresh = useCallback(async () => {
    if (currentPathRef.current && diff) {
      await loadDiff(currentPathRef.current, diff.original);
    }
  }, [diff, loadDiff]);
  
  // Auto-refresh interval
  useEffect(() => {
    if (autoRefreshInterval > 0 && isVisible && currentPathRef.current) {
      refreshIntervalRef.current = setInterval(refresh, autoRefreshInterval);
      
      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
      };
    }
  }, [autoRefreshInterval, isVisible, refresh]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);
  
  return {
    diff,
    isLoading,
    error,
    viewMode,
    isVisible,
    loadDiff,
    loadGitDiff,
    clearDiff,
    setViewMode,
    toggleVisibility,
    showDiff,
    hideDiff,
    refresh,
  };
}
