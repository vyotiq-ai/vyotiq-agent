/**
 * Browser Instance Pool
 * 
 * Manages a pool of browser instances for concurrent session support.
 * Features:
 * - Per-session browser instance isolation
 * - Memory-aware instance management
 * - Automatic cleanup of idle instances
 * - Session-to-browser mapping
 */

import { EventEmitter } from 'node:events';
import { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { createLogger } from '../logger';
import { BrowserManager, type BrowserBehaviorSettings } from './BrowserManager';

const logger = createLogger('BrowserInstancePool');

// =============================================================================
// Types
// =============================================================================

export interface PooledBrowserInstance {
  id: string;
  sessionId: string | null;
  manager: BrowserManager;
  createdAt: number;
  lastUsedAt: number;
  isActive: boolean;
  memoryUsage?: number;
}

export interface BrowserPoolConfig {
  /** Maximum number of browser instances */
  maxInstances: number;
  /** Idle timeout before cleanup (ms) */
  idleTimeoutMs: number;
  /** Memory limit per instance (bytes) - advisory */
  memoryLimitPerInstance: number;
  /** Check interval for idle cleanup (ms) */
  cleanupIntervalMs: number;
}

export interface BrowserPoolStats {
  totalInstances: number;
  activeInstances: number;
  idleInstances: number;
  totalMemoryEstimate: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: BrowserPoolConfig = {
  maxInstances: 5,
  idleTimeoutMs: 5 * 60 * 1000, // 5 minutes
  memoryLimitPerInstance: 256 * 1024 * 1024, // 256MB
  cleanupIntervalMs: 60 * 1000, // 1 minute
};

// =============================================================================
// Browser Instance Pool
// =============================================================================

export class BrowserInstancePool extends EventEmitter {
  private readonly config: BrowserPoolConfig;
  private readonly instances = new Map<string, PooledBrowserInstance>();
  private readonly sessionToInstance = new Map<string, string>();
  private mainWindow: BrowserWindow | null = null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private isShuttingDown = false;
  private behaviorSettings: BrowserBehaviorSettings = {};

  constructor(config: Partial<BrowserPoolConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize the pool with the main window
   */
  init(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(
      () => this.cleanupIdleInstances(),
      this.config.cleanupIntervalMs
    );

    logger.info('BrowserInstancePool initialized', {
      maxInstances: this.config.maxInstances,
    });
  }

  /**
   * Apply browser behavior settings to all instances
   */
  applyBehaviorSettings(settings: BrowserBehaviorSettings): void {
    this.behaviorSettings = settings;
    
    // Apply to existing instances
    for (const instance of this.instances.values()) {
      instance.manager.applyBehaviorSettings(settings);
    }
    
    logger.info('Applied behavior settings to browser pool');
  }

  // ===========================================================================
  // Instance Management
  // ===========================================================================

  /**
   * Acquire a browser instance for a session
   * Creates a new instance or reuses an idle one
   */
  async acquire(sessionId: string): Promise<BrowserManager> {
    // Check if session already has an instance
    const existingInstanceId = this.sessionToInstance.get(sessionId);
    if (existingInstanceId) {
      const instance = this.instances.get(existingInstanceId);
      if (instance) {
        instance.lastUsedAt = Date.now();
        instance.isActive = true;
        logger.debug('Reusing existing browser instance for session', {
          instanceId: existingInstanceId,
          sessionId,
        });
        return instance.manager;
      }
    }

    // Check global limit
    if (this.instances.size >= this.config.maxInstances) {
      // Try to find any idle instance to reuse
      const idleInstance = this.findIdleInstance();
      if (idleInstance) {
        return this.reassignInstance(idleInstance, sessionId);
      }
      throw new Error(`Maximum browser instances (${this.config.maxInstances}) reached globally`);
    }

    // Create new instance
    return this.createInstance(sessionId);
  }

  /**
   * Release a browser instance back to the pool
   */
  release(sessionId: string): void {
    const instanceId = this.sessionToInstance.get(sessionId);
    if (!instanceId) {
      logger.debug('No browser instance found for session', { sessionId });
      return;
    }

    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.isActive = false;
      instance.lastUsedAt = Date.now();
      logger.debug('Released browser instance', { instanceId, sessionId });
      
      this.emit('instance-released', { instanceId, sessionId });
    }
  }

  /**
   * Get the browser instance for a session if it exists
   */
  getForSession(sessionId: string): BrowserManager | null {
    const instanceId = this.sessionToInstance.get(sessionId);
    if (!instanceId) return null;
    
    const instance = this.instances.get(instanceId);
    if (!instance) return null;
    
    instance.lastUsedAt = Date.now();
    return instance.manager;
  }

  /**
   * Check if a session has a browser instance
   */
  hasInstance(sessionId: string): boolean {
    return this.sessionToInstance.has(sessionId);
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Create a new browser instance
   */
  private createInstance(sessionId: string): BrowserManager {
    if (!this.mainWindow) {
      throw new Error('BrowserInstancePool not initialized');
    }

    const instanceId = randomUUID();
    const manager = new BrowserManager();
    manager.init(this.mainWindow);
    
    // Apply current behavior settings
    if (Object.keys(this.behaviorSettings).length > 0) {
      manager.applyBehaviorSettings(this.behaviorSettings);
    }

    const instance: PooledBrowserInstance = {
      id: instanceId,
      sessionId,
      manager,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      isActive: true,
    };

    this.instances.set(instanceId, instance);
    this.sessionToInstance.set(sessionId, instanceId);

    logger.info('Created new browser instance', {
      instanceId,
      sessionId,
      totalInstances: this.instances.size,
    });

    this.emit('instance-created', { instanceId, sessionId });
    return manager;
  }

  /**
   * Reassign an idle instance to a new session
   */
  private async reassignInstance(
    instance: PooledBrowserInstance,
    newSessionId: string,
  ): Promise<BrowserManager> {
    const oldSessionId = instance.sessionId;

    // Clear browsing data from previous session to prevent data leaks
    try {
      await instance.manager.clearData();
    } catch (err) {
      logger.warn('Failed to clear session data during browser instance reassignment', {
        instanceId: instance.id,
        oldSessionId,
        newSessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Remove old mappings
    if (oldSessionId) {
      this.sessionToInstance.delete(oldSessionId);
    }

    // Update instance
    instance.sessionId = newSessionId;
    instance.lastUsedAt = Date.now();
    instance.isActive = true;

    // Add new mappings
    this.sessionToInstance.set(newSessionId, instance.id);

    logger.debug('Reassigned browser instance', {
      instanceId: instance.id,
      oldSessionId,
      newSessionId,
    });

    return instance.manager;
  }

  /**
   * Find any idle instance
   */
  private findIdleInstance(): PooledBrowserInstance | null {
    // Prefer oldest idle instance
    let oldestIdle: PooledBrowserInstance | null = null;
    
    for (const instance of this.instances.values()) {
      if (!instance.isActive) {
        if (!oldestIdle || instance.lastUsedAt < oldestIdle.lastUsedAt) {
          oldestIdle = instance;
        }
      }
    }
    
    return oldestIdle;
  }

  /**
   * Clean up idle instances
   */
  private cleanupIdleInstances(): void {
    if (this.isShuttingDown) return;

    const now = Date.now();
    const instancesToRemove: string[] = [];

    for (const [instanceId, instance] of this.instances) {
      // Don't clean up active instances
      if (instance.isActive) continue;

      // Check idle timeout
      const idleTime = now - instance.lastUsedAt;
      if (idleTime >= this.config.idleTimeoutMs) {
        instancesToRemove.push(instanceId);
      }
    }

    for (const instanceId of instancesToRemove) {
      this.destroyInstance(instanceId);
    }

    if (instancesToRemove.length > 0) {
      logger.info('Cleaned up idle browser instances', {
        count: instancesToRemove.length,
        remaining: this.instances.size,
      });
    }
  }

  /**
   * Destroy a specific instance
   */
  private destroyInstance(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    // Remove mappings
    if (instance.sessionId) {
      this.sessionToInstance.delete(instance.sessionId);
    }

    // Destroy browser manager
    try {
      instance.manager.destroy();
    } catch (error) {
      logger.warn('Error destroying browser instance', {
        instanceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.instances.delete(instanceId);

    logger.debug('Destroyed browser instance', {
      instanceId,
      sessionId: instance.sessionId,
    });

    this.emit('instance-destroyed', { instanceId, sessionId: instance.sessionId });
  }

  // ===========================================================================
  // Public Utilities
  // ===========================================================================

  /**
   * Get pool statistics
   */
  getStats(): BrowserPoolStats {
    let activeCount = 0;
    let idleCount = 0;

    for (const instance of this.instances.values()) {
      if (instance.isActive) {
        activeCount++;
      } else {
        idleCount++;
      }
    }

    return {
      totalInstances: this.instances.size,
      activeInstances: activeCount,
      idleInstances: idleCount,
      totalMemoryEstimate: this.instances.size * this.config.memoryLimitPerInstance,
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Destroy all instances
    for (const instanceId of Array.from(this.instances.keys())) {
      this.destroyInstance(instanceId);
    }

    this.instances.clear();
    this.sessionToInstance.clear();

    logger.info('BrowserInstancePool shut down');
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let globalPool: BrowserInstancePool | null = null;

/**
 * Get the global browser instance pool
 */
export function getBrowserInstancePool(): BrowserInstancePool {
  if (!globalPool) {
    globalPool = new BrowserInstancePool();
  }
  return globalPool;
}

/**
 * Initialize the global browser instance pool
 */
export function initBrowserInstancePool(
  mainWindow: BrowserWindow,
  config?: Partial<BrowserPoolConfig>
): BrowserInstancePool {
  if (globalPool) {
    globalPool.shutdown().catch((err) => logger.warn('Failed to shutdown previous browser pool', { error: String(err) }));
  }
  globalPool = new BrowserInstancePool(config);
  globalPool.init(mainWindow);
  return globalPool;
}

/**
 * Dispose the global browser instance pool
 */
export async function disposeBrowserInstancePool(): Promise<void> {
  if (globalPool) {
    await globalPool.shutdown();
    globalPool = null;
  }
}

export default BrowserInstancePool;
