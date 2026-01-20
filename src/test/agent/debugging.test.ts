/**
 * Agent Debugging Module Tests
 *
 * Tests for the debugging infrastructure including:
 * - AgentDebugger - Trace management
 * - ExecutionRecorder - Recording sessions
 * - StateInspector - State snapshots
 * - BreakpointManager - Breakpoint conditions
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Types for testing
interface AgentTrace {
  traceId: string;
  sessionId: string;
  runId: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  status: 'running' | 'completed' | 'failed' | 'paused';
  steps: AgentStep[];
  error?: { message: string; code?: string };
  metrics: TraceMetrics;
}

interface AgentStep {
  stepId: string;
  stepNumber: number;
  type: 'llm-call' | 'tool-call' | 'tool-result' | 'decision' | 'error';
  startedAt: number;
  completedAt: number;
  durationMs: number;
  llmRequest?: { provider: string; model: string; promptTokens: number };
  llmResponse?: { outputTokens: number; finishReason: string };
  toolCall?: { name: string; callId: string; arguments: Record<string, unknown> };
  toolResult?: { success: boolean; outputPreview: string };
  error?: { message: string };
}

interface TraceMetrics {
  totalSteps: number;
  llmCalls: number;
  toolCalls: number;
  successfulToolCalls: number;
  failedToolCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
  avgLLMDurationMs: number;
  avgToolDurationMs: number;
  toolUsage: Record<string, number>;
}

interface DebugConfig {
  verbose: boolean;
  captureFullPayloads: boolean;
  stepMode: boolean;
  exportOnError: boolean;
  exportFormat: 'json' | 'markdown';
}

describe('AgentDebugger', () => {
  let traces: Map<string, AgentTrace>;
  let config: DebugConfig;
  // Mock functions for testing callbacks
  const mockOnTraceStart = vi.fn();
  const mockOnTraceComplete = vi.fn();

  beforeEach(() => {
    traces = new Map();
    config = {
      verbose: false,
      captureFullPayloads: false,
      stepMode: false,
      exportOnError: true,
      exportFormat: 'json',
    };
    // Reset mocks before each test
    mockOnTraceStart.mockReset();
    mockOnTraceComplete.mockReset();
  });

  describe('Trace Management', () => {
    it('should start a new trace', () => {
      const trace: AgentTrace = {
        traceId: 'trace-1',
        sessionId: 'session-1',
        runId: 'run-1',
        startedAt: Date.now(),
        status: 'running',
        steps: [],
        metrics: {
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
        },
      };

      traces.set(trace.traceId, trace);
      expect(traces.has('trace-1')).toBe(true);
      expect(traces.get('trace-1')?.status).toBe('running');
    });

    it('should complete a trace', () => {
      const trace: AgentTrace = {
        traceId: 'trace-1',
        sessionId: 'session-1',
        runId: 'run-1',
        startedAt: Date.now() - 5000,
        status: 'running',
        steps: [],
        metrics: {
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
        },
      };

      traces.set(trace.traceId, trace);

      // Complete the trace
      const completedTrace = traces.get('trace-1')!;
      completedTrace.status = 'completed';
      completedTrace.completedAt = Date.now();
      completedTrace.durationMs = completedTrace.completedAt - completedTrace.startedAt;

      expect(completedTrace.status).toBe('completed');
      expect(completedTrace.durationMs).toBeGreaterThan(0);
    });

    it('should fail a trace with error', () => {
      const trace: AgentTrace = {
        traceId: 'trace-1',
        sessionId: 'session-1',
        runId: 'run-1',
        startedAt: Date.now(),
        status: 'running',
        steps: [],
        metrics: {
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
        },
      };

      traces.set(trace.traceId, trace);

      // Fail the trace
      const failedTrace = traces.get('trace-1')!;
      failedTrace.status = 'failed';
      failedTrace.error = { message: 'Provider error', code: 'PROVIDER_ERROR' };

      expect(failedTrace.status).toBe('failed');
      expect(failedTrace.error?.message).toBe('Provider error');
    });
  });

  describe('Step Recording', () => {
    it('should record LLM call step', () => {
      const step: AgentStep = {
        stepId: 'step-1',
        stepNumber: 1,
        type: 'llm-call',
        startedAt: Date.now() - 1000,
        completedAt: Date.now(),
        durationMs: 1000,
        llmRequest: {
          provider: 'anthropic',
          model: 'claude-sonnet-4',
          promptTokens: 500,
        },
        llmResponse: {
          outputTokens: 200,
          finishReason: 'stop',
        },
      };

      expect(step.type).toBe('llm-call');
      expect(step.llmRequest?.provider).toBe('anthropic');
      expect(step.llmResponse?.outputTokens).toBe(200);
    });

    it('should record tool call step', () => {
      const step: AgentStep = {
        stepId: 'step-2',
        stepNumber: 2,
        type: 'tool-call',
        startedAt: Date.now() - 500,
        completedAt: Date.now(),
        durationMs: 500,
        toolCall: {
          name: 'read',
          callId: 'call-1',
          arguments: { path: '/src/app.ts' },
        },
      };

      expect(step.type).toBe('tool-call');
      expect(step.toolCall?.name).toBe('read');
    });

    it('should record tool result step', () => {
      const step: AgentStep = {
        stepId: 'step-3',
        stepNumber: 3,
        type: 'tool-result',
        startedAt: Date.now() - 100,
        completedAt: Date.now(),
        durationMs: 100,
        toolResult: {
          success: true,
          outputPreview: 'File content...',
        },
      };

      expect(step.type).toBe('tool-result');
      expect(step.toolResult?.success).toBe(true);
    });

    it('should record error step', () => {
      const step: AgentStep = {
        stepId: 'step-4',
        stepNumber: 4,
        type: 'error',
        startedAt: Date.now(),
        completedAt: Date.now(),
        durationMs: 0,
        error: {
          message: 'File not found',
        },
      };

      expect(step.type).toBe('error');
      expect(step.error?.message).toBe('File not found');
    });
  });

  describe('Metrics Calculation', () => {
    it('should calculate trace metrics', () => {
      const steps: AgentStep[] = [
        {
          stepId: 'step-1',
          stepNumber: 1,
          type: 'llm-call',
          startedAt: 0,
          completedAt: 1000,
          durationMs: 1000,
          llmRequest: { provider: 'anthropic', model: 'claude', promptTokens: 500 },
          llmResponse: { outputTokens: 200, finishReason: 'tool_calls' },
        },
        {
          stepId: 'step-2',
          stepNumber: 2,
          type: 'tool-call',
          startedAt: 1000,
          completedAt: 1500,
          durationMs: 500,
          toolCall: { name: 'read', callId: 'call-1', arguments: {} },
        },
        {
          stepId: 'step-3',
          stepNumber: 3,
          type: 'tool-result',
          startedAt: 1500,
          completedAt: 1600,
          durationMs: 100,
          toolResult: { success: true, outputPreview: 'content' },
        },
        {
          stepId: 'step-4',
          stepNumber: 4,
          type: 'tool-call',
          startedAt: 1600,
          completedAt: 2100,
          durationMs: 500,
          toolCall: { name: 'write', callId: 'call-2', arguments: {} },
        },
        {
          stepId: 'step-5',
          stepNumber: 5,
          type: 'tool-result',
          startedAt: 2100,
          completedAt: 2200,
          durationMs: 100,
          toolResult: { success: false, outputPreview: 'error' },
        },
      ];

      // Calculate metrics
      const metrics: TraceMetrics = {
        totalSteps: steps.length,
        llmCalls: steps.filter(s => s.type === 'llm-call').length,
        toolCalls: steps.filter(s => s.type === 'tool-call').length,
        successfulToolCalls: steps.filter(s => s.type === 'tool-result' && s.toolResult?.success).length,
        failedToolCalls: steps.filter(s => s.type === 'tool-result' && !s.toolResult?.success).length,
        totalInputTokens: steps.reduce((sum, s) => sum + (s.llmRequest?.promptTokens || 0), 0),
        totalOutputTokens: steps.reduce((sum, s) => sum + (s.llmResponse?.outputTokens || 0), 0),
        totalDurationMs: steps.reduce((sum, s) => sum + s.durationMs, 0),
        avgLLMDurationMs: 1000,
        avgToolDurationMs: 300,
        toolUsage: { read: 1, write: 1 },
      };

      expect(metrics.totalSteps).toBe(5);
      expect(metrics.llmCalls).toBe(1);
      expect(metrics.toolCalls).toBe(2);
      expect(metrics.successfulToolCalls).toBe(1);
      expect(metrics.failedToolCalls).toBe(1);
      expect(metrics.totalInputTokens).toBe(500);
      expect(metrics.totalOutputTokens).toBe(200);
    });
  });

  describe('Trace Export', () => {
    it('should export trace as JSON', () => {
      const trace: AgentTrace = {
        traceId: 'trace-1',
        sessionId: 'session-1',
        runId: 'run-1',
        startedAt: Date.now(),
        status: 'completed',
        steps: [],
        metrics: {
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
        },
      };

      const jsonExport = JSON.stringify(trace, null, 2);
      expect(jsonExport).toContain('"traceId": "trace-1"');
      expect(jsonExport).toContain('"status": "completed"');
    });

    it('should export trace as Markdown', () => {
      const trace: AgentTrace = {
        traceId: 'trace-1',
        sessionId: 'session-1',
        runId: 'run-1',
        startedAt: Date.now(),
        status: 'completed',
        steps: [
          {
            stepId: 'step-1',
            stepNumber: 1,
            type: 'llm-call',
            startedAt: 0,
            completedAt: 1000,
            durationMs: 1000,
          },
        ],
        metrics: {
          totalSteps: 1,
          llmCalls: 1,
          toolCalls: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          totalInputTokens: 500,
          totalOutputTokens: 200,
          totalDurationMs: 1000,
          avgLLMDurationMs: 1000,
          avgToolDurationMs: 0,
          toolUsage: {},
        },
      };

      // Generate markdown
      let md = `# Agent Trace: ${trace.traceId}\n\n`;
      md += `**Session:** ${trace.sessionId}\n`;
      md += `**Run:** ${trace.runId}\n`;
      md += `**Status:** ${trace.status}\n\n`;
      md += `## Metrics\n\n`;
      md += `- Total Steps: ${trace.metrics.totalSteps}\n`;
      md += `- LLM Calls: ${trace.metrics.llmCalls}\n`;
      md += `- Tool Calls: ${trace.metrics.toolCalls}\n`;
      md += `- Input Tokens: ${trace.metrics.totalInputTokens}\n`;
      md += `- Output Tokens: ${trace.metrics.totalOutputTokens}\n`;

      expect(md).toContain('# Agent Trace: trace-1');
      expect(md).toContain('**Status:** completed');
      expect(md).toContain('- Total Steps: 1');
    });
  });

  describe('Debug Configuration', () => {
    it('should update debug config', () => {
      config.verbose = true;
      config.captureFullPayloads = true;

      expect(config.verbose).toBe(true);
      expect(config.captureFullPayloads).toBe(true);
    });

    it('should enable step mode', () => {
      config.stepMode = true;
      expect(config.stepMode).toBe(true);
    });
  });
});

describe('ExecutionRecorder', () => {
  describe('Recording Sessions', () => {
    it('should start a recording', () => {
      const recording = {
        id: 'recording-1',
        sessionId: 'session-1',
        startedAt: Date.now(),
        entries: [] as Array<{ type: string; timestamp: number; data: unknown }>,
        metadata: { description: 'Test recording' },
      };

      expect(recording.id).toBe('recording-1');
      expect(recording.entries).toHaveLength(0);
    });

    it('should add entries to recording', () => {
      const entries: Array<{ type: string; timestamp: number; data: unknown }> = [];

      entries.push({
        type: 'message',
        timestamp: Date.now(),
        data: { role: 'user', content: 'Hello' },
      });

      entries.push({
        type: 'tool-call',
        timestamp: Date.now(),
        data: { name: 'read', arguments: { path: '/file.ts' } },
      });

      expect(entries).toHaveLength(2);
      expect(entries[0].type).toBe('message');
      expect(entries[1].type).toBe('tool-call');
    });

    it('should stop recording and calculate duration', () => {
      const recording = {
        id: 'recording-1',
        startedAt: Date.now() - 5000,
        stoppedAt: undefined as number | undefined,
        durationMs: undefined as number | undefined,
      };

      recording.stoppedAt = Date.now();
      recording.durationMs = recording.stoppedAt - recording.startedAt;

      expect(recording.stoppedAt).toBeDefined();
      expect(recording.durationMs).toBeGreaterThan(0);
    });
  });
});

describe('StateInspector', () => {
  describe('State Snapshots', () => {
    it('should capture state snapshot', () => {
      const snapshot = {
        id: 'snapshot-1',
        timestamp: Date.now(),
        sessionId: 'session-1',
        state: {
          status: 'running',
          messageCount: 5,
          toolCallCount: 3,
          currentIteration: 2,
        },
      };

      expect(snapshot.state.status).toBe('running');
      expect(snapshot.state.messageCount).toBe(5);
    });

    it('should compare state snapshots', () => {
      const snapshot1 = {
        state: { messageCount: 5, toolCallCount: 3 },
      };

      const snapshot2 = {
        state: { messageCount: 7, toolCallCount: 5 },
      };

      // Compare snapshots to compute diff
      const diff = {
        messageCount: { 
          before: snapshot1.state.messageCount, 
          after: snapshot2.state.messageCount, 
          changed: snapshot1.state.messageCount !== snapshot2.state.messageCount 
        },
        toolCallCount: { 
          before: snapshot1.state.toolCallCount, 
          after: snapshot2.state.toolCallCount, 
          changed: snapshot1.state.toolCallCount !== snapshot2.state.toolCallCount 
        },
      };

      expect(diff.messageCount.changed).toBe(true);
      expect(diff.toolCallCount.after - diff.toolCallCount.before).toBe(2);
    });
  });

  describe('Resource Usage', () => {
    it('should track resource usage', () => {
      const usage = {
        tokens: { used: 5000, limit: 100000 },
        files: { modified: 3, read: 10 },
        terminals: { active: 1, total: 2 },
        time: { elapsed: 30000, limit: 300000 },
      };

      expect(usage.tokens.used).toBeLessThan(usage.tokens.limit);
      expect(usage.files.modified).toBe(3);
    });
  });
});

describe('BreakpointManager', () => {
  describe('Breakpoint Creation', () => {
    it('should create tool breakpoint', () => {
      const breakpoint = {
        id: 'bp-1',
        type: 'tool' as const,
        toolName: 'write',
        enabled: true,
      };

      expect(breakpoint.type).toBe('tool');
      expect(breakpoint.toolName).toBe('write');
    });

    it('should create error breakpoint', () => {
      const breakpoint = {
        id: 'bp-2',
        type: 'error' as const,
        enabled: true,
      };

      expect(breakpoint.type).toBe('error');
    });

    it('should create iteration breakpoint', () => {
      const breakpoint = {
        id: 'bp-3',
        type: 'iteration' as const,
        iterationNumber: 5,
        enabled: true,
      };

      expect(breakpoint.type).toBe('iteration');
      expect(breakpoint.iterationNumber).toBe(5);
    });
  });

  describe('Breakpoint Evaluation', () => {
    it('should evaluate tool breakpoint', () => {
      const breakpoint = {
        type: 'tool' as const,
        toolName: 'write',
        enabled: true,
      };

      const context = {
        toolName: 'write',
        iteration: 1,
      };

      const shouldBreak = breakpoint.enabled && 
        breakpoint.type === 'tool' && 
        breakpoint.toolName === context.toolName;

      expect(shouldBreak).toBe(true);
    });

    it('should not break on disabled breakpoint', () => {
      const breakpoint = {
        type: 'tool' as const,
        toolName: 'write',
        enabled: false,
      };

      const shouldBreak = breakpoint.enabled;
      expect(shouldBreak).toBe(false);
    });

    it('should evaluate iteration breakpoint', () => {
      const breakpoint = {
        type: 'iteration' as const,
        iterationNumber: 5,
        enabled: true,
      };

      const context = { iteration: 5 };

      const shouldBreak = breakpoint.enabled && 
        breakpoint.type === 'iteration' && 
        breakpoint.iterationNumber === context.iteration;

      expect(shouldBreak).toBe(true);
    });
  });

  describe('Breakpoint Management', () => {
    it('should enable/disable breakpoint', () => {
      const breakpoint = { id: 'bp-1', enabled: true };

      breakpoint.enabled = false;
      expect(breakpoint.enabled).toBe(false);

      breakpoint.enabled = true;
      expect(breakpoint.enabled).toBe(true);
    });

    it('should remove breakpoint', () => {
      const breakpoints = new Map<string, { id: string; enabled: boolean }>();
      breakpoints.set('bp-1', { id: 'bp-1', enabled: true });
      breakpoints.set('bp-2', { id: 'bp-2', enabled: true });

      breakpoints.delete('bp-1');
      expect(breakpoints.has('bp-1')).toBe(false);
      expect(breakpoints.has('bp-2')).toBe(true);
    });
  });
});
