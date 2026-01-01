import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, startTransition, useSyncExternalStore } from 'react';
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
  ContextMetricsEvent,
  RoutingDecisionEvent,
  StreamDeltaEvent,
} from '../../shared/types';
import { initialState, type AgentUIState, type AgentAction } from './agentReducer';
import { combinedAgentReducer } from './reducers';
import { useStreamingBuffer } from '../hooks/useStreamingBuffer';
import { createLogger } from '../utils/logger';

const logger = createLogger('AgentProvider');

// Track if initial data has been loaded to prevent duplicate loading in StrictMode
const initialDataLoadedRef = { current: false };

// Event batching configuration for performance optimization
// Using ~60fps interval for smooth updates while batching low-priority events
const EVENT_BATCH_INTERVAL_MS = 16;
const LOW_PRIORITY_EVENTS = new Set([
  // NOTE: These must match AgentAction['type'] values, not incoming event.type strings.
  'WORKSPACES_UPDATE',
  'SETTINGS_UPDATE',
  'PROGRESS_UPDATE',
  'ARTIFACT_ADD',
  'CONTEXT_METRICS_UPDATE',
]);

interface AgentActions {
  startSession: (initialConfig?: Partial<AgentSettings['defaultConfig']>) => Promise<string | undefined>;
  createSession: () => Promise<string | undefined>;
  sendMessage: (content: string, attachments?: AttachmentPayload[], initialConfig?: Partial<AgentSettings['defaultConfig']>) => Promise<void>;
  confirmTool: (runId: string, approved: boolean, sessionId: string, feedback?: string) => Promise<void>;
  setActiveSession: (sessionId: string) => void;
  openWorkspaceDialog: () => Promise<void>;
  setActiveWorkspace: (workspaceId: string) => Promise<void>;
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
  actions: AgentActions;
};

const AgentContext = createContext<AgentStore | undefined>(undefined);

const defaultIsEqual = Object.is;

