/**
 * Output Truncator
 * 
 * Intelligently truncates large tool outputs while preserving useful information.
 * Uses different strategies based on tool type to maximize information retention.
 * 
 * Requirement 10: Intelligent Tool Output Truncation
 */

import { countTokens, type TokenizerModel } from '../../../shared/utils/tokenCounter';

// =============================================================================
// Types
// =============================================================================

export interface TruncatedOutput {
  /** Truncated content */
  content: string;
  /** Whether truncation occurred */
  wasTruncated: boolean;
  /** Original line count */
  originalLines: number;
  /** Lines removed */
  linesRemoved: number;
  /** Original token count (estimated) */
  originalTokens: number;
  /** Final token count (estimated) */
  finalTokens: number;
  /** Truncation summary */
  summary: string;
}

export interface TruncationConfig {
  /** Maximum tokens allowed (default: 8000) */
  maxTokens: number;
  /** Tokenizer model for counting */
  tokenizerModel: TokenizerModel;
}

export type TruncationStrategy = 
  | 'head-tail'      // Preserve head and tail (file reads)
  | 'relevance'      // Preserve most relevant matches (search results)
  | 'count-summary'  // Show count and key entries (directory listings)
  | 'tail'           // Preserve tail only (terminal output)
  | 'simple';        // Simple truncation with indicator

interface StrategyConfig {
  strategy: TruncationStrategy;
  headLines?: number;
  tailLines?: number;
  maxMatches?: number;
  contextLines?: number;
  maxEntries?: number;
  maxLines?: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MAX_TOKENS = 8000;
const DEFAULT_TOKENIZER_MODEL: TokenizerModel = 'default';

/** Tool-specific truncation strategies */
const TRUNCATION_STRATEGIES: Record<string, StrategyConfig> = {
  // File reading tools - preserve head and tail
  'read': { strategy: 'head-tail', headLines: 100, tailLines: 50 },
  'read_file': { strategy: 'head-tail', headLines: 100, tailLines: 50 },
  
  // Search tools - preserve most relevant matches
  'grep': { strategy: 'relevance', maxMatches: 50, contextLines: 2 },
  'search': { strategy: 'relevance', maxMatches: 50, contextLines: 2 },
  
  // Directory listing tools - show count and key entries
  'ls': { strategy: 'count-summary', maxEntries: 100 },
  'list_dir': { strategy: 'count-summary', maxEntries: 100 },
  'glob': { strategy: 'count-summary', maxEntries: 100 },
  
  // Terminal output - preserve tail (most recent output)
  'run': { strategy: 'tail', maxLines: 200 },
  'run_terminal_command': { strategy: 'tail', maxLines: 200 },
  'check_terminal': { strategy: 'tail', maxLines: 200 },
};

// =============================================================================
// Output Truncator Class
// =============================================================================

export class OutputTruncator {
  private config: TruncationConfig;

  constructor(config?: Partial<TruncationConfig>) {
    this.config = {
      maxTokens: config?.maxTokens ?? DEFAULT_MAX_TOKENS,
      tokenizerModel: config?.tokenizerModel ?? DEFAULT_TOKENIZER_MODEL,
    };
  }

  /**
   * Get the current configuration
   */
  getConfig(): TruncationConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<TruncationConfig>): void {
    if (config.maxTokens !== undefined) {
      this.config.maxTokens = config.maxTokens;
    }
    if (config.tokenizerModel !== undefined) {
      this.config.tokenizerModel = config.tokenizerModel;
    }
  }

  /**
   * Truncate output based on tool type
   */
  truncate(output: string, toolName: string, maxTokens?: number): TruncatedOutput {
    const effectiveMaxTokens = maxTokens ?? this.config.maxTokens;
    const originalTokens = countTokens(output, this.config.tokenizerModel);
    const originalLines = output.split('\n').length;

    // If output is within limits, return as-is
    if (originalTokens <= effectiveMaxTokens) {
      return {
        content: output,
        wasTruncated: false,
        originalLines,
        linesRemoved: 0,
        originalTokens,
        finalTokens: originalTokens,
        summary: '',
      };
    }

    // Get strategy for this tool
    const strategyConfig = TRUNCATION_STRATEGIES[toolName] ?? { strategy: 'simple' as TruncationStrategy };
    
    // Apply appropriate truncation strategy
    let result: TruncatedOutput;
    
    switch (strategyConfig.strategy) {
      case 'head-tail':
        result = this.truncateHeadTail(
          output,
          effectiveMaxTokens,
          strategyConfig.headLines ?? 100,
          strategyConfig.tailLines ?? 50
        );
        break;
      case 'relevance':
        result = this.truncateByRelevance(
          output,
          effectiveMaxTokens,
          strategyConfig.maxMatches ?? 50,
          strategyConfig.contextLines ?? 2
        );
        break;
      case 'count-summary':
        result = this.truncateWithCountSummary(
          output,
          effectiveMaxTokens,
          strategyConfig.maxEntries ?? 100
        );
        break;
      case 'tail':
        result = this.truncateTail(
          output,
          effectiveMaxTokens,
          strategyConfig.maxLines ?? 200
        );
        break;
      default:
        result = this.truncateSimple(output, effectiveMaxTokens);
    }

    return result;
  }

