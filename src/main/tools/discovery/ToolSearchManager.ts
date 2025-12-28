/**
 * Tool Search Manager
 * 
 * Implements dynamic tool discovery with deferred loading to optimize
 * context token usage. Based on Anthropic's engineering patterns, this
 * can reduce tool-related context tokens by up to 85%.
 * 
 * Key features:
 * - Tools can be deferred (not loaded initially, discovered on-demand)
 * - Search by keywords, name, or description
 * - Session-scoped tool loading (discovered tools stay loaded for session)
 * - Token savings tracking
 */

import type { ToolDefinition, ToolCategory } from '../types';

// =============================================================================
// Types
// =============================================================================

export interface ToolSearchConfig {
  /** Tools to always load regardless of deferLoading flag */
  alwaysLoadedTools: string[];
  /** Search strategy for matching */
  searchStrategy: 'regex' | 'bm25';
  /** Maximum tools to return per search */
  maxResultsPerSearch: number;
  /** Enable fuzzy matching */
  fuzzyMatching: boolean;
}

export interface ToolReference {
  /** Tool name */
  name: string;
  /** Brief description */
  description: string;
  /** Relevance score (0-1) */
  score: number;
  /** Category for grouping */
  category?: ToolCategory;
  /** Keywords that matched */
  matchedKeywords: string[];
}

export interface ToolSearchResult {
  /** Query that was searched */
  query: string;
  /** Matching tool references */
  results: ToolReference[];
  /** Total deferred tools available */
  totalDeferred: number;
  /** Token savings from deferral */
  tokenSavings: TokenSavings;
}

export interface TokenSavings {
  /** Tokens saved by deferring tools */
  deferredTokens: number;
  /** Tokens currently loaded */
  loadedTokens: number;
  /** Percentage saved */
  percentSaved: number;
}

export interface SessionToolState {
  /** Tools discovered and loaded for this session */
  loadedTools: Set<string>;
  /** Search history */
  searches: Array<{ query: string; timestamp: number }>;
  /** Created at */
  createdAt: number;
}

export const DEFAULT_SEARCH_CONFIG: ToolSearchConfig = {
  alwaysLoadedTools: ['read', 'edit', 'write', 'ls', 'run', 'glob'],
  searchStrategy: 'bm25',
  maxResultsPerSearch: 5,
  fuzzyMatching: true,
};

// Estimated tokens per tool schema (average)
const ESTIMATED_TOKENS_PER_TOOL = 150;

// =============================================================================
// Tool Search Manager
// =============================================================================

export class ToolSearchManager {
  private config: ToolSearchConfig;
  private allTools = new Map<string, ToolDefinition>();
  private deferredTools = new Map<string, ToolDefinition>();
  private alwaysLoadedTools = new Map<string, ToolDefinition>();
  private sessionStates = new Map<string, SessionToolState>();
  
  constructor(config: Partial<ToolSearchConfig> = {}) {
    this.config = { ...DEFAULT_SEARCH_CONFIG, ...config };
  }
  
  // ===========================================================================
  // Tool Registration
  // ===========================================================================
  
  /**
   * Register a tool with the search manager
   */
  registerTool(tool: ToolDefinition): void {
    this.allTools.set(tool.name, tool);
    
    // Determine if tool should be deferred
    const isAlwaysLoaded = this.config.alwaysLoadedTools.includes(tool.name);
    const shouldDefer = tool.deferLoading && !isAlwaysLoaded;
    
    if (shouldDefer) {
      this.deferredTools.set(tool.name, tool);
    } else {
      this.alwaysLoadedTools.set(tool.name, tool);
    }
  }
  
  /**
   * Register multiple tools
   */
  registerTools(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }
  
  /**
   * Clear all registered tools
   */
  clear(): void {
    this.allTools.clear();
    this.deferredTools.clear();
    this.alwaysLoadedTools.clear();
  }
  
  // ===========================================================================
  // Session Management
  // ===========================================================================
  
  /**
   * Initialize session state
   */
  initSession(sessionId: string): void {
    if (!this.sessionStates.has(sessionId)) {
      this.sessionStates.set(sessionId, {
        loadedTools: new Set(),
        searches: [],
        createdAt: Date.now(),
      });
    }
  }
  
  /**
   * Get session state
   */
  getSessionState(sessionId: string): SessionToolState | undefined {
    return this.sessionStates.get(sessionId);
  }
  
  /**
   * Clear session state
   */
  clearSession(sessionId: string): void {
    this.sessionStates.delete(sessionId);
  }
  
  /**
   * Clear all sessions
   */
  clearAllSessions(): void {
    this.sessionStates.clear();
  }
  
  // ===========================================================================
  // Tool Discovery
  // ===========================================================================
  
