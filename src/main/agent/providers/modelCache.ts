/**
 * Model Cache Service
 * 
 * Centralized caching for dynamically fetched models from all providers.
 * Provides 5-minute cache with automatic refresh and tool-capability filtering.
 * 
 * All providers fetch models dynamically via their APIs:
 * - Anthropic: GET /v1/models
 * - OpenAI: GET /v1/models  
 * - DeepSeek: GET /models
 * - Gemini: GET /v1beta/models
 * - OpenRouter: GET /api/v1/models
 */

import type { LLMProviderName } from '../../../shared/types';
import type { ModelInfo } from '../../../shared/providers/types';
import { DEFAULT_MODELS } from '../../../shared/providers/models';
import { lookupModelPricing } from '../../../shared/providers/pricing';
import { createLogger } from '../../logger';

const logger = createLogger('ModelCache');

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Cached model entry */
interface CachedModels {
  models: ModelInfo[];
  fetchedAt: number;
}

/** Model cache storage */
const modelCache = new Map<LLMProviderName, CachedModels>();

/**
 * Non-chat model patterns - models that don't support multi-turn conversations
 * These are filtered out when showing models for agent use
 */
const NON_CHAT_MODEL_PATTERNS = [
  /embed/i,           // Embedding models
  /tts/i,             // Text-to-speech models
  /whisper/i,         // Speech-to-text models
  /dall-e/i,          // Image generation models
  /moderation/i,      // Content moderation models
  /imagen/i,          // Google image generation
  /text-embedding/i,  // OpenAI embeddings
  /ada-/i,            // Legacy embedding models
  /babbage-/i,        // Legacy models
  /davinci-/i,        // Legacy completion models (not chat)
  /curie-/i,          // Legacy models
];

/**
 * Check if a model ID represents a non-chat model
 */
function isNonChatModel(modelId: string): boolean {
  return NON_CHAT_MODEL_PATTERNS.some(pattern => pattern.test(modelId));
}

/**
 * Determine model tier based on naming patterns
 */
function detectModelTier(modelId: string): ModelInfo['tier'] {
  const id = modelId.toLowerCase();
  
  // Flagship tier - most capable models
  if (
    id.includes('opus') ||
    id.includes('-pro') ||
    id.includes('5.2') ||
    id.includes('5.1') ||
    id.includes('gpt-5') ||
    id.includes('o3-pro') ||
    id.includes('o1-pro') ||
    id.includes('gemini-3') ||
    id.includes('gemini-2.5-pro')
  ) {
    return 'flagship';
  }
  
  // Fast tier - optimized for speed/cost
  if (
    id.includes('mini') ||
    id.includes('nano') ||
    id.includes('fast') ||
    id.includes('lite') ||
    id.includes('flash') ||
    id.includes('haiku')
  ) {
    return 'fast';
  }
  
  // Legacy tier - older models
  if (
    id.includes('legacy') ||
    id.includes('3.5') ||
    id.includes('gpt-4o') ||  // GPT-4o is now legacy compared to GPT-5
    id.includes('gemini-1.5') ||
    id.includes('gemini-2.0')
  ) {
    return 'legacy';
  }
  
  // Default to balanced
  return 'balanced';
}

/**
 * Detect tool/function calling support based on provider and model
 */
