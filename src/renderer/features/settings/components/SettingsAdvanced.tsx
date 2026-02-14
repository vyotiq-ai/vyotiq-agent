/**
 * Settings Advanced Component
 * 
 * Expert settings for rate limits, timeouts, and custom endpoints.
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Server, TriangleAlert } from 'lucide-react';
import type { AgentSettings, LLMProviderName } from '../../../../shared/types';
import { PROVIDERS, PROVIDER_ORDER, isProviderConfigured } from '../../../../shared/providers';
import { cn } from '../../../utils/cn';
import { SettingsSection, SettingsGroup } from '../primitives';

interface SettingsAdvancedProps {
  rateLimits: AgentSettings['rateLimits'];
  providerSettings: AgentSettings['providerSettings'];
  apiKeys: AgentSettings['apiKeys'];
  onRateLimitChange: (provider: LLMProviderName, value: number) => void;
  onProviderSettingChange: (provider: LLMProviderName, field: string, value: unknown) => void;
}

export const SettingsAdvanced: React.FC<SettingsAdvancedProps> = ({
  rateLimits,
  providerSettings,
  apiKeys,
  onRateLimitChange,
  onProviderSettingChange,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <SettingsSection title="advanced" description="Rate limits, timeouts, custom endpoints">
      <button
        className={cn(
          "w-full flex items-center justify-between text-left group",
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
        )}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-warning)] text-[11px]">!</span>
          <span className="text-[11px] text-[var(--color-text-primary)] group-hover:text-[var(--color-accent-primary)] transition-colors">
            expert settings
          </span>
          <span className="text-[10px] text-[var(--color-text-dim)]"># modify with caution</span>
        </div>
        {isExpanded ? (
          <ChevronDown size={12} className="text-[var(--color-text-muted)]" />
        ) : (
          <ChevronRight size={12} className="text-[var(--color-text-muted)]" />
        )}
      </button>
      
      {isExpanded && (
        <div className="space-y-4 animate-in slide-in-from-top-2 duration-150">
          {/* Warning Banner */}
          <div className="flex items-center gap-2 p-2 border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 text-[10px]">
            <TriangleAlert size={11} className="text-[var(--color-warning)] flex-shrink-0" />
            <span className="text-[var(--color-text-secondary)]">[WARN] expert settings - modify with caution</span>
          </div>

          {/* Rate Limits */}
          <SettingsGroup title="rate limits">
            <div className="grid gap-2 sm:grid-cols-2">
              {PROVIDER_ORDER.map((providerId) => {
                const provider = PROVIDERS[providerId];
                const isConfigured = isProviderConfigured(providerId, apiKeys);
                const currentLimit = rateLimits[providerId] ?? 0;
                
                return (
                  <div 
                    key={providerId}
                    className={cn(
                      "p-2 border",
                      isConfigured 
                        ? "border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]/50" 
                        : "border-[var(--color-border-subtle)]/50 bg-[var(--color-surface-2)]/10 opacity-40"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[var(--color-accent-primary)] text-[9px]">›</span>
                        <span className="text-[10px] text-[var(--color-text-secondary)]">{provider.shortName.toLowerCase()}</span>
                      </div>
                      <span className="text-[9px] text-[var(--color-text-dim)]">{currentLimit ? `${currentLimit} rpm` : '---'}</span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      placeholder="0"
                      className="w-full bg-[var(--color-surface-base)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30 placeholder:text-[var(--color-text-placeholder)]"
                      value={currentLimit || ''}
                      onChange={(e) => onRateLimitChange(providerId, Number(e.target.value) || 0)}
                      disabled={!isConfigured}
                    />
                  </div>
                );
              })}
            </div>
            <p className="text-[9px] text-[var(--color-text-dim)]"># 0=unlimited | auto-throttle to stay within limits</p>
          </SettingsGroup>

          {/* Timeouts */}
          <SettingsGroup title="timeouts">
            <div className="grid gap-2 sm:grid-cols-2">
              {PROVIDER_ORDER.map((providerId) => {
                const provider = PROVIDERS[providerId];
                const isConfigured = isProviderConfigured(providerId, apiKeys);
                const settings = providerSettings[providerId];
                const currentTimeout = settings?.timeout ? settings.timeout / 1000 : 120;
                
                return (
                  <div 
                    key={providerId}
                    className={cn(
                      "p-2 border",
                      isConfigured 
                        ? "border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]/50" 
                        : "border-[var(--color-border-subtle)]/50 bg-[var(--color-surface-2)]/10 opacity-40"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[var(--color-accent-primary)] text-[9px]">›</span>
                        <span className="text-[10px] text-[var(--color-text-secondary)]">{provider.shortName.toLowerCase()}</span>
                      </div>
                      <span className="text-[9px] text-[var(--color-accent-primary)]">{currentTimeout}s</span>
                    </div>
                    <input
                      type="number"
                      min={10}
                      max={600}
                      className="w-full bg-[var(--color-surface-base)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
                      value={currentTimeout}
                      onChange={(e) => onProviderSettingChange(providerId, 'timeout', Number(e.target.value) * 1000)}
                      disabled={!isConfigured}
                    />
                  </div>
                );
              })}
            </div>
            <p className="text-[9px] text-[var(--color-text-dim)]"># max wait time (seconds) before timeout</p>
          </SettingsGroup>

          {/* Custom Base URLs */}
          <SettingsGroup title="endpoints" icon={<Server size={11} />}>
            <div className="space-y-2">
              {PROVIDER_ORDER.map((providerId) => {
                const provider = PROVIDERS[providerId];
                const isConfigured = isProviderConfigured(providerId, apiKeys);
                const settings = providerSettings[providerId];
                
                return (
                  <div 
                    key={providerId}
                    className={cn(
                      "p-2 border",
                      isConfigured 
                        ? "border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]/50" 
                        : "border-[var(--color-border-subtle)]/50 bg-[var(--color-surface-2)]/10 opacity-40"
                    )}
                  >
                    <label className="text-[10px] text-[var(--color-text-muted)] mb-1.5 block">
                      --{provider.shortName.toLowerCase()}-url
                    </label>
                    <input
                      type="url"
                      placeholder={`${provider.website}/api/...`}
                      className="w-full bg-[var(--color-surface-base)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30 placeholder:text-[var(--color-text-placeholder)]"
                      value={settings?.baseUrl ?? ''}
                      onChange={(e) => onProviderSettingChange(providerId, 'baseUrl', e.target.value || undefined)}
                      disabled={!isConfigured}
                    />
                  </div>
                );
              })}
            </div>
            <p className="text-[9px] text-[var(--color-text-dim)]">
              # override for self-hosted/proxy setups | DeepSeek strict mode: use https://api.deepseek.com/beta
            </p>
          </SettingsGroup>
        </div>
      )}
    </SettingsSection>
  );
};
