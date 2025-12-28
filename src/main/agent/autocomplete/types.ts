/**
 * Autocomplete Types
 * 
 * Internal types for the autocomplete service.
 */

import type { LLMProviderName } from '../../../shared/types';

/**
 * Internal cache entry for autocomplete suggestions
 */
export interface CacheEntry {
  suggestion: string;
  provider: LLMProviderName;
  modelId: string;
  timestamp: number;
  expiresAt: number;
}

/**
 * Provider selection result
 */
export interface SelectedProvider {
  name: LLMProviderName;
  modelId: string;
}

/**
 * Autocomplete service configuration (runtime)
 */
export interface AutocompleteConfig {
  enabled: boolean;
  maxTokens: number;
  temperature: number;
  preferredProvider: LLMProviderName | 'auto';
  cacheTtlMs: number;
  maxCacheEntries: number;
}

/**
 * Default autocomplete configuration
 */
export const DEFAULT_AUTOCOMPLETE_CONFIG: AutocompleteConfig = {
  enabled: true,
  maxTokens: 60,
  temperature: 0.3,
  preferredProvider: 'auto',
  cacheTtlMs: 60000, // 1 minute
  maxCacheEntries: 100,
};
