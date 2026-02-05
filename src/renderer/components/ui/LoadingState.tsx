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

/** Spinner variant types */
export type SpinnerVariant = 'default' | 'dots' | 'pulse' | 'orbital';

interface ExtendedSpinnerProps extends SpinnerProps {
  variant?: SpinnerVariant;
  /** Color variant for the spinner */
  colorVariant?: 'primary' | 'secondary' | 'success' | 'warning' | 'error';
}

const colorClasses = {
  primary: 'text-[var(--color-accent-primary)]',
  secondary: 'text-[var(--color-text-secondary)]',
  success: 'text-[var(--color-success)]',
  warning: 'text-[var(--color-warning)]',
  error: 'text-[var(--color-error)]',
};

/** Default circular spinner */
const DefaultSpinner: React.FC<SpinnerProps> = memo(({ size = 'md', className }) => (
  <svg
    className={cn('animate-spin', sizeClasses[size], className)}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle
      className="opacity-20"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="3"
    />
    <path
      className="opacity-90"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
));
DefaultSpinner.displayName = 'DefaultSpinner';

/** Animated dots spinner */
const DotsSpinner: React.FC<SpinnerProps> = memo(({ size = 'md', className }) => {
  const dotSizes = { sm: 'w-1 h-1', md: 'w-1.5 h-1.5', lg: 'w-2 h-2' };
  const gapSizes = { sm: 'gap-1', md: 'gap-1.5', lg: 'gap-2' };
  
  return (
    <div className={cn('flex items-center', gapSizes[size], className)} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            'rounded-full bg-current',
            dotSizes[size],
            'animate-loading-dot'
          )}
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
});
DotsSpinner.displayName = 'DotsSpinner';

/** Pulse ring spinner - simplified, no ping animation */
const PulseSpinner: React.FC<SpinnerProps> = memo(({ size = 'md', className }) => (
  <div className={cn('relative', sizeClasses[size], className)} aria-hidden="true">
    <span className="absolute inset-0 rounded-full border-2 border-current opacity-30" />
    <span className="absolute inset-[25%] rounded-full bg-current opacity-60" />
  </div>
));
PulseSpinner.displayName = 'PulseSpinner';

/** Orbital spinner - two orbiting dots */
const OrbitalSpinner: React.FC<SpinnerProps> = memo(({ size = 'md', className }) => (
  <div className={cn('relative', sizeClasses[size], className)} aria-hidden="true">
    <span className="absolute inset-0 rounded-full border-2 border-current opacity-20" />
    <span 
      className="absolute w-1.5 h-1.5 rounded-full bg-current top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-orbital"
    />
    <span 
      className="absolute w-1 h-1 rounded-full bg-current opacity-60 bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 animate-orbital-reverse"
    />
  </div>
));
OrbitalSpinner.displayName = 'OrbitalSpinner';

export const Spinner: React.FC<ExtendedSpinnerProps> = memo(({ 
  size = 'md', 
  className,
  variant = 'default',
  colorVariant = 'primary'
}) => {
  const colorClass = colorClasses[colorVariant];
  const combinedClassName = cn(colorClass, className);
  
  switch (variant) {
    case 'dots':
      return <DotsSpinner size={size} className={combinedClassName} />;
    case 'pulse':
      return <PulseSpinner size={size} className={combinedClassName} />;
    case 'orbital':
      return <OrbitalSpinner size={size} className={combinedClassName} />;
    default:
      return <DefaultSpinner size={size} className={combinedClassName} />;
  }
});

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
    'transition-all duration-300 ease-out',
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
      {showSpinner && (
        <div className="transition-transform duration-300 ease-out animate-fade-in">
          {icon || <Spinner size={size} />}
        </div>
      )}
      <div className={cn(
        'text-center transition-opacity duration-200',
        layout === 'horizontal' && 'text-left'
      )}>
        {message && (
          <p className={cn(
            'text-[var(--color-text-secondary)] transition-colors duration-200',
            textSizeClasses[size].message
          )}>
            {message}
          </p>
        )}
        {subMessage && (
          <p className={cn(
            'text-[var(--color-text-muted)] mt-1 transition-colors duration-200',
            textSizeClasses[size].sub
          )}>
            {subMessage}
          </p>
        )}
      </div>
    </div>
  );
});

LoadingState.displayName = 'LoadingState';

// =============================================================================
// Agent-Specific Loading Components
// =============================================================================

export type AgentPhase = 'thinking' | 'executing' | 'generating' | 'analyzing' | 'planning' | 'summarizing';

interface AgentLoadingProps {
  /** Current agent phase */
  phase: AgentPhase;
  /** Optional detail message */
  detail?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  className?: string;
}

const phaseConfig: Record<AgentPhase, {
  label: string;
  variant: SpinnerVariant;
  colorVariant: 'primary' | 'secondary' | 'success' | 'warning' | 'error';
}> = {
  thinking: { label: 'Thinking', variant: 'pulse', colorVariant: 'primary' },
  executing: { label: 'Executing', variant: 'orbital', colorVariant: 'primary' },
  generating: { label: 'Generating', variant: 'dots', colorVariant: 'primary' },
  analyzing: { label: 'Analyzing', variant: 'default', colorVariant: 'secondary' },
  planning: { label: 'Planning', variant: 'pulse', colorVariant: 'secondary' },
  summarizing: { label: 'Summarizing', variant: 'dots', colorVariant: 'success' },
};

/** Loading indicator specifically designed for agent phases */
export const AgentLoading: React.FC<AgentLoadingProps> = memo(({
  phase,
  detail,
  size = 'md',
  className,
}) => {
  const config = phaseConfig[phase];
  
  return (
    <div className={cn(
      'flex items-center gap-2 font-mono transition-all duration-300',
      className
    )}>
      <Spinner 
        size={size} 
        variant={config.variant} 
        colorVariant={config.colorVariant}
      />
      <div className="flex flex-col">
        <span className={cn(
          'text-[var(--color-accent-primary)] font-medium',
          size === 'sm' ? 'text-[10px]' : size === 'lg' ? 'text-[14px]' : 'text-[12px]'
        )}>
          {config.label}
        </span>
        {detail && (
          <span className={cn(
            'text-[var(--color-text-muted)] truncate max-w-[200px]',
            size === 'sm' ? 'text-[9px]' : 'text-[10px]'
          )}>
            {detail}
          </span>
        )}
      </div>
    </div>
  );
});

AgentLoading.displayName = 'AgentLoading';

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
