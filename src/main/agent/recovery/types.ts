/**
 * Recovery System Types
 *
 * Type definitions for error classification, diagnosis,
 * recovery strategies, and self-healing capabilities.
 */

// =============================================================================
// Error Classification Types
// =============================================================================

/**
 * Categories of errors
 */
export type ErrorCategory =
  | 'transient'      // Temporary issues (rate limits, timeouts)
  | 'configuration'  // Setup/config issues (invalid keys, permissions)
  | 'logic'          // Agent made incorrect decisions
  | 'resource'       // Resource exhaustion (tokens, memory)
  | 'external'       // External system failures (APIs, filesystem)
  | 'validation'     // Input/output validation failures
  | 'unknown';       // Unclassified errors

/**
 * Error severity levels
 */
export type ErrorSeverity =
  | 'low'       // Minor issue, can continue
  | 'medium'    // Should recover, may affect quality
  | 'high'      // Must recover or fail gracefully
  | 'critical'; // System-level, immediate action required

/**
 * Classified error with metadata
 */
export interface ClassifiedError {
  /** Original error */
  original: Error;
  /** Error category */
  category: ErrorCategory;
  /** Severity level */
  severity: ErrorSeverity;
  /** Whether this error is retryable */
  isRetryable: boolean;
  /** Suggested retry delay in ms */
  suggestedRetryDelayMs?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Error code if available */
  code?: string;
  /** HTTP status if applicable */
  httpStatus?: number;
  /** Additional context */
  context: ErrorContext;
}

/**
 * Error context information
 */
