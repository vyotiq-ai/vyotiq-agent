/**
 * Cache IPC Handlers
 * 
 * Exposes cache statistics and management operations to the renderer.
 * Delegates to the centralized CacheManager and ToolResultCache singletons
 * rather than maintaining a separate cache layer.
 */

import { ipcMain } from 'electron';
import { createLogger } from '../logger';
import { withErrorGuard } from './guards';
import type { IpcContext } from './types';
import { getCacheManager, getToolResultCache, getContextCache } from '../agent/cache';

const logger = createLogger('IPC:Cache');

interface CacheStatsResponse {
  promptCache: {
    hits: number;
    misses: number;
    hitRate: number;
    tokensSaved: number;
    costSaved: number;
  };
  toolCache: {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: number;
    evictions: number;
    expirations: number;
  };
}

export function registerCacheHandlers(context: IpcContext): void {
  const { getSettingsStore } = context;

  // Get Cache Statistics — delegates to centralized singletons
  ipcMain.handle('cache:get-stats', async (): Promise<CacheStatsResponse> => {
    return withErrorGuard('cache:get-stats', async () => {
      const cacheManager = getCacheManager();
      const allProviderStats = cacheManager.getAllStats();
      // Aggregate across all providers
      const promptStats = { hits: 0, misses: 0, tokensSaved: 0, costSaved: 0 };
      for (const stats of Object.values(allProviderStats)) {
        if (stats) {
          promptStats.hits += stats.hits;
          promptStats.misses += stats.misses;
          promptStats.tokensSaved += stats.tokensSaved;
          promptStats.costSaved += stats.costSaved;
        }
      }

      let toolStats = { size: 0, maxSize: 100, hits: 0, misses: 0, hitRate: 0, evictions: 0, expirations: 0 };
      try {
        const toolCache = getToolResultCache();
        const s = toolCache.getStats();
        toolStats = {
          size: s.size,
          maxSize: s.maxSize,
          hits: s.hits,
          misses: s.misses,
          hitRate: s.hitRate,
          evictions: 0,
          expirations: 0,
        };
      } catch { /* Tool cache may not be initialized */ }

      const total = promptStats.hits + promptStats.misses;
      return {
        promptCache: {
          hits: promptStats.hits,
          misses: promptStats.misses,
          hitRate: total > 0 ? promptStats.hits / total : 0,
          tokensSaved: promptStats.tokensSaved ?? 0,
          costSaved: promptStats.costSaved ?? 0,
        },
        toolCache: toolStats,
      };
    }, {
      returnOnError: {
        promptCache: { hits: 0, misses: 0, hitRate: 0, tokensSaved: 0, costSaved: 0 },
        toolCache: { size: 0, maxSize: 100, hits: 0, misses: 0, hitRate: 0, evictions: 0, expirations: 0 },
      },
    }) as Promise<CacheStatsResponse>;
  });

  // Clear Cache — delegates to centralized singletons
  ipcMain.handle('cache:clear', async (_event, type?: 'prompt' | 'tool' | 'context' | 'all'): Promise<{ success: boolean; cleared: string[] }> => {
    return withErrorGuard<{ success: boolean; cleared: string[] }>('cache:clear', async () => {
      const cleared: string[] = [];
      const clearType = type ?? 'all';

      if (clearType === 'prompt' || clearType === 'all') {
        try { getCacheManager().resetStats(); } catch { /* non-critical */ }
        cleared.push('prompt');
        logger.info('Prompt cache cleared');
      }

      if (clearType === 'tool' || clearType === 'all') {
        try {
          const toolCache = getToolResultCache();
          toolCache.invalidateAll();
          toolCache.resetStats();
        } catch { /* non-critical */ }
        cleared.push('tool');
        logger.info('Tool cache cleared');
      }

      if (clearType === 'context' || clearType === 'all') {
        try {
          const contextCache = getContextCache();
          contextCache.clear();
          contextCache.resetStats();
        } catch { /* non-critical */ }
        cleared.push('context');
        logger.info('Context cache cleared');
      }

      return { success: true, cleared };
    }, { returnOnError: { success: false, cleared: [] } }) as Promise<{ success: boolean; cleared: string[] }>;
  });

  // Update Tool Cache Configuration
  ipcMain.handle('cache:update-tool-config', async (_event, config: { maxAge?: number; maxSize?: number }): Promise<{ success: boolean }> => {
    return withErrorGuard<{ success: boolean }>('cache:update-tool-config', async () => {
      const maxAge = config.maxAge !== undefined ? Math.max(1000, config.maxAge) : undefined;
      const maxSize = config.maxSize !== undefined ? Math.max(10, config.maxSize) : undefined;

      const currentSettings = getSettingsStore().get();
      await getSettingsStore().update({
        cacheSettings: {
          ...currentSettings.cacheSettings,
          toolCache: {
            ...currentSettings.cacheSettings?.toolCache,
            ...(maxAge !== undefined ? { defaultTtlMs: maxAge } : {}),
            ...(maxSize !== undefined ? { maxEntries: maxSize } : {}),
          },
        },
      });

      logger.info('Tool cache config updated', { maxAge, maxSize });
      return { success: true };
    }, { returnOnError: { success: false } });
  });

  // Cleanup Expired Tool Results
  ipcMain.handle('cache:cleanup-tool-results', async (): Promise<{ success: boolean; removed: number }> => {
    return withErrorGuard<{ success: boolean; removed: number }>('cache:cleanup-tool-results', async () => {
      let removed = 0;
      try {
        const toolCache = getToolResultCache();
        removed = toolCache.cleanup?.() ?? 0;
      } catch { /* non-critical */ }
      logger.info('Tool cache cleanup completed', { removed });
      return { success: true, removed };
    }, { returnOnError: { success: false, removed: 0 } }) as Promise<{ success: boolean; removed: number }>;
  });

  // Invalidate Path
  ipcMain.handle('cache:invalidate-path', async (_event, path: string): Promise<{ success: boolean; invalidated: number }> => {
    return withErrorGuard<{ success: boolean; invalidated: number }>('cache:invalidate-path', async () => {
      let invalidated = 0;
      try {
        const toolCache = getToolResultCache();
        invalidated = toolCache.invalidatePath(path);
      } catch { /* non-critical */ }
      logger.info('Cache entries invalidated for path', { path, invalidated });
      return { success: true, invalidated };
    }, { returnOnError: { success: false, invalidated: 0 } }) as Promise<{ success: boolean; invalidated: number }>;
  });
}