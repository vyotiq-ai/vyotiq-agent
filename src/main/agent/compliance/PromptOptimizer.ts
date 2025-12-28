/**
 * Prompt Optimizer
 * 
 * Optimizes system prompts for different LLM models to address:
 * 1. "Lost in the middle" attention patterns
 * 2. Model-specific formatting preferences
 * 3. Token budget constraints
 * 4. Mid-conversation rule reinforcement
 */
import {
  type ModelPromptConfig,
  MODEL_PROMPT_CONFIGS,
} from './types';

/**
 * Prompt section with priority and content
 */
interface PromptSection {
  id: string;
  priority: number; // Lower = higher priority
  content: string;
  isCondensable: boolean;
  estimatedTokens: number;
}

/**
 * Result of prompt optimization
 */
export interface OptimizedPromptResult {
  /** The optimized system prompt */
  systemPrompt: string;
  /** Estimated token count */
  estimatedTokens: number;
  /** Sections that were condensed */
  condensedSections: string[];
  /** Sections that were removed */
  removedSections: string[];
  /** Whether the prompt was modified */
  wasOptimized: boolean;
}

export class PromptOptimizer {
  private modelConfigs: Record<string, ModelPromptConfig>;

  constructor(customConfigs?: Partial<Record<string, ModelPromptConfig>>) {
    this.modelConfigs = { ...MODEL_PROMPT_CONFIGS, ...customConfigs };
  }

  /**
   * Get model configuration
   */
  getModelConfig(provider: string): ModelPromptConfig {
    return this.modelConfigs[provider] || this.modelConfigs['openai']; // Default to OpenAI config
  }

  /**
   * Optimize a system prompt for a specific model
   */
  optimizePrompt(
    systemPrompt: string,
    provider: string,
    options?: {
      maxTokens?: number;
      forceCondense?: boolean;
    }
  ): OptimizedPromptResult {
    const config = this.getModelConfig(provider);
    const maxTokens = options?.maxTokens || config.maxSystemPromptTokens;
    const estimatedTokens = this.estimateTokens(systemPrompt);

    // If within budget and no force condense, we still may need to apply
    // provider formatting preferences (e.g., convert XML tags to markdown).
    if (estimatedTokens <= maxTokens && !options?.forceCondense) {
      let formattedPrompt = systemPrompt;

      if (!config.prefersXmlStructure) {
        formattedPrompt = this.convertXmlToMarkdown(formattedPrompt);
      }

      const formattedTokens = this.estimateTokens(formattedPrompt);
      const changed = formattedPrompt !== systemPrompt;

      return {
        systemPrompt: formattedPrompt,
        estimatedTokens: formattedTokens,
        condensedSections: [],
        removedSections: [],
        wasOptimized: changed,
      };
    }

    // Parse sections from the prompt (XML-structured)
    const sections = this.parseSections(systemPrompt);

    // Apply model-specific optimizations
    // Important: do condensing/removal while still in XML form so our section
    // matchers work, then convert to markdown if needed.
    let optimizedPrompt = systemPrompt;
    const condensedSections: string[] = [];
    const removedSections: string[] = [];

    // Condense sections if needed
    if (config.useCondensedRules || estimatedTokens > maxTokens) {
      for (const sectionId of config.condensableSections) {
        const section = sections.find(s => s.id === sectionId);
        if (section && section.isCondensable) {
          optimizedPrompt = this.condenseSection(optimizedPrompt, sectionId);
          condensedSections.push(sectionId);
        }
      }
    }

    // Re-estimate tokens after condensing
    let newEstimate = this.estimateTokens(optimizedPrompt);

    // If still over budget, remove low-priority sections
    if (newEstimate > maxTokens) {
      const sortedSections = [...sections].sort((a, b) => b.priority - a.priority);
      for (const section of sortedSections) {
        if (!config.prioritySections.includes(section.id)) {
          optimizedPrompt = this.removeSection(optimizedPrompt, section.id);
          removedSections.push(section.id);
          newEstimate = this.estimateTokens(optimizedPrompt);
          if (newEstimate <= maxTokens) break;
        }
      }
    }

    // Apply primacy/recency optimization - move critical rules to start and end
    // Convert XML to markdown if model prefers it
    if (!config.prefersXmlStructure) {
      optimizedPrompt = this.convertXmlToMarkdown(optimizedPrompt);
    }

    optimizedPrompt = this.applyAttentionOptimization(optimizedPrompt, config, maxTokens);

    // Final safety: ensure we didn't exceed token budget after attention tweaks
    // (e.g., adding a closing reminder). If still over budget, try removing
    // non-priority sections again (best-effort).
    newEstimate = this.estimateTokens(optimizedPrompt);
    if (newEstimate > maxTokens) {
      const sortedSections = [...sections].sort((a, b) => b.priority - a.priority);
      for (const section of sortedSections) {
        if (!config.prioritySections.includes(section.id)) {
          optimizedPrompt = this.removeSection(optimizedPrompt, section.id);
          if (!removedSections.includes(section.id)) {
            removedSections.push(section.id);
          }
          newEstimate = this.estimateTokens(optimizedPrompt);
          if (newEstimate <= maxTokens) break;
        }
      }
    }

    // Absolute fallback: if we *still* exceed the budget (e.g., extra content
    // outside recognized sections), truncate to the estimated character budget.
    // This is best-effort and prevents runaway system prompts.
    newEstimate = this.estimateTokens(optimizedPrompt);
    if (newEstimate > maxTokens) {
      const maxChars = Math.max(0, maxTokens * 4);
      optimizedPrompt = optimizedPrompt.slice(0, maxChars).trimEnd();
    }

    return {
      systemPrompt: optimizedPrompt,
      estimatedTokens: this.estimateTokens(optimizedPrompt),
      condensedSections,
      removedSections,
      wasOptimized: true,
    };
  }

