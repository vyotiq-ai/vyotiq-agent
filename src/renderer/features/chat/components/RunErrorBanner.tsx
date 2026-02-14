/**
 * Run Error Banner
 * 
 * Displays structured error information when an agent run fails.
 * Shows error code, user-friendly message, recovery hints, and
 * actionable buttons based on the error type.
 * Uses the terminal/CLI aesthetic consistent with the rest of the app.
 */
import React, { memo, useCallback, useState } from 'react';
import { cn } from '../../../utils/cn';
import { useActiveSessionRunError } from '../../../hooks/useAgentSelectors';
import { useAgentActions, useAgentSelector } from '../../../state/AgentProvider';
import { useUIActions } from '../../../state/UIProvider';
import { Button } from '../../../components/ui/Button';

// =============================================================================
// Types
// =============================================================================

interface RunErrorBannerProps {
  /** Session ID to show error for */
  sessionId?: string;
  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// Error Code Config
// =============================================================================

interface ErrorCodeConfig {
  icon: string;
  label: string;
  actionLabel?: string;
  actionType?: 'retry' | 'settings' | 'new-session' | 'external-link';
  externalUrl?: string;
}

const errorCodeConfig: Record<string, ErrorCodeConfig> = {
  RATE_LIMIT: {
    icon: '◈',
    label: 'RATE_LIMIT',
    actionLabel: 'Retry',
    actionType: 'retry',
  },
  AUTH_FAILURE: {
    icon: '◉',
    label: 'AUTH_ERR',
    actionLabel: 'Open Settings',
    actionType: 'settings',
  },
  QUOTA_EXCEEDED: {
    icon: '◉',
    label: 'QUOTA_ERR',
    actionLabel: 'Open Settings',
    actionType: 'settings',
  },
  CONTEXT_OVERFLOW: {
    icon: '◎',
    label: 'CTX_OVERFLOW',
    actionLabel: 'New Session',
    actionType: 'new-session',
  },
  LOOP_DETECTED: {
    icon: '↻',
    label: 'LOOP_DETECT',
    actionLabel: 'Retry',
    actionType: 'retry',
  },
  TOOL_NOT_SUPPORTED: {
    icon: '◈',
    label: 'TOOL_ERR',
    actionLabel: 'Open Settings',
    actionType: 'settings',
  },
  DATA_POLICY: {
    icon: '◉',
    label: 'POLICY_ERR',
    actionLabel: 'OpenRouter Settings',
    actionType: 'external-link',
    externalUrl: 'https://openrouter.ai/settings/privacy',
  },
  NETWORK_ERROR: {
    icon: '◇',
    label: 'NET_ERR',
    actionLabel: 'Retry',
    actionType: 'retry',
  },
  PROVIDER_ERROR: {
    icon: '◆',
    label: 'PROVIDER_ERR',
    actionLabel: 'Retry',
    actionType: 'retry',
  },
  MODEL_NOT_FOUND: {
    icon: '◈',
    label: 'MODEL_ERR',
    actionLabel: 'Open Settings',
    actionType: 'settings',
  },
  TIMEOUT: {
    icon: '◐',
    label: 'TIMEOUT',
    actionLabel: 'Retry',
    actionType: 'retry',
  },
  CANCELLED: {
    icon: '◎',
    label: 'CANCELLED',
  },
  COMPLIANCE_VIOLATION: {
    icon: '◉',
    label: 'COMPLIANCE',
  },
  SESSION_ERROR: {
    icon: '◆',
    label: 'SESSION_ERR',
    actionLabel: 'New Session',
    actionType: 'new-session',
  },
  UNKNOWN: {
    icon: '◇',
    label: 'ERROR',
    actionLabel: 'Retry',
    actionType: 'retry',
  },
};

function getConfig(errorCode: string): ErrorCodeConfig {
  return errorCodeConfig[errorCode] || errorCodeConfig.UNKNOWN;
}

// =============================================================================
// Main Component
// =============================================================================

export const RunErrorBanner: React.FC<RunErrorBannerProps> = memo(({
  sessionId,
  className,
}) => {
  const activeRunError = useActiveSessionRunError();
  // When sessionId prop is provided, look up the error for that specific session
  // rather than relying on the active session hook alone
  const scopedRunError = useAgentSelector(
    useCallback(
      (state) => sessionId ? state.runErrors[sessionId] : undefined,
      [sessionId],
    ),
  );
  // Use scoped error if sessionId was provided, otherwise fall back to active session error
  const runError = sessionId ? scopedRunError : activeRunError;
  const actions = useAgentActions();
  const { openSettings } = useUIActions();
  const [isDismissed, setIsDismissed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Reset dismissed state when a new error arrives
  const errorTimestamp = runError?.timestamp;
  const [lastSeenTimestamp, setLastSeenTimestamp] = useState(0);
  if (errorTimestamp && errorTimestamp !== lastSeenTimestamp) {
    setIsDismissed(false);
    setLastSeenTimestamp(errorTimestamp);
  }

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
  }, []);

  const handleAction = useCallback(() => {
    if (!runError) return;
    const config = getConfig(runError.errorCode);

    switch (config.actionType) {
      case 'retry':
        handleDismiss();
        break;
      case 'settings':
        openSettings();
        break;
      case 'new-session':
        actions.startSession?.();
        break;
      case 'external-link':
        if (config.externalUrl) {
          window.open(config.externalUrl, '_blank', 'noopener');
        }
        break;
    }
  }, [runError, handleDismiss, actions, openSettings]);

  if (!runError || isDismissed) return null;

  const config = getConfig(runError.errorCode);

  return (
    <div
      className={cn(
        'flex flex-col gap-1.5',
        'mx-2 mb-2 px-3 py-2',
        'font-mono text-[10px]',
        'border rounded-sm',
        'border-[var(--color-error)]/30 bg-[var(--color-error)]/5',
        'animate-in slide-in-from-top-1 fade-in duration-200',
        className,
      )}
      role="alert"
      aria-live="assertive"
    >
      {/* Header row */}
      <div className="flex items-center gap-2">
        <span className="text-[var(--color-error)] flex-shrink-0">
          {config.icon}
        </span>
        <span className="text-[var(--color-error)] font-medium flex-shrink-0">
          [{config.label}]
        </span>
        <span className="text-[var(--color-text-secondary)] flex-1 min-w-0 truncate">
          {runError.message}
        </span>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-0.5 text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors"
          aria-label="Dismiss error"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Recovery hint */}
      {runError.recoveryHint && (
        <div className="flex items-start gap-2 ml-5">
          <span className="text-[var(--color-text-muted)] flex-shrink-0">hint:</span>
          <span className="text-[var(--color-text-secondary)]">
            {runError.recoveryHint}
          </span>
        </div>
      )}

      {/* Detail toggle for full error message */}
      {runError.message.length > 100 && (
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 ml-5 text-[9px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
        >
          <svg
            className={cn('w-2.5 h-2.5 transition-transform', showDetails && 'rotate-90')}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
          {showDetails ? 'hide details' : 'show details'}
        </button>
      )}

      {showDetails && (
        <pre className="ml-5 p-1.5 text-[9px] text-[var(--color-text-muted)] bg-[var(--color-surface-2)]/50 rounded-sm overflow-x-auto whitespace-pre-wrap break-words">
          {runError.message}
        </pre>
      )}

      {/* Action buttons */}
      {(config.actionLabel || runError.recoverable) && (
        <div className="flex items-center gap-2 ml-5 mt-0.5">
          {config.actionLabel && (
            <Button
              size="sm"
              variant={runError.recoverable ? 'secondary' : 'ghost'}
              onClick={handleAction}
              className="text-[9px] px-2 py-0.5 h-auto"
            >
              {config.actionLabel}
            </Button>
          )}
          {runError.recoverable && config.actionType !== 'retry' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              className="text-[9px] px-2 py-0.5 h-auto text-[var(--color-text-muted)]"
            >
              Dismiss
            </Button>
          )}
        </div>
      )}
    </div>
  );
});

RunErrorBanner.displayName = 'RunErrorBanner';

export default RunErrorBanner;
