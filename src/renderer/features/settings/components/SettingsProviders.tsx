import React, { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Eye, EyeOff } from 'lucide-react';
import type { AgentSettings, LLMProviderName } from '../../../../shared/types';
import { PROVIDERS, PROVIDER_ORDER, type ProviderInfo } from '../../../../shared/providers';
import { Toggle } from '../../../components/ui/Toggle';
import { ProviderIcon } from '../../../components/ui/ProviderIcons';
import { cn } from '../../../utils/cn';
import { SettingsClaudeSubscription } from './SettingsClaudeSubscription';
import { SettingsGLMSubscription } from './SettingsGLMSubscription';

interface SettingsProvidersProps {
  apiKeys: AgentSettings['apiKeys'];
  providerSettings: AgentSettings['providerSettings'];
  onApiKeyChange: (provider: LLMProviderName, value: string) => void;
  onProviderSettingChange: (provider: LLMProviderName, field: string, value: unknown) => void;
}

interface ProviderCardProps {
  provider: ProviderInfo;
  apiKey: string;
  isEnabled: boolean;
  priority: number;
  onApiKeyChange: (value: string) => void;
  onToggleEnabled: () => void;
  onPriorityChange: (priority: number) => void;
}

const ProviderCard: React.FC<ProviderCardProps> = ({
  provider,
  apiKey,
  isEnabled,
  priority,
  onApiKeyChange,
  onToggleEnabled,
  onPriorityChange,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const isConfigured = apiKey && apiKey.trim().length > 0;
  const maskedKey = apiKey ? '•'.repeat(Math.min(apiKey.length, 24)) : '';

  return (
    <div
      className={cn(
        "border transition-all duration-150 font-mono",
        isEnabled ? "border-[var(--color-border-subtle)] bg-[var(--color-surface-header)]" : "border-[var(--color-border-subtle)]/50 bg-[var(--color-surface-1)] opacity-60"
      )}
    >
      {/* Header */}
      <button
        className={cn(
          "w-full flex items-center gap-2 p-2.5 text-left",
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="text-[var(--color-text-dim)] text-[10px]">&gt;</span>
        <ProviderIcon provider={provider.id} size={12} className={provider.color} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--color-text-primary)]">{provider.shortName.toLowerCase()}</span>
            {isConfigured ? (
              <span className="text-[9px] text-[var(--color-accent-primary)]">[OK]</span>
            ) : (
              <span className="text-[9px] text-[var(--color-text-dim)]">[--]</span>
            )}
          </div>
          <p className="text-[9px] text-[var(--color-text-dim)] truncate">
            {isConfigured ? maskedKey : '# ' + provider.description}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[9px] text-[var(--color-text-dim)]">p={priority}</span>
          {isExpanded ? (
            <ChevronDown size={12} className="text-[var(--color-text-dim)]" />
          ) : (
            <ChevronRight size={12} className="text-[var(--color-text-dim)]" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-2.5 pb-2.5 pt-0 space-y-3 animate-in slide-in-from-top-1 duration-100">
          <div className="h-px bg-[var(--color-border-default)]" />

          {/* API Key input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-[var(--color-text-muted)]">--api-key</label>
              <a
                href={provider.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-center gap-1 text-[9px] text-[var(--color-text-dim)] hover:text-[var(--color-accent-primary)] transition-colors",
                  'rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                )}
              >
                get key <ExternalLink size={9} />
              </a>
            </div>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                className="w-full bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 pr-8 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30 placeholder:text-[var(--color-text-placeholder)]"
                placeholder={`sk-...`}
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
              />
              <button
                type="button"
                className={cn(
                  "absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors",
                  'rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                )}
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? `Hide ${provider.shortName} API key` : `Show ${provider.shortName} API key`}
              >
                {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
          </div>

          {/* Enable/Disable toggle */}
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-[10px] text-[var(--color-text-secondary)]">--enabled</p>
              <p className="text-[9px] text-[var(--color-text-dim)]"># Include in auto-routing</p>
            </div>
            <Toggle
              checked={isEnabled}
              onToggle={onToggleEnabled}
              size="md"
              showState={false}
            />
          </div>

          {/* Priority selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-[var(--color-text-muted)]">--priority</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((p) => (
                <button
                  key={p}
                  className={cn(
                    "flex-1 py-1 text-[10px] transition-all border",
                    priority === p
                      ? "bg-[var(--color-surface-2)] text-[var(--color-accent-primary)] border-[var(--color-accent-primary)]/30"
                      : "bg-transparent text-[var(--color-text-dim)] border-[var(--color-border-subtle)] hover:border-[var(--color-border-default)]",
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                  )}
                  onClick={() => onPriorityChange(p)}
                >
                  {p}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-[var(--color-text-dim)]">
              # 1=primary, 4=fallback
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export const SettingsProviders: React.FC<SettingsProvidersProps> = ({
  apiKeys,
  providerSettings,
  onApiKeyChange,
  onProviderSettingChange,
}) => {
  return (
    <div className="space-y-6">
      {/* Claude Code Subscription Section */}
      <SettingsClaudeSubscription />

      {/* GLM Coding Plan Subscription Section */}
      <SettingsGLMSubscription />

      {/* Divider */}
      <div className="h-px bg-[var(--color-border-subtle)]" />

      {/* API Key Providers Section */}
      <section className="space-y-3 font-mono">
        <header>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[var(--color-accent-primary)] text-[11px]">#</span>
            <h3 className="text-[11px] text-[var(--color-text-primary)]">providers</h3>
          </div>
          <p className="text-[10px] text-[var(--color-text-dim)]">
            # Configure LLM providers. Keys encrypted locally.
          </p>
        </header>

        <div className="space-y-1.5">
          {PROVIDER_ORDER.map((providerId) => {
            const provider = PROVIDERS[providerId];
            const settings = providerSettings[providerId];

            return (
              <ProviderCard
                key={providerId}
                provider={provider}
                apiKey={apiKeys[providerId] ?? ''}
                isEnabled={settings?.enabled ?? true}
                priority={settings?.priority ?? 1}
                onApiKeyChange={(value) => onApiKeyChange(providerId, value)}
                onToggleEnabled={() => onProviderSettingChange(providerId, 'enabled', !(settings?.enabled ?? true))}
                onPriorityChange={(priority) => onProviderSettingChange(providerId, 'priority', priority)}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
};
