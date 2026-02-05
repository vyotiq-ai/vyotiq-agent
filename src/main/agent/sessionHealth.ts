/**
 * Session Health Monitor
 * 
 * Monitors session health in real-time, tracking metrics like
 * token usage, iteration progress, and potential issues.
 */

import type { LLMProviderName, TokenUsage } from '../../shared/types';
import { lookupModelPricing } from '../../shared/providers/pricing';
import { createLogger } from '../logger';

const logger = createLogger('SessionHealth');

// =============================================================================
// Types
// =============================================================================

export interface SessionHealthStatus {
  /** Session ID */
  sessionId: string;
  /** Overall health status */
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  /** Health score (0-100) */
  healthScore: number;
  /** Current iteration */
  currentIteration: number;
  /** Maximum iterations allowed */
  maxIterations: number;
  /** Iteration progress (0-1) */
  iterationProgress: number;
  /** Token usage metrics */
  tokenUsage: {
    totalInput: number;
    totalOutput: number;
    estimatedCost: number;
    utilizationPercent: number;
  };
  /** Active issues */
  issues: SessionHealthIssue[];
  /** Recommendations */
  recommendations: string[];
  /** Last updated timestamp */
  lastUpdated: number;
}

export interface SessionHealthIssue {
  /** Issue type */
  type: 'loop-detected' | 'high-token-usage' | 'slow-response' | 'compliance-violation' | 'approaching-limit' | 'stalled';
  /** Severity level */
  severity: 'info' | 'warning' | 'error';
  /** Human-readable message */
  message: string;
  /** When the issue was detected */
  detectedAt: number;
  /** Additional context */
  context?: Record<string, unknown>;
}

export interface SessionHealthConfig {
  /** Token usage warning threshold (0-1) */
  tokenUsageWarningThreshold: number;
  /** Token usage critical threshold (0-1) */
  tokenUsageCriticalThreshold: number;
  /** Iteration warning threshold (0-1) */
  iterationWarningThreshold: number;
  /** Stall detection timeout (ms) */
  stallTimeoutMs: number;
  /** Slow response threshold (ms) */
  slowResponseThresholdMs: number;
}

interface SessionHealthState {
  sessionId: string;
  runId?: string;
  provider?: LLMProviderName;
  modelId?: string;
  startedAt: number;
  lastActivityAt: number;
  currentIteration: number;
  maxIterations: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  maxContextTokens: number;
  issues: SessionHealthIssue[];
  iterationTimes: number[];
  lastIterationStartedAt?: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

export const DEFAULT_SESSION_HEALTH_CONFIG: SessionHealthConfig = {
  tokenUsageWarningThreshold: 0.85,   // Increased - more tolerance for large contexts
  tokenUsageCriticalThreshold: 0.97,  // Increased - allow more context usage
  iterationWarningThreshold: 0.90,    // Increased - more tolerance for complex tasks
  stallTimeoutMs: 300000, // 5 minutes - longer timeout for complex operations
  slowResponseThresholdMs: 90000, // 90 seconds - more tolerance for slow responses
};

// =============================================================================
// Session Health Monitor
// =============================================================================

export class SessionHealthMonitor {
  private config: SessionHealthConfig;
  private sessions = new Map<string, SessionHealthState>();
  private eventEmitter?: (event: { type: string; sessionId: string; data: unknown }) => void;

  constructor(config: Partial<SessionHealthConfig> = {}) {
    this.config = { ...DEFAULT_SESSION_HEALTH_CONFIG, ...config };
  }

  /**
   * Set event emitter for health updates
   */
  setEventEmitter(emitter: (event: { type: string; sessionId: string; data: unknown }) => void): void {
    this.eventEmitter = emitter;
  }

  /**
   * Start monitoring a session
   */
  startMonitoring(
    sessionId: string,
    runId: string,
    provider: LLMProviderName,
    modelId: string,
    maxIterations: number,
    maxContextTokens: number
  ): void {
    const now = Date.now();
    this.sessions.set(sessionId, {
      sessionId,
      runId,
      provider,
      modelId,
      startedAt: now,
      lastActivityAt: now,
      currentIteration: 0,
      maxIterations,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      maxContextTokens,
      issues: [],
      iterationTimes: [],
    });

    logger.debug('Session monitoring started', { sessionId, runId, provider, modelId });
  }

