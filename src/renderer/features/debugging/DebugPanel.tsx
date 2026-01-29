/**
 * Debug Panel Component
 * 
 * Main debugging interface that provides:
 * - Trace viewer for execution history
 * - Breakpoint configuration
 * - State inspection
 * - Recording playback controls
 */
import React, { useState, useCallback, useMemo } from 'react';
import { 
  Bug, Play, Pause, StepForward, Square, 
  ChevronDown, ChevronRight, Clock, Zap,
  AlertCircle, CheckCircle, XCircle, Settings
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { DebugTraceViewer } from './components/DebugTraceViewer';
import { BreakpointConfig } from './components/BreakpointConfig';
import { StateInspectorPanel } from './components/StateInspectorPanel';
import type { TraceSummary, TraceStepDetail } from '../../../shared/types';

interface DebugPanelProps {
  sessionId: string | undefined;
  runId: string | undefined;
  isRunning: boolean;
  className?: string;
}

type DebugTab = 'trace' | 'breakpoints' | 'state';

export const DebugPanel: React.FC<DebugPanelProps> = ({
  sessionId,
  runId,
  isRunning,
  className,
}) => {
  const [activeTab, setActiveTab] = useState<DebugTab>('trace');
  const [isExpanded, setIsExpanded] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  // Selected step for detailed inspection
  const [selectedStep, setSelectedStep] = useState<TraceStepDetail | null>(null);
  // Debug settings state
  const [_showDebugSettings, setShowDebugSettings] = useState(false);

  // Toggle debug settings panel
  const handleDebugSettingsClick = useCallback(() => {
    setShowDebugSettings(prev => !prev);
    // Switch to breakpoints tab which contains debug configuration
    setActiveTab('breakpoints');
  }, []);

  // Mock trace data - in production this would come from IPC
  const traceSummary: TraceSummary | null = useMemo(() => {
    if (!sessionId || !runId) return null;
    return {
      traceId: `trace-${runId}`,
      sessionId,
      runId,
      status: isRunning ? 'running' : 'completed',
      startedAt: Date.now() - 5000,
      completedAt: isRunning ? undefined : Date.now(),
      durationMs: isRunning ? undefined : 5000,
      totalSteps: 12,
      llmCalls: 3,
      toolCalls: 8,
      successfulToolCalls: 7,
      failedToolCalls: 1,
      totalInputTokens: 15000,
      totalOutputTokens: 3500,
      hasError: false,
    };
  }, [sessionId, runId, isRunning]);

  const handlePauseResume = useCallback(() => {
    setIsPaused(prev => !prev);
    // In production: window.vyotiq?.debug?.pauseResume(sessionId, runId)
  }, []);

  const handleStepForward = useCallback(() => {
    // In production: window.vyotiq?.debug?.stepForward(sessionId, runId)
  }, []);

  const handleStop = useCallback(() => {
    // In production: window.vyotiq?.debug?.stop(sessionId, runId)
  }, []);

  if (!sessionId) {
    return (
      <div className={cn('p-4 text-center text-[var(--color-text-dim)] text-xs', className)}>
        <Bug size={24} className="mx-auto mb-2 opacity-50" />
        <p>No active session</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full bg-[var(--color-surface-base)]', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)]">
        <button
          onClick={() => setIsExpanded(prev => !prev)}
          className="flex items-center gap-2 text-[11px] font-mono text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Bug size={12} className="text-[var(--color-accent-primary)]" />
          <span>debug</span>
        </button>

        {/* Playback controls */}
        {isRunning && (
          <div className="flex items-center gap-1">
            <button
              onClick={handlePauseResume}
              className="p-1 rounded hover:bg-[var(--color-surface-2)] transition-colors"
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? (
                <Play size={12} className="text-[var(--color-success)]" />
              ) : (
                <Pause size={12} className="text-[var(--color-warning)]" />
              )}
            </button>
            <button
              onClick={handleStepForward}
              className="p-1 rounded hover:bg-[var(--color-surface-2)] transition-colors"
              title="Step forward"
              disabled={!isPaused}
            >
              <StepForward size={12} className={isPaused ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-dim)]'} />
            </button>
            <button
              onClick={handleStop}
              className="p-1 rounded hover:bg-[var(--color-surface-2)] transition-colors"
              title="Stop"
            >
              <Square size={12} className="text-[var(--color-error)]" />
            </button>
          </div>
        )}
      </div>

      {isExpanded && (
        <>
          {/* Tab bar */}
          <div className="flex border-b border-[var(--color-border-subtle)]">
            {(['trace', 'breakpoints', 'state'] as DebugTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-3 py-1.5 text-[10px] font-mono transition-colors',
                  activeTab === tab
                    ? 'text-[var(--color-accent-primary)] border-b-2 border-[var(--color-accent-primary)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Summary bar */}
          {traceSummary && (
            <div className="flex items-center gap-4 px-3 py-1.5 bg-[var(--color-surface-1)] border-b border-[var(--color-border-subtle)] text-[9px] font-mono text-[var(--color-text-dim)]">
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {traceSummary.durationMs ? `${traceSummary.durationMs}ms` : 'running...'}
              </span>
              <span className="flex items-center gap-1">
                <Zap size={10} />
                {traceSummary.totalSteps} steps
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle size={10} className="text-[var(--color-success)]" />
                {traceSummary.successfulToolCalls}
              </span>
              {traceSummary.failedToolCalls > 0 && (
                <span className="flex items-center gap-1">
                  <XCircle size={10} className="text-[var(--color-error)]" />
                  {traceSummary.failedToolCalls}
                </span>
              )}
              {traceSummary.hasError && (
                <span className="flex items-center gap-1" title="Execution encountered an error">
                  <AlertCircle size={10} className="text-[var(--color-error)]" />
                  error
                </span>
              )}
              <span className="ml-auto flex items-center gap-2">
                <span>{traceSummary.totalInputTokens.toLocaleString()} in / {traceSummary.totalOutputTokens.toLocaleString()} out</span>
                <button
                  className="p-0.5 rounded hover:bg-[var(--color-surface-2)] transition-colors"
                  title="Debug settings"
                  onClick={handleDebugSettingsClick}
                >
                  <Settings size={10} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]" />
                </button>
              </span>
            </div>
          )}

          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'trace' && (
              <DebugTraceViewer
                sessionId={sessionId}
                runId={runId}
                isRunning={isRunning}
                onSelectStep={setSelectedStep}
                selectedStepId={selectedStep?.stepId}
              />
            )}
            {activeTab === 'breakpoints' && (
              <BreakpointConfig sessionId={sessionId} />
            )}
            {activeTab === 'state' && (
              <StateInspectorPanel
                sessionId={sessionId}
                runId={runId}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
};
