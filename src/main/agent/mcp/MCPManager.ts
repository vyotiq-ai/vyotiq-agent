/**
 * MCP Manager
 * 
 * Central manager for all MCP server connections.
 * Handles:
 * - Server registry (add, remove, update)
 * - Connection lifecycle management
 * - Event aggregation and forwarding
 * - Settings persistence
 * - Tool aggregation for agent integration
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type {
  MCPServerConfig,
  MCPServerState,
  MCPSettings,
  MCPTool,
  MCPPrompt,
  MCPResource,
  MCPResourceTemplate,
  MCPToolResult,
  MCPResourceContent,
  MCPPromptResult,
  MCPAddServerRequest,
  MCPUpdateServerRequest,
} from '../../../shared/types/mcp';
import { DEFAULT_MCP_SETTINGS } from '../../../shared/types/mcp';
import { MCPServerConnection } from './MCPServerConnection';
import type { SettingsStore } from '../settingsStore';
import { createLogger } from '../../logger';

// Re-export types for external use
export type { MCPResourceTemplate };

const logger = createLogger('MCPManager');

/**
 * MCP Manager events
 */
export interface MCPManagerEvents {
  stateChanged: (states: MCPServerState[]) => void;
  serverAdded: (config: MCPServerConfig) => void;
  serverRemoved: (serverId: string) => void;
  serverConnected: (serverId: string) => void;
  serverDisconnected: (serverId: string, reason?: string) => void;
  serverError: (serverId: string, error: Error) => void;
  toolsChanged: (serverId: string, tools: MCPTool[]) => void;
}

// Singleton instance
let mcpManagerInstance: MCPManager | null = null;

export class MCPManager extends EventEmitter {
  private settingsStore: SettingsStore;
  private connections = new Map<string, MCPServerConnection>();
  private settings: MCPSettings;
  private isInitialized = false;

  constructor(settingsStore: SettingsStore) {
    super();
    this.settingsStore = settingsStore;
    this.settings = this.loadSettings();
  }

