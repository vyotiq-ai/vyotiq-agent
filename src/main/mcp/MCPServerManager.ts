/**
 * MCP Server Manager
 *
 * Manages MCP server lifecycle, connections, and state.
 * Handles connecting/disconnecting servers, tool discovery, and event propagation.
 *
 * @module main/mcp/MCPServerManager
 */

import { EventEmitter } from 'events';
import { createLogger } from '../logger';
import { MCPClient } from './MCPClient';
import { DEFAULT_MCP_SETTINGS } from '../../shared/types/mcp';
import type {
  MCPServerConfig,
  MCPServerState,
  MCPServerStatus,
  MCPServerSummary,
  MCPToolDefinition,
  MCPResourceDefinition,
  MCPPromptDefinition,
  MCPToolCallRequest,
  MCPToolCallResult,
  MCPToolWithContext,
  MCPSettings,
  MCPEvent,
} from '../../shared/types/mcp';

const logger = createLogger('MCPServerManager');

// =============================================================================
// Types
// =============================================================================

export interface MCPServerManagerEvents {
  'server:status-changed': (serverId: string, status: MCPServerStatus, error?: string) => void;
  'server:tools-changed': (serverId: string, tools: MCPToolDefinition[]) => void;
  'server:resources-changed': (serverId: string, resources: MCPResourceDefinition[]) => void;
  'server:prompts-changed': (serverId: string, prompts: MCPPromptDefinition[]) => void;
  'tools:updated': (allTools: MCPToolWithContext[]) => void;
  'event': (event: MCPEvent) => void;
}

interface ManagedServer {
  config: MCPServerConfig;
  client: MCPClient | null;
  state: MCPServerState;
  retryCount: number;
  retryTimeout: NodeJS.Timeout | null;
}

// =============================================================================
// MCP Server Manager Implementation
// =============================================================================

export class MCPServerManager extends EventEmitter {
  private servers = new Map<string, ManagedServer>();
  private settings: MCPSettings;
  private toolCallCache = new Map<string, { result: MCPToolCallResult; timestamp: number }>();
  private static readonly MAX_CACHE_SIZE = 500;
  private static readonly CACHE_TTL_MS = 60000; // 1 minute

  constructor(settings?: Partial<MCPSettings>) {
    super();
    this.settings = { ...DEFAULT_MCP_SETTINGS, ...settings };
  }

  // ---------------------------------------------------------------------------
  // Settings Management
  // ---------------------------------------------------------------------------

  updateSettings(settings: Partial<MCPSettings>): void {
    this.settings = { ...this.settings, ...settings };
    logger.info('MCP settings updated', { settings: this.settings });
  }

  getSettings(): MCPSettings {
    return { ...this.settings };
  }

  // ---------------------------------------------------------------------------
  // Server Registration
  // ---------------------------------------------------------------------------

  registerServer(config: MCPServerConfig): void {
    // Validate required fields before registration
    if (!config.id || typeof config.id !== 'string') {
      logger.error('Cannot register MCP server: missing or invalid id', { config });
      throw new Error('MCP server config must have a valid "id" string');
    }
    if (!config.name || typeof config.name !== 'string') {
      logger.error('Cannot register MCP server: missing or invalid name', { id: config.id });
      throw new Error('MCP server config must have a valid "name" string');
    }
    if (!config.transport) {
      logger.error('Cannot register MCP server: missing transport config', { id: config.id });
      throw new Error('MCP server config must have a "transport" configuration');
    }

    if (this.servers.has(config.id)) {
      // Silently update config when server already registered (common during settings reload)
      logger.debug('Server already registered, updating config', { serverId: config.id });
      this.updateServerConfig(config);
      return;
    }

    const managed: ManagedServer = {
      config,
      client: null,
      state: {
        configId: config.id,
        status: config.enabled ? 'disconnected' : 'disabled',
        tools: [],
        resources: [],
        prompts: [],
        stats: {
          totalCalls: 0,
          successfulCalls: 0,
          failedCalls: 0,
          averageLatencyMs: 0,
        },
      },
      retryCount: 0,
      retryTimeout: null,
    };

    this.servers.set(config.id, managed);
    logger.info('Server registered', { serverId: config.id, name: config.name });

    // Auto-connect if enabled and auto-start
    if (config.enabled && config.autoStart && this.settings.autoStartServers) {
      this.connectServer(config.id).catch((err) => {
        logger.error('Auto-connect failed', { serverId: config.id, error: err.message });
      });
    }
  }

