import React from 'react';
import type { AgentRunStatus } from '../../../shared/types';
import { cn } from '../../utils/cn';

// Extended status type for internal use (includes pending)
type ExtendedStatus = AgentRunStatus | 'pending';

interface StatusIndicatorProps {
  status: AgentRunStatus;
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
  animate?: boolean;
}> = {
  idle: {
    label: 'IDLE',
    code: '0',
    color: 'text-[var(--color-accent-primary)]',
    dotColor: 'bg-[var(--color-accent-primary)]',
    bgColor: 'bg-[var(--color-accent-primary)]/10',
  },
  running: {
    label: 'EXEC',
    code: '1',
    color: 'text-[var(--color-accent-primary)]',
    dotColor: 'bg-[var(--color-accent-primary)]',
    bgColor: 'bg-[var(--color-accent-primary)]/10',
    animate: true,
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

const sizeConfig = {
  sm: { text: 'text-[9px]', padding: 'px-1.5 py-0.5', dot: 'w-1.5 h-1.5' },
  md: { text: 'text-[10px]', padding: 'px-2 py-1', dot: 'w-2 h-2' },
  lg: { text: 'text-[11px]', padding: 'px-2.5 py-1', dot: 'w-2 h-2' },
};

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  size = 'md',
  showLabel = true,
  className,
}) => {
  const config = statusConfig[status];
  const sizes = sizeConfig[size];

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 font-mono rounded-sm transition-all duration-200',
        config.color,
        config.bgColor,
        sizes.padding,
        sizes.text,
        className
      )}
    >
      <span
        className={cn(
          'rounded-full transition-all duration-200',
          sizes.dot,
          config.dotColor,
          config.animate && 'animate-pulse'
        )}
      />
      {showLabel && (
        <span className="font-medium">[{config.label}]</span>
      )}
    </div>
  );
};

// Dot-only status indicator
interface StatusDotProps {
  status: AgentRunStatus;
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
  className?: string;
}

export const StatusDot: React.FC<StatusDotProps> = ({
  status,
  size = 'md',
  pulse = true,
  className,
}) => {
  const statusCfg = statusConfig[status];
  const dotSizes = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5',
  };

  return (
    <span
      className={cn(
        'rounded-full transition-all duration-200',
        dotSizes[size],
        statusCfg.dotColor,
        pulse && statusCfg.animate && 'animate-pulse',
        className
      )}
    />
  );
};
