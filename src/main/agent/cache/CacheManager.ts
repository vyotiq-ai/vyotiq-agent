/**
 * Cache Manager Module
 * 
 * Provides utilities for prompt caching with Anthropic and other providers.
 * Tracks cache hits/misses and provides metrics for cost optimization.
 */

import type { LLMProviderName } from '../../../shared/types';
import type { CacheConfig, CacheControl } from '../providers/baseProvider';

// =============================================================================
// Types
// =============================================================================

/** Cache usage statistics */
export interface CacheStats {
  /** Number of cache hits (cached_input_tokens > 0) */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Total tokens saved from caching */
  tokensSaved: number;
  /** Estimated cost saved (in USD, approximate) */
  costSaved: number;
  /** Cache creation events (new cache entries created) */
  creations: number;
  /** Total tokens used for cache creation */
  creationTokens: number;
}

/** Per-provider cache statistics */
export type ProviderCacheStats = Partial<Record<LLMProviderName, CacheStats>>;

// Token pricing estimates (per 1M tokens, as of 2025)
// These are approximate and may vary based on model
const TOKEN_COSTS: Record<LLMProviderName, { input: number; output: number; cached: number }> = {
  anthropic: { input: 3.0, output: 15.0, cached: 0.3 }, // Claude 3.5 Sonnet pricing
  openai: { input: 2.5, output: 10.0, cached: 1.25 }, // GPT-4o pricing with cached
  deepseek: { input: 0.27, output: 1.1, cached: 0.1 }, // DeepSeek v2.5 pricing
  gemini: { input: 0.075, output: 0.3, cached: 0.0375 }, // Gemini 1.5 Pro pricing
  xai: { input: 3.0, output: 15.0, cached: 1.5 }, // Grok pricing
  mistral: { input: 2.0, output: 6.0, cached: 1.0 }, // Mistral Large pricing
  glm: { input: 0.5, output: 2.0, cached: 0.25 }, // GLM-4.7 pricing
  openrouter: { input: 2.0, output: 8.0, cached: 1.0 }, // OpenRouter varies by model
};

// =============================================================================
// Cache Manager
// =============================================================================

export class CacheManager {
  private stats: ProviderCacheStats = {};
  
  constructor() {
    // Initialize stats for all providers
    this.resetStats();
  }
  
  /**
   * Reset all cache statistics
   */
  resetStats(): void {
    this.stats = {
      anthropic: this.createEmptyStats(),
      openai: this.createEmptyStats(),
      deepseek: this.createEmptyStats(),
      gemini: this.createEmptyStats(),
      xai: this.createEmptyStats(),
      mistral: this.createEmptyStats(),
      glm: this.createEmptyStats(),
      openrouter: this.createEmptyStats(),
    };
  }
  
  private createEmptyStats(): CacheStats {
    return {
      hits: 0,
      misses: 0,
      tokensSaved: 0,
      costSaved: 0,
      creations: 0,
      creationTokens: 0,
    };
  }
  
  /**
   * Record cache usage from a provider response
   */
  recordUsage(
    provider: LLMProviderName,
    usage: {
      inputTokens?: number;
      outputTokens?: number;
      cacheCreationInputTokens?: number;
      cacheReadInputTokens?: number;
    }
  ): void {
    if (!this.stats[provider]) {
      this.stats[provider] = this.createEmptyStats();
    }
    
    // Safe access: stats is guaranteed to exist after the above check
    const stats = this.stats[provider] ?? this.createEmptyStats();
    const pricing = TOKEN_COSTS[provider];
    
    // Cache read = cache hit
    if (usage.cacheReadInputTokens && usage.cacheReadInputTokens > 0) {
      stats.hits++;
      stats.tokensSaved += usage.cacheReadInputTokens;
      
      // Calculate cost savings: (normal price - cached price) * tokens
      const normalCost = (usage.cacheReadInputTokens / 1_000_000) * pricing.input;
      const cachedCost = (usage.cacheReadInputTokens / 1_000_000) * pricing.cached;
      stats.costSaved += normalCost - cachedCost;
    } else if (usage.inputTokens && usage.inputTokens > 0) {
      // No cache read = miss (for cacheable content)
      stats.misses++;
    }
    
    // Track cache creation
    if (usage.cacheCreationInputTokens && usage.cacheCreationInputTokens > 0) {
      stats.creations++;
      stats.creationTokens += usage.cacheCreationInputTokens;
    }
  }
  