  /**
   * Get a specific section of output by line range
   */
  getSection(output: string, startLine: number, endLine: number): string {
    const lines = output.split('\n');
    const start = Math.max(0, startLine - 1); // Convert to 0-indexed
    const end = Math.min(lines.length, endLine);
    
    return lines.slice(start, end).join('\n');
  }

  /**
   * Head-tail truncation strategy
   * Preserves the beginning and end of the output
   */
  private truncateHeadTail(
    output: string,
    maxTokens: number,
    headLines: number,
    tailLines: number
  ): TruncatedOutput {
    const lines = output.split('\n');
    const originalLines = lines.length;
    
    // If we have fewer lines than head + tail, use simple truncation
    if (lines.length <= headLines + tailLines) {
      return this.truncateSimple(output, maxTokens);
    }

    // Start with head and tail
    const headSection = lines.slice(0, headLines);
    const tailSection = lines.slice(-tailLines);
    const middleLinesRemoved = lines.length - headLines - tailLines;
    
    const indicator = `\n\n[... ${middleLinesRemoved} lines truncated ...]\n\n`;
    let truncated = headSection.join('\n') + indicator + tailSection.join('\n');
    let finalTokens = countTokens(truncated, this.config.tokenizerModel);

    // If still too large, reduce head and tail proportionally
    let currentHeadLines = headLines;
    let currentTailLines = tailLines;
    
    while (finalTokens > maxTokens && (currentHeadLines > 10 || currentTailLines > 5)) {
      // Reduce by 20%
      currentHeadLines = Math.max(10, Math.floor(currentHeadLines * 0.8));
      currentTailLines = Math.max(5, Math.floor(currentTailLines * 0.8));
      
      const newHead = lines.slice(0, currentHeadLines);
      const newTail = lines.slice(-currentTailLines);
      const newMiddleRemoved = lines.length - currentHeadLines - currentTailLines;
      
      const newIndicator = `\n\n[... ${newMiddleRemoved} lines truncated ...]\n\n`;
      truncated = newHead.join('\n') + newIndicator + newTail.join('\n');
      finalTokens = countTokens(truncated, this.config.tokenizerModel);
    }

    const linesRemoved = originalLines - truncated.split('\n').length + 1; // +1 for indicator line

    return {
      content: truncated,
      wasTruncated: true,
      originalLines,
      linesRemoved,
      originalTokens: countTokens(output, this.config.tokenizerModel),
      finalTokens,
      summary: `Output truncated: preserved first ${currentHeadLines} and last ${currentTailLines} lines of ${originalLines} total lines`,
    };
  }

  /**
   * Relevance-based truncation strategy
   * Preserves the most relevant matches (for search results)
   */
  private truncateByRelevance(
    output: string,
    maxTokens: number,
    maxMatches: number,
    contextLines: number
  ): TruncatedOutput {
    const lines = output.split('\n');
    const originalLines = lines.length;
    const originalTokens = countTokens(output, this.config.tokenizerModel);

    // Parse search results - look for match patterns
    // Common patterns: "file:line:content" or "file:content" or just lines with matches
    const matchPattern = /^([^:]+):(\d+)?:?(.*)$/;
    const matches: Array<{ file: string; line?: number; content: string; index: number }> = [];
    
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(matchPattern);
      if (match) {
        matches.push({
          file: match[1],
          line: match[2] ? parseInt(match[2], 10) : undefined,
          content: match[3] || lines[i],
          index: i,
        });
      } else if (lines[i].trim()) {
        // Non-empty line that doesn't match pattern - treat as content
        matches.push({
          file: '',
          content: lines[i],
          index: i,
        });
      }
    }

