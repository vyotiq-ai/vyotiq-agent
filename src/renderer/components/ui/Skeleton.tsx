/**
 * Skeleton Loading Component
 * 
 * Provides consistent loading placeholders across the application.
 * Supports various shapes, sizes, and animation styles for different use cases.
 */
import React, { memo } from 'react';
import { cn } from '../../utils/cn';

// =============================================================================
// Types
// =============================================================================

export type SkeletonVariant = 'text' | 'circular' | 'rectangular' | 'rounded';
export type SkeletonAnimation = 'pulse' | 'wave' | 'none';

export interface SkeletonProps {
  /** Shape variant of the skeleton */
  variant?: SkeletonVariant;
  /** Width (can be CSS value or number for pixels) */
  width?: string | number;
  /** Height (can be CSS value or number for pixels) */
  height?: string | number;
  /** Animation style */
  animation?: SkeletonAnimation;
  /** Additional CSS classes */
  className?: string;
  /** Number of skeleton items to render (for lists) */
  count?: number;
  /** Gap between items when count > 1 */
  gap?: string | number;
  /** Custom border radius (overrides variant default) */
  borderRadius?: string | number;
  /** Inline style overrides */
  style?: React.CSSProperties;
}

// =============================================================================
// Skeleton Component
// =============================================================================

/**
 * Base skeleton component for loading placeholders
 */
export const Skeleton: React.FC<SkeletonProps> = memo(({
  variant = 'text',
  width,
  height,
  animation = 'pulse',
  className,
  count = 1,
  gap = 8,
  borderRadius,
  style,
}) => {
  // Determine dimensions based on variant
  const getDefaultHeight = () => {
    switch (variant) {
      case 'text':
        return '1em';
      case 'circular':
        return width || 40;
      case 'rectangular':
        return 100;
      case 'rounded':
        return 40;
      default:
        return '1em';
    }
  };

  // Determine border radius based on variant
  const getBorderRadius = () => {
    if (borderRadius !== undefined) {
      return typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius;
    }
    switch (variant) {
      case 'text':
        return '4px';
      case 'circular':
        return '50%';
      case 'rectangular':
        return '0';
      case 'rounded':
        return '8px';
      default:
        return '4px';
    }
  };

  // Animation classes
  const getAnimationClass = () => {
    switch (animation) {
      case 'pulse':
        return 'animate-pulse';
      case 'wave':
        return 'skeleton-wave';
      case 'none':
        return '';
      default:
        return 'animate-pulse';
    }
  };

  const computedWidth = typeof width === 'number' ? `${width}px` : width;
  const computedHeight = typeof height === 'number' ? `${height}px` : 
    typeof getDefaultHeight() === 'number' ? `${getDefaultHeight()}px` : getDefaultHeight();
  const computedGap = typeof gap === 'number' ? `${gap}px` : gap;

  const skeletonStyle: React.CSSProperties = {
    width: computedWidth || (variant === 'circular' ? computedHeight : '100%'),
    height: computedHeight,
    borderRadius: getBorderRadius(),
    ...style,
  };

  // Single skeleton
  if (count === 1) {
    return (
      <div
        className={cn(
          'bg-[var(--color-surface-2)]',
          getAnimationClass(),
          className
        )}
        style={skeletonStyle}
        role="presentation"
        aria-hidden="true"
      />
    );
  }

  // Multiple skeletons
  return (
    <div 
      className={cn('flex flex-col', className)} 
      style={{ gap: computedGap }}
      role="presentation"
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={cn(
            'bg-[var(--color-surface-2)]',
            getAnimationClass()
          )}
          style={skeletonStyle}
        />
      ))}
    </div>
  );
});

Skeleton.displayName = 'Skeleton';

// =============================================================================
// Preset Components for Common Use Cases
// =============================================================================

/**
 * Text line skeleton - mimics a line of text
 */
export const SkeletonText: React.FC<{
  lines?: number;
  className?: string;
  lastLineWidth?: string;
}> = memo(({ lines = 1, className, lastLineWidth = '80%' }) => {
  if (lines === 1) {
    return <Skeleton variant="text" className={className} />;
  }

  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          variant="text"
          width={i === lines - 1 ? lastLineWidth : '100%'}
        />
      ))}
    </div>
  );
});

SkeletonText.displayName = 'SkeletonText';

/**
 * Avatar skeleton - circular placeholder for user avatars
 */
export const SkeletonAvatar: React.FC<{
  size?: number;
  className?: string;
}> = memo(({ size = 40, className }) => (
  <Skeleton
    variant="circular"
    width={size}
    height={size}
    className={className}
  />
));

SkeletonAvatar.displayName = 'SkeletonAvatar';

/**
 * Button skeleton - mimics a button shape
 */
export const SkeletonButton: React.FC<{
  width?: string | number;
  height?: number;
  className?: string;
}> = memo(({ width = 100, height = 36, className }) => (
  <Skeleton
    variant="rounded"
    width={width}
    height={height}
    borderRadius={6}
    className={className}
  />
));

