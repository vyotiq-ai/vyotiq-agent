/**
 * useSemanticIndex Hook
 * 
 * React hook for managing semantic indexing state and operations.
 * Provides access to:
 * - Indexing progress and status
 * - Index statistics
 * - Search functionality
 * - Index management (reindex, clear, abort)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createLogger } from '../utils/logger';

const logger = createLogger('useSemanticIndex');

// =============================================================================
// Types
// =============================================================================

export interface IndexingProgress {
  totalFiles: number;
  indexedFiles: number;
  currentFile: string | null;
  isIndexing: boolean;
  status: 'idle' | 'scanning' | 'analyzing' | 'indexing' | 'complete' | 'error' | 'downloading-model';
  error?: string;
  startTime?: number;
  estimatedTimeRemaining?: number;
  /** Files processed per second */
  filesPerSecond?: number;
  /** Total chunks created so far */
  totalChunks?: number;
  /** Current phase description */
  phase?: string;
  /** Model download progress (0-100) */
  modelDownloadProgress?: number;
  /** Model file being downloaded */
  modelDownloadFile?: string;
}

export interface IndexerStats {
  indexedFiles: number;
  totalChunks: number;
  lastIndexTime: number | null;
  indexSizeBytes: number;
  indexHealth: 'healthy' | 'degraded' | 'needs-rebuild' | 'empty';
  /** Average query time in milliseconds */
  avgQueryTimeMs?: number;
  /** Workspace structure summary */
  workspaceInfo?: {
    projectType: string;
    framework?: string;
    totalFiles: number;
    estimatedLinesOfCode: number;
  };
  /** Embedding service info */
  embeddingInfo?: {
    isUsingOnnx: boolean;
    cacheSize: number;
    dimension: number;
    modelId?: string;
    quality?: string;
  };
}

export interface SearchOptions {
  limit?: number;
  minScore?: number;
  filePathPattern?: string;
  fileTypes?: string[];
  languages?: string[];
  symbolTypes?: string[];
  includeContent?: boolean;
}

export interface SearchResultDocument {
  id: string;
  filePath: string;
  chunkIndex: number;
  content: string;
  metadata: {
    fileType: string;
    language?: string;
    symbolType?: string;
    symbolName?: string;
    startLine?: number;
    endLine?: number;
  };
}

export interface SearchResult {
  document: SearchResultDocument;
  score: number;
  distance: number;
}

export interface SemanticSearchResult {
  results: SearchResult[];
  queryTimeMs: number;
  totalDocumentsSearched: number;
}

export interface IndexWorkspaceOptions {
  forceReindex?: boolean;
  fileTypes?: string[];
  excludePatterns?: string[];
}

// =============================================================================
// Hook
// =============================================================================

export interface UseSemanticIndexReturn {
  /** Current indexing progress */
  progress: IndexingProgress;
  /** Index statistics */
  stats: IndexerStats | null;
  /** Whether the indexer is ready */
  isReady: boolean;
  /** Whether loading stats */
  isLoadingStats: boolean;
  /** Start workspace indexing */
  indexWorkspace: (options?: IndexWorkspaceOptions) => Promise<boolean>;
  /** Perform semantic search */
  search: (query: string, options?: SearchOptions) => Promise<SemanticSearchResult | null>;
  /** Clear the index */
  clearIndex: () => Promise<boolean>;
  /** Abort current indexing */
  abortIndexing: () => Promise<boolean>;
  /** Refresh statistics */
  refreshStats: () => Promise<void>;
  /** Get list of indexed files */
  getIndexedFiles: () => Promise<string[]>;
}

const DEFAULT_PROGRESS: IndexingProgress = {
  totalFiles: 0,
  indexedFiles: 0,
  currentFile: null,
  isIndexing: false,
  status: 'idle',
};

