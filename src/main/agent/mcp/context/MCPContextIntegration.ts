/**
 * MCP Context Integration
 * 
 * Provides deep integration between MCP resources/tools and the agent's
 * context system. Enables:
 * - Automatic context enrichment from MCP resources
 * - Tool relevance scoring based on context
 * - Dynamic resource prefetching
 * - Context-aware tool suggestions
 * 
 * @see https://modelcontextprotocol.io/specification/2025-06-18
 */

import type {
  MCPTool,
  MCPResource,
  MCPPrompt,
} from '../../../../shared/types/mcp';
import type { MCPContextInfo } from '../../systemPrompt/types';
import { getMCPManager } from '../MCPManager';
import { getMCPContextProvider } from '../MCPContextProvider';
import { createLogger } from '../../../logger';

const logger = createLogger('MCPContextIntegration');

// =============================================================================
// Types
// =============================================================================

/**
 * Context-aware tool suggestion
 */
export interface MCPToolSuggestion {
  /** Tool from MCP server */
  tool: MCPTool;
  /** Server providing the tool */
  serverId: string;
  serverName: string;
  /** Relevance score (0-1) */
  relevance: number;
  /** Reason for suggestion */
  reason: string;
  /** Keywords that matched */
  matchedKeywords?: string[];
}

/**
 * Context-aware resource suggestion
 */
export interface MCPResourceSuggestion {
  /** Resource from MCP server */
  resource: MCPResource;
  /** Server providing the resource */
  serverId: string;
  serverName: string;
  /** Relevance score (0-1) */
  relevance: number;
  /** Reason for suggestion */
  reason: string;
}

/**
 * Context query for tool/resource suggestions
 */
export interface ContextQuery {
  /** User's query or message */
  query?: string;
  /** Current file path */
  filePath?: string;
  /** File type/language */
  language?: string;
  /** Current task type */
  taskType?: string;
  /** Active tags/labels */
  tags?: string[];
  /** Maximum suggestions to return */
  maxSuggestions?: number;
}

/**
 * Enriched context from MCP resources
 */
export interface EnrichedContext {
  /** Source resource URI */
  sourceUri: string;
  /** Source server */
  serverName: string;
  /** Content type */
  contentType: string;
  /** Extracted content */
  content: string;
  /** Relevance to current context */
  relevance: number;
  /** Timestamp of fetch */
  fetchedAt: number;
}

// =============================================================================
// Tool Relevance Keywords
// =============================================================================

/**
 * Keywords for matching tools to context
 */
const TOOL_KEYWORDS: Record<string, string[]> = {
  // File operations
  filesystem: ['file', 'read', 'write', 'create', 'delete', 'directory', 'folder', 'path'],
  fetch: ['http', 'url', 'web', 'download', 'api', 'request', 'fetch'],
  
  // Git/VCS
  git: ['git', 'commit', 'branch', 'merge', 'diff', 'pull', 'push', 'repository'],
  github: ['github', 'issue', 'pr', 'pull request', 'repository', 'gist'],
  
  // Database
  sqlite: ['sqlite', 'database', 'db', 'sql', 'query', 'table'],
  postgres: ['postgres', 'postgresql', 'database', 'db', 'sql'],
  
  // Search
  'brave-search': ['search', 'web search', 'find', 'lookup', 'google'],
  
  // Browser
  puppeteer: ['browser', 'scrape', 'screenshot', 'automation', 'webpage'],
  
  // Memory
  memory: ['remember', 'recall', 'memory', 'knowledge', 'store'],
  
  // Communication
  slack: ['slack', 'message', 'channel', 'team', 'chat'],
  
  // Maps
  'google-maps': ['location', 'map', 'directions', 'place', 'address', 'geocode'],
};

// =============================================================================
// MCP Context Integration Class
// =============================================================================

export class MCPContextIntegration {
  private enrichedContextCache = new Map<string, EnrichedContext>();
  private readonly cacheTTL = 60000; // 1 minute

  /**
   * Get full MCP context for system prompt
   */
  getFullContext(): MCPContextInfo | undefined {
    return getMCPContextProvider().getContextInfo();
  }