  /**
   * Initialize the MCP manager
   * Auto-connects to enabled servers with autoConnect flag
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    logger.info('Initializing MCP Manager', {
      enabled: this.settings.enabled,
      serverCount: this.settings.servers.length,
    });

    if (!this.settings.enabled) {
      this.isInitialized = true;
      return;
    }

    // Create connections for all registered servers
    for (const serverConfig of this.settings.servers) {
      this.createConnection(serverConfig);
    }

    // Auto-connect enabled servers
    const autoConnectServers = this.settings.servers.filter(s => s.enabled && s.autoConnect);
    
    await Promise.allSettled(
      autoConnectServers.map(async (config) => {
        const connection = this.connections.get(config.id);
        if (connection) {
          try {
            await connection.connect();
          } catch (error) {
            logger.warn('Auto-connect failed', {
              serverId: config.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      })
    );

    this.isInitialized = true;
    logger.info('MCP Manager initialized');
  }

  /**
   * Shutdown all connections
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down MCP Manager');

    await Promise.allSettled(
      Array.from(this.connections.values()).map(conn => conn.disconnect())
    );

    this.connections.clear();
    this.isInitialized = false;
  }

  // =========================================================================
  // Server Management
  // =========================================================================

  /**
   * Add a new MCP server
   */
  async addServer(request: MCPAddServerRequest): Promise<MCPServerConfig> {
    const config: MCPServerConfig = {
      id: randomUUID(),
      name: request.name,
      description: request.description,
      transport: request.transport,
      enabled: true,
      autoConnect: request.autoConnect ?? true,
      icon: request.icon,
      tags: request.tags,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Add to settings
    this.settings.servers.push(config);
    this.saveSettings();

    // Create connection
    this.createConnection(config);

    // Auto-connect if enabled
    if (config.enabled && config.autoConnect && this.settings.enabled) {
      const connection = this.connections.get(config.id);
      if (connection) {
        connection.connect().catch((error) => {
          logger.warn('Auto-connect failed for new server', {
            serverId: config.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
    }

    logger.info('MCP server added', { serverId: config.id, name: config.name });
    this.emit('serverAdded', config);
    this.emitStateChanged();

    return config;
  }

  /**
   * Update an existing MCP server
   */
  async updateServer(request: MCPUpdateServerRequest): Promise<MCPServerConfig | null> {
    const index = this.settings.servers.findIndex(s => s.id === request.id);
    if (index === -1) {
      return null;
    }

    const existingConfig = this.settings.servers[index];
    const newConfig: MCPServerConfig = {
      ...existingConfig,
      ...request.updates,
      id: existingConfig.id, // Preserve ID
      createdAt: existingConfig.createdAt, // Preserve creation time
      updatedAt: Date.now(),
    };

    // Check if transport changed (requires reconnect)
    const transportChanged = JSON.stringify(existingConfig.transport) !== JSON.stringify(newConfig.transport);

    // Update settings
    this.settings.servers[index] = newConfig;
    this.saveSettings();

    // Update connection
    const connection = this.connections.get(request.id);
    if (connection) {
      if (transportChanged) {
        // Disconnect and recreate connection
        await connection.disconnect();
        this.connections.delete(request.id);
        this.createConnection(newConfig);

        // Reconnect if was enabled
        if (newConfig.enabled && newConfig.autoConnect) {
          const newConnection = this.connections.get(request.id);
          newConnection?.connect().catch(() => {});
        }
      } else {
        connection.updateConfig(newConfig);
      }
    }

    logger.info('MCP server updated', { serverId: request.id });
    this.emitStateChanged();

    return newConfig;
  }

  /**
   * Remove an MCP server
   */
  async removeServer(serverId: string): Promise<boolean> {
    const index = this.settings.servers.findIndex(s => s.id === serverId);
    if (index === -1) {
      return false;
    }

    // Disconnect if connected
    const connection = this.connections.get(serverId);
    if (connection) {
      await connection.disconnect();
      this.connections.delete(serverId);
    }

    // Remove from settings
    this.settings.servers.splice(index, 1);
    this.saveSettings();

    logger.info('MCP server removed', { serverId });
    this.emit('serverRemoved', serverId);
    this.emitStateChanged();

    return true;
  }

  /**
   * Get all server configurations
   */
  getServers(): MCPServerConfig[] {
    return [...this.settings.servers];
  }

  /**
   * Get server configuration by ID
   */
  getServer(serverId: string): MCPServerConfig | undefined {
    return this.settings.servers.find(s => s.id === serverId);
  }

  // =========================================================================
  // Connection Management
  // =========================================================================

  /**
   * Connect to a specific server
   */
  async connectServer(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      throw new Error(`Server not found: ${serverId}`);
    }

    await connection.connect();
  }

  /**
   * Disconnect from a specific server
   */
  async disconnectServer(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      throw new Error(`Server not found: ${serverId}`);
    }

    await connection.disconnect();
  }

  /**
   * Get connection state for all servers
   */
  getServerStates(): MCPServerState[] {
    return Array.from(this.connections.values()).map(conn => conn.getState());
  }

  /**
   * Get connection state for a specific server
   */
  getServerState(serverId: string): MCPServerState | undefined {
    return this.connections.get(serverId)?.getState();
  }

  // =========================================================================
  // Tool Operations
  // =========================================================================

  /**
   * Get all tools from all connected servers
   */
  getAllTools(): Array<MCPTool & { serverId: string; serverName: string }> {
    const tools: Array<MCPTool & { serverId: string; serverName: string }> = [];

    for (const connection of this.connections.values()) {
      const state = connection.getState();
      if (state.status === 'connected') {
        for (const tool of state.tools) {
          tools.push({
            ...tool,
            serverId: state.config.id,
            serverName: state.config.name,
          });
        }
      }
    }

    return tools;
  }

  /**
   * Get tools from a specific server
   */
  getServerTools(serverId: string): MCPTool[] {
    const connection = this.connections.get(serverId);
    if (!connection) {
      return [];
    }

    const state = connection.getState();
    return state.status === 'connected' ? state.tools : [];
  }

  /**
   * Call a tool on a specific server
   */
  async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      throw new Error(`Server not found: ${serverId}`);
    }

    return connection.callTool(toolName, args);
  }

  // =========================================================================
  // Resource Operations
  // =========================================================================

  /**
   * Get all resources from all connected servers
   */
  getAllResources(): Array<MCPResource & { serverId: string; serverName: string }> {
    const resources: Array<MCPResource & { serverId: string; serverName: string }> = [];

    for (const connection of this.connections.values()) {
      const state = connection.getState();
      if (state.status === 'connected') {
        for (const resource of state.resources) {
          resources.push({
            ...resource,
            serverId: state.config.id,
            serverName: state.config.name,
          });
        }
      }
    }

    return resources;
  }

  /**
   * Read a resource from a specific server
   */
  async readResource(serverId: string, uri: string): Promise<MCPResourceContent[]> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      throw new Error(`Server not found: ${serverId}`);
    }

    return connection.readResource(uri);
  }