SkeletonButton.displayName = 'SkeletonButton';

/**
 * Card skeleton - mimics a content card
 */
export const SkeletonCard: React.FC<{
  className?: string;
  showHeader?: boolean;
  showFooter?: boolean;
  contentLines?: number;
}> = memo(({ className, showHeader = true, showFooter = false, contentLines = 3 }) => (
  <div
    className={cn(
      'p-4 rounded-lg border border-[var(--color-border-subtle)]',
      'bg-[var(--color-surface-1)]',
      className
    )}
  >
    {showHeader && (
      <div className="flex items-center gap-3 mb-4">
        <SkeletonAvatar size={32} />
        <div className="flex-1">
          <Skeleton variant="text" width="60%" height={14} />
          <Skeleton variant="text" width="40%" height={12} className="mt-1" />
        </div>
      </div>
    )}
    <SkeletonText lines={contentLines} />
    {showFooter && (
      <div className="flex gap-2 mt-4">
        <SkeletonButton width={80} height={28} />
        <SkeletonButton width={80} height={28} />
      </div>
    )}
  </div>
));

SkeletonCard.displayName = 'SkeletonCard';

/**
 * Message skeleton - mimics a chat message
 */
export const SkeletonMessage: React.FC<{
  type?: 'user' | 'assistant';
  className?: string;
}> = memo(({ type = 'assistant', className }) => (
  <div
    className={cn(
      'flex gap-3',
      type === 'user' ? 'flex-row-reverse' : 'flex-row',
      className
    )}
  >
    <SkeletonAvatar size={28} />
    <div className={cn('flex-1', type === 'user' ? 'text-right' : 'text-left')}>
      <Skeleton variant="text" width="30%" height={12} className="mb-2" />
      <div
        className={cn(
          'p-3 rounded-lg',
          type === 'user'
            ? 'bg-[var(--color-accent-primary)]/10 ml-auto'
            : 'bg-[var(--color-surface-2)]'
        )}
        style={{ maxWidth: type === 'user' ? '60%' : '80%' }}
      >
        <SkeletonText lines={type === 'user' ? 1 : 3} />
      </div>
    </div>
  </div>
));

SkeletonMessage.displayName = 'SkeletonMessage';

/**
 * Tool execution skeleton - mimics tool execution display
 */
export const SkeletonToolExecution: React.FC<{
  className?: string;
}> = memo(({ className }) => (
  <div
    className={cn(
      'flex items-center gap-2 p-2 rounded-md',
      'bg-[var(--color-surface-2)]/50',
      className
    )}
  >
    <Skeleton variant="circular" width={16} height={16} />
    <Skeleton variant="text" width={100} height={14} />
    <Skeleton variant="text" width={200} height={12} className="opacity-60" />
    <div className="ml-auto">
      <Skeleton variant="rounded" width={50} height={16} />
    </div>
  </div>
));

SkeletonToolExecution.displayName = 'SkeletonToolExecution';

/**
 * List item skeleton - mimics a list item
 */
export const SkeletonListItem: React.FC<{
  hasIcon?: boolean;
  hasAction?: boolean;
  className?: string;
}> = memo(({ hasIcon = true, hasAction = false, className }) => (
  <div className={cn('flex items-center gap-3 py-2', className)}>
    {hasIcon && <Skeleton variant="circular" width={20} height={20} />}
    <div className="flex-1">
      <Skeleton variant="text" width="70%" height={14} />
      <Skeleton variant="text" width="50%" height={12} className="mt-1 opacity-70" />
    </div>
    {hasAction && <Skeleton variant="rounded" width={60} height={24} />}
  </div>
));

SkeletonListItem.displayName = 'SkeletonListItem';

/**
 * Session skeleton - mimics session list item
 */
export const SkeletonSession: React.FC<{
  className?: string;
}> = memo(({ className }) => (
  <div
    className={cn(
      'p-3 rounded-lg border border-[var(--color-border-subtle)]/50',
      className
    )}
  >
    <div className="flex items-start gap-2">
      <Skeleton variant="text" width="80%" height={16} />
    </div>
    <div className="flex items-center gap-2 mt-2">
      <Skeleton variant="text" width={60} height={10} />
      <Skeleton variant="circular" width={4} height={4} />
      <Skeleton variant="text" width={40} height={10} />
    </div>
  </div>
));

SkeletonSession.displayName = 'SkeletonSession';

// =============================================================================
// CSS for wave animation (add to global styles if using wave animation)
// =============================================================================
/*
@keyframes skeleton-wave {
  0% {
    background-position: -200px 0;
  }
  100% {
    background-position: calc(200px + 100%) 0;
  }
}

.skeleton-wave {
  background: linear-gradient(
    90deg,
    var(--color-surface-2) 25%,
    var(--color-surface-3) 50%,
    var(--color-surface-2) 75%
  );
  background-size: 200px 100%;
  animation: skeleton-wave 1.2s ease-in-out infinite;
}
*/
