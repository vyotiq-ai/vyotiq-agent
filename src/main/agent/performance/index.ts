/**
 * Performance Module Index
 *
 * Exports performance system components and provides singleton instances.
 */

// Export types
export * from './types';

// Export main components
export { PerformanceMonitor } from './PerformanceMonitor';
export { CachingLayer } from './CachingLayer';
export { BatchProcessor, createAPIBatchProcessor, createFileBatchProcessor } from './BatchProcessor';
export { LazyLoader } from './LazyLoader';
export { ResourceManager } from './ResourceManager';

import type { PerformanceDeps } from './types';
import { PerformanceMonitor } from './PerformanceMonitor';
import { CachingLayer } from './CachingLayer';
import { LazyLoader } from './LazyLoader';
import { ResourceManager } from './ResourceManager';
import { createLogger } from '../../logger';

const logger = createLogger('Performance');

// =============================================================================
// Singleton Instances
// =============================================================================

let performanceMonitor: PerformanceMonitor | null = null;
let cachingLayer: CachingLayer | null = null;
let lazyLoader: LazyLoader | null = null;
let resourceManager: ResourceManager | null = null;
let initialized = false;

/**
 * Initialize performance system
 */
export function initPerformance(deps?: Partial<PerformanceDeps>): void {
  if (initialized) {
    logger.warn('Performance system already initialized');
    return;
  }

  const perfDeps: PerformanceDeps = {
    logger: deps?.logger ?? logger,
    emitEvent: deps?.emitEvent ?? (() => {}),
  };

  // Create performance monitor
  performanceMonitor = new PerformanceMonitor({}, perfDeps);
  performanceMonitor.start();

  // Create caching layer
  cachingLayer = new CachingLayer({}, perfDeps);
  cachingLayer.start();

  // Create lazy loader
  lazyLoader = new LazyLoader({}, perfDeps);

  // Create resource manager
  resourceManager = new ResourceManager({}, perfDeps);
  resourceManager.start();

  initialized = true;
  logger.info('Performance system initialized');
}

/**
 * Get performance monitor instance
 */
export function getPerformanceMonitor(): PerformanceMonitor {
  if (!performanceMonitor) {
    throw new Error('Performance system not initialized. Call initPerformance() first.');
  }
  return performanceMonitor;
}

/**
 * Get caching layer instance
 */
export function getCachingLayer(): CachingLayer {
  if (!cachingLayer) {
    throw new Error('Performance system not initialized. Call initPerformance() first.');
  }
  return cachingLayer;
}

/**
 * Get lazy loader instance
 */
export function getLazyLoader(): LazyLoader {
  if (!lazyLoader) {
    throw new Error('Performance system not initialized. Call initPerformance() first.');
  }
  return lazyLoader;
}

/**
 * Get resource manager instance
 */
export function getResourceManager(): ResourceManager {
  if (!resourceManager) {
    throw new Error('Performance system not initialized. Call initPerformance() first.');
  }
  return resourceManager;
}

/**
 * Time an async operation
 */
export async function timeOperation<T>(
  operationName: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<{ result: T; durationMs: number }> {
  return getPerformanceMonitor().timeAsync(operationName, fn, metadata);
}

/**
 * Check if resources are available
 */
export function hasResources(
  type: 'memory' | 'cpu' | 'tokens' | 'api-calls' | 'connections',
  amount: number
): boolean {
  return getResourceManager().hasAvailable(type, amount);
}

/**
 * Try to consume tokens (returns false if rate limited)
 */
export function tryConsumeTokens(count: number): boolean {
  return getResourceManager().tryConsumeTokens(count);
}

/**
 * Try to consume an API call (returns false if rate limited)
 */
export function tryConsumeApiCall(): boolean {
  return getResourceManager().tryConsumeApiCall();
}

/**
 * Cache an LLM response
 */
export function cacheLLMResponse(
  provider: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  response: unknown
): void {
  getCachingLayer().cacheLLMResponse(provider, model, messages, response);
}

/**
 * Get cached LLM response
 */
export function getCachedLLMResponse(
  provider: string,
  model: string,
  messages: Array<{ role: string; content: string }>
): unknown | undefined {
  return getCachingLayer().getCachedLLMResponse(provider, model, messages);
}

/**
 * Reset performance system
 */
export function resetPerformance(): void {
  if (performanceMonitor) {
    performanceMonitor.stop();
    performanceMonitor.clear();
  }
  if (cachingLayer) {
    cachingLayer.stop();
    cachingLayer.clear();
  }
  if (lazyLoader) {
    lazyLoader.clear();
  }
  if (resourceManager) {
    resourceManager.stop();
    resourceManager.clear();
  }

  performanceMonitor = null;
  cachingLayer = null;
  lazyLoader = null;
  resourceManager = null;
  initialized = false;
  logger.info('Performance system reset');
}

/**
 * Check if performance system is initialized
 */
export function isPerformanceInitialized(): boolean {
  return initialized;
}

/**
 * Get performance system statistics
 */
export function getPerformanceStats(): {
  monitor: ReturnType<PerformanceMonitor['getStats']>;
  cache: ReturnType<CachingLayer['getStats']>;
  lazyLoader: ReturnType<LazyLoader['getStats']>;
  resources: ReturnType<ResourceManager['getStats']>;
} | null {
  if (!initialized) {
    return null;
  }

  return {
    monitor: getPerformanceMonitor().getStats(),
    cache: getCachingLayer().getStats(),
    lazyLoader: getLazyLoader().getStats(),
    resources: getResourceManager().getStats(),
  };
}
