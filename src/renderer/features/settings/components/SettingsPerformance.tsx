import React, { useState, useEffect, useCallback } from 'react';
import { Database, Zap, HardDrive, RefreshCw, Trash2, Activity, Layers } from 'lucide-react';
import { Toggle } from '../../../components/ui/Toggle';
import { Button } from '../../../components/ui/Button';
import type { CacheSettings, LLMProviderName } from '../../../../shared/types';
import { createLogger } from '../../../utils/logger';
import { cn } from '../../../utils/cn';

const logger = createLogger('SettingsPerformance');

interface SettingsPerformanceProps {
  settings: CacheSettings;
  onChange: (field: keyof CacheSettings, value: CacheSettings[keyof CacheSettings]) => void;
}

// Format bytes for display
const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${bytes} B`;
};

// Format milliseconds as a human-readable duration
const formatDuration = (ms: number): string => {
  if (ms >= 60000) {
    return `${(ms / 60000).toFixed(0)} min`;
  }
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(0)} sec`;
  }
  return `${ms} ms`;
};

// Format cost for display
const formatCost = (cost: number): string => {
  if (cost >= 1) {
    return `$${cost.toFixed(2)}`;
  }
  if (cost >= 0.01) {
    return `$${cost.toFixed(3)}`;
  }
  if (cost > 0) {
    return `$${cost.toFixed(4)}`;
  }
  return '$0.00';
};

// Cache statistics type
interface CacheStats {
  prompt: {
    totalHits: number;
    totalMisses: number;
    hitRate: number;
    tokensSaved: number;
    costSaved: number;
    creations: number;
    byProvider: Record<string, { hits: number; misses: number; tokensSaved: number; costSaved: number }>;
  };
  toolResult: {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: number;
    byTool: Record<string, number>;
  };
  context: {
    entries: number;
    sizeBytes: number;
    hits: number;
    misses: number;
    hitRate: number;
    evictions: number;
    expirations: number;
  };
}

const PROVIDER_NAMES: Record<LLMProviderName, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
  xai: 'xAI',
  mistral: 'Mistral',
  glm: 'GLM (Z.AI)',
};

const CACHE_STRATEGIES: Array<{ value: CacheSettings['promptCacheStrategy']; label: string; description: string }> = [
  { value: 'default', label: 'Default', description: 'Balanced caching for most use cases' },
  { value: 'aggressive', label: 'Aggressive', description: 'Maximize cache hits for cost savings' },
  { value: 'conservative', label: 'Conservative', description: 'Minimal caching, fresher responses' },
];

