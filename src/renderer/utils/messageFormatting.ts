/**
 * Message Formatting Utilities
 * 
 * Enhanced utilities for formatting agent and user messages with terminal-style aesthetics.
 * Maintains existing functionality while adding visual improvements.
 */

/**
 * Enhanced markdown detection with more comprehensive patterns
 */
export function looksLikeMarkdown(content: string): boolean {
  // Existing patterns from MessageLine.tsx
  if (content.includes('```')) return true;
  if (/(^|\n)#{1,6}\s+/.test(content)) return true;
  if (/(^|\n)\s*([-*+]\s+|\d+\.\s+)/.test(content)) return true;
  if (/(^|\n)>\s+/.test(content)) return true;
  if (/(^|\n)\|.+\|/.test(content)) return true;
  if (/\[.+?\]\(.+?\)/.test(content)) return true;
  if (/\[.+?\]\[.+?\]/.test(content)) return true;
  if (/\*\*[^*]+\*\*/.test(content)) return true;
  if (/__[^_]+__/.test(content)) return true;
  if (/(?<!\*)\*(?!\*)[^*\n]+(?<!\*)\*(?!\*)/.test(content)) return true;
  if (/`[^`]+`/.test(content)) return true;
  if (/~~[^~]+~~/.test(content)) return true;
  if (/(^|\n)(---|\*\*\*|___)\s*(\n|$)/.test(content)) return true;
  if (content.includes('$') && /\$[^$]+\$/.test(content)) return true;
  if (content.includes('\\(') || content.includes('\\[')) return true;
  if (/\[[ x]\]/i.test(content)) return true;
  if (/!\[.*?\]\(.+?\)/.test(content)) return true;
  
  // Enhanced patterns
  if (/^\s*[-=]{3,}\s*$/m.test(content)) return true; // Horizontal rules
  if (/^\s*\|.*\|\s*$/m.test(content)) return true; // Table rows
  if (/^\s*\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]/im.test(content)) return true; // Callouts
  if (/^\s*```[\w]*\s*$/m.test(content)) return true; // Code fence start
  if (/^\s*```\s*$/m.test(content)) return true; // Code fence end
  
  return false;
}

/**
 * Format message content with enhanced terminal-style prefixes
 */
export function formatMessageContent(content: string, role: 'user' | 'assistant' | 'tool'): string {
  if (!content) return content;
  
  // Don't modify if it's already markdown
  if (looksLikeMarkdown(content)) return content;
  
  // Add subtle formatting for plain text based on role
  switch (role) {
    case 'user':
      // Keep user messages clean and unmodified
      return content;
      
    case 'assistant':
      // Keep assistant responses unmodified.
      // Inserting '---' (horizontal rules) corrupts output when content
      // is later rendered as markdown by MarkdownRenderer, which already
      // handles paragraph spacing visually.
      return content;
      
    case 'tool':
      // Format tool output with monospace indicators
      if (content.includes('\n') && !content.startsWith('```')) {
        return `\`\`\`\n${content}\n\`\`\``;
      }
      return content;
      
    default:
      return content;
  }
}

/**
 * Extract and format code snippets from message content
 */
