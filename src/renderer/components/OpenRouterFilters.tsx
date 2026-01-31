/**
 * OpenRouter Model Filters Component
 * 
 * Shared component for filtering OpenRouter models. Used by:
 * - Settings > Models section
 * - Model Selector modal
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { 
  Search, Filter, X, ChevronDown, ChevronUp, 
  DollarSign, Cpu, Eye, Wrench, Sparkles 
} from 'lucide-react';
import { cn } from '../utils/cn';
import {
  type OpenRouterApiModel,
  type OpenRouterFilterCriteria,
  type ModelSeries,
  type ModelCategory,
  type SortField,
  type SortOrder,
  filterOpenRouterModels,
  sortOpenRouterModels,
  getFilterOptions,
} from '../utils/openrouterFilters';

export interface OpenRouterFiltersProps {
  models: OpenRouterApiModel[];
  onFilteredModels: (models: OpenRouterApiModel[]) => void;
  compact?: boolean;
}

const SERIES_LABELS: Record<ModelSeries, string> = {
  openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google',
  'meta-llama': 'Meta', mistralai: 'Mistral', cohere: 'Cohere',
  deepseek: 'DeepSeek', qwen: 'Qwen', microsoft: 'Microsoft',
  nvidia: 'NVIDIA', perplexity: 'Perplexity', 'x-ai': 'xAI',
  amazon: 'Amazon', other: 'Other',
};

const CATEGORY_LABELS: Record<ModelCategory, string> = {
  text: 'Text', multimodal: 'Multi', image: 'Image', audio: 'Audio', video: 'Video',
};

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'context_length', label: 'Context' },
  { value: 'prompt_price', label: 'In $' },
  { value: 'completion_price', label: 'Out $' },
  { value: 'created', label: 'New' },
];

export const OpenRouterFilters: React.FC<OpenRouterFiltersProps> = ({
  models, onFilteredModels, compact = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [criteria, setCriteria] = useState<OpenRouterFilterCriteria>({});
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const filterOptions = useMemo(() => getFilterOptions(models), [models]);

  const filteredModels = useMemo(() => {
    const filtered = filterOpenRouterModels(models, criteria);
    return sortOpenRouterModels(filtered, sortField, sortOrder);
  }, [models, criteria, sortField, sortOrder]);

  const onFilteredModelsRef = React.useRef(onFilteredModels);
  onFilteredModelsRef.current = onFilteredModels;
  
  useEffect(() => {
    onFilteredModelsRef.current(filteredModels);
  }, [filteredModels]);

  const updateCriteria = useCallback((updates: Partial<OpenRouterFilterCriteria>) => {
    setCriteria(prev => ({ ...prev, ...updates }));
  }, []);

  const clearFilters = useCallback(() => setCriteria({}), []);

  const hasActiveFilters = Object.keys(criteria).some(key => {
    const value = criteria[key as keyof OpenRouterFilterCriteria];
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'boolean') return value;
    return value !== undefined && value !== '';
  });

  const toggleArray = <T extends string>(key: keyof OpenRouterFilterCriteria, value: T) => {
    const current = (criteria[key] as T[] | undefined) || [];
    const updated = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
    updateCriteria({ [key]: updated.length > 0 ? updated : undefined });
  };

  return (
    <div className="space-y-2 font-mono">
      {/* Search Row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
          <input
            type="text"
            placeholder="Search models..."
            value={criteria.search || ''}
            onChange={(e) => updateCriteria({ search: e.target.value || undefined })}
            className="w-full bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] pl-6 pr-2 py-1 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30 placeholder:text-[var(--color-text-placeholder)]"
          />
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            "flex items-center gap-1 px-2 py-1 text-[9px] border transition-colors",
            isExpanded || hasActiveFilters
              ? "border-[var(--color-accent-primary)]/30 text-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/5"
              : "border-[var(--color-border-subtle)] text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)]"
          )}
        >
          <Filter size={10} />
          {!compact && 'filters'}
          {hasActiveFilters && <span className="text-[8px]">[*]</span>}
          {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>
      </div>

      {/* Quick Toggles */}
      <div className="flex flex-wrap items-center gap-2">
        <QuickToggle label="tools" icon={<Wrench size={9} />} active={criteria.toolsOnly || false}
          onClick={() => updateCriteria({ toolsOnly: !criteria.toolsOnly || undefined })} />
        <QuickToggle label="vision" icon={<Eye size={9} />} active={criteria.visionOnly || false}
          onClick={() => updateCriteria({ visionOnly: !criteria.visionOnly || undefined })} />
        <QuickToggle label="free" icon={<Sparkles size={9} />} active={criteria.freeOnly || false}
          onClick={() => updateCriteria({ freeOnly: !criteria.freeOnly || undefined })} />
        <div className="flex-1" />
        <select value={sortField} onChange={(e) => setSortField(e.target.value as SortField)}
          className="bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] px-1 py-0.5 text-[9px] outline-none">
          {SORT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        <button onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
          className="px-1 py-0.5 border border-[var(--color-border-subtle)] text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] text-[9px]">
          {sortOrder === 'asc' ? '↑' : '↓'}
        </button>
        <span className="text-[9px] text-[var(--color-text-placeholder)]">{filteredModels.length}/{models.length}</span>
      </div>

      {/* Expanded Filters */}
      {isExpanded && (
        <div className="border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]/50 p-2 space-y-3">
          {hasActiveFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-[9px] text-[var(--color-error)] hover:text-[var(--color-error)]/80">
              <X size={10} />clear
            </button>
          )}
          <FilterSection label="context" icon={<Cpu size={10} />}>
            <div className="flex items-center gap-2 flex-wrap">
              <NumInput placeholder="min" value={criteria.minContextLength} onChange={v => updateCriteria({ minContextLength: v })} />
              <span className="text-[9px] text-[var(--color-text-dim)]">to</span>
              <NumInput placeholder="max" value={criteria.maxContextLength} onChange={v => updateCriteria({ maxContextLength: v })} />
            </div>
          </FilterSection>
          <FilterSection label="max-$/1M" icon={<DollarSign size={10} />}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] text-[var(--color-text-dim)]">in:</span>
              <NumInput placeholder="$" value={criteria.maxPromptPrice} onChange={v => updateCriteria({ maxPromptPrice: v })} step={0.01} width="w-14" />
              <span className="text-[9px] text-[var(--color-text-dim)]">out:</span>
              <NumInput placeholder="$" value={criteria.maxCompletionPrice} onChange={v => updateCriteria({ maxCompletionPrice: v })} step={0.01} width="w-14" />
            </div>
          </FilterSection>
          <FilterSection label="providers">
            <div className="flex flex-wrap gap-1">
              {filterOptions.series.map(s => (
                <ChipToggle key={s} label={SERIES_LABELS[s]} active={(criteria.series || []).includes(s)} onClick={() => toggleArray('series', s)} />
              ))}
            </div>
          </FilterSection>
          <FilterSection label="categories">
            <div className="flex flex-wrap gap-1">
              {(['text', 'multimodal', 'image', 'audio', 'video'] as ModelCategory[]).map(c => (
                <ChipToggle key={c} label={CATEGORY_LABELS[c]} active={(criteria.categories || []).includes(c)} onClick={() => toggleArray('categories', c)} />
              ))}
            </div>
          </FilterSection>
        </div>
      )}
    </div>
  );
};