  unregisterServer(serverId: string): void {
    const managed = this.servers.get(serverId);
    if (!managed) {
      logger.warn('Server not found for unregister', { serverId });
      return;
    }

    // Disconnect if connected
    if (managed.client) {
      managed.client.disconnect().catch((err) => {
        logger.error('Disconnect failed during unregister', { serverId, error: err.message });
      });
    }

    // Clear retry timeout
    if (managed.retryTimeout) {
      clearTimeout(managed.retryTimeout);
    }

    this.servers.delete(serverId);
    this.emitToolsUpdated();
    logger.info('Server unregistered', { serverId });
  }

  updateServerConfig(config: MCPServerConfig): void {
    const managed = this.servers.get(config.id);
    if (!managed) {
      // If not registered, register it
      this.registerServer(config);
      return;
    }

    const wasEnabled = managed.config.enabled;
    managed.config = config;

    // Handle enable/disable state change
    if (config.enabled && !wasEnabled) {
      managed.state.status = 'disconnected';
      if (config.autoStart && this.settings.autoStartServers) {
        this.connectServer(config.id).catch((err) => {
          logger.error('Connect failed after enable', { serverId: config.id, error: err.message });
        });
      }
    } else if (!config.enabled && wasEnabled) {
      this.disconnectServer(config.id).catch((err) => {
        logger.error('Disconnect failed after disable', { serverId: config.id, error: err.message });
      });
      managed.state.status = 'disabled';
    }

    logger.info('Server config updated', { serverId: config.id });
  }

  // ---------------------------------------------------------------------------
  // Connection Management
  // ---------------------------------------------------------------------------

  async connectServer(serverId: string): Promise<void> {
    const managed = this.servers.get(serverId);
    if (!managed) {
      throw new Error(`Server not found: ${serverId}`);
    }

    if (!managed.config.enabled) {
      throw new Error(`Server is disabled: ${serverId}`);
    }

    if (managed.state.status === 'connected') {
      logger.debug('Server already connected', { serverId });
      return;
    }

    // Check concurrent connection limit
    const connectedCount = Array.from(this.servers.values()).filter(
      (s) => s.state.status === 'connected'
    ).length;
    if (connectedCount >= this.settings.maxConcurrentConnections) {
      throw new Error('Maximum concurrent connections reached');
    }

    this.updateServerStatus(serverId, 'connecting');

    try {
      // Create new client
      const client = new MCPClient(managed.config.transport, {
        connectionTimeoutMs: this.settings.connectionTimeoutMs,
        requestTimeoutMs: this.settings.toolTimeoutMs,
      });

      // Set up event handlers
      this.setupClientEventHandlers(serverId, client);

      // Connect
      await client.connect();

      // Update state
      managed.client = client;
      managed.state.protocolVersion = client.protocolVersion || undefined;
      managed.state.serverInfo = client.serverInfo || undefined;
      managed.state.capabilities = client.capabilities || undefined;
      managed.state.tools = client.tools;
      managed.state.resources = client.resources;
      managed.state.prompts = client.prompts;
      managed.state.connectedAt = Date.now();
      managed.retryCount = 0;

      this.updateServerStatus(serverId, 'connected');
      this.emitToolsUpdated();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.updateServerStatus(serverId, 'error', err.message);

      // Schedule retry if enabled
      if (this.settings.retryFailedConnections && managed.retryCount < this.settings.retryCount) {
        managed.retryCount++;
        managed.retryTimeout = setTimeout(() => {
          logger.info('Retrying connection', {
            serverId,
            attempt: managed.retryCount,
            maxAttempts: this.settings.retryCount,
          });
          this.connectServer(serverId).catch((e) => {
            logger.error('Retry failed', { serverId, error: e.message });
          });
        }, this.settings.retryDelayMs * managed.retryCount);
      }

      throw error;
    }
  }

