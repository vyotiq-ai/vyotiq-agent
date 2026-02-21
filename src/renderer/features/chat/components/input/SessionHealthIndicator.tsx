/**
 * Session Health Indicator
 * 
 * Compact health status badge for the InputStatusBar.
 * Shows session health as a dot + label when issues are detected.
 * Hidden when healthy to keep the UI clean.
 * 
 * @example
 * <SessionHealthIndicator sessionId={activeSession?.id} />
 */
import React, { memo, useState, useCallback } from 'react';
import { useSessionHealth } from '../../../../hooks';
import { cn } from '../../../../utils/cn';

// =============================================================================
// Types
// =============================================================================

interface SessionHealthIndicatorProps {
  sessionId: string | undefined;
  className?: string;
}

// =============================================================================
// Status config
// =============================================================================

const STATUS_CONFIG = {
  healthy: {
    dotClass: 'bg-[var(--color-success)]',
    textClass: 'text-[var(--color-success)]',
    label: 'healthy',
  },
  warning: {
    dotClass: 'bg-[var(--color-warning)]',
    textClass: 'text-[var(--color-warning)]',
    label: 'warning',
  },
  critical: {
    dotClass: 'bg-[var(--color-error)]',
    textClass: 'text-[var(--color-error)]',
    label: 'critical',
  },
  unknown: {
    dotClass: 'bg-[var(--color-text-secondary)]',
    textClass: 'text-[var(--color-text-secondary)]',
    label: 'unknown',
  },
} as const;

// =============================================================================
// Component
// =============================================================================

export const SessionHealthIndicator: React.FC<SessionHealthIndicatorProps> = memo(({
  sessionId,
  className,
}) => {
  const { health, hasIssues, issueCount, overallStatus } = useSessionHealth(sessionId);
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  // Only show when there's an active session with real health issues
  // Hide when healthy or unknown (unknown = no active monitoring / no run in progress)
  if (!sessionId || !health || overallStatus === 'healthy' || overallStatus === 'unknown') return null;

  const config = STATUS_CONFIG[overallStatus];

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={toggleExpanded}
        className={cn(
          'flex items-center gap-1 text-[9px] font-mono',
          'transition-colors duration-150',
          'hover:opacity-80',
          config.textClass,
        )}
        title={hasIssues ? `${issueCount} issue${issueCount > 1 ? 's' : ''} detected` : `Session ${config.label}`}
        aria-label={`Session health: ${config.label}${hasIssues ? `, ${issueCount} issues` : ''}`}
      >
        {/* Pulsing dot for warning/critical */}
        <span
          className={cn(
            'inline-block w-1.5 h-1.5 rounded-full flex-shrink-0',
            config.dotClass,
            overallStatus === 'critical' && 'animate-pulse',
          )}
        />
        <span className="tabular-nums">
          {issueCount > 0 ? `${issueCount} issue${issueCount > 1 ? 's' : ''}` : config.label}
        </span>
      </button>

      {/* Expanded tooltip with issue details */}
      {expanded && hasIssues && (
        <div
          className={cn(
            'absolute bottom-full right-0 mb-1.5',
            'w-56 p-2',
            'bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]',
            'rounded-[var(--radius-sm)] shadow-lg',
            'text-[9px] font-mono',
            'z-50',
          )}
        >
          <div className="text-[var(--color-text-primary)] font-semibold mb-1.5 uppercase tracking-wider">
            Session Issues
          </div>
          <div className="space-y-1">
            {health.issues.map((issue, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span
                  className={cn(
                    'inline-block w-1 h-1 rounded-full mt-[3px] flex-shrink-0',
                    issue.severity === 'error' ? 'bg-[var(--color-error)]' :
                    issue.severity === 'warning' ? 'bg-[var(--color-warning)]' :
                    'bg-[var(--color-info)]',
                  )}
                />
                <span className="text-[var(--color-text-secondary)] leading-tight">
                  {issue.message}
                </span>
              </div>
            ))}
          </div>
          {health.recommendations.length > 0 && (
            <div className="mt-2 pt-1.5 border-t border-[var(--color-border-subtle)]/30">
              <div className="text-[var(--color-text-secondary)] opacity-70 mb-1">Recommendations</div>
              {health.recommendations.slice(0, 3).map((rec, i) => (
                <div key={i} className="text-[var(--color-text-secondary)] opacity-60 leading-tight">
                  {rec}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

SessionHealthIndicator.displayName = 'SessionHealthIndicator';
