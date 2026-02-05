import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, AlertCircle, Crown, Zap, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { Spinner } from '../../../components/ui/LoadingState';
import { Button } from '../../../components/ui/Button';
import { Toggle } from '../../../components/ui/Toggle';
import { cn } from '../../../utils/cn';

interface SubscriptionStatus {
  connected: boolean;
  tier?: 'lite' | 'pro';
  useCodingEndpoint: boolean;
}

const tierLabels: Record<string, { label: string; color: string; price: string }> = {
  lite: { label: 'Lite', color: 'text-[var(--color-text-muted)]', price: '$3/mo' },
  pro: { label: 'Pro', color: 'text-[var(--color-accent-primary)]', price: '$15/mo' },
};

export const SettingsGLMSubscription: React.FC = () => {
  const [status, setStatus] = useState<SubscriptionStatus>({ connected: false, useCodingEndpoint: true });
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [selectedTier, setSelectedTier] = useState<'lite' | 'pro'>('lite');
  const [useCodingEndpoint, setUseCodingEndpoint] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const result = await window.vyotiq.glm.getSubscriptionStatus();
      // Cast to local type (preload types are synced)
      const status: SubscriptionStatus = {
        connected: result.connected,
        tier: result.tier as 'lite' | 'pro' | undefined,
        useCodingEndpoint: result.useCodingEndpoint,
      };
      setStatus(status);
      setUseCodingEndpoint(status.useCodingEndpoint);
      return status;
    } catch (err) {
      console.error('Failed to fetch GLM subscription status:', err);
      return { connected: false, useCodingEndpoint: true };
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsChecking(true);
      await fetchStatus();
      setIsChecking(false);
    };
    init();
  }, [fetchStatus]);

  // Listen for real-time subscription events
  useEffect(() => {
    const unsubscribe = window.vyotiq.agent.onEvent((event) => {
      if (event.type === 'glm-subscription') {
        const glmEvent = event as { eventType: string; message: string; tier?: string };
        
        switch (glmEvent.eventType) {
          case 'connected':
          case 'tier-changed':
            setNotification({ type: 'success', message: glmEvent.message });
            fetchStatus();
            break;
          case 'disconnected':
            setStatus({ connected: false, useCodingEndpoint: true });
            break;
        }
        
        setTimeout(() => setNotification(null), 5000);
      }
      
      if (event.type === 'settings-update') {
        fetchStatus();
      }
    });
    
    return unsubscribe;
  }, [fetchStatus]);

  const handleConnect = async () => {
    if (!apiKey.trim()) {
      setError('API key is required');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.vyotiq.glm.connect({
        apiKey: apiKey.trim(),
        tier: selectedTier,
        useCodingEndpoint,
      });
      if (result.success) {
        await fetchStatus();
        setApiKey('');
        setNotification({ type: 'success', message: 'GLM Coding Plan connected' });
        setTimeout(() => setNotification(null), 5000);
      } else {
        setError(result.error || 'Connection failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.vyotiq.glm.disconnect();
      if (result.success) {
        setStatus({ connected: false, useCodingEndpoint: true });
      } else {
        setError(result.error || 'Disconnect failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleCodingEndpoint = async () => {
    if (!status.connected) return;
    
    const newValue = !useCodingEndpoint;
    setUseCodingEndpoint(newValue);
    
    try {
      await window.vyotiq.glm.updateSettings({ useCodingEndpoint: newValue });
      setNotification({ type: 'success', message: `Switched to ${newValue ? 'Coding' : 'General'} endpoint` });
      setTimeout(() => setNotification(null), 3000);
    } catch (err) {
      setUseCodingEndpoint(!newValue);
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    }
  };

  const tierInfo = status.tier ? tierLabels[status.tier] : null;

  return (
    <section className="space-y-3 font-mono">
      <header>
        <div className="flex items-center gap-2 mb-1">
          <Crown size={11} className="text-cyan-400" />
          <h3 className="text-[11px] text-[var(--color-text-primary)]">glm-coding-plan</h3>
          <Zap size={9} className="text-[var(--color-success)]" />
        </div>
        <p className="text-[10px] text-[var(--color-text-dim)]">
          # Z.AI GLM Coding Plan • Lite $3/mo • Pro $15/mo
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
                      {tierInfo.label} ({tierInfo.price})
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  {useCodingEndpoint ? 'Using Coding API endpoint' : 'Using General API endpoint'}
                </p>
              </div>
            </div>

            {/* Coding endpoint toggle */}
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-[10px] text-[var(--color-text-secondary)]">--coding-endpoint</p>
                <p className="text-[9px] text-[var(--color-text-dim)]"># Use dedicated coding API</p>
              </div>
              <Toggle
                checked={useCodingEndpoint}
                onToggle={handleToggleCodingEndpoint}
                size="md"
                showState={false}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDisconnect}
                disabled={isLoading}
                leftIcon={isLoading ? <Spinner size="sm" className="w-2.5 h-2.5" /> : undefined}
              >
                disconnect
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Disconnected state - Setup form */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle size={14} className="text-[var(--color-text-dim)] mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-[11px] text-[var(--color-text-secondary)]">not connected</p>
                  <p className="text-[10px] text-[var(--color-text-dim)]">
                    # Enter your Z.AI API key to connect
                  </p>
                </div>
              </div>

              {/* API Key input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-[var(--color-text-muted)]">--api-key</label>
                  <div className="flex items-center gap-2">
                    <a
                      href="https://z.ai/subscribe"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "flex items-center gap-1 text-[9px] text-cyan-400 hover:text-cyan-300 transition-colors",
                        'rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                      )}
                    >
                      subscribe <ExternalLink size={9} />
                    </a>
                    <span className="text-[var(--color-text-dim)]">|</span>
                    <a
                      href="https://z.ai/model-api"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "flex items-center gap-1 text-[9px] text-[var(--color-text-dim)] hover:text-cyan-400 transition-colors",
                        'rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                      )}
                    >
                      get key <ExternalLink size={9} />
                    </a>
                  </div>
                </div>
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    className="w-full bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 pr-8 text-[10px] outline-none transition-all focus-visible:border-cyan-400/30 placeholder:text-[var(--color-text-placeholder)]"
                    placeholder="your-z-ai-api-key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  <button
                    type="button"
                    className={cn(
                      "absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors",
                      'rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                    )}
                    onClick={() => setShowKey(!showKey)}
                    aria-label={showKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
              </div>

              {/* Tier selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-[var(--color-text-muted)]">--tier</label>
                <div className="flex gap-1">
                  {(['lite', 'pro'] as const).map((tier) => (
                    <button
                      key={tier}
                      className={cn(
                        "flex-1 py-1.5 text-[10px] transition-all border",
                        selectedTier === tier
                          ? "bg-[var(--color-surface-2)] text-cyan-400 border-cyan-400/30"
                          : "bg-transparent text-[var(--color-text-dim)] border-[var(--color-border-subtle)] hover:border-[var(--color-border-default)]",
                        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/40'
                      )}
                      onClick={() => setSelectedTier(tier)}
                    >
                      {tierLabels[tier].label}
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-[var(--color-text-dim)]">
                  # {tierLabels[selectedTier].price} - Select your subscription tier
                </p>
              </div>

              {/* Coding endpoint toggle */}
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">--coding-endpoint</p>
                  <p className="text-[9px] text-[var(--color-text-dim)]"># Use dedicated coding API</p>
                </div>
                <Toggle
                  checked={useCodingEndpoint}
                  onToggle={() => setUseCodingEndpoint(!useCodingEndpoint)}
                  size="md"
                  showState={false}
                />
              </div>

              <Button
                variant="primary"
                size="sm"
                onClick={handleConnect}
                disabled={isLoading || !apiKey.trim()}
                leftIcon={isLoading ? <Spinner size="sm" className="w-2.5 h-2.5" /> : undefined}
                className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border-cyan-500/30"
              >
                {isLoading ? 'connecting...' : 'connect'}
              </Button>
            </div>
          </>
        )}

        {/* Error display */}
        {error && (
          <div className="text-[10px] text-[var(--color-error)] bg-[var(--color-error)]/10 px-2 py-1.5 border border-[var(--color-error)]/20 whitespace-pre-wrap">
            [ERR] {error}
          </div>
        )}
      </div>
    </section>
  );
};
