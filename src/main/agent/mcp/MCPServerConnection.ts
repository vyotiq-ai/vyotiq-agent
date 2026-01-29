/**
 * MCP Server Connection
 * 
 * Manages a single MCP server connection including:
 * - Transport lifecycle (connect/disconnect)
 * - Protocol initialization
 * - Resource, prompt, and tool discovery
 * - Notification handling
 * - Automatic reconnection
 */

import { EventEmitter } from 'node:events';
import type {
  MCPServerConfig,
  MCPServerState,
  MCPServerCapabilities,
  MCPServerInfo,
  MCPTool,
  MCPPrompt,
  MCPResource,
  MCPResourceTemplate,
  MCPResourceContent,
  MCPPromptResult,
  MCPToolResult,
  MCPConnectionStatus,
} from '../../../shared/types/mcp';
import { MCPStdioTransport } from './transports/MCPStdioTransport';
import { MCPHttpTransport } from './transports/MCPHttpTransport';
import type { MCPTransport, MCPTransportEvents } from './transports/types';
import { createLogger } from '../../logger';

const logger = createLogger('MCPServerConnection');

/**
 * Client info sent during initialization
 */
const CLIENT_INFO = {
  name: 'vyotiq-agent',
  title: 'Vyotiq Agent',
  version: '1.0.0',
};

/**
 * Client capabilities
 */
const CLIENT_CAPABILITIES = {
  roots: {
    listChanged: true,
  },
  // We don't support sampling or elicitation yet
};

/**
 * Connection events
 */
export interface MCPConnectionEvents {
  connected: (serverInfo: MCPServerInfo, capabilities: MCPServerCapabilities) => void;
  disconnected: (reason?: string) => void;
  error: (error: Error) => void;
  toolsChanged: (tools: MCPTool[]) => void;
  resourcesChanged: (resources: MCPResource[]) => void;
  resourceUpdated: (uri: string) => void;
  promptsChanged: (prompts: MCPPrompt[]) => void;
  stateChanged: (state: MCPServerState) => void;
}

export class MCPServerConnection extends EventEmitter {
  private config: MCPServerConfig;
  private transport: MCPTransport | null = null;
  private state: MCPServerState;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isReconnecting = false;

  constructor(config: MCPServerConfig) {
    super();
    this.config = config;
    this.state = this.createInitialState();
  }

  /**
   * Get current connection state
   */
  getState(): MCPServerState {
    return { ...this.state };
  }

  /**
   * Get server configuration
   */
  getConfig(): MCPServerConfig {
    return { ...this.config };
  }

  /**
   * Update server configuration (requires reconnect for transport changes)
   */
  updateConfig(updates: Partial<MCPServerConfig>): void {
    this.config = { ...this.config, ...updates, updatedAt: Date.now() };
    this.state = { ...this.state, config: this.config };
    this.emitStateChanged();
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    if (this.state.status === 'connected' || this.state.status === 'connecting') {
      logger.debug('Already connected or connecting', { serverId: this.config.id });
      return;
    }

    this.updateStatus('connecting');

    try {
      // Create transport based on config
      this.transport = this.createTransport();

      // Set up event handlers
      this.setupTransportEvents();

      // Connect transport
      await this.transport.connect();

      // Initialize the protocol
      this.updateStatus('initializing');
      const initResult = await this.transport.initialize(CLIENT_INFO, CLIENT_CAPABILITIES);

      // Store server info and capabilities
      const now = Date.now();
      this.state = {
        ...this.state,
        serverInfo: initResult.serverInfo,
        capabilities: initResult.capabilities,
        connectedAt: now,
        lastConnectedAt: now,
      };

      // Discover available features
      await this.discoverFeatures();

      // Mark as connected
      this.updateStatus('connected');
      this.reconnectAttempts = 0;

      logger.info('MCP server connected', {
        serverId: this.config.id,
        serverName: initResult.serverInfo.name,
        toolCount: this.state.tools.length,
        resourceCount: this.state.resources.length,
        promptCount: this.state.prompts.length,
      });

      this.emit('connected', initResult.serverInfo, initResult.capabilities);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to connect to MCP server', {
        serverId: this.config.id,
        error: errorMessage,
      });
      
      this.updateStatus('error', errorMessage);
      this.emit('error', error instanceof Error ? error : new Error(errorMessage));

      // Attempt reconnection if enabled
      if (this.config.autoConnect && this.config.maxReconnectAttempts) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    // Cancel any pending reconnection
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.isReconnecting = false;

    if (!this.transport) {
      this.updateStatus('disconnected');
      return;
    }

