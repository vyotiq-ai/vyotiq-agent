/**
 * Dynamic Tools, Security, Discovery, Templates, Sandbox Types
 *
 * Types for the dynamic tool system including configuration, security,
 * capability management, discovery/ranking, templates, and sandboxing.
 */

// =============================================================================
// Tool Configuration
// =============================================================================

/**
 * Tool configuration settings
 */
export interface ToolConfigSettings {
  /** Tools that require confirmation when NOT in YOLO mode (YOLO mode bypasses all confirmations) */
  alwaysConfirmTools: string[];
  /** Tools that are completely disabled */
  disabledTools: string[];
  /** Per-tool timeout overrides (ms) */
  toolTimeouts: Record<string, number>;
  /** Allow dynamic tool creation */
  allowDynamicCreation: boolean;
  /** Require confirmation for dynamic tools */
  requireDynamicToolConfirmation: boolean;
  /** Maximum execution time for any tool (ms) */
  maxToolExecutionTime: number;
  /** Enable tool result caching */
  enableToolCaching: boolean;
  /** Maximum concurrent tool executions for parallel execution (default: 5) */
  maxConcurrentTools: number;
  /** User-defined custom tools */
  customTools?: CustomToolConfig[];
}

/**
 * User-defined custom tool configuration
 */
export interface CustomToolConfig {
  /** Unique identifier */
  id: string;
  /** Tool name (must be unique) */
  name: string;
  /** Description of what this tool does */
  description: string;
  /** Workflow steps (chain of existing tools) */
  steps: CustomToolStep[];
  /** Whether this tool is enabled */
  enabled: boolean;
  /** Whether this tool requires confirmation */
  requiresConfirmation: boolean;
  /** Creation timestamp */
  createdAt: number;
  /** Last modified timestamp */
  updatedAt: number;
  /** Usage count */
  usageCount: number;
}

/**
 * A step in a custom tool workflow
 */
export interface CustomToolStep {
  /** Step ID */
  id: string;
  /** Tool to execute */
  toolName: string;
  /** Input mapping (can reference $input or $stepN) */
  input: Record<string, unknown>;
  /** Condition for execution (optional) */
  condition?: string;
  /** Error handling: 'stop' or 'continue' */
  onError: 'stop' | 'continue';
}

/**
 * Default tool configuration settings
 */
export const DEFAULT_TOOL_CONFIG_SETTINGS: ToolConfigSettings = {
  alwaysConfirmTools: ['run', 'write', 'edit', 'delete'],
  disabledTools: [],
  toolTimeouts: {},
  allowDynamicCreation: true,
  requireDynamicToolConfirmation: true,
  maxToolExecutionTime: 120000, // 2 minutes
  enableToolCaching: true,
  maxConcurrentTools: 5, // Default max concurrent tools for parallel execution
};

// =============================================================================
// Dynamic Tool Types
// =============================================================================

/**
 * Types of tool execution
 */
export type ToolExecutionType = 'template' | 'code' | 'composite';

/**
 * Risk level for dynamic tools
 */
export type ToolRiskLevel = 'safe' | 'moderate' | 'dangerous';

/**
 * Status of a dynamic tool
 */
export type DynamicToolStatus = 'active' | 'disabled' | 'expired';

/**
 * Specification of a dynamically created tool
 */
export interface ToolSpecification {
  /** Unique identifier for the tool */
  id: string;
  /** Tool name (must be unique within session) */
  name: string;
  /** Human-readable description */
  description: string;
  /** JSON Schema for tool parameters */
  inputSchema: Record<string, unknown>;
  /** How the tool executes */
  executionType: ToolExecutionType;
  /** Reference to template if template-based */
  templateId?: string;
  /** Workflow steps if composite tool */
  compositionSteps?: ToolCompositionStep[];
  /** Code to execute if code-based */
  executionCode?: string;
  /** Required capabilities/permissions */
  requiredCapabilities: string[];
  /** Risk assessment */
  riskLevel: ToolRiskLevel;
  /** Session/run that created this tool */
  createdBy: {
    sessionId: string;
    runId?: string;
    agentId?: string;
  };
  /** Creation timestamp */
  createdAt: number;
  /** Version number for tracking changes */
  version: number;
}

/**
 * A step in a composite tool workflow
 */
export interface ToolCompositionStep {
  /** Step identifier */
  id: string;
  /** Tool to execute */
  toolName: string;
  /** Arguments for the tool (can reference previous step outputs) */
  arguments: Record<string, unknown>;
  /** Dependencies on other steps */
  dependsOn: string[];
  /** Condition for execution (optional) */
  condition?: string;
  /** Output variable name */
  outputAs?: string;
}

/**
 * Pre-defined template for creating tools
 */
