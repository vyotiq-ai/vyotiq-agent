/**
 * Conversation Summarizer
 * 
 * Provides intelligent summarization of older messages to preserve
 * context while significantly reducing token usage.
 * 
 * Strategies:
 * 1. Rolling summary - Maintain a running summary of older conversation
 * 2. Key points extraction - Extract important decisions and context
 * 3. Tool result compression - Compress verbose tool outputs
 */

import { randomUUID } from 'node:crypto';
import type { ChatMessage, LLMProviderName as _LLMProviderName } from '../../../shared/types';
import { SimpleTokenCounter } from '../routing/tokenUtils';

// =============================================================================
// Types
// =============================================================================

export interface SummaryConfig {
  /** Minimum messages before considering summarization */
  minMessagesForSummary: number;
  /** Target token count for the summary */
  summaryTargetTokens: number;
  /** Messages to always keep unsummarized (most recent) */
  keepRecentMessages: number;
  /** Whether to include tool results in summary */
  includeToolResults: boolean;
  /** Max tokens per tool result before compression */
  maxToolResultTokens: number;
}

export interface SummaryResult {
  /** Summary message to insert */
  summaryMessage: ChatMessage;
  /** Messages to keep after summary */
  keptMessages: ChatMessage[];
  /** Number of messages summarized */
  summarizedCount: number;
  /** Tokens saved by summarization */
  tokensSaved: number;
}

export interface CompressedToolResult {
  /** Original tool name */
  toolName: string;
  /** Compressed content */
  content: string;
  /** Whether it was compressed */
  wasCompressed: boolean;
  /** Original token count */
  originalTokens: number;
  /** Compressed token count */
  compressedTokens: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_SUMMARY_CONFIG: SummaryConfig = {
  minMessagesForSummary: 50,
  summaryTargetTokens: 2000,
  keepRecentMessages: 20,
  includeToolResults: true,
  maxToolResultTokens: 500,
};

// =============================================================================
// Conversation Summarizer
// =============================================================================

export class ConversationSummarizer {
  private config: SummaryConfig;

  constructor(config?: Partial<SummaryConfig>) {
    this.config = { ...DEFAULT_SUMMARY_CONFIG, ...config };
  }

  /**
   * Check if conversation should be summarized
   */
  shouldSummarize(messages: ChatMessage[]): boolean {
    return messages.length >= this.config.minMessagesForSummary;
  }

  /**
   * Generate a local summary of conversation history (no LLM call)
   * This creates a structured summary based on message content
   */
  generateLocalSummary(messages: ChatMessage[]): SummaryResult {
    if (!this.shouldSummarize(messages)) {
      return {
        summaryMessage: this.createEmptySummaryMessage(),
        keptMessages: messages,
        summarizedCount: 0,
        tokensSaved: 0,
      };
    }

    // Split messages into those to summarize and those to keep
    const cutoffIndex = messages.length - this.config.keepRecentMessages;
    const toSummarize = messages.slice(0, cutoffIndex);
    const toKeep = messages.slice(cutoffIndex);

    // Calculate original tokens
    const originalTokens = toSummarize.reduce(
      (sum, m) => sum + SimpleTokenCounter.countTokens(m.content || ''),
      0
    );

    // Extract key information from messages to summarize
    const summary = this.extractSummaryFromMessages(toSummarize);
    
    const summaryMessage = this.createSummaryMessage(summary, toSummarize.length);
    const summaryTokens = SimpleTokenCounter.countTokens(summaryMessage.content || '');

    return {
      summaryMessage,
      keptMessages: [summaryMessage, ...toKeep],
      summarizedCount: toSummarize.length,
      tokensSaved: Math.max(0, originalTokens - summaryTokens),
    };
  }

  /**
   * Extract key points from a set of messages
   */
  private extractSummaryFromMessages(messages: ChatMessage[]): string {
    const sections: string[] = [];
    
    // 1. Extract user requests/goals
    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length > 0) {
      const goals = userMessages
        .map(m => this.extractKeyPoint(m.content || ''))
        .filter(Boolean)
        .slice(0, 5); // Keep top 5 goals
      
      if (goals.length > 0) {
        sections.push(`**User Goals:**\n${goals.map(g => `- ${g}`).join('\n')}`);
      }
    }

    // 2. Extract tool executions and their outcomes
    const toolMessages = messages.filter(m => m.role === 'tool');
    if (toolMessages.length > 0 && this.config.includeToolResults) {
      const toolSummaries = this.summarizeToolResults(toolMessages);
      if (toolSummaries.length > 0) {
        sections.push(`**Actions Taken:**\n${toolSummaries.join('\n')}`);
      }
    }

