/**
 * Settings Performance Component
 * 
 * Configure caching and performance optimizations.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Database, RefreshCw, Trash2, Plus, X, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { RadioGroup } from '../../../components/ui/RadioGroup';
import type { CacheSettings, LLMProviderName } from '../../../../shared/types';
import { createLogger } from '../../../utils/logger';
import { cn } from '../../../utils/cn';
import { SettingsSection, SettingsGroup, SettingsToggleRow, SettingsSlider } from '../primitives';
import { formatBytes, formatDurationFull, formatCost } from '../utils/formatters';

const logger = createLogger('SettingsPerformance');

interface SettingsPerformanceProps {
  settings: CacheSettings;
  onChange: (field: keyof CacheSettings, value: CacheSettings[keyof CacheSettings]) => void;
}

interface CacheStats {
  promptCache: { hits: number; misses: number; hitRate: number; tokensSaved: number; costSaved: number };
  toolCache: { size: number; maxSize: number; hits: number; misses: number; hitRate: number; evictions: number; expirations: number };
}

const PROVIDER_NAMES: Record<LLMProviderName, string> = {
  anthropic: 'Anthropic', openai: 'OpenAI', deepseek: 'DeepSeek', gemini: 'Gemini',
  openrouter: 'OpenRouter', xai: 'xAI', mistral: 'Mistral', glm: 'GLM (Z.AI)',
};

const CACHE_STRATEGIES = [
  { value: 'default' as const, label: 'Default' },
  { value: 'aggressive' as const, label: 'Aggressive' },
  { value: 'conservative' as const, label: 'Conservative' },
];

export const SettingsPerformance: React.FC<SettingsPerformanceProps> = ({ settings, onChange }) => {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isClearing, setIsClearing] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [showToolTtlsSection, setShowToolTtlsSection] = useState(false);
  const [newToolTtl, setNewToolTtl] = useState({ toolName: '', ttl: 60 });

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

  useEffect(() => { fetchStats(); }, [fetchStats]);

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

  const handleProviderPromptCacheToggle = (provider: LLMProviderName) => {
    const currentSettings = settings.enablePromptCache ?? {};
    const currentValue = currentSettings[provider] ?? true;
    onChange('enablePromptCache', { ...currentSettings, [provider]: !currentValue });
  };

  const handleToolCacheChange = (field: keyof CacheSettings['toolCache'], value: boolean | number) => {
    onChange('toolCache', { ...settings.toolCache, [field]: value });
  };

  const handleContextCacheChange = (field: keyof CacheSettings['contextCache'], value: boolean | number) => {
    onChange('contextCache', { ...settings.contextCache, [field]: value });
  };

  const handleAddToolTtl = () => {
    if (!newToolTtl.toolName.trim()) return;
    const toolName = newToolTtl.toolName.trim();
    const currentTtls = settings.toolCache.toolTtls || {};
    onChange('toolCache', { 
      ...settings.toolCache, 
      toolTtls: { ...currentTtls, [toolName]: newToolTtl.ttl * 1000 } 
    });
    setNewToolTtl({ toolName: '', ttl: 60 });
  };

  const handleRemoveToolTtl = (toolName: string) => {
    const currentTtls = { ...(settings.toolCache.toolTtls || {}) };
    delete currentTtls[toolName];
    onChange('toolCache', { ...settings.toolCache, toolTtls: currentTtls });
  };

  const handleUpdateToolTtl = (toolName: string, ttlMs: number) => {
    const currentTtls = settings.toolCache.toolTtls || {};
    onChange('toolCache', { 
      ...settings.toolCache, 
      toolTtls: { ...currentTtls, [toolName]: ttlMs } 
    });
  };

  return (
    <SettingsSection title="performance" description="Configure caching and performance optimizations">
      {/* Cache Statistics */}
      <SettingsGroup title="cache statistics">
        <div className="flex items-center justify-between mb-2">
          {lastRefresh && <p className="text-[9px] text-[var(--color-text-dim)]"># last updated: {lastRefresh.toLocaleTimeString()}</p>}
          <button
            onClick={fetchStats}
            disabled={isLoadingStats}
            className="flex items-center gap-1 px-2 py-1 text-[9px] text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
            title="Refresh statistics"
          >
            <RefreshCw size={10} className={isLoadingStats ? 'animate-spin' : ''} />
            refresh
          </button>
        </div>

        {stats ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] p-3 space-y-2">
              <div className="text-[10px] text-[var(--color-text-secondary)]"># Prompt Cache</div>
              <div className="space-y-1 text-[9px]">
                <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">hit rate</span><span className="text-[var(--color-accent-primary)]">{(stats.promptCache.hitRate * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">hits / misses</span><span className="text-[var(--color-text-secondary)]">{stats.promptCache.hits} / {stats.promptCache.misses}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">tokens saved</span><span className="text-[var(--color-success)]">{stats.promptCache.tokensSaved.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">cost saved</span><span className="text-[var(--color-success)]">{formatCost(stats.promptCache.costSaved)}</span></div>
              </div>
            </div>
            <div className="bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] p-3 space-y-2">
              <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)]"><Database size={11} /># Tool Cache</div>
              <div className="space-y-1 text-[9px]">
                <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">hit rate</span><span className="text-[var(--color-accent-primary)]">{stats.toolCache.hitRate.toFixed(1)}%</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">hits / misses</span><span className="text-[var(--color-text-secondary)]">{stats.toolCache.hits} / {stats.toolCache.misses}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">entries</span><span className="text-[var(--color-text-secondary)]">{stats.toolCache.size} / {stats.toolCache.maxSize}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">est. memory</span><span className="text-[var(--color-text-secondary)]">{formatBytes(stats.toolCache.size * 2048)}</span></div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-[10px] text-[var(--color-text-muted)] py-4 text-center">{isLoadingStats ? '# loading statistics...' : '# no statistics available'}</div>
        )}
      </SettingsGroup>

      {/* Cache Strategy */}
      <SettingsGroup title="prompt cache strategy">
        <RadioGroup
          name="cacheStrategy"
          options={CACHE_STRATEGIES}
          value={settings.promptCacheStrategy}
          onChange={(value) => onChange('promptCacheStrategy', value as CacheSettings['promptCacheStrategy'])}
          direction="horizontal"
          size="sm"
        />
      </SettingsGroup>

      {/* Tool Cache Settings */}
      <SettingsGroup title="tool cache" icon={<Database size={11} />}>
        <SettingsToggleRow label="enable-tool-cache" description="cache read-only tool results (read, ls, grep)" checked={settings.toolCache.enabled} onToggle={() => handleToolCacheChange('enabled', !settings.toolCache.enabled)} />
        <SettingsToggleRow label="lru-eviction" description="use LRU eviction when cache is full" checked={settings.enableLruEviction} onToggle={() => onChange('enableLruEviction', !settings.enableLruEviction)} />
        <SettingsSlider label="tool-cache-ttl" description="time before cached tool results expire" value={settings.toolCache.defaultTtlMs} onChange={(v) => handleToolCacheChange('defaultTtlMs', v)} min={10000} max={300000} step={10000} format={formatDurationFull} />
        <SettingsSlider label="tool-cache-size" description="max entries before eviction" value={settings.toolCache.maxEntries} onChange={(v) => handleToolCacheChange('maxEntries', v)} min={50} max={500} step={25} format={(v) => `${v} entries`} />
        
        {/* Per-Tool TTL Overrides */}
        <div className="mt-2 pt-2 border-t border-[var(--color-border-subtle)]">
          <button
            type="button"
            onClick={() => setShowToolTtlsSection(!showToolTtlsSection)}
            aria-expanded={showToolTtlsSection}
            className="w-full flex items-center justify-between py-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[var(--color-text-secondary)]">per-tool TTL overrides</span>
              <span className="text-[9px] text-[var(--color-text-dim)]">({Object.keys(settings.toolCache.toolTtls || {}).length})</span>
            </div>
            {showToolTtlsSection ? (
              <ChevronDown size={12} className="text-[var(--color-text-muted)]" />
            ) : (
              <ChevronRight size={12} className="text-[var(--color-text-muted)]" />
            )}
          </button>
          
          {showToolTtlsSection && (
            <div className="space-y-2 mt-2 animate-in slide-in-from-top-1 duration-150">
              <p className="text-[9px] text-[var(--color-text-dim)]"># custom TTL for specific tools (overrides default)</p>
              
              {/* Existing tool TTLs */}
              {Object.entries(settings.toolCache.toolTtls || {}).length > 0 && (
                <div className="space-y-1.5">
                  {Object.entries(settings.toolCache.toolTtls || {}).map(([toolName, ttlMs]) => (
                    <div key={toolName} className="flex items-center gap-2 p-2 bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">
                      <span className="text-[10px] text-[var(--color-text-secondary)] flex-1 truncate">{toolName}</span>
                      <input
                        type="number"
                        min={1}
                        max={600}
                        value={Math.round((ttlMs as number) / 1000)}
                        onChange={(e) => handleUpdateToolTtl(toolName, (parseInt(e.target.value) || 60) * 1000)}
                        className="w-16 px-2 py-1 text-[9px] bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] text-right focus-visible:outline-none focus-visible:border-[var(--color-accent-primary)]/30"
                      />
                      <span className="text-[9px] text-[var(--color-text-dim)] w-4">s</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveToolTtl(toolName)}
                        className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
                        aria-label={`Remove ${toolName} TTL override`}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Add new tool TTL */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newToolTtl.toolName}
                  onChange={(e) => setNewToolTtl({ ...newToolTtl, toolName: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddToolTtl()}
                  placeholder="tool_name"
                  className="flex-1 px-2 py-1.5 text-[10px] bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] focus-visible:outline-none focus-visible:border-[var(--color-accent-primary)]/30"
                />
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={newToolTtl.ttl}
                  onChange={(e) => setNewToolTtl({ ...newToolTtl, ttl: parseInt(e.target.value) || 60 })}
                  className="w-16 px-2 py-1.5 text-[10px] bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] text-right focus-visible:outline-none focus-visible:border-[var(--color-accent-primary)]/30"
                />
                <span className="text-[9px] text-[var(--color-text-dim)] w-4">s</span>
                <button
                  type="button"
                  onClick={handleAddToolTtl}
                  disabled={!newToolTtl.toolName.trim()}
                  className={cn(
                    "p-1.5 border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40",
                    newToolTtl.toolName.trim()
                      ? "border-[var(--color-accent-primary)]/30 text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/10"
                      : "border-[var(--color-border-subtle)] text-[var(--color-text-dim)] cursor-not-allowed"
                  )}
                  aria-label="Add tool TTL override"
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
      </SettingsGroup>

      {/* Context Cache Settings */}
      <SettingsGroup title="context cache">
        <SettingsToggleRow label="enable-context-cache" description="cache file content and symbols" checked={settings.contextCache.enabled} onToggle={() => handleContextCacheChange('enabled', !settings.contextCache.enabled)} />
        <SettingsSlider label="context-cache-ttl" description="time before cached file content expires" value={settings.contextCache.defaultTtlMs} onChange={(v) => handleContextCacheChange('defaultTtlMs', v)} min={60000} max={600000} step={30000} format={formatDurationFull} />
        <SettingsSlider label="context-cache-size" description="max memory for context cache" value={settings.contextCache.maxSizeMb} onChange={(v) => handleContextCacheChange('maxSizeMb', v)} min={10} max={100} step={5} format={(v) => `${v} MB`} />
      </SettingsGroup>

      {/* Per-Provider Prompt Cache Settings */}
      <SettingsGroup title="per-provider prompt cache">
        <p className="text-[9px] text-[var(--color-text-dim)]"># enable/disable prompt caching per LLM provider</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(PROVIDER_NAMES) as LLMProviderName[]).map((provider) => (
            <SettingsToggleRow
              key={provider}
              label={PROVIDER_NAMES[provider]}
              checked={settings.enablePromptCache?.[provider] ?? true}
              onToggle={() => handleProviderPromptCacheToggle(provider)}
            />
          ))}
        </div>
      </SettingsGroup>

      {/* Clear Cache Actions */}
      <SettingsGroup title="clear cache" icon={<Trash2 size={11} />}>
        <p className="text-[9px] text-[var(--color-text-dim)]"># clear cached data to free memory or force fresh fetches</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => handleClearCache('prompt')} disabled={isClearing !== null} isLoading={isClearing === 'prompt'} className="text-[10px]">Clear Prompt</Button>
          <Button variant="secondary" size="sm" onClick={() => handleClearCache('tool')} disabled={isClearing !== null} isLoading={isClearing === 'tool'} className="text-[10px]">Clear Tool</Button>
          <Button variant="secondary" size="sm" onClick={() => handleClearCache('context')} disabled={isClearing !== null} isLoading={isClearing === 'context'} className="text-[10px]">Clear Context</Button>
          <Button variant="danger" size="sm" onClick={() => handleClearCache('all')} disabled={isClearing !== null} isLoading={isClearing === 'all'} className="text-[10px]">Clear All</Button>
        </div>
      </SettingsGroup>
    </SettingsSection>
  );
};

export default SettingsPerformance;
