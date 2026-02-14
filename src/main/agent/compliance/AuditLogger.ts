/**
 * Audit Logger
 *
 * Comprehensive audit logging for compliance tracking.
 * Records all security-relevant events with detailed context for analysis.
 */
import { randomUUID } from 'node:crypto';
import { createLogger } from '../../logger';
import type { SecurityActor } from '../security/SecurityAuditLog';

const logger = createLogger('AuditLogger');

// =============================================================================
// Types
// =============================================================================

/**
 * Audit event category
 */
export type AuditCategory =
  | 'tool_lifecycle'
  | 'tool_execution'
  | 'permission'
  | 'security'
  | 'compliance'
  | 'agent_lifecycle'
  | 'resource'
  | 'configuration';

/**
 * Audit event severity
 */
export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Audit event
 */
export interface AuditEvent {
  id: string;
  category: AuditCategory;
  action: string;
  severity: AuditSeverity;
  actor: SecurityActor;
  target?: AuditTarget;
  details: Record<string, unknown>;
  outcome: 'success' | 'failure' | 'blocked' | 'pending';
  timestamp: number;
  duration?: number;
  correlationId?: string;
  parentEventId?: string;
}

/**
 * Audit target
 */
export interface AuditTarget {
  type: 'tool' | 'agent' | 'file' | 'permission' | 'session' | 'configuration';
  id: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Audit query options
 */
export interface AuditQueryOptions {
  category?: AuditCategory;
  action?: string;
  severity?: AuditSeverity;
  outcome?: AuditEvent['outcome'];
  actorSessionId?: string;
  targetType?: AuditTarget['type'];
  targetId?: string;
  startTime?: number;
  endTime?: number;
  correlationId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Audit statistics
 */
export interface AuditStats {
  totalEvents: number;
  byCategory: Record<AuditCategory, number>;
  bySeverity: Record<AuditSeverity, number>;
  byOutcome: Record<string, number>;
  recentActivity: {
    last5Min: number;
    lastHour: number;
    last24Hours: number;
  };
  topActions: Array<{ action: string; count: number }>;
}

/**
 * Audit logger configuration
 */
export interface AuditLoggerConfig {
  /** Maximum events to keep in memory */
  maxEvents: number;
  /** Enable detailed logging */
  detailedLogging: boolean;
  /** Log to console */
  logToConsole: boolean;
  /** Minimum severity to log */
  minSeverity: AuditSeverity;
  /** Enable correlation tracking */
  enableCorrelation: boolean;
  /** Auto-cleanup interval in ms (0 = disabled) */
  cleanupIntervalMs: number;
  /** Event retention period in ms */
  retentionPeriodMs: number;
}

/**
 * Default configuration
 */
export const DEFAULT_AUDIT_CONFIG: AuditLoggerConfig = {
  maxEvents: 10000,
  detailedLogging: true,
  logToConsole: true,
  minSeverity: 'info',
  enableCorrelation: true,
  cleanupIntervalMs: 300000, // 5 minutes
  retentionPeriodMs: 86400000, // 24 hours
};

// =============================================================================
// AuditLogger
// =============================================================================

export class AuditLogger {
  private config: AuditLoggerConfig;
  private events: AuditEvent[] = [];
  private correlationMap = new Map<string, string[]>();
  private cleanupTimer?: NodeJS.Timeout;
  private actionCounts = new Map<string, number>();