    // 3. Extract key decisions from assistant messages
    const assistantMessages = messages.filter(
      m => m.role === 'assistant' && m.content && !m.toolCalls?.length
    );
    if (assistantMessages.length > 0) {
      const decisions = assistantMessages
        .map(m => this.extractKeyPoint(m.content || ''))
        .filter(Boolean)
        .slice(0, 3);
      
      if (decisions.length > 0) {
        sections.push(`**Key Decisions:**\n${decisions.map(d => `- ${d}`).join('\n')}`);
      }
    }

    // 4. Extract any file paths mentioned
    const filePaths = this.extractFilePaths(messages);
    if (filePaths.length > 0) {
      sections.push(`**Files Referenced:**\n${filePaths.slice(0, 10).map(f => `- ${f}`).join('\n')}`);
    }

    return sections.join('\n\n');
  }

  /**
   * Extract a key point from message content (first meaningful sentence)
   */
  private extractKeyPoint(content: string): string {
    // Remove code blocks for cleaner extraction
    const withoutCode = content.replace(/```[\s\S]*?```/g, '[code block]');
    
    // Get first sentence that's meaningful
    const sentences = withoutCode.split(/[.!?]\s+/).filter(s => s.trim().length > 10);
    
    if (sentences.length === 0) return '';
    
    const firstSentence = sentences[0].trim();
    
    // Truncate if too long
    if (firstSentence.length > 150) {
      return firstSentence.substring(0, 147) + '...';
    }
    
    return firstSentence;
  }

  /**
   * Summarize tool execution results
   */
  private summarizeToolResults(toolMessages: ChatMessage[]): string[] {
    const summaries: string[] = [];
    const toolCounts = new Map<string, number>();
    const toolExamples = new Map<string, string>();

    for (const msg of toolMessages) {
      const toolName = msg.toolName || 'unknown_tool';
      toolCounts.set(toolName, (toolCounts.get(toolName) || 0) + 1);
      
      // Store first example of each tool
      if (!toolExamples.has(toolName) && msg.content) {
        toolExamples.set(toolName, this.compressToolResult(msg.content));
      }
    }

    for (const [toolName, count] of toolCounts) {
      const example = toolExamples.get(toolName);
      if (count === 1) {
        summaries.push(`- Used \`${toolName}\`: ${example || 'completed'}`);
      } else {
        summaries.push(`- Used \`${toolName}\` ${count} times`);
      }
    }

    return summaries;
  }

  /**
   * Compress a tool result to a shorter form
   */
  private compressToolResult(content: string): string {
    const tokens = SimpleTokenCounter.countTokens(content);
    
    if (tokens <= this.config.maxToolResultTokens) {
      return content.substring(0, 100) + (content.length > 100 ? '...' : '');
    }

    // For large results, extract key info
    if (content.includes('error') || content.includes('Error')) {
      const errorMatch = content.match(/error[:\s]+([^\n]+)/i);
      if (errorMatch) {
        return `Error: ${errorMatch[1].substring(0, 80)}...`;
      }
    }

    if (content.includes('success') || content.includes('Success')) {
      return 'Completed successfully';
    }

    // Default: first 80 chars
    return content.substring(0, 80) + '...';
  }

  /**
   * Extract file paths mentioned in messages
   */
  private extractFilePaths(messages: ChatMessage[]): string[] {
    const paths = new Set<string>();
    const pathRegex = /(?:\/[\w.-]+)+(?:\.\w+)?|(?:[A-Za-z]:\\[\w\\.-]+)+/g;

    for (const msg of messages) {
      const content = msg.content || '';
      const matches = content.match(pathRegex);
      if (matches) {
        for (const match of matches) {
          // Filter out common false positives
          if (
            match.length > 5 &&
            !match.includes('http') &&
            !match.startsWith('//')
          ) {
            paths.add(match);
          }
        }
      }
    }

    return Array.from(paths);
  }

  /**
   * Create a summary message
   */
  private createSummaryMessage(summary: string, messageCount: number): ChatMessage {
    const content = `[CONVERSATION SUMMARY - ${messageCount} messages summarized]\n\n${summary}\n\n[End of summary - Recent conversation follows]`;
    
    return {
      id: randomUUID(),
      role: 'user', // Use user role so it's properly included in context
      content,
      createdAt: Date.now(),
      isSummary: true,
    };
  }

  /**
   * Create an empty summary message placeholder
   */
  private createEmptySummaryMessage(): ChatMessage {
    return {
      id: randomUUID(),
      role: 'user',
      content: '',
      createdAt: Date.now(),
      isSummary: true,
    };
  }

