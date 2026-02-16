import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TriangleAlert, Zap, Shield, Search } from 'lucide-react';
import type { AgentSettings, LLMProviderName } from '../../../../shared/types';
import { SETTINGS_CONSTRAINTS } from '../../../../shared/types';
import { PROVIDERS, PROVIDER_ORDER, isProviderConfigured } from '../../../../shared/providers';
import type { ModelInfo } from '../../../../shared/providers/types';
import { fetchProviderModels } from '../../../utils/models';
import { createLogger } from '../../../utils/logger';
import { cn } from '../../../utils/cn';
import {
  SettingsSection,
  SettingsGroup,
  SettingsToggleRow,
  SettingsSlider,
  SettingsSelect,
} from '../primitives';

interface SettingsAgentProps {
  config: AgentSettings['defaultConfig'];
  apiKeys: AgentSettings['apiKeys'];
  onChange: (field: keyof AgentSettings['defaultConfig'], value: string | boolean | number) => void;
}

export const SettingsAgent: React.FC<SettingsAgentProps> = ({ config, apiKeys, onChange }) => {
  const configuredProviders = PROVIDER_ORDER.filter(p => isProviderConfigured(p, apiKeys));
  
  // Logger is created once per component instance (stable across renders)
  const [logger] = useState(() => createLogger('SettingsAgent'));
  
  // State for default model selection
  const [allModels, setAllModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  
  // Load models from all configured providers
  const loadAllModels = useCallback(async () => {
    if (configuredProviders.length === 0) return;
    
    setLoadingModels(true);
    try {
      const modelPromises = configuredProviders.map(async (provider) => {
        try {
          const models = await fetchProviderModels(provider);
          return models;
        } catch (err) {
          logger.warn('Failed to fetch models for provider', { provider, error: err instanceof Error ? err.message : String(err) });
          return [];
        }
      });
      
      const results = await Promise.all(modelPromises);
      const combined = results.flat();
      
      // Sort: flagship first, then balanced, fast, legacy
      const tierOrder = { flagship: 0, balanced: 1, fast: 2, legacy: 3 };
      combined.sort((a, b) => {
        const tierDiff = tierOrder[a.tier] - tierOrder[b.tier];
        if (tierDiff !== 0) return tierDiff;
        return a.provider.localeCompare(b.provider);
      });
      
      setAllModels(combined);
    } finally {
      setLoadingModels(false);
    }
  }, [configuredProviders, logger]);
  
  // Load models when configured providers change
  useEffect(() => {
    if (configuredProviders.length > 0 && allModels.length === 0) {
      loadAllModels();
    }
  }, [configuredProviders.length, allModels.length, loadAllModels]);
  
  // Filter models based on search query
  const filteredModels = useMemo(() => {
    if (!modelSearchQuery.trim()) return allModels.slice(0, 50);
    const query = modelSearchQuery.toLowerCase();
    return allModels.filter(m => 
      m.id.toLowerCase().includes(query) || 
      m.name.toLowerCase().includes(query) ||
      m.provider.toLowerCase().includes(query)
    ).slice(0, 50);
  }, [allModels, modelSearchQuery]);
  
  // Get the currently selected model info
  const selectedModel = useMemo(() => {
    const modelId = config.selectedModelId;
    if (!modelId) return null;
    return allModels.find(m => m.id === modelId) || { id: modelId, name: modelId, provider: 'unknown' as LLMProviderName };
  }, [config.selectedModelId, allModels]);

  // Build provider options for select
  const providerOptions = useMemo(() => [
    { value: 'auto', label: 'auto' },
    ...PROVIDER_ORDER.map((provider) => {
      const info = PROVIDERS[provider];
      const configured = isProviderConfigured(provider, apiKeys);
      return {
        value: provider,
        label: `${info.shortName.toLowerCase()}${!configured ? ' (---)' : ''}`,
        disabled: !configured,
      };
    }),
  ], [apiKeys]);

  const fallbackProviderOptions = useMemo(() =>
    PROVIDER_ORDER.map((provider) => {
      const info = PROVIDERS[provider];
      const configured = isProviderConfigured(provider, apiKeys);
      return {
        value: provider,
        label: `${info.shortName.toLowerCase()}${!configured ? ' (---)' : ''}`,
        disabled: !configured,
      };
    }), [apiKeys]);

  const reasoningEffortOptions = [
    { value: 'auto', label: 'auto (from temp)' },
    { value: 'none', label: 'none (fastest)' },
    { value: 'low', label: 'low' },
    { value: 'medium', label: 'medium' },
    { value: 'high', label: 'high' },
    { value: 'xhigh', label: 'xhigh (gpt-5.2 only)' },
  ];

  const verbosityOptions = [
    { value: 'low', label: 'low (concise)' },
    { value: 'medium', label: 'medium (balanced)' },
    { value: 'high', label: 'high (detailed)' },
  ];

  return (
    <SettingsSection title="agent" description="Configure model routing and behavior">
      {/* Routing Group */}
      <SettingsGroup title="routing">
        <div className="grid gap-3 sm:grid-cols-2">
          <SettingsSelect
            label="provider"
            description="auto=smart routing"
            value={config.preferredProvider}
            options={providerOptions}
            onChange={(v) => onChange('preferredProvider', v)}
          />
          <SettingsSelect
            label="fallback"
            description="used when primary fails"
            value={config.fallbackProvider}
            options={fallbackProviderOptions}
            onChange={(v) => onChange('fallbackProvider', v)}
          />
        </div>

        {configuredProviders.length === 0 && (
          <div className="flex items-center gap-2 p-2 border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 text-[10px]">
            <TriangleAlert size={11} className="text-[var(--color-warning)]" />
            <span className="text-[var(--color-text-secondary)]">[WARN] no providers configured</span>
          </div>
        )}
        
        <SettingsToggleRow
          label="--auto-switch"
          description="switch providers mid-run on failure"
          checked={config.allowAutoSwitch}
          onToggle={() => onChange('allowAutoSwitch', !config.allowAutoSwitch)}
        />

        <SettingsToggleRow
          label="--enable-fallback"
          description="fallback to another provider on error"
          checked={config.enableProviderFallback ?? true}
          onToggle={() => onChange('enableProviderFallback', !(config.enableProviderFallback ?? true))}
        />

        <SettingsToggleRow
          label="--auto-model"
          description="auto-select model based on task (when provider=auto)"
          checked={config.enableAutoModelSelection ?? true}
          onToggle={() => onChange('enableAutoModelSelection', !(config.enableAutoModelSelection ?? true))}
        />
      </SettingsGroup>

      {/* Generation Group */}
      <SettingsGroup title="generation" icon={<Zap size={11} />}>
        <div className="grid gap-3 sm:grid-cols-2">
          <SettingsSlider
            label="temp"
            value={config.temperature ?? SETTINGS_CONSTRAINTS.temperature.default}
            onChange={(v) => onChange('temperature', v)}
            min={SETTINGS_CONSTRAINTS.temperature.min}
            max={SETTINGS_CONSTRAINTS.temperature.max}
            step={0.1}
            format={(v) => v.toFixed(1)}
          />
          <SettingsSlider
            label="max tokens"
            value={config.maxOutputTokens ?? SETTINGS_CONSTRAINTS.maxOutputTokens.default}
            onChange={(v) => onChange('maxOutputTokens', v)}
            min={1024}
            max={SETTINGS_CONSTRAINTS.maxOutputTokens.max}
            step={1024}
            format={(v) => v.toLocaleString()}
          />
        </div>

        {/* Model Override Input */}
        <div className="py-2 font-mono">
          <label className="text-[11px] text-[var(--color-text-primary)] flex items-center gap-1 mb-2">
            <span className="text-[var(--color-accent-secondary)]">--</span>
            model-override
          </label>
          <input
            type="text"
            className="w-full bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[11px] font-mono outline-none transition-colors focus-visible:border-[var(--color-accent-primary)]/30 placeholder:text-[var(--color-text-placeholder)]"
            placeholder="e.g. claude-3-opus-latest"
            value={config.selectedModelId ?? ''}
            onChange={(e) => onChange('selectedModelId', e.target.value)}
          />
          <p className="text-[10px] text-[var(--color-text-dim)] mt-2">
            <span className="text-[var(--color-text-placeholder)]">#</span> bypass routing, use exact model id
          </p>
        </div>
      </SettingsGroup>

      {/* Default Model Selection Group */}
      <SettingsGroup title="default model">
        <div className="py-2 font-mono space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-[var(--color-text-primary)] flex items-center gap-1">
              <span className="text-[var(--color-accent-secondary)]">--</span>
              default-model
            </label>
            {loadingModels && (
              <span className="text-[9px] text-[var(--color-text-dim)]">loading...</span>
            )}
            {!loadingModels && allModels.length > 0 && (
              <button
                onClick={loadAllModels}
                className="text-[9px] text-[var(--color-text-dim)] hover:text-[var(--color-accent-primary)] transition-colors"
              >
                refresh
              </button>
            )}
          </div>
          
          {/* Model Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                if (configuredProviders.length > 0) {
                  setShowModelDropdown(!showModelDropdown);
                  if (allModels.length === 0) loadAllModels();
                }
              }}
              disabled={configuredProviders.length === 0}
              className={cn(
                "w-full bg-[var(--color-surface-1)] text-left border px-3 py-1.5 text-[11px] font-mono outline-none transition-all",
                configuredProviders.length === 0 
                  ? "border-[var(--color-border-subtle)]/50 text-[var(--color-text-dim)] cursor-not-allowed"
                  : "border-[var(--color-border-subtle)] text-[var(--color-text-primary)] hover:border-[var(--color-accent-primary)]/30",
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
              )}
            >
              {selectedModel ? (
                <span className="flex items-center gap-2">
                  <span className={cn("text-[10px]", PROVIDERS[selectedModel.provider as LLMProviderName]?.color || 'text-[var(--color-text-dim)]')}>
                    [{selectedModel.provider}]
                  </span>
                  <span className="truncate">{selectedModel.name || selectedModel.id}</span>
                </span>
              ) : (
                <span className="text-[var(--color-text-placeholder)]">
                  {configuredProviders.length === 0 ? 'configure a provider first' : 'auto (use provider defaults)'}
                </span>
              )}
            </button>
            
            {/* Dropdown Panel */}
            {showModelDropdown && configuredProviders.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] shadow-lg max-h-64 overflow-hidden flex flex-col">
                {/* Search */}
                <div className="p-1.5 border-b border-[var(--color-border-subtle)]">
                  <div className="relative">
                    <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
                    <input
                      type="text"
                      placeholder="Search models..."
                      value={modelSearchQuery}
                      onChange={(e) => setModelSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setShowModelDropdown(false);
                          setModelSearchQuery('');
                        }
                      }}
                      className="w-full bg-[var(--color-surface-2)] text-[var(--color-text-primary)] border-none pl-6 pr-2 py-1 text-[10px] font-mono outline-none placeholder:text-[var(--color-text-placeholder)]"
                      autoFocus
                    />
                  </div>
                </div>
                
                {/* Model list */}
                <div className="overflow-y-auto flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      onChange('selectedModelId', '');
                      setShowModelDropdown(false);
                      setModelSearchQuery('');
                    }}
                    className={cn(
                      "w-full text-left px-2 py-1.5 text-[10px] font-mono hover:bg-[var(--color-surface-2)] transition-colors",
                      !config.selectedModelId && "bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]"
                    )}
                  >
                    <span className="text-[var(--color-text-dim)]">[auto]</span> use provider defaults
                  </button>
                  
                  {loadingModels ? (
                    <div className="px-2 py-3 text-[9px] text-[var(--color-text-dim)] text-center">
                      Loading models...
                    </div>
                  ) : filteredModels.length === 0 ? (
                    <div className="px-2 py-3 text-[9px] text-[var(--color-text-dim)] text-center">
                      No models found
                    </div>
                  ) : (
                    filteredModels.map((model) => (
                      <button
                        key={`${model.provider}-${model.id}`}
                        type="button"
                        onClick={() => {
                          onChange('selectedModelId', model.id);
                          setShowModelDropdown(false);
                          setModelSearchQuery('');
                        }}
                        className={cn(
                          "w-full text-left px-2 py-1.5 text-[10px] font-mono hover:bg-[var(--color-surface-2)] transition-colors",
                          config.selectedModelId === model.id && "bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className={cn("text-[9px] shrink-0", PROVIDERS[model.provider]?.color || 'text-[var(--color-text-dim)]')}>
                            [{model.provider}]
                          </span>
                          <span className="truncate">{model.name}</span>
                        </div>
                        <div className="text-[8px] text-[var(--color-text-dim)] truncate mt-0.5">
                          {model.id}
                        </div>
                      </button>
                    ))
                  )}
                </div>
                
                {/* Close on click outside */}
                <div 
                  className="fixed inset-0 -z-10" 
                  onClick={() => {
                    setShowModelDropdown(false);
                    setModelSearchQuery('');
                  }}
                />
              </div>
            )}
          </div>
          
          <p className="text-[10px] text-[var(--color-text-dim)]">
            <span className="text-[var(--color-text-placeholder)]">#</span> model used when provider=auto (overrides task routing)
          </p>
          
          {config.selectedModelId && (
            <button
              type="button"
              onClick={() => onChange('selectedModelId', '')}
              className="text-[9px] text-[var(--color-text-dim)] hover:text-[var(--color-accent-primary)] transition-colors"
            >
              clear selection
            </button>
          )}
        </div>
      </SettingsGroup>

      {/* Reasoning Group (OpenAI) */}
      <SettingsGroup title="reasoning (openai)">
        <div className="grid gap-3 sm:grid-cols-2">
          <SettingsSelect
            label="reasoning effort"
            description="controls reasoning depth"
            value={config.reasoningEffort ?? 'auto'}
            options={reasoningEffortOptions}
            onChange={(v) => onChange('reasoningEffort', v === 'auto' ? '' : v)}
          />
          <SettingsSelect
            label="verbosity"
            description="response length (gpt-5.2)"
            value={config.verbosity ?? 'medium'}
            options={verbosityOptions}
            onChange={(v) => onChange('verbosity', v)}
          />
        </div>
        <p className="text-[10px] text-[var(--color-text-dim)]">
          <span className="text-[var(--color-text-placeholder)]">#</span> these settings only apply to openai gpt-5.x models
        </p>
      </SettingsGroup>

      {/* Thinking Group (DeepSeek & Anthropic) */}
      <SettingsGroup title="thinking / extended reasoning">
        <SettingsToggleRow
          label="deepseek thinking"
          description="enable thinking mode for deepseek-chat"
          checked={config.enableDeepSeekThinking ?? true}
          onToggle={() => onChange('enableDeepSeekThinking', !(config.enableDeepSeekThinking ?? true))}
        />
        <SettingsToggleRow
          label="anthropic extended thinking"
          description="enable extended thinking for claude models"
          checked={config.enableAnthropicThinking ?? true}
          onToggle={() => onChange('enableAnthropicThinking', !(config.enableAnthropicThinking ?? true))}
        />
        {(config.enableAnthropicThinking ?? true) && (
          <SettingsSlider
            label="anthropic thinking budget"
            value={config.anthropicThinkingBudget ?? SETTINGS_CONSTRAINTS.anthropicThinkingBudget.default}
            onChange={(v) => onChange('anthropicThinkingBudget', v)}
            min={SETTINGS_CONSTRAINTS.anthropicThinkingBudget.min}
            max={SETTINGS_CONSTRAINTS.anthropicThinkingBudget.max}
            step={1024}
            format={(v) => `${(v / 1000).toFixed(1)}k`}
          />
        )}
        <SettingsToggleRow
          label="interleaved thinking"
          description="reason between tool calls (claude 4+)"
          checked={config.enableInterleavedThinking ?? false}
          onToggle={() => onChange('enableInterleavedThinking', !(config.enableInterleavedThinking ?? false))}
        />
        <p className="text-[10px] text-[var(--color-text-dim)]">
          <span className="text-[var(--color-text-placeholder)]">#</span> controls reasoning behavior for deepseek and anthropic models
        </p>
      </SettingsGroup>

      {/* Safety Group */}
      <SettingsGroup title="safety" icon={<Shield size={11} />}>
        <SettingsToggleRow
          label="--yolo"
          description="skip all confirmation prompts"
          checked={config.yoloMode}
          onToggle={() => onChange('yoloMode', !config.yoloMode)}
        />
        
        {config.yoloMode && (
          <div className="p-2 border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5 text-[10px]">
            <div className="flex items-start gap-2">
              <TriangleAlert size={12} className="text-[var(--color-warning)] flex-shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-[var(--color-warning)]">[WARN] guardrails disabled</p>
                <p className="text-[var(--color-text-muted)] text-[9px]">
                  Agent will execute file/terminal operations without confirmation
                </p>
              </div>
            </div>
          </div>
        )}
      </SettingsGroup>

      {/* Iterations Group */}
      <SettingsGroup title="iterations">
        <div className="grid gap-3 sm:grid-cols-2">
          <SettingsSlider
            label="max iterations"
            description="max tool loops per request (no upper limit)"
            value={config.maxIterations ?? SETTINGS_CONSTRAINTS.maxIterations.default}
            onChange={(v) => onChange('maxIterations', v)}
            min={SETTINGS_CONSTRAINTS.maxIterations.min}
            max={500}
            step={5}
          />
          <SettingsSlider
            label="max retries"
            description="retry on transient errors"
            value={config.maxRetries ?? SETTINGS_CONSTRAINTS.maxRetries.default}
            onChange={(v) => onChange('maxRetries', v)}
            min={SETTINGS_CONSTRAINTS.maxRetries.min}
            max={SETTINGS_CONSTRAINTS.maxRetries.max}
            step={1}
          />
        </div>
        
        <SettingsSlider
          label="retry delay"
          description="base delay between retries (with backoff)"
          value={config.retryDelayMs ?? SETTINGS_CONSTRAINTS.retryDelayMs.default}
          onChange={(v) => onChange('retryDelayMs', v)}
          min={SETTINGS_CONSTRAINTS.retryDelayMs.min}
          max={SETTINGS_CONSTRAINTS.retryDelayMs.max}
          step={500}
          format={(v) => `${(v / 1000).toFixed(1)}s`}
        />
      </SettingsGroup>

      {/* Context Group */}
      <SettingsGroup title="context">
        <SettingsToggleRow
          label="--summarize"
          description="auto-summarize long conversations"
          checked={config.enableContextSummarization ?? true}
          onToggle={() => onChange('enableContextSummarization', !(config.enableContextSummarization ?? true))}
        />
        
        {config.enableContextSummarization !== false && (
          <div className="grid gap-3 sm:grid-cols-2 animate-in slide-in-from-top-1 duration-150">
            <SettingsSlider
              label="summarize after"
              value={config.summarizationThreshold ?? SETTINGS_CONSTRAINTS.summarizationThreshold.default}
              onChange={(v) => onChange('summarizationThreshold', v)}
              min={SETTINGS_CONSTRAINTS.summarizationThreshold.min}
              max={SETTINGS_CONSTRAINTS.summarizationThreshold.max}
              step={10}
              format={(v) => `${v} msgs`}
            />
            <SettingsSlider
              label="keep recent"
              value={config.keepRecentMessages ?? SETTINGS_CONSTRAINTS.keepRecentMessages.default}
              onChange={(v) => onChange('keepRecentMessages', v)}
              min={SETTINGS_CONSTRAINTS.keepRecentMessages.min}
              max={SETTINGS_CONSTRAINTS.keepRecentMessages.max}
              step={5}
              format={(v) => `${v} msgs`}
            />
          </div>
        )}
        
        <p className="text-[10px] text-[var(--color-text-dim)]">
          <span className="text-[var(--color-text-placeholder)]">#</span> summarization prevents context overflow in long sessions
        </p>
      </SettingsGroup>
    </SettingsSection>
  );
};
