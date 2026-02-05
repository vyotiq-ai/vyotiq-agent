/**
 * Session Utilities
 * 
 * Helper functions for session management, sorting, filtering, and statistics.
 */
import type { AgentSessionState } from '../../../../shared/types';

// =============================================================================
// Types
// =============================================================================

export type SessionSortKey = 'date' | 'title' | 'status' | 'messageCount';

export interface SessionFilterOptions {
  searchQuery?: string;
  workspaceId?: string;
  showRunningOnly?: boolean;
  showIdleOnly?: boolean;
  sortBy?: SessionSortKey;
}

export interface SessionStats {
  total: number;
  running: number;
  idle: number;
  paused: number;
  error: number;
  awaiting: number;
}

export interface WorkspaceSessionStats {
  workspaceId: string;
  workspaceLabel: string;
  total: number;
  running: number;
}

// =============================================================================
// Status Helpers
// =============================================================================

/** Check if session is currently running */
export function isSessionRunning(status: string): boolean {
  return status === 'running' || status === 'awaiting-confirmation';
}

/** Check if session is idle */
export function isSessionIdle(status: string): boolean {
  return status === 'idle' || status === 'completed';
}

/** Check if session has error */
export function isSessionError(status: string): boolean {
  return status === 'error';
}

/** Check if session is paused */
export function isSessionPaused(status: string): boolean {
  return status === 'paused';
}

/** Get status priority for sorting (higher = more prominent) */
export function getStatusPriority(status: string): number {
  switch (status) {
    case 'running': return 5;
    case 'awaiting-confirmation': return 4;
    case 'paused': return 3;
    case 'error': return 2;
    case 'idle': return 1;
    default: return 0;
  }
}

/** Get display label for status */
export function getStatusLabel(status: string): string | null {
  switch (status) {
    case 'running':
    case 'awaiting-confirmation':
      return 'active';
    case 'paused':
      return 'paused';
    case 'error':
      return 'error';
    default:
      return null;
  }
}

// =============================================================================
// Sorting Functions
// =============================================================================

/** Sort sessions by specified key */
export function sortSessions<T extends { updatedAt: number; title: string; status: string; messages?: unknown[] }>(
  sessions: T[],
  sortBy: SessionSortKey
): T[] {
  return [...sessions].sort((a, b) => {
    switch (sortBy) {
      case 'date':
        return b.updatedAt - a.updatedAt;
      case 'title':
        return (a.title || '').localeCompare(b.title || '');
      case 'status':
        return getStatusPriority(b.status) - getStatusPriority(a.status);
      case 'messageCount':
        return (b.messages?.length ?? 0) - (a.messages?.length ?? 0);
      default:
        return b.updatedAt - a.updatedAt;
    }
  });
}

/** Sort sessions with running first, then by date */
export function sortSessionsRunningFirst<T extends { updatedAt: number; status: string }>(
  sessions: T[]
): T[] {
  return [...sessions].sort((a, b) => {
    const aRunning = isSessionRunning(a.status) ? 1 : 0;
    const bRunning = isSessionRunning(b.status) ? 1 : 0;
    if (aRunning !== bRunning) return bRunning - aRunning;
    return b.updatedAt - a.updatedAt;
  });
}

// =============================================================================
// Filtering Functions
// =============================================================================

/** Filter sessions by search query (matches title) */
export function filterSessionsByQuery<T extends { title: string }>(
  sessions: T[],
  query: string
): T[] {
  if (!query.trim()) return sessions;
  const lowerQuery = query.toLowerCase().trim();
  return sessions.filter(session => {
    const title = (session.title || 'untitled').toLowerCase();
    return title.includes(lowerQuery);
  });
}

/** Filter sessions by workspace */
export function filterSessionsByWorkspace(
  sessions: AgentSessionState[],
  workspaceId: string
): AgentSessionState[] {
  return sessions.filter(s => s.workspaceId === workspaceId);
}

/** Filter to running sessions only */
export function filterRunningSessions<T extends { status: string }>(
  sessions: T[]
): T[] {
  return sessions.filter(s => isSessionRunning(s.status));
}

/** Filter to idle sessions only */
export function filterIdleSessions<T extends { status: string }>(
  sessions: T[]
): T[] {
  return sessions.filter(s => isSessionIdle(s.status));
}

/** Apply all filter options */
export function filterAndSortSessions(
  sessions: AgentSessionState[],
  options: SessionFilterOptions
): AgentSessionState[] {
  let result = sessions;

  // Filter by workspace
  if (options.workspaceId) {
    result = filterSessionsByWorkspace(result, options.workspaceId);
  }

  // Filter by search query
  if (options.searchQuery) {
    result = filterSessionsByQuery(result, options.searchQuery);
  }

  // Filter by status
  if (options.showRunningOnly) {
    result = filterRunningSessions(result);
  } else if (options.showIdleOnly) {
    result = filterIdleSessions(result);
  }

  // Sort
  if (options.sortBy) {
    result = sortSessions(result, options.sortBy);
  }

  return result;
}

// =============================================================================
// Statistics Functions
// =============================================================================

