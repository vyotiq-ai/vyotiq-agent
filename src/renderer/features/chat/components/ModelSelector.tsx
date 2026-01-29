/**
 * Model Selector Component
 * 
 * Modal-based model selection with provider grouping, search, and filtering.
 * Integrates OpenRouter filters for advanced model discovery.
 */
import React, { useState, memo, useCallback, useEffect, useMemo } from 'react';
import { ChevronDown, RefreshCw, Search, X, AlertTriangle } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { fetchProviderModels, fetchRawOpenRouterModels, apiModelToModelInfo } from '../../../utils/models';
import { ProviderIcon } from '../../../components/ui/ProviderIcons';
import { Modal } from '../../../components/ui/Modal';
import { OpenRouterFilters } from '../../../components/OpenRouterFilters';
import type { LLMProviderName } from '../../../../shared/types';
import type { OpenRouterApiModel } from '../../../utils/openrouterFilters';
import { 
  PROVIDERS, 
  PROVIDER_ORDER, 
  getModelById,
  getDefaultModel,
  formatContextWindow,
  type ModelInfo 
} from '../../../../shared/providers';
import { 
  ModelCard, 
  ProviderTab, 
  tierIcons, 
  tierLabels, 
  tierColors,
  type ProviderConfig 
} from './ModelSelectorModal';

interface ModelSelectorProps {
  currentProvider: LLMProviderName | 'auto';
  currentModel?: string;
  onSelect: (provider: LLMProviderName | 'auto', modelId?: string) => void;
  disabled?: boolean;
  disabledReason?: string;
  availableProviders?: LLMProviderName[];
  providersCooldown?: Record<string, { inCooldown: boolean; remainingMs: number; reason: string } | null>;
}

const providers: ProviderConfig[] = [
  { 
    id: 'auto', 
    label: 'Auto', 
    shortLabel: 'auto',
    color: 'text-[var(--color-accent-primary)]',
    description: 'Smart model routing'
  },
  ...PROVIDER_ORDER.map((id): ProviderConfig => {
    const info = PROVIDERS[id];
    return {
      id,
      label: info.name,
      shortLabel: info.shortName.toLowerCase(),
      color: info.color,
      description: info.description,
    };
  }),
];

