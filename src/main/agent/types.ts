import type { AgentSessionState, ToolCallPayload, LLMProviderName, RoutingDecision, ChatMessage } from '../../shared/types';

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
  
  /** Debug trace ID for this run */
  traceId?: string;
}

/**
 * A follow-up message queued for injection into the agent context.
 * These are user messages sent while the agent is actively running.
 */
export interface PendingFollowUp {
  /** The ChatMessage that was added to the session messages array */
  message: ChatMessage;
  /** Timestamp when the follow-up was received */
  receivedAt: number;
  /** Whether this follow-up has been acknowledged by the agent run loop */
  acknowledged: boolean;
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
  /** Queue of follow-up messages sent by the user while the agent is running */
  pendingFollowUps?: PendingFollowUp[];
}
