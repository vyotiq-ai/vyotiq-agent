/**
 * MCP Tool Adapter
 * 
 * Adapts MCP tools to the internal tool system.
 * Creates tool definitions that can be registered with the ToolRegistry.
 * Handles tool execution by forwarding calls to the appropriate MCP server.
 */

import type {
  MCPTool,
  MCPToolResult,
  MCPToolResultContent,
} from '../../../shared/types/mcp';
import type { ToolDefinition, EnhancedToolResult, ToolCategory, ToolSchema } from '../../tools/types';
import { getMCPManager } from './MCPManager';
import { createLogger } from '../../logger';

const logger = createLogger('MCPToolAdapter');

/**
 * Extended MCP tool with server info
 */
export interface MCPToolWithServer extends MCPTool {
  serverId: string;
  serverName: string;
}

/**
 * Convert MCP tool to internal tool definition
 */
function mcpToolToDefinition(tool: MCPToolWithServer): ToolDefinition {
  // Create a unique name that includes server prefix for disambiguation
  const internalName = `mcp_${tool.serverId.slice(0, 8)}_${tool.name}`;

  return {
    name: internalName,
    description: formatDescription(tool),
    requiresApproval: inferRequiresApproval(tool),
    schema: convertMCPSchemaToToolSchema(tool.inputSchema),
    category: 'mcp' as ToolCategory,
    execute: createMCPToolExecutor(tool.serverId, tool.name, internalName),
    ui: {
      icon: 'plug',
      label: tool.title ?? tool.name,
      color: 'purple',
      runningLabel: `Running ${tool.name}...`,
      completedLabel: `Completed ${tool.name}`,
    },
    // Store original MCP tool info in metadata
    metadata: {
      mcpServerId: tool.serverId,
      mcpServerName: tool.serverName,
      mcpToolName: tool.name,
      mcpServerGroup: `MCP: ${tool.serverName}`,
      riskLevel: inferRiskLevel(tool),
      annotations: tool.annotations,
    },
  };
}

/**
 * Format tool description including server info
 */
function formatDescription(tool: MCPToolWithServer): string {
  let desc = tool.description ?? 'MCP tool';
  desc += `\n[MCP Server: ${tool.serverName}]`;
  
  if (tool.annotations) {
    if (tool.annotations.readOnlyHint) {
      desc += '\n[Read-only operation]';
    }
    if (tool.annotations.destructiveHint) {
      desc += '\n[⚠️ Destructive operation]';
    }
  }

  return desc;
}

/**
 * Infer risk level from tool annotations
 */
function inferRiskLevel(tool: MCPToolWithServer): 'low' | 'medium' | 'high' | 'critical' {
  if (tool.annotations?.destructiveHint) {
    return 'critical';
  }
  if (tool.annotations?.openWorldHint) {
    return 'high';
  }
  if (tool.annotations?.readOnlyHint) {
    return 'low';
  }
  if (tool.annotations?.idempotentHint) {
    return 'low';
  }
  // Default to medium for MCP tools since we can't verify their behavior
  return 'medium';
}

/**
 * Infer whether tool requires user approval based on annotations
 */
function inferRequiresApproval(tool: MCPToolWithServer): boolean {
  // Destructive operations always require approval
  if (tool.annotations?.destructiveHint) {
    return true;
  }
  // Open-world tools (network access, etc.) require approval
  if (tool.annotations?.openWorldHint) {
    return true;
  }
  // Read-only and idempotent operations are safer
  if (tool.annotations?.readOnlyHint || tool.annotations?.idempotentHint) {
    return false;
  }
  // Default to requiring approval for MCP tools for safety
  return true;
}

/**
 * Convert MCP JSON Schema to internal ToolSchema format
 */
function convertMCPSchemaToToolSchema(inputSchema: MCPTool['inputSchema']): ToolSchema {
  // MCP uses standard JSON Schema, we need to adapt to our format
  const schema: ToolSchema = {
    type: 'object',
    properties: {},
    required: inputSchema?.required as string[] | undefined,
  };

  if (inputSchema?.properties) {
    for (const [key, value] of Object.entries(inputSchema.properties)) {
      const prop = value as Record<string, unknown>;
      schema.properties[key] = {
        type: (prop.type as 'string' | 'number' | 'boolean' | 'array' | 'object') ?? 'string',
        description: prop.description as string | undefined,
        enum: prop.enum as string[] | undefined,
        default: prop.default,
      };
    }
  }

  return schema;
}

/**
 * Create an executor function for an MCP tool
 */
