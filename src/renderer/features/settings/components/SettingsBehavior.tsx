import React from 'react';
import { TriangleAlert, Cpu, Shield } from 'lucide-react';
import { Toggle } from '../../../components/ui/Toggle';
import type { AgentSettings, LLMProviderName } from '../../../../shared/types';

interface SettingsBehaviorProps {
    config: AgentSettings['defaultConfig'];
    onChange: (field: keyof AgentSettings['defaultConfig'], value: string | boolean | number) => void;
}

const providerOrder: LLMProviderName[] = ['openai', 'anthropic', 'deepseek', 'gemini', 'openrouter'];
const providerLabel: Record<LLMProviderName, string> = {
    openai: 'openai',
    anthropic: 'anthropic',
    deepseek: 'deepseek',
    gemini: 'gemini',
    openrouter: 'openrouter',
};

export const SettingsBehavior: React.FC<SettingsBehaviorProps> = ({ config, onChange }) => {
    return (
        <section className="space-y-4 font-mono">
            <header>
                <div className="flex items-center gap-2 mb-1">
                    <Cpu size={11} className="text-[var(--color-accent-primary)]" />
                    <h3 className="text-[11px] text-[var(--color-text-primary)]">behavior</h3>
                </div>
                <p className="text-[10px] text-[var(--color-text-dim)]">
                    # model routing & safety configuration
                </p>
            </header>

            {/* Provider Selection */}
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <label className="text-[10px] text-[var(--color-text-muted)]">--provider</label>
                    <select
                        className="w-full bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30"
                        value={config.preferredProvider}
                        onChange={(event) => onChange('preferredProvider', event.target.value)}
                    >
                        <option value="auto">auto</option>
                        {providerOrder.map((provider) => (
                            <option key={provider} value={provider}>
                                {providerLabel[provider]}
                            </option>
                        ))}
                    </select>
                    <p className="text-[9px] text-[var(--color-text-placeholder)]"># auto=smart routing</p>
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] text-[var(--color-text-muted)]">--fallback</label>
                    <select
                        className="w-full bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30"
                        value={config.fallbackProvider}
                        onChange={(event) => onChange('fallbackProvider', event.target.value)}
                    >
                        {providerOrder.map((provider) => (
                            <option key={provider} value={provider}>
                                {providerLabel[provider]}
                            </option>
                        ))}
                    </select>
                    <p className="text-[9px] text-[var(--color-text-placeholder)]"># used on primary failure</p>
                </div>
            </div>

            {/* Generation Settings */}
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <label className="text-[10px] text-[var(--color-text-muted)]">--temp</label>
                        <span className="text-[10px] text-[var(--color-accent-primary)]">{config.temperature.toFixed(1)}</span>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.1}
                        className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer"
                        value={config.temperature}
                        onChange={(event) => onChange('temperature', Number(event.target.value))}
                    />
                    <div className="flex justify-between text-[9px] text-[var(--color-text-placeholder)]">
                        <span>0</span>
                        <span>1</span>
                        <span>2</span>
                    </div>
                </div>
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <label className="text-[10px] text-[var(--color-text-muted)]">--max-tokens</label>
                        <span className="text-[10px] text-[var(--color-accent-primary)]">{config.maxOutputTokens}</span>
                    </div>
                    <input
                        type="number"
                        min={256}
                        max={4096}
                        step={64}
                        className="w-full bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30"
                        value={config.maxOutputTokens}
                        onChange={(event) => onChange('maxOutputTokens', Number(event.target.value))}
                    />
                </div>
            </div>

            {/* Toggles */}
            <div className="space-y-3 border-t border-[var(--color-border-subtle)] pt-3">
                <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] mb-2">
                    <Shield size={11} className="text-[var(--color-warning)]" />
                    safety
                </div>
                
                <Toggle
                    label="--auto-switch"
                    description="# swap models mid-run on failure"
                    checked={config.allowAutoSwitch}
                    onToggle={() => onChange('allowAutoSwitch', !config.allowAutoSwitch)}
                />
                <Toggle
                    label="--yolo"
                    description="# skip confirmation prompts"
                    checked={config.yoloMode}
                    onToggle={() => onChange('yoloMode', !config.yoloMode)}
                />
                {config.yoloMode && (
                    <div className="flex items-start gap-2 p-2 border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5 text-[10px]">
                        <TriangleAlert size={11} className="text-[var(--color-warning)] flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-[var(--color-warning)]">[WARN] guardrails disabled</p>
                            <p className="text-[var(--color-text-muted)] text-[9px]">
                                Agent executes without confirmation
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Model Override */}
            <div className="space-y-1.5 border-t border-[var(--color-border-subtle)] pt-3">
                <label className="text-[10px] text-[var(--color-text-muted)]">--model-override</label>
                <input
                    type="text"
                    placeholder="e.g. gpt-4.1-mini, claude-3.5-sonnet"
                    className="w-full bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30 placeholder:text-[var(--color-text-placeholder)]"
                    value={config.manualOverrideModel ?? ''}
                    onChange={(event) => onChange('manualOverrideModel', event.target.value)}
                />
                <p className="text-[9px] text-[var(--color-text-placeholder)]"># bypass routing, use exact model id</p>
            </div>
        </section>
    );
};