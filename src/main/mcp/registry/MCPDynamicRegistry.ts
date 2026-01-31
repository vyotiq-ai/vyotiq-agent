/**
 * MCP Dynamic Registry
 * 
 * Unified registry that fetches and aggregates MCP servers from multiple sources.
 * Provides search, caching, and real-time discovery capabilities.
 * 
 * @module main/mcp/registry/MCPDynamicRegistry
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../logger';
import { getMCPRegistryCache, initializeMCPRegistryCache, MCPRegistryCacheManager } from './cache';
import {
  fetchFromSmithery,
  fetchFromNPM,
  fetchFromPyPI,
  fetchFromGitHub,
  fetchFromGlama,
  fetchFromCustomRegistry,
} from './fetchers';
import type {
  MCPRegistrySource,
  MCPRegistryListing,
  MCPRegistryConfig,
  MCPRegistryFetchOptions,
  MCPRegistryFetchResult,
} from './types';
import type { MCPServerCategory, MCPStoreListing } from '../../../shared/types/mcp';

const logger = createLogger('MCPDynamicRegistry');

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_REGISTRY_CONFIGS: MCPRegistryConfig[] = [
  {
    source: 'smithery',
    enabled: true,
    priority: 1,
    baseUrl: 'https://registry.smithery.ai',
    rateLimitPerMinute: 60,
    cacheTtlMs: 30 * 60 * 1000,
  },
  {
    source: 'npm',
    enabled: true,
    priority: 2,
    baseUrl: 'https://registry.npmjs.org',
    rateLimitPerMinute: 100,
    cacheTtlMs: 60 * 60 * 1000,
  },
  {
    source: 'github',
    enabled: true,
    priority: 3,
    baseUrl: 'https://api.github.com',
    rateLimitPerMinute: 60,
    cacheTtlMs: 60 * 60 * 1000,
  },
  {
    source: 'pypi',
    enabled: true,
    priority: 4,
    baseUrl: 'https://pypi.org',
    rateLimitPerMinute: 100,
    cacheTtlMs: 60 * 60 * 1000,
  },
  {
    source: 'glama',
    enabled: false, // Disabled by default until API is confirmed
    priority: 5,
    baseUrl: 'https://glama.ai',
    rateLimitPerMinute: 30,
    cacheTtlMs: 30 * 60 * 1000,
  },
];

// =============================================================================
// Event Types
// =============================================================================

export interface MCPDynamicRegistryEvents {
  'refresh:started': () => void;
  'refresh:progress': (source: MCPRegistrySource, count: number) => void;
  'refresh:completed': (result: MCPRegistryFetchResult) => void;
  'refresh:failed': (source: MCPRegistrySource, error: string) => void;
}

// =============================================================================
// Dynamic Registry Implementation
// =============================================================================

export class MCPDynamicRegistry extends EventEmitter {
  private configs: MCPRegistryConfig[];
  private customRegistryUrls: string[] = [];
  private cache: MCPRegistryCacheManager;
  private isRefreshing = false;
  private lastRefreshTime = 0;
  private initialized = false;

  constructor(configs?: Partial<MCPRegistryConfig>[]) {
    super();
    this.configs = this.mergeConfigs(configs);
    this.cache = getMCPRegistryCache();
  }

  private mergeConfigs(overrides?: Partial<MCPRegistryConfig>[]): MCPRegistryConfig[] {
    const configs = [...DEFAULT_REGISTRY_CONFIGS];

    if (overrides) {
      for (const override of overrides) {
        const existing = configs.find((c) => c.source === override.source);
        if (existing) {
          Object.assign(existing, override);
        } else if (override.source) {
          configs.push(override as MCPRegistryConfig);
        }
      }
    }

    return configs.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Initialize the registry and cache
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await initializeMCPRegistryCache();
    this.initialized = true;

    logger.info('Dynamic registry initialized', {
      enabledSources: this.getEnabledSources(),
    });
  }

  /**
   * Get enabled registry sources
   */
  getEnabledSources(): MCPRegistrySource[] {
    return this.configs.filter((c) => c.enabled).map((c) => c.source);
  }

  /**
   * Enable or disable a registry source
   */
  setSourceEnabled(source: MCPRegistrySource, enabled: boolean): void {
    const config = this.configs.find((c) => c.source === source);
    if (config) {
      config.enabled = enabled;
    }
  }

  /**
   * Add custom registry URLs
   */
  setCustomRegistries(urls: string[]): void {
    this.customRegistryUrls = urls;
    // Clear custom cache
    this.cache.clear('custom');
  }

  /**
   * Get custom registry URLs
   */
  getCustomRegistries(): string[] {
    return [...this.customRegistryUrls];
  }

  /**
   * Search for MCP servers across all sources
   */
  async search(options?: MCPRegistryFetchOptions): Promise<MCPRegistryFetchResult> {
    await this.initialize();

    const sources = options?.sources ?? this.getEnabledSources();
    const forceRefresh = options?.forceRefresh ?? false;
    const query = options?.query?.trim() ?? '';

    logger.debug('Searching registry', { sources, query, forceRefresh });

    // Check cache first if not forcing refresh and no query
    if (!forceRefresh && !query) {
      const cached = this.cache.getAll();
      if (cached.length > 0) {
        logger.debug('Using cached results', { count: cached.length });
        return {
          listings: this.filterListings(cached, options),
          fetchedSources: [],
          failedSources: [],
          total: cached.length,
          hasMore: false,
          fromCache: true,
        };
      }
    }

    // Query-based search on cache if we have data
    if (query && !forceRefresh) {
      const searchResults = this.cache.search(query, {
        sources,
        category: options?.category,
        limit: options?.limit,
      });

      if (searchResults.length > 0) {
        return {
          listings: searchResults,
          fetchedSources: [],
          failedSources: [],
          total: searchResults.length,
          hasMore: false,
          fromCache: true,
        };
      }
    }

    // Fetch from sources
    return this.fetchFromSources(sources, options);
  }

  /**
   * Get featured/popular servers
   */
  async getFeatured(limit = 20): Promise<MCPRegistryListing[]> {
    await this.initialize();

    // Prefer Smithery for featured servers
    const cached = this.cache.get('smithery') ?? this.cache.get('github');

    if (cached && cached.length > 0) {
      return cached
        .filter((l) => l.verified || (l.downloads ?? 0) > 100)
        .sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0))
        .slice(0, limit);
    }

    // Fetch if no cache
    const result = await this.search({ sources: ['smithery', 'github'], limit });
    return result.listings
      .filter((l) => l.verified || (l.downloads ?? 0) > 100)
      .slice(0, limit);
  }

  /**
   * Get category counts
   */
  async getCategories(): Promise<Array<{ category: MCPServerCategory; count: number }>> {
    await this.initialize();

    const listings = this.cache.getAll();
    const counts = new Map<MCPServerCategory, number>();

    for (const listing of listings) {
      counts.set(listing.category, (counts.get(listing.category) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get server details by ID
   */
  async getServerDetails(id: string): Promise<MCPRegistryListing | null> {
    await this.initialize();

    const all = this.cache.getAll();
    return all.find((l) => l.id === id || l.installCommand === id) ?? null;
  }

  /**
   * Refresh all enabled sources
   */
  async refresh(options?: { force?: boolean }): Promise<MCPRegistryFetchResult> {
    await this.initialize();

    const force = options?.force ?? false;

    // If not forcing and we have recent data, return cached
    if (!force && this.lastRefreshTime > 0) {
      const timeSinceRefresh = Date.now() - this.lastRefreshTime;
      const minRefreshInterval = 60000; // 1 minute minimum between refreshes
      
      if (timeSinceRefresh < minRefreshInterval) {
        logger.debug('Skipping refresh, too recent', { timeSinceRefresh, minRefreshInterval });
        return {
          listings: this.cache.getAll(),
          fetchedSources: [],
          failedSources: [],
          total: this.cache.getAll().length,
          hasMore: false,
          fromCache: true,
        };
      }
    }

    if (this.isRefreshing) {
      logger.warn('Refresh already in progress');
      return {
        listings: this.cache.getAll(),
        fetchedSources: [],
        failedSources: [],
        total: 0,
        hasMore: false,
        fromCache: true,
      };
    }

    const sources = this.getEnabledSources();
    this.emit('refresh:started');

    // Clear cache if forcing refresh
    if (force) {
      logger.info('Force refresh requested, clearing cache');
      this.cache.clear();
    }

    const result = await this.fetchFromSources(sources, { forceRefresh: force });
    this.cache.markFullRefresh();
    this.lastRefreshTime = Date.now();

    this.emit('refresh:completed', result);
    return result;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear cache
   */
  clearCache(source?: MCPRegistrySource): void {
    this.cache.clear(source);
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  private async fetchFromSources(
    sources: MCPRegistrySource[],
    options?: MCPRegistryFetchOptions
  ): Promise<MCPRegistryFetchResult> {
    this.isRefreshing = true;

    const allListings: MCPRegistryListing[] = [];
    const fetchedSources: MCPRegistrySource[] = [];
    const failedSources: Array<{ source: MCPRegistrySource; error: string }> = [];

    // Fetch from each source in parallel
    const fetchPromises = sources.map(async (source) => {
      try {
        const listings = await this.fetchFromSource(source, options);

        if (listings.length > 0) {
          this.cache.set(source, listings);
          fetchedSources.push(source);
          this.emit('refresh:progress', source, listings.length);
        }

        return listings;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        failedSources.push({ source, error: errorMsg });
        this.emit('refresh:failed', source, errorMsg);
        return [];
      }
    });

    // Also fetch from custom registries if any
    if (this.customRegistryUrls.length > 0) {
      for (const url of this.customRegistryUrls) {
        try {
          const { listings } = await fetchFromCustomRegistry(url, {
            timeoutMs: options?.timeoutMs,
          });
          allListings.push(...listings);
        } catch (error) {
          logger.warn('Failed to fetch custom registry', {
            url,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const results = await Promise.all(fetchPromises);

    for (const listings of results) {
      allListings.push(...listings);
    }

    this.isRefreshing = false;

    // Deduplicate by installCommand
    const deduplicated = this.deduplicateListings(allListings);

    return {
      listings: this.filterListings(deduplicated, options),
      fetchedSources,
      failedSources,
      total: deduplicated.length,
      hasMore: false,
      fromCache: false,
    };
  }

  private async fetchFromSource(
    source: MCPRegistrySource,
    options?: MCPRegistryFetchOptions
  ): Promise<MCPRegistryListing[]> {
    const config = this.configs.find((c) => c.source === source);
    if (!config || !config.enabled) {
      return [];
    }

    const timeoutMs = options?.timeoutMs ?? 15000;
    const limit = options?.limit ?? 100; // Increased default limit to get more servers
    const query = options?.query;

    switch (source) {
      case 'smithery': {
        const result = await fetchFromSmithery({ limit, query, timeoutMs });
        return result.listings;
      }
      case 'npm': {
        const result = await fetchFromNPM({ limit, query, timeoutMs });
        return result.listings;
      }
      case 'pypi': {
        const result = await fetchFromPyPI({ limit, query, timeoutMs });
        return result.listings;
      }
      case 'github': {
        const result = await fetchFromGitHub({ limit, timeoutMs });
        return result.listings;
      }
      case 'glama': {
        const result = await fetchFromGlama({ limit, query, timeoutMs });
        return result.listings;
      }
      default:
        return [];
    }
  }

  private filterListings(
    listings: MCPRegistryListing[],
    options?: MCPRegistryFetchOptions
  ): MCPRegistryListing[] {
    let filtered = [...listings];

    // Category filter
    if (options?.category) {
      filtered = filtered.filter((l) => l.category === options.category);
    }

    // Tags filter
    if (options?.tags && options.tags.length > 0) {
      filtered = filtered.filter((l) =>
        options.tags!.some((tag) => l.tags.includes(tag))
      );
    }

    // Query filter
    if (options?.query) {
      const query = options.query.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.name.toLowerCase().includes(query) ||
          l.description.toLowerCase().includes(query) ||
          l.tags.some((t) => t.toLowerCase().includes(query))
      );
    }

    // Sort by priority: verified first, then by downloads
    filtered.sort((a, b) => {
      if (a.verified !== b.verified) return a.verified ? -1 : 1;
      return (b.downloads ?? 0) - (a.downloads ?? 0);
    });

    // Limit
    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  private deduplicateListings(listings: MCPRegistryListing[]): MCPRegistryListing[] {
    const seen = new Map<string, MCPRegistryListing>();

    for (const listing of listings) {
      const key = listing.installCommand.toLowerCase();
      const existing = seen.get(key);

      // Keep the one with more data or higher priority source
      if (!existing || this.isHigherPriority(listing, existing)) {
        seen.set(key, listing);
      }
    }

    return Array.from(seen.values());
  }

  private isHigherPriority(a: MCPRegistryListing, b: MCPRegistryListing): boolean {
    // Prefer verified
    if (a.verified && !b.verified) return true;
    if (!a.verified && b.verified) return false;

    // Prefer higher downloads
    if ((a.downloads ?? 0) > (b.downloads ?? 0)) return true;

    // Prefer certain sources
    const priority: Record<MCPRegistrySource, number> = {
      github: 1,
      smithery: 2,
      npm: 3,
      pypi: 4,
      glama: 5,
      custom: 6,
    };

    return priority[a.registrySource] < priority[b.registrySource];
  }

  /**
   * Convert registry listing to store listing format
   */
  toStoreListing(listing: MCPRegistryListing): MCPStoreListing {
    return {
      id: listing.id,
      name: listing.name,
      description: listing.description,
      longDescription: listing.longDescription,
      version: listing.version,
      author: listing.author,
      authorUrl: listing.authorUrl,
      homepage: listing.homepage,
      repository: listing.repository,
      license: listing.license,
      icon: listing.icon,
      category: listing.category,
      tags: listing.tags,
      source: listing.source,
      installCommand: listing.installCommand,
      transportTemplate: listing.transportTemplate ?? {},
      requiredEnv: listing.requiredEnv,
      downloads: listing.downloads,
      stars: listing.stars,
      updatedAt: listing.updatedAt,
      verified: listing.verified,
      exampleTools: listing.exampleTools,
    };
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

let registryInstance: MCPDynamicRegistry | null = null;

export function getMCPDynamicRegistry(): MCPDynamicRegistry {
  if (!registryInstance) {
    registryInstance = new MCPDynamicRegistry();
  }
  return registryInstance;
}

export async function initializeMCPDynamicRegistry(): Promise<MCPDynamicRegistry> {
  const registry = getMCPDynamicRegistry();
  await registry.initialize();
  return registry;
}

export function shutdownMCPDynamicRegistry(): void {
  registryInstance = null;
}
