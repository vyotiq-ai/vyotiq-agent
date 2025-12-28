/**
 * Agent Metrics - Run tracking implementation
 * Provides metrics tracking for agent runs
 */

interface MetricsData {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  totalTokensUsed: number;
  totalDurationMs: number;
  toolCallsCount: number;
  averageResponseTime: number;
}

interface RunMetrics {
  runId: string;
  sessionId: string;
  provider: string;
  maxIterations: number;
  startTime: number;
  iterations: number;
  providerCalls: number;
  providerCallsSucceeded: number;
  providerCallsRetried: number;
  toolsExecuted: number;
  toolsSucceeded: number;
  toolsRetried: number;
  toolUsage: Map<string, number>;
  awaitingConfirmationCount: number;
  contextMessageCount: number;
  hasContext: boolean;
  isCompressed: boolean;
}

interface RunResult {
  durationMs: number;
  iterations: number;
  toolsExecuted: number;
  toolsSucceeded: number;
}

class AgentMetrics {
  private data: MetricsData = {
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    totalTokensUsed: 0,
    totalDurationMs: 0,
    toolCallsCount: 0,
    averageResponseTime: 0,
  };

  private activeRuns: Map<string, RunMetrics> = new Map();

  startRun(runId: string, sessionId: string, provider: string, maxIterations: number): void {
    this.activeRuns.set(runId, {
      runId,
      sessionId,
      provider,
      maxIterations,
      startTime: Date.now(),
      iterations: 0,
      providerCalls: 0,
      providerCallsSucceeded: 0,
      providerCallsRetried: 0,
      toolsExecuted: 0,
      toolsSucceeded: 0,
      toolsRetried: 0,
      toolUsage: new Map(),
      awaitingConfirmationCount: 0,
      contextMessageCount: 0,
      hasContext: false,
      isCompressed: false,
    });
  }

  completeRun(runId: string, status: 'completed' | 'error'): RunResult | null {
    const run = this.activeRuns.get(runId);
    if (!run) return null;

    const durationMs = Date.now() - run.startTime;
    this.data.totalRuns++;
    this.data.totalDurationMs += durationMs;
    this.data.toolCallsCount += run.toolsExecuted;

    if (status === 'completed') {
      this.data.successfulRuns++;
    } else {
      this.data.failedRuns++;
    }

    this.data.averageResponseTime = this.data.totalDurationMs / this.data.totalRuns;
    this.activeRuns.delete(runId);

    return {
      durationMs,
      iterations: run.iterations,
      toolsExecuted: run.toolsExecuted,
      toolsSucceeded: run.toolsSucceeded,
    };
  }

  recordIteration(runId: string): void {
    const run = this.activeRuns.get(runId);
    if (run) run.iterations++;
  }

  recordAwaitingConfirmation(runId: string): void {
    const run = this.activeRuns.get(runId);
    if (run) run.awaitingConfirmationCount++;
  }

  recordProviderCall(runId: string, success: boolean, isRetry: boolean): void {
    const run = this.activeRuns.get(runId);
    if (!run) return;
    run.providerCalls++;
    if (success) run.providerCallsSucceeded++;
    if (isRetry) run.providerCallsRetried++;
  }

  recordToolExecution(runId: string, success: boolean, isRetry: boolean, toolName: string): void {
    const run = this.activeRuns.get(runId);
    if (!run) return;
    run.toolsExecuted++;
    if (success) run.toolsSucceeded++;
    if (isRetry) run.toolsRetried++;
    run.toolUsage.set(toolName, (run.toolUsage.get(toolName) || 0) + 1);
  }

  updateContextMetrics(runId: string, messageCount: number, hasContext: boolean, isCompressed: boolean): void {
    const run = this.activeRuns.get(runId);
    if (!run) return;
    run.contextMessageCount = messageCount;
    run.hasContext = hasContext;
    run.isCompressed = isCompressed;
  }

  recordRun(success: boolean, durationMs: number, tokensUsed: number = 0, toolCalls: number = 0): void {
    this.data.totalRuns++;
    if (success) {
      this.data.successfulRuns++;
    } else {
      this.data.failedRuns++;
    }
    this.data.totalDurationMs += durationMs;
    this.data.totalTokensUsed += tokensUsed;
    this.data.toolCallsCount += toolCalls;
    this.data.averageResponseTime = this.data.totalDurationMs / this.data.totalRuns;
  }

  getMetrics(): MetricsData {
    return { ...this.data };
  }

  reset(): void {
    this.data = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      totalTokensUsed: 0,
      totalDurationMs: 0,
      toolCallsCount: 0,
      averageResponseTime: 0,
    };
    this.activeRuns.clear();
  }

  getSuccessRate(): number {
    if (this.data.totalRuns === 0) return 0;
    return this.data.successfulRuns / this.data.totalRuns;
  }
}

export const agentMetrics = new AgentMetrics();