  /**
   * Search for tools matching a query
   */
  search(query: string, sessionId?: string): ToolSearchResult {
    const normalizedQuery = query.toLowerCase().trim();
    const results: ToolReference[] = [];
    
    // Search through deferred tools
    for (const [name, tool] of this.deferredTools) {
      const score = this.calculateRelevance(normalizedQuery, tool);
      
      if (score > 0) {
        const matchedKeywords = this.getMatchedKeywords(normalizedQuery, tool);
        results.push({
          name,
          description: this.truncateDescription(tool.description),
          score,
          category: tool.category,
          matchedKeywords,
        });
      }
    }
    
    // Sort by relevance score
    results.sort((a, b) => b.score - a.score);
    
    // Limit results
    const limitedResults = results.slice(0, this.config.maxResultsPerSearch);
    
    // Record search if session provided
    if (sessionId) {
      const state = this.sessionStates.get(sessionId);
      if (state) {
        state.searches.push({ query, timestamp: Date.now() });
      }
    }
    
    return {
      query,
      results: limitedResults,
      totalDeferred: this.deferredTools.size,
      tokenSavings: this.getTokenSavings(sessionId),
    };
  }
  
  /**
   * Calculate relevance score for a tool against a query
   */
  private calculateRelevance(query: string, tool: ToolDefinition): number {
    let score = 0;
    const queryWords = query.split(/\s+/);
    
    // Exact name match (highest priority)
    if (tool.name.toLowerCase() === query) {
      score += 1.0;
    } else if (tool.name.toLowerCase().includes(query)) {
      score += 0.7;
    }
    
    // Description match
    const descLower = tool.description.toLowerCase();
    for (const word of queryWords) {
      if (word.length < 2) continue;
      if (descLower.includes(word)) {
        score += 0.3;
      }
    }
    
    // Keyword match
    if (tool.searchKeywords) {
      for (const keyword of tool.searchKeywords) {
        const keywordLower = keyword.toLowerCase();
        for (const word of queryWords) {
          if (keywordLower === word) {
            score += 0.5;
          } else if (keywordLower.includes(word) || word.includes(keywordLower)) {
            score += 0.3;
          }
        }
      }
    }
    
    // Category match
    if (tool.category) {
      for (const word of queryWords) {
        if (tool.category.toLowerCase().includes(word)) {
          score += 0.2;
        }
      }
    }
    
    // Fuzzy matching (if enabled)
    if (this.config.fuzzyMatching) {
      score += this.fuzzyScore(query, tool.name) * 0.3;
      score += this.fuzzyScore(query, tool.description) * 0.1;
    }
    
    // Normalize to 0-1 range
    return Math.min(score / 2, 1);
  }
  
  /**
   * Simple Levenshtein-based fuzzy scoring
   */
  private fuzzyScore(query: string, text: string): number {
    const textLower = text.toLowerCase();
    const queryLower = query.toLowerCase();
    
    // Check for substring
    if (textLower.includes(queryLower)) {
      return 0.8;
    }
    
    // Check word boundaries
    const words = textLower.split(/\W+/);
    for (const word of words) {
      if (word.startsWith(queryLower) || queryLower.startsWith(word)) {
        return 0.5;
      }
    }
    
    return 0;
  }
  
  /**
   * Get keywords that matched the query
   */
  private getMatchedKeywords(query: string, tool: ToolDefinition): string[] {
    const matched: string[] = [];
    const queryWords = query.split(/\s+/);
    
    if (tool.searchKeywords) {
      for (const keyword of tool.searchKeywords) {
        for (const word of queryWords) {
          if (keyword.toLowerCase().includes(word) || word.includes(keyword.toLowerCase())) {
            matched.push(keyword);
            break;
          }
        }
      }
    }
    
    return matched;
  }
  
  /**
   * Truncate description for display
   */
  private truncateDescription(desc: string, maxLength = 100): string {
    if (desc.length <= maxLength) return desc;
    return desc.substring(0, maxLength - 3) + '...';
  }
  
  // ===========================================================================
  // Tool Expansion
  // ===========================================================================
  
  /**
   * Expand tool references into full definitions and load them for the session
   */
  expand(refs: ToolReference[], sessionId?: string): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    
    for (const ref of refs) {
      const tool = this.deferredTools.get(ref.name);
      if (tool) {
        tools.push(tool);
        
        // Mark as loaded for session
        if (sessionId) {
          const state = this.sessionStates.get(sessionId);
          if (state) {
            state.loadedTools.add(ref.name);
          }
        }
      }
    }
    
