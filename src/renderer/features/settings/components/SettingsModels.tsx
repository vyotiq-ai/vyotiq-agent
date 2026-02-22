/**
 * Settings Models Component
 * 
 * Model selection for each configured provider.
 * Uses dynamic API fetching with caching.
 */
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import type { AgentSettings, LLMProviderName } from '../../../../shared/types';
import { 
  PROVIDERS, 
  PROVIDER_ORDER, 
  formatCost, 
  formatContextWindow,
  type ModelInfo,
} from '../../../../shared/providers';
import { cn } from '../../../utils/cn';
import { fetchProviderModels, fetchRawOpenRouterModels, apiModelToModelInfo } from '../../../utils/models';
import type { OpenRouterApiModel } from '../../../utils/openrouterFilters';
import { OpenRouterFilters } from '../../../components/OpenRouterFilters';
import { SettingsSection } from '../primitives';

interface SettingsModelsProps {
  providerSettings: AgentSettings['providerSettings'];
  apiKeys: AgentSettings['apiKeys'];
  onChange: (provider: LLMProviderName, modelId: string) => void;
}

interface ModelCardProps {
  model: ModelInfo;
  isSelected: boolean;
  onSelect: () => void;
}

const tierConfig = {
  flagship: { label: 'PRO', color: 'text-[var(--color-warning)]' },
  balanced: { label: 'BAL', color: 'text-[var(--color-info)]' },
  fast: { label: 'FAST', color: 'text-[var(--color-accent-primary)]' },
  legacy: { label: 'OLD', color: 'text-[var(--color-text-muted)]' },
};

