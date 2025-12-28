/**
 * Settings Autocomplete Section
 * 
 * AI autocomplete configuration including:
 * - Enable/disable autocomplete
 * - Debounce delay
 * - Minimum characters to trigger
 * - Max tokens for suggestions
 * - Temperature setting
 */
import React, { useCallback } from 'react';
import { Sparkles, Timer, Type, Gauge, Thermometer, Cpu, ChevronDown } from 'lucide-react';
import { Toggle } from '../../../components/ui/Toggle';
import { cn } from '../../../utils/cn';
import type { AutocompleteSettings, LLMProviderName } from '../../../../shared/types';

/** Available provider options for autocomplete */
const PROVIDER_OPTIONS: Array<{ value: LLMProviderName | 'auto'; label: string }> = [
  { value: 'auto', label: 'Auto (fastest available)' },
  { value: 'gemini', label: 'Gemini (gemini-2.0-flash)' },
  { value: 'openai', label: 'OpenAI (gpt-4o-mini)' },
  { value: 'anthropic', label: 'Anthropic (claude-3-haiku)' },
  { value: 'deepseek', label: 'DeepSeek (deepseek-chat)' },
];

interface SettingsAutocompleteProps {
  settings: AutocompleteSettings;
  onChange: <K extends keyof AutocompleteSettings>(field: K, value: AutocompleteSettings[K]) => void;
}

/**
 * Settings section for AI autocomplete feature
 */
export const SettingsAutocomplete: React.FC<SettingsAutocompleteProps> = ({ settings, onChange }) => {
  const handleNumberChange = useCallback(
    (field: keyof AutocompleteSettings, min: number, max: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value);
      if (!isNaN(value) && value >= min && value <= max) {
        onChange(field, value);
      }
    },
    [onChange]
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-[var(--color-border-subtle)]">
        <Sparkles size={14} className="text-[var(--color-accent-secondary)]" />
        <span className="text-[11px] font-mono text-[var(--color-text-primary)] font-medium">
          AI Autocomplete
        </span>
      </div>

      {/* Enable toggle */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Sparkles size={12} className="text-[var(--color-text-muted)]" />
              <span className="text-[10px] font-mono text-[var(--color-text-secondary)]">
                Enable AI Autocomplete
              </span>
            </div>
            <p className="text-[9px] font-mono text-[var(--color-text-muted)] mt-1 ml-[18px]">
              Show inline suggestions as you type in the chat input
            </p>
          </div>
          <Toggle
            checked={settings.enabled}
            onToggle={() => onChange('enabled', !settings.enabled)}
            size="sm"
          />
        </div>

        {/* Only show other settings when enabled */}
        {settings.enabled && (
          <>
            {/* Debounce delay */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Timer size={12} className="text-[var(--color-text-muted)]" />
                  <span className="text-[10px] font-mono text-[var(--color-text-secondary)]">
                    Debounce Delay
                  </span>
                </div>
                <p className="text-[9px] font-mono text-[var(--color-text-muted)] mt-1 ml-[18px]">
                  Wait time before requesting suggestions (ms)
                </p>
              </div>
              <input
                type="number"
                min={100}
                max={2000}
                step={50}
                value={settings.debounceMs}
                onChange={handleNumberChange('debounceMs', 100, 2000)}
                className={cn(
                  'w-20 px-2 py-1 text-[10px] font-mono',
                  'bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]',
                  'rounded-sm text-[var(--color-text-primary)]',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                )}
              />
            </div>

            {/* Minimum characters */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Type size={12} className="text-[var(--color-text-muted)]" />
                  <span className="text-[10px] font-mono text-[var(--color-text-secondary)]">
                    Minimum Characters
                  </span>
                </div>
                <p className="text-[9px] font-mono text-[var(--color-text-muted)] mt-1 ml-[18px]">
                  Characters needed before triggering suggestions
                </p>
              </div>
              <input
                type="number"
                min={1}
                max={20}
                step={1}
                value={settings.minChars}
                onChange={handleNumberChange('minChars', 1, 20)}
                className={cn(
                  'w-20 px-2 py-1 text-[10px] font-mono',
                  'bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]',
                  'rounded-sm text-[var(--color-text-primary)]',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                )}
              />
            </div>

            {/* Max tokens */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Gauge size={12} className="text-[var(--color-text-muted)]" />
                  <span className="text-[10px] font-mono text-[var(--color-text-secondary)]">
                    Max Tokens
                  </span>
                </div>
                <p className="text-[9px] font-mono text-[var(--color-text-muted)] mt-1 ml-[18px]">
                  Maximum length of suggested text
                </p>
              </div>
              <input
                type="number"
                min={10}
                max={200}
                step={10}
                value={settings.maxTokens}
                onChange={handleNumberChange('maxTokens', 10, 200)}
                className={cn(
                  'w-20 px-2 py-1 text-[10px] font-mono',
                  'bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]',
                  'rounded-sm text-[var(--color-text-primary)]',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                )}
              />
            </div>

            {/* Temperature */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Thermometer size={12} className="text-[var(--color-text-muted)]" />
                  <span className="text-[10px] font-mono text-[var(--color-text-secondary)]">
                    Temperature
                  </span>
                </div>
                <p className="text-[9px] font-mono text-[var(--color-text-muted)] mt-1 ml-[18px]">
                  Creativity of suggestions (0 = focused, 1 = creative)
                </p>
              </div>
              <input
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={settings.temperature}
                onChange={handleNumberChange('temperature', 0, 1)}
                className={cn(
                  'w-20 px-2 py-1 text-[10px] font-mono',
                  'bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]',
                  'rounded-sm text-[var(--color-text-primary)]',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                )}
              />
            </div>

            {/* Preferred Provider */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Cpu size={12} className="text-[var(--color-text-muted)]" />
                  <span className="text-[10px] font-mono text-[var(--color-text-secondary)]">
                    Preferred Provider
                  </span>
                </div>
                <p className="text-[9px] font-mono text-[var(--color-text-muted)] mt-1 ml-[18px]">
                  Select which provider to use for autocomplete
                </p>
              </div>
              <div className="relative">
                <select
                  value={settings.preferredProvider}
                  onChange={(e) => onChange('preferredProvider', e.target.value as LLMProviderName | 'auto')}
                  className={cn(
                    'w-44 px-2 py-1 pr-7 text-[10px] font-mono appearance-none',
                    'bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]',
                    'rounded-sm text-[var(--color-text-primary)]',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40',
                    'cursor-pointer'
                  )}
                >
                  {PROVIDER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown 
                  size={12} 
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" 
                />
              </div>
            </div>

            {/* Info note */}
            <div className="mt-4 p-2 bg-[var(--color-surface-1)] rounded border border-[var(--color-border-subtle)]">
              <p className="text-[9px] font-mono text-[var(--color-text-muted)]">
                <span className="text-[var(--color-accent-secondary)]">ℹ</span> Autocomplete uses a fast model from your configured providers.
                Press <kbd className="px-1 py-0.5 bg-[var(--color-surface-2)] rounded text-[8px]">Tab</kbd> to accept full suggestion,
                <kbd className="px-1 py-0.5 bg-[var(--color-surface-2)] rounded text-[8px] ml-1">Ctrl+→</kbd> for one word,
                <kbd className="px-1 py-0.5 bg-[var(--color-surface-2)] rounded text-[8px] ml-1">Esc</kbd> to dismiss.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SettingsAutocomplete;
