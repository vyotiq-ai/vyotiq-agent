/**
 * Editor AI Cache
 * 
 * LRU cache for editor AI responses to reduce API calls
 * and improve response times for repeated requests.
 */

import type { LLMProviderName } from '../../../shared/types';

interface CacheEntry {
  text: string;
  provider?: LLMProviderName;
  modelId?: string;
  timestamp: number;
}

export class EditorAICache {
  private cache: Map<string, CacheEntry>;
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private stats = {
    hits: 0,
    misses: 0,
  };

  constructor(maxSize: number = 200, ttlMs: number = 120000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Get a cached entry
   */
  get(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    this.stats.hits++;
    return entry;
  }

  /**
   * Set a cache entry
   */
  set(key: string, value: Omit<CacheEntry, 'timestamp'>): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      ...value,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if user continued typing and suggestion still applies
   */
  getExtendedMatch(currentPrefix: string): { entry: CacheEntry; remainingSuggestion: string } | null {
    for (const [key, entry] of this.cache.entries()) {
      // Extract the prefix from the cache key
      const keyParts = key.split(':');
      const cachedPrefix = keyParts[keyParts.length - 1];
      
      // Check if current prefix starts with cached prefix
      if (currentPrefix.startsWith(cachedPrefix) && entry.text) {
        const typedSinceCached = currentPrefix.slice(cachedPrefix.length);
        
        // Check if what user typed matches the start of the suggestion
        if (entry.text.startsWith(typedSinceCached)) {
          const remainingSuggestion = entry.text.slice(typedSinceCached.length);
          if (remainingSuggestion.length > 0) {
            this.stats.hits++;
            return { entry, remainingSuggestion };
          }
        }
      }
    }
    
    this.stats.misses++;
    return null;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
        removed++;
      }
    }
    
    return removed;
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; hits: number; misses: number; hitRate: number } {
    const total = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0 };
  }
}
