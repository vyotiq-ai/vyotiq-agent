/**
 * Model Quality Scoring Module
 * 
 * Tracks and scores model performance based on various metrics
 * to help with model selection and quality monitoring.
 */

import type { LLMProviderName } from '../../shared/types';
import { createLogger } from '../logger';

const logger = createLogger('ModelQuality');

// =============================================================================
// Types
// =============================================================================

export interface ModelQualityMetrics {
  /** Model identifier */
  modelId: string;
  /** Provider name */
  provider: LLMProviderName;
  /** Total requests made */
  totalRequests: number;
  /** Successful completions */
  successfulCompletions: number;
  /** Failed requests */
  failedRequests: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Average response time (ms) */
  avgResponseTimeMs: number;
  /** Average tokens per request */
  avgTokensPerRequest: number;
  /** Loop detection triggers */
  loopTriggers: number;
  /** Compliance violations */
  complianceViolations: number;
  /** User thumbs up reactions */
  thumbsUp: number;
  /** User thumbs down reactions */
  thumbsDown: number;
  /** Calculated quality score (0-100) */
  qualityScore: number;
  /** Last updated timestamp */
  lastUpdated: number;
  /** First seen timestamp */
  firstSeen: number;
}

export interface ModelPerformanceRecord {
  modelId: string;
  provider: LLMProviderName;
  timestamp: number;
  success: boolean;
  responseTimeMs: number;
  tokensUsed: number;
  loopDetected: boolean;
  complianceViolation: boolean;
  userReaction?: 'up' | 'down';
}

export interface ModelQualityConfig {
  /** Minimum requests before quality score is considered reliable */
  minRequestsForReliableScore: number;
  /** Weight for success rate in quality calculation */
  successRateWeight: number;
  /** Weight for response time in quality calculation */
  responseTimeWeight: number;
  /** Weight for loop avoidance in quality calculation */
  loopAvoidanceWeight: number;
  /** Weight for compliance in quality calculation */
  complianceWeight: number;
  /** Weight for user feedback in quality calculation */
  userFeedbackWeight: number;
  /** Maximum records to keep per model */
  maxRecordsPerModel: number;
  /** Time window for recent metrics (ms) */
  recentWindowMs: number;
  /** Response time (ms) considered "fast" — score 100 */
  responseTimeFastMs: number;
  /** Response time (ms) considered "slow" — score 0 */
  responseTimeSlowMs: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

export const DEFAULT_MODEL_QUALITY_CONFIG: ModelQualityConfig = {
  minRequestsForReliableScore: 10,
  successRateWeight: 0.30,
  responseTimeWeight: 0.15,
  loopAvoidanceWeight: 0.25,
  complianceWeight: 0.15,
  userFeedbackWeight: 0.15,
  maxRecordsPerModel: 500,
  recentWindowMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  responseTimeFastMs: 1000,   // 1s — fast for LLM calls
  responseTimeSlowMs: 30000,  // 30s — slow for LLM calls
};

// =============================================================================
// Model Quality Tracker
// =============================================================================

export class ModelQualityTracker {
  private config: ModelQualityConfig;
  private records = new Map<string, ModelPerformanceRecord[]>();
  private metricsCache = new Map<string, { metrics: ModelQualityMetrics; computedAt: number }>();
  private readonly cacheTTL = 60000; // 1 minute cache

  constructor(config: Partial<ModelQualityConfig> = {}) {
    this.config = { ...DEFAULT_MODEL_QUALITY_CONFIG, ...config };
  }

  /**
   * Record a model performance event
   */
  recordPerformance(record: Omit<ModelPerformanceRecord, 'timestamp'>): void {
    const fullRecord: ModelPerformanceRecord = {
      ...record,
      timestamp: Date.now(),
    };

    const key = this.getModelKey(record.modelId, record.provider);
    let modelRecords = this.records.get(key);
    
    if (!modelRecords) {
      modelRecords = [];
      this.records.set(key, modelRecords);
    }

    modelRecords.push(fullRecord);

    // Trim old records per model
    if (modelRecords.length > this.config.maxRecordsPerModel) {
      modelRecords.shift();
    }

    // Cap total tracked models to prevent unbounded Map growth
    if (this.records.size > 100) {
      // Remove least recently used model entries
      const entries = [...this.records.entries()];
      entries.sort((a, b) => {
        const aLast = a[1][a[1].length - 1]?.timestamp ?? 0;
        const bLast = b[1][b[1].length - 1]?.timestamp ?? 0;
        return aLast - bLast;
      });
      // Remove oldest 20% of entries
      const toRemove = Math.floor(entries.length * 0.2);
      for (let i = 0; i < toRemove; i++) {
        this.records.delete(entries[i][0]);
        this.metricsCache.delete(entries[i][0]);
      }
    }

    // Invalidate cache
    this.metricsCache.delete(key);

    logger.debug('Model performance recorded', {
      modelId: record.modelId,
      provider: record.provider,
      success: record.success,
      responseTimeMs: record.responseTimeMs,
    });
  }

