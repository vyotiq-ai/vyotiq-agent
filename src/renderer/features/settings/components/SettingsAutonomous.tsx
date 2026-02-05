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
import React, { useState, useMemo } from 'react';
import { Shield, Wrench, AlertTriangle, X, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import type { AutonomousFeatureFlags, ToolConfigSettings } from '../../../../shared/types';
import { cn } from '../../../utils/cn';
import { SettingsSection, SettingsGroup, SettingsToggleRow, SettingsSlider, SettingsListManager } from '../primitives';

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
  const [expandedToolSection, setExpandedToolSection] = useState<'confirm' | 'disabled' | null>(null);

  if (!settings) {
    return <div className="text-[10px] text-[var(--color-text-muted)] font-mono"># loading autonomous settings...</div>;
  }

  const toolSettings = settings.toolSettings || {};
  const alwaysConfirmTools = toolSettings.alwaysConfirmTools ?? ['run', 'write', 'edit', 'delete'];
  const disabledTools = toolSettings.disabledTools ?? [];

  // Tools available for adding to confirm/disable lists
  const availableForConfirm = useMemo(() => 
    CORE_TOOLS.filter(t => !alwaysConfirmTools.includes(t.id)),
    [alwaysConfirmTools]
  );
  
  const availableForDisable = useMemo(() => 
    CORE_TOOLS.filter(t => !disabledTools.includes(t.id)),
    [disabledTools]
  );

  const handleAddConfirmTool = (toolId: string) => {
    onChange('toolSettings', { 
      ...toolSettings, 
      alwaysConfirmTools: [...alwaysConfirmTools, toolId] 
    });
  };

  const handleRemoveConfirmTool = (toolId: string) => {
    onChange('toolSettings', { 
      ...toolSettings, 
      alwaysConfirmTools: alwaysConfirmTools.filter(t => t !== toolId) 
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
      disabledTools: disabledTools.filter(t => t !== toolId) 
    });
  };

  return (
    <SettingsSection title="autonomous" description="Configure autonomous agent capabilities and advanced features">
      {/* Core Autonomous Features */}
      <SettingsGroup title="autonomous mode">
        <SettingsToggleRow
          label="enable-autonomous"
          description="Enable autonomous decision-making and multi-step task execution"
          checked={settings.enableAutonomousMode}
          onToggle={() => onChange('enableAutonomousMode', !settings.enableAutonomousMode)}
        />
        <SettingsToggleRow
          label="task-planning"
          description="Break down complex requests into structured task plans"
          checked={settings.enableTaskPlanning}
          onToggle={() => onChange('enableTaskPlanning', !settings.enableTaskPlanning)}
        />
        <SettingsToggleRow
          label="dynamic-tools"
          description="Allow agent to create custom tools at runtime"
          checked={settings.enableDynamicTools}
          onToggle={() => onChange('enableDynamicTools', !settings.enableDynamicTools)}
        />
      </SettingsGroup>

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
          value={(toolSettings.maxToolExecutionTime ?? 300000) / 1000}
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
                  {alwaysConfirmTools.map((toolId) => {
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
                  {disabledTools.map((toolId) => {
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

      {/* Info Box */}
      <div className="bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] p-3 space-y-2">
        <div className="text-[10px] text-[var(--color-text-secondary)]"># about autonomous mode</div>
        <p className="text-[9px] text-[var(--color-text-dim)] leading-relaxed">
          Autonomous mode enables the AI agent to make multi-step decisions and execute complex tasks without constant user confirmation. 
          The safety framework provides guardrails to prevent unintended actions.
        </p>
        <ul className="text-[9px] text-[var(--color-text-dim)] space-y-1 ml-2">
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
      </div>
    </SettingsSection>
  );
};

export default SettingsAutonomous;
