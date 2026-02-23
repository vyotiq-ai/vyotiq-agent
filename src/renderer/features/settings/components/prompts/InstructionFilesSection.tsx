/**
 * Instruction Files Configuration Section
 * 
 * Controls which instruction file types are loaded from the workspace
 * (AGENTS.md, CLAUDE.md, .github/copilot-instructions.md, etc.)
 * and their combined content limits.
 */
import React from 'react';
import { FileText } from 'lucide-react';
import type { PromptSectionBaseProps } from './types';
import type { InstructionFilesConfig } from '../../../../../shared/types';
import { DEFAULT_INSTRUCTION_FILES_CONFIG } from '../../../../../shared/types';
import { SettingsGroup, SettingsToggleRow, SettingsSlider } from '../../primitives';

export const InstructionFilesSection: React.FC<PromptSectionBaseProps> = ({ settings, onChange }) => {
  const config: InstructionFilesConfig = settings.instructionFilesConfig ?? DEFAULT_INSTRUCTION_FILES_CONFIG;

  const handleToggle = (field: keyof InstructionFilesConfig) => {
    onChange('instructionFilesConfig', {
      ...config,
      [field]: !config[field],
    });
  };

  const handleSliderChange = (field: keyof InstructionFilesConfig, value: number) => {
    onChange('instructionFilesConfig', {
      ...config,
      [field]: value,
    });
  };

  return (
    <div className="space-y-3">
      <SettingsGroup
        title="instruction file sources"
        icon={<FileText size={11} className="text-[var(--color-accent-primary)]" />}
      >
        <p className="text-[8px] text-[var(--color-text-dim)] mb-2">
          Control which project-level instruction files are loaded into the agent context
        </p>

        <SettingsToggleRow
          label="AGENTS.md"
          description="Load AGENTS.md from workspace root"
          checked={config.enableAgentsMd}
          onToggle={() => handleToggle('enableAgentsMd')}
        />
        <SettingsToggleRow
          label="CLAUDE.md"
          description="Load CLAUDE.md from workspace root"
          checked={config.enableClaudeMd}
          onToggle={() => handleToggle('enableClaudeMd')}
        />
        <SettingsToggleRow
          label=".github/copilot-instructions.md"
          description="Load GitHub Copilot instructions file"
          checked={config.enableCopilotInstructions}
          onToggle={() => handleToggle('enableCopilotInstructions')}
        />
        <SettingsToggleRow
          label=".github/instructions/*.md"
          description="Load all instructions from .github/instructions/"
          checked={config.enableGithubInstructions}
          onToggle={() => handleToggle('enableGithubInstructions')}
        />
        <SettingsToggleRow
          label="GEMINI.md"
          description="Load GEMINI.md from workspace root"
          checked={config.enableGeminiMd}
          onToggle={() => handleToggle('enableGeminiMd')}
        />
        <SettingsToggleRow
          label=".cursor/rules"
          description="Load Cursor rules file from workspace"
          checked={config.enableCursorRules}
          onToggle={() => handleToggle('enableCursorRules')}
        />
      </SettingsGroup>

      <SettingsGroup title="content limits">
        <SettingsSlider
          label="max-combined-length"
          description="Maximum combined content from all instruction files (characters)"
          value={config.maxCombinedContentLength}
          onChange={(v) => handleSliderChange('maxCombinedContentLength', v)}
          min={4000}
          max={128000}
          step={4000}
          format={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k chars` : `${v} chars`}
        />

        <SettingsToggleRow
          label="show-sources"
          description="Include file source annotations in the prompt"
          checked={config.showSourcesInPrompt}
          onToggle={() => handleToggle('showSourcesInPrompt')}
        />
      </SettingsGroup>
    </div>
  );
};
