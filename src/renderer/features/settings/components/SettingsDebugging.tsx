/**
 * Settings Debugging Component
 * 
 * Configure debug output, tracing, and step-by-step execution.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { 
  FileText, Download, Play, AlertTriangle, Eye, RefreshCw, Terminal,
  ChevronDown, ChevronRight, Copy
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import type { DebugSettings } from '../../../../shared/types';
import { cn } from '../../../utils/cn';
import { createLogger } from '../../../utils/logger';
import { SettingsSection, SettingsToggleRow, SettingsSlider } from '../primitives';
import { formatDuration, formatDate } from '../utils/formatters';

const logger = createLogger('SettingsDebugging');

interface SettingsDebuggingProps {
  settings: DebugSettings;
  onChange: (field: keyof DebugSettings, value: DebugSettings[keyof DebugSettings]) => void;
}

interface TraceSummary {
  traceId: string;
  sessionId: string;
  runId: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  metrics: { totalSteps: number; llmCalls: number; toolCalls: number; successfulToolCalls: number; failedToolCalls: number; totalInputTokens: number; totalOutputTokens: number };
  error?: { message: string };
}

const LOG_LEVELS: Array<{ value: DebugSettings['logLevel']; label: string; description: string }> = [
  { value: 'error', label: 'Error', description: 'Only critical errors' },
  { value: 'warn', label: 'Warning', description: 'Errors and warnings' },
  { value: 'info', label: 'Info', description: 'General information' },
  { value: 'debug', label: 'Debug', description: 'Detailed debug output' },
  { value: 'trace', label: 'Trace', description: 'Most verbose output' },
];

const EXPORT_FORMATS: Array<{ value: DebugSettings['traceExportFormat']; label: string }> = [
  { value: 'json', label: 'JSON' },
  { value: 'markdown', label: 'Markdown' },
];

export const SettingsDebugging: React.FC<SettingsDebuggingProps> = ({ settings, onChange }) => {
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [activeTrace, setActiveTrace] = useState<TraceSummary | null>(null);
  const [isLoadingTraces, setIsLoadingTraces] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>('logging');
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const { toast } = useToast();

  const fetchTraces = useCallback(async () => {
    setIsLoadingTraces(true);
    try {
      const activeTraceData = await window.vyotiq.debug.getActiveTrace();
      if (activeTraceData) {
        setActiveTrace({
          traceId: activeTraceData.traceId, sessionId: activeTraceData.sessionId, runId: activeTraceData.runId,
          status: activeTraceData.status, startedAt: activeTraceData.startedAt, completedAt: activeTraceData.completedAt,
          durationMs: activeTraceData.durationMs, metrics: activeTraceData.metrics, error: activeTraceData.error,
        });
      }
      
      const sessions = await window.vyotiq.agent.getSessions();
      const allTraces: TraceSummary[] = [];
      
      for (const session of sessions.slice(0, 5)) {
        const sessionTraces = await window.vyotiq.debug.getTraces(session.id);
        allTraces.push(...sessionTraces.map(t => ({
          traceId: t.traceId, sessionId: t.sessionId, runId: t.runId, status: t.status, startedAt: t.startedAt,
          completedAt: t.completedAt, durationMs: t.durationMs, metrics: t.metrics, error: t.error,
        })));
      }
      
      allTraces.sort((a, b) => b.startedAt - a.startedAt);
      setTraces(allTraces.slice(0, 20));
      setLastRefresh(new Date());
    } catch (error) {
      logger.error('Failed to fetch traces', { error });
    } finally {
      setIsLoadingTraces(false);
    }
  }, []);

  useEffect(() => { fetchTraces(); }, [fetchTraces]);

  const handleExportTrace = async (traceId: string, format: 'json' | 'markdown') => {
    setIsExporting(traceId);
    try {
      const result = await window.vyotiq.debug.saveTraceToFile(traceId, format);
      if (!result.success) logger.error('Failed to export trace', { error: result.error });
    } catch (error) {
      logger.error('Failed to export trace', { error });
    } finally {
      setIsExporting(null);
    }
  };

  const handleCopyTraceId = async (traceId: string) => {
    try {
      await navigator.clipboard.writeText(traceId);
      toast({ type: 'success', message: 'Trace ID copied to clipboard' });
    } catch (error) {
      logger.error('Failed to copy trace ID', { error });
      toast({ type: 'error', message: 'Failed to copy trace ID' });
    }
  };

  const toggleSection = (section: string) => setExpandedSection(expandedSection === section ? null : section);

  const renderSectionHeader = (id: string, icon: React.ReactNode, title: string, description?: string) => (
    <button
      onClick={() => toggleSection(id)}
      aria-expanded={expandedSection === id}
      className="w-full flex items-center justify-between py-2 text-left group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
    >
      <div className="flex items-center gap-2">
        <span className="text-[var(--color-text-muted)]">{icon}</span>
        <span className="text-[11px] text-[var(--color-text-primary)]">{title}</span>
        {description && <span className="text-[9px] text-[var(--color-text-muted)] hidden sm:inline"># {description}</span>}
      </div>
      {expandedSection === id ? <ChevronDown size={12} className="text-[var(--color-text-muted)]" /> : <ChevronRight size={12} className="text-[var(--color-text-muted)]" />}
    </button>
  );

  return (
    <SettingsSection title="debugging" description="Configure debug output, tracing, and step-by-step execution">
      {/* Logging Section */}
      <div className="border border-[var(--color-border-subtle)]">
        {renderSectionHeader('logging', <Terminal size={12} />, 'Logging Configuration', 'verbose output settings')}
        {expandedSection === 'logging' && (
          <div className="px-2 sm:px-3 pb-3 space-y-3 border-t border-[var(--color-border-subtle)]">
            <SettingsToggleRow label="verbose-logging" description="Output detailed debug information to console" checked={settings.verboseLogging} onToggle={() => onChange('verboseLogging', !settings.verboseLogging)} />
            <div>
              <label className="text-[9px] sm:text-[10px] text-[var(--color-text-primary)] block mb-1.5">Log Level</label>
              <div className="grid grid-cols-3 xs:grid-cols-5 gap-1">
                {LOG_LEVELS.map((level) => (
                  <button
                    key={level.value}
                    onClick={() => onChange('logLevel', level.value)}
                    className={cn(
                      'px-1.5 sm:px-2 py-1.5 text-[9px] sm:text-[10px] border transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40',
                      settings.logLevel === level.value
                        ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]'
                        : 'border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:border-[var(--color-border-medium)]'
                    )}
                    title={level.description}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-[var(--color-text-muted)] mt-1">{LOG_LEVELS.find(l => l.value === settings.logLevel)?.description}</p>
            </div>
            <SettingsToggleRow label="capture-full-payloads" description="Store complete request/response data for debugging" checked={settings.captureFullPayloads} onToggle={() => onChange('captureFullPayloads', !settings.captureFullPayloads)} />
          </div>
        )}
      </div>

      {/* Execution Control Section */}
      <div className="border border-[var(--color-border-subtle)]">
        {renderSectionHeader('execution', <Play size={12} />, 'Execution Control', 'step-by-step mode')}
        {expandedSection === 'execution' && (
          <div className="px-3 pb-3 space-y-3 border-t border-[var(--color-border-subtle)]">
            <SettingsToggleRow label="step-by-step-mode" description="Pause before each step for manual inspection" checked={settings.stepByStepMode} onToggle={() => onChange('stepByStepMode', !settings.stepByStepMode)} />
            <SettingsToggleRow label="break-on-error" description="Automatically pause execution when an error occurs" checked={settings.breakOnError} onToggle={() => onChange('breakOnError', !settings.breakOnError)} />
            <div>
              <label className="text-[10px] text-[var(--color-text-primary)] block mb-1.5">Break on Tools (comma-separated)</label>
              <input
                type="text"
                value={settings.breakOnTools}
                onChange={(e) => onChange('breakOnTools', e.target.value)}
                placeholder="e.g., write_file, run_command"
                className="w-full px-2 py-1.5 text-[10px] bg-[var(--color-surface-input)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:border-[var(--color-accent-primary)]"
              />
              <p className="text-[9px] text-[var(--color-text-muted)] mt-1">Pause execution when these tools are called</p>
            </div>
          </div>
        )}
      </div>

      {/* Trace Export Section */}
      <div className="border border-[var(--color-border-subtle)]">
        {renderSectionHeader('export', <Download size={12} />, 'Trace Export', 'export and auto-save settings')}
        {expandedSection === 'export' && (
          <div className="px-3 pb-3 space-y-3 border-t border-[var(--color-border-subtle)]">
            <SettingsToggleRow label="auto-export-on-error" description="Automatically save traces when execution fails" checked={settings.autoExportOnError} onToggle={() => onChange('autoExportOnError', !settings.autoExportOnError)} />
            <div>
              <label className="text-[10px] text-[var(--color-text-primary)] block mb-1.5">Export Format</label>
              <div className="flex gap-2">
                {EXPORT_FORMATS.map((format) => (
                  <button
                    key={format.value}
                    onClick={() => onChange('traceExportFormat', format.value)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 text-[10px] border transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40',
                      settings.traceExportFormat === format.value
                        ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]'
                        : 'border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:border-[var(--color-border-medium)]'
                    )}
                  >
                    <FileText size={12} />{format.label}
                  </button>
                ))}
              </div>
            </div>
            <SettingsToggleRow label="include-payloads-in-export" description="Include complete request/response data in exported traces" checked={settings.includeFullPayloadsInExport} onToggle={() => onChange('includeFullPayloadsInExport', !settings.includeFullPayloadsInExport)} />
            <SettingsSlider label="max-preview-length" description="Characters to show in trace previews" value={settings.maxPreviewLength} onChange={(v) => onChange('maxPreviewLength', v)} min={100} max={2000} step={100} format={(v) => `${v} chars`} />
          </div>
        )}
      </div>

      {/* Trace Viewer Section */}
      <div className="border border-[var(--color-border-subtle)]">
        {renderSectionHeader('viewer', <Eye size={12} />, 'Trace Viewer', 'display preferences')}
        {expandedSection === 'viewer' && (
          <div className="px-3 pb-3 space-y-3 border-t border-[var(--color-border-subtle)]">
            <SettingsToggleRow label="auto-scroll" description="Automatically scroll when new trace steps appear" checked={settings.autoScrollTraceViewer} onToggle={() => onChange('autoScrollTraceViewer', !settings.autoScrollTraceViewer)} />
            <SettingsToggleRow label="show-token-usage" description="Display token counts in trace steps" checked={settings.showTokenUsage} onToggle={() => onChange('showTokenUsage', !settings.showTokenUsage)} />
            <SettingsToggleRow label="show-timing" description="Display duration details for each step" checked={settings.showTimingBreakdown} onToggle={() => onChange('showTimingBreakdown', !settings.showTimingBreakdown)} />
            <SettingsSlider label="slow-step-threshold" description="Steps taking longer than this will be highlighted as slow" value={settings.highlightDurationThreshold} onChange={(v) => onChange('highlightDurationThreshold', v)} min={1000} max={30000} step={1000} format={(v) => `${v}ms`} />
          </div>
        )}
      </div>

      {/* Session Traces Section */}
      <div className="border border-[var(--color-border-subtle)]">
        {renderSectionHeader('traces', <FileText size={12} />, 'Session Traces', 'view and export traces')}
        {expandedSection === 'traces' && (
          <div className="px-3 pb-3 border-t border-[var(--color-border-subtle)]">
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--color-text-muted)]">{traces.length} trace{traces.length !== 1 ? 's' : ''}</span>
                {lastRefresh && <span className="text-[9px] text-[var(--color-text-muted)]">• last updated {formatDate(lastRefresh.getTime())}</span>}
              </div>
              <Button variant="ghost" size="sm" onClick={fetchTraces} disabled={isLoadingTraces} leftIcon={<RefreshCw size={10} className={isLoadingTraces ? 'animate-spin' : ''} />}>Refresh</Button>
            </div>

            {activeTrace && (
              <div className="mb-3 p-2 border border-[var(--color-accent-primary)]/30 bg-[var(--color-accent-primary)]/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--color-accent-primary)]" />
                    <span className="text-[10px] text-[var(--color-accent-primary)]">Active Trace</span>
                  </div>
                  <span className="text-[9px] text-[var(--color-text-muted)]">{activeTrace.metrics.totalSteps} steps</span>
                </div>
              </div>
            )}

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {isLoadingTraces ? (
                <div className="text-[10px] text-[var(--color-text-muted)] text-center py-4">Loading traces...</div>
              ) : traces.length === 0 ? (
                <div className="text-[10px] text-[var(--color-text-muted)] text-center py-4">No traces available</div>
              ) : (
                traces.map((trace) => (
                  <div key={trace.traceId} className="p-2 border border-[var(--color-border-subtle)] hover:border-[var(--color-border-medium)] transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'w-1.5 h-1.5 rounded-full flex-shrink-0',
                            trace.status === 'completed' && 'bg-[var(--color-success)]',
                            trace.status === 'failed' && 'bg-[var(--color-error)]',
                            trace.status === 'running' && 'bg-[var(--color-accent-primary)]',
                            trace.status === 'paused' && 'bg-[var(--color-warning)]'
                          )} />
                          <span className="text-[10px] text-[var(--color-text-primary)] truncate">{trace.traceId.slice(0, 8)}</span>
                          <button onClick={() => handleCopyTraceId(trace.traceId)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40" title="Copy trace ID">
                            <Copy size={10} />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[9px] text-[var(--color-text-muted)]">{formatDate(trace.startedAt)}</span>
                          {trace.durationMs && <span className="text-[9px] text-[var(--color-text-muted)]">• {formatDuration(trace.durationMs)}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-[9px] text-[var(--color-text-muted)]">
                        <span title="Total steps">{trace.metrics.totalSteps} steps</span>
                        <span title="LLM calls">{trace.metrics.llmCalls} LLM</span>
                        <span title="Tool calls">{trace.metrics.successfulToolCalls}/{trace.metrics.toolCalls} tools</span>
                      </div>
                      <button onClick={() => handleExportTrace(trace.traceId, 'json')} disabled={isExporting === trace.traceId} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40" title="Export as JSON">
                        <Download size={12} />
                      </button>
                    </div>
                    {trace.error && (
                      <div className="mt-2 px-2 py-1 bg-[var(--color-error)]/10 border border-[var(--color-error)]/30">
                        <div className="flex items-center gap-1">
                          <AlertTriangle size={10} className="text-[var(--color-error)]" />
                          <span className="text-[9px] text-[var(--color-error)] truncate">{trace.error.message}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </SettingsSection>
  );
};

export default SettingsDebugging;