export const SettingsPerformance: React.FC<SettingsPerformanceProps> = ({ settings, onChange }) => {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isClearing, setIsClearing] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Fetch cache statistics
  const fetchStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const cacheStats = await window.vyotiq.cache.getStats();
      setStats(cacheStats);
      setLastRefresh(new Date());
    } catch (error) {
      logger.error('Failed to fetch cache stats', { error });
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  // Load stats on mount
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Handle clearing cache
  const handleClearCache = async (type: 'prompt' | 'tool' | 'context' | 'all') => {
    setIsClearing(type);
    try {
      await window.vyotiq.cache.clear(type);
      await fetchStats();
    } catch (error) {
      logger.error('Failed to clear cache', { error });
    } finally {
      setIsClearing(null);
    }
  };

  // Handle per-provider prompt cache toggle
  const handleProviderPromptCacheToggle = (provider: LLMProviderName) => {
    const currentSettings = settings.enablePromptCache ?? {};
    const currentValue = currentSettings[provider] ?? true;
    onChange('enablePromptCache', { ...currentSettings, [provider]: !currentValue });
  };

  // Handle tool cache setting changes
  const handleToolCacheChange = (field: keyof CacheSettings['toolCache'], value: boolean | number) => {
    onChange('toolCache', { ...settings.toolCache, [field]: value });
  };

  // Handle context cache setting changes  
  const handleContextCacheChange = (field: keyof CacheSettings['contextCache'], value: boolean | number) => {
    onChange('contextCache', { ...settings.contextCache, [field]: value });
  };

  return (
    <section className="space-y-4 font-mono">
      <header>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[var(--color-accent-primary)] text-[11px]">#</span>
          <h3 className="text-[11px] text-[var(--color-text-primary)]">performance</h3>
        </div>
        <p className="text-[10px] text-[var(--color-text-dim)]">
          # Configure caching and performance optimizations
        </p>
      </header>

      {/* Cache Statistics Overview */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1 flex-1">
            <Activity size={11} className="text-[var(--color-success)]" />
            cache statistics
          </div>
          <button
            onClick={fetchStats}
            disabled={isLoadingStats}
            className={cn(
              "flex items-center gap-1 px-2 py-1 text-[9px] text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)] transition-colors disabled:opacity-50",
              'rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
            )}
            title="Refresh statistics"
          >
            <RefreshCw size={10} className={isLoadingStats ? 'animate-spin' : ''} />
            refresh
          </button>
        </div>

        {lastRefresh && (
          <p className="text-[9px] text-[var(--color-text-dim)]">
            # last updated: {lastRefresh.toLocaleTimeString()}
          </p>
        )}

        {stats ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {/* Prompt Cache Stats */}
            <div className="bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] p-3 space-y-2">
              <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)]">
                <Zap size={11} className="text-[var(--color-warning)]" />
                Prompt Cache
              </div>
              <div className="space-y-1 text-[9px]">
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">hit rate</span>
                  <span className="text-[var(--color-accent-primary)]">{(stats.prompt.hitRate * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">hits / misses</span>
                  <span className="text-[var(--color-text-secondary)]">{stats.prompt.totalHits} / {stats.prompt.totalMisses}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">tokens saved</span>
                  <span className="text-[var(--color-success)]">{stats.prompt.tokensSaved.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">cost saved</span>
                  <span className="text-[var(--color-success)]">{formatCost(stats.prompt.costSaved)}</span>
                </div>
              </div>
            </div>

            {/* Tool Result Cache Stats */}
            <div className="bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] p-3 space-y-2">
              <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)]">
                <Database size={11} className="text-[var(--color-info)]" />
                Tool Cache
              </div>
              <div className="space-y-1 text-[9px]">
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">hit rate</span>
                  <span className="text-[var(--color-accent-primary)]">{stats.toolResult.hitRate.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">hits / misses</span>
                  <span className="text-[var(--color-text-secondary)]">{stats.toolResult.hits} / {stats.toolResult.misses}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">entries</span>
                  <span className="text-[var(--color-text-secondary)]">{stats.toolResult.size} / {stats.toolResult.maxSize}</span>
                </div>
              </div>
            </div>

            {/* Context Cache Stats */}
            <div className="bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] p-3 space-y-2">
              <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)]">
                <HardDrive size={11} className="text-[var(--color-accent-secondary)]" />
                Context Cache
              </div>
              <div className="space-y-1 text-[9px]">
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">hit rate</span>
                  <span className="text-[var(--color-accent-primary)]">{(stats.context.hitRate * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">entries</span>
                  <span className="text-[var(--color-text-secondary)]">{stats.context.entries}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">size</span>
                  <span className="text-[var(--color-text-secondary)]">{formatBytes(stats.context.sizeBytes)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">evictions</span>
                  <span className="text-[var(--color-text-dim)]">{stats.context.evictions}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-[10px] text-[var(--color-text-muted)] py-4 text-center">
            {isLoadingStats ? '# loading statistics...' : '# no statistics available'}
          </div>
        )}
      </div>

      {/* Cache Strategy */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Layers size={11} className="text-[var(--color-info)]" />
          prompt cache strategy
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {CACHE_STRATEGIES.map((strategy) => (
            <button
              key={strategy.value}
              onClick={() => onChange('promptCacheStrategy', strategy.value)}
              className={`p-3 text-left border transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40 ${
                settings.promptCacheStrategy === strategy.value
                  ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10'
                  : 'border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] hover:border-[var(--color-border-default)]'
              }`}
            >
              <div className="text-[10px] text-[var(--color-text-secondary)] mb-1">{strategy.label}</div>
              <div className="text-[9px] text-[var(--color-text-dim)]">{strategy.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Tool Cache Settings */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Database size={11} className="text-[var(--color-info)]" />
          tool cache
        </div>

        <div className="space-y-3">
          {/* Enable Tool Cache */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-[10px] text-[var(--color-text-muted)]">--enable-tool-cache</label>
              <p className="text-[9px] text-[var(--color-text-dim)]"># cache read-only tool results (read, ls, grep)</p>
            </div>
            <Toggle
              checked={settings.toolCache.enabled}
              onToggle={() => handleToolCacheChange('enabled', !settings.toolCache.enabled)}
            />
          </div>

          {/* LRU Eviction */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-[10px] text-[var(--color-text-muted)]">--lru-eviction</label>
              <p className="text-[9px] text-[var(--color-text-dim)]"># use LRU eviction when cache is full</p>
            </div>
            <Toggle
              checked={settings.enableLruEviction}
              onToggle={() => onChange('enableLruEviction', !settings.enableLruEviction)}
            />
          </div>

          {/* Tool Cache TTL */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-[var(--color-text-muted)]">--tool-cache-ttl</label>
              <span className="text-[10px] text-[var(--color-accent-primary)]">{formatDuration(settings.toolCache.defaultTtlMs)}</span>
            </div>
            <input
              type="range"
              min={10000}
              max={300000}
              step={10000}
              className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer"
              value={settings.toolCache.defaultTtlMs}
              onChange={(e) => handleToolCacheChange('defaultTtlMs', Number(e.target.value))}
            />
            <div className="flex justify-between text-[9px] text-[var(--color-text-dim)]">
              <span>10s</span>
              <span>2.5min</span>
              <span>5min</span>
            </div>
            <p className="text-[9px] text-[var(--color-text-dim)]"># time before cached tool results expire</p>
          </div>

          {/* Tool Cache Max Entries */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-[var(--color-text-muted)]">--tool-cache-size</label>
              <span className="text-[10px] text-[var(--color-accent-primary)]">{settings.toolCache.maxEntries} entries</span>
            </div>
            <input
              type="range"
              min={50}
              max={500}
              step={25}
              className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer"
              value={settings.toolCache.maxEntries}
              onChange={(e) => handleToolCacheChange('maxEntries', Number(e.target.value))}
            />
            <div className="flex justify-between text-[9px] text-[var(--color-text-dim)]">
              <span>50</span>
              <span>250</span>
              <span>500</span>
            </div>
            <p className="text-[9px] text-[var(--color-text-dim)]"># max entries before eviction</p>
          </div>
        </div>
      </div>

      {/* Context Cache Settings */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <HardDrive size={11} className="text-[var(--color-accent-secondary)]" />
          context cache
        </div>

        <div className="space-y-3">
          {/* Enable Context Cache */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-[10px] text-[var(--color-text-muted)]">--enable-context-cache</label>
              <p className="text-[9px] text-[var(--color-text-dim)]"># cache file content and symbols</p>
            </div>
            <Toggle
              checked={settings.contextCache.enabled}
              onToggle={() => handleContextCacheChange('enabled', !settings.contextCache.enabled)}
            />
          </div>

          {/* Context Cache TTL */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-[var(--color-text-muted)]">--context-cache-ttl</label>
              <span className="text-[10px] text-[var(--color-accent-primary)]">{formatDuration(settings.contextCache.defaultTtlMs)}</span>
            </div>
            <input
              type="range"
              min={60000}
              max={600000}
              step={30000}
              className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer"
              value={settings.contextCache.defaultTtlMs}
              onChange={(e) => handleContextCacheChange('defaultTtlMs', Number(e.target.value))}
            />
            <div className="flex justify-between text-[9px] text-[var(--color-text-dim)]">
              <span>1min</span>
              <span>5min</span>
              <span>10min</span>
            </div>
            <p className="text-[9px] text-[var(--color-text-dim)]"># time before cached file content expires</p>
          </div>

          {/* Context Cache Max Size */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-[var(--color-text-muted)]">--context-cache-size</label>
              <span className="text-[10px] text-[var(--color-accent-primary)]">{settings.contextCache.maxSizeMb} MB</span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer"
              value={settings.contextCache.maxSizeMb}
              onChange={(e) => handleContextCacheChange('maxSizeMb', Number(e.target.value))}
            />
            <div className="flex justify-between text-[9px] text-[var(--color-text-dim)]">
              <span>10 MB</span>
              <span>50 MB</span>
              <span>100 MB</span>
            </div>
            <p className="text-[9px] text-[var(--color-text-dim)]"># max memory for context cache</p>
          </div>
        </div>
      </div>

      {/* Per-Provider Prompt Cache Settings */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Zap size={11} className="text-[var(--color-warning)]" />
          per-provider prompt cache
        </div>

        <p className="text-[9px] text-[var(--color-text-dim)]">
          # enable/disable prompt caching per LLM provider
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(PROVIDER_NAMES) as LLMProviderName[]).map((provider) => (
            <div
              key={provider}
              className="flex items-center justify-between bg-[var(--color-surface-2)] px-3 py-2 border border-[var(--color-border-subtle)]"
            >
              <span className="text-[10px] text-[var(--color-text-secondary)]">{PROVIDER_NAMES[provider]}</span>
              <Toggle
                checked={settings.enablePromptCache?.[provider] ?? true}
                onToggle={() => handleProviderPromptCacheToggle(provider)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Clear Cache Actions */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Trash2 size={11} className="text-[var(--color-error)]" />
          clear cache
        </div>

        <p className="text-[9px] text-[var(--color-text-dim)]">
          # clear cached data to free memory or force fresh fetches
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleClearCache('prompt')}
            disabled={isClearing !== null}
            isLoading={isClearing === 'prompt'}
            className="text-[10px]"
          >
            Clear Prompt Cache
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleClearCache('tool')}
            disabled={isClearing !== null}
            isLoading={isClearing === 'tool'}
            className="text-[10px]"
          >
            Clear Tool Cache
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleClearCache('context')}
            disabled={isClearing !== null}
            isLoading={isClearing === 'context'}
            className="text-[10px]"
          >
            Clear Context Cache
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => handleClearCache('all')}
            disabled={isClearing !== null}
            isLoading={isClearing === 'all'}
            className="text-[10px]"
          >
            Clear All Caches
          </Button>
        </div>
      </div>
    </section>
  );
};
