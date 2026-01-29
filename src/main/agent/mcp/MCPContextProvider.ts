/**
 * MCP Context Provider
 * 
 * Integrates MCP resources and prompts into the agent's context system.
 * Provides context-aware information about available MCP capabilities.
 */

import type {
  MCPServerState,
} from '../../../shared/types/mcp';
import type { MCPContextInfo } from '../systemPrompt/types';
import { getMCPManager } from './MCPManager';
import { createLogger } from '../../logger';

const logger = createLogger('MCPContextProvider');

// Export logger for testing and debugging
export { logger as mcpContextProviderLogger };

/**
 * MCP context for system prompt injection
 */
export interface MCPContext {
  /** Whether MCP is enabled */
  enabled: boolean;
  /** Number of connected servers */
  connectedServerCount: number;
  /** Total available tools */
  availableToolCount: number;
  /** Tool names grouped by server */
  toolsByServer: Record<string, string[]>;
  /** Available prompts */
  prompts: Array<{ name: string; description?: string; serverName: string }>;
  /** Formatted context string for system prompt */
  formattedContext: string;
}

/**
 * MCP Context Provider
 */
export class MCPContextProvider {
  /**
   * Get MCP context for system prompt injection
   */
  getContext(): MCPContext {
    const manager = getMCPManager();
    
    if (!manager) {
      return this.createEmptyContext();
    }

    const states = manager.getServerStates();
    const connectedServers = states.filter(s => s.status === 'connected');

    if (connectedServers.length === 0) {
      return this.createEmptyContext();
    }

    // Gather tools by server
    const toolsByServer: Record<string, string[]> = {};
    let totalTools = 0;

    for (const state of connectedServers) {
      const serverName = state.config.name;
      toolsByServer[serverName] = state.tools.map(t => t.name);
      totalTools += state.tools.length;
    }

    // Gather prompts
    const prompts = connectedServers.flatMap(state =>
      state.prompts.map(p => ({
        name: p.name,
        description: p.description,
        serverName: state.config.name,
      }))
    );

    // Format context
    const formattedContext = this.formatContext(connectedServers);

    return {
      enabled: true,
      connectedServerCount: connectedServers.length,
      availableToolCount: totalTools,
      toolsByServer,
      prompts,
      formattedContext,
    };
  }