export interface ToolTemplate {
  /** Template identifier */
  id: string;
  /** Template name */
  name: string;
  /** What the template does */
  description: string;
  /** Configurable parameter bindings */
  parameterBindings: ToolParameterBinding[];
  /** Base schema template */
  baseSchema: Record<string, unknown>;
  /** Execution logic (template code) */
  executionLogic: string;
  /** Category for organization */
  category: string;
}

/**
 * Parameter binding for a tool template
 */
export interface ToolParameterBinding {
  /** Parameter name */
  name: string;
  /** Parameter type */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  /** Description */
  description: string;
  /** Default value */
  defaultValue?: unknown;
  /** Whether required */
  required: boolean;
}

/**
 * Runtime state of a dynamic tool
 */
export interface DynamicToolState {
  /** Tool name */
  name: string;
  /** Current status */
  status: DynamicToolStatus;
  /** Times used */
  usageCount: number;
  /** Last usage timestamp */
  lastUsedAt?: number;
  /** Error count */
  errorCount: number;
  /** Last error message */
  lastError?: string;
}

// =============================================================================
// Security Types
// =============================================================================

/**
 * Security event types for audit logging
 */
export type SecurityEventType =
  | 'tool_creation_attempt'
  | 'tool_creation_success'
  | 'tool_creation_denied'
  | 'tool_execution_attempt'
  | 'tool_execution_success'
  | 'tool_execution_denied'
  | 'capability_request'
  | 'capability_denied'
  | 'rate_limit_hit'
  | 'validation_failure'
  | 'sandbox_violation'
  | 'anomaly_detected';

/**
 * Security event for audit logging
 */
