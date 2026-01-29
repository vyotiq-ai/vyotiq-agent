/**
 * Progress Tracker
 * Handles progress tracking, timing, and status emission for agent runs
 */

import type { ProgressItem, AgentEvent, RendererEvent } from '../../../shared/types';
import type { InternalSession } from '../types';
import type { RunTimingData, AnnotatedToolCall } from './types';
import type { ToolCallPayload } from '../../../shared/types';
import { randomUUID } from 'node:crypto';

export class ProgressTracker {
  private readonly emitEvent: (event: RendererEvent | AgentEvent) => void;
  
  // Timing maps
  private readonly analysisTimers = new Map<string, number>();
  private readonly iterationTimers = new Map<string, number>();
  private readonly toolTimers = new Map<string, number>();
  private readonly runTimingData = new Map<string, RunTimingData>();

  constructor(emitEvent: (event: RendererEvent | AgentEvent) => void) {
    this.emitEvent = emitEvent;
  }

  /**
   * Initialize run timing data when a run starts
   */
  initRunTiming(runId: string): void {
    this.runTimingData.set(runId, {
      startedAt: Date.now(),
      iterationTimes: [],
    });
  }

  /**
   * Clean up run timing data when a run completes
   */
  cleanupRunTiming(runId: string): void {
    this.runTimingData.delete(runId);
  }

  /**
   * Get run timing data
   */
  getRunTimingData(runId: string): RunTimingData | undefined {
    return this.runTimingData.get(runId);
  }

  /**
   * Emit a progress item for a run
   */
  emitRunProgressItem(session: InternalSession, runId: string, item: ProgressItem): void {
    const groupTitle = `${session.state.title || 'Session'} progress`;
    this.emitEvent({
      type: 'progress',
      sessionId: session.state.id,
      runId,
      groupId: runId,
      groupTitle,
      item,
      timestamp: item.timestamp,
    });
  }

  /**
   * Start analysis progress tracking
   */
  startAnalysisProgress(session: InternalSession, runId: string): void {
    const timestamp = Date.now();
    this.analysisTimers.set(runId, timestamp);
    this.emitRunProgressItem(session, runId, {
      id: `${runId}-analysis`,
      type: 'analysis',
      label: 'Analyzing request',
      status: 'running',
      timestamp,
    });
  }

  /**
   * Complete analysis progress tracking
   */
  completeAnalysisProgress(
    session: InternalSession,
    runId: string,
    status: ProgressItem['status']
  ): void {
    const startedAt = this.analysisTimers.get(runId);
    if (!startedAt) return;
    this.analysisTimers.delete(runId);
    const timestamp = Date.now();
    this.emitRunProgressItem(session, runId, {
      id: `${runId}-analysis`,
      type: 'analysis',
      label: 'Analyzing request',
      status,
      timestamp,
      duration: timestamp - startedAt,
    });
  }

  /**
   * Get iteration timer key
   */
  private getIterationKey(runId: string, iteration: number): string {
    return `${runId}:iteration:${iteration}`;
  }

  /**
   * Start iteration progress tracking
   */
  startIterationProgress(
    session: InternalSession,
    runId: string,
    iteration: number,
    provider: string
  ): void {
    const key = this.getIterationKey(runId, iteration);
    const timestamp = Date.now();
    this.iterationTimers.set(key, timestamp);
    this.emitRunProgressItem(session, runId, {
      id: `iteration-${iteration}`,
      type: 'iteration',
      label: `Iteration ${iteration}`,
      detail: provider,
      status: 'running',
      timestamp,
    });
  }

  /**
   * Finish iteration progress tracking
   */
  finishIterationProgress(
    session: InternalSession,
    runId: string,
    iteration: number,
    status: ProgressItem['status']
  ): void {
    const key = this.getIterationKey(runId, iteration);
    const startedAt = this.iterationTimers.get(key);
    if (!startedAt) return;
    this.iterationTimers.delete(key);
    const timestamp = Date.now();
    const duration = timestamp - startedAt;

    // Track iteration time for average calculation
    const timingData = this.runTimingData.get(runId);
    if (timingData) {
      timingData.iterationTimes.push(duration);
    }

    this.emitRunProgressItem(session, runId, {
      id: `iteration-${iteration}`,
      type: 'iteration',
      label: `Iteration ${iteration}`,
      status,
      timestamp,
      duration,
    });
  }

