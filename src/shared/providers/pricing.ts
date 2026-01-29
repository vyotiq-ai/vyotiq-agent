/**
 * Model Pricing Data
 * 
 * Static pricing rates for all supported models.
 * Used by both main process (CostManager) and renderer (model display).
 * 
 * @see https://www.anthropic.com/pricing
 * @see https://openai.com/api/pricing
 * @see https://api-docs.deepseek.com/quick_start/pricing
 * @see https://ai.google.dev/gemini-api/docs/pricing
 */

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
}

/**
 * Static pricing rates (USD per million tokens)
 * Updated December 2025 from official API documentation
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // ==========================================================================
  // Anthropic
  // ==========================================================================
  'claude-opus-4-5': { inputPerMillion: 5, outputPerMillion: 25, cacheReadPerMillion: 0.5, cacheWritePerMillion: 6.25 },
  'claude-sonnet-4-5': { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
  'claude-opus-4-1': { inputPerMillion: 15, outputPerMillion: 75, cacheReadPerMillion: 1.5, cacheWritePerMillion: 18.75 },
  'claude-opus-4': { inputPerMillion: 15, outputPerMillion: 75, cacheReadPerMillion: 1.5, cacheWritePerMillion: 18.75 },
  'claude-sonnet-4': { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
  'claude-3-7-sonnet': { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
  'claude-3-5-sonnet': { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
  'claude-3-5-haiku': { inputPerMillion: 0.8, outputPerMillion: 4, cacheReadPerMillion: 0.08, cacheWritePerMillion: 1 },
  'claude-3-opus': { inputPerMillion: 15, outputPerMillion: 75, cacheReadPerMillion: 1.5, cacheWritePerMillion: 18.75 },
  'claude-3-sonnet': { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
  'claude-3-haiku': { inputPerMillion: 0.25, outputPerMillion: 1.25, cacheReadPerMillion: 0.03, cacheWritePerMillion: 0.3 },

  // ==========================================================================
  // OpenAI
  // ==========================================================================
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gpt-4.1': { inputPerMillion: 2, outputPerMillion: 8 },
  'gpt-4.1-mini': { inputPerMillion: 0.4, outputPerMillion: 1.6 },
  'gpt-4.1-nano': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  'o1': { inputPerMillion: 15, outputPerMillion: 60 },
  'o1-mini': { inputPerMillion: 1.1, outputPerMillion: 4.4 },
  'o1-pro': { inputPerMillion: 150, outputPerMillion: 600 },
  'o3': { inputPerMillion: 2, outputPerMillion: 8 },
  'o3-mini': { inputPerMillion: 1.1, outputPerMillion: 4.4 },
  'o4-mini': { inputPerMillion: 1.1, outputPerMillion: 4.4 },
  'gpt-4-turbo': { inputPerMillion: 10, outputPerMillion: 30 },
  'gpt-4': { inputPerMillion: 30, outputPerMillion: 60 },
  'gpt-3.5-turbo': { inputPerMillion: 0.5, outputPerMillion: 1.5 },

  // ==========================================================================
  // DeepSeek
  // ==========================================================================
  'deepseek-chat': { inputPerMillion: 0.28, outputPerMillion: 0.42, cacheReadPerMillion: 0.028 },
  'deepseek-reasoner': { inputPerMillion: 0.28, outputPerMillion: 0.42, cacheReadPerMillion: 0.028 },

  // ==========================================================================
  // Google Gemini
  // ==========================================================================
  'gemini-3-pro': { inputPerMillion: 2, outputPerMillion: 12, cacheReadPerMillion: 0.2 },
  'gemini-3-flash': { inputPerMillion: 0.5, outputPerMillion: 3, cacheReadPerMillion: 0.05 },
  'gemini-2.5-pro': { inputPerMillion: 1.25, outputPerMillion: 10, cacheReadPerMillion: 0.125 },
  'gemini-2.5-flash': { inputPerMillion: 0.3, outputPerMillion: 2.5, cacheReadPerMillion: 0.03 },
  'gemini-2.0-flash': { inputPerMillion: 0.1, outputPerMillion: 0.4, cacheReadPerMillion: 0.025 },
  'gemini-2.0-flash-lite': { inputPerMillion: 0.075, outputPerMillion: 0.3 },
  'gemini-1.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5, cacheReadPerMillion: 0.3125 },
  'gemini-1.5-flash': { inputPerMillion: 0.075, outputPerMillion: 0.3, cacheReadPerMillion: 0.01875 },

  // ==========================================================================
  // xAI (Grok)
  // ==========================================================================
  'grok-4': { inputPerMillion: 3, outputPerMillion: 15 },
  'grok-3': { inputPerMillion: 3, outputPerMillion: 15 },
  'grok-3-fast': { inputPerMillion: 1, outputPerMillion: 5 },
  'grok-2': { inputPerMillion: 2, outputPerMillion: 10 },
  'grok-2-vision': { inputPerMillion: 2, outputPerMillion: 10 },

  // ==========================================================================
  // Mistral AI
  // ==========================================================================
  'mistral-large-latest': { inputPerMillion: 2, outputPerMillion: 6 },
  'mistral-large-2512': { inputPerMillion: 2, outputPerMillion: 6 },
  'mistral-medium-latest': { inputPerMillion: 2.7, outputPerMillion: 8.1 },
  'mistral-small-latest': { inputPerMillion: 0.2, outputPerMillion: 0.6 },
  'codestral-latest': { inputPerMillion: 0.3, outputPerMillion: 0.9 },
  'ministral-3b-latest': { inputPerMillion: 0.04, outputPerMillion: 0.04 },
  'ministral-8b-latest': { inputPerMillion: 0.1, outputPerMillion: 0.1 },
  'open-mistral-nemo': { inputPerMillion: 0.15, outputPerMillion: 0.15 },

  // ==========================================================================
  // Z.AI GLM
  // @see https://docs.z.ai
  // ==========================================================================
  'glm-4.7': { inputPerMillion: 0.6, outputPerMillion: 2.2 },
  'glm-4.6': { inputPerMillion: 0.4, outputPerMillion: 1.6 },
  'glm-4.5': { inputPerMillion: 0.3, outputPerMillion: 1.2 },
  'glm-4-32b-0414-128k': { inputPerMillion: 0.2, outputPerMillion: 0.8 },
  'glm-4.6v': { inputPerMillion: 0.5, outputPerMillion: 2.0 },
  'glm-4.5v': { inputPerMillion: 0.4, outputPerMillion: 1.6 },
};

/** Default fallback pricing */
const DEFAULT_PRICING: ModelPricing = { inputPerMillion: 1, outputPerMillion: 4 };

/**
 * Lookup pricing for a model
 * Tries exact match first, then prefix match for versioned models
 */
export function lookupModelPricing(modelId: string): ModelPricing {
  // Try exact match
  if (MODEL_PRICING[modelId]) {
    return MODEL_PRICING[modelId];
  }
  
  // Try prefix match for versioned models (e.g., claude-sonnet-4-5-20250929 -> claude-sonnet-4-5)
  for (const [key, rates] of Object.entries(MODEL_PRICING)) {
    if (modelId.startsWith(key) || modelId.includes(key)) {
      return rates;
    }
  }
  
  return DEFAULT_PRICING;
}