function detectToolSupport(
  modelId: string,
  provider: LLMProviderName,
  raw: Record<string, unknown>
): boolean {
  const id = modelId.toLowerCase();
  
  // Non-chat models don't support tools
  if (isNonChatModel(modelId)) {
    return false;
  }
  
  switch (provider) {
    case 'openrouter': {
      // OpenRouter explicitly lists supported_parameters
      const supportedParams = raw.supported_parameters as string[] | undefined;
      return supportedParams?.includes('tools') || 
             supportedParams?.includes('tool_choice') || false;
    }
    
    case 'gemini': {
      // Gemini models that support generateContent typically support tools
      const supportedMethods = raw.supportedGenerationMethods as string[] | undefined;
      const supportsGenerate = supportedMethods?.includes('generateContent') || false;
      // Exclude specialized models
      const isSpecialized = id.includes('tts') || 
                           id.includes('embedding') || 
                           id.includes('imagen') ||
                           id.includes('aqa');  // Attributed QA model
      return supportsGenerate && !isSpecialized;
    }
    
    case 'anthropic':
      // All Claude chat models support tools
      return id.startsWith('claude-') && !isNonChatModel(modelId);
    
    case 'openai':
      // GPT and o-series models support tools
      return (id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4')) &&
             !isNonChatModel(modelId);
    
    case 'deepseek':
      // DeepSeek chat models support tools
      return id.startsWith('deepseek-') && !isNonChatModel(modelId);
    
    default:
      return true;
  }
}

/**
 * Detect vision/image input support
 */
function detectVisionSupport(
  modelId: string, 
  provider: LLMProviderName,
  raw?: Record<string, unknown>
): boolean {
  const id = modelId.toLowerCase();
  
  switch (provider) {
    case 'anthropic':
      // All Claude 3+ models support vision
      return id.includes('claude-3') || id.includes('claude-4') || id.includes('claude-sonnet') || id.includes('claude-opus');
    
    case 'openai':
      // GPT-4o, GPT-4-vision, GPT-5 support vision
      return id.includes('4o') || id.includes('vision') || id.includes('gpt-5');
    
    case 'gemini':
      // Most Gemini models support vision (except TTS/embedding)
      return !id.includes('tts') && !id.includes('embedding');
    
    case 'deepseek':
      // DeepSeek V3 supports vision
      return id.includes('deepseek-chat') || id.includes('deepseek-reasoner');
    
    case 'openrouter': {
      // Check architecture.input_modalities from API response
      const arch = raw?.architecture as { input_modalities?: string[] } | undefined;
      if (arch?.input_modalities) {
        return arch.input_modalities.includes('image') || arch.input_modalities.includes('vision');
      }
      // Fallback to model name patterns
      return id.includes('vision') || id.includes('4o') || id.includes('gemini') || id.includes('claude');
    }
    
    default:
      return false;
  }
}

/**
 * Detect thinking/reasoning mode support
 */
function detectThinkingSupport(modelId: string, provider: LLMProviderName): boolean {
  const id = modelId.toLowerCase();
  
  switch (provider) {
    case 'deepseek':
      return id.includes('reasoner');
    
    case 'openai':
      // o-series and GPT-5 support reasoning
      return id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4') || id.includes('gpt-5');
    
    case 'gemini':
      // Gemini 2.5+ and 3 support thinking
      return id.includes('gemini-2.5') || id.includes('gemini-3');
    
    case 'anthropic':
      // Claude 3.5+ has some reasoning capabilities
      return id.includes('claude-3.5') || id.includes('claude-4') || id.includes('sonnet-4') || id.includes('opus-4');
    
    default:
      return false;
  }
}

/**
 * Convert raw API model to ModelInfo format
 * 
 * Handles different API response formats from each provider:
 * - Anthropic: { id, display_name, created_at }
 * - OpenAI: { id, object, created, owned_by }
 * - DeepSeek: { id, object, owned_by }
 * - Gemini: { name, displayName, description, inputTokenLimit, outputTokenLimit, supportedGenerationMethods }
 * - OpenRouter: { id, name, pricing, context_length, top_provider, supported_parameters }
 */
export function normalizeApiModel(
  raw: Record<string, unknown>,
  provider: LLMProviderName
): ModelInfo {
  // Extract model ID (different providers use different field names)
  let id = (raw.id as string) || (raw.name as string) || '';
  
  // Strip 'models/' prefix from Gemini model names
  if (id.startsWith('models/')) {
    id = id.replace('models/', '');
  }
  
  // Extract display name
  const name = (raw.display_name as string) || 
               (raw.displayName as string) || 
               (raw.name as string) || 
               id;
  
  // Extract context window (provider-specific fields)
  const contextWindow = (raw.context_length as number) ||      // OpenRouter
                        (raw.contextWindow as number) ||       // Generic
                        (raw.inputTokenLimit as number) ||     // Gemini
                        128000;                                // Default
  
  // Extract max output tokens
  const maxOutputTokens = (raw.top_provider as { max_completion_tokens?: number })?.max_completion_tokens ||  // OpenRouter
                          (raw.outputTokenLimit as number) ||  // Gemini
                          8192;                                // Default
  
  // Get pricing - OpenRouter provides it in API response, others need lookup
  let inputCostPer1M = 0;
  let outputCostPer1M = 0;
  const pricing = raw.pricing as { prompt?: string; completion?: string } | undefined;
  if (pricing) {
    // OpenRouter pricing is per-token, convert to per-million
    inputCostPer1M = parseFloat(pricing.prompt || '0') * 1000000;
    outputCostPer1M = parseFloat(pricing.completion || '0') * 1000000;
  } else {
    // For non-OpenRouter providers, lookup pricing from static rates
    const rates = lookupModelPricing(id);
    inputCostPer1M = rates.inputPerMillion;
    outputCostPer1M = rates.outputPerMillion;
  }
  
  // Detect capabilities
  const tier = detectModelTier(id);
  const supportsTools = detectToolSupport(id, provider, raw);
  const supportsVision = detectVisionSupport(id, provider, raw);
  const supportsThinking = detectThinkingSupport(id, provider);
  
  // Check if this is the default model for the provider
  const isDefault = id === DEFAULT_MODELS[provider];
  
  // Check for multi-turn chat support (most models support this)
  const supportsMultiturnChat = !isNonChatModel(id);
  
  return {
    id,
    name,
    provider,
    contextWindow,
    maxOutputTokens,
    inputCostPer1M,
    outputCostPer1M,
    supportsTools,
    supportsVision,
    supportsStreaming: true,  // All providers support streaming
    supportsThinking,
    supportsMultiturnChat,
    tier,
    description: (raw.description as string) || '',
    isDefault,
  };
}

/**
 * Get cached models for a provider
 */
export function getCachedModels(provider: LLMProviderName): ModelInfo[] | null {
  const cached = modelCache.get(provider);
  if (!cached) return null;
  
  // Check if cache is still valid
  if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
    modelCache.delete(provider);
    return null;
  }
  
  return cached.models;
}

