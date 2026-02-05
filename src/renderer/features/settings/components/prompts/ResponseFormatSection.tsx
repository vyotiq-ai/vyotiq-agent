/**
 * Response Format Section
 * 
 * Manages response format preferences (code style, explanation detail, etc).
 */
import React from 'react';
import { RotateCcw } from 'lucide-react';
import { SettingsToggleRow, SettingsSelect } from '../../primitives';
import type { ResponseFormatSectionProps } from './types';

export const ResponseFormatSection: React.FC<ResponseFormatSectionProps> = ({
  responseFormat,
  onFormatChange,
  onReset,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
        <span>response format preferences</span>
        <button
          onClick={onReset}
          className="flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          title="Reset to defaults"
        >
          <RotateCcw size={12} />
          <span>Reset</span>
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsSelect
          label="code-style"
          value={responseFormat.codeBlockStyle}
          onChange={(v) => onFormatChange('codeBlockStyle', v as 'fenced' | 'indented')}
          options={[
            { value: 'fenced', label: 'Fenced (```)' },
            { value: 'indented', label: 'Indented' },
          ]}
        />

        <SettingsSelect
          label="explanation-level"
          value={responseFormat.explanationDetail}
          onChange={(v) => onFormatChange('explanationDetail', v as 'minimal' | 'moderate' | 'detailed')}
          options={[
            { value: 'minimal', label: 'Minimal' },
            { value: 'moderate', label: 'Moderate' },
            { value: 'detailed', label: 'Detailed' },
          ]}
        />

        <SettingsSelect
          label="max-length"
          value={responseFormat.maxResponseLength}
          onChange={(v) => onFormatChange('maxResponseLength', v as 'short' | 'medium' | 'long' | 'unlimited')}
          options={[
            { value: 'short', label: 'Short' },
            { value: 'medium', label: 'Medium' },
            { value: 'long', label: 'Long' },
            { value: 'unlimited', label: 'Unlimited' },
          ]}
        />

        <SettingsSelect
          label="tone"
          value={responseFormat.tone}
          onChange={(v) => onFormatChange('tone', v as 'professional' | 'casual' | 'technical' | 'friendly')}
          options={[
            { value: 'professional', label: 'Professional' },
            { value: 'casual', label: 'Casual' },
            { value: 'technical', label: 'Technical' },
            { value: 'friendly', label: 'Friendly' },
          ]}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SettingsToggleRow
          label="line-numbers"
          description="Include line numbers in code blocks"
          checked={responseFormat.includeLineNumbers}
          onToggle={() => onFormatChange('includeLineNumbers', !responseFormat.includeLineNumbers)}
        />
        <SettingsToggleRow
          label="include-examples"
          description="Include examples in explanations"
          checked={responseFormat.includeExamples}
          onToggle={() => onFormatChange('includeExamples', !responseFormat.includeExamples)}
        />
        <SettingsToggleRow
          label="use-markdown"
          description="Use markdown formatting"
          checked={responseFormat.useMarkdown}
          onToggle={() => onFormatChange('useMarkdown', !responseFormat.useMarkdown)}
        />
        <SettingsToggleRow
          label="use-headers"
          description="Break up responses with headers"
          checked={responseFormat.useHeaders}
          onToggle={() => onFormatChange('useHeaders', !responseFormat.useHeaders)}
        />
      </div>
    </div>
  );
};

export default ResponseFormatSection;
