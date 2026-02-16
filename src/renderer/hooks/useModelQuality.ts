/**
 * Model Quality Hook
 * 
 * Provides access to model quality metrics and statistics via
 * the `window.vyotiq.modelQuality` IPC API.
 * 
 * @module hooks/useModelQuality
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createLogger } from '../utils/logger';

const logger = createLogger('useModelQuality');

// =============================================================================
// Types (mirror preload types)
// =============================================================================

export interface ModelQualityMetrics {
  modelId: string;
  provider: string;
  totalRequests: number;
  successfulCompletions: number;
  failedRequests: number;
  successRate: number;
  avgResponseTimeMs: number;
  avgTokensPerRequest: number;
  loopTriggers: number;
  complianceViolations: number;
  thumbsUp: number;
  thumbsDown: number;
  qualityScore: number;
  lastUpdated: number;
  firstSeen: number;
}

export interface ModelQualityStats {
  totalModels: number;
  totalRequests: number;
  avgQualityScore: number;
  topPerformers: string[];
  lowPerformers: string[];
}

export interface UseModelQualityResult {
  /** Global model quality stats */
  stats: ModelQualityStats | null;
  /** Ranked models list */
  rankedModels: ModelQualityMetrics[];
  /** Whether data is loading */
  isLoading: boolean;
  /** Get metrics for a specific model */
  getMetrics: (modelId: string, provider: string) => Promise<ModelQualityMetrics | null>;
  /** Record a user reaction for quality tracking */
  recordReaction: (modelId: string, provider: string, reaction: 'up' | 'down') => Promise<void>;
  /** Force refresh data */
  refresh: () => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useModelQuality(): UseModelQualityResult {
  const [stats, setStats] = useState<ModelQualityStats | null>(null);
  const [rankedModels, setRankedModels] = useState<ModelQualityMetrics[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!window.vyotiq?.modelQuality) return;
    setIsLoading(true);
    try {
      const [statsResult, rankedResult] = await Promise.all([
        window.vyotiq.modelQuality.getStats(),
        window.vyotiq.modelQuality.getRankedModels(),
      ]);
      if (mountedRef.current) {
        setStats(statsResult as ModelQualityStats | null);
        setRankedModels((rankedResult ?? []) as ModelQualityMetrics[]);
      }
    } catch (error) {
      logger.debug('Failed to fetch model quality data', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    // Poll every 30 seconds
    const interval = setInterval(refresh, 30000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [refresh]);

  const getMetrics = useCallback(async (modelId: string, provider: string): Promise<ModelQualityMetrics | null> => {
    if (!window.vyotiq?.modelQuality) return null;
    try {
      return await window.vyotiq.modelQuality.getMetrics(modelId, provider) as ModelQualityMetrics | null;
    } catch (error) {
      logger.debug('Failed to fetch model metrics', { modelId, provider, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }, []);

  const recordReaction = useCallback(async (modelId: string, provider: string, reaction: 'up' | 'down') => {
    if (!window.vyotiq?.modelQuality) return;
    try {
      await window.vyotiq.modelQuality.recordReaction(modelId, provider, reaction);
    } catch (error) {
      logger.debug('Failed to record reaction', { modelId, provider, reaction, error: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  return {
    stats,
    rankedModels,
    isLoading,
    getMetrics,
    recordReaction,
    refresh,
  };
}