export interface ErrorContext {
  /** Operation that failed */
  operation?: string;
  /** Tool name if tool-related */
  toolName?: string;
  /** Agent ID if agent-related */
  agentId?: string;
  /** Run ID */
  runId?: string;
  /** Session ID */
  sessionId?: string;
  /** Provider name if provider-related */
  provider?: string;
  /** Recent operations before error */
  recentOperations?: string[];
  /** Stack trace */
  stack?: string;
  /** Timestamp */
  timestamp: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Diagnostic Types
// =============================================================================

/**
 * Root cause analysis result
 */
export interface RootCause {
  /** Primary cause description */
  cause: string;
  /** Confidence level (0-1) */
  confidence: number;
  /** Evidence supporting this cause */
  evidence: string[];
  /** Related factors */
  contributingFactors: string[];
}

/**
 * Suggested fix for an error
 */
export interface SuggestedFix {
  /** Fix description */
  description: string;
  /** Type of fix */
  type: 'automatic' | 'user-action' | 'configuration' | 'code-change';
  /** Steps to implement */
  steps: string[];
  /** Estimated success probability */
  successProbability: number;
  /** Side effects if any */
  sideEffects?: string[];
}

/**
 * Complete diagnostic information
 */
export interface DiagnosticInfo {
  /** Classified error */
  error: ClassifiedError;
  /** Root cause analysis */
  rootCause: RootCause;
  /** Suggested fixes */
  suggestedFixes: SuggestedFix[];
  /** Related past errors */
  relatedErrors?: string[];
  /** Diagnostic timestamp */
  timestamp: number;
  /** Time taken to diagnose (ms) */
  diagnosisTimeMs: number;
}

// =============================================================================
// Recovery Strategy Types
// =============================================================================

/**
 * Available recovery strategies
 */
export type RecoveryStrategyType =
  | 'retry'       // Simple retry with backoff
  | 'fallback'    // Use alternative approach
  | 'rollback'    // Undo and try again
  | 'scale-down'  // Reduce scope
  | 'escalate'    // Ask user for help
  | 'skip'        // Skip and continue
  | 'circuit-break'; // Open circuit, prevent cascading

/**
 * Recovery strategy definition
 */
export interface RecoveryStrategy {
  /** Strategy type */
  type: RecoveryStrategyType;
  /** Human-readable name */
  name: string;
  /** Description */
  description: string;
  /** Priority (lower = try first) */
  priority: number;
  /** Applicable error categories */
  applicableCategories: ErrorCategory[];
  /** Applicable severity levels */
  applicableSeverities: ErrorSeverity[];
  /** Maximum attempts for this strategy */
  maxAttempts: number;
  /** Timeout for strategy execution (ms) */
  timeoutMs: number;
  /** Whether this strategy requires user interaction */
  requiresUserInteraction: boolean;
}

/**
 * Recovery attempt record
 */
export interface RecoveryAttempt {
  /** Unique attempt ID */
  id: string;
  /** Strategy used */
  strategy: RecoveryStrategyType;
  /** Attempt number */
  attemptNumber: number;
  /** Start timestamp */
  startedAt: number;
  /** End timestamp */
  endedAt?: number;
  /** Duration in ms */
  durationMs?: number;
  /** Outcome */
  outcome: RecoveryOutcome;
  /** Error if failed */
  error?: string;
  /** Actions taken */
  actionsTaken: string[];
  /** Side effects */
  sideEffects?: string[];
}

/**
 * Recovery outcome
 */
export type RecoveryOutcome =
  | 'success'       // Fully recovered
  | 'partial'       // Partially recovered
  | 'failed'        // Recovery failed
  | 'skipped'       // Strategy not applicable
  | 'timeout'       // Strategy timed out
  | 'user-cancelled'; // User cancelled recovery

/**
 * Recovery result
 */
export interface RecoveryResult {
  /** Whether recovery succeeded */
  success: boolean;
  /** Outcome status */
  outcome: RecoveryOutcome;
  /** Strategy that succeeded (if any) */
  successfulStrategy?: RecoveryStrategyType;
  /** All attempts made */
  attempts: RecoveryAttempt[];
  /** Final state description */
  finalState: string;
  /** User message */
  userMessage?: string;
  /** Total recovery time (ms) */
  totalTimeMs: number;
}

// =============================================================================
// Self-Healing Types
// =============================================================================

/**
 * Self-healing trigger
 */
export type SelfHealingTrigger =
  | 'repeated-failures'    // Same error multiple times
  | 'unexpected-results'   // Results don't match expectations
  | 'resource-exhaustion'  // Running out of resources
  | 'user-rejection'       // User rejected previous attempt
  | 'context-corruption'   // State inconsistency detected
  | 'approach-blocked';    // Current approach cannot proceed

/**
 * Alternative approach
 */
export interface AlternativeApproach {
  /** Approach ID */
  id: string;
  /** Description */
  description: string;
  /** Why this might work */
  rationale: string;
  /** Estimated success probability */
  successProbability: number;
  /** Changes required */
  changes: ApproachChange[];
  /** Resources needed */
  resourcesNeeded: string[];
  /** Risks */
  risks: string[];
}

/**
 * Change for an alternative approach
 */
export interface ApproachChange {
  type: 'tool' | 'prompt' | 'context' | 'strategy' | 'resources';
  description: string;
  from?: string;
  to?: string;
}

/**
 * Self-healing action
 */
export interface SelfHealingAction {
  /** Action type */
  type: 'regenerate-context' | 'switch-tool' | 'modify-prompt' | 'reduce-scope' | 'reset-state' | 'seek-help';
  /** Description */
  description: string;
  /** Parameters for the action */
  parameters: Record<string, unknown>;
  /** Whether action was successful */
  success?: boolean;
  /** Result of the action */
  result?: string;
}

// =============================================================================
// Circuit Breaker Types
// =============================================================================

/**
 * Circuit breaker state
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Failure threshold to open circuit */
  failureThreshold: number;
  /** Success threshold to close circuit */
  successThreshold: number;
  /** Time to wait before half-open (ms) */
  resetTimeoutMs: number;
  /** Time window for failure counting (ms) */
  failureWindowMs: number;
}

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeoutMs: 30000,
  failureWindowMs: 60000,
};

/**
 * Circuit breaker status
 */
