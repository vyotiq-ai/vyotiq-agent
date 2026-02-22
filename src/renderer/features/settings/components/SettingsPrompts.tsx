/**
 * Settings Prompts Section
 * 
 * System prompt customization including:
 * - Custom system prompt
 * - Role/persona selection
 * - Agent instructions (specialized behavior definitions)
 * - AGENTS.md file support (project-specific agent instructions)
 * - Context injection rules
 * - Response format preferences
 * 
 * Refactored to use sub-components for each section.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { SettingsSection } from '../primitives';
import { cn } from '../../../utils/cn';
import {
  SystemPromptSection,
  PersonaSection,
  AgentInstructionsSection,
  ContextRulesSection,
  ResponseFormatSection,
} from './prompts';
import type { PromptSettings, ResponseFormatPreferences } from '../../../../shared/types';
import { DEFAULT_RESPONSE_FORMAT } from '../../../../shared/types';

interface SettingsPromptsProps {
  settings: PromptSettings;
  onChange: <K extends keyof PromptSettings>(field: K, value: PromptSettings[K]) => void;
}

type PromptsSubSection = 'system-prompt' | 'personas' | 'agent-instructions' | 'context-rules' | 'response-format';

const SUB_SECTIONS: { id: PromptsSubSection; label: string }[] = [
  { id: 'system-prompt', label: 'System Prompt' },
  { id: 'personas', label: 'Personas' },
  { id: 'agent-instructions', label: 'Agents' },
  { id: 'context-rules', label: 'Context Rules' },
  { id: 'response-format', label: 'Response Format' },
];

export const SettingsPrompts: React.FC<SettingsPromptsProps> = ({ settings, onChange }) => {
  const [activeSubSection, setActiveSubSection] = useState<PromptsSubSection>('system-prompt');

  // Get the active persona
  const activePersona = useMemo(() => {
    return settings.personas.find(p => p.id === settings.activePersonaId) ?? settings.personas[0];
  }, [settings.personas, settings.activePersonaId]);

  // Handle response format change
  const handleResponseFormatChange = useCallback(<K extends keyof ResponseFormatPreferences>(
    field: K,
    value: ResponseFormatPreferences[K]
  ) => {
    onChange('responseFormat', {
      ...settings.responseFormat,
      [field]: value,
    });
  }, [onChange, settings.responseFormat]);

  // Handle response format reset
  const handleResponseFormatReset = useCallback(() => {
    onChange('responseFormat', DEFAULT_RESPONSE_FORMAT);
  }, [onChange]);

  return (
    <SettingsSection
      title="Prompts"
      description="Customize system prompts, personas, and response behavior"
    >
      {/* Sub-section tabs */}
      <div className="flex flex-wrap gap-1 border-b border-[var(--color-border-subtle)] pb-2">
        {SUB_SECTIONS.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSubSection(section.id)}
            className={cn(
              "px-2 py-1 text-[10px] transition-colors",
              activeSubSection === section.id
                ? "bg-[var(--color-surface-2)] text-[var(--color-accent-primary)] border-b border-[var(--color-accent-primary)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)]"
            )}
          >
            {section.label}
          </button>
        ))}
      </div>

      {/* Render active section */}
      {activeSubSection === 'system-prompt' && (
        <SystemPromptSection
          settings={settings}
          onChange={onChange}
          activePersona={activePersona}
        />
      )}

      {activeSubSection === 'personas' && (
        <PersonaSection
          settings={settings}
          onChange={onChange}
        />
      )}

      {activeSubSection === 'agent-instructions' && (
        <AgentInstructionsSection
          settings={settings}
          onChange={onChange}
        />
      )}

      {activeSubSection === 'context-rules' && (
        <ContextRulesSection
          settings={settings}
          onChange={onChange}
        />
      )}

      {activeSubSection === 'response-format' && (
        <ResponseFormatSection
          responseFormat={settings.responseFormat}
          onFormatChange={handleResponseFormatChange}
          onReset={handleResponseFormatReset}
        />
      )}
    </SettingsSection>
  );
};

export default SettingsPrompts;
