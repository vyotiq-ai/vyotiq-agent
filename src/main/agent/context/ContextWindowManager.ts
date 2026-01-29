/**
 * Context Window Manager
 * 
 * Manages context window utilization for LLM providers.
 * Implements sliding window pruning to prevent context overflow errors.
 * 
 * Key responsibilities:
 * 1. Track token usage per message
 * 2. Enforce context limits based on provider/model
 * 3. Implement intelligent message pruning
 * 4. Preserve tool call/result pairs during pruning
 * 5. Provide context utilization metrics
 */

import type { ChatMessage, LLMProviderName } from '../../../shared/types';
import { SimpleTokenCounter, estimateJsonTokens } from '../routing/tokenUtils';
import { PROVIDER_ORDER } from '../../../shared/providers';

// =============================================================================
// Types
// =============================================================================

export interface ContextWindowConfig {
  /** Maximum context window size in tokens */
  maxContextTokens: number;
  /** Reserved tokens for output (default: 8192) */
  reservedOutputTokens: number;
  /** Threshold (0-1) at which to start warning about context usage */
  warnThreshold: number;
  /** Threshold (0-1) at which to start pruning */
  pruneThreshold: number;
  /** Target utilization after pruning (0-1) */
  targetUtilization: number;
  /** Minimum messages to always keep */
  minMessagesToKeep: number;
  /** Whether to preserve tool call/result pairs during pruning */
  preserveToolPairs: boolean;
}

export interface ContextMetrics {
  /** Total tokens in current context */
  totalTokens: number;
  /** Maximum allowed input tokens */
  maxInputTokens: number;
  /** Current utilization (0-1) */
  utilization: number;
  /** Number of messages in context */
  messageCount: number;
  /** Estimated tokens by message role */
  tokensByRole: {
    system: number;
    user: number;
    assistant: number;
    tool: number;
  };
  /** Whether context is approaching limit */
  isWarning: boolean;
  /** Whether context needs pruning */
  needsPruning: boolean;
  /** Tokens available for new content */
  availableTokens: number;
}

export interface PruningResult {
  /** Messages after pruning */
  messages: ChatMessage[];
  /** Number of messages removed */
  removedCount: number;
  /** Tokens freed by pruning */
  tokensFreed: number;
  /** Reason for pruning */
  reason: string;
}

// =============================================================================
// Default Configurations by Provider
// =============================================================================

const DEFAULT_CONFIG: ContextWindowConfig = {
  maxContextTokens: 128000,
  reservedOutputTokens: 8192,
  warnThreshold: 0.75,
  pruneThreshold: 0.85,
  targetUtilization: 0.60,
  minMessagesToKeep: 10,
  preserveToolPairs: true,
};

/**
 * Provider-specific context window configurations
 * Based on latest API documentation (December 2025)
 */
export const PROVIDER_CONTEXT_CONFIGS: Record<LLMProviderName, Partial<ContextWindowConfig>> = {
  deepseek: {
    maxContextTokens: 128000,  // 128K for deepseek-chat
    reservedOutputTokens: 8192,
    warnThreshold: 0.70,
    pruneThreshold: 0.80,
    targetUtilization: 0.55,
  },
  anthropic: {
    maxContextTokens: 200000,  // 200K for Claude models
    reservedOutputTokens: 16384,
    warnThreshold: 0.80,
    pruneThreshold: 0.90,
    targetUtilization: 0.65,
  },
  openai: {
    maxContextTokens: 128000,  // 128K for gpt-4o
    reservedOutputTokens: 16384,
    warnThreshold: 0.75,
    pruneThreshold: 0.85,
    targetUtilization: 0.60,
  },
  gemini: {
    maxContextTokens: 1000000, // 1M for Gemini 2.0
    reservedOutputTokens: 8192,
    warnThreshold: 0.85,
    pruneThreshold: 0.95,
    targetUtilization: 0.70,
  },
  xai: {
    maxContextTokens: 131072,  // 128K for Grok models
    reservedOutputTokens: 8192,
    warnThreshold: 0.75,
    pruneThreshold: 0.85,
    targetUtilization: 0.60,
  },
  mistral: {
    maxContextTokens: 128000,  // 128K for Mistral Large
    reservedOutputTokens: 8192,
    warnThreshold: 0.75,
    pruneThreshold: 0.85,
    targetUtilization: 0.60,
  },
  glm: {
    maxContextTokens: 128000,  // 128K for GLM-4.7
    reservedOutputTokens: 16384,
    warnThreshold: 0.75,
    pruneThreshold: 0.85,
    targetUtilization: 0.60,
  },
  openrouter: {
    maxContextTokens: 128000,  // Varies by model, use conservative default
    reservedOutputTokens: 8192,
    warnThreshold: 0.75,
    pruneThreshold: 0.85,
    targetUtilization: 0.60,
  },
};