  /**
   * Record user reaction to a model response
   */
  recordUserReaction(
    modelId: string,
    provider: LLMProviderName,
    reaction: 'up' | 'down'
  ): void {
    const key = this.getModelKey(modelId, provider);
    const modelRecords = this.records.get(key);
    
    if (modelRecords && modelRecords.length > 0) {
      // Update the most recent record
      const lastRecord = modelRecords[modelRecords.length - 1];
      lastRecord.userReaction = reaction;
      this.metricsCache.delete(key);
    }
  }

  /**
   * Get quality metrics for a model
   */
  getMetrics(modelId: string, provider: LLMProviderName): ModelQualityMetrics {
    const key = this.getModelKey(modelId, provider);
    
    // Check cache
    const cached = this.metricsCache.get(key);
    if (cached && Date.now() - cached.computedAt < this.cacheTTL) {
      return cached.metrics;
    }

    // Compute metrics
    const metrics = this.computeMetrics(modelId, provider);
    this.metricsCache.set(key, { metrics, computedAt: Date.now() });
    
    return metrics;
  }

  /**
   * Get quality score for a model (0-100)
   */
  getQualityScore(modelId: string, provider: LLMProviderName): number {
    return this.getMetrics(modelId, provider).qualityScore;
  }

  /**
   * Get all tracked models sorted by quality score
   */
  getRankedModels(): ModelQualityMetrics[] {
    const allMetrics: ModelQualityMetrics[] = [];
    
    for (const [key] of this.records) {
      const [modelId, provider] = key.split('::');
      if (modelId && provider) {
        allMetrics.push(this.getMetrics(modelId, provider as LLMProviderName));
      }
    }

    return allMetrics.sort((a, b) => b.qualityScore - a.qualityScore);
  }

  /**
   * Get models for a specific provider sorted by quality
   */
  getProviderModels(provider: LLMProviderName): ModelQualityMetrics[] {
    return this.getRankedModels().filter(m => m.provider === provider);
  }

  /**
   * Check if a model has reliable metrics
   */
  hasReliableMetrics(modelId: string, provider: LLMProviderName): boolean {
    const metrics = this.getMetrics(modelId, provider);
    return metrics.totalRequests >= this.config.minRequestsForReliableScore;
  }

  /**
   * Get summary statistics across all models
   */
  getGlobalStats(): {
    totalModels: number;
    totalRequests: number;
    avgQualityScore: number;
    topPerformers: string[];
    lowPerformers: string[];
  } {
    const ranked = this.getRankedModels();
    const totalRequests = ranked.reduce((sum, m) => sum + m.totalRequests, 0);
    const avgScore = ranked.length > 0
      ? ranked.reduce((sum, m) => sum + m.qualityScore, 0) / ranked.length
      : 0;

    return {
      totalModels: ranked.length,
      totalRequests,
      avgQualityScore: Math.round(avgScore),
      topPerformers: ranked.slice(0, 3).map(m => m.modelId),
      lowPerformers: ranked.slice(-3).reverse().map(m => m.modelId),
    };
  }

