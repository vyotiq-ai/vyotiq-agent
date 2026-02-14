/**
 * Filter Manager
 * 
 * Manages ad blocking filter lists from external sources (EasyList, etc.)
 * Filters are downloaded and cached in user data directory, NOT in the codebase.
 */
import { app } from 'electron';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createLogger } from '../../logger';

const logger = createLogger('FilterManager');

// External filter list sources
const FILTER_SOURCES = {
  easylist: 'https://easylist.to/easylist/easylist.txt',
  easyprivacy: 'https://easylist.to/easylist/easyprivacy.txt',
  // Adult content filter list from EasyList official repo
  easylistAdult: 'https://raw.githubusercontent.com/AmineDiro/easylist-adult/master/easylist-adult.txt',
  fanboy: 'https://easylist.to/easylist/fanboy-annoyance.txt',
  ublock: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
} as const;

type FilterSourceKey = keyof typeof FILTER_SOURCES;

interface FilterCache {
  version: string;
  lastUpdated: number;
  domains: Set<string>;
  urlPatterns: RegExp[];
}

interface FilterCacheFile {
  version: string;
  lastUpdated: number;
  domains: string[];
  patterns: string[];
  // Back-compat: older cache files may include this.
  rawRules?: string[];
}

export interface FilterManagerConfig {
  /** Which filter lists to enable */
  enabledLists: FilterSourceKey[];
  /** Custom domains to block (user-defined) */
  customBlockDomains: string[];
  /** Custom domains to allow (user-defined whitelist) */
  customAllowDomains: string[];
  /** Update interval in hours (default: 24) */
  updateIntervalHours: number;
  /** Enable adult content blocking */
  blockAdultContent: boolean;
}

const DEFAULT_CONFIG: FilterManagerConfig = {
  enabledLists: ['easylist', 'easyprivacy'],
  customBlockDomains: [],
  customAllowDomains: [],
  updateIntervalHours: 24,
  // Disabled by default because the bundled third-party list URL is not stable
  // and can lead to repeated 404 warnings on startup.
  blockAdultContent: false,
};

/**
 * Trusted domains that should NEVER be blocked
 * Imported from shared trustedDomains.ts for single source of truth
 */
import { TRUSTED_DOMAINS } from '../trustedDomains';

