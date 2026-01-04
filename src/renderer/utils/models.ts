/**
 * Model Utilities
 * 
 * Shared utilities for working with LLM models in the renderer.
 * Provides model conversion, fetching, and caching functionality.
 */

import type { LLMProviderName } from '../../shared/types';
import type { ModelInfo } from '../../shared/providers/types';
import { DEFAULT_MODELS } from '../../shared/providers/models';
import { lookupModelPricing } from '../../shared/providers/pricing';
import { createLogger } from './logger';

const logger = createLogger('Models');

// Re-export OpenRouter filter utilities
export {
  type OpenRouterApiModel,
  type ModelCategory,
  type ModelSeries,
  type OpenRouterFilterCriteria,
  type SortField,
  type SortOrder,
  getModelSeries,
  getModelSeries as getOpenRouterModelProvider, // Alias for backward compatibility
  getModelCategory,
  getModelCategory as getOpenRouterModelCategory, // Alias for backward compatibility
  supportsTools as openRouterSupportsTools,
  supportsVision as openRouterSupportsVision,
  isFreeModel,
  getPromptPricePerMillion,
  getCompletionPricePerMillion,
  filterOpenRouterModels,
  sortOpenRouterModels,
  getFilterOptions,
  groupModelsBySeries,
  groupModelsByCategory,
} from './openrouterFilters';

/** Generic API model interface for dynamic fetching */
export interface ApiModel {
  id?: string;
  name?: string;
  display_name?: string;
  displayName?: string;
  context_length?: number;
  contextWindow?: number;
  inputTokenLimit?: number;
  pricing?: { prompt: string; completion: string };
  top_provider?: { max_completion_tokens: number };
  outputTokenLimit?: number;
  supported_parameters?: string[];
  supportedGenerationMethods?: string[];
  /** OpenRouter architecture info */
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
}

/** Non-chat model patterns - models that don't support multi-turn conversations */
const NON_CHAT_PATTERNS = [
  /embed/i, /tts/i, /whisper/i, /dall-e/i, /moderation/i, 
  /imagen/i, /text-embedding/i, /ada-/i, /babbage-/i, /davinci-/i, /curie-/i, /aqa/i
];

/** Check if model is a non-chat model */
function isNonChatModel(modelId: string): boolean {
  return NON_CHAT_PATTERNS.some(p => p.test(modelId));
}

/**
 * Convert API model response to normalized ModelInfo format
 * Handles different API response formats from each provider
 */
export function apiModelToModelInfo(model: ApiModel, provider: LLMProviderName): ModelInfo {
  let modelId = model.id || model.name || '';
  if (modelId.startsWith('models/')) modelId = modelId.replace('models/', '');
  
  const displayName = model.display_name || model.displayName || model.name || modelId;
  const contextWindow = model.context_length || model.contextWindow || model.inputTokenLimit || 128000;
  const maxOutput = model.top_provider?.max_completion_tokens || model.outputTokenLimit || 8192;
  const idLower = modelId.toLowerCase();
  
  // Get pricing - OpenRouter provides it in API response, others need lookup
  let inputCost = 0, outputCost = 0;
  if (model.pricing) {
    // OpenRouter pricing is per-token, convert to per-million
    inputCost = parseFloat(model.pricing.prompt) * 1000000;
    outputCost = parseFloat(model.pricing.completion) * 1000000;
  } else {
    // For non-OpenRouter providers, lookup pricing from static rates
    const rates = lookupModelPricing(modelId);
    inputCost = rates.inputPerMillion;
    outputCost = rates.outputPerMillion;
  }
  
  // Determine tier based on model name patterns
  let tier: ModelInfo['tier'] = 'balanced';
  if (idLower.includes('opus') || idLower.includes('-pro') || idLower.includes('5.2') || 
      idLower.includes('5.1') || idLower.includes('gpt-5') || idLower.includes('gemini-3') ||
      idLower.includes('gemini-2.5-pro') || idLower.includes('o3-pro') || idLower.includes('o1-pro')) {
    tier = 'flagship';
  } else if (idLower.includes('mini') || idLower.includes('nano') || idLower.includes('fast') || 
             idLower.includes('lite') || idLower.includes('flash') || idLower.includes('haiku')) {
    tier = 'fast';
  } else if (idLower.includes('legacy') || idLower.includes('3.5') || idLower.includes('gpt-4o') ||
             idLower.includes('gemini-1.5') || idLower.includes('gemini-2.0')) {
    tier = 'legacy';
  }
  
  // Tool support detection - provider-specific
  let supportsTools = false;
  if (!isNonChatModel(modelId)) {
    switch (provider) {
      case 'openrouter':
        supportsTools = model.supported_parameters?.includes('tools') || 
                        model.supported_parameters?.includes('tool_choice') || false;
        break;
      case 'gemini':
        supportsTools = (model.supportedGenerationMethods?.includes('generateContent') || false) &&
                        !idLower.includes('tts') && !idLower.includes('embedding') && 
                        !idLower.includes('imagen') && !idLower.includes('aqa');
        break;
      case 'anthropic':
        supportsTools = idLower.startsWith('claude-');
        break;
      case 'openai':
        supportsTools = idLower.startsWith('gpt-') || idLower.startsWith('o1') || 
                        idLower.startsWith('o3') || idLower.startsWith('o4');
        break;
      case 'deepseek':
        supportsTools = idLower.startsWith('deepseek-');
        break;
      default:
        supportsTools = true;
    }
  }
  
  // Vision support detection - use architecture data for OpenRouter
  let supportsVision = false;
  if (provider === 'openrouter' && model.architecture?.input_modalities) {
    supportsVision = model.architecture.input_modalities.includes('image') || 
                     model.architecture.input_modalities.includes('vision');
  } else {
    supportsVision = (provider === 'anthropic' && (idLower.includes('claude-3') || idLower.includes('claude-4'))) ||
                     (provider === 'openai' && (idLower.includes('4o') || idLower.includes('vision') || idLower.includes('gpt-5'))) ||
                     (provider === 'gemini' && !idLower.includes('tts') && !idLower.includes('embedding')) ||
                     (provider === 'deepseek' && (idLower.includes('chat') || idLower.includes('reasoner'))) ||
                     idLower.includes('vision');
  }
  
  return {
    id: modelId,
    name: displayName,
    provider,
    contextWindow,
    maxOutputTokens: maxOutput,
    inputCostPer1M: inputCost,
    outputCostPer1M: outputCost,
    supportsTools,
    supportsVision,
    supportsStreaming: true,
    tier,
    description: '',
    isDefault: modelId === DEFAULT_MODELS[provider],
  };
}

