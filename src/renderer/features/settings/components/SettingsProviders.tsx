import React, { useState, useCallback } from 'react';
import { ExternalLink } from 'lucide-react';
import type { AgentSettings, LLMProviderName } from '../../../../shared/types';
import { PROVIDERS, PROVIDER_ORDER, type ProviderInfo } from '../../../../shared/providers';
import { ProviderIcon } from '../../../components/ui/ProviderIcons';
import { cn } from '../../../utils/cn';
import { SettingsClaudeSubscription } from './SettingsClaudeSubscription';
import { SettingsGLMSubscription } from './SettingsGLMSubscription';
import {
  SettingsSection,
  SettingsInput,
  SettingsToggleRow,
  SettingsSelect,
} from '../primitives';

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

const PRIORITY_OPTIONS = [
  { value: '1', label: '1 - Primary' },
  { value: '2', label: '2 - Secondary' },
  { value: '3', label: '3 - Tertiary' },
  { value: '4', label: '4 - Fallback' },
];

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

  const isConfigured = apiKey && apiKey.trim().length > 0;
  const maskedKey = apiKey ? '•'.repeat(Math.min(apiKey.length, 24)) : '';

  return (
    <div
      className={cn(
        "border transition-colors duration-150 font-mono",
        isEnabled 
          ? "border-[var(--color-border-subtle)] bg-[var(--color-surface-header)]" 
          : "border-[var(--color-border-subtle)]/50 bg-[var(--color-surface-1)] opacity-60"
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
        <span className="text-[var(--color-text-dim)] text-[10px] w-4 text-center select-none">
          {isExpanded ? '[-]' : '[+]'}
        </span>
        <ProviderIcon provider={provider.id} size={12} className={provider.color} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--color-text-primary)]">
              {provider.shortName.toLowerCase()}
            </span>
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

        <span className="text-[9px] text-[var(--color-text-dim)]">p={priority}</span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-2.5 pb-2.5 pt-0 space-y-2 animate-in slide-in-from-top-1 duration-100">
          <div className="h-px bg-[var(--color-border-default)]" />

          {/* API Key input with get key link */}
          <div className="space-y-1">
            <div className="flex items-center justify-end">
              <a
                href={provider.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-center gap-1 text-[9px] text-[var(--color-text-dim)]",
                  "hover:text-[var(--color-accent-primary)] transition-colors",
                  'rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                )}
              >
                get key <ExternalLink size={9} />
              </a>
            </div>
            <SettingsInput
              label="api-key"
              value={apiKey}
              onChange={onApiKeyChange}
              type="password"
              placeholder="sk-..."
              className="py-0"
            />
          </div>

          {/* Enable/Disable toggle */}
          <SettingsToggleRow
            label="enabled"
            description="Include in auto-routing"
            checked={isEnabled}
            onToggle={onToggleEnabled}
            showState={false}
          />

          {/* Priority selector */}
          <SettingsSelect
            label="priority"
            description="1=primary, 4=fallback"
            value={String(priority)}
            onChange={(value) => onPriorityChange(Number(value))}
            options={PRIORITY_OPTIONS}
            className="py-1"
          />
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
  // Prevent disabling all providers — at least one must remain enabled
  const handleToggleEnabled = useCallback((providerId: LLMProviderName) => {
    const currentlyEnabled = providerSettings[providerId]?.enabled ?? true;
    
    // If trying to disable, check that at least one other provider will remain enabled
    if (currentlyEnabled) {
      const otherEnabledCount = PROVIDER_ORDER.filter(
        (id) => id !== providerId && (providerSettings[id]?.enabled ?? true)
      ).length;
      
      if (otherEnabledCount === 0) {
        // Don't allow disabling the last provider
        return;
      }
    }
    
    onProviderSettingChange(providerId, 'enabled', !currentlyEnabled);
  }, [providerSettings, onProviderSettingChange]);

  return (
    <div className="space-y-6">
      {/* Claude Code Subscription Section */}
      <SettingsClaudeSubscription />

      {/* GLM Coding Plan Subscription Section */}
      <SettingsGLMSubscription />

      {/* Divider */}
      <div className="h-px bg-[var(--color-border-subtle)]" />

      {/* API Key Providers Section */}
      <SettingsSection
        title="providers"
        description="Configure LLM providers. Keys encrypted locally."
      >
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
                onToggleEnabled={() => handleToggleEnabled(providerId)}
                onPriorityChange={(priority) => onProviderSettingChange(providerId, 'priority', priority)}
              />
            );
          })}
        </div>
      </SettingsSection>
    </div>
  );
};
