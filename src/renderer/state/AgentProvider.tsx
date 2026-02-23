import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, startTransition, useSyncExternalStore } from 'react';
import type {
  AgentConfig,
  AgentEvent,
  AgentSessionState,
  AgentSettings,
  AttachmentPayload,
  RendererEvent,
} from '../../shared/types';
import { initialState, type AgentUIState, type AgentAction } from './agentReducer';
import { combinedAgentReducer } from './reducers';
import { useStreamingBuffer } from '../hooks/useStreamingBuffer';
import { createLogger } from '../utils/logger';
import { withIpcRetry } from '../utils/ipcRetry';
import { getCurrentWorkspacePath } from './WorkspaceProvider';
import { createAgentEventHandler } from './agentEventHandler';

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
  dispatchBatchRef.current = store.dispatchBatch;

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
          dispatchBatchRef.current(batch);
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
    createAgentEventHandler({
      dispatch: (action) => dispatchRef.current(action),
      dispatchBatch: (actions) => dispatchBatchRef.current(actions),
      batchedDispatch,
      getCurrentState,
      getState: () => store.getState(),
      appendDelta,
      appendThinkingDelta,
      clearBuffer,
      clearThinkingBuffer,
      flushSession,
      flushThinkingSession,
      bufferTerminalOutput: (pid, stream, data) => {
        const existing = terminalBufferRef.current.get(pid) ?? [];
        existing.push({ stream, data });
        terminalBufferRef.current.set(pid, existing);
        scheduleTerminalFlush();
      },
      lastAgentStatusRef,
    }),
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

