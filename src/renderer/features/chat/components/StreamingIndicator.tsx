/**
 * Streaming Indicator Components
 * 
 * Visual feedback components for agent running/streaming states.
 * Provides smooth transitions and clear visual hierarchy.
 */
import React, { memo, useEffect, useState } from 'react';
import { Loader2, Sparkles, Brain, Zap } from 'lucide-react';
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
 * Animated dots for "thinking..." effect
 */
const ThinkingDots: React.FC<{ className?: string }> = memo(({ className }) => {
  const [dots, setDots] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(d => (d % 3) + 1);
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className={cn('inline-block min-w-[1.5em]', className)}>
      {'.'.repeat(dots)}
    </span>
  );
});
ThinkingDots.displayName = 'ThinkingDots';

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

  const iconSizes = {
    sm: 10,
    md: 12,
    lg: 14,
  };

  if (variant === 'minimal') {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 font-mono',
        sizeClasses[size],
        'text-[var(--color-accent-primary)]'
      )}>
        <Loader2 size={iconSizes[size]} className="animate-spin" />
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
        <span className="h-2 w-2 rounded-full bg-[var(--color-accent-primary)]" />
        <span>{message}<ThinkingDots /></span>
      </span>
    );
  }

  // Default variant
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 font-mono',
      sizeClasses[size],
      'text-[var(--color-text-muted)]'
    )}>
      <Loader2 size={iconSizes[size]} className="animate-spin text-[var(--color-accent-primary)]" />
      <span>{message}<ThinkingDots /></span>
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
      icon: Sparkles,
      text: 'Ready',
      color: 'text-[var(--color-success)]',
      bgColor: 'bg-[var(--color-success)]/10',
    },
    running: {
      icon: Zap,
      text: 'Running',
      color: 'text-[var(--color-warning)]',
      bgColor: 'bg-[var(--color-warning)]/10',
    },
    thinking: {
      icon: Brain,
      text: 'Thinking',
      color: 'text-[var(--color-accent-primary)]',
      bgColor: 'bg-[var(--color-accent-primary)]/10',
    },
    processing: {
      icon: Loader2,
      text: 'Processing',
      color: 'text-[var(--color-info)]',
      bgColor: 'bg-[var(--color-info)]/10',
    },
    error: {
      icon: Sparkles,
      text: 'Error',
      color: 'text-[var(--color-error)]',
      bgColor: 'bg-[var(--color-error)]/10',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;
  const isAnimated = status === 'running' || status === 'thinking' || status === 'processing';

  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full',
      config.bgColor,
      className
    )}>
      <Icon 
        size={12} 
        className={cn(
          config.color,
          isAnimated && 'animate-spin'
        )} 
      />
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
 * Blinking cursor for streaming text effect
 */
export const StreamingCursor: React.FC<{ className?: string }> = memo(({ className }) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(v => !v);
    }, 530);
    return () => clearInterval(interval);
  }, []);

  return (
    <span 
      className={cn(
        'inline-block w-[2px] h-[1em] ml-0.5 align-middle',
        'bg-[var(--color-accent-primary)]',
        visible ? 'opacity-100' : 'opacity-0',
        'transition-opacity duration-100',
        className
      )}
      aria-hidden="true"
    />
  );
});
StreamingCursor.displayName = 'StreamingCursor';