  /**
   * Get iteration start time
   */
  getIterationStartTime(runId: string, iteration: number): number | undefined {
    const key = this.getIterationKey(runId, iteration);
    return this.iterationTimers.get(key);
  }

  /**
   * Emit iteration status for UI progress display
   */
  emitIterationStatus(
    sessionId: string,
    runId: string,
    currentIteration: number,
    maxIterations: number,
    status: 'executing' | 'paused' = 'executing',
    providerName?: string,
    modelId?: string
  ): void {
    const timingData = this.runTimingData.get(runId);
    const runStartedAt = timingData?.startedAt ?? Date.now();
    const iterationTimes = timingData?.iterationTimes ?? [];

    // Calculate average iteration time (only if we have data)
    const avgIterationTimeMs = iterationTimes.length > 0
      ? Math.round(iterationTimes.reduce((a, b) => a + b, 0) / iterationTimes.length)
      : 0;

    this.emitEvent({
      type: 'agent-status',
      sessionId,
      status,
      message: status === 'paused'
        ? `Paused at iteration ${currentIteration}/${maxIterations}`
        : `Running iteration ${currentIteration}/${maxIterations}`,
      timestamp: Date.now(),
      metadata: {
        currentIteration,
        maxIterations,
        runStartedAt,
        avgIterationTimeMs,
        paused: status === 'paused',
        provider: providerName,
        modelId,
      },
    });
  }

  /**
   * Get tool timer key
   */
  private getToolTimerKey(runId: string, progressId: string): string {
    return `${runId}:${progressId}`;
  }

  /**
   * Ensure tool has a progress ID
   */
  ensureToolProgressId(tool: ToolCallPayload): string {
    const annotated = tool as AnnotatedToolCall;
    if (!annotated.__progressId) {
      annotated.__progressId = tool.callId ? `tool-${tool.callId}` : `tool-${randomUUID()}`;
    }
    return annotated.__progressId;
  }

  /**
   * Start tool progress tracking
   */
  startToolProgress(
    session: InternalSession,
    runId: string,
    tool: ToolCallPayload,
    detail?: string
  ): string {
    const progressId = this.ensureToolProgressId(tool);
    const toolTimerKey = this.getToolTimerKey(runId, progressId);
    const timestamp = Date.now();
    this.toolTimers.set(toolTimerKey, timestamp);
    
    this.emitRunProgressItem(session, runId, {
      id: progressId,
      type: 'tool-call',
      label: tool.name,
      detail,
      status: 'running',
      timestamp,
      metadata: { callId: tool.callId },
    });
    
    return progressId;
  }

  /**
   * Finish tool progress tracking
   */
  finishToolProgress(
    session: InternalSession,
    runId: string,
    progressId: string,
    label: string,
    detail: string | undefined,
    status: ProgressItem['status']
  ): void {
    const key = this.getToolTimerKey(runId, progressId);
    const startedAt = this.toolTimers.get(key);
    if (startedAt) {
      this.toolTimers.delete(key);
    }
    const timestamp = Date.now();
    this.emitRunProgressItem(session, runId, {
      id: progressId,
      type: 'tool-call',
      label,
      detail,
      status,
      timestamp,
      duration: startedAt ? timestamp - startedAt : undefined,
    });
  }

  /**
   * Describe tool target for progress display
   */
  describeToolTarget(tool: ToolCallPayload): string | undefined {
    const args = tool.arguments || {};
    const path = (args.path || args.filePath) as string | undefined;
    const command = args.command as string | undefined;
    const query = (args.pattern || args.query) as string | undefined;
    return path || command || query;
  }

  /**
   * Mark tool as aborted
   */
  markToolAborted(session: InternalSession, runId: string, tool: ToolCallPayload): void {
    const progressId = (tool as AnnotatedToolCall).__progressId;
    if (!progressId) return;
    this.emitRunProgressItem(session, runId, {
      id: progressId,
      type: 'tool-call',
      label: tool.name || 'tool',
      detail: this.describeToolTarget(tool),
      status: 'error',
      timestamp: Date.now(),
      metadata: { reason: 'user-denied' },
    });
  }
}
