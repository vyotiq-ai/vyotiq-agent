import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, startTransition, useSyncExternalStore } from 'react';
import type {
  AgentConfig,
  AgentEvent,
  AgentSessionState,
  AgentSettings,
  AttachmentPayload,
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
import { initialState, type AgentUIState, type AgentAction } from './agentReducer';
import { combinedAgentReducer } from './reducers';
import { useStreamingBuffer } from '../hooks/useStreamingBuffer';
import { createLogger } from '../utils/logger';
import { withIpcRetry } from '../utils/ipcRetry';
import { computeSessionDelta } from './sessionDelta';
import { getCurrentWorkspacePath } from './WorkspaceProvider';

// Force full page reload on HMR to avoid React context identity issues
// Context objects get new identity on module reload, breaking consumers using stale context
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot?.invalidate();
  });
}

const logger = createLogger('AgentProvider');

// Track if initial data has been loaded to prevent duplicate loading in StrictMode
const initialDataLoadedRef = { current: false };

// Event batching configuration for performance optimization
// Using ~60fps interval for smooth updates while batching low-priority events
const EVENT_BATCH_INTERVAL_MS = 16;
const LOW_PRIORITY_EVENTS = new Set([
  // NOTE: These must match AgentAction['type'] values, not incoming event.type strings.
  'SETTINGS_UPDATE',
  'PROGRESS_UPDATE',
  'ARTIFACT_ADD',
  'CONTEXT_METRICS_UPDATE',
]);

interface AgentActions {
  startSession: (initialConfig?: Partial<AgentSettings['defaultConfig']>, workspacePath?: string | null) => Promise<string | undefined>;
  createSession: () => Promise<string | undefined>;
  sendMessage: (content: string, attachments?: AttachmentPayload[], initialConfig?: Partial<AgentSettings['defaultConfig']>) => Promise<void>;
  sendFollowUp: (sessionId: string, content: string, attachments?: AttachmentPayload[]) => Promise<void>;
  confirmTool: (runId: string, approved: boolean, sessionId: string, feedback?: string) => Promise<void>;
  setActiveSession: (sessionId: string) => void;
  updateSessionConfig: (sessionId: string, config: Partial<AgentSessionState['config']>) => Promise<void>;
  cancelRun: (sessionId: string) => Promise<void>;
  pauseRun: (sessionId: string) => Promise<boolean>;
  resumeRun: (sessionId: string) => Promise<boolean>;
  isRunPaused: (sessionId: string) => Promise<boolean>;
  deleteSession: (sessionId: string) => Promise<void>;
  regenerate: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, newTitle: string) => Promise<void>;
  addReaction: (sessionId: string, messageId: string, reaction: 'up' | 'down' | null) => Promise<void>;
}

type AgentStore = {
  getState: () => AgentUIState;
  subscribe: (listener: () => void) => () => void;
  dispatch: (action: AgentAction) => void;
  dispatchBatch: (actions: AgentAction[]) => void;
  actions: AgentActions;
};

// Exported for internal use by hooks that need to check if they're inside the provider
export const AgentContext = createContext<AgentStore | undefined>(undefined);

const defaultIsEqual = Object.is;

export function useAgentSelector<T>(selector: (state: AgentUIState) => T, isEqual: (a: T, b: T) => boolean = defaultIsEqual) {
  const store = useContext(AgentContext);
  if (!store) {
    throw new Error('useAgentSelector must be used within AgentProvider');
  }

  // Store selector/isEqual in refs so getSelectedSnapshot remains stable
  // even when call sites pass inline lambdas (which are new refs each render).
  // This prevents useSyncExternalStore from re-subscribing every render.
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;

  const lastSelectionRef = useRef<T | undefined>(undefined);
  const lastHasSelectionRef = useRef(false);

  // Stable getSelectedSnapshot — never recreated, reads selector from ref
  const getSelectedSnapshot = useCallback(() => {
    const nextSelection = selectorRef.current(store.getState());
    if (lastHasSelectionRef.current && isEqualRef.current(lastSelectionRef.current as T, nextSelection)) {
      return lastSelectionRef.current as T;
    }
    lastSelectionRef.current = nextSelection;
    lastHasSelectionRef.current = true;
    return nextSelection;
  }, [store]);

  return useSyncExternalStore(store.subscribe, getSelectedSnapshot, getSelectedSnapshot);
}

export function useAgentActions() {
  const store = useContext(AgentContext);
  if (!store) {
    throw new Error('useAgentActions must be used within AgentProvider');
  }
  return store.actions;
}

export function useAgentState() {
  return useAgentSelector((s) => s);
}

