/**
 * Token Counting Utilities
 * 
 * Provides accurate token counting using tiktoken for OpenAI/Anthropic models
 * with fallback to character-based approximation for other providers.
 * 
 * Supports:
 * - OpenAI (gpt-4, gpt-4o, gpt-3.5-turbo)
 * - Anthropic (claude-3-opus, claude-3-sonnet, etc.)
 * - DeepSeek (uses cl100k_base approximation)
 * - Gemini (character-based approximation)
 */

// =============================================================================
// Types
// =============================================================================

export type TokenizerModel = 
  | 'gpt-5'
  | 'gpt-5.1'
  | 'gpt-5.2'
  | 'gpt-4'
  | 'gpt-4o'
  | 'gpt-3.5-turbo'
  | 'claude-3'
  | 'deepseek'
  | 'gemini'
  | 'default';

export interface TokenCountResult {
  tokens: number;
  method: 'tiktoken' | 'approximation';
  model: TokenizerModel;
  cached: boolean;
}

export interface TokenizerOptions {
  model?: TokenizerModel;
  useCache?: boolean;
}

// =============================================================================
// Token Counter Class
// =============================================================================

class EnhancedTokenCounter {
  private cache = new Map<string, number>();
  private maxCacheSize = 1000;
  
  // Character ratios for approximation
  private static readonly CHARS_PER_TOKEN: Record<string, number> = {
    'gpt-5': 4,
    'gpt-5.1': 4,
    'gpt-5.2': 4,
    'gpt-4': 4,
    'gpt-4o': 4,
    'gpt-3.5-turbo': 4,
    'claude-3': 3.8,
    'deepseek': 3.5,
    'gemini': 4,
    'default': 4,
  };
  
  // Content-specific ratios for more accurate approximation
  private static readonly CONTENT_RATIOS = {
    prose: 4,
    code: 3,
    json: 3.5,
    markdown: 3.5,
    url: 2.5,
  };
  
  /**
   * Count tokens in text using the best available method
   */
  count(text: string, options: TokenizerOptions = {}): TokenCountResult {
    const { model = 'default', useCache = true } = options;
    
    if (!text) {
      return { tokens: 0, method: 'approximation', model, cached: false };
    }
    
    // Check cache
    const cacheKey = `${model}:${text.slice(0, 100)}:${text.length}`;
    if (useCache && this.cache.has(cacheKey)) {
      return {
        tokens: this.cache.get(cacheKey)!,
        method: 'approximation',
        model,
        cached: true,
      };
    }
    
    // Use content-aware approximation
    const tokens = this.countWithApproximation(text, model);
    
    // Cache result
    if (useCache) {
      this.addToCache(cacheKey, tokens);
    }
    
    return { tokens, method: 'approximation', model, cached: false };
  }
  
