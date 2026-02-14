/**
 * Agent State Types
 * 
 * Centralized type definitions for the agent UI state management.
 * Extracted from the deprecated monolithic agentReducer.ts to enable
 * clean imports and tree-shaking.
 */
import type {
  AgentSessionState,
  AgentSettings,
  ToolCallEvent,
  ProgressGroup,
  ProgressItem,
  ArtifactCard,
  LLMProviderName,
  ContextMetricsSnapshot,
  StreamDeltaEvent,
} from '../../shared/types';
import type { TodoItem } from '../../shared/types/todo';
import type { SessionDelta } from './sessionDelta';


// =============================================================================
// State interfaces
// =============================================================================

/** Agent status info for UI display */
export interface AgentStatusInfo {
  status: 'planning' | 'analyzing' | 'reasoning' | 'executing' | 'recovering' | 'error' | 'completed' | 'summarizing' | 'paused';
  message: string;
  timestamp: number;
  /** Context utilization (0-1) for context window indicator */
  contextUtilization?: number;
  /** Number of messages in context */
  messageCount?: number;
  /** Current iteration number */
  currentIteration?: number;
  /** Maximum iterations allowed */
  maxIterations?: number;
  /** Run start timestamp for duration tracking */
  runStartedAt?: number;
  /** Average time per iteration in ms (for ETA calculation) */
  avgIterationTimeMs?: number;
  /** Provider used for current iteration */
  provider?: string;
  /** Model ID used for current iteration */
  modelId?: string;
}

/** Structured error info for displaying error recovery UI */
export interface RunErrorInfo {
  /** Structured error code for programmatic handling */
  errorCode: string;
  /** User-friendly error message */
  message: string;
  /** Whether the error is recoverable (show retry UI) */
  recoverable: boolean;
  /** Suggested recovery action for the user */
  recoveryHint?: string;
  /** Timestamp of the error */
  timestamp: number;
}

/** Tracks tool results associated with tool calls by callId */
export interface ToolResultState {
  callId: string;
  toolName: string;
  result: {
    success: boolean;
    output: string;
    metadata?: Record<string, unknown>;
  };
  timestamp: number;
  error?: string;
}

/** Tracks inline artifacts created during tool execution */
export interface InlineArtifactState {
  id: string;
  callId: string;
  type: 'file' | 'code' | 'image' | 'table' | 'html' | 'markdown';
  title: string;
  language?: string;
  content: string;
  filepath?: string;
  size?: number;
  timestamp: number;
}

/** Routing decision info for UI display */
export interface RoutingDecisionState {
  taskType: string;
  selectedProvider: string | null;
  selectedModel: string | null;
  confidence: number;
  reason: string;
  timestamp: number;
  /** Signals that triggered the task detection */
  signals?: string[];
  /** Alternative task types that were considered */
  alternatives?: Array<{ taskType: string; confidence: number }>;
  /** Whether fallback was used due to primary provider failure */
  usedFallback?: boolean;
  /** Original provider before fallback (if fallback was used) */
  originalProvider?: string;
  /** Whether this was a custom task type */
  isCustomTask?: boolean;
}

/** Terminal streaming output state for real-time display */
export interface TerminalStreamState {
  pid: number;
  output: string;
  isRunning: boolean;
  startedAt: number;
  exitCode?: number;
}

/** Represents a tool waiting in the execution queue */
export interface QueuedTool {
  callId: string;
  name: string;
  arguments?: Record<string, unknown>;
  queuePosition: number;
  queuedAt: number;
}

// =============================================================================
// Main state shape
// =============================================================================

