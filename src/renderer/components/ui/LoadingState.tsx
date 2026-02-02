/**
 * Loading State Component
 * 
 * Provides consistent loading state displays across the application.
 * Supports various sizes, layouts, and customizations.
 */
import React, { memo } from 'react';
import { cn } from '../../utils/cn';

// =============================================================================
// Types
// =============================================================================

export interface LoadingStateProps {
  /** Loading message to display */
  message?: string;
  /** Secondary/subtitle message */
  subMessage?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Layout direction */
  layout?: 'vertical' | 'horizontal';
  /** Whether to fill the container */
  fullScreen?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Icon to display (defaults to spinner) */
  icon?: React.ReactNode;
  /** Whether to show the spinner */
  showSpinner?: boolean;
}

// =============================================================================
// Spinner Component
// =============================================================================

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
};

export const Spinner: React.FC<SpinnerProps> = memo(({ size = 'md', className }) => (
  <svg
    className={cn('animate-spin text-[var(--color-accent-primary)]', sizeClasses[size], className)}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
));

Spinner.displayName = 'Spinner';

// =============================================================================
// Loading State Component
// =============================================================================

export const LoadingState: React.FC<LoadingStateProps> = memo(({
  message = 'Loading...',
  subMessage,
  size = 'md',
  layout = 'vertical',
  fullScreen = false,
  className,
  icon,
  showSpinner = true,
}) => {
  const containerClasses = cn(
    'flex items-center justify-center',
    layout === 'vertical' ? 'flex-col gap-3' : 'flex-row gap-3',
    fullScreen && 'fixed inset-0 bg-[var(--color-surface-base)]/80 backdrop-blur-sm z-50',
    className
  );

  const textSizeClasses = {
    sm: { message: 'text-[11px]', sub: 'text-[9px]' },
    md: { message: 'text-[13px]', sub: 'text-[11px]' },
    lg: { message: 'text-[15px]', sub: 'text-[13px]' },
  };

  return (
    <div className={containerClasses} role="status" aria-live="polite">
      {showSpinner && (icon || <Spinner size={size} />)}
      <div className={cn('text-center', layout === 'horizontal' && 'text-left')}>
        {message && (
          <p className={cn('text-[var(--color-text-secondary)]', textSizeClasses[size].message)}>
            {message}
          </p>
        )}
        {subMessage && (
          <p className={cn('text-[var(--color-text-muted)] mt-1', textSizeClasses[size].sub)}>
            {subMessage}
          </p>
        )}
      </div>
    </div>
  );
});

LoadingState.displayName = 'LoadingState';

// =============================================================================
// Inline Loading Component (for buttons, etc.)
// =============================================================================

export interface InlineLoadingProps {
  /** Loading text */
  text?: string;
  /** Size of the spinner */
  size?: 'sm' | 'md';
  /** Additional CSS classes */
  className?: string;
}

export const InlineLoading: React.FC<InlineLoadingProps> = memo(({
  text,
  size = 'sm',
  className,
}) => (
  <span className={cn('inline-flex items-center gap-1.5', className)}>
    <Spinner size={size} />
    {text && <span className="text-[var(--color-text-secondary)]">{text}</span>}
  </span>
));

InlineLoading.displayName = 'InlineLoading';

// =============================================================================
// Loading Overlay Component
// =============================================================================

export interface LoadingOverlayProps {
  /** Whether the overlay is visible */
  isLoading: boolean;
  /** Loading message */
  message?: string;
  /** Additional CSS classes */
  className?: string;
  /** Children to render under the overlay */
  children: React.ReactNode;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = memo(({
  isLoading,
  message,
  className,
  children,
}) => (
  <div className={cn('relative', className)}>
    {children}
    {isLoading && (
      <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-surface-base)]/70 backdrop-blur-[2px] z-10">
        <LoadingState message={message} size="md" />
      </div>
    )}
  </div>
));

LoadingOverlay.displayName = 'LoadingOverlay';

export default LoadingState;