const ModelCard: React.FC<ModelCardProps> = ({ model, isSelected, onSelect }) => {
  const tier = tierConfig[model.tier];

  return (
    <button
      className={cn(
        "w-full p-2 border text-left transition-colors duration-100 font-mono",
        isSelected 
          ? "border-[var(--color-accent-primary)]/30 bg-[var(--color-accent-primary)]/5" 
          : "border-[var(--color-border-subtle)] bg-transparent hover:border-[var(--color-border-default)] hover:bg-[var(--color-surface-2)]/30",
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("text-[10px]", isSelected ? "text-[var(--color-accent-primary)]" : "text-[var(--color-text-secondary)]")}>
              {isSelected ? '>' : ' '}
            </span>
            <span className={cn("text-[10px]", isSelected ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]")}>
              {model.name}
            </span>
            <span className={cn("text-[9px]", tier.color)}>
              [{tier.label}]
            </span>
            {model.isDefault && (
              <span className="text-[9px] text-[var(--color-accent-secondary)]">[DEFAULT]</span>
            )}
          </div>
          <div className="ml-4 text-[9px] text-[var(--color-text-dim)] truncate">{model.id}</div>
        </div>
        {isSelected && (
          <span className="text-[var(--color-accent-primary)] text-[9px]">[OK]</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-1 ml-4 text-[9px] text-[var(--color-text-dim)]">
        <span>ctx={formatContextWindow(model.contextWindow)}</span>
        <span>in={formatCost(model.inputCostPer1M)}</span>
        <span>out={formatCost(model.outputCostPer1M)}</span>
        {model.supportsVision && <span className="text-[var(--color-accent-secondary)]">+vision</span>}
        {model.supportsTools && <span className="text-[var(--color-info)]">+tools</span>}
      </div>
    </button>
  );
};

interface DynamicModelSectionProps {
  providerId: LLMProviderName;
  selectedModelId: string;
  isConfigured: boolean;
  onChange: (modelId: string) => void;
}

const DynamicModelSection: React.FC<DynamicModelSectionProps> = ({
  providerId,
  selectedModelId,
  isConfigured,
  onChange,
}) => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const provider = PROVIDERS[providerId];
  
  const loadModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fetchedModels = await fetchProviderModels(providerId);
      setModels(fetchedModels);
      if (fetchedModels.length === 0) setError('No tool-capable models found');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch models');
    } finally {
      setLoading(false);
    }
  }, [providerId]);
  
  useEffect(() => {
    if (isConfigured && models.length === 0 && !loading && !error) loadModels();
  }, [isConfigured, models.length, loading, error, loadModels]);
  
  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return models.slice(0, 50);
    const query = searchQuery.toLowerCase();
    return models.filter(m => 
      m.id.toLowerCase().includes(query) || m.name.toLowerCase().includes(query)
    ).slice(0, 50);
  }, [models, searchQuery]);
  
  const modelsByTier = useMemo(() => {
    const grouped: Record<ModelInfo['tier'], ModelInfo[]> = { flagship: [], balanced: [], fast: [], legacy: [] };
    filteredModels.forEach(model => grouped[model.tier].push(model));
    return grouped;
  }, [filteredModels]);
  
  if (!isConfigured) {
    return (
      <div className="p-2.5 border border-[var(--color-border-subtle)]/50 bg-[var(--color-surface-editor)]">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[var(--color-text-dim)] text-[10px]">#</span>
          <span className={cn("text-[10px]", provider.color)}>{provider.shortName.toLowerCase()}</span>
          <span className="text-[9px] text-[var(--color-text-placeholder)]">[NOT CONFIGURED]</span>
        </div>
        <p className="text-[9px] text-[var(--color-text-dim)] ml-4"># Add API key in --providers section first</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[var(--color-text-dim)] text-[10px]">#</span>
        <span className={cn("text-[10px]", provider.color)}>{provider.shortName.toLowerCase()}</span>
        <span className="text-[9px] text-[var(--color-text-dim)]">({models.length} tool-capable models)</span>
        <button
          onClick={loadModels}
          disabled={loading}
          className={cn(
            "ml-auto p-1 text-[var(--color-text-dim)] hover:text-[var(--color-accent-primary)] transition-colors",
            loading && "animate-spin",
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
          )}
          title="Refresh models"
        >
          <RefreshCw size={10} />
        </button>
      </div>
      
      {error && <p className="text-[9px] text-[var(--color-error)] ml-4"># Error: {error}</p>}
      
      {models.length > 10 && (
        <div className="relative ml-2">
          <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
          <input
            type="text"
            placeholder="Search models..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] pl-6 pr-2 py-1 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30 placeholder:text-[var(--color-text-placeholder)]"
          />
        </div>
      )}
      
      {selectedModelId ? (
        <p className="text-[9px] text-[var(--color-accent-primary)] ml-4">selected={selectedModelId}</p>
      ) : (
        <p className="text-[9px] text-[var(--color-warning)] ml-4"># No default model selected - click a model below</p>
      )}
      
      <div className="space-y-0.5 ml-2 border-l border-[var(--color-border-subtle)] pl-2 max-h-64 overflow-y-auto">
        {loading ? (
          <p className="text-[9px] text-[var(--color-text-dim)] p-2"># Loading models...</p>
        ) : filteredModels.length === 0 ? (
          <p className="text-[9px] text-[var(--color-text-dim)] p-2"># No models found</p>
        ) : (
          (['flagship', 'balanced', 'fast', 'legacy'] as const).map(tier => 
            modelsByTier[tier].map(model => (
              <ModelCard key={model.id} model={model} isSelected={selectedModelId === model.id} onSelect={() => onChange(model.id)} />
            ))
          )
        )}
      </div>
    </div>
  );
};

interface OpenRouterModelSectionProps {
  selectedModelId: string;
  isConfigured: boolean;
  onChange: (modelId: string) => void;
}

const OpenRouterModelSection: React.FC<OpenRouterModelSectionProps> = ({ selectedModelId, isConfigured, onChange }) => {
  const [rawModels, setRawModels] = useState<OpenRouterApiModel[]>([]);
  const [filteredModels, setFilteredModels] = useState<OpenRouterApiModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const provider = PROVIDERS.openrouter;
  
  const loadModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const models = await fetchRawOpenRouterModels();
      setRawModels(models);
      if (models.length === 0) setError('No models found');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch models');
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    if (isConfigured && rawModels.length === 0 && !loading && !error) loadModels();
  }, [isConfigured, rawModels.length, loading, error, loadModels]);

  const displayModels = useMemo(() => filteredModels.slice(0, 100).map(m => apiModelToModelInfo(m, 'openrouter')), [filteredModels]);
  const modelsByTier = useMemo(() => {
    const grouped: Record<ModelInfo['tier'], ModelInfo[]> = { flagship: [], balanced: [], fast: [], legacy: [] };
    displayModels.forEach(model => grouped[model.tier].push(model));
    return grouped;
  }, [displayModels]);
  
  if (!isConfigured) {
    return (
      <div className="p-2.5 border border-[var(--color-border-subtle)]/50 bg-[var(--color-surface-editor)]">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[var(--color-text-dim)] text-[10px]">#</span>
          <span className={cn("text-[10px]", provider.color)}>{provider.shortName.toLowerCase()}</span>
          <span className="text-[9px] text-[var(--color-text-placeholder)]">[NOT CONFIGURED]</span>
        </div>
        <p className="text-[9px] text-[var(--color-text-dim)] ml-4"># Add API key in --providers section first</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[var(--color-text-dim)] text-[10px]">#</span>
        <span className={cn("text-[10px]", provider.color)}>{provider.shortName.toLowerCase()}</span>
        <span className="text-[9px] text-[var(--color-text-dim)]">({rawModels.length} models, use filters below)</span>
        <button
          onClick={loadModels}
          disabled={loading}
          className={cn(
            "ml-auto p-1 text-[var(--color-text-dim)] hover:text-[var(--color-accent-primary)] transition-colors",
            loading && "animate-spin",
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
          )}
          title="Refresh models"
        >
          <RefreshCw size={10} />
        </button>
      </div>
      
      {error && <p className="text-[9px] text-[var(--color-error)] ml-4"># Error: {error}</p>}
      {rawModels.length > 0 && <div className="ml-2"><OpenRouterFilters models={rawModels} onFilteredModels={setFilteredModels} /></div>}
      
      {selectedModelId ? (
        <p className="text-[9px] text-[var(--color-accent-primary)] ml-4">selected={selectedModelId}</p>
      ) : (
        <p className="text-[9px] text-[var(--color-warning)] ml-4"># No default model selected - use filters and click a model</p>
      )}
      
      <div className="space-y-0.5 ml-2 border-l border-[var(--color-border-subtle)] pl-2 max-h-64 overflow-y-auto">
        {loading ? (
          <p className="text-[9px] text-[var(--color-text-dim)] p-2"># Loading models...</p>
        ) : displayModels.length === 0 ? (
          <p className="text-[9px] text-[var(--color-text-dim)] p-2"># No models match filters</p>
        ) : (
          (['flagship', 'balanced', 'fast', 'legacy'] as const).map(tier => 
            modelsByTier[tier].map(model => (
              <ModelCard key={model.id} model={model} isSelected={selectedModelId === model.id} onSelect={() => onChange(model.id)} />
            ))
          )
        )}
      </div>
    </div>
  );
};

export const SettingsModels: React.FC<SettingsModelsProps> = ({ providerSettings, apiKeys, onChange }) => {
  return (
    <SettingsSection title="models" description="Select default model per provider (required for each configured provider)">
      <p className="text-[9px] text-[var(--color-text-placeholder)]"># Models are fetched dynamically from provider APIs (5min cache)</p>
      
      <div className="flex flex-wrap gap-3 pt-2 border-t border-[var(--color-border-subtle)]">
        {Object.entries(tierConfig).map(([key, config]) => (
          <span key={key} className={cn("text-[9px]", config.color)}>[{config.label}]</span>
        ))}
      </div>
      
      <div className="space-y-4">
        {PROVIDER_ORDER.map((providerId) => {
          const settings = providerSettings[providerId];
          const apiKey = apiKeys[providerId];
          const isConfigured = !!(apiKey && apiKey.trim().length > 0);
          
          if (providerId === 'openrouter') {
            return <OpenRouterModelSection key={providerId} selectedModelId={settings?.model?.modelId ?? ''} isConfigured={isConfigured} onChange={(modelId) => onChange(providerId, modelId)} />;
          }
          
          return <DynamicModelSection key={providerId} providerId={providerId} selectedModelId={settings?.model?.modelId ?? ''} isConfigured={isConfigured} onChange={(modelId) => onChange(providerId, modelId)} />;
        })}
      </div>
    </SettingsSection>
  );
};

export default SettingsModels;
