/**
 * Security Audit Log
 *
 * Comprehensive logging of security-relevant events for the autonomous system.
 * Provides audit trail for tool creation, execution, capability requests, and violations.
 */
import { randomUUID } from 'node:crypto';
import type {
  SecurityEvent,
  SecurityEventType,
  SecurityViolation,
  ToolRiskLevel,
} from '../../../shared/types';
import { createLogger } from '../../logger';

const logger = createLogger('SecurityAuditLog');

/**
 * Actor information for security events
 */
export interface SecurityActor {
  sessionId: string;
  agentId?: string;
  runId?: string;
}

/**
 * Options for querying audit logs
 */
export interface AuditLogQuery {
  /** Filter by event types */
  types?: SecurityEventType[];
  /** Filter by actor session */
  sessionId?: string;
  /** Filter by outcome */
  outcome?: 'allowed' | 'denied' | 'flagged';
  /** Filter by risk level */
  riskLevel?: SecurityEvent['riskLevel'];
  /** Filter by time range start */
  startTime?: number;
  /** Filter by time range end */
  endTime?: number;
  /** Maximum results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Audit log statistics
 */
export interface AuditLogStats {
  /** Total events logged */
  totalEvents: number;
  /** Events by type */
  eventsByType: Record<SecurityEventType, number>;
  /** Events by outcome */
  eventsByOutcome: Record<string, number>;
  /** Events by risk level */
  eventsByRisk: Record<string, number>;
  /** Violations count */
  totalViolations: number;
  /** Time range covered */
  timeRange: {
    earliest: number;
    latest: number;
  };
}

/**
 * Security Audit Log class
 */
export class SecurityAuditLog {
  private events: SecurityEvent[] = [];
  private violations: SecurityViolation[] = [];
  private maxEvents = 10000; // Limit in-memory events
  private maxViolations = 1000;

  /**
   * Log a security event
   */
  logEvent(
    type: SecurityEventType,
    actor: SecurityActor,
    details: SecurityEvent['details'],
    outcome: SecurityEvent['outcome'],
    riskLevel: SecurityEvent['riskLevel'] = 'low'
  ): SecurityEvent {
    const event: SecurityEvent = {
      id: randomUUID(),
      type,
      timestamp: Date.now(),
      actor,
      details,
      outcome,
      riskLevel,
    };

    this.events.push(event);

    // Trim if over limit
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Log to main logger as well
    const logLevel = riskLevel === 'critical' || riskLevel === 'high' ? 'warn' : 'debug';
    logger[logLevel]('Security event', {
      type,
      outcome,
      riskLevel,
      sessionId: actor.sessionId,
      ...details,
    });

    return event;
  }

  /**
   * Log a tool creation attempt
   */
  logToolCreationAttempt(
    actor: SecurityActor,
    toolName: string,
    riskLevel: ToolRiskLevel,
    outcome: SecurityEvent['outcome'],
    reason?: string
  ): SecurityEvent {
    return this.logEvent(
      outcome === 'allowed' ? 'tool_creation_success' : 
        outcome === 'denied' ? 'tool_creation_denied' : 'tool_creation_attempt',
      actor,
      { toolName, riskLevel, reason },
      outcome,
      riskLevel === 'dangerous' ? 'high' : riskLevel === 'moderate' ? 'medium' : 'low'
    );
  }

  /**
   * Log a tool execution attempt
   */
  logToolExecution(
    actor: SecurityActor,
    toolName: string,
    toolId: string | undefined,
    isDynamic: boolean,
    outcome: SecurityEvent['outcome'],
    reason?: string
  ): SecurityEvent {
    return this.logEvent(
      outcome === 'allowed' ? 'tool_execution_success' :
        outcome === 'denied' ? 'tool_execution_denied' : 'tool_execution_attempt',
      actor,
      { toolName, toolId, isDynamic, reason },
      outcome,
      isDynamic ? 'medium' : 'low'
    );
  }

  /**
   * Log a capability request
   */
  logCapabilityRequest(
    actor: SecurityActor,
    capability: string,
    toolName: string,
    outcome: SecurityEvent['outcome'],
    reason?: string
  ): SecurityEvent {
    return this.logEvent(
      outcome === 'denied' ? 'capability_denied' : 'capability_request',
      actor,
      { capability, toolName, reason },
      outcome,
      capability === 'terminal' || capability === 'network' ? 'high' : 'medium'
    );
  }

  /**
   * Log a rate limit hit
   */
  logRateLimitHit(
    actor: SecurityActor,
    bucket: string,
    count: number,
    max: number
  ): SecurityEvent {
    return this.logEvent(
      'rate_limit_hit',
      actor,
      { bucket, count, max },
      'denied',
      'medium'
    );
  }

  /**
   * Log a validation failure
   */
  logValidationFailure(
    actor: SecurityActor,
    toolName: string,
    validationType: string,
    reason: string
  ): SecurityEvent {
    return this.logEvent(
      'validation_failure',
      actor,
      { toolName, validationType, reason },
      'denied',
      'medium'
    );
  }

  /**
   * Log a sandbox violation
   */
  logSandboxViolation(
    actor: SecurityActor,
    toolName: string,
    violationType: string,
    details: string
  ): SecurityEvent {
    return this.logEvent(
      'sandbox_violation',
      actor,
      { toolName, violationType, details },
      'denied',
      'high'
    );
  }