export const ModelSelectorComponent: React.FC<ModelSelectorProps> = ({ 
  currentProvider, 
  currentModel,
  onSelect, 
  disabled,
  disabledReason,
  availableProviders = [],
  providersCooldown = {}
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<LLMProviderName | 'auto'>(currentProvider);
  const [providerModels, setProviderModels] = useState<Map<LLMProviderName, ModelInfo[]>>(new Map());
  const [loadingProvider, setLoadingProvider] = useState<LLMProviderName | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // OpenRouter specific state
  const [rawOpenRouterModels, setRawOpenRouterModels] = useState<OpenRouterApiModel[]>([]);
  const [filteredOpenRouterModels, setFilteredOpenRouterModels] = useState<OpenRouterApiModel[]>([]);
  
  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedTab(currentProvider);
      setSearchQuery('');
    }
  }, [isOpen, currentProvider]);
  
  // Fetch models when tab changes
  useEffect(() => {
    if (!isOpen || selectedTab === 'auto') return;
    
    if (selectedTab === 'openrouter') {
      // Fetch raw OpenRouter models for filtering
      if (rawOpenRouterModels.length === 0) {
        setLoadingProvider('openrouter');
        fetchRawOpenRouterModels().then(models => {
          setRawOpenRouterModels(models);
          setLoadingProvider(null);
        });
      }
    } else if (!providerModels.has(selectedTab)) {
      setLoadingProvider(selectedTab);
      fetchProviderModels(selectedTab).then(models => {
        setProviderModels(prev => new Map(prev).set(selectedTab, models));
        setLoadingProvider(null);
      });
    }
  }, [isOpen, selectedTab, providerModels, rawOpenRouterModels.length]);
  
  const autoResolvedProvider = availableProviders.length > 0 ? availableProviders[0] : undefined;
  const autoResolvedModel = autoResolvedProvider ? getDefaultModel(autoResolvedProvider) : undefined;
  
  const activeProvider = providers.find((p) => p.id === currentProvider) ?? providers[0];
  
  // Get display models based on provider
  const displayModels = useMemo(() => {
    if (selectedTab === 'auto') return [];
    
    if (selectedTab === 'openrouter') {
      // Convert filtered OpenRouter models to ModelInfo
      return filteredOpenRouterModels.slice(0, 100).map(m => apiModelToModelInfo(m, 'openrouter'));
    }
    
    // Other providers - apply search filter
    const models = providerModels.get(selectedTab) || [];
    if (!searchQuery.trim()) return models;
    const query = searchQuery.toLowerCase();
    return models.filter(m => 
      m.id.toLowerCase().includes(query) || 
      m.name.toLowerCase().includes(query)
    );
  }, [selectedTab, providerModels, filteredOpenRouterModels, searchQuery]);
  
  // Group models by tier
  const modelsByTier = useMemo(() => {
    const grouped: Record<ModelInfo['tier'], ModelInfo[]> = {
      flagship: [], balanced: [], fast: [], legacy: []
    };
    displayModels.forEach(m => grouped[m.tier].push(m));
    return grouped;
  }, [displayModels]);

  const handleSelectModel = useCallback((provider: LLMProviderName | 'auto', modelId?: string) => {
    onSelect(provider, modelId);
    setIsOpen(false);
  }, [onSelect]);

  const handleRefresh = useCallback(() => {
    if (selectedTab === 'openrouter') {
      setRawOpenRouterModels([]);
    } else if (selectedTab !== 'auto') {
      setProviderModels(prev => {
        const next = new Map(prev);
        next.delete(selectedTab);
        return next;
      });
    }
  }, [selectedTab]);

  // Build display text
  let displayText: string;
  let tooltipText: string;
  
  let selectedModelInfo: ModelInfo | null = null;
  if (currentModel && currentProvider !== 'auto') {
    const fetchedModels = providerModels.get(currentProvider);
    selectedModelInfo = fetchedModels?.find(m => m.id === currentModel) || getModelById(currentModel) || null;
  }
  
  if (currentProvider === 'auto') {
    if (autoResolvedModel) {
      displayText = `auto → ${autoResolvedModel.name}`;
      tooltipText = `Auto mode: Will use ${PROVIDERS[autoResolvedProvider!].name} - ${autoResolvedModel.name}`;
    } else if (availableProviders.length === 0) {
      displayText = 'auto (no providers)';
      tooltipText = 'Auto mode: No providers configured. Add API keys in Settings.';
    } else {
      displayText = 'auto';
      tooltipText = 'Auto mode: Smart model routing';
    }
  } else if (selectedModelInfo) {
    displayText = `${activeProvider.shortLabel}/${selectedModelInfo.name}`;
    tooltipText = `${activeProvider.label} - ${selectedModelInfo.name} (${formatContextWindow(selectedModelInfo.contextWindow)} context)`;
  } else {
    displayText = activeProvider.shortLabel;
    tooltipText = activeProvider.label;
  }

  const isOpenRouter = selectedTab === 'openrouter';

  return (
    <>
      {/* Trigger Button */}
      <button
        type="button"
        className={cn(
          "flex items-center gap-1 text-[10px] font-mono transition-colors whitespace-nowrap",
          "text-[var(--color-text-placeholder)] hover:text-[var(--color-text-secondary)]",
          disabled && "opacity-50 cursor-not-allowed pointer-events-none",
          'rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
        )}
        onClick={() => setIsOpen(true)}
        disabled={disabled}
        title={disabled ? disabledReason ?? tooltipText : tooltipText}
      >
        <span className="text-[var(--color-accent-secondary)]">model=</span>
        <span className="text-[var(--color-text-secondary)]">{displayText}</span>
        <ChevronDown size={10} className="text-[var(--color-text-placeholder)]" />
      </button>

      {/* Model Selection Modal */}
      <Modal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Select Model"
        description="Choose a provider and model for this session"
      >
        {/* Provider Tabs */}
        <div className="flex items-center gap-0.5 border-b border-[var(--color-border-subtle)] overflow-x-auto scrollbar-thin mb-4">
          {providers.map(provider => {
            const isAvailable = provider.id === 'auto' || availableProviders.includes(provider.id as LLMProviderName);
            const models = provider.id === 'openrouter' 
              ? rawOpenRouterModels 
              : provider.id !== 'auto' 
                ? (providerModels.get(provider.id as LLMProviderName) || []) 
                : [];
            const cooldownInfo = provider.id !== 'auto' ? providersCooldown[provider.id] : null;
            return (
              <ProviderTab
                key={provider.id}
                provider={provider}
                isSelected={selectedTab === provider.id}
                isAvailable={isAvailable}
                modelCount={models.length}
                onClick={() => setSelectedTab(provider.id)}
                cooldownInfo={cooldownInfo}
              />
            );
          })}
        </div>

        {/* Cooldown Warning Banner */}
        {selectedTab !== 'auto' && providersCooldown[selectedTab]?.inCooldown && (
          <div className="mb-4 p-3 border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 rounded">
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="text-[var(--color-warning)] flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-mono text-[var(--color-warning)]">
                  Provider temporarily rate-limited
                </p>
                <p className="text-[9px] text-[var(--color-text-muted)] mt-1">
                  {providersCooldown[selectedTab]!.reason.split('\n')[0]}
                </p>
                <p className="text-[9px] text-[var(--color-text-dim)] mt-1">
                  Cooldown expires in ~{Math.ceil(providersCooldown[selectedTab]!.remainingMs / 1000)}s. 
                  You can still select this provider, but requests will use a fallback until cooldown ends.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Auto Mode Content */}
        {selectedTab === 'auto' && (
          <div className="space-y-4">
            <div className="p-4 border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]">
              <div className="flex items-center gap-2 mb-2">
                <ProviderIcon provider="auto" size={16} className="text-[var(--color-accent-primary)]" />
                <span className="text-[11px] text-[var(--color-text-primary)]">Auto Mode</span>
              </div>
              <p className="text-[10px] text-[var(--color-text-dim)]">
                Automatically selects the best available model based on your configured providers.
              </p>
              {autoResolvedModel && (
                <p className="text-[10px] text-[var(--color-accent-primary)] mt-2">
                  Currently resolves to: {PROVIDERS[autoResolvedProvider!].name} - {autoResolvedModel.name}
                </p>
              )}
              {availableProviders.length === 0 && (
                <p className="text-[10px] text-[var(--color-warning)] mt-2">
                  No providers configured. Add API keys in Settings.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleSelectModel('auto')}
              className={cn(
                "w-full py-2 text-[10px] font-mono border transition-colors",
                currentProvider === 'auto'
                  ? "border-[var(--color-accent-primary)]/40 bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]"
                  : "border-[var(--color-border-subtle)] hover:border-[var(--color-accent-primary)]/30 text-[var(--color-text-secondary)]"
              )}
            >
              {currentProvider === 'auto' ? '[OK] Auto Mode Selected' : 'Select Auto Mode'}
            </button>
          </div>
        )}

        {/* OpenRouter with Filters */}
        {isOpenRouter && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-[var(--color-text-dim)]">
                # OpenRouter aggregates models from multiple providers
              </span>
              <button
                onClick={handleRefresh}
                disabled={loadingProvider === 'openrouter'}
                className={cn(
                  "p-1 text-[var(--color-text-dim)] hover:text-[var(--color-accent-primary)] transition-colors",
                  loadingProvider === 'openrouter' && "animate-spin"
                )}
                title="Refresh models"
              >
                <RefreshCw size={12} />
              </button>
            </div>
            
            {loadingProvider === 'openrouter' ? (
              <div className="flex items-center justify-center py-8 text-[10px] text-[var(--color-text-dim)]">
                <RefreshCw size={14} className="animate-spin mr-2" />
                Loading models...
              </div>
            ) : (
              <>
                <OpenRouterFilters
                  models={rawOpenRouterModels}
                  onFilteredModels={setFilteredOpenRouterModels}
                  compact
                />
                
                {/* Models Grid */}
                {displayModels.length === 0 ? (
                  <div className="py-8 text-center text-[10px] text-[var(--color-text-dim)]">
                    No models match your filters
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)]">
                    {(['flagship', 'balanced', 'fast', 'legacy'] as const).map(tier => {
                      const models = modelsByTier[tier];
                      if (models.length === 0) return null;
                      const TierIcon = tierIcons[tier];
                      return (
                        <div key={tier}>
                          <div className="flex items-center gap-2 mb-2">
                            <TierIcon size={10} className={tierColors[tier]} />
                            <span className={cn("text-[9px] uppercase", tierColors[tier])}>
                              {tierLabels[tier]} ({models.length})
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {models.map(model => (
                              <ModelCard
                                key={model.id}
                                model={model}
                                isSelected={currentProvider === 'openrouter' && currentModel === model.id}
                                onSelect={() => handleSelectModel('openrouter', model.id)}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Other Providers Content */}
        {selectedTab !== 'auto' && !isOpenRouter && (
          <div className="space-y-3">
            {/* Search and Refresh */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
                <input
                  type="text"
                  placeholder="Search models..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] pl-8 pr-8 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30 placeholder:text-[var(--color-text-placeholder)]"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)]"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <button
                onClick={handleRefresh}
                disabled={loadingProvider === selectedTab}
                className={cn(
                  "p-1.5 border border-[var(--color-border-subtle)] text-[var(--color-text-dim)] hover:text-[var(--color-accent-primary)] transition-colors",
                  loadingProvider === selectedTab && "animate-spin"
                )}
                title="Refresh models"
              >
                <RefreshCw size={12} />
              </button>
            </div>

            {/* Models Grid */}
            {loadingProvider === selectedTab ? (
              <div className="flex items-center justify-center py-8 text-[10px] text-[var(--color-text-dim)]">
                <RefreshCw size={14} className="animate-spin mr-2" />
                Loading models...
              </div>
            ) : displayModels.length === 0 ? (
              <div className="py-8 text-center text-[10px] text-[var(--color-text-dim)]">
                {searchQuery ? 'No models match your search' : 'No tool-capable models found'}
              </div>
            ) : (
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)]">
                {(['flagship', 'balanced', 'fast', 'legacy'] as const).map(tier => {
                  const models = modelsByTier[tier];
                  if (models.length === 0) return null;
                  const TierIcon = tierIcons[tier];
                  return (
                    <div key={tier}>
                      <div className="flex items-center gap-2 mb-2">
                        <TierIcon size={10} className={tierColors[tier]} />
                        <span className={cn("text-[9px] uppercase", tierColors[tier])}>
                          {tierLabels[tier]} ({models.length})
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {models.map(model => (
                          <ModelCard
                            key={model.id}
                            model={model}
                            isSelected={currentProvider === selectedTab && currentModel === model.id}
                            onSelect={() => handleSelectModel(selectedTab, model.id)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
};

export const ModelSelector = memo(ModelSelectorComponent);
