/**
 * Provider Configuration Registry
 * 
 * Centralized configuration for all LLM providers including:
 * - Rate limits by tier
 * - Base API URLs
 * - Provider-level settings
 * 
 * Models are fetched dynamically via provider APIs.
 * This module provides default model IDs and rate limit configuration.
 */

import type { LLMProviderName } from '../../../shared/types';
import type { ModelInfo } from '../../../shared/providers/types';
import {
  ANTHROPIC_MODELS,
  OPENAI_MODELS,
  DEEPSEEK_MODELS,
  GEMINI_MODELS,
  DEFAULT_MODELS,
  getModelById as sharedGetModelById,
  getDefaultModel as getDefaultModelInfo,
  getModelsForProvider as sharedGetModelsForProvider,
} from '../../../shared/providers/models';

// Re-export shared model utilities for external use
export { sharedGetModelById as getSharedModelById };
export { sharedGetModelsForProvider as getSharedModelsForProvider };
export { DEFAULT_MODELS };

// =============================================================================
// Model Definitions (Transformed from shared ModelInfo)
// =============================================================================

/**
 * ModelDefinition - local interface for backward compatibility
 * This transforms the shared ModelInfo format to the legacy format used internally.
 */
export interface ModelDefinition {
  /** Model ID used in API calls */
  id: string;
  /** Human-readable name */
  name: string;
  /** Maximum context window size in tokens */
  contextWindow: number;
  /** Maximum output tokens */
  maxOutput: number;
  /** Whether this is the default model for the provider */
  isDefault?: boolean;
  /** Model capabilities */
  capabilities: {
    /** Supports prompt caching */
    caching?: boolean;
    /** Supports vision/images */
    vision?: boolean;
    /** Supports function/tool calling */
    toolUse: boolean;
    /** Supports streaming */
    streaming: boolean;
    /** 
     * Supports thinking/reasoning mode (chain-of-thought).
     * - DeepSeek: deepseek-reasoner (default), deepseek-chat (via param), deepseek-v3.2-speciale
     * - Gemini: gemini-2.5-*, gemini-3.0-* with thinking budget
     */
    thinking?: boolean;
  };
  /** Cost per million input tokens (USD) - for reference */
  inputCostPer1M?: number;
  /** Cost per million output tokens (USD) - for reference */
  outputCostPer1M?: number;
  /** Notes about the model */
  notes?: string;
}

/**
 * Transform shared ModelInfo to local ModelDefinition format
 */
function toModelDefinition(model: ModelInfo): ModelDefinition {
  return {
    id: model.id,
    name: model.name,
    contextWindow: model.contextWindow,
    maxOutput: model.maxOutputTokens,
    isDefault: model.isDefault,
    capabilities: {
      // Prompt caching:
      // - Anthropic + OpenAI: Manual prompt caching controls
      // - DeepSeek: Automatic context caching on disk (always enabled)
      caching: model.provider === 'anthropic' || model.provider === 'openai' || model.provider === 'deepseek',
      vision: model.supportsVision,
      toolUse: model.supportsTools,
      streaming: model.supportsStreaming,
      // Thinking/reasoning mode support
      thinking: model.supportsThinking ?? false,
    },
    inputCostPer1M: model.inputCostPer1M,
    outputCostPer1M: model.outputCostPer1M,
    notes: model.description,
  };
}

export interface ProviderDefinition {
  /** Provider identifier */
  id: LLMProviderName;
  /** Human-readable name */
  name: string;
  /** Base API URL */
  baseUrl: string;
  /** Available models */
  models: ModelDefinition[];
  /** Default model ID */
  defaultModel: string;
  /** Provider-level capabilities */
  capabilities: {
    /** Supports prompt caching */
    caching: boolean;
    /** Supports streaming */
    streaming: boolean;
  };
  /** Rate limit tiers */
  rateLimits: {
    free: RateLimitTier;
    standard: RateLimitTier;
    enterprise?: RateLimitTier;
  };
}

export interface RateLimitTier {
  /** Requests per minute */
  rpm: number;
  /** Input tokens per minute */
  inputTpm: number;
  /** Output tokens per minute */
  outputTpm: number;
  /** Requests per day (optional) */
  rpd?: number;
}

// =============================================================================
// Anthropic Configuration
// Models are fetched dynamically via API
// =============================================================================

