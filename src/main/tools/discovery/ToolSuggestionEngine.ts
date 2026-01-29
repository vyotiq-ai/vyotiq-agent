/**
 * Tool Suggestion Engine
 *
 * Provides proactive tool suggestions based on context,
 * task analysis, and usage patterns.
 */
import type {
  ToolSuggestion,
  ToolSearchContext,
} from '../../../shared/types';
import { createLogger } from '../../logger';
import { getToolUsageTracker } from './ToolUsageTracker';
import { getCapabilityMatcher } from './CapabilityMatcher';
import type { ToolRegistry } from '../registry/ToolRegistry';

const logger = createLogger('ToolSuggestionEngine');

/**
 * Suggestion trigger types
 */
export type SuggestionTrigger = 
  | 'task_start'
  | 'search_empty'
  | 'tool_failure'
  | 'context_change'
  | 'proactive';

/**
 * Tool Suggestion Engine class
 */
export class ToolSuggestionEngine {
  private taskPatterns = new Map<string, string[]>(); // task type -> tool names
  private fileTypePatterns = new Map<string, string[]>(); // file extension -> tool names

  constructor(private toolRegistry: ToolRegistry) {
    this.initializePatterns();
  }

  /**
   * Initialize common patterns
   */
  private initializePatterns(): void {
    // Task patterns - using actual tool names from registry
    this.taskPatterns.set('read', ['read']);
    this.taskPatterns.set('write', ['edit', 'write']);
    this.taskPatterns.set('search', ['grep', 'glob', 'ls']);
    this.taskPatterns.set('execute', ['run']);
    this.taskPatterns.set('navigate', ['browser_navigate']);
    this.taskPatterns.set('test', ['run']);
    this.taskPatterns.set('refactor', ['edit', 'grep', 'glob']);
    this.taskPatterns.set('debug', ['read', 'grep', 'run', 'lsp_diagnostics']);
    this.taskPatterns.set('lint', ['read_lints', 'lsp_diagnostics']);
    this.taskPatterns.set('definition', ['lsp_definition', 'lsp_references']);
    this.taskPatterns.set('hover', ['lsp_hover']);

    // File type patterns - using actual tool names
    this.fileTypePatterns.set('.ts', ['edit', 'grep', 'run', 'lsp_diagnostics']);
    this.fileTypePatterns.set('.tsx', ['edit', 'grep', 'run', 'lsp_diagnostics']);
    this.fileTypePatterns.set('.js', ['edit', 'grep', 'run']);
    this.fileTypePatterns.set('.json', ['read', 'edit']);
    this.fileTypePatterns.set('.md', ['read', 'edit']);
    this.fileTypePatterns.set('.css', ['edit', 'grep']);
    this.fileTypePatterns.set('.html', ['edit', 'browser_navigate']);
    this.fileTypePatterns.set('.py', ['edit', 'grep', 'run']);
  }

  /**
   * Get suggestions for a task description
   */
  suggestForTask(taskDescription: string): ToolSuggestion[] {
    const suggestions: ToolSuggestion[] = [];
    const taskLower = taskDescription.toLowerCase();

    // Match against task patterns
    for (const [pattern, toolNames] of this.taskPatterns) {
      if (taskLower.includes(pattern)) {
        for (const toolName of toolNames) {
          if (this.toolRegistry.has(toolName)) {
            suggestions.push({
              toolName,
              reason: 'task_match',
              confidence: 0.8,
              explanation: `Useful for ${pattern} operations`,
            });
          }
        }
      }
    }

    // Extract file extensions from task
    const extMatches = taskDescription.match(/\.\w+/g);
    if (extMatches) {
      for (const ext of extMatches) {
        const toolNames = this.fileTypePatterns.get(ext.toLowerCase());
        if (toolNames) {
          for (const toolName of toolNames) {
            if (this.toolRegistry.has(toolName) && !suggestions.some(s => s.toolName === toolName)) {
              suggestions.push({
                toolName,
                reason: 'context_match',
                confidence: 0.7,
                explanation: `Works well with ${ext} files`,
              });
            }
          }
        }
      }
    }

    // Sort by confidence
    suggestions.sort((a, b) => b.confidence - a.confidence);

    return suggestions.slice(0, 5);
  }

