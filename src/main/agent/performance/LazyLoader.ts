/**
 * LazyLoader
 *
 * Deferred initialization of heavy components.
 * Loads components on demand with dependency resolution.
 */

import { EventEmitter } from 'node:events';
import type {
  LazyLoadStatus,
  LazyComponent,
  LazyLoaderConfig,
  PerformanceDeps,
} from './types';
import { DEFAULT_LAZY_LOADER_CONFIG } from './types';
import { createLogger } from '../../logger';

const logger = createLogger('LazyLoader');

// =============================================================================
// LazyLoader
// =============================================================================

export class LazyLoader extends EventEmitter {
  private readonly config: LazyLoaderConfig;
  private readonly deps: PerformanceDeps;

  // Registered components
  private components: Map<string, LazyComponent> = new Map();

  // Loading promises (for deduplication)
  private loadingPromises: Map<string, Promise<unknown>> = new Map();

  constructor(
    config: Partial<LazyLoaderConfig> = {},
    deps?: Partial<PerformanceDeps>
  ) {
    super();

    this.config = { ...DEFAULT_LAZY_LOADER_CONFIG, ...config };

    this.deps = {
      logger: deps?.logger ?? logger,
      emitEvent: deps?.emitEvent ?? (() => {}),
    };
  }

  // ===========================================================================
  // Registration
  // ===========================================================================

  /**
   * Register a lazy-loadable component
   */
  register<T>(
    name: string,
    loader: () => Promise<T>,
    options: {
      dependencies?: string[];
      preload?: boolean;
    } = {}
  ): void {
    if (this.components.has(name)) {
      this.deps.logger.warn('LazyLoader: component already registered', { name });
      return;
    }

    const component: LazyComponent<T> = {
      name,
      status: 'not-loaded',
      loader,
      dependencies: options.dependencies,
    };

    this.components.set(name, component);

    this.deps.logger.debug('LazyLoader: component registered', {
      name,
      dependencies: options.dependencies,
    });

    // Preload if configured
    if (options.preload || this.config.preloadComponents.includes(name)) {
      this.load(name).catch(err => {
        this.deps.logger.error('LazyLoader: preload failed', {
          name,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  }

  /**
   * Unregister a component
   */
  unregister(name: string): boolean {
    return this.components.delete(name);
  }

  // ===========================================================================
  // Loading
  // ===========================================================================

  /**
   * Load a component
   */
  async load<T>(name: string): Promise<T> {
    const component = this.components.get(name) as LazyComponent<T> | undefined;

    if (!component) {
      throw new Error(`Component not registered: ${name}`);
    }

    // Already loaded
    if (component.status === 'loaded' && component.instance !== undefined) {
      return component.instance;
    }

    // Currently loading - wait for existing promise
    const existingPromise = this.loadingPromises.get(name);
    if (existingPromise) {
      return existingPromise as Promise<T>;
    }

    // Failed previously - try again
    if (component.status === 'failed') {
      component.status = 'not-loaded';
      component.error = undefined;
    }

    // Start loading
    const loadPromise = this.doLoad<T>(component);
    this.loadingPromises.set(name, loadPromise);

    try {
      const result = await loadPromise;
      return result;
    } finally {
      this.loadingPromises.delete(name);
    }
  }

  /**
   * Internal load implementation
   */
  private async doLoad<T>(component: LazyComponent<T>): Promise<T> {
    component.status = 'loading';
    component.loadStartedAt = Date.now();

    this.emit('load-start', { name: component.name });

    try {
      // Load dependencies first
      if (this.config.enableDependencyResolution && component.dependencies) {
        await this.loadDependencies(component.dependencies);
      }

      // Load with timeout
      const instance = await Promise.race([
        component.loader(),
        this.createTimeout(component.name),
      ]) as T;

      component.instance = instance;
      component.status = 'loaded';
      component.loadCompletedAt = Date.now();

      const loadTimeMs = component.loadCompletedAt - component.loadStartedAt!;

      this.deps.logger.debug('LazyLoader: component loaded', {
        name: component.name,
        loadTimeMs,
      });

      this.emit('load-complete', {
        name: component.name,
        loadTimeMs,
      });

      return instance;
    } catch (error) {
      component.status = 'failed';
      component.error = error instanceof Error ? error : new Error(String(error));
      component.loadCompletedAt = Date.now();

      this.deps.logger.error('LazyLoader: component load failed', {
        name: component.name,
        error: component.error.message,
      });

      this.emit('load-error', {
        name: component.name,
        error: component.error.message,
      });

      throw component.error;
    }
  }

  /**
   * Load dependencies
   */
  private async loadDependencies(dependencies: string[]): Promise<void> {
    // Check for circular dependencies
    const visited = new Set<string>();
    const checking = new Set<string>();

    const checkCircular = (name: string): void => {
      if (checking.has(name)) {
        throw new Error(`Circular dependency detected: ${name}`);
      }
      if (visited.has(name)) return;

      checking.add(name);
      const comp = this.components.get(name);
      if (comp?.dependencies) {
        for (const dep of comp.dependencies) {
          checkCircular(dep);
        }
      }
      checking.delete(name);
      visited.add(name);
    };

    for (const dep of dependencies) {
      checkCircular(dep);
    }

    // Load dependencies in parallel (respecting limit)
    const chunks = this.chunk(dependencies, this.config.parallelLoadLimit);

    for (const chunk of chunks) {
      await Promise.all(chunk.map(dep => this.load(dep)));
    }
  }

  /**
   * Create timeout promise
   */
  private createTimeout(name: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`Load timeout for component: ${name}`)),
        this.config.loadTimeoutMs
      );
    });
  }

