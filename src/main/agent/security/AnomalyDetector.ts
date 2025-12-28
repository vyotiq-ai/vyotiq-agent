/**
 * Anomaly Detector
 *
 * Detects unusual patterns in agent behavior that may indicate
 * security issues, abuse, or system problems.
 */
import type { SecurityEvent as _SecurityEvent } from '../../../shared/types';
import { createLogger } from '../../logger';
import { getSecurityAuditLog, type SecurityActor } from './SecurityAuditLog';
import { getRateLimiter as _getRateLimiter } from './RateLimiter';

// Re-export for potential external use
export type SecurityEvent = _SecurityEvent;
export const getRateLimiter = _getRateLimiter;

const logger = createLogger('AnomalyDetector');

/**
 * Anomaly types that can be detected
 */
export type AnomalyType =
  | 'excessive_tool_creation'
  | 'repeated_failures'
  | 'unusual_capability_requests'
  | 'rapid_execution'
  | 'resource_spike'
  | 'pattern_deviation';

/**
 * Anomaly detection thresholds
 */
export interface AnomalyThresholds {
  /** Max tool creations in 5 minutes before flagging */
  maxToolCreationsPer5Min: number;
  /** Max consecutive failures before flagging */
  maxConsecutiveFailures: number;
  /** Max capability denials in a session */
  maxCapabilityDenials: number;
  /** Max tool executions per second */
  maxExecutionsPerSecond: number;
  /** Standard deviation multiplier for pattern detection */
  patternDeviationThreshold: number;
}

/**
 * Default thresholds
 */
export const DEFAULT_THRESHOLDS: AnomalyThresholds = {
  maxToolCreationsPer5Min: 15,
  maxConsecutiveFailures: 5,
  maxCapabilityDenials: 10,
  maxExecutionsPerSecond: 10,
  patternDeviationThreshold: 3.0,
};

/**
 * Detected anomaly
 */
export interface DetectedAnomaly {
  /** Anomaly type */
  type: AnomalyType;
  /** Severity */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Description */
  description: string;
  /** Actor involved */
  actor: SecurityActor;
  /** When detected */
  detectedAt: number;
  /** Supporting evidence */
  evidence: Record<string, unknown>;
  /** Recommended action */
  recommendedAction: 'log' | 'alert' | 'rate_limit' | 'suspend';
}

/**
 * Actor behavior tracking
 */
interface ActorBehavior {
  toolCreations: number[];
  toolExecutions: number[];
  failures: number[];
  capabilityDenials: number;
  lastActivity: number;
  consecutiveFailures: number;
}

/**
 * Anomaly Detector class
 */
export class AnomalyDetector {
  private thresholds: AnomalyThresholds;
  private actorBehaviors = new Map<string, ActorBehavior>();
  private detectedAnomalies: DetectedAnomaly[] = [];
  private maxAnomalies = 500;

  constructor(thresholds?: Partial<AnomalyThresholds>) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * Get or create behavior tracking for an actor
   */
  private getActorBehavior(actorId: string): ActorBehavior {
    let behavior = this.actorBehaviors.get(actorId);
    if (!behavior) {
      behavior = {
        toolCreations: [],
        toolExecutions: [],
        failures: [],
        capabilityDenials: 0,
        lastActivity: Date.now(),
        consecutiveFailures: 0,
      };
      this.actorBehaviors.set(actorId, behavior);
    }
    return behavior;
  }

  /**
   * Clean old timestamps from an array
   */
  private cleanOldTimestamps(timestamps: number[], maxAgeMs: number): number[] {
    const cutoff = Date.now() - maxAgeMs;
    return timestamps.filter(t => t >= cutoff);
  }

  /**
   * Record a tool creation event
   */
  recordToolCreation(actor: SecurityActor): DetectedAnomaly | null {
    const behavior = this.getActorBehavior(actor.sessionId);
    const now = Date.now();

    // Clean and add new timestamp
    behavior.toolCreations = this.cleanOldTimestamps(behavior.toolCreations, 5 * 60 * 1000);
    behavior.toolCreations.push(now);
    behavior.lastActivity = now;

    // Check for excessive creation
    if (behavior.toolCreations.length > this.thresholds.maxToolCreationsPer5Min) {
      return this.recordAnomaly({
        type: 'excessive_tool_creation',
        severity: 'high',
        description: `${behavior.toolCreations.length} tool creations in 5 minutes (threshold: ${this.thresholds.maxToolCreationsPer5Min})`,
        actor,
        detectedAt: now,
        evidence: {
          creationCount: behavior.toolCreations.length,
          threshold: this.thresholds.maxToolCreationsPer5Min,
          recentTimestamps: behavior.toolCreations.slice(-10),
        },
        recommendedAction: 'rate_limit',
      });
    }

    return null;
  }

