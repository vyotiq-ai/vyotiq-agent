/**
 * Run Progress Component
 * 
 * Shows live agent run status with:
 * - Elapsed time
 * - Pause/Resume controls
 * - Stop control
 */
import React, { memo, useCallback, useEffect, useState, useMemo } from 'react';
import { Clock, Pause, Play, Square } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { getStatusDisplayMessage } from '../../../utils';
import type { AgentStatusInfo } from '../../../state/agentReducer';

interface RunProgressProps {
  sessionId: string;
  status: AgentStatusInfo | undefined;
  isRunning: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  isPaused?: boolean;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return '<1s';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export const RunProgress: React.FC<RunProgressProps> = memo(({
  sessionId: _sessionId,
  status,
  isRunning,
  onPause,
  onResume,
  onStop,
  isPaused = false,
}) => {
  const [elapsedMs, setElapsedMs] = useState(0);

  // Update elapsed time every second while running
  useEffect(() => {
    if (!isRunning || !status?.runStartedAt) {
      setElapsedMs(0);
      return;
    }

    const updateElapsed = () => {
      setElapsedMs(Date.now() - status.runStartedAt!);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [isRunning, status?.runStartedAt]);

  const handlePauseResume = useCallback(() => {
    if (isPaused) {
      onResume?.();
    } else {
      onPause?.();
    }
  }, [isPaused, onPause, onResume]);

  // Get context-aware status label using the utility
  // Must be before early return to follow React hooks rules
  const statusLabel = useMemo(() => {
    const phase = status?.status;
    const message = typeof status?.message === 'string' ? status.message : '';
    return getStatusDisplayMessage(phase, message, isPaused) || 'processing';
  }, [status?.status, status?.message, isPaused]);

  if (!isRunning && !isPaused) return null;

  return (
    <div className={cn(
      'flex items-center gap-3 px-3 py-2 rounded-lg',
      'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]',
      'text-[10px] font-mono'
    )}>
      {/* Status indicator */}
      <div className="flex items-center gap-1.5">
        {isPaused ? (
          <span className="w-2 h-2 rounded-full bg-[var(--color-warning)]" />
        ) : (
          <span className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse" />
        )}
        <span className="text-[var(--color-text-muted)]">
          {isPaused ? 'Paused' : statusLabel}
        </span>
      </div>

      {/* Elapsed time */}
      <div className="flex items-center gap-1 text-[var(--color-text-muted)]">
        <Clock size={10} />
        <span>{formatDuration(elapsedMs)}</span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 ml-auto">
        {(onPause || onResume) && (
          <button
            onClick={handlePauseResume}
            className={cn(
              'p-1 rounded hover:bg-[var(--color-surface-2)]',
              'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
              'transition-colors'
            )}
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? <Play size={12} /> : <Pause size={12} />}
          </button>
        )}
        {onStop && (
          <button
            onClick={onStop}
            className={cn(
              'p-1 rounded hover:bg-[var(--color-error)]/10',
              'text-[var(--color-text-muted)] hover:text-[var(--color-error)]',
              'transition-colors'
            )}
            title="Stop"
          >
            <Square size={12} />
          </button>
        )}
      </div>
    </div>
  );
});

RunProgress.displayName = 'RunProgress';

export default RunProgress;