  async disconnectServer(serverId: string): Promise<void> {
    const managed = this.servers.get(serverId);
    if (!managed) {
      throw new Error(`Server not found: ${serverId}`);
    }

    // Clear retry timeout
    if (managed.retryTimeout) {
      clearTimeout(managed.retryTimeout);
      managed.retryTimeout = null;
    }

    if (!managed.client) {
      managed.state.status = managed.config.enabled ? 'disconnected' : 'disabled';
      return;
    }

    await managed.client.disconnect();
    managed.client = null;
    managed.state.tools = [];
    managed.state.resources = [];
    managed.state.prompts = [];
    managed.state.connectedAt = undefined;

    this.updateServerStatus(serverId, managed.config.enabled ? 'disconnected' : 'disabled');
    this.emitToolsUpdated();
  }

  async restartServer(serverId: string): Promise<void> {
    await this.disconnectServer(serverId);
    await this.connectServer(serverId);
  }

  private setupClientEventHandlers(serverId: string, client: MCPClient): void {
    client.on('disconnected', (reason) => {
      const managed = this.servers.get(serverId);
      if (managed) {
        managed.client = null;
        managed.state.tools = [];
        managed.state.resources = [];
        managed.state.prompts = [];
        this.updateServerStatus(serverId, 'disconnected');
        this.emitToolsUpdated();

        // Auto-reconnect if the server is still enabled and the disconnect was unexpected
        // Don't reconnect if explicitly disabled or unregistered
        if (
          managed.config.enabled &&
          managed.config.autoStart &&
          this.settings.retryFailedConnections &&
          managed.retryCount < this.settings.retryCount
        ) {
          managed.retryCount++;
          const delay = this.settings.retryDelayMs * managed.retryCount;
          logger.info('Scheduling auto-reconnect after unexpected disconnect', {
            serverId,
            reason,
            attempt: managed.retryCount,
            maxAttempts: this.settings.retryCount,
            delayMs: delay,
          });
          managed.retryTimeout = setTimeout(() => {
            // Double-check server is still registered and enabled before reconnecting
            const current = this.servers.get(serverId);
            if (current && current.config.enabled && !current.client) {
              this.connectServer(serverId).catch((err) => {
                logger.error('Auto-reconnect failed', { serverId, error: err.message });
              });
            }
          }, delay);
        }
      }
      logger.info('Server disconnected', { serverId, reason });
    });

    client.on('error', (error) => {
      logger.error('Server client error', { serverId, error: error.message });
      this.updateServerStatus(serverId, 'error', error.message);
    });

    client.on('toolsChanged', (tools) => {
      const managed = this.servers.get(serverId);
      if (managed) {
        managed.state.tools = tools;
        this.emit('server:tools-changed', serverId, tools);
        this.emitToolsUpdated();
      }
    });

    client.on('resourcesChanged', (resources) => {
      const managed = this.servers.get(serverId);
      if (managed) {
        managed.state.resources = resources;
        this.emit('server:resources-changed', serverId, resources);
      }
    });

    client.on('promptsChanged', (prompts) => {
      const managed = this.servers.get(serverId);
      if (managed) {
        managed.state.prompts = prompts;
        this.emit('server:prompts-changed', serverId, prompts);
      }
    });

    client.on('log', (level, message, data) => {
      if (this.settings.debugLogging) {
        logger.debug('Server log', { serverId, level, message, data });
      }
    });
  }

  private updateServerStatus(serverId: string, status: MCPServerStatus, error?: string): void {
    const managed = this.servers.get(serverId);
    if (!managed) return;

    managed.state.status = status;
    managed.state.error = error;
    managed.state.lastActivityAt = Date.now();

    this.emit('server:status-changed', serverId, status, error);
    this.emit('event', {
      type: 'mcp:server-status-changed',
      serverId,
      status,
      error,
    });
  }

  // ---------------------------------------------------------------------------
  // Tool Execution
  // ---------------------------------------------------------------------------

  async callTool(request: MCPToolCallRequest): Promise<MCPToolCallResult> {
    const managed = this.servers.get(request.serverId);
    if (!managed) {
      return {
        success: false,
        error: `Server not found: ${request.serverId}`,
        durationMs: 0,
      };
    }

    if (!managed.client || managed.state.status !== 'connected') {
      return {
        success: false,
        error: `Server not connected: ${request.serverId}`,
        durationMs: 0,
      };
    }

    // Check cache
    if (this.settings.cacheToolResults) {
      const cacheKey = this.getCacheKey(request);
      const cached = this.toolCallCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.settings.cacheTtlMs) {
        return { ...cached.result, cached: true };
      }
    }

