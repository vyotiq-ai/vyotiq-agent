/**
 * Workspace Resource Manager
 * Handles workspace-scoped resource management, rate limiting, and concurrent session coordination
 * for multi-workspace environments.
 */

import type { InternalSession } from '../types';
import type { Logger } from '../../logger';
import type { WorkspaceResourceMetrics } from '../../../shared/types';

/**
 * Per-workspace resource tracking
 */
interface WorkspaceResources {
  /** Workspace ID */
  workspaceId: string;
  /** Active session IDs running in this workspace */
  activeSessions: Set<string>;
  /** Last LLM request timestamp per provider (rate limiting) */
  lastRequestTime: Map<string, number>;
  /** Request counts in current window (sliding window rate limiting) */
  requestCounts: Map<string, { count: number; windowStart: number }>;
  /** Memory estimate for this workspace (bytes) */
  memoryEstimate: number;
  /** Active tool executions count */
  activeToolExecutions: number;
  /** File operations queue for debouncing */
  fileOperationsQueue: Map<string, NodeJS.Timeout>;
  /** Created timestamp */
  createdAt: number;
  /** Last activity timestamp */
  lastActivityAt: number;
}

/**
 * Resource limits configuration
 */
interface ResourceLimits {
  /** Max concurrent sessions per workspace */
  maxSessionsPerWorkspace: number;
  /** Max concurrent tool executions per workspace */
  maxToolExecutionsPerWorkspace: number;
  /** Rate limit window in ms */
  rateLimitWindowMs: number;
  /** Max requests per rate limit window per provider */
  maxRequestsPerWindow: number;
  /** Min delay between requests to same provider (ms) */
  minRequestDelayMs: number;
  /** Max memory per workspace (bytes) - advisory */
  maxMemoryPerWorkspace: number;
  /** File operation debounce delay (ms) */
  fileOperationDebounceMs: number;
}

/**
 * Default resource limits
 */
const DEFAULT_LIMITS: ResourceLimits = {
  maxSessionsPerWorkspace: 5,
  maxToolExecutionsPerWorkspace: 10,
  rateLimitWindowMs: 60_000, // 1 minute
  maxRequestsPerWindow: 60,
  minRequestDelayMs: 100,
  maxMemoryPerWorkspace: 512 * 1024 * 1024, // 512MB
  fileOperationDebounceMs: 100,
};

/**
 * Result of resource acquisition attempt
 */
interface ResourceAcquisitionResult {
  acquired: boolean;
  waitMs?: number;
  reason?: string;
}

export class WorkspaceResourceManager {
  private readonly logger: Logger;
  private readonly workspaces = new Map<string, WorkspaceResources>();
  private readonly limits: ResourceLimits;
  private readonly cleanupInterval: NodeJS.Timeout;
  private readonly metricsCallbacks = new Set<(metrics: Map<string, WorkspaceResourceMetrics>) => void>();

  constructor(logger: Logger, limits?: Partial<ResourceLimits>) {
    this.logger = logger;
    this.limits = { ...DEFAULT_LIMITS, ...limits };

    // Periodic cleanup of stale workspace resources
    this.cleanupInterval = setInterval(() => this.cleanupStaleResources(), 60_000);
  }

