import type {
  AgentSessionState,
  AgentSettings,
  ToolCallEvent,
  WorkspaceEntry,
  ProgressGroup,
  ProgressItem,
  ArtifactCard,
  LLMProviderName,
  ContextMetricsSnapshot,
  StreamDeltaEvent,
} from '../../shared/types';
import { calculateMessageCost, calculateSessionCost } from '../../shared/utils/costEstimation';
import { createLogger } from '../utils/logger';
import {
  safeCreateSet,
  updateAssistantMessageContent,
  updateAssistantMessageToolCall,
  updateAssistantMessageThinking,
} from './agentReducerUtils';

const logger = createLogger('AgentReducer');



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
  callId: string; // Links artifact to tool call that created it
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

export interface AgentUIState {
  sessions: AgentSessionState[];
  activeSessionId?: string;
  workspaces: WorkspaceEntry[];
  settings?: AgentSettings;
  pendingConfirmations: Record<string, ToolCallEvent>;
  // Task-oriented state
  progressGroups: Record<string, ProgressGroup[]>; // sessionId -> groups
  artifacts: Record<string, ArtifactCard[]>; // sessionId -> artifacts
  // Streaming state - track which sessions are actively streaming
  streamingSessions: Set<string>;
  // Agent status per session (for showing summarization, etc.)
  agentStatus: Record<string, AgentStatusInfo>; // sessionId -> status
  // Real-time context window metrics per session (streamed from main)
  contextMetrics: Record<string, {
    provider: LLMProviderName;
    modelId?: string;
    runId?: string;
    timestamp: number;
    metrics: ContextMetricsSnapshot;
  }>;
  // Tool results by callId within each run
  // Structure: runId -> callId -> result
  toolResults: Record<string, Record<string, ToolResultState>>;
  // Inline artifacts by runId
  // Structure: runId -> artifacts
  inlineArtifacts: Record<string, InlineArtifactState[]>;
  // Task-based routing decisions per session
  routingDecisions: Record<string, RoutingDecisionState>;

  /** Cached per-session usage/cost summary for fast UI rendering (updated on SESSION_UPSERT only) */
  sessionCost: Record<string, {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCost: number;
    messageCount: number;
    byProvider: Record<string, { totalCost: number; totalTokens: number; messageCount: number }>;
  }>;
  // Real-time terminal output streaming by PID
  // Structure: pid -> terminal state
  terminalStreams: Record<number, TerminalStreamState>;
  // Real-time diff streaming for file operations
  streamingDiff?: {
    path: string;
    originalContent: string;
    modifiedContent: string;
    toolCallId: string;
  };
  // Phase 4: Communication state
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
}

export const initialState: AgentUIState = {
  sessions: [],
  workspaces: [],
  pendingConfirmations: {},
  progressGroups: {},
  artifacts: {},
  streamingSessions: new Set(),
  agentStatus: {},
  contextMetrics: {},
  terminalStreams: {},
  toolResults: {},
  inlineArtifacts: {},
  routingDecisions: {},
  sessionCost: {},
  // Phase 4: Communication
  pendingQuestions: [],
  pendingDecisions: [],
  communicationProgress: [],
};

function computeSessionCostSnapshot(messages: AgentSessionState['messages']): AgentUIState['sessionCost'][string] {
  const messagesWithUsage = messages
    .filter((m) => m.usage)
    .map((m) => ({ usage: m.usage!, modelId: m.modelId, provider: m.provider }));

  // Debug: Log when no messages have usage data
  if (messagesWithUsage.length === 0 && messages.length > 0) {
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    logger.debug('No messages with usage data found', {
      totalMessages: messages.length,
      assistantMessages: assistantMessages.length,
      sampleMessage: assistantMessages[0] ? {
        id: assistantMessages[0].id,
        hasUsage: !!assistantMessages[0].usage,
        hasProvider: !!assistantMessages[0].provider,
        hasModelId: !!assistantMessages[0].modelId,
      } : null,
    });
  }

  const summary = calculateSessionCost(messagesWithUsage);
  const byProvider = new Map<string, { totalCost: number; totalTokens: number; messageCount: number }>();

  for (const msg of messagesWithUsage) {
    if (!msg.provider) continue;
    const estimate = calculateMessageCost(msg.usage, msg.modelId, msg.provider);
    const tokens = msg.usage.total ?? (msg.usage.input + msg.usage.output);
    const current = byProvider.get(msg.provider) ?? { totalCost: 0, totalTokens: 0, messageCount: 0 };
    byProvider.set(msg.provider, {
      totalCost: current.totalCost + estimate.totalCost,
      totalTokens: current.totalTokens + tokens,
      messageCount: current.messageCount + 1,
    });
  }

  return {
    totalInputTokens: summary.totalInputTokens,
    totalOutputTokens: summary.totalOutputTokens,
    totalCost: summary.totalCost,
    messageCount: summary.messageCount,
    byProvider: Object.fromEntries(byProvider.entries()),
  };
}

