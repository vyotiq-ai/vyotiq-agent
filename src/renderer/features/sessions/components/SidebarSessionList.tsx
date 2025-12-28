import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { SectionHeader } from '../../../components/layout/sidebar/SectionHeader';
import { useSessionList } from '../hooks/useSessionList';

interface SidebarSessionListProps {
  collapsed: boolean;
}

import { TerminalSidebarList, type ListGroup } from '../../../components/ui/TerminalSidebarList';

type SessionListItem = {
  id: string;
  title?: string;
  updatedAt: number;
  status: string;
  workspaceId?: string;
  messageCount?: number;
};

export const SidebarSessionList: React.FC<SidebarSessionListProps> = ({ collapsed }) => {
  const {
    sessions,
    activeSessionId,
    activeWorkspaceId,
    activeSessionBelongsToWorkspace,
    handleStartSession,
    handleSelectSession,
    handleDeleteSession
  } = useSessionList();
  const [isOpen, setIsOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // Memoize the session selection handler to avoid stale closure issues
  const selectFirstSession = useCallback(() => {
    if (sessions.length > 0 && !activeSessionBelongsToWorkspace) {
      handleSelectSession(sessions[0].id);
    }
  }, [sessions, activeSessionBelongsToWorkspace, handleSelectSession]);

  // Auto-select first session if active session doesn't belong to current workspace
  useEffect(() => {
    // Small delay to ensure state has settled
    const timer = setTimeout(selectFirstSession, 100);
    return () => clearTimeout(timer);
  }, [selectFirstSession]);

  // Clear active session if it doesn't belong to the current workspace
  useEffect(() => {
    if (activeSessionId && !activeSessionBelongsToWorkspace && sessions.length === 0) {
      // No sessions in this workspace and active session is from different workspace
      handleSelectSession('');
    }
  }, [activeSessionId, activeSessionBelongsToWorkspace, sessions.length, handleSelectSession]);

  const listGroups = useMemo((): ListGroup[] => {
    const groups: Record<string, SessionListItem[]> = {
      'today': [],
      'yesterday': [],
      'week': [],
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
        groups['week'].push(session);
      } else {
        groups['older'].push(session);
      }
    });

    return Object.entries(groups)
      .filter(([_, groupSessions]) => groupSessions.length > 0)
      .map(([label, groupSessions]) => ({
        label,
        items: groupSessions.map(session => ({
          id: session.id,
          label: session.title || 'untitled',
          isActive: session.id === activeSessionId,
          metadata: (session.messageCount ?? 0) > 0 ? session.messageCount : undefined,
        }))
      }));
  }, [sessions, activeSessionId]);

  // Show workspace indicator in empty state
  const hasWorkspace = !!activeWorkspaceId;

  // Handle new session creation with loading state
  const handleNewSession = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!hasWorkspace || isLoading) return;

    setIsLoading(true);
    try {
      await handleStartSession(e);
    } finally {
      setIsLoading(false);
    }
  }, [handleStartSession, hasWorkspace, isLoading]);

  return (
    <div className="font-mono">
      <SectionHeader
        label="sessions"
        action={
          !collapsed && (
            <button
              className="p-1 text-[var(--color-text-dim)] hover:text-[var(--color-accent-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
              onClick={handleNewSession}
              disabled={!hasWorkspace || isLoading}
              title={hasWorkspace ? 'New session' : 'Select a workspace first'}
            >
              {isLoading ? (
                <RefreshCw size={11} className="animate-spin" />
              ) : (
                <Plus size={11} />
              )}
            </button>
          )
        }
        collapsed={collapsed}
        isOpen={isOpen}
        onClick={() => (collapsed ? handleNewSession() : setIsOpen((open) => !open))}
      />
      {isOpen && (
        <TerminalSidebarList
          collapsed={collapsed}
          groups={listGroups}
          onSelect={handleSelectSession}
          onRemove={(e, id) => handleDeleteSession(e, id)}
          isLoading={isLoading}
          typeLabel="session"
          warning={!hasWorkspace && !collapsed ? "no workspace selected" : undefined}
          emptyState={{
            message: "no sessions found",
            actionLabel: "new session",
            onAction: handleNewSession
          }}
        />
      )}
    </div>
  );
};

