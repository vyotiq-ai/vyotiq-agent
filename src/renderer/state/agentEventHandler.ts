/**
 * Agent Event Handler
 *
 * Handles incoming agent/renderer events and dispatches the appropriate
 * state actions. Extracted from AgentProvider for modularity.
 *
 * @module state/agentEventHandler
 */

import type {
  AgentEvent,
  AgentSessionState,
  RendererEvent,
  ProgressEvent,
  ArtifactEvent,
  AgentStatusEvent,
  ToolResultEvent,
  ToolCallEvent,
  ContextMetricsEvent,
  RoutingDecisionEvent,
  StreamDeltaEvent,
  TodoUpdateEvent,
} from '../../shared/types';
import type { AgentUIState, AgentAction } from './agentReducer';
import { computeSessionDelta } from './sessionDelta';
import { createLogger } from '../utils/logger';

const logger = createLogger('agentEventHandler');

// =============================================================================
// Types
// =============================================================================

/** Dependencies injected by AgentProvider at creation time */
export interface EventHandlerContext {
  /** Dispatch a single action */
  dispatch: (action: AgentAction) => void;
  /** Dispatch multiple actions as an atomic batch */
  dispatchBatch: (actions: AgentAction[]) => void;
  /** Batched dispatch for low-priority (non-urgent) events */
  batchedDispatch: (action: AgentAction) => void;
  /** Read current state snapshot without subscribing */
  getCurrentState: () => AgentUIState;
  /** Store reference for session lookups */
  getState: () => AgentUIState;
  /** Append content streaming delta */
  appendDelta: (sessionId: string, messageId: string, delta: string) => void;
  /** Append thinking streaming delta */
  appendThinkingDelta: (sessionId: string, messageId: string, delta: string) => void;
  /** Flush content buffer for a session */
  clearBuffer: (sessionId: string) => void;
  /** Flush thinking buffer for a session */
  clearThinkingBuffer: (sessionId: string) => void;
  /** Force-flush session streaming with optional finalize flag */
  flushSession: (sessionId: string, finalize: boolean) => void;
  /** Force-flush thinking session */
  flushThinkingSession: (sessionId: string, finalize: boolean) => void;
  /** Buffer terminal output and schedule flush */
  bufferTerminalOutput: (pid: number, stream: 'stdout' | 'stderr', data: string) => void;
  /** Ref for agent status dedup */
  lastAgentStatusRef: React.MutableRefObject<Record<string, { status: string; message?: string; timestamp: number; lastIteration?: number }>>;
}

// =============================================================================
// Output log factory (for BottomPanel Output tab)
// =============================================================================

const OUTPUT_LOG_FACTORIES: Record<string, (e: unknown) => { level: string; message: string; source: string } | null> = {
  'run-status': (e) => {
    const ev = e as { status?: string; message?: string };
    return {
      level: ev.status === 'error' ? 'error' : 'info',
      message: `Run ${ev.status ?? 'unknown'}${ev.message ? `: ${ev.message}` : ''}`,
      source: 'agent',
    };
  },
  'tool-call': (e) => {
    const tc = (e as { toolCall?: { name?: string } }).toolCall;
    return tc ? { level: 'info', message: `Tool call: ${tc.name}`, source: 'tool' } : null;
  },
  'tool-result': (e) => {
    const tr = (e as { result?: { toolName?: string; error?: string } }).result;
    return tr ? { level: tr.error ? 'error' : 'info', message: `Tool result: ${tr.toolName}${tr.error ? ' (error)' : ''}`, source: 'tool' } : null;
  },
  'agent-status': (e) => {
    const se = e as { message?: string };
    return se.message ? { level: 'info', message: se.message, source: 'agent' } : null;
  },
  'question-asked': () => ({ level: 'info', message: 'Agent is asking a question', source: 'communication' }),
  'decision-requested': () => ({ level: 'info', message: 'Agent requests a decision', source: 'communication' }),
  'terminal-error': (e) => ({ level: 'error', message: `Terminal error: ${(e as { error?: string }).error ?? 'unknown'}`, source: 'terminal' }),
};

function emitOutputLog(event: AgentEvent | RendererEvent): void {
  const factory = OUTPUT_LOG_FACTORIES[event.type];
  if (!factory) return;
  const entry = factory(event);
  if (entry) {
    document.dispatchEvent(new CustomEvent('vyotiq:output-log', {
      detail: { type: event.type, ...entry },
    }));
  }
}

// =============================================================================
// Main handler
// =============================================================================