  /**
   * Chunk array
   */
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  // ===========================================================================
  // Access
  // ===========================================================================

  /**
   * Get a loaded component (throws if not loaded)
   */
  get<T>(name: string): T {
    const component = this.components.get(name) as LazyComponent<T> | undefined;

    if (!component) {
      throw new Error(`Component not registered: ${name}`);
    }

    if (component.status !== 'loaded' || component.instance === undefined) {
      throw new Error(`Component not loaded: ${name}`);
    }

    return component.instance;
  }

  /**
   * Get a component if loaded, undefined otherwise
   */
  getIfLoaded<T>(name: string): T | undefined {
    const component = this.components.get(name) as LazyComponent<T> | undefined;

    if (!component || component.status !== 'loaded') {
      return undefined;
    }

    return component.instance;
  }

  /**
   * Get or load a component
   */
  async getOrLoad<T>(name: string): Promise<T> {
    const existing = this.getIfLoaded<T>(name);
    if (existing !== undefined) {
      return existing;
    }
    return this.load(name);
  }

  // ===========================================================================
  // Status
  // ===========================================================================

  /**
   * Check if component is loaded
   */
  isLoaded(name: string): boolean {
    const component = this.components.get(name);
    return component?.status === 'loaded';
  }

  /**
   * Check if component is loading
   */
  isLoading(name: string): boolean {
    const component = this.components.get(name);
    return component?.status === 'loading';
  }

  /**
   * Get component status
   */
  getStatus(name: string): LazyLoadStatus | undefined {
    return this.components.get(name)?.status;
  }

  /**
   * Get all component statuses
   */
  getAllStatuses(): Map<string, LazyLoadStatus> {
    const statuses = new Map<string, LazyLoadStatus>();
    for (const [name, component] of this.components) {
      statuses.set(name, component.status);
    }
    return statuses;
  }

  // ===========================================================================
  // Preloading
  // ===========================================================================

  /**
   * Preload multiple components
   */
  async preload(names: string[]): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    const chunks = this.chunk(names, this.config.parallelLoadLimit);

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async name => {
          try {
            await this.load(name);
            results.set(name, true);
          } catch {
            results.set(name, false);
          }
        })
      );
    }

    return results;
  }

  /**
   * Preload all registered components
   */
  async preloadAll(): Promise<Map<string, boolean>> {
    const names = Array.from(this.components.keys());
    return this.preload(names);
  }

  // ===========================================================================
  // Unloading
  // ===========================================================================

  /**
   * Unload a component (clear instance)
   */
  unload(name: string): boolean {
    const component = this.components.get(name);
    if (!component) return false;

    component.instance = undefined;
    component.status = 'not-loaded';
    component.error = undefined;
    component.loadStartedAt = undefined;
    component.loadCompletedAt = undefined;

    this.emit('unload', { name });
    return true;
  }

  /**
   * Unload all components
   */
  unloadAll(): void {
    for (const name of this.components.keys()) {
      this.unload(name);
    }
  }

  /**
   * Reload a component
   */
  async reload<T>(name: string): Promise<T> {
    this.unload(name);
    return this.load(name);
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get statistics
   */
  getStats(): {
    totalComponents: number;
    loadedComponents: number;
    loadingComponents: number;
    failedComponents: number;
    notLoadedComponents: number;
    averageLoadTimeMs: number;
  } {
    let loaded = 0;
    let loading = 0;
    let failed = 0;
    let notLoaded = 0;
    let totalLoadTime = 0;
    let loadedCount = 0;

    for (const component of this.components.values()) {
      switch (component.status) {
        case 'loaded':
          loaded++;
          if (component.loadStartedAt && component.loadCompletedAt) {
            totalLoadTime += component.loadCompletedAt - component.loadStartedAt;
            loadedCount++;
          }
          break;
        case 'loading':
          loading++;
          break;
        case 'failed':
          failed++;
          break;
        case 'not-loaded':
          notLoaded++;
          break;
      }
    }

    return {
      totalComponents: this.components.size,
      loadedComponents: loaded,
      loadingComponents: loading,
      failedComponents: failed,
      notLoadedComponents: notLoaded,
      averageLoadTimeMs: loadedCount > 0 ? totalLoadTime / loadedCount : 0,
    };
  }

  /**
   * Clear all
   */
  clear(): void {
    this.unloadAll();
    this.components.clear();
    this.loadingPromises.clear();
  }
}
