/**
 * MCP Context Provider
 *
 * Provides MCP context information for the system prompt.
 * Gathers connected servers, available tools, and capabilities.
 *
 * @module main/mcp/MCPContextProvider
 */

import { getMCPServerManager } from './MCPServerManager';
import { createLogger } from '../logger';
import type { MCPContextInfo } from '../agent/systemPrompt/types';

const logger = createLogger('MCPContextProvider');

/**
 * Build MCP context for inclusion in system prompt
 * 
 * @param options Configuration options
 * @returns MCPContextInfo object or undefined if MCP is disabled
 */
export function buildMCPContextInfo(options?: {
  /** Maximum number of sample tools to include */
  maxSampleTools?: number;
  /** Whether MCP is enabled in settings */
  enabled?: boolean;
}): MCPContextInfo | undefined {
  const maxSampleTools = options?.maxSampleTools ?? 15;
  const enabled = options?.enabled ?? true;

  if (!enabled) {
    return undefined;
  }

  try {
    const manager = getMCPServerManager();
    const servers = manager.getServerSummaries();
    const connectedServers = servers.filter((s) => s.status === 'connected');
    
    if (connectedServers.length === 0) {
      return {
        enabled: true,
        connectedServers: 0,
        totalTools: 0,
        servers: [],
        sampleTools: [],
      };
    }

    const allTools = manager.getAllTools();
    
    // Build server list
    const serverList = connectedServers.map((s) => ({
      id: s.id,
      name: s.name,
      toolCount: s.toolCount,
      status: s.status,
    }));

    // Build sample tools (limited for token efficiency)
    const sampleTools = allTools.slice(0, maxSampleTools).map((t) => ({
      serverName: t.serverName,
      toolName: t.tool.name,
      description: t.tool.description,
    }));

    const totalTools = allTools.length;

    logger.debug('Built MCP context', {
      connectedServers: connectedServers.length,
      totalTools,
      sampleToolCount: sampleTools.length,
    });

    return {
      enabled: true,
      connectedServers: connectedServers.length,
      totalTools,
      servers: serverList,
      sampleTools,
    };
  } catch (error) {
    logger.error('Failed to build MCP context', {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

/**
 * Get a summary of MCP status for quick checks
 */
export function getMCPStatusSummary(): {
  enabled: boolean;
  connectedServers: number;
  totalTools: number;
} {
  try {
    const manager = getMCPServerManager();
    const servers = manager.getServerSummaries();
    const connectedServers = servers.filter((s) => s.status === 'connected');
    const allTools = manager.getAllTools();

    return {
      enabled: true,
      connectedServers: connectedServers.length,
      totalTools: allTools.length,
    };
  } catch {
    return {
      enabled: false,
      connectedServers: 0,
      totalTools: 0,
    };
  }
}

/**
 * Check if any MCP servers are connected
 */
export function hasMCPServersConnected(): boolean {
  try {
    const manager = getMCPServerManager();
    return manager.getConnectedServers().length > 0;
  } catch {
    return false;
  }
}
