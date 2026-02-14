/**
 * Metrics & Observability Types
 *
 * Types for metrics dashboards, cost tracking, provider health,
 * safety monitoring, and performance reporting.
 *
 * @module types/metrics
 */

/**
 * LLM Provider name (mirrors canonical definition in types.ts)
 * Duplicated here to avoid circular dependency with parent module.
 */
type LLMProviderName = 'anthropic' | 'openai' | 'deepseek' | 'gemini' | 'openrouter' | 'xai' | 'mistral' | 'glm';

// =============================================================================
// Metrics & Observability Types (Phase 10)
// =============================================================================

/**
 * Metrics dashboard widget data
 */
export interface MetricsWidgetData {
  id: string;
  type: 'counter' | 'gauge' | 'chart' | 'table' | 'status';
  title: string;
  value: number | string | unknown[];
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: number;
  status?: 'healthy' | 'warning' | 'critical';
  chartData?: Array<{ timestamp: number; value: number }>;
  tableData?: Array<Record<string, unknown>>;
}

/**
 * Metrics dashboard layout
 */
export interface MetricsDashboardLayout {
  widgets: MetricsWidgetData[];
  lastUpdated: number;
  period: 'hour' | 'day' | 'week' | 'month';
}

/**
 * Tool metrics summary
 */
export interface ToolMetricsSummary {
  totalExecutions: number;
  successRate: number;
  avgDurationMs: number;
  topTools: Array<{ name: string; count: number; successRate: number }>;
  failingTools: Array<{ name: string; failureRate: number; errorCount: number }>;
}

/**
 * Agent metrics summary
 */
export interface AgentMetricsSummary {
  totalSpawned: number;
  completionRate: number;
  avgDurationMs: number;
  avgTokensPerAgent: number;
  bySpecialization: Array<{ specialization: string; count: number; successRate: number }>;
}

// =============================================================================
// Cost Management Types
// =============================================================================

/**
 * Cost record for tracking LLM usage costs
 */
export interface CostRecord {
  id: string;
  agentId: string;
  sessionId: string;
  provider: LLMProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: number;
  requestType: 'chat' | 'tool';
}

/**
 * Cost budget configuration
 */
export interface CostBudget {
  sessionBudget: number;
  perAgentBudget: number;
  warningThreshold: number;
  enforceHardLimit: boolean;
}

/**
 * Cost threshold event
 */
export interface CostThresholdEvent {
  type: 'cost-threshold-reached';
  agentId?: string;
  currentCost: number;
  budget: number;
  percentUsed: number;
  isHardLimit: boolean;
  timestamp: number;
}

// =============================================================================
// Provider Health Types
// =============================================================================

/**
 * Provider health status
 */
export interface ProviderHealth {
  provider: LLMProviderName;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs: number;
  errorRate: number;
  lastCheck: number;
  consecutiveFailures: number;
}

/**
 * Failover configuration
 */
export interface FailoverConfig {
  enabled: boolean;
  maxFailovers: number;
  maxRetries: number;
  retryDelayMs: number;
  failoverThreshold: number;
  recoveryPeriodMs: number;
  excludedProviders: LLMProviderName[];
  failoverChain: LLMProviderName[];
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
}

/**
 * Cost metrics summary
 */
export interface CostMetricsSummary {
  totalTokens: number;
  totalCostUsd: number;
  byProvider: Array<{ provider: string; tokens: number; costUsd: number }>;
  avgCostPerTask: number;
}

/**
 * Quality metrics summary
 */
export interface QualityMetricsSummary {
  taskSuccessRate: number;
  errorRate: number;
  userSatisfaction: number;
}

/**
 * System-wide metrics summary
 */
export interface SystemMetricsSummary {
  period: 'hour' | 'day' | 'week' | 'month';
  periodStart: number;
  periodEnd: number;
  tools: ToolMetricsSummary;
  agents: AgentMetricsSummary;
  costs: CostMetricsSummary;
  quality: QualityMetricsSummary;
  trends: {
    successRateTrend: 'improving' | 'stable' | 'declining';
    costTrend: 'increasing' | 'stable' | 'decreasing';
    performanceTrend: 'improving' | 'stable' | 'declining';
  };
}

/**
 * Metrics alert
 */
export interface MetricsAlert {
  severity: 'info' | 'warning' | 'error';
  message: string;
  timestamp: number;
}

/**
 * Safety status
 */
export interface SafetyStatus {
  isActive: boolean;
  emergencyStopTriggered: boolean;
  lastCheck: number;
  overallHealth: 'healthy' | 'warning' | 'critical';
}

/**
 * Resource limits configuration
 */
export interface SafetyResourceLimits {
  maxTokensPerRun: number;
  maxApiCallsPerRun: number;
  maxConcurrentAgents: number;
  maxFilesPerRun: number;
  maxBytesPerRun: number;
}

/**
 * Resource usage tracking
 */
export interface SafetyResourceUsage {
  tokensUsed: number;
  apiCallsUsed: number;
  activeAgents: number;
  filesModified: number;
  bytesWritten: number;
}

/**
 * Safety violation record
 */
export interface SafetyViolation {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  agentId?: string;
  action?: string;
  timestamp: number;
  wasBlocked: boolean;
}

/**
 * Complete safety state
 */
export interface SafetyState {
  status: SafetyStatus;
  limits: SafetyResourceLimits;
  usage: SafetyResourceUsage;
  recentViolations: SafetyViolation[];
  blockedActions: number;
  allowedActions: number;
}

/**
 * Performance bottleneck info
 */
export interface PerformanceBottleneck {
  type: 'slow-operation' | 'high-frequency' | 'blocking';
  severity: 'low' | 'medium' | 'high' | 'critical';
  operation: string;
  description: string;
  recommendation: string;
  metrics: {
    avgDurationMs?: number;
    callCount?: number;
    blockingTimeMs?: number;
  };
}

/**
 * Performance report
 */
export interface PerformanceReport {
  generatedAt: number;
  periodMs: number;
  summary: {
    totalOperations: number;
    avgDurationMs: number;
    p95DurationMs: number;
    p99DurationMs: number;
    slowestOperation: string;
    fastestOperation: string;
  };
  bottlenecks: PerformanceBottleneck[];
  recommendations: string[];
}

/**
 * Event emitted when metrics are updated
 */
export interface MetricsUpdateEvent {
  type: 'metrics-update';
  timestamp: number;
  metrics: Array<{
    name: string;
    value: number;
    labels?: Record<string, string>;
  }>;
}

/**
 * Event emitted when safety violation occurs
 */
export interface SafetyViolationEvent {
  type: 'safety-violation';
  sessionId?: string;
  timestamp: number;
  violation: SafetyViolation;
  wasBlocked: boolean;
}

/**
 * Event emitted when emergency stop is triggered
 */
export interface EmergencyStopEvent {
  type: 'emergency-stop';
  timestamp: number;
  reason: string;
  triggeredBy: 'user' | 'system' | 'safety-framework';
}
