/**
 * Dynamic Prompt Builder
 *
 * Builds context-aware prompts dynamically based on agent state,
 * task requirements, and available context.
 */

import type {
  ChatMessage,
} from '../../../shared/types';

// Type alias for API compatibility
type ConversationMessage = ChatMessage;

// Import from new consolidated systemPrompt module
import {
  CORE_IDENTITY,
  CRITICAL_RULES,
  TOOL_CHAINING,
} from '../systemPrompt';

// =============================================================================
// Types
// =============================================================================

/**
 * Prompt building options
 */
export interface PromptBuildOptions {
  /** Agent type - only 'main' is supported now */
  agentType: 'main';
  
  /** Task description */
  task?: string;
  
  /** Parent context (legacy - no longer used) */
  parentContext?: string;
  
  /** Additional instructions */
  instructions?: string;
  
  /** Available tools */
  tools?: string[];
  
  /** Maximum token budget for prompt */
  maxTokens?: number;
  
  /** Include full formatting rules */
  includeFormatting?: boolean;
  
  /** Include tool hints */
  includeToolHints?: boolean;
  
  /** Include workflows */
  includeWorkflows?: boolean;
  
  /** Custom prompt sections to include */
  customSections?: string[];
}

/**
 * Built prompt result
 */
export interface BuiltPrompt {
  systemPrompt: string;
  estimatedTokens: number;
  sections: string[];
}

// =============================================================================
// Token Estimation
// =============================================================================

/**
 * Rough token estimation (4 chars per token average)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// =============================================================================
// DynamicPromptBuilder
// =============================================================================

/**
 * DynamicPromptBuilder creates customized prompts based on context.
 *
 * Features:
 * - Context-aware prompt assembly
 * - Token budget management
 * - Specialization-specific additions
 * - Role-based prompt customization
 */
export class DynamicPromptBuilder {
  private basePromptCache: Map<string, string> = new Map();

  /**
   * Build a complete system prompt
   */
  build(options: PromptBuildOptions): BuiltPrompt {
    const sections: string[] = [];
    let currentTokens = 0;
    const maxTokens = options.maxTokens ?? 8000;

    // Add core identity (always included)
    sections.push(CORE_IDENTITY);
    currentTokens += estimateTokens(CORE_IDENTITY);

    // Add critical rules (always included)
    sections.push(CRITICAL_RULES);
    currentTokens += estimateTokens(CRITICAL_RULES);

    // Add tool chaining if requested and space permits
    if (options.includeWorkflows !== false && currentTokens + estimateTokens(TOOL_CHAINING) < maxTokens * 0.9) {
      sections.push(TOOL_CHAINING);
      currentTokens += estimateTokens(TOOL_CHAINING);
    }

    // Add custom sections
    if (options.customSections) {
      for (const section of options.customSections) {
        if (currentTokens + estimateTokens(section) < maxTokens) {
          sections.push(section);
          currentTokens += estimateTokens(section);
        }
      }
    }

    // Add tool list if provided
    if (options.tools && options.tools.length > 0) {
      const toolSection = this.buildToolSection(options.tools);
      if (currentTokens + estimateTokens(toolSection) < maxTokens) {
        sections.push(toolSection);
        currentTokens += estimateTokens(toolSection);
      }
    }

    const systemPrompt = sections.join('\n\n');

    return {
      systemPrompt,
      estimatedTokens: currentTokens,
      sections: sections.map((_, i) => `section_${i}`),
    };
  }

  /**
   * Build minimal prompt for token-constrained situations
   */
  buildMinimal(_options: PromptBuildOptions): BuiltPrompt {
    // Minimal main agent prompt
    const prompt = `${CORE_IDENTITY}\n\n${CRITICAL_RULES}`;
    return {
      systemPrompt: prompt,
      estimatedTokens: estimateTokens(prompt),
      sections: ['identity', 'rules'],
    };
  }

  /**
   * Build tool availability section
   */
  private buildToolSection(tools: string[]): string {
    return `
## Available Tools

You have access to the following tools:
${tools.map(t => `- ${t}`).join('\n')}

Use these tools to complete your task. If a needed tool is not available, work within your constraints or ask for clarification.
`;
  }

  /**
   * Enhance a prompt with conversation context
   */
  enhanceWithContext(
    basePrompt: string,
    context: {
      recentMessages?: ConversationMessage[];
      fileContext?: { path: string; summary: string }[];
      workspaceInfo?: string;
      maxContextTokens?: number;
    }
  ): string {
    const sections: string[] = [basePrompt];
    let currentTokens = estimateTokens(basePrompt);
    const maxTokens = context.maxContextTokens ?? 4000;

    // Add workspace info
    if (context.workspaceInfo && currentTokens + estimateTokens(context.workspaceInfo) < maxTokens) {
      sections.push(`
## Workspace Context

${context.workspaceInfo}
`);
      currentTokens += estimateTokens(context.workspaceInfo);
    }

    // Add file context
    if (context.fileContext && context.fileContext.length > 0) {
      const fileSection = this.buildFileContextSection(context.fileContext, maxTokens - currentTokens);
      if (fileSection) {
        sections.push(fileSection);
        currentTokens += estimateTokens(fileSection);
      }
    }

    return sections.join('\n\n');
  }

  /**
   * Build file context section within token budget
   */
  private buildFileContextSection(
    files: { path: string; summary: string }[],
    maxTokens: number
  ): string | null {
    let section = `
## Relevant Files

`;
    let currentTokens = estimateTokens(section);

    for (const file of files) {
      const fileEntry = `### ${file.path}
${file.summary}

`;
      if (currentTokens + estimateTokens(fileEntry) > maxTokens) {
        break;
      }
      section += fileEntry;
      currentTokens += estimateTokens(fileEntry);
    }

    return section;
  }

  /**
   * Get cached base prompt or build it
   */
  getOrBuildBase(options: PromptBuildOptions): string {
    const cacheKey = `${options.agentType}_base`;
    
    if (this.basePromptCache.has(cacheKey)) {
      return this.basePromptCache.get(cacheKey)!;
    }

    const result = this.build({
      ...options,
      task: undefined,
      parentContext: undefined,
      instructions: undefined,
    });

    this.basePromptCache.set(cacheKey, result.systemPrompt);
    return result.systemPrompt;
  }

  /**
   * Clear prompt cache
   */
  clearCache(): void {
    this.basePromptCache.clear();
  }
}

// =============================================================================
// Default Instance
// =============================================================================

let defaultBuilder: DynamicPromptBuilder | null = null;

/**
 * Get default prompt builder instance
 */
export function getPromptBuilder(): DynamicPromptBuilder {
  if (!defaultBuilder) {
    defaultBuilder = new DynamicPromptBuilder();
  }
  return defaultBuilder;
}