export type AgentAction =
  | { type: 'SESSION_UPSERT'; payload: AgentSessionState }
  | { type: 'SESSION_SET_ACTIVE'; payload: string }
  | { type: 'SESSION_RENAME'; payload: { sessionId: string; title: string } }
  | { type: 'STREAM_DELTA'; payload: { sessionId: string; messageId?: string; delta?: string; toolCall?: StreamDeltaEvent['toolCall'] } }
  | { type: 'STREAM_DELTA_BATCH'; payload: { sessionId: string; messageId?: string; delta?: string; toolCall?: StreamDeltaEvent['toolCall'] } }
  | { type: 'STREAM_THINKING_DELTA'; payload: { sessionId: string; messageId?: string; delta: string } }
  | { type: 'RUN_STATUS'; payload: { sessionId: string; status: AgentSessionState['status']; runId: string } }
  | { type: 'WORKSPACES_UPDATE'; payload: WorkspaceEntry[] }
  | { type: 'SETTINGS_UPDATE'; payload: AgentSettings }
  | { type: 'PENDING_TOOL_ADD'; payload: ToolCallEvent }
  | { type: 'PENDING_TOOL_REMOVE'; payload: string }
  | { type: 'SESSION_DELETE'; payload: string }
  | { type: 'SESSIONS_CLEAR' } // Clear all sessions completely
  | { type: 'SESSIONS_CLEAR_FOR_WORKSPACE'; payload: string } // Clear sessions not belonging to workspace
  | { type: 'PROGRESS_UPDATE'; payload: { sessionId: string; groupId: string; groupTitle: string; startedAt: number; item: ProgressItem } }
  | { type: 'ARTIFACT_ADD'; payload: { sessionId: string; artifact: ArtifactCard } }
  | { type: 'CLEAR_SESSION_TASK_STATE'; payload: string }
  | { type: 'AGENT_STATUS_UPDATE'; payload: { sessionId: string; status: AgentStatusInfo } }
  | { type: 'CONTEXT_METRICS_UPDATE'; payload: { sessionId: string; provider: LLMProviderName; modelId?: string; runId?: string; timestamp: number; metrics: ContextMetricsSnapshot } }
  // Tool result integration actions
  | { type: 'TOOL_RESULT_RECEIVE'; payload: { runId: string; sessionId: string; callId: string; toolName: string; result: { success: boolean; output: string; metadata?: Record<string, unknown> } } }
  | { type: 'INLINE_ARTIFACT_ADD'; payload: { runId: string; artifact: InlineArtifactState } }
  | { type: 'RUN_CLEANUP'; payload: string } // Clean up tool results/artifacts for a runId
  // Media output actions (generated images/audio from multimodal models)
  | { type: 'MEDIA_OUTPUT_RECEIVE'; payload: { sessionId: string; messageId: string; mediaType: 'image' | 'audio'; data: string; mimeType: string } }
  // Task-based routing decision
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
      timestamp: number
    }
  }
  // Terminal streaming actions for real-time output display
  | { type: 'TERMINAL_OUTPUT'; payload: { pid: number; data: string; stream: 'stdout' | 'stderr' } }
  | { type: 'TERMINAL_EXIT'; payload: { pid: number; code: number } }
  | { type: 'TERMINAL_CLEAR'; payload: { pid: number } }
  // Phase 4: Communication actions
  | { type: 'COMMUNICATION_QUESTION_ADD'; payload: AgentUIState['pendingQuestions'][0] }
  | { type: 'COMMUNICATION_QUESTION_REMOVE'; payload: string } // questionId
  | { type: 'COMMUNICATION_DECISION_ADD'; payload: AgentUIState['pendingDecisions'][0] }
  | { type: 'COMMUNICATION_DECISION_REMOVE'; payload: string } // decisionId
  | { type: 'COMMUNICATION_PROGRESS_ADD'; payload: AgentUIState['communicationProgress'][0] }
  | { type: 'COMMUNICATION_PROGRESS_UPDATE'; payload: { id: string; progress: number; message?: string } }
  | { type: 'COMMUNICATION_PROGRESS_CLEAR'; payload?: string }; // runId or all if undefined