export interface CircuitBreakerStatus {
  /** Operation name */
  operation: string;
  /** Current state */
  state: CircuitState;
  /** Failure count in window */
  failureCount: number;
  /** Success count since half-open */
  successCount: number;
  /** Last failure timestamp */
  lastFailureAt?: number;
  /** Last state change timestamp */
  lastStateChangeAt: number;
  /** Time until potential reset (if open) */
  timeUntilResetMs?: number;
}

// =============================================================================
// User Communication Types
// =============================================================================

/**
 * User-friendly error explanation
 */
export interface ErrorExplanation {
  /** Short summary */
  summary: string;
  /** Detailed explanation */
  details: string;
  /** What the system tried */
  whatHappened: string;
  /** What the user can do */
  whatYouCanDo: string[];
  /** Technical details (for advanced users) */
  technicalDetails?: string;
  /** Is this error recoverable */
  isRecoverable: boolean;
  /** Suggested user actions */
  suggestedActions: UserAction[];
}

/**
 * User action option
 */
export interface UserAction {
  id: string;
  label: string;
  description: string;
  type: 'retry' | 'cancel' | 'modify' | 'help' | 'ignore';
  isRecommended: boolean;
}

/**
 * Help request for user
 */
export interface HelpRequest {
  /** Request ID */
  id: string;
  /** Question for user */
  question: string;
  /** Context about the situation */
  context: string;
  /** Options for user */
  options: UserAction[];
  /** Default option */
  defaultOption?: string;
  /** Timeout for response (ms) */
  timeoutMs: number;
  /** Created timestamp */
  createdAt: number;
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Error classifier configuration
 */
export interface ErrorClassifierConfig {
  /** Include stack traces in context */
  includeStackTraces: boolean;
  /** Number of recent operations to track */
  recentOperationsLimit: number;
  /** Custom error patterns */
  customPatterns?: Array<{
    pattern: string | RegExp;
    category: ErrorCategory;
    severity: ErrorSeverity;
  }>;
}

/**
 * Default error classifier configuration
 */
export const DEFAULT_ERROR_CLASSIFIER_CONFIG: ErrorClassifierConfig = {
  includeStackTraces: true,
  recentOperationsLimit: 10,
};

/**
 * Diagnostic engine configuration
 */
export interface DiagnosticEngineConfig {
  /** Maximum diagnosis time (ms) */
  maxDiagnosisTimeMs: number;
  /** Enable pattern matching */
  enablePatternMatching: boolean;
  /** Enable historical comparison */
  enableHistoricalComparison: boolean;
  /** Maximum fixes to suggest */
  maxSuggestedFixes: number;
}

/**
 * Default diagnostic engine configuration
 */
export const DEFAULT_DIAGNOSTIC_ENGINE_CONFIG: DiagnosticEngineConfig = {
  maxDiagnosisTimeMs: 5000,
  enablePatternMatching: true,
  enableHistoricalComparison: true,
  maxSuggestedFixes: 5,
};

/**
 * Recovery manager configuration
 */
export interface RecoveryManagerConfig {
  /** Maximum recovery attempts */
  maxRecoveryAttempts: number;
  /** Recovery timeout in ms */
  recoveryTimeoutMs: number;
  /** Enable circuit breaker */
  enableCircuitBreaker: boolean;
  /** Circuit breaker config */
  circuitBreaker: {
    failureThreshold: number;
    resetTimeoutMs: number;
    halfOpenMaxAttempts: number;
  };
  /** Strategy priorities */
  strategyPriorities: Record<string, number>;
  /** Enable automatic recovery */
  enableAutoRecovery: boolean;
  /** Record metrics */
  recordMetrics: boolean;
}

/**
 * Default recovery manager configuration
 */
export const DEFAULT_RECOVERY_MANAGER_CONFIG: RecoveryManagerConfig = {
  maxRecoveryAttempts: 5,
  recoveryTimeoutMs: 120000,
  enableCircuitBreaker: true,
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeoutMs: 60000,
    halfOpenMaxAttempts: 1,
  },
  strategyPriorities: {
    retry: 1,
    fallback: 2,
    rollback: 3,
    'scale-down': 5,
    escalate: 10,
  },
  enableAutoRecovery: true,
  recordMetrics: true,
};

