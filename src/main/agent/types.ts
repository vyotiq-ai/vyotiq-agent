import type { AgentSessionState, ToolCallPayload, LLMProviderName, RoutingDecision } from '../../shared/types';

/**
 * Context maintained during an agentic run for tracking state and metrics.
 */
export interface AgenticContext {
  /** Unique identifier for this run */
  runId: string;
  /** Timestamp when the run started */
  startedAt: number;
  /** Number of tool calls made in this run */
  toolCallCount: number;
  /** List of files modified during this run */
  filesModified: string[];
  /** List of files read during this run */
  filesRead: string[];
  /** List of terminal commands executed during this run */
  commandsExecuted: string[];
  /** Current iteration number (for multi-turn conversations) */
  iteration?: number;

  /** Task-based routing decision captured at run start (if enabled) */
  routingDecision?: RoutingDecision;
  /** Provider currently being used for this run/iteration */
  currentProvider?: LLMProviderName;
  
  /** Reduced maxOutputTokens when credit/quota limits are hit */
  maxOutputTokens?: number;
}

export interface InternalSession {
  state: AgentSessionState;
  pendingTool?: {
    tool: ToolCallPayload;
    runId: string;
  };
  /** Queue of tools waiting to be executed */
  toolQueue?: ToolCallPayload[];
  /** Tracks the current agentic run context for proper resumption */
  agenticContext?: AgenticContext;
}
