/**
 * Optimized Agent State Selectors
 * 
 * Pre-built selectors for common agent state access patterns.
 * These hooks use memoization to prevent unnecessary re-renders
 * and provide better performance than accessing full state.
 * 
 * @module hooks/useAgentSelectors
 */

import { useMemo, useCallback } from 'react';
import { useAgentSelector, useAgentActions } from '../state/AgentProvider';
import type { AgentUIState } from '../state/agentReducer';
import type { ChatMessage, AgentSessionState, ConfirmToolPayload } from '../../shared/types';
import type { TodoItem } from '../../shared/types/todo';

// =============================================================================
// Shallow Comparison Utilities
// =============================================================================

/**
 * Shallow array comparison for selector equality checks
 */
function shallowArrayEqual<T>(a: T[] | undefined, b: T[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Shallow object comparison for selector equality checks
 */
function shallowObjectEqual<T extends Record<string, unknown>>(a: T | undefined, b: T | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

// =============================================================================
// Session Selectors
// =============================================================================

/**
 * Get the active session ID
 * Minimal selector that only re-renders when active session changes
 */
export function useActiveSessionId(): string | undefined {
  return useAgentSelector(
    (state: AgentUIState) => state.activeSessionId
  );
}

/**
 * Get the active session state
 * Re-renders when the active session changes
 */
export function useActiveSession(): AgentSessionState | undefined {
  const sessionId = useActiveSessionId();
  
  return useAgentSelector(
    useCallback(
      (state: AgentUIState) => {
        if (!sessionId) return undefined;
        return state.sessions.find(s => s.id === sessionId);
      },
      [sessionId]
    )
  );
}

/**
 * Get all session IDs as an array
 * Only re-renders when session list changes (not individual session content)
 */
export function useSessionIds(): string[] {
  return useAgentSelector(
    (state: AgentUIState) => state.sessions.map(s => s.id),
    shallowArrayEqual
  );
}

/**
 * Get session count
 * Only re-renders when number of sessions changes
 */
export function useSessionCount(): number {
  return useAgentSelector(
    (state: AgentUIState) => state.sessions.length
  );
}

/**
 * Get a specific session by ID
 * Creates a stable selector that doesn't change reference
 */
export function useSession(sessionId: string | undefined): AgentSessionState | undefined {
  return useAgentSelector(
    useCallback(
      (state: AgentUIState) => sessionId ? state.sessions.find(s => s.id === sessionId) : undefined,
      [sessionId]
    )
  );
}

// =============================================================================
// Message Selectors
// =============================================================================

/**
 * Get messages for the active session
 * Optimized to only re-render when messages array reference changes
 */
export function useActiveSessionMessages(): ChatMessage[] {
  const sessionId = useActiveSessionId();
  
  return useAgentSelector(
    useCallback(
      (state: AgentUIState) => {
        if (!sessionId) return [];
        const session = state.sessions.find(s => s.id === sessionId);
        return session?.messages ?? [];
      },
      [sessionId]
    ),
    shallowArrayEqual
  );
}

/**
 * Get messages for a specific session
 */
export function useSessionMessages(sessionId: string | undefined): ChatMessage[] {
  return useAgentSelector(
    useCallback(
      (state: AgentUIState) => {
        if (!sessionId) return [];
        const session = state.sessions.find(s => s.id === sessionId);
        return session?.messages ?? [];
      },
      [sessionId]
    ),
    shallowArrayEqual
  );
}

/**
 * Get message count for the active session
 * Minimal re-render when only count changes
 */
export function useActiveSessionMessageCount(): number {
  const sessionId = useActiveSessionId();
  
  return useAgentSelector(
    useCallback(
      (state: AgentUIState) => {
        if (!sessionId) return 0;
        const session = state.sessions.find(s => s.id === sessionId);
        return session?.messages?.length ?? 0;
      },
      [sessionId]
    )
  );
}

/**
 * Get the last message for the active session
 */
export function useLastMessage(): ChatMessage | undefined {
  const messages = useActiveSessionMessages();
  return messages.length > 0 ? messages[messages.length - 1] : undefined;
}

// =============================================================================
// Status Selectors
// =============================================================================

/**
 * Get the status of the active session
 * Only re-renders when status changes
 */
export function useActiveSessionStatus(): AgentSessionState['status'] | undefined {
  const sessionId = useActiveSessionId();
  
  return useAgentSelector(
    useCallback(
      (state: AgentUIState) => {
        if (!sessionId) return undefined;
        const session = state.sessions.find(s => s.id === sessionId);
        return session?.status;
      },
      [sessionId]
    )
  );
}

/**
 * Check if the active session is running
 */
export function useIsActiveSessionRunning(): boolean {
  const status = useActiveSessionStatus();
  return status === 'running';
}

/**
 * Check if the active session is idle (ready for new messages)
 */
export function useIsActiveSessionIdle(): boolean {
  const status = useActiveSessionStatus();
  return status === 'idle' || status === undefined;
}

// =============================================================================
// Agent Status Selectors
// =============================================================================

/**
 * Get agent status info for the active session
 */
export function useActiveSessionAgentStatus() {
  const sessionId = useActiveSessionId();
  
  return useAgentSelector(
    useCallback(
      (state: AgentUIState) => {
        if (!sessionId) return undefined;
        return state.agentStatus[sessionId];
      },
      [sessionId]
    )
  );
}

// =============================================================================
// Context Metrics Selectors
// =============================================================================

/**
 * Get context metrics for the active session
 */
export function useActiveSessionContextMetrics() {
  const sessionId = useActiveSessionId();
  
  return useAgentSelector(
    useCallback(
      (state: AgentUIState) => {
        if (!sessionId) return undefined;
        return state.contextMetrics[sessionId];
      },
      [sessionId]
    )
  );
}

/**
 * Get context usage percentage for the active session
 */
export function useContextUsagePercentage(): number {
  const metricsData = useActiveSessionContextMetrics();
  if (!metricsData?.metrics) return 0;
  const { metrics } = metricsData;
  // Use the pre-computed utilization (0-1) from the metrics
  return Math.round(metrics.utilization * 100);
}

// =============================================================================
// Todo Selectors
// =============================================================================

/**
 * Get todos for the active session
 */
export function useActiveSessionTodos(): { runId: string; todos: TodoItem[]; timestamp: number } | undefined {
  const sessionId = useActiveSessionId();
  
  return useAgentSelector(
    useCallback(
      (state: AgentUIState) => {
        if (!sessionId) return undefined;
        return state.todos[sessionId];
      },
      [sessionId]
    )
  );
}

/**
 * Get todo items as array for the active session
 */
export function useActiveSessionTodoItems(): TodoItem[] {
  const todoData = useActiveSessionTodos();
  return todoData?.todos ?? [];
}

/**
 * Get todo completion percentage for active session
 */
export function useTodoCompletionPercentage(): number {
  const items = useActiveSessionTodoItems();
  if (items.length === 0) return 0;
  const completed = items.filter(item => item.status === 'completed').length;
  return Math.round((completed / items.length) * 100);
}

// =============================================================================
// Workspace Selectors
// =============================================================================

/**
 * Get the active workspace
 */
export function useActiveWorkspaceFromState() {
  return useAgentSelector(
    (state: AgentUIState) => state.workspaces.find(w => w.isActive)
  );
}

/**
 * Get the active workspace path
 */
export function useActiveWorkspacePath(): string | null {
  const workspace = useActiveWorkspaceFromState();
  return workspace?.path ?? null;
}

/**
 * Get the active workspace name (label)
 */
export function useActiveWorkspaceName(): string | null {
  const workspace = useActiveWorkspaceFromState();
  return workspace?.label ?? null;
}

// =============================================================================
// Streaming Selectors
// =============================================================================

/**
 * Check if the active session is currently streaming
 */
export function useIsActiveSessionStreaming(): boolean {
  const sessionId = useActiveSessionId();
  
  return useAgentSelector(
    useCallback(
      (state: AgentUIState) => {
        if (!sessionId) return false;
        return state.streamingSessions.has(sessionId);
      },
      [sessionId]
    )
  );
}

// =============================================================================
// Config Selectors
// =============================================================================

/**
 * Get the active session's config
 */
export function useActiveSessionConfig(): AgentSessionState['config'] | undefined {
  const sessionId = useActiveSessionId();
  
  return useAgentSelector(
    useCallback(
      (state: AgentUIState) => {
        if (!sessionId) return undefined;
        const session = state.sessions.find(s => s.id === sessionId);
        return session?.config;
      },
      [sessionId]
    )
  );
}

// =============================================================================
// Combined Hooks for Common Patterns
// =============================================================================

/**
 * Combined hook for active session header info
 * Returns { title, status, messageCount } for display in headers
 */
export function useActiveSessionInfo(): {
  sessionId: string | undefined;
  title: string | undefined;
  status: AgentSessionState['status'] | undefined;
  messageCount: number;
} {
  const sessionId = useActiveSessionId();
  
  return useAgentSelector(
    useCallback(
      (state: AgentUIState) => {
        if (!sessionId) {
          return { sessionId: undefined, title: undefined, status: undefined, messageCount: 0 };
        }
        const session = state.sessions.find(s => s.id === sessionId);
        return {
          sessionId,
          title: session?.title,
          status: session?.status,
          messageCount: session?.messages?.length ?? 0,
        };
      },
      [sessionId]
    ),
    shallowObjectEqual
  );
}
