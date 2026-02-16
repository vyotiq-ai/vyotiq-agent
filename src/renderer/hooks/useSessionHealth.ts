/**
 * Session Health Hook
 * 
 * Provides real-time session health monitoring by calling the
 * `window.vyotiq.sessionHealth` IPC API and subscribing to updates.
 * Returns health status, score, issues, and recommendations.
 * 
 * @module hooks/useSessionHealth
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createLogger } from '../utils/logger';

const logger = createLogger('useSessionHealth');

// =============================================================================
// Types (mirror preload types)
// =============================================================================

export interface SessionHealthIssue {
  type: 'loop-detected' | 'high-token-usage' | 'slow-response' | 'compliance-violation' | 'approaching-limit' | 'stalled';
  severity: 'info' | 'warning' | 'error';
  message: string;
  detectedAt: number;
  context?: Record<string, unknown>;
}

export interface SessionHealthStatus {
  sessionId: string;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  healthScore: number;
  currentIteration: number;
  maxIterations: number;
  iterationProgress: number;
  tokenUsage: {
    totalInput: number;
    totalOutput: number;
    estimatedCost: number;
    utilizationPercent: number;
  };
  issues: SessionHealthIssue[];
  recommendations: string[];
  lastUpdated: number;
}

export interface UseSessionHealthResult {
  /** Current health status, null if not available */
  health: SessionHealthStatus | null;
  /** Whether the health data is loading */
  isLoading: boolean;
  /** Whether there are active health issues */
  hasIssues: boolean;
  /** Total number of issues */
  issueCount: number;
  /** Most severe issue status */
  overallStatus: 'healthy' | 'warning' | 'critical' | 'unknown';
  /** Force refresh health data */
  refresh: () => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useSessionHealth(sessionId: string | undefined): UseSessionHealthResult {
  const [health, setHealth] = useState<SessionHealthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!sessionId || !window.vyotiq?.sessionHealth) return;
    setIsLoading(true);
    try {
      const status = await window.vyotiq.sessionHealth.getStatus(sessionId);
      if (mountedRef.current) {
        setHealth(status as SessionHealthStatus | null);
      }
    } catch (error) {
      logger.debug('Failed to fetch session health', { sessionId, error: error instanceof Error ? error.message : String(error) });
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [sessionId]);

  // Initial fetch + subscribe to updates
  useEffect(() => {
    mountedRef.current = true;
    if (!sessionId) {
      setHealth(null);
      return;
    }

    refresh();

    // Subscribe to health updates
    const unsubscribe = window.vyotiq?.sessionHealth?.onHealthUpdate?.((data) => {
      if (data.sessionId === sessionId && mountedRef.current) {
        setHealth(data.status as SessionHealthStatus);
      }
    });

    // Poll every 10 seconds as backup
    const interval = setInterval(refresh, 10000);

    return () => {
      mountedRef.current = false;
      unsubscribe?.();
      clearInterval(interval);
    };
  }, [sessionId, refresh]);

  return {
    health,
    isLoading,
    hasIssues: (health?.issues?.length ?? 0) > 0,
    issueCount: health?.issues?.length ?? 0,
    overallStatus: health?.status ?? 'unknown',
    refresh,
  };
}
