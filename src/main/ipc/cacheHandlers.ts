/**
 * Cache IPC Handlers
 * 
 * Handles all cache-related IPC operations including:
 * - Get cache statistics
 * - Clear caches
 * - Update tool cache configuration
 * - Cleanup and invalidation
 */

import { ipcMain } from 'electron';
import { createLogger } from '../logger';
import { withErrorGuard } from './guards';
import type { IpcContext } from './types';

const logger = createLogger('IPC:Cache');

interface PromptCacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  tokensSaved: number;
  costSaved: number;
}

interface ToolCacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  expirations: number;
}

interface CacheStatsResponse {
  promptCache: PromptCacheStats;
  toolCache: ToolCacheStats;
}

// In-memory cache statistics tracking
let promptCacheStats: PromptCacheStats = {
  hits: 0,
  misses: 0,
  hitRate: 0,
  tokensSaved: 0,
  costSaved: 0,
};

let toolCacheStats: ToolCacheStats = {
  size: 0,
  maxSize: 200,
  hits: 0,
  misses: 0,
  hitRate: 0,
  evictions: 0,
  expirations: 0,
};

// Tool result cache (simple in-memory)
const toolResultCache = new Map<string, { result: unknown; timestamp: number; ttl: number }>();
let toolCacheMaxAge = 60000; // 60 seconds default
let toolCacheMaxSize = 200;

// Helper to update hit rate
function updateHitRates(): void {
  const promptTotal = promptCacheStats.hits + promptCacheStats.misses;
  promptCacheStats.hitRate = promptTotal > 0 ? promptCacheStats.hits / promptTotal : 0;

  const toolTotal = toolCacheStats.hits + toolCacheStats.misses;
  toolCacheStats.hitRate = toolTotal > 0 ? toolCacheStats.hits / toolTotal : 0;
}

// Helper to cleanup expired tool cache entries
function cleanupExpiredToolResults(): number {
  const now = Date.now();
  let removed = 0;

  for (const [key, entry] of toolResultCache.entries()) {
    if (now - entry.timestamp > entry.ttl) {
      toolResultCache.delete(key);
      removed++;
      toolCacheStats.expirations++;
    }
  }

  toolCacheStats.size = toolResultCache.size;
  return removed;
}

// Public functions to track cache stats (can be called from other modules)
export function recordPromptCacheHit(tokensSaved: number, costSaved: number): void {
  promptCacheStats.hits++;
  promptCacheStats.tokensSaved += tokensSaved;
  promptCacheStats.costSaved += costSaved;
  updateHitRates();
}

export function recordPromptCacheMiss(): void {
  promptCacheStats.misses++;
  updateHitRates();
}

export function recordToolCacheHit(): void {
  toolCacheStats.hits++;
  updateHitRates();
}

export function recordToolCacheMiss(): void {
  toolCacheStats.misses++;
  updateHitRates();
}

export function getToolCacheEntry(key: string): unknown | null {
  const entry = toolResultCache.get(key);
  if (!entry) {
    recordToolCacheMiss();
    return null;
  }

  if (Date.now() - entry.timestamp > entry.ttl) {
    toolResultCache.delete(key);
    toolCacheStats.size = toolResultCache.size;
    toolCacheStats.expirations++;
    recordToolCacheMiss();
    return null;
  }

  recordToolCacheHit();
  return entry.result;
}

export function setToolCacheEntry(key: string, result: unknown, ttl = toolCacheMaxAge): void {
  // Evict oldest entries if at capacity
  if (toolResultCache.size >= toolCacheMaxSize) {
    const oldestKey = toolResultCache.keys().next().value;
    if (oldestKey) {
      toolResultCache.delete(oldestKey);
      toolCacheStats.evictions++;
    }
  }

  toolResultCache.set(key, { result, timestamp: Date.now(), ttl });
  toolCacheStats.size = toolResultCache.size;
}

