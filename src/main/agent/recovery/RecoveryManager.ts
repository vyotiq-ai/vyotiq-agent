/**
 * RecoveryManager
 *
 * Central coordinator for error recovery. Selects and executes appropriate
 * recovery strategies based on error classification and diagnostic info.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type {
  ClassifiedError,
  DiagnosticInfo,
  RecoveryStrategy,
  RecoveryAttempt,
  RecoveryOutcome as _RecoveryOutcome,
  CircuitBreakerConfig as _CircuitBreakerConfig,
  RecoveryManagerConfig,
  RecoveryDeps,
  UserAction,
} from './types';
import { DEFAULT_RECOVERY_MANAGER_CONFIG as _DEFAULT_RECOVERY_MANAGER_CONFIG } from './types';
import { ErrorClassifier } from './ErrorClassifier';
import { DiagnosticEngine } from './DiagnosticEngine';
import {
  ALL_STRATEGIES as _ALL_STRATEGIES,
  getStrategiesForCategory,
  RetryExecutor,
  FallbackExecutor,
  RollbackExecutor,
  ScaleDownExecutor,
  EscalateExecutor,
} from './strategies';

// Re-export for potential external use
export type RecoveryOutcome = _RecoveryOutcome;
export type CircuitBreakerConfig = _CircuitBreakerConfig;
export const DEFAULT_RECOVERY_MANAGER_CONFIG = _DEFAULT_RECOVERY_MANAGER_CONFIG;
export const ALL_STRATEGIES = _ALL_STRATEGIES;
import { createLogger } from '../../logger';

const logger = createLogger('RecoveryManager');

// =============================================================================
// Types
// =============================================================================

interface RecoverySession {
  id: string;
  error: ClassifiedError;
  diagnostic?: DiagnosticInfo;
  attempts: RecoveryAttempt[];
  startedAt: number;
  endedAt?: number;
  outcome?: 'recovered' | 'escalated' | 'failed' | 'cancelled';
  strategyUsed?: string;
}

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
  openedAt?: number;
}

// Event types for RecoveryManager (exported for external use)
export interface RecoveryEvents {
  'recovery-started': (session: RecoverySession) => void;
  'recovery-attempt': (attempt: RecoveryAttempt, session: RecoverySession) => void;
  'recovery-success': (session: RecoverySession) => void;
  'recovery-failed': (session: RecoverySession) => void;
  'recovery-escalated': (session: RecoverySession) => void;
  'circuit-opened': (key: string) => void;
  'circuit-closed': (key: string) => void;
}

// =============================================================================
// RecoveryManager
// =============================================================================

export class RecoveryManager extends EventEmitter {
  private readonly config: RecoveryManagerConfig;
  private readonly classifier: ErrorClassifier;
  private readonly diagnosticEngine: DiagnosticEngine;

  // Strategy executors
  private readonly retryExecutor: RetryExecutor;
  private readonly fallbackExecutor: FallbackExecutor;
  private readonly rollbackExecutor: RollbackExecutor;
  private readonly scaleDownExecutor: ScaleDownExecutor;
  private readonly escalateExecutor: EscalateExecutor;

  // State
  private sessions: Map<string, RecoverySession> = new Map();
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private readonly deps: RecoveryDeps;

  constructor(
    config: Partial<RecoveryManagerConfig> = {},
    deps?: Partial<RecoveryDeps>
  ) {
    super();

    this.config = {
      maxRecoveryAttempts: config.maxRecoveryAttempts ?? 5,
      recoveryTimeoutMs: config.recoveryTimeoutMs ?? 120000,
      enableCircuitBreaker: config.enableCircuitBreaker ?? true,
      circuitBreaker: {
        failureThreshold: config.circuitBreaker?.failureThreshold ?? 5,
        resetTimeoutMs: config.circuitBreaker?.resetTimeoutMs ?? 60000,
        halfOpenMaxAttempts: config.circuitBreaker?.halfOpenMaxAttempts ?? 1,
      },
      strategyPriorities: config.strategyPriorities ?? {
        retry: 1,
        fallback: 2,
        rollback: 3,
        'scale-down': 5,
        escalate: 10,
      },
      enableAutoRecovery: config.enableAutoRecovery ?? true,
      recordMetrics: config.recordMetrics ?? true,
    };

    this.deps = {
      logger: deps?.logger ?? logger,
      emitEvent: deps?.emitEvent ?? (() => {}),
      getSystemState: deps?.getSystemState ?? (() => ({})),
    };

    // Initialize classifier and diagnostic engine
    this.classifier = deps?.classifier ?? new ErrorClassifier(this.deps);
    this.diagnosticEngine = deps?.diagnosticEngine ?? new DiagnosticEngine(this.deps);

    // Initialize executors
    this.retryExecutor = new RetryExecutor(this.deps);
    this.fallbackExecutor = new FallbackExecutor(this.deps);
    this.rollbackExecutor = new RollbackExecutor(this.deps);
    this.scaleDownExecutor = new ScaleDownExecutor(this.deps);
    this.escalateExecutor = new EscalateExecutor(this.deps);
  }

  // ===========================================================================
  // Main Recovery Flow
  // ===========================================================================

  /**
   * Attempt to recover from an error
   */
  async recover<T>(
    error: Error,
    operation: () => Promise<T>,
    context: {
      operation?: string;
      toolName?: string;
      provider?: string;
      agentId?: string;
      runId?: string;
      [key: string]: unknown;
    } = {}
  ): Promise<{ success: boolean; result?: T; session: RecoverySession }> {
    // Classify the error
    const classified = this.classifier.classify(error, context);

    // Check circuit breaker
    const circuitKey = this.getCircuitKey(context);
    if (this.isCircuitOpen(circuitKey)) {
      this.deps.logger.warn('RecoveryManager: circuit breaker open', { key: circuitKey });
      const session = this.createSession(classified);
      session.outcome = 'failed';
      session.endedAt = Date.now();
      return { success: false, session };
    }

    // Run diagnostic
    const diagnostic = await this.diagnosticEngine.diagnose(classified);

    // Create recovery session
    const session = this.createSession(classified, diagnostic);
    this.emit('recovery-started', session);

    // Get applicable strategies
    const strategies = this.selectStrategies(classified, diagnostic);

    if (strategies.length === 0) {
      this.deps.logger.warn('RecoveryManager: no applicable strategies', {
        category: classified.category,
        severity: classified.severity,
      });
      session.outcome = 'failed';
      session.endedAt = Date.now();
      return { success: false, session };
    }

    // Try each strategy
    for (const strategy of strategies) {
      if (session.attempts.length >= this.config.maxRecoveryAttempts) {
        this.deps.logger.warn('RecoveryManager: max attempts reached');
        break;
      }

      try {
        const result = await this.executeStrategy(
          strategy,
          classified,
          diagnostic,
          operation,
          session
        );

        if (result.success) {
          session.outcome = 'recovered';
          session.strategyUsed = strategy.type;
          session.endedAt = Date.now();
          this.resetCircuit(circuitKey);
          this.emit('recovery-success', session);
          return { success: true, result: result.value, session };
        }
      } catch (strategyError) {
        this.deps.logger.error('RecoveryManager: strategy failed', {
          strategy: strategy.type,
          error: strategyError instanceof Error ? strategyError.message : String(strategyError),
        });
      }
    }

    // All strategies failed - escalate
    this.recordCircuitFailure(circuitKey);
    return this.handleEscalation(classified, diagnostic, session);
  }

  /**
   * Simplified recovery - just retry with backoff
   */
  async retryWithBackoff<T>(
    operation: () => Promise<T>,
    context: { maxAttempts?: number; operation?: string } = {}
  ): Promise<T> {
    // Create a simple classified error for retry executor
    const simpleError: ClassifiedError = {
      original: new Error('Retry context'),
      category: 'unknown',
      severity: 'low',
      isRetryable: true,
      maxRetries: context.maxAttempts ?? 3,
      context: {
        operation: context.operation,
        timestamp: Date.now(),
      },
    };

    const result = await this.retryExecutor.executeWithRetries(
      simpleError,
      operation
    );

    if (result.finalOutcome !== 'success') {
      const lastAttempt = result.attempts[result.attempts.length - 1];
      throw new Error(lastAttempt?.error ?? 'Retry failed');
    }

    return result.result as T;
  }

  /**
   * Execute with fallback provider
   */
  async withFallback<T>(
    operation: (provider: string) => Promise<T>,
    preferredProvider: string,
    options: {
      alternativeProviders?: string[];
      operation?: string;
    } = {}
  ): Promise<{ result: T; usedProvider: string }> {
    const providers = [preferredProvider, ...(options.alternativeProviders ?? [])];

    for (const provider of providers) {
      try {
        const result = await operation(provider);
        return { result, usedProvider: provider };
      } catch (error) {
        this.deps.logger.warn('RecoveryManager: provider failed, trying next', {
          provider,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw new Error('All providers failed');
  }

  // ===========================================================================
  // Strategy Execution
  // ===========================================================================

  private async executeStrategy<T>(
    strategy: RecoveryStrategy,
    error: ClassifiedError,
    diagnostic: DiagnosticInfo | undefined,
    operation: () => Promise<T>,
    session: RecoverySession
  ): Promise<{ success: boolean; value?: T }> {
    this.deps.logger.info('RecoveryManager: executing strategy', {
      strategy: strategy.type,
      sessionId: session.id,
    });

    switch (strategy.type) {
      case 'retry': {
        // RetryExecutor.execute(error, operation, attemptNumber?)
        const result = await this.retryExecutor.execute(error, operation);
        session.attempts.push(result.attempt);
        this.emit('recovery-attempt', result.attempt, session);
        return { success: result.attempt.outcome === 'success', value: result.result };
      }

      case 'fallback': {
        // For fallback, we need a fallback option. Create a simple one.
        const fallbackOption = {
          type: 'provider' as const,
          primary: 'current',
          alternative: 'fallback',
          description: error.original.message,
          isAvailable: true,
        };
        const result = await this.fallbackExecutor.execute(error, fallbackOption, operation);
        session.attempts.push(result.attempt);
        this.emit('recovery-attempt', result.attempt, session);
        return { success: result.attempt.outcome === 'success', value: result.result };
      }

      case 'rollback': {
        // For rollback, we need runId and rollback functions
        // Since we don't have these, we'll mark as skipped
        const attempt: RecoveryAttempt = {
          id: randomUUID(),
          strategy: 'rollback',
          attemptNumber: 1,
          startedAt: Date.now(),
          outcome: 'skipped',
          actionsTaken: ['Rollback skipped - no rollback context available'],
          endedAt: Date.now(),
          durationMs: 0,
        };
        session.attempts.push(attempt);
        this.emit('recovery-attempt', attempt, session);
        return { success: false };
      }

      case 'scale-down': {
        // For scale-down, we need actions and apply function
        // Since we don't have these, we'll mark as skipped
        const attempt: RecoveryAttempt = {
          id: randomUUID(),
          strategy: 'scale-down',
          attemptNumber: 1,
          startedAt: Date.now(),
          outcome: 'skipped',
          actionsTaken: ['Scale-down skipped - no scale-down context available'],
          endedAt: Date.now(),
          durationMs: 0,
        };
        session.attempts.push(attempt);
        this.emit('recovery-attempt', attempt, session);
        return { success: false };
      }

      case 'escalate': {
        // EscalateExecutor.execute(error, diagnostic?, getUserResponse?)
        const result = await this.escalateExecutor.execute(error, diagnostic);
        session.attempts.push(result.attempt);
        session.outcome = 'escalated';
        this.emit('recovery-attempt', result.attempt, session);
        this.emit('recovery-escalated', session);
        return { success: false };
      }

      default:
        return { success: false };
    }
  }

  // ===========================================================================
  // Strategy Selection
  // ===========================================================================

  private selectStrategies(
    error: ClassifiedError,
    diagnostic?: DiagnosticInfo
  ): RecoveryStrategy[] {
    // Get strategies for this error category
    const categoryStrategies = getStrategiesForCategory(error.category);

    // Filter by severity
    const severityFiltered = categoryStrategies.filter(
      s => s.applicableSeverities.includes(error.severity)
    );

    // Consider diagnostic suggestions
    let strategies = severityFiltered;
    if (diagnostic?.suggestedFixes) {
      // Prioritize strategies matching diagnostic suggestions
      const suggestedTypes = diagnostic.suggestedFixes.map(f => f.type);
      strategies = strategies.sort((a, b) => {
        const aMatch = suggestedTypes.includes(a.type as never) ? -1 : 0;
        const bMatch = suggestedTypes.includes(b.type as never) ? -1 : 0;
        return aMatch - bMatch || a.priority - b.priority;
      });
    }

    // Special handling
    if (error.category === 'transient' && error.isRetryable) {
      // Put retry first for transient errors
      strategies = strategies.sort((a, b) =>
        a.type === 'retry' ? -1 : b.type === 'retry' ? 1 : 0
      );
    }

    return strategies;
  }

  // ===========================================================================
  // Circuit Breaker
  // ===========================================================================

  private getCircuitKey(context: { operation?: string; provider?: string }): string {
    return `${context.operation ?? 'unknown'}:${context.provider ?? 'default'}`;
  }

  private isCircuitOpen(key: string): boolean {
    if (!this.config.enableCircuitBreaker) return false;

    const state = this.circuitBreakers.get(key);
    if (!state) return false;

    if (state.state === 'open') {
      // Check if reset timeout has passed
      const elapsed = Date.now() - (state.openedAt ?? 0);
      if (elapsed >= this.config.circuitBreaker.resetTimeoutMs) {
        state.state = 'half-open';
        return false;
      }
      return true;
    }

    return false;
  }

  private recordCircuitFailure(key: string): void {
    if (!this.config.enableCircuitBreaker) return;

    let state = this.circuitBreakers.get(key);
    if (!state) {
      state = { failures: 0, lastFailure: 0, state: 'closed' };
      this.circuitBreakers.set(key, state);
    }

    state.failures++;
    state.lastFailure = Date.now();

    if (state.failures >= this.config.circuitBreaker.failureThreshold) {
      state.state = 'open';
      state.openedAt = Date.now();
      this.emit('circuit-opened', key);
      this.deps.logger.warn('RecoveryManager: circuit breaker opened', { key });
    }
  }

  private resetCircuit(key: string): void {
    const state = this.circuitBreakers.get(key);
    if (state) {
      state.failures = 0;
      state.state = 'closed';
      state.openedAt = undefined;
      this.emit('circuit-closed', key);
    }
  }

  // ===========================================================================
  // Session Management
  // ===========================================================================

  private createSession(
    error: ClassifiedError,
    diagnostic?: DiagnosticInfo
  ): RecoverySession {
    const session: RecoverySession = {
      id: randomUUID(),
      error,
      diagnostic,
      attempts: [],
      startedAt: Date.now(),
    };

    this.sessions.set(session.id, session);

    // Periodically clear stale recovery sessions to prevent unbounded growth
    if (this.sessions.size > 200) {
      this.clearOldSessions(this.config.recoveryTimeoutMs || 3600000);
    }

    return session;
  }

  private async handleEscalation(
    error: ClassifiedError,
    diagnostic: DiagnosticInfo | undefined,
    session: RecoverySession
  ): Promise<{ success: boolean; session: RecoverySession }> {
    session.outcome = 'escalated';
    session.endedAt = Date.now();

    // Execute escalation
    const result = await this.escalateExecutor.execute(error, diagnostic);
    session.attempts.push(result.attempt);

    this.emit('recovery-escalated', session);
    return { success: false, session };
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Get recovery session by ID
   */
  getSession(sessionId: string): RecoverySession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions
   */
  getAllSessions(): RecoverySession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get circuit breaker states
   */
  getCircuitBreakers(): Map<string, CircuitBreakerState> {
    return new Map(this.circuitBreakers);
  }

  /**
   * Manually reset a circuit breaker
   */
  resetCircuitBreaker(key: string): boolean {
    if (this.circuitBreakers.has(key)) {
      this.resetCircuit(key);
      return true;
    }
    return false;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalSessions: number;
    recoveredCount: number;
    escalatedCount: number;
    failedCount: number;
    openCircuits: number;
    averageRecoveryTime: number;
  } {
    const sessions = Array.from(this.sessions.values());
    const completed = sessions.filter(s => s.endedAt);

    const recoveredCount = completed.filter(s => s.outcome === 'recovered').length;
    const escalatedCount = completed.filter(s => s.outcome === 'escalated').length;
    const failedCount = completed.filter(s => s.outcome === 'failed').length;

    const openCircuits = Array.from(this.circuitBreakers.values())
      .filter(c => c.state === 'open').length;

    const totalRecoveryTime = completed
      .filter(s => s.outcome === 'recovered' && s.endedAt)
      .reduce((sum, s) => sum + (s.endedAt! - s.startedAt), 0);

    return {
      totalSessions: sessions.length,
      recoveredCount,
      escalatedCount,
      failedCount,
      openCircuits,
      averageRecoveryTime: recoveredCount > 0 ? totalRecoveryTime / recoveredCount : 0,
    };
  }

  /**
   * Clear old sessions
   */
  clearOldSessions(maxAgeMs: number = 3600000): number {
    const cutoff = Date.now() - maxAgeMs;
    let cleared = 0;

    for (const [id, session] of this.sessions) {
      if (session.endedAt && session.endedAt < cutoff) {
        this.sessions.delete(id);
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * Handle user response to escalation
   */
  handleUserResponse(
    requestId: string,
    action: UserAction,
    data?: unknown
  ): boolean {
    return this.escalateExecutor.handleUserResponse(requestId, action, data);
  }

  /**
   * Get classifier for external use
   */
  getClassifier(): ErrorClassifier {
    return this.classifier;
  }

  /**
   * Get diagnostic engine for external use
   */
  getDiagnosticEngine(): DiagnosticEngine {
    return this.diagnosticEngine;
  }

  /**
   * Create rollback point
   */
  createRollbackPoint(runId: string, description: string, actions: Array<{ id: string; type: string; description: string; canRollback: boolean }>): string {
    return this.rollbackExecutor.createRollbackPoint(runId, description, actions as never);
  }

  /**
   * Record file change for rollback
   */
  recordFileChange(runId: string, filePath: string, previousContent: string | null): void {
    this.rollbackExecutor.recordFileChange(runId, filePath, previousContent);
  }
}