export class FilterManager extends EventEmitter {
  private config: FilterManagerConfig;
  private cache: FilterCache;
  private cacheDir: string;
  private isInitialized = false;
  private updateTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<FilterManagerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = {
      version: '0.0.0',
      lastUpdated: 0,
      domains: new Set(),
      urlPatterns: [],
    };
    // Store filters in user data directory, not codebase
    this.cacheDir = path.join(app.getPath('userData'), 'adblock-filters');
  }

  /**
   * Initialize the filter manager - loads cached filters or downloads fresh ones
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    logger.info('Initializing FilterManager', { cacheDir: this.cacheDir });

    try {
      // Ensure cache directory exists
      await fs.mkdir(this.cacheDir, { recursive: true });

      // Try to load cached filters
      const loaded = await this.loadCachedFilters();
      
      if (!loaded || this.needsUpdate()) {
        // Download fresh filters
        await this.updateFilters();
      }

      // Schedule periodic updates
      this.scheduleUpdates();
      
      this.isInitialized = true;
      logger.info('FilterManager initialized', {
        domainCount: this.cache.domains.size,
        patternCount: this.cache.urlPatterns.length,
      });
    } catch (error) {
      logger.error('Failed to initialize FilterManager', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Use minimal fallback - don't hardcode, just start empty
      this.isInitialized = true;
    }
  }


  /**
   * Check if a domain should be blocked
   */
  shouldBlockDomain(domain: string): boolean {
    if (!domain) return false;
    
    const lowerDomain = domain.toLowerCase();
    
    // FIRST: Check trusted domains - these are NEVER blocked
    if (this.isTrustedDomain(lowerDomain)) {
      return false;
    }
    
    // Check custom allow list
    if (this.config.customAllowDomains.some(d => 
      lowerDomain === d || lowerDomain.endsWith('.' + d)
    )) {
      return false;
    }
    
    // Check custom block list
    if (this.config.customBlockDomains.some(d => 
      lowerDomain === d || lowerDomain.endsWith('.' + d)
    )) {
      return true;
    }
    
    // Check cached domains from filter lists
    if (this.cache.domains.has(lowerDomain)) {
      return true;
    }
    
    // Check if subdomain of blocked domain
    const parts = lowerDomain.split('.');
    for (let i = 1; i < parts.length; i++) {
      const parentDomain = parts.slice(i).join('.');
      if (this.cache.domains.has(parentDomain)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if domain is in trusted list (never blocked)
   */
  private isTrustedDomain(domain: string): boolean {
    // Direct match
    if (TRUSTED_DOMAINS.has(domain)) {
      return true;
    }
    
    // Check if subdomain of trusted domain
    const parts = domain.split('.');
    for (let i = 1; i < parts.length; i++) {
      const parentDomain = parts.slice(i).join('.');
      if (TRUSTED_DOMAINS.has(parentDomain)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if a URL should be blocked
   */
  shouldBlockUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      
      // FIRST: Never block trusted domains
      if (this.isTrustedDomain(hostname)) {
        return false;
      }
      
      // Check domain against block lists
      if (this.shouldBlockDomain(hostname)) {
        return true;
      }
      
      // Check URL patterns (only for non-trusted domains)
      for (const pattern of this.cache.urlPatterns) {
        if (pattern.test(url)) {
          return true;
        }
      }
      
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Load filters from cache file
   */
  private async loadCachedFilters(): Promise<boolean> {
    try {
      const cacheFile = path.join(this.cacheDir, 'filters.json');
      const data = await fs.readFile(cacheFile, 'utf-8');
      const cached: FilterCacheFile = JSON.parse(data);
      
      this.cache = {
        version: cached.version,
        lastUpdated: cached.lastUpdated,
        domains: new Set(cached.domains),
        urlPatterns: cached.patterns.map(p => new RegExp(p, 'i')),
      };
      
      logger.info('Loaded cached filters', {
        version: cached.version,
        lastUpdated: new Date(cached.lastUpdated).toISOString(),
        domainCount: this.cache.domains.size,
      });
      
      return true;
    } catch {
      logger.debug('No cached filters found, will download fresh');
      return false;
    }
  }

  /**
   * Save filters to cache file
   */
  private async saveCachedFilters(): Promise<void> {
    try {
      const cacheFile = path.join(this.cacheDir, 'filters.json');
      const data: FilterCacheFile = {
        version: this.cache.version,
        lastUpdated: this.cache.lastUpdated,
        domains: Array.from(this.cache.domains),
        patterns: this.cache.urlPatterns.map(p => p.source),
      };
      
      // Keep cache compact; it can be large.
      await fs.writeFile(cacheFile, JSON.stringify(data));
      logger.debug('Saved filters to cache');
    } catch (error) {
      logger.error('Failed to save filters cache', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if filters need updating
   */
  private needsUpdate(): boolean {
    const hoursSinceUpdate = (Date.now() - this.cache.lastUpdated) / (1000 * 60 * 60);
    return hoursSinceUpdate >= this.config.updateIntervalHours;
  }

  /**
   * Download and parse filter lists from external sources
   */
  async updateFilters(): Promise<void> {
    logger.info('Updating filter lists from external sources');
    
    const domains = new Set<string>();
    const patterns: RegExp[] = [];
    
    // Determine which lists to fetch
    const listsToFetch = [...this.config.enabledLists];
    if (this.config.blockAdultContent && !listsToFetch.includes('easylistAdult')) {
      listsToFetch.push('easylistAdult');
    }
    
    for (const listKey of listsToFetch) {
      const url = FILTER_SOURCES[listKey];
      if (!url) continue;
      
      try {
        logger.debug('Fetching filter list', { list: listKey, url });
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Vyotiq-AdBlock/1.0' },
          signal: AbortSignal.timeout(30000),
        });
        
        if (!response.ok) {
          logger.warn('Failed to fetch filter list', { list: listKey, status: response.status });
          continue;
        }
        
        const text = await response.text();
        const parsed = this.parseFilterList(text);
        
        parsed.domains.forEach(d => domains.add(d));
        patterns.push(...parsed.patterns);
        
        logger.info('Parsed filter list', {
          list: listKey,
          domains: parsed.domains.length,
          patterns: parsed.patterns.length,
        });
      } catch (error) {
        logger.warn('Error fetching filter list', {
          list: listKey,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    // Update cache
    this.cache = {
      version: new Date().toISOString().split('T')[0],
      lastUpdated: Date.now(),
      domains,
      urlPatterns: patterns,
    };
    
    // Save to disk
    await this.saveCachedFilters();
    
    this.emit('filters-updated', {
      domainCount: domains.size,
      patternCount: patterns.length,
    });
    
    logger.info('Filter update complete', {
      totalDomains: domains.size,
      totalPatterns: patterns.length,
    });
  }


  /**
   * Parse a filter list (EasyList/AdBlock Plus format)
   */
  private parseFilterList(text: string): { domains: string[]; patterns: RegExp[] } {
    const domains: string[] = [];
    const patterns: RegExp[] = [];
    
    const lines = text.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('[')) {
        continue;
      }
      
      // Parse domain rules: ||domain.com^
      const domainMatch = trimmed.match(/^\|\|([a-z0-9.-]+)\^?$/i);
      if (domainMatch) {
        domains.push(domainMatch[1].toLowerCase());
        continue;
      }
      
      // Parse domain rules with path: ||domain.com/path
      const domainPathMatch = trimmed.match(/^\|\|([a-z0-9.-]+)\//i);
      if (domainPathMatch) {
        domains.push(domainPathMatch[1].toLowerCase());
        continue;
      }
      
      // Parse URL patterns (convert to regex)
      // Skip complex rules with options for now
      if (trimmed.includes('$') || trimmed.includes('@@') || trimmed.includes('##')) {
        continue;
      }
      
      // Convert simple wildcard patterns to regex
      if (trimmed.includes('*') || trimmed.startsWith('/')) {
        try {
          const regexStr = this.convertToRegex(trimmed);
          if (regexStr) {
            patterns.push(new RegExp(regexStr, 'i'));
          }
        } catch {
          // Invalid regex, skip
        }
      }
    }
    
    return { domains, patterns };
  }

  /**
   * Clear in-memory filters (keeps config + scheduled updates).
   * Useful for memory-pressure recovery.
   */
  clearMemory(): void {
    this.cache.domains.clear();
    this.cache.urlPatterns = [];
    this.cache.lastUpdated = Date.now();
  }

  /**
   * Convert AdBlock filter syntax to regex
   */
  private convertToRegex(filter: string): string | null {
    let pattern = filter;
    
    // Handle regex filters (start and end with /)
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      return pattern.slice(1, -1);
    }
    
    // Escape special regex characters except *
    pattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    
    // Convert wildcards
    pattern = pattern.replace(/\*/g, '.*');
    
    // Handle separator (^)
    pattern = pattern.replace(/\\\^/g, '([^a-zA-Z0-9_.-]|$)');
    
    // Handle start anchor (||)
    if (pattern.startsWith('\\|\\|')) {
      pattern = '^https?://([a-z0-9-]+\\.)*' + pattern.slice(4);
    } else if (pattern.startsWith('\\|')) {
      pattern = '^' + pattern.slice(2);
    }
    
    // Handle end anchor (|)
    if (pattern.endsWith('\\|')) {
      pattern = pattern.slice(0, -2) + '$';
    }
    
    return pattern;
  }

  /**
   * Schedule periodic filter updates
   */
  private scheduleUpdates(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
    
    const intervalMs = this.config.updateIntervalHours * 60 * 60 * 1000;
    this.updateTimer = setInterval(() => {
      this.updateFilters().catch(err => {
        logger.error('Scheduled filter update failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, intervalMs);
    
    logger.debug('Scheduled filter updates', { intervalHours: this.config.updateIntervalHours });
  }

  /**
   * Add a custom domain to block
   */
  addCustomBlockDomain(domain: string): void {
    const lower = domain.toLowerCase();
    if (!this.config.customBlockDomains.includes(lower)) {
      this.config.customBlockDomains.push(lower);
      this.emit('config-changed', this.config);
    }
  }

  /**
   * Remove a custom blocked domain
   */
  removeCustomBlockDomain(domain: string): void {
    const lower = domain.toLowerCase();
    this.config.customBlockDomains = this.config.customBlockDomains.filter(d => d !== lower);
    this.emit('config-changed', this.config);
  }

  /**
   * Add a custom domain to allow list
   */
  addCustomAllowDomain(domain: string): void {
    const lower = domain.toLowerCase();
    if (!this.config.customAllowDomains.includes(lower)) {
      this.config.customAllowDomains.push(lower);
      this.emit('config-changed', this.config);
    }
  }

  /**
   * Remove a custom allowed domain
   */
  removeCustomAllowDomain(domain: string): void {
    const lower = domain.toLowerCase();
    this.config.customAllowDomains = this.config.customAllowDomains.filter(d => d !== lower);
    this.emit('config-changed', this.config);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FilterManagerConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config-changed', this.config);
    
    // Re-schedule updates if interval changed
    if (config.updateIntervalHours !== undefined) {
      this.scheduleUpdates();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): FilterManagerConfig {
    return { ...this.config };
  }

  /**
   * Get filter statistics
   */
  getStats(): { domainCount: number; patternCount: number; lastUpdated: number; version: string } {
    return {
      domainCount: this.cache.domains.size,
      patternCount: this.cache.urlPatterns.length,
      lastUpdated: this.cache.lastUpdated,
      version: this.cache.version,
    };
  }

  /**
   * Force a filter update
   */
  async forceUpdate(): Promise<void> {
    await this.updateFilters();
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }
}

// Singleton instance
let filterManagerInstance: FilterManager | null = null;

export function getFilterManager(): FilterManager {
  if (!filterManagerInstance) {
    filterManagerInstance = new FilterManager();
  }
  return filterManagerInstance;
}

export function initFilterManager(config?: Partial<FilterManagerConfig>): FilterManager {
  if (!filterManagerInstance) {
    filterManagerInstance = new FilterManager(config);
  } else if (config) {
    filterManagerInstance.updateConfig(config);
  }
  return filterManagerInstance;
}
