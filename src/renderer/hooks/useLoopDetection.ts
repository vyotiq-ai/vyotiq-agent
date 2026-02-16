/**
 * Loop Detection Hook
 * 
 * Provides access to loop detection state and circuit breaker status via
 * the `window.vyotiq.loopDetection` IPC API.
 * 
 * @module hooks/useLoopDetection
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createLogger } from '../utils/logger';

const logger = createLogger('useLoopDetection');

// =============================================================================
// Types (mirror preload types)
// =============================================================================

/** Raw loop detection state from IPC */
interface RawLoopDetectionState {
  runId: string;
  sessionId: string;
  consecutiveIdenticalCalls: number;
  circuitBreakerTriggered: boolean;
  warningIssued: boolean;
}

/** Enriched loop detection state for UI display */
export interface LoopDetectionState {
  runId: string;
  isLooping: boolean;
  loopCount: number;
  circuitBreakerTriggered: boolean;
  lastTriggerTime: number | null;
  repeatPatterns: string[];
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

export interface UseLoopDetectionResult {
  /** Current loop detection state */
  state: LoopDetectionState | null;
  /** Whether the circuit breaker is triggered */
  isCircuitBreakerTriggered: boolean;
  /** Whether any loop is detected */
  isLooping: boolean;
  /** Loop severity level */
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  /** Whether data is loading */
  isLoading: boolean;
  /** Force refresh data */
  refresh: () => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useLoopDetection(runId: string | undefined): UseLoopDetectionResult {
  const [state, setState] = useState<LoopDetectionState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!runId || !window.vyotiq?.loopDetection) return;
    setIsLoading(true);
    try {
      const [rawState, cbTriggered] = await Promise.all([
        window.vyotiq.loopDetection.getState(runId),
        window.vyotiq.loopDetection.isCircuitBreakerTriggered(runId),
      ]);
      if (mountedRef.current) {
        if (rawState) {
          // Transform raw IPC state to enriched UI state
          const raw = rawState as unknown as RawLoopDetectionState;
          const calls = raw.consecutiveIdenticalCalls;
          const isLooping = calls >= 3 || raw.circuitBreakerTriggered;
          const severity: LoopDetectionState['severity'] =
            raw.circuitBreakerTriggered ? 'critical'
            : calls >= 8 ? 'high'
            : calls >= 5 ? 'medium'
            : calls >= 3 ? 'low'
            : 'none';

          setState({
            runId: raw.runId,
            isLooping,
            loopCount: calls,
            circuitBreakerTriggered: raw.circuitBreakerTriggered,
            lastTriggerTime: raw.circuitBreakerTriggered ? Date.now() : null,
            repeatPatterns: [],
            severity,
          });
        } else if (cbTriggered) {
          // No state but circuit breaker is triggered
          setState({
            runId,
            isLooping: true,
            loopCount: 0,
            circuitBreakerTriggered: true,
            lastTriggerTime: Date.now(),
            repeatPatterns: [],
            severity: 'critical',
          });
        } else {
          setState(null);
        }
      }
    } catch (error) {
      logger.debug('Failed to fetch loop detection state', { runId, error: error instanceof Error ? error.message : String(error) });
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [runId]);

  useEffect(() => {
    mountedRef.current = true;
    if (runId) {
      refresh();
      // Poll every 5 seconds for active runs
      const interval = setInterval(refresh, 5000);
      return () => {
        mountedRef.current = false;
        clearInterval(interval);
      };
    }
    return () => {
      mountedRef.current = false;
    };
  }, [runId, refresh]);

  return {
    state,
    isCircuitBreakerTriggered: state?.circuitBreakerTriggered ?? false,
    isLooping: state?.isLooping ?? false,
    severity: state?.severity ?? 'none',
    isLoading,
    refresh,
  };
}
