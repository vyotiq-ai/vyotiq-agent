/**
 * Agent Debugger
 * 
 * Provides comprehensive tracing, debugging, and analysis capabilities
 * for agent execution. Supports step-through debugging, breakpoints,
 * and trace export for post-mortem analysis.
 */
import { randomUUID, createHash } from 'node:crypto';
import {
  type DebugConfig,
  type AgentTrace,
  type AgentStep,
  type TraceMetrics,
  type BreakpointCondition,
  type TraceExportOptions,
  type AgentError,
  type LLMRequestDetails,
  type LLMResponseDetails,
  type ToolCallDetails,
  type ToolResultDetails,
  DEFAULT_DEBUG_CONFIG,
} from './types';

export class AgentDebugger {
  private config: DebugConfig;
  private traces = new Map<string, AgentTrace>();
  private activeTraceId: string | null = null;
  private breakpoints: BreakpointCondition[] = [];
  private isPaused = false;
  private pauseResolve?: () => void;
  private onBreakpointHit?: (step: AgentStep, breakpoint: BreakpointCondition) => void;

  constructor(config: Partial<DebugConfig> = {}) {
    this.config = { ...DEFAULT_DEBUG_CONFIG, ...config };
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(config: Partial<DebugConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Start a new trace for a session run
   */
  startTrace(sessionId: string, runId: string): AgentTrace {
    const trace: AgentTrace = {
      traceId: randomUUID(),
      sessionId,
      runId,
      startedAt: Date.now(),
      status: 'running',
      steps: [],
      metrics: this.createEmptyMetrics(),
    };

    this.traces.set(trace.traceId, trace);
    this.activeTraceId = trace.traceId;
    return trace;
  }

  /**
   * Get active trace
   */
  getActiveTrace(): AgentTrace | null {
    if (!this.activeTraceId) return null;
    return this.traces.get(this.activeTraceId) || null;
  }

  /**
   * Get trace by ID
   */
  getTrace(traceId: string): AgentTrace | undefined {
    return this.traces.get(traceId);
  }

  /**
   * Record an LLM call step
   */
  recordLLMCall(
    traceId: string,
    request: LLMRequestDetails,
    response: LLMResponseDetails,
    durationMs: number
  ): AgentStep {
    const step = this.createStep(traceId, 'llm-call', durationMs);
    step.llmRequest = request;
    step.llmResponse = response;
    
    // Update metrics
    const trace = this.traces.get(traceId);
    if (trace) {
      trace.metrics.llmCalls++;
      trace.metrics.totalInputTokens += request.promptTokens;
      trace.metrics.totalOutputTokens += response.outputTokens;
    }
    
    return this.recordStep(traceId, step);
  }

  /**
   * Record a tool call step
   */
  recordToolCall(traceId: string, details: ToolCallDetails): AgentStep {
    const step = this.createStep(traceId, 'tool-call', 0);
    step.toolCall = details;
    return this.recordStep(traceId, step);
  }

  /**
   * Record a tool result step
   */
  recordToolResult(
    traceId: string,
    toolCallStepId: string,
    result: ToolResultDetails,
    durationMs: number
  ): AgentStep {
    const step = this.createStep(traceId, 'tool-result', durationMs);
    step.toolResult = result;
    step.parentStepId = toolCallStepId;
    
    // Update metrics
    const trace = this.traces.get(traceId);
    if (trace) {
      trace.metrics.toolCalls++;
      if (result.success) {
        trace.metrics.successfulToolCalls++;
      } else {
        trace.metrics.failedToolCalls++;
      }
      
      // Track tool usage
      const toolCallStep = trace.steps.find(s => s.stepId === toolCallStepId);
      if (toolCallStep?.toolCall?.name) {
        const toolName = toolCallStep.toolCall.name;
        trace.metrics.toolUsage[toolName] = (trace.metrics.toolUsage[toolName] || 0) + 1;
      }
    }
    
    return this.recordStep(traceId, step);
  }

  /**
   * Record an error step
   */
  recordError(traceId: string, error: AgentError): AgentStep {
    const step = this.createStep(traceId, 'error', 0);
    step.error = error;
    
    const trace = this.traces.get(traceId);
    if (trace && !error.recovered) {
      trace.error = error;
      trace.status = 'failed';
    }
    
    return this.recordStep(traceId, step);
  }

  /**
   * Complete a trace
   */
  completeTrace(traceId: string, status: 'completed' | 'failed' = 'completed'): void {
    const trace = this.traces.get(traceId);
    if (!trace) return;

    trace.completedAt = Date.now();
    trace.durationMs = trace.completedAt - trace.startedAt;
    trace.status = status;
    
    // Finalize metrics
    this.finalizeMetrics(trace);

    if (this.activeTraceId === traceId) {
      this.activeTraceId = null;
    }

    // Export on error if configured
    if (status === 'failed' && this.config.exportOnError) {
      // Export would be handled by the caller
    }
  }

  /**
   * Add a breakpoint
   */
  addBreakpoint(condition: Omit<BreakpointCondition, 'id'>): BreakpointCondition {
    const breakpoint: BreakpointCondition = {
      ...condition,
      id: randomUUID(),
    };
    this.breakpoints.push(breakpoint);
    return breakpoint;
  }

  /**
   * Remove a breakpoint
   */
  removeBreakpoint(breakpointId: string): boolean {
    const index = this.breakpoints.findIndex(bp => bp.id === breakpointId);
    if (index >= 0) {
      this.breakpoints.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all breakpoints
   */
  getBreakpoints(): BreakpointCondition[] {
    return [...this.breakpoints];
  }

  /**
   * Clear all breakpoints
   */
  clearBreakpoints(): void {
    this.breakpoints = [];
  }

  /**
   * Set callback for breakpoint hits
   */
  onBreakpoint(callback: (step: AgentStep, breakpoint: BreakpointCondition) => void): void {
    this.onBreakpointHit = callback;
  }

  /**
   * Check if debugger is paused
   */
  get paused(): boolean {
    return this.isPaused;
  }

  /**
   * Pause execution (for step-through debugging)
   */
  async pause(): Promise<void> {
    if (this.isPaused) return;
    
    this.isPaused = true;
    const trace = this.getActiveTrace();
    if (trace) {
      trace.status = 'paused';
    }
    
    await new Promise<void>(resolve => {
      this.pauseResolve = resolve;
    });
  }

  /**
   * Resume execution
   */
  resume(): void {
    if (!this.isPaused) return;
    
    this.isPaused = false;
    const trace = this.getActiveTrace();
    if (trace) {
      trace.status = 'running';
    }
    
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = undefined;
    }
  }

  /**
   * Step over (execute next step then pause)
   */
  stepOver(): void {
    // Implementation would set a one-time breakpoint on next step
    this.resume();
  }

  /**
   * Export trace to specified format
   */
  exportTrace(traceId: string, options: TraceExportOptions = { format: 'json' }): string {
    const trace = this.traces.get(traceId);
    if (!trace) {
      throw new Error(`Trace ${traceId} not found`);
    }

    switch (options.format) {
      case 'json':
        return JSON.stringify(trace, null, 2);
      case 'markdown':
        return this.formatTraceAsMarkdown(trace, options);
      case 'html':
        return this.formatTraceAsHTML(trace, options);
      default:
        return JSON.stringify(trace, null, 2);
    }
  }

  /**
   * Get all traces for a session
   */
  getTracesForSession(sessionId: string): AgentTrace[] {
    return Array.from(this.traces.values())
      .filter(t => t.sessionId === sessionId)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  /**
   * Delete a specific trace
   */
  deleteTrace(traceId: string): boolean {
    if (this.activeTraceId === traceId) {
      this.activeTraceId = null;
    }
    return this.traces.delete(traceId);
  }

  /**
   * Delete all traces for a session
   */
  deleteTracesForSession(sessionId: string): number {
    const sessionTraces = this.getTracesForSession(sessionId);
    let deleted = 0;
    
    for (const trace of sessionTraces) {
      if (this.deleteTrace(trace.traceId)) {
        deleted++;
      }
    }
    
    return deleted;
  }

  /**
   * Clear all traces
   */
  clearAllTraces(): void {
    this.traces.clear();
    this.activeTraceId = null;
  }

  /**
   * Get all traces
   */
  getAllTraces(): AgentTrace[] {
    return Array.from(this.traces.values())
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  /**
   * Get configuration
   */
  getConfig(): DebugConfig {
    return { ...this.config };
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  private createStep(traceId: string, type: AgentStep['type'], durationMs: number): AgentStep {
    const trace = this.traces.get(traceId);
    const now = Date.now();
    
    return {
      stepId: randomUUID(),
      stepNumber: (trace?.steps.length || 0) + 1,
      type,
      startedAt: now - durationMs,
      completedAt: now,
      durationMs,
    };
  }

  private recordStep(traceId: string, step: AgentStep): AgentStep {
    const trace = this.traces.get(traceId);
    if (!trace) {
      throw new Error(`Trace ${traceId} not found`);
    }

    trace.steps.push(step);
    trace.metrics.totalSteps++;
    trace.metrics.totalDurationMs += step.durationMs;

    // Check breakpoints
    if (this.config.stepMode) {
      void this.pause();
    } else {
      const matchedBreakpoint = this.checkBreakpoints(step);
      if (matchedBreakpoint) {
        this.onBreakpointHit?.(step, matchedBreakpoint);
        void this.pause();
      }
    }

    return step;
  }

  private checkBreakpoints(step: AgentStep): BreakpointCondition | null {
    for (const bp of this.breakpoints) {
      if (!bp.enabled) continue;

      switch (bp.type) {
        case 'tool':
          if (step.type === 'tool-call' && step.toolCall?.name === bp.toolName) {
            return bp;
          }
          break;
        case 'error':
          if (step.type === 'error') {
            return bp;
          }
          break;
        case 'step':
          if (step.stepNumber === bp.stepNumber) {
            return bp;
          }
          break;
      }
    }
    return null;
  }

  private createEmptyMetrics(): TraceMetrics {
    return {
      totalSteps: 0,
      llmCalls: 0,
      toolCalls: 0,
      successfulToolCalls: 0,
      failedToolCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalDurationMs: 0,
      avgLLMDurationMs: 0,
      avgToolDurationMs: 0,
      toolUsage: {},
    };
  }

  private finalizeMetrics(trace: AgentTrace): void {
    const llmSteps = trace.steps.filter(s => s.type === 'llm-call');
    const toolSteps = trace.steps.filter(s => s.type === 'tool-result');

    if (llmSteps.length > 0) {
      const totalLLMDuration = llmSteps.reduce((sum, s) => sum + s.durationMs, 0);
      trace.metrics.avgLLMDurationMs = Math.round(totalLLMDuration / llmSteps.length);
    }

    if (toolSteps.length > 0) {
      const totalToolDuration = toolSteps.reduce((sum, s) => sum + s.durationMs, 0);
      trace.metrics.avgToolDurationMs = Math.round(totalToolDuration / toolSteps.length);
    }
  }

  private formatTraceAsMarkdown(trace: AgentTrace, options: TraceExportOptions): string {
    const maxPreview = options.maxPreviewLength || 200;
    const lines: string[] = [
      `# Agent Trace: ${trace.traceId.slice(0, 8)}`,
      '',
      '## Overview',
      '',
      `| Property | Value |`,
      `|----------|-------|`,
      `| Session | ${trace.sessionId} |`,
      `| Run | ${trace.runId} |`,
      `| Status | ${trace.status} |`,
      `| Started | ${new Date(trace.startedAt).toISOString()} |`,
      `| Duration | ${trace.durationMs || 0}ms |`,
      `| Total Steps | ${trace.metrics.totalSteps} |`,
      `| LLM Calls | ${trace.metrics.llmCalls} |`,
      `| Tool Calls | ${trace.metrics.toolCalls} (${trace.metrics.successfulToolCalls} success, ${trace.metrics.failedToolCalls} failed) |`,
      `| Input Tokens | ${trace.metrics.totalInputTokens} |`,
      `| Output Tokens | ${trace.metrics.totalOutputTokens} |`,
      '',
      '## Steps',
      '',
    ];

    for (const step of trace.steps) {
      lines.push(`### Step ${step.stepNumber}: ${step.type}`);
      lines.push(`**Duration**: ${step.durationMs}ms`);
      lines.push('');

      if (step.llmRequest) {
        lines.push(`**Provider**: ${step.llmRequest.provider} / ${step.llmRequest.model}`);
        lines.push(`**Tokens**: ${step.llmRequest.promptTokens} in → ${step.llmResponse?.outputTokens || '?'} out`);
      }

      if (step.toolCall) {
        lines.push(`**Tool**: \`${step.toolCall.name}\``);
        lines.push('```json');
        lines.push(step.toolCall.argumentsPreview.slice(0, maxPreview));
        lines.push('```');
      }

      if (step.toolResult) {
        lines.push(`**Result**: ${step.toolResult.success ? '[OK] Success' : '[ERR] Failed'}`);
        if (step.toolResult.outputPreview) {
          lines.push('```');
          lines.push(step.toolResult.outputPreview.slice(0, maxPreview));
          lines.push('```');
        }
      }

      if (step.error) {
        lines.push(`**Error**: ${step.error.message}`);
        if (step.error.stack) {
          lines.push('```');
          lines.push(step.error.stack);
          lines.push('```');
        }
      }

      lines.push('');
    }

    if (trace.error) {
      lines.push('## Error');
      lines.push('```');
      lines.push(trace.error.message);
      if (trace.error.stack) {
        lines.push(trace.error.stack);
      }
      lines.push('```');
    }

    return lines.join('\n');
  }

  /**
   * Generate a unique checksum for trace integrity verification
   */
  private generateTraceChecksum(trace: AgentTrace): string {
    const content = JSON.stringify({
      traceId: trace.traceId,
      sessionId: trace.sessionId,
      runId: trace.runId,
      steps: trace.steps.map(s => ({ stepId: s.stepId, type: s.type })),
    });
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  private formatTraceAsHTML(trace: AgentTrace, options: TraceExportOptions): string {
    // Basic HTML export - enhanced with options support
    const maxPreview = options.maxPreviewLength || 500;
    const json = JSON.stringify(trace, null, 2);
    const checksum = this.generateTraceChecksum(trace);
    
    // Generate step details HTML
    const stepsHtml = trace.steps.map(step => {
      let stepContent = `<div class="step">
        <h3>Step ${step.stepNumber}: ${step.type}</h3>
        <p><strong>Duration:</strong> ${step.durationMs}ms</p>`;
      
      if (step.toolCall) {
        stepContent += `<p><strong>Tool:</strong> ${step.toolCall.name}</p>
        <pre>${this.escapeHtml(step.toolCall.argumentsPreview.slice(0, maxPreview))}</pre>`;
      }
      
      stepContent += '</div>';
      return stepContent;
    }).join('\n');

    return `<!DOCTYPE html>
<html>
<head>
  <title>Agent Trace ${trace.traceId.slice(0, 8)}</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 20px; }
    pre { background: #f5f5f5; padding: 15px; overflow-x: auto; max-height: 400px; }
    .success { color: green; }
    .failed { color: red; }
    table { border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f0f0f0; }
    .step { margin: 15px 0; padding: 10px; border: 1px solid #eee; border-radius: 4px; }
    .step h3 { margin: 0 0 10px 0; }
  </style>
</head>
<body>
  <h1>Agent Trace: ${trace.traceId.slice(0, 8)}</h1>
  <p><strong>Checksum:</strong> ${checksum}</p>
  <p><strong>Status:</strong> <span class="${trace.status === 'completed' ? 'success' : trace.status === 'failed' ? 'failed' : ''}">${trace.status}</span></p>
  <p><strong>Duration:</strong> ${trace.durationMs || 0}ms</p>
  <p><strong>Steps:</strong> ${trace.metrics.totalSteps}</p>
  <h2>Step Details</h2>
  ${stepsHtml}
  <h2>Full Trace</h2>
  <pre>${this.escapeHtml(json)}</pre>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
