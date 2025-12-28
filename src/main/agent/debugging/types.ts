/**
 * Debugging Module Types
 * 
 * Type definitions for the agent debugging and tracing system.
 */

/**
 * Configuration for the agent debugger
 */
export interface DebugConfig {
  /** Enable verbose logging */
  verbose: boolean;
  
  /** Capture full request/response for each step */
  captureFullPayloads: boolean;
  
  /** Enable step-by-step execution mode */
  stepMode: boolean;
  
  /** Auto-export traces on error */
  exportOnError: boolean;
  
  /** Export format */
  exportFormat: 'json' | 'markdown';
}

/**
 * Default debug configuration
 */
export const DEFAULT_DEBUG_CONFIG: DebugConfig = {
  verbose: false,
  captureFullPayloads: false,
  stepMode: false,
  exportOnError: true,
  exportFormat: 'json',
};

/**
 * Complete trace of an agent run
 */
export interface AgentTrace {
  /** Unique trace identifier */
  traceId: string;
  
  /** Session this trace belongs to */
  sessionId: string;
  
  /** Run ID within the session */
  runId: string;
  
  /** Timestamp when trace started */
  startedAt: number;
  
  /** Timestamp when trace completed */
  completedAt?: number;
  
  /** Total duration in milliseconds */
  durationMs?: number;
  
  /** Current status */
  status: 'running' | 'completed' | 'failed' | 'paused';
  
  /** All steps in this trace */
  steps: AgentStep[];
  
  /** Error if trace failed */
  error?: AgentError;
  
  /** Aggregated metrics */
  metrics: TraceMetrics;
}

/**
 * Individual step in an agent trace
 */
export interface AgentStep {
  /** Unique step identifier */
  stepId: string;
  
  /** Sequential step number */
  stepNumber: number;
  
  /** Type of step */
  type: 'llm-call' | 'tool-call' | 'tool-result' | 'decision' | 'error';
  
  /** Timestamp when step started */
  startedAt: number;
  
  /** Timestamp when step completed */
  completedAt: number;
  
  /** Duration in milliseconds */
  durationMs: number;
  
  /** LLM request details (for llm-call type) */
  llmRequest?: LLMRequestDetails;
  
  /** LLM response details (for llm-call type) */
  llmResponse?: LLMResponseDetails;
  
  /** Tool call details (for tool-call type) */
  toolCall?: ToolCallDetails;
  
  /** Tool result details (for tool-result type) */
  toolResult?: ToolResultDetails;
  
  /** Error details (for error type) */
  error?: AgentError;
  
  /** Parent step ID (for nested operations) */
  parentStepId?: string;
  
  /** Child step IDs */
  childStepIds?: string[];
  
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Details about an LLM request
 */
export interface LLMRequestDetails {
  /** Provider name */
  provider: string;
  
  /** Model identifier */
  model: string;
  
  /** Number of input tokens */
  promptTokens: number;
  
  /** Hash of system prompt (for cache detection) */
  systemPromptHash: string;
  
  /** Number of messages in request */
  messageCount: number;
  
  /** Number of tools available */
  toolCount: number;
  
  /** Preview of user message */
  userMessagePreview?: string;
}

/**
 * Details about an LLM response
 */
export interface LLMResponseDetails {
  /** Number of output tokens */
  outputTokens: number;
  
  /** Finish reason */
  finishReason: string;
  
  /** Whether response includes tool calls */
  hasToolCalls: boolean;
  
  /** Number of tool calls */
  toolCallCount?: number;
  
  /** Preview of response content */
  contentPreview: string;
}

/**
 * Details about a tool call
 */
export interface ToolCallDetails {
  /** Tool name */
  name: string;
  
  /** Call identifier */
  callId: string;
  
  /** Tool arguments */
  arguments: Record<string, unknown>;
  
  /** Preview of arguments */
  argumentsPreview: string;
  
  /** Whether tool requires approval */
  requiresApproval: boolean;
  
  /** Whether tool was approved */
  wasApproved?: boolean;
}

/**
 * Details about a tool result
 */
export interface ToolResultDetails {
  /** Whether execution succeeded */
  success: boolean;
  
  /** Preview of output */
  outputPreview: string;
  
  /** Total output size */
  outputSize: number;
  
  /** File changes if applicable */
  fileChanges?: FileChangeDetail[];
  
  /** Error message if failed */
  errorMessage?: string;
}

/**
 * File change detail
 */
export interface FileChangeDetail {
  /** File path */
  path: string;
  
  /** Action performed */
  action: 'created' | 'modified' | 'deleted' | 'read';
  
  /** Lines added */
  linesAdded?: number;
  
  /** Lines removed */
  linesRemoved?: number;
}

/**
 * Agent error details
 */
export interface AgentError {
  /** Error message */
  message: string;
  
  /** Error code */
  code?: string;
  
  /** Stack trace */
  stack?: string;
  
  /** Step where error occurred */
  stepId?: string;
  
  /** Whether error was recovered from */
  recovered?: boolean;
}

/**
 * Aggregated metrics for a trace
 */
export interface TraceMetrics {
  /** Total steps */
  totalSteps: number;
  
  /** Total LLM calls */
  llmCalls: number;
  
  /** Total tool calls */
  toolCalls: number;
  
  /** Successful tool calls */
  successfulToolCalls: number;
  
  /** Failed tool calls */
  failedToolCalls: number;
  
  /** Total input tokens */
  totalInputTokens: number;
  
  /** Total output tokens */
  totalOutputTokens: number;
  
  /** Total duration in milliseconds */
  totalDurationMs: number;
  
  /** Average LLM call duration */
  avgLLMDurationMs: number;
  
  /** Average tool call duration */
  avgToolDurationMs: number;
  
  /** Tools used with counts */
  toolUsage: Record<string, number>;
}

/**
 * Breakpoint condition
 */
export interface BreakpointCondition {
  /** Unique breakpoint ID */
  id: string;
  
  /** Type of breakpoint */
  type: 'tool' | 'error' | 'step' | 'iteration' | 'custom';
  
  /** Tool name (for tool type) */
  toolName?: string;
  
  /** Step number (for step type) */
  stepNumber?: number;
  
  /** Iteration number (for iteration type) */
  iterationNumber?: number;
  
  /** Whether breakpoint is enabled */
  enabled: boolean;
  
  /** Custom condition function serialized as string */
  customCondition?: string;
}

/**
 * Trace export options
 */
export interface TraceExportOptions {
  /** Format to export */
  format: 'json' | 'markdown' | 'html';
  
  /** Include full payloads */
  includeFullPayloads?: boolean;
  
  /** Maximum preview length */
  maxPreviewLength?: number;
}
