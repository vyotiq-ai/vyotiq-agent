/**
 * Empty State Component
 * 
 * Displays a placeholder when no session is active. Uses pure terminal/CLI styling.
 * 
 * Performance optimizations:
 * - Memoized sub-components for reduced re-renders
 * - Extracted typewriter logic into reusable hook
 * - Cleanup of all intervals on unmount
 */
import React, { memo, useMemo } from 'react';
import { useWorkspaceList } from '../../../hooks/useWorkspaceList';
import { useAgentStatus } from '../../../hooks/useAgentStatus';
import { getContextualHint } from '../utils/welcomeHints';

/** Hook for computing status displays */
function useStatusDisplays(
  activeWorkspace: ReturnType<typeof useWorkspaceList>['activeWorkspace'],
  workspacesLength: number,
  activeSessionId: string | undefined,
  isWorking: boolean,
  status: string
) {
  const workspaceStatus = useMemo(() => {
    if (activeWorkspace) {
      const name = activeWorkspace.label || activeWorkspace.path?.split(/[/\\]/).pop() || 'unnamed';
      return { text: name, color: 'text-[var(--color-success)]' };
    }
    if (workspacesLength > 0) {
      return { text: 'not selected', color: 'text-[var(--color-warning)]' };
    }
    return { text: 'none', color: 'text-[var(--color-text-muted)]' };
  }, [activeWorkspace, workspacesLength]);

  const sessionStatus = useMemo(() => {
    if (activeSessionId) {
      return { text: 'active', color: 'text-[var(--color-success)]' };
    }
    return { text: 'none', color: 'text-[var(--color-warning)]' };
  }, [activeSessionId]);

  const overallStatus = useMemo(() => {
    if (isWorking) {
      return { text: 'working', color: 'text-[var(--color-accent-primary)]' };
    }
    if (status === 'awaiting-confirmation') {
      return { text: 'awaiting', color: 'text-[var(--color-warning)]' };
    }
    if (status === 'error') {
      return { text: 'error', color: 'text-[var(--color-error)]' };
    }
    if (activeWorkspace && activeSessionId) {
      return { text: 'ready', color: 'text-[var(--color-info)]' };
    }
    if (activeWorkspace) {
      return { text: 'ready', color: 'text-[var(--color-info)]' };
    }
    return { text: 'waiting', color: 'text-[var(--color-text-muted)]' };
  }, [isWorking, status, activeWorkspace, activeSessionId]);

  return { workspaceStatus, sessionStatus, overallStatus };
}

const EmptyStateComponent: React.FC = () => {
  const { activeWorkspace, workspaces } = useWorkspaceList();
  const { activeSessionId, status, isWorking } = useAgentStatus();

  // Compute all status displays
  const { workspaceStatus, sessionStatus, overallStatus } = useStatusDisplays(
    activeWorkspace,
    workspaces.length,
    activeSessionId,
    isWorking,
    status
  );

  const hint = useMemo(() => {
    return getContextualHint(!!activeWorkspace, !!activeSessionId, 0);
  }, [activeWorkspace, activeSessionId]);

  return (
    <div className="flex-1 flex items-center justify-center h-full bg-[var(--color-surface-base)] font-mono">
      <div className="text-left space-y-2 max-w-md px-4">
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-accent-primary)] text-sm font-medium leading-none opacity-80">λ</span>
          <span className="text-[11px] text-[var(--color-text-secondary)]">ready</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          <span className="text-[var(--color-text-dim)]">workspace:</span>
          <span className={workspaceStatus.color}>{workspaceStatus.text}</span>
          <span className="text-[var(--color-text-dim)]">session:</span>
          <span className={sessionStatus.color}>{sessionStatus.text}</span>
          <span className="text-[var(--color-text-dim)]">status:</span>
          <span className={overallStatus.color}>{overallStatus.text}</span>
        </div>
        <div className="text-[10px] text-[var(--color-text-muted)]">{hint}</div>
      </div>
    </div>
  );
};

export const EmptyState = memo(EmptyStateComponent);
