import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Download, LogOut, CheckCircle, AlertCircle, Crown, RefreshCw, Clock, Terminal, Zap } from 'lucide-react';
import { Spinner } from '../../../components/ui/LoadingState';
import { Button } from '../../../components/ui/Button';
import { cn } from '../../../utils/cn';

interface SubscriptionStatus {
  connected: boolean;
  tier?: 'free' | 'pro' | 'max' | 'team' | 'enterprise';
  email?: string;
  expiresAt?: number;
  isExpired?: boolean;
  expiresIn?: string;
}

interface InstallStatus {
  installed: boolean;
  hasCredentials: boolean;
  cliAvailable?: boolean;
}

const tierLabels: Record<string, { label: string; color: string }> = {
  free: { label: 'Free', color: 'text-[var(--color-text-muted)]' },
  pro: { label: 'Pro', color: 'text-[var(--color-accent-primary)]' },
  max: { label: 'Max', color: 'text-[var(--color-warning)]' },
  team: { label: 'Team', color: 'text-[var(--color-success)]' },
  enterprise: { label: 'Enterprise', color: 'text-purple-400' },
};

export const SettingsClaudeSubscription: React.FC = () => {
  const [status, setStatus] = useState<SubscriptionStatus>({ connected: false });
  const [installStatus, setInstallStatus] = useState<InstallStatus>({ installed: false, hasCredentials: false, cliAvailable: false });
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);
  const [autoImportAttempted, setAutoImportAttempted] = useState(false);

  // Refs to avoid stale closures in effects
  const autoImportAttemptedRef = useRef(autoImportAttempted);
  autoImportAttemptedRef.current = autoImportAttempted;

  const fetchStatus = useCallback(async () => {
    try {
      const result = await window.vyotiq.claude.getSubscriptionStatus();
      setStatus(result);
      return result;
    } catch (err) {
      console.error('Failed to fetch subscription status:', err);
      return { connected: false };
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsChecking(true);
      const [statusResult, installResult] = await Promise.all([
        window.vyotiq.claude.getSubscriptionStatus(),
        window.vyotiq.claude.checkInstalled(),
      ]);
      setStatus(statusResult);
      setInstallStatus(installResult);
      setIsChecking(false);
      
      // Auto-import if credentials exist but not connected
      if (!statusResult.connected && installResult.hasCredentials && !autoImportAttemptedRef.current) {
        setAutoImportAttempted(true);
        // Import credentials
        try {
          const result = await window.vyotiq.claude.startOAuth();
          if (result.success) {
            const newStatus = await window.vyotiq.claude.getSubscriptionStatus();
            setStatus(newStatus);
          }
        } catch (err) {
          console.error('Auto-import failed:', err);
        }
      }
    };
    init();
  }, []);

  // Poll for credentials when authenticating
  useEffect(() => {
    if (!isAuthenticating) return;
    
    const pollInterval = setInterval(async () => {
      const result = await window.vyotiq.claude.checkInstalled();
      setInstallStatus(result);
      if (result.hasCredentials) {
        setIsAuthenticating(false);
        setNotification({ type: 'success', message: 'Authentication complete! Importing...' });
        setTimeout(() => setNotification(null), 3000);
        // Import credentials
        try {
          const importResult = await window.vyotiq.claude.startOAuth();
          if (importResult.success) {
            const newStatus = await window.vyotiq.claude.getSubscriptionStatus();
            setStatus(newStatus);
          }
        } catch (err) {
          console.error('Import after auth failed:', err);
        }
      }
    }, 2000);
    
    // Stop polling after 5 minutes
    const timeout = setTimeout(() => {
      setIsAuthenticating(false);
      setNotification({ type: 'warning', message: 'Authentication timed out. Try again.' });
      setTimeout(() => setNotification(null), 5000);
    }, 5 * 60 * 1000);
    
    return () => {
      clearInterval(pollInterval);
      clearTimeout(timeout);
    };
  }, [isAuthenticating]);

  // Listen for real-time subscription events
  useEffect(() => {
    const unsubscribe = window.vyotiq.agent.onEvent((event) => {
      if (event.type === 'claude-subscription') {
        const claudeEvent = event as { eventType: string; message: string; tier?: string };
        
        // Show notification based on event type
        switch (claudeEvent.eventType) {
          case 'auto-imported':
          case 'credentials-changed':
          case 'token-refreshed':
            setNotification({ type: 'success', message: claudeEvent.message });
            fetchStatus();
            break;
          case 'token-expiring-soon':
            setNotification({ type: 'warning', message: claudeEvent.message });
            break;
          case 'token-refresh-failed':
            setNotification({ type: 'error', message: claudeEvent.message });
            break;
          case 'disconnected':
            setStatus({ connected: false });
            break;
        }
        
        // Auto-dismiss notification after 5 seconds
        setTimeout(() => setNotification(null), 5000);
      }
      
      // Also refresh on settings update
      if (event.type === 'settings-update') {
        fetchStatus();
      }
    });
    
    return unsubscribe;
  }, [fetchStatus]);

  const handleImport = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.vyotiq.claude.startOAuth();
      if (result.success) {
        await fetchStatus();
        setNotification({ type: 'success', message: 'Claude subscription connected' });
        setTimeout(() => setNotification(null), 5000);
      } else {
        setError(result.error || 'Import failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLaunchAuth = async () => {
    setIsAuthenticating(true);
    setError(null);
    try {
      const result = await window.vyotiq.claude.launchAuth();
      if (!result.success) {
        setIsAuthenticating(false);
        setError(result.error || 'Failed to launch authentication');
      } else {
        setNotification({ type: 'success', message: 'Authentication launched - complete in terminal' });
        setTimeout(() => setNotification(null), 5000);
      }
    } catch (err) {
      setIsAuthenticating(false);
      setError(err instanceof Error ? err.message : 'Failed to launch authentication');
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.vyotiq.claude.disconnect();
      if (result.success) {
        setStatus({ connected: false });
      } else {
        setError(result.error || 'Disconnect failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshToken = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const result = await window.vyotiq.claude.refreshToken();
      if (result.success) {
        await fetchStatus();
        setNotification({ type: 'success', message: 'Token refreshed' });
        setTimeout(() => setNotification(null), 5000);
      } else {
        setError(result.error || 'Token refresh failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Token refresh failed');
    } finally {
      setIsRefreshing(false);
    }
  };

  const tierInfo = status.tier ? tierLabels[status.tier] : null;

  return (
    <section className="space-y-3 font-mono">
      <header>
        <div className="flex items-center gap-2 mb-1">
          <Crown size={11} className="text-[var(--color-accent-primary)]" />
          <h3 className="text-[11px] text-[var(--color-text-primary)]">claude-code-subscription</h3>
          <Zap size={9} className="text-[var(--color-success)]" />
        </div>
        <p className="text-[10px] text-[var(--color-text-dim)]">
          # Auto-imports from Claude Code CLI • Background refresh enabled
        </p>
      </header>

      {/* Notification banner */}
      {notification && (
        <div className={cn(
          "text-[10px] px-2 py-1.5 border flex items-center gap-2",
          notification.type === 'success' && "text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/20",
          notification.type === 'warning' && "text-[var(--color-warning)] bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20",
          notification.type === 'error' && "text-[var(--color-error)] bg-[var(--color-error)]/10 border-[var(--color-error)]/20",
        )}>
          {notification.type === 'success' && <CheckCircle size={10} />}
          {notification.type === 'warning' && <AlertCircle size={10} />}
          {notification.type === 'error' && <AlertCircle size={10} />}
          {notification.message}
        </div>
      )}

      <div className="border border-[var(--color-border-subtle)] bg-[var(--color-surface-header)] p-3 space-y-3">
        {isChecking ? (
          <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
            <Spinner size="sm" className="w-3 h-3" />
            <span>checking status...</span>
          </div>
        ) : status.connected ? (
          <>
            {/* Connected state */}
            <div className="flex items-start gap-3">
              <CheckCircle size={14} className="text-[var(--color-success)] mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-[var(--color-text-primary)]">connected</span>
                  {tierInfo && (
                    <span className={cn("text-[9px] px-1.5 py-0.5 bg-[var(--color-surface-2)] rounded", tierInfo.color)}>
                      {tierInfo.label}
                    </span>
                  )}
                </div>
                {status.email && (
                  <p className="text-[10px] text-[var(--color-text-muted)] truncate">{status.email}</p>
                )}
                {/* Token expiry info */}
                <div className="flex items-center gap-1.5 mt-1">
                  <Clock size={9} className={status.isExpired ? "text-[var(--color-error)]" : "text-[var(--color-text-dim)]"} />
                  <span className={cn(
                    "text-[9px]",
                    status.isExpired ? "text-[var(--color-error)]" : "text-[var(--color-text-dim)]"
                  )}>
                    {status.isExpired ? 'expired' : `expires in ${status.expiresIn}`}
                  </span>
                  <span className="text-[9px] text-[var(--color-text-dim)]">• auto-refresh</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRefreshToken}
                disabled={isRefreshing}
                leftIcon={isRefreshing ? <Spinner size="sm" className="w-2.5 h-2.5" /> : <RefreshCw size={10} />}
              >
                refresh
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDisconnect}
                disabled={isLoading}
                leftIcon={isLoading ? <Spinner size="sm" className="w-2.5 h-2.5" /> : <LogOut size={10} />}
              >
                disconnect
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Disconnected state */}
            <div className="flex items-start gap-3">
              {isAuthenticating ? (
                <Spinner size="sm" className="w-3.5 h-3.5 text-[var(--color-accent-primary)] mt-0.5 flex-shrink-0" />
              ) : installStatus.cliAvailable ? (
                installStatus.hasCredentials ? (
                  <CheckCircle size={14} className="text-[var(--color-success)] mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle size={14} className="text-[var(--color-warning)] mt-0.5 flex-shrink-0" />
                )
              ) : (
                <Terminal size={14} className="text-[var(--color-text-dim)] mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1">
                <p className="text-[11px] text-[var(--color-text-secondary)]">
                  {isAuthenticating 
                    ? 'waiting for authentication...'
                    : installStatus.cliAvailable 
                      ? installStatus.hasCredentials 
                        ? 'ready to import'
                        : 'claude code needs authentication'
                      : 'claude code cli not found'
                  }
                </p>
                <p className="text-[10px] text-[var(--color-text-dim)]">
                  {isAuthenticating
                    ? '# Complete login in the terminal window'
                    : installStatus.cliAvailable
                      ? installStatus.hasCredentials
                        ? '# Click import to use your subscription'
                        : '# Click authenticate to open Claude login'
                      : '# Run: npm i -g @anthropic-ai/claude-code'
                  }
                </p>
              </div>
            </div>

            {installStatus.hasCredentials ? (
              <Button
                variant="primary"
                size="sm"
                onClick={handleImport}
                disabled={isLoading}
                leftIcon={isLoading ? <Spinner size="sm" className="w-2.5 h-2.5" /> : <Download size={10} />}
              >
                {isLoading ? 'importing...' : 'import credentials'}
              </Button>
            ) : installStatus.cliAvailable ? (
              <Button
                variant="primary"
                size="sm"
                onClick={handleLaunchAuth}
                disabled={isAuthenticating}
                leftIcon={isAuthenticating ? <Spinner size="sm" className="w-2.5 h-2.5" /> : <Terminal size={10} />}
              >
                {isAuthenticating ? 'authenticating...' : 'authenticate'}
              </Button>
            ) : null}
          </>
        )}

        {/* Error display */}
        {error && (
          <div className="text-[10px] text-[var(--color-error)] bg-[var(--color-error)]/10 px-2 py-1.5 border border-[var(--color-error)]/20 whitespace-pre-wrap">
            [ERR] {error}
          </div>
        )}
      </div>

      {/* Info section */}
      {!status.connected && !installStatus.cliAvailable && (
        <div className="text-[9px] text-[var(--color-text-dim)] space-y-1">
          <p># Install Claude Code CLI:</p>
          <code className="block pl-3 text-[var(--color-accent-primary)]">npm i -g @anthropic-ai/claude-code</code>
        </div>
      )}
    </section>
  );
};
