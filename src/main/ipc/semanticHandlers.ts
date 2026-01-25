/**
 * Semantic IPC Handlers
 *
 * Handles all semantic indexing and search IPC operations including:
 * - Index workspace
 * - Semantic search
 * - Get indexing progress
 * - Get index statistics
 * - Clear index
 */

import { ipcMain } from 'electron';
import { createLogger } from '../logger';
import {
  getSemanticIndexer,
  type IndexingProgress,
  type SemanticSearchResult,
  type IndexerStats,
} from '../agent/semantic/SemanticIndexer';
import type { SearchOptions } from '../agent/semantic/VectorStore';
import type { IpcContext } from './types';

const logger = createLogger('IPC:Semantic');

/**
 * Register semantic indexing IPC handlers
 */
export function registerSemanticHandlers(context: IpcContext): void {
  const { getActiveWorkspacePath, emitToRenderer, getSettingsStore } = context;

  /**
   * Helper to check if semantic indexing is enabled
   */
  const isSemanticEnabled = (): boolean => {
    const settings = getSettingsStore().get();
    return settings.semanticSettings?.enabled !== false;
  };

  /**
   * Index the current workspace
   */
  ipcMain.handle(
    'semantic:indexWorkspace',
    async (
      _event,
      options?: {
        forceReindex?: boolean;
        fileTypes?: string[];
        excludePatterns?: string[];
      }
    ): Promise<{ success: boolean; error?: string }> => {
      // Check if semantic indexing is enabled
      if (!isSemanticEnabled()) {
        logger.info('Semantic indexing is disabled in settings');
        return { success: false, error: 'Semantic indexing is disabled in settings' };
      }

      const workspacePath = getActiveWorkspacePath();

      if (!workspacePath) {
        logger.warn('No active workspace to index');
        return { success: false, error: 'No active workspace' };
      }

      try {
        const indexer = getSemanticIndexer();

        // Start indexing with progress callback
        await indexer.indexWorkspace(workspacePath, {
          ...options,
          onProgress: (progress: IndexingProgress) => {
            emitToRenderer({
              type: 'semantic:indexProgress',
              ...progress,
            });
          },
        });

        logger.info('Workspace indexed successfully', { workspacePath });
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to index workspace', { workspacePath, error: errorMessage });
        return { success: false, error: errorMessage };
      }
    }
  );

  /**
   * Perform semantic search
   */
  ipcMain.handle(
    'semantic:search',
    async (
      _event,
      query: string,
      options?: SearchOptions
    ): Promise<SemanticSearchResult | { success: false; error: string }> => {
      if (!query || typeof query !== 'string') {
        return { success: false, error: 'Query is required' };
      }

      // Check if semantic indexing is enabled
      if (!isSemanticEnabled()) {
        return { success: false, error: 'Semantic indexing is disabled in settings' };
      }

      try {
        const indexer = getSemanticIndexer();
        const result = await indexer.search({ query, options });

        logger.debug('Semantic search completed', {
          query: query.substring(0, 50),
          resultsCount: result.results.length,
          queryTimeMs: result.queryTimeMs,
        });

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Semantic search failed', { query, error: errorMessage });
        return { success: false, error: errorMessage };
      }
    }
  );

  /**
   * Get indexing progress
   */
  ipcMain.handle('semantic:getProgress', async (): Promise<IndexingProgress> => {
    try {
      const indexer = getSemanticIndexer();
      return indexer.getProgress();
    } catch (error) {
      logger.error('Failed to get indexing progress', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        totalFiles: 0,
        indexedFiles: 0,
        currentFile: null,
        isIndexing: false,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * Get index statistics
   */
  ipcMain.handle('semantic:getStats', async (): Promise<IndexerStats> => {
    try {
      const indexer = getSemanticIndexer();
      return await indexer.getStats();
    } catch (error) {
      logger.error('Failed to get index stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        indexedFiles: 0,
        totalChunks: 0,
        lastIndexTime: null,
        indexSizeBytes: 0,
        indexHealth: 'empty',
      };
    }
  });

  /**
   * Clear the index
   */
  ipcMain.handle('semantic:clearIndex', async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const indexer = getSemanticIndexer();
      await indexer.clearIndex();
      logger.info('Semantic index cleared');
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to clear index', { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });

  /**
   * Abort current indexing
   */
  ipcMain.handle('semantic:abortIndexing', async (): Promise<{ success: boolean }> => {
    try {
      const indexer = getSemanticIndexer();
      indexer.abortIndexing();
      logger.info('Indexing aborted');
      return { success: true };
    } catch (error) {
      logger.error('Failed to abort indexing', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false };
    }
  });

  /**
   * Get indexed files
   */
  ipcMain.handle('semantic:getIndexedFiles', async (): Promise<string[]> => {
    try {
      const indexer = getSemanticIndexer();
      return indexer.getIndexedFiles();
    } catch (error) {
      logger.error('Failed to get indexed files', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  });

  /**
   * Check if indexer is ready
   */
  ipcMain.handle('semantic:isReady', async (): Promise<boolean> => {
    try {
      const indexer = getSemanticIndexer();
      return indexer.isReady();
    } catch {
      return false;
    }
  });

  logger.info('Semantic IPC handlers registered');
}