    // Execute tool
    const result = await managed.client.callTool(
      request.toolName,
      request.arguments,
      request.timeoutMs ?? this.settings.toolTimeoutMs
    );

    // Update stats
    managed.state.stats.totalCalls++;
    if (result.success) {
      managed.state.stats.successfulCalls++;
    } else {
      managed.state.stats.failedCalls++;
    }
    managed.state.stats.averageLatencyMs =
      (managed.state.stats.averageLatencyMs * (managed.state.stats.totalCalls - 1) +
        result.durationMs) /
      managed.state.stats.totalCalls;
    managed.state.lastActivityAt = Date.now();

    // Cache successful results with size limit and TTL
    if (result.success && this.settings.cacheToolResults) {
      const cacheKey = this.getCacheKey(request);
      
      // Evict expired entries and enforce size limit
      this.pruneCache();
      
      this.toolCallCache.set(cacheKey, { result, timestamp: Date.now() });
    }

    // Emit event
    this.emit('event', {
      type: 'mcp:tool-executed',
      serverId: request.serverId,
      toolName: request.toolName,
      success: result.success,
      durationMs: result.durationMs,
      error: result.error,
    });

    return result;
  }

  private getCacheKey(request: MCPToolCallRequest): string {
    return `${request.serverId}:${request.toolName}:${JSON.stringify(request.arguments)}`;
  }

  /**
   * Prune expired cache entries and enforce size limit
   */
  private pruneCache(): void {
    const now = Date.now();
    
    // Remove expired entries first
    for (const [key, entry] of this.toolCallCache) {
      if (now - entry.timestamp > MCPServerManager.CACHE_TTL_MS) {
        this.toolCallCache.delete(key);
      }
    }
    
    // If still over limit, remove oldest entries (LRU-style)
    if (this.toolCallCache.size >= MCPServerManager.MAX_CACHE_SIZE) {
      const sortedEntries = Array.from(this.toolCallCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      // Remove oldest 25% of entries
      const toRemove = Math.ceil(sortedEntries.length * 0.25);
      for (let i = 0; i < toRemove; i++) {
        this.toolCallCache.delete(sortedEntries[i][0]);
      }
    }
  }

  clearCache(): void {
    this.toolCallCache.clear();
  }

  // ---------------------------------------------------------------------------
  // Server Queries
  // ---------------------------------------------------------------------------

  getServer(serverId: string): MCPServerConfig | undefined {
    return this.servers.get(serverId)?.config;
  }

  getServerState(serverId: string): MCPServerState | undefined {
    return this.servers.get(serverId)?.state;
  }

  getAllServers(): MCPServerConfig[] {
    return Array.from(this.servers.values()).map((m) => m.config);
  }

  getAllServerStates(): MCPServerState[] {
    return Array.from(this.servers.values()).map((m) => m.state);
  }

  getServerSummaries(): MCPServerSummary[] {
    return Array.from(this.servers.values()).map((m) => ({
      id: m.config.id,
      name: m.config.name,
      description: m.config.description,
      icon: m.config.icon,
      category: m.config.category,
      status: m.state.status,
      enabled: m.config.enabled,
      toolCount: m.state.tools.length,
      resourceCount: m.state.resources.length,
      promptCount: m.state.prompts.length,
      source: m.config.source,
      sourceId: m.config.sourceId,
      lastActivity: m.state.lastActivityAt,
    }));
  }

  getConnectedServers(): MCPServerConfig[] {
    return Array.from(this.servers.values())
      .filter((m) => m.state.status === 'connected')
      .map((m) => m.config);
  }

  // ---------------------------------------------------------------------------
  // Tool Queries
  // ---------------------------------------------------------------------------

  getAllTools(): MCPToolWithContext[] {
    const tools: MCPToolWithContext[] = [];
    for (const managed of this.servers.values()) {
      if (managed.state.status === 'connected') {
        for (const tool of managed.state.tools) {
          tools.push({
            serverId: managed.config.id,
            serverName: managed.config.name,
            tool,
          });
        }
      }
    }
    return tools;
  }

  getServerTools(serverId: string): MCPToolDefinition[] {
    return this.servers.get(serverId)?.state.tools || [];
  }

  findTool(toolName: string): MCPToolWithContext | undefined {
    // Check for server-prefixed tool name (e.g., "server-id:tool-name")
    if (toolName.includes(':')) {
      const [serverId, actualToolName] = toolName.split(':', 2);
      const managed = this.servers.get(serverId);
      if (managed?.state.status === 'connected') {
        const tool = managed.state.tools.find((t) => t.name === actualToolName);
        if (tool) {
          return {
            serverId: managed.config.id,
            serverName: managed.config.name,
            tool,
          };
        }
      }
    }

    // Search across all connected servers
    for (const managed of this.servers.values()) {
      if (managed.state.status === 'connected') {
        const tool = managed.state.tools.find((t) => t.name === toolName);
        if (tool) {
          return {
            serverId: managed.config.id,
            serverName: managed.config.name,
            tool,
          };
        }
      }
    }

    return undefined;
  }

  private emitToolsUpdated(): void {
    this.emit('tools:updated', this.getAllTools());
  }

  // ---------------------------------------------------------------------------
  // Resource Queries
  // ---------------------------------------------------------------------------

  getAllResources(): Array<MCPResourceDefinition & { serverId: string }> {
    const resources: Array<MCPResourceDefinition & { serverId: string }> = [];
    for (const managed of this.servers.values()) {
      if (managed.state.status === 'connected') {
        for (const resource of managed.state.resources) {
          resources.push({ ...resource, serverId: managed.config.id });
        }
      }
    }
    return resources;
  }

  async readResource(
    serverId: string,
    uri: string
  ): Promise<{
    success: boolean;
    contents?: Array<{
      uri: string;
      mimeType?: string;
      text?: string;
      blob?: string;
    }>;
    error?: string;
  }> {
    const managed = this.servers.get(serverId);
    if (!managed?.client || managed.state.status !== 'connected') {
      return { success: false, error: 'Server not connected' };
    }
    return managed.client.readResource(uri);
  }

  // ---------------------------------------------------------------------------
  // Prompt Queries
  // ---------------------------------------------------------------------------

  getAllPrompts(): Array<MCPPromptDefinition & { serverId: string }> {
    const prompts: Array<MCPPromptDefinition & { serverId: string }> = [];
    for (const managed of this.servers.values()) {
      if (managed.state.status === 'connected') {
        for (const prompt of managed.state.prompts) {
          prompts.push({ ...prompt, serverId: managed.config.id });
        }
      }
    }
    return prompts;
  }

  async getPrompt(
    serverId: string,
    promptName: string,
    args?: Record<string, string>
  ): Promise<{
    success: boolean;
    description?: string;
    messages?: Array<{
      role: 'user' | 'assistant';
      content: { type: string; text?: string }[];
    }>;
    error?: string;
  }> {
    const managed = this.servers.get(serverId);
    if (!managed?.client || managed.state.status !== 'connected') {
      return { success: false, error: 'Server not connected' };
    }
    return managed.client.getPrompt(promptName, args);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle Management
  // ---------------------------------------------------------------------------

  async connectAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const managed of this.servers.values()) {
      if (managed.config.enabled && managed.config.autoStart) {
        promises.push(
          this.connectServer(managed.config.id).catch((err) => {
            logger.error('Failed to connect server', {
              serverId: managed.config.id,
              error: err.message,
            });
          })
        );
      }
    }
    await Promise.all(promises);
  }

  async disconnectAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const managed of this.servers.values()) {
      if (managed.client) {
        promises.push(
          this.disconnectServer(managed.config.id).catch((err) => {
            logger.error('Failed to disconnect server', {
              serverId: managed.config.id,
              error: err.message,
            });
          })
        );
      }
    }
    await Promise.all(promises);
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down MCP Server Manager');
    await this.disconnectAll();
    this.servers.clear();
    this.toolCallCache.clear();
    this.removeAllListeners();
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

let instance: MCPServerManager | null = null;

export function getMCPServerManager(): MCPServerManager {
  if (!instance) {
    instance = new MCPServerManager();
  }
  return instance;
}

export function initializeMCPServerManager(settings?: Partial<MCPSettings>): MCPServerManager {
  if (instance) {
    instance.updateSettings(settings || {});
    return instance;
  }
  instance = new MCPServerManager(settings);
  return instance;
}

export function shutdownMCPServerManager(): Promise<void> {
  if (!instance) return Promise.resolve();
  const manager = instance;
  instance = null;
  return manager.shutdown();
}