    // If we have more matches than allowed, keep the first maxMatches
    const keptMatches = matches.slice(0, maxMatches);
    const removedCount = matches.length - keptMatches.length;

    // Build output with kept matches and context
    const keptIndices = new Set<number>();
    for (const match of keptMatches) {
      // Add the match line
      keptIndices.add(match.index);
      // Add context lines
      for (let c = 1; c <= contextLines; c++) {
        if (match.index - c >= 0) keptIndices.add(match.index - c);
        if (match.index + c < lines.length) keptIndices.add(match.index + c);
      }
    }

    // Build truncated output
    const sortedIndices = Array.from(keptIndices).sort((a, b) => a - b);
    const resultLines: string[] = [];
    let lastIndex = -1;

    for (const idx of sortedIndices) {
      if (lastIndex !== -1 && idx > lastIndex + 1) {
        // Gap in indices - add indicator
        const gapSize = idx - lastIndex - 1;
        resultLines.push(`[... ${gapSize} lines omitted ...]`);
      }
      resultLines.push(lines[idx]);
      lastIndex = idx;
    }

    // Add summary at the end if matches were removed
    if (removedCount > 0) {
      resultLines.push('');
      resultLines.push(`[... ${removedCount} more matches not shown ...]`);
    }

    const truncated = resultLines.join('\n');
    const finalTokens = countTokens(truncated, this.config.tokenizerModel);

    // If still too large, reduce maxMatches
    if (finalTokens > maxTokens) {
      return this.truncateByRelevance(
        output,
        maxTokens,
        Math.max(10, Math.floor(maxMatches * 0.7)),
        contextLines
      );
    }