export const ANTHROPIC_CONFIG: ProviderDefinition = {
  id: 'anthropic',
  name: 'Anthropic',
  baseUrl: 'https://api.anthropic.com',
  models: ANTHROPIC_MODELS.map(toModelDefinition),
  defaultModel: DEFAULT_MODELS.anthropic,
  capabilities: {
    caching: true,
    streaming: true,
  },
  /**
   * Anthropic Rate Limits (Dec 2025)
   * @see https://docs.anthropic.com/en/api/rate-limits
   * 
   * Tier 1 (free/$5 credit):
   *   - Claude Sonnet 4/4.5: 50 RPM, 30K input TPM, 8K output TPM
   *   - Claude Opus 4/4.5: 50 RPM, 30K input TPM, 8K output TPM  
   *   - Claude Haiku 4.x/3.5: 50 RPM, 50K input TPM, 10K output TPM
   * Tier 2 ($40+): 1000 RPM, 80K input TPM, 16K output TPM
   * Tier 3 ($200+): 2000 RPM, 160K input TPM, 32K output TPM
   * Tier 4 ($400+): 4000 RPM, 400K input TPM, 80K output TPM
   */
  rateLimits: {
    free: { rpm: 50, inputTpm: 30000, outputTpm: 8000, rpd: 1000 },
    standard: { rpm: 1000, inputTpm: 80000, outputTpm: 16000 },
    enterprise: { rpm: 4000, inputTpm: 400000, outputTpm: 80000 },
  },
};

// =============================================================================
// OpenAI Configuration
// Models are fetched dynamically via API
// =============================================================================

export const OPENAI_CONFIG: ProviderDefinition = {
  id: 'openai',
  name: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  models: OPENAI_MODELS.map(toModelDefinition),
  defaultModel: DEFAULT_MODELS.openai,
  capabilities: {
    caching: true,
    streaming: true,
  },
  /**
   * OpenAI Rate Limits
   * @see https://platform.openai.com/docs/guides/rate-limits
   * 
   * Tier 1 ($5+): 500 RPM, 30K TPM for GPT-4o, 200K TPM for GPT-4o-mini
   * Tier 2 ($50+): 5000 RPM, 450K TPM for GPT-4o
   * Tier 3 ($100+): 5000 RPM, 800K TPM for GPT-4o
   * Tier 4 ($250+): 10000 RPM, 2M TPM
   * Tier 5 ($1000+): 10000 RPM, 30M TPM
   */
  rateLimits: {
    free: { rpm: 500, inputTpm: 30000, outputTpm: 10000, rpd: 10000 },
    standard: { rpm: 5000, inputTpm: 450000, outputTpm: 150000 },
    enterprise: { rpm: 10000, inputTpm: 2000000, outputTpm: 500000 },
  },
};

// =============================================================================
// DeepSeek Configuration (V3.2 - December 2025)
// Models are fetched dynamically via API
// 
// KEY UPDATES (December 2025):
// - V3.2 release with thinking mode (deepseek-reasoner)
// - Tool calls now supported in BOTH thinking and non-thinking modes
// - Automatic context caching (tracks cache_hit/cache_miss tokens)
// - No rate limits - best effort serving with keep-alive during high traffic
//
// @see https://api-docs.deepseek.com/news/news251201
// @see https://api-docs.deepseek.com/guides/thinking_mode
// @see https://api-docs.deepseek.com/quick_start/rate_limit
// =============================================================================

export const DEEPSEEK_CONFIG: ProviderDefinition = {
  id: 'deepseek',
  name: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com',
  models: DEEPSEEK_MODELS.map(toModelDefinition),
  defaultModel: DEFAULT_MODELS.deepseek,
  capabilities: {
    caching: true, // DeepSeek has automatic context caching on disk
    streaming: true,
  },
  // DeepSeek does NOT constrain rate limits - these are soft estimates
  // During high traffic, requests stay connected and receive keep-alive
  // Timeout after 30 minutes if not completed
  rateLimits: {
    free: { rpm: 500, inputTpm: 500000, outputTpm: 250000 },
    standard: { rpm: 1000, inputTpm: 1000000, outputTpm: 500000 },
  },
};

// =============================================================================
// Gemini Configuration
// Models are fetched dynamically via API
// =============================================================================

