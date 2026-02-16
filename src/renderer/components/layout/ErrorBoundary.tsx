import React, { Component, ErrorInfo, ReactNode } from 'react';
import { TriangleAlert, RefreshCw, Copy, Check, TerminalSquare, ExternalLink } from 'lucide-react';
import { Button } from '../ui/Button';
import { ErrorState } from '../ui/ErrorState';
import { createLogger } from '../../utils/logger';
import { captureComponentError } from '../../utils/telemetry';

const logger = createLogger('ErrorBoundary');
const IS_DEV = Boolean(import.meta.env?.DEV);

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Whether to show a compact error display */
  compact?: boolean;
  /** Custom help link for the error boundary */
  helpUrl?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

/**
 * Error Boundary component that catches JavaScript errors anywhere in the child
 * component tree, logs those errors, and displays a fallback UI.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    
    // Log error to renderer logger
    logger.error('ErrorBoundary caught an error', { error, componentStack: errorInfo?.componentStack });

    // Forward to main process for persistent logging
    try {
      window.vyotiq?.log?.report('error', `[ErrorBoundary] ${error.message}`, {
        stack: error.stack,
        componentStack: errorInfo?.componentStack,
      });
    } catch (err) {
      logger.debug('IPC bridge not available for error reporting', { error: err instanceof Error ? err.message : String(err) });
    }

    // Capture into structured telemetry (best-effort)
    try {
      captureComponentError(error, { componentStack: errorInfo?.componentStack }, 'ErrorBoundary');
    } catch (telemetryError) {
      logger.warn('Telemetry capture failed in ErrorBoundary', {
        error: telemetryError instanceof Error ? telemetryError.message : String(telemetryError),
      });
    }
    
    // Call optional error handler
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false });
  };

  handleCopyError = async (): Promise<void> => {
    const { error, errorInfo } = this.state;
    const errorText = `Error: ${error?.message}\n\nStack: ${error?.stack}\n\nComponent Stack: ${errorInfo?.componentStack}`;
    
    try {
      await navigator.clipboard.writeText(errorText);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch (err) {
      logger.error('Failed to copy error', { error: err });
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI - Terminal style
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center font-mono bg-[var(--color-surface-base)]">
          {/* Terminal window header */}
          <div className="w-full max-w-lg mb-4">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] border-b-0">
              <div className="w-2 h-2 rounded-full bg-[var(--color-error)]" />
              <div className="w-2 h-2 rounded-full bg-[var(--color-warning)]/30" />
              <div className="w-2 h-2 rounded-full bg-[var(--color-accent-primary)]/30" />
              <TerminalSquare size={10} className="ml-2 text-[var(--color-text-placeholder)]" />
              <span className="text-[10px] text-[var(--color-text-placeholder)]">error_handler</span>
            </div>
          </div>
          
          <ErrorState
            title="Process terminated unexpectedly"
            message={this.state.error?.message || 'An unexpected error occurred in the application'}
            details={[
              IS_DEV && this.state.error?.stack,
              this.state.errorInfo?.componentStack && `Component Stack:${this.state.errorInfo.componentStack}`,
            ].filter(Boolean).join('\n\n') || undefined}
            severity="error"
            errorCode="ERR"
            onRetry={this.handleReset}
            action={{ label: '--reload', onClick: () => window.location.reload() }}
            helpLink={this.props.helpUrl ? { label: '--help', url: this.props.helpUrl } : undefined}
            copyable
            collapsibleDetails
            variant="card"
            size="md"
            className="w-full max-w-lg font-mono text-left"
          />
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Wrapper component for feature-level error boundaries with a simpler UI
 * and recovery capability via a reset/retry mechanism.
 * Uses a key-based remount pattern to allow retrying after errors.
 */
export const FeatureErrorBoundary: React.FC<{ children: ReactNode; featureName?: string; helpUrl?: string }> = ({ 
  children, 
  featureName = 'component',
  helpUrl,
}) => {
  const [resetKey, setResetKey] = React.useState(0);
  // Use a ref for error count so it persists across ErrorBoundary remounts.
  // When the user clicks retry, resetKey increments which remounts the
  // ErrorBoundary (resetting its internal state). If errorCount were
  // regular state, it would reset too — meaning the "persistent error"
  // message (shown after 3+ errors) would never appear.
  const errorCountRef = React.useRef(0);
  const [errorCount, setErrorCount] = React.useState(0);
  
  const handleRetry = React.useCallback(() => {
    setResetKey((k) => k + 1);
  }, []);

  const handleError = React.useCallback((_error: Error) => {
    errorCountRef.current += 1;
    setErrorCount(errorCountRef.current);
  }, []);

  return (
    <ErrorBoundary
      key={resetKey}
      onError={handleError}
      helpUrl={helpUrl}
      fallback={
        <div className="flex items-center gap-2 p-3 bg-[var(--color-surface-editor)] border border-[var(--color-border-subtle)] font-mono">
          <span className="text-[var(--color-error)] text-[9px]">[ERR]</span>
          <TriangleAlert size={12} className="text-[var(--color-error)] shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-[var(--color-text-secondary)] truncate">
              {featureName} --status=failed
            </p>
            <p className="text-[9px] text-[var(--color-text-placeholder)]">
              {errorCount > 2
                ? '# persistent error detected, try reloading the app'
                : '# try refreshing or contact support'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleRetry}
              className="flex items-center gap-1 px-2 py-1 text-[9px] text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/10 rounded-sm transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50"
            >
              <RefreshCw size={10} />
              --retry
            </button>
            {errorCount > 2 && (
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-1 px-2 py-1 text-[9px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                --reload
              </button>
            )}
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
};