  /**
   * Get cache statistics for a provider
   */
  getStats(provider: LLMProviderName): CacheStats {
    return this.stats[provider] ?? this.createEmptyStats();
  }
  
  /**
   * Get all provider cache statistics
   */
  getAllStats(): ProviderCacheStats {
    return { ...this.stats };
  }
  
  /**
   * Get cache hit rate for a provider
   */
  getHitRate(provider: LLMProviderName): number {
    const stats = this.stats[provider];
    if (!stats) return 0;
    
    const total = stats.hits + stats.misses;
    if (total === 0) return 0;
    
    return stats.hits / total;
  }
  
  /**
   * Get total cost saved across all providers
   */
  getTotalCostSaved(): number {
    let total = 0;
    for (const stats of Object.values(this.stats)) {
      if (stats) {
        total += stats.costSaved;
      }
    }
    return total;
  }
  
  /**
   * Get summary of cache performance
   */
  getSummary(): {
    totalHits: number;
    totalMisses: number;
    overallHitRate: number;
    totalTokensSaved: number;
    totalCostSaved: number;
    totalCreations: number;
  } {
    let totalHits = 0;
    let totalMisses = 0;
    let totalTokensSaved = 0;
    let totalCostSaved = 0;
    let totalCreations = 0;
    
    for (const stats of Object.values(this.stats)) {
      if (stats) {
        totalHits += stats.hits;
        totalMisses += stats.misses;
        totalTokensSaved += stats.tokensSaved;
        totalCostSaved += stats.costSaved;
        totalCreations += stats.creations;
      }
    }
    
    const total = totalHits + totalMisses;
    
    return {
      totalHits,
      totalMisses,
      overallHitRate: total > 0 ? totalHits / total : 0,
      totalTokensSaved,
      totalCostSaved,
      totalCreations,
    };
  }
}

// =============================================================================
// Cache Configuration Helpers
// =============================================================================

/**
 * Default cache configuration for optimal cost/performance balance
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  cacheSystemPrompt: true,
  cacheTools: true,
  cacheFileContexts: true,
  ttl: '5m',
  minCacheSize: 1024, // ~256 tokens
};

/**
 * Aggressive cache configuration for maximum cost savings
 * Uses longer TTL for more cache hits
 */
export const AGGRESSIVE_CACHE_CONFIG: CacheConfig = {
  cacheSystemPrompt: true,
  cacheTools: true,
  cacheFileContexts: true,
  ttl: '1h',
  minCacheSize: 512, // Lower threshold
};

/**
 * Conservative cache configuration for less API cost sensitivity
 * Only caches large content
 */
export const CONSERVATIVE_CACHE_CONFIG: CacheConfig = {
  cacheSystemPrompt: true,
  cacheTools: false,
  cacheFileContexts: false,
  ttl: '5m',
  minCacheSize: 4096, // ~1K tokens
};

/**
 * Check if content should be cached based on configuration
 */
export function shouldCache(
  contentSize: number,
  config: CacheConfig = DEFAULT_CACHE_CONFIG
): boolean {
  return contentSize >= (config.minCacheSize ?? 1024);
}

/**
 * Create cache control object for API request
 */
export function createCacheControl(ttl?: '5m' | '1h'): CacheControl {
  return {
    type: 'ephemeral',
    ttl: ttl ?? '5m',
  };
}

// Singleton instance for global cache tracking
let globalCacheManager: CacheManager | null = null;

/**
 * Get or create the global cache manager instance
 */
export function getCacheManager(): CacheManager {
  if (!globalCacheManager) {
    globalCacheManager = new CacheManager();
  }
  return globalCacheManager;
}

// Export types
export type { CacheConfig, CacheControl };