  /**
   * Clear all records
   */
  clear(): void {
    this.records.clear();
    this.metricsCache.clear();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private computeMetrics(modelId: string, provider: LLMProviderName): ModelQualityMetrics {
    const key = this.getModelKey(modelId, provider);
    const modelRecords = this.records.get(key) || [];
    
    // Filter to recent window
    const cutoff = Date.now() - this.config.recentWindowMs;
    const recentRecords = modelRecords.filter(r => r.timestamp >= cutoff);

    if (recentRecords.length === 0) {
      return this.emptyMetrics(modelId, provider);
    }

    // Calculate basic metrics
    const totalRequests = recentRecords.length;
    const successfulCompletions = recentRecords.filter(r => r.success).length;
    const failedRequests = totalRequests - successfulCompletions;
    const successRate = totalRequests > 0 ? successfulCompletions / totalRequests : 0;

    const totalResponseTime = recentRecords.reduce((sum, r) => sum + r.responseTimeMs, 0);
    const avgResponseTimeMs = totalRequests > 0 ? totalResponseTime / totalRequests : 0;

    const totalTokens = recentRecords.reduce((sum, r) => sum + r.tokensUsed, 0);
    const avgTokensPerRequest = totalRequests > 0 ? totalTokens / totalRequests : 0;

    const loopTriggers = recentRecords.filter(r => r.loopDetected).length;
    const complianceViolations = recentRecords.filter(r => r.complianceViolation).length;

    const thumbsUp = recentRecords.filter(r => r.userReaction === 'up').length;
    const thumbsDown = recentRecords.filter(r => r.userReaction === 'down').length;

    // Calculate quality score
    const qualityScore = this.calculateQualityScore({
      successRate,
      avgResponseTimeMs,
      loopTriggers,
      complianceViolations,
      thumbsUp,
      thumbsDown,
      totalRequests,
    });

    const timestamps = recentRecords.map(r => r.timestamp);

    return {
      modelId,
      provider,
      totalRequests,
      successfulCompletions,
      failedRequests,
      successRate,
      avgResponseTimeMs: Math.round(avgResponseTimeMs),
      avgTokensPerRequest: Math.round(avgTokensPerRequest),
      loopTriggers,
      complianceViolations,
      thumbsUp,
      thumbsDown,
      qualityScore,
      lastUpdated: Math.max(...timestamps),
      firstSeen: Math.min(...timestamps),
    };
  }

  private calculateQualityScore(data: {
    successRate: number;
    avgResponseTimeMs: number;
    loopTriggers: number;
    complianceViolations: number;
    thumbsUp: number;
    thumbsDown: number;
    totalRequests: number;
  }): number {
    const {
      successRate,
      avgResponseTimeMs,
      loopTriggers,
      complianceViolations,
      thumbsUp,
      thumbsDown,
      totalRequests,
    } = data;

    // Success rate score (0-100)
    const successScore = successRate * 100;

    // Response time score (faster is better, normalize to 0-100)
    const fastMs = this.config.responseTimeFastMs;
    const slowMs = this.config.responseTimeSlowMs;
    const responseTimeScore = Math.max(0, Math.min(100, 
      100 - ((avgResponseTimeMs - fastMs) / ((slowMs - fastMs) / 100))
    ));

    // Loop avoidance score (fewer loops is better)
    const loopRate = totalRequests > 0 ? loopTriggers / totalRequests : 0;
    const loopScore = (1 - loopRate) * 100;

    // Compliance score (fewer violations is better)
    const complianceRate = totalRequests > 0 ? complianceViolations / totalRequests : 0;
    const complianceScore = (1 - complianceRate) * 100;

    // User feedback score
    const totalFeedback = thumbsUp + thumbsDown;
    const feedbackScore = totalFeedback > 0
      ? (thumbsUp / totalFeedback) * 100
      : 50; // Neutral if no feedback

    // Weighted average
    const weightedScore = 
      successScore * this.config.successRateWeight +
      responseTimeScore * this.config.responseTimeWeight +
      loopScore * this.config.loopAvoidanceWeight +
      complianceScore * this.config.complianceWeight +
      feedbackScore * this.config.userFeedbackWeight;

    // Apply confidence factor based on sample size
    const confidenceFactor = Math.min(1, totalRequests / this.config.minRequestsForReliableScore);
    const adjustedScore = weightedScore * confidenceFactor + 50 * (1 - confidenceFactor);

    return Math.round(Math.max(0, Math.min(100, adjustedScore)));
  }

  private emptyMetrics(modelId: string, provider: LLMProviderName): ModelQualityMetrics {
    return {
      modelId,
      provider,
      totalRequests: 0,
      successfulCompletions: 0,
      failedRequests: 0,
      successRate: 0,
      avgResponseTimeMs: 0,
      avgTokensPerRequest: 0,
      loopTriggers: 0,
      complianceViolations: 0,
      thumbsUp: 0,
      thumbsDown: 0,
      qualityScore: 50, // Neutral score for unknown models
      lastUpdated: 0,
      firstSeen: 0,
    };
  }

  private getModelKey(modelId: string, provider: LLMProviderName): string {
    return `${modelId}::${provider}`;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let qualityTrackerInstance: ModelQualityTracker | null = null;

export function getModelQualityTracker(): ModelQualityTracker {
  if (!qualityTrackerInstance) {
    qualityTrackerInstance = new ModelQualityTracker();
  }
  return qualityTrackerInstance;
}

export function initModelQualityTracker(config?: Partial<ModelQualityConfig>): ModelQualityTracker {
  qualityTrackerInstance = new ModelQualityTracker(config);
  return qualityTrackerInstance;
}