/**
 * Creates the event handler function used by AgentProvider.
 * The returned function handles all agent/renderer events and dispatches
 * the appropriate actions via the provided context.
 */
export function createAgentEventHandler(ctx: EventHandlerContext) {
  return (event: AgentEvent | RendererEvent): void => {
    switch (event.type) {
      // -----------------------------------------------------------------------
      // Session events
      // -----------------------------------------------------------------------
      case 'session-state': {
        // Flush buffered streaming deltas BEFORE processing session state
        // to prevent content duplication race condition.
        ctx.flushSession(event.session.id, true);

        const existingSession = ctx.getState().sessions.find(s => s.id === event.session.id);
        if (existingSession) {
          const delta = computeSessionDelta(existingSession, event.session);
          if (delta) {
            ctx.dispatch({ type: 'SESSION_APPLY_DELTA', payload: delta });
          }
          // delta === null means no changes, skip dispatch
          break;
        }
        // New session — full upsert
        ctx.dispatch({ type: 'SESSION_UPSERT', payload: event.session });
        break;
      }

      case 'session-patch': {
        const patchEvent = event as import('../../shared/types').SessionPatchEvent;
        ctx.dispatch({
          type: 'SESSION_PATCH',
          payload: {
            sessionId: patchEvent.sessionId,
            patch: patchEvent.patch,
            messagePatch: patchEvent.messagePatch,
          },
        });
        break;
      }

      // -----------------------------------------------------------------------
      // Streaming events
      // -----------------------------------------------------------------------
      case 'stream-delta': {
        const deltaEvent = event as StreamDeltaEvent;
        if (deltaEvent.isThinking) {
          if (deltaEvent.delta) {
            ctx.appendThinkingDelta(deltaEvent.sessionId, deltaEvent.messageId, deltaEvent.delta);
          }
        } else if (deltaEvent.toolCall) {
          ctx.dispatch({
            type: 'STREAM_DELTA',
            payload: {
              sessionId: deltaEvent.sessionId,
              messageId: deltaEvent.messageId,
              toolCall: deltaEvent.toolCall,
            },
          });
        } else if (deltaEvent.delta) {
          ctx.appendDelta(deltaEvent.sessionId, deltaEvent.messageId, deltaEvent.delta);
        }
        break;
      }

      // -----------------------------------------------------------------------
      // Run lifecycle
      // -----------------------------------------------------------------------
      case 'run-status': {
        const runActions: AgentAction[] = [];

        if (event.status === 'running') {
          runActions.push({ type: 'CLEAR_SESSION_TASK_STATE', payload: event.sessionId });
          runActions.push({ type: 'RUN_ERROR_CLEAR', payload: event.sessionId });
        }
        if (event.status === 'idle' || event.status === 'error') {
          ctx.clearBuffer(event.sessionId);
          ctx.clearThinkingBuffer(event.sessionId);
        }
        runActions.push({
          type: 'RUN_STATUS',
          payload: { sessionId: event.sessionId, status: event.status, runId: event.runId },
        });
        if (event.status === 'error' && event.errorCode) {
          runActions.push({
            type: 'RUN_ERROR',
            payload: {
              sessionId: event.sessionId,
              errorCode: event.errorCode,
              message: event.message || 'An unknown error occurred',
              recoverable: event.recoverable ?? true,
              recoveryHint: event.recoveryHint,
            },
          });
        }
        if (event.status === 'idle' || event.status === 'error') {
          runActions.push({ type: 'PENDING_TOOL_REMOVE', payload: event.runId });
          if (event.runId) {
            runActions.push({ type: 'RUN_TOOLSTATE_CLEAR', payload: event.runId });
            runActions.push({ type: 'COMMUNICATION_PROGRESS_CLEAR', payload: event.runId });
          }
        }
        if (event.status === 'awaiting-confirmation' && event.runId) {
          runActions.push({ type: 'RUN_TOOLSTATE_CLEAR', payload: event.runId });
        }
        ctx.dispatchBatch(runActions);
        break;
      }

      // -----------------------------------------------------------------------
      // Tool events
      // -----------------------------------------------------------------------
      case 'tool-call': {
        const toolCallEvent = event as ToolCallEvent;
        if (toolCallEvent.toolCall && toolCallEvent.runId && !event.requiresApproval) {
          ctx.dispatch({
            type: 'TOOL_EXECUTION_START',
            payload: {
              runId: toolCallEvent.runId,
              callId: toolCallEvent.toolCall.callId,
              name: toolCallEvent.toolCall.name,
              arguments: toolCallEvent.toolCall.arguments as Record<string, unknown> | undefined,
            },
          });
        }
        if (event.requiresApproval) {
          ctx.dispatch({ type: 'PENDING_TOOL_ADD', payload: event });
        }
        break;
      }

      case 'tool-result': {
        const toolResultEvent = event as ToolResultEvent;
        const callId = toolResultEvent.toolCallId ||
          `${toolResultEvent.result.toolName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        logger.debug('Received tool-result event', {
          runId: toolResultEvent.runId,
          callId,
          toolName: toolResultEvent.result.toolName,
          hasMetadata: !!toolResultEvent.result.metadata,
          metadataKeys: toolResultEvent.result.metadata ? Object.keys(toolResultEvent.result.metadata) : [],
        });

        ctx.dispatchBatch([
          { type: 'PENDING_TOOL_REMOVE', payload: event.runId },
          { type: 'TOOL_EXECUTION_FINISH', payload: { runId: toolResultEvent.runId, callId } },
          {
            type: 'TOOL_RESULT_RECEIVE',
            payload: {
              runId: toolResultEvent.runId,
              sessionId: toolResultEvent.sessionId,
              callId,
              toolName: toolResultEvent.result.toolName,
              result: toolResultEvent.result,
            },
          },
        ]);
        break;
      }

      case 'tool-queued': {
        const queuedEvent = event as import('../../shared/types').ToolQueuedEvent;
        ctx.dispatch({
          type: 'TOOL_QUEUED',
          payload: { runId: queuedEvent.runId, tools: queuedEvent.tools },
        });
        break;
      }

      case 'tool-started': {
        const startedEvent = event as import('../../shared/types').ToolStartedEvent;
        ctx.dispatchBatch([
          {
            type: 'TOOL_DEQUEUED',
            payload: { runId: startedEvent.runId, callId: startedEvent.toolCall.callId },
          },
          {
            type: 'TOOL_EXECUTION_START',
            payload: {
              runId: startedEvent.runId,
              callId: startedEvent.toolCall.callId,
              name: startedEvent.toolCall.name,
              arguments: startedEvent.toolCall.arguments as Record<string, unknown> | undefined,
            },
          },
        ]);
        break;
      }

      // -----------------------------------------------------------------------
      // Media & diff streaming
      // -----------------------------------------------------------------------
      case 'media-output': {
        const mediaEvent = event as RendererEvent & {
          mediaType: 'image' | 'audio';
          data: string;
          mimeType: string;
          messageId: string;
        };
        ctx.dispatch({
          type: 'MEDIA_OUTPUT_RECEIVE',
          payload: {
            sessionId: event.sessionId,
            messageId: mediaEvent.messageId,
            mediaType: mediaEvent.mediaType,
            data: mediaEvent.data,
            mimeType: mediaEvent.mimeType,
          },
        });
        break;
      }

      case 'file-diff-stream': {
        const diffEvent = event as import('../../shared/types').FileDiffStreamEvent;
        ctx.dispatch({
          type: 'FILE_DIFF_STREAM',
          payload: {
            runId: diffEvent.runId,
            toolCallId: diffEvent.toolCallId,
            toolName: diffEvent.toolName,
            filePath: diffEvent.filePath,
            originalContent: diffEvent.originalContent,
            modifiedContent: diffEvent.modifiedContent,
            isNewFile: diffEvent.isNewFile,
            isComplete: diffEvent.isComplete,
            action: diffEvent.action,
          },
        });
        break;
      }

      // -----------------------------------------------------------------------
      // Settings, progress, artifacts
      // -----------------------------------------------------------------------
      case 'settings-update':
        ctx.batchedDispatch({ type: 'SETTINGS_UPDATE', payload: event.settings });
        break;

      case 'progress':
        ctx.batchedDispatch({
          type: 'PROGRESS_UPDATE',
          payload: {
            sessionId: (event as ProgressEvent).sessionId,
            groupId: (event as ProgressEvent).groupId,
            groupTitle: (event as ProgressEvent).groupTitle,
            startedAt: (event as ProgressEvent).timestamp,
            item: (event as ProgressEvent).item,
          },
        });
        break;

      case 'artifact':
        ctx.batchedDispatch({
          type: 'ARTIFACT_ADD',
          payload: {
            sessionId: (event as ArtifactEvent).sessionId,
            artifact: (event as ArtifactEvent).artifact,
          },
        });
        break;

      // -----------------------------------------------------------------------
      // Agent status (with throttle/dedup)
      // -----------------------------------------------------------------------
      case 'agent-status': {
        const statusEvent = event as AgentStatusEvent;
        const last = ctx.lastAgentStatusRef.current[statusEvent.sessionId];
        const now = Date.now();
        const isSameStatus = last?.status === statusEvent.status;
        const isSameMessage = last?.message === statusEvent.message;
        const recentlyUpdated = last ? (now - last.timestamp) < 1200 : false;

        const hasIterationChange =
          statusEvent.metadata?.currentIteration !== undefined &&
          (last as Record<string, unknown> | undefined)?.lastIteration !== statusEvent.metadata.currentIteration;

        // Drop noisy executing updates unless iteration changed
        if (
          !hasIterationChange &&
          statusEvent.status === 'executing' &&
          isSameStatus &&
          recentlyUpdated &&
          (!statusEvent.message || statusEvent.message.startsWith('Executing:'))
        ) {
          break;
        }

        if (!hasIterationChange && isSameStatus && isSameMessage && recentlyUpdated) {
          break;
        }

        ctx.lastAgentStatusRef.current[statusEvent.sessionId] = {
          status: statusEvent.status,
          message: statusEvent.message,
          timestamp: now,
          lastIteration: statusEvent.metadata?.currentIteration,
        };

        ctx.dispatch({
          type: 'AGENT_STATUS_UPDATE',
          payload: {
            sessionId: statusEvent.sessionId,
            status: {
              status: statusEvent.status === 'analyzing' ? 'summarizing' : statusEvent.status,
              message: statusEvent.message,
              timestamp: statusEvent.timestamp,
              contextUtilization: statusEvent.metadata?.contextUtilization,
              messageCount: statusEvent.metadata?.messageCount,
              currentIteration: statusEvent.metadata?.currentIteration,
              maxIterations: statusEvent.metadata?.maxIterations,
              runStartedAt: statusEvent.metadata?.runStartedAt,
              avgIterationTimeMs: statusEvent.metadata?.avgIterationTimeMs,
              provider: statusEvent.metadata?.provider,
              modelId: statusEvent.metadata?.modelId,
            },
          },
        });
        break;
      }

      // -----------------------------------------------------------------------
      // Context metrics
      // -----------------------------------------------------------------------
      case 'context-metrics': {
        const ctxEvent = event as ContextMetricsEvent;
        ctx.batchedDispatch({
          type: 'CONTEXT_METRICS_UPDATE',
          payload: {
            sessionId: ctxEvent.sessionId,
            provider: ctxEvent.provider,
            modelId: ctxEvent.modelId,
            runId: ctxEvent.runId,
            timestamp: ctxEvent.timestamp,
            metrics: ctxEvent.metrics,
          },
        });
        break;
      }

      // -----------------------------------------------------------------------
      // Debug events
      // -----------------------------------------------------------------------
      case 'debug:trace-start':
      case 'debug:trace-complete':
      case 'debug:llm-call':
      case 'debug:tool-call':
      case 'debug:tool-result':
      case 'debug:error':
      case 'debug:log': {
        if (process.env.NODE_ENV === 'development') {
          logger.debug('Debug event', { type: event.type });
        }
        break;
      }

      // -----------------------------------------------------------------------
      // Sessions bulk update
      // -----------------------------------------------------------------------
      case 'sessions-update': {
        const sessionsEvent = event as RendererEvent & { sessions?: AgentSessionState[] };
        const sessions = (sessionsEvent.sessions || []) as AgentSessionState[];
        const currentState = ctx.getCurrentState();

        if (sessions.length > 0) {
          const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
          const activeId = !currentState.activeSessionId ? sortedSessions[0].id : undefined;
          ctx.dispatch({
            type: 'SESSIONS_REPLACE',
            payload: { sessions, activeSessionId: activeId },
          });
        } else {
          ctx.dispatch({ type: 'SESSIONS_CLEAR' });
        }
        break;
      }

      // -----------------------------------------------------------------------
      // Routing decision
      // -----------------------------------------------------------------------
      case 'routing-decision': {
        const routingEvent = event as RoutingDecisionEvent;
        ctx.dispatch({
          type: 'ROUTING_DECISION',
          payload: {
            sessionId: routingEvent.sessionId,
            decision: {
              taskType: routingEvent.decision.detectedTaskType,
              selectedProvider: routingEvent.decision.selectedProvider ?? null,
              selectedModel: routingEvent.decision.selectedModel ?? null,
              confidence: routingEvent.decision.confidence,
              reason: routingEvent.decision.reason,
              signals: routingEvent.decision.signals,
              alternatives: routingEvent.decision.alternatives?.map((a: { taskType: string; confidence: number }) => ({
                taskType: a.taskType,
                confidence: a.confidence,
              })),
              usedFallback: routingEvent.decision.usedFallback,
              originalProvider: routingEvent.decision.originalProvider,
              isCustomTask: routingEvent.decision.isCustomTask,
            },
            timestamp: routingEvent.timestamp,
          },
        });
        break;
      }

      // -----------------------------------------------------------------------
      // Terminal events
      // -----------------------------------------------------------------------
      case 'terminal-output': {
        const terminalEvent = event as RendererEvent & { pid: number; data: string; stream: 'stdout' | 'stderr' };
        if (terminalEvent.data) {
          ctx.bufferTerminalOutput(terminalEvent.pid, terminalEvent.stream, terminalEvent.data);
        }
        break;
      }

      case 'terminal-exit': {
        const terminalEvent = event as RendererEvent & { pid: number; code: number };
        ctx.dispatch({
          type: 'TERMINAL_EXIT',
          payload: { pid: terminalEvent.pid, code: terminalEvent.code },
        });
        break;
      }

      case 'terminal-error': {
        const terminalEvent = event as RendererEvent & { pid: number; error: string };
        logger.warn('Terminal error', { pid: terminalEvent.pid, error: terminalEvent.error });
        ctx.dispatch({
          type: 'TERMINAL_EXIT',
          payload: { pid: terminalEvent.pid, code: -1 },
        });
        break;
      }

      // -----------------------------------------------------------------------
      // Communication events
      // -----------------------------------------------------------------------
      case 'question-asked': {
        const questionEvent = event as RendererEvent & { question: AgentUIState['pendingQuestions'][0] };
        ctx.dispatch({ type: 'COMMUNICATION_QUESTION_ADD', payload: questionEvent.question });
        break;
      }

      case 'question-answered':
      case 'question-skipped': {
        const questionEvent = event as RendererEvent & { questionId: string };
        ctx.dispatch({ type: 'COMMUNICATION_QUESTION_REMOVE', payload: questionEvent.questionId });
        break;
      }

      case 'decision-requested': {
        const decisionEvent = event as RendererEvent & { decision: AgentUIState['pendingDecisions'][0] };
        ctx.dispatch({ type: 'COMMUNICATION_DECISION_ADD', payload: decisionEvent.decision });
        break;
      }

      case 'decision-made':
      case 'decision-skipped': {
        const decisionEvent = event as RendererEvent & { decisionId: string };
        ctx.dispatch({ type: 'COMMUNICATION_DECISION_REMOVE', payload: decisionEvent.decisionId });
        break;
      }

      case 'progress-update': {
        const progressEvent = event as RendererEvent & { update: AgentUIState['communicationProgress'][0] };
        const existingIndex = ctx.getCurrentState().communicationProgress.findIndex(
          p => p.id === progressEvent.update.id
        );
        if (existingIndex >= 0) {
          ctx.batchedDispatch({
            type: 'COMMUNICATION_PROGRESS_UPDATE',
            payload: {
              id: progressEvent.update.id,
              progress: progressEvent.update.progress,
              message: progressEvent.update.message,
            },
          });
        } else {
          ctx.batchedDispatch({
            type: 'COMMUNICATION_PROGRESS_ADD',
            payload: progressEvent.update,
          });
        }
        break;
      }

      // -----------------------------------------------------------------------
      // Todo events
      // -----------------------------------------------------------------------
      case 'todo-update': {
        const todoEvent = event as TodoUpdateEvent;
        ctx.dispatch({
          type: 'TODO_UPDATE',
          payload: {
            sessionId: todoEvent.sessionId,
            runId: todoEvent.runId,
            todos: todoEvent.todos,
            timestamp: todoEvent.timestamp,
          },
        });
        break;
      }

      // -----------------------------------------------------------------------
      // Follow-up events (logging only)
      // -----------------------------------------------------------------------
      case 'follow-up-received': {
        const followUpEvent = event as RendererEvent & { sessionId: string; messageId: string; content: string };
        logger.info('Follow-up received by agent', {
          sessionId: followUpEvent.sessionId,
          messageId: followUpEvent.messageId,
        });
        break;
      }

      case 'follow-up-injected': {
        const injectedEvent = event as RendererEvent & { sessionId: string; messageId: string; runId: string; iteration: number };
        logger.info('Follow-up injected into agent context', {
          sessionId: injectedEvent.sessionId,
          messageId: injectedEvent.messageId,
          runId: injectedEvent.runId,
          iteration: injectedEvent.iteration,
        });
        break;
      }

      default:
        break;
    }

    // Emit to BottomPanel Output tab
    emitOutputLog(event);
  };
}