export function useSemanticIndex(): UseSemanticIndexReturn {
  const [progress, setProgress] = useState<IndexingProgress>(DEFAULT_PROGRESS);
  const [stats, setStats] = useState<IndexerStats | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Check if indexer is ready on mount
  useEffect(() => {
    const checkReady = async () => {
      try {
        const ready = await window.vyotiq.semantic.isReady();
        setIsReady(ready);
      } catch (error) {
        logger.error('Failed to check indexer status', { 
          error: error instanceof Error ? error.message : String(error) 
        });
        setIsReady(false);
      }
    };

    checkReady();
  }, []);

  // Subscribe to progress events
  useEffect(() => {
    // Handler receives IndexingProgressEvent from preload (status is string)
    // We map it to our typed IndexingProgress with all new fields
    const handleProgress = (event: {
      type: string;
      totalFiles: number;
      indexedFiles: number;
      currentFile: string | null;
      isIndexing: boolean;
      status: string;
      filesPerSecond?: number;
      totalChunks?: number;
      phase?: string;
      estimatedTimeRemaining?: number;
      modelDownloadProgress?: number;
      modelDownloadFile?: string;
    }) => {
      // Map string status to typed status
      const mapStatus = (s: string): IndexingProgress['status'] => {
        if (['idle', 'scanning', 'analyzing', 'indexing', 'complete', 'error', 'downloading-model'].includes(s)) {
          return s as IndexingProgress['status'];
        }
        return event.isIndexing ? 'indexing' : 'idle';
      };

      setProgress({
        totalFiles: event.totalFiles,
        indexedFiles: event.indexedFiles,
        currentFile: event.currentFile,
        isIndexing: event.isIndexing,
        status: mapStatus(event.status),
        filesPerSecond: event.filesPerSecond,
        totalChunks: event.totalChunks,
        phase: event.phase,
        estimatedTimeRemaining: event.estimatedTimeRemaining,
        modelDownloadProgress: event.modelDownloadProgress,
        modelDownloadFile: event.modelDownloadFile,
      });

      // Update ready state and refresh stats when indexing completes
      if (event.status === 'complete') {
        setIsReady(true);
        // Refresh stats to get updated embedding info
        window.vyotiq.semantic.getStats().then(setStats).catch(() => {});
      }
    };

    unsubscribeRef.current = window.vyotiq.semantic.onProgress(handleProgress);

    // Fetch initial progress
    window.vyotiq.semantic.getProgress().then(setProgress).catch((error) => {
      logger.error('Failed to get initial progress', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    });

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  // Subscribe to model status events to auto-refresh stats when model is ready
  useEffect(() => {
    const unsubscribeModelStatus = window.vyotiq.semantic.onModelStatus((status) => {
      logger.debug('Model status changed', { status: status.status, isLoaded: status.isLoaded });
      
      // When model becomes ready, refresh stats to update the UI
      if (status.status === 'ready' || status.isLoaded) {
        refreshStats();
      }
    });

    return () => {
      unsubscribeModelStatus();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load stats initially
  useEffect(() => {
    refreshStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh statistics
  const refreshStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const indexStats = await window.vyotiq.semantic.getStats();
      setStats(indexStats);
    } catch (error) {
      logger.error('Failed to get index stats', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  // Index workspace
  const indexWorkspace = useCallback(async (options?: IndexWorkspaceOptions): Promise<boolean> => {
    try {
      const result = await window.vyotiq.semantic.indexWorkspace(options);
      if (result.success) {
        // Refresh stats after indexing starts
        setTimeout(() => refreshStats(), 1000);
      }
      return result.success;
    } catch (error) {
      logger.error('Failed to start workspace indexing', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }, [refreshStats]);

  // Perform search
  const search = useCallback(async (
    query: string, 
    options?: SearchOptions
  ): Promise<SemanticSearchResult | null> => {
    try {
      const result = await window.vyotiq.semantic.search(query, options);
      if ('success' in result && result.success === false) {
        logger.error('Search failed', { error: result.error });
        return null;
      }
      return result as SemanticSearchResult;
    } catch (error) {
      logger.error('Search error', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return null;
    }
  }, []);

  // Clear index
  const clearIndex = useCallback(async (): Promise<boolean> => {
    try {
      const result = await window.vyotiq.semantic.clearIndex();
      if (result.success) {
        await refreshStats();
      }
      return result.success;
    } catch (error) {
      logger.error('Failed to clear index', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }, [refreshStats]);

  // Abort indexing
  const abortIndexing = useCallback(async (): Promise<boolean> => {
    try {
      const result = await window.vyotiq.semantic.abortIndexing();
      return result.success;
    } catch (error) {
      logger.error('Failed to abort indexing', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }, []);

  // Get indexed files
  const getIndexedFiles = useCallback(async (): Promise<string[]> => {
    try {
      return await window.vyotiq.semantic.getIndexedFiles();
    } catch (error) {
      logger.error('Failed to get indexed files', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return [];
    }
  }, []);

  return {
    progress,
    stats,
    isReady,
    isLoadingStats,
    indexWorkspace,
    search,
    clearIndex,
    abortIndexing,
    refreshStats,
    getIndexedFiles,
  };
}