export interface AgentUIState {
  sessions: AgentSessionState[];
  activeSessionId?: string;
  settings?: AgentSettings;
  pendingConfirmations: Record<string, ToolCallEvent>;
  // Task-oriented state
  progressGroups: Record<string, ProgressGroup[]>;
  artifacts: Record<string, ArtifactCard[]>;
  // Streaming state
  streamingSessions: Set<string>;
  // Agent status per session
  agentStatus: Record<string, AgentStatusInfo>;
  // Real-time context window metrics per session
  contextMetrics: Record<string, {
    provider: LLMProviderName;
    modelId?: string;
    runId?: string;
    timestamp: number;
    metrics: ContextMetricsSnapshot;
  }>;
  // Tool results by callId within each run
  toolResults: Record<string, Record<string, ToolResultState>>;
  // Inline artifacts by runId
  inlineArtifacts: Record<string, InlineArtifactState[]>;
  // Task-based routing decisions per session
  routingDecisions: Record<string, RoutingDecisionState>;
  // Todo list state per session
  todos: Record<string, { runId: string; todos: TodoItem[]; timestamp: number }>;
  /** Cached per-session usage/cost summary */
  sessionCost: Record<string, {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCost: number;
    messageCount: number;
    byProvider: Record<string, { totalCost: number; totalTokens: number; messageCount: number }>;
  }>;
  // Real-time terminal output streaming by PID
  terminalStreams: Record<number, TerminalStreamState>;
  // Communication state
  pendingQuestions: Array<{
    id: string;
    type: 'clarification' | 'confirmation' | 'permission' | 'input';
    question: string;
    options?: Array<{ id: string; label: string; value: unknown }>;
    defaultValue?: unknown;
    agentId?: string;
    runId?: string;
    isRequired: boolean;
    createdAt: number;
  }>;
  pendingDecisions: Array<{
    id: string;
    type: 'choice' | 'approval' | 'escalation';
    prompt: string;
    context?: string;
    options: Array<{
      id: string;
      label: string;
      description?: string;
      isRecommended?: boolean;
    }>;
    urgency: 'low' | 'medium' | 'high' | 'critical';
    deadline?: number;
    agentId?: string;
    runId?: string;
    createdAt: number;
  }>;
  communicationProgress: Array<{
    id: string;
    taskId: string;
    level: 'verbose' | 'info' | 'warning' | 'error';
    message: string;
    progress: number;
    phase?: string;
    details?: Record<string, unknown>;
    agentId?: string;
    runId?: string;
    createdAt: number;
  }>;
  /** Real-time executing tools tracking */
  executingTools: Record<string, Record<string, {
    callId: string;
    name: string;
    arguments?: Record<string, unknown>;
    startedAt: number;
  }>>;
  /** Queued tools waiting to be executed */
  queuedTools: Record<string, QueuedTool[]>;
  /** Structured run error info per session for error recovery UI */
  runErrors: Record<string, RunErrorInfo>;
}

/** Type alias for AgentUIState for simpler imports */
export type AgentState = AgentUIState;

// =============================================================================
// Action types
// =============================================================================