  /**
   * Record a tool execution event
   */
  recordToolExecution(actor: SecurityActor, success: boolean): DetectedAnomaly | null {
    const behavior = this.getActorBehavior(actor.sessionId);
    const now = Date.now();

    // Track execution rate
    behavior.toolExecutions = this.cleanOldTimestamps(behavior.toolExecutions, 1000);
    behavior.toolExecutions.push(now);
    behavior.lastActivity = now;

    // Track failures
    if (!success) {
      behavior.failures = this.cleanOldTimestamps(behavior.failures, 60 * 1000);
      behavior.failures.push(now);
      behavior.consecutiveFailures++;
    } else {
      behavior.consecutiveFailures = 0;
    }

    // Check for rapid execution
    if (behavior.toolExecutions.length > this.thresholds.maxExecutionsPerSecond) {
      return this.recordAnomaly({
        type: 'rapid_execution',
        severity: 'medium',
        description: `${behavior.toolExecutions.length} executions in 1 second (threshold: ${this.thresholds.maxExecutionsPerSecond})`,
        actor,
        detectedAt: now,
        evidence: {
          executionsPerSecond: behavior.toolExecutions.length,
          threshold: this.thresholds.maxExecutionsPerSecond,
        },
        recommendedAction: 'rate_limit',
      });
    }

    // Check for repeated failures
    if (behavior.consecutiveFailures >= this.thresholds.maxConsecutiveFailures) {
      return this.recordAnomaly({
        type: 'repeated_failures',
        severity: 'medium',
        description: `${behavior.consecutiveFailures} consecutive failures`,
        actor,
        detectedAt: now,
        evidence: {
          consecutiveFailures: behavior.consecutiveFailures,
          threshold: this.thresholds.maxConsecutiveFailures,
          recentFailures: behavior.failures.slice(-10),
        },
        recommendedAction: 'alert',
      });
    }

    return null;
  }

  /**
   * Record a capability denial
   */
  recordCapabilityDenial(actor: SecurityActor, capability: string): DetectedAnomaly | null {
    const behavior = this.getActorBehavior(actor.sessionId);
    behavior.capabilityDenials++;
    behavior.lastActivity = Date.now();

    if (behavior.capabilityDenials >= this.thresholds.maxCapabilityDenials) {
      return this.recordAnomaly({
        type: 'unusual_capability_requests',
        severity: 'high',
        description: `${behavior.capabilityDenials} capability denials in session`,
        actor,
        detectedAt: Date.now(),
        evidence: {
          denialCount: behavior.capabilityDenials,
          threshold: this.thresholds.maxCapabilityDenials,
          lastDeniedCapability: capability,
        },
        recommendedAction: 'suspend',
      });
    }

    return null;
  }

  /**
   * Record and store an anomaly
   */
  private recordAnomaly(anomaly: DetectedAnomaly): DetectedAnomaly {
    this.detectedAnomalies.push(anomaly);

    // Trim if over limit
    if (this.detectedAnomalies.length > this.maxAnomalies) {
      this.detectedAnomalies = this.detectedAnomalies.slice(-this.maxAnomalies);
    }

    // Log to security audit
    const auditLog = getSecurityAuditLog();
    auditLog.logAnomalyDetected(
      anomaly.actor,
      anomaly.type,
      anomaly.description,
      anomaly.severity
    );

    logger.warn('Anomaly detected', {
      type: anomaly.type,
      severity: anomaly.severity,
      actor: anomaly.actor.sessionId,
      recommendedAction: anomaly.recommendedAction,
    });

    return anomaly;
  }