  // =========================================================================
  // Prompt Operations
  // =========================================================================

  /**
   * Get all prompts from all connected servers
   */
  getAllPrompts(): Array<MCPPrompt & { serverId: string; serverName: string }> {
    const prompts: Array<MCPPrompt & { serverId: string; serverName: string }> = [];

    for (const connection of this.connections.values()) {
      const state = connection.getState();
      if (state.status === 'connected') {
        for (const prompt of state.prompts) {
          prompts.push({
            ...prompt,
            serverId: state.config.id,
            serverName: state.config.name,
          });
        }
      }
    }

    return prompts;
  }

  /**
   * Get a prompt from a specific server
   */
  async getPrompt(serverId: string, name: string, args?: Record<string, unknown>): Promise<MCPPromptResult> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      throw new Error(`Server not found: ${serverId}`);
    }

    return connection.getPrompt(name, args);
  }

  // =========================================================================
  // Settings
  // =========================================================================

  /**
   * Get MCP settings
   */
  getSettings(): MCPSettings {
    return { ...this.settings };
  }

  /**
   * Update MCP settings
   */
  async updateSettings(updates: Partial<MCPSettings>): Promise<void> {
    const wasEnabled = this.settings.enabled;
    
    this.settings = { ...this.settings, ...updates };
    this.saveSettings();

    // Handle enable/disable
    if (!wasEnabled && this.settings.enabled) {
      // MCP was enabled - initialize and auto-connect
      await this.initialize();
    } else if (wasEnabled && !this.settings.enabled) {
      // MCP was disabled - disconnect all
      await Promise.allSettled(
        Array.from(this.connections.values()).map(conn => conn.disconnect())
      );
    }

    this.emitStateChanged();
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private loadSettings(): MCPSettings {
    const agentSettings = this.settingsStore.get();
    return agentSettings.mcpSettings ?? { ...DEFAULT_MCP_SETTINGS };
  }

  private saveSettings(): void {
    this.settingsStore.update({ mcpSettings: this.settings });
  }

  private createConnection(config: MCPServerConfig): void {
    const connection = new MCPServerConnection(config);

    // Set up event handlers
    connection.on('connected', () => {
      logger.info('Server connected', { serverId: config.id });
      this.emit('serverConnected', config.id);
      this.emitStateChanged();
    });

    connection.on('disconnected', (reason) => {
      logger.info('Server disconnected', { serverId: config.id, reason });
      this.emit('serverDisconnected', config.id, reason);
      this.emitStateChanged();
    });

    connection.on('error', (error) => {
      logger.error('Server error', { serverId: config.id, error: error.message });
      this.emit('serverError', config.id, error);
      this.emitStateChanged();
    });

    connection.on('toolsChanged', (tools) => {
      this.emit('toolsChanged', config.id, tools);
      this.emitStateChanged();
    });

    connection.on('stateChanged', () => {
      this.emitStateChanged();
    });

    this.connections.set(config.id, connection);
  }

  private emitStateChanged(): void {
    this.emit('stateChanged', this.getServerStates());
  }
}

// =========================================================================
// Singleton Access
// =========================================================================

/**
 * Get the MCP manager instance
 */
export function getMCPManager(): MCPManager | null {
  return mcpManagerInstance;
}

/**
 * Initialize the MCP manager singleton
 */
export async function initMCPManager(settingsStore: SettingsStore): Promise<MCPManager> {
  if (mcpManagerInstance) {
    return mcpManagerInstance;
  }

  mcpManagerInstance = new MCPManager(settingsStore);
  await mcpManagerInstance.initialize();

  return mcpManagerInstance;
}

/**
 * Shutdown the MCP manager singleton
 */
export async function shutdownMCPManager(): Promise<void> {
  if (mcpManagerInstance) {
    await mcpManagerInstance.shutdown();
    mcpManagerInstance = null;
  }
}