/**
 * Set cached models for a provider
 */
export function setCachedModels(provider: LLMProviderName, models: ModelInfo[]): void {
  modelCache.set(provider, {
    models,
    fetchedAt: Date.now(),
  });
  logger.debug('Cached models for provider', { provider, count: models.length });
}

/**
 * Clear cache for a provider or all providers
 */
export function clearModelCache(provider?: LLMProviderName): void {
  if (provider) {
    modelCache.delete(provider);
  } else {
    modelCache.clear();
  }
}

/**
 * Get tool-capable models from cache
 */
export function getToolCapableModels(provider: LLMProviderName): ModelInfo[] {
  const models = getCachedModels(provider);
  if (!models) return [];
  return models.filter(m => m.supportsTools);
}

/**
 * Get the first available tool-capable model for a provider from cache.
 * Returns null if no models are cached or none support tools.
 */
export function getFirstAvailableModel(provider: LLMProviderName): ModelInfo | null {
  const models = getCachedModels(provider);
  if (!models || models.length === 0) return null;
  
  // Prefer tool-capable models, but fall back to any model
  const toolCapable = models.filter(m => m.supportsTools && m.supportsMultiturnChat !== false);
  if (toolCapable.length > 0) {
    // Return the first one marked as default, or just the first one
    return toolCapable.find(m => m.isDefault) ?? toolCapable[0];
  }
  
  // Fall back to any chat-capable model
  const chatCapable = models.filter(m => m.supportsMultiturnChat !== false);
  return chatCapable[0] ?? models[0];
}

/**
 * Get all cached models across all providers
 */
export function getAllCachedModels(): ModelInfo[] {
  const allModels: ModelInfo[] = [];
  for (const [, cached] of modelCache) {
    if (Date.now() - cached.fetchedAt <= CACHE_TTL_MS) {
      allModels.push(...cached.models);
    }
  }
  return allModels;
}

/**
 * Get cache status for debugging
 */
export function getCacheStatus(): Record<LLMProviderName, { count: number; age: number } | null> {
  const status: Record<string, { count: number; age: number } | null> = {};
  const providers: LLMProviderName[] = ['anthropic', 'openai', 'deepseek', 'gemini', 'openrouter'];
  
  for (const provider of providers) {
    const cached = modelCache.get(provider);
    if (cached && Date.now() - cached.fetchedAt <= CACHE_TTL_MS) {
      status[provider] = {
        count: cached.models.length,
        age: Math.round((Date.now() - cached.fetchedAt) / 1000),
      };
    } else {
      status[provider] = null;
    }
  }
  
  return status as Record<LLMProviderName, { count: number; age: number } | null>;
}