export const agentReducer = (state: AgentUIState, action: AgentAction): AgentUIState => {
  switch (action.type) {
    case 'SESSION_UPSERT': {
      const exists = state.sessions.find((session) => session.id === action.payload.id);

      // Debug: Log incoming session usage data
      const incomingMessagesWithUsage = action.payload.messages.filter(m => m.usage);
      if (action.payload.messages.length > 0) {
        logger.debug('SESSION_UPSERT received', {
          sessionId: action.payload.id,
          totalMessages: action.payload.messages.length,
          messagesWithUsage: incomingMessagesWithUsage.length,
          isExisting: !!exists,
          sampleUsage: incomingMessagesWithUsage[0]?.usage,
        });
      }

      // If session status changed to 'idle', clear any pending confirmations for this session
      let updatedPendingConfirmations = state.pendingConfirmations;
      if (action.payload.status === 'idle') {
        const sessionId = action.payload.id;
        const hasConfirmationsForSession = Object.values(state.pendingConfirmations)
          .some(conf => conf.sessionId === sessionId);
        if (hasConfirmationsForSession) {
          updatedPendingConfirmations = Object.fromEntries(
            Object.entries(state.pendingConfirmations)
              .filter(([, conf]) => conf.sessionId !== sessionId)
          );
        }
      }

      if (exists) {
        // Merge session state - use the incoming payload but preserve streamed content
        let nextSessionCost = state.sessionCost;
        const sessions = state.sessions.map((session) => {
          if (session.id === action.payload.id) {
            // Create a map of existing messages with their content and media for quick lookup
            const existingContentMap = new Map<string, {
              content: string;
              thinking?: string;
              isThinkingStreaming?: boolean;
              generatedImages?: Array<{ data: string; mimeType: string }>;
              generatedAudio?: { data: string; mimeType: string };
            }>();
            session.messages.forEach(msg => {
              if (msg.role === 'assistant' && (msg.content || msg.thinking || msg.isThinkingStreaming || msg.generatedImages || msg.generatedAudio)) {
                existingContentMap.set(msg.id, {
                  content: msg.content || '',
                  thinking: msg.thinking,
                  isThinkingStreaming: msg.isThinkingStreaming,
                  generatedImages: msg.generatedImages,
                  generatedAudio: msg.generatedAudio,
                });
              }
            });

            // Merge messages - preserve streamed content, thinking, and generated media for assistant messages
            const mergedMessages = action.payload.messages.map(incomingMsg => {
              if (incomingMsg.role === 'assistant') {
                const existing = existingContentMap.get(incomingMsg.id);
                if (existing) {
                  // Keep the longer content (streamed content vs backend content)
                  const preserveContent = existing.content.length > (incomingMsg.content?.length ?? 0);
                  const preserveThinking = existing.thinking &&
                    existing.thinking.length > (incomingMsg.thinking?.length ?? 0);

                  // Merge generated media - prefer incoming if it has media, else preserve existing
                  const hasIncomingImages = incomingMsg.generatedImages && incomingMsg.generatedImages.length > 0;
                  const hasIncomingAudio = !!incomingMsg.generatedAudio;

                  // If incoming message has tool calls or content, thinking is done
                  const hasToolCalls = incomingMsg.toolCalls && incomingMsg.toolCalls.length > 0;
                  const hasContent = incomingMsg.content && incomingMsg.content.trim().length > 0;
                  // Thinking is done if: has tool calls, has content, OR incoming explicitly says it's not streaming
                  const thinkingIsDone = hasToolCalls || hasContent || incomingMsg.isThinkingStreaming === false;

                  // Log for debugging media merge
                  if (existing.generatedImages?.length || incomingMsg.generatedImages?.length) {
                    logger.debug('SESSION_UPSERT media merge', {
                      messageId: incomingMsg.id,
                      existingImagesCount: existing.generatedImages?.length ?? 0,
                      incomingImagesCount: incomingMsg.generatedImages?.length ?? 0,
                      preserveContent,
                      preserveThinking,
                    });
                  }

                  return {
                    ...incomingMsg,
                    content: preserveContent ? existing.content : incomingMsg.content,
                    thinking: preserveThinking ? existing.thinking : incomingMsg.thinking,
                    // Mark thinking as done if we have tool calls or content
                    isThinkingStreaming: thinkingIsDone ? false : incomingMsg.isThinkingStreaming,
                    // Preserve existing media if incoming doesn't have it
                    generatedImages: hasIncomingImages ? incomingMsg.generatedImages : existing.generatedImages,
                    generatedAudio: hasIncomingAudio ? incomingMsg.generatedAudio : existing.generatedAudio,
                  };
                }
              }
              return incomingMsg;
            });

            // Update cached cost summary for this session (usage only)
            // NOTE: This is intentionally NOT updated on stream deltas.
            try {
              const costSnapshot = computeSessionCostSnapshot(mergedMessages);
              nextSessionCost = {
                ...nextSessionCost,
                [action.payload.id]: costSnapshot,
              };
            } catch (error) {
              // Defensive: cost snapshot computation should never break session updates
              logger.warn('Failed to compute session cost snapshot', {
                sessionId: action.payload.id,
                error: error instanceof Error ? error.message : String(error),
              });
            }

            // Log merged state for debugging media handling
            const messagesWithMedia = mergedMessages.filter(
              m => m.generatedImages?.length || m.generatedAudio
            );
            if (messagesWithMedia.length > 0) {
              logger.debug('SESSION_UPSERT merged messages with media', {
                sessionId: action.payload.id,
                messagesWithMediaCount: messagesWithMedia.length,
                mediaDetails: messagesWithMedia.map(m => ({
                  id: m.id,
                  imageCount: m.generatedImages?.length ?? 0,
                  hasAudio: !!m.generatedAudio,
                })),
              });
            }

            return {
              ...action.payload,
              messages: mergedMessages,
            };
          }
          return session;
        });
        return { ...state, sessions, pendingConfirmations: updatedPendingConfirmations, sessionCost: nextSessionCost };
      } else {
        // New session - add it
        const sessions = [...state.sessions, action.payload];
        const activeSessionId = state.activeSessionId ?? action.payload.id;
        let nextSessionCost = state.sessionCost;
        try {
          nextSessionCost = {
            ...state.sessionCost,
            [action.payload.id]: computeSessionCostSnapshot(action.payload.messages),
          };
        } catch (error) {
          logger.warn('Failed to compute session cost snapshot', {
            sessionId: action.payload.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return { ...state, sessions, activeSessionId, pendingConfirmations: updatedPendingConfirmations, sessionCost: nextSessionCost };
      }
    }
    case 'SESSION_SET_ACTIVE': {
      return { ...state, activeSessionId: action.payload };
    }
    case 'SESSION_RENAME': {
      const { sessionId, title } = action.payload;
      const sessions = state.sessions.map(session =>
        session.id === sessionId
          ? { ...session, title }
          : session
      );
      return { ...state, sessions };
    }
    case 'STREAM_DELTA':
    case 'STREAM_DELTA_BATCH': {
      // Optimized delta handling - only update what's needed
      let sessions = state.sessions;
      let streamingDiff = state.streamingDiff;

      if (action.payload.delta) {
        sessions = updateAssistantMessageContent(
          sessions,
          action.payload.sessionId,
          action.payload.messageId,
          action.payload.delta
        );
      }

      if (action.payload.toolCall) {
        const result = updateAssistantMessageToolCall(
          state,
          action.payload.sessionId,
          action.payload.messageId,
          action.payload.toolCall
        );
        sessions = result.sessions;
        streamingDiff = result.streamingDiff;
      }

      // Track streaming state
      const streamingSessions = safeCreateSet(state.streamingSessions);
      streamingSessions.add(action.payload.sessionId);

      return { ...state, sessions, streamingSessions, streamingDiff };
    }
    case 'STREAM_THINKING_DELTA': {
      // Handle thinking/reasoning content from thinking models (Gemini 2.5/3)
      // This is streamed separately from regular content and displayed in a collapsible panel
      const sessions = updateAssistantMessageThinking(
        state.sessions,
        action.payload.sessionId,
        action.payload.messageId,
        action.payload.delta
      );

      // Track streaming state
      const streamingSessions = safeCreateSet(state.streamingSessions);
      streamingSessions.add(action.payload.sessionId);

      return sessions === state.sessions
        ? state
        : { ...state, sessions, streamingSessions };
    }
    case 'RUN_STATUS': {
      const sessions = state.sessions.map((session) =>
        session.id === action.payload.sessionId
          ? { ...session, status: action.payload.status }
          : session,
      );

      // Clear streaming state when run ends or pauses for confirmation
      // Also mark thinking as complete on all assistant messages in the session
      const streamingSessions = safeCreateSet(state.streamingSessions);
      const shouldClearStreaming =
        action.payload.status === 'idle' ||
        action.payload.status === 'error' ||
        action.payload.status === 'awaiting-confirmation';

      if (shouldClearStreaming) {
        streamingSessions.delete(action.payload.sessionId);

        // Clear isThinkingStreaming flag on all messages
        const sessionIndex = sessions.findIndex(s => s.id === action.payload.sessionId);
        if (sessionIndex !== -1) {
          const session = sessions[sessionIndex];
          sessions[sessionIndex] = {
            ...session,
            messages: session.messages.map((m, i, arr) =>
              m.role === 'assistant' && i === arr.length - 1
                ? { ...m, isThinkingStreaming: false }
                : m
            )
          };
        }
      }

      const streamingDiff = shouldClearStreaming ? undefined : state.streamingDiff;
      return { ...state, sessions, streamingSessions, streamingDiff };
    }
    case 'WORKSPACES_UPDATE': {
      return { ...state, workspaces: action.payload };
    }
    case 'SETTINGS_UPDATE': {
      return { ...state, settings: action.payload };
    }
    case 'PENDING_TOOL_ADD': {
      return {
        ...state,
        pendingConfirmations: {
          ...state.pendingConfirmations,
          [action.payload.runId]: action.payload,
        },
      };
    }
    case 'PENDING_TOOL_REMOVE': {
      const next = { ...state.pendingConfirmations };
      delete next[action.payload];
      return { ...state, pendingConfirmations: next };
    }
    case 'SESSION_DELETE': {
      const sessions = state.sessions.filter((session) => session.id !== action.payload);
      const activeSessionId =
        state.activeSessionId === action.payload
          ? sessions[0]?.id
          : state.activeSessionId;

      // Clean up task state for deleted session - extract to separate variables for clarity
      const { [action.payload]: deletedProgress, ...remainingProgress } = state.progressGroups;
      const { [action.payload]: deletedArtifacts, ...remainingArtifacts } = state.artifacts;

      // Log cleanup in development
      if (process.env.NODE_ENV === 'development' && (deletedProgress || deletedArtifacts)) {
        logger.debug('Session cleanup', {
          sessionId: action.payload,
          hadProgress: !!deletedProgress,
          hadArtifacts: !!deletedArtifacts
        });
      }

      const nextSessionCost = { ...state.sessionCost };
      delete nextSessionCost[action.payload];

      return {
        ...state,
        sessions,
        activeSessionId,
        sessionCost: nextSessionCost,
        progressGroups: remainingProgress,
        artifacts: remainingArtifacts,
      };
    }
    case 'SESSIONS_CLEAR': {
      // Clear ALL sessions and related state completely
      // This is used when switching workspaces to ensure clean slate
      return {
        ...state,
        sessions: [],
        activeSessionId: undefined,
        progressGroups: {},
        artifacts: {},
        pendingConfirmations: {},
        agentStatus: {},
        streamingSessions: new Set(),
        toolResults: {},
        inlineArtifacts: {},
        sessionCost: {},
      };
    }
    case 'SESSIONS_CLEAR_FOR_WORKSPACE': {
      // Remove sessions that don't belong to the specified workspace
      const workspaceId = action.payload;
      const sessions = state.sessions.filter(
        (session) => session.workspaceId === workspaceId
      );

      // Clear active session if it doesn't belong to the workspace
      const activeSession = state.sessions.find(s => s.id === state.activeSessionId);
      const activeSessionId = (activeSession?.workspaceId === workspaceId)
        ? state.activeSessionId
        : sessions[0]?.id;

      // Clean up task state for removed sessions
      const removedSessionIds = new Set(
        state.sessions
          .filter(s => s.workspaceId !== workspaceId)
          .map(s => s.id)
      );

      const progressGroups = Object.fromEntries(
        Object.entries(state.progressGroups).filter(([id]) => !removedSessionIds.has(id))
      );
      const artifacts = Object.fromEntries(
        Object.entries(state.artifacts).filter(([id]) => !removedSessionIds.has(id))
      );

      const sessionCost = Object.fromEntries(
        Object.entries(state.sessionCost).filter(([id]) => !removedSessionIds.has(id))
      ) as AgentUIState['sessionCost'];

      return {
        ...state,
        sessions,
        activeSessionId,
        progressGroups,
        artifacts,
        sessionCost,
      };
    }
    case 'PROGRESS_UPDATE': {
      const { sessionId, groupId, groupTitle, startedAt, item } = action.payload;
      const existingGroups = state.progressGroups[sessionId] || [];
      const existingIndex = existingGroups.findIndex(g => g.id === groupId);

      let updatedGroup: ProgressGroup;
      if (existingIndex >= 0) {
        const currentGroup = existingGroups[existingIndex];
        const items = [...currentGroup.items];
        const itemIndex = items.findIndex((existingItem) => existingItem.id === item.id);
        if (itemIndex >= 0) {
          items[itemIndex] = { ...items[itemIndex], ...item };
        } else {
          items.push(item);
        }

        updatedGroup = {
          ...currentGroup,
          title: groupTitle || currentGroup.title,
          items,
          startedAt: Math.min(currentGroup.startedAt, startedAt),
        };
      } else {
        updatedGroup = {
          id: groupId,
          title: groupTitle,
          items: [item],
          isExpanded: false,
          startedAt,
        };
      }

      const updatedGroups = existingIndex >= 0
        ? existingGroups.map((g, i) => (i === existingIndex ? updatedGroup : g))
        : [...existingGroups, updatedGroup];

      return {
        ...state,
        progressGroups: {
          ...state.progressGroups,
          [sessionId]: updatedGroups,
        },
      };
    }
    case 'ARTIFACT_ADD': {
      const { sessionId, artifact } = action.payload;
      const existingArtifacts = state.artifacts[sessionId] || [];

      return {
        ...state,
        artifacts: {
          ...state.artifacts,
          [sessionId]: [...existingArtifacts, artifact],
        },
      };
    }
    case 'CLEAR_SESSION_TASK_STATE': {
      const sessionId = action.payload;
      return {
        ...state,
        progressGroups: {
          ...state.progressGroups,
          [sessionId]: [],
        },
        artifacts: {
          ...state.artifacts,
          [sessionId]: [],
        },
        // Clear tool results and inline artifacts for this session
        toolResults: {},
        inlineArtifacts: {},
      };
    }
    case 'AGENT_STATUS_UPDATE': {
      const { sessionId, status } = action.payload;
      return {
        ...state,
        agentStatus: {
          ...state.agentStatus,
          [sessionId]: status,
        },
      };
    }
    case 'TOOL_RESULT_RECEIVE': {
      const { runId, sessionId, callId, toolName, result } = action.payload;
      const runResults = state.toolResults[runId] || {};

      // Clear streaming diff when tool result is received
      const streamingDiff = state.streamingDiff?.toolCallId === callId ? undefined : state.streamingDiff;

      // Update the corresponding message in the session with resultMetadata
      let updatedSessions = state.sessions;
      const sessionIndex = updatedSessions.findIndex(s => s.id === sessionId);
      if (sessionIndex !== -1) {
        const session = updatedSessions[sessionIndex];
        const messageIndex = session.messages.findIndex(m => m.toolCallId === callId);
        if (messageIndex !== -1) {
          const newMessages = [...session.messages];
          newMessages[messageIndex] = {
            ...newMessages[messageIndex],
            resultMetadata: result.metadata,
          };
          updatedSessions = [...updatedSessions];
          updatedSessions[sessionIndex] = { ...session, messages: newMessages };
        }
      }

      // DEBUG: Log reducer state update
      logger.debug('TOOL_RESULT_RECEIVE', {
        runId,
        callId,
        toolName,
        hasResult: !!result,
        currentToolResultsKeys: Object.keys(state.toolResults),
        existingRunResults: Object.keys(runResults),
      });

      const newState = {
        ...state,
        sessions: updatedSessions,
        toolResults: {
          ...state.toolResults,
          [runId]: {
            ...runResults,
            [callId]: {
              callId,
              toolName,
              result,
              timestamp: Date.now(),
            },
          },
        },
        streamingDiff,
      };

      logger.debug('New toolResults keys', { keys: Object.keys(newState.toolResults) });

      return newState;
    }

    case 'INLINE_ARTIFACT_ADD': {
      const { runId, artifact } = action.payload;
      const existing = state.inlineArtifacts[runId] || [];

      return {
        ...state,
        inlineArtifacts: {
          ...state.inlineArtifacts,
          [runId]: [...existing, artifact],
        },
      };
    }
    case 'RUN_CLEANUP': {
      const runId = action.payload;
      const { [runId]: deletedResults, ...remainingResults } = state.toolResults;
      const { [runId]: deletedArtifacts, ...remainingArtifacts } = state.inlineArtifacts;

      // Log cleanup in development
      if (process.env.NODE_ENV === 'development' && (deletedResults || deletedArtifacts)) {
        logger.debug('Run cleanup', {
          runId,
          hadResults: !!deletedResults,
          hadArtifacts: !!deletedArtifacts,
          resultCount: Object.keys(deletedResults || {}).length,
          artifactCount: (deletedArtifacts || []).length,
        });
      }

      return {
        ...state,
        toolResults: remainingResults,
        inlineArtifacts: remainingArtifacts,
      };
    }
    case 'MEDIA_OUTPUT_RECEIVE': {
      // Add generated media to the specific message
      const { sessionId, messageId, mediaType, data, mimeType } = action.payload;

      logger.debug('MEDIA_OUTPUT_RECEIVE starting', {
        sessionId,
        messageId,
        mediaType,
        dataLength: data?.length,
      });

      const sessionIndex = state.sessions.findIndex(s => s.id === sessionId);
      if (sessionIndex === -1) {
        logger.warn('MEDIA_OUTPUT_RECEIVE: session not found', { sessionId });
        return state;
      }

      const session = state.sessions[sessionIndex];

      // Log existing messages for debugging
      logger.debug('MEDIA_OUTPUT_RECEIVE: searching for message', {
        sessionId,
        messageId,
        existingMessageIds: session.messages.map(m => ({ id: m.id, role: m.role })),
      });

      const messageIndex = session.messages.findIndex(m => m.id === messageId);
      if (messageIndex === -1) {
        logger.warn('MEDIA_OUTPUT_RECEIVE: message not found, trying last assistant', {
          messageId,
          availableIds: session.messages.map(m => m.id),
        });
        // If message not found, try to add to the last assistant message
        const lastAssistantIndex = session.messages.findIndex(
          (m, i, arr) => m.role === 'assistant' && i === arr.length - 1
        );
        if (lastAssistantIndex === -1) {
          logger.warn('MEDIA_OUTPUT_RECEIVE: no assistant message found');
          return state;
        }
      }

      const targetIndex = messageIndex !== -1 ? messageIndex : session.messages.length - 1;
      const targetMessage = session.messages[targetIndex];

      if (targetMessage.role !== 'assistant') return state;

      const newMessage = { ...targetMessage };

      if (mediaType === 'image') {
        const existingImages = newMessage.generatedImages || [];
        // Check for duplicates by comparing data content (avoid adding same image twice)
        const isDuplicate = existingImages.some(img => img.data === data && img.mimeType === mimeType);
        if (isDuplicate) {
          logger.debug('Skipping duplicate generated image', {
            messageId: newMessage.id,
            existingCount: existingImages.length,
            mimeType,
          });
          return state;
        }
        newMessage.generatedImages = [...existingImages, { data, mimeType }];
        logger.debug('Added generated image to message', {
          messageId: newMessage.id,
          imageCount: newMessage.generatedImages.length,
          mimeType,
        });
      } else if (mediaType === 'audio') {
        // Check for duplicate audio
        if (newMessage.generatedAudio?.data === data && newMessage.generatedAudio?.mimeType === mimeType) {
          logger.debug('Skipping duplicate generated audio', {
            messageId: newMessage.id,
            mimeType,
          });
          return state;
        }
        newMessage.generatedAudio = { data, mimeType };
        logger.debug('Added generated audio to message', {
          messageId: newMessage.id,
          mimeType,
        });
      }

      const newMessages = [...session.messages];
      newMessages[targetIndex] = newMessage;

      const newSession = { ...session, messages: newMessages };
      const newSessions = [...state.sessions];
      newSessions[sessionIndex] = newSession;

      logger.debug('MEDIA_OUTPUT_RECEIVE complete - new state', {
        sessionId,
        messageId: newMessage.id,
        imageCount: newMessage.generatedImages?.length ?? 0,
        hasAudio: !!newMessage.generatedAudio,
        totalMessages: newMessages.length,
      });

      return { ...state, sessions: newSessions };
    }
    case 'ROUTING_DECISION': {
      const { sessionId, decision, timestamp } = action.payload;
      return {
        ...state,
        routingDecisions: {
          ...state.routingDecisions,
          [sessionId]: {
            taskType: decision.taskType,
            selectedProvider: decision.selectedProvider,
            selectedModel: decision.selectedModel,
            confidence: decision.confidence,
            reason: decision.reason,
            timestamp,
            signals: decision.signals,
            alternatives: decision.alternatives,
            usedFallback: decision.usedFallback,
            originalProvider: decision.originalProvider,
            isCustomTask: decision.isCustomTask,
          },
        },
      };
    }
    // Phase 4: Communication actions
    case 'COMMUNICATION_QUESTION_ADD': {
      return {
        ...state,
        pendingQuestions: [...state.pendingQuestions, action.payload],
      };
    }
    case 'COMMUNICATION_QUESTION_REMOVE': {
      return {
        ...state,
        pendingQuestions: state.pendingQuestions.filter(q => q.id !== action.payload),
      };
    }
    case 'COMMUNICATION_DECISION_ADD': {
      return {
        ...state,
        pendingDecisions: [...state.pendingDecisions, action.payload],
      };
    }
    case 'COMMUNICATION_DECISION_REMOVE': {
      return {
        ...state,
        pendingDecisions: state.pendingDecisions.filter(d => d.id !== action.payload),
      };
    }
    case 'COMMUNICATION_PROGRESS_ADD': {
      return {
        ...state,
        communicationProgress: [...state.communicationProgress, action.payload],
      };
    }
    case 'COMMUNICATION_PROGRESS_UPDATE': {
      return {
        ...state,
        communicationProgress: state.communicationProgress.map(p =>
          p.id === action.payload.id
            ? { ...p, progress: action.payload.progress, message: action.payload.message ?? p.message }
            : p
        ),
      };
    }
    case 'COMMUNICATION_PROGRESS_CLEAR': {
      if (action.payload) {
        return {
          ...state,
          communicationProgress: state.communicationProgress.filter(p => p.runId !== action.payload),
        };
      }
      return {
        ...state,
        communicationProgress: [],
      };
    }
    default:
      return state;
  }
};
