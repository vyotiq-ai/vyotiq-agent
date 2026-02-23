/**
 * Settings Autonomous Component
 * 
 * Configure autonomous agent capabilities and advanced features.
 * 
 * Features:
 * - Autonomous mode toggle and task planning
 * - Dynamic tool creation settings
 * - Tool configuration (confirm/disable lists)
 * - Safety monitoring options
 */
import React, { useState, useMemo, useCallback } from 'react';
import { Shield, Wrench, AlertTriangle, X, Plus, ChevronDown, ChevronRight, Cpu, ListChecks, Puzzle, Clock, Zap, Trash2 } from 'lucide-react';
import type { AutonomousFeatureFlags, ToolConfigSettings } from '../../../../shared/types';
import type { CustomToolConfig, CustomToolStep } from '../../../../shared/types/tools';
import { SettingsSection, SettingsGroup, SettingsToggleRow, SettingsSlider, SettingsInfoBox, SettingsInput } from '../primitives';
import { FeatureToggle, FeatureToggleGroup } from '../../../components/ui/FeatureToggle';

interface SettingsAutonomousProps {
  settings?: AutonomousFeatureFlags;
  onChange: (field: keyof AutonomousFeatureFlags, value: boolean | Partial<ToolConfigSettings>) => void;
}

// Available core tools for the selection UI
const CORE_TOOLS = [
  { id: 'read_file', name: 'read_file', category: 'file', description: 'Read file contents' },
  { id: 'write_file', name: 'write_file', category: 'file', description: 'Create new files' },
  { id: 'edit', name: 'edit', category: 'file', description: 'Edit existing files' },
  { id: 'list_dir', name: 'list_dir', category: 'file', description: 'List directory contents' },
  { id: 'glob', name: 'glob', category: 'file', description: 'Find files by pattern' },
  { id: 'grep', name: 'grep', category: 'file', description: 'Search file contents' },
  { id: 'bulk_operations', name: 'bulk_operations', category: 'file', description: 'Batch file operations' },
  { id: 'run', name: 'run', category: 'terminal', description: 'Execute terminal commands' },
  { id: 'check_terminal', name: 'check_terminal', category: 'terminal', description: 'Check terminal output' },
  { id: 'kill_terminal', name: 'kill_terminal', category: 'terminal', description: 'Kill terminal process' },
  { id: 'read_lints', name: 'read_lints', category: 'code', description: 'Get code linting errors' },
  { id: 'browser_navigate', name: 'browser_navigate', category: 'browser', description: 'Navigate to URL' },
  { id: 'browser_extract', name: 'browser_extract', category: 'browser', description: 'Extract page content' },
  { id: 'browser_click', name: 'browser_click', category: 'browser', description: 'Click page element' },
  { id: 'browser_type', name: 'browser_type', category: 'browser', description: 'Type into element' },
  { id: 'create_tool', name: 'create_tool', category: 'system', description: 'Create dynamic tools' },
  { id: 'todo_write', name: 'todo_write', category: 'system', description: 'Manage todo list' },
] as const;