// =============================================================================
// Context Window Manager
// =============================================================================

export class ContextWindowManager {
  private config: ContextWindowConfig;
  
  // Cache for message token counts to avoid recalculation
  private tokenCache = new Map<string, number>();

  constructor(
    provider: LLMProviderName = PROVIDER_ORDER[0],
    customConfig?: Partial<ContextWindowConfig>
  ) {
    const providerConfig = PROVIDER_CONTEXT_CONFIGS[provider] ?? {};
    this.config = {
      ...DEFAULT_CONFIG,
      ...providerConfig,
      ...customConfig,
    };
  }

  /**
   * Update configuration (e.g., when switching providers or models)
   * @param provider - The provider name
   * @param customConfig - Optional custom config overrides
   * @param modelContextWindow - Optional model-specific context window (takes precedence over provider default)
   */
  updateConfig(
    provider: LLMProviderName, 
    customConfig?: Partial<ContextWindowConfig>,
    modelContextWindow?: number
  ): void {
    const providerConfig = PROVIDER_CONTEXT_CONFIGS[provider] ?? {};
    this.config = {
      ...DEFAULT_CONFIG,
      ...providerConfig,
      ...customConfig,
    };
    
    // Use model-specific context window if provided (more accurate than provider default)
    if (modelContextWindow && modelContextWindow > 0) {
      this.config.maxContextTokens = modelContextWindow;
    }
    
    // Clear cache when config changes
    this.tokenCache.clear();
  }

  /**
   * Get the maximum input tokens available (context - reserved output)
   */
  getMaxInputTokens(): number {
    return this.config.maxContextTokens - this.config.reservedOutputTokens;
  }

  /**
   * Count tokens for a single message
   */
  countMessageTokens(message: ChatMessage): number {
    // Check cache first
    const cached = this.tokenCache.get(message.id);
    if (cached !== undefined) {
      return cached;
    }

    let tokens = 0;

    // Base message overhead (role, structure, etc.)
    tokens += 4;

    // Content tokens
    if (message.content) {
      tokens += SimpleTokenCounter.countTokens(message.content);
    }

    // Tool calls
    if (message.toolCalls && message.toolCalls.length > 0) {
      for (const toolCall of message.toolCalls) {
        tokens += 10; // Tool call overhead
        tokens += SimpleTokenCounter.countTokens(toolCall.name);
        if (toolCall.arguments) {
          tokens += estimateJsonTokens(toolCall.arguments);
        }
      }
    }

    // Attachments (rough estimate)
    if (message.attachments && message.attachments.length > 0) {
      for (const attachment of message.attachments) {
        if (attachment.content) {
          // Base64 encoded content is ~4/3 the size
          tokens += Math.ceil(attachment.content.length / 4);
        }
      }
    }

    // Cache the result
    this.tokenCache.set(message.id, tokens);
    
    return tokens;
  }

  /**
   * Count tokens for system prompt
   */
  countSystemPromptTokens(systemPrompt: string): number {
    return SimpleTokenCounter.countTokens(systemPrompt) + 4; // +4 for overhead
  }

  /**
   * Count tokens for tool definitions
   */
  countToolsTokens(tools: Array<{ name: string; description: string; jsonSchema: unknown }>): number {
    let tokens = 0;
    for (const tool of tools) {
      tokens += 20; // Tool definition overhead
      tokens += SimpleTokenCounter.countTokens(tool.name);
      tokens += SimpleTokenCounter.countTokens(tool.description);
      tokens += estimateJsonTokens(tool.jsonSchema);
    }
    return tokens;
  }

  /**
   * Calculate total tokens for a set of messages
   */
  calculateTotalTokens(
    messages: ChatMessage[],
    systemPrompt?: string,
    tools?: Array<{ name: string; description: string; jsonSchema: unknown }>
  ): number {
    let total = 0;

    if (systemPrompt) {
      total += this.countSystemPromptTokens(systemPrompt);
    }

    if (tools && tools.length > 0) {
      total += this.countToolsTokens(tools);
    }

    for (const message of messages) {
      total += this.countMessageTokens(message);
    }

    return total;
  }

