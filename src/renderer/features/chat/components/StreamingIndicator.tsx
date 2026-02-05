/**
 * Streaming Indicator Components
 * 
 * Visual feedback components for agent running/streaming states.
 * Provides smooth transitions and clear visual hierarchy.
 * 
 * Minimalist design - icons removed for cleaner interface.
 */
import React, { memo } from 'react';
import { cn } from '../../../utils/cn';

export interface StreamingIndicatorProps {
  /** Whether the agent is currently streaming */
  isStreaming: boolean;
  /** Optional status message to display */
  message?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Visual style variant */
  variant?: 'default' | 'minimal' | 'pulse';
}

/**
 * Streaming indicator for inline message display
 */
export const StreamingIndicator: React.FC<StreamingIndicatorProps> = memo(({
  isStreaming,
  message = 'thinking',
  size = 'sm',
  variant = 'default',
}) => {
  if (!isStreaming) return null;

  const sizeClasses = {
    sm: 'text-[10px]',
    md: 'text-xs',
    lg: 'text-sm',
  };

  if (variant === 'minimal') {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 font-mono',
        sizeClasses[size],
        'text-[var(--color-accent-primary)]'
      )}>
        <span>{message}</span>
      </span>
    );
  }

  if (variant === 'pulse') {
    return (
      <span className={cn(
        'inline-flex items-center gap-1.5 font-mono',
        sizeClasses[size],
        'text-[var(--color-text-muted)]'
      )}>
        <span>{message}</span>
      </span>
    );
  }

  // Default variant - static indicator
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 font-mono',
      sizeClasses[size],
      'text-[var(--color-text-muted)]'
    )}>
      <span>{message}</span>
    </span>
  );
});
StreamingIndicator.displayName = 'StreamingIndicator';

/**
 * Agent status indicator for header/sidebar
 */
export interface AgentStatusIndicatorProps {
  status: 'idle' | 'running' | 'thinking' | 'processing' | 'error';
  iteration?: number;
  maxIterations?: number;
  className?: string;
}

export const AgentStatusIndicator: React.FC<AgentStatusIndicatorProps> = memo(({
  status,
  iteration,
  maxIterations,
  className,
}) => {
  const statusConfig = {
    idle: {
      text: 'Ready',
      color: 'text-[var(--color-success)]',
      bgColor: 'bg-[var(--color-success)]',
    },
    running: {
      text: 'Running',
      color: 'text-[var(--color-warning)]',
      bgColor: 'bg-[var(--color-warning)]',
    },
    thinking: {
      text: 'Thinking',
      color: 'text-[var(--color-accent-primary)]',
      bgColor: 'bg-[var(--color-accent-primary)]',
    },
    processing: {
      text: 'Processing',
      color: 'text-[var(--color-info)]',
      bgColor: 'bg-[var(--color-info)]',
    },
    error: {
      text: 'Error',
      color: 'text-[var(--color-error)]',
      bgColor: 'bg-[var(--color-error)]',
    },
  } as const;

  const config = statusConfig[status];

  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full',
      `${config.bgColor}/10`,
      className
    )}>
      {/* Minimal status dot */}
      <span className={cn('w-1.5 h-1.5 rounded-full', config.bgColor)} />
      <span className={cn('text-[10px] font-mono', config.color)}>
        {config.text}
        {iteration !== undefined && maxIterations !== undefined && (
          <span className="text-[var(--color-text-dim)] ml-1">
            ({iteration}/{maxIterations})
          </span>
        )}
      </span>
    </div>
  );
});
AgentStatusIndicator.displayName = 'AgentStatusIndicator';

/**
 * Skeleton loading placeholder for message content
 */
export interface MessageSkeletonProps {
  lines?: number;
  className?: string;
}

export const MessageSkeleton: React.FC<MessageSkeletonProps> = memo(({
  lines = 3,
  className,
}) => {
  return (
    <div className={cn('space-y-2 animate-pulse', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div 
          key={i}
          className={cn(
            'h-3 bg-[var(--color-surface-2)] rounded',
            // Vary widths for more natural appearance
            i === lines - 1 ? 'w-2/3' : i % 2 === 0 ? 'w-full' : 'w-5/6'
          )}
        />
      ))}
    </div>
  );
});
MessageSkeleton.displayName = 'MessageSkeleton';

/**
 * Static cursor for streaming text effect (no blinking)
 */
export const StreamingCursor: React.FC<{ className?: string }> = memo(({ className }) => {
  return (
    <span 
      className={cn(
        'inline-block w-[2px] h-[1em] ml-0.5 align-middle',
        'bg-[var(--color-accent-primary)] opacity-80',
        className
      )}
      aria-hidden="true"
    />
  );
});
StreamingCursor.displayName = 'StreamingCursor';