/** Get session statistics */
export function getSessionStats<T extends { status: string }>(sessions: T[]): SessionStats {
  return sessions.reduce(
    (stats, session) => {
      stats.total++;
      switch (session.status) {
        case 'running':
          stats.running++;
          break;
        case 'awaiting-confirmation':
          stats.awaiting++;
          stats.running++; // Also count as running
          break;
        case 'paused':
          stats.paused++;
          break;
        case 'error':
          stats.error++;
          break;
        default:
          stats.idle++;
      }
      return stats;
    },
    { total: 0, running: 0, idle: 0, paused: 0, error: 0, awaiting: 0 }
  );
}

/** Get running session count per workspace */
export function getRunningCountByWorkspace(
  sessions: AgentSessionState[]
): Map<string, number> {
  const counts = new Map<string, number>();
  
  sessions.forEach(session => {
    if (isSessionRunning(session.status) && session.workspaceId) {
      const current = counts.get(session.workspaceId) || 0;
      counts.set(session.workspaceId, current + 1);
    }
  });
  
  return counts;
}

/** Get session counts grouped by workspace */
export function getSessionCountsByWorkspace(
  sessions: AgentSessionState[],
  workspaceLabels?: Map<string, string>
): WorkspaceSessionStats[] {
  const statsMap = new Map<string, { total: number; running: number }>();
  
  sessions.forEach(session => {
    const wid = session.workspaceId || 'unknown';
    const current = statsMap.get(wid) || { total: 0, running: 0 };
    current.total++;
    if (isSessionRunning(session.status)) {
      current.running++;
    }
    statsMap.set(wid, current);
  });
  
  return Array.from(statsMap.entries()).map(([workspaceId, stats]) => ({
    workspaceId,
    workspaceLabel: workspaceLabels?.get(workspaceId) || 'Unknown',
    ...stats,
  }));
}

// =============================================================================
// Grouping Functions
// =============================================================================

export interface SessionGroup<T> {
  label: string;
  sessions: T[];
}

/** Group sessions by date categories */
export function groupSessionsByDate<T extends { updatedAt: number }>(
  sessions: T[]
): SessionGroup<T>[] {
  const groups: Record<string, T[]> = {
    'today': [],
    'yesterday': [],
    'this week': [],
    'older': [],
  };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const lastWeek = today - 86400000 * 7;

  sessions.forEach(session => {
    const date = new Date(session.updatedAt).getTime();
    if (date >= today) {
      groups['today'].push(session);
    } else if (date >= yesterday) {
      groups['yesterday'].push(session);
    } else if (date >= lastWeek) {
      groups['this week'].push(session);
    } else {
      groups['older'].push(session);
    }
  });

  return Object.entries(groups)
    .filter(([_, groupSessions]) => groupSessions.length > 0)
    .map(([label, groupSessions]) => ({ label, sessions: groupSessions }));
}

/** Group sessions by workspace */
export function groupSessionsByWorkspace(
  sessions: AgentSessionState[],
  workspaceLabels: Map<string, string>
): SessionGroup<AgentSessionState>[] {
  const groups = new Map<string, AgentSessionState[]>();

  sessions.forEach(session => {
    const wid = session.workspaceId || 'unknown';
    if (!groups.has(wid)) {
      groups.set(wid, []);
    }
    groups.get(wid)!.push(session);
  });

  return Array.from(groups.entries())
    .map(([workspaceId, groupSessions]) => ({
      label: workspaceLabels.get(workspaceId) || 'Unknown Workspace',
      sessions: groupSessions.sort((a, b) => b.updatedAt - a.updatedAt),
    }))
    .sort((a, b) => {
      const aLatest = Math.max(...a.sessions.map(s => s.updatedAt));
      const bLatest = Math.max(...b.sessions.map(s => s.updatedAt));
      return bLatest - aLatest;
    });
}

/** Group sessions by status */
export function groupSessionsByStatus<T extends { status: string }>(
  sessions: T[]
): SessionGroup<T>[] {
  const groups: Record<string, T[]> = {
    'running': [],
    'awaiting': [],
    'paused': [],
    'idle': [],
    'error': [],
  };

  sessions.forEach(session => {
    switch (session.status) {
      case 'running':
        groups['running'].push(session);
        break;
      case 'awaiting-confirmation':
        groups['awaiting'].push(session);
        break;
      case 'paused':
        groups['paused'].push(session);
        break;
      case 'error':
        groups['error'].push(session);
        break;
      default:
        groups['idle'].push(session);
    }
  });

  return Object.entries(groups)
    .filter(([_, groupSessions]) => groupSessions.length > 0)
    .map(([label, groupSessions]) => ({ label, sessions: groupSessions }));
}

// =============================================================================
// Display Helpers
// =============================================================================

/** Truncate title to max length */
export function truncateTitle(title: string | undefined, maxLength: number = 20): string {
  if (!title) return 'untitled';
  if (title.length <= maxLength) return title;
  return title.slice(0, maxLength) + '…';
}

/** Format relative time */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Get workspace label from path */
export function getWorkspaceLabelFromPath(path: string | undefined): string {
  if (!path) return 'unknown';
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || 'unknown';
}
