/**
 * Cache Module
 * 
 * Caching utilities for optimal performance and cost management.
 * Includes prompt caching for LLM providers, context caching for agent operations,
 * and agent cache management.
 * 
 * This module provides:
 * - CacheManager: Provider-specific prompt caching
 * - ContextCache: Generic context caching with LRU and TTL
 * - ToolResultCache: Tool result caching for idempotent operations
 * - CachePartitioner: Partitions cache by agent/session
 */

// Provider-specific prompt caching (Anthropic, OpenAI)
export {
  CacheManager,
  getCacheManager,
  DEFAULT_CACHE_CONFIG,
  AGGRESSIVE_CACHE_CONFIG,
  CONSERVATIVE_CACHE_CONFIG,
  shouldCache,
  createCacheControl,
} from './CacheManager';

export type {
  CacheStats,
  ProviderCacheStats,
  CacheConfig,
  CacheControl,
} from './CacheManager';

// Generic context caching with LRU and TTL support
export {
  ContextCache,
  createFileContentCache,
  createSymbolCache,
  generateFileKey,
  generateContentKey,
  getContextCache,
  resetContextCache,
  DEFAULT_CONTEXT_CACHE_CONFIG,
} from './ContextCache';

export type {
  CacheEntry,
  ContextCacheConfig,
  ContextCacheStats,
  FileContentEntry,
  SymbolCacheEntry,
} from './ContextCache';

// Tool result caching for idempotent operations
export {
  ToolResultCache,
  getToolResultCache,
  resetToolResultCache,
} from './ToolResultCache';

export type {
  ToolResultCacheConfig,
  CacheStats as ToolCacheStats,
} from './ToolResultCache';

// Cache partitioner
export {
  CachePartitioner,
  getCachePartitioner,
  DEFAULT_PARTITIONER_CONFIG,
  type PartitionType,
  type CachePartition,
  type PartitionAllocation,
  type PartitionStats,
  type CachePartitionerConfig,
} from './CachePartitioner';