// Helpers
const FilterSection: React.FC<{ label: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ label, icon, children }) => (
  <div className="space-y-1">
    <div className="flex items-center gap-1 text-[9px] text-[var(--color-text-dim)]">{icon}<span>--{label}</span></div>
    <div className="ml-3">{children}</div>
  </div>
);

const QuickToggle: React.FC<{ label: string; icon: React.ReactNode; active: boolean; onClick: () => void }> = ({ label, icon, active, onClick }) => (
  <button onClick={onClick} className={cn(
    "flex items-center gap-1 px-1.5 py-0.5 text-[9px] border transition-colors",
    active ? "border-[var(--color-accent-primary)]/40 text-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10"
           : "border-[var(--color-border-subtle)] text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)]"
  )}>{icon}{label}</button>
);

const ChipToggle: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button onClick={onClick} className={cn(
    "px-1.5 py-0.5 text-[8px] border transition-colors",
    active ? "border-[var(--color-accent-secondary)]/40 text-[var(--color-accent-secondary)] bg-[var(--color-accent-secondary)]/10"
           : "border-[var(--color-border-subtle)] text-[var(--color-text-placeholder)] hover:text-[var(--color-text-dim)]"
  )}>{label}</button>
);

const NumInput: React.FC<{ placeholder: string; value?: number; onChange: (v?: number) => void; step?: number; width?: string }> = 
  ({ placeholder, value, onChange, step = 1, width = "w-16" }) => (
  <input type="number" step={step} placeholder={placeholder} value={value ?? ''}
    onChange={(e) => onChange(e.target.value ? (step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value)) : undefined)}
    className={cn(width, "bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] px-1.5 py-0.5 text-[9px] outline-none focus-visible:border-[var(--color-accent-primary)]/30")} />
);
