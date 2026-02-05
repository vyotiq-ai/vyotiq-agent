/**
 * useThrottleControl Hook
 * 
 * Provides control over throttling behavior based on agent running state.
 * When an agent is actively running, components can use this hook to:
 * - Disable or reduce local throttling for responsive streaming
 * - Check if the app should use full-speed updates
 * 
 * This complements the backend IPC event batcher which automatically
 * disables background throttling when sessions are running.
 */

import { useMemo, useCallback, useRef, useEffect, useContext } from 'react';
import { useAgentSelector, AgentContext } from '../state/AgentProvider';

export interface ThrottleControlState {
  /** Whether any agent session is currently running */
  isAgentRunning: boolean;
  /** Whether throttling should be bypassed for responsive streaming */
  shouldBypassThrottle: boolean;
  /** Number of currently active (running) sessions */
  activeSessionCount: number;
}

/** Default state when outside AgentProvider context */
const DEFAULT_THROTTLE_STATE: ThrottleControlState = {
  isAgentRunning: false,
  shouldBypassThrottle: false,
  activeSessionCount: 0,
};

/**
 * Hook to check if throttling should be bypassed based on agent state.
 * Safe to use outside of AgentProvider - returns default state in that case.
 * 
 * @example
 * ```tsx
 * const { shouldBypassThrottle } = useThrottleControl();
 * 
 * // Use shorter debounce/throttle when agent is running
 * const delay = shouldBypassThrottle ? 16 : 100;
 * ```
 */
export function useThrottleControl(): ThrottleControlState {
  // Check if we're inside AgentProvider context
  const store = useContext(AgentContext);
  
  // If not inside AgentProvider, return default state
  if (!store) {
    return DEFAULT_THROTTLE_STATE;
  }
  
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const state = useAgentSelector(
    (state) => {
      // Count sessions that are actively running
      const runningSessions = state.sessions.filter(
        (session) => session.status === 'running' || session.status === 'awaiting-confirmation'
      );
      
      return {
        activeSessionCount: runningSessions.length,
        isAgentRunning: runningSessions.length > 0,
      };
    },
    (a, b) => a.activeSessionCount === b.activeSessionCount && a.isAgentRunning === b.isAgentRunning
  );
  
  return useMemo(() => ({
    ...state,
    // Bypass throttle when agent is running for responsive streaming
    shouldBypassThrottle: state.isAgentRunning,
  }), [state]);
}

/**
 * Creates an adaptive throttled function that adjusts its delay based on agent state.
 * When agent is running, uses faster interval for responsive updates.
 * 
 * @param callback - Function to throttle
 * @param normalDelay - Delay when agent is idle (ms)
 * @param fastDelay - Delay when agent is running (ms), defaults to 16ms for ~60fps
 * @returns Adaptive throttled function
 * 
 * @example
 * ```tsx
 * const throttledUpdate = useAdaptiveThrottle(handleUpdate, 100, 16);
 * ```
 */
export function useAdaptiveThrottle<T extends (...args: unknown[]) => void>(
  callback: T,
  normalDelay: number,
  fastDelay: number = 16
): (...args: Parameters<T>) => void {
  const { isAgentRunning } = useThrottleControl();
  const lastCallRef = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  
  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  return useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    const delay = isAgentRunning ? fastDelay : normalDelay;
    const timeSinceLastCall = now - lastCallRef.current;
    
    if (timeSinceLastCall >= delay) {
      lastCallRef.current = now;
      callbackRef.current(...args);
    } else {
      // Schedule the call for when the delay expires
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        lastCallRef.current = Date.now();
        callbackRef.current(...args);
        timeoutRef.current = null;
      }, delay - timeSinceLastCall);
    }
  }, [isAgentRunning, normalDelay, fastDelay]);
}

/**
 * Creates an adaptive RAF throttle that can bypass throttling when agent is running.
 * 
 * @param callback - Function to throttle with RAF
 * @param bypassWhenRunning - If true, calls immediately when agent is running
 * @returns Adaptive RAF-throttled function
 */
export function useAdaptiveRafThrottle<T extends (...args: unknown[]) => void>(
  callback: T,
  bypassWhenRunning: boolean = true
): (...args: Parameters<T>) => void {
  const { isAgentRunning } = useThrottleControl();
  const rafIdRef = useRef<number | null>(null);
  const callbackRef = useRef(callback);
  
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);
  
  return useCallback((...args: Parameters<T>) => {
    // When agent is running and bypass is enabled, call immediately
    if (bypassWhenRunning && isAgentRunning) {
      callbackRef.current(...args);
      return;
    }
    
    // Normal RAF throttle
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }
    
    rafIdRef.current = requestAnimationFrame(() => {
      callbackRef.current(...args);
      rafIdRef.current = null;
    });
  }, [isAgentRunning, bypassWhenRunning]);
}

export default useThrottleControl;