  /**
   * Compress verbose tool results in place
   */
  compressToolResults(messages: ChatMessage[]): {
    messages: ChatMessage[];
    tokensFreed: number;
  } {
    let tokensFreed = 0;
    
    const compressedMessages = messages.map(msg => {
      if (msg.role !== 'tool' || !msg.content) return msg;
      
      const originalTokens = SimpleTokenCounter.countTokens(msg.content);
      if (originalTokens <= this.config.maxToolResultTokens) return msg;
      
      // Compress the tool result
      const compressed = this.smartCompressToolResult(msg.content, msg.toolName || 'tool');
      const newTokens = SimpleTokenCounter.countTokens(compressed);
      
      tokensFreed += originalTokens - newTokens;
      
      return {
        ...msg,
        content: compressed,
        originalContent: msg.content, // Preserve original in case needed
      };
    });

    return { messages: compressedMessages, tokensFreed };
  }

  /**
   * Smart compression of tool results based on content type
   * Preserves key structural information while reducing size
   */
  private smartCompressToolResult(content: string, toolName: string): string {
    const maxChars = this.config.maxToolResultTokens * 4; // Rough conversion
    const toolLower = toolName.toLowerCase();

    // File read results - keep beginning AND key structural elements
    if (toolLower.includes('read') || toolLower.includes('file')) {
      if (content.length > maxChars) {
        const lines = content.split('\n');
        
        // Keep first 20 lines (imports, class declarations)
        const headLines = lines.slice(0, 20);
        
        // Extract key structural elements (function/class/interface definitions)
        const structuralLines: string[] = [];
        for (let i = 20; i < lines.length && structuralLines.length < 15; i++) {
          const line = lines[i];
          if (
            /^\s*(export\s+)?(async\s+)?(function|class|interface|type|const|enum)\s+\w+/.test(line) ||
            /^\s*(public|private|protected)\s+(async\s+)?\w+\s*\(/.test(line) ||
            /^\s*\/\*\*/.test(line) // JSDoc comments
          ) {
            structuralLines.push(line);
          }
        }
        
        const summary = [
          ...headLines,
          '',
          `[... File structure summary (${lines.length} total lines) ...]`,
          ...structuralLines,
          '',
          `[... End of ${lines.length - 20} truncated lines ...]`
        ].join('\n');
        
        return summary;
      }
    }

    // Search/grep results - keep all match locations but truncate content
    if (toolLower.includes('search') || toolLower.includes('grep')) {
      if (content.length > maxChars) {
        const matches = content.split('\n').filter(l => l.trim());
        // Keep file:line references but truncate long content
        const summaryMatches = matches.slice(0, 25).map(m => {
          // If line is too long, truncate the content portion
          if (m.length > 150) {
            const colonIdx = m.indexOf(':');
            if (colonIdx > 0 && colonIdx < 80) {
              return m.substring(0, 150) + '...';
            }
          }
          return m;
        });
        return summaryMatches.join('\n') + 
          (matches.length > 25 ? `\n\n[... ${matches.length - 25} more matches in other files ...]` : '');
      }
    }

    // Terminal/run results - keep errors and key output
    if (toolLower.includes('run') || toolLower.includes('terminal') || toolLower.includes('exec')) {
      if (content.length > maxChars) {
        const lines = content.split('\n');
        
        // Always keep error lines
        const errorLines = lines.filter(l => 
          /error|fail|exception|warning/i.test(l)
        ).slice(0, 10);
        
        // Keep first and last portions
        const headLines = lines.slice(0, 10);
        const tailLines = lines.slice(-10);
        
        if (errorLines.length > 0) {
          return [
            ...headLines,
            '',
            '[... output truncated ...]',
            '',
            '=== Errors/Warnings ===',
            ...errorLines,
            '',
            '=== Last output ===',
            ...tailLines
          ].join('\n');
        }
        
        return [
          ...headLines,
          '',
          `[... ${lines.length - 20} lines truncated ...]`,
          '',
          ...tailLines
        ].join('\n');
      }
    }

    // Directory listings - keep structure
    if (toolLower.includes('list') || toolLower.includes('dir')) {
      const lines = content.split('\n').filter(l => l.trim());
      if (lines.length > 40) {
        return lines.slice(0, 40).join('\n') + `\n\n[... ${lines.length - 40} more entries ...]`;
      }
    }

    // Edit results - these are usually small, keep them
    if (toolLower.includes('edit') || toolLower.includes('write')) {
      // Edit confirmations are important context, only truncate if very large
      if (content.length > maxChars * 2) {
        return content.substring(0, maxChars) + '\n\n[... edit details truncated ...]';
      }
      return content; // Keep edit results intact
    }

    // Default truncation with context preservation
    if (content.length > maxChars) {
      const headSize = Math.floor(maxChars * 0.6);
      const tailSize = Math.floor(maxChars * 0.3);
      return content.substring(0, headSize) + 
        '\n\n[... content truncated ...]\n\n' + 
        content.substring(content.length - tailSize);
    }

    return content;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SummaryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): SummaryConfig {
    return { ...this.config };
  }

  /**
   * Aggressively clear old tool results while preserving important context.
   * This is the "safest lightest touch" form of compaction per Anthropic's guidance.
   * 
   * Strategy:
   * - Keep tool results from the last N messages intact
   * - For older tool results, replace content with a brief summary
   * - Preserve tool call/result pairing for API consistency
   * - Keep error messages and key outcomes
   */
  clearOldToolResults(
    messages: ChatMessage[],
    keepRecentCount = 10
  ): { messages: ChatMessage[]; tokensFreed: number; clearedCount: number } {
    let tokensFreed = 0;
    let clearedCount = 0;

    // Find the cutoff point - keep recent messages intact
    const cutoffIndex = Math.max(0, messages.length - keepRecentCount);

    const processedMessages = messages.map((msg, index) => {
      // Keep recent messages intact
      if (index >= cutoffIndex) return msg;

      // Only process tool messages
      if (msg.role !== 'tool' || !msg.content) return msg;

      const originalTokens = SimpleTokenCounter.countTokens(msg.content);
      
      // Skip if already small
      if (originalTokens <= 50) return msg;

      // Create a minimal summary of the tool result
      const summary = this.createToolResultSummary(msg.content, msg.toolName || 'tool', msg.toolSuccess);
      const newTokens = SimpleTokenCounter.countTokens(summary);

      tokensFreed += originalTokens - newTokens;
      clearedCount++;

      return {
        ...msg,
        content: summary,
        originalContent: msg.content, // Preserve for potential recovery
      };
    });

    return { messages: processedMessages, tokensFreed, clearedCount };
  }

  /**
   * Create a minimal summary of a tool result
   */
  private createToolResultSummary(content: string, toolName: string, success?: boolean): string {
    const toolLower = toolName.toLowerCase();
    const statusPrefix = success === false ? '❌ Failed: ' : success === true ? '✓ ' : '';

    // For read operations - just note what was read
    if (toolLower.includes('read')) {
      const lines = content.split('\n').length;
      const hasCode = content.includes('function') || content.includes('class') || content.includes('import');
      return `${statusPrefix}[Read ${lines} lines${hasCode ? ' of code' : ''}]`;
    }

    // For search/grep - note match count
    if (toolLower.includes('grep') || toolLower.includes('search')) {
      const matchCount = (content.match(/^\d+:/gm) || []).length || 
                        content.split('\n').filter(l => l.trim()).length;
      return `${statusPrefix}[Found ${matchCount} matches]`;
    }

    // For list/dir - note entry count
    if (toolLower.includes('list') || toolLower.includes('dir') || toolLower.includes('ls')) {
      const entries = content.split('\n').filter(l => l.trim()).length;
      return `${statusPrefix}[Listed ${entries} entries]`;
    }

    // For terminal/run - keep errors, summarize success
    if (toolLower.includes('run') || toolLower.includes('terminal')) {
      const hasError = /error|fail|exception/i.test(content);
      if (hasError) {
        // Extract first error line
        const errorLine = content.split('\n').find(l => /error|fail|exception/i.test(l));
        return `${statusPrefix}[Error: ${errorLine?.slice(0, 80) || 'execution failed'}...]`;
      }
      return `${statusPrefix}[Command completed]`;
    }

    // For write/edit - note the action
    if (toolLower.includes('write') || toolLower.includes('edit')) {
      return `${statusPrefix}[File modified]`;
    }

    // For glob - note file count
    if (toolLower.includes('glob')) {
      const fileCount = content.split('\n').filter(l => l.trim()).length;
      return `${statusPrefix}[Found ${fileCount} files]`;
    }

    // Default - just note completion
    const preview = content.slice(0, 50).replace(/\n/g, ' ');
    return `${statusPrefix}[${preview}${content.length > 50 ? '...' : ''}]`;
  }
}

/**
 * Create a conversation summarizer with optional config
 */
export function createConversationSummarizer(
  config?: Partial<SummaryConfig>
): ConversationSummarizer {
  return new ConversationSummarizer(config);
}
