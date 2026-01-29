/**
 * Model Registry
 * 
 * Models are fetched dynamically via provider APIs.
 * This module provides lookup functions and default model IDs.
 * 
 * All providers now fetch models dynamically:
 * - Anthropic: /v1/models
 * - OpenAI: /v1/models
 * - DeepSeek: /models
 * - Gemini: /v1beta/models
 * - xAI: /v1/models
 * - Mistral: /v1/models
 * - OpenRouter: /api/v1/models
 */

import type { LLMProviderName } from '../../types';
import type { ModelInfo } from '../types';

// Import default model IDs from each provider
import { ANTHROPIC_MODELS, ANTHROPIC_DEFAULT_MODEL } from './anthropic';
import { OPENAI_MODELS, OPENAI_DEFAULT_MODEL } from './openai';
import { DEEPSEEK_MODELS, DEEPSEEK_DEFAULT_MODEL } from './deepseek';
import { GEMINI_MODELS, GEMINI_DEFAULT_MODEL } from './gemini';
import { XAI_MODELS, XAI_DEFAULT_MODEL } from './xai';
import { MISTRAL_MODELS, MISTRAL_DEFAULT_MODEL } from './mistral';
import { GLM_MODELS, GLM_DEFAULT_MODEL } from './glm';

// =============================================================================
// Default Model IDs (used when API is unavailable)
// =============================================================================

export const DEFAULT_MODELS: Record<LLMProviderName, string> = {
  anthropic: ANTHROPIC_DEFAULT_MODEL,
  openai: OPENAI_DEFAULT_MODEL,
  deepseek: DEEPSEEK_DEFAULT_MODEL,
  gemini: GEMINI_DEFAULT_MODEL,
  xai: XAI_DEFAULT_MODEL,
  mistral: MISTRAL_DEFAULT_MODEL,
  glm: GLM_DEFAULT_MODEL,
  openrouter: 'anthropic/claude-sonnet-4',
};

// =============================================================================
// Model Registry (empty by default - populated dynamically)
// =============================================================================

/** All models from all providers (empty - models are fetched dynamically) */
export const MODELS: ModelInfo[] = [
  ...ANTHROPIC_MODELS,
  ...OPENAI_MODELS,
  ...DEEPSEEK_MODELS,
  ...GEMINI_MODELS,
  ...XAI_MODELS,
  ...MISTRAL_MODELS,
  ...GLM_MODELS,
];

/** Models indexed by provider for fast lookup (empty - models are fetched dynamically) */
const MODEL_BY_PROVIDER: Record<LLMProviderName, ModelInfo[]> = {
  anthropic: ANTHROPIC_MODELS,
  openai: OPENAI_MODELS,
  deepseek: DEEPSEEK_MODELS,
  gemini: GEMINI_MODELS,
  xai: XAI_MODELS,
  mistral: MISTRAL_MODELS,
  glm: GLM_MODELS,
  openrouter: [], // OpenRouter models are fetched dynamically via API
};

/** Models indexed by ID for fast lookup */
const MODEL_BY_ID: Map<string, ModelInfo> = new Map(
  MODELS.map(model => [model.id, model])
);

// =============================================================================
// Model Lookup Functions
// =============================================================================

/**
 * Get all models for a specific provider
 */
export function getModelsForProvider(provider: LLMProviderName): ModelInfo[] {
  return MODEL_BY_PROVIDER[provider] ?? [];
}

/**
 * Get the default model for a provider
 */
export function getDefaultModel(provider: LLMProviderName): ModelInfo | undefined {
  const models = MODEL_BY_PROVIDER[provider];
  return models?.find(m => m.isDefault) ?? models?.[0];
}

/**
 * Get a specific model by ID
 */
export function getModelById(modelId: string): ModelInfo | undefined {
  return MODEL_BY_ID.get(modelId);
}

/**
 * Get all models (from all providers)
 */
export function getAllModels(): ModelInfo[] {
  return [...MODELS];
}

/**
 * Get models filtered by tier
 */
export function getModelsByTier(tier: ModelInfo['tier']): ModelInfo[] {
  return MODELS.filter(m => m.tier === tier);
}

/**
 * Get models that support a specific feature
 */
export function getModelsWithFeature(
  feature: 'tools' | 'vision' | 'streaming'
): ModelInfo[] {
  switch (feature) {
    case 'tools':
      return MODELS.filter(m => m.supportsTools);
    case 'vision':
      return MODELS.filter(m => m.supportsVision);
    case 'streaming':
      return MODELS.filter(m => m.supportsStreaming);
  }
}

/**
 * Get models that support multi-turn chat conversations.
 * Filters out TTS, image-only, and other specialized models.
 * 
 * @param models - Optional array of models to filter. Defaults to all models.
 * @returns Models that support multi-turn chat (supportsMultiturnChat !== false)
 */
export function getChatCapableModels(models?: ModelInfo[]): ModelInfo[] {
  const source = models ?? MODELS;
  // Default to true if not explicitly set to false
  return source.filter(m => m.supportsMultiturnChat !== false);
}

/**
 * Get chat-capable models for a specific provider
 * Filters out TTS, image-only, and other specialized models.
 */
export function getChatModelsForProvider(provider: LLMProviderName): ModelInfo[] {
  return getChatCapableModels(MODEL_BY_PROVIDER[provider] ?? []);
}

/**
 * Check if a model ID is valid
 */
export function isValidModelId(modelId: string): boolean {
  return MODEL_BY_ID.has(modelId);
}

/**
 * Get the provider for a model ID
 */
export function getProviderForModel(modelId: string): LLMProviderName | undefined {
  return MODEL_BY_ID.get(modelId)?.provider;
}

// Re-export individual provider models and defaults for direct access
export { ANTHROPIC_MODELS, ANTHROPIC_DEFAULT_MODEL } from './anthropic';
export { OPENAI_MODELS, OPENAI_DEFAULT_MODEL } from './openai';
export { DEEPSEEK_MODELS, DEEPSEEK_DEFAULT_MODEL } from './deepseek';
export { GEMINI_MODELS, GEMINI_DEFAULT_MODEL } from './gemini';
export { XAI_MODELS, XAI_DEFAULT_MODEL } from './xai';
export { MISTRAL_MODELS, MISTRAL_DEFAULT_MODEL } from './mistral';
export { GLM_MODELS, GLM_DEFAULT_MODEL } from './glm';
