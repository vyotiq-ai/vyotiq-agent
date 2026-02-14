/**
 * Debug Trace Viewer Component
 * 
 * Displays execution trace steps with:
 * - Timeline visualization
 * - Step details (LLM calls, tool executions)
 * - Duration highlighting
 * - Error indicators
 */
import React, { useState, useEffect, useCallback } from 'react';
import { 
  MessageSquare, Wrench, AlertTriangle, CheckCircle, 
  XCircle, Clock, ChevronDown, ChevronRight
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { createLogger } from '../../../utils/logger';
import type { TraceStepDetail } from '../../../../shared/types';

const logger = createLogger('DebugTraceViewer');

interface DebugTraceViewerProps {
  sessionId: string;
  runId: string | undefined;
  isRunning: boolean;
  /** Callback when a step is selected for detailed inspection */
  onSelectStep?: (step: TraceStepDetail | null) => void;
  /** Currently selected step ID */
  selectedStepId?: string;
}

export const DebugTraceViewer: React.FC<DebugTraceViewerProps> = ({
  sessionId,
  runId,
  isRunning,
  onSelectStep,
  selectedStepId,
}) => {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [highlightThreshold] = useState(1000); // ms
  const [traceSteps, setTraceSteps] = useState<TraceStepDetail[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch trace data from IPC
  const fetchTraceData = useCallback(async () => {
    if (!sessionId || !runId) {
      setTraceSteps([]);
      return;
    }

    try {
      // First try to get the active trace
      let trace = await window.vyotiq?.debug?.getActiveTrace?.();
      
      // If no active trace, try to get specific trace for this run
      if (!trace || trace.runId !== runId) {
        const traces = await window.vyotiq?.debug?.getTraces?.(sessionId);
        trace = traces?.find((t: { runId: string }) => t.runId === runId);
      }

      if (trace?.steps) {
        // Transform trace steps to TraceStepDetail format
        const steps: TraceStepDetail[] = trace.steps.map((step: {
          stepId: string;
          stepNumber: number;
          type: string;
          startedAt: number;
          completedAt: number;
          durationMs: number;
          llmRequest?: { provider?: string; model?: string; promptTokens?: number };
          llmResponse?: { outputTokens?: number; finishReason?: string; contentPreview?: string };
          toolCall?: { toolName?: string; toolCallId?: string; args?: unknown; requiresApproval?: boolean; wasApproved?: boolean };
          toolResult?: { success?: boolean; outputPreview?: string; outputSize?: number };
          error?: { message?: string };
        }, index: number) => {
          const baseStep = {
            stepId: step.stepId || `step-${index}`,
            stepNumber: step.stepNumber || index + 1,
            startedAt: step.startedAt,
            completedAt: step.completedAt,
            durationMs: step.durationMs,
          };

          if (step.type === 'llm-call') {
            return {
              ...baseStep,
              type: 'llm-call' as const,
              provider: step.llmRequest?.provider || 'unknown',
              model: step.llmRequest?.model || 'unknown',
              promptTokens: step.llmRequest?.promptTokens || 0,
              outputTokens: step.llmResponse?.outputTokens || 0,
              finishReason: step.llmResponse?.finishReason || 'unknown',
              hasToolCalls: step.llmResponse?.finishReason === 'tool_use',
              contentPreview: step.llmResponse?.contentPreview,
            };
          } else if (step.type === 'tool-call' || step.toolCall) {
            return {
              ...baseStep,
              type: 'tool-call' as const,
              toolName: step.toolCall?.toolName || 'unknown',
              toolCallId: step.toolCall?.toolCallId || '',
              argumentsPreview: step.toolCall?.args ? JSON.stringify(step.toolCall.args, null, 2) : undefined,
              requiresApproval: step.toolCall?.requiresApproval || false,
              wasApproved: step.toolCall?.wasApproved,
            };
          } else if (step.type === 'tool-result' || step.toolResult) {
            return {
              ...baseStep,
              type: 'tool-result' as const,
              toolName: step.toolCall?.toolName || 'unknown',
              success: step.toolResult?.success ?? true,
              outputPreview: step.toolResult?.outputPreview,
              outputSize: step.toolResult?.outputSize,
            };
          } else if (step.error) {
            return {
              ...baseStep,
              type: 'error' as const,
              errorMessage: step.error?.message,
            };
          }

          return {
            ...baseStep,
            type: step.type as TraceStepDetail['type'],
          };
        });

        setTraceSteps(steps);
      } else {
        setTraceSteps([]);
      }
    } catch (error) {
      logger.error('Failed to fetch trace data', { error: error instanceof Error ? error.message : String(error) });
      setTraceSteps([]);
    }
  }, [sessionId, runId]);

  // Initial fetch and polling while running
  useEffect(() => {
    setIsLoading(true);
    fetchTraceData().finally(() => setIsLoading(false));

    // Poll for updates while running
    const interval = isRunning ? setInterval(fetchTraceData, 1000) : undefined;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [fetchTraceData, isRunning]);

  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  const handleStepClick = (step: TraceStepDetail) => {
    toggleStep(step.stepId);
    // Notify parent of selection for detailed inspection
    if (onSelectStep) {
      onSelectStep(selectedStepId === step.stepId ? null : step);
    }
  };

  const getStepIcon = (step: TraceStepDetail) => {
    switch (step.type) {
      case 'llm-call':
        return <MessageSquare size={12} className="text-[var(--color-accent-primary)]" />;
      case 'tool-call':
        return <Wrench size={12} className="text-[var(--color-accent-secondary)]" />;
      case 'tool-result':
        return step.success 
          ? <CheckCircle size={12} className="text-[var(--color-success)]" />
          : <XCircle size={12} className="text-[var(--color-error)]" />;
      case 'error':
        return <AlertTriangle size={12} className="text-[var(--color-error)]" />;
      default:
        return <Clock size={12} className="text-[var(--color-text-dim)]" />;
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  if (isLoading && traceSteps.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--color-text-dim)] text-xs">
        Loading trace data...
      </div>
    );
  }

  if (traceSteps.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--color-text-dim)] text-xs">
        {isRunning ? 'Waiting for trace data...' : 'No trace data available'}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent">
      <div className="p-2 space-y-1">
        {traceSteps.map((step) => {
          const isExpanded = expandedSteps.has(step.stepId);
          const isSlowStep = step.durationMs > highlightThreshold;

          return (
            <div
              key={step.stepId}
              className={cn(
                'rounded border transition-colors',
                isSlowStep
                  ? 'border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5'
                  : 'border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]'
              )}
            >
              {/* Step header */}
              <button
                onClick={() => handleStepClick(step)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-[var(--color-surface-2)]/50 transition-colors",
                  selectedStepId === step.stepId && "bg-[var(--color-accent-primary)]/10"
                )}
              >
                {isExpanded ? (
                  <ChevronDown size={10} className="text-[var(--color-text-dim)]" />
                ) : (
                  <ChevronRight size={10} className="text-[var(--color-text-dim)]" />
                )}
                
                <span className="text-[9px] font-mono text-[var(--color-text-dim)] w-4">
                  {step.stepNumber}
                </span>
                
                {getStepIcon(step)}
                
                <span className="flex-1 text-[10px] font-mono text-[var(--color-text-secondary)] truncate">
                  {step.type === 'llm-call' && `${step.provider}/${step.model}`}
                  {step.type === 'tool-call' && `${step.toolName}()`}
                  {step.type === 'tool-result' && `${step.toolName} result`}
                </span>
                
                <span className={cn(
                  'text-[9px] font-mono',
                  isSlowStep ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-dim)]'
                )}>
                  {formatDuration(step.durationMs)}
                </span>
              </button>

              {/* Step details */}
              {isExpanded && (
                <div className="px-3 py-2 border-t border-[var(--color-border-subtle)] text-[9px] font-mono space-y-1">
                  {step.type === 'llm-call' && (
                    <>
                      <div className="flex justify-between text-[var(--color-text-dim)]">
                        <span>tokens:</span>
                        <span>{step.promptTokens} in / {step.outputTokens} out</span>
                      </div>
                      <div className="flex justify-between text-[var(--color-text-dim)]">
                        <span>finish:</span>
                        <span>{step.finishReason}</span>
                      </div>
                      {step.contentPreview && (
                        <div className="mt-2 p-2 bg-[var(--color-surface-base)] rounded text-[var(--color-text-secondary)]">
                          {step.contentPreview}
                        </div>
                      )}
                    </>
                  )}
                  
                  {step.type === 'tool-call' && (
                    <>
                      <div className="flex justify-between text-[var(--color-text-dim)]">
                        <span>approval:</span>
                        <span>{step.requiresApproval ? (step.wasApproved ? 'approved' : 'pending') : 'auto'}</span>
                      </div>
                      {step.argumentsPreview && (
                        <div className="mt-2 p-2 bg-[var(--color-surface-base)] rounded text-[var(--color-text-secondary)] overflow-x-auto">
                          <pre>{step.argumentsPreview}</pre>
                        </div>
                      )}
                    </>
                  )}
                  
                  {step.type === 'tool-result' && (
                    <>
                      <div className="flex justify-between text-[var(--color-text-dim)]">
                        <span>status:</span>
                        <span className={step.success ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}>
                          {step.success ? 'success' : 'failed'}
                        </span>
                      </div>
                      {step.outputSize && (
                        <div className="flex justify-between text-[var(--color-text-dim)]">
                          <span>size:</span>
                          <span>{step.outputSize} bytes</span>
                        </div>
                      )}
                      {step.outputPreview && (
                        <div className="mt-2 p-2 bg-[var(--color-surface-base)] rounded text-[var(--color-text-secondary)] overflow-x-auto">
                          <pre className="whitespace-pre-wrap">{step.outputPreview}</pre>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        
        {isRunning && (
          <div className="flex items-center gap-2 px-2 py-1.5 text-[10px] text-[var(--color-text-dim)]">
            <div className="w-2 h-2 rounded-full bg-[var(--color-accent-primary)]" />
            <span>Execution in progress...</span>
          </div>
        )}
      </div>
    </div>
  );
};
