/**
 * Cost Manager
 *
 * Tracks and manages costs for agent operations.
 * Enforces budgets and provides cost attribution.
 */

import { randomUUID } from 'node:crypto';
import type {
  LLMProviderName,
  CostRecord,
  CostBudget,
  CostThresholdEvent,
} from '../../../shared/types';
import type { Logger } from '../../logger';
import { MODEL_PRICING, lookupModelPricing, type ModelPricing as _ModelPricing } from '../../../shared/providers/pricing';

// =============================================================================
// Types
// =============================================================================

/**
 * Cost rates per million tokens by provider and model
 */
export interface CostRates {
  inputPerMillion: number;
  outputPerMillion: number;
  /** Optional cache read cost (for providers with prompt caching) */
  cacheReadPerMillion?: number;
  /** Optional cache write cost */
  cacheWritePerMillion?: number;
}

// Re-export pricing data for backward compatibility
export const DEFAULT_COST_RATES: Record<string, CostRates> = MODEL_PRICING;

/**
 * Dynamic pricing cache for OpenRouter models
 * Populated when OpenRouter models are fetched
 */
const dynamicPricingCache = new Map<string, CostRates>();

/**
 * Register dynamic pricing from OpenRouter model data
 * Call this when OpenRouter models are fetched
 */
export function registerOpenRouterPricing(modelId: string, pricing: { prompt: string; completion: string }): void {
  const inputPerMillion = parseFloat(pricing.prompt) * 1_000_000;
  const outputPerMillion = parseFloat(pricing.completion) * 1_000_000;
  
  if (!isNaN(inputPerMillion) && !isNaN(outputPerMillion)) {
    dynamicPricingCache.set(modelId, { inputPerMillion, outputPerMillion });
  }
}

/**
 * Get dynamic pricing for a model (from OpenRouter cache)
 */
export function getDynamicPricing(modelId: string): CostRates | undefined {
  return dynamicPricingCache.get(modelId);
}

/**
 * Clear dynamic pricing cache
 */
export function clearDynamicPricingCache(): void {
  dynamicPricingCache.clear();
}

/**
 * Cost summary for an agent or session
 */
export interface CostSummary {
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
  byProvider: Record<LLMProviderName, number>;
  byModel: Record<string, number>;
}

// =============================================================================
// CostManager
// =============================================================================

/**
 * CostManager tracks costs and enforces budgets.
 *
 * Features:
 * - Per-request cost calculation
 * - Per-agent cost attribution
 * - Session budget enforcement
 * - Cost threshold alerts
 */
export class CostManager {
  private readonly logger: Logger;
  private readonly emitEvent: (event: CostThresholdEvent) => void;
  private budget: CostBudget;

  // Cost records
  private readonly records: CostRecord[] = [];

  // Per-agent totals
  private readonly agentCosts = new Map<string, number>();

  // Session total
  private sessionCost = 0;

  // Threshold tracking
  private sessionWarningEmitted = false;
  private readonly agentWarningsEmitted = new Set<string>();

  constructor(
    logger: Logger,
    emitEvent: (event: CostThresholdEvent) => void,
    budget?: Partial<CostBudget>
  ) {
    this.logger = logger;
    this.emitEvent = emitEvent;
    this.budget = {
      sessionBudget: budget?.sessionBudget ?? 10.00,
      perAgentBudget: budget?.perAgentBudget ?? 2.00,
      warningThreshold: budget?.warningThreshold ?? 0.8,
      enforceHardLimit: budget?.enforceHardLimit ?? true,
    };
  }

  // ===========================================================================
  // Cost Calculation
  // ===========================================================================

  /**
   * Calculate cost for a request
   */
  calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    const rates = this.getCostRates(model);
    
    const inputCost = (inputTokens / 1_000_000) * rates.inputPerMillion;
    const outputCost = (outputTokens / 1_000_000) * rates.outputPerMillion;
    
