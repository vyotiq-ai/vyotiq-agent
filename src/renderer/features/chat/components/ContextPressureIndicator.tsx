/**
 * Context Pressure Indicator
 * 
 * Visual indicator showing how close the context window is to capacity.
 * Displayed inline in the chat area when utilization exceeds warning threshold.
 * Uses the terminal/CLI aesthetic consistent with the rest of the app.
 */
import React, { memo, useMemo } from 'react';
import { cn } from '../../../utils/cn';
import { useContextUsagePercentage, useActiveSessionContextMetrics } from '../../../hooks/useAgentSelectors';

// =============================================================================
// Types
// =============================================================================

interface ContextPressureIndicatorProps {
  /** Override the context usage percentage (0-100) */
  usageOverride?: number;
  /** Compact mode - single line display */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// Thresholds
// =============================================================================

const WARNING_THRESHOLD = 70;
const DANGER_THRESHOLD = 90;

// =============================================================================
// Helpers
// =============================================================================

function getContextLevel(usage: number): 'normal' | 'warning' | 'danger' {
  if (usage >= DANGER_THRESHOLD) return 'danger';
  if (usage >= WARNING_THRESHOLD) return 'warning';
  return 'normal';
}

function getContextLabel(level: 'normal' | 'warning' | 'danger'): string {
  switch (level) {
    case 'danger': return 'CTX CRITICAL';
    case 'warning': return 'CTX WARNING';
    default: return 'CTX';
  }
}

// =============================================================================
// Sub-Components
// =============================================================================

const ProgressBar = memo<{ usage: number; level: 'normal' | 'warning' | 'danger' }>(
  ({ usage, level }) => {
    const barColor = {
      normal: 'bg-[var(--color-accent-primary)]',
      warning: 'bg-[var(--color-warning)]',
      danger: 'bg-[var(--color-error)]',
    }[level];

    return (
      <div className="flex-1 h-1 bg-[var(--color-surface-2)] rounded-full overflow-hidden min-w-[40px] max-w-[120px]">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            barColor,
            level === 'danger' && 'animate-pulse',
          )}
          style={{ width: `${Math.min(usage, 100)}%` }}
          role="progressbar"
          aria-valuenow={usage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Context window ${usage}% full`}
        />
      </div>
    );
  }
);
ProgressBar.displayName = 'ProgressBar';

// =============================================================================
// Main Component
// =============================================================================

export const ContextPressureIndicator: React.FC<ContextPressureIndicatorProps> = memo(({
  usageOverride,
  compact = false,
  className,
}) => {
  const contextUsage = useContextUsagePercentage();
  const metricsData = useActiveSessionContextMetrics();
  
  const usage = usageOverride ?? contextUsage;
  const level = useMemo(() => getContextLevel(usage), [usage]);

  // Only display when context is in warning or danger territory
  if (level === 'normal') return null;

  const metrics = metricsData?.metrics;
  const tokenInfo = metrics
    ? `${Math.round(metrics.totalTokens / 1000)}k / ${Math.round(metrics.maxInputTokens / 1000)}k tokens`
    : undefined;

  const labelColor = {
    normal: 'text-[var(--color-text-muted)]',
    warning: 'text-[var(--color-warning)]',
    danger: 'text-[var(--color-error)]',
  }[level];

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-1.5 font-mono',
          className,
        )}
        title={`Context window is ${usage}% full${tokenInfo ? ` (${tokenInfo})` : ''}`}
      >
        <span className={cn('text-[9px] font-medium', labelColor)}>
          [{getContextLabel(level)}]
        </span>
        <ProgressBar usage={usage} level={level} />
        <span className={cn('text-[9px] tabular-nums', labelColor)}>
          {usage}%
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2 py-1',
        'font-mono text-[9px]',
        'border rounded-sm',
        level === 'warning' && 'border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5',
        level === 'danger' && 'border-[var(--color-error)]/30 bg-[var(--color-error)]/5',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <span className={cn('font-medium', labelColor)}>
        [{getContextLabel(level)}]
      </span>
      <ProgressBar usage={usage} level={level} />
      <span className={cn('tabular-nums', labelColor)}>
        {usage}%
      </span>
      {tokenInfo && (
        <span className="text-[var(--color-text-muted)] hidden sm:inline">
          {tokenInfo}
        </span>
      )}
      {level === 'danger' && (
        <span className="text-[var(--color-error)]/80 ml-1">
          start a new session to continue
        </span>
      )}
    </div>
  );
});

ContextPressureIndicator.displayName = 'ContextPressureIndicator';

export default ContextPressureIndicator;