  /**
   * Get detailed context metrics
   */
  getContextMetrics(
    messages: ChatMessage[],
    systemPrompt?: string,
    tools?: Array<{ name: string; description: string; jsonSchema: unknown }>
  ): ContextMetrics {
    const maxInputTokens = this.getMaxInputTokens();
    
    // Calculate tokens by role
    const tokensByRole = {
      system: systemPrompt ? this.countSystemPromptTokens(systemPrompt) : 0,
      user: 0,
      assistant: 0,
      tool: 0,
    };

    for (const message of messages) {
      const tokens = this.countMessageTokens(message);
      if (message.role === 'user') {
        tokensByRole.user += tokens;
      } else if (message.role === 'assistant') {
        tokensByRole.assistant += tokens;
      } else if (message.role === 'tool') {
        tokensByRole.tool += tokens;
      }
    }

    const toolsTokens = tools ? this.countToolsTokens(tools) : 0;
    tokensByRole.system += toolsTokens;

    const totalTokens = tokensByRole.system + tokensByRole.user + 
                       tokensByRole.assistant + tokensByRole.tool;
    const utilization = totalTokens / maxInputTokens;

    return {
      totalTokens,
      maxInputTokens,
      utilization,
      messageCount: messages.length,
      tokensByRole,
      isWarning: utilization >= this.config.warnThreshold,
      needsPruning: utilization >= this.config.pruneThreshold,
      availableTokens: Math.max(0, maxInputTokens - totalTokens),
    };
  }

  /**
   * Check if context needs pruning
   */
  needsPruning(
    messages: ChatMessage[],
    systemPrompt?: string,
    tools?: Array<{ name: string; description: string; jsonSchema: unknown }>
  ): boolean {
    const metrics = this.getContextMetrics(messages, systemPrompt, tools);
    return metrics.needsPruning;
  }

