/**
 * Error State Component
 * 
 * Provides consistent error state displays across the application.
 * Supports various severities, retry actions, and customizations.
 */
import React, { memo, useCallback } from 'react';
import { cn } from '../../utils/cn';
import { Button } from './Button';

// =============================================================================
// Types
// =============================================================================

export type ErrorSeverity = 'error' | 'warning' | 'info';

export interface ErrorStateProps {
  /** Error title/heading */
  title?: string;
  /** Error message/description */
  message: string;
  /** Detailed error info (technical details) */
  details?: string;
  /** Severity level affects styling */
  severity?: ErrorSeverity;
  /** Retry button callback */
  onRetry?: () => void;
  /** Dismiss button callback */
  onDismiss?: () => void;
  /** Custom action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Help/documentation link */
  helpLink?: {
    label: string;
    url: string;
  };
  /** Error code for display (e.g., 'AUTH_FAILURE') */
  errorCode?: string;
  /** Whether to show expand/collapse for details */
  collapsibleDetails?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Layout style */
  variant?: 'inline' | 'card' | 'banner';
  /** Additional CSS classes */
  className?: string;
  /** Custom icon */
  icon?: React.ReactNode;
  /** Whether to fill the container */
  fullScreen?: boolean;
  /** Copy error details to clipboard */
  copyable?: boolean;
}

// =============================================================================
// Icons
// =============================================================================

const ErrorIcon: React.FC<{ size?: 'sm' | 'md' | 'lg'; className?: string }> = memo(({ size = 'md', className }) => {
  const sizes = { sm: 16, md: 20, lg: 24 };
  const s = sizes[size];
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16" r="1" fill="currentColor" />
    </svg>
  );
});

ErrorIcon.displayName = 'ErrorIcon';

const WarningIcon: React.FC<{ size?: 'sm' | 'md' | 'lg'; className?: string }> = memo(({ size = 'md', className }) => {
  const sizes = { sm: 16, md: 20, lg: 24 };
  const s = sizes[size];
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 2L2 20h20L12 2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M12 10v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  );
});

WarningIcon.displayName = 'WarningIcon';

const InfoIcon: React.FC<{ size?: 'sm' | 'md' | 'lg'; className?: string }> = memo(({ size = 'md', className }) => {
  const sizes = { sm: 16, md: 20, lg: 24 };
  const s = sizes[size];
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <path d="M12 16v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="8" r="1" fill="currentColor" />
    </svg>
  );
});

InfoIcon.displayName = 'InfoIcon';

// =============================================================================
// Severity Config
// =============================================================================

const severityConfig = {
  error: {
    icon: ErrorIcon,
    bgClass: 'bg-[var(--color-error)]/10',
    borderClass: 'border-[var(--color-error)]/30',
    iconClass: 'text-[var(--color-error)]',
    titleClass: 'text-[var(--color-error)]',
  },
  warning: {
    icon: WarningIcon,
    bgClass: 'bg-[var(--color-warning)]/10',
    borderClass: 'border-[var(--color-warning)]/30',
    iconClass: 'text-[var(--color-warning)]',
    titleClass: 'text-[var(--color-warning)]',
  },
  info: {
    icon: InfoIcon,
    bgClass: 'bg-[var(--color-info)]/10',
    borderClass: 'border-[var(--color-info)]/30',
    iconClass: 'text-[var(--color-info)]',
    titleClass: 'text-[var(--color-info)]',
  },
};

// =============================================================================
// Error State Component
// =============================================================================

