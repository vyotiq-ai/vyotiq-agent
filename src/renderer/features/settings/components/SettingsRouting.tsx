/**
 * Settings Routing Component
 * 
 * Configure task-based model routing - assign different AI models
 * to different task types (frontend, backend, debugging, etc.)
 */
import React, { useMemo } from 'react';
import { 
  Layout, 
  Server, 
  Bug, 
  Search, 
  Map, 
  FileText, 
  TestTube, 
  Cloud, 
  MessageSquare, 
  Zap, 
  Info,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { Toggle } from '../../../components/ui/Toggle';
import type { 
  TaskRoutingSettings, 
  RoutingTaskType, 
  TaskModelMapping, 
  LLMProviderName,
  ProviderSettings,
} from '../../../../shared/types';
import { ROUTING_TASK_INFO } from '../../../../shared/types';
import { PROVIDERS, getModelsForProvider } from '../../../../shared/providers';
import { cn } from '../../../utils/cn';

// Icon mapping for task types
const TASK_ICONS: Record<RoutingTaskType, React.ReactNode> = {
  frontend: <Layout size={14} className="text-[var(--color-info)]" />,
  backend: <Server size={14} className="text-[var(--color-success)]" />,
  debugging: <Bug size={14} className="text-[var(--color-error)]" />,
  analysis: <Search size={14} className="text-[var(--color-warning)]" />,
  planning: <Map size={14} className="text-[var(--color-accent-primary)]" />,
  documentation: <FileText size={14} className="text-[var(--color-text-secondary)]" />,
  testing: <TestTube size={14} className="text-[var(--color-info)]" />,
  devops: <Cloud size={14} className="text-[var(--color-success)]" />,
  general: <MessageSquare size={14} className="text-[var(--color-text-muted)]" />,
};

interface TaskMappingCardProps {
  taskType: RoutingTaskType;
  mapping: TaskModelMapping;
  availableProviders: Array<{ name: LLMProviderName; displayName: string; models: string[] }>;
  onUpdate: (mapping: TaskModelMapping) => void;
  showFallback?: boolean;
}

const TaskMappingCard: React.FC<TaskMappingCardProps> = ({
  taskType,
  mapping,
  availableProviders,
  onUpdate,
  showFallback = true,
}) => {
  const [expanded, setExpanded] = React.useState(false);
  const taskInfo = ROUTING_TASK_INFO[taskType];

  const selectedProviderModels = useMemo(() => {
    if (mapping.provider === 'auto') return [];
    const provider = availableProviders.find(p => p.name === mapping.provider);
    return provider?.models ?? [];
  }, [mapping.provider, availableProviders]);

  const fallbackProviderModels = useMemo(() => {
    if (!mapping.fallbackProvider) return [];
    const provider = availableProviders.find(p => p.name === mapping.fallbackProvider);
    return provider?.models ?? [];
  }, [mapping.fallbackProvider, availableProviders]);

  // Show configured model summary when collapsed
  const modelSummary = useMemo(() => {
    if (mapping.provider === 'auto') return 'auto';
    const providerName = availableProviders.find(p => p.name === mapping.provider)?.displayName || mapping.provider;
    const model = mapping.modelId ? ` / ${mapping.modelId}` : '';
    return `${providerName}${model}`;
  }, [mapping.provider, mapping.modelId, availableProviders]);

  return (
    <div className={cn(
      'border border-[var(--color-border-subtle)] rounded-sm transition-all duration-200',
      mapping.enabled 
        ? 'bg-[var(--color-surface-1)]' 
        : 'bg-[var(--color-surface-base)] opacity-60'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-2 min-w-0">
          {TASK_ICONS[taskType]}
          <div className="min-w-0">
            <div className="text-[10px] text-[var(--color-text-primary)] font-medium">
              {mapping.label || taskInfo.name}
            </div>
            <div className="text-[9px] text-[var(--color-text-dim)] truncate">
              {mapping.enabled && mapping.provider !== 'auto' 
                ? modelSummary 
                : (mapping.description || taskInfo.description)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Toggle
            checked={mapping.enabled}
            onToggle={() => onUpdate({ ...mapping, enabled: !mapping.enabled })}
            size="sm"
          />
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {/* Configuration */}
      <div className={cn('px-3 py-2 space-y-2', !mapping.enabled && 'pointer-events-none')}>
        {/* Provider Selection */}
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-[9px] text-[var(--color-text-muted)]">--provider</label>
            <select
              value={mapping.provider}
              onChange={(e) => onUpdate({ 
                ...mapping, 
                provider: e.target.value as LLMProviderName | 'auto',
                modelId: undefined, // Reset model when provider changes
              })}
              disabled={!mapping.enabled}
              className="w-full bg-[var(--color-surface-base)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30 disabled:opacity-50"
            >
              <option value="auto">auto (use default)</option>
              {availableProviders.map(p => (
                <option key={p.name} value={p.name}>{p.displayName}</option>
              ))}
            </select>
          </div>

          {/* Model Selection */}
          <div className="space-y-1">
            <label className="text-[9px] text-[var(--color-text-muted)]">--model</label>
            <select
              value={mapping.modelId ?? ''}
              onChange={(e) => onUpdate({ 
                ...mapping, 
                modelId: e.target.value || undefined,
              })}
              disabled={!mapping.enabled || mapping.provider === 'auto'}
              className="w-full bg-[var(--color-surface-base)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30 disabled:opacity-50"
            >
              <option value="">default</option>
              {selectedProviderModels.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Advanced Options (expanded) */}
        {expanded && (
          <div className="pt-2 border-t border-[var(--color-border-subtle)] space-y-3">
            {/* Fallback Configuration */}
            {showFallback && mapping.provider !== 'auto' && (
              <div className="space-y-2">
                <div className="flex items-center gap-1 text-[9px] text-[var(--color-text-muted)]">
                  <RefreshCw size={10} />
                  <span>fallback configuration</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-[9px] text-[var(--color-text-dim)]">--fallback-provider</label>
                    <select
                      value={mapping.fallbackProvider ?? ''}
                      onChange={(e) => onUpdate({ 
                        ...mapping, 
                        fallbackProvider: e.target.value as LLMProviderName || undefined,
                        fallbackModelId: undefined,
                      })}
                      disabled={!mapping.enabled}
                      className="w-full bg-[var(--color-surface-base)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30 disabled:opacity-50"
                    >
                      <option value="">none</option>
                      {availableProviders.filter(p => p.name !== mapping.provider).map(p => (
                        <option key={p.name} value={p.name}>{p.displayName}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] text-[var(--color-text-dim)]">--fallback-model</label>
                    <select
                      value={mapping.fallbackModelId ?? ''}
                      onChange={(e) => onUpdate({ 
                        ...mapping, 
                        fallbackModelId: e.target.value || undefined,
                      })}
                      disabled={!mapping.enabled || !mapping.fallbackProvider}
                      className="w-full bg-[var(--color-surface-base)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30 disabled:opacity-50"
                    >
                      <option value="">default</option>
                      {fallbackProviderModels.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Temperature and Max Tokens */}
            <div className="grid gap-2 sm:grid-cols-2">
              {/* Temperature */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] text-[var(--color-text-muted)]">--temperature</label>
                  <span className="text-[9px] text-[var(--color-accent-primary)]">
                    {mapping.temperature?.toFixed(1) ?? 'default'}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={mapping.temperature ?? 0.5}
                  onChange={(e) => onUpdate({ 
                    ...mapping, 
                    temperature: Number(e.target.value),
                  })}
                  disabled={!mapping.enabled}
                  className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer disabled:opacity-50"
                />
              </div>

              {/* Max Tokens */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] text-[var(--color-text-muted)]">--max-tokens</label>
                  <span className="text-[9px] text-[var(--color-accent-primary)]">
                    {mapping.maxOutputTokens ?? 'default'}
                  </span>
                </div>
                <input
                  type="range"
                  min={1000}
                  max={32000}
                  step={1000}
                  value={mapping.maxOutputTokens ?? 8000}
                  onChange={(e) => onUpdate({ 
                    ...mapping, 
                    maxOutputTokens: Number(e.target.value),
                  })}
                  disabled={!mapping.enabled}
                  className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer disabled:opacity-50"
                />
              </div>
            </div>

            {/* Keywords info */}
            <div className="flex items-start gap-1.5 pt-1">
              <Info size={10} className="text-[var(--color-text-dim)] mt-0.5 flex-shrink-0" />
              <div className="text-[9px] text-[var(--color-text-dim)] leading-relaxed">
                Detection keywords: {taskInfo.keywords.slice(0, 8).join(', ')}
                {taskInfo.keywords.length > 8 && `, +${taskInfo.keywords.length - 8} more`}
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

export const SettingsRouting: React.FC<SettingsRoutingProps> = ({
  settings,
  providerSettings,
  apiKeys,
  onSettingChange,
  onMappingChange,
}) => {
  const {
    enabled = false,
    confidenceThreshold = 0.6,
    taskMappings = [],
    showRoutingDecisions = true,
    showRoutingBadge = true,
    allowAgentOverride = true,
    enableFallback = true,
    useConversationContext = true,
    contextWindowSize = 10,
    logRoutingDecisions = false,
  } = settings ?? {};

  // Build list of available providers with their models
  const availableProviders = useMemo(() => {
    const providers: Array<{ name: LLMProviderName; displayName: string; models: string[] }> = [];
    
    for (const [name, info] of Object.entries(PROVIDERS)) {
      const providerName = name as LLMProviderName;
      const hasApiKey = apiKeys?.[providerName] && apiKeys[providerName].length > 0;
      const isEnabled = providerSettings?.[providerName]?.enabled !== false;
      
      if (hasApiKey && isEnabled) {
        const models = getModelsForProvider(providerName);
        providers.push({
          name: providerName,
          displayName: info.name,
          models: models.map(m => m.id),
        });
      }
    }
    
    return providers;
  }, [providerSettings, apiKeys]);

  // Get all task types in display order
  const taskTypes: RoutingTaskType[] = [
    'frontend',
    'backend',
    'debugging',
    'analysis',
    'planning',
    'documentation',
    'testing',
    'devops',
    'general',
  ];

  // Get or create default mapping for a task type
  const getMapping = (taskType: RoutingTaskType): TaskModelMapping => {
    const existing = taskMappings.find(m => m.taskType === taskType);
    return existing ?? {
      taskType,
      provider: 'auto',
      enabled: false,
      priority: taskTypes.indexOf(taskType) + 1,
    };
  };

  return (
    <section className="space-y-4 font-mono">
      <header>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[var(--color-accent-primary)] text-[11px]">#</span>
          <h3 className="text-[11px] text-[var(--color-text-primary)]">task routing</h3>
        </div>
        <p className="text-[10px] text-[var(--color-text-dim)]">
          # Automatically route different tasks to specialized models
        </p>
      </header>

      {/* Master Toggle */}
      <div className="flex items-center justify-between p-3 bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] rounded-sm">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-[var(--color-accent-primary)]" />
          <div>
            <div className="text-[10px] text-[var(--color-text-primary)]">Enable Task Routing</div>
            <div className="text-[9px] text-[var(--color-text-dim)]">
              Automatically detect task type and use configured models
            </div>
          </div>
        </div>
        <Toggle
          checked={enabled}
          onToggle={() => onSettingChange?.('enabled', !enabled)}
        />
      </div>

      {/* Global Settings */}
      <div className={`space-y-3 ${!enabled && 'opacity-50 pointer-events-none'}`}>
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Zap size={11} className="text-[var(--color-warning)]" />
          detection settings
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Confidence Threshold */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-[var(--color-text-muted)]">--confidence</label>
              <span className="text-[10px] text-[var(--color-accent-primary)]">{(confidenceThreshold * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min={0.3}
              max={0.95}
              step={0.05}
              className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer"
              value={confidenceThreshold}
              onChange={(e) => onSettingChange?.('confidenceThreshold', Number(e.target.value))}
            />
            <p className="text-[9px] text-[var(--color-text-dim)]"># minimum confidence to apply task routing</p>
          </div>

          {/* Show Routing Decisions */}
          <div className="flex items-center justify-between p-2 bg-[var(--color-surface-base)] rounded-sm border border-[var(--color-border-subtle)]">
            <div>
              <div className="text-[10px] text-[var(--color-text-muted)]">--show-decisions</div>
              <div className="text-[9px] text-[var(--color-text-dim)]"># display routing info in chat</div>
            </div>
            <Toggle
              checked={showRoutingDecisions}
              onToggle={() => onSettingChange?.('showRoutingDecisions', !showRoutingDecisions)}
              size="sm"
            />
          </div>
        </div>

        {/* Allow Agent Override */}
        <div className="flex items-center justify-between p-2 bg-[var(--color-surface-base)] rounded-sm border border-[var(--color-border-subtle)]">
          <div>
            <div className="text-[10px] text-[var(--color-text-muted)]">--allow-override</div>
            <div className="text-[9px] text-[var(--color-text-dim)]"># let agent override routing for complex tasks</div>
          </div>
          <Toggle
            checked={allowAgentOverride}
            onToggle={() => onSettingChange?.('allowAgentOverride', !allowAgentOverride)}
            size="sm"
          />
        </div>

        {/* Additional Settings Row */}
        <div className="grid gap-2 sm:grid-cols-2">
          {/* Show Routing Badge */}
          <div className="flex items-center justify-between p-2 bg-[var(--color-surface-base)] rounded-sm border border-[var(--color-border-subtle)]">
            <div className="flex items-center gap-2">
              <Eye size={12} className="text-[var(--color-text-muted)]" />
              <div>
                <div className="text-[10px] text-[var(--color-text-muted)]">--show-badge</div>
                <div className="text-[9px] text-[var(--color-text-dim)]"># show task badge on messages</div>
              </div>
            </div>
            <Toggle
              checked={showRoutingBadge}
              onToggle={() => onSettingChange?.('showRoutingBadge', !showRoutingBadge)}
              size="sm"
            />
          </div>

          {/* Enable Fallback */}
          <div className="flex items-center justify-between p-2 bg-[var(--color-surface-base)] rounded-sm border border-[var(--color-border-subtle)]">
            <div>
              <div className="text-[10px] text-[var(--color-text-muted)]">--enable-fallback</div>
              <div className="text-[9px] text-[var(--color-text-dim)]"># fallback when provider fails</div>
            </div>
            <Toggle
              checked={enableFallback}
              onToggle={() => onSettingChange?.('enableFallback', !enableFallback)}
              size="sm"
            />
          </div>
        </div>

        {/* Context Settings */}
        <div className="grid gap-2 sm:grid-cols-2">
          {/* Use Conversation Context */}
          <div className="flex items-center justify-between p-2 bg-[var(--color-surface-base)] rounded-sm border border-[var(--color-border-subtle)]">
            <div>
              <div className="text-[10px] text-[var(--color-text-muted)]">--use-context</div>
              <div className="text-[9px] text-[var(--color-text-dim)]"># use chat history for detection</div>
            </div>
            <Toggle
              checked={useConversationContext}
              onToggle={() => onSettingChange?.('useConversationContext', !useConversationContext)}
              size="sm"
            />
          </div>

          {/* Context Window Size */}
          <div className="space-y-1 p-2 bg-[var(--color-surface-base)] rounded-sm border border-[var(--color-border-subtle)]">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-[var(--color-text-muted)]">--context-size</label>
              <span className="text-[10px] text-[var(--color-accent-primary)]">{contextWindowSize}</span>
            </div>
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer disabled:opacity-50"
              value={contextWindowSize}
              onChange={(e) => onSettingChange?.('contextWindowSize', Number(e.target.value))}
              disabled={!useConversationContext}
            />
          </div>
        </div>

        {/* Debug logging toggle */}
        <div className="flex items-center justify-between p-2 bg-[var(--color-surface-base)] rounded-sm border border-[var(--color-border-subtle)]">
          <div>
            <div className="text-[10px] text-[var(--color-text-muted)]">--log-decisions</div>
            <div className="text-[9px] text-[var(--color-text-dim)]"># log routing decisions for debugging</div>
          </div>
          <Toggle
            checked={logRoutingDecisions}
            onToggle={() => onSettingChange?.('logRoutingDecisions', !logRoutingDecisions)}
            size="sm"
          />
        </div>
      </div>

      {/* Task Mappings */}
      <div className={`space-y-3 ${!enabled && 'opacity-50 pointer-events-none'}`}>
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Layout size={11} className="text-[var(--color-info)]" />
          task mappings
        </div>

        {availableProviders.length === 0 ? (
          <div className="text-[10px] text-[var(--color-text-dim)] bg-[var(--color-surface-1)] p-3 rounded-sm border border-[var(--color-border-subtle)]">
            <Info size={12} className="inline mr-1.5 text-[var(--color-warning)]" />
            No providers configured. Add API keys in the Providers tab first.
          </div>
        ) : (
          <div className="space-y-2">
            {taskTypes.map(taskType => (
              <TaskMappingCard
                key={taskType}
                taskType={taskType}
                mapping={getMapping(taskType)}
                availableProviders={availableProviders}
                onUpdate={(mapping) => onMappingChange?.(taskType, mapping)}
                showFallback={enableFallback}
              />
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex items-start gap-1.5 text-[9px] text-[var(--color-text-dim)] bg-[var(--color-surface-base)] p-2 rounded-sm border border-[var(--color-border-subtle)]">
        <Info size={10} className="mt-0.5 flex-shrink-0" />
        <div>
          Task detection analyzes your message content, file extensions, and conversation context 
          to determine the task type. Configure different models for specialized tasks to optimize 
          cost and quality. Set provider to "auto" to use default selection for that task.
        </div>
      </div>
    </section>
  );
};
