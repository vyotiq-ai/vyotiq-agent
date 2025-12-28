/**
 * SettingsEditorAI Component
 * 
 * Settings panel for AI-powered editor features:
 * - Inline completions (ghost text)
 * - AI quick fixes
 * - AI code actions
 * - Code Lens AI actions
 */

import React, { memo, useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Wand2,
  Bug,
  Code2,
  Timer,
  Thermometer,
  FileCode,
  Zap,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Trash2,
  BarChart3,
  Eye,
  EyeOff,
  ChevronDown,
  Info,
  Keyboard,
  Layers,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Toggle } from '../../../components/ui/Toggle';
import { RendererLogger } from '../../../utils/logger';
import type { EditorAISettings, LLMProviderName } from '../../../../shared/types';

const logger = new RendererLogger('settings-editor-ai');

// =============================================================================
// Types
// =============================================================================

interface EditorAIStatus {
  initialized: boolean;
  error?: string;
  providers: Array<{ name: string; enabled: boolean; hasApiKey: boolean }>;
  config: unknown;
  hasProviders?: boolean;
  enabledProviders?: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
}

// =============================================================================
// Provider Options
// =============================================================================

const PROVIDER_OPTIONS: Array<{ value: LLMProviderName | 'auto'; label: string; description: string }> = [
  { value: 'auto', label: 'Auto', description: 'Fastest available provider' },
  { value: 'gemini', label: 'Gemini', description: 'Google Gemini Flash' },
  { value: 'openai', label: 'OpenAI', description: 'GPT-4o Mini' },
  { value: 'anthropic', label: 'Anthropic', description: 'Claude 3 Haiku' },
  { value: 'deepseek', label: 'DeepSeek', description: 'DeepSeek Chat' },
];

// =============================================================================
// Diagnostics Component
// =============================================================================