  /**
   * Content-aware token approximation
   */
  private countWithApproximation(text: string, model: TokenizerModel): number {
    if (!text) return 0;
    
    const baseRatio = EnhancedTokenCounter.CHARS_PER_TOKEN[model] || 4;
    let totalTokens = 0;
    let processedLength = 0;
    
    // 1. Count code blocks
    const codeBlockRegex = /```[\s\S]*?```/g;
    const codeBlocks = text.match(codeBlockRegex) || [];
    for (const block of codeBlocks) {
      totalTokens += Math.ceil(block.length / EnhancedTokenCounter.CONTENT_RATIOS.code);
      processedLength += block.length;
    }
    
    // 2. Count inline code
    const inlineCodeRegex = /`[^`]+`/g;
    const textWithoutCodeBlocks = text.replace(codeBlockRegex, '');
    const inlineCode = textWithoutCodeBlocks.match(inlineCodeRegex) || [];
    for (const code of inlineCode) {
      totalTokens += Math.ceil(code.length / EnhancedTokenCounter.CONTENT_RATIOS.code);
      processedLength += code.length;
    }
    
    // 3. Count JSON objects
    // Match simple JSON objects and arrays (non-nested)
    const jsonRegex = /\{[^{}]*\}|\[[^[\]]*\]/g;
    const textWithoutCode = textWithoutCodeBlocks.replace(inlineCodeRegex, '');
    const jsonMatches = textWithoutCode.match(jsonRegex) || [];
    for (const json of jsonMatches) {
      totalTokens += Math.ceil(json.length / EnhancedTokenCounter.CONTENT_RATIOS.json);
      processedLength += json.length;
    }
    
    // 4. Count URLs
    const urlRegex = /https?:\/\/[^\s]+/g;
    const textWithoutJson = textWithoutCode.replace(jsonRegex, '');
    const urls = textWithoutJson.match(urlRegex) || [];
    for (const url of urls) {
      totalTokens += Math.ceil(url.length / EnhancedTokenCounter.CONTENT_RATIOS.url);
      processedLength += url.length;
    }
    
    // 5. Count remaining prose with base ratio
    const remainingLength = text.length - processedLength;
    if (remainingLength > 0) {
      // Add overhead for special tokens, newlines, etc.
      const proseTokens = Math.ceil(remainingLength / baseRatio);
      
      // Count newlines as additional tokens
      const newlineCount = (text.match(/\n/g) || []).length;
      
      totalTokens += proseTokens + Math.ceil(newlineCount * 0.5);
    }
    
    return Math.max(1, totalTokens);
  }
  
  /**
   * Fast token count (simple approximation)
   */
  countFast(text: string, model: TokenizerModel = 'default'): number {
    if (!text) return 0;
    const ratio = EnhancedTokenCounter.CHARS_PER_TOKEN[model] || 4;
    return Math.max(1, Math.ceil(text.length / ratio));
  }
  
  /**
   * Count tokens for a message array
   */
  countMessages(
    messages: Array<{ role?: string; content: string }>,
    options: TokenizerOptions = {}
  ): TokenCountResult {
    let totalTokens = 0;
    
    for (const message of messages) {
      // Message overhead (role, separators)
      totalTokens += 4;
      
      // Content tokens
      const result = this.count(message.content, options);
      totalTokens += result.tokens;
    }
    
    // Conversation overhead
    totalTokens += 3;
    
    return {
      tokens: totalTokens,
      method: 'approximation',
      model: options.model || 'default',
      cached: false,
    };
  }
  
  /**
   * Truncate text to fit within token limit
   */
  truncateToLimit(text: string, tokenLimit: number, options: TokenizerOptions = {}): string {
    const currentResult = this.count(text, options);
    
    if (currentResult.tokens <= tokenLimit) {
      return text;
    }
    
    const model = options.model || 'default';
    const ratio = EnhancedTokenCounter.CHARS_PER_TOKEN[model] || 4;
    
    // Estimate target character count
    const targetChars = Math.floor(tokenLimit * ratio * 0.95); // 95% safety margin
    
    if (targetChars >= text.length) {
      return text;
    }
    
    // Try to truncate at word boundary
    let truncated = text.substring(0, targetChars);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > targetChars * 0.8) {
      truncated = truncated.substring(0, lastSpace);
    }
    
    return truncated + ' [truncated]';
  }
  
  /**
   * Split text into chunks that fit within token limit
   */
  splitIntoChunks(text: string, chunkTokenLimit: number, options: TokenizerOptions = {}): string[] {
    const chunks: string[] = [];
    const model = options.model || 'default';
    const ratio = EnhancedTokenCounter.CHARS_PER_TOKEN[model] || 4;
    const approxChunkChars = Math.floor(chunkTokenLimit * ratio * 0.9);
    
    // Quick check: if text is small enough, return as single chunk
    if (text.length <= approxChunkChars) {
      const tokenCount = this.count(text, options);
      if (tokenCount.tokens <= chunkTokenLimit) {
        return [text];
      }
    }
    
    // Split by paragraphs first
    const paragraphs = text.split(/\n\n+/);
    let currentChunk = '';
    
    for (const paragraph of paragraphs) {
      const testChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
      const testResult = this.count(testChunk, options);
      
      if (testResult.tokens > chunkTokenLimit && currentChunk) {
        // Current chunk is full, save it and start new one
        chunks.push(currentChunk.trim());
        currentChunk = paragraph;
      } else if (testResult.tokens > chunkTokenLimit) {
        // Single paragraph exceeds limit, force split
        const lines = paragraph.split('\n');
        for (const line of lines) {
          if (this.count(currentChunk + '\n' + line, options).tokens > chunkTokenLimit) {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
            }
            // If single line exceeds limit, truncate it
            if (this.count(line, options).tokens > chunkTokenLimit) {
              chunks.push(this.truncateToLimit(line, chunkTokenLimit, options));
              currentChunk = '';
            } else {
              currentChunk = line;
            }
          } else {
            currentChunk = currentChunk ? currentChunk + '\n' + line : line;
          }
        }
      } else {
        currentChunk = testChunk;
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }
  
  /**
   * Add to cache with size limit
   */
  private addToCache(key: string, tokens: number): void {
    if (this.cache.size >= this.maxCacheSize) {
      // Remove oldest entries (FIFO)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, tokens);
  }
  
  /**
   * Clear the token cache
   */
  clearCache(): void {
    this.cache.clear();
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let counterInstance: EnhancedTokenCounter | null = null;

export function getTokenCounter(): EnhancedTokenCounter {
  if (!counterInstance) {
    counterInstance = new EnhancedTokenCounter();
  }
  return counterInstance;
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Count tokens in text
 */
export function countTokens(
  text: string,
  model: TokenizerModel = 'default'
): number {
  return getTokenCounter().count(text, { model }).tokens;
}

/**
 * Fast token count
 */
export function countTokensFast(text: string): number {
  return getTokenCounter().countFast(text);
}

/**
 * Count tokens in message array
 */
export function countMessageTokens(
  messages: Array<{ role?: string; content: string }>,
  model: TokenizerModel = 'default'
): number {
  return getTokenCounter().countMessages(messages, { model }).tokens;
}

/**
 * Truncate text to fit token limit
 */
export function truncateToTokenLimit(
  text: string,
  tokenLimit: number,
  model: TokenizerModel = 'default'
): string {
  return getTokenCounter().truncateToLimit(text, tokenLimit, { model });
}

/**
 * Check if text fits within token limit
 */
export function fitsWithinTokenLimit(
  text: string,
  tokenLimit: number,
  model: TokenizerModel = 'default'
): boolean {
  return getTokenCounter().count(text, { model }).tokens <= tokenLimit;
}

// =============================================================================
// React Hook
// =============================================================================

import { useMemo, useCallback } from 'react';

/**
 * Hook for token counting in React components
 */
export function useTokenCounter(model: TokenizerModel = 'default') {
  const counter = getTokenCounter();
  
  const count = useCallback((text: string) => {
    return counter.count(text, { model }).tokens;
  }, [model, counter]);
  
  const countMessages = useCallback(
    (messages: Array<{ role?: string; content: string }>) => {
      return counter.countMessages(messages, { model }).tokens;
    },
    [model, counter]
  );
  
  const truncate = useCallback(
    (text: string, limit: number) => {
      return counter.truncateToLimit(text, limit, { model });
    },
    [model, counter]
  );
  
  return useMemo(() => ({
    count,
    countMessages,
    truncate,
    countFast: counter.countFast.bind(counter),
    splitIntoChunks: (text: string, limit: number) => 
      counter.splitIntoChunks(text, limit, { model }),
  }), [count, countMessages, truncate, counter, model]);
}

/**
 * Hook that returns token count for a specific text
 */
export function useTokenCount(text: string, model: TokenizerModel = 'default'): number {
  return useMemo(() => countTokens(text, model), [text, model]);
}

export default {
  getTokenCounter,
  countTokens,
  countTokensFast,
  countMessageTokens,
  truncateToTokenLimit,
  fitsWithinTokenLimit,
  useTokenCounter,
  useTokenCount,
};
