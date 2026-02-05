/**
 * Multi-Workspace Selector Cache
 * 
 * Provides memoized selectors for efficient multi-workspace state queries.
 * Uses WeakMap and referential equality checks to minimize re-computations
 * and React re-renders when working with multiple concurrent workspaces.
 */

import type { AgentUIState } from './agentReducer';
import type { AgentSessionState } from '../../shared/types';

// =============================================================================
// Types
// =============================================================================

/** Workspace session summary for UI display */
export interface WorkspaceSessionSummary {
  workspaceId: string;
  sessionCount: number;
  activeSessionCount: number;
  runningSessionCount: number;
  lastActivityTime: number;
  totalMessages: number;
}

/** Session by workspace lookup */
export interface SessionsByWorkspace {
  byWorkspace: Map<string, AgentSessionState[]>;
  noWorkspace: AgentSessionState[];
  totalCount: number;
}

// =============================================================================
// Selector Cache
// =============================================================================

// Cache for computed values keyed by state identity
const sessionsByWorkspaceCache = new WeakMap<AgentSessionState[], SessionsByWorkspace>();
const workspaceSummaryCache = new WeakMap<AgentSessionState[], Map<string, WorkspaceSessionSummary>>();
const activeSessionsByWorkspaceCache = new WeakMap<AgentSessionState[], Map<string, string | null>>();

// =============================================================================
// Memoized Selectors
// =============================================================================

/**
 * Get sessions grouped by workspace with caching
 * Only recomputes when sessions array reference changes
 */
export function selectSessionsByWorkspace(state: AgentUIState): SessionsByWorkspace {
  const sessions = state.sessions;
  
  // Check cache first
  const cached = sessionsByWorkspaceCache.get(sessions);
  if (cached) {
    return cached;
  }

  // Compute grouping
  const byWorkspace = new Map<string, AgentSessionState[]>();
  const noWorkspace: AgentSessionState[] = [];

  for (const session of sessions) {
    const workspaceId = session.workspaceId;
    if (workspaceId) {
      const existing = byWorkspace.get(workspaceId);
      if (existing) {
        existing.push(session);
      } else {
        byWorkspace.set(workspaceId, [session]);
      }
    } else {
      noWorkspace.push(session);
    }
  }

  const result: SessionsByWorkspace = {
    byWorkspace,
    noWorkspace,
    totalCount: sessions.length,
  };

  // Cache result
  sessionsByWorkspaceCache.set(sessions, result);
  return result;
}

/**
 * Get sessions for a specific workspace
 */
export function selectWorkspaceSessions(state: AgentUIState, workspaceId: string): AgentSessionState[] {
  const grouped = selectSessionsByWorkspace(state);
  return grouped.byWorkspace.get(workspaceId) ?? [];
}

/**
 * Get workspace summaries for all workspaces with sessions
 */
export function selectWorkspaceSummaries(state: AgentUIState): Map<string, WorkspaceSessionSummary> {
  const sessions = state.sessions;
  
  // Check cache first
  const cached = workspaceSummaryCache.get(sessions);
  if (cached) {
    return cached;
  }

  // Compute summaries
  const summaries = new Map<string, WorkspaceSessionSummary>();
  const grouped = selectSessionsByWorkspace(state);

  for (const [workspaceId, workspaceSessions] of grouped.byWorkspace) {
    const runningCount = workspaceSessions.filter(s => s.status === 'running').length;
    const activeCount = workspaceSessions.filter(s => s.status !== 'idle').length;
    const totalMessages = workspaceSessions.reduce((sum, s) => sum + s.messages.length, 0);
    const lastActivity = Math.max(...workspaceSessions.map(s => s.updatedAt));

    summaries.set(workspaceId, {
      workspaceId,
      sessionCount: workspaceSessions.length,
      activeSessionCount: activeCount,
      runningSessionCount: runningCount,
      lastActivityTime: lastActivity,
      totalMessages,
    });
  }

  // Cache result
  workspaceSummaryCache.set(sessions, summaries);
  return summaries;
}

/**
 * Get workspace summary for a specific workspace
 */
export function selectWorkspaceSummary(
  state: AgentUIState,
  workspaceId: string
): WorkspaceSessionSummary | null {
  const summaries = selectWorkspaceSummaries(state);
  return summaries.get(workspaceId) ?? null;
}

/**
 * Get active session ID for each workspace
 */
export function selectActiveSessionsByWorkspace(state: AgentUIState): Map<string, string | null> {
  const sessions = state.sessions;
  
  // Check cache first
  const cached = activeSessionsByWorkspaceCache.get(sessions);
  if (cached) {
    return cached;
  }

  // Compute active sessions
  const activeByWorkspace = new Map<string, string | null>();
  const grouped = selectSessionsByWorkspace(state);

  for (const [workspaceId, workspaceSessions] of grouped.byWorkspace) {
    // Find the most recent running or awaiting-confirmation session
    const active = workspaceSessions.find(s => s.status === 'running' || s.status === 'awaiting-confirmation')
      ?? workspaceSessions.find(s => s.id === state.activeSessionId)
      ?? workspaceSessions[workspaceSessions.length - 1]; // Most recent
    activeByWorkspace.set(workspaceId, active?.id ?? null);
  }

  // Cache result
  activeSessionsByWorkspaceCache.set(sessions, activeByWorkspace);
  return activeByWorkspace;
}

/**
 * Get count of running sessions across all workspaces
 */
export function selectGlobalRunningSessionCount(state: AgentUIState): number {
  return state.sessions.filter(s => s.status === 'running').length;
}

/**
 * Get count of sessions awaiting confirmation
 */
export function selectWaitingConfirmationCount(state: AgentUIState): number {
  return state.sessions.filter(s => s.status === 'awaiting-confirmation').length;
}

/**
 * Check if any sessions are running in a specific workspace
 */
export function selectIsWorkspaceActive(state: AgentUIState, workspaceId: string): boolean {
  return state.sessions.some(
    s => s.workspaceId === workspaceId && (s.status === 'running' || s.status === 'awaiting-confirmation')
  );
}

/**
 * Get session by ID (simple but commonly needed)
 */
export function selectSessionById(state: AgentUIState, sessionId: string): AgentSessionState | undefined {
  return state.sessions.find(s => s.id === sessionId);
}

// =============================================================================
// Comparison Utilities
// =============================================================================

/**
 * Shallow compare arrays of session IDs
 */
export function sessionIdsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Compare workspace summaries for equality
 */
export function workspaceSummaryEqual(
  a: WorkspaceSessionSummary | null,
  b: WorkspaceSessionSummary | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.sessionCount === b.sessionCount &&
    a.activeSessionCount === b.activeSessionCount &&
    a.runningSessionCount === b.runningSessionCount &&
    a.totalMessages === b.totalMessages
  );
}

/**
 * Compare two maps of workspace summaries
 */
export function workspaceSummariesEqual(
  a: Map<string, WorkspaceSessionSummary>,
  b: Map<string, WorkspaceSessionSummary>
): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  
  for (const [key, valueA] of a) {
    const valueB = b.get(key);
    if (!workspaceSummaryEqual(valueA, valueB ?? null)) {
      return false;
    }
  }
  
  return true;
}
