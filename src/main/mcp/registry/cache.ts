/**
 * MCP Registry Cache
 * 
 * In-memory and file-based cache for registry listings.
 * Provides fast access to server metadata with TTL-based invalidation.
 * 
 * @module main/mcp/registry/cache
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import { createLogger } from '../../logger';
import type {
  MCPRegistrySource,
  MCPRegistryListing,
  MCPRegistryCache,
  MCPRegistryCacheStore,
} from './types';

const logger = createLogger('MCPRegistryCache');

// =============================================================================
// Constants
// =============================================================================

/** Default cache TTL per source (in milliseconds) */
const DEFAULT_CACHE_TTL: Record<MCPRegistrySource, number> = {
  smithery: 30 * 60 * 1000,    // 30 minutes - frequently updated
  npm: 60 * 60 * 1000,         // 1 hour - npm is stable
  pypi: 60 * 60 * 1000,        // 1 hour
  github: 60 * 60 * 1000,      // 1 hour
  glama: 30 * 60 * 1000,       // 30 minutes
  custom: 15 * 60 * 1000,      // 15 minutes - user-defined may change
};

/** Maximum cache age before forced refresh (24 hours) */
const MAX_CACHE_AGE = 24 * 60 * 60 * 1000;

// =============================================================================
// Cache Manager
// =============================================================================

export class MCPRegistryCacheManager {
  private memoryCache: MCPRegistryCacheStore;
  private cacheFilePath: string;
  private initialized = false;
  private customTtls: Partial<Record<MCPRegistrySource, number>> = {};

  constructor() {
    this.cacheFilePath = path.join(app.getPath('userData'), 'mcp-registry-cache.json');
    this.memoryCache = this.createEmptyStore();
  }

  private createEmptyStore(): MCPRegistryCacheStore {
    return {
      sources: {} as Record<MCPRegistrySource, MCPRegistryCache>,
      lastFullRefresh: 0,
    };
  }

  /**
   * Initialize cache from disk
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const data = await fs.readFile(this.cacheFilePath, 'utf-8');
      const parsed = JSON.parse(data) as MCPRegistryCacheStore;

      // Validate and filter expired entries
      this.memoryCache = this.validateAndCleanCache(parsed);
      this.initialized = true;

      logger.info('Registry cache loaded', {
        sources: Object.keys(this.memoryCache.sources).length,
        totalListings: this.getTotalListings(),
      });
    } catch (err) {
      // Cache doesn't exist or is invalid - start fresh
      this.memoryCache = this.createEmptyStore();
      this.initialized = true;
      logger.debug('Starting with empty registry cache', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Validate cache and remove expired entries
   */
  private validateAndCleanCache(cache: MCPRegistryCacheStore): MCPRegistryCacheStore {
    const now = Date.now();
    const cleaned: MCPRegistryCacheStore = {
      sources: {} as Record<MCPRegistrySource, MCPRegistryCache>,
      lastFullRefresh: cache.lastFullRefresh || 0,
    };

    for (const [source, data] of Object.entries(cache.sources)) {
      const ttl = this.getTtl(source as MCPRegistrySource);
      const age = now - data.cachedAt;

      // Keep if within TTL or max age
      if (age < ttl || age < MAX_CACHE_AGE) {
        cleaned.sources[source as MCPRegistrySource] = data;
      } else {
        logger.debug(`Evicting expired cache for ${source}`, { age, ttl });
      }
    }

    return cleaned;
  }

  /**
   * Get TTL for a source
   */
  private getTtl(source: MCPRegistrySource): number {
    return this.customTtls[source] ?? DEFAULT_CACHE_TTL[source] ?? 60 * 60 * 1000;
  }

  /**
   * Set custom TTL for a source
   */
  setTtl(source: MCPRegistrySource, ttlMs: number): void {
    this.customTtls[source] = ttlMs;
  }

  /**
   * Get cached listings for a source
   */
  get(source: MCPRegistrySource): MCPRegistryListing[] | null {
    const cached = this.memoryCache.sources[source];
    if (!cached) return null;

    const ttl = this.getTtl(source);
    const age = Date.now() - cached.cachedAt;

    if (age > ttl) {
      logger.debug(`Cache expired for ${source}`, { age, ttl });
      return null;
    }

    return cached.listings;
  }

  /**
   * Get all cached listings
   */
  getAll(): MCPRegistryListing[] {
    const all: MCPRegistryListing[] = [];

    for (const data of Object.values(this.memoryCache.sources)) {
      all.push(...data.listings);
    }

    return all;
  }

