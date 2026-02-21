/**
 * Settings Routing Component
 * 
 * Configure task-based model routing - assign different AI models
 * to different task types (frontend, backend, debugging, etc.)
 */
import React, { useMemo } from 'react';
import { ChevronDown, ChevronUp, RefreshCw, BarChart3 } from 'lucide-react';
import { Toggle } from '../../../components/ui/Toggle';
import type { 
  TaskRoutingSettings, RoutingTaskType, TaskModelMapping, LLMProviderName, ProviderSettings,
} from '../../../../shared/types';
import { ROUTING_TASK_INFO } from '../../../../shared/types';
import { PROVIDERS, getModelsForProvider } from '../../../../shared/providers';
import { cn } from '../../../utils/cn';
import { useModelQuality } from '../../../hooks/useModelQuality';
import { SettingsSection, SettingsGroup, SettingsToggleRow, SettingsSlider, SettingsInfoBox } from '../primitives';

interface TaskMappingCardProps {
  taskType: RoutingTaskType;
  mapping: TaskModelMapping;
  availableProviders: Array<{ name: LLMProviderName; displayName: string; models: string[] }>;
  onUpdate: (mapping: TaskModelMapping) => void;
  showFallback?: boolean;
}

const TaskMappingCard: React.FC<TaskMappingCardProps> = ({ taskType, mapping, availableProviders, onUpdate, showFallback = true }) => {
  const [expanded, setExpanded] = React.useState(false);
  const taskInfo = ROUTING_TASK_INFO[taskType];

  const selectedProviderModels = useMemo(() => {
    if (mapping.provider === 'auto') return [];
    return availableProviders.find(p => p.name === mapping.provider)?.models ?? [];
  }, [mapping.provider, availableProviders]);

  const fallbackProviderModels = useMemo(() => {
    if (!mapping.fallbackProvider) return [];
    return availableProviders.find(p => p.name === mapping.fallbackProvider)?.models ?? [];
  }, [mapping.fallbackProvider, availableProviders]);

  const modelSummary = useMemo(() => {
    if (mapping.provider === 'auto') return 'auto';
    const providerName = availableProviders.find(p => p.name === mapping.provider)?.displayName || mapping.provider;
    const model = mapping.modelId ? ` / ${mapping.modelId}` : '';
    return `${providerName}${model}`;
  }, [mapping.provider, mapping.modelId, availableProviders]);

  return (
    <div className={cn(
      'border border-[var(--color-border-subtle)] transition-all duration-200',
      mapping.enabled ? 'bg-[var(--color-surface-1)]' : 'bg-[var(--color-surface-base)] opacity-60'
    )}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0">
            <div className="text-[10px] text-[var(--color-text-primary)] font-medium">{mapping.label || taskInfo.name}</div>
            <div className="text-[9px] text-[var(--color-text-dim)] truncate">
              {mapping.enabled && mapping.provider !== 'auto' ? modelSummary : (mapping.description || taskInfo.description)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Toggle checked={mapping.enabled} onToggle={() => onUpdate({ ...mapping, enabled: !mapping.enabled })} size="sm" />
          <button onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      <div className={cn('px-3 py-2 space-y-2', !mapping.enabled && 'pointer-events-none')}>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-[9px] text-[var(--color-text-muted)]">--provider</label>
            <select
              value={mapping.provider}
              onChange={(e) => onUpdate({ ...mapping, provider: e.target.value as LLMProviderName | 'auto', modelId: undefined })}
              disabled={!mapping.enabled}
              className="w-full bg-[var(--color-surface-base)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30 disabled:opacity-50"
            >
              <option value="auto">auto (use default)</option>
              {availableProviders.map(p => <option key={p.name} value={p.name}>{p.displayName}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] text-[var(--color-text-muted)]">--model</label>
            <select
              value={mapping.modelId ?? ''}
              onChange={(e) => onUpdate({ ...mapping, modelId: e.target.value || undefined })}
              disabled={!mapping.enabled || mapping.provider === 'auto'}
              className="w-full bg-[var(--color-surface-base)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30 disabled:opacity-50"
            >
              <option value="">default</option>
              {selectedProviderModels.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        {expanded && (
          <div className="pt-2 border-t border-[var(--color-border-subtle)] space-y-3">
            {showFallback && mapping.provider !== 'auto' && (
              <div className="space-y-2">
                <div className="flex items-center gap-1 text-[9px] text-[var(--color-text-muted)]"><RefreshCw size={10} /><span>fallback configuration</span></div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-[9px] text-[var(--color-text-dim)]">--fallback-provider</label>
                    <select
                      value={mapping.fallbackProvider ?? ''}
                      onChange={(e) => onUpdate({ ...mapping, fallbackProvider: e.target.value as LLMProviderName || undefined, fallbackModelId: undefined })}
                      disabled={!mapping.enabled}
                      className="w-full bg-[var(--color-surface-base)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30 disabled:opacity-50"
                    >
                      <option value="">none</option>
                      {availableProviders.filter(p => p.name !== mapping.provider).map(p => <option key={p.name} value={p.name}>{p.displayName}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] text-[var(--color-text-dim)]">--fallback-model</label>
                    <select
                      value={mapping.fallbackModelId ?? ''}
                      onChange={(e) => onUpdate({ ...mapping, fallbackModelId: e.target.value || undefined })}
                      disabled={!mapping.enabled || !mapping.fallbackProvider}
                      className="w-full bg-[var(--color-surface-base)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30 disabled:opacity-50"
                    >
                      <option value="">default</option>
                      {fallbackProviderModels.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] text-[var(--color-text-muted)]">--temperature</label>
                  <span className="text-[9px] text-[var(--color-accent-primary)]">{mapping.temperature?.toFixed(1) ?? 'default'}</span>
                </div>
                <input type="range" min={0} max={1} step={0.1} value={mapping.temperature ?? 0.5} onChange={(e) => onUpdate({ ...mapping, temperature: Number(e.target.value) })} disabled={!mapping.enabled} className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer disabled:opacity-50" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] text-[var(--color-text-muted)]">--max-tokens</label>
                  <span className="text-[9px] text-[var(--color-accent-primary)]">{mapping.maxOutputTokens ?? 'default'}</span>
                </div>
                <input type="range" min={1000} max={32000} step={1000} value={mapping.maxOutputTokens ?? 8000} onChange={(e) => onUpdate({ ...mapping, maxOutputTokens: Number(e.target.value) })} disabled={!mapping.enabled} className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer disabled:opacity-50" />
              </div>
            </div>

            <div className="flex items-start gap-1.5 pt-1">
              <div className="text-[9px] text-[var(--color-text-dim)] leading-relaxed">
                Detection keywords: {taskInfo.keywords.slice(0, 8).join(', ')}{taskInfo.keywords.length > 8 && `, +${taskInfo.keywords.length - 8} more`}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface SettingsRoutingProps {
  settings?: TaskRoutingSettings;
  providerSettings?: Record<string, ProviderSettings>;
  apiKeys?: Record<string, string>;
  onSettingChange?: <K extends keyof TaskRoutingSettings>(field: K, value: TaskRoutingSettings[K]) => void;
  onMappingChange?: (taskType: RoutingTaskType, mapping: TaskModelMapping) => void;
}

export const SettingsRouting: React.FC<SettingsRoutingProps> = ({ settings, providerSettings, apiKeys, onSettingChange, onMappingChange }) => {
  const {
    enabled = false, confidenceThreshold = 0.6, taskMappings = [], showRoutingDecisions = true,
    showRoutingBadge = true, allowAgentOverride = true, enableFallback = true,
    useConversationContext = true, contextWindowSize = 10, logRoutingDecisions = false,
  } = settings ?? {};

  const { stats: modelQualityStats, rankedModels, isLoading: isQualityLoading, refresh: refreshQuality } = useModelQuality();

  const availableProviders = useMemo(() => {
    const providers: Array<{ name: LLMProviderName; displayName: string; models: string[] }> = [];
    for (const [name, info] of Object.entries(PROVIDERS)) {
      const providerName = name as LLMProviderName;
      const hasApiKey = apiKeys?.[providerName] && apiKeys[providerName].length > 0;
      const isEnabled = providerSettings?.[providerName]?.enabled !== false;
      if (hasApiKey && isEnabled) {
        const models = getModelsForProvider(providerName);
        providers.push({ name: providerName, displayName: info.name, models: models.map(m => m.id) });
      }
    }
    return providers;
  }, [providerSettings, apiKeys]);

  const taskTypes: RoutingTaskType[] = ['frontend', 'backend', 'debugging', 'analysis', 'planning', 'documentation', 'testing', 'devops', 'general'];

  const getMapping = (taskType: RoutingTaskType): TaskModelMapping => {
    const existing = taskMappings.find(m => m.taskType === taskType);
    return existing ?? { taskType, provider: 'auto', enabled: false, priority: taskTypes.indexOf(taskType) + 1 };
  };

  return (
    <SettingsSection title="task routing" description="Automatically route different tasks to specialized models">
      {/* Master Toggle */}
      <SettingsToggleRow
        label="enable-routing"
        description="automatically detect task type and use configured models"
        checked={enabled}
        onToggle={() => onSettingChange?.('enabled', !enabled)}
      />

      {/* Global Settings */}
      <div className={`space-y-3 ${!enabled && 'opacity-50 pointer-events-none'}`}>
        <SettingsGroup title="detection settings">
          <div className="grid gap-3 sm:grid-cols-2">
            <SettingsSlider label="confidence" description="minimum confidence to apply task routing" value={confidenceThreshold} onChange={(v) => onSettingChange?.('confidenceThreshold', v)} min={0.3} max={0.95} step={0.05} format={(v) => `${(v * 100).toFixed(0)}%`} />
            <SettingsToggleRow label="show-decisions" description="display routing info in chat" checked={showRoutingDecisions} onToggle={() => onSettingChange?.('showRoutingDecisions', !showRoutingDecisions)} />
          </div>
          <SettingsToggleRow label="allow-override" description="let agent override routing for complex tasks" checked={allowAgentOverride} onToggle={() => onSettingChange?.('allowAgentOverride', !allowAgentOverride)} />
          <div className="grid gap-2 sm:grid-cols-2">
            <SettingsToggleRow label="show-badge" description="show task badge on messages" checked={showRoutingBadge} onToggle={() => onSettingChange?.('showRoutingBadge', !showRoutingBadge)} />
            <SettingsToggleRow label="enable-fallback" description="fallback when provider fails" checked={enableFallback} onToggle={() => onSettingChange?.('enableFallback', !enableFallback)} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <SettingsToggleRow label="use-context" description="use chat history for detection" checked={useConversationContext} onToggle={() => onSettingChange?.('useConversationContext', !useConversationContext)} />
            <SettingsSlider label="context-size" value={contextWindowSize} onChange={(v) => onSettingChange?.('contextWindowSize', v)} min={1} max={20} step={1} disabled={!useConversationContext} />
          </div>
          <SettingsToggleRow label="log-decisions" description="log routing decisions for debugging" checked={logRoutingDecisions} onToggle={() => onSettingChange?.('logRoutingDecisions', !logRoutingDecisions)} />
        </SettingsGroup>

        {/* Task Mappings */}
        <SettingsGroup title="task mappings">
          {availableProviders.length === 0 ? (
            <div className="text-[10px] text-[var(--color-text-dim)] bg-[var(--color-surface-1)] p-3 border border-[var(--color-border-subtle)]">
              No providers configured. Add API keys in the Providers tab first.
            </div>
          ) : (
            <div className="space-y-2">
              {taskTypes.map(taskType => (
                <TaskMappingCard key={taskType} taskType={taskType} mapping={getMapping(taskType)} availableProviders={availableProviders} onUpdate={(mapping) => onMappingChange?.(taskType, mapping)} showFallback={enableFallback} />
              ))}
            </div>
          )}
        </SettingsGroup>

        {/* Model Performance Stats */}
        <SettingsGroup title="model performance" icon={<BarChart3 size={11} />}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] text-[var(--color-text-dim)]"># quality scores based on success rate, speed, and user feedback</p>
            <button
              onClick={refreshQuality}
              disabled={isQualityLoading}
              className="flex items-center gap-1 px-2 py-1 text-[9px] text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
              title="Refresh quality data"
            >
              <RefreshCw size={10} className={isQualityLoading ? 'animate-spin' : ''} />
              refresh
            </button>
          </div>
          {modelQualityStats && modelQualityStats.totalRequests > 0 ? (
            <div className="space-y-2">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] p-2 text-center">
                  <div className="text-[14px] font-medium text-[var(--color-accent-primary)]">{modelQualityStats.totalModels}</div>
                  <div className="text-[8px] text-[var(--color-text-dim)] uppercase tracking-wider">models used</div>
                </div>
                <div className="bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] p-2 text-center">
                  <div className="text-[14px] font-medium text-[var(--color-text-primary)]">{modelQualityStats.totalRequests}</div>
                  <div className="text-[8px] text-[var(--color-text-dim)] uppercase tracking-wider">total requests</div>
                </div>
                <div className="bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] p-2 text-center">
                  <div className="text-[14px] font-medium text-[var(--color-success)]">{(modelQualityStats.avgQualityScore * 100).toFixed(0)}%</div>
                  <div className="text-[8px] text-[var(--color-text-dim)] uppercase tracking-wider">avg quality</div>
                </div>
              </div>
              {rankedModels.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[9px] text-[var(--color-text-muted)]"># top models by quality score</div>
                  {rankedModels.slice(0, 5).map((model) => (
                    <div key={`${model.provider}/${model.modelId}`} className="flex items-center gap-2 px-2 py-1.5 bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-[var(--color-text-primary)] truncate">{model.modelId}</div>
                        <div className="text-[8px] text-[var(--color-text-dim)]">{model.provider}</div>
                      </div>
                      <div className="flex items-center gap-3 text-[9px] tabular-nums flex-shrink-0">
                        <span className="text-[var(--color-accent-primary)]">{(model.qualityScore * 100).toFixed(0)}%</span>
                        <span className="text-[var(--color-text-muted)]">{model.totalRequests} req</span>
                        <span className="text-[var(--color-text-dim)]">{model.avgResponseTimeMs > 0 ? `${(model.avgResponseTimeMs / 1000).toFixed(1)}s` : '--'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-[10px] text-[var(--color-text-muted)] py-3 text-center">
              {isQualityLoading ? '# loading quality data...' : '# no model performance data yet'}
            </div>
          )}
        </SettingsGroup>

        {/* Info */}
        <SettingsInfoBox>
          Task detection analyzes your message content, file extensions, and conversation context to determine the task type. Configure different models for specialized tasks to optimize cost and quality. Set provider to &quot;auto&quot; to use default selection for that task.
        </SettingsInfoBox>
      </div>
    </SettingsSection>
  );
};

export default SettingsRouting;