export function extractCodeSnippets(content: string): Array<{ language: string; code: string; startIndex: number; endIndex: number }> {
  const codeBlocks: Array<{ language: string; code: string; startIndex: number; endIndex: number }> = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    codeBlocks.push({
      language: match[1] || 'text',
      code: match[2].trim(),
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }
  
  return codeBlocks;
}

/**
 * Format token usage display with enhanced styling
 */
export function formatTokenUsageEnhanced(usage?: {
  input: number;
  output: number;
  total?: number;
  cacheHit?: number;
  cacheMiss?: number;
  reasoningTokens?: number;
}): { text: string; tooltip: string; badges: Array<{ text: string; color: string; tooltip: string }> } | undefined {
  if (!usage) return undefined;
  
  const total = usage.total ?? (usage.input + usage.output);
  if (!Number.isFinite(total)) return undefined;
  
  // Format the total tokens for display
  let text: string;
  if (total < 1000) {
    text = `${total} tok`;
  } else {
    const k = Math.round((total / 1000) * 10) / 10;
    text = `${k}k tok`;
  }
  
  // Build tooltip with detailed breakdown
  const tooltipLines: string[] = [
    `Total: ${total.toLocaleString()} tokens`,
    `  Input: ${usage.input.toLocaleString()}`,
    `  Output: ${usage.output.toLocaleString()}`,
  ];
  
  const badges: Array<{ text: string; color: string; tooltip: string }> = [];
  
  // Add cache hit info for DeepSeek if available
  if (usage.cacheHit && usage.cacheHit > 0) {
    const hitRatio = Math.round((usage.cacheHit / usage.input) * 100);
    badges.push({
      text: `${hitRatio}% cached`,
      color: 'text-[var(--color-success)]',
      tooltip: `Cache hit: ${usage.cacheHit.toLocaleString()} tokens`,
    });
    tooltipLines.push(`Cache hit: ${usage.cacheHit.toLocaleString()} (${hitRatio}%)`);
    if (usage.cacheMiss) {
      tooltipLines.push(`Cache miss: ${usage.cacheMiss.toLocaleString()}`);
    }
  }
  
  // Add reasoning tokens info for thinking models
  if (usage.reasoningTokens && usage.reasoningTokens > 0) {
    const reasoningK = Math.round((usage.reasoningTokens / 1000) * 10) / 10;
    const reasoningText = reasoningK >= 1 ? `${reasoningK}k reasoning` : `${usage.reasoningTokens} reasoning`;
    badges.push({
      text: reasoningText,
      color: 'text-[var(--color-info)]',
      tooltip: `Reasoning tokens: ${usage.reasoningTokens.toLocaleString()}`,
    });
    tooltipLines.push(`Reasoning: ${usage.reasoningTokens.toLocaleString()}`);
  }
  
  return { text, tooltip: tooltipLines.join('\n'), badges };
}

/**
 * Enhanced model name formatting for display
 */
export function formatModelDisplayName(modelId?: string, provider?: string): { name: string; shortName: string; color: string } {
  if (!modelId) return { name: 'Unknown', shortName: '?', color: 'text-[var(--color-text-muted)]' };
  
  // Provider-specific formatting
  const providerColors = {
    anthropic: 'text-[#fb923c]',
    openai: 'text-[#34d399]',
    deepseek: 'text-[#60a5fa]',
    gemini: 'text-[#a78bfa]',
    openrouter: 'text-[var(--color-text-secondary)]',
  };
  
  const color = provider ? providerColors[provider as keyof typeof providerColors] || 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-secondary)]';
  
  // Model-specific mappings
  const modelMappings: Record<string, { name: string; shortName: string }> = {
    'claude-3-5-sonnet-20241022': { name: 'Claude 3.5 Sonnet', shortName: 'Claude 3.5' },
    'claude-3-5-haiku-20241022': { name: 'Claude 3.5 Haiku', shortName: 'Claude 3.5H' },
    'claude-3-opus-20240229': { name: 'Claude 3 Opus', shortName: 'Claude 3O' },
    'gpt-4o': { name: 'GPT-4o', shortName: 'GPT-4o' },
    'gpt-4o-mini': { name: 'GPT-4o Mini', shortName: 'GPT-4o-mini' },
    'gpt-4-turbo': { name: 'GPT-4 Turbo', shortName: 'GPT-4T' },
    'deepseek-chat': { name: 'DeepSeek Chat', shortName: 'DeepSeek' },
    'deepseek-reasoner': { name: 'DeepSeek Reasoner', shortName: 'DeepSeek-R' },
    'gemini-2.0-flash-exp': { name: 'Gemini 2.0 Flash', shortName: 'Gemini 2.0' },
    'gemini-1.5-pro': { name: 'Gemini 1.5 Pro', shortName: 'Gemini 1.5P' },
    'gemini-1.5-flash': { name: 'Gemini 1.5 Flash', shortName: 'Gemini 1.5F' },
  };
  
  const mapping = modelMappings[modelId];
  if (mapping) {
    return { ...mapping, color };
  }
  
  // Fallback: clean up model ID for display
  const cleanName = modelId
    .replace(/^(claude-|gpt-|deepseek-|gemini-)/i, '')
    .replace(/-\d{8}$/, '') // Remove date suffixes
    .replace(/-/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
  
  return {
    name: cleanName,
    shortName: cleanName.length > 12 ? cleanName.substring(0, 12) + '...' : cleanName,
    color,
  };
}