export const GEMINI_CONFIG: ProviderDefinition = {
  id: 'gemini',
  name: 'Google Gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  models: GEMINI_MODELS.map(toModelDefinition),
  defaultModel: DEFAULT_MODELS.gemini,
  capabilities: {
    caching: false,
    streaming: true,
  },
  /**
   * Gemini Rate Limits
   * @see https://ai.google.dev/gemini-api/docs/rate-limits
   * 
   * Free tier: 15 RPM, 1M input TPM, 4K output TPM, 1500 RPD
   * Pay-as-you-go Tier 1: 1000 RPM, 4M input TPM
   * Pay-as-you-go Tier 2: 2000 RPM, 10M input TPM
   */
  rateLimits: {
    free: { rpm: 15, inputTpm: 1000000, outputTpm: 4000, rpd: 1500 },
    standard: { rpm: 1000, inputTpm: 4000000, outputTpm: 128000 },
    enterprise: { rpm: 2000, inputTpm: 10000000, outputTpm: 256000 },
  },
};

// =============================================================================
// OpenRouter Configuration
// OpenRouter is a unified API gateway - models are fetched dynamically
// @see https://openrouter.ai/docs/api-reference/overview
// =============================================================================

export const OPENROUTER_CONFIG: ProviderDefinition = {
  id: 'openrouter',
  name: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  models: [], // Models are fetched dynamically via API
  defaultModel: DEFAULT_MODELS.openrouter,
  capabilities: {
    caching: false,
    streaming: true,
  },
  /**
   * OpenRouter Rate Limits
   * @see https://openrouter.ai/docs/limits
   * 
   * Rate limits depend on underlying model and account credits.
   * These are conservative defaults for free tier usage.
   */
  rateLimits: {
    free: { rpm: 100, inputTpm: 100000, outputTpm: 50000 },
    standard: { rpm: 500, inputTpm: 500000, outputTpm: 250000 },
  },
};

// =============================================================================
// Provider Registry
// =============================================================================

export const PROVIDER_CONFIGS: Record<LLMProviderName, ProviderDefinition> = {
  anthropic: ANTHROPIC_CONFIG,
  openai: OPENAI_CONFIG,
  deepseek: DEEPSEEK_CONFIG,
  gemini: GEMINI_CONFIG,
  openrouter: OPENROUTER_CONFIG,
};

/**
 * Get provider configuration by name
 */
export function getProviderConfig(provider: LLMProviderName): ProviderDefinition {
  return PROVIDER_CONFIGS[provider];
}

/**
 * Get model definition by provider and model ID
 * Uses shared model registry for consistent model info lookup
 */
export function getModelDefinition(
  provider: LLMProviderName,
  modelId?: string
): ModelDefinition | undefined {
  const config = PROVIDER_CONFIGS[provider];
  if (!config) return undefined;
  
  if (modelId) {
    // First try shared registry for most accurate info
    const sharedModel = sharedGetModelById(modelId);
    if (sharedModel && sharedModel.provider === provider) {
      return toModelDefinition(sharedModel);
    }
    // Fall back to local config
    return config.models.find(m => m.id === modelId || m.id.includes(modelId));
  }
  
  // Use shared registry's default model lookup
  const defaultModel = getDefaultModelInfo(provider);
  if (defaultModel) {
    return toModelDefinition(defaultModel);
  }
  
  return config.models.find(m => m.isDefault) ?? config.models[0];
}

/**
 * Get default model for a provider
 */
export function getDefaultModel(provider: LLMProviderName): string {
  return PROVIDER_CONFIGS[provider]?.defaultModel ?? '';
}

/**
 * Get all available models for a provider
 */
export function getProviderModels(provider: LLMProviderName): ModelDefinition[] {
  return PROVIDER_CONFIGS[provider]?.models ?? [];
}

/**
 * Check if a provider supports a capability
 */
export function providerSupports(
  provider: LLMProviderName,
  capability: 'caching' | 'streaming'
): boolean {
  return PROVIDER_CONFIGS[provider]?.capabilities[capability] ?? false;
}

/**
 * Get rate limits for a provider and tier
 */
export function getProviderRateLimits(
  provider: LLMProviderName,
  tier: 'free' | 'standard' | 'enterprise' = 'free'
): RateLimitTier {
  const config = PROVIDER_CONFIGS[provider];
  return config?.rateLimits[tier] ?? config?.rateLimits.free ?? {
    rpm: 50,
    inputTpm: 30000,
    outputTpm: 4096,
  };
}

/**
 * Get all providers sorted by priority
 */
export function getAllProviders(): ProviderDefinition[] {
  // Default priority order
  return [
    ANTHROPIC_CONFIG,
    OPENAI_CONFIG,
    DEEPSEEK_CONFIG,
    GEMINI_CONFIG,
    OPENROUTER_CONFIG,
  ];
}