  /**
   * Log an anomaly detection
   */
  logAnomalyDetected(
    actor: SecurityActor,
    anomalyType: string,
    description: string,
    severity: 'low' | 'medium' | 'high' | 'critical'
  ): SecurityEvent {
    return this.logEvent(
      'anomaly_detected',
      actor,
      { anomalyType, description },
      'flagged',
      severity
    );
  }

  /**
   * Record a security violation
   */
  recordViolation(
    type: SecurityViolation['type'],
    severity: SecurityViolation['severity'],
    description: string,
    relatedEventId?: string,
    actionTaken: SecurityViolation['actionTaken'] = 'logged'
  ): SecurityViolation {
    const violation: SecurityViolation = {
      id: randomUUID(),
      type,
      severity,
      description,
      detectedAt: Date.now(),
      relatedEventId,
      actionTaken,
    };

    this.violations.push(violation);

    // Trim if over limit
    if (this.violations.length > this.maxViolations) {
      this.violations = this.violations.slice(-this.maxViolations);
    }

    logger.warn('Security violation recorded', {
      id: violation.id,
      type: violation.type,
      severity: violation.severity,
      description: violation.description,
    });

    return violation;
  }

  /**
   * Query events
   */
  queryEvents(query: AuditLogQuery = {}): SecurityEvent[] {
    let results = [...this.events];

    // Apply filters
    if (query.types && query.types.length > 0) {
      results = results.filter(e => query.types!.includes(e.type));
    }
    if (query.sessionId) {
      results = results.filter(e => e.actor.sessionId === query.sessionId);
    }
    if (query.outcome) {
      results = results.filter(e => e.outcome === query.outcome);
    }
    if (query.riskLevel) {
      results = results.filter(e => e.riskLevel === query.riskLevel);
    }
    if (query.startTime) {
      results = results.filter(e => e.timestamp >= query.startTime!);
    }
    if (query.endTime) {
      results = results.filter(e => e.timestamp <= query.endTime!);
    }

    // Sort by timestamp descending (newest first)
    results.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100;
    results = results.slice(offset, offset + limit);

    return results;
  }

  /**
   * Query violations
   */
  queryViolations(
    type?: SecurityViolation['type'],
    severity?: SecurityViolation['severity'],
    limit = 100
  ): SecurityViolation[] {
    let results = [...this.violations];

    if (type) {
      results = results.filter(v => v.type === type);
    }
    if (severity) {
      results = results.filter(v => v.severity === severity);
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.detectedAt - a.detectedAt);

    return results.slice(0, limit);
  }

  /**
   * Get statistics
   */
  getStats(): AuditLogStats {
    const eventsByType = {} as Record<SecurityEventType, number>;
    const eventsByOutcome = { allowed: 0, denied: 0, flagged: 0 };
    const eventsByRisk = { low: 0, medium: 0, high: 0, critical: 0 };
    let earliest = Infinity;
    let latest = 0;

    for (const event of this.events) {
      // Count by type
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      
      // Count by outcome
      eventsByOutcome[event.outcome]++;
      
      // Count by risk
      eventsByRisk[event.riskLevel]++;
      
      // Track time range
      if (event.timestamp < earliest) earliest = event.timestamp;
      if (event.timestamp > latest) latest = event.timestamp;
    }

    return {
      totalEvents: this.events.length,
      eventsByType,
      eventsByOutcome,
      eventsByRisk,
      totalViolations: this.violations.length,
      timeRange: {
        earliest: earliest === Infinity ? 0 : earliest,
        latest,
      },
    };
  }

  /**
   * Get events for a specific session
   */
  getSessionEvents(sessionId: string): SecurityEvent[] {
    return this.queryEvents({ sessionId, limit: 1000 });
  }

  /**
   * Check if there are recent high-risk events for an actor
   */
  hasRecentHighRiskEvents(
    actor: SecurityActor,
    windowMs = 60 * 1000
  ): boolean {
    const cutoff = Date.now() - windowMs;
    return this.events.some(
      e =>
        e.actor.sessionId === actor.sessionId &&
        e.timestamp >= cutoff &&
        (e.riskLevel === 'high' || e.riskLevel === 'critical')
    );
  }

  /**
   * Get violation count for an actor
   */
  getActorViolationCount(sessionId: string): number {
    // Find events that are violations
    return this.events.filter(
      e =>
        e.actor.sessionId === sessionId &&
        e.outcome === 'denied' &&
        (e.type.includes('violation') || e.type.includes('denied'))
    ).length;
  }

  /**
   * Clear old events (for maintenance)
   */
  clearOldEvents(beforeTimestamp: number): number {
    const originalLength = this.events.length;
    this.events = this.events.filter(e => e.timestamp >= beforeTimestamp);
    const cleared = originalLength - this.events.length;
    logger.info('Cleared old security events', { cleared, before: beforeTimestamp });
    return cleared;
  }

  /**
   * Clear all events (for testing)
   */
  clearAll(): void {
    this.events = [];
    this.violations = [];
    logger.info('Security audit log cleared');
  }

  /**
   * Export events to JSON
   */
  exportEvents(): string {
    return JSON.stringify({
      events: this.events,
      violations: this.violations,
      exportedAt: Date.now(),
    }, null, 2);
  }
}

// Singleton instance
let securityAuditLogInstance: SecurityAuditLog | null = null;

/**
 * Get or create the security audit log singleton
 */
export function getSecurityAuditLog(): SecurityAuditLog {
  if (!securityAuditLogInstance) {
    securityAuditLogInstance = new SecurityAuditLog();
  }
  return securityAuditLogInstance;
}
