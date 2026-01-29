/**
 * Tool Ranking Engine
 *
 * Ranks search results based on multiple factors including
 * relevance, usage, success rate, and recency.
 */
import type {
  ToolRankingFactors,
  ToolRankingConfig,
  RankedToolResult,
  ToolUsageStats,
} from '../../../shared/types';
import { createLogger } from '../../logger';
import { getToolUsageTracker } from './ToolUsageTracker';

const logger = createLogger('ToolRankingEngine');

/**
 * Default ranking weights
 */
export const DEFAULT_RANKING_CONFIG: ToolRankingConfig = {
  relevanceWeight: 0.4,
  frequencyWeight: 0.2,
  successRateWeight: 0.2,
  recencyWeight: 0.1,
  preferenceWeight: 0.1,
};

/**
 * Raw search result to be ranked
 */
export interface RawSearchResult {
  toolName: string;
  description: string;
  isDynamic: boolean;
  relevanceScore: number; // 0-1 from text search
}

/**
 * Tool Ranking Engine class
 */
export class ToolRankingEngine {
  private config: ToolRankingConfig;
  private userPreferences = new Map<string, number>(); // toolName -> preference score

  constructor(config?: Partial<ToolRankingConfig>) {
    this.config = { ...DEFAULT_RANKING_CONFIG, ...config };
  }

  /**
   * Rank a list of search results
   */
  rankResults(results: RawSearchResult[], _context?: string): RankedToolResult[] {
    const tracker = getToolUsageTracker();
    const now = Date.now();

    // Calculate max values for normalization
    let maxFrequency = 0;
    const statsMap = new Map<string, ReturnType<typeof tracker.getStats>>();

    for (const result of results) {
      const stats = tracker.getStats(result.toolName);
      statsMap.set(result.toolName, stats);
      if (stats.totalInvocations > maxFrequency) {
        maxFrequency = stats.totalInvocations;
      }
    }

    // Rank each result
    const ranked: RankedToolResult[] = results.map(result => {
      const stats = statsMap.get(result.toolName)!;
      const factors = this.calculateFactors(result, stats, maxFrequency, now);
      const score = this.calculateScore(factors);

      return {
        toolName: result.toolName,
        description: result.description,
        isDynamic: result.isDynamic,
        score,
        factors,
        matchReason: this.explainRanking(factors),
      };
    });

    // Sort by score descending
    ranked.sort((a, b) => b.score - a.score);

    return ranked;
  }

  /**
   * Calculate ranking factors for a result
   */
  private calculateFactors(
    result: RawSearchResult,
    stats: ToolUsageStats,
    maxFrequency: number,
    now: number
  ): ToolRankingFactors {
    // Relevance: direct from search
    const relevance = result.relevanceScore;

    // Frequency: normalized 0-1
    const frequency = maxFrequency > 0 
      ? stats.totalInvocations / maxFrequency 
      : 0;

    // Success rate: already 0-1
    const successRate = stats.successRate;

    // Recency: decay over time (1 week half-life)
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const recency = stats.lastUsedAt > 0
      ? Math.exp(-((now - stats.lastUsedAt) / weekMs) * Math.LN2)
      : 0;

    // Preference: user-specific
    const preference = this.userPreferences.get(result.toolName) ?? 0.5;

    return {
      relevance,
      frequency,
      successRate,
      recency,
      preference,
    };
  }

  /**
   * Calculate weighted score from factors
   */
  private calculateScore(factors: ToolRankingFactors): number {
    return (
      factors.relevance * this.config.relevanceWeight +
      factors.frequency * this.config.frequencyWeight +
      factors.successRate * this.config.successRateWeight +
      factors.recency * this.config.recencyWeight +
      factors.preference * this.config.preferenceWeight
    );
  }

  /**
   * Generate explanation for ranking
   */
  private explainRanking(factors: ToolRankingFactors): string {
    const reasons: string[] = [];

    if (factors.relevance >= 0.8) {
      reasons.push('highly relevant');
    } else if (factors.relevance >= 0.5) {
      reasons.push('relevant');
    }

    if (factors.frequency >= 0.7) {
      reasons.push('frequently used');
    }

    if (factors.successRate >= 0.9) {
      reasons.push('highly reliable');
    } else if (factors.successRate >= 0.7) {
      reasons.push('reliable');
    }

    if (factors.recency >= 0.8) {
      reasons.push('recently used');
    }

    if (factors.preference >= 0.8) {
      reasons.push('preferred');
    }

    return reasons.length > 0 ? reasons.join(', ') : 'matched query';
  }

  /**
   * Record user feedback to adjust preferences
   */
  recordFeedback(toolName: string, positive: boolean): void {
    const current = this.userPreferences.get(toolName) ?? 0.5;
    const adjustment = positive ? 0.1 : -0.1;
    const newValue = Math.max(0, Math.min(1, current + adjustment));
    this.userPreferences.set(toolName, newValue);

    logger.debug('Preference updated', { toolName, positive, newValue });
  }

  /**
   * Set user preference directly
   */
  setPreference(toolName: string, preference: number): void {
    this.userPreferences.set(toolName, Math.max(0, Math.min(1, preference)));
  }

  /**
   * Get user preference
   */
  getPreference(toolName: string): number {
    return this.userPreferences.get(toolName) ?? 0.5;
  }

  /**
   * Update ranking configuration
   */
  updateConfig(updates: Partial<ToolRankingConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('Ranking config updated', updates);
  }

  /**
   * Get current configuration
   */
  getConfig(): ToolRankingConfig {
    return { ...this.config };
  }

  /**
   * Clear user preferences
   */
  clearPreferences(): void {
    this.userPreferences.clear();
  }
}

// Singleton instance
let engineInstance: ToolRankingEngine | null = null;

/**
 * Get or create the tool ranking engine singleton
 */
export function getToolRankingEngine(): ToolRankingEngine {
  if (!engineInstance) {
    engineInstance = new ToolRankingEngine();
  }
  return engineInstance;
}
