/**
 * Task Reducer
 * 
 * Handles progress groups, artifacts, agent status, tool results, and todo state.
 */

import type { ProgressGroup, ProgressItem, ArtifactCard, LLMProviderName, ContextMetricsSnapshot } from '../../../shared/types';
import type { TodoItem } from '../../../shared/types/todo';
import type { AgentUIState, AgentStatusInfo, InlineArtifactState, RoutingDecisionState } from '../agentReducer';
import { createLogger } from '../../utils/logger';

const logger = createLogger('TaskReducer');

const MAX_TERMINAL_OUTPUT_CHARS = 200_000;

export type TaskAction =
  | { type: 'PROGRESS_UPDATE'; payload: { sessionId: string; groupId: string; groupTitle: string; startedAt: number; item: ProgressItem } }
  | { type: 'ARTIFACT_ADD'; payload: { sessionId: string; artifact: ArtifactCard } }
  | { type: 'CLEAR_SESSION_TASK_STATE'; payload: string }
  | { type: 'AGENT_STATUS_UPDATE'; payload: { sessionId: string; status: AgentStatusInfo } }
  | { type: 'CONTEXT_METRICS_UPDATE'; payload: { sessionId: string; provider: LLMProviderName; modelId?: string; runId?: string; timestamp: number; metrics: ContextMetricsSnapshot } }
  // Tool execution tracking for real-time UI feedback
  | { type: 'TOOL_EXECUTION_START'; payload: { runId: string; callId: string; name: string; arguments?: Record<string, unknown> } }
  | { type: 'TOOL_EXECUTION_FINISH'; payload: { runId: string; callId: string } }
  // Tool queue tracking - shows what's waiting to run
  | { type: 'TOOL_QUEUED'; payload: { runId: string; tools: Array<{ callId: string; name: string; arguments?: Record<string, unknown>; queuePosition: number }> } }
  | { type: 'TOOL_DEQUEUED'; payload: { runId: string; callId: string } }
  // Tool result actions for rich content display
  | { type: 'TOOL_RESULT_RECEIVE'; payload: { runId: string; callId: string; toolName: string; result: { success: boolean; output: string; metadata?: Record<string, unknown> } } }
  | { type: 'INLINE_ARTIFACT_ADD'; payload: { runId: string; artifact: InlineArtifactState } }
  | { type: 'RUN_CLEANUP'; payload: string }
  | { type: 'RUN_TOOLSTATE_CLEAR'; payload: string }
  // Media output actions (generated images/audio from multimodal models)
  | { type: 'MEDIA_OUTPUT_RECEIVE'; payload: { sessionId: string; messageId: string; mediaType: 'image' | 'audio'; data: string; mimeType: string } }
  // Task-based routing decision
  | { type: 'ROUTING_DECISION'; payload: { 
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
  // Todo list actions
  | { type: 'TODO_UPDATE'; payload: { sessionId: string; runId: string; todos: TodoItem[]; timestamp: number } }
  | { type: 'TODO_CLEAR'; payload: string };

/**
 * Handle progress group update (accumulates items per group)
 */
function handleProgressUpdate(
  state: AgentUIState,
  sessionId: string,
  groupId: string,
  groupTitle: string,
  startedAt: number,
  item: ProgressItem
): AgentUIState {
  const existingGroups = state.progressGroups[sessionId] || [];
  const existingIndex = existingGroups.findIndex(g => g.id === groupId);

  let updatedGroup: ProgressGroup;
  if (existingIndex >= 0) {
    const currentGroup = existingGroups[existingIndex];
    const items = [...currentGroup.items];
    const itemIndex = items.findIndex((i) => i.id === item.id);
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

/**
 * Task reducer
 */
export function taskReducer(
  state: AgentUIState,
  action: TaskAction
): AgentUIState {
  switch (action.type) {
    case 'PROGRESS_UPDATE':
      return handleProgressUpdate(
        state,
        action.payload.sessionId,
        action.payload.groupId,
        action.payload.groupTitle,
        action.payload.startedAt,
        action.payload.item
      );

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
      const { [sessionId]: _removedTodos, ...remainingTodos } = state.todos;
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
        todos: remainingTodos,
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

    case 'CONTEXT_METRICS_UPDATE': {
      const { sessionId, provider, modelId, runId, timestamp, metrics } = action.payload;
      return {
        ...state,
        contextMetrics: {
          ...state.contextMetrics,
          [sessionId]: {
            provider,
            modelId,
            runId,
            timestamp,
            metrics,
          },
        },
      };
    }

    // Tool execution tracking for real-time UI feedback
    case 'TOOL_EXECUTION_START': {
      const { runId, callId, name, arguments: args } = action.payload;
      const runTools = state.executingTools[runId] || {};
      
      return {
        ...state,
        executingTools: {
          ...state.executingTools,
          [runId]: {
            ...runTools,
            [callId]: {
              callId,
              name,
              arguments: args,
              startedAt: Date.now(),
            },
          },
        },
      };
    }

    case 'TOOL_EXECUTION_FINISH': {
      const { runId, callId } = action.payload;
      const runTools = state.executingTools[runId];
      if (!runTools || !runTools[callId]) {
        return state;
      }
      
      // Remove the finished tool from executing tools
      const { [callId]: _removed, ...remainingTools } = runTools;
      
      // If no more tools executing for this run, remove the run entry
      if (Object.keys(remainingTools).length === 0) {
        const { [runId]: _removedRun, ...remainingRuns } = state.executingTools;
        return {
          ...state,
          executingTools: remainingRuns,
        };
      }
      
      return {
        ...state,
        executingTools: {
          ...state.executingTools,
          [runId]: remainingTools,
        },
      };
    }

    // Tool queue tracking - shows what's waiting to run
    case 'TOOL_QUEUED': {
      const { runId, tools } = action.payload;
      const now = Date.now();
      
      // Replace the entire queue for this run with the new tools
      return {
        ...state,
        queuedTools: {
          ...state.queuedTools,
          [runId]: tools.map(tool => ({
            callId: tool.callId,
            name: tool.name,
            arguments: tool.arguments,
            queuePosition: tool.queuePosition,
            queuedAt: now,
          })),
        },
      };
    }

    case 'TOOL_DEQUEUED': {
      const { runId, callId } = action.payload;
      const runQueue = state.queuedTools[runId];
      
      if (!runQueue) {
        return state;
      }
      
      // Remove the tool from the queue
      const remainingQueue = runQueue.filter(t => t.callId !== callId);
      
      // Update queue positions for remaining tools
      const updatedQueue = remainingQueue.map((tool, index) => ({
        ...tool,
        queuePosition: index + 1,
      }));
      
      // If no more tools in queue, remove the run entry
      if (updatedQueue.length === 0) {
        const { [runId]: _removedRun, ...remainingRuns } = state.queuedTools;
        return {
          ...state,
          queuedTools: remainingRuns,
        };
      }
      
      return {
        ...state,
        queuedTools: {
          ...state.queuedTools,
          [runId]: updatedQueue,
        },
      };
    }

    // Tool result actions for rich content display
    case 'TOOL_RESULT_RECEIVE': {
      const { runId, callId, toolName, result } = action.payload;
      const runResults = state.toolResults[runId] || {};

      // DEBUG: Log reducer state update
      logger.debug('TOOL_RESULT_RECEIVE', {
        runId,
        callId,
        toolName,
        hasResult: !!result,
        hasMetadata: !!result?.metadata,
        currentToolResultsKeys: Object.keys(state.toolResults),
      });

      // Also remove from executing tools when result is received
      let executingTools = state.executingTools;
      const runTools = executingTools[runId];
      if (runTools) {
        let removedCallId: string | undefined;
        if (runTools[callId]) {
          removedCallId = callId;
        } else {
          // Fallback: remove by tool name if callId mismatch
          const match = Object.values(runTools).find((tool) => tool.name === toolName);
          removedCallId = match?.callId;
        }

        if (removedCallId) {
          const { [removedCallId]: _removed, ...remainingTools } = runTools;
        if (Object.keys(remainingTools).length === 0) {
          const { [runId]: _removedRun, ...remainingRuns } = executingTools;
          executingTools = remainingRuns;
        } else {
          executingTools = {
            ...executingTools,
            [runId]: remainingTools,
          };
        }
        }
      }

      // Also remove from queued tools in case tool-started was missed
      let queuedTools = state.queuedTools;
      const runQueue = queuedTools[runId];
      if (runQueue && runQueue.length > 0) {
        const filteredQueue = runQueue.filter((tool) => tool.callId !== callId && tool.name !== toolName);
        if (filteredQueue.length === 0) {
          const { [runId]: _removedRun, ...remainingRuns } = queuedTools;
          queuedTools = remainingRuns;
        } else if (filteredQueue.length !== runQueue.length) {
          queuedTools = {
            ...queuedTools,
            [runId]: filteredQueue.map((tool, index) => ({
              ...tool,
              queuePosition: index + 1,
            })),
          };
        }
      }

      return {
        ...state,
        executingTools,
        queuedTools,
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
      };
    }

    case 'INLINE_ARTIFACT_ADD': {
      const { runId, artifact } = action.payload;
      const existing = state.inlineArtifacts[runId] || {};

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
      const { [runId]: _deletedResults, ...remainingResults } = state.toolResults;
      const { [runId]: _deletedArtifacts, ...remainingArtifacts } = state.inlineArtifacts;
      const { [runId]: _deletedExecuting, ...remainingExecuting } = state.executingTools;
      const { [runId]: _deletedQueued, ...remainingQueued } = state.queuedTools;

      return {
        ...state,
        toolResults: remainingResults,
        inlineArtifacts: remainingArtifacts,
        executingTools: remainingExecuting,
        queuedTools: remainingQueued,
      };
    }

    case 'RUN_TOOLSTATE_CLEAR': {
      const runId = action.payload;
      const { [runId]: _deletedExecuting, ...remainingExecuting } = state.executingTools;
      const { [runId]: _deletedQueued, ...remainingQueued } = state.queuedTools;

      return {
        ...state,
        executingTools: remainingExecuting,
        queuedTools: remainingQueued,
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
      
      let targetIndex = session.messages.findIndex(m => m.id === messageId);
      if (targetIndex === -1) {
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
        targetIndex = session.messages.length - 1;
      }
      
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
      const routingDecision: RoutingDecisionState = {
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
      };
      return {
        ...state,
        routingDecisions: {
          ...state.routingDecisions,
          [sessionId]: routingDecision,
        },
      };
    }

    // Terminal streaming actions for real-time output display
    case 'TERMINAL_OUTPUT': {
      const { pid, data } = action.payload;
      const existing = state.terminalStreams[pid];

      if (!data) return state;

      // Keep memory bounded: store only the trailing portion of output.
      const existingTail = (existing?.output ?? '').slice(-MAX_TERMINAL_OUTPUT_CHARS);
      const incomingTail = data.length > MAX_TERMINAL_OUTPUT_CHARS
        ? data.slice(-MAX_TERMINAL_OUTPUT_CHARS)
        : data;

      const nextOutput = (existingTail + incomingTail).slice(-MAX_TERMINAL_OUTPUT_CHARS);
      
      return {
        ...state,
        terminalStreams: {
          ...state.terminalStreams,
          [pid]: {
            pid,
            output: nextOutput,
            isRunning: true,
            startedAt: existing?.startedAt ?? Date.now(),
          },
        },
      };
    }

    case 'TERMINAL_EXIT': {
      const { pid, code } = action.payload;
      const existing = state.terminalStreams[pid];
      
      if (!existing) return state;
      
      return {
        ...state,
        terminalStreams: {
          ...state.terminalStreams,
          [pid]: {
            ...existing,
            isRunning: false,
            exitCode: code,
          },
        },
      };
    }

    case 'TERMINAL_CLEAR': {
      const { pid } = action.payload;
      const { [pid]: _removed, ...remaining } = state.terminalStreams;
      
      return {
        ...state,
        terminalStreams: remaining,
      };
    }

    // Todo list actions
    case 'TODO_UPDATE': {
      const { sessionId, runId, todos, timestamp } = action.payload;
      return {
        ...state,
        todos: {
          ...state.todos,
          [sessionId]: { runId, todos, timestamp },
        },
      };
    }

    case 'TODO_CLEAR': {
      const sessionId = action.payload;
      const { [sessionId]: _removed, ...remainingTodos } = state.todos;
      return {
        ...state,
        todos: remainingTodos,
      };
    }

    default:
      return state;
  }
}