    return tools;
  }
  
  /**
   * Search and immediately expand results
   */
  searchAndExpand(query: string, sessionId?: string): {
    tools: ToolDefinition[];
    result: ToolSearchResult;
  } {
    const result = this.search(query, sessionId);
    const tools = this.expand(result.results, sessionId);
    return { tools, result };
  }
  
  // ===========================================================================
  // Tool Getters
  // ===========================================================================
  
  /**
   * Get tools that are always loaded
   */
  getAlwaysLoadedTools(): ToolDefinition[] {
    return Array.from(this.alwaysLoadedTools.values());
  }
  
  /**
   * Get tools loaded for a specific session
   */
  getSessionLoadedTools(sessionId: string): ToolDefinition[] {
    const state = this.sessionStates.get(sessionId);
    if (!state) return [];
    
    const tools: ToolDefinition[] = [];
    for (const name of state.loadedTools) {
      const tool = this.deferredTools.get(name);
      if (tool) {
        tools.push(tool);
      }
    }
    return tools;
  }
  
  /**
   * Get all tools for a session (always loaded + session loaded)
   */
  getToolsForSession(sessionId: string): ToolDefinition[] {
    const alwaysLoaded = this.getAlwaysLoadedTools();
    const sessionLoaded = this.getSessionLoadedTools(sessionId);
    
    // Avoid duplicates
    const toolMap = new Map<string, ToolDefinition>();
    for (const tool of alwaysLoaded) {
      toolMap.set(tool.name, tool);
    }
    for (const tool of sessionLoaded) {
      toolMap.set(tool.name, tool);
    }
    
    return Array.from(toolMap.values());
  }
  
  /**
   * Get a specific tool by name
   */
  getTool(name: string): ToolDefinition | undefined {
    return this.allTools.get(name);
  }
  
  /**
   * Check if a tool is deferred
   */
  isDeferred(name: string): boolean {
    return this.deferredTools.has(name);
  }
  
  /**
   * Check if a tool is loaded for a session
   */
  isLoadedForSession(name: string, sessionId: string): boolean {
    // Always loaded tools are always "loaded"
    if (this.alwaysLoadedTools.has(name)) return true;
    
    const state = this.sessionStates.get(sessionId);
    return state?.loadedTools.has(name) ?? false;
  }
  
  // ===========================================================================
  // Token Savings
  // ===========================================================================
  
  /**
   * Get token savings statistics
   */
  getTokenSavings(sessionId?: string): TokenSavings {
    const alwaysLoadedCount = this.alwaysLoadedTools.size;
    const deferredCount = this.deferredTools.size;
    
    let sessionLoadedCount = 0;
    if (sessionId) {
      const state = this.sessionStates.get(sessionId);
      sessionLoadedCount = state?.loadedTools.size ?? 0;
    }
    
    const loadedTokens = (alwaysLoadedCount + sessionLoadedCount) * ESTIMATED_TOKENS_PER_TOOL;
    const deferredTokens = (deferredCount - sessionLoadedCount) * ESTIMATED_TOKENS_PER_TOOL;
    const totalTokens = (alwaysLoadedCount + deferredCount) * ESTIMATED_TOKENS_PER_TOOL;
    
    const percentSaved = totalTokens > 0 
      ? Math.round((deferredTokens / totalTokens) * 100) 
      : 0;
    
    return {
      deferredTokens,
      loadedTokens,
      percentSaved,
    };
  }
  
  /**
   * Get statistics about tool registration
   */
  getStats(): {
    total: number;
    alwaysLoaded: number;
    deferred: number;
    sessions: number;
  } {
    return {
      total: this.allTools.size,
      alwaysLoaded: this.alwaysLoadedTools.size,
      deferred: this.deferredTools.size,
      sessions: this.sessionStates.size,
    };
  }
}

// =============================================================================
// Tool Search Tool Definition
// =============================================================================

/**
 * Creates the tool_search tool that allows the LLM to discover deferred tools
 */
export function createToolSearchTool(manager: ToolSearchManager): ToolDefinition {
  return {
    name: 'tool_search',
    description: `Search for additional tools that may help with your task. Use this when you need specialized functionality that isn't immediately available. The search will return tool names and descriptions that match your query.`,
    requiresApproval: false,
    category: 'system',
    riskLevel: 'safe',
    schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query describing the functionality you need (e.g., "find symbol definitions", "search file contents", "code diagnostics")',
        },
      },
      required: ['query'],
    },
    inputExamples: [
      { query: 'find symbol definitions' },
      { query: 'search file contents regex' },
      { query: 'code diagnostics errors' },
      { query: 'file diff comparison' },
      { query: 'watch files for changes' },
    ],
    execute: async (args, context) => {
      const { query } = args as { query: string };
      
      // Get session ID from context if available
      const sessionId = (context as { sessionId?: string }).sessionId;
      
      // Search and immediately expand/load discovered tools for the session
      // This ensures the tools are available for the next LLM request
      const { tools, result } = manager.searchAndExpand(query, sessionId);
      
      if (result.results.length === 0) {
        return {
          toolName: 'tool_search',
          success: true,
          output: 'No matching tools found. Try different search terms.',
        };
      }
      
      // Format results for LLM
      const lines = [
        `Found ${result.results.length} tools matching "${query}":`,
        '',
      ];
      
      for (const ref of result.results) {
        lines.push(`• **${ref.name}** (${Math.round(ref.score * 100)}% match)`);
        lines.push(`  ${ref.description}`);
        if (ref.matchedKeywords.length > 0) {
          lines.push(`  Keywords: ${ref.matchedKeywords.join(', ')}`);
        }
        lines.push('');
      }
      
      lines.push(`These tools are now available. You can call them directly in your next response.`);
      lines.push(`Token savings: ${result.tokenSavings.percentSaved}% (${result.tokenSavings.deferredTokens} tokens deferred)`);
      
      return {
        toolName: 'tool_search',
        success: true,
        output: lines.join('\n'),
        metadata: {
          query,
          matchCount: result.results.length,
          loadedTools: tools.map(t => t.name),
          tokenSavings: result.tokenSavings,
        },
      };
    },
  };
}
