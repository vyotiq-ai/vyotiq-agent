import React from 'react';
import { Key, Eye, EyeOff } from 'lucide-react';
import type { AgentSettings, LLMProviderName } from '../../../../shared/types';

interface SettingsAPIKeysProps {
    apiKeys: AgentSettings['apiKeys'];
    onChange: (provider: LLMProviderName, value: string) => void;
}

const providerOrder: LLMProviderName[] = ['openai', 'anthropic', 'deepseek', 'gemini', 'openrouter'];
const providerLabel: Record<LLMProviderName, string> = {
    openai: 'openai',
    anthropic: 'anthropic',
    deepseek: 'deepseek',
    gemini: 'gemini',
    openrouter: 'openrouter',
};

export const SettingsAPIKeys: React.FC<SettingsAPIKeysProps> = ({ apiKeys, onChange }) => {
    const [visibleKeys, setVisibleKeys] = React.useState<Record<string, boolean>>({});

    const toggleVisibility = (provider: string) => {
        setVisibleKeys(prev => ({ ...prev, [provider]: !prev[provider] }));
    };

    return (
        <section className="space-y-4 font-mono">
            <header>
                <div className="flex items-center gap-2 mb-1">
                    <Key size={11} className="text-[var(--color-accent-primary)]" />
                    <h3 className="text-[11px] text-[var(--color-text-primary)]">api-keys</h3>
                </div>
                <p className="text-[10px] text-[var(--color-text-dim)]">
                    # stored locally, encrypted | required per provider
                </p>
            </header>
            <div className="grid gap-3 sm:grid-cols-2">
                {providerOrder.map((provider) => (
                    <div key={provider} className="space-y-1.5">
                        <label className="text-[10px] text-[var(--color-text-muted)]">--{providerLabel[provider]}</label>
                        <div className="relative">
                            <input
                                type={visibleKeys[provider] ? 'text' : 'password'}
                                placeholder={`sk-...`}
                                className="w-full bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 pr-8 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30 placeholder:text-[var(--color-text-placeholder)]"
                                value={apiKeys[provider] ?? ''}
                                onChange={(event) => onChange(provider, event.target.value)}
                            />
                            <button
                                type="button"
                                onClick={() => toggleVisibility(provider)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
                                aria-label={visibleKeys[provider] ? `Hide ${providerLabel[provider]} API key` : `Show ${providerLabel[provider]} API key`}
                            >
                                {visibleKeys[provider] ? <EyeOff size={11} /> : <Eye size={11} />}
                            </button>
                        </div>
                        {apiKeys[provider] && (
                            <p className="text-[9px] text-[var(--color-accent-primary)]/60">[OK] configured</p>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
};
