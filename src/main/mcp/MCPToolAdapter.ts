/**
 * MCP Tool Adapter
 *
 * Integrates MCP server tools with the Vyotiq agent's tool registry.
 * Creates dynamic tool definitions from MCP servers and handles execution.
 *
 * @module main/mcp/MCPToolAdapter
 */

import { createLogger } from '../logger';
import { getMCPServerManager } from './MCPServerManager';
import type { ToolDefinition, ToolExecutionContext } from '../tools/types/toolTypes';
import type { ToolExecutionResult, ToolSpecification, DynamicToolState } from '../../shared/types';
import { DEFAULT_TOOL_CONFIG_SETTINGS } from '../../shared/types/tools';
import type { MCPToolWithContext } from '../../shared/types/mcp';
import type { ToolRegistry } from '../tools/registry/ToolRegistry';
import { getDynamicToolValidator } from '../agent/compliance';

const logger = createLogger('MCPToolAdapter');

// =============================================================================
// MCP Tool Adapter
// =============================================================================

/**
 * Converts an MCP tool to a Vyotiq ToolDefinition
 * @param mcpTool - The MCP tool with context
 * @param requireDynamicConfirmation - Whether dynamic tools require confirmation (read from current settings)
 */
export function mcpToolToToolDefinition(
  mcpTool: MCPToolWithContext,
  requireDynamicConfirmation?: boolean
): ToolDefinition {
  const { serverId, serverName, tool } = mcpTool;
  
  // Create a unique tool name with server prefix to avoid collisions
  const toolName = `mcp_${serverId.replace(/-/g, '_')}_${tool.name.replace(/-/g, '_')}`;
  
  // Convert inputSchema properties to SchemaProperty format
  const properties: Record<string, import('../tools/types/toolTypes').SchemaProperty> = {};
  if (tool.inputSchema.properties) {
    for (const [key, value] of Object.entries(tool.inputSchema.properties)) {
      const prop = value as Record<string, unknown>;
      properties[key] = {
        type: (prop.type as 'string' | 'number' | 'boolean' | 'array' | 'object') || 'string',
        description: prop.description as string | undefined,
      };
    }
  }

  // Use the provided setting or fall back to the default
  const needsApproval = requireDynamicConfirmation ?? DEFAULT_TOOL_CONFIG_SETTINGS.requireDynamicToolConfirmation;
  
  return {
    name: toolName,
    description: `[MCP: ${serverName}] ${tool.description}`,
    category: 'other', // Use 'other' as MCP is a meta-category
    requiresApproval: needsApproval, // Respect current user setting for dynamic tool confirmation
    riskLevel: 'moderate', // Default to moderate risk for external tools
    schema: {
      type: 'object',
      properties,
      required: tool.inputSchema.required || [],
    },
    execute: createMCPToolExecutor(serverId, tool.name, toolName),
  };
}

/**
 * Creates an executor function for an MCP tool
 * Includes auto-reconnection logic: if the server is disconnected,
 * attempts to reconnect before failing.
 */