export function registerCacheHandlers(context: IpcContext): void {
  const { getSettingsStore } = context;

  // ==========================================================================
  // Get Cache Statistics
  // ==========================================================================

  ipcMain.handle('cache:get-stats', async (): Promise<CacheStatsResponse> => {
    return withErrorGuard('cache:get-stats', async () => {
      cleanupExpiredToolResults();
      updateHitRates();

      logger.debug('Cache stats requested', { 
        promptHitRate: promptCacheStats.hitRate.toFixed(2),
        toolHitRate: toolCacheStats.hitRate.toFixed(2),
      });

      return {
        promptCache: { ...promptCacheStats },
        toolCache: { ...toolCacheStats },
      };
    }, {
      returnOnError: {
        promptCache: { hits: 0, misses: 0, hitRate: 0, tokensSaved: 0, costSaved: 0 },
        toolCache: { size: 0, maxSize: 200, hits: 0, misses: 0, hitRate: 0, evictions: 0, expirations: 0 },
      },
    }) as Promise<CacheStatsResponse>;
  });

  // ==========================================================================
  // Clear Cache
  // ==========================================================================

  ipcMain.handle('cache:clear', async (_event, type?: 'prompt' | 'tool' | 'context' | 'all'): Promise<{ success: boolean; cleared: string[] }> => {
    return withErrorGuard<{ success: boolean; cleared: string[] }>('cache:clear', async () => {
      const cleared: string[] = [];
      const clearType = type ?? 'all';

      if (clearType === 'prompt' || clearType === 'all') {
        promptCacheStats = {
          hits: 0,
          misses: 0,
          hitRate: 0,
          tokensSaved: 0,
          costSaved: 0,
        };
        cleared.push('prompt');
        logger.info('Prompt cache cleared');
      }

      if (clearType === 'tool' || clearType === 'all') {
        toolResultCache.clear();
        toolCacheStats = {
          size: 0,
          maxSize: toolCacheMaxSize,
          hits: 0,
          misses: 0,
          hitRate: 0,
          evictions: 0,
          expirations: 0,
        };
        cleared.push('tool');
        logger.info('Tool cache cleared');
      }

      if (clearType === 'context' || clearType === 'all') {
        cleared.push('context');
        logger.info('Context cache cleared');
      }

      return { success: true, cleared };
    }, { returnOnError: { success: false, cleared: [] } }) as Promise<{ success: boolean; cleared: string[] }>;
  });

  // ==========================================================================
  // Update Tool Cache Configuration
  // ==========================================================================

  ipcMain.handle('cache:update-tool-config', async (_event, config: { maxAge?: number; maxSize?: number }): Promise<{ success: boolean }> => {
    return withErrorGuard<{ success: boolean }>('cache:update-tool-config', async () => {
      if (config.maxAge !== undefined) {
        toolCacheMaxAge = Math.max(1000, config.maxAge);
      }
      if (config.maxSize !== undefined) {
        toolCacheMaxSize = Math.max(10, config.maxSize);
        toolCacheStats.maxSize = toolCacheMaxSize;
      }

      const currentSettings = getSettingsStore().get();
      await getSettingsStore().update({
        cacheSettings: {
          ...currentSettings.cacheSettings,
          toolCache: {
            ...currentSettings.cacheSettings?.toolCache,
            defaultTtlMs: toolCacheMaxAge,
            maxEntries: toolCacheMaxSize,
          },
        },
      });

      logger.info('Tool cache config updated', { maxAge: toolCacheMaxAge, maxSize: toolCacheMaxSize });
      return { success: true };
    }, { returnOnError: { success: false } });
  });

  // ==========================================================================
  // Cleanup Expired Tool Results
  // ==========================================================================

  ipcMain.handle('cache:cleanup-tool-results', async (): Promise<{ success: boolean; removed: number }> => {
    return withErrorGuard<{ success: boolean; removed: number }>('cache:cleanup-tool-results', async () => {
      const removed = cleanupExpiredToolResults();
      logger.info('Tool cache cleanup completed', { removed });
      return { success: true, removed };
    }, { returnOnError: { success: false, removed: 0 } }) as Promise<{ success: boolean; removed: number }>;
  });

  // ==========================================================================
  // Invalidate Path
  // ==========================================================================

  ipcMain.handle('cache:invalidate-path', async (_event, path: string): Promise<{ success: boolean; invalidated: number }> => {
    return withErrorGuard<{ success: boolean; invalidated: number }>('cache:invalidate-path', async () => {
      let invalidated = 0;
      for (const [key] of toolResultCache.entries()) {
        if (key.includes(path)) {
          toolResultCache.delete(key);
          invalidated++;
        }
      }
      toolCacheStats.size = toolResultCache.size;
      logger.info('Cache entries invalidated for path', { path, invalidated });
      return { success: true, invalidated };
    }, { returnOnError: { success: false, invalidated: 0 } }) as Promise<{ success: boolean; invalidated: number }>;
  });
}