  /**
   * Update iteration progress
   */
  updateIteration(sessionId: string, iteration: number): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;

    const now = Date.now();
    
    // Record iteration time if we have a start time
    if (state.lastIterationStartedAt) {
      const iterationTime = now - state.lastIterationStartedAt;
      state.iterationTimes.push(iterationTime);
      
      // Check for slow response
      if (iterationTime > this.config.slowResponseThresholdMs) {
        this.addIssue(state, {
          type: 'slow-response',
          severity: 'warning',
          message: `Iteration ${iteration} took ${Math.round(iterationTime / 1000)}s`,
          detectedAt: now,
          context: { iterationTime, iteration },
        });
      }
    }

    state.currentIteration = iteration;
    state.lastActivityAt = now;
    state.lastIterationStartedAt = now;

    // Check for approaching iteration limit
    const progress = iteration / state.maxIterations;
    if (progress >= this.config.iterationWarningThreshold) {
      this.addIssue(state, {
        type: 'approaching-limit',
        severity: progress >= 0.95 ? 'error' : 'warning',
        message: `Approaching iteration limit (${iteration}/${state.maxIterations})`,
        detectedAt: now,
        context: { iteration, maxIterations: state.maxIterations, progress },
      });
    }

    this.emitHealthUpdate(sessionId);
  }

  /**
   * Update token usage
   */
  updateTokenUsage(sessionId: string, usage: TokenUsage): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;

    // usage.input represents the total tokens in the current request (including history)
    // So we track the latest value, not accumulate it
    state.totalInputTokens = usage.input;
    state.totalOutputTokens += usage.output;
    state.lastActivityAt = Date.now();

    // Check token usage thresholds - use current context size, not accumulated
    const utilization = state.totalInputTokens / state.maxContextTokens;
    
    if (utilization >= this.config.tokenUsageCriticalThreshold) {
      this.addIssue(state, {
        type: 'high-token-usage',
        severity: 'error',
        message: `Critical token usage: ${Math.round(utilization * 100)}% of context window`,
        detectedAt: Date.now(),
        context: { utilization, totalTokens: state.totalInputTokens, maxTokens: state.maxContextTokens },
      });
    } else if (utilization >= this.config.tokenUsageWarningThreshold) {
      this.addIssue(state, {
        type: 'high-token-usage',
        severity: 'warning',
        message: `High token usage: ${Math.round(utilization * 100)}% of context window`,
        detectedAt: Date.now(),
        context: { utilization, totalTokens: state.totalInputTokens, maxTokens: state.maxContextTokens },
      });
    }

