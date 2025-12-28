/**
 * Gemini Context Caching Service
 * 
 * Implements explicit context caching for the Gemini API to reduce costs
 * when repeatedly using the same system instructions, documents, or files.
 * 
 * Key Features:
 * - Create cached content with system instructions and files
 * - Auto-manage cache TTL and expiration
 * - Reference cached content in generateContent calls
 * - Track cache usage and cost savings
 * 
 * Requirements:
 * - Minimum 1024 tokens for 2.5 Flash, 4096 tokens for 2.5 Pro/3 Pro
 * - Model must use explicit version suffix (e.g., gemini-2.5-flash-001)
 * - Cached content is immutable; only TTL can be updated
 * 
 * @see https://ai.google.dev/gemini-api/docs/caching
 * @see https://ai.google.dev/api/caching
 */

import { createLogger } from '../../logger';

const logger = createLogger('GeminiCacheService');

/**
 * Content part for caching (text or file reference)
 */
export interface CacheContentPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  fileData?: {
    mimeType: string;
    fileUri: string;
  };
}

/**
 * Tool definition for cached content
 */
export interface CacheToolDefinition {
  functionDeclarations?: Array<{
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
  }>;
}

/**
 * Configuration for creating a cache
 */
export interface CreateCacheConfig {
  /** Display name for the cache (max 128 chars) */
  displayName?: string;
  /** Model to use (must include version suffix, e.g., gemini-2.5-flash-001) */
  model: string;
  /** System instruction to cache */
  systemInstruction?: string;
  /** Content parts to cache */
  contents?: Array<{
    role: 'user' | 'model';
    parts: CacheContentPart[];
  }>;
  /** Tools to cache */
  tools?: CacheToolDefinition[];
  /** Time-to-live in seconds (e.g., "3600s" for 1 hour) */
  ttl?: string;
  /** Expiration time (ISO 8601 format with timezone) */
  expireTime?: string;
}

/**
 * Cached content resource returned from API
 */
export interface CachedContent {
  /** Resource name (e.g., cachedContents/abc123) */
  name: string;
  /** Display name */
  displayName?: string;
  /** Model this cache is for */
  model: string;
  /** Creation time */
  createTime: string;
  /** Last update time */
  updateTime: string;
  /** Expiration time */
  expireTime: string;
  /** Usage metadata */
  usageMetadata?: {
    totalTokenCount: number;
  };
}

/**
 * Configuration for updating a cache
 */
export interface UpdateCacheConfig {
  /** New TTL in seconds (e.g., "3600s") */
  ttl?: string;
  /** New expiration time (ISO 8601 format) */
  expireTime?: string;
}

/**
 * Cache list response
 */
export interface ListCachesResponse {
  cachedContents: CachedContent[];
  nextPageToken?: string;
}

/**
 * In-memory cache entry for tracking active caches
 */
interface CacheEntry {
  cache: CachedContent;
  lastUsed: number;
  hitCount: number;
  /** Hash of the content to detect changes */
  contentHash: string;
}

/**
 * Service for managing Gemini context caching
 */
export class GeminiCacheService {
  private readonly baseUrl: string;
  private apiKey: string | undefined;
  
  /** In-memory cache of active cache entries */
  private activeCaches = new Map<string, CacheEntry>();
  
  /** Cache lookup by content hash */
  private cacheByHash = new Map<string, string>(); // hash -> cache name
  
  /** Default TTL: 1 hour */
  private readonly defaultTtl = '3600s';
  