  /**
   * Get context-aware tool suggestions based on query
   */
  getToolSuggestions(context: ContextQuery): MCPToolSuggestion[] {
    const manager = getMCPManager();
    if (!manager) {
      return [];
    }

    const allTools = manager.getAllTools();
    const suggestions: MCPToolSuggestion[] = [];
    const maxSuggestions = context.maxSuggestions ?? 5;

    // Extract keywords from context
    const contextKeywords = this.extractKeywords(context);

    for (const tool of allTools) {
      const { score, reason, matchedKeywords } = this.calculateToolRelevance(tool, contextKeywords);
      
      if (score > 0.1) {
        suggestions.push({
          tool,
          serverId: tool.serverId,
          serverName: tool.serverName,
          relevance: score,
          reason,
          matchedKeywords,
        });
      }
    }

    // Sort by relevance and limit
    return suggestions
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, maxSuggestions);
  }

  /**
   * Get context-aware resource suggestions
   */
  getResourceSuggestions(context: ContextQuery): MCPResourceSuggestion[] {
    const manager = getMCPManager();
    if (!manager) {
      return [];
    }

    const allResources = manager.getAllResources();
    const suggestions: MCPResourceSuggestion[] = [];
    const maxSuggestions = context.maxSuggestions ?? 5;

    // Extract keywords from context
    const contextKeywords = this.extractKeywords(context);

    for (const resource of allResources) {
      const { score, reason } = this.calculateResourceRelevance(resource, contextKeywords, context);
      
      if (score > 0.1) {
        suggestions.push({
          resource,
          serverId: resource.serverId,
          serverName: resource.serverName,
          relevance: score,
          reason,
        });
      }
    }

    // Sort by relevance and limit
    return suggestions
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, maxSuggestions);
  }

  /**
   * Get prompt suggestions based on context
   */
  getPromptSuggestions(context: ContextQuery): Array<MCPPrompt & { serverId: string; serverName: string; relevance: number }> {
    const manager = getMCPManager();
    if (!manager) {
      return [];
    }

    const allPrompts = manager.getAllPrompts();
    const contextKeywords = this.extractKeywords(context);
    const maxSuggestions = context.maxSuggestions ?? 3;

    const scored = allPrompts.map(prompt => {
      const promptKeywords = [
        prompt.name.toLowerCase(),
        ...(prompt.description?.toLowerCase().split(/\s+/) ?? []),
      ];
      
      let score = 0;
      for (const keyword of contextKeywords) {
        if (promptKeywords.some(pk => pk.includes(keyword) || keyword.includes(pk))) {
          score += 0.3;
        }
      }
      
      return { ...prompt, relevance: Math.min(score, 1.0) };
    });

    return scored
      .filter(p => p.relevance > 0.1)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, maxSuggestions);
  }

  /**
   * Enrich context by fetching relevant MCP resources
   */
  async enrichContext(context: ContextQuery): Promise<EnrichedContext[]> {
    const suggestions = this.getResourceSuggestions(context);
    const enriched: EnrichedContext[] = [];
    const manager = getMCPManager();
    
    if (!manager) {
      return enriched;
    }

    // Fetch top relevant resources
    for (const suggestion of suggestions.slice(0, 3)) {
      // Check cache
      const cacheKey = `${suggestion.serverId}:${suggestion.resource.uri}`;
      const cached = this.enrichedContextCache.get(cacheKey);
      
      if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) {
        enriched.push(cached);
        continue;
      }

      try {
        const contents = await manager.readResource(suggestion.serverId, suggestion.resource.uri);
        
        for (const content of contents) {
          const enrichedItem: EnrichedContext = {
            sourceUri: suggestion.resource.uri,
            serverName: suggestion.serverName,
            contentType: content.mimeType ?? 'text/plain',
            content: content.text ?? '[Binary content]',
            relevance: suggestion.relevance,
            fetchedAt: Date.now(),
          };
          
          this.enrichedContextCache.set(cacheKey, enrichedItem);
          enriched.push(enrichedItem);
        }
      } catch (error) {
        logger.debug('Failed to fetch resource for context enrichment', {
          uri: suggestion.resource.uri,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return enriched;
  }

  /**
   * Get a summary of available MCP capabilities
   */
  getCapabilitiesSummary(): string {
    const manager = getMCPManager();
    if (!manager) {
      return 'MCP not available';
    }

    const states = manager.getServerStates();
    const connected = states.filter(s => s.status === 'connected');

    if (connected.length === 0) {
      return 'No MCP servers connected';
    }

    const lines: string[] = [];
    let totalTools = 0;
    let totalResources = 0;
    let totalPrompts = 0;

    for (const state of connected) {
      totalTools += state.tools.length;
      totalResources += state.resources.length;
      totalPrompts += state.prompts.length;
    }

    lines.push(`MCP: ${connected.length} server(s) connected`);
    lines.push(`  Tools: ${totalTools}, Resources: ${totalResources}, Prompts: ${totalPrompts}`);

    return lines.join('\n');
  }

  /**
   * Get detailed MCP context for agent
   */
  getDetailedContext(): {
    servers: Array<{ name: string; status: string; tools: number; resources: number; prompts: number }>;
    tools: Array<{ name: string; server: string; description?: string }>;
    hasResources: boolean;
    hasPrompts: boolean;
  } {
    const manager = getMCPManager();
    if (!manager) {
      return { servers: [], tools: [], hasResources: false, hasPrompts: false };
    }

    const states = manager.getServerStates();
    
    const servers = states.map(s => ({
      name: s.config.name,
      status: s.status,
      tools: s.tools.length,
      resources: s.resources.length,
      prompts: s.prompts.length,
    }));

    const tools = states
      .filter(s => s.status === 'connected')
      .flatMap(s => s.tools.map(t => ({
        name: t.name,
        server: s.config.name,
        description: t.description,
      })));

    const hasResources = states.some(s => s.resources.length > 0);
    const hasPrompts = states.some(s => s.prompts.length > 0);

    return { servers, tools, hasResources, hasPrompts };
  }

  /**
   * Clear the enriched context cache
   */
  clearCache(): void {
    this.enrichedContextCache.clear();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private extractKeywords(context: ContextQuery): string[] {
    const keywords: string[] = [];

    // Extract from query
    if (context.query) {
      const words = context.query.toLowerCase().split(/\s+/);
      keywords.push(...words.filter(w => w.length > 2));
    }

    // Add file path keywords
    if (context.filePath) {
      const parts = context.filePath.split(/[/\\]/);
      keywords.push(...parts.filter(p => p.length > 2).map(p => p.toLowerCase()));
    }

    // Add language
    if (context.language) {
      keywords.push(context.language.toLowerCase());
    }

    // Add task type
    if (context.taskType) {
      keywords.push(...context.taskType.toLowerCase().split(/[\s_-]+/));
    }

    // Add tags
    if (context.tags) {
      keywords.push(...context.tags.map(t => t.toLowerCase()));
    }

    return [...new Set(keywords)];
  }

  private calculateToolRelevance(
    tool: MCPTool & { serverId: string; serverName: string },
    contextKeywords: string[]
  ): { score: number; reason: string; matchedKeywords: string[] } {
    let score = 0;
    const matchedKeywords: string[] = [];
    const reasons: string[] = [];

    // Get tool keywords from registry
    const serverName = tool.serverName.toLowerCase();
    const toolKeywords = TOOL_KEYWORDS[serverName] ?? [];

    // Check tool name and description
    const toolWords = [
      tool.name.toLowerCase(),
      ...(tool.description?.toLowerCase().split(/\s+/) ?? []),
      ...toolKeywords,
    ];

    for (const keyword of contextKeywords) {
      for (const toolWord of toolWords) {
        if (toolWord.includes(keyword) || keyword.includes(toolWord)) {
          score += 0.2;
          matchedKeywords.push(keyword);
          break;
        }
      }
    }

    // Boost for exact matches
    for (const keyword of contextKeywords) {
      if (tool.name.toLowerCase().includes(keyword)) {
        score += 0.3;
        reasons.push(`Tool name matches "${keyword}"`);
      }
      if (tool.description?.toLowerCase().includes(keyword)) {
        score += 0.15;
        reasons.push(`Description mentions "${keyword}"`);
      }
    }

    // Normalize score
    score = Math.min(score, 1.0);

    const reason = reasons.length > 0 
      ? reasons.join('; ') 
      : matchedKeywords.length > 0 
        ? `Matches keywords: ${matchedKeywords.slice(0, 3).join(', ')}`
        : 'Potentially relevant';

    return { score, reason, matchedKeywords: [...new Set(matchedKeywords)] };
  }

  private calculateResourceRelevance(
    resource: MCPResource & { serverId: string; serverName: string },
    contextKeywords: string[],
    context: ContextQuery
  ): { score: number; reason: string } {
    let score = 0;
    const reasons: string[] = [];

    // Check resource URI
    const uriLower = resource.uri.toLowerCase();
    for (const keyword of contextKeywords) {
      if (uriLower.includes(keyword)) {
        score += 0.3;
        reasons.push(`URI contains "${keyword}"`);
      }
    }

    // Check resource name and description
    const nameLower = resource.name.toLowerCase();
    const descLower = resource.description?.toLowerCase() ?? '';

    for (const keyword of contextKeywords) {
      if (nameLower.includes(keyword)) {
        score += 0.25;
        reasons.push(`Name matches "${keyword}"`);
      }
      if (descLower.includes(keyword)) {
        score += 0.15;
      }
    }

    // Check file path match
    if (context.filePath) {
      const filePathLower = context.filePath.toLowerCase();
      if (uriLower.includes(filePathLower) || filePathLower.includes(uriLower)) {
        score += 0.4;
        reasons.push('Matches current file');
      }
    }

    // Normalize score
    score = Math.min(score, 1.0);

    const reason = reasons.length > 0 ? reasons.join('; ') : 'Potentially relevant';

    return { score, reason };
  }
}

// Singleton instance
let integrationInstance: MCPContextIntegration | null = null;

/**
 * Get the MCP context integration instance
 */
export function getMCPContextIntegration(): MCPContextIntegration {
  if (!integrationInstance) {
    integrationInstance = new MCPContextIntegration();
  }
  return integrationInstance;
}
