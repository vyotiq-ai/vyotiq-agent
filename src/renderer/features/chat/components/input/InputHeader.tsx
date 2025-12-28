/**
 * Input Header Component
 * 
 * Terminal-styled header bar with status indicator and real-time agent activity.
 * Displays context-aware status messages based on agent phase and activity.
 * 
 * @example
 * <InputHeader
 *   isWorking={true}
 *   statusMessage="Reading files..."
 *   statusPhase="executing"
 * />
 */
import React, { memo, useMemo } from 'react';
import { Pause, Play } from 'lucide-react';
import type { AgentStatusInfo } from '../../../../state/agentReducer';
import { cn } from '../../../../utils/cn';
import { getStatusDisplayMessage } from '../../../../utils';

// =============================================================================
// Types
// =============================================================================

export interface InputHeaderProps {
  /** Whether the agent is currently working */
  isWorking: boolean;
  /** Current status message from agent */
  statusMessage?: string;
  /** Phase of status (main agent phases plus idle) */
  statusPhase?: AgentStatusInfo['status'] | 'idle';
  /** Whether there's a workspace warning */
  workspaceWarning?: string | null;
  /** Formatted elapsed time string (mm:ss) */
  elapsedTime?: string;
  /** Whether the current run is paused */
  isPaused?: boolean;
  /** Toggle handler for pause/resume */
  onTogglePause?: () => void;
  /** Custom className */
  className?: string;
}

// =============================================================================
// Sub-Components
// =============================================================================

/** Status indicator dot with glow effect */
const StatusDot: React.FC<{ status: InputHeaderProps['statusPhase'] }> = memo(({ status }) => {
  const isActive = status === 'executing'
    || status === 'planning'
    || status === 'analyzing'
    || status === 'reasoning'
    || status === 'summarizing';

  const dotClass = cn(
    'terminal-status-dot flex-shrink-0',
    status === 'error' && 'error',
    (status === 'recovering' || status === 'paused') && 'warning',
    isActive && 'active',
    (!status || status === 'idle' || status === 'completed') && 'idle'
  );
  
  return <div className={dotClass} aria-hidden="true" />;
});
StatusDot.displayName = 'StatusDot';

/** Typewriter status display with context-aware messages */
const TypewriterStatus: React.FC<{ 
  message?: string; 
  phase?: InputHeaderProps['statusPhase'];
  isWorking: boolean;
  isPaused?: boolean;
}> = memo(({ message, phase, isWorking, isPaused }) => {
  // Get context-aware display message based on phase and raw message
  const displayMessage = useMemo(() => {
    return getStatusDisplayMessage(phase, message, isPaused);
  }, [phase, message, isPaused]);

  // Build screen-reader friendly status text
  const getStatusDescription = () => {
    if (isPaused) return 'Agent is paused';
    if (!isWorking) return 'Agent is idle and ready for input';
    if (phase === 'error') return `Error: ${message || 'An error occurred'}`;
    if (phase === 'recovering') return `Recovering: ${message || 'Retrying operation'}`;
    if (phase === 'paused') return 'Paused';
    return displayMessage || 'Agent is processing';
  };

  if ((isWorking || isPaused) && displayMessage) {
    return (
      <div className="vyotiq-typewriter min-w-0 flex-1">
        <span className={cn(
          'vyotiq-typewriter-text truncate block',
          phase === 'error' && '!text-[var(--color-error)]',
          phase === 'recovering' && '!text-[var(--color-warning)]',
          phase === 'paused' && '!text-[var(--color-warning)]'
        )}>
          {displayMessage}
        </span>
        {/* Visually hidden announcement for screen readers */}
        <span className="sr-only" role="status" aria-live="assertive">
          {getStatusDescription()}
        </span>
      </div>
    );
  }
  
  if (isWorking || isPaused) {
    return (
      <div className="vyotiq-typewriter">
        <span className="vyotiq-typewriter-text">vyotiq</span>
        <span className="typewriter-dots" aria-hidden="true">
          <span className="typewriter-dot">.</span>
          <span className="typewriter-dot">.</span>
          <span className="typewriter-dot">.</span>
        </span>
        <span className="sr-only" role="status" aria-live="polite">{getStatusDescription()}</span>
      </div>
    );
  }
  
  return (
    <span className="text-[10px] text-[var(--color-text-muted)] opacity-80 tracking-wide">
      vyotiq
    </span>
  );
});
TypewriterStatus.displayName = 'TypewriterStatus';

// =============================================================================
// Main Component
// =============================================================================

export const InputHeader: React.FC<InputHeaderProps> = memo(({
  isWorking,
  statusMessage,
  statusPhase = 'idle',
  workspaceWarning,
  elapsedTime,
  isPaused,
  onTogglePause,
  className,
}) => {
  return (
    <div 
      className={cn(
        'flex items-center justify-between px-3 py-1',
        'border-b border-[var(--color-border-subtle)]',
        'bg-[var(--color-surface-header)]',
        'font-mono transition-all duration-200 text-[10px]',
        className
      )}
      role="status"
      aria-live="polite"
    >
      {/* Left: Status and process info */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <div className="terminal-status-indicator flex-shrink-0">
          <StatusDot status={statusPhase} />
        </div>
        <TypewriterStatus
          message={statusMessage}
          phase={statusPhase}
          isWorking={isWorking}
          isPaused={isPaused || statusPhase === 'paused'}
        />
      </div>

      {/* Right: Time + controls */}
      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
        {workspaceWarning && (
          <span 
            className="text-[8px] text-[var(--color-warning)] hidden lg:inline"
            title={workspaceWarning}
          >
            ⚠
          </span>
        )}
        {(isWorking || statusPhase === 'paused' || isPaused) && (
          <span className={cn('terminal-elapsed', (isWorking || statusPhase === 'paused' || isPaused) && 'active')}>
            {elapsedTime ?? '--:--'}
          </span>
        )}
        {onTogglePause && (isWorking || statusPhase === 'paused' || isPaused) && (
          <button
            type="button"
            onClick={onTogglePause}
            className={cn(
              'p-1 rounded-sm border border-transparent',
              'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
              'hover:border-[var(--color-border-subtle)] transition-colors duration-150'
            )}
            title={(statusPhase === 'paused' || isPaused) ? 'Resume' : 'Pause'}
            aria-label={(statusPhase === 'paused' || isPaused) ? 'Resume run' : 'Pause run'}
          >
            {(statusPhase === 'paused' || isPaused) ? <Play size={10} /> : <Pause size={10} />}
          </button>
        )}
      </div>
    </div>
  );
});

InputHeader.displayName = 'InputHeader';