  /**
   * Check if cache is fresh for a source
   */
  isFresh(source: MCPRegistrySource): boolean {
    const cached = this.memoryCache.sources[source];
    if (!cached) return false;

    const ttl = this.getTtl(source);
    return Date.now() - cached.cachedAt < ttl;
  }

  /**
   * Set cache for a source
   */
  set(source: MCPRegistrySource, listings: MCPRegistryListing[]): void {
    this.memoryCache.sources[source] = {
      listings,
      cachedAt: Date.now(),
      source,
    };

    // Persist asynchronously
    this.persistAsync();
  }

  /**
   * Clear cache for a source or all sources
   */
  clear(source?: MCPRegistrySource): void {
    if (source) {
      delete this.memoryCache.sources[source];
    } else {
      this.memoryCache = this.createEmptyStore();
    }

    this.persistAsync();
  }

  /**
   * Get total number of cached listings
   */
  private getTotalListings(): number {
    return Object.values(this.memoryCache.sources)
      .reduce((sum, cache) => sum + cache.listings.length, 0);
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    sources: Record<MCPRegistrySource, { count: number; age: number; fresh: boolean }>;
    total: number;
    lastFullRefresh: number;
  } {
    const now = Date.now();
    const sources: Record<string, { count: number; age: number; fresh: boolean }> = {};

    for (const [source, data] of Object.entries(this.memoryCache.sources)) {
      const age = now - data.cachedAt;
      const ttl = this.getTtl(source as MCPRegistrySource);
      sources[source] = {
        count: data.listings.length,
        age,
        fresh: age < ttl,
      };
    }

    return {
      sources: sources as Record<MCPRegistrySource, { count: number; age: number; fresh: boolean }>,
      total: this.getTotalListings(),
      lastFullRefresh: this.memoryCache.lastFullRefresh,
    };
  }

  /**
   * Mark full refresh completed
   */
  markFullRefresh(): void {
    this.memoryCache.lastFullRefresh = Date.now();
    this.persistAsync();
  }

  /**
   * Persist cache to disk asynchronously
   */
  private async persistAsync(): Promise<void> {
    try {
      const data = JSON.stringify(this.memoryCache, null, 2);
      await fs.writeFile(this.cacheFilePath, data, 'utf-8');
    } catch (error) {
      logger.warn('Failed to persist registry cache', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Search cached listings
   */
  search(query: string, options?: {
    sources?: MCPRegistrySource[];
    category?: string;
    limit?: number;
  }): MCPRegistryListing[] {
    const queryLower = query.toLowerCase();
    const limit = options?.limit ?? 50;
    const results: MCPRegistryListing[] = [];

    for (const [source, data] of Object.entries(this.memoryCache.sources)) {
      if (options?.sources && !options.sources.includes(source as MCPRegistrySource)) {
        continue;
      }

      for (const listing of data.listings) {
        // Category filter
        if (options?.category && listing.category !== options.category) {
          continue;
        }

        // Text search
        const matches =
          listing.name.toLowerCase().includes(queryLower) ||
          listing.description.toLowerCase().includes(queryLower) ||
          listing.tags.some((t) => t.toLowerCase().includes(queryLower)) ||
          listing.author.toLowerCase().includes(queryLower);

        if (matches) {
          results.push(listing);
        }
      }
    }

    // Sort by relevance (name match first, then verified, then downloads)
    results.sort((a, b) => {
      const aNameMatch = a.name.toLowerCase().includes(queryLower) ? 1 : 0;
      const bNameMatch = b.name.toLowerCase().includes(queryLower) ? 1 : 0;
      if (aNameMatch !== bNameMatch) return bNameMatch - aNameMatch;
      if (a.verified !== b.verified) return a.verified ? -1 : 1;
      return (b.downloads ?? 0) - (a.downloads ?? 0);
    });

    return results.slice(0, limit);
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

let cacheInstance: MCPRegistryCacheManager | null = null;

export function getMCPRegistryCache(): MCPRegistryCacheManager {
  if (!cacheInstance) {
    cacheInstance = new MCPRegistryCacheManager();
  }
  return cacheInstance;
}

export async function initializeMCPRegistryCache(): Promise<MCPRegistryCacheManager> {
  const cache = getMCPRegistryCache();
  await cache.initialize();
  return cache;
}

export function shutdownMCPRegistryCache(): void {
  cacheInstance = null;
}
