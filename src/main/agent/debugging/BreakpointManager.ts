/**
 * Breakpoint Manager
 *
 * Manages breakpoints for debugging,
 * supporting various breakpoint types and conditions.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Logger } from '../../logger';

// =============================================================================
// Types
// =============================================================================

export type BreakpointType =
  | 'on-spawn'
  | 'on-complete'
  | 'on-error'
  | 'on-tool-call'
  | 'on-llm-call'
  | 'on-step'
  | 'conditional';

export interface Breakpoint {
  id: string;
  type: BreakpointType;
  enabled: boolean;
  hitCount: number;
  condition?: BreakpointCondition;
  agentFilter?: string[];
  toolFilter?: string[];
  stepNumber?: number;
  description?: string;
  createdAt: number;
  lastHitAt?: number;
}

export interface BreakpointCondition {
  expression: string;
  evaluator: (context: BreakpointContext) => boolean;
}

export interface BreakpointContext {
  agentId: string;
  eventType: string;
  data: Record<string, unknown>;
  timestamp: number;
  stepNumber?: number;
  toolName?: string;
  messageType?: string;
  error?: Error;
}

export interface BreakpointHit {
  breakpointId: string;
  breakpoint: Breakpoint;
  context: BreakpointContext;
  timestamp: number;
  resumed: boolean;
  resumedAt?: number;
}

export interface BreakpointManagerConfig {
  maxBreakpoints: number;
  maxHitHistory: number;
  defaultEnabled: boolean;
  pauseOnHit: boolean;
}

export const DEFAULT_BREAKPOINT_MANAGER_CONFIG: BreakpointManagerConfig = {
  maxBreakpoints: 50,
  maxHitHistory: 200,
  defaultEnabled: true,
  pauseOnHit: true,
};

// =============================================================================
// BreakpointManager
// =============================================================================

export class BreakpointManager extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: BreakpointManagerConfig;
  private readonly breakpoints = new Map<string, Breakpoint>();
  private readonly hitHistory: BreakpointHit[] = [];
  private globalEnabled = true;
  private pauseResolvers = new Map<string, () => void>();

  constructor(logger: Logger, config: Partial<BreakpointManagerConfig> = {}) {
    super();
    this.logger = logger;
    this.config = { ...DEFAULT_BREAKPOINT_MANAGER_CONFIG, ...config };
  }

  /**
   * Set a breakpoint
   */
  setBreakpoint(
    type: BreakpointType,
    options: Partial<Omit<Breakpoint, 'id' | 'type' | 'hitCount' | 'createdAt'>> = {}
  ): Breakpoint {
    if (this.breakpoints.size >= this.config.maxBreakpoints) {
      throw new Error(`Maximum breakpoint limit (${this.config.maxBreakpoints}) reached`);
    }

    const breakpoint: Breakpoint = {
      id: randomUUID(),
      type,
      enabled: options.enabled ?? this.config.defaultEnabled,
      hitCount: 0,
      condition: options.condition,
      agentFilter: options.agentFilter,
      toolFilter: options.toolFilter,
      stepNumber: options.stepNumber,
      description: options.description,
      createdAt: Date.now(),
    };

    this.breakpoints.set(breakpoint.id, breakpoint);
    this.logger.debug('Breakpoint set', { breakpointId: breakpoint.id, type });
    this.emit('breakpoint-set', { breakpoint });

    return breakpoint;
  }

  /**
   * Remove a breakpoint
   */
  removeBreakpoint(breakpointId: string): boolean {
    const breakpoint = this.breakpoints.get(breakpointId);
    if (!breakpoint) return false;

    this.breakpoints.delete(breakpointId);
    this.logger.debug('Breakpoint removed', { breakpointId });
    this.emit('breakpoint-removed', { breakpointId });

    return true;
  }

  /**
   * Enable a breakpoint
   */
  enableBreakpoint(breakpointId: string): boolean {
    const breakpoint = this.breakpoints.get(breakpointId);
    if (!breakpoint) return false;

    breakpoint.enabled = true;
    this.emit('breakpoint-enabled', { breakpointId });
    return true;
  }

  /**
   * Disable a breakpoint
   */
  disableBreakpoint(breakpointId: string): boolean {
    const breakpoint = this.breakpoints.get(breakpointId);
    if (!breakpoint) return false;

    breakpoint.enabled = false;
    this.emit('breakpoint-disabled', { breakpointId });
    return true;
  }

  /**
   * Toggle a breakpoint
   */
  toggleBreakpoint(breakpointId: string): boolean {
    const breakpoint = this.breakpoints.get(breakpointId);
    if (!breakpoint) return false;

    breakpoint.enabled = !breakpoint.enabled;
    return breakpoint.enabled;
  }

  /**
   * Get a breakpoint by ID
   */
  getBreakpoint(breakpointId: string): Breakpoint | undefined {
    return this.breakpoints.get(breakpointId);
  }

  /**
   * Get all breakpoints
   */
  getBreakpoints(): Breakpoint[] {
    return Array.from(this.breakpoints.values());
  }

  /**
   * Get breakpoints by type
   */
  getBreakpointsByType(type: BreakpointType): Breakpoint[] {
    return this.getBreakpoints().filter(bp => bp.type === type);
  }

  /**
   * Clear all breakpoints
   */
  clearBreakpoints(): void {
    this.breakpoints.clear();
    this.emit('breakpoints-cleared');
  }

  /**
   * Enable all breakpoints globally
   */
  enableAll(): void {
    this.globalEnabled = true;
    this.emit('global-enabled');
  }

  /**
   * Disable all breakpoints globally
   */
  disableAll(): void {
    this.globalEnabled = false;
    this.emit('global-disabled');
  }

  /**
   * Check if breakpoints are globally enabled
   */
  isGloballyEnabled(): boolean {
    return this.globalEnabled;
  }

  /**
   * Check for breakpoint hit and pause if configured
   */
  async checkBreakpoint(context: BreakpointContext): Promise<BreakpointHit | null> {
    if (!this.globalEnabled) return null;

    const matchingBreakpoint = this.findMatchingBreakpoint(context);
    if (!matchingBreakpoint) return null;

    // Record hit
    matchingBreakpoint.hitCount++;
    matchingBreakpoint.lastHitAt = Date.now();

    const hit: BreakpointHit = {
      breakpointId: matchingBreakpoint.id,
      breakpoint: { ...matchingBreakpoint },
      context,
      timestamp: Date.now(),
      resumed: false,
    };

    this.recordHit(hit);
    this.logger.info('Breakpoint hit', {
      breakpointId: matchingBreakpoint.id,
      type: matchingBreakpoint.type,
      agentId: context.agentId,
    });

    this.emit('breakpoint-hit', { hit });

    // Pause if configured
    if (this.config.pauseOnHit) {
      await this.pauseExecution(hit);
    }

    return hit;
  }

  /**
   * Resume execution after breakpoint
   */
  resume(hitId?: string): void {
    if (hitId) {
      const resolver = this.pauseResolvers.get(hitId);
      if (resolver) {
        resolver();
        this.pauseResolvers.delete(hitId);
      }
    } else {
      // Resume all
      for (const [id, resolver] of this.pauseResolvers) {
        resolver();
        this.pauseResolvers.delete(id);
      }
    }
  }

  /**
   * Get hit history
   */
  getHitHistory(limit?: number): BreakpointHit[] {
    if (limit) {
      return this.hitHistory.slice(-limit);
    }
    return [...this.hitHistory];
  }

  /**
   * Clear hit history
   */
  clearHitHistory(): void {
    this.hitHistory.length = 0;
  }

  /**
   * Create a conditional breakpoint
   */
  setConditionalBreakpoint(
    expression: string,
    evaluator: (context: BreakpointContext) => boolean,
    options: Partial<Omit<Breakpoint, 'id' | 'type' | 'hitCount' | 'createdAt' | 'condition'>> = {}
  ): Breakpoint {
    return this.setBreakpoint('conditional', {
      ...options,
      condition: { expression, evaluator },
    });
  }

  /**
   * Set breakpoint on agent completion
   */
  setOnCompletionBreakpoint(agentFilter?: string[], description?: string): Breakpoint {
    return this.setBreakpoint('on-complete', { agentFilter, description });
  }

  /**
   * Set breakpoint on agent completion
   */
  setOnCompleteBreakpoint(agentFilter?: string[], description?: string): Breakpoint {
    return this.setBreakpoint('on-complete', { agentFilter, description });
  }

  /**
   * Set breakpoint on error
   */
  setOnErrorBreakpoint(agentFilter?: string[], description?: string): Breakpoint {
    return this.setBreakpoint('on-error', { agentFilter, description });
  }

  /**
   * Set breakpoint on tool call
   */
  setOnToolCallBreakpoint(toolFilter?: string[], agentFilter?: string[], description?: string): Breakpoint {
    return this.setBreakpoint('on-tool-call', { toolFilter, agentFilter, description });
  }

  /**
   * Set breakpoint on specific step number
   */
  setOnStepBreakpoint(stepNumber: number, agentFilter?: string[], description?: string): Breakpoint {
    return this.setBreakpoint('on-step', { stepNumber, agentFilter, description });
  }

  /**
   * Get breakpoint statistics
   */
  getStats(): {
    total: number;
    enabled: number;
    disabled: number;
    byType: Record<BreakpointType, number>;
    totalHits: number;
  } {
    const breakpoints = this.getBreakpoints();
    const byType: Record<string, number> = {};

    for (const bp of breakpoints) {
      byType[bp.type] = (byType[bp.type] || 0) + 1;
    }

    return {
      total: breakpoints.length,
      enabled: breakpoints.filter(bp => bp.enabled).length,
      disabled: breakpoints.filter(bp => !bp.enabled).length,
      byType: byType as Record<BreakpointType, number>,
      totalHits: this.hitHistory.length,
    };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private findMatchingBreakpoint(context: BreakpointContext): Breakpoint | null {
    for (const breakpoint of this.breakpoints.values()) {
      if (!breakpoint.enabled) continue;

      if (this.matchesBreakpoint(breakpoint, context)) {
        return breakpoint;
      }
    }
    return null;
  }

  private matchesBreakpoint(breakpoint: Breakpoint, context: BreakpointContext): boolean {
    // Check agent filter
    if (breakpoint.agentFilter && breakpoint.agentFilter.length > 0) {
      if (!breakpoint.agentFilter.includes(context.agentId)) {
        return false;
      }
    }

    // Check type-specific conditions
    switch (breakpoint.type) {
      case 'on-spawn':
        return context.eventType === 'spawn';

      case 'on-complete':
        return context.eventType === 'complete';

      case 'on-error':
        return context.eventType === 'error' || context.error !== undefined;

      case 'on-tool-call':
        if (context.eventType !== 'tool-call') return false;
        if (breakpoint.toolFilter && breakpoint.toolFilter.length > 0) {
          return breakpoint.toolFilter.includes(context.toolName || '');
        }
        return true;

      case 'on-llm-call':
        return context.eventType === 'llm-call';

      case 'on-step':
        return context.stepNumber === breakpoint.stepNumber;

      case 'conditional':
        if (!breakpoint.condition) return false;
        try {
          return breakpoint.condition.evaluator(context);
        } catch (error) {
          this.logger.warn('Conditional breakpoint evaluation failed', {
            breakpointId: breakpoint.id,
            error,
          });
          return false;
        }

      default:
        return false;
    }
  }

  private recordHit(hit: BreakpointHit): void {
    this.hitHistory.push(hit);

    // Prune if over limit
    if (this.hitHistory.length > this.config.maxHitHistory) {
      this.hitHistory.splice(0, this.hitHistory.length - this.config.maxHitHistory);
    }
  }

  private async pauseExecution(hit: BreakpointHit): Promise<void> {
    const hitId = `${hit.breakpointId}-${hit.timestamp}`;

    await new Promise<void>(resolve => {
      this.pauseResolvers.set(hitId, () => {
        hit.resumed = true;
        hit.resumedAt = Date.now();
        resolve();
      });

      this.emit('execution-paused', { hit, hitId });
    });

    this.emit('execution-resumed', { hit, hitId });
  }
}