export interface SecurityEvent {
  /** Unique event ID */
  id: string;
  /** Event type */
  type: SecurityEventType;
  /** When the event occurred */
  timestamp: number;
  /** Actor (agent/session) that triggered the event */
  actor: {
    sessionId: string;
    agentId?: string;
    runId?: string;
  };
  /** Event details */
  details: {
    toolName?: string;
    toolId?: string;
    capability?: string;
    reason?: string;
    riskLevel?: ToolRiskLevel;
    [key: string]: unknown;
  };
  /** Outcome of the event */
  outcome: 'allowed' | 'denied' | 'flagged';
  /** Risk level assessment */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Security violation record
 */
export interface SecurityViolation {
  /** Violation ID */
  id: string;
  /** Violation type */
  type: 'code_injection' | 'privilege_escalation' | 'resource_abuse' | 'policy_violation';
  /** Severity */
  severity: 'warning' | 'error' | 'critical';
  /** Description */
  description: string;
  /** When detected */
  detectedAt: number;
  /** Related event ID */
  relatedEventId?: string;
  /** Action taken */
  actionTaken: 'logged' | 'blocked' | 'quarantined' | 'alerted';
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum operations per window */
  maxOperations: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Action when limit exceeded */
  onExceeded: 'reject' | 'queue' | 'throttle';
  /** Cooldown period after limit hit (ms) */
  cooldownMs?: number;
}

/**
 * Rate limit state
 */
export interface RateLimitState {
  /** Current operation count */
  count: number;
  /** Window start timestamp */
  windowStart: number;
  /** Whether currently in cooldown */
  inCooldown: boolean;
  /** Cooldown ends at */
  cooldownEndsAt?: number;
}

/**
 * Security level configuration
 */
export type SecurityLevel = 'maximum' | 'high' | 'standard' | 'permissive';

/**
 * Security settings for dynamic tools
 */
export interface DynamicToolSecuritySettings {
  /** Overall security level */
  level: SecurityLevel;
  /** Allow dynamic tool creation */
  allowDynamicTools: boolean;
  /** Allow code-based tools (most risky) */
  allowCodeBasedTools: boolean;
  /** Require confirmation for moderate risk */
  confirmModerateRisk: boolean;
  /** Require confirmation for dangerous */
  confirmDangerous: boolean;
  /** Maximum dynamic tools per session */
  maxToolsPerSession: number;
  /** Maximum tool creations per minute */
  maxCreationsPerMinute: number;
  /** Allowed capabilities for dynamic tools */
  allowedCapabilities: ToolCapability[];
  /** Blocked patterns in tool code */
  blockedPatterns: string[];
}

// =============================================================================
// Tool Capability Types
// =============================================================================

/**
 * Capability a tool can request
 */
export type ToolCapability =
  | 'file_read'
  | 'file_write'
  | 'network'
  | 'terminal'
  | 'environment'
  | 'system_info'
  | 'browser'
  | 'none';

/**
 * Capability grant for a dynamic tool
 */
export interface CapabilityGrant {
  /** The capability */
  capability: ToolCapability;
  /** Scope restrictions */
  scope?: {
    /** Allowed file paths (glob patterns) */
    paths?: string[];
    /** Allowed domains */
    domains?: string[];
    /** Allowed commands */
    commands?: string[];
  };
  /** When granted */
  grantedAt: number;
  /** When expires (optional) */
  expiresAt?: number;
}

// =============================================================================
// Tool Discovery Types
// =============================================================================

/**
 * Tool usage statistics
 */
export interface ToolUsageStats {
  /** Tool name */
  toolName: string;
  /** Total invocations */
  totalInvocations: number;
  /** Successful invocations */
  successCount: number;
  /** Failed invocations */
  failureCount: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Average execution time (ms) */
  avgDurationMs: number;
  /** Last used timestamp */
  lastUsedAt: number;
  /** Usage by context type */
  usageByContext: Record<string, number>;
}

/**
 * Ranking factors for tool search results
 */
export interface ToolRankingFactors {
  /** Text relevance score (0-1) */
  relevance: number;
  /** Usage frequency score (0-1) */
  frequency: number;
  /** Success rate score (0-1) */
  successRate: number;
  /** Recency score (0-1) */
  recency: number;
  /** User preference score (0-1) */
  preference: number;
}

/**
 * Weighted ranking configuration
 */
export interface ToolRankingConfig {
  /** Weight for relevance (default 0.4) */
  relevanceWeight: number;
  /** Weight for frequency (default 0.2) */
  frequencyWeight: number;
  /** Weight for success rate (default 0.2) */
  successRateWeight: number;
  /** Weight for recency (default 0.1) */
  recencyWeight: number;
  /** Weight for preference (default 0.1) */
  preferenceWeight: number;
}

/**
 * Tool suggestion with context
 */
export interface ToolSuggestion {
  /** Tool name */
  toolName: string;
  /** Why suggested */
  reason: 'task_match' | 'context_match' | 'pattern_match' | 'gap_fill' | 'alternative';
  /** Confidence score (0-1) */
  confidence: number;
  /** Explanation for user */
  explanation: string;
  /** Suggested arguments (if applicable) */
  suggestedArgs?: Record<string, unknown>;
}

/**
 * Search context for enhanced tool discovery
 */
export interface ToolSearchContext {
  /** Current task description */
  taskDescription?: string;
  /** Recent tool calls in session */
  recentToolCalls?: string[];
  /** File types being worked with */
  fileTypes?: string[];
  /** Programming language context */
  language?: string;
  /** Whether to include dynamic tools */
  includeDynamic?: boolean;
  /** Maximum results */
  maxResults?: number;
}

/**
 * Enhanced search result with ranking
 */
export interface RankedToolResult {
  /** Tool name */
  toolName: string;
  /** Tool description */
  description: string;
  /** Whether dynamic */
  isDynamic: boolean;
  /** Combined ranking score */
  score: number;
  /** Individual ranking factors */
  factors: ToolRankingFactors;
  /** Match explanation */
  matchReason?: string;
}

// =============================================================================
// Template Types
// =============================================================================

/**
 * Template categories
 */
export type ToolTemplateCategory =
  | 'http'
  | 'file'
  | 'data'
  | 'aggregate'
  | 'filter'
  | 'validate'
  | 'transform'
  | 'custom';

/**
 * Template execution context
 */
export interface TemplateExecutionContext {
  /** Bound parameters */
  params: Record<string, unknown>;
  /** Input data */
  input: unknown;
  /** Workspace path */
  workspacePath?: string;
  /** Capability grants */
  capabilities: CapabilityGrant[];
}

/**
 * Template execution result
 */
export interface TemplateExecutionResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Output data */
  output?: unknown;
  /** Error if failed */
  error?: string;
  /** Execution metadata */
  metadata?: {
    durationMs: number;
    bytesProcessed?: number;
    itemsProcessed?: number;
  };
}

// =============================================================================
// Sandbox Types
// =============================================================================

/**
 * Sandbox execution mode
 */
export type SandboxMode = 'strict' | 'limited' | 'standard' | 'privileged';

/**
 * Sandbox configuration
 */
export interface SandboxConfig {
  /** Execution mode */
  mode: SandboxMode;
  /** CPU time limit in milliseconds */
  cpuTimeLimitMs: number;
  /** I/O operations limit */
  ioOperationsLimit: number;
  /** Allowed globals */
  allowedGlobals: string[];
  /** Blocked patterns in code */
  blockedPatterns: string[];
}

/**
 * Sandbox execution result
 */
export interface SandboxExecutionResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Return value */
  result?: unknown;
  /** Error if failed */
  error?: string;
  /** Resource usage */
  resourceUsage: {
    cpuTimeMs: number;
    ioOperations: number;
  };
  /** Security events during execution */
  securityEvents: SecurityEvent[];
}