  /** Minimum token counts by model */
  private readonly minTokenCounts: Record<string, number> = {
    'gemini-2.5-flash': 1024,
    'gemini-2.5-pro': 4096,
    'gemini-3-pro': 4096,
    'default': 4096,
  };

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  }

  /**
   * Set or update the API key
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Get minimum token count for a model
   */
  getMinTokenCount(model: string): number {
    const normalizedModel = model.toLowerCase();
    for (const [key, value] of Object.entries(this.minTokenCounts)) {
      if (normalizedModel.includes(key)) {
        return value;
      }
    }
    return this.minTokenCounts['default'];
  }

  /**
   * Generate a hash of the content for cache lookup
   */
  private generateContentHash(config: CreateCacheConfig): string {
    const hashInput = JSON.stringify({
      model: config.model,
      systemInstruction: config.systemInstruction,
      contents: config.contents,
      tools: config.tools,
    });
    
    // Simple hash function for content comparison
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Check if we have a valid cache for the given content
   */
  async findExistingCache(config: CreateCacheConfig): Promise<CachedContent | null> {
    const contentHash = this.generateContentHash(config);
    
    // Check in-memory cache first
    const cachedName = this.cacheByHash.get(contentHash);
    if (cachedName) {
      const entry = this.activeCaches.get(cachedName);
      if (entry) {
        // Verify the cache is still valid
        const expireTime = new Date(entry.cache.expireTime).getTime();
        if (expireTime > Date.now()) {
          entry.lastUsed = Date.now();
          entry.hitCount++;
          logger.debug('Found existing cache in memory', {
            name: cachedName,
            hitCount: entry.hitCount,
          });
          return entry.cache;
        } else {
          // Cache expired, clean up
          this.activeCaches.delete(cachedName);
          this.cacheByHash.delete(contentHash);
        }
      }
    }
    
    return null;
  }

  /**
   * Create a new cached content resource
   */
  async createCache(config: CreateCacheConfig): Promise<CachedContent> {
    if (!this.apiKey) {
      throw new Error('API key not set');
    }

    // Check for existing cache with same content
    const existing = await this.findExistingCache(config);
    if (existing) {
      logger.info('Reusing existing cache', { name: existing.name });
      return existing;
    }

    const url = `${this.baseUrl}/cachedContents?key=${this.apiKey}`;
    
    // Build request body
    const body: Record<string, unknown> = {
      model: config.model.startsWith('models/') ? config.model : `models/${config.model}`,
    };

    if (config.displayName) {
      body.displayName = config.displayName;
    }

    if (config.systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: config.systemInstruction }],
      };
    }

    if (config.contents && config.contents.length > 0) {
      body.contents = config.contents;
    }

    if (config.tools && config.tools.length > 0) {
      body.tools = config.tools;
    }

    // Set expiration
    if (config.ttl) {
      body.ttl = config.ttl;
    } else if (config.expireTime) {
      body.expireTime = config.expireTime;
    } else {
      body.ttl = this.defaultTtl;
    }

    logger.debug('Creating cache', {
      model: config.model,
      displayName: config.displayName,
      hasSystemInstruction: !!config.systemInstruction,
      contentsCount: config.contents?.length || 0,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to create cache', {
        status: response.status,
        error: errorText,
      });
      throw new Error(`Failed to create cache: ${response.status} ${errorText}`);
    }

    const cache = await response.json() as CachedContent;
    
    // Store in memory cache
    const contentHash = this.generateContentHash(config);
    this.activeCaches.set(cache.name, {
      cache,
      lastUsed: Date.now(),
      hitCount: 0,
      contentHash,
    });
    this.cacheByHash.set(contentHash, cache.name);

    logger.info('Cache created successfully', {
      name: cache.name,
      tokenCount: cache.usageMetadata?.totalTokenCount,
      expireTime: cache.expireTime,
    });

    return cache;
  }

  /**
   * Get a specific cached content by name
   */
  async getCache(name: string): Promise<CachedContent> {
    if (!this.apiKey) {
      throw new Error('API key not set');
    }

    // Normalize name format
    const resourceName = name.startsWith('cachedContents/') ? name : `cachedContents/${name}`;
    const url = `${this.baseUrl}/${resourceName}?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get cache: ${response.status} ${errorText}`);
    }

    const cache = await response.json() as CachedContent;
    
    // Update in-memory entry if exists
    const entry = this.activeCaches.get(cache.name);
    if (entry) {
      entry.cache = cache;
      entry.lastUsed = Date.now();
    }

    return cache;
  }

  /**
   * List all cached contents
   */
  async listCaches(pageSize?: number, pageToken?: string): Promise<ListCachesResponse> {
    if (!this.apiKey) {
      throw new Error('API key not set');
    }

    const params = new URLSearchParams({ key: this.apiKey });
    if (pageSize) {
      params.append('pageSize', pageSize.toString());
    }
    if (pageToken) {
      params.append('pageToken', pageToken);
    }

    const url = `${this.baseUrl}/cachedContents?${params}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list caches: ${response.status} ${errorText}`);
    }

    return await response.json() as ListCachesResponse;
  }

  /**
   * Update a cache's TTL or expiration time
   */
  async updateCache(name: string, config: UpdateCacheConfig): Promise<CachedContent> {
    if (!this.apiKey) {
      throw new Error('API key not set');
    }

    // Normalize name format
    const resourceName = name.startsWith('cachedContents/') ? name : `cachedContents/${name}`;
    
    const updateMask: string[] = [];
    const body: Record<string, unknown> = {};

    if (config.ttl) {
      body.ttl = config.ttl;
      updateMask.push('ttl');
    }
    if (config.expireTime) {
      body.expireTime = config.expireTime;
      updateMask.push('expireTime');
    }

    const url = `${this.baseUrl}/${resourceName}?key=${this.apiKey}&updateMask=${updateMask.join(',')}`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update cache: ${response.status} ${errorText}`);
    }

    const cache = await response.json() as CachedContent;
    
    // Update in-memory entry
    const entry = this.activeCaches.get(cache.name);
    if (entry) {
      entry.cache = cache;
      entry.lastUsed = Date.now();
    }

    logger.info('Cache updated', {
      name: cache.name,
      newExpireTime: cache.expireTime,
    });

    return cache;
  }

  /**
   * Delete a cached content
   */
  async deleteCache(name: string): Promise<void> {
    if (!this.apiKey) {
      throw new Error('API key not set');
    }

    // Normalize name format
    const resourceName = name.startsWith('cachedContents/') ? name : `cachedContents/${name}`;
    const url = `${this.baseUrl}/${resourceName}?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete cache: ${response.status} ${errorText}`);
    }

    // Remove from in-memory cache
    const entry = this.activeCaches.get(resourceName);
    if (entry) {
      this.cacheByHash.delete(entry.contentHash);
      this.activeCaches.delete(resourceName);
    }

    logger.info('Cache deleted', { name: resourceName });
  }

  /**
   * Clean up expired caches from memory
   */
  cleanupExpiredCaches(): void {
    const now = Date.now();
    const expiredNames: string[] = [];

    for (const [name, entry] of this.activeCaches) {
      const expireTime = new Date(entry.cache.expireTime).getTime();
      if (expireTime <= now) {
        expiredNames.push(name);
        this.cacheByHash.delete(entry.contentHash);
      }
    }

    for (const name of expiredNames) {
      this.activeCaches.delete(name);
    }

    if (expiredNames.length > 0) {
      logger.debug('Cleaned up expired caches', { count: expiredNames.length });
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    activeCacheCount: number;
    totalHits: number;
    cacheNames: string[];
  } {
    let totalHits = 0;
    const cacheNames: string[] = [];

    for (const [name, entry] of this.activeCaches) {
      totalHits += entry.hitCount;
      cacheNames.push(name);
    }

    return {
      activeCacheCount: this.activeCaches.size,
      totalHits,
      cacheNames,
    };
  }

  /**
   * Extend the TTL of a frequently used cache
   */
  async extendCacheTtl(name: string, additionalSeconds: number): Promise<CachedContent> {
    const cache = await this.getCache(name);
    const currentExpire = new Date(cache.expireTime);
    const newExpire = new Date(currentExpire.getTime() + additionalSeconds * 1000);
    
    return this.updateCache(name, {
      expireTime: newExpire.toISOString(),
    });
  }

  /**
   * Get or create a cache for the given configuration
   * Automatically handles cache reuse and creation
   */
  async getOrCreateCache(config: CreateCacheConfig): Promise<CachedContent> {
    // Clean up expired caches first
    this.cleanupExpiredCaches();
    
    // Try to find existing cache
    const existing = await this.findExistingCache(config);
    if (existing) {
      return existing;
    }
    
    // Create new cache
    return this.createCache(config);
  }
}

// Export a singleton instance
let cacheServiceInstance: GeminiCacheService | null = null;

export function getGeminiCacheService(apiKey?: string): GeminiCacheService {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new GeminiCacheService(apiKey);
  } else if (apiKey) {
    cacheServiceInstance.setApiKey(apiKey);
  }
  return cacheServiceInstance;
}
