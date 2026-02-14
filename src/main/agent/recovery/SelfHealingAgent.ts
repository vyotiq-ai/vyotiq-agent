/**
 * SelfHealingAgent
 *
 * Proactive self-healing capabilities. Monitors system health and
 * automatically takes corrective actions before failures occur.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import v8 from 'node:v8';
import type {
  SelfHealingConfig,
  SelfHealingTriggerConfig,
  RecoveryDeps,
} from './types';
import { RecoveryManager } from './RecoveryManager';
import { createLogger } from '../../logger';

const logger = createLogger('SelfHealingAgent');

// =============================================================================
// Types
// =============================================================================

interface HealthMetrics {
  errorRate: number;
  latencyP50: number;
  latencyP95: number;
  memoryUsage: number;
  cpuUsage: number;
  activeAgents: number;
  queuedTasks: number;
  failedTasksRecent: number;
}

interface HealingAction {
  id: string;
  trigger: string;
  action: string;
  description: string;
  startedAt: number;
  completedAt?: number;
  success: boolean;
  details?: string;
}

interface SelfHealingState {
  isEnabled: boolean;
  isHealing: boolean;
  lastCheck: number;
  lastHealing?: number;
  healingActions: HealingAction[];
  suppressedTriggers: Map<string, number>;
}

// =============================================================================
// Default Config
// =============================================================================

const DEFAULT_SELF_HEALING_CONFIG: SelfHealingConfig = {
  enabled: true,
  checkIntervalMs: 30000, // 30 seconds
  triggers: [
    {
      id: 'high-error-rate',
      name: 'High Error Rate',
      condition: 'metrics.errorRate > 0.3',
      action: 'reduce-concurrency',
      cooldownMs: 60000,
    },
    {
      id: 'high-latency',
      name: 'High Latency',
      condition: 'metrics.latencyP95 > 10000',
      action: 'scale-down',
      cooldownMs: 60000,
    },
    {
      id: 'memory-pressure',
      name: 'Memory Pressure',
      condition: 'metrics.memoryUsage > 0.85',
      action: 'clear-caches',
      cooldownMs: 120000,
    },
    {
      id: 'task-queue-buildup',
      name: 'Task Queue Buildup',
      condition: 'metrics.queuedTasks > 50',
      action: 'pause-new-tasks',
      cooldownMs: 30000,
    },
    {
      id: 'cascade-failure',
      name: 'Cascade Failure Detection',
      condition: 'metrics.failedTasksRecent > 5',
      action: 'circuit-break',
      cooldownMs: 180000,
    },
  ],
  maxHealingActionsPerHour: 20,
  suppressDuplicateActionsMs: 60000,
};

// =============================================================================
// SelfHealingAgent
// =============================================================================

export class SelfHealingAgent extends EventEmitter {
  private readonly config: SelfHealingConfig;
  private readonly recoveryManager: RecoveryManager;
  private readonly deps: RecoveryDeps;

  private state: SelfHealingState = {
    isEnabled: true,
    isHealing: false,
    lastCheck: 0,
    healingActions: [],
    suppressedTriggers: new Map(),
  };

  private checkInterval?: ReturnType<typeof setInterval>;
  private getMetrics: () => HealthMetrics;

  constructor(
    recoveryManager: RecoveryManager,
    config: Partial<SelfHealingConfig> = {},
    deps?: Partial<RecoveryDeps>,
    metricsProvider?: () => HealthMetrics
  ) {
    super();

    this.config = { ...DEFAULT_SELF_HEALING_CONFIG, ...config };
    this.recoveryManager = recoveryManager;

    this.deps = {
      logger: deps?.logger ?? logger,
      emitEvent: deps?.emitEvent ?? (() => {}),
      getSystemState: deps?.getSystemState ?? (() => ({})),
    };

    // Default metrics provider
    this.getMetrics = metricsProvider ?? (() => this.getDefaultMetrics());

    this.state.isEnabled = this.config.enabled;
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Start self-healing monitoring
   */
  start(): void {
    if (this.checkInterval) {
      this.stop();
    }

    this.state.isEnabled = true;
    this.deps.logger.info('SelfHealingAgent: started');

    this.checkInterval = setInterval(() => {
      this.performHealthCheck().catch(err => {
        this.deps.logger.error('SelfHealingAgent: health check failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, this.config.checkIntervalMs);
    if (this.checkInterval && typeof this.checkInterval === 'object' && 'unref' in this.checkInterval) {
      (this.checkInterval as NodeJS.Timeout).unref();
    }

    // Initial check
    this.performHealthCheck().catch(err => {
      this.deps.logger.warn('SelfHealingAgent: initial health check failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  /**
   * Stop self-healing monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
    this.state.isEnabled = false;
    this.deps.logger.info('SelfHealingAgent: stopped');
  }

  /**
   * Enable/disable self-healing
   */
  setEnabled(enabled: boolean): void {
    this.state.isEnabled = enabled;
    if (enabled && !this.checkInterval) {
      this.start();
    } else if (!enabled && this.checkInterval) {
      this.stop();
    }
  }

  // ===========================================================================
  // Health Check
  // ===========================================================================

  /**
   * Perform health check and trigger healing if needed
   */
  async performHealthCheck(): Promise<{
    healthy: boolean;
    triggeredActions: HealingAction[];
  }> {
    if (!this.state.isEnabled) {
      return { healthy: true, triggeredActions: [] };
    }

    this.state.lastCheck = Date.now();
    const metrics = this.getMetrics();
    const triggeredActions: HealingAction[] = [];

    // Check each trigger
    for (const trigger of this.config.triggers) {
      if (this.shouldTrigger(trigger, metrics)) {
        const action = await this.executeHealingAction(trigger, metrics);
        if (action) {
          triggeredActions.push(action);
        }
      }
    }

    const healthy = triggeredActions.length === 0;

    if (!healthy) {
      this.emit('healing-triggered', { metrics, actions: triggeredActions });
    }

    return { healthy, triggeredActions };
  }

  /**
   * Check if a trigger should fire
   */
  private shouldTrigger(trigger: SelfHealingTriggerConfig, metrics: HealthMetrics): boolean {
    // Check cooldown
    const lastTriggered = this.state.suppressedTriggers.get(trigger.id);
    if (lastTriggered && Date.now() - lastTriggered < trigger.cooldownMs) {
      return false;
    }

    // Check rate limit
    const recentActions = this.state.healingActions.filter(
      a => Date.now() - a.startedAt < 3600000
    );
    if (recentActions.length >= this.config.maxHealingActionsPerHour) {
      return false;
    }

    // Evaluate condition
    return this.evaluateCondition(trigger.condition, metrics);
  }

  /**
   * Evaluate trigger condition
   */
  private evaluateCondition(condition: string, metrics: HealthMetrics): boolean {
    try {
      // Simple condition evaluation
      // Format: "metrics.field operator value"
      const match = condition.match(/metrics\.(\w+)\s*(>|<|>=|<=|==|!=)\s*([\d.]+)/);
      if (!match) return false;

      const [, field, operator, valueStr] = match;
      const fieldValue = (metrics as unknown as Record<string, number>)[field];
      const compareValue = parseFloat(valueStr);

      if (fieldValue === undefined) return false;

      switch (operator) {
        case '>': return fieldValue > compareValue;
        case '<': return fieldValue < compareValue;
        case '>=': return fieldValue >= compareValue;
        case '<=': return fieldValue <= compareValue;
        case '==': return fieldValue === compareValue;
        case '!=': return fieldValue !== compareValue;
        default: return false;
      }
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // Healing Actions
  // ===========================================================================

  /**
   * Execute a healing action
   */
  private async executeHealingAction(
    trigger: SelfHealingTriggerConfig,
    metrics: HealthMetrics
  ): Promise<HealingAction | null> {
    if (this.state.isHealing) {
      this.deps.logger.debug('SelfHealingAgent: already healing, skipping');
      return null;
    }

    this.state.isHealing = true;
    this.state.suppressedTriggers.set(trigger.id, Date.now());

    const action: HealingAction = {
      id: randomUUID(),
      trigger: trigger.id,
      action: trigger.action,
      description: `Triggered by ${trigger.name}`,
      startedAt: Date.now(),
      success: false,
    };

    this.deps.logger.info('SelfHealingAgent: executing healing action', {
      trigger: trigger.id,
      action: trigger.action,
    });

    try {
      await this.performAction(trigger.action, metrics);
      action.success = true;
      action.details = 'Completed successfully';
    } catch (error) {
      action.success = false;
      action.details = error instanceof Error ? error.message : String(error);
      this.deps.logger.error('SelfHealingAgent: healing action failed', {
        action: trigger.action,
        error: action.details,
      });
    } finally {
      action.completedAt = Date.now();
      this.state.healingActions.push(action);
      // Cap healing actions history to prevent unbounded memory growth
      if (this.state.healingActions.length > 500) {
        this.state.healingActions.splice(0, this.state.healingActions.length - 500);
      }
      this.state.isHealing = false;
      this.state.lastHealing = Date.now();
    }

    this.emit('healing-action', action);
    return action;
  }

  /**
   * Perform specific healing action
   */
  private async performAction(action: string, _metrics: HealthMetrics): Promise<void> {
    switch (action) {
      case 'reduce-concurrency':
        await this.reduceConcurrency();
        break;

      case 'scale-down':
        await this.scaleDown();
        break;

      case 'clear-caches':
        await this.clearCaches();
        break;

      case 'pause-new-tasks':
        await this.pauseNewTasks();
        break;

      case 'circuit-break':
        await this.circuitBreak();
        break;

      case 'restart-agents':
        await this.restartAgents();
        break;

      case 'gc':
        await this.triggerGC();
        break;

      default:
        this.deps.logger.warn('SelfHealingAgent: unknown action', { action });
    }
  }

  // ===========================================================================
  // Specific Actions
  // ===========================================================================

  private async reduceConcurrency(): Promise<void> {
    const factor = 0.5;
    this.deps.logger.info('SelfHealingAgent: reducing concurrency', { factor });
    
    this.deps.emitEvent({
      type: 'self-healing-action',
      action: 'reduce-concurrency',
      details: { factor },
      timestamp: Date.now(),
    });
    
    // Execute hook if provided by host
    await this.deps.reduceConcurrency?.(factor);
  }

  private async scaleDown(): Promise<void> {
    this.deps.logger.info('SelfHealingAgent: scaling down to minimum agents');
    
    this.deps.emitEvent({
      type: 'self-healing-action',
      action: 'scale-down',
      details: { targetAgents: 1 },
      timestamp: Date.now(),
    });
    
    // Scale down is handled via reduce concurrency with aggressive factor
    await this.deps.reduceConcurrency?.(0.25);
  }

  private async clearCaches(): Promise<void> {
    this.deps.logger.info('SelfHealingAgent: clearing caches');
    
    this.deps.emitEvent({
      type: 'self-healing-action',
      action: 'clear-caches',
      details: {},
      timestamp: Date.now(),
    });

    // Execute hook if provided by host
    await this.deps.clearCaches?.();
  }

  private async pauseNewTasks(): Promise<void> {
    const durationMs = 30000;
    this.deps.logger.info('SelfHealingAgent: pausing new tasks', { durationMs });
    
    this.deps.emitEvent({
      type: 'self-healing-action',
      action: 'pause-new-tasks',
      details: { durationMs },
      timestamp: Date.now(),
    });
    
    // Execute hook if provided by host
    await this.deps.pauseNewTasks?.(durationMs);
  }

  private async circuitBreak(): Promise<void> {
    this.deps.logger.warn('SelfHealingAgent: triggering circuit break');
    
    this.deps.emitEvent({
      type: 'self-healing-action',
      action: 'circuit-break',
      details: { scope: 'all' },
      timestamp: Date.now(),
    });
    
    // Execute hook if provided by host
    await this.deps.triggerCircuitBreak?.();
  }

  private async restartAgents(): Promise<void> {
    this.deps.logger.info('SelfHealingAgent: requesting agent restart');
    
    this.deps.emitEvent({
      type: 'self-healing-action',
      action: 'restart-agents',
      details: {},
      timestamp: Date.now(),
    });
    
    // Restart is typically handled by orchestrator listening to events
    // Clear caches as part of restart preparation
    await this.deps.clearCaches?.();
  }

  private async triggerGC(): Promise<void> {
    if (global.gc) {
      global.gc();
      this.deps.logger.debug('SelfHealingAgent: triggered garbage collection');
    }
  }

  // ===========================================================================
  // Default Metrics
  // ===========================================================================

  private getDefaultMetrics(): HealthMetrics {
    const memUsage = process.memoryUsage();
    const heapLimit = v8.getHeapStatistics().heap_size_limit;
    const denom = heapLimit > 0 ? heapLimit : (memUsage.heapTotal || 1);

    return {
      errorRate: 0,
      latencyP50: 0,
      latencyP95: 0,
      memoryUsage: memUsage.heapUsed / denom,
      cpuUsage: 0,
      activeAgents: 0,
      queuedTasks: 0,
      failedTasksRecent: 0,
    };
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Get current state
   */
  getState(): Readonly<SelfHealingState> {
    return { ...this.state };
  }

  /**
   * Get healing history
   */
  getHealingHistory(limit: number = 100): HealingAction[] {
    return this.state.healingActions.slice(-limit);
  }

  /**
   * Register custom trigger
   */
  registerTrigger(trigger: SelfHealingTriggerConfig): void {
    // Remove existing with same ID
    this.config.triggers = this.config.triggers.filter(t => t.id !== trigger.id);
    this.config.triggers.push(trigger);
  }

  /**
   * Remove trigger
   */
  removeTrigger(triggerId: string): boolean {
    const before = this.config.triggers.length;
    this.config.triggers = this.config.triggers.filter(t => t.id !== triggerId);
    return this.config.triggers.length < before;
  }

  /**
   * Update metrics provider
   */
  setMetricsProvider(provider: () => HealthMetrics): void {
    this.getMetrics = provider;
  }

  /**
   * Force healing action
   */
  async forceAction(action: string): Promise<HealingAction> {
    const trigger: SelfHealingTriggerConfig = {
      id: 'manual',
      name: 'Manual Action',
      condition: 'true',
      action,
      cooldownMs: 0,
    };

    const result = await this.executeHealingAction(trigger, this.getMetrics());
    return result ?? {
      id: randomUUID(),
      trigger: 'manual',
      action,
      description: 'Manual action skipped',
      startedAt: Date.now(),
      success: false,
    };
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalActions: number;
    successfulActions: number;
    failedActions: number;
    lastCheckTime: number;
    lastHealingTime?: number;
    actionsInLastHour: number;
  } {
    const now = Date.now();
    const hourAgo = now - 3600000;

    const successful = this.state.healingActions.filter(a => a.success).length;
    const actionsInLastHour = this.state.healingActions.filter(
      a => a.startedAt > hourAgo
    ).length;

    return {
      totalActions: this.state.healingActions.length,
      successfulActions: successful,
      failedActions: this.state.healingActions.length - successful,
      lastCheckTime: this.state.lastCheck,
      lastHealingTime: this.state.lastHealing,
      actionsInLastHour,
    };
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.state.healingActions = [];
    this.state.suppressedTriggers.clear();
  }
}