export const ErrorState: React.FC<ErrorStateProps> = memo(({
  title,
  message,
  details,
  severity = 'error',
  onRetry,
  onDismiss,
  action,
  helpLink,
  errorCode,
  collapsibleDetails = true,
  size = 'md',
  variant = 'card',
  className,
  icon,
  fullScreen = false,
  copyable = false,
}) => {
  const [showDetails, setShowDetails] = React.useState(!collapsibleDetails);
  const [copied, setCopied] = React.useState(false);
  const config = severityConfig[severity];
  const IconComponent = config.icon;

  const toggleDetails = useCallback(() => {
    setShowDetails(prev => !prev);
  }, []);

  const handleCopy = useCallback(async () => {
    const text = [
      errorCode && `[${errorCode}]`,
      title,
      message,
      details && `\nDetails:\n${details}`,
    ].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  }, [title, message, details, errorCode]);

  const textSizes = {
    sm: { title: 'text-[11px]', message: 'text-[10px]', details: 'text-[9px]' },
    md: { title: 'text-[13px]', message: 'text-[11px]', details: 'text-[10px]' },
    lg: { title: 'text-[15px]', message: 'text-[13px]', details: 'text-[11px]' },
  };

  const containerClasses = cn(
    'flex flex-col gap-2',
    variant === 'card' && cn('p-4 rounded-lg border', config.bgClass, config.borderClass),
    variant === 'banner' && cn('p-3 border-l-4', config.bgClass, config.borderClass.replace('border-', 'border-l-')),
    variant === 'inline' && 'p-2',
    fullScreen && 'fixed inset-0 items-center justify-center bg-[var(--color-surface-base)]/90 z-50',
    className
  );

  return (
    <div className={containerClasses} role="alert" aria-live="polite">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn('flex-shrink-0', config.iconClass)}>
          {icon || <IconComponent size={size} />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {errorCode && (
              <span className={cn(
                'text-[8px] uppercase tracking-wider font-medium px-1 py-0.5 rounded-sm',
                'bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]',
                config.titleClass,
              )}>
                {errorCode}
              </span>
            )}
            {title && (
              <h4 className={cn('font-medium', config.titleClass, textSizes[size].title)}>
                {title}
              </h4>
            )}
          </div>
          <p className={cn('text-[var(--color-text-secondary)]', textSizes[size].message, (title || errorCode) && 'mt-0.5')}>
            {message}
          </p>

          {/* Collapsible Details */}
          {details && (
            <div className="mt-2">
              {collapsibleDetails && (
                <button
                  onClick={toggleDetails}
                  className={cn(
                    'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
                    'transition-colors flex items-center gap-1',
                    textSizes[size].details
                  )}
                >
                  <svg
                    className={cn('w-3 h-3 transition-transform', showDetails && 'rotate-90')}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                  {showDetails ? 'Hide details' : 'Show details'}
                </button>
              )}
              {showDetails && (
                <pre className={cn(
                  'mt-2 p-2 rounded bg-[var(--color-surface-1)] text-[var(--color-text-muted)]',
                  'overflow-x-auto whitespace-pre-wrap break-words font-mono',
                  textSizes[size].details
                )}>
                  {details}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Dismiss button */}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="flex-shrink-0 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
            aria-label="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Actions */}
      {(onRetry || action || helpLink || copyable) && (
        <div className="flex items-center gap-2 mt-2 ml-7">
          {onRetry && (
            <Button size="sm" variant="ghost" onClick={onRetry}>
              Retry
            </Button>
          )}
          {action && (
            <Button size="sm" variant="secondary" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {helpLink && (
            <a
              href={helpLink.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1',
                'text-[10px] text-[var(--color-accent-primary)]',
                'hover:underline transition-colors font-mono',
              )}
            >
              {helpLink.label}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          )}
          {copyable && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCopy}
              className="text-[var(--color-text-muted)]"
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
});

ErrorState.displayName = 'ErrorState';

// =============================================================================
// Error Banner (simpler variant for inline use)
// =============================================================================

export interface ErrorBannerProps {
  message: string;
  severity?: ErrorSeverity;
  onDismiss?: () => void;
  className?: string;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = memo(({
  message,
  severity = 'error',
  onDismiss,
  className,
}) => (
  <ErrorState
    message={message}
    severity={severity}
    onDismiss={onDismiss}
    variant="banner"
    size="sm"
    className={className}
  />
));

ErrorBanner.displayName = 'ErrorBanner';

// =============================================================================
// Empty State (for when no data is available)
// =============================================================================

export interface EmptyStateProps {
  /** Title text */
  title?: string;
  /** Description text */
  message: string;
  /** Custom icon */
  icon?: React.ReactNode;
  /** Primary action */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Additional CSS classes */
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = memo(({
  title,
  message,
  icon,
  action,
  className,
}) => (
  <div className={cn('flex flex-col items-center justify-center py-8 px-4 text-center', className)}>
    {icon && (
      <div className="text-[var(--color-text-muted)] mb-3">
        {icon}
      </div>
    )}
    {title && (
      <h4 className="text-[13px] font-medium text-[var(--color-text-secondary)] mb-1">
        {title}
      </h4>
    )}
    <p className="text-[11px] text-[var(--color-text-muted)] max-w-[300px]">
      {message}
    </p>
    {action && (
      <Button size="sm" variant="secondary" onClick={action.onClick} className="mt-4">
        {action.label}
      </Button>
    )}
  </div>
));

EmptyState.displayName = 'EmptyState';

export default ErrorState;
