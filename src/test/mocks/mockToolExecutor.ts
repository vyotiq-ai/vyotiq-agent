/**
 * Mock Tool Executor
 *
 * Records tool calls and returns configured results for testing.
 * Supports failure simulation and call verification.
 */
import { vi } from 'vitest';
import type { ToolExecutionContext } from '../../main/tools/types';

// =============================================================================
// Types
// =============================================================================

export interface MockToolResult {
  toolName: string;
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface MockToolCall {
  toolName: string;
  args: Record<string, unknown>;
  context?: Partial<ToolExecutionContext>;
  timestamp: number;
}

export interface MockToolConfig {
  /** Default result for tools without specific configuration */
  defaultResult?: MockToolResult;
  /** Results by tool name */
  toolResults?: Map<string, MockToolResult | MockToolResult[]>;
  /** Simulate latency in ms */
  latencyMs?: number;
  /** Tools that should fail */
  failingTools?: Set<string>;
  /** Error message for failing tools */
  failureMessage?: string;
}

// =============================================================================
// MockToolExecutor Class
// =============================================================================

export class MockToolExecutor {
  private config: MockToolConfig;
  private callHistory: MockToolCall[] = [];
  private resultQueues = new Map<string, MockToolResult[]>();

  constructor(config: MockToolConfig = {}) {
    this.config = {
      defaultResult: {
        toolName: 'unknown',
        success: true,
        output: 'Mock tool executed successfully',
      },
      latencyMs: 0,
      failingTools: new Set(),
      failureMessage: 'Tool execution failed',
      ...config,
    };

    // Initialize result queues from config
    if (config.toolResults) {
      for (const [name, result] of config.toolResults) {
        if (Array.isArray(result)) {
          this.resultQueues.set(name, [...result]);
        } else {
          this.resultQueues.set(name, [result]);
        }
      }
    }
  }

  /**
   * Execute a tool (mock implementation)
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>,
    context?: Partial<ToolExecutionContext>
  ): Promise<MockToolResult> {
    // Record the call
    this.callHistory.push({
      toolName,
      args: { ...args },
      context,
      timestamp: Date.now(),
    });

    // Simulate latency
    if (this.config.latencyMs && this.config.latencyMs > 0) {
      await this.delay(this.config.latencyMs);
    }

    // Check if tool should fail
    if (this.config.failingTools?.has(toolName)) {
      return {
        toolName,
        success: false,
        output: '',
        error: this.config.failureMessage,
      };
    }

    // Get result from queue or use default
    const queue = this.resultQueues.get(toolName);
    if (queue && queue.length > 0) {
      const result = queue.shift()!;
      // If queue is empty after shift, refill with the last result for repeated calls
      if (queue.length === 0) {
        queue.push(result);
      }
      return { ...result, toolName };
    }

    return {
      ...this.config.defaultResult!,
      toolName,
    };
  }

  /**
   * Set result for a specific tool
   */
  setToolResult(toolName: string, result: MockToolResult | MockToolResult[]): void {
    if (Array.isArray(result)) {
      this.resultQueues.set(toolName, [...result]);
    } else {
      this.resultQueues.set(toolName, [result]);
    }
  }

  /**
   * Set a tool to fail
   */
  setToolFailure(toolName: string, shouldFail: boolean = true): void {
    if (shouldFail) {
      this.config.failingTools?.add(toolName);
    } else {
      this.config.failingTools?.delete(toolName);
    }
  }

  /**
   * Set latency for all tool executions
   */
  setLatency(ms: number): void {
    this.config.latencyMs = ms;
  }

  /**
   * Get all recorded calls
   */
  getCallHistory(): MockToolCall[] {
    return [...this.callHistory];
  }

  /**
   * Get calls for a specific tool
   */
  getCallsForTool(toolName: string): MockToolCall[] {
    return this.callHistory.filter(c => c.toolName === toolName);
  }

  /**
   * Get the last call made
   */
  getLastCall(): MockToolCall | undefined {
    return this.callHistory[this.callHistory.length - 1];
  }

  /**
   * Check if a tool was called
   */
  wasToolCalled(toolName: string): boolean {
    return this.callHistory.some(c => c.toolName === toolName);
  }

