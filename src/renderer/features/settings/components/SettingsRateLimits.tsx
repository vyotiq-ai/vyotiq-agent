import React from 'react';
import { Gauge } from 'lucide-react';
import type { AgentSettings, LLMProviderName } from '../../../../shared/types';

interface SettingsRateLimitsProps {
    rateLimits: AgentSettings['rateLimits'];
    onChange: (provider: LLMProviderName, value: number) => void;
}

const providerOrder: LLMProviderName[] = ['openai', 'anthropic', 'deepseek', 'gemini', 'openrouter'];
const providerLabel: Record<LLMProviderName, string> = {
    openai: 'openai',
    anthropic: 'anthropic',
    deepseek: 'deepseek',
    gemini: 'gemini',
    openrouter: 'openrouter',
};

export const SettingsRateLimits: React.FC<SettingsRateLimitsProps> = ({ rateLimits, onChange }) => {
    return (
        <section className="space-y-4 font-mono">
            <header>
                <div className="flex items-center gap-2 mb-1">
                    <Gauge size={11} className="text-[var(--color-info)]" />
                    <h3 className="text-[11px] text-[var(--color-text-primary)]">rate-limits</h3>
                </div>
                <p className="text-[10px] text-[var(--color-text-dim)]">
                    # requests per minute | auto-throttle to stay within quotas
                </p>
            </header>
            <div className="grid gap-3 sm:grid-cols-2">
                {providerOrder.map((provider) => (
                    <div key={provider} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] text-[var(--color-text-muted)]">--{providerLabel[provider]}</label>
                            <span className="text-[9px] text-[var(--color-text-dim)]">
                                {rateLimits[provider] ? `${rateLimits[provider]} rpm` : '---'}
                            </span>
                        </div>
                        <input
                            type="number"
                            min={1}
                            placeholder="60"
                            className="w-full bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30 placeholder:text-[var(--color-text-placeholder)]"
                            value={rateLimits[provider] ?? ''}
                            onChange={(event) => onChange(provider, Number(event.target.value))}
                        />
                    </div>
                ))}
            </div>
            <p className="text-[9px] text-[var(--color-text-placeholder)] border-t border-[var(--color-border-subtle)] pt-2">
                # leave empty for unlimited | prevents api throttling errors
            </p>
        </section>
    );
};
