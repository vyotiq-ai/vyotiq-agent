/**
 * Mock LLM Provider
 *
 * Configurable mock provider for testing agent interactions.
 * Supports response configuration, tool call simulation, error simulation, and latency.
 */
import { vi } from 'vitest';
import type { LLMProviderName } from '../../shared/types';

// =============================================================================
// Types
// =============================================================================

export interface MockProviderToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface MockResponse {
  content: string;
  toolCalls?: MockProviderToolCall[];
  finishReason?: 'stop' | 'tool_calls' | 'length' | 'error';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface MockProviderConfig {
  name: LLMProviderName;
  defaultLatencyMs?: number;
  defaultResponse?: MockResponse;
  errorRate?: number;
  errorMessage?: string;
  maxTokens?: number;
}

export interface MockMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: MockProviderToolCall[];
  toolCallId?: string;
}

export interface MockCompletionRequest {
  messages: MockMessage[];
  tools?: Array<{
    name: string;
    description: string;
    schema: Record<string, unknown>;
  }>;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface MockCompletionResponse {
  content: string;
  toolCalls: MockProviderToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// =============================================================================
// MockProvider Class
// =============================================================================

export class MockProvider {
  readonly name: LLMProviderName;
  private config: MockProviderConfig;
  private responseQueue: MockResponse[] = [];
  private callHistory: MockCompletionRequest[] = [];
  private latencyMs: number;
  private shouldError = false;
  private errorMessage = 'Mock provider error';

  constructor(config: MockProviderConfig) {
    this.name = config.name;
    this.config = config;
    this.latencyMs = config.defaultLatencyMs ?? 0;
  }

  /**
   * Configure a sequence of responses
   */
  setResponses(responses: MockResponse[]): void {
    this.responseQueue = [...responses];
  }

  /**
   * Add a single response to the queue
   */
  addResponse(response: MockResponse): void {
    this.responseQueue.push(response);
  }

  /**
   * Set latency for responses
   */
  setLatency(ms: number): void {
    this.latencyMs = ms;
  }

  /**
   * Configure error simulation
   */
  setError(shouldError: boolean, message?: string): void {
    this.shouldError = shouldError;
    if (message) {
      this.errorMessage = message;
    }
  }

  /**
   * Get call history
   */
  getCallHistory(): MockCompletionRequest[] {
    return [...this.callHistory];
  }

  /**
   * Get the last call made
   */
  getLastCall(): MockCompletionRequest | undefined {
    return this.callHistory[this.callHistory.length - 1];
  }

  /**
   * Clear call history
   */
  clearHistory(): void {
    this.callHistory = [];
  }

  /**
   * Reset the provider to initial state
   */
  reset(): void {
    this.responseQueue = [];
    this.callHistory = [];
    this.shouldError = false;
    this.latencyMs = this.config.defaultLatencyMs ?? 0;
  }

  /**
   * Simulate completion request
   */
  async complete(request: MockCompletionRequest): Promise<MockCompletionResponse> {
    // Record the call
    this.callHistory.push({ ...request });

    // Simulate latency
    if (this.latencyMs > 0) {
      await this.delay(this.latencyMs);
    }

    // Check for abort
    if (request.signal?.aborted) {
      throw new Error('Request aborted');
    }

    // Check for error simulation
    if (this.shouldError || (this.config.errorRate && Math.random() < this.config.errorRate)) {
      throw new Error(this.errorMessage);
    }

    // Get response from queue or use default
    const response = this.responseQueue.shift() ?? this.config.defaultResponse ?? {
      content: 'Mock response',
      finishReason: 'stop' as const,
    };

    return {
      content: response.content,
      toolCalls: response.toolCalls ?? [],
      finishReason: response.finishReason ?? 'stop',
      usage: response.usage ?? {
        promptTokens: this.estimateTokens(request.messages),
        completionTokens: this.estimateTokens([{ role: 'assistant', content: response.content }]),
        totalTokens: 0,
      },
    };
  }

  /**
   * Create a streaming completion (simplified mock)
   */
  async *streamComplete(request: MockCompletionRequest): AsyncGenerator<{
    content?: string;
    toolCalls?: MockProviderToolCall[];
    done: boolean;
  }> {
    const response = await this.complete(request);

    // Simulate streaming by yielding chunks
    const words = response.content.split(' ');
    for (let i = 0; i < words.length; i++) {
      yield {
        content: words[i] + (i < words.length - 1 ? ' ' : ''),
        done: false,
      };
      await this.delay(10);
    }

    // Yield tool calls if any
    if (response.toolCalls.length > 0) {
      yield {
        toolCalls: response.toolCalls,
        done: false,
      };
    }

    yield { done: true };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private estimateTokens(messages: MockMessage[]): number {
    return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a mock provider with default configuration
 */
export function createMockProvider(
  name: LLMProviderName = 'anthropic',
  config?: Partial<MockProviderConfig>
): MockProvider {
  return new MockProvider({
    name,
    defaultLatencyMs: 0,
    defaultResponse: {
      content: 'Mock response from ' + name,
      finishReason: 'stop',
    },
    ...config,
  });
}

/**
 * Create a mock provider that simulates tool calls
 */
export function createToolCallingProvider(
  toolCalls: MockProviderToolCall[],
  finalResponse: string = 'Task completed'
): MockProvider {
  const provider = createMockProvider('anthropic');
  
  // First response triggers tool calls
  provider.addResponse({
    content: '',
    toolCalls,
    finishReason: 'tool_calls',
  });
  
  // Second response is the final answer
  provider.addResponse({
    content: finalResponse,
    finishReason: 'stop',
  });
  
  return provider;
}

/**
 * Create a mock provider that always errors
 */
export function createErrorProvider(errorMessage: string = 'Provider error'): MockProvider {
  const provider = createMockProvider('anthropic');
  provider.setError(true, errorMessage);
  return provider;
}

/**
 * Create a mock provider map for testing
 */
export function createMockProviderMap(): Map<LLMProviderName, MockProvider> {
  const map = new Map<LLMProviderName, MockProvider>();
  map.set('anthropic', createMockProvider('anthropic'));
  map.set('openai', createMockProvider('openai'));
  map.set('gemini', createMockProvider('gemini'));
  map.set('deepseek', createMockProvider('deepseek'));
  return map;
}

/**
 * Create vitest mock functions for provider
 */
export function createProviderMocks() {
  return {
    complete: vi.fn<(req: MockCompletionRequest) => Promise<MockCompletionResponse>>(),
    streamComplete: vi.fn(),
    getCallHistory: vi.fn<() => MockCompletionRequest[]>(),
    reset: vi.fn(),
  };
}
