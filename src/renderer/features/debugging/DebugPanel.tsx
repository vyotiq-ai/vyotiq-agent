/**
 * Debug Panel Component
 * 
 * Main debugging interface that provides:
 * - Trace viewer for execution history
 * - Breakpoint configuration
 * - State inspection
 * - Recording playback controls
 */
import React, { useState, useCallback, useEffect } from 'react';
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
  const [traceSummary, setTraceSummary] = useState<TraceSummary | null>(null);
  // Selected step for detailed inspection
  const [selectedStep, setSelectedStep] = useState<TraceStepDetail | null>(null);
  // Debug settings state
  const [_showDebugSettings, setShowDebugSettings] = useState(false);

  // Fetch active trace data from IPC
  useEffect(() => {
    if (!sessionId || !runId) {
      setTraceSummary(null);
      return;
    }

    const fetchTrace = async () => {
      try {
        const trace = await window.vyotiq?.debug?.getActiveTrace?.();
        if (trace) {
          setTraceSummary({
            traceId: trace.traceId,
            sessionId: trace.sessionId,
            runId: trace.runId,
            status: trace.status,
            startedAt: trace.startedAt,
            completedAt: trace.completedAt,
            durationMs: trace.durationMs,
            totalSteps: trace.metrics?.totalSteps ?? 0,
            llmCalls: trace.metrics?.llmCalls ?? 0,
            toolCalls: trace.metrics?.toolCalls ?? 0,
            successfulToolCalls: trace.metrics?.successfulToolCalls ?? 0,
            failedToolCalls: trace.metrics?.failedToolCalls ?? 0,
            totalInputTokens: trace.metrics?.totalInputTokens ?? 0,
            totalOutputTokens: trace.metrics?.totalOutputTokens ?? 0,
            hasError: !!trace.error,
          });
        } else {
          // Fallback: try to get traces for the session
          const traces = await window.vyotiq?.debug?.getTraces?.(sessionId);
          const currentTrace = traces?.find((t: { runId: string }) => t.runId === runId);
          if (currentTrace) {
            setTraceSummary({
              traceId: currentTrace.traceId,
              sessionId: currentTrace.sessionId,
              runId: currentTrace.runId,
              status: currentTrace.status,
              startedAt: currentTrace.startedAt,
              completedAt: currentTrace.completedAt,
              durationMs: currentTrace.durationMs,
              totalSteps: currentTrace.metrics?.totalSteps ?? 0,
              llmCalls: currentTrace.metrics?.llmCalls ?? 0,
              toolCalls: currentTrace.metrics?.toolCalls ?? 0,
              successfulToolCalls: currentTrace.metrics?.successfulToolCalls ?? 0,
              failedToolCalls: currentTrace.metrics?.failedToolCalls ?? 0,
              totalInputTokens: currentTrace.metrics?.totalInputTokens ?? 0,
              totalOutputTokens: currentTrace.metrics?.totalOutputTokens ?? 0,
              hasError: !!currentTrace.error,
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch trace data:', error);
      }
    };

    fetchTrace();
    
    // Poll for updates while running
    const interval = isRunning ? setInterval(fetchTrace, 1000) : undefined;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [sessionId, runId, isRunning]);

  // Check pause state from IPC
  useEffect(() => {
    if (!sessionId) return;
    
    const checkPauseState = async () => {
      try {
        const paused = await window.vyotiq?.agent?.isRunPaused?.(sessionId);
        setIsPaused(!!paused);
      } catch {
        // Ignore errors
      }
    };
    
    checkPauseState();
    const interval = isRunning ? setInterval(checkPauseState, 500) : undefined;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [sessionId, isRunning]);

  // Toggle debug settings panel
  const handleDebugSettingsClick = useCallback(() => {
    setShowDebugSettings(prev => !prev);
    // Switch to breakpoints tab which contains debug configuration
    setActiveTab('breakpoints');
  }, []);

  const handlePauseResume = useCallback(async () => {
    if (!sessionId) return;
    
    try {
      if (isPaused) {
        await window.vyotiq?.agent?.resumeRun?.(sessionId);
        setIsPaused(false);
      } else {
        await window.vyotiq?.agent?.pauseRun?.(sessionId);
        setIsPaused(true);
      }
    } catch (error) {
      console.error('Failed to pause/resume run:', error);
    }
  }, [sessionId, isPaused]);

  const handleStepForward = useCallback(async () => {
    if (!sessionId || !isPaused) return;
    
    try {
      // Resume for one step then pause again
      // This is achieved by enabling step mode in debug config
      await window.vyotiq?.debug?.updateConfig?.({ stepMode: true });
      await window.vyotiq?.agent?.resumeRun?.(sessionId);
    } catch (error) {
      console.error('Failed to step forward:', error);
    }
  }, [sessionId, isPaused]);

  const handleStop = useCallback(async () => {
    if (!sessionId) return;
    
    try {
      await window.vyotiq?.agent?.cancelRun?.(sessionId);
    } catch (error) {
      console.error('Failed to stop run:', error);
    }
  }, [sessionId]);

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