  /**
   * Analyze recent events for patterns
   */
  analyzeRecentEvents(sessionId: string): DetectedAnomaly[] {
    const auditLog = getSecurityAuditLog();
    const events = auditLog.getSessionEvents(sessionId);
    const anomalies: DetectedAnomaly[] = [];

    if (events.length === 0) return anomalies;

    // Count event types
    const typeCounts = new Map<string, number>();
    const deniedCount = events.filter(e => e.outcome === 'denied').length;
    const highRiskCount = events.filter(e => e.riskLevel === 'high' || e.riskLevel === 'critical').length;

    for (const event of events) {
      typeCounts.set(event.type, (typeCounts.get(event.type) || 0) + 1);
    }

    // Check for pattern deviations
    const actor: SecurityActor = { sessionId };

    // High denial rate
    if (events.length > 10 && deniedCount / events.length > 0.5) {
      anomalies.push(this.recordAnomaly({
        type: 'pattern_deviation',
        severity: 'medium',
        description: `High denial rate: ${Math.round((deniedCount / events.length) * 100)}% of operations denied`,
        actor,
        detectedAt: Date.now(),
        evidence: {
          totalEvents: events.length,
          deniedEvents: deniedCount,
          denialRate: deniedCount / events.length,
        },
        recommendedAction: 'alert',
      }));
    }

    // High risk activity
    if (highRiskCount > 5) {
      anomalies.push(this.recordAnomaly({
        type: 'pattern_deviation',
        severity: 'high',
        description: `${highRiskCount} high-risk events in session`,
        actor,
        detectedAt: Date.now(),
        evidence: {
          highRiskCount,
          eventTypes: Object.fromEntries(typeCounts),
        },
        recommendedAction: 'alert',
      }));
    }

    return anomalies;
  }

  /**
   * Get anomalies for a session
   */
  getSessionAnomalies(sessionId: string): DetectedAnomaly[] {
    return this.detectedAnomalies.filter(a => a.actor.sessionId === sessionId);
  }

  /**
   * Get all recent anomalies
   */
  getRecentAnomalies(limit = 50): DetectedAnomaly[] {
    return this.detectedAnomalies
      .slice(-limit)
      .sort((a, b) => b.detectedAt - a.detectedAt);
  }

  /**
   * Check if an actor should be suspended
   */
  shouldSuspendActor(sessionId: string): boolean {
    const recentAnomalies = this.detectedAnomalies.filter(
      a =>
        a.actor.sessionId === sessionId &&
        a.detectedAt > Date.now() - 10 * 60 * 1000 // Last 10 minutes
    );

    // Suspend if multiple high/critical anomalies
    const criticalCount = recentAnomalies.filter(
      a => a.severity === 'critical' || a.recommendedAction === 'suspend'
    ).length;

    const highCount = recentAnomalies.filter(a => a.severity === 'high').length;

    return criticalCount >= 1 || highCount >= 3;
  }

  /**
   * Reset tracking for an actor
   */
  resetActor(sessionId: string): void {
    this.actorBehaviors.delete(sessionId);
    logger.debug('Actor behavior tracking reset', { sessionId });
  }

  /**
   * Clear all anomalies (for testing)
   */
  clearAll(): void {
    this.detectedAnomalies = [];
    this.actorBehaviors.clear();
    logger.info('Anomaly detector cleared');
  }

  /**
   * Get behavior summary for an actor
   */
  getActorBehaviorSummary(sessionId: string): {
    toolCreationsLast5Min: number;
    consecutiveFailures: number;
    capabilityDenials: number;
    lastActivity: number;
  } | null {
    const behavior = this.actorBehaviors.get(sessionId);
    if (!behavior) return null;

    return {
      toolCreationsLast5Min: this.cleanOldTimestamps(behavior.toolCreations, 5 * 60 * 1000).length,
      consecutiveFailures: behavior.consecutiveFailures,
      capabilityDenials: behavior.capabilityDenials,
      lastActivity: behavior.lastActivity,
    };
  }
}

// Singleton instance
let anomalyDetectorInstance: AnomalyDetector | null = null;

/**
 * Get or create the anomaly detector singleton
 */
export function getAnomalyDetector(): AnomalyDetector {
  if (!anomalyDetectorInstance) {
    anomalyDetectorInstance = new AnomalyDetector();
  }
  return anomalyDetectorInstance;
}