    this.emitHealthUpdate(sessionId);
  }

  /**
   * Record a detected loop
   */
  recordLoopDetected(sessionId: string, loopType: string, involvedTools: string[]): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;

    this.addIssue(state, {
      type: 'loop-detected',
      severity: 'error',
      message: `Loop detected: ${loopType}`,
      detectedAt: Date.now(),
      context: { loopType, involvedTools },
    });

    this.emitHealthUpdate(sessionId);
  }

  /**
   * Record a compliance violation
   */
  recordComplianceViolation(sessionId: string, violationType: string, message: string): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;

    this.addIssue(state, {
      type: 'compliance-violation',
      severity: 'warning',
      message: `Compliance: ${message}`,
      detectedAt: Date.now(),
      context: { violationType },
    });

    this.emitHealthUpdate(sessionId);
  }

  /**
   * Check for stalled sessions
   */
  checkForStalls(): string[] {
    const stalledSessions: string[] = [];
    const now = Date.now();

    for (const [sessionId, state] of this.sessions) {
      if (now - state.lastActivityAt > this.config.stallTimeoutMs) {
        this.addIssue(state, {
          type: 'stalled',
          severity: 'error',
          message: `Session stalled for ${Math.round((now - state.lastActivityAt) / 1000)}s`,
          detectedAt: now,
          context: { lastActivityAt: state.lastActivityAt, stallDuration: now - state.lastActivityAt },
        });
        stalledSessions.push(sessionId);
        this.emitHealthUpdate(sessionId);
      }
    }

    return stalledSessions;
  }

  /**
   * Get health status for a session
   */
  getHealthStatus(sessionId: string): SessionHealthStatus {
    const state = this.sessions.get(sessionId);
    
    if (!state) {
      return {
        sessionId,
        status: 'unknown',
        healthScore: 0,
        currentIteration: 0,
        maxIterations: 0,
        iterationProgress: 0,
        tokenUsage: {
          totalInput: 0,
          totalOutput: 0,
          estimatedCost: 0,
          utilizationPercent: 0,
        },
        issues: [],
        recommendations: [],
        lastUpdated: Date.now(),
      };
    }

    const iterationProgress = state.currentIteration / state.maxIterations;
    const tokenUtilization = state.maxContextTokens > 0 
      ? state.totalInputTokens / state.maxContextTokens 
      : 0;

    // Calculate health score
    const healthScore = this.calculateHealthScore(state);
    
    // Determine status
    let status: SessionHealthStatus['status'] = 'healthy';
    const errorIssues = state.issues.filter(i => i.severity === 'error');
    const warningIssues = state.issues.filter(i => i.severity === 'warning');
    
    if (errorIssues.length > 0) {
      status = 'critical';
    } else if (warningIssues.length > 0 || healthScore < 70) {
      status = 'warning';
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(state);

    return {
      sessionId,
      status,
      healthScore,
      currentIteration: state.currentIteration,
      maxIterations: state.maxIterations,
      iterationProgress,
      tokenUsage: {
        totalInput: state.totalInputTokens,
        totalOutput: state.totalOutputTokens,
        estimatedCost: this.estimateCost(state),
        utilizationPercent: Math.round(tokenUtilization * 100),
      },
      issues: state.issues.slice(-10), // Last 10 issues
      recommendations,
      lastUpdated: state.lastActivityAt,
    };
  }

  /**
   * Stop monitoring a session
   */
  stopMonitoring(sessionId: string): void {
    this.sessions.delete(sessionId);
    logger.debug('Session monitoring stopped', { sessionId });
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Check if a session should be stopped due to critical issues.
   * Returns true if there are unrecoverable issues that warrant stopping execution.
   */
  shouldStopRun(sessionId: string): { shouldStop: boolean; reason?: string } {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { shouldStop: false };
    }

    // Check for recent critical issues (within last 180 seconds - increased from 120)
    const recentCriticalIssues = state.issues.filter(
      i => i.severity === 'error' && Date.now() - i.detectedAt < 180000
    );

    // Stop if there are multiple loop detections (require 5+ instead of 4)
    const loopIssues = recentCriticalIssues.filter(i => i.type === 'loop-detected');
    if (loopIssues.length >= 5) {
      return {
        shouldStop: true,
        reason: `Multiple loops detected: ${loopIssues.map(i => i.message).join('; ')}`,
      };
    }

    // Stop if token usage is critically high (over 400% - increased from 300%)
    const tokenUtilization = state.maxContextTokens > 0
      ? state.totalInputTokens / state.maxContextTokens
      : 0;
    if (tokenUtilization > 4.0) {
      return {
        shouldStop: true,
        reason: `Token usage critically high: ${Math.round(tokenUtilization * 100)}% of context window`,
      };
    }

    // Stop if session has been stalled for extended period
    const stallIssues = recentCriticalIssues.filter(i => i.type === 'stalled');
    if (stallIssues.length > 0) {
      return {
        shouldStop: true,
        reason: stallIssues[0].message,
      };
    }

    return { shouldStop: false };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private addIssue(state: SessionHealthState, issue: SessionHealthIssue): void {
    // Avoid duplicate issues of the same type within 30 seconds
    const recentSameType = state.issues.find(
      i => i.type === issue.type && Date.now() - i.detectedAt < 30000
    );
    
    if (!recentSameType) {
      state.issues.push(issue);
      
      // Keep only last 50 issues
      if (state.issues.length > 50) {
        state.issues = state.issues.slice(-50);
      }

      logger.warn('Session health issue detected', {
        sessionId: state.sessionId,
        issue: issue.type,
        severity: issue.severity,
        message: issue.message,
      });
    }
  }

  private calculateHealthScore(state: SessionHealthState): number {
    let score = 100;

    // Deduct for iteration progress
    const iterationProgress = state.currentIteration / state.maxIterations;
    if (iterationProgress > 0.9) score -= 30;
    else if (iterationProgress > 0.7) score -= 15;
    else if (iterationProgress > 0.5) score -= 5;

    // Deduct for token usage
    const tokenUtilization = state.maxContextTokens > 0 
      ? state.totalInputTokens / state.maxContextTokens 
      : 0;
    if (tokenUtilization > 0.9) score -= 25;
    else if (tokenUtilization > 0.7) score -= 10;

    // Deduct for issues
    const recentIssues = state.issues.filter(
      i => Date.now() - i.detectedAt < 300000 // Last 5 minutes
    );
    
    for (const issue of recentIssues) {
      if (issue.severity === 'error') score -= 15;
      else if (issue.severity === 'warning') score -= 5;
    }

    // Deduct for slow iterations
    if (state.iterationTimes.length > 0) {
      const avgTime = state.iterationTimes.reduce((a, b) => a + b, 0) / state.iterationTimes.length;
      if (avgTime > this.config.slowResponseThresholdMs) score -= 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  private generateRecommendations(state: SessionHealthState): string[] {
    const recommendations: string[] = [];

    const iterationProgress = state.currentIteration / state.maxIterations;
    const tokenUtilization = state.maxContextTokens > 0 
      ? state.totalInputTokens / state.maxContextTokens 
      : 0;

    if (iterationProgress > 0.8) {
      recommendations.push('Consider increasing max iterations or breaking the task into smaller parts');
    }

    if (tokenUtilization > 0.8) {
      recommendations.push('Context window is nearly full. Consider starting a new session or enabling summarization');
    }

    const loopIssues = state.issues.filter(i => i.type === 'loop-detected');
    if (loopIssues.length > 0) {
      recommendations.push('Loop detected. Try providing more specific instructions or constraints');
    }

    const complianceIssues = state.issues.filter(i => i.type === 'compliance-violation');
    if (complianceIssues.length > 2) {
      recommendations.push('Multiple compliance issues detected. The model may need clearer guidance');
    }

    if (state.iterationTimes.length > 3) {
      const avgTime = state.iterationTimes.reduce((a, b) => a + b, 0) / state.iterationTimes.length;
      if (avgTime > 20000) {
        recommendations.push('Responses are slow. Consider using a faster model or simplifying the task');
      }
    }

    return recommendations;
  }

  private estimateCost(state: SessionHealthState): number {
    // Use actual pricing from shared pricing lookup
    const pricing = state.modelId 
      ? lookupModelPricing(state.modelId)
      : { inputPerMillion: 1, outputPerMillion: 4 }; // Conservative fallback
    
    const inputCost = (state.totalInputTokens / 1_000_000) * pricing.inputPerMillion;
    const outputCost = (state.totalOutputTokens / 1_000_000) * pricing.outputPerMillion;
    return Math.round((inputCost + outputCost) * 10000) / 10000;
  }

  private emitHealthUpdate(sessionId: string): void {
    if (this.eventEmitter) {
      const status = this.getHealthStatus(sessionId);
      this.eventEmitter({
        type: 'session-health-update',
        sessionId,
        data: status,
      });
    }
  }

  // ===========================================================================
  // Multi-Session Workspace Health Aggregation
  // ===========================================================================

  /**
   * Get aggregated health status for all sessions in a workspace.
   * Useful for workspace-level resource monitoring when multiple sessions run concurrently.
   */
  getWorkspaceHealth(workspaceId: string, workspaceSessionIds: string[]): WorkspaceHealthStatus {
    const sessionHealthStatuses: SessionHealthStatus[] = [];
    let aggregateIssueCount = 0;
    let aggregateHealthScore = 0;
    let totalTokensUsed = 0;
    let totalCost = 0;
    let activeSessions = 0;

    for (const sessionId of workspaceSessionIds) {
      const status = this.getHealthStatus(sessionId);
      if (status.status !== 'unknown') {
        sessionHealthStatuses.push(status);
        aggregateIssueCount += status.issues.length;
        aggregateHealthScore += status.healthScore;
        totalTokensUsed += status.tokenUsage.totalInput + status.tokenUsage.totalOutput;
        totalCost += status.tokenUsage.estimatedCost;
        activeSessions++;
      }
    }

    // Calculate average health score (or 100 if no active sessions)
    const averageHealthScore = activeSessions > 0 
      ? Math.round(aggregateHealthScore / activeSessions)
      : 100;

    // Determine overall workspace status based on session statuses
    let workspaceStatus: 'healthy' | 'warning' | 'critical' | 'unknown' = 'healthy';
    const criticalCount = sessionHealthStatuses.filter(s => s.status === 'critical').length;
    const warningCount = sessionHealthStatuses.filter(s => s.status === 'warning').length;

    if (criticalCount > 0) {
      workspaceStatus = 'critical';
    } else if (warningCount > 0 || averageHealthScore < 70) {
      workspaceStatus = 'warning';
    } else if (activeSessions === 0) {
      workspaceStatus = 'unknown';
    }

    // Collect all unique recommendations across sessions
    const allRecommendations = new Set<string>();
    for (const status of sessionHealthStatuses) {
      for (const rec of status.recommendations) {
        allRecommendations.add(rec);
      }
    }

    return {
      workspaceId,
      status: workspaceStatus,
      averageHealthScore,
      activeSessions,
      totalSessions: workspaceSessionIds.length,
      totalIssues: aggregateIssueCount,
      totalTokensUsed,
      estimatedTotalCost: Math.round(totalCost * 10000) / 10000,
      sessionStatuses: sessionHealthStatuses,
      recommendations: Array.from(allRecommendations).slice(0, 5), // Top 5 recommendations
      lastUpdated: Date.now(),
    };
  }

  /**
   * Check all active sessions for stalls and return session IDs that have stalled.
   * This can be called periodically by the orchestrator for proactive health monitoring.
   */
  getStallingSessions(): Array<{ sessionId: string; stalledDuration: number }> {
    const stalling: Array<{ sessionId: string; stalledDuration: number }> = [];
    const now = Date.now();

    for (const [sessionId, state] of this.sessions) {
      const stalledDuration = now - state.lastActivityAt;
      if (stalledDuration > this.config.stallTimeoutMs) {
        stalling.push({ sessionId, stalledDuration });
      }
    }

    return stalling;
  }
}

// =============================================================================
// Workspace Health Status Type
// =============================================================================

export interface WorkspaceHealthStatus {
  /** Workspace ID */
  workspaceId: string;
  /** Overall workspace health status */
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  /** Average health score across all sessions (0-100) */
  averageHealthScore: number;
  /** Number of currently active/monitored sessions */
  activeSessions: number;
  /** Total number of sessions in workspace */
  totalSessions: number;
  /** Total issues across all sessions */
  totalIssues: number;
  /** Total tokens used across all sessions */
  totalTokensUsed: number;
  /** Estimated total cost across all sessions */
  estimatedTotalCost: number;
  /** Individual session health statuses */
  sessionStatuses: SessionHealthStatus[];
  /** Combined recommendations across sessions */
  recommendations: string[];
  /** Last update timestamp */
  lastUpdated: number;
}

// =============================================================================
// Singleton Instance
// =============================================================================

let healthMonitorInstance: SessionHealthMonitor | null = null;

export function getSessionHealthMonitor(): SessionHealthMonitor {
  if (!healthMonitorInstance) {
    healthMonitorInstance = new SessionHealthMonitor();
  }
  return healthMonitorInstance;
}

export function initSessionHealthMonitor(config?: Partial<SessionHealthConfig>): SessionHealthMonitor {
  healthMonitorInstance = new SessionHealthMonitor(config);
  return healthMonitorInstance;
}
