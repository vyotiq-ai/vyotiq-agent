/**
 * LRU Cache for Autocomplete Suggestions
 * 
 * Simple in-memory cache with TTL and LRU eviction for storing
 * recent autocomplete suggestions to reduce API calls.
 */

import type { CacheEntry } from './types';

export class AutocompleteCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;

  constructor(maxEntries = 100, defaultTtlMs = 60000) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Generate cache key from text prefix
   */
  private getKey(text: string): string {
    // Normalize and use last 100 chars to balance specificity vs cache hits
    const normalized = text.trim().toLowerCase();
    return normalized.slice(-100);
  }

  /**
   * Get a cached suggestion if available and not expired
   */
  get(text: string): CacheEntry | null {
    const key = this.getKey(text);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // LRU: Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry;
  }

  /**
   * Check if a cached suggestion could still be valid for extended text
   * E.g., if we have suggestion for "How do I" and user types "How do I im",
   * check if suggestion starts with "im"
   */
  getExtendedMatch(text: string): { entry: CacheEntry; remainingSuggestion: string } | null {
    // Try progressively shorter prefixes
    const normalized = text.trim();
    
    for (let i = normalized.length - 1; i >= Math.max(0, normalized.length - 20); i--) {
      const prefix = normalized.slice(0, i);
      const typedSuffix = normalized.slice(i);
      const key = this.getKey(prefix);
      const entry = this.cache.get(key);

      if (entry && Date.now() <= entry.expiresAt) {
        // Check if the cached suggestion starts with what user typed after prefix
        const suggestionLower = entry.suggestion.toLowerCase();
        const suffixLower = typedSuffix.toLowerCase();
        
        if (suggestionLower.startsWith(suffixLower)) {
          return {
            entry,
            remainingSuggestion: entry.suggestion.slice(typedSuffix.length),
          };
        }
      }
    }

    return null;
  }

  /**
   * Store a suggestion in cache
   */
  set(text: string, entry: Omit<CacheEntry, 'timestamp' | 'expiresAt'>, ttlMs?: number): void {
    const key = this.getKey(text);
    const now = Date.now();
    const ttl = ttlMs ?? this.defaultTtlMs;

    // Evict oldest entries if at capacity
    while (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      } else {
        break;
      }
    }

    this.cache.set(key, {
      ...entry,
      timestamp: now,
      expiresAt: now + ttl,
    });
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxEntries,
    };
  }

  /**
   * Remove expired entries (garbage collection)
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }
}