    return {
      content: truncated,
      wasTruncated: true,
      originalLines,
      linesRemoved: originalLines - resultLines.length,
      originalTokens,
      finalTokens,
      summary: `Search results truncated: showing ${keptMatches.length} of ${matches.length} matches`,
    };
  }

  /**
   * Count-summary truncation strategy
   * Shows count and key entries (for directory listings)
   */
  private truncateWithCountSummary(
    output: string,
    maxTokens: number,
    maxEntries: number
  ): TruncatedOutput {
    const lines = output.split('\n').filter(l => l.trim());
    const originalLines = lines.length;
    const originalTokens = countTokens(output, this.config.tokenizerModel);

    if (lines.length <= maxEntries) {
      // Check if it fits in tokens
      if (originalTokens <= maxTokens) {
        return {
          content: output,
          wasTruncated: false,
          originalLines,
          linesRemoved: 0,
          originalTokens,
          finalTokens: originalTokens,
          summary: '',
        };
      }
    }

    // Categorize entries (directories vs files, by extension, etc.)
    const directories: string[] = [];
    const files: string[] = [];
    
    for (const line of lines) {
      // Simple heuristic: directories often end with / or have 'd' permission
      if (line.endsWith('/') || line.startsWith('d') || line.includes('<DIR>')) {
        directories.push(line);
      } else {
        files.push(line);
      }
    }

    // Build summary
    const resultLines: string[] = [];
    
    // Add header with counts
    resultLines.push(`Total entries: ${lines.length} (${directories.length} directories, ${files.length} files)`);
    resultLines.push('');

    // Add directories (up to half of maxEntries)
    const maxDirs = Math.min(directories.length, Math.floor(maxEntries / 2));
    if (directories.length > 0) {
      resultLines.push('Directories:');
      resultLines.push(...directories.slice(0, maxDirs));
      if (directories.length > maxDirs) {
        resultLines.push(`[... ${directories.length - maxDirs} more directories ...]`);
      }
      resultLines.push('');
    }

    // Add files (remaining entries)
    const maxFiles = Math.min(files.length, maxEntries - maxDirs);
    if (files.length > 0) {
      resultLines.push('Files:');
      resultLines.push(...files.slice(0, maxFiles));
      if (files.length > maxFiles) {
        resultLines.push(`[... ${files.length - maxFiles} more files ...]`);
      }
    }

    const truncated = resultLines.join('\n');
    const finalTokens = countTokens(truncated, this.config.tokenizerModel);

    // If still too large, reduce entries
    if (finalTokens > maxTokens && maxEntries > 20) {
      return this.truncateWithCountSummary(
        output,
        maxTokens,
        Math.floor(maxEntries * 0.7)
      );
    }

    return {
      content: truncated,
      wasTruncated: true,
      originalLines,
      linesRemoved: originalLines - resultLines.length,
      originalTokens,
      finalTokens,
      summary: `Directory listing truncated: showing ${maxDirs + maxFiles} of ${lines.length} entries`,
    };
  }

  /**
   * Tail truncation strategy
   * Preserves the end of the output (for terminal output)
   */
  private truncateTail(
    output: string,
    maxTokens: number,
    maxLines: number
  ): TruncatedOutput {
    const lines = output.split('\n');
    const originalLines = lines.length;
    const originalTokens = countTokens(output, this.config.tokenizerModel);

    // Start with maxLines from the end
    let currentMaxLines = Math.min(maxLines, lines.length);
    let tailLines = lines.slice(-currentMaxLines);
    let linesRemoved = lines.length - currentMaxLines;
    
    const indicator = linesRemoved > 0 
      ? `[... earlier output truncated (${linesRemoved} lines) ...]\n\n`
      : '';
    
    let truncated = indicator + tailLines.join('\n');
    let finalTokens = countTokens(truncated, this.config.tokenizerModel);

    // Reduce lines if still too large
    while (finalTokens > maxTokens && currentMaxLines > 20) {
      currentMaxLines = Math.floor(currentMaxLines * 0.8);
      tailLines = lines.slice(-currentMaxLines);
      linesRemoved = lines.length - currentMaxLines;
      
      const newIndicator = `[... earlier output truncated (${linesRemoved} lines) ...]\n\n`;
      truncated = newIndicator + tailLines.join('\n');
      finalTokens = countTokens(truncated, this.config.tokenizerModel);
    }

    return {
      content: truncated,
      wasTruncated: linesRemoved > 0,
      originalLines,
      linesRemoved,
      originalTokens,
      finalTokens,
      summary: linesRemoved > 0 
        ? `Terminal output truncated: showing last ${currentMaxLines} of ${originalLines} lines`
        : '',
    };
  }

  /**
   * Simple truncation strategy
   * Basic truncation with indicator
   */
  private truncateSimple(output: string, maxTokens: number): TruncatedOutput {
    const lines = output.split('\n');
    const originalLines = lines.length;
    const originalTokens = countTokens(output, this.config.tokenizerModel);

    // Binary search for the right number of lines
    let low = 1;
    let high = lines.length;
    let bestFit = 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const testContent = lines.slice(0, mid).join('\n') + '\n\n[... output truncated ...]';
      const testTokens = countTokens(testContent, this.config.tokenizerModel);

      if (testTokens <= maxTokens) {
        bestFit = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const truncatedLines = lines.slice(0, bestFit);
    const linesRemoved = originalLines - bestFit;
    const indicator = linesRemoved > 0 ? `\n\n[... ${linesRemoved} lines truncated ...]` : '';
    const truncated = truncatedLines.join('\n') + indicator;
    const finalTokens = countTokens(truncated, this.config.tokenizerModel);

    return {
      content: truncated,
      wasTruncated: linesRemoved > 0,
      originalLines,
      linesRemoved,
      originalTokens,
      finalTokens,
      summary: linesRemoved > 0 
        ? `Output truncated: showing ${bestFit} of ${originalLines} lines`
        : '',
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let truncatorInstance: OutputTruncator | null = null;

/**
 * Get the singleton OutputTruncator instance
 */
export function getOutputTruncator(): OutputTruncator {
  if (!truncatorInstance) {
    truncatorInstance = new OutputTruncator();
  }
  return truncatorInstance;
}

/**
 * Create a new OutputTruncator with custom config
 */
export function createOutputTruncator(config?: Partial<TruncationConfig>): OutputTruncator {
  return new OutputTruncator(config);
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Truncate tool output using the singleton instance
 */
export function truncateToolOutput(
  output: string,
  toolName: string,
  maxTokens?: number
): TruncatedOutput {
  return getOutputTruncator().truncate(output, toolName, maxTokens);
}

/**
 * Check if output needs truncation
 */
export function needsTruncation(output: string, maxTokens: number = DEFAULT_MAX_TOKENS): boolean {
  return countTokens(output, DEFAULT_TOKENIZER_MODEL) > maxTokens;
}

export default {
  OutputTruncator,
  getOutputTruncator,
  createOutputTruncator,
  truncateToolOutput,
  needsTruncation,
};
