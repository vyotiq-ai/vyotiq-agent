/**
 * System Prompt Cache
 * 
 * Caches static portions of the system prompt to avoid
 * rebuilding on every request. Dynamic sections are
 * appended at runtime.
 * 
 * Supports provider-level caching (Anthropic ephemeral cache).
 */

import type { CachedPrompt } from './types';
import { getStaticContent } from './sections';

/**
 * Simple hash function for cache invalidation
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Estimate tokens (rough: ~4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * System Prompt Cache Manager
 * 
 * Caches the static portions of the system prompt and
 * provides methods to build complete prompts with dynamic context.
 */
export class SystemPromptCache {
  private cache: CachedPrompt | null = null;
  private readonly maxAge: number;

  constructor(maxAgeMs: number = 5 * 60 * 1000) {
    this.maxAge = maxAgeMs;
  }

  /**
   * Get or build cached static content
   */
  getStaticPrompt(): CachedPrompt {
    const staticContent = getStaticContent();
    const currentHash = simpleHash(staticContent);

    // Return cached if valid
    if (this.cache && this.cache.staticHash === currentHash) {
      const age = Date.now() - this.cache.createdAt;
      if (age < this.maxAge) {
        return this.cache;
      }
    }

    // Build new cache
    this.cache = {
      staticContent,
      staticHash: currentHash,
      createdAt: Date.now(),
      estimatedTokens: estimateTokens(staticContent),
    };

    return this.cache;
  }

  /**
   * Build complete prompt with dynamic context
   */
  buildPrompt(dynamicSections: string[]): string {
    const cached = this.getStaticPrompt();
    const dynamicContent = dynamicSections.filter(Boolean).join('\n\n');

    if (!dynamicContent) {
      return cached.staticContent;
    }

    return `${cached.staticContent}\n\n${dynamicContent}`;
  }

  /**
   * Get estimated token count for current cache
   */
  getEstimatedTokens(): number {
    return this.cache?.estimatedTokens ?? 0;
  }

  /**
   * Invalidate cache (force rebuild on next request)
   */
  invalidate(): void {
    this.cache = null;
  }

  /**
   * Check if cache is valid
   */
  isValid(): boolean {
    if (!this.cache) return false;
    const age = Date.now() - this.cache.createdAt;
    return age < this.maxAge;
  }
}

// Singleton instance
let cacheInstance: SystemPromptCache | null = null;

/**
 * Get singleton cache instance
 */
export function getSystemPromptCache(): SystemPromptCache {
  if (!cacheInstance) {
    cacheInstance = new SystemPromptCache();
  }
  return cacheInstance;
}