function createMCPToolExecutor(serverId: string, toolName: string, internalToolName: string) {
  return async (
    args: Record<string, unknown>,
    _context: unknown
  ): Promise<EnhancedToolResult> => {
    const manager = getMCPManager();
    if (!manager) {
      return {
        toolName: internalToolName,
        success: false,
        output: 'MCP Manager not initialized',
        metadata: { mcpServerId: serverId, mcpToolName: toolName },
      };
    }

    try {
      logger.debug('Executing MCP tool', { serverId, toolName, args });

      const result = await manager.callTool(serverId, toolName, args);

      return convertMCPResult(result, serverId, toolName, internalToolName);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('MCP tool execution failed', { serverId, toolName, error: errorMessage });

      return {
        toolName: internalToolName,
        success: false,
        output: `MCP tool error: ${errorMessage}`,
        metadata: { mcpServerId: serverId, mcpToolName: toolName, error: errorMessage },
      };
    }
  };
}

/**
 * Convert MCP tool result to internal format
 */
function convertMCPResult(
  result: MCPToolResult,
  serverId: string,
  toolName: string,
  internalToolName: string
): EnhancedToolResult {
  const output = formatMCPContent(result.content);

  return {
    toolName: internalToolName,
    success: !result.isError,
    output,
    metadata: {
      mcpServerId: serverId,
      mcpToolName: toolName,
      hasStructuredContent: !!result.structuredContent,
      structuredContent: result.structuredContent,
      contentTypes: result.content.map(c => c.type),
    },
  };
}

/**
 * Format MCP content array to string output
 */
function formatMCPContent(content: MCPToolResultContent[]): string {
  const parts: string[] = [];

  for (const item of content) {
    switch (item.type) {
      case 'text':
        parts.push(item.text);
        break;

      case 'image':
        parts.push(`[Image: ${item.mimeType}]`);
        break;

      case 'audio':
        parts.push(`[Audio: ${item.mimeType}]`);
        break;

      case 'resource_link':
        parts.push(`[Resource: ${item.uri}${item.name ? ` (${item.name})` : ''}]`);
        break;

      case 'resource':
        if (item.resource.text) {
          parts.push(item.resource.text);
        } else if (item.resource.blob) {
          parts.push(`[Binary resource: ${item.resource.uri}]`);
        }
        break;
    }
  }

  return parts.join('\n');
}

/**
 * MCP Tool Adapter class for managing MCP tool integration
 */
export class MCPToolAdapter {
  private toolCache = new Map<string, ToolDefinition>();

  /**
   * Get all MCP tools as internal tool definitions
   */
  getAllTools(): ToolDefinition[] {
    const manager = getMCPManager();
    if (!manager) {
      return [];
    }

    const mcpTools = manager.getAllTools();
    const definitions: ToolDefinition[] = [];

    for (const tool of mcpTools) {
      const def = mcpToolToDefinition(tool);
      this.toolCache.set(def.name, def);
      definitions.push(def);
    }

    return definitions;
  }

  /**
   * Get tools for a specific server
   */
  getServerTools(serverId: string): ToolDefinition[] {
    const manager = getMCPManager();
    if (!manager) {
      return [];
    }

    const state = manager.getServerState(serverId);
    if (!state || state.status !== 'connected') {
      return [];
    }

    return state.tools.map(tool => 
      mcpToolToDefinition({
        ...tool,
        serverId: state.config.id,
        serverName: state.config.name,
      })
    );
  }

  /**
   * Get a specific tool definition by name
   */
  getTool(name: string): ToolDefinition | undefined {
    return this.toolCache.get(name);
  }

  /**
   * Check if a tool name is an MCP tool
   */
  isMCPTool(name: string): boolean {
    return name.startsWith('mcp_');
  }

  /**
   * Extract server ID and tool name from internal tool name
   */
  parseMCPToolName(internalName: string): { serverId: string; toolName: string } | null {
    const match = internalName.match(/^mcp_([a-f0-9]{8})_(.+)$/);
    if (!match) {
      return null;
    }

    // Find the full server ID from the prefix
    const manager = getMCPManager();
    if (!manager) {
      return null;
    }

    const serverIdPrefix = match[1];
    const toolName = match[2];

    const servers = manager.getServers();
    const server = servers.find(s => s.id.startsWith(serverIdPrefix));

    if (!server) {
      return null;
    }

    return { serverId: server.id, toolName };
  }

  /**
   * Clear the tool cache (call when servers change)
   */
  clearCache(): void {
    this.toolCache.clear();
  }
}

// Singleton instance
let adapterInstance: MCPToolAdapter | null = null;

/**
 * Get the MCP tool adapter instance
 */
export function getMCPToolAdapter(): MCPToolAdapter {
  if (!adapterInstance) {
    adapterInstance = new MCPToolAdapter();
  }
  return adapterInstance;
}