  /**
   * Generate a mid-conversation reminder based on violations or message count
   */
  generateMidConversationReminder(
    provider: string,
    messageCount: number,
    recentViolations?: string[]
  ): string | null {
    const config = this.getModelConfig(provider);

    if (!config.addMidConversationReminders) {
      return null;
    }

    // Check if we should add a reminder based on frequency
    if (messageCount % config.reminderFrequency !== 0 && !recentViolations?.length) {
      return null;
    }

    let reminder = `\n<system_reminder iteration="${messageCount}">\n`;

    // Add violation-specific reminders
    if (recentViolations && recentViolations.length > 0) {
      reminder += `⚠️ RECENT COMPLIANCE ISSUES DETECTED:\n`;
      for (const violation of recentViolations.slice(0, 3)) {
        reminder += `- ${violation}\n`;
      }
      reminder += '\n';
    }

    // Add periodic rule reminders
    reminder += `CRITICAL REMINDERS:
1. READ files BEFORE editing them and ensure understanding
2. Run read_lints AFTER creating and editing files
3. Do ONLY what was asked - no extra files or changes
4. Use EXACT whitespace in edit old_string
5. Never guess - if unsure, ask for clarification
6. Prefer editing existing files over creating new ones
7. Verify success of destructive commands after running them
</system_reminder>\n`;

    return reminder;
  }

  /**
   * Create a condensed version of critical rules for injection
   */
  createCondensedRules(): string {
    return `<rules_summary>
MUST DO:
• Read before edit
• Lint after creating and editing files
• Exact whitespace in old_string
• Minimal changes only

MUST NOT:
• Create unrequested files
• Create docs without request
• Edit without reading
• Guess whitespace
</rules_summary>`;
  }

