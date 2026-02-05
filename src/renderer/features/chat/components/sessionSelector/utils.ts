/**
 * Session Selector Utilities
 * 
 * Helper functions for session grouping, formatting, filtering, and status display.
 */
import type { SessionMeta, SessionGroup, SessionSortKey, SessionFilterOptions } from './types';

// =============================================================================
// Date/Time Utilities
// =============================================================================

/** Format relative time for display */
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

/** Format full timestamp for tooltips */
export function formatFullTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// =============================================================================
// Session Grouping
// =============================================================================

/** Group sessions by date categories */
export function groupSessionsByDate(sessions: SessionMeta[]): SessionGroup[] {
  const groups: Record<string, SessionMeta[]> = {
    'today': [],
    'yesterday': [],
    'this week': [],
    'older': []
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
    .map(([label, groupSessions]) => ({
      label,
      sessions: groupSessions
    }));
}

/** Group sessions by workspace */
export function groupSessionsByWorkspace(
  sessions: SessionMeta[], 
  workspaceLabels: Map<string, string>
): SessionGroup[] {
  const groups = new Map<string, SessionMeta[]>();
  
  sessions.forEach(session => {
    const workspaceId = session.workspaceId || 'unknown';
    if (!groups.has(workspaceId)) {
      groups.set(workspaceId, []);
    }
    groups.get(workspaceId)!.push(session);
  });
  
  return Array.from(groups.entries())
    .map(([workspaceId, groupSessions]) => ({
      label: workspaceLabels.get(workspaceId) || 'Unknown Workspace',
      sessions: groupSessions.sort((a, b) => b.updatedAt - a.updatedAt)
    }))
    .sort((a, b) => {
      // Sort by most recent session in each group
      const aLatest = Math.max(...a.sessions.map(s => s.updatedAt));
      const bLatest = Math.max(...b.sessions.map(s => s.updatedAt));
      return bLatest - aLatest;
    });
}

// =============================================================================
// Session Status
// =============================================================================

/** Get display status label for session */
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

/** Check if session is currently active/running */
export function isSessionRunning(status: string): boolean {
  return status === 'running' || status === 'awaiting-confirmation';
}

/** Check if session is idle */
export function isSessionIdle(status: string): boolean {
  return status === 'idle' || status === 'completed';
}

/** Get status priority for sorting (higher = more prominent) */
export function getStatusPriority(status: string): number {
  switch (status) {
    case 'running': return 4;
    case 'awaiting-confirmation': return 3;
    case 'paused': return 2;
    case 'error': return 1;
    default: return 0;
  }
}

// =============================================================================
// Session Filtering & Sorting
// =============================================================================

/** Filter sessions by search query */
export function filterSessionsByQuery(
  sessions: SessionMeta[], 
  query: string
): SessionMeta[] {
  if (!query.trim()) return sessions;
  
  const lowerQuery = query.toLowerCase().trim();
  return sessions.filter(session => {
    const title = (session.title || 'untitled').toLowerCase();
    return title.includes(lowerQuery);
  });
}

/** Sort sessions by specified key */
export function sortSessions(
  sessions: SessionMeta[], 
  sortBy: SessionSortKey
): SessionMeta[] {
  return [...sessions].sort((a, b) => {
    switch (sortBy) {
      case 'date':
        return b.updatedAt - a.updatedAt;
      case 'title':
        return (a.title || '').localeCompare(b.title || '');
      case 'status':
        return getStatusPriority(b.status) - getStatusPriority(a.status);
      case 'messageCount':
        return b.messageCount - a.messageCount;
      default:
        return b.updatedAt - a.updatedAt;
    }
  });
}

/** Apply all filter options to sessions */
export function filterAndSortSessions(
  sessions: SessionMeta[],
  options: SessionFilterOptions
): SessionMeta[] {
  let result = sessions;
  
  // Apply search filter
  if (options.searchQuery) {
    result = filterSessionsByQuery(result, options.searchQuery);
  }
  
  // Apply view mode filter
  if (options.viewMode === 'running') {
    result = result.filter(s => isSessionRunning(s.status));
  }
  
  // Apply sorting
  if (options.sortBy) {
    result = sortSessions(result, options.sortBy);
  }
  
  return result;
}

// =============================================================================
// Session Display Helpers
// =============================================================================

/** Truncate title to max length */
export function truncateTitle(title: string, maxLength: number = 18): string {
  if (!title) return 'untitled';
  if (title.length <= maxLength) return title;
  return title.slice(0, maxLength) + '…';
}

/** Get display title for session */
export function getDisplayTitle(session: SessionMeta | undefined): string {
  return session?.title || 'new session';
}

/** Get workspace label from path */
export function getWorkspaceLabelFromPath(path: string | undefined): string {
  if (!path) return 'unknown';
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || 'unknown';
}

// =============================================================================
// Session Statistics
// =============================================================================

/** Get session statistics */
export function getSessionStats(sessions: SessionMeta[]): {
  total: number;
  running: number;
  idle: number;
  paused: number;
  error: number;
} {
  return sessions.reduce(
    (stats, session) => {
      stats.total++;
      if (isSessionRunning(session.status)) {
        stats.running++;
      } else if (session.status === 'paused') {
        stats.paused++;
      } else if (session.status === 'error') {
        stats.error++;
      } else {
        stats.idle++;
      }
      return stats;
    },
    { total: 0, running: 0, idle: 0, paused: 0, error: 0 }
  );
}

/** Get running session count for workspace */
export function getRunningCountForWorkspace(
  sessions: SessionMeta[], 
  workspaceId: string
): number {
  return sessions.filter(
    s => s.workspaceId === workspaceId && isSessionRunning(s.status)
  ).length;
}
