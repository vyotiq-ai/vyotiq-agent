/**
 * Performance Utilities Module
 * 
 * Centralized utilities for optimizing React component performance.
 * This module provides:
 * - Memoization helpers
 * - RAF-based throttling for smooth animations
 * - Lazy evaluation utilities
 * - Performance monitoring helpers
 */

import { useRef, useCallback, useEffect, useMemo } from 'react';

// =============================================================================
// RAF-based Throttling
// =============================================================================

/**
 * Creates a throttled function that only executes once per animation frame.
 * This is more efficient than setTimeout-based throttling for visual updates.
 * 
 * @param callback - Function to throttle
 * @returns Throttled function and cleanup function
 * 
 * @example
 * const [throttledResize, cleanup] = rafThrottle(handleResize);
 * window.addEventListener('resize', throttledResize);
 * // Later: cleanup();
 */
export function rafThrottle<T extends (...args: unknown[]) => void>(
  callback: T
): [(...args: Parameters<T>) => void, () => void] {
  let rafId: number | null = null;
  let lastArgs: Parameters<T> | null = null;

  const throttled = (...args: Parameters<T>) => {
    lastArgs = args;
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        if (lastArgs) {
          callback(...lastArgs);
        }
        rafId = null;
      });
    }
  };

  const cleanup = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  return [throttled, cleanup];
}

/**
 * Hook version of rafThrottle for use in React components.
 * Automatically cleans up on unmount.
 * 
 * @param callback - Function to throttle
 * @returns Throttled function
 * 
 * @example
 * const throttledScroll = useRafThrottle(handleScroll);
 */
export function useRafThrottle<T extends (...args: unknown[]) => void>(
  callback: T
): (...args: Parameters<T>) => void {
  const rafIdRef = useRef<number | null>(null);
  const callbackRef = useRef(callback);
  
  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  return useCallback((...args: Parameters<T>) => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }
    rafIdRef.current = requestAnimationFrame(() => {
      callbackRef.current(...args);
      rafIdRef.current = null;
    });
  }, []);
}

// =============================================================================
// Memoization Helpers
// =============================================================================

/**
 * Creates a stable object reference that only changes when the content changes.
 * Useful for passing objects as props to memoized components.
 * 
 * @param obj - Object to stabilize
 * @returns Stable reference to the object
 * 
 * @example
 * const stableConfig = useStableObject({ foo: 'bar' });
 */
export function useStableObject<T extends Record<string, unknown>>(obj: T): T {
  const keys = Object.keys(obj).sort().join(',');
  const values = Object.values(obj).map(v => 
    typeof v === 'object' ? JSON.stringify(v) : String(v)
  ).join(',');
  
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: we stabilize by serialized content, not object identity
  return useMemo(() => obj, [keys, values]);
}

/**
 * Creates a stable callback that uses the latest version without breaking memoization.
 * Similar to React's useEvent RFC pattern.
 * 
 * @param callback - Callback function
 * @returns Stable callback reference
 * 
 * @example
 * const handleClick = useStableCallback(() => {
 *   console.log(latestState);
 * });
 */
export function useStableCallback<T extends (...args: never[]) => unknown>(
  callback: T
): T {
  const callbackRef = useRef(callback);
  
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  // Stable callback uses ref; deps must remain empty array
  return useCallback(
    ((...args) => callbackRef.current(...args)) as T,
    []
  );
}

// =============================================================================
// Performance Monitoring
// =============================================================================

/** Performance metrics for a component or operation */
export interface PerfMetrics {
  /** Number of times the operation was performed */
  count: number;
  /** Total time spent in milliseconds */
  totalMs: number;
  /** Average time per operation in milliseconds */
  avgMs: number;
  /** Maximum time for a single operation in milliseconds */
  maxMs: number;
  /** Minimum time for a single operation in milliseconds */
  minMs: number;
}

/**
 * Simple performance tracker for measuring operation times.
 * 
 * @example
 * const tracker = createPerfTracker('myOperation');
 * tracker.start();
 * // ... do work ...
 * tracker.end();
 * console.log(tracker.getMetrics());
 */
export function createPerfTracker(name: string) {
  let startTime: number | null = null;
  let count = 0;
  let totalMs = 0;
  let maxMs = 0;
  let minMs = Infinity;

  return {
    name,
    start() {
      startTime = performance.now();
    },
    end() {
      if (startTime === null) return;
      const duration = performance.now() - startTime;
      count++;
      totalMs += duration;
      maxMs = Math.max(maxMs, duration);
      minMs = Math.min(minMs, duration);
      startTime = null;
    },
    getMetrics(): PerfMetrics {
      return {
        count,
        totalMs,
        avgMs: count > 0 ? totalMs / count : 0,
        maxMs,
        minMs: minMs === Infinity ? 0 : minMs,
      };
    },
    reset() {
      startTime = null;
      count = 0;
      totalMs = 0;
      maxMs = 0;
      minMs = Infinity;
    },
  };
}

// =============================================================================
// Lazy Evaluation
// =============================================================================

/**
 * Creates a lazily evaluated value that is only computed when first accessed.
 * 
 * @param factory - Factory function to create the value
 * @returns Function that returns the lazily evaluated value
 * 
 * @example
 * const getLargeObject = lazyValue(() => computeExpensiveObject());
 * // Value is not computed until getLargeObject() is called
 */
export function lazyValue<T>(factory: () => T): () => T {
  let value: T | undefined;
  let computed = false;
  
  return () => {
    if (!computed) {
      value = factory();
      computed = true;
    }
    return value as T;
  };
}

/**
 * Hook for lazy initialization of expensive values.
 * Only computes the value once, on first render.
 * 
 * @param factory - Factory function to create the value
 * @returns The lazily initialized value
 * 
 * @example
 * const expensiveValue = useLazyInit(() => computeExpensiveValue());
 */
export function useLazyInit<T>(factory: () => T): T {
  const ref = useRef<T | null>(null);
  if (ref.current === null) {
    ref.current = factory();
  }
  return ref.current;
}

// =============================================================================
// Batched Updates
// =============================================================================

/**
 * Batches multiple rapid calls into a single execution.
 * Useful for debouncing state updates.
 * 
 * @param callback - Callback to batch
 * @param wait - Time to wait before executing (ms)
 * @returns Batched callback and flush function
 * 
 * @example
 * const [batchedUpdate, flush] = batchUpdates(handleUpdate, 100);
 * batchedUpdate(1);
 * batchedUpdate(2);
 * batchedUpdate(3); // Only this one will execute after 100ms
 */
export function batchUpdates<T extends (...args: unknown[]) => void>(
  callback: T,
  wait: number
): [(...args: Parameters<T>) => void, () => void] {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const batched = (...args: Parameters<T>) => {
    lastArgs = args;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      if (lastArgs) {
        callback(...lastArgs);
      }
      timeoutId = null;
      lastArgs = null;
    }, wait);
  };

  const flush = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (lastArgs) {
      callback(...lastArgs);
      lastArgs = null;
    }
  };

  return [batched, flush];
}

// =============================================================================
// Type Exports
// =============================================================================

// Types are exported inline with their definitions