    return inputCost + outputCost;
  }

  /**
   * Get cost rates for a model
   * Checks dynamic pricing (OpenRouter) first, then static rates
   */
  private getCostRates(model: string): CostRates {
    // Check dynamic pricing cache first (OpenRouter models)
    const dynamicRates = getDynamicPricing(model);
    if (dynamicRates) {
      return dynamicRates;
    }

    // Use shared pricing lookup
    return lookupModelPricing(model);
  }

  // ===========================================================================
  // Recording
  // ===========================================================================

  /**
   * Record a cost entry
   */
  recordCost(
    agentId: string,
    sessionId: string,
    provider: LLMProviderName,
    model: string,
    inputTokens: number,
    outputTokens: number,
    requestType: 'chat' | 'tool' = 'chat'
  ): CostRecord {
    const cost = this.calculateCost(model, inputTokens, outputTokens);

    const record: CostRecord = {
      id: randomUUID(),
      agentId,
      sessionId,
      provider,
      model,
      inputTokens,
      outputTokens,
      cost,
      timestamp: Date.now(),
      requestType,
    };

    this.records.push(record);

    // Update totals
    this.sessionCost += cost;
    const agentTotal = (this.agentCosts.get(agentId) ?? 0) + cost;
    this.agentCosts.set(agentId, agentTotal);

    // Check thresholds
    this.checkThresholds(agentId);

    this.logger.debug('Cost recorded', {
      agentId,
      cost: cost.toFixed(4),
      sessionTotal: this.sessionCost.toFixed(4),
    });

    return record;
  }

  /**
   * Check and emit threshold events
   */
  private checkThresholds(agentId: string): void {
    // Check session threshold
    const sessionPercent = this.sessionCost / this.budget.sessionBudget;
    if (sessionPercent >= this.budget.warningThreshold && !this.sessionWarningEmitted) {
      this.sessionWarningEmitted = true;
      this.emitEvent({
        type: 'cost-threshold-reached',
        currentCost: this.sessionCost,
        budget: this.budget.sessionBudget,
        percentUsed: Math.round(sessionPercent * 100),
        isHardLimit: this.budget.enforceHardLimit,
        timestamp: Date.now(),
      });
    }

    // Check agent threshold
    const agentCost = this.agentCosts.get(agentId) ?? 0;
    const agentPercent = agentCost / this.budget.perAgentBudget;
    if (agentPercent >= this.budget.warningThreshold && 
        !this.agentWarningsEmitted.has(agentId)) {
      this.agentWarningsEmitted.add(agentId);
      this.emitEvent({
        type: 'cost-threshold-reached',
        agentId,
        currentCost: agentCost,
        budget: this.budget.perAgentBudget,
        percentUsed: Math.round(agentPercent * 100),
        isHardLimit: this.budget.enforceHardLimit,
        timestamp: Date.now(),
      });
    }
  }

  // ===========================================================================
  // Budget Checking
  // ===========================================================================

  /**
   * Check if agent can proceed with estimated cost
   */
  checkBudget(agentId: string, estimatedCost: number): {
    canProceed: boolean;
    reason?: string;
  } {
    if (!this.budget.enforceHardLimit) {
      return { canProceed: true };
    }

    // Check session budget
    if (this.sessionCost + estimatedCost > this.budget.sessionBudget) {
      return {
        canProceed: false,
        reason: `Session budget exceeded (${this.sessionCost.toFixed(2)}/${this.budget.sessionBudget.toFixed(2)} USD)`,
      };
    }

    // Check agent budget
    const agentCost = this.agentCosts.get(agentId) ?? 0;
    if (agentCost + estimatedCost > this.budget.perAgentBudget) {
      return {
        canProceed: false,
        reason: `Agent budget exceeded (${agentCost.toFixed(2)}/${this.budget.perAgentBudget.toFixed(2)} USD)`,
      };
    }

    return { canProceed: true };
  }

  /**
   * Estimate cost for a request
   */
  estimateCost(model: string, estimatedInputTokens: number, estimatedOutputTokens: number): number {
    return this.calculateCost(model, estimatedInputTokens, estimatedOutputTokens);
  }

  // ===========================================================================
  // Queries
  // ===========================================================================

  /**
   * Get cost for an agent
   */
  getAgentCost(agentId: string): number {
    return this.agentCosts.get(agentId) ?? 0;
  }

  /**
   * Get session cost
   */
  getSessionCost(): number {
    return this.sessionCost;
  }

  /**
   * Get cost summary for an agent
   */
  getAgentSummary(agentId: string): CostSummary {
    const agentRecords = this.records.filter(r => r.agentId === agentId);
    return this.buildSummary(agentRecords);
  }

  /**
   * Get session cost summary
   */
  getSessionSummary(): CostSummary {
    return this.buildSummary(this.records);
  }

  /**
   * Build summary from records
   */
  private buildSummary(records: CostRecord[]): CostSummary {
    const byProvider: Record<LLMProviderName, number> = {
      anthropic: 0,
      openai: 0,
      deepseek: 0,
      gemini: 0,
      openrouter: 0,
    };
    const byModel: Record<string, number> = {};

    let totalCost = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    for (const record of records) {
      totalCost += record.cost;
      inputTokens += record.inputTokens;
      outputTokens += record.outputTokens;
      byProvider[record.provider] += record.cost;
      byModel[record.model] = (byModel[record.model] ?? 0) + record.cost;
    }

    return {
      totalCost,
      inputTokens,
      outputTokens,
      requestCount: records.length,
      byProvider,
      byModel,
    };
  }

  /**
   * Get all records
   */
  getRecords(options?: {
    agentId?: string;
    provider?: LLMProviderName;
    since?: number;
    limit?: number;
  }): CostRecord[] {
    let results = [...this.records];

    if (options?.agentId) {
      results = results.filter(r => r.agentId === options.agentId);
    }

    if (options?.provider) {
      results = results.filter(r => r.provider === options.provider);
    }

    if (options?.since) {
      results = results.filter(r => r.timestamp >= options.since);
    }

    if (options?.limit) {
      results = results.slice(-options.limit);
    }

    return results;
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  /**
   * Update budget configuration
   */
  setBudget(budget: Partial<CostBudget>): void {
    this.budget = { ...this.budget, ...budget };
    this.logger.debug('Budget updated', { budget: this.budget });
  }

  /**
   * Get current budget
   */
  getBudget(): CostBudget {
    return { ...this.budget };
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Clear all records and reset
   */
  clear(): void {
    this.records.length = 0;
    this.agentCosts.clear();
    this.sessionCost = 0;
    this.sessionWarningEmitted = false;
    this.agentWarningsEmitted.clear();
  }
}
