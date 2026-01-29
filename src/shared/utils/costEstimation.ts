/**
 * Cost Estimation Utility
 * 
 * Calculates estimated API costs based on token usage and model pricing.
 */

import type { TokenUsage, LLMProviderName } from '../types';
import { getModelById, getDefaultModel } from '../providers/models';
import { lookupModelPricing } from '../providers/pricing';

export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  formattedTotal: string;
  formattedInput: string;
  formattedOutput: string;
}

export interface SessionCostSummary {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  messageCount: number;
  formattedCost: string;
  averageCostPerMessage: number;
}

/** 
 * DeepSeek cache hit pricing: 10x cheaper than cache miss
 * @see https://api-docs.deepseek.com/quick_start/pricing
 */
const DEEPSEEK_CACHE_HIT_COST_PER_1M = 0.028;
const DEEPSEEK_CACHE_MISS_COST_PER_1M = 0.28;

/**
 * Calculate cost for a single message based on token usage
 */
export function calculateMessageCost(
  usage: TokenUsage | undefined,
  modelId?: string,
  provider?: LLMProviderName
): CostEstimate {
  const defaultEstimate: CostEstimate = {
    inputCost: 0,
    outputCost: 0,
    totalCost: 0,
    formattedTotal: '$0.00',
    formattedInput: '$0.00',
    formattedOutput: '$0.00',
  };

  if (!usage) return defaultEstimate;

  // Get pricing - try model lookup first, then use shared pricing lookup
  let inputCostPer1M = 0;
  let outputCostPer1M = 0;
  
  const model = modelId ? getModelById(modelId) : undefined;
  if (model && model.inputCostPer1M > 0) {
    inputCostPer1M = model.inputCostPer1M;
    outputCostPer1M = model.outputCostPer1M;
  } else if (modelId) {
    // Fallback to shared pricing lookup for dynamically fetched models
    const pricing = lookupModelPricing(modelId);
    inputCostPer1M = pricing.inputPerMillion;
    outputCostPer1M = pricing.outputPerMillion;
  } else if (provider) {
    // Last resort: get default model for provider
    const defaultModel = getDefaultModel(provider);
    if (defaultModel) {
      const pricing = lookupModelPricing(defaultModel.id);
      inputCostPer1M = pricing.inputPerMillion;
      outputCostPer1M = pricing.outputPerMillion;
    }
  }

  // Calculate input cost with cache-aware pricing for DeepSeek
  let inputCost: number;
  if (provider === 'deepseek' && (usage.cacheHit !== undefined || usage.cacheMiss !== undefined)) {
    // DeepSeek provides cache hit/miss breakdown - use actual cache pricing
    const cacheHitTokens = usage.cacheHit ?? 0;
    const cacheMissTokens = usage.cacheMiss ?? (usage.input - cacheHitTokens);
    inputCost = 
      (cacheHitTokens / 1_000_000) * DEEPSEEK_CACHE_HIT_COST_PER_1M +
      (cacheMissTokens / 1_000_000) * DEEPSEEK_CACHE_MISS_COST_PER_1M;
  } else {
    inputCost = (usage.input / 1_000_000) * inputCostPer1M;
  }
  
  const outputCost = (usage.output / 1_000_000) * outputCostPer1M;
  const totalCost = inputCost + outputCost;

  return {
    inputCost,
    outputCost,
    totalCost,
    formattedTotal: formatCost(totalCost),
    formattedInput: formatCost(inputCost),
    formattedOutput: formatCost(outputCost),
  };
}

/**
 * Calculate total cost for a session based on all messages
 */
export function calculateSessionCost(
  messages: Array<{ usage?: TokenUsage; modelId?: string; provider?: LLMProviderName }>
): SessionCostSummary {
  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let messageCount = 0;

  for (const msg of messages) {
    if (msg.usage) {
      const cost = calculateMessageCost(msg.usage, msg.modelId, msg.provider);
      totalCost += cost.totalCost;
      totalInputTokens += msg.usage.input;
      totalOutputTokens += msg.usage.output;
      messageCount++;
    }
  }

  return {
    totalCost,
    totalInputTokens,
    totalOutputTokens,
    messageCount,
    formattedCost: formatCost(totalCost),
    averageCostPerMessage: messageCount > 0 ? totalCost / messageCount : 0,
  };
}

/**
 * Format cost as currency string
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    // Show more precision for very small amounts
    return `$${cost.toFixed(4)}`;
  }
  if (cost < 1) {
    return `$${cost.toFixed(3)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Format token count with K/M suffix
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * Estimate cost for a prompt before sending
 */
export function estimatePromptCost(
  promptTokens: number,
  estimatedOutputTokens: number,
  modelId?: string,
  provider?: LLMProviderName
): CostEstimate {
  return calculateMessageCost(
    { input: promptTokens, output: estimatedOutputTokens, total: promptTokens + estimatedOutputTokens },
    modelId,
    provider
  );
}
