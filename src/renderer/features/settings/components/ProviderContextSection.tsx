/**
 * ProviderContextSection Component
 * 
 * Per-provider context window management settings.
 * These are expert-level overrides controlling how each provider
 * handles context pruning, summarization, and token management.
 */
import React, { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { AgentSettings, LLMProviderName, ProviderContextSettings } from '../../../../shared/types';
import { PROVIDERS, PROVIDER_ORDER, isProviderConfigured } from '../../../../shared/providers';
import { ProviderIcon } from '../../../components/ui/ProviderIcons';
import { cn } from '../../../utils/cn';
import {
  SettingsToggleRow,
  SettingsSlider,
} from '../primitives';

interface ProviderContextSectionProps {
  providerSettings: AgentSettings['providerSettings'];
  apiKeys: AgentSettings['apiKeys'];
  onProviderSettingChange: (provider: LLMProviderName, field: string, value: unknown) => void;
}

const DEFAULT_CONTEXT: ProviderContextSettings = {
  autoPrune: true,
  warnThreshold: 0.75,
  pruneThreshold: 0.85,
  targetUtilization: 70,
  minMessagesToKeep: 10,
  preserveToolPairs: true,
  enableSummarization: true,
  summarizationThreshold: 100,
};

export const ProviderContextSection: React.FC<ProviderContextSectionProps> = ({
  providerSettings,
  apiKeys,
  onProviderSettingChange,
}) => {
  const [expandedProvider, setExpandedProvider] = useState<LLMProviderName | null>(null);

  const configuredProviders = PROVIDER_ORDER.filter(
    (id) => isProviderConfigured(id, apiKeys) && (providerSettings[id]?.enabled ?? true)
  );

  const updateContext = useCallback(
    (providerId: LLMProviderName, field: keyof ProviderContextSettings, value: unknown) => {
      const currentContext = providerSettings[providerId]?.context ?? {};
      onProviderSettingChange(providerId, 'context', { ...currentContext, [field]: value });
    },
    [providerSettings, onProviderSettingChange],
  );

  if (configuredProviders.length === 0) {
    return (
      <p className="text-[9px] text-[var(--color-text-dim)]">
        # configure and enable providers first
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {configuredProviders.map((providerId) => {
        const provider = PROVIDERS[providerId];
        const ctx = providerSettings[providerId]?.context ?? {};
        const isOpen = expandedProvider === providerId;

        return (
          <div
            key={providerId}
            className={cn(
              "border",
              isOpen
                ? "border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]/50"
                : "border-[var(--color-border-subtle)]/50 bg-[var(--color-surface-2)]/10"
            )}
          >
            <button
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 text-left",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
              )}
              onClick={() => setExpandedProvider(isOpen ? null : providerId)}
              aria-expanded={isOpen}
            >
              {isOpen ? (
                <ChevronDown size={10} className="text-[var(--color-text-dim)]" />
              ) : (
                <ChevronRight size={10} className="text-[var(--color-text-dim)]" />
              )}
              <ProviderIcon provider={providerId} size={10} className={provider.color} />
              <span className="text-[10px] text-[var(--color-text-secondary)]">
                {provider.shortName.toLowerCase()}
              </span>
              <span className="text-[9px] text-[var(--color-text-dim)] ml-auto">
                {ctx.autoPrune !== false ? 'auto-prune' : 'manual'}
              </span>
            </button>

            {isOpen && (
              <div className="px-2.5 pb-2.5 pt-0 space-y-2 animate-in slide-in-from-top-1 duration-100">
                <div className="h-px bg-[var(--color-border-subtle)]/30" />

                <SettingsToggleRow
                  label="auto-prune"
                  description="Automatically prune old messages when context fills"
                  checked={ctx.autoPrune ?? DEFAULT_CONTEXT.autoPrune!}
                  onToggle={() => updateContext(providerId, 'autoPrune', !(ctx.autoPrune ?? true))}
                  showState={false}
                />

                <SettingsSlider
                  label="warn-threshold"
                  description="Context utilization % to trigger warnings"
                  value={ctx.warnThreshold ?? DEFAULT_CONTEXT.warnThreshold!}
                  onChange={(v) => updateContext(providerId, 'warnThreshold', v)}
                  min={0.3}
                  max={1}
                  step={0.05}
                  format={(v) => `${Math.round(v * 100)}%`}
                />

                <SettingsSlider
                  label="prune-threshold"
                  description="Utilization % when aggressive pruning starts"
                  value={ctx.pruneThreshold ?? DEFAULT_CONTEXT.pruneThreshold!}
                  onChange={(v) => updateContext(providerId, 'pruneThreshold', v)}
                  min={0.5}
                  max={1}
                  step={0.05}
                  format={(v) => `${Math.round(v * 100)}%`}
                />

                <SettingsSlider
                  label="target-utilization"
                  description="Target context utilization after pruning (0-100)"
                  value={ctx.targetUtilization ?? DEFAULT_CONTEXT.targetUtilization!}
                  onChange={(v) => updateContext(providerId, 'targetUtilization', v)}
                  min={20}
                  max={95}
                  step={5}
                  format={(v) => `${v}%`}
                />

                <SettingsSlider
                  label="min-messages-to-keep"
                  description="Minimum messages preserved during pruning"
                  value={ctx.minMessagesToKeep ?? DEFAULT_CONTEXT.minMessagesToKeep!}
                  onChange={(v) => updateContext(providerId, 'minMessagesToKeep', v)}
                  min={2}
                  max={50}
                  step={1}
                />

                <SettingsToggleRow
                  label="preserve-tool-pairs"
                  description="Keep tool call/result pairs together during pruning"
                  checked={ctx.preserveToolPairs ?? DEFAULT_CONTEXT.preserveToolPairs!}
                  onToggle={() => updateContext(providerId, 'preserveToolPairs', !(ctx.preserveToolPairs ?? true))}
                  showState={false}
                />

                <SettingsToggleRow
                  label="enable-summarization"
                  description="Summarize pruned context instead of dropping"
                  checked={ctx.enableSummarization ?? DEFAULT_CONTEXT.enableSummarization!}
                  onToggle={() => updateContext(providerId, 'enableSummarization', !(ctx.enableSummarization ?? true))}
                  showState={false}
                />

                <SettingsSlider
                  label="summarization-threshold"
                  description="Message count before summarization triggers"
                  value={ctx.summarizationThreshold ?? DEFAULT_CONTEXT.summarizationThreshold!}
                  onChange={(v) => updateContext(providerId, 'summarizationThreshold', v)}
                  min={10}
                  max={500}
                  step={10}
                  disabled={!(ctx.enableSummarization ?? true)}
                />
              </div>
            )}
          </div>
        );
      })}
      <p className="text-[9px] text-[var(--color-text-dim)]">
        # per-provider overrides for context window management
      </p>
    </div>
  );
};