  /**
   * Get formatted tool list for system prompt
   */
  getToolsForPrompt(): string {
    const manager = getMCPManager();
    if (!manager) {
      return '';
    }

    const tools = manager.getAllTools();
    if (tools.length === 0) {
      return '';
    }

    const lines: string[] = ['## MCP Server Tools\n'];
    lines.push('The following tools are available from connected MCP servers:\n');

    // Group by server
    const byServer = new Map<string, typeof tools>();
    for (const tool of tools) {
      const existing = byServer.get(tool.serverName) ?? [];
      existing.push(tool);
      byServer.set(tool.serverName, existing);
    }

    for (const [serverName, serverTools] of byServer) {
      lines.push(`### ${serverName}\n`);
      for (const tool of serverTools) {
        const internalName = `mcp_${tool.serverId.slice(0, 8)}_${tool.name}`;
        lines.push(`- **${internalName}**: ${tool.description ?? tool.name}`);
        if (tool.annotations?.readOnlyHint) {
          lines.push('  (read-only)');
        }
        if (tool.annotations?.destructiveHint) {
          lines.push('  ⚠️ (destructive)');
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Get available resources summary
   */
  getResourcesSummary(): string {
    const manager = getMCPManager();
    if (!manager) {
      return '';
    }

    const resources = manager.getAllResources();
    if (resources.length === 0) {
      return '';
    }

    const lines: string[] = ['## Available MCP Resources\n'];

    // Group by server
    const byServer = new Map<string, typeof resources>();
    for (const resource of resources) {
      const existing = byServer.get(resource.serverName) ?? [];
      existing.push(resource);
      byServer.set(resource.serverName, existing);
    }

    for (const [serverName, serverResources] of byServer) {
      lines.push(`### ${serverName}`);
      for (const resource of serverResources.slice(0, 10)) { // Limit to 10 per server
        lines.push(`- ${resource.uri}: ${resource.description ?? resource.name}`);
      }
      if (serverResources.length > 10) {
        lines.push(`  ... and ${serverResources.length - 10} more`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Get available prompts summary
   */
  getPromptsSummary(): string {
    const manager = getMCPManager();
    if (!manager) {
      return '';
    }

    const prompts = manager.getAllPrompts();
    if (prompts.length === 0) {
      return '';
    }

    const lines: string[] = ['## Available MCP Prompts\n'];
    lines.push('The following prompt templates are available from MCP servers:\n');

    // Group by server
    const byServer = new Map<string, typeof prompts>();
    for (const prompt of prompts) {
      const existing = byServer.get(prompt.serverName) ?? [];
      existing.push(prompt);
      byServer.set(prompt.serverName, existing);
    }

    for (const [serverName, serverPrompts] of byServer) {
      lines.push(`### ${serverName}`);
      for (const prompt of serverPrompts) {
        lines.push(`- **${prompt.name}**: ${prompt.description ?? 'No description'}`);
        if (prompt.arguments && prompt.arguments.length > 0) {
          const args = prompt.arguments.map(a => a.required ? a.name : `[${a.name}]`).join(', ');
          lines.push(`  Arguments: ${args}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Get server status summary
   */
  getServerStatusSummary(): string {
    const manager = getMCPManager();
    if (!manager) {
      return 'MCP: Not initialized';
    }

    const states = manager.getServerStates();
    if (states.length === 0) {
      return 'MCP: No servers configured';
    }

    const connected = states.filter(s => s.status === 'connected');
    const errored = states.filter(s => s.status === 'error');

    let summary = `MCP: ${connected.length}/${states.length} servers connected`;
    if (errored.length > 0) {
      summary += `, ${errored.length} with errors`;
    }

    return summary;
  }

  /**
   * Get MCP context info for system prompt injection
   * Returns the structured format expected by the system prompt builder
   */
  getContextInfo(): MCPContextInfo | undefined {
    const manager = getMCPManager();
    
    if (!manager) {
      return undefined;
    }

    const states = manager.getServerStates();
    const connectedServers = states.filter(s => s.status === 'connected');

    if (connectedServers.length === 0) {
      return undefined;
    }

    // Gather tools and resources by server
    const toolsByServer: Record<string, string[]> = {};
    const resourcesByServer: Record<string, string[]> = {};
    let totalTools = 0;
    let totalResources = 0;

    const servers: MCPContextInfo['servers'] = [];

    for (const state of connectedServers) {
      const serverName = state.config.name;
      
      toolsByServer[serverName] = state.tools.map(t => t.name);
      resourcesByServer[serverName] = state.resources.map(r => r.uri);
      
      totalTools += state.tools.length;
      totalResources += state.resources.length;

      servers.push({
        name: serverName,
        toolCount: state.tools.length,
        resourceCount: state.resources.length,
        promptCount: state.prompts.length,
      });
    }

    return {
      connectedServers: connectedServers.length,
      totalTools,
      totalResources,
      servers,
      toolsByServer,
      resourcesByServer,
    };
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private createEmptyContext(): MCPContext {
    return {
      enabled: false,
      connectedServerCount: 0,
      availableToolCount: 0,
      toolsByServer: {},
      prompts: [],
      formattedContext: '',
    };
  }

  private formatContext(servers: MCPServerState[]): string {
    if (servers.length === 0) {
      return '';
    }

    const lines: string[] = [
      '<mcp_context>',
      '## MCP Integration Status',
      '',
      `Connected to ${servers.length} MCP server(s):`,
    ];

    for (const server of servers) {
      lines.push(`- **${server.config.name}**: ${server.tools.length} tools, ${server.resources.length} resources, ${server.prompts.length} prompts`);
      
      if (server.serverInfo?.instructions) {
        lines.push(`  Server instructions: ${server.serverInfo.instructions}`);
      }
    }

    lines.push('');
    lines.push('MCP tools are prefixed with `mcp_<serverid>_` and can be called like any other tool.');
    lines.push('</mcp_context>');

    return lines.join('\n');
  }
}

// Singleton instance
let providerInstance: MCPContextProvider | null = null;

/**
 * Get the MCP context provider instance
 */
export function getMCPContextProvider(): MCPContextProvider {
  if (!providerInstance) {
    providerInstance = new MCPContextProvider();
  }
  return providerInstance;
}