export const AgentProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const storeRef = useRef<AgentStore | null>(null);

  if (!storeRef.current) {
    let currentState = initialState;
    const listeners = new Set<() => void>();

    const getState = () => currentState;
    const subscribe = (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    };

    const notify = () => {
      for (const listener of listeners) {
        listener();
      }
    };

    const dispatch = (action: AgentAction) => {
      const nextState = combinedAgentReducer(currentState, action);
      if (nextState === currentState) return;
      currentState = nextState;
      notify();
    };

    /**
     * Batch-dispatch multiple actions but notify listeners only once.
     * Avoids N separate notify() → useSyncExternalStore snapshot cycles
     * when a single event (e.g. run-status) produces 2-5 actions.
     */
    const dispatchBatch = (actions: AgentAction[]) => {
      let changed = false;
      for (const action of actions) {
        const nextState = combinedAgentReducer(currentState, action);
        if (nextState !== currentState) {
          currentState = nextState;
          changed = true;
        }
      }
      if (changed) notify();
    };

    storeRef.current = {
      getState,
      subscribe,
      dispatch,
      dispatchBatch,
      actions: {} as AgentActions,
    };
  }

  const store = storeRef.current;
  const dispatchRef = useRef(store.dispatch);
  const dispatchBatchRef = useRef(store.dispatchBatch);
  dispatchRef.current = store.dispatch;

  // Event batching refs for low-priority updates
  const eventBatchRef = useRef<AgentAction[]>([]);
  const batchTimerRef = useRef<number | null>(null);

  // Optimized dispatch that batches low-priority events
  const batchedDispatch = useCallback((action: AgentAction) => {
    // High-priority events dispatch immediately
    if (!LOW_PRIORITY_EVENTS.has(action.type)) {
      dispatchRef.current(action);
      return;
    }

    // Low-priority events are batched
    eventBatchRef.current.push(action);

    // Schedule batch flush if not already scheduled
    // Use setTimeout with EVENT_BATCH_INTERVAL_MS for predictable batching
    if (batchTimerRef.current === null) {
      batchTimerRef.current = window.setTimeout(() => {
        const batch = eventBatchRef.current;
        eventBatchRef.current = [];
        batchTimerRef.current = null;

        if (batch.length === 0) return;

        // Dispatch all batched events in a transition to avoid blocking
        startTransition(() => {
          for (const action of batch) {
            dispatchRef.current(action);
          }
        });
      }, EVENT_BATCH_INTERVAL_MS);
    }
  }, []);

  // Cleanup batch timer on unmount — flush any pending events first
  useEffect(() => {
    return () => {
      if (batchTimerRef.current !== null) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }
      // Flush remaining batched events so they aren't silently dropped
      const remaining = eventBatchRef.current;
      if (remaining.length > 0) {
        eventBatchRef.current = [];
        for (const action of remaining) {
          dispatchRef.current(action);
        }
      }
    };
  }, []);

  // Use streaming buffer to batch delta updates for smooth rendering
  // Using 32ms (~30fps) — provides smooth word-by-word streaming while keeping React responsive.
  // Stream deltas dispatch immediately (not via startTransition) for real-time text display.
  const { appendDelta, clearBuffer, flushSession } = useStreamingBuffer({
    flushInterval: 32, // ~30 updates/sec — smooth word-by-word flow
    maxBufferSize: 100, // Force-flush at 100 chars to keep display current
    onFlush: useCallback((sessionId: string, messageId: string, accumulatedDelta: string) => {
      // Dispatch stream deltas at normal priority for immediate rendering.
      // The streaming buffer already throttles to ~30fps, so startTransition is
      // unnecessary here and would delay text display by an additional frame.
      dispatchRef.current({
        type: 'STREAM_DELTA_BATCH',
        payload: { sessionId, messageId, delta: accumulatedDelta },
      });
    }, []),
  });

  // Separate streaming buffer for thinking/reasoning deltas.
  // Previously thinking deltas were dispatched directly (unbuffered), causing:
  // 1. Excessive state updates per token (one dispatch per chunk)
  // 2. No smooth word-by-word rendering — chunks arrived too fast or too slow
  // Now thinking deltas get the same 32ms batching as content deltas.
  const { appendDelta: appendThinkingDelta, clearBuffer: clearThinkingBuffer, flushSession: flushThinkingSession } = useStreamingBuffer({
    flushInterval: 32,
    maxBufferSize: 100,
    onFlush: useCallback((sessionId: string, messageId: string, accumulatedDelta: string) => {
      dispatchRef.current({
        type: 'STREAM_THINKING_DELTA',
        payload: { sessionId, messageId, delta: accumulatedDelta },
      });
    }, []),
  });

  // Access current state without re-rendering the provider
  const getCurrentState = useCallback(() => store.getState(), [store]);

  // Buffer terminal output bursts to avoid dispatching (and string-appending) per chunk.
  const terminalBufferRef = useRef(new Map<number, Array<{ stream: 'stdout' | 'stderr'; data: string }>>());
  const terminalFlushTimerRef = useRef<number | null>(null);
  const lastAgentStatusRef = useRef<Record<string, { status: string; message?: string; timestamp: number; lastIteration?: number }>>({});

  const flushTerminalBuffers = useCallback(() => {
    const buffers = terminalBufferRef.current;
    if (buffers.size === 0) return;

    terminalBufferRef.current = new Map();

    startTransition(() => {
      for (const [pid, chunks] of buffers.entries()) {
        if (chunks.length === 0) continue;
        const combined = chunks.map((c) => c.data).join('');
        if (!combined) continue;
        dispatchRef.current({
          type: 'TERMINAL_OUTPUT',
          payload: {
            pid,
            data: combined,
            // Preserve the last stream type (UI currently renders as plain text anyway)
            stream: chunks[chunks.length - 1]?.stream ?? 'stdout',
          },
        });
      }
    });
  }, []);

  const scheduleTerminalFlush = useCallback(() => {
    if (terminalFlushTimerRef.current !== null) return;
    terminalFlushTimerRef.current = window.setTimeout(() => {
      terminalFlushTimerRef.current = null;
      flushTerminalBuffers();
    }, 33);
  }, [flushTerminalBuffers]);

  // Cleanup terminal flush timer on unmount — flush remaining data first
  useEffect(() => {
    return () => {
      if (terminalFlushTimerRef.current !== null) {
        clearTimeout(terminalFlushTimerRef.current);
        terminalFlushTimerRef.current = null;
      }
      // Flush any remaining terminal output so data isn't lost
      flushTerminalBuffers();
    };
  }, [flushTerminalBuffers]);

  const handleAgentEvent = useCallback(
    (event: AgentEvent | RendererEvent) => {
      switch (event.type) {
        case 'session-state': {
          // CRITICAL: Flush any buffered streaming deltas BEFORE processing session state
          // This prevents a race condition where:
          // 1. Deltas are buffered but not yet dispatched
          // 2. Session-state arrives with full content
          // 3. Merge keeps incoming content (buffer not flushed yet)
          // 4. Buffer flushes and appends content again → DUPLICATION
          flushSession(event.session.id, true);

          // Try delta-based update for existing sessions to reduce GC pressure.
          // Falls back to full SESSION_UPSERT for new sessions or when delta fails.
          const existingSession = store.getState().sessions.find(s => s.id === event.session.id);
          if (existingSession) {
            const delta = computeSessionDelta(existingSession, event.session);
            if (delta) {
              dispatchRef.current({ type: 'SESSION_APPLY_DELTA', payload: delta });
              break;
            }
            // delta === null means no changes, skip dispatch entirely
            break;
          }

          // New session — full upsert
          dispatchRef.current({ type: 'SESSION_UPSERT', payload: event.session });
          break;
        }
        case 'session-patch': {
          // Lightweight session update — O(1) patch for trivial field changes
          // (rename, config, reaction) without serializing/deserializing all messages
          const patchEvent = event as import('../../shared/types').SessionPatchEvent;
          dispatchRef.current({
            type: 'SESSION_PATCH',
            payload: {
              sessionId: patchEvent.sessionId,
              patch: patchEvent.patch,
              messagePatch: patchEvent.messagePatch,
            },
          });
          break;
        }
        case 'stream-delta': {
          const deltaEvent = event as StreamDeltaEvent;
          if (deltaEvent.isThinking) {
            // Buffer thinking deltas for smooth word-by-word streaming
            // Same 32ms batching as content deltas for consistent rendering
            if (deltaEvent.delta) {
              appendThinkingDelta(deltaEvent.sessionId, deltaEvent.messageId, deltaEvent.delta);
            }
          } else if (deltaEvent.toolCall) {
            // Forward tool call deltas directly
            dispatchRef.current({
              type: 'STREAM_DELTA',
              payload: {
                sessionId: deltaEvent.sessionId,
                messageId: deltaEvent.messageId,
                toolCall: deltaEvent.toolCall,
              },
            });
          } else if (deltaEvent.delta) {
            // Use buffered delta updates instead of immediate dispatch
            // This is already batched by useStreamingBuffer
            appendDelta(deltaEvent.sessionId, deltaEvent.messageId, deltaEvent.delta);
          }
          break;
        }
        case 'run-status': {
          // Run status changes are urgent - user needs immediate feedback.
          // Collect all actions and dispatch them in a single batch to avoid
          // multiple notify() → useSyncExternalStore snapshot cycles.
          const runActions: AgentAction[] = [];

          if (event.status === 'running') {
            // Clear task state from previous runs when a new run starts
            runActions.push({ type: 'CLEAR_SESSION_TASK_STATE', payload: event.sessionId });
            // Clear any previous run error when a new run starts
            runActions.push({ type: 'RUN_ERROR_CLEAR', payload: event.sessionId });
          }
          if (event.status === 'idle' || event.status === 'error') {
            clearBuffer(event.sessionId);
            clearThinkingBuffer(event.sessionId);
          }
          runActions.push({
            type: 'RUN_STATUS',
            payload: { sessionId: event.sessionId, status: event.status, runId: event.runId },
          });
          // Dispatch structured error info when run fails
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
            }
          }
          if (event.status === 'awaiting-confirmation' && event.runId) {
            // Awaiting approval: ensure no tools show as running/queued
            runActions.push({ type: 'RUN_TOOLSTATE_CLEAR', payload: event.runId });
          }
          dispatchBatchRef.current(runActions);
          break;
        }
        case 'tool-call': {
          // Track tool execution start for immediate UI feedback
          // This enables showing the tool as "running" instantly
          const toolCallEvent = event as ToolCallEvent;
          if (toolCallEvent.toolCall && toolCallEvent.runId && !event.requiresApproval) {
            dispatchRef.current({
              type: 'TOOL_EXECUTION_START',
              payload: {
                runId: toolCallEvent.runId,
                callId: toolCallEvent.toolCall.callId,
                name: toolCallEvent.toolCall.name,
                arguments: toolCallEvent.toolCall.arguments as Record<string, unknown> | undefined,
              },
            });
          }
          
          // Only add to pending confirmations if approval is actually required
          // This prevents flickering when tools auto-execute in yolo mode
          if (event.requiresApproval) {
            dispatchRef.current({ type: 'PENDING_TOOL_ADD', payload: event });
          }
          break;
        }
        case 'tool-result': {
          // Dispatch tool result to state for inline display in ToolExecution
          const toolResultEvent = event as ToolResultEvent;
          // Use the actual toolCallId from the event, fallback to generated if not available
          const callId = toolResultEvent.toolCallId ||
            `${toolResultEvent.result.toolName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

          logger.debug('Received tool-result event', {
            runId: toolResultEvent.runId,
            callId,
            toolName: toolResultEvent.result.toolName,
            hasMetadata: !!toolResultEvent.result.metadata,
            metadataKeys: toolResultEvent.result.metadata ? Object.keys(toolResultEvent.result.metadata) : [],
          });

          // Batch PENDING_TOOL_REMOVE + TOOL_RESULT_RECEIVE into a single notify
          dispatchBatchRef.current([
            { type: 'PENDING_TOOL_REMOVE', payload: event.runId },
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
          // Track queued tools for immediate UI feedback
          // Shows users what tools are waiting to execute
          const queuedEvent = event as import('../../shared/types').ToolQueuedEvent;
          dispatchRef.current({
            type: 'TOOL_QUEUED',
            payload: {
              runId: queuedEvent.runId,
              tools: queuedEvent.tools,
            },
          });
          break;
        }

        case 'tool-started': {
          // Tool is now actively executing (distinct from tool-call which may require approval)
          // Batch both dequeue + execution start into a single notify cycle
          const startedEvent = event as import('../../shared/types').ToolStartedEvent;
          dispatchBatchRef.current([
            {
              type: 'TOOL_DEQUEUED',
              payload: {
                runId: startedEvent.runId,
                callId: startedEvent.toolCall.callId,
              },
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

        case 'media-output': {
          // Handle generated media (images, audio) from multimodal models
          // @see https://ai.google.dev/gemini-api/docs/image-generation
          const mediaEvent = event as RendererEvent & {
            mediaType: 'image' | 'audio';
            data: string;
            mimeType: string;
            messageId: string;
          };
          dispatchRef.current({
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
          // Real-time file diff streaming — enables inline diff display as files are modified
          const diffEvent = event as import('../../shared/types').FileDiffStreamEvent;
          dispatchRef.current({
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

        case 'settings-update':
          // Settings updates are non-urgent - use batched dispatch
          batchedDispatch({ type: 'SETTINGS_UPDATE', payload: event.settings });
          break;
        case 'progress':
          // Progress updates can be batched
          batchedDispatch({
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
          // Artifact updates can be batched
          batchedDispatch({
            type: 'ARTIFACT_ADD',
            payload: {
              sessionId: (event as ArtifactEvent).sessionId,
              artifact: (event as ArtifactEvent).artifact,
            },
          });
          break;
        case 'agent-status': {
          // Agent status updates (summarizing, analyzing, iteration progress, etc.)
          const statusEvent = event as AgentStatusEvent;
          const last = lastAgentStatusRef.current[statusEvent.sessionId];
          const now = Date.now();
          const isSameStatus = last?.status === statusEvent.status;
          const isSameMessage = last?.message === statusEvent.message;
          const recentlyUpdated = last ? (now - last.timestamp) < 1200 : false;

          // CRITICAL: Never drop events that carry iteration metadata changes.
          // Iteration counter updates must reach the UI immediately so
          // IterationControl and InputHeader display correct progress.
          const hasIterationChange =
            statusEvent.metadata?.currentIteration !== undefined &&
            (last as Record<string, unknown> | undefined)?.lastIteration !== statusEvent.metadata.currentIteration;

          // Drop noisy, repetitive executing updates — but NOT if iteration changed
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

          lastAgentStatusRef.current[statusEvent.sessionId] = {
            status: statusEvent.status,
            message: statusEvent.message,
            timestamp: now,
            lastIteration: statusEvent.metadata?.currentIteration,
          };

          dispatchRef.current({
            type: 'AGENT_STATUS_UPDATE',
            payload: {
              sessionId: statusEvent.sessionId,
              status: {
                status: statusEvent.status === 'analyzing' ? 'summarizing' : statusEvent.status,
                message: statusEvent.message,
                timestamp: statusEvent.timestamp,
                contextUtilization: statusEvent.metadata?.contextUtilization,
                messageCount: statusEvent.metadata?.messageCount,
                // Iteration tracking for progress display
                currentIteration: statusEvent.metadata?.currentIteration,
                maxIterations: statusEvent.metadata?.maxIterations,
                runStartedAt: statusEvent.metadata?.runStartedAt,
                avgIterationTimeMs: statusEvent.metadata?.avgIterationTimeMs,
                // Provider/model info for current iteration
                provider: statusEvent.metadata?.provider,
                modelId: statusEvent.metadata?.modelId,
              },
            },
          });
          break;
        }

        case 'context-metrics': {
          // Context metrics are non-urgent - use batched dispatch
          const ctxEvent = event as ContextMetricsEvent;
          batchedDispatch({
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
        // Debug events - log them in development
        case 'debug:trace-start':
        case 'debug:trace-complete':
        case 'debug:llm-call':
        case 'debug:tool-call':
        case 'debug:tool-result':
        case 'debug:error':
        case 'debug:log': {
          // Debug events can be handled here if needed
          if (process.env.NODE_ENV === 'development') {
            logger.debug('Debug event', { type: event.type });
          }
          break;
        }
        case 'sessions-update': {
          // Bulk sessions update from backend - atomically replace all sessions
          const sessionsEvent = event as RendererEvent & { sessions?: AgentSessionState[] };
          const sessions = (sessionsEvent.sessions || []) as AgentSessionState[];

          const currentState = getCurrentState();

          // Use atomic SESSIONS_REPLACE to avoid empty-state flash between clear and upsert
          if (sessions.length > 0) {
            const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
            const activeId = !currentState.activeSessionId ? sortedSessions[0].id : undefined;
            dispatchRef.current({
              type: 'SESSIONS_REPLACE',
              payload: { sessions, activeSessionId: activeId },
            });
          } else {
            // No sessions from backend — clear all
            dispatchRef.current({ type: 'SESSIONS_CLEAR' });
          }
          break;
        }
        case 'routing-decision': {
          // Task-based routing decision event
          const routingEvent = event as RoutingDecisionEvent;
          dispatchRef.current({
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
        // Terminal streaming events for real-time output display
        case 'terminal-output': {
          const terminalEvent = event as RendererEvent & { pid: number; data: string; stream: 'stdout' | 'stderr' };
          if (terminalEvent.data) {
            const existing = terminalBufferRef.current.get(terminalEvent.pid) ?? [];
            existing.push({ stream: terminalEvent.stream, data: terminalEvent.data });
            terminalBufferRef.current.set(terminalEvent.pid, existing);
            scheduleTerminalFlush();
          }
          break;
        }
        case 'terminal-exit': {
          const terminalEvent = event as RendererEvent & { pid: number; code: number };
          dispatchRef.current({
            type: 'TERMINAL_EXIT',
            payload: {
              pid: terminalEvent.pid,
              code: terminalEvent.code,
            },
          });
          break;
        }
        case 'terminal-error': {
          // Terminal errors are handled similarly to exit
          const terminalEvent = event as RendererEvent & { pid: number; error: string };
          logger.warn('Terminal error', { pid: terminalEvent.pid, error: terminalEvent.error });
          dispatchRef.current({
            type: 'TERMINAL_EXIT',
            payload: {
              pid: terminalEvent.pid,
              code: -1,
            },
          });
          break;
        }
        // Phase 4: Communication events
        case 'question-asked': {
          const questionEvent = event as RendererEvent & { question: AgentUIState['pendingQuestions'][0] };
          dispatchRef.current({
            type: 'COMMUNICATION_QUESTION_ADD',
            payload: questionEvent.question,
          });
          break;
        }
        case 'question-answered':
        case 'question-skipped': {
          const questionEvent = event as RendererEvent & { questionId: string };
          dispatchRef.current({
            type: 'COMMUNICATION_QUESTION_REMOVE',
            payload: questionEvent.questionId,
          });
          break;
        }
        case 'decision-requested': {
          const decisionEvent = event as RendererEvent & { decision: AgentUIState['pendingDecisions'][0] };
          dispatchRef.current({
            type: 'COMMUNICATION_DECISION_ADD',
            payload: decisionEvent.decision,
          });
          break;
        }
        case 'decision-made':
        case 'decision-skipped': {
          const decisionEvent = event as RendererEvent & { decisionId: string };
          dispatchRef.current({
            type: 'COMMUNICATION_DECISION_REMOVE',
            payload: decisionEvent.decisionId,
          });
          break;
        }
        case 'progress-update': {
          const progressEvent = event as RendererEvent & { update: AgentUIState['communicationProgress'][0] };
          // Check if update already exists - use batched dispatch as this is non-urgent
          const existingIndex = getCurrentState().communicationProgress.findIndex(
            p => p.id === progressEvent.update.id
          );
          if (existingIndex >= 0) {
            batchedDispatch({
              type: 'COMMUNICATION_PROGRESS_UPDATE',
              payload: {
                id: progressEvent.update.id,
                progress: progressEvent.update.progress,
                message: progressEvent.update.message,
              },
            });
          } else {
            batchedDispatch({
              type: 'COMMUNICATION_PROGRESS_ADD',
              payload: progressEvent.update,
            });
          }
          break;
        }
        case 'todo-update': {
          // Handle todo list updates from the TodoWrite tool
          const todoEvent = event as TodoUpdateEvent;
          dispatchRef.current({
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
        case 'follow-up-received': {
          // Follow-up was received by the main process and added to the session
          // The session-state event will handle updating messages in the UI
          const followUpEvent = event as RendererEvent & { sessionId: string; messageId: string; content: string };
          logger.info('Follow-up received by agent', {
            sessionId: followUpEvent.sessionId,
            messageId: followUpEvent.messageId,
          });
          break;
        }
        case 'follow-up-injected': {
          // Follow-up was acknowledged by the agent run loop and will be used in next iteration
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

      // ---- Output log dispatch ----
      // Fire a vyotiq:output-log CustomEvent for key events so the BottomPanel
      // Output tab captures real-time agent activity.
      const outputLogTypes: Record<string, (e: unknown) => { level: string; message: string; source: string } | null> = {
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

      const logFactory = outputLogTypes[event.type];
      if (logFactory) {
        const logEntry = logFactory(event);
        if (logEntry) {
          document.dispatchEvent(new CustomEvent('vyotiq:output-log', {
            detail: { type: event.type, ...logEntry },
          }));
        }
      }
    },
    [appendDelta, appendThinkingDelta, clearBuffer, clearThinkingBuffer, flushSession, flushThinkingSession, batchedDispatch, getCurrentState, scheduleTerminalFlush, store],
  );

  // Track if vyotiq API is ready
  const [apiReady, setApiReady] = useState(() => !!window.vyotiq?.agent);
  const [apiError, setApiError] = useState<string | null>(null);
  
  // Check for API readiness with better error handling
  useEffect(() => {
    if (apiReady) return;
    
    let attempts = 0;
    const maxAttempts = 100; // 5 seconds at 50ms intervals
    
    // Poll for API availability
    const checkInterval = setInterval(() => {
      attempts++;
      if (window.vyotiq?.agent) {
        setApiReady(true);
        setApiError(null);
        clearInterval(checkInterval);
        logger.info('window.vyotiq API became available', { attempts });
      } else if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
      }
    }, 50);
    
    // Cleanup after 5 seconds and set error state
    const timeout = setTimeout(() => {
      clearInterval(checkInterval);
      if (!window.vyotiq?.agent) {
        const errorMessage = 'Failed to initialize agent API. Please restart the application.';
        logger.error('window.vyotiq API never became available', { attempts });
        setApiError(errorMessage);
        // Dispatch an error status to the first session if any
        dispatchRef.current({
          type: 'AGENT_STATUS_UPDATE',
          payload: {
            sessionId: '__global__',
            status: {
              status: 'error',
              message: errorMessage,
              timestamp: Date.now(),
            },
          },
        });
      }
    }, 5000);
    
    return () => {
      clearInterval(checkInterval);
      clearTimeout(timeout);
    };
  }, [apiReady]);

  useEffect(() => {
    // Guard against preload script not being ready
    if (!apiReady || !window.vyotiq?.agent) {
      logger.warn('window.vyotiq not available yet');
      return;
    }

    const unsubscribe = window.vyotiq.agent.onEvent((event: RendererEvent) => {
      handleAgentEvent(event as AgentEvent);
    });

    // Load initial data
    // Use a flag to prevent duplicate loading in React StrictMode
    const loadInitialData = async () => {
      // Prevent duplicate loading in StrictMode
      if (initialDataLoadedRef.current) {
        return;
      }
      initialDataLoadedRef.current = true;

      try {
        // 1. Load all sessions (with retry for IPC handler race condition)
        dispatchRef.current({ type: 'SESSIONS_CLEAR' });

        const sessions = await withIpcRetry(
          () => window.vyotiq.agent.getSessions(),
          { operationLabel: 'agent:get-sessions', maxAttempts: 5, retryDelayMs: 300 }
        );
        if (Array.isArray(sessions) && sessions.length > 0) {
          // Debug: Log session usage data availability
          const sessionsWithUsage = (sessions as AgentSessionState[]).filter(s =>
            s.messages.some(m => m.usage)
          );
          logger.debug('Loading sessions with usage data', {
            totalSessions: sessions.length,
            sessionsWithUsage: sessionsWithUsage.length,
            sampleSession: sessions[0] ? {
              id: (sessions[0] as AgentSessionState).id,
              messageCount: (sessions[0] as AgentSessionState).messages.length,
              messagesWithUsage: (sessions[0] as AgentSessionState).messages.filter(m => m.usage).length,
            } : null,
          });

          // PERFORMANCE: Bulk-load all sessions in ONE dispatch instead of N individual ones.
          const sortedSessions = [...sessions].sort((a, b) =>
            (b as AgentSessionState).updatedAt - (a as AgentSessionState).updatedAt
          );
          dispatchRef.current({
            type: 'SESSIONS_BULK_UPSERT',
            payload: {
              sessions: sessions as AgentSessionState[],
              activeSessionId: sortedSessions.length > 0 ? (sortedSessions[0] as AgentSessionState).id : undefined,
            },
          });

          logger.info('Loaded sessions', {
            count: sessions.length,
          });
        } else {
          logger.info('No sessions found');
        }

        // 3. Load settings (with guard and retry for IPC handler race condition)
        if (window.vyotiq?.settings?.get) {
          const settings = await withIpcRetry(
            () => window.vyotiq.settings.get(),
            { operationLabel: 'settings:get', maxAttempts: 5, retryDelayMs: 300 }
          );
          dispatchRef.current({ type: 'SETTINGS_UPDATE', payload: settings });
        }

      } catch (error) {
        logger.error('Failed to load initial data', { error: error instanceof Error ? error.message : String(error) });
      }
    };

    loadInitialData();

    return () => {
      unsubscribe();
      // Reset flag on unmount to allow reloading if component remounts
      initialDataLoadedRef.current = false;
    };
  }, [handleAgentEvent, apiReady]);

  const startSession = useCallback(async (initialConfig?: Partial<AgentConfig>, workspacePath?: string | null) => {
    if (!window.vyotiq?.agent) return undefined;

    try {
      const session = (await window.vyotiq.agent.startSession({
        initialConfig,
        workspacePath: workspacePath ?? null,
      })) as AgentSessionState | undefined;

      if (session?.id) {
        dispatchRef.current({ type: 'SESSION_SET_ACTIVE', payload: session.id });
        logger.info('Created session', { sessionId: session.id });
      }
      return session?.id;
    } catch (error) {
      logger.error('Failed to start session', { error: error instanceof Error ? error.message : String(error) });
      return undefined;
    }
  }, []);

  const sendMessage = useCallback(
    async (content: string, attachments: AttachmentPayload[], initialConfig?: Partial<AgentConfig>) => {
      if (!window.vyotiq?.agent) {
        logger.error('Agent IPC not available');
        return;
      }

      const currentState = store.getState();
      let sessionId = currentState.activeSessionId;

      // If no session exists, create one
      if (!sessionId) {
        logger.info('No active session, creating new session');
        const latestState = store.getState();
        // Pass the current workspace path so the backend has context for tool execution
        const currentWorkspace = getCurrentWorkspacePath();
        sessionId = (await startSession(initialConfig, currentWorkspace)) ?? latestState.sessions?.[latestState.sessions?.length - 1]?.id;
      }

      if (!sessionId) {
        logger.error('Failed to get or create session');
        return;
      }

      try {
        logger.info('Sending message', {
          sessionId,
          contentLength: content.length,
          attachmentCount: attachments.length,
        });

        await window.vyotiq.agent.sendMessage({
          sessionId,
          content,
          attachments,
        });

        logger.info('Message sent successfully', { sessionId });
      } catch (error) {
        logger.error('Failed to send message', { error: error instanceof Error ? error.message : String(error) });
        throw error; // Re-throw to let the UI know about the error
      }
    },
    [startSession, store],
  );

  const sendFollowUp = useCallback(
    async (sessionId: string, content: string, attachments?: AttachmentPayload[]) => {
      if (!window.vyotiq?.agent?.sendFollowUp) {
        logger.error('Agent IPC sendFollowUp not available');
        return;
      }

      try {
        logger.info('Sending follow-up to running session', {
          sessionId,
          contentLength: content.length,
          attachmentCount: attachments?.length ?? 0,
        });

        const result = await window.vyotiq.agent.sendFollowUp({
          sessionId,
          content,
          attachments,
        });

        if (result && !result.success) {
          logger.warn('Follow-up delivery failed', { sessionId, error: result.error });
        } else {
          logger.info('Follow-up sent successfully', { sessionId });
        }
      } catch (error) {
        logger.error('Failed to send follow-up', { error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    },
    [],
  );

  const confirmTool = useCallback(async (runId: string, approved: boolean, sessionId: string, feedback?: string) => {
    if (!window.vyotiq?.agent) return;
    await window.vyotiq.agent.confirmTool({
      runId,
      approved,
      sessionId,
      feedback,
      action: feedback ? 'feedback' : (approved ? 'approve' : 'deny'),
    });
    dispatchRef.current({ type: 'PENDING_TOOL_REMOVE', payload: runId });
  }, []);

  const setActiveSession = useCallback((sessionId: string) => {
    dispatchRef.current({ type: 'SESSION_SET_ACTIVE', payload: sessionId });
  }, []);

  const updateSessionConfig = useCallback(async (sessionId: string, config: Partial<AgentSessionState['config']>) => {
    if (!window.vyotiq?.agent) {
      logger.warn('No agent API available for updateSessionConfig');
      return;
    }
    try {
      await window.vyotiq.agent.updateConfig({ sessionId, config });
    } catch (error) {
      logger.error('Failed to update session config', {
        sessionId,
        config,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }, []);

  const cancelRun = useCallback(async (sessionId: string) => {
    logger.info('cancelRun called', { sessionId, hasAgent: !!window.vyotiq?.agent });
    if (!window.vyotiq?.agent) {
      logger.error('No agent API available for cancelRun');
      return;
    }
    try {
      await window.vyotiq.agent.cancelRun(sessionId);
      logger.info('cancelRun completed', { sessionId });
    } catch (error) {
      logger.error('cancelRun failed', { sessionId, error: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  const pauseRun = useCallback(async (sessionId: string): Promise<boolean> => {
    logger.info('pauseRun called', { sessionId });
    if (!window.vyotiq?.agent) {
      logger.error('No agent API available for pauseRun');
      return false;
    }
    try {
      const result = await window.vyotiq.agent.pauseRun(sessionId);
      logger.info('pauseRun completed', { sessionId, result });
      return result?.success ?? false;
    } catch (error) {
      logger.error('pauseRun failed', { sessionId, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }, []);

  const resumeRun = useCallback(async (sessionId: string): Promise<boolean> => {
    logger.info('resumeRun called', { sessionId });
    if (!window.vyotiq?.agent) {
      logger.error('No agent API available for resumeRun');
      return false;
    }
    try {
      const result = await window.vyotiq.agent.resumeRun(sessionId);
      logger.info('resumeRun completed', { sessionId, result });
      return result?.success ?? false;
    } catch (error) {
      logger.error('resumeRun failed', { sessionId, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }, []);

  const isRunPaused = useCallback(async (sessionId: string): Promise<boolean> => {
    if (!window.vyotiq?.agent) return false;
    try {
      return await window.vyotiq.agent.isRunPaused(sessionId);
    } catch (err) {
      logger.debug('Failed to check if run is paused', { sessionId, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!window.vyotiq?.agent) return;
    try {
      await window.vyotiq.agent.deleteSession(sessionId);
      dispatchRef.current({ type: 'SESSION_DELETE', payload: sessionId });
    } catch (err) {
      logger.error('Failed to delete session', { sessionId, error: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const regenerate = useCallback(async (sessionId: string) => {
    if (!window.vyotiq?.agent) return;
    await window.vyotiq.agent.regenerate(sessionId);
  }, []);

  const createSession = useCallback(async () => {
    // Always pass the current workspace path so the session has context for tool execution
    return startSession(undefined, getCurrentWorkspacePath());
  }, [startSession]);

  const renameSession = useCallback(async (sessionId: string, newTitle: string) => {
    if (!window.vyotiq?.agent) return;
    dispatchRef.current({ type: 'SESSION_RENAME', payload: { sessionId, title: newTitle } });
    await window.vyotiq.agent.renameSession(sessionId, newTitle);
  }, []);

  const addReaction = useCallback(async (sessionId: string, messageId: string, reaction: 'up' | 'down' | null) => {
    if (!window.vyotiq?.agent) return;
    try {
      await window.vyotiq.agent.addReaction(sessionId, messageId, reaction);
    } catch (error) {
      logger.error('Failed to add reaction', { error: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  const value = useMemo<AgentActions>(() => ({
    startSession,
    createSession,
    sendMessage,
    sendFollowUp,
    confirmTool,
    setActiveSession,
    updateSessionConfig,
    cancelRun,
    pauseRun,
    resumeRun,
    isRunPaused,
    deleteSession,
    regenerate,
    renameSession,
    addReaction,
  }), [cancelRun, pauseRun, resumeRun, isRunPaused, confirmTool, createSession, renameSession, sendMessage, sendFollowUp, setActiveSession, startSession, updateSessionConfig, deleteSession, regenerate, addReaction]);

  // Populate the store's stable actions object via useLayoutEffect so
  // actions are available before the browser paints (and before any user
  // interaction can fire).  We mutate the existing object with
  // Object.assign instead of replacing the reference so that consumers
  // who captured store.actions during render always see the latest
  // functions without needing a re-render.
  useLayoutEffect(() => {
    Object.assign(store.actions, value);
  }, [store, value]);

  return (
    <AgentContext.Provider value={store}>
      {apiError && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            background: 'var(--color-error-bg, #2d1215)',
            color: 'var(--color-error, #f87171)',
            borderBottom: '1px solid var(--color-error-border, #5c2023)',
            fontSize: '13px',
            textAlign: 'center',
          }}
        >
          {apiError}
        </div>
      )}
      {children}
    </AgentContext.Provider>
  );
};

export const useAgent = () => {
  const state = useAgentState();
  const actions = useAgentActions();
  return { state, actions };
};

