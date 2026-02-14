/**
 * Empty State Component
 * 
 * Displays a placeholder when no session is active. Uses pure terminal/CLI styling.
 * Clean, minimal terminal aesthetic without decorative symbols.
 * 
 * Performance optimizations:
 * - Memoized sub-components for reduced re-renders
 * - Extracted typewriter logic into reusable hook
 * - Cleanup of all intervals on unmount
 */
import React, { memo, useMemo } from 'react';
import { useAgentStatus } from '../../../hooks/useAgentStatus';
import { getContextualHint } from '../utils/welcomeHints';
import { cn } from '../../../utils/cn';

/** Hook for computing status displays */
function useStatusDisplays(
  activeSessionId: string | undefined,
  isWorking: boolean,
  status: string
) {
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
    if (activeSessionId) {
      return { text: 'ready', color: 'text-[var(--color-info)]' };
    }
    return { text: 'ready', color: 'text-[var(--color-info)]' };
  }, [isWorking, status, activeSessionId]);

  return { sessionStatus, overallStatus };
}

const EmptyStateComponent: React.FC = () => {
  const { activeSessionId, status, isWorking } = useAgentStatus();

  // Compute all status displays
  const { sessionStatus, overallStatus } = useStatusDisplays(
    activeSessionId,
    isWorking,
    status
  );

  const hint = useMemo(() => {
    return getContextualHint(true, !!activeSessionId, 0);
  }, [activeSessionId]);

  return (
    <div className="flex-1 flex items-center justify-center h-full bg-[var(--color-surface-base)] font-mono">
      <div className="text-left max-w-md px-6">
        {/* Brand + ready indicator */}
        <div className="flex items-center gap-2.5 mb-3">
          <span className="text-[var(--color-accent-primary)] text-sm font-semibold leading-none opacity-80">λ</span>
          <span className="text-[11px] text-[var(--color-text-secondary)]">ready</span>
        </div>

        {/* Status indicators as clean terminal-style metadata */}
        <div className="flex items-center gap-3 mb-3 pl-5">
          <div className="flex items-center gap-1.5">
            <div className={cn(
              'w-[5px] h-[5px] rounded-full',
              sessionStatus.color === 'text-[var(--color-success)]' && 'bg-[var(--color-success)] shadow-[0_0_4px_rgba(52,211,153,0.4)]',
              sessionStatus.color === 'text-[var(--color-warning)]' && 'bg-[var(--color-warning)] shadow-[0_0_4px_rgba(251,191,36,0.4)]',
            )} />
            <span className="text-[9px] text-[var(--color-text-dim)]">session</span>
            <span className={cn('text-[9px]', sessionStatus.color)}>{sessionStatus.text}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={cn(
              'w-[5px] h-[5px] rounded-full',
              overallStatus.color === 'text-[var(--color-accent-primary)]' && 'bg-[var(--color-accent-primary)]',
              overallStatus.color === 'text-[var(--color-info)]' && 'bg-[var(--color-info)]',
              overallStatus.color === 'text-[var(--color-error)]' && 'bg-[var(--color-error)]',
              overallStatus.color === 'text-[var(--color-warning)]' && 'bg-[var(--color-warning)]',
            )} />
            <span className="text-[9px] text-[var(--color-text-dim)]">status</span>
            <span className={cn('text-[9px]', overallStatus.color)}>{overallStatus.text}</span>
          </div>
        </div>

        {/* Hint */}
        <div className="text-[10px] text-[var(--color-text-muted)] pl-5 leading-relaxed">{hint}</div>

        {/* Blinking cursor */}
        <div className="flex items-center gap-2 mt-4 pl-0.5">
          <span className="text-[var(--color-accent-primary)] text-xs opacity-50">λ</span>
          <span className="inline-block w-[5px] h-[11px] bg-[var(--color-accent-primary)]/60 animate-blink" />
        </div>
      </div>
    </div>
  );
};

export const EmptyState = memo(EmptyStateComponent);
EmptyState.displayName = 'EmptyState';