/** Cache for fetched models per provider */
const modelsCache = new Map<LLMProviderName, { models: ModelInfo[]; fetchedAt: number }>();
/** Cache for raw OpenRouter models (for filtering) */
let _rawOpenRouterCache: { models: OpenRouterApiModel[]; fetchedAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

import type { OpenRouterApiModel } from './openrouterFilters';

/**
 * Fetch raw OpenRouter models for filtering
 * Returns all models without conversion or filtering
 */
export async function fetchRawOpenRouterModels(): Promise<OpenRouterApiModel[]> {
  // Check cache
  if (_rawOpenRouterCache && Date.now() - _rawOpenRouterCache.fetchedAt < CACHE_TTL) {
    return _rawOpenRouterCache.models;
  }
  
  try {
    const result = await window.vyotiq.openrouter.fetchModels();
    if (result.success) {
      _rawOpenRouterCache = { 
        models: result.models as unknown as OpenRouterApiModel[], 
        fetchedAt: Date.now() 
      };
      return _rawOpenRouterCache.models;
    }
  } catch (err) {
    logger.error('Failed to fetch raw OpenRouter models', { error: err });
  }
  
  return [];
}

/**
 * Fetch models for a provider with caching
 * Returns only tool-capable models suitable for agent use
 */
export async function fetchProviderModels(provider: LLMProviderName): Promise<ModelInfo[]> {
  // Check cache
  const cached = modelsCache.get(provider);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.models;
  }
  
  try {
    let result: { success: boolean; models: ApiModel[]; error?: string };
    switch (provider) {
      case 'anthropic':
        result = await window.vyotiq.anthropic.fetchModels();
        break;
      case 'openai':
        result = await window.vyotiq.openai.fetchModels();
        break;
      case 'deepseek':
        result = await window.vyotiq.deepseek.fetchModels();
        break;
      case 'gemini':
        result = await window.vyotiq.gemini.fetchModels();
        break;
      case 'openrouter':
        result = await window.vyotiq.openrouter.fetchModels();
        break;
      default:
        return [];
    }
    
    if (result.success) {
      const models = result.models
        .map(m => apiModelToModelInfo(m, provider))
        .filter(m => m.supportsTools); // Only tool-capable models for agent use
      
      // Sort: default first, then by tier
      const tierOrder = { flagship: 0, balanced: 1, fast: 2, legacy: 3 };
      models.sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return tierOrder[a.tier] - tierOrder[b.tier];
      });
      
      modelsCache.set(provider, { models, fetchedAt: Date.now() });
      return models;
    }
  } catch (err) {
    logger.error(`Failed to fetch models for ${provider}`, { error: err, provider });
  }
  
  return [];
}

/**
 * Clear the models cache for a provider or all providers
 */
export function clearModelsCache(provider?: LLMProviderName): void {
  if (provider) {
    modelsCache.delete(provider);
  } else {
    modelsCache.clear();
  }
}

/**
 * Get cached models for a provider (without fetching)
 */
export function getCachedModels(provider: LLMProviderName): ModelInfo[] | null {
  const cached = modelsCache.get(provider);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.models;
  }
  return null;
}