export const SettingsAutonomous: React.FC<SettingsAutonomousProps> = ({ settings, onChange }) => {
  const [expandedToolSection, setExpandedToolSection] = useState<'confirm' | 'disabled' | 'timeouts' | null>(null);
  const [timeoutToolName, setTimeoutToolName] = useState('');
  const [timeoutValue, setTimeoutValue] = useState('');
  const [customToolName, setCustomToolName] = useState('');
  const [customToolDescription, setCustomToolDescription] = useState('');

  const toolSettings = settings?.toolSettings || {};
  const alwaysConfirmTools = useMemo(
    () => toolSettings.alwaysConfirmTools ?? ['run', 'write', 'edit', 'delete'],
    [toolSettings.alwaysConfirmTools]
  );
  const disabledTools = useMemo(
    () => toolSettings.disabledTools ?? [],
    [toolSettings.disabledTools]
  );
  const toolTimeouts = useMemo(
    () => toolSettings.toolTimeouts ?? {},
    [toolSettings.toolTimeouts]
  );
  const customTools = useMemo(
    () => toolSettings.customTools ?? [],
    [toolSettings.customTools]
  );

  // Tools available for adding to confirm/disable lists
  const availableForConfirm = useMemo(() => 
    CORE_TOOLS.filter(t => !alwaysConfirmTools.includes(t.id)),
    [alwaysConfirmTools]
  );
  
  const availableForDisable = useMemo(() => 
    CORE_TOOLS.filter(t => !disabledTools.includes(t.id)),
    [disabledTools]
  );

  if (!settings) {
    return <div className="text-[10px] text-[var(--color-text-muted)] font-mono"># loading autonomous settings...</div>;
  }

  const handleAddConfirmTool = (toolId: string) => {
    onChange('toolSettings', { 
      ...toolSettings, 
      alwaysConfirmTools: [...alwaysConfirmTools, toolId] 
    });
  };

  const handleRemoveConfirmTool = (toolId: string) => {
    onChange('toolSettings', { 
      ...toolSettings, 
      alwaysConfirmTools: alwaysConfirmTools.filter((t: string) => t !== toolId) 
    });
  };

  const handleAddDisabledTool = (toolId: string) => {
    onChange('toolSettings', { 
      ...toolSettings, 
      disabledTools: [...disabledTools, toolId] 
    });
  };

  const handleRemoveDisabledTool = (toolId: string) => {
    onChange('toolSettings', { 
      ...toolSettings, 
      disabledTools: disabledTools.filter((t: string) => t !== toolId) 
    });
  };

  // --- Tool Timeouts ---
  const handleAddToolTimeout = useCallback(() => {
    const name = timeoutToolName.trim();
    const seconds = parseFloat(timeoutValue);
    if (!name || isNaN(seconds) || seconds <= 0) return;
    onChange('toolSettings', {
      ...toolSettings,
      toolTimeouts: { ...toolTimeouts, [name]: Math.round(seconds * 1000) },
    });
    setTimeoutToolName('');
    setTimeoutValue('');
  }, [timeoutToolName, timeoutValue, toolSettings, toolTimeouts, onChange]);

  const handleRemoveToolTimeout = useCallback((toolId: string) => {
    const updated = { ...toolTimeouts };
    delete updated[toolId];
    onChange('toolSettings', { ...toolSettings, toolTimeouts: updated });
  }, [toolSettings, toolTimeouts, onChange]);

  // --- Custom Tools ---
  const handleAddCustomTool = useCallback(() => {
    const name = customToolName.trim();
    const description = customToolDescription.trim();
    if (!name) return;
    const id = `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
    const newTool: CustomToolConfig = {
      id,
      name,
      description: description || `Custom tool: ${name}`,
      steps: [],
      enabled: true,
      requiresConfirmation: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usageCount: 0,
    };
    onChange('toolSettings', {
      ...toolSettings,
      customTools: [...customTools, newTool],
    });
    setCustomToolName('');
    setCustomToolDescription('');
  }, [customToolName, customToolDescription, toolSettings, customTools, onChange]);

  const handleToggleCustomTool = useCallback((toolId: string, field: 'enabled' | 'requiresConfirmation') => {
    onChange('toolSettings', {
      ...toolSettings,
      customTools: customTools.map((t: CustomToolConfig) =>
        t.id === toolId ? { ...t, [field]: !t[field], updatedAt: Date.now() } : t
      ),
    });
  }, [toolSettings, customTools, onChange]);

  const handleRemoveCustomTool = useCallback((toolId: string) => {
    onChange('toolSettings', {
      ...toolSettings,
      customTools: customTools.filter((t: CustomToolConfig) => t.id !== toolId),
    });
  }, [toolSettings, customTools, onChange]);

  const handleAddCustomToolStep = useCallback((toolId: string, toolName: string) => {
    if (!toolName.trim()) return;
    const step: CustomToolStep = {
      id: `step-${Date.now()}`,
      toolName: toolName.trim(),
      input: {},
      onError: 'stop',
    };
    onChange('toolSettings', {
      ...toolSettings,
      customTools: customTools.map((t: CustomToolConfig) =>
        t.id === toolId
          ? { ...t, steps: [...t.steps, step], updatedAt: Date.now() }
          : t
      ),
    });
  }, [toolSettings, customTools, onChange]);

  const handleRemoveCustomToolStep = useCallback((toolId: string, stepId: string) => {
    onChange('toolSettings', {
      ...toolSettings,
      customTools: customTools.map((t: CustomToolConfig) =>
        t.id === toolId
          ? { ...t, steps: t.steps.filter((s: CustomToolStep) => s.id !== stepId), updatedAt: Date.now() }
          : t
      ),
    });
  }, [toolSettings, customTools, onChange]);

  return (
    <SettingsSection title="autonomous" description="Configure autonomous agent capabilities and advanced features">
      {/* Core Autonomous Features */}
      <FeatureToggleGroup label="autonomous mode">
        <FeatureToggle
          icon={<Cpu size={14} className="text-[var(--color-accent-primary)]" />}
          iconBgClass="bg-[var(--color-accent-primary)]/10"
          title="Autonomous Mode"
          description="Enable autonomous decision-making and multi-step task execution"
          checked={settings.enableAutonomousMode}
          onChange={() => onChange('enableAutonomousMode', !settings.enableAutonomousMode)}
          size="sm"
        />
        <FeatureToggle
          icon={<ListChecks size={14} className="text-[var(--color-info)]" />}
          iconBgClass="bg-[var(--color-info)]/10"
          title="Task Planning"
          description="Break down complex requests into structured task plans"
          checked={settings.enableTaskPlanning}
          onChange={() => onChange('enableTaskPlanning', !settings.enableTaskPlanning)}
          size="sm"
        />
        <FeatureToggle
          icon={<Puzzle size={14} className="text-[var(--color-warning)]" />}
          iconBgClass="bg-[var(--color-warning)]/10"
          title="Dynamic Tools"
          description="Allow agent to create custom tools at runtime"
          checked={settings.enableDynamicTools}
          onChange={() => onChange('enableDynamicTools', !settings.enableDynamicTools)}
          badge="Beta"
          badgeVariant="warning"
          size="sm"
        />
      </FeatureToggleGroup>

      {/* Safety & Monitoring */}
      <SettingsGroup title="safety monitoring" icon={<Shield size={11} />}>
        <SettingsToggleRow
          label="safety-framework"
          description="Enable guardrails and safety checks for autonomous operations"
          checked={settings.enableSafetyFramework}
          onToggle={() => onChange('enableSafetyFramework', !settings.enableSafetyFramework)}
        />
        <SettingsToggleRow
          label="perf-monitoring"
          description="Track and display performance metrics for runs"
          checked={settings.enablePerformanceMonitoring}
          onToggle={() => onChange('enablePerformanceMonitoring', !settings.enablePerformanceMonitoring)}
        />
        <SettingsToggleRow
          label="advanced-debug"
          description="Extended debug output and detailed execution traces"
          checked={settings.enableAdvancedDebugging}
          onToggle={() => onChange('enableAdvancedDebugging', !settings.enableAdvancedDebugging)}
        />
      </SettingsGroup>

      {/* Tool Configuration */}
      <SettingsGroup title="tool config">
        <SettingsSlider
          label="max-concurrent"
          description="Max parallel tool executions (1-20)"
          value={toolSettings.maxConcurrentTools ?? 5}
          onChange={(v) => onChange('toolSettings', { ...toolSettings, maxConcurrentTools: v })}
          min={1}
          max={20}
          step={1}
        />
        <SettingsSlider
          label="max-exec-time"
          description="Max seconds per tool execution (10-600)"
          value={(toolSettings.maxToolExecutionTime ?? 120000) / 1000}
          onChange={(v) => onChange('toolSettings', { ...toolSettings, maxToolExecutionTime: v * 1000 })}
          min={10}
          max={600}
          step={10}
          format={(v) => `${v}s`}
        />
        <SettingsToggleRow
          label="enable-tool-cache"
          description="Cache tool results for repeated calls"
          checked={toolSettings.enableToolCaching ?? true}
          onToggle={() => onChange('toolSettings', { ...toolSettings, enableToolCaching: !(toolSettings.enableToolCaching ?? true) })}
        />
        <SettingsToggleRow
          label="allow-dynamic-creation"
          description="Allow agent to create custom tools during execution"
          checked={toolSettings.allowDynamicCreation ?? false}
          onToggle={() => onChange('toolSettings', { ...toolSettings, allowDynamicCreation: !(toolSettings.allowDynamicCreation ?? false) })}
        />
        {(toolSettings.allowDynamicCreation ?? false) && (
          <div className="ml-4">
            <SettingsToggleRow
              label="confirm-dynamic"
              description="Require user confirmation for dynamic tool creation"
              checked={toolSettings.requireDynamicToolConfirmation ?? true}
              onToggle={() => onChange('toolSettings', { ...toolSettings, requireDynamicToolConfirmation: !(toolSettings.requireDynamicToolConfirmation ?? true) })}
            />
          </div>
        )}
      </SettingsGroup>

      {/* Tool Permissions */}
      <SettingsGroup title="tool permissions" icon={<Wrench size={11} />}>
        {/* Always Confirm Tools */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setExpandedToolSection(expandedToolSection === 'confirm' ? null : 'confirm')}
            aria-expanded={expandedToolSection === 'confirm'}
            className="w-full flex items-center justify-between text-left py-1 group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--color-warning)]"><AlertTriangle size={11} /></span>
              <span className="text-[10px] text-[var(--color-text-primary)]">always-confirm</span>
              <span className="text-[9px] text-[var(--color-text-dim)]">({alwaysConfirmTools.length})</span>
            </div>
            {expandedToolSection === 'confirm' ? (
              <ChevronDown size={12} className="text-[var(--color-text-muted)]" />
            ) : (
              <ChevronRight size={12} className="text-[var(--color-text-muted)]" />
            )}
          </button>
          
          {expandedToolSection === 'confirm' && (
            <div className="space-y-2 animate-in slide-in-from-top-1 duration-150">
              <p className="text-[9px] text-[var(--color-text-dim)]"># tools that always require confirmation (even in YOLO mode OFF)</p>
              
              {/* Current confirm list */}
              {alwaysConfirmTools.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {alwaysConfirmTools.map((toolId: string) => {
                    const tool = CORE_TOOLS.find(t => t.id === toolId);
                    return (
                      <span 
                        key={toolId} 
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30 text-[var(--color-warning)]"
                      >
                        {tool?.name || toolId}
                        <button
                          type="button"
                          onClick={() => handleRemoveConfirmTool(toolId)}
                          className="hover:text-[var(--color-error)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
                          aria-label={`Remove ${toolId} from confirm list`}
                        >
                          <X size={10} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              
              {/* Add tool dropdown */}
              {availableForConfirm.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1 border-t border-[var(--color-border-subtle)]">
                  <span className="text-[9px] text-[var(--color-text-dim)] w-full mb-1"># click to add:</span>
                  {availableForConfirm.slice(0, 10).map((tool) => (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => handleAddConfirmTool(tool.id)}
                      className="px-1.5 py-0.5 text-[9px] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:border-[var(--color-warning)]/50 hover:text-[var(--color-warning)] hover:bg-[var(--color-warning)]/5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
                      title={tool.description}
                    >
                      <Plus size={8} className="inline mr-0.5" />{tool.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Disabled Tools */}
        <div className="space-y-2 pt-2 border-t border-[var(--color-border-subtle)]">
          <button
            type="button"
            onClick={() => setExpandedToolSection(expandedToolSection === 'disabled' ? null : 'disabled')}
            aria-expanded={expandedToolSection === 'disabled'}
            className="w-full flex items-center justify-between text-left py-1 group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--color-error)]"><X size={11} /></span>
              <span className="text-[10px] text-[var(--color-text-primary)]">disabled-tools</span>
              <span className="text-[9px] text-[var(--color-text-dim)]">({disabledTools.length})</span>
            </div>
            {expandedToolSection === 'disabled' ? (
              <ChevronDown size={12} className="text-[var(--color-text-muted)]" />
            ) : (
              <ChevronRight size={12} className="text-[var(--color-text-muted)]" />
            )}
          </button>
          
          {expandedToolSection === 'disabled' && (
            <div className="space-y-2 animate-in slide-in-from-top-1 duration-150">
              <p className="text-[9px] text-[var(--color-text-dim)]"># tools that are completely disabled and cannot be used</p>
              
              {/* Current disabled list */}
              {disabledTools.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {disabledTools.map((toolId: string) => {
                    const tool = CORE_TOOLS.find(t => t.id === toolId);
                    return (
                      <span 
                        key={toolId} 
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] bg-[var(--color-error)]/10 border border-[var(--color-error)]/30 text-[var(--color-error)]"
                      >
                        {tool?.name || toolId}
                        <button
                          type="button"
                          onClick={() => handleRemoveDisabledTool(toolId)}
                          className="hover:text-[var(--color-text-primary)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
                          aria-label={`Remove ${toolId} from disabled list`}
                        >
                          <X size={10} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[9px] text-[var(--color-text-placeholder)] italic"># no tools disabled</p>
              )}
              
              {/* Add tool dropdown */}
              {availableForDisable.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1 border-t border-[var(--color-border-subtle)]">
                  <span className="text-[9px] text-[var(--color-text-dim)] w-full mb-1"># click to disable:</span>
                  {availableForDisable.slice(0, 10).map((tool) => (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => handleAddDisabledTool(tool.id)}
                      className="px-1.5 py-0.5 text-[9px] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:border-[var(--color-error)]/50 hover:text-[var(--color-error)] hover:bg-[var(--color-error)]/5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
                      title={tool.description}
                    >
                      <Plus size={8} className="inline mr-0.5" />{tool.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </SettingsGroup>

      {/* Tool Timeouts */}
      <SettingsGroup title="per-tool timeouts" icon={<Clock size={11} />}>
        <p className="text-[9px] text-[var(--color-text-dim)] mb-2"># override default timeout for specific tools (seconds)</p>

        {/* Existing timeouts */}
        {Object.keys(toolTimeouts).length > 0 ? (
          <div className="space-y-1 mb-2">
            {Object.entries(toolTimeouts).map(([toolId, ms]) => (
              <div
                key={toolId}
                className="flex items-center justify-between px-2 py-1 border border-[var(--color-border-subtle)] bg-[var(--color-surface-inset)]"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--color-text-primary)] font-mono">{toolId}</span>
                  <span className="text-[9px] text-[var(--color-text-dim)]">{(ms / 1000).toFixed(0)}s</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveToolTimeout(toolId)}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
                  aria-label={`Remove timeout for ${toolId}`}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[9px] text-[var(--color-text-placeholder)] italic mb-2"># no per-tool timeouts set (global default applies)</p>
        )}

        {/* Add timeout */}
        <div className="flex items-end gap-2 pt-1 border-t border-[var(--color-border-subtle)]">
          <div className="flex-1">
            <SettingsInput
              label="tool-name"
              value={timeoutToolName}
              onChange={setTimeoutToolName}
              placeholder="e.g. run"
            />
          </div>
          <div className="w-24">
            <SettingsInput
              label="seconds"
              value={timeoutValue}
              onChange={setTimeoutValue}
              type="number"
              placeholder="60"
            />
          </div>
          <button
            type="button"
            onClick={handleAddToolTimeout}
            disabled={!timeoutToolName.trim() || !timeoutValue.trim()}
            className="px-2 py-1 text-[9px] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-primary)]/50 hover:text-[var(--color-accent-primary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40 mb-1"
          >
            <Plus size={10} className="inline mr-0.5" />add
          </button>
        </div>
      </SettingsGroup>

      {/* Custom Tools */}
      <SettingsGroup title="custom tools" icon={<Zap size={11} />}>
        <p className="text-[9px] text-[var(--color-text-dim)] mb-2"># define composite tools that chain existing tools together</p>

        {/* Existing custom tools */}
        {customTools.length > 0 ? (
          <div className="space-y-2 mb-2">
            {customTools.map((tool: CustomToolConfig) => (
              <CustomToolEntry
                key={tool.id}
                tool={tool}
                onToggle={handleToggleCustomTool}
                onRemove={handleRemoveCustomTool}
                onAddStep={handleAddCustomToolStep}
                onRemoveStep={handleRemoveCustomToolStep}
              />
            ))}
          </div>
        ) : (
          <p className="text-[9px] text-[var(--color-text-placeholder)] italic mb-2"># no custom tools defined</p>
        )}

        {/* Add custom tool */}
        <div className="space-y-2 pt-2 border-t border-[var(--color-border-subtle)]">
          <span className="text-[9px] text-[var(--color-text-dim)]"># create a new custom tool:</span>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <SettingsInput
                label="name"
                value={customToolName}
                onChange={setCustomToolName}
                placeholder="my-tool"
              />
            </div>
            <div className="flex-1">
              <SettingsInput
                label="description"
                value={customToolDescription}
                onChange={setCustomToolDescription}
                placeholder="What does this tool do?"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleAddCustomTool}
            disabled={!customToolName.trim()}
            className="px-2 py-1 text-[9px] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-primary)]/50 hover:text-[var(--color-accent-primary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
          >
            <Plus size={10} className="inline mr-0.5" />create tool
          </button>
        </div>
      </SettingsGroup>

      {/* Info Box */}
      <SettingsInfoBox title="# about autonomous mode">
        <p>
          Autonomous mode enables the AI agent to make multi-step decisions and execute complex tasks without constant user confirmation. 
          The safety framework provides guardrails to prevent unintended actions.
        </p>
        <ul className="space-y-1 ml-2 mt-1">
          <li className="flex items-start gap-1.5">
            <span className="text-[var(--color-accent-primary)]">•</span>
            <span><strong className="text-[var(--color-text-muted)]">Task planning:</strong> Breaks complex requests into manageable steps</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-[var(--color-accent-primary)]">•</span>
            <span><strong className="text-[var(--color-text-muted)]">Dynamic tools:</strong> Creates specialized tools for unique tasks</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-[var(--color-accent-primary)]">•</span>
            <span><strong className="text-[var(--color-text-muted)]">Safety framework:</strong> Monitors and limits potentially dangerous operations</span>
          </li>
        </ul>
      </SettingsInfoBox>
    </SettingsSection>
  );
};

// --- Custom Tool Entry Sub-Component ---
interface CustomToolEntryProps {
  tool: CustomToolConfig;
  onToggle: (id: string, field: 'enabled' | 'requiresConfirmation') => void;
  onRemove: (id: string) => void;
  onAddStep: (id: string, toolName: string) => void;
  onRemoveStep: (id: string, stepId: string) => void;
}

const CustomToolEntry: React.FC<CustomToolEntryProps> = ({ tool, onToggle, onRemove, onAddStep, onRemoveStep }) => {
  const [expanded, setExpanded] = useState(false);
  const [stepToolName, setStepToolName] = useState('');

  return (
    <div className="border border-[var(--color-border-subtle)] bg-[var(--color-surface-inset)]">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-left flex-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
        >
          {expanded ? (
            <ChevronDown size={10} className="text-[var(--color-text-muted)]" />
          ) : (
            <ChevronRight size={10} className="text-[var(--color-text-muted)]" />
          )}
          <span className="text-[10px] text-[var(--color-text-primary)] font-mono">{tool.name}</span>
          <span className="text-[9px] text-[var(--color-text-dim)]">
            ({tool.steps.length} step{tool.steps.length !== 1 ? 's' : ''})
          </span>
          {!tool.enabled && (
            <span className="text-[8px] px-1 py-0.5 bg-[var(--color-error)]/10 text-[var(--color-error)] border border-[var(--color-error)]/20">disabled</span>
          )}
        </button>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onToggle(tool.id, 'enabled')}
            className={`text-[9px] px-1 py-0.5 border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40 ${
              tool.enabled
                ? 'border-[var(--color-success)]/30 text-[var(--color-success)] bg-[var(--color-success)]/10'
                : 'border-[var(--color-border-subtle)] text-[var(--color-text-muted)]'
            }`}
            title={tool.enabled ? 'Disable tool' : 'Enable tool'}
          >
            {tool.enabled ? 'on' : 'off'}
          </button>
          <button
            type="button"
            onClick={() => onRemove(tool.id)}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
            aria-label={`Delete custom tool ${tool.name}`}
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-2 pb-2 space-y-2 border-t border-[var(--color-border-subtle)] animate-in slide-in-from-top-1 duration-150">
          <p className="text-[9px] text-[var(--color-text-dim)] pt-1.5">{tool.description}</p>

          {/* Confirmation toggle */}
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-[var(--color-text-muted)]">requires-confirmation</span>
            <button
              type="button"
              onClick={() => onToggle(tool.id, 'requiresConfirmation')}
              className={`text-[9px] px-1 py-0.5 border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40 ${
                tool.requiresConfirmation
                  ? 'border-[var(--color-warning)]/30 text-[var(--color-warning)] bg-[var(--color-warning)]/10'
                  : 'border-[var(--color-border-subtle)] text-[var(--color-text-muted)]'
              }`}
            >
              {tool.requiresConfirmation ? 'yes' : 'no'}
            </button>
          </div>

          {/* Steps */}
          <div className="space-y-1">
            <span className="text-[9px] text-[var(--color-text-dim)]"># workflow steps:</span>
            {tool.steps.length > 0 ? (
              <div className="space-y-1">
                {tool.steps.map((step: CustomToolStep, idx: number) => (
                  <div
                    key={step.id}
                    className="flex items-center justify-between px-1.5 py-0.5 bg-[var(--color-surface-overlay)] border border-[var(--color-border-subtle)]"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[8px] text-[var(--color-text-dim)]">{idx + 1}.</span>
                      <span className="text-[9px] text-[var(--color-text-primary)] font-mono">{step.toolName}</span>
                      <span className="text-[8px] text-[var(--color-text-dim)]">
                        on-error: {step.onError}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveStep(tool.id, step.id)}
                      className="text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
                      aria-label={`Remove step ${idx + 1}`}
                    >
                      <X size={8} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[9px] text-[var(--color-text-placeholder)] italic"># no steps — add tools to build workflow</p>
            )}

            {/* Add step */}
            <div className="flex items-center gap-1 pt-1">
              <input
                type="text"
                value={stepToolName}
                onChange={(e) => setStepToolName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onAddStep(tool.id, stepToolName);
                    setStepToolName('');
                  }
                }}
                placeholder="tool name"
                className="flex-1 px-1.5 py-0.5 text-[9px] font-mono bg-[var(--color-surface-input)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] focus:outline-none focus:border-[var(--color-accent-primary)]/40"
              />
              <button
                type="button"
                onClick={() => {
                  onAddStep(tool.id, stepToolName);
                  setStepToolName('');
                }}
                disabled={!stepToolName.trim()}
                className="px-1.5 py-0.5 text-[9px] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-primary)]/50 hover:text-[var(--color-accent-primary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
              >
                <Plus size={8} className="inline" />
              </button>
            </div>
          </div>

          {/* Meta info */}
          <div className="flex items-center gap-3 pt-1 border-t border-[var(--color-border-subtle)]">
            <span className="text-[8px] text-[var(--color-text-dim)]">uses: {tool.usageCount}</span>
            <span className="text-[8px] text-[var(--color-text-dim)]">
              created: {new Date(tool.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsAutonomous;