  /**
   * Get suggestions based on search context
   */
  suggestForContext(context: ToolSearchContext): ToolSuggestion[] {
    const suggestions: ToolSuggestion[] = [];
    const tracker = getToolUsageTracker();

    // Based on task description
    if (context.taskDescription) {
      const taskSuggestions = this.suggestForTask(context.taskDescription);
      suggestions.push(...taskSuggestions);
    }

    // Based on recent tool calls
    if (context.recentToolCalls && context.recentToolCalls.length > 0) {
      const matcher = getCapabilityMatcher();
      const lastTool = context.recentToolCalls[context.recentToolCalls.length - 1];
      
      // Suggest tools that can chain with the last tool
      const chainMatches = matcher.findChain(lastTool, 'any');
      for (const match of chainMatches.slice(0, 3)) {
        if (!suggestions.some(s => s.toolName === match.toolName)) {
          suggestions.push({
            toolName: match.toolName,
            reason: 'pattern_match',
            confidence: match.score * 0.7,
            explanation: `Often used after ${lastTool}`,
          });
        }
      }
    }

    // Based on file types
    if (context.fileTypes && context.fileTypes.length > 0) {
      for (const fileType of context.fileTypes) {
        const ext = fileType.startsWith('.') ? fileType : `.${fileType}`;
        const toolNames = this.fileTypePatterns.get(ext);
        if (toolNames) {
          for (const toolName of toolNames) {
            if (this.toolRegistry.has(toolName) && !suggestions.some(s => s.toolName === toolName)) {
              suggestions.push({
                toolName,
                reason: 'context_match',
                confidence: 0.6,
                explanation: `Good for ${ext} files`,
              });
            }
          }
        }
      }
    }

    // Add frequently used tools
    const topTools = tracker.getTopTools(3);
    for (const stats of topTools) {
      if (!suggestions.some(s => s.toolName === stats.toolName)) {
        suggestions.push({
          toolName: stats.toolName,
          reason: 'pattern_match',
          confidence: 0.5,
          explanation: 'Frequently used in this session',
        });
      }
    }

    // Sort and limit
    suggestions.sort((a, b) => b.confidence - a.confidence);
    return suggestions.slice(0, context.maxResults ?? 5);
  }

  /**
   * Suggest alternatives when a tool fails
   */
  suggestAlternatives(failedToolName: string): ToolSuggestion[] {
    const matcher = getCapabilityMatcher();
    const alternatives = matcher.findAlternatives(failedToolName);

    return alternatives.slice(0, 3).map(match => ({
      toolName: match.toolName,
      reason: 'alternative',
      confidence: match.score,
      explanation: `Alternative to ${failedToolName}: ${match.reason}`,
    }));
  }

  /**
   * Detect gaps - suggest creating new tools
   */
  detectGap(query: string, searchResults: unknown[]): ToolSuggestion | null {
    // If no results for a query, suggest dynamic tool creation
    if (searchResults.length === 0 && query.length > 10) {
      return {
        toolName: 'create_dynamic_tool',
        reason: 'gap_fill',
        confidence: 0.5,
        explanation: `No existing tools match "${query}". Consider creating a dynamic tool.`,
        suggestedArgs: {
          name: query.replace(/\s+/g, '_').toLowerCase().slice(0, 30),
          description: query,
        },
      };
    }
    return null;
  }

  /**
   * Get proactive suggestions for a session
   */
  getProactiveSuggestions(sessionId: string): ToolSuggestion[] {
    const tracker = getToolUsageTracker();
    const sessionUsage = tracker.getSessionUsage(sessionId);

    // Suggest underutilized tools that are commonly useful
    const suggestions: ToolSuggestion[] = [];
    const commonTools = ['grep', 'glob', 'ls', 'read'];
    const usedTools = new Set(sessionUsage.map(s => s.toolName));

    for (const toolName of commonTools) {
      if (!usedTools.has(toolName) && this.toolRegistry.has(toolName)) {
        const tool = this.toolRegistry.getDefinition(toolName);
        if (tool) {
          suggestions.push({
            toolName,
            reason: 'pattern_match',
            confidence: 0.4,
            explanation: `${tool.description.slice(0, 50)}...`,
          });
        }
      }
    }

    return suggestions.slice(0, 3);
  }

  /**
   * Record that a suggestion was accepted (for learning)
   */
  recordSuggestionAccepted(toolName: string, trigger: SuggestionTrigger): void {
    logger.debug('Suggestion accepted', { toolName, trigger });
    // Could enhance patterns based on accepted suggestions
  }

  /**
   * Record that a suggestion was rejected (for learning)
   */
  recordSuggestionRejected(toolName: string, trigger: SuggestionTrigger): void {
    logger.debug('Suggestion rejected', { toolName, trigger });
    // Could reduce confidence for similar suggestions
  }
}

// Factory function to create engine with registry
let engineInstance: ToolSuggestionEngine | null = null;
let registryRef: ToolRegistry | null = null;

/**
 * Get or create the tool suggestion engine
 */
export function getToolSuggestionEngine(toolRegistry: ToolRegistry): ToolSuggestionEngine {
  if (!engineInstance || registryRef !== toolRegistry) {
    engineInstance = new ToolSuggestionEngine(toolRegistry);
    registryRef = toolRegistry;
  }
  return engineInstance;
}
