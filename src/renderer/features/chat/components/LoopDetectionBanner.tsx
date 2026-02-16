/**
 * LoopDetectionBanner Component
 * 
 * Displays a warning banner when the agent's circuit breaker triggers
 * due to loop detection. Shows severity level, loop count, and patterns.
 * 
 * Follows the existing terminal aesthetic with monospace fonts
 * and CSS variable-based theming.
 */
import React, { memo } from 'react';
import { AlertTriangle, ShieldAlert, RefreshCw } from 'lucide-react';
import { cn } from '../../../utils/cn';

// =============================================================================
// Types
// =============================================================================

interface LoopDetectionBannerProps {
  /** Whether the circuit breaker has been triggered */
  isCircuitBreakerTriggered: boolean;
  /** Whether any loop is detected */
  isLooping: boolean;
  /** Severity of the loop */
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  /** Number of loops detected */
  loopCount: number;
  /** Detected repeat patterns */
  repeatPatterns: string[];
  /** Additional CSS class */
  className?: string;
}

// =============================================================================
// Helpers
// =============================================================================

const severityConfig: Record<string, { label: string; color: string; borderColor: string }> = {
  low: {
    label: 'low',
    color: 'var(--color-text-muted)',
    borderColor: 'var(--color-border-subtle)',
  },
  medium: {
    label: 'medium',
    color: 'var(--color-warning)',
    borderColor: 'var(--color-warning)',
  },
  high: {
    label: 'high',
    color: 'var(--color-warning)',
    borderColor: 'var(--color-warning)',
  },
  critical: {
    label: 'critical',
    color: 'var(--color-error)',
    borderColor: 'var(--color-error)',
  },
};

// =============================================================================
// Component
// =============================================================================

const LoopDetectionBannerInternal: React.FC<LoopDetectionBannerProps> = ({
  isCircuitBreakerTriggered,
  isLooping,
  severity,
  loopCount,
  repeatPatterns,
  className,
}) => {
  // Don't render if no issue
  if (!isLooping && !isCircuitBreakerTriggered) return null;

  const config = severityConfig[severity] ?? severityConfig.low;
  const Icon = isCircuitBreakerTriggered ? ShieldAlert : AlertTriangle;

  return (
    <div
      className={cn(
        'px-3 py-1.5 font-mono',
        'border rounded',
        'flex items-start gap-2',
        className,
      )}
      style={{
        borderColor: config.borderColor,
        backgroundColor: isCircuitBreakerTriggered
          ? 'color-mix(in srgb, var(--color-error) 5%, transparent)'
          : 'color-mix(in srgb, var(--color-warning) 5%, transparent)',
      }}
      role="alert"
    >
      <Icon
        size={12}
        className="shrink-0 mt-0.5"
        style={{ color: config.color }}
      />

      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-medium"
            style={{ color: config.color }}
          >
            {isCircuitBreakerTriggered ? 'Circuit breaker triggered' : 'Loop detected'}
          </span>
          <span
            className="text-[8px] uppercase tracking-wider px-1 py-0.5 rounded"
            style={{
              color: config.color,
              backgroundColor: 'color-mix(in srgb, currentColor 10%, transparent)',
            }}
          >
            {config.label}
          </span>
          {loopCount > 0 && (
            <span className="text-[8px] tabular-nums text-[var(--color-text-dim)] ml-auto flex items-center gap-0.5">
              <RefreshCw size={8} />
              {loopCount}x
            </span>
          )}
        </div>

        {/* Description */}
        <p className="text-[9px] text-[var(--color-text-muted)] mt-0.5">
          {isCircuitBreakerTriggered
            ? 'The agent has been stopped to prevent infinite loops. Review the repeated patterns below.'
            : 'A repeating pattern has been detected. The agent may be stuck.'}
        </p>

        {/* Repeat patterns */}
        {repeatPatterns.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {repeatPatterns.slice(0, 5).map((pattern, idx) => (
              <span
                key={idx}
                className="text-[8px] px-1 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-text-dim)] truncate max-w-[200px]"
                title={pattern}
              >
                {pattern}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const LoopDetectionBanner = memo(LoopDetectionBannerInternal);
LoopDetectionBanner.displayName = 'LoopDetectionBanner';
