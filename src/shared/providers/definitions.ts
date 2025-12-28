/**
 * Provider Definitions
 * 
 * Static definitions for all supported LLM providers.
 * Contains display information, metadata, and ordering.
 */

import type { LLMProviderName } from '../types';
import type { ProviderInfo } from './types';

// =============================================================================
// Provider Definitions
// =============================================================================

export const PROVIDERS: Record<LLMProviderName, ProviderInfo> = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    shortName: 'Claude',
    description: 'Claude models - excellent reasoning and coding',
    website: 'https://anthropic.com',
    docsUrl: 'https://docs.anthropic.com',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    icon: 'bot',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    shortName: 'GPT',
    description: 'GPT models - versatile and fast',
    website: 'https://openai.com',
    docsUrl: 'https://platform.openai.com/docs',
    color: 'text-green-400 dark:text-green-400',
    bgColor: 'bg-green-500/10',
    icon: 'brain',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    shortName: 'DeepSeek',
    description: 'DeepSeek models - optimized for coding',
    website: 'https://deepseek.com',
    docsUrl: 'https://platform.deepseek.com/docs',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    icon: 'cpu',
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    shortName: 'Gemini',
    description: 'Gemini models - large context and multimodal',
    website: 'https://ai.google.dev',
    docsUrl: 'https://ai.google.dev/docs',
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/10',
    icon: 'atom',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    shortName: 'OpenRouter',
    description: 'Unified API - access 400+ models from all providers',
    website: 'https://openrouter.ai',
    docsUrl: 'https://openrouter.ai/docs',
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/10',
    icon: 'sparkles',
  },
};

/** Provider order for UI display and fallback priority */
export const PROVIDER_ORDER: LLMProviderName[] = ['anthropic', 'openai', 'deepseek', 'gemini', 'openrouter'];

// =============================================================================
// Provider Helper Functions
// =============================================================================

/**
 * Get provider info by ID
 */
export function getProvider(provider: LLMProviderName): ProviderInfo {
  return PROVIDERS[provider];
}

/**
 * Get all provider IDs
 */
export function getAllProviderIds(): LLMProviderName[] {
  return [...PROVIDER_ORDER];
}

/**
 * Check if a provider ID is valid
 */
export function isValidProvider(providerId: string): providerId is LLMProviderName {
  return PROVIDER_ORDER.includes(providerId as LLMProviderName);
}
