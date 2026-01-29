/**
 * MCP Tool Sync
 * 
 * Synchronizes MCP tools with the ToolRegistry.
 * Listens for MCP server events and updates the registry accordingly.
 */

import type { ToolRegistry } from '../../tools/registry/ToolRegistry';
import { getMCPManager, type MCPManager } from './MCPManager';
import { getMCPToolAdapter } from './MCPToolAdapter';
import { createLogger } from '../../logger';

const logger = createLogger('MCPToolSync');

let registryRef: ToolRegistry | null = null;
let syncInitialized = false;

/**
 * Initialize MCP tool synchronization with the tool registry
 */
export function initMCPToolSync(registry: ToolRegistry): void {
  if (syncInitialized) {
    logger.debug('MCP tool sync already initialized');
    return;
  }

  registryRef = registry;
  syncInitialized = true;

  logger.info('MCP tool sync initialized');

  // Set up manager event listeners once available
  setupManagerListeners();
}

/**
 * Set up listeners on the MCP manager
 */
function setupManagerListeners(): void {
  // Manager may not be ready yet, check periodically
  const checkManager = () => {
    const manager = getMCPManager();
    if (manager) {
      attachListeners(manager);
    } else {
      // Check again after a delay
      setTimeout(checkManager, 500);
    }
  };

  checkManager();
}

/**
 * Attach event listeners to the MCP manager
 */
function attachListeners(manager: MCPManager): void {
  // When a server connects, register its tools
  manager.on('serverConnected', (serverId) => {
    logger.info('Server connected, syncing tools', { serverId });
    syncServerTools(serverId);
  });

  // When a server disconnects, unregister its tools
  manager.on('serverDisconnected', (serverId) => {
    logger.info('Server disconnected, removing tools', { serverId });
    removeServerTools(serverId);
  });

  // When tools change on a server, resync
  manager.on('toolsChanged', (serverId) => {
    logger.info('Server tools changed, resyncing', { serverId });
    removeServerTools(serverId);
    syncServerTools(serverId);
  });

  // Initial sync of all connected servers
  const states = manager.getServerStates();
  for (const state of states) {
    if (state.status === 'connected') {
      syncServerTools(state.config.id);
    }
  }

  logger.info('MCP manager listeners attached');
}

/**
 * Sync tools from a specific MCP server to the registry
 */
function syncServerTools(serverId: string): void {
  if (!registryRef) {
    logger.warn('Tool registry not available');
    return;
  }

  const adapter = getMCPToolAdapter();
  const tools = adapter.getServerTools(serverId);

  for (const tool of tools) {
    try {
      registryRef.register(tool);
      logger.debug('Registered MCP tool', { name: tool.name, server: serverId });
    } catch (error) {
      logger.error('Failed to register MCP tool', {
        name: tool.name,
        server: serverId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info('Synced MCP server tools', { serverId, count: tools.length });
}

/**
 * Remove tools from a specific MCP server from the registry
 */
function removeServerTools(serverId: string): void {
  if (!registryRef) {
    logger.warn('Tool registry not available');
    return;
  }

  const adapter = getMCPToolAdapter();
  const serverIdPrefix = serverId.slice(0, 8);

  // Find and remove all tools for this server
  // Tool names are formatted as: mcp_<serverIdPrefix>_<toolName>
  const allTools = registryRef.list();
  const toRemove = allTools.filter(tool => 
    tool.name.startsWith(`mcp_${serverIdPrefix}_`)
  );

  for (const tool of toRemove) {
    try {
      // Use unregisterDynamic if it exists, otherwise we need to add a method
      // For now, we'll check if the tool registry has a remove method
      const removed = registryRef.unregisterDynamic(tool.name);
      if (removed) {
        logger.debug('Unregistered MCP tool', { name: tool.name });
      }
    } catch {
      // Tool may not be dynamically registered, skip silently
      logger.debug('Could not unregister tool (may not be dynamic)', { name: tool.name });
    }
  }

  // Clear the adapter cache for this server
  adapter.clearCache();

  logger.info('Removed MCP server tools', { serverId, count: toRemove.length });
}

/**
 * Force a full resync of all MCP tools
 */
export function resyncAllMCPTools(): void {
  const manager = getMCPManager();
  if (!manager || !registryRef) {
    logger.warn('Cannot resync: manager or registry not available');
    return;
  }

  // Remove all MCP tools first
  const allTools = registryRef.list();
  const mcpTools = allTools.filter(tool => tool.name.startsWith('mcp_'));
  
  for (const tool of mcpTools) {
    try {
      registryRef.unregisterDynamic(tool.name);
    } catch {
      // Ignore
    }
  }

  // Clear adapter cache
  getMCPToolAdapter().clearCache();

  // Re-add tools from all connected servers
  const states = manager.getServerStates();
  for (const state of states) {
    if (state.status === 'connected') {
      syncServerTools(state.config.id);
    }
  }

  logger.info('Full MCP tool resync complete');
}

/**
 * Cleanup MCP tool sync
 */
export function cleanupMCPToolSync(): void {
  if (!syncInitialized) {
    return;
  }

  // Remove all MCP tools from registry
  if (registryRef) {
    const allTools = registryRef.list();
    const mcpTools = allTools.filter(tool => tool.name.startsWith('mcp_'));
    
    for (const tool of mcpTools) {
      try {
        registryRef.unregisterDynamic(tool.name);
      } catch {
        // Ignore
      }
    }
  }

  registryRef = null;
  syncInitialized = false;

  logger.info('MCP tool sync cleaned up');
}