  /**
   * Create tool-specific reminders based on the tool being called
   */
  createToolReminder(toolName: string): string | null {
    const reminders: Record<string, string> = {
      edit: `EDIT REMINDER: old_string must match EXACTLY including whitespace. Copy from read output.`,
      write: `WRITE REMINDER: Only create files when necessary. Prefer editing existing files.`,
      run: `RUN REMINDER: Be cautious with destructive commands. Verify success after execution.`,
    };

    return reminders[toolName] || null;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Estimate token count (rough approximation: ~4 chars per token)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Parse sections from XML-structured prompt
   */
  private parseSections(prompt: string): PromptSection[] {
    const sections: PromptSection[] = [];
    const sectionPattern = /<(\w+)[^>]*>([\s\S]*?)<\/\1>/g;
    let match;
    let priority = 0;

    while ((match = sectionPattern.exec(prompt)) !== null) {
      const [, tagName, content] = match;
      sections.push({
        id: tagName,
        priority: priority++,
        content: content.trim(),
        isCondensable: !['identity', 'critical_rules', 'context'].includes(tagName),
        estimatedTokens: this.estimateTokens(content),
      });
    }

    return sections;
  }

  /**
   * Convert XML-style tags to markdown headers
   */
  private convertXmlToMarkdown(prompt: string): string {
    let result = prompt;

    // Convert opening tags to headers
    result = result.replace(
      /<(identity|critical_rules|context|tools|tool_workflows|guidelines|principles|communication_style)>/gi,
      (_, tag) => `\n## ${this.tagToTitle(tag)}\n`,
    );

    // Remove closing tags
    result = result.replace(
      /<\/(identity|critical_rules|context|tools|tool_workflows|guidelines|principles|communication_style)>/gi,
      '\n',
    );

    // Convert nested tags to subheaders
    result = result.replace(/<(rule|guideline|principle)[^>]*>/gi, '- ');
    result = result.replace(/<\/(rule|guideline|principle)>/gi, '');

    // Clean up extra whitespace
    result = result.replace(/\n{3,}/g, '\n\n');

    return result;
  }

  /**
   * Convert tag name to readable title
   */
  private tagToTitle(tag: string): string {
    const titles: Record<string, string> = {
      identity: 'Identity',
      critical_rules: 'CRITICAL RULES',
      context: 'Context',
      tools: 'Tools',
      tool_workflows: 'Tool Workflows',
      guidelines: 'Guidelines',
      principles: 'Principles',
      communication_style: 'Communication Style',
    };
    return titles[tag.toLowerCase()] || tag;
  }

  /**
   * Condense a section by removing verbose content
   */
  private condenseSection(prompt: string, sectionId: string): string {
    const sectionPattern = new RegExp(`<${sectionId}[^>]*>([\\s\\S]*?)<\\/${sectionId}>`, 'gi');
    
    return prompt.replace(sectionPattern, (_match, content) => {
      // Keep first paragraph and bullet points, remove detailed explanations
      const lines = content.split('\n');
      const condensed: string[] = [];
      let inList = false;

      for (const line of lines) {
        const trimmed = line.trim();
        
        // Keep headers and list items
        if (trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.startsWith('*')) {
          inList = true;
          // Truncate long list items
          condensed.push(trimmed.length > 100 ? trimmed.slice(0, 100) + '...' : trimmed);
        } else if (trimmed.startsWith('#') || trimmed.startsWith('<')) {
          condensed.push(trimmed);
          inList = false;
        } else if (!inList && condensed.length < 5) {
          // Keep first few lines
          condensed.push(trimmed);
        }
      }

      return `<${sectionId}>\n${condensed.join('\n')}\n</${sectionId}>`;
    });
  }

  /**
   * Remove a section entirely
   */
  private removeSection(prompt: string, sectionId: string): string {
    const sectionPattern = new RegExp(`<${sectionId}[^>]*>[\\s\\S]*?<\\/${sectionId}>\\n?`, 'gi');
    return prompt.replace(sectionPattern, '');
  }

  /**
   * Apply attention optimization - ensure critical content is at start and end
   */
  private applyAttentionOptimization(prompt: string, config: ModelPromptConfig, maxTokens: number): string {
    // The prompt is already structured with critical rules at the start
    // and closing reminder at the end. This method ensures that structure.
    
    // Only add reminders if the model configuration suggests it
    if (!config.addMidConversationReminders) {
      return prompt;
    }
    
    // Check if closing reminder exists
    if (!prompt.includes('<final_reminder>') && !prompt.includes('BEFORE RESPONDING')) {
      // Add a condensed closing reminder (prefer markdown when not using XML)
      const reminderBlock = config.prefersXmlStructure
        ? `\n\n<final_reminder>\nBEFORE ACTING: Read files before editing. Lint after editing. Do only what was asked.\n</final_reminder>`
        : `\n\n## Final Reminder\nBEFORE ACTING: Read files before editing. Lint after editing. Do only what was asked.\n`;

      // Only append if it doesn't push us over the budget.
      const withReminder = prompt + reminderBlock;
      if (this.estimateTokens(withReminder) <= maxTokens) {
        prompt = withReminder;
      }
    }

    return prompt;
  }
}
