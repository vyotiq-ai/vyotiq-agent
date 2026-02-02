import React, { useState, useEffect, useCallback } from 'react';
import { 
  Bug, 
  FileText, 
  Download, 
  Play, 
  AlertTriangle,
  Eye,
  RefreshCw,
  Terminal,
  ChevronDown,
  ChevronRight,
  Copy,
  Check
} from 'lucide-react';
import { Toggle } from '../../../components/ui/Toggle';
import { Button } from '../../../components/ui/Button';
import type { DebugSettings } from '../../../../shared/types';
import { cn } from '../../../utils/cn';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('SettingsDebugging');

interface SettingsDebuggingProps {
  settings: DebugSettings;
  onChange: (field: keyof DebugSettings, value: DebugSettings[keyof DebugSettings]) => void;
}

// Trace summary type for display
interface TraceSummary {
  traceId: string;
  sessionId: string;
  runId: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  metrics: {
    totalSteps: number;
    llmCalls: number;
    toolCalls: number;
    successfulToolCalls: number;
    failedToolCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
  };
  error?: { message: string };
}

const LOG_LEVELS: Array<{ value: DebugSettings['logLevel']; label: string; description: string }> = [
  { value: 'error', label: 'Error', description: 'Only critical errors' },
  { value: 'warn', label: 'Warning', description: 'Errors and warnings' },
  { value: 'info', label: 'Info', description: 'General information' },
  { value: 'debug', label: 'Debug', description: 'Detailed debug output' },
  { value: 'trace', label: 'Trace', description: 'Most verbose output' },
];

const EXPORT_FORMATS: Array<{ value: DebugSettings['traceExportFormat']; label: string; icon: React.ReactNode }> = [
  { value: 'json', label: 'JSON', icon: <FileText size={12} /> },
  { value: 'markdown', label: 'Markdown', icon: <FileText size={12} /> },
];

const formatDuration = (ms: number): string => {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
};