  /**
   * Prune messages to fit within context window
   * 
   * Strategy:
   * 1. Always keep system prompt and tools (they're added separately)
   * 2. Always keep the first user message (provides initial context)
   * 3. Keep the most recent messages up to target utilization
   * 4. Preserve tool call/result pairs as atomic units
   * 5. Prioritize keeping user messages and their immediate responses
   */
  pruneMessages(
    messages: ChatMessage[],
    systemPrompt?: string,
    tools?: Array<{ name: string; description: string; jsonSchema: unknown }>,
    reason = 'Context window limit approaching'
  ): PruningResult {
    if (messages.length <= this.config.minMessagesToKeep) {
      return {
        messages,
        removedCount: 0,
        tokensFreed: 0,
        reason: 'Not enough messages to prune',
      };
    }

    const originalTokens = this.calculateTotalTokens(messages, systemPrompt, tools);
    const targetTokens = this.getMaxInputTokens() * this.config.targetUtilization;
    
    // Calculate overhead (system + tools) - these are always kept
    const overheadTokens = (systemPrompt ? this.countSystemPromptTokens(systemPrompt) : 0) +
                          (tools ? this.countToolsTokens(tools) : 0);
    const targetMessageTokens = targetTokens - overheadTokens;

    // Build a list of messages with their token counts and importance
    interface MessageEntry {
      message: ChatMessage;
      tokens: number;
      index: number;
      isFirstUserMessage: boolean;
      isToolPairMember: boolean;
      toolPairId?: string;
    }

    const entries: MessageEntry[] = [];
    const toolPairs = new Map<string, number[]>(); // callId -> [assistantIndex, toolIndex]

    // First pass: identify tool pairs
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === 'assistant' && msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          if (tc.callId) {
            toolPairs.set(tc.callId, [i]);
          }
        }
      } else if (msg.role === 'tool' && msg.toolCallId) {
        const pair = toolPairs.get(msg.toolCallId);
        if (pair) {
          pair.push(i);
        }
      }
    }

    // Find first user message
    const firstUserIndex = messages.findIndex(m => m.role === 'user');

    // Second pass: build entries with metadata
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      let toolPairId: string | undefined;
      
      if (msg.role === 'assistant' && msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          if (tc.callId && toolPairs.has(tc.callId)) {
            toolPairId = tc.callId;
            break;
          }
        }
      } else if (msg.role === 'tool' && msg.toolCallId) {
        toolPairId = msg.toolCallId;
      }

      entries.push({
        message: msg,
        tokens: this.countMessageTokens(msg),
        index: i,
        isFirstUserMessage: i === firstUserIndex,
        isToolPairMember: toolPairId !== undefined,
        toolPairId,
      });
    }

    // Determine which messages to keep
    const keptMessages: ChatMessage[] = [];
    let currentTokens = 0;

    // Always keep first user message
    if (firstUserIndex >= 0) {
      const firstEntry = entries[firstUserIndex];
      keptMessages.push(firstEntry.message);
      currentTokens += firstEntry.tokens;
    }

    // Work backwards from most recent, keeping messages until we hit target
    const recentEntries = [...entries].reverse();
    const indicesToKeep = new Set<number>();

    if (firstUserIndex >= 0) {
      indicesToKeep.add(firstUserIndex);
    }

    for (const entry of recentEntries) {
      if (indicesToKeep.has(entry.index)) continue;

      // Check if adding this message (and its tool pair) would exceed target
      let tokensNeeded = entry.tokens;
      const relatedIndices = [entry.index];

      if (this.config.preserveToolPairs && entry.toolPairId) {
        const pair = toolPairs.get(entry.toolPairId);
        if (pair) {
          for (const idx of pair) {
            if (!indicesToKeep.has(idx) && idx !== entry.index) {
              tokensNeeded += entries[idx].tokens;
              relatedIndices.push(idx);
            }
          }
        }
      }

      if (currentTokens + tokensNeeded <= targetMessageTokens) {
        for (const idx of relatedIndices) {
          indicesToKeep.add(idx);
        }
        currentTokens += tokensNeeded;
      }

      // Ensure we keep minimum messages
      if (indicesToKeep.size >= messages.length - this.config.minMessagesToKeep) {
        break;
      }
    }

    // Build final message list in original order
    const prunedMessages: ChatMessage[] = [];
    for (let i = 0; i < messages.length; i++) {
      if (indicesToKeep.has(i)) {
        prunedMessages.push(messages[i]);
      }
    }

    // Validate: ensure we have at least minMessagesToKeep
    if (prunedMessages.length < this.config.minMessagesToKeep) {
      // Keep the last N messages
      const startIdx = Math.max(0, messages.length - this.config.minMessagesToKeep);
      return {
        messages: messages.slice(startIdx),
        removedCount: startIdx,
        tokensFreed: this.calculateTotalTokens(messages.slice(0, startIdx)),
        reason: `Kept last ${this.config.minMessagesToKeep} messages (minimum)`,
      };
    }

    const newTokens = this.calculateTotalTokens(prunedMessages, systemPrompt, tools);
    
    return {
      messages: prunedMessages,
      removedCount: messages.length - prunedMessages.length,
      tokensFreed: originalTokens - newTokens,
      reason,
    };
  }

  /**
   * Emergency prune - aggressive pruning when context overflow occurs
   * Keeps only the most recent messages
   */
  emergencyPrune(
    messages: ChatMessage[],
    systemPrompt?: string,
    tools?: Array<{ name: string; description: string; jsonSchema: unknown }>,
    keepCount = 20
  ): PruningResult {
    const originalTokens = this.calculateTotalTokens(messages, systemPrompt, tools);
    
    // Find the first user message to potentially keep
    const firstUserIndex = messages.findIndex(m => m.role === 'user');
    
    // Keep first user message + last N messages
    const lastMessages = messages.slice(-keepCount);
    const firstUserMsg = firstUserIndex >= 0 && firstUserIndex < messages.length - keepCount
      ? [messages[firstUserIndex]]
      : [];
    
    const prunedMessages = [...firstUserMsg, ...lastMessages];
    
    // Deduplicate in case first user message is in last N
    const seen = new Set<string>();
    const dedupedMessages = prunedMessages.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    const newTokens = this.calculateTotalTokens(dedupedMessages, systemPrompt, tools);

    return {
      messages: dedupedMessages,
      removedCount: messages.length - dedupedMessages.length,
      tokensFreed: originalTokens - newTokens,
      reason: `Emergency prune: kept last ${keepCount} messages`,
    };
  }

  /**
   * Clear token cache (call when messages are modified externally)
   */
  clearCache(): void {
    this.tokenCache.clear();
  }

  /**
   * Get current configuration
   */
  getConfig(): ContextWindowConfig {
    return { ...this.config };
  }
}

/**
 * Create a context window manager for a specific provider
 */
export function createContextWindowManager(
  provider: LLMProviderName,
  config?: Partial<ContextWindowConfig>
): ContextWindowManager {
  return new ContextWindowManager(provider, config);
}