  constructor(config?: Partial<AuditLoggerConfig>) {
    this.config = { ...DEFAULT_AUDIT_CONFIG, ...config };

    if (this.config.cleanupIntervalMs > 0) {
      this.startCleanupTimer();
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AuditLoggerConfig>): void {
    this.config = { ...this.config, ...config };

    // Restart cleanup timer if interval changed
    if (config.cleanupIntervalMs !== undefined) {
      this.stopCleanupTimer();
      if (this.config.cleanupIntervalMs > 0) {
        this.startCleanupTimer();
      }
    }
  }

  /**
   * Log an audit event
   */
  log(
    category: AuditCategory,
    action: string,
    actor: SecurityActor,
    details: Record<string, unknown> = {},
    options: {
      severity?: AuditSeverity;
      outcome?: AuditEvent['outcome'];
      target?: AuditTarget;
      duration?: number;
      correlationId?: string;
      parentEventId?: string;
    } = {}
  ): AuditEvent {
    const severity = options.severity || 'info';

    // Check minimum severity
    if (!this.shouldLog(severity)) {
      return this.createEvent(category, action, actor, details, options);
    }

    const event = this.createEvent(category, action, actor, details, options);

    // Store event
    this.events.push(event);
    if (this.events.length > this.config.maxEvents) {
      this.events = this.events.slice(-this.config.maxEvents);
    }

    // Track correlation
    if (this.config.enableCorrelation && event.correlationId) {
      const correlated = this.correlationMap.get(event.correlationId) || [];
      correlated.push(event.id);
      this.correlationMap.set(event.correlationId, correlated);
    }

    // Track action counts
    this.actionCounts.set(action, (this.actionCounts.get(action) || 0) + 1);

    // Log to console if enabled
    if (this.config.logToConsole) {
      this.logToConsole(event);
    }

    return event;
  }

  /**
   * Log tool creation
   */
  logToolCreation(
    actor: SecurityActor,
    toolId: string,
    toolName: string,
    outcome: AuditEvent['outcome'],
    details: Record<string, unknown> = {}
  ): AuditEvent {
    return this.log('tool_lifecycle', 'tool_created', actor, {
      toolId,
      toolName,
      ...details,
    }, {
      outcome,
      severity: outcome === 'success' ? 'info' : 'warning',
      target: { type: 'tool', id: toolId, name: toolName },
    });
  }

  /**
   * Log tool execution
   */
  logToolExecution(
    actor: SecurityActor,
    toolId: string,
    toolName: string,
    outcome: AuditEvent['outcome'],
    duration: number,
    details: Record<string, unknown> = {}
  ): AuditEvent {
    return this.log('tool_execution', 'tool_executed', actor, {
      toolId,
      toolName,
      ...details,
    }, {
      outcome,
      duration,
      severity: outcome === 'failure' ? 'warning' : 'info',
      target: { type: 'tool', id: toolId, name: toolName },
    });
  }

  /**
   * Log permission change
   */
  logPermissionChange(
    actor: SecurityActor,
    action: 'granted' | 'revoked' | 'requested' | 'denied',
    capability: string,
    targetId: string,
    details: Record<string, unknown> = {}
  ): AuditEvent {
    return this.log('permission', `permission_${action}`, actor, {
      capability,
      targetId,
      ...details,
    }, {
      outcome: action === 'denied' ? 'blocked' : 'success',
      severity: action === 'denied' ? 'warning' : 'info',
      target: { type: 'permission', id: targetId },
    });
  }

  /**
   * Log security event
   */
  logSecurityEvent(
    actor: SecurityActor,
    action: string,
    severity: AuditSeverity,
    details: Record<string, unknown> = {}
  ): AuditEvent {
    return this.log('security', action, actor, details, {
      severity,
      outcome: severity === 'critical' || severity === 'error' ? 'blocked' : 'success',
    });
  }

  /**
   * Log compliance violation
   */
  logComplianceViolation(
    actor: SecurityActor,
    violationType: string,
    details: Record<string, unknown> = {}
  ): AuditEvent {
    return this.log('compliance', 'violation_detected', actor, {
      violationType,
      ...details,
    }, {
      severity: 'warning',
      outcome: 'blocked',
    });
  }

  /**
   * Log agent lifecycle event
   */
  logAgentLifecycle(
    actor: SecurityActor,
    action: 'spawned' | 'terminated' | 'completed' | 'failed',
    agentId: string,
    agentName: string,
    details: Record<string, unknown> = {}
  ): AuditEvent {
    return this.log('agent_lifecycle', `agent_${action}`, actor, {
      agentId,
      agentName,
      ...details,
    }, {
      outcome: action === 'failed' ? 'failure' : 'success',
      severity: action === 'failed' ? 'warning' : 'info',
      target: { type: 'agent', id: agentId, name: agentName },
    });
  }

  /**
   * Log resource event
   */
  logResourceEvent(
    actor: SecurityActor,
    action: string,
    resourceType: string,
    details: Record<string, unknown> = {}
  ): AuditEvent {
    return this.log('resource', action, actor, {
      resourceType,
      ...details,
    }, {
      severity: 'info',
      outcome: 'success',
    });
  }

  /**
   * Log configuration change
   */
  logConfigChange(
    actor: SecurityActor,
    configType: string,
    changes: Record<string, unknown>
  ): AuditEvent {
    return this.log('configuration', 'config_changed', actor, {
      configType,
      changes,
    }, {
      severity: 'info',
      outcome: 'success',
    });
  }

  /**
   * Start a correlated operation
   */
  startCorrelation(actor: SecurityActor, operation: string): string {
    const correlationId = randomUUID();
    
    this.log('tool_lifecycle', 'correlation_started', actor, {
      operation,
    }, {
      correlationId,
      severity: 'info',
      outcome: 'success',
    });

    return correlationId;
  }

  /**
   * End a correlated operation
   */
  endCorrelation(
    correlationId: string,
    actor: SecurityActor,
    outcome: AuditEvent['outcome'],
    summary: Record<string, unknown> = {}
  ): void {
    const events = this.correlationMap.get(correlationId) || [];
    
    this.log('tool_lifecycle', 'correlation_ended', actor, {
      correlationId,
      eventCount: events.length,
      ...summary,
    }, {
      correlationId,
      outcome,
      severity: outcome === 'failure' ? 'warning' : 'info',
    });
  }

  /**
   * Query audit events
   */
  query(options: AuditQueryOptions = {}): AuditEvent[] {
    let results = [...this.events];

    // Apply filters
    if (options.category) {
      results = results.filter(e => e.category === options.category);
    }
    if (options.action) {
      results = results.filter(e => e.action === options.action);
    }
    if (options.severity) {
      results = results.filter(e => e.severity === options.severity);
    }
    if (options.outcome) {
      results = results.filter(e => e.outcome === options.outcome);
    }
    if (options.actorSessionId) {
      results = results.filter(e => e.actor.sessionId === options.actorSessionId);
    }
    if (options.targetType) {
      results = results.filter(e => e.target?.type === options.targetType);
    }
    if (options.targetId) {
      results = results.filter(e => e.target?.id === options.targetId);
    }
    if (options.startTime) {
      results = results.filter(e => e.timestamp >= options.startTime!);
    }
    if (options.endTime) {
      results = results.filter(e => e.timestamp <= options.endTime!);
    }
    if (options.correlationId) {
      results = results.filter(e => e.correlationId === options.correlationId);
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || 100;
    results = results.slice(offset, offset + limit);

    return results;
  }

  /**
   * Get correlated events
   */
  getCorrelatedEvents(correlationId: string): AuditEvent[] {
    const eventIds = this.correlationMap.get(correlationId) || [];
    return this.events.filter(e => eventIds.includes(e.id));
  }

  /**
   * Get audit statistics
   */
  getStats(): AuditStats {
    const now = Date.now();
    const byCategory: Record<AuditCategory, number> = {
      tool_lifecycle: 0,
      tool_execution: 0,
      permission: 0,
      security: 0,
      compliance: 0,
      agent_lifecycle: 0,
      resource: 0,
      configuration: 0,
    };
    const bySeverity: Record<AuditSeverity, number> = {
      info: 0,
      warning: 0,
      error: 0,
      critical: 0,
    };
    const byOutcome: Record<string, number> = {
      success: 0,
      failure: 0,
      blocked: 0,
      pending: 0,
    };
    let last5Min = 0;
    let lastHour = 0;
    let last24Hours = 0;

    for (const event of this.events) {
      byCategory[event.category]++;
      bySeverity[event.severity]++;
      byOutcome[event.outcome]++;

      const age = now - event.timestamp;
      if (age <= 300000) last5Min++;
      if (age <= 3600000) lastHour++;
      if (age <= 86400000) last24Hours++;
    }

    // Get top actions
    const topActions = Array.from(this.actionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([action, count]) => ({ action, count }));

    return {
      totalEvents: this.events.length,
      byCategory,
      bySeverity,
      byOutcome,
      recentActivity: {
        last5Min,
        lastHour,
        last24Hours,
      },
      topActions,
    };
  }

  /**
   * Export events to JSON
   */
  export(options: AuditQueryOptions = {}): string {
    const events = this.query(options);
    return JSON.stringify({
      exportedAt: Date.now(),
      eventCount: events.length,
      events,
    }, null, 2);
  }

  /**
   * Clear all events
   */
  clear(): void {
    this.events = [];
    this.correlationMap.clear();
    this.actionCounts.clear();
    logger.info('Audit log cleared');
  }

  /**
   * Cleanup old events
   */
  cleanup(): number {
    const cutoff = Date.now() - this.config.retentionPeriodMs;
    const originalLength = this.events.length;
    
    this.events = this.events.filter(e => e.timestamp >= cutoff);
    
    // Clean up correlation map
    for (const [correlationId, eventIds] of this.correlationMap) {
      const validIds = eventIds.filter(id => this.events.some(e => e.id === id));
      if (validIds.length === 0) {
        this.correlationMap.delete(correlationId);
      } else {
        this.correlationMap.set(correlationId, validIds);
      }
    }

    const removed = originalLength - this.events.length;
    if (removed > 0) {
      logger.debug('Audit log cleanup completed', { removed });
    }

    return removed;
  }

  /**
   * Shutdown the audit logger
   */
  shutdown(): void {
    this.stopCleanupTimer();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private createEvent(
    category: AuditCategory,
    action: string,
    actor: SecurityActor,
    details: Record<string, unknown>,
    options: {
      severity?: AuditSeverity;
      outcome?: AuditEvent['outcome'];
      target?: AuditTarget;
      duration?: number;
      correlationId?: string;
      parentEventId?: string;
    }
  ): AuditEvent {
    return {
      id: randomUUID(),
      category,
      action,
      severity: options.severity || 'info',
      actor,
      target: options.target,
      details,
      outcome: options.outcome || 'success',
      timestamp: Date.now(),
      duration: options.duration,
      correlationId: options.correlationId,
      parentEventId: options.parentEventId,
    };
  }

  private shouldLog(severity: AuditSeverity): boolean {
    const levels: AuditSeverity[] = ['info', 'warning', 'error', 'critical'];
    return levels.indexOf(severity) >= levels.indexOf(this.config.minSeverity);
  }

  private logToConsole(event: AuditEvent): void {
    const logFn = event.severity === 'critical' || event.severity === 'error'
      ? logger.error
      : event.severity === 'warning'
        ? logger.warn
        : logger.debug;

    logFn.call(logger, `[AUDIT] ${event.category}:${event.action}`, {
      eventId: event.id,
      actor: event.actor.sessionId,
      outcome: event.outcome,
      ...(this.config.detailedLogging ? event.details : {}),
    });
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);
    if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      (this.cleanupTimer as NodeJS.Timeout).unref();
    }
  }

  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }
}

// Singleton instance
let auditLoggerInstance: AuditLogger | null = null;

/**
 * Get or create the audit logger singleton
 */
export function getAuditLogger(): AuditLogger {
  if (!auditLoggerInstance) {
    auditLoggerInstance = new AuditLogger();
  }
  return auditLoggerInstance;
}
