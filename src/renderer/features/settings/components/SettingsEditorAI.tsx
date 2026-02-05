/**
 * Settings Editor AI Component
 * 
 * Settings for AI-powered editor features: inline completions, quick fixes, code actions.
 */
import React, { memo, useState, useEffect, useCallback } from 'react';
import { RefreshCw, Trash2, Eye, EyeOff, ChevronDown } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { RendererLogger } from '../../../utils/logger';
import type { EditorAISettings, LLMProviderName } from '../../../../shared/types';
import { SettingsSection, SettingsGroup, SettingsToggleRow, SettingsSlider, SettingsSelect } from '../primitives';

const logger = new RendererLogger('settings-editor-ai');

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

const PROVIDER_OPTIONS = [
  { value: 'auto' as const, label: 'Auto - Fastest available provider' },
  { value: 'gemini' as const, label: 'Gemini - Google Gemini Flash' },
  { value: 'openai' as const, label: 'OpenAI - GPT-4o Mini' },
  { value: 'anthropic' as const, label: 'Anthropic - Claude 3 Haiku' },
  { value: 'deepseek' as const, label: 'DeepSeek - DeepSeek Chat' },
];

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
      if (result.initialized && window.vyotiq.editorAI.getCacheStats) {
        const cacheStats = await window.vyotiq.editorAI.getCacheStats();
        setCache(cacheStats);
      }
    } catch (error) {
      setStatus({ initialized: false, error: error instanceof Error ? error.message : String(error), providers: [], config: null });
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

  useEffect(() => { checkStatus(); }, [checkStatus]);

  if (!status && !loading) return null;

  const hasIssues = !status?.initialized || !status?.hasProviders || status?.enabledProviders === 0;

  return (
    <div className="space-y-3">
      <button onClick={() => setExpanded(!expanded)} className="flex items-center justify-between w-full text-left">
        <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider"># Service Status</div>
        <ChevronDown size={12} className={cn("text-[var(--color-text-muted)] transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className={cn(
          "p-3 border animate-in slide-in-from-top-1 fade-in duration-150",
          hasIssues ? "bg-[var(--color-warning)]/5 border-[var(--color-warning)]/20" : "bg-[var(--color-success)]/5 border-[var(--color-success)]/20"
        )}>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-2">
              {loading && <RefreshCw size={12} className="text-[var(--color-text-muted)] mt-0.5 animate-spin" />}
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
                    <p className="text-[var(--color-text-secondary)] font-medium">{status?.initialized ? '✓ Service Running' : '✗ Service Not Initialized'}</p>
                    {status?.providers && (
                      <div className="space-y-1">
                        <p className="text-[var(--color-text-muted)]">Providers: {status.enabledProviders}/{status.providers.length} enabled</p>
                        {status.providers.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {status.providers.map((provider) => (
                              <span key={provider.name} className={cn("px-1.5 py-0.5 text-[8px]", provider.enabled && provider.hasApiKey ? "bg-[var(--color-success)]/20 text-[var(--color-success)]" : "bg-[var(--color-surface-3)] text-[var(--color-text-placeholder)]")}>
                                {provider.name}
                              </span>
                            ))}
                          </div>
                        )}
                        {cache && (
                          <div className="mt-2 pt-2 border-t border-[var(--color-border-subtle)]">
                            <p className="text-[var(--color-text-muted)]">Cache: {cache.hits} hits / {cache.misses} misses ({Math.round(cache.hitRate * 100)}% hit rate)</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={handleClearCache} className="p-1 hover:bg-[var(--color-surface-3)] transition-colors" title="Clear cache"><Trash2 size={10} className="text-[var(--color-text-muted)]" /></button>
              <button onClick={checkStatus} disabled={loading} className="p-1 hover:bg-[var(--color-surface-3)] transition-colors" title="Refresh status"><RefreshCw size={10} className={cn("text-[var(--color-text-muted)]", loading && "animate-spin")} /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

EditorAIDiagnostics.displayName = 'EditorAIDiagnostics';

interface SettingsEditorAIProps {
  settings?: EditorAISettings;
  onChange: (field: keyof EditorAISettings, value: EditorAISettings[keyof EditorAISettings]) => void;
}

export const SettingsEditorAI: React.FC<SettingsEditorAIProps> = memo(({ settings, onChange }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (!settings) {
    return <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)] font-mono py-8"><RefreshCw size={12} className="animate-spin" /># loading editor AI settings...</div>;
  }

  return (
    <SettingsSection title="editor ai" description="AI-powered editor features: inline completions, quick fixes, code actions">
      {/* Feature Toggles */}
      <SettingsGroup title="feature toggles">
        <SettingsToggleRow label="Inline Completions" description="Show AI-generated ghost text while typing" checked={settings.enableInlineCompletions} onToggle={() => onChange('enableInlineCompletions', !settings.enableInlineCompletions)} />
        <SettingsToggleRow label="AI Quick Fixes" description="Show AI-powered fixes for errors and warnings" checked={settings.enableQuickFixes} onToggle={() => onChange('enableQuickFixes', !settings.enableQuickFixes)} />
        <SettingsToggleRow label="AI Code Actions" description="Enable explain, refactor, optimize, and other AI actions" checked={settings.enableCodeActions} onToggle={() => onChange('enableCodeActions', !settings.enableCodeActions)} />
      </SettingsGroup>

      {/* Completion Settings */}
      <SettingsGroup title="completion settings">
        <SettingsSlider label="Debounce Delay" description="Time to wait before triggering completion" value={settings.inlineCompletionDebounceMs} onChange={(v) => onChange('inlineCompletionDebounceMs', v)} min={100} max={1000} step={50} format={(v) => `${v}ms`} />
        <SettingsSlider label="Max Completion Tokens" description="Maximum tokens for completion response" value={settings.inlineCompletionMaxTokens} onChange={(v) => onChange('inlineCompletionMaxTokens', v)} min={32} max={512} step={16} />
        <SettingsSlider label="Completion Temperature" description="Controls randomness of completions" value={settings.completionTemperature} onChange={(v) => onChange('completionTemperature', v)} min={0} max={1} step={0.05} format={(v) => v.toFixed(2)} />
      </SettingsGroup>

      {/* Advanced Settings Toggle */}
      <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-2 text-[9px] sm:text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors font-mono">
        {showAdvanced ? <EyeOff size={12} /> : <Eye size={12} />}
        {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
        <ChevronDown size={12} className={cn("transition-transform", showAdvanced && "rotate-180")} />
      </button>

      {/* Advanced Settings */}
      {showAdvanced && (
        <div className="space-y-3 sm:space-y-4 animate-in slide-in-from-top-2 fade-in duration-150">
          <SettingsGroup title="context window">
            <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[9px] sm:text-[10px] text-[var(--color-text-secondary)] font-mono">Lines Before Cursor</label>
                <input
                  type="number"
                  min={10}
                  max={200}
                  value={settings.contextLinesBefore}
                  onChange={(e) => onChange('contextLinesBefore', parseInt(e.target.value) || 50)}
                  className="w-full px-2 py-1.5 sm:py-1.5 text-[10px] font-mono border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] text-[var(--color-text-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] sm:text-[10px] text-[var(--color-text-secondary)] font-mono">Lines After Cursor</label>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={settings.contextLinesAfter}
                  onChange={(e) => onChange('contextLinesAfter', parseInt(e.target.value) || 10)}
                  className="w-full px-2 py-1.5 sm:py-1.5 text-[10px] font-mono border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] text-[var(--color-text-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50"
                />
              </div>
            </div>
          </SettingsGroup>

          <SettingsGroup title="provider">
            <SettingsSelect
              label="Preferred Provider"
              description="Auto selects the fastest available provider with an API key configured"
              value={settings.preferredProvider}
              options={PROVIDER_OPTIONS}
              onChange={(v) => onChange('preferredProvider', v as LLMProviderName | 'auto')}
            />
          </SettingsGroup>
        </div>
      )}

      {/* Diagnostics */}
      <EditorAIDiagnostics />

      {/* Keyboard Shortcuts Info */}
      <div className="p-3 bg-[var(--color-info)]/5 border border-[var(--color-info)]/20">
        <div className="text-[9px] text-[var(--color-text-muted)] leading-relaxed font-mono">
          <p className="mb-1.5"><strong className="text-[var(--color-text-secondary)]">Keyboard Shortcuts:</strong></p>
          <ul className="space-y-1">
            <li className="flex items-center gap-2"><kbd className="px-1.5 py-0.5 bg-[var(--color-surface-2)] text-[8px]">Tab</kbd><span>Accept inline completion</span></li>
            <li className="flex items-center gap-2"><kbd className="px-1.5 py-0.5 bg-[var(--color-surface-2)] text-[8px]">Escape</kbd><span>Dismiss completion</span></li>
            <li className="flex items-center gap-2"><kbd className="px-1.5 py-0.5 bg-[var(--color-surface-2)] text-[8px]">Ctrl+Shift+A</kbd><span>Open AI actions menu</span></li>
          </ul>
        </div>
      </div>

      {/* Info Note */}
      <div className="p-3 bg-[var(--color-surface-2)]/50 border border-[var(--color-border-subtle)]">
        <p className="text-[9px] text-[var(--color-text-muted)] font-mono leading-relaxed">
          Editor AI uses fast models optimized for low latency. For best results, ensure you have at least one provider configured with an API key in the Providers section.
        </p>
      </div>
    </SettingsSection>
  );
});

SettingsEditorAI.displayName = 'SettingsEditorAI';

export default SettingsEditorAI;
