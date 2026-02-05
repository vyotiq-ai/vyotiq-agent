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
import React, { memo, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { cn } from '../../../utils/cn';
import { useWorkspaceList } from '../../../hooks/useWorkspaceList';
import { useAgentStatus } from '../../../hooks/useAgentStatus';
import { getContextualHint, SESSION_HINTS } from '../utils/welcomeHints';

/** Status indicator row component */
interface StatusRowProps {
  label: string;
  value: string;
  color: string;
}

const StatusRow: React.FC<StatusRowProps> = memo(({ label, value, color }) => (
  <div className="flex items-center gap-2">
    <span className="text-[var(--color-text-muted)] w-16">{label}</span>
    <span className={color}>{value}</span>
  </div>
));
StatusRow.displayName = 'StatusRow';

/** Blinking cursor component */
const BlinkingCursor: React.FC<{ visible: boolean }> = memo(({ visible }) => (
  <span className={cn(
    "w-[8px] h-[16px] bg-[var(--color-accent-primary)] rounded-[1px]",
    visible ? 'opacity-100' : 'opacity-30'
  )} />
));
BlinkingCursor.displayName = 'BlinkingCursor';

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

/** Hook for typewriter effect with cycling */
function useTypewriterEffect(
  getHint: () => string,
  shouldCycle: boolean,
  resetDeps: unknown[]
) {
  const [displayedText, setDisplayedText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Reset when dependencies change
  useEffect(() => {
    setDisplayedText('');
    setIsDeleting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resetDeps);

  const currentHint = getHint();
  const totalHints = SESSION_HINTS.length;

  useEffect(() => {
    const clearPendingTimeout = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const scheduleNext = (callback: () => void, delay: number) => {
      clearPendingTimeout();
      timeoutRef.current = setTimeout(callback, delay);
    };

    const tick = () => {
      if (isDeleting) {
        if (displayedText.length > 0) {
          setDisplayedText(prev => prev.slice(0, -1));
          scheduleNext(tick, 25);
        } else {
          setIsDeleting(false);
          if (shouldCycle) {
            setHintIndex(prev => prev + 1);
          }
          scheduleNext(tick, 200);
        }
      } else {
        if (displayedText.length < currentHint.length) {
          setDisplayedText(currentHint.slice(0, displayedText.length + 1));
          scheduleNext(tick, 40 + Math.random() * 40);
        } else if (shouldCycle) {
          // Done typing, wait then delete (only if cycling through hints)
          scheduleNext(() => {
            setIsDeleting(true);
            tick();
          }, 3000);
        }
      }
    };

    scheduleNext(tick, 150);

    return clearPendingTimeout;
  }, [displayedText, isDeleting, currentHint, shouldCycle]);

  return { displayedText, hintIndex, totalHints };
}

const EmptyStateComponent: React.FC = () => {
  const [showCursor, setShowCursor] = useState(true);
  const { activeWorkspace, workspaces } = useWorkspaceList();
  const { activeSessionId, status, isWorking } = useAgentStatus();
  
  // Cursor blink effect
  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor(v => !v);
    }, 530);
    return () => clearInterval(interval);
  }, []);

  // Compute all status displays
  const { workspaceStatus, sessionStatus, overallStatus } = useStatusDisplays(
    activeWorkspace,
    workspaces.length,
    activeSessionId,
    isWorking,
    status
  );

  // Stable hint getter
  const [hintIndexState, setHintIndexState] = useState(0);
  const getHintForState = useCallback(() => {
    return getContextualHint(!!activeWorkspace, !!activeSessionId, hintIndexState);
  }, [activeWorkspace, activeSessionId, hintIndexState]);

  const shouldCycle = !!(activeWorkspace && activeSessionId);
  
  // Typewriter effect
  const { displayedText, hintIndex, totalHints } = useTypewriterEffect(
    getHintForState,
    shouldCycle,
    [activeWorkspace?.id, activeSessionId]
  );

  // Sync hint index for cycling
  useEffect(() => {
    setHintIndexState(hintIndex);
  }, [hintIndex]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center h-full bg-[var(--color-surface-base)] font-mono">
      <div className="text-left space-y-4 max-w-md px-4">
        {/* Lambda brand mark */}
        <div className="flex items-center mb-1">
          <span className="text-[var(--color-accent-primary)] text-2xl font-medium leading-none opacity-80">λ</span>
        </div>

        {/* Status display */}
        <div className="text-[11px] space-y-2 p-3 bg-[var(--color-surface-1)]/50 rounded-lg border border-[var(--color-border-subtle)]">
          <div className="text-[var(--color-text-placeholder)] space-y-1.5">
            <StatusRow label="workspace" value={workspaceStatus.text} color={workspaceStatus.color} />
            <StatusRow label="session" value={sessionStatus.text} color={sessionStatus.color} />
            <StatusRow label="status" value={overallStatus.text} color={overallStatus.color} />
          </div>
        </div>

        {/* Command prompt with typewriter effect */}
        <div className="flex items-center gap-1.5 text-[12px] py-3">
          <span className="text-[var(--color-text-secondary)] min-h-[1.2em]">{displayedText}</span>
          <BlinkingCursor visible={showCursor} />
          {/* Show hint progress when there are multiple hints */}
          {activeWorkspace && activeSessionId && totalHints > 1 && (
            <span className="ml-2 text-[8px] text-[var(--color-text-dim)]">
              {(hintIndex % totalHints) + 1}/{totalHints}
            </span>
          )}
        </div>
        
        {/* Keyboard shortcuts hint */}
        <div className="text-[9px] text-[var(--color-text-dim)] pt-2 border-t border-[var(--color-border-subtle)]">
          <span>press </span>
          <kbd className="px-1.5 py-0.5 bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded text-[var(--color-text-muted)]">?</kbd>
          <span> for keyboard shortcuts</span>
        </div>
      </div>
    </div>
  );
};

export const EmptyState = memo(EmptyStateComponent);