  /**
   * Get call count for a tool
   */
  getCallCount(toolName?: string): number {
    if (toolName) {
      return this.callHistory.filter(c => c.toolName === toolName).length;
    }
    return this.callHistory.length;
  }

  /**
   * Clear call history
   */
  clearHistory(): void {
    this.callHistory = [];
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this.callHistory = [];
    this.resultQueues.clear();
    this.config.failingTools?.clear();
  }

  /**
   * Assert that a tool was called with specific arguments
   */
  assertToolCalled(toolName: string, expectedArgs?: Record<string, unknown>): void {
    const calls = this.getCallsForTool(toolName);
    if (calls.length === 0) {
      throw new Error(`Expected tool "${toolName}" to be called, but it was not`);
    }
    if (expectedArgs) {
      const matchingCall = calls.find(c => 
        Object.entries(expectedArgs).every(([key, value]) => c.args[key] === value)
      );
      if (!matchingCall) {
        throw new Error(
          `Expected tool "${toolName}" to be called with ${JSON.stringify(expectedArgs)}, ` +
          `but was called with ${JSON.stringify(calls.map(c => c.args))}`
        );
      }
    }
  }

  /**
   * Assert tool call sequence
   */
  assertCallSequence(expectedSequence: string[]): void {
    const actualSequence = this.callHistory.map(c => c.toolName);
    if (actualSequence.length !== expectedSequence.length) {
      throw new Error(
        `Expected ${expectedSequence.length} tool calls, but got ${actualSequence.length}. ` +
        `Expected: ${expectedSequence.join(' -> ')}, Actual: ${actualSequence.join(' -> ')}`
      );
    }
    for (let i = 0; i < expectedSequence.length; i++) {
      if (actualSequence[i] !== expectedSequence[i]) {
        throw new Error(
          `Expected tool "${expectedSequence[i]}" at position ${i}, but got "${actualSequence[i]}"`
        );
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a mock tool executor with default configuration
 */
export function createMockToolExecutor(config?: MockToolConfig): MockToolExecutor {
  return new MockToolExecutor(config);
}

/**
 * Create a mock tool executor with common file operation results
 */
export function createFileToolExecutor(): MockToolExecutor {
  const executor = new MockToolExecutor();
  
  executor.setToolResult('read_file', {
    toolName: 'read_file',
    success: true,
    output: '// Mock file content\nconst x = 1;\nexport default x;',
  });
  
  executor.setToolResult('write_file', {
    toolName: 'write_file',
    success: true,
    output: 'File written successfully',
  });
  
  executor.setToolResult('edit', {
    toolName: 'edit',
    success: true,
    output: 'File edited successfully',
  });
  
  executor.setToolResult('list_dir', {
    toolName: 'list_dir',
    success: true,
    output: 'src/\n  index.ts\n  utils.ts\npackage.json',
  });
  
  executor.setToolResult('glob', {
    toolName: 'glob',
    success: true,
    output: JSON.stringify(['src/index.ts', 'src/utils.ts']),
  });
  
  executor.setToolResult('grep', {
    toolName: 'grep',
    success: true,
    output: 'src/index.ts:1:const x = 1;',
  });
  
  return executor;
}

/**
 * Create a mock tool executor with terminal operation results
 */
export function createTerminalToolExecutor(): MockToolExecutor {
  const executor = new MockToolExecutor();
  
  executor.setToolResult('run_terminal_command', {
    toolName: 'run_terminal_command',
    success: true,
    output: 'Command executed successfully\nExit code: 0',
  });
  
  executor.setToolResult('check_terminal', {
    toolName: 'check_terminal',
    success: true,
    output: JSON.stringify({ running: false, exitCode: 0 }),
  });
  
  return executor;
}

/**
 * Create vitest mock functions for tool executor
 */
export function createToolExecutorMocks() {
  return {
    execute: vi.fn<(name: string, args: Record<string, unknown>, ctx?: Partial<ToolExecutionContext>) => Promise<MockToolResult>>(),
    getCallHistory: vi.fn<() => MockToolCall[]>(),
    wasToolCalled: vi.fn<(name: string) => boolean>(),
    reset: vi.fn(),
  };
}
