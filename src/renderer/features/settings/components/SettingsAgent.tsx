import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TriangleAlert, Zap, Shield, Sparkles, RefreshCw, Brain, Lightbulb, Search, Layers } from 'lucide-react';
import { Toggle } from '../../../components/ui/Toggle';
import type { AgentSettings, LLMProviderName } from '../../../../shared/types';
import { PROVIDERS, PROVIDER_ORDER, isProviderConfigured } from '../../../../shared/providers';
import type { ModelInfo } from '../../../../shared/providers/types';
import { fetchProviderModels } from '../../../utils/models';
import { cn } from '../../../utils/cn';

interface SettingsAgentProps {
  config: AgentSettings['defaultConfig'];
  apiKeys: AgentSettings['apiKeys'];
  onChange: (field: keyof AgentSettings['defaultConfig'], value: string | boolean | number) => void;
}

export const SettingsAgent: React.FC<SettingsAgentProps> = ({ config, apiKeys, onChange }) => {
  const configuredProviders = PROVIDER_ORDER.filter(p => isProviderConfigured(p, apiKeys));
  
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
        } catch {
          return [];
        }
      });
      
      const results = await Promise.all(modelPromises);
      const combined = results.flat();
      
      // Sort: flagship first, then balanced, fast, legacy
      const tierOrder = { flagship: 0, balanced: 1, fast: 2, legacy: 3 };
      combined.sort((a, b) => {
        // Sort by tier first
        const tierDiff = tierOrder[a.tier] - tierOrder[b.tier];
        if (tierDiff !== 0) return tierDiff;
        // Then by provider
        return a.provider.localeCompare(b.provider);
      });
      
      setAllModels(combined);
    } finally {
      setLoadingModels(false);
    }
  }, [configuredProviders]);
  
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
  
  return (
    <section className="space-y-4 font-mono">
      <header>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[var(--color-accent-primary)] text-[11px]">#</span>
          <h3 className="text-[11px] text-[var(--color-text-primary)]">agent</h3>
        </div>
        <p className="text-[10px] text-[var(--color-text-dim)]">
          # Configure model routing and behavior
        </p>
      </header>

      {/* Model Routing Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Sparkles size={11} className="text-[var(--color-accent-primary)]" />
          routing
        </div>
        
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Preferred Provider */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-[var(--color-text-muted)]">--provider</label>
            <select
              className="w-full bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30"
              value={config.preferredProvider}
              onChange={(e) => onChange('preferredProvider', e.target.value)}
            >
              <option value="auto">auto</option>
              {PROVIDER_ORDER.map((provider) => {
                const info = PROVIDERS[provider];
                const configured = isProviderConfigured(provider, apiKeys);
                return (
                  <option 
                    key={provider} 
                    value={provider}
                    disabled={!configured}
                  >
                    {info.shortName.toLowerCase()} {!configured && '(---)'}
                  </option>
                );
              })}
            </select>
            <p className="text-[9px] text-[var(--color-text-dim)]"># auto=smart routing</p>
          </div>
          
          {/* Fallback Provider */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-[var(--color-text-muted)]">--fallback</label>
            <select
              className="w-full bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30"
              value={config.fallbackProvider}
              onChange={(e) => onChange('fallbackProvider', e.target.value)}
            >
              {PROVIDER_ORDER.map((provider) => {
                const info = PROVIDERS[provider];
                const configured = isProviderConfigured(provider, apiKeys);
                return (
                  <option 
                    key={provider} 
                    value={provider}
                    disabled={!configured}
                  >
                    {info.shortName.toLowerCase()} {!configured && '(---)'}
                  </option>
                );
              })}
            </select>
            <p className="text-[9px] text-[var(--color-text-dim)]"># used when primary fails</p>
          </div>
        </div>

        {configuredProviders.length === 0 && (
          <div className="flex items-center gap-2 p-2 border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 text-[10px]">
            <TriangleAlert size={11} className="text-[var(--color-warning)]" />
            <span className="text-[var(--color-text-secondary)]">[WARN] no providers configured</span>
          </div>
        )}
        
        <Toggle
          label="--auto-switch"
          description="# switch providers mid-run on failure"
          checked={config.allowAutoSwitch}
          onToggle={() => onChange('allowAutoSwitch', !config.allowAutoSwitch)}
        />

        <Toggle
          label="--enable-fallback"
          description="# fallback to another provider on error"
          checked={config.enableProviderFallback !== false}
          onToggle={() => onChange('enableProviderFallback', !(config.enableProviderFallback !== false))}
        />

        <Toggle
          label="--auto-model"
          description="# auto-select model based on task (when provider=auto)"
          checked={config.enableAutoModelSelection !== false}
          onToggle={() => onChange('enableAutoModelSelection', !(config.enableAutoModelSelection !== false))}
        />
      </div>

      {/* Generation Settings */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Zap size={11} className="text-[var(--color-info)]" />
          generation
        </div>
        
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Temperature */}
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
              onChange={(e) => onChange('temperature', Number(e.target.value))}
            />
            <div className="flex justify-between text-[9px] text-[var(--color-text-dim)]">
              <span>0</span>
              <span>1</span>
              <span>2</span>
            </div>
          </div>
          
          {/* Max Output Tokens */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-[var(--color-text-muted)]">--max-tokens</label>
              <span className="text-[10px] text-[var(--color-accent-primary)]">{config.maxOutputTokens.toLocaleString()}</span>
            </div>
            <input
              type="range"
              min={1024}
              max={32768}
              step={1024}
              className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer"
              value={config.maxOutputTokens}
              onChange={(e) => onChange('maxOutputTokens', Number(e.target.value))}
            />
            <div className="flex justify-between text-[9px] text-[var(--color-text-dim)]">
              <span>1k</span>
              <span>16k</span>
              <span>32k</span>
            </div>
          </div>
        </div>

        {/* Manual Override */}
        <div className="space-y-1.5">
          <label className="text-[10px] text-[var(--color-text-muted)]">--model-override</label>
          <input
            type="text"
            className="w-full bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30 placeholder:text-[var(--color-text-placeholder)]"
            placeholder="e.g. claude-3-opus-latest"
            value={config.selectedModelId ?? ''}
            onChange={(e) => onChange('selectedModelId', e.target.value)}
          />
          <p className="text-[9px] text-[var(--color-text-dim)]"># bypass routing, use exact model id</p>
        </div>
      </div>

      {/* Default Model Selection */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Layers size={11} className="text-[var(--color-accent-secondary)]" />
          default model
        </div>
        
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] text-[var(--color-text-muted)]">--default-model</label>
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
          
          {/* Selected model display / dropdown trigger */}
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
                "w-full bg-[var(--color-surface-1)] text-left border px-2 py-1.5 text-[10px] outline-none transition-all",
                configuredProviders.length === 0 
                  ? "border-[var(--color-border-subtle)]/50 text-[var(--color-text-dim)] cursor-not-allowed"
                  : "border-[var(--color-border-subtle)] text-[var(--color-text-primary)] hover:border-[var(--color-accent-primary)]/30",
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
              )}
            >
              {selectedModel ? (
                <span className="flex items-center gap-2">
                  <span className={cn("text-[9px]", PROVIDERS[selectedModel.provider as LLMProviderName]?.color || 'text-[var(--color-text-dim)]')}>
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
            
            {/* Dropdown */}
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
                      className="w-full bg-[var(--color-surface-2)] text-[var(--color-text-primary)] border-none pl-6 pr-2 py-1 text-[10px] outline-none placeholder:text-[var(--color-text-placeholder)]"
                      autoFocus
                    />
                  </div>
                </div>
                
                {/* Model list */}
                <div className="overflow-y-auto flex-1">
                  {/* Auto option */}
                  <button
                    type="button"
                    onClick={() => {
                      onChange('selectedModelId', '');
                      setShowModelDropdown(false);
                      setModelSearchQuery('');
                    }}
                    className={cn(
                      "w-full text-left px-2 py-1.5 text-[10px] hover:bg-[var(--color-surface-2)] transition-colors",
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
                          "w-full text-left px-2 py-1.5 text-[10px] hover:bg-[var(--color-surface-2)] transition-colors",
                          config.selectedModelId === model.id && "bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className={cn("text-[9px] shrink-0", PROVIDERS[model.provider]?.color || 'text-[var(--color-text-dim)]')}>
                            [{model.provider}]
                          </span>
                          <span className="truncate">{model.name}</span>
                          <span className={cn(
                            "text-[8px] ml-auto shrink-0",
                            model.tier === 'flagship' ? 'text-[var(--color-warning)]' :
                            model.tier === 'fast' ? 'text-[var(--color-accent-primary)]' :
                            model.tier === 'legacy' ? 'text-[var(--color-text-dim)]' :
                            'text-[var(--color-info)]'
                          )}>
                            {model.tier}
                          </span>
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
          
          <p className="text-[9px] text-[var(--color-text-dim)]">
            # model used when provider=auto (overrides task routing)
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
      </div>

      {/* OpenAI Reasoning Settings */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Lightbulb size={11} className="text-[var(--color-warning)]" />
          reasoning (openai)
        </div>
        
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Reasoning Effort */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-[var(--color-text-muted)]">--reasoning-effort</label>
            <select
              className="w-full bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30"
              value={config.reasoningEffort ?? 'auto'}
              onChange={(e) => onChange('reasoningEffort', e.target.value === 'auto' ? '' : e.target.value)}
            >
              <option value="auto">auto (from temp)</option>
              <option value="none">none (fastest)</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="xhigh">xhigh (gpt-5.2 only)</option>
            </select>
            <p className="text-[9px] text-[var(--color-text-dim)]"># controls reasoning depth</p>
          </div>
          
          {/* Verbosity */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-[var(--color-text-muted)]">--verbosity</label>
            <select
              className="w-full bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30"
              value={config.verbosity ?? 'medium'}
              onChange={(e) => onChange('verbosity', e.target.value)}
            >
              <option value="low">low (concise)</option>
              <option value="medium">medium (balanced)</option>
              <option value="high">high (detailed)</option>
            </select>
            <p className="text-[9px] text-[var(--color-text-dim)]"># response length (gpt-5.2)</p>
          </div>
        </div>
        
        <p className="text-[9px] text-[var(--color-text-dim)]">
          # these settings only apply to openai gpt-5.x models
        </p>
      </div>

      {/* Safety Settings */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Shield size={11} className="text-[var(--color-warning)]" />
          safety
        </div>
        
        <Toggle
          label="--yolo"
          description="# skip all confirmation prompts"
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
      </div>

      {/* Iteration Settings */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <RefreshCw size={11} className="text-[var(--color-accent-secondary)]" />
          iterations
        </div>
        
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Max Iterations */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-[var(--color-text-muted)]">--max-iterations</label>
              <span className="text-[10px] text-[var(--color-accent-primary)]">{config.maxIterations ?? 20}</span>
            </div>
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer"
              value={config.maxIterations ?? 20}
              onChange={(e) => onChange('maxIterations', Number(e.target.value))}
            />
            <div className="flex justify-between text-[9px] text-[var(--color-text-dim)]">
              <span>5</span>
              <span>50</span>
              <span>100</span>
            </div>
            <p className="text-[9px] text-[var(--color-text-dim)]"># max tool loops per request</p>
          </div>
          
          {/* Max Retries */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-[var(--color-text-muted)]">--max-retries</label>
              <span className="text-[10px] text-[var(--color-accent-primary)]">{config.maxRetries ?? 2}</span>
            </div>
            <input
              type="range"
              min={0}
              max={5}
              step={1}
              className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer"
              value={config.maxRetries ?? 2}
              onChange={(e) => onChange('maxRetries', Number(e.target.value))}
            />
            <div className="flex justify-between text-[9px] text-[var(--color-text-dim)]">
              <span>0</span>
              <span>2</span>
              <span>5</span>
            </div>
            <p className="text-[9px] text-[var(--color-text-dim)]"># retry on transient errors</p>
          </div>
        </div>
        
        {/* Retry Delay */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] text-[var(--color-text-muted)]">--retry-delay</label>
            <span className="text-[10px] text-[var(--color-accent-primary)]">{((config.retryDelayMs ?? 1500) / 1000).toFixed(1)}s</span>
          </div>
          <input
            type="range"
            min={500}
            max={10000}
            step={500}
            className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer"
            value={config.retryDelayMs ?? 1500}
            onChange={(e) => onChange('retryDelayMs', Number(e.target.value))}
          />
          <div className="flex justify-between text-[9px] text-[var(--color-text-dim)]">
            <span>0.5s</span>
            <span>5s</span>
            <span>10s</span>
          </div>
          <p className="text-[9px] text-[var(--color-text-dim)]"># base delay between retries (with backoff)</p>
        </div>
      </div>

      {/* Context Management */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Brain size={11} className="text-[var(--color-success)]" />
          context
        </div>
        
        <Toggle
          label="--summarize"
          description="# auto-summarize long conversations"
          checked={config.enableContextSummarization !== false}
          onToggle={() => onChange('enableContextSummarization', !(config.enableContextSummarization !== false))}
        />
        
        {config.enableContextSummarization !== false && (
          <div className="grid gap-3 sm:grid-cols-2 animate-in slide-in-from-top-1 duration-150">
            {/* Summarization Threshold */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-[var(--color-text-muted)]">--summarize-after</label>
                <span className="text-[10px] text-[var(--color-accent-primary)]">{config.summarizationThreshold ?? 100} msgs</span>
              </div>
              <input
                type="range"
                min={20}
                max={500}
                step={10}
                className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer"
                value={config.summarizationThreshold ?? 100}
                onChange={(e) => onChange('summarizationThreshold', Number(e.target.value))}
              />
              <div className="flex justify-between text-[9px] text-[var(--color-text-dim)]">
                <span>20</span>
                <span>250</span>
                <span>500</span>
              </div>
            </div>
            
            {/* Keep Recent Messages */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-[var(--color-text-muted)]">--keep-recent</label>
                <span className="text-[10px] text-[var(--color-accent-primary)]">{config.keepRecentMessages ?? 40} msgs</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer"
                value={config.keepRecentMessages ?? 40}
                onChange={(e) => onChange('keepRecentMessages', Number(e.target.value))}
              />
              <div className="flex justify-between text-[9px] text-[var(--color-text-dim)]">
                <span>10</span>
                <span>55</span>
                <span>100</span>
              </div>
            </div>
          </div>
        )}
        
        <p className="text-[9px] text-[var(--color-text-dim)]">
          # summarization prevents context overflow in long sessions
        </p>
      </div>
    </section>
  );
};
