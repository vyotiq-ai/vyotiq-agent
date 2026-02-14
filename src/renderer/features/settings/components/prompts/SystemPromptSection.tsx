/**
 * System Prompt Section
 * 
 * Manages custom system prompt and workspace context settings.
 */
import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { SettingsToggleRow } from '../../primitives';
import { cn } from '../../../../utils/cn';
import type { PersonaSectionProps } from './types';
import type { AgentPersona, PromptSettings } from '../../../../../shared/types';

// Using type alias instead of empty interface to avoid lint error
type SystemPromptSectionProps = PersonaSectionProps;

export const SystemPromptSection: React.FC<SystemPromptSectionProps> = ({
  settings,
  onChange,
  activePersona,
}) => {
  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="p-3 bg-[var(--color-info)]/10 border border-[var(--color-info)]/30 text-[10px]">
        <p className="text-[var(--color-info)] mb-1 font-medium">
          How prompt customization works:
        </p>
        <p className="text-[var(--color-text-secondary)]">
          Custom prompts and personas are layered on top of the core system prompt.
          The core identity, tool access, and safety guidelines are always preserved.
        </p>
      </div>

      <SettingsToggleRow
        label="custom-prompt"
        description="Add custom instructions to the system prompt"
        checked={settings.useCustomSystemPrompt}
        onToggle={() => onChange('useCustomSystemPrompt', !settings.useCustomSystemPrompt)}
      />

      {settings.useCustomSystemPrompt && (
        <div className="space-y-2">
          <label className="text-[10px] text-[var(--color-text-muted)]">
            Custom Instructions
          </label>
          <textarea
            className="w-full min-h-[200px] bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-3 py-2 text-[11px] font-mono outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30 resize-y"
            value={settings.customSystemPrompt}
            onChange={(e) => onChange('customSystemPrompt', e.target.value)}
            placeholder="Enter custom instructions to add to the system prompt..."
          />
          <p className="text-[9px] text-[var(--color-text-dim)]">
            # These instructions will be added as a "CUSTOM INSTRUCTIONS" section
          </p>
        </div>
      )}

      {!settings.useCustomSystemPrompt && activePersona && (
        <div className="space-y-2 p-3 bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">
          <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)]">
            <span>Active Persona: {activePersona.name}</span>
          </div>
          {activePersona.systemPrompt && (
            <pre className="text-[10px] text-[var(--color-text-muted)] whitespace-pre-wrap max-h-[150px] overflow-y-auto">
              {activePersona.systemPrompt}
            </pre>
          )}
          {!activePersona.systemPrompt && activePersona.id === 'default' && (
            <p className="text-[10px] text-[var(--color-text-dim)] italic">
              Using the built-in default system prompt
            </p>
          )}
        </div>
      )}

      <SettingsToggleRow
        label="workspace-context"
        description="Include workspace info in prompts"
        checked={settings.includeWorkspaceContext}
        onToggle={() => onChange('includeWorkspaceContext', !settings.includeWorkspaceContext)}
      />

      {/* Prompt Structure Preview */}
      <PromptStructurePreview settings={settings} activePersona={activePersona} />
    </div>
  );
};

/** Prompt structure preview component */
interface PromptStructurePreviewProps {
  settings: PromptSettings;
  activePersona: AgentPersona | undefined;
}

const PromptStructurePreview: React.FC<PromptStructurePreviewProps> = ({ settings, activePersona }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const sections = useMemo(() => {
    const result: { name: string; status: 'always' | 'active' | 'inactive'; description: string }[] = [];

    result.push({
      name: '1. Core Identity',
      status: 'always',
      description: 'You are Vyotiq, an expert AI coding assistant...',
    });

    result.push({
      name: '2. Workspace Context',
      status: settings.includeWorkspaceContext ? 'active' : 'inactive',
      description: 'Current workspace, session, and provider info',
    });

    result.push({
      name: '3. Tool Information',
      status: 'always',
      description: 'List of available tools (CRITICAL)',
    });

    result.push({
      name: '4. Active Persona',
      status: activePersona && activePersona.id !== 'default' && activePersona.systemPrompt ? 'active' : 'inactive',
      description: activePersona?.name ?? 'Default',
    });

    result.push({
      name: '5. Custom Instructions',
      status: settings.useCustomSystemPrompt && settings.customSystemPrompt ? 'active' : 'inactive',
      description: settings.customSystemPrompt ? `${settings.customSystemPrompt.slice(0, 50)}...` : 'Not set',
    });

    result.push({
      name: '6. Communication Style',
      status: 'active',
      description: `Tone: ${settings.responseFormat.tone}, Detail: ${settings.responseFormat.explanationDetail}`,
    });

    result.push({
      name: '7. Core Guidelines',
      status: 'always',
      description: 'File reading, code verification, safety rules (CRITICAL)',
    });

    const enabledAgentInstructions = (settings.agentInstructions ?? []).filter(i => i.enabled);
    result.push({
      name: '8. Agent Instructions',
      status: enabledAgentInstructions.length > 0 ? 'active' : 'inactive',
      description: enabledAgentInstructions.length > 0 
        ? `${enabledAgentInstructions.length} enabled`
        : 'None enabled',
    });

    result.push({
      name: '9. Project Instructions',
      status: 'active',
      description: 'From AGENTS.md, CLAUDE.md, copilot-instructions.md (auto-detected)',
    });

    const activeRules = settings.contextInjectionRules.filter(r => r.enabled);
    result.push({
      name: '10. Injected Context',
      status: activeRules.length > 0 ? 'active' : 'inactive',
      description: activeRules.length > 0 ? `${activeRules.length} active rule(s)` : 'No rules',
    });

    return result;
  }, [settings, activePersona]);

  return (
    <div className="mt-4 border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-2 text-[10px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] transition-colors"
      >
        <span>Prompt Structure Preview</span>
        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {isExpanded && (
        <div className="p-3 border-t border-[var(--color-border-subtle)] space-y-1.5">
          <p className="text-[9px] text-[var(--color-text-dim)] mb-2">
            # Sections marked "ALWAYS" cannot be disabled.
          </p>
          {sections.map((section) => (
            <div
              key={section.name}
              className={cn(
                "flex items-start gap-2 py-1 px-2 text-[9px]",
                section.status === 'always' && "bg-[var(--color-success)]/10 border-l-2 border-[var(--color-success)]",
                section.status === 'active' && "bg-[var(--color-info)]/10 border-l-2 border-[var(--color-info)]",
                section.status === 'inactive' && "bg-[var(--color-surface-3)] opacity-50"
              )}
            >
              <span className={cn(
                "font-medium min-w-[140px]",
                section.status === 'always' && "text-[var(--color-success)]",
                section.status === 'active' && "text-[var(--color-info)]",
                section.status === 'inactive' && "text-[var(--color-text-dim)]"
              )}>
                {section.name}
              </span>
              <span className="text-[var(--color-text-muted)] flex-1 truncate">
                {section.description}
              </span>
              <span className={cn(
                "text-[8px] px-1 py-0.5 uppercase",
                section.status === 'always' && "bg-[var(--color-success)]/20 text-[var(--color-success)]",
                section.status === 'active' && "bg-[var(--color-info)]/20 text-[var(--color-info)]",
                section.status === 'inactive' && "bg-[var(--color-surface-3)] text-[var(--color-text-dim)]"
              )}>
                {section.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SystemPromptSection;