  /**
   * Initialize resources for a workspace
   */
  initializeWorkspace(workspaceId: string): void {
    if (this.workspaces.has(workspaceId)) {
      this.logger.debug('Workspace resources already initialized', { workspaceId });
      return;
    }

    const resources: WorkspaceResources = {
      workspaceId,
      activeSessions: new Set(),
      lastRequestTime: new Map(),
      requestCounts: new Map(),
      memoryEstimate: 0,
      activeToolExecutions: 0,
      fileOperationsQueue: new Map(),
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    this.workspaces.set(workspaceId, resources);
    this.logger.info('Initialized workspace resources', { workspaceId });
    this.emitMetrics();
  }

  /**
   * Clean up resources for a workspace
   */
  cleanupWorkspace(workspaceId: string): void {
    const resources = this.workspaces.get(workspaceId);
    if (!resources) return;

    // Clear pending file operations
    Array.from(resources.fileOperationsQueue.values()).forEach(timeout => {
      clearTimeout(timeout);
    });

    this.workspaces.delete(workspaceId);
    this.logger.info('Cleaned up workspace resources', { workspaceId });
    this.emitMetrics();
  }

  /**
   * Register a session as active in a workspace
   */
  registerSession(session: InternalSession): ResourceAcquisitionResult {
    const workspaceId = session.state.workspaceId;
    if (!workspaceId) {
      // Session without workspace binding - allow but don't track
      return { acquired: true };
    }

    let resources = this.workspaces.get(workspaceId);

    // Auto-initialize if needed
    if (!resources) {
      this.initializeWorkspace(workspaceId);
      resources = this.workspaces.get(workspaceId)!;
    }

    // Check session limit
    if (resources.activeSessions.size >= this.limits.maxSessionsPerWorkspace) {
      this.logger.warn('Workspace session limit reached', {
        workspaceId,
        currentSessions: resources.activeSessions.size,
        limit: this.limits.maxSessionsPerWorkspace,
      });
      return {
        acquired: false,
        reason: `Maximum ${this.limits.maxSessionsPerWorkspace} concurrent sessions per workspace`,
      };
    }

    resources.activeSessions.add(session.state.id);
    resources.lastActivityAt = Date.now();
    
    this.logger.debug('Registered session in workspace', {
      workspaceId,
      sessionId: session.state.id,
      activeSessions: resources.activeSessions.size,
    });

    this.emitMetrics();
    return { acquired: true };
  }

  /**
   * Unregister a session from a workspace
   */
  unregisterSession(session: InternalSession): void {
    const workspaceId = session.state.workspaceId;
    if (!workspaceId) return;

    const resources = this.workspaces.get(workspaceId);
    if (!resources) return;

    resources.activeSessions.delete(session.state.id);
    resources.lastActivityAt = Date.now();

    this.logger.debug('Unregistered session from workspace', {
      workspaceId,
      sessionId: session.state.id,
      remainingSessions: resources.activeSessions.size,
    });

    this.emitMetrics();
  }

  /**
   * Acquire rate limit slot for a provider request
   * Returns delay in ms if should wait, or 0 if can proceed immediately
   */
  acquireRateLimitSlot(workspaceId: string, provider: string): ResourceAcquisitionResult {
    const resources = this.workspaces.get(workspaceId);
    if (!resources) {
      return { acquired: true }; // No tracking = no limiting
    }

    const now = Date.now();

    // Check min delay since last request
    const lastRequest = resources.lastRequestTime.get(provider) ?? 0;
    const timeSinceLastRequest = now - lastRequest;
    if (timeSinceLastRequest < this.limits.minRequestDelayMs) {
      const waitMs = this.limits.minRequestDelayMs - timeSinceLastRequest;
      return {
        acquired: false,
        waitMs,
        reason: 'Rate limit: minimum delay between requests',
      };
    }

    // Check sliding window rate limit
    let windowData = resources.requestCounts.get(provider);
    if (!windowData || now - windowData.windowStart > this.limits.rateLimitWindowMs) {
      // Start new window
      windowData = { count: 0, windowStart: now };
      resources.requestCounts.set(provider, windowData);
    }

    if (windowData.count >= this.limits.maxRequestsPerWindow) {
      const windowEnd = windowData.windowStart + this.limits.rateLimitWindowMs;
      const waitMs = Math.max(0, windowEnd - now);
      return {
        acquired: false,
        waitMs,
        reason: `Rate limit: ${this.limits.maxRequestsPerWindow} requests per ${this.limits.rateLimitWindowMs / 1000}s window`,
      };
    }

    // Acquire slot
    resources.lastRequestTime.set(provider, now);
    windowData.count++;
    resources.lastActivityAt = now;

    return { acquired: true };
  }

  /**
   * Wait for rate limit if needed, then proceed
   */
  async waitForRateLimitSlot(workspaceId: string, provider: string): Promise<void> {
    let result = this.acquireRateLimitSlot(workspaceId, provider);
    
    while (!result.acquired && result.waitMs) {
      this.logger.debug('Waiting for rate limit slot', {
        workspaceId,
        provider,
        waitMs: result.waitMs,
        reason: result.reason,
      });
      
      await new Promise(resolve => setTimeout(resolve, result.waitMs));
      result = this.acquireRateLimitSlot(workspaceId, provider);
    }
  }

  /**
   * Acquire tool execution slot
   */
  acquireToolExecutionSlot(workspaceId: string): ResourceAcquisitionResult {
    const resources = this.workspaces.get(workspaceId);
    if (!resources) {
      return { acquired: true };
    }

    if (resources.activeToolExecutions >= this.limits.maxToolExecutionsPerWorkspace) {
      return {
        acquired: false,
        reason: `Maximum ${this.limits.maxToolExecutionsPerWorkspace} concurrent tool executions`,
      };
    }

    resources.activeToolExecutions++;
    resources.lastActivityAt = Date.now();

    return { acquired: true };
  }

  /**
   * Release tool execution slot
   */
  releaseToolExecutionSlot(workspaceId: string): void {
    const resources = this.workspaces.get(workspaceId);
    if (!resources) return;

    resources.activeToolExecutions = Math.max(0, resources.activeToolExecutions - 1);
    resources.lastActivityAt = Date.now();
  }

  /**
   * Debounce file operation for a specific path
   */
  debounceFileOperation(
    workspaceId: string,
    filePath: string,
    operation: () => void
  ): void {
    const resources = this.workspaces.get(workspaceId);
    if (!resources) {
      operation();
      return;
    }

    // Clear existing timeout for this path
    const existingTimeout = resources.fileOperationsQueue.get(filePath);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Schedule new operation
    const timeout = setTimeout(() => {
      resources.fileOperationsQueue.delete(filePath);
      operation();
    }, this.limits.fileOperationDebounceMs);

    resources.fileOperationsQueue.set(filePath, timeout);
  }

  /**
   * Update memory estimate for workspace
   */
  updateMemoryEstimate(workspaceId: string, bytes: number): void {
    const resources = this.workspaces.get(workspaceId);
    if (!resources) return;

    resources.memoryEstimate = bytes;
    resources.lastActivityAt = Date.now();

    if (bytes > this.limits.maxMemoryPerWorkspace) {
      this.logger.warn('Workspace memory estimate exceeds limit', {
        workspaceId,
        memoryBytes: bytes,
        limitBytes: this.limits.maxMemoryPerWorkspace,
      });
    }

    this.emitMetrics();
  }

  /**
   * Get metrics for all workspaces
   */
  getMetrics(): Map<string, WorkspaceResourceMetrics> {
    const metrics = new Map<string, WorkspaceResourceMetrics>();

    for (const [workspaceId, resources] of Array.from(this.workspaces.entries())) {
      metrics.set(workspaceId, {
        workspaceId,
        activeSessions: resources.activeSessions.size,
        activeToolExecutions: resources.activeToolExecutions,
        memoryEstimateBytes: resources.memoryEstimate,
        lastActivityAt: resources.lastActivityAt,
        requestCounts: Object.fromEntries(
          Array.from(resources.requestCounts.entries()).map(([provider, data]) => [
            provider,
            data.count,
          ])
        ),
      });
    }

    return metrics;
  }

  /**
   * Get metrics for a specific workspace
   */
  getWorkspaceMetrics(workspaceId: string): WorkspaceResourceMetrics | null {
    const resources = this.workspaces.get(workspaceId);
    if (!resources) return null;

    return {
      workspaceId,
      activeSessions: resources.activeSessions.size,
      activeToolExecutions: resources.activeToolExecutions,
      memoryEstimateBytes: resources.memoryEstimate,
      lastActivityAt: resources.lastActivityAt,
      requestCounts: Object.fromEntries(
        Array.from(resources.requestCounts.entries()).map(([provider, data]) => [
          provider,
          data.count,
        ])
      ),
    };
  }

  /**
   * Check if workspace has any active sessions
   */
  hasActiveSessions(workspaceId: string): boolean {
    const resources = this.workspaces.get(workspaceId);
    return resources ? resources.activeSessions.size > 0 : false;
  }

  /**
   * Get active session count for workspace
   */
  getActiveSessionCount(workspaceId: string): number {
    const resources = this.workspaces.get(workspaceId);
    return resources?.activeSessions.size ?? 0;
  }

  /**
   * Get total active sessions across all workspaces
   */
  getTotalActiveSessions(): number {
    let total = 0;
    Array.from(this.workspaces.values()).forEach(resources => {
      total += resources.activeSessions.size;
    });
    return total;
  }

  /**
   * Register callback for metrics updates
   */
  onMetricsUpdate(callback: (metrics: Map<string, WorkspaceResourceMetrics>) => void): () => void {
    this.metricsCallbacks.add(callback);
    return () => this.metricsCallbacks.delete(callback);
  }

  /**
   * Emit metrics to all registered callbacks
   */
  private emitMetrics(): void {
    const metrics = this.getMetrics();
    Array.from(this.metricsCallbacks).forEach(callback => {
      try {
        callback(metrics);
      } catch (error) {
        this.logger.error('Error in metrics callback', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  /**
   * Clean up stale workspace resources
   */
  private cleanupStaleResources(): void {
    const staleThreshold = Date.now() - 30 * 60_000; // 30 minutes

    Array.from(this.workspaces.entries()).forEach(([workspaceId, resources]) => {
      // Don't clean up if there are active sessions
      if (resources.activeSessions.size > 0) return;

      // Clean up if no activity for stale threshold
      if (resources.lastActivityAt < staleThreshold) {
        this.logger.debug('Cleaning up stale workspace resources', {
          workspaceId,
          lastActivityAt: resources.lastActivityAt,
          staleThreshold,
        });
        this.cleanupWorkspace(workspaceId);
      }
    });
  }

  /**
   * Update resource limits dynamically
   */
  updateLimits(newLimits: Partial<ResourceLimits>): void {
    Object.assign(this.limits, newLimits);
    this.logger.info('Updated resource limits', { limits: this.limits });
  }

  /**
   * Get current resource limits
   */
  getLimits(): Readonly<ResourceLimits> {
    return { ...this.limits };
  }

  /**
   * Dispose of the manager
   */
  dispose(): void {
    clearInterval(this.cleanupInterval);
    
    // Clean up all workspace file operation timeouts
    Array.from(this.workspaces.values()).forEach(resources => {
      Array.from(resources.fileOperationsQueue.values()).forEach(timeout => {
        clearTimeout(timeout);
      });
    });
    
    this.workspaces.clear();
    this.metricsCallbacks.clear();
    this.logger.info('Disposed WorkspaceResourceManager');
  }
}