const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const SettingsDebugging: React.FC<SettingsDebuggingProps> = ({ settings, onChange }) => {
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [activeTrace, setActiveTrace] = useState<TraceSummary | null>(null);
  const [isLoadingTraces, setIsLoadingTraces] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>('logging');
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Fetch traces from the active session
  const fetchTraces = useCallback(async () => {
    setIsLoadingTraces(true);
    try {
      const activeTraceData = await window.vyotiq.debug.getActiveTrace();
      if (activeTraceData) {
        setActiveTrace({
          traceId: activeTraceData.traceId,
          sessionId: activeTraceData.sessionId,
          runId: activeTraceData.runId,
          status: activeTraceData.status,
          startedAt: activeTraceData.startedAt,
          completedAt: activeTraceData.completedAt,
          durationMs: activeTraceData.durationMs,
          metrics: activeTraceData.metrics,
          error: activeTraceData.error,
        });
      }
      
      // Get all sessions to find traces
      const sessions = await window.vyotiq.agent.getSessions();
      const allTraces: TraceSummary[] = [];
      
      for (const session of sessions.slice(0, 5)) { // Limit to recent 5 sessions
        const sessionTraces = await window.vyotiq.debug.getTraces(session.id);
        allTraces.push(...sessionTraces.map(t => ({
          traceId: t.traceId,
          sessionId: t.sessionId,
          runId: t.runId,
          status: t.status,
          startedAt: t.startedAt,
          completedAt: t.completedAt,
          durationMs: t.durationMs,
          metrics: t.metrics,
          error: t.error,
        })));
      }
      
      // Sort by start time, most recent first
      allTraces.sort((a, b) => b.startedAt - a.startedAt);
      setTraces(allTraces.slice(0, 20)); // Keep 20 most recent
      setLastRefresh(new Date());
    } catch (error) {
      logger.error('Failed to fetch traces', { error });
    } finally {
      setIsLoadingTraces(false);
    }
  }, []);

  useEffect(() => {
    fetchTraces();
  }, [fetchTraces]);

  const handleExportTrace = async (traceId: string, format: 'json' | 'markdown') => {
    setIsExporting(traceId);
    try {
      const result = await window.vyotiq.debug.saveTraceToFile(traceId, format);
      if (!result.success) {
        logger.error('Failed to export trace', { error: result.error });
      }
    } catch (error) {
      logger.error('Failed to export trace', { error });
    } finally {
      setIsExporting(null);
    }
  };

  const handleCopyTraceId = async (traceId: string) => {
    try {
      await navigator.clipboard.writeText(traceId);
      setCopiedId(traceId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      logger.error('Failed to copy trace ID', { error });
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const renderSectionHeader = (id: string, icon: React.ReactNode, title: string, description?: string) => (
    <button
      onClick={() => toggleSection(id)}
      className={cn(
        "w-full flex items-center justify-between py-2 text-left group",
        'rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-[var(--color-text-muted)]">{icon}</span>
        <span className="text-[11px] text-[var(--color-text-primary)]">{title}</span>
        {description && (
          <span className="text-[9px] text-[var(--color-text-muted)] hidden sm:inline">
            # {description}
          </span>
        )}
      </div>
      {expandedSection === id ? (
        <ChevronDown size={12} className="text-[var(--color-text-muted)]" />
      ) : (
        <ChevronRight size={12} className="text-[var(--color-text-muted)]" />
      )}
    </button>
  );

  return (
    <section className="space-y-4 font-mono">
      <header>
        <div className="flex items-center gap-2 mb-1">
          <Bug size={11} className="text-[var(--color-accent-primary)]" />
          <h3 className="text-[11px] text-[var(--color-text-primary)]">debugging</h3>
        </div>
        <p className="text-[10px] text-[var(--color-text-dim)]">
          # Configure debug output, tracing, and step-by-step execution
        </p>
      </header>

      {/* Logging Section */}
      <div className="border border-[var(--color-border-subtle)]">
        {renderSectionHeader('logging', <Terminal size={12} />, 'Logging Configuration', 'verbose output settings')}
        
        {expandedSection === 'logging' && (
          <div className="px-3 pb-3 space-y-3 border-t border-[var(--color-border-subtle)]">
            {/* Verbose Logging Toggle */}
            <div className="flex items-center justify-between py-2">
              <div>
                <label className="text-[10px] text-[var(--color-text-primary)]">
                  Enable Verbose Logging
                </label>
                <p className="text-[9px] text-[var(--color-text-muted)]">
                  Output detailed debug information to console
                </p>
              </div>
              <Toggle
                checked={settings.verboseLogging}
                onToggle={() => onChange('verboseLogging', !settings.verboseLogging)}
              />
            </div>

            {/* Log Level Selector */}
            <div>
              <label className="text-[10px] text-[var(--color-text-primary)] block mb-1.5">
                Log Level
              </label>
              <div className="grid grid-cols-5 gap-1">
                {LOG_LEVELS.map((level) => (
                  <button
                    key={level.value}
                    onClick={() => onChange('logLevel', level.value)}
                    className={cn(
                      'px-2 py-1.5 text-[9px] rounded border transition-all',
                      settings.logLevel === level.value
                        ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]'
                        : 'border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:border-[var(--color-border-medium)]',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                    )}
                    title={level.description}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
              <p className="text-[8px] text-[var(--color-text-muted)] mt-1">
                {LOG_LEVELS.find(l => l.value === settings.logLevel)?.description}
              </p>
            </div>

            {/* Capture Full Payloads */}
            <div className="flex items-center justify-between py-2">
              <div>
                <label className="text-[10px] text-[var(--color-text-primary)]">
                  Capture Full Payloads
                </label>
                <p className="text-[9px] text-[var(--color-text-muted)]">
                  Store complete request/response data for debugging
                </p>
              </div>
              <Toggle
                checked={settings.captureFullPayloads}
                onToggle={() => onChange('captureFullPayloads', !settings.captureFullPayloads)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Execution Control Section */}
      <div className="border border-[var(--color-border-subtle)] rounded">
        {renderSectionHeader('execution', <Play size={12} />, 'Execution Control', 'step-by-step mode')}
        
        {expandedSection === 'execution' && (
          <div className="px-3 pb-3 space-y-3 border-t border-[var(--color-border-subtle)]">
            {/* Step-by-Step Mode */}
            <div className="flex items-center justify-between py-2">
              <div>
                <label className="text-[10px] text-[var(--color-text-primary)]">
                  Step-by-Step Execution Mode
                </label>
                <p className="text-[9px] text-[var(--color-text-muted)]">
                  Pause before each step for manual inspection
                </p>
              </div>
              <Toggle
                checked={settings.stepByStepMode}
                onToggle={() => onChange('stepByStepMode', !settings.stepByStepMode)}
              />
            </div>

            {/* Break on Error */}
            <div className="flex items-center justify-between py-2">
              <div>
                <label className="text-[10px] text-[var(--color-text-primary)]">
                  Break on Error
                </label>
                <p className="text-[9px] text-[var(--color-text-muted)]">
                  Automatically pause execution when an error occurs
                </p>
              </div>
              <Toggle
                checked={settings.breakOnError}
                onToggle={() => onChange('breakOnError', !settings.breakOnError)}
              />
            </div>

            {/* Break on Tools */}
            <div>
              <label className="text-[10px] text-[var(--color-text-primary)] block mb-1.5">
                Break on Tools (comma-separated)
              </label>
              <input
                type="text"
                value={settings.breakOnTools}
                onChange={(e) => onChange('breakOnTools', e.target.value)}
                placeholder="e.g., write_file, run_command"
                className="w-full px-2 py-1.5 text-[10px] bg-[var(--color-surface-input)] border border-[var(--color-border-subtle)] rounded-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:border-[var(--color-accent-primary)]"
              />
              <p className="text-[8px] text-[var(--color-text-muted)] mt-1">
                Pause execution when these tools are called
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Trace Export Section */}
      <div className="border border-[var(--color-border-subtle)] rounded">
        {renderSectionHeader('export', <Download size={12} />, 'Trace Export', 'export and auto-save settings')}
        
        {expandedSection === 'export' && (
          <div className="px-3 pb-3 space-y-3 border-t border-[var(--color-border-subtle)]">
            {/* Auto Export on Error */}
            <div className="flex items-center justify-between py-2">
              <div>
                <label className="text-[10px] text-[var(--color-text-primary)]">
                  Auto-Export Traces on Error
                </label>
                <p className="text-[9px] text-[var(--color-text-muted)]">
                  Automatically save traces when execution fails
                </p>
              </div>
              <Toggle
                checked={settings.autoExportOnError}
                onToggle={() => onChange('autoExportOnError', !settings.autoExportOnError)}
              />
            </div>

            {/* Export Format */}
            <div>
              <label className="text-[10px] text-[var(--color-text-primary)] block mb-1.5">
                Export Format
              </label>
              <div className="flex gap-2">
                {EXPORT_FORMATS.map((format) => (
                  <button
                    key={format.value}
                    onClick={() => onChange('traceExportFormat', format.value)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 text-[10px] rounded border transition-all',
                      settings.traceExportFormat === format.value
                        ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]'
                        : 'border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:border-[var(--color-border-medium)]',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                    )}
                  >
                    {format.icon}
                    {format.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Include Full Payloads in Export */}
            <div className="flex items-center justify-between py-2">
              <div>
                <label className="text-[10px] text-[var(--color-text-primary)]">
                  Include Full Payloads in Export
                </label>
                <p className="text-[9px] text-[var(--color-text-muted)]">
                  Include complete request/response data in exported traces
                </p>
              </div>
              <Toggle
                checked={settings.includeFullPayloadsInExport}
                onToggle={() => onChange('includeFullPayloadsInExport', !settings.includeFullPayloadsInExport)}
              />
            </div>

            {/* Max Preview Length */}
            <div>
              <label className="text-[10px] text-[var(--color-text-primary)] flex items-center justify-between mb-1.5">
                <span>Max Preview Length</span>
                <span className="text-[var(--color-text-muted)]">{settings.maxPreviewLength} chars</span>
              </label>
              <input
                type="range"
                min={100}
                max={2000}
                step={100}
                value={settings.maxPreviewLength}
                onChange={(e) => onChange('maxPreviewLength', parseInt(e.target.value))}
                className="w-full accent-[var(--color-accent-primary)]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Trace Viewer Section */}
      <div className="border border-[var(--color-border-subtle)] rounded">
        {renderSectionHeader('viewer', <Eye size={12} />, 'Trace Viewer', 'display preferences')}
        
        {expandedSection === 'viewer' && (
          <div className="px-3 pb-3 space-y-3 border-t border-[var(--color-border-subtle)]">
            {/* Auto-Scroll */}
            <div className="flex items-center justify-between py-2">
              <div>
                <label className="text-[10px] text-[var(--color-text-primary)]">
                  Auto-Scroll to New Steps
                </label>
                <p className="text-[9px] text-[var(--color-text-muted)]">
                  Automatically scroll when new trace steps appear
                </p>
              </div>
              <Toggle
                checked={settings.autoScrollTraceViewer}
                onToggle={() => onChange('autoScrollTraceViewer', !settings.autoScrollTraceViewer)}
              />
            </div>

            {/* Show Token Usage */}
            <div className="flex items-center justify-between py-2">
              <div>
                <label className="text-[10px] text-[var(--color-text-primary)]">
                  Show Token Usage
                </label>
                <p className="text-[9px] text-[var(--color-text-muted)]">
                  Display token counts in trace steps
                </p>
              </div>
              <Toggle
                checked={settings.showTokenUsage}
                onToggle={() => onChange('showTokenUsage', !settings.showTokenUsage)}
              />
            </div>

            {/* Show Timing Breakdown */}
            <div className="flex items-center justify-between py-2">
              <div>
                <label className="text-[10px] text-[var(--color-text-primary)]">
                  Show Timing Breakdown
                </label>
                <p className="text-[9px] text-[var(--color-text-muted)]">
                  Display duration details for each step
                </p>
              </div>
              <Toggle
                checked={settings.showTimingBreakdown}
                onToggle={() => onChange('showTimingBreakdown', !settings.showTimingBreakdown)}
              />
            </div>

            {/* Highlight Duration Threshold */}
            <div>
              <label className="text-[10px] text-[var(--color-text-primary)] flex items-center justify-between mb-1.5">
                <span>Slow Step Highlight Threshold</span>
                <span className="text-[var(--color-text-muted)]">{settings.highlightDurationThreshold}ms</span>
              </label>
              <input
                type="range"
                min={1000}
                max={30000}
                step={1000}
                value={settings.highlightDurationThreshold}
                onChange={(e) => onChange('highlightDurationThreshold', parseInt(e.target.value))}
                className="w-full accent-[var(--color-accent-primary)]"
              />
              <p className="text-[8px] text-[var(--color-text-muted)] mt-1">
                Steps taking longer than this will be highlighted as slow
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Session Traces Section */}
      <div className="border border-[var(--color-border-subtle)] rounded">
        {renderSectionHeader('traces', <FileText size={12} />, 'Session Traces', 'view and export traces')}
        
        {expandedSection === 'traces' && (
          <div className="px-3 pb-3 border-t border-[var(--color-border-subtle)]">
            {/* Trace List Header */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {traces.length} trace{traces.length !== 1 ? 's' : ''}
                </span>
                {lastRefresh && (
                  <span className="text-[8px] text-[var(--color-text-muted)]">
                    • last updated {formatDate(lastRefresh.getTime())}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchTraces}
                disabled={isLoadingTraces}
                leftIcon={<RefreshCw size={10} className={isLoadingTraces ? 'animate-spin' : ''} />}
              >
                Refresh
              </Button>
            </div>

            {/* Active Trace Indicator */}
            {activeTrace && (
              <div className="mb-3 p-2 border border-[var(--color-accent-primary)]/30 bg-[var(--color-accent-primary)]/5 rounded">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--color-accent-primary)]" />
                    <span className="text-[10px] text-[var(--color-accent-primary)]">Active Trace</span>
                  </div>
                  <span className="text-[9px] text-[var(--color-text-muted)]">
                    {activeTrace.metrics.totalSteps} steps
                  </span>
                </div>
              </div>
            )}

            {/* Trace List */}
            <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent">
              {isLoadingTraces ? (
                <div className="text-[10px] text-[var(--color-text-muted)] text-center py-4">
                  Loading traces...
                </div>
              ) : traces.length === 0 ? (
                <div className="text-[10px] text-[var(--color-text-muted)] text-center py-4">
                  No traces available
                </div>
              ) : (
                traces.map((trace) => (
                  <div
                    key={trace.traceId}
                    className="p-2 border border-[var(--color-border-subtle)] rounded hover:border-[var(--color-border-medium)] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'w-1.5 h-1.5 rounded-full flex-shrink-0',
                              trace.status === 'completed' && 'bg-[var(--color-success)]',
                              trace.status === 'failed' && 'bg-[var(--color-error)]',
                              trace.status === 'running' && 'bg-[var(--color-accent-primary)]',
                              trace.status === 'paused' && 'bg-[var(--color-warning)]'
                            )}
                          />
                          <span className="text-[10px] text-[var(--color-text-primary)] truncate">
                            {trace.traceId.slice(0, 8)}
                          </span>
                          <button
                            onClick={() => handleCopyTraceId(trace.traceId)}
                            className={cn(
                              "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors",
                              'rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                            )}
                            title="Copy trace ID"
                          >
                            {copiedId === trace.traceId ? (
                              <Check size={10} className="text-[var(--color-success)]" />
                            ) : (
                              <Copy size={10} />
                            )}
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[8px] text-[var(--color-text-muted)]">
                            {formatDate(trace.startedAt)}
                          </span>
                          {trace.durationMs && (
                            <span className="text-[8px] text-[var(--color-text-muted)]">
                              • {formatDuration(trace.durationMs)}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Metrics */}
                      <div className="flex items-center gap-3 text-[8px] text-[var(--color-text-muted)]">
                        <span title="Total steps">{trace.metrics.totalSteps} steps</span>
                        <span title="LLM calls">{trace.metrics.llmCalls} LLM</span>
                        <span title="Tool calls">
                          {trace.metrics.successfulToolCalls}/{trace.metrics.toolCalls} tools
                        </span>
                      </div>
                      
                      {/* Export Buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleExportTrace(trace.traceId, 'json')}
                          disabled={isExporting === trace.traceId}
                          className={cn(
                            "p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-50",
                            "rounded-sm",
                            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                          )}
                          title="Export as JSON"
                        >
                          <Download size={12} />
                        </button>
                      </div>
                    </div>
                    
                    {/* Error Message */}
                    {trace.error && (
                      <div className="mt-2 px-2 py-1 bg-[var(--color-error)]/10 border border-[var(--color-error)]/30 rounded">
                        <div className="flex items-center gap-1">
                          <AlertTriangle size={10} className="text-[var(--color-error)]" />
                          <span className="text-[9px] text-[var(--color-error)] truncate">
                            {trace.error.message}
                          </span>
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
    </section>
  );
};
