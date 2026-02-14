/**
 * Connection Status Banner
 * 
 * Prominently displays network connectivity issues at the top of the chat area.
 * Shows a dismissible warning when the user goes offline and auto-hides when
 * connectivity is restored.
 * Uses the terminal/CLI aesthetic consistent with the rest of the app.
 */
import React, { memo, useEffect, useState, useCallback } from 'react';
import { WifiOff } from 'lucide-react';
import { cn } from '../../../utils/cn';

// =============================================================================
// Types
// =============================================================================

interface ConnectionStatusBannerProps {
  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// Main Component
// =============================================================================

export const ConnectionStatusBanner: React.FC<ConnectionStatusBannerProps> = memo(({
  className,
}) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isDismissed, setIsDismissed] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  // Track browser online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setIsDismissed(false);
      setReconnecting(false);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setIsDismissed(false);
      setReconnecting(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-reconnect check when coming online
  useEffect(() => {
    if (isOnline && reconnecting) {
      const timer = setTimeout(() => setReconnecting(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, reconnecting]);

  const handleRetry = useCallback(() => {
    setReconnecting(true);
    // Force a connectivity check
    fetch('/api/health', { method: 'HEAD', mode: 'no-cors' })
      .then(() => {
        setIsOnline(true);
        setReconnecting(false);
      })
      .catch(() => {
        setReconnecting(false);
      });
  }, []);

  // Don't render when online or dismissed
  if (isOnline || isDismissed) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5',
        'font-mono text-[10px]',
        'bg-[var(--color-warning)]/8 border-b border-[var(--color-warning)]/30',
        'animate-in slide-in-from-top-1 fade-in duration-200',
        className,
      )}
      role="alert"
      aria-live="polite"
    >
      <WifiOff size={12} className="text-[var(--color-warning)] flex-shrink-0" />
      <span className="text-[var(--color-warning)] font-medium">[OFFLINE]</span>
      <span className="text-[var(--color-text-secondary)] flex-1">
        No internet connection. Agent requests will fail until connectivity is restored.
      </span>
      {reconnecting ? (
        <span className="text-[var(--color-text-muted)] animate-pulse">reconnecting...</span>
      ) : (
        <button
          onClick={handleRetry}
          className="text-[var(--color-accent-primary)] hover:underline transition-colors flex-shrink-0"
        >
          retry
        </button>
      )}
      <button
        onClick={() => setIsDismissed(true)}
        className="flex-shrink-0 p-0.5 text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors"
        aria-label="Dismiss"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
});

ConnectionStatusBanner.displayName = 'ConnectionStatusBanner';

export default ConnectionStatusBanner;