function createMCPToolExecutor(
  serverId: string,
  toolName: string,
  registeredToolName: string
): (args: Record<string, unknown>, context: ToolExecutionContext) => Promise<ToolExecutionResult> {
  return async (args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolExecutionResult> => {
    const manager = getMCPServerManager();
    
    logger.info('Executing MCP tool', { serverId, toolName, args });
    
    try {
      // Check if server is disconnected and attempt reconnection
      const serverState = manager.getServerState(serverId);
      if (serverState && serverState.status !== 'connected') {
        const serverConfig = manager.getServer(serverId);
        if (serverConfig?.enabled) {
          logger.info('MCP server disconnected, attempting reconnection before tool call', {
            serverId,
            toolName,
            currentStatus: serverState.status,
          });
          try {
            await manager.connectServer(serverId);
            logger.info('MCP server reconnected successfully', { serverId });
          } catch (reconnectError) {
            const reconnectErr = reconnectError instanceof Error ? reconnectError : new Error(String(reconnectError));
            logger.warn('MCP server reconnection failed', { serverId, error: reconnectErr.message });
            return {
              toolName: registeredToolName,
              success: false,
              output: `MCP server "${serverId}" is disconnected and reconnection failed: ${reconnectErr.message}. Please check the server status in MCP settings.`,
            };
          }
        } else {
          return {
            toolName: registeredToolName,
            success: false,
            output: `MCP server "${serverId}" is disabled. Enable it in MCP settings to use this tool.`,
          };
        }
      }

      const result = await manager.callTool({
        serverId,
        toolName,
        arguments: args,
      });
      
      if (!result.success) {
        return {
          toolName: registeredToolName,
          success: false,
          output: result.error || 'MCP tool execution failed',
        };
      }
      
      // Convert MCP content to tool result
      const content = result.content || [];
      const textContent = content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n');
      
      // Check for images
      const imageContent = content
        .filter((c) => c.type === 'image')
        .map((c) => ({
          type: 'image' as const,
          data: c.data,
          mimeType: c.mimeType,
        }));
      
      if (imageContent.length > 0) {
        return {
          toolName: registeredToolName,
          success: true,
          output: textContent || 'Image generated',
          metadata: {
            images: imageContent,
          },
        };
      }
      
      return {
        toolName: registeredToolName,
        success: true,
        output: textContent || JSON.stringify(content),
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('MCP tool execution error', { serverId, toolName, error: err.message });
      return {
        toolName: registeredToolName,
        success: false,
        output: err.message,
      };
    }
  };
}

/**
 * Gets all MCP tools as ToolDefinitions
 */
export function getAllMCPToolDefinitions(): ToolDefinition[] {
  const manager = getMCPServerManager();
  const mcpTools = manager.getAllTools();
  
  return mcpTools.map((tool) => mcpToolToToolDefinition(tool));
}

/**
 * Gets MCP tools for a specific server as ToolDefinitions
 */
export function getServerMCPToolDefinitions(serverId: string): ToolDefinition[] {
  const manager = getMCPServerManager();
  const serverTools = manager.getServerTools(serverId);
  const config = manager.getServer(serverId);
  
  if (!config) return [];
  
  return serverTools.map((tool) =>
    mcpToolToToolDefinition({
      serverId,
      serverName: config.name,
      tool,
    })
  );
}

/**
 * Finds an MCP tool by name (supports both prefixed and unprefixed names)
 */
export function findMCPToolDefinition(name: string): ToolDefinition | undefined {
  const manager = getMCPServerManager();
  
  // Try direct lookup first
  const found = manager.findTool(name);
  if (found) {
    return mcpToolToToolDefinition(found);
  }
  
  // Try with mcp_ prefix removed
  if (name.startsWith('mcp_')) {
    const rest = name.substring(4);
    const manager = getMCPServerManager();
    const allTools = manager.getAllTools();
    
    // Find the matching tool by checking all registered server/tool combinations
    // This avoids the ambiguity of splitting on underscore since both server IDs
    // and tool names can contain underscores
    for (const mcpTool of allTools) {
      const expectedName = `mcp_${mcpTool.serverId.replace(/-/g, '_')}_${mcpTool.tool.name.replace(/-/g, '_')}`;
      if (expectedName === name) {
        return mcpToolToToolDefinition(mcpTool);
      }
    }
    
    // Fallback: try reconstructing with hyphen-based server ID
    const parts = rest.split('_');
    if (parts.length >= 2) {
      const toolName = parts[parts.length - 1];
      const serverId = parts.slice(0, -1).join('-');
      
      const tool = manager.findTool(`${serverId}:${toolName}`);
      if (tool) {
        return mcpToolToToolDefinition(tool);
      }
    }
  }
  
  return undefined;
}

/**
 * Checks if a tool name is an MCP tool
 */
export function isMCPTool(toolName: string): boolean {
  return toolName.startsWith('mcp_') || toolName.includes(':');
}

/**
 * Gets MCP tool metadata for display
 */
export function getMCPToolMetadata(): Array<{
  name: string;
  displayName: string;
  serverName: string;
  serverId: string;
  description: string;
  category: string;
}> {
  const manager = getMCPServerManager();
  const mcpTools = manager.getAllTools();
  
  return mcpTools.map(({ serverId, serverName, tool }) => ({
    name: `mcp_${serverId.replace(/-/g, '_')}_${tool.name.replace(/-/g, '_')}`,
    displayName: tool.name,
    serverName,
    serverId,
    description: tool.description,
    category: 'mcp',
  }));
}

// =============================================================================
// MCP Tool Registry Integration
// =============================================================================

/**
 * Creates a ToolSpecification for MCP tools
 */
function createMCPToolSpec(mcpTool: MCPToolWithContext): ToolSpecification {
  const { serverId, serverName, tool } = mcpTool;
  const toolName = `mcp_${serverId.replace(/-/g, '_')}_${tool.name.replace(/-/g, '_')}`;
  
  return {
    id: `mcp-${serverId}-${tool.name}`,
    name: toolName,
    description: `[MCP: ${serverName}] ${tool.description}`,
    inputSchema: tool.inputSchema,
    executionType: 'code' as const,
    requiredCapabilities: ['mcp'],
    riskLevel: 'moderate' as const,
    createdBy: {
      sessionId: 'mcp-system',
    },
    createdAt: Date.now(),
    version: 1,
  };
}

/**
 * Creates a DynamicToolState for MCP tools
 */
function createMCPToolState(mcpTool: MCPToolWithContext): DynamicToolState {
  const toolName = `mcp_${mcpTool.serverId.replace(/-/g, '_')}_${mcpTool.tool.name.replace(/-/g, '_')}`;
  
  return {
    name: toolName,
    status: 'active' as const,
    usageCount: 0,
    errorCount: 0,
  };
}

/**
 * Class to manage MCP tools integration with the main tool registry
 */
export class MCPToolRegistryAdapter {
  private registeredTools = new Set<string>();
  private toolRegistry: ToolRegistry | null = null;
  private getRequireDynamicConfirmation: (() => boolean) | null = null;

  /**
   * Initialize the adapter with the main tool registry
   * @param registry - The main tool registry
   * @param getRequireDynamicConfirmation - Optional getter for the current requireDynamicToolConfirmation setting
   */
  initialize(registry: ToolRegistry, getRequireDynamicConfirmation?: () => boolean): void {
    this.toolRegistry = registry;
    this.getRequireDynamicConfirmation = getRequireDynamicConfirmation ?? null;
    
    // Subscribe to MCP tool changes
    const manager = getMCPServerManager();
    manager.on('tools:updated', (tools) => {
      this.syncTools(tools);
    });
    
    // Initial sync
    this.syncTools(manager.getAllTools());
    
    logger.info('MCP Tool Registry Adapter initialized');
  }

  /**
   * Sync MCP tools with the main registry
   */
  private syncTools(mcpTools: MCPToolWithContext[]): void {
    if (!this.toolRegistry) return;
    
    // Read the current dynamic tool confirmation setting
    const requireConfirmation = this.getRequireDynamicConfirmation?.() 
      ?? DEFAULT_TOOL_CONFIG_SETTINGS.requireDynamicToolConfirmation;
    
    const currentToolNames = new Set(
      mcpTools.map(
        (t) => `mcp_${t.serverId.replace(/-/g, '_')}_${t.tool.name.replace(/-/g, '_')}`
      )
    );
    
    // Unregister removed tools
    for (const name of this.registeredTools) {
      if (!currentToolNames.has(name)) {
        try {
          this.toolRegistry.unregisterDynamic(name);
          this.registeredTools.delete(name);
          logger.debug('Unregistered MCP tool', { name });
        } catch (err) {
          logger.warn('Failed to unregister MCP tool', { name, error: err });
        }
      }
    }
    
    // Register new tools
    for (const mcpTool of mcpTools) {
      const toolDef = mcpToolToToolDefinition(mcpTool, requireConfirmation);
      if (!this.registeredTools.has(toolDef.name)) {
        try {
          const spec = createMCPToolSpec(mcpTool);
          const state = createMCPToolState(mcpTool);

          // Validate dynamic tool before registration
          const validator = getDynamicToolValidator();
          const validationResult = validator.validate(spec);
          if (!validationResult.valid) {
            logger.warn('MCP tool failed validation, skipping registration', {
              name: toolDef.name,
              issues: validationResult.issues.filter(i => i.severity === 'error').map(i => i.message),
              riskLevel: validationResult.riskLevel,
            });
            continue;
          }

          this.toolRegistry.registerDynamic(toolDef, spec, state);
          this.registeredTools.add(toolDef.name);
          logger.debug('Registered MCP tool', { name: toolDef.name, riskLevel: validationResult.riskLevel });
        } catch (err) {
          logger.warn('Failed to register MCP tool', { name: toolDef.name, error: err });
        }
      }
    }
    
    logger.info('Synced MCP tools with registry', {
      totalTools: mcpTools.length,
      registered: this.registeredTools.size,
    });
  }

  /**
   * Get count of registered MCP tools
   */
  getRegisteredToolCount(): number {
    return this.registeredTools.size;
  }

  /**
   * Clean up all registered MCP tools
   */
  cleanup(): void {
    if (!this.toolRegistry) return;
    
    for (const name of this.registeredTools) {
      try {
        this.toolRegistry.unregisterDynamic(name);
      } catch (err) {
        logger.warn('Failed to unregister MCP tool during cleanup', { name, error: err });
      }
    }
    
    this.registeredTools.clear();
    logger.info('MCP Tool Registry Adapter cleaned up');
  }
}

// Singleton instance
let adapterInstance: MCPToolRegistryAdapter | null = null;

export function getMCPToolRegistryAdapter(): MCPToolRegistryAdapter {
  if (!adapterInstance) {
    adapterInstance = new MCPToolRegistryAdapter();
  }
  return adapterInstance;
}

export function initializeMCPToolRegistryAdapter(
  registry: ToolRegistry,
  getRequireDynamicConfirmation?: () => boolean
): MCPToolRegistryAdapter {
  const adapter = getMCPToolRegistryAdapter();
  adapter.initialize(registry, getRequireDynamicConfirmation);
  return adapter;
}