/**
 * Self-healing trigger configuration
 */
export interface SelfHealingTriggerConfig {
  id: string;
  name: string;
  condition: string;
  action: string;
  cooldownMs: number;
}

/**
 * Self-healing configuration
 */
export interface SelfHealingConfig {
  /** Enable self-healing */
  enabled: boolean;
  /** Check interval in ms */
  checkIntervalMs: number;
  /** Triggers */
  triggers: SelfHealingTriggerConfig[];
  /** Maximum healing actions per hour */
  maxHealingActionsPerHour: number;
  /** Suppress duplicate actions for this duration */
  suppressDuplicateActionsMs: number;
}

/**
 * Default self-healing configuration
 */
export const DEFAULT_SELF_HEALING_CONFIG: SelfHealingConfig = {
  enabled: true,
  checkIntervalMs: 30000,
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
  ],
  maxHealingActionsPerHour: 20,
  suppressDuplicateActionsMs: 60000,
};

// =============================================================================
// Dependencies
// =============================================================================

/**
 * Logger interface for recovery
 */
export interface RecoveryLogger {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Dependencies for recovery components
 */
export interface RecoveryDeps {
  logger: RecoveryLogger;
  emitEvent: (event: unknown) => void;
  getSystemState?: () => Record<string, unknown>;
  /** Optional hook to clear in-process caches (tool/context/editor/autocomplete/etc). */
  clearCaches?: () => void | Promise<void>;
  /** Optional hook to reduce concurrency (e.g., limit concurrent runs). */
  reduceConcurrency?: (factor: number) => void | Promise<void>;
  /** Optional hook to pause accepting new tasks temporarily. */
  pauseNewTasks?: (durationMs: number) => void | Promise<void>;
  /** Optional hook to trigger circuit breaker. */
  triggerCircuitBreak?: () => void | Promise<void>;
  classifier?: import('./ErrorClassifier').ErrorClassifier;
  diagnosticEngine?: import('./DiagnosticEngine').DiagnosticEngine;
}

// =============================================================================
// Extended Config Types (used by RecoveryManager)
// =============================================================================

/**
 * Extended recovery manager configuration with all options
 */
export interface ExtendedRecoveryManagerConfig {
  /** Maximum recovery attempts */
  maxRecoveryAttempts: number;
  /** Recovery timeout in ms */
  recoveryTimeoutMs: number;
  /** Enable circuit breaker */
  enableCircuitBreaker: boolean;
  /** Circuit breaker configuration */
  circuitBreaker: {
    failureThreshold: number;
    resetTimeoutMs: number;
    halfOpenMaxAttempts: number;
  };
  /** Strategy priorities (lower = try first) */
  strategyPriorities: Record<string, number>;
  /** Enable auto recovery */
  enableAutoRecovery: boolean;
  /** Record metrics */
  recordMetrics: boolean;
}

/**
 * Extended self-healing configuration
 */
export interface ExtendedSelfHealingConfig {
  /** Enable self-healing */
  enabled: boolean;
  /** Check interval in ms */
  checkIntervalMs: number;
  /** Triggers to watch */
  triggers: Array<{
    id: string;
    name: string;
    condition: string;
    action: string;
    cooldownMs: number;
  }>;
  /** Maximum healing actions per hour */
  maxHealingActionsPerHour: number;
  /** Suppress duplicate actions for this duration */
  suppressDuplicateActionsMs: number;
}

/**
 * Extended user action with data
 */
export interface ExtendedUserAction {
  id: string;
  label: string;
  description: string;
  type: 'retry' | 'cancel' | 'modify' | 'help' | 'ignore' | 'navigate';
  isRecommended: boolean;
  data?: Record<string, unknown>;
}