const EditorAIDiagnostics: React.FC = memo(() => {
  const [status, setStatus] = useState<EditorAIStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [cache, setCache] = useState<CacheStats | null>(null);
  const [expanded, setExpanded] = useState(false);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.vyotiq.editorAI.getStatus();
      setStatus(result);
      // Fetch cache stats if available
      if (result.initialized && window.vyotiq.editorAI.getCacheStats) {
        const cacheStats = await window.vyotiq.editorAI.getCacheStats();
        setCache(cacheStats);
      }
    } catch (error) {
      setStatus({
        initialized: false,
        error: error instanceof Error ? error.message : String(error),
        providers: [],
        config: null,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const handleClearCache = useCallback(async () => {
    try {
      await window.vyotiq.editorAI.clearCache();
      setCache({ hits: 0, misses: 0, hitRate: 0 });
    } catch (error) {
      logger.error('Failed to clear cache', { error: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  if (!status && !loading) return null;

  const hasIssues = !status?.initialized || !status?.hasProviders || status?.enabledProviders === 0;

  return (
    <div className="space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-2">
          <BarChart3 size={10} />
          # Service Status
        </div>
        <ChevronDown
          size={12}
          className={cn(
            "text-[var(--color-text-muted)] transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <div className={cn(
          "p-3 rounded border animate-in slide-in-from-top-1 fade-in duration-150",
          hasIssues
            ? "bg-[var(--color-warning)]/5 border-[var(--color-warning)]/20"
            : "bg-[var(--color-success)]/5 border-[var(--color-success)]/20"
        )}>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-2">
              {loading ? (
                <RefreshCw size={12} className="text-[var(--color-text-muted)] mt-0.5 animate-spin" />
              ) : hasIssues ? (
                <AlertCircle size={12} className="text-[var(--color-warning)] mt-0.5 shrink-0" />
              ) : (
                <CheckCircle size={12} className="text-[var(--color-success)] mt-0.5 shrink-0" />
              )}
              <div className="text-[9px] leading-relaxed font-mono">
                {loading ? (
                  <p className="text-[var(--color-text-muted)]">Checking service status...</p>
                ) : status?.error ? (
                  <div>
                    <p className="text-[var(--color-text-secondary)] font-medium mb-1">Service Error</p>
                    <p className="text-[var(--color-text-muted)]">{status.error}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[var(--color-text-secondary)] font-medium">
                      {status?.initialized ? '✓ Service Running' : '✗ Service Not Initialized'}
                    </p>
                    {status?.providers && (
                      <div className="space-y-1">
                        <p className="text-[var(--color-text-muted)]">
                          Providers: {status.enabledProviders}/{status.providers.length} enabled
                        </p>
                        {status.providers.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {status.providers.map((provider) => (
                              <span
                                key={provider.name}
                                className={cn(
                                  "px-1.5 py-0.5 rounded text-[8px]",
                                  provider.enabled && provider.hasApiKey
                                    ? "bg-[var(--color-success)]/20 text-[var(--color-success)]"
                                    : "bg-[var(--color-surface-3)] text-[var(--color-text-placeholder)]"
                                )}
                              >
                                {provider.name}
                              </span>
                            ))}
                          </div>
                        )}
                        {cache && (
                          <div className="mt-2 pt-2 border-t border-[var(--color-border-subtle)]">
                            <p className="text-[var(--color-text-muted)]">
                              Cache: {cache.hits} hits / {cache.misses} misses ({Math.round(cache.hitRate * 100)}% hit rate)
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleClearCache}
                className="p-1 rounded hover:bg-[var(--color-surface-3)] transition-colors"
                title="Clear cache"
              >
                <Trash2 size={10} className="text-[var(--color-text-muted)]" />
              </button>
              <button
                onClick={checkStatus}
                disabled={loading}
                className="p-1 rounded hover:bg-[var(--color-surface-3)] transition-colors"
                title="Refresh status"
              >
                <RefreshCw size={10} className={cn(
                  "text-[var(--color-text-muted)]",
                  loading && "animate-spin"
                )} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

EditorAIDiagnostics.displayName = 'EditorAIDiagnostics';

// =============================================================================
// Feature Toggle Component
// =============================================================================

interface FeatureToggleProps {
  icon: React.ReactNode;
  iconBgClass: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const FeatureToggle: React.FC<FeatureToggleProps> = memo(({
  icon,
  iconBgClass,
  title,
  description,
  checked,
  onChange,
}) => (
  <div className="flex items-center justify-between p-3 rounded bg-[var(--color-surface-2)]/50 border border-[var(--color-border-subtle)]">
    <div className="flex items-center gap-3">
      <div className={cn("p-1.5 rounded", iconBgClass)}>
        {icon}
      </div>
      <div>
        <div className="text-[11px] text-[var(--color-text-primary)] font-medium">
          {title}
        </div>
        <div className="text-[9px] text-[var(--color-text-muted)]">
          {description}
        </div>
      </div>
    </div>
    <Toggle
      checked={checked}
      onToggle={() => onChange(!checked)}
      size="sm"
    />
  </div>
));

FeatureToggle.displayName = 'FeatureToggle';

// =============================================================================
// Slider Setting Component
// =============================================================================

interface SliderSettingProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  formatValue?: (value: number) => string;
  minLabel: string;
  maxLabel: string;
  onChange: (value: number) => void;
}

const SliderSetting: React.FC<SliderSettingProps> = memo(({
  icon,
  label,
  value,
  min,
  max,
  step,
  unit = '',
  formatValue,
  minLabel,
  maxLabel,
  onChange,
}) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[10px] text-[var(--color-text-secondary)] font-mono">
          {label}
        </span>
      </div>
      <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
        {formatValue ? formatValue(value) : value}{unit}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-1.5 rounded-full bg-[var(--color-surface-3)] appearance-none cursor-pointer
        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--color-accent-primary)]
        [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-transform
        [&::-webkit-slider-thumb]:hover:scale-110"
    />
    <div className="flex justify-between text-[8px] text-[var(--color-text-placeholder)] font-mono">
      <span>{minLabel}</span>
      <span>{maxLabel}</span>
    </div>
  </div>
));

SliderSetting.displayName = 'SliderSetting';

// =============================================================================
// Main Component
// =============================================================================

interface SettingsEditorAIProps {
  settings?: EditorAISettings;
  onChange: (field: keyof EditorAISettings, value: EditorAISettings[keyof EditorAISettings]) => void;
}

export const SettingsEditorAI: React.FC<SettingsEditorAIProps> = memo(({
  settings,
  onChange,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (!settings) {
    return (
      <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)] font-mono py-8">
        <RefreshCw size={12} className="animate-spin" />
        # loading editor AI settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-[var(--color-border-subtle)]">
        <Sparkles size={14} className="text-[var(--color-accent-primary)]" />
        <span className="text-[11px] text-[var(--color-text-primary)] font-medium font-mono">
          Editor AI Features
        </span>
      </div>

      {/* Feature Toggles */}
      <div className="space-y-3">
        <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider font-mono">
          # Feature Toggles
        </div>

        <FeatureToggle
          icon={<Wand2 size={14} className="text-[var(--color-accent-primary)]" />}
          iconBgClass="bg-[var(--color-accent-primary)]/10"
          title="Inline Completions"
          description="Show AI-generated ghost text while typing"
          checked={settings.enableInlineCompletions}
          onChange={(checked) => onChange('enableInlineCompletions', checked)}
        />

        <FeatureToggle
          icon={<Bug size={14} className="text-[var(--color-warning)]" />}
          iconBgClass="bg-[var(--color-warning)]/10"
          title="AI Quick Fixes"
          description="Show AI-powered fixes for errors and warnings"
          checked={settings.enableQuickFixes}
          onChange={(checked) => onChange('enableQuickFixes', checked)}
        />

        <FeatureToggle
          icon={<Code2 size={14} className="text-[var(--color-info)]" />}
          iconBgClass="bg-[var(--color-info)]/10"
          title="AI Code Actions"
          description="Enable explain, refactor, optimize, and other AI actions"
          checked={settings.enableCodeActions}
          onChange={(checked) => onChange('enableCodeActions', checked)}
        />
      </div>

      {/* Completion Settings */}
      <div className="space-y-4">
        <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider font-mono">
          # Completion Settings
        </div>

        <SliderSetting
          icon={<Timer size={12} className="text-[var(--color-text-muted)]" />}
          label="Debounce Delay"
          value={settings.inlineCompletionDebounceMs}
          min={100}
          max={1000}
          step={50}
          unit="ms"
          minLabel="100ms (faster)"
          maxLabel="1000ms (slower)"
          onChange={(value) => onChange('inlineCompletionDebounceMs', value)}
        />

        <SliderSetting
          icon={<FileCode size={12} className="text-[var(--color-text-muted)]" />}
          label="Max Completion Tokens"
          value={settings.inlineCompletionMaxTokens}
          min={32}
          max={512}
          step={16}
          minLabel="32 (short)"
          maxLabel="512 (long)"
          onChange={(value) => onChange('inlineCompletionMaxTokens', value)}
        />

        <SliderSetting
          icon={<Thermometer size={12} className="text-[var(--color-text-muted)]" />}
          label="Completion Temperature"
          value={settings.completionTemperature}
          min={0}
          max={1}
          step={0.05}
          formatValue={(v) => v.toFixed(2)}
          minLabel="0.0 (focused)"
          maxLabel="1.0 (creative)"
          onChange={(value) => onChange('completionTemperature', value)}
        />
      </div>

      {/* Advanced Settings Toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors font-mono"
      >
        {showAdvanced ? <EyeOff size={12} /> : <Eye size={12} />}
        {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
        <ChevronDown
          size={12}
          className={cn("transition-transform", showAdvanced && "rotate-180")}
        />
      </button>

      {/* Advanced Settings */}
      {showAdvanced && (
        <div className="space-y-4 animate-in slide-in-from-top-2 fade-in duration-150">
          {/* Context Window */}
          <div className="space-y-3">
            <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider font-mono flex items-center gap-2">
              <Layers size={10} />
              # Context Window
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] text-[var(--color-text-secondary)] font-mono">
                  Lines Before Cursor
                </label>
                <input
                  type="number"
                  min={10}
                  max={200}
                  value={settings.contextLinesBefore}
                  onChange={(e) => onChange('contextLinesBefore', parseInt(e.target.value) || 50)}
                  className="w-full px-2 py-1.5 text-[10px] font-mono rounded border border-[var(--color-border-subtle)]
                    bg-[var(--color-surface-2)] text-[var(--color-text-primary)]
                    focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-[var(--color-text-secondary)] font-mono">
                  Lines After Cursor
                </label>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={settings.contextLinesAfter}
                  onChange={(e) => onChange('contextLinesAfter', parseInt(e.target.value) || 10)}
                  className="w-full px-2 py-1.5 text-[10px] font-mono rounded border border-[var(--color-border-subtle)]
                    bg-[var(--color-surface-2)] text-[var(--color-text-primary)]
                    focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50"
                />
              </div>
            </div>
          </div>

          {/* Provider Selection */}
          <div className="space-y-3">
            <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider font-mono flex items-center gap-2">
              <Zap size={10} />
              # Provider
            </div>

            <div className="space-y-2">
              <div className="relative">
                <select
                  value={settings.preferredProvider}
                  onChange={(e) => onChange('preferredProvider', e.target.value as LLMProviderName | 'auto')}
                  className="w-full px-2 py-2 pr-8 text-[10px] font-mono rounded border border-[var(--color-border-subtle)]
                    bg-[var(--color-surface-2)] text-[var(--color-text-primary)] appearance-none
                    focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50 cursor-pointer"
                >
                  {PROVIDER_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label} - {p.description}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={12}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none"
                />
              </div>
              <p className="text-[8px] text-[var(--color-text-placeholder)] font-mono">
                Auto selects the fastest available provider with an API key configured
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Diagnostics */}
      <EditorAIDiagnostics />

      {/* Keyboard Shortcuts Info */}
      <div className="p-3 rounded bg-[var(--color-info)]/5 border border-[var(--color-info)]/20">
        <div className="flex items-start gap-2">
          <Keyboard size={12} className="text-[var(--color-info)] mt-0.5 shrink-0" />
          <div className="text-[9px] text-[var(--color-text-muted)] leading-relaxed font-mono">
            <p className="mb-1.5">
              <strong className="text-[var(--color-text-secondary)]">Keyboard Shortcuts:</strong>
            </p>
            <ul className="space-y-1">
              <li className="flex items-center gap-2">
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] text-[8px]">Tab</kbd>
                <span>Accept inline completion</span>
              </li>
              <li className="flex items-center gap-2">
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] text-[8px]">Escape</kbd>
                <span>Dismiss completion</span>
              </li>
              <li className="flex items-center gap-2">
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] text-[8px]">Ctrl+Shift+A</kbd>
                <span>Open AI actions menu</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Info Note */}
      <div className="p-3 rounded bg-[var(--color-surface-2)]/50 border border-[var(--color-border-subtle)]">
        <div className="flex items-start gap-2">
          <Info size={12} className="text-[var(--color-text-muted)] mt-0.5 shrink-0" />
          <p className="text-[9px] text-[var(--color-text-muted)] font-mono leading-relaxed">
            Editor AI uses fast models optimized for low latency. For best results, ensure you have
            at least one provider configured with an API key in the Providers section.
          </p>
        </div>
      </div>
    </div>
  );
});

SettingsEditorAI.displayName = 'SettingsEditorAI';

export default SettingsEditorAI;