export function useAgentSelector<T>(selector: (state: AgentUIState) => T, isEqual: (a: T, b: T) => boolean = defaultIsEqual) {
  const store = useContext(AgentContext);
  if (!store) {
    throw new Error('useAgentSelector must be used within AgentProvider');
  }

  const lastSelectionRef = useRef<T | undefined>(undefined);
  const lastHasSelectionRef = useRef(false);

  const getSelectedSnapshot = useCallback(() => {
    const nextSelection = selector(store.getState());
    if (lastHasSelectionRef.current && isEqual(lastSelectionRef.current as T, nextSelection)) {
      return lastSelectionRef.current as T;
    }
    lastSelectionRef.current = nextSelection;
    lastHasSelectionRef.current = true;
    return nextSelection;
  }, [store, selector, isEqual]);

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

    storeRef.current = {
      getState,
      subscribe,
      dispatch,
      actions: {} as AgentActions,
    };
  }

  const store = storeRef.current;
  const dispatchRef = useRef(store.dispatch);
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

  // Cleanup batch timer on unmount
  useEffect(() => {
    return () => {
      if (batchTimerRef.current !== null) {
        clearTimeout(batchTimerRef.current);
      }
    };
  }, []);

  // Use streaming buffer to batch delta updates for smooth rendering
  // Using 33ms (~30fps) for a smooth typewriter effect without excessive re-renders
  const { appendDelta, clearBuffer, flushSession } = useStreamingBuffer({
    flushInterval: 33, // ~30 updates per second for smooth typewriter effect
    maxBufferSize: 80, // Flush if buffer exceeds 80 chars for responsiveness
    onFlush: useCallback((sessionId: string, messageId: string, accumulatedDelta: string) => {
      // Treat streaming UI updates as low-priority to keep input responsive
      startTransition(() => {
        dispatchRef.current({
          type: 'STREAM_DELTA_BATCH',
          payload: { sessionId, messageId, delta: accumulatedDelta },
        });
      });
    }, []),
  });

  // Access current state without re-rendering the provider
  const getCurrentState = useCallback(() => store.getState(), [store]);

  // Buffer terminal output bursts to avoid dispatching (and string-appending) per chunk.
  const terminalBufferRef = useRef(new Map<number, Array<{ stream: 'stdout' | 'stderr'; data: string }>>());
  const terminalFlushTimerRef = useRef<number | null>(null);

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

  useEffect(() => {
    return () => {
      if (terminalFlushTimerRef.current !== null) {
        clearTimeout(terminalFlushTimerRef.current);
      }
    };
  }, []);

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

          // Session state updates need to be synchronous to ensure message structure
          // is updated before stream-delta events try to append to messages
          dispatchRef.current({ type: 'SESSION_UPSERT', payload: event.session });
          break;
        }
        case 'stream-delta': {
          const deltaEvent = event as StreamDeltaEvent;
          if (deltaEvent.isThinking) {
            // Dispatch thinking delta directly (not buffered for real-time feedback)
            dispatchRef.current({
              type: 'STREAM_THINKING_DELTA',
              payload: {
                sessionId: deltaEvent.sessionId,
                messageId: deltaEvent.messageId,
                delta: deltaEvent.delta || ''
              }
            });
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
        case 'run-status':
          // Run status changes are urgent - user needs immediate feedback
          if (event.status === 'running') {
            // Clear task state from previous runs when a new run starts
            dispatchRef.current({ type: 'CLEAR_SESSION_TASK_STATE', payload: event.sessionId });
          }
          if (event.status === 'idle' || event.status === 'error') {
            clearBuffer(event.sessionId);
          }
          dispatchRef.current({
            type: 'RUN_STATUS',
            payload: { sessionId: event.sessionId, status: event.status, runId: event.runId },
          });
          if (event.status === 'idle' || event.status === 'error') {
            dispatchRef.current({ type: 'PENDING_TOOL_REMOVE', payload: event.runId });
          }
          break;
        case 'tool-call': {
          // Only add to pending confirmations if approval is actually required
          // This prevents flickering when tools auto-execute in yolo mode
          if (event.requiresApproval) {
            dispatchRef.current({ type: 'PENDING_TOOL_ADD', payload: event });
          }
          break;
        }
        case 'tool-result': {
          dispatchRef.current({ type: 'PENDING_TOOL_REMOVE', payload: event.runId });
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

          dispatchRef.current({
            type: 'TOOL_RESULT_RECEIVE',
            payload: {
              runId: toolResultEvent.runId,
              sessionId: toolResultEvent.sessionId,
              callId,
              toolName: toolResultEvent.result.toolName,
              result: toolResultEvent.result,
            },
          });
          break;
        }

        case 'workspace-update':
          // Workspace updates are non-urgent - use batched dispatch
          batchedDispatch({ type: 'WORKSPACES_UPDATE', payload: event.workspaces });
          break;
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
          // Bulk sessions update from backend - replace all sessions
          const sessionsEvent = event as RendererEvent & { sessions?: AgentSessionState[] };
          const sessions = (sessionsEvent.sessions || []) as AgentSessionState[];

          const currentState = getCurrentState();

          // Clear existing sessions and reload from backend list
          dispatchRef.current({ type: 'SESSIONS_CLEAR' });

          // Get active workspace to filter sessions
          const activeWorkspaceId = currentState.workspaces?.find(w => w.isActive)?.id;

          // Only load sessions for active workspace
          if (activeWorkspaceId) {
            const workspaceSessions = sessions.filter(s => s.workspaceId === activeWorkspaceId);
            workspaceSessions.forEach((session) =>
              dispatchRef.current({ type: 'SESSION_UPSERT', payload: session }),
            );

            // Auto-select the most recent session if none is active
            if (!currentState.activeSessionId && workspaceSessions.length > 0) {
              const sortedSessions = [...workspaceSessions].sort((a, b) => b.updatedAt - a.updatedAt);
              dispatchRef.current({ type: 'SESSION_SET_ACTIVE', payload: sortedSessions[0].id });
            }
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
                alternatives: routingEvent.decision.alternatives?.map(a => ({
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
        default:
          break;
      }
    },
    [appendDelta, clearBuffer, flushSession, batchedDispatch, getCurrentState, scheduleTerminalFlush],
  );

  useEffect(() => {
    // Guard against preload script not being ready
    if (!window.vyotiq?.agent) {
      logger.warn('window.vyotiq not available yet');
      return;
    }

    const unsubscribe = window.vyotiq.agent.onEvent((event: RendererEvent) => {
      handleAgentEvent(event as AgentEvent);
    });

    // Load initial data in sequence: workspaces first, then sessions for active workspace
    // Use a flag to prevent duplicate loading in React StrictMode
    const loadInitialData = async () => {
      // Prevent duplicate loading in StrictMode
      if (initialDataLoadedRef.current) {
        return;
      }
      initialDataLoadedRef.current = true;

      try {
        // 1. Load workspaces first
        const entries = await window.vyotiq.workspace.list();
        dispatchRef.current({ type: 'WORKSPACES_UPDATE', payload: entries });

        // 2. Load sessions for the active workspace only
        const activeWorkspace = entries.find(w => w.isActive);
        if (activeWorkspace) {
          logger.info('Loading sessions for workspace', {
            workspaceId: activeWorkspace.id,
            workspacePath: activeWorkspace.path,
          });

          // Clear any stale sessions first
          dispatchRef.current({ type: 'SESSIONS_CLEAR' });

          // Load workspace-specific sessions
          const sessions = await window.vyotiq.agent.getSessionsByWorkspace(activeWorkspace.id);
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

            (sessions as AgentSessionState[]).forEach((session) =>
              dispatchRef.current({ type: 'SESSION_UPSERT', payload: session }),
            );

            // Auto-select the most recent session
            const sortedSessions = [...sessions].sort((a, b) =>
              (b as AgentSessionState).updatedAt - (a as AgentSessionState).updatedAt
            );
            if (sortedSessions.length > 0) {
              dispatchRef.current({ type: 'SESSION_SET_ACTIVE', payload: (sortedSessions[0] as AgentSessionState).id });
            }

            logger.info('Loaded sessions', {
              count: sessions.length,
              workspaceId: activeWorkspace.id,
            });
          } else {
            logger.info('No sessions found for workspace', {
              workspaceId: activeWorkspace.id,
            });
          }
        } else {
          // This is expected when no workspace has been added yet - not an error
          logger.debug('No active workspace found - user needs to select one');
        }

        // 3. Load settings
        const settings = await window.vyotiq.settings.get();
        dispatchRef.current({ type: 'SETTINGS_UPDATE', payload: settings });

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
  }, [handleAgentEvent]);

  const startSession = useCallback(async (initialConfig?: Partial<AgentConfig>) => {
    if (!window.vyotiq?.agent) return undefined;
    const activeWorkspace = store.getState().workspaces.find((workspace) => workspace.isActive);

    // STRICT: Require a workspace to be selected
    if (!activeWorkspace) {
      logger.error('Cannot start session without an active workspace');
      return undefined;
    }

    try {
      const session = (await window.vyotiq.agent.startSession({
        workspaceId: activeWorkspace.id,
        initialConfig,
      })) as AgentSessionState | undefined;

      if (session?.id) {
        dispatchRef.current({ type: 'SESSION_SET_ACTIVE', payload: session.id });

        // Log session creation with workspace binding
        logger.info('Created session bound to workspace', {
          sessionId: session.id,
          workspaceId: activeWorkspace.id,
          workspacePath: activeWorkspace.path,
        });
      }
      return session?.id;
    } catch (error) {
      logger.error('Failed to start session', { error: error instanceof Error ? error.message : String(error) });
      return undefined;
    }
  }, [store]);

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
        sessionId = (await startSession(initialConfig)) ?? latestState.sessions?.[latestState.sessions?.length - 1]?.id;
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

  const openWorkspaceDialog = useCallback(async () => {
    if (!window.vyotiq?.workspace) return;
    await window.vyotiq.workspace.add();
  }, []);

  const setActiveWorkspace = useCallback(async (workspaceId: string) => {
    if (!window.vyotiq?.workspace) return;

    logger.info('Switching to workspace', { workspaceId });

    // 1. Clear ALL sessions and reset state completely before switching
    // This prevents the agent from operating on the wrong workspace
    dispatchRef.current({ type: 'SESSIONS_CLEAR' });

    // 2. Set the new active workspace
    const updatedWorkspaces = await window.vyotiq.workspace.setActive(workspaceId);
    dispatchRef.current({ type: 'WORKSPACES_UPDATE', payload: updatedWorkspaces });

    // 3. Load sessions for the new workspace
    if (window.vyotiq?.agent) {
      try {
        logger.info('Loading sessions for workspace', { workspaceId });
        const sessions = await window.vyotiq.agent.getSessionsByWorkspace(workspaceId);

        if (Array.isArray(sessions) && sessions.length > 0) {
          // Load workspace-specific sessions
          for (const session of sessions as AgentSessionState[]) {
            // Double-check session belongs to this workspace (defensive)
            if (session.workspaceId === workspaceId) {
              dispatchRef.current({ type: 'SESSION_UPSERT', payload: session });
            } else {
              logger.warn('Skipping session with mismatched workspace', {
                sessionId: session.id,
                sessionWorkspace: session.workspaceId,
                requestedWorkspace: workspaceId,
              });
            }
          }

          // Auto-select the most recent session that belongs to this workspace
          const workspaceSessions = (sessions as AgentSessionState[])
            .filter(s => s.workspaceId === workspaceId)
            .sort((a, b) => b.updatedAt - a.updatedAt);

          if (workspaceSessions.length > 0) {
            dispatchRef.current({ type: 'SESSION_SET_ACTIVE', payload: workspaceSessions[0].id });
          }

          logger.info('Loaded sessions for new workspace', {
            count: workspaceSessions.length,
            workspaceId,
          });
        } else {
          logger.info('No sessions found for new workspace', {
            workspaceId,
          });
        }
      } catch (error) {
        logger.error('Failed to load sessions for workspace', { error: error instanceof Error ? error.message : String(error) });
      }
    }
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
    } catch {
      return false;
    }
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!window.vyotiq?.agent) return;
    await window.vyotiq.agent.deleteSession(sessionId);
    dispatchRef.current({ type: 'SESSION_DELETE', payload: sessionId });
  }, []);

  const regenerate = useCallback(async (sessionId: string) => {
    if (!window.vyotiq?.agent) return;
    await window.vyotiq.agent.regenerate(sessionId);
  }, []);

  const createSession = useCallback(async () => {
    return startSession();
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
    confirmTool,
    setActiveSession,
    openWorkspaceDialog,
    setActiveWorkspace,
    updateSessionConfig,
    cancelRun,
    pauseRun,
    resumeRun,
    isRunPaused,
    deleteSession,
    regenerate,
    renameSession,
    addReaction,
  }), [cancelRun, pauseRun, resumeRun, isRunPaused, confirmTool, createSession, openWorkspaceDialog, renameSession, sendMessage, setActiveSession, setActiveWorkspace, startSession, updateSessionConfig, deleteSession, regenerate, addReaction]);

  // Populate the store's stable actions object
  store.actions = value;

  return <AgentContext.Provider value={store}>{children}</AgentContext.Provider>;
};

export const useAgent = () => {
  const state = useAgentState();
  const actions = useAgentActions();
  return { state, actions };
};

