/**
 * Performance Profiling Utilities
 * 
 * Development-time tools for measuring component render performance
 * and identifying bottlenecks in the React application.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { createLogger } from './logger';

// Only enable in development
const IS_DEV = process.env.NODE_ENV !== 'production';

const logger = createLogger('profiler');

/**
 * Performance metrics for a component
 */
export interface RenderMetrics {
  componentName: string;
  renderCount: number;
  totalRenderTime: number;
  averageRenderTime: number;
  lastRenderTime: number;
  lastRenderReason?: string;
  timestamps: number[];
}

/**
 * Global store for render metrics
 */
const metricsStore = new Map<string, RenderMetrics>();

/**
 * Get all collected metrics
 */
export function getAllMetrics(): Map<string, RenderMetrics> {
  return new Map(metricsStore);
}

/**
 * Clear all collected metrics
 */
export function clearMetrics(): void {
  metricsStore.clear();
}

/**
 * Get metrics for a specific component
 */
export function getMetrics(componentName: string): RenderMetrics | undefined {
  return metricsStore.get(componentName);
}

/**
 * Log metrics summary
 */
export function logMetricsSummary(): void {
  if (!IS_DEV) return;
  
  const metrics = Array.from(metricsStore.values())
    .sort((a, b) => b.totalRenderTime - a.totalRenderTime);
  
  metrics.forEach((m) => {
    const avgMs = m.averageRenderTime.toFixed(2);
    const totalMs = m.totalRenderTime.toFixed(2);
    logger.debug('Render metrics', {
      component: m.componentName,
      renderCount: m.renderCount,
      avgMs: Number(avgMs),
      totalMs: Number(totalMs),
    });
  });
}

/**
 * Hook to profile component render performance
 * 
 * @example
 * function MyComponent({ data }) {
 *   useRenderProfiler('MyComponent', { data });
 *   return <div>{data}</div>;
 * }
 */
export function useRenderProfiler(
  componentName: string,
  props?: Record<string, unknown>,
  options: { logThreshold?: number; enabled?: boolean } = {}
): void {
  const { enabled = IS_DEV, logThreshold } = options;
  
  const renderStartRef = useRef<number>(0);
  const prevPropsRef = useRef<Record<string, unknown> | undefined>(undefined);
  const renderCountRef = useRef(0);
  
  // Mark render start
  renderStartRef.current = performance.now();
  renderCountRef.current++;
  
  // Determine what caused the render
  const changedProps: string[] = [];
  if (props && prevPropsRef.current) {
    Object.keys(props).forEach((key) => {
      if (props[key] !== prevPropsRef.current?.[key]) {
        changedProps.push(key);
      }
    });
  }
  prevPropsRef.current = props ? { ...props } : undefined;
  
  useEffect(() => {
    if (!enabled) return;
    
    const renderTime = performance.now() - renderStartRef.current;
    
    // Update metrics store
    const existing = metricsStore.get(componentName);
    const timestamps = existing?.timestamps ?? [];
    timestamps.push(Date.now());
    
    // Keep only last 100 timestamps
    if (timestamps.length > 100) {
      timestamps.shift();
    }
    
    const newRenderCount = (existing?.renderCount ?? 0) + 1;
    const newTotalTime = (existing?.totalRenderTime ?? 0) + renderTime;
    
    metricsStore.set(componentName, {
      componentName,
      renderCount: newRenderCount,
      totalRenderTime: newTotalTime,
      averageRenderTime: newTotalTime / newRenderCount,
      lastRenderTime: renderTime,
      lastRenderReason: changedProps.length > 0 ? changedProps.join(', ') : 'initial or state',
      timestamps,
    });
    
    // Log slow renders only when an explicit threshold is provided.
    if (typeof logThreshold === 'number' && renderTime > logThreshold) {
      logger.warn('Slow render detected', {
        component: componentName,
        ms: Number(renderTime.toFixed(2)),
        changedProps,
      });
    }
  });
}

/**
 * Hook to track when a component mounts/unmounts
 * 
 * NOTE: In React StrictMode (development), components mount and unmount twice
 * to help detect side effects. This is expected behavior.
 * 
 * @param componentName - Name of the component to track
 * @param options - Optional configuration
 * @param options.enabled - Whether to enable logging (defaults to false to reduce noise)
 */
export function useLifecycleProfiler(
  componentName: string,
  options: { enabled?: boolean } = {}
): void {
  const { enabled = false } = options; // Disabled by default to reduce noise
  
  useEffect(() => {
    if (!IS_DEV || !enabled) return;
    
    logger.debug('Component mounted', { component: componentName });
    
    return () => {
      logger.debug('Component unmounted', { component: componentName });
    };
  }, [componentName, enabled]);
}

/**
 * Higher-order function to measure execution time
 */
export function measureTime<T extends (...args: unknown[]) => unknown>(
  fn: T,
  label: string
): T {
  if (!IS_DEV) return fn;
  
  return ((...args: Parameters<T>) => {
    const start = performance.now();
    const result = fn(...args);
    const duration = performance.now() - start;
    
    if (duration > 1) {
      logger.debug('Performance measurement', { label, durationMs: Number(duration.toFixed(2)) });
    }
    
    return result;
  }) as T;
}

/**
 * Hook to detect excessive re-renders
 */
export function useRenderGuard(
  componentName: string,
  maxRendersPerSecond = 10
): void {
  const renderTimesRef = useRef<number[]>([]);
  
  useEffect(() => {
    if (!IS_DEV) return;
    
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    
    // Remove old timestamps
    renderTimesRef.current = renderTimesRef.current.filter(t => t > oneSecondAgo);
    
    // Add current render
    renderTimesRef.current.push(now);
    
    // Check for excessive renders
    if (renderTimesRef.current.length > maxRendersPerSecond) {
      logger.warn('Excessive renders detected', {
        component: componentName,
        rendersInLastSecond: renderTimesRef.current.length,
        maxRendersPerSecond,
      });
    }
  });
}

/**
 * Create a profiled version of a component
 * Only active in development mode
 */
export function withProfiler<P extends object>(
  Component: React.ComponentType<P>,
  componentName: string
): React.ComponentType<P> {
  if (!IS_DEV) return Component;
  
  const ProfiledComponent: React.FC<P> = (props) => {
    useRenderProfiler(componentName, props as Record<string, unknown>);
    return <Component {...props} />;
  };
  
  ProfiledComponent.displayName = `Profiled(${componentName})`;
  
  return ProfiledComponent;
}

/**
 * Hook to create a memoized callback that logs performance
 */
export function useProfiledCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  name: string,
  deps: React.DependencyList
): T {
  return useCallback((...args: Parameters<T>) => {
    if (IS_DEV) {
      const start = performance.now();
      const result = callback(...args);
      const duration = performance.now() - start;
      if (duration > 16) { // Log if takes longer than a frame
        logger.debug('Slow callback detected', { name, durationMs: Number(duration.toFixed(2)) });
      }
      return result;
    }
    return callback(...args);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are caller-controlled for profiling; adding callback/name changes memoization semantics
  }, deps) as T;
}

/**
 * Hook to register a keyboard shortcut for logging metrics (Ctrl+Shift+P).
 * Must be called from a React component so the listener is cleaned up properly.
 */
export function useProfilerKeyboard(): void {
  useEffect(() => {
    if (!IS_DEV) return;

    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        logMetricsSummary();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

// Export dev-only console command
if (IS_DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__vyotiq_perf = {
    getAllMetrics,
    getMetrics,
    clearMetrics,
    logMetricsSummary,
  };
}