export type AgentAction =
  | { type: 'SESSION_UPSERT'; payload: AgentSessionState }
  | { type: 'SESSIONS_BULK_UPSERT'; payload: { sessions: AgentSessionState[]; activeSessionId?: string } }
  | { type: 'SESSION_SET_ACTIVE'; payload: string }
  | { type: 'SESSION_RENAME'; payload: { sessionId: string; title: string } }
  | { type: 'STREAM_DELTA'; payload: { sessionId: string; messageId?: string; delta?: string; toolCall?: StreamDeltaEvent['toolCall'] } }
  | { type: 'STREAM_DELTA_BATCH'; payload: { sessionId: string; messageId?: string; delta?: string; toolCall?: StreamDeltaEvent['toolCall'] } }
  | { type: 'STREAM_THINKING_DELTA'; payload: { sessionId: string; messageId?: string; delta: string } }
  | { type: 'RUN_STATUS'; payload: { sessionId: string; status: AgentSessionState['status']; runId: string } }
  | { type: 'SETTINGS_UPDATE'; payload: AgentSettings }
  | { type: 'PENDING_TOOL_ADD'; payload: ToolCallEvent }
  | { type: 'PENDING_TOOL_REMOVE'; payload: string }
  | { type: 'SESSION_DELETE'; payload: string }
  | { type: 'SESSIONS_CLEAR' }
  | { type: 'PROGRESS_UPDATE'; payload: { sessionId: string; groupId: string; groupTitle: string; startedAt: number; item: ProgressItem } }
  | { type: 'ARTIFACT_ADD'; payload: { sessionId: string; artifact: ArtifactCard } }
  | { type: 'CLEAR_SESSION_TASK_STATE'; payload: string }
  | { type: 'AGENT_STATUS_UPDATE'; payload: { sessionId: string; status: AgentStatusInfo } }
  | { type: 'CONTEXT_METRICS_UPDATE'; payload: { sessionId: string; provider: LLMProviderName; modelId?: string; runId?: string; timestamp: number; metrics: ContextMetricsSnapshot } }
  | { type: 'TOOL_RESULT_RECEIVE'; payload: { runId: string; sessionId: string; callId: string; toolName: string; result: { success: boolean; output: string; metadata?: Record<string, unknown> } } }
  | { type: 'INLINE_ARTIFACT_ADD'; payload: { runId: string; artifact: InlineArtifactState } }
  | { type: 'RUN_CLEANUP'; payload: string }
  | { type: 'MEDIA_OUTPUT_RECEIVE'; payload: { sessionId: string; messageId: string; mediaType: 'image' | 'audio'; data: string; mimeType: string } }
  | {
    type: 'ROUTING_DECISION'; payload: {
      sessionId: string;
      decision: {
        taskType: string;
        selectedProvider: string | null;
        selectedModel: string | null;
        confidence: number;
        reason: string;
        signals?: string[];
        alternatives?: Array<{ taskType: string; confidence: number }>;
        usedFallback?: boolean;
        originalProvider?: string;
        isCustomTask?: boolean;
      };
      timestamp: number;
    };
  }
  | { type: 'TERMINAL_OUTPUT'; payload: { pid: number; data: string; stream: 'stdout' | 'stderr' } }
  | { type: 'TERMINAL_EXIT'; payload: { pid: number; code: number } }
  | { type: 'TERMINAL_CLEAR'; payload: { pid: number } }
  | { type: 'COMMUNICATION_QUESTION_ADD'; payload: AgentUIState['pendingQuestions'][0] }
  | { type: 'COMMUNICATION_QUESTION_REMOVE'; payload: string }
  | { type: 'COMMUNICATION_DECISION_ADD'; payload: AgentUIState['pendingDecisions'][0] }
  | { type: 'COMMUNICATION_DECISION_REMOVE'; payload: string }
  | { type: 'COMMUNICATION_PROGRESS_ADD'; payload: AgentUIState['communicationProgress'][0] }
  | { type: 'COMMUNICATION_PROGRESS_UPDATE'; payload: { id: string; progress: number; message?: string } }
  | { type: 'COMMUNICATION_PROGRESS_CLEAR'; payload?: string }
  | { type: 'TODO_UPDATE'; payload: { sessionId: string; runId: string; todos: TodoItem[]; timestamp: number } }
  | { type: 'TODO_CLEAR'; payload: string }
  | { type: 'TOOL_EXECUTION_START'; payload: { runId: string; callId: string; name: string; arguments?: Record<string, unknown> } }
  | { type: 'TOOL_EXECUTION_FINISH'; payload: { runId: string; callId: string } }
  | { type: 'TOOL_QUEUED'; payload: { runId: string; tools: Array<{ callId: string; name: string; arguments?: Record<string, unknown>; queuePosition: number }> } }
  | { type: 'TOOL_DEQUEUED'; payload: { runId: string; callId: string } }
  | { type: 'RUN_TOOLSTATE_CLEAR'; payload: string }
  | { type: 'RUN_ERROR'; payload: { sessionId: string; errorCode: string; message: string; recoverable: boolean; recoveryHint?: string } }
  | { type: 'RUN_ERROR_CLEAR'; payload: string }
  | { type: 'SESSION_PATCH'; payload: { sessionId: string; patch: Partial<import('../../shared/types').AgentSessionState>; messagePatch?: { messageId: string; changes: Record<string, unknown> } } }
  | { type: 'SESSION_APPLY_DELTA'; payload: SessionDelta };