    try {
      await this.transport.disconnect();
    } catch (error) {
      logger.warn('Error during disconnect', { 
        serverId: this.config.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.transport = null;
    this.updateStatus('disconnected');
    this.emit('disconnected', 'Manual disconnect');
  }

  /**
   * List available tools
   */
  async listTools(): Promise<MCPTool[]> {
    return this.state.tools;
  }

  /**
   * Call a tool
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    if (!this.transport || this.state.status !== 'connected') {
      throw new Error('Not connected to MCP server');
    }

    logger.debug('Calling MCP tool', { serverId: this.config.id, toolName: name });

    try {
      const result = await this.transport.request<MCPToolResult>('tools/call', {
        name,
        arguments: args,
      });

      // Update metrics
      if (this.state.metrics) {
        this.state.metrics.toolCallCount++;
      }

      return result;
    } catch (error) {
      if (this.state.metrics) {
        this.state.metrics.errorCount++;
      }
      throw error;
    }
  }

  /**
   * List available resources
   */
  async listResources(): Promise<MCPResource[]> {
    return this.state.resources;
  }

  /**
   * List resource templates
   */
  async listResourceTemplates(): Promise<MCPResourceTemplate[]> {
    return this.state.resourceTemplates;
  }

  /**
   * Read a resource
   */
  async readResource(uri: string): Promise<MCPResourceContent[]> {
    if (!this.transport || this.state.status !== 'connected') {
      throw new Error('Not connected to MCP server');
    }

    logger.debug('Reading MCP resource', { serverId: this.config.id, uri });

    try {
      const result = await this.transport.request<{ contents: MCPResourceContent[] }>('resources/read', {
        uri,
      });

      // Update metrics
      if (this.state.metrics) {
        this.state.metrics.resourceReadCount++;
      }

      return result.contents;
    } catch (error) {
      if (this.state.metrics) {
        this.state.metrics.errorCount++;
      }
      throw error;
    }
  }

  /**
   * Subscribe to resource updates
   */
  async subscribeResource(uri: string): Promise<void> {
    if (!this.transport || this.state.status !== 'connected') {
      throw new Error('Not connected to MCP server');
    }

    if (!this.state.capabilities?.resources?.subscribe) {
      throw new Error('Server does not support resource subscriptions');
    }

    await this.transport.request('resources/subscribe', { uri });
  }

  /**
   * List available prompts
   */
  async listPrompts(): Promise<MCPPrompt[]> {
    return this.state.prompts;
  }

  /**
   * Get a prompt with arguments
   */
  async getPrompt(name: string, args?: Record<string, unknown>): Promise<MCPPromptResult> {
    if (!this.transport || this.state.status !== 'connected') {
      throw new Error('Not connected to MCP server');
    }

    logger.debug('Getting MCP prompt', { serverId: this.config.id, promptName: name });

    try {
      const result = await this.transport.request<MCPPromptResult>('prompts/get', {
        name,
        arguments: args,
      });

      // Update metrics
      if (this.state.metrics) {
        this.state.metrics.promptGetCount++;
      }

      return result;
    } catch (error) {
      if (this.state.metrics) {
        this.state.metrics.errorCount++;
      }
      throw error;
    }
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private createInitialState(): MCPServerState {
    return {
      config: this.config,
      status: 'disconnected',
      prompts: [],
      resources: [],
      resourceTemplates: [],
      tools: [],
      metrics: {
        toolCallCount: 0,
        resourceReadCount: 0,
        promptGetCount: 0,
        errorCount: 0,
      },
    };
  }

  private createTransport(): MCPTransport {
    const timeout = this.config.timeout ?? 30000;

    if (this.config.transport.type === 'stdio') {
      return new MCPStdioTransport(this.config.transport, timeout);
    } else {
      return new MCPHttpTransport(this.config.transport, timeout);
    }
  }

  private setupTransportEvents(): void {
    if (!this.transport) return;

    const handlers: MCPTransportEvents = {
      onConnect: () => {
        logger.debug('Transport connected', { serverId: this.config.id });
      },
      onDisconnect: (reason) => {
        logger.info('Transport disconnected', { serverId: this.config.id, reason });
        this.handleDisconnect(reason);
      },
      onError: (error) => {
        logger.error('Transport error', { serverId: this.config.id, error: error.message });
        this.emit('error', error);
      },
      onNotification: (method, params) => {
        this.handleNotification(method, params);
      },
    };

    this.transport.setEventHandlers(handlers);
  }

  private async discoverFeatures(): Promise<void> {
    if (!this.transport) return;

    const capabilities = this.state.capabilities ?? {};

    // Discover tools
    if (capabilities.tools) {
      try {
        const result = await this.transport.request<{ tools: MCPTool[] }>('tools/list');
        this.state.tools = result.tools ?? [];
      } catch (error) {
        logger.warn('Failed to list tools', { 
          serverId: this.config.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Discover resources
    if (capabilities.resources) {
      try {
        const result = await this.transport.request<{ resources: MCPResource[] }>('resources/list');
        this.state.resources = result.resources ?? [];
      } catch (error) {
        logger.warn('Failed to list resources', { 
          serverId: this.config.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Also list templates
      try {
        const result = await this.transport.request<{ resourceTemplates: MCPResourceTemplate[] }>('resources/templates/list');
        this.state.resourceTemplates = result.resourceTemplates ?? [];
      } catch (error) {
        logger.debug('Failed to list resource templates', { 
          serverId: this.config.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Discover prompts
    if (capabilities.prompts) {
      try {
        const result = await this.transport.request<{ prompts: MCPPrompt[] }>('prompts/list');
        this.state.prompts = result.prompts ?? [];
      } catch (error) {
        logger.warn('Failed to list prompts', { 
          serverId: this.config.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private handleNotification(method: string, params?: Record<string, unknown>): void {
    logger.debug('Received notification', { serverId: this.config.id, method, params });

    switch (method) {
      case 'notifications/tools/list_changed':
        this.refreshTools();
        break;
      case 'notifications/resources/list_changed':
        this.refreshResources();
        break;
      case 'notifications/prompts/list_changed':
        this.refreshPrompts();
        break;
      case 'notifications/resources/updated':
        // Resource content changed - emit event for subscribers
        if (params?.uri) {
          logger.info('Resource updated', { serverId: this.config.id, uri: params.uri });
          this.emit('resourceUpdated', params.uri);
        }
        break;
    }
  }

  private async refreshTools(): Promise<void> {
    if (!this.transport || this.state.status !== 'connected') return;

    try {
      const result = await this.transport.request<{ tools: MCPTool[] }>('tools/list');
      this.state.tools = result.tools ?? [];
      this.emit('toolsChanged', this.state.tools);
      this.emitStateChanged();
    } catch (error) {
      logger.warn('Failed to refresh tools', { 
        serverId: this.config.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async refreshResources(): Promise<void> {
    if (!this.transport || this.state.status !== 'connected') return;

    try {
      const result = await this.transport.request<{ resources: MCPResource[] }>('resources/list');
      this.state.resources = result.resources ?? [];
      this.emit('resourcesChanged', this.state.resources);
      this.emitStateChanged();
    } catch (error) {
      logger.warn('Failed to refresh resources', { 
        serverId: this.config.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async refreshPrompts(): Promise<void> {
    if (!this.transport || this.state.status !== 'connected') return;

    try {
      const result = await this.transport.request<{ prompts: MCPPrompt[] }>('prompts/list');
      this.state.prompts = result.prompts ?? [];
      this.emit('promptsChanged', this.state.prompts);
      this.emitStateChanged();
    } catch (error) {
      logger.warn('Failed to refresh prompts', { 
        serverId: this.config.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private handleDisconnect(reason?: string): void {
    this.transport = null;

    if (this.state.status === 'disconnected') {
      return; // Already handled
    }

    this.updateStatus('disconnected', reason);
    this.emit('disconnected', reason);

    // Attempt reconnection if this was unexpected
    if (!this.isReconnecting && this.config.autoConnect) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    const maxAttempts = this.config.maxReconnectAttempts ?? 5;

    if (this.reconnectAttempts >= maxAttempts) {
      logger.warn('Max reconnection attempts reached', { 
        serverId: this.config.id,
        attempts: this.reconnectAttempts,
      });
      return;
    }

    this.reconnectAttempts++;
    this.isReconnecting = true;
    this.updateStatus('reconnecting');

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);

    logger.info('Scheduling reconnection', { 
      serverId: this.config.id,
      attempt: this.reconnectAttempts,
      delayMs: delay,
    });

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
        this.isReconnecting = false;
      } catch {
        // connect() handles its own errors and may schedule another reconnect
      }
    }, delay);
  }

  private updateStatus(status: MCPConnectionStatus, error?: string): void {
    this.state = {
      ...this.state,
      status,
      error: status === 'error' ? error : undefined,
      // Clear connectedAt when disconnected or errored
      connectedAt: status === 'connected' ? this.state.connectedAt : undefined,
    };
    this.emitStateChanged();
  }

  private emitStateChanged(): void {
    this.emit('stateChanged', this.getState());
  }
}
