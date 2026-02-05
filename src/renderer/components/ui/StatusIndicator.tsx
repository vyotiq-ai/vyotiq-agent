import React, { memo } from 'react';
import type { AgentRunStatus } from '../../../shared/types';
import { cn } from '../../utils/cn';

// Extended status type for internal use (includes pending)
type ExtendedStatus = AgentRunStatus | 'pending';

// Agent phase for more granular status display
export type AgentPhase = 'thinking' | 'executing' | 'generating' | 'analyzing' | 'planning' | 'summarizing' | 'recovering';

interface StatusIndicatorProps {
  status: AgentRunStatus;
  /** Optional phase for more specific visual feedback */
  phase?: AgentPhase;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

const statusConfig: Record<ExtendedStatus, {
  label: string;
  code: string;
  color: string;
  dotColor: string;
  bgColor: string;
  animate?: 'pulse';
}> = {
  idle: {
    label: 'IDLE',
    code: '0',
    color: 'text-[var(--color-text-muted)]',
    dotColor: 'bg-[var(--color-border-strong)]',
    bgColor: 'bg-[var(--color-surface-2)]',
  },
  running: {
    label: 'EXEC',
    code: '1',
    color: 'text-[var(--color-accent-primary)]',
    dotColor: 'bg-[var(--color-accent-primary)]',
    bgColor: 'bg-[var(--color-accent-primary)]/10',
    animate: 'pulse',
  },
  'awaiting-confirmation': {
    label: 'WAIT',
    code: '2',
    color: 'text-[var(--color-warning)]',
    dotColor: 'bg-[var(--color-warning)]',
    bgColor: 'bg-[var(--color-warning)]/10',
  },
  error: {
    label: 'ERR',
    code: '-1',
    color: 'text-[var(--color-error)]',
    dotColor: 'bg-[var(--color-error)]',
    bgColor: 'bg-[var(--color-error)]/10',
  },
  paused: {
    label: 'PAUSE',
    code: '||',
    color: 'text-[var(--color-warning)]',
    dotColor: 'bg-[var(--color-warning)]',
    bgColor: 'bg-[var(--color-warning)]/10',
  },
  pending: {
    label: 'PEND',
    code: '...',
    color: 'text-[var(--color-text-muted)]',
    dotColor: 'bg-[var(--color-text-muted)]',
    bgColor: 'bg-[var(--color-surface-2)]',
  },
};

const phaseLabels: Record<AgentPhase, string> = {
  thinking: 'THINK',
  executing: 'EXEC',
  generating: 'GEN',
  analyzing: 'SCAN',
  planning: 'PLAN',
  summarizing: 'SUM',
  recovering: 'RETRY',
};

const sizeConfig = {
  sm: { text: 'text-[9px]', padding: 'px-1.5 py-0.5', dot: 'w-1.5 h-1.5', gap: 'gap-1' },
  md: { text: 'text-[10px]', padding: 'px-2 py-1', dot: 'w-2 h-2', gap: 'gap-1.5' },
  lg: { text: 'text-[11px]', padding: 'px-2.5 py-1', dot: 'w-2.5 h-2.5', gap: 'gap-1.5' },
};

export const StatusIndicator: React.FC<StatusIndicatorProps> = memo((
  {
    status,
    phase,
    size = 'md',
    showLabel = true,
    className,
  }
) => {
  const config = statusConfig[status];
  const sizes = sizeConfig[size];
  const displayLabel = phase && status === 'running' ? phaseLabels[phase] : config.label;

  return (
    <div
      className={cn(
        'flex items-center font-mono rounded-sm transition-colors duration-200',
        config.color,
        config.bgColor,
        sizes.padding,
        sizes.text,
        sizes.gap,
        className
      )}
    >
      {/* Simple dot */}
      <span
        className={cn(
          'rounded-full',
          sizes.dot,
          config.dotColor
        )}
      />
      {showLabel && (
        <span className="font-medium">
          [{displayLabel}]
        </span>
      )}
    </div>
  );
});

StatusIndicator.displayName = 'StatusIndicator';

// Simple dot-only status indicator
interface StatusDotProps {
  status: AgentRunStatus;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const StatusDot: React.FC<StatusDotProps> = memo((
  {
    status,
    size = 'md',
    className,
  }
) => {
  const statusCfg = statusConfig[status];
  const dotSizes = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5',
  };

  return (
    <span
      className={cn(
        'rounded-full',
        dotSizes[size],
        statusCfg.dotColor,
        className
      )}
    />
  );
});

StatusDot.displayName = 'StatusDot';

// =============================================================================
// Phase Progress Indicator - Visual progress for agent phases
// =============================================================================

interface PhaseProgressProps {
  /** Current phase */
  phase: AgentPhase;
  /** Optional elapsed time in seconds */
  elapsedSeconds?: number;
  /** Whether to show elapsed time */
  showTime?: boolean;
  className?: string;
}

const phaseIcons: Record<AgentPhase, string> = {
  thinking: '◐',
  executing: '▶',
  generating: '◉',
  analyzing: '◎',
  planning: '◈',
  summarizing: '◆',
  recovering: '↻',
};

export const PhaseProgress: React.FC<PhaseProgressProps> = memo((
  {
    phase,
    elapsedSeconds,
    showTime = true,
    className,
  }
) => {
  // Format time as mm:ss
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn(
      'flex items-center gap-2 font-mono text-[10px]',
      'text-[var(--color-accent-primary)]',
      className
    )}>
      {/* Phase icon */}
      <span>{phaseIcons[phase]}</span>
      
      {/* Phase label */}
      <span className="font-medium uppercase tracking-wide">
        {phaseLabels[phase]}
      </span>
      
      {/* Elapsed time */}
      {showTime && elapsedSeconds !== undefined && (
        <span className="text-[var(--color-text-muted)] tabular-nums">
          {formatTime(elapsedSeconds)}
        </span>
      )}
    </div>
  );
});

PhaseProgress.displayName = 'PhaseProgress';
