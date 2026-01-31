/**
 * MCP Client
 *
 * Handles JSON-RPC 2.0 communication with MCP servers.
 * Supports STDIO, SSE, and Streamable HTTP transports.
 *
 * @module main/mcp/MCPClient
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { createLogger } from '../logger';
import type {
  MCPTransportConfig,
  MCPServerCapabilities,
  MCPToolDefinition,
  MCPResourceDefinition,
  MCPPromptDefinition,
  MCPToolCallResult,
} from '../../shared/types/mcp';

const logger = createLogger('MCPClient');

// =============================================================================
// JSON-RPC Types
// =============================================================================

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

// =============================================================================
// MCP Protocol Types
// =============================================================================

interface MCPInitializeResult {
  protocolVersion: string;
  serverInfo: {
    name: string;
    version: string;
  };
  capabilities: MCPServerCapabilities;
}

interface MCPToolsListResult {
  tools: MCPToolDefinition[];
  nextCursor?: string;
}

interface MCPResourcesListResult {
  resources: MCPResourceDefinition[];
  nextCursor?: string;
}

interface MCPPromptsListResult {
  prompts: MCPPromptDefinition[];
  nextCursor?: string;
}

interface MCPToolCallResultRaw {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
    uri?: string;
  }>;
  isError?: boolean;
}

// =============================================================================
// MCP Client Events
// =============================================================================

export interface MCPClientEvents {
  connected: () => void;
  disconnected: (reason?: string) => void;
  error: (error: Error) => void;
  toolsChanged: (tools: MCPToolDefinition[]) => void;
  resourcesChanged: (resources: MCPResourceDefinition[]) => void;
  promptsChanged: (prompts: MCPPromptDefinition[]) => void;
  log: (level: string, message: string, data?: unknown) => void;
}

// =============================================================================
// MCP Client Implementation
// =============================================================================

/**
 * SSE reconnection configuration
 */
interface SSEReconnectConfig {
  enabled: boolean;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_SSE_RECONNECT_CONFIG: SSEReconnectConfig = {
  enabled: true,
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

export class MCPClient extends EventEmitter {
  private transport: MCPTransportConfig;
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<
    number | string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();
  private inputBuffer = '';
  private _connected = false;
  private _protocolVersion: string | null = null;
  private _serverInfo: { name: string; version: string } | null = null;
  private _capabilities: MCPServerCapabilities | null = null;
  private _tools: MCPToolDefinition[] = [];
  private _resources: MCPResourceDefinition[] = [];
  private _prompts: MCPPromptDefinition[] = [];
  private connectionTimeout: number;
  private requestTimeout: number;

  // SSE/HTTP transport state
  private sseEventSource: EventSource | null = null;
  private httpEndpoint: string | null = null;
  private sessionId: string | null = null;
  private abortController: AbortController | null = null;

  // SSE reconnection state
  private sseReconnectConfig: SSEReconnectConfig;
  private sseReconnectAttempts = 0;
  private sseReconnectTimer: NodeJS.Timeout | null = null;
  private sseIntentionalDisconnect = false;

  constructor(
    transport: MCPTransportConfig,
    options: {
      connectionTimeoutMs?: number;
      requestTimeoutMs?: number;
      sseReconnect?: Partial<SSEReconnectConfig>;
    } = {}
  ) {
    super();
    this.transport = transport;
    this.connectionTimeout = options.connectionTimeoutMs ?? 30000;
    this.requestTimeout = options.requestTimeoutMs ?? 60000;
    this.sseReconnectConfig = { ...DEFAULT_SSE_RECONNECT_CONFIG, ...options.sseReconnect };
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  get connected(): boolean {
    return this._connected;
  }

  get protocolVersion(): string | null {
    return this._protocolVersion;
  }

  get serverInfo(): { name: string; version: string } | null {
    return this._serverInfo;
  }

  get capabilities(): MCPServerCapabilities | null {
    return this._capabilities;
  }

  get tools(): MCPToolDefinition[] {
    return this._tools;
  }

  get resources(): MCPResourceDefinition[] {
    return this._resources;
  }

  get prompts(): MCPPromptDefinition[] {
    return this._prompts;
  }

  // ---------------------------------------------------------------------------
  // Connection Management
  // ---------------------------------------------------------------------------

  async connect(): Promise<void> {
    if (this._connected) {
      logger.warn('Already connected');
      return;
    }

    logger.info('Connecting to MCP server', { transport: this.transport.type });
    
    // Reset reconnection state for fresh connection
    this.sseIntentionalDisconnect = false;
    this.sseReconnectAttempts = 0;
    if (this.sseReconnectTimer) {
      clearTimeout(this.sseReconnectTimer);
      this.sseReconnectTimer = null;
    }

    try {
      switch (this.transport.type) {
        case 'stdio':
          await this.connectStdio();
          break;
        case 'sse':
          await this.connectSSE();
          break;
        case 'streamable-http':
          await this.connectStreamableHTTP();
          break;
        default:
          throw new Error(`Unknown transport type`);
      }

      // Initialize the MCP protocol
      await this.initialize();

      // Fetch initial capabilities
      await this.refreshTools();
      await this.refreshResources();
      await this.refreshPrompts();

      this._connected = true;
      this.emit('connected');
      logger.info('Connected to MCP server', {
        serverInfo: this._serverInfo,
        protocolVersion: this._protocolVersion,
        toolCount: this._tools.length,
        resourceCount: this._resources.length,
        promptCount: this._prompts.length,
      });
    } catch (error) {
      this._connected = false;
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to connect to MCP server', { error: err.message });
      this.emit('error', err);
      throw err;
    }
  }

  private async connectStdio(): Promise<void> {
    if (this.transport.type !== 'stdio') {
      throw new Error('Not a STDIO transport');
    }

    const { command, args = [], env = {}, cwd } = this.transport;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
        this.disconnect();
      }, this.connectionTimeout);

      try {
        this.process = spawn(command, args, {
          cwd: cwd || process.cwd(),
          env: { ...process.env, ...env },
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: process.platform === 'win32',
        });

        this.process.on('error', (err) => {
          clearTimeout(timeout);
          reject(new Error(`Failed to spawn process: ${err.message}`));
        });

        this.process.on('exit', (code, signal) => {
          this._connected = false;
          this.emit('disconnected', `Process exited with code ${code}, signal ${signal}`);
          this.cleanup();
        });

        this.process.stdout?.on('data', (data: Buffer) => {
          this.handleStdioData(data);
        });

        this.process.stderr?.on('data', (data: Buffer) => {
          const message = data.toString();
          logger.debug('MCP stderr', { message });
          this.emit('log', 'debug', message);
        });

        // Give the process a moment to start
        setTimeout(() => {
          clearTimeout(timeout);
          if (this.process && !this.process.killed) {
            resolve();
          } else {
            reject(new Error('Process failed to start'));
          }
        }, 100);
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  /**
   * Connect using Server-Sent Events (SSE) transport.
   * The server exposes an SSE endpoint for receiving messages and
   * a separate HTTP endpoint for sending requests.
   */
  private async connectSSE(): Promise<void> {
    if (this.transport.type !== 'sse') {
      throw new Error('Not an SSE transport');
    }

    const { url, headers = {} } = this.transport;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('SSE connection timeout'));
        this.disconnect();
      }, this.connectionTimeout);

      try {
        // Create EventSource for receiving server messages
        // Note: In Node.js, we need to use a polyfill or native fetch-based SSE
        this.abortController = new AbortController();
        
        // Start SSE connection using fetch (Node.js compatible)
        this.startSSEConnection(url, headers)
          .then(() => {
            clearTimeout(timeout);
            resolve();
          })
          .catch((err) => {
            clearTimeout(timeout);
            reject(err);
          });
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  /**
   * Start SSE connection using fetch API (Node.js compatible).
   */
  private async startSSEConnection(url: string, headers: Record<string, string>): Promise<void> {
    this.abortController = new AbortController();

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...headers,
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('SSE response has no body');
      }

      // Extract the endpoint URL from headers or response
      const endpointHeader = response.headers.get('X-MCP-Endpoint');
      if (endpointHeader) {
        this.httpEndpoint = endpointHeader;
      } else {
        // Default to replacing /sse with /message in the URL
        this.httpEndpoint = url.replace(/\/sse\/?$/, '/message');
      }

      // Extract session ID if provided
      const sessionHeader = response.headers.get('X-MCP-Session-ID');
      if (sessionHeader) {
        this.sessionId = sessionHeader;
      }

      logger.info('SSE connection established', { 
        endpoint: this.httpEndpoint, 
        sessionId: this.sessionId 
      });

      // Start reading the SSE stream
      this.readSSEStream(response.body);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.info('SSE connection aborted');
        return;
      }
      throw error;
    }
  }

  /**
   * Read and parse SSE stream data.
   */
  private async readSSEStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventType = 'message';
    let eventData = '';
    let streamEnded = false;

    try {
      while (!streamEnded) {
        const { done, value } = await reader.read();
        
        if (done) {
          this._connected = false;
          this.emit('disconnected', 'SSE stream ended');
          streamEnded = true;
          // Attempt reconnection if not intentional
          if (!this.sseIntentionalDisconnect) {
            this.scheduleSSEReconnect('Stream ended unexpectedly');
          }
          continue;
        }

        // Reset reconnect attempts on successful data
        this.sseReconnectAttempts = 0;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            eventData += line.slice(5).trim();
          } else if (line === '') {
            // End of event
            if (eventData) {
              this.handleSSEEvent(eventType, eventData);
              eventType = 'message';
              eventData = '';
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      logger.error('SSE stream error', { error });
      this._connected = false;
      this.emit('disconnected', `SSE stream error: ${error}`);
      // Attempt reconnection on error if not intentional
      if (!this.sseIntentionalDisconnect) {
        this.scheduleSSEReconnect(error instanceof Error ? error.message : 'Unknown error');
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Schedule SSE reconnection with exponential backoff.
   */
  private scheduleSSEReconnect(reason: string): void {
    if (!this.sseReconnectConfig.enabled) {
      logger.info('SSE reconnection disabled', { reason });
      return;
    }

    if (this.sseReconnectAttempts >= this.sseReconnectConfig.maxAttempts) {
      logger.error('SSE reconnection failed - max attempts reached', {
        attempts: this.sseReconnectAttempts,
        maxAttempts: this.sseReconnectConfig.maxAttempts,
        reason,
      });
      this.emit('error', new Error(`SSE connection failed after ${this.sseReconnectAttempts} attempts: ${reason}`));
      return;
    }

    // Clear any existing timer
    if (this.sseReconnectTimer) {
      clearTimeout(this.sseReconnectTimer);
    }

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.sseReconnectConfig.baseDelayMs * Math.pow(this.sseReconnectConfig.backoffMultiplier, this.sseReconnectAttempts),
      this.sseReconnectConfig.maxDelayMs
    );

    this.sseReconnectAttempts++;

    logger.info('Scheduling SSE reconnection', {
      attempt: this.sseReconnectAttempts,
      maxAttempts: this.sseReconnectConfig.maxAttempts,
      delayMs: delay,
      reason,
    });

    this.sseReconnectTimer = setTimeout(async () => {
      try {
        await this.reconnectSSE();
      } catch (error) {
        logger.error('SSE reconnection attempt failed', {
          attempt: this.sseReconnectAttempts,
          error: error instanceof Error ? error.message : String(error),
        });
        // Schedule next attempt
        this.scheduleSSEReconnect(error instanceof Error ? error.message : 'Reconnection failed');
      }
    }, delay);
  }

  /**
   * Attempt to reconnect SSE transport.
   */
  private async reconnectSSE(): Promise<void> {
    if (this.transport.type !== 'sse') {
      return;
    }

    logger.info('Attempting SSE reconnection', { attempt: this.sseReconnectAttempts });

    // Cancel any existing connection
    if (this.abortController) {
      this.abortController.abort();
    }

    // Reconnect
    await this.connectSSE();

    // If successful, re-initialize to refresh tools/resources
    if (this._connected) {
      logger.info('SSE reconnection successful, re-initializing');
      this.sseReconnectAttempts = 0;
      
      // Refresh tools and resources
      try {
        await this.refreshCapabilities();
      } catch (error) {
        logger.warn('Failed to refresh capabilities after reconnect', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Refresh server capabilities (tools, resources, prompts) after reconnection.
   */
  private async refreshCapabilities(): Promise<void> {
    if (this._capabilities?.tools) {
      const tools = await this.refreshTools();
      if (JSON.stringify(tools) !== JSON.stringify(this._tools)) {
        this._tools = tools;
        this.emit('toolsChanged', tools);
      }
    }

    if (this._capabilities?.resources) {
      const resources = await this.refreshResources();
      if (JSON.stringify(resources) !== JSON.stringify(this._resources)) {
        this._resources = resources;
        this.emit('resourcesChanged', resources);
      }
    }

    if (this._capabilities?.prompts) {
      const prompts = await this.refreshPrompts();
      if (JSON.stringify(prompts) !== JSON.stringify(this._prompts)) {
        this._prompts = prompts;
        this.emit('promptsChanged', prompts);
      }
    }
  }

  /**
   * Handle an SSE event.
   */
  private handleSSEEvent(eventType: string, data: string): void {
    try {
      if (eventType === 'endpoint') {
        // Server is providing the endpoint URL for sending requests
        const parsed = JSON.parse(data);
        if (parsed.endpoint) {
          this.httpEndpoint = parsed.endpoint;
        }
        if (parsed.sessionId) {
          this.sessionId = parsed.sessionId;
        }
        logger.info('SSE endpoint received', { endpoint: this.httpEndpoint, sessionId: this.sessionId });
        return;
      }

      const message = JSON.parse(data);
      this.handleMessage(message);
    } catch (err) {
      logger.warn('Failed to parse SSE event', { eventType, data, error: err });
    }
  }

  /**
   * Connect using Streamable HTTP transport.
   * This transport uses a single HTTP endpoint that supports both
   * request/response and server-initiated messages via streaming.
   */
  private async connectStreamableHTTP(): Promise<void> {
    if (this.transport.type !== 'streamable-http') {
      throw new Error('Not a streamable-http transport');
    }

    const { url, headers = {} } = this.transport;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Streamable HTTP connection timeout'));
        this.disconnect();
      }, this.connectionTimeout);

      try {
        this.httpEndpoint = url;
        this.abortController = new AbortController();

        // For streamable-http, we establish the connection during initialize
        // Just validate the endpoint is accessible
        this.validateHTTPEndpoint(url, headers)
          .then(() => {
            clearTimeout(timeout);
            resolve();
          })
          .catch((err) => {
            clearTimeout(timeout);
            reject(err);
          });
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  /**
   * Validate that the HTTP endpoint is accessible.
   */
  private async validateHTTPEndpoint(url: string, headers: Record<string, string>): Promise<void> {
    try {
      // Send an OPTIONS or HEAD request to validate the endpoint
      const response = await fetch(url, {
        method: 'OPTIONS',
        headers: {
          ...headers,
          'Accept': 'application/json',
        },
        signal: this.abortController?.signal,
      });

      // Accept various success responses
      if (!response.ok && response.status !== 405) {
        throw new Error(`HTTP endpoint validation failed: ${response.status} ${response.statusText}`);
      }

      logger.info('Streamable HTTP endpoint validated', { url });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      // If OPTIONS fails, try a simple POST with empty body as fallback validation
      try {
        const fallbackResponse = await fetch(url, {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 0 }),
          signal: this.abortController?.signal,
        });
        
        // Any response means the endpoint exists
        if (fallbackResponse.status < 500) {
          logger.info('Streamable HTTP endpoint validated via POST', { url });
          return;
        }
      } catch {
        // Ignore fallback errors
      }
      throw error;
    }
  }

  private handleStdioData(data: Buffer): void {
    this.inputBuffer += data.toString();

    // Process complete JSON-RPC messages (newline delimited)
    const lines = this.inputBuffer.split('\n');
    this.inputBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const message = JSON.parse(trimmed);
        this.handleMessage(message);
      } catch (err) {
        logger.warn('Failed to parse JSON-RPC message', { line: trimmed, error: err });
      }
    }
  }

  private handleMessage(message: JSONRPCResponse | JSONRPCNotification): void {
    // Check if it's a response (has id)
    if ('id' in message && message.id !== null) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.id);

        if (message.error) {
          pending.reject(
            new Error(`${message.error.code}: ${message.error.message}`)
          );
        } else {
          pending.resolve(message.result);
        }
      }
    } else {
      // It's a notification
      this.handleNotification(message as JSONRPCNotification);
    }
  }

  private handleNotification(notification: JSONRPCNotification): void {
    logger.debug('Received notification', { method: notification.method });

    switch (notification.method) {
      case 'notifications/tools/list_changed':
        this.refreshTools().catch((err) => {
          logger.error('Failed to refresh tools after notification', { error: err });
        });
        break;
      case 'notifications/resources/list_changed':
        this.refreshResources().catch((err) => {
          logger.error('Failed to refresh resources after notification', { error: err });
        });
        break;
      case 'notifications/prompts/list_changed':
        this.refreshPrompts().catch((err) => {
          logger.error('Failed to refresh prompts after notification', { error: err });
        });
        break;
      case 'notifications/message': {
        const params = notification.params as {
          level: string;
          logger?: string;
          data?: unknown;
        };
        this.emit('log', params.level, params.logger || 'server', params.data);
        break;
      }
      default:
        logger.debug('Unhandled notification', { method: notification.method });
    }
  }

  async disconnect(): Promise<void> {
    if (!this._connected && !this.process && !this.httpEndpoint) {
      return;
    }

    logger.info('Disconnecting from MCP server');
    
    // Mark as intentional disconnect to prevent reconnection
    this.sseIntentionalDisconnect = true;
    
    // Clear any pending reconnect timer
    if (this.sseReconnectTimer) {
      clearTimeout(this.sseReconnectTimer);
      this.sseReconnectTimer = null;
    }
    
    this._connected = false;

    // Clean up pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Client disconnected'));
      this.pendingRequests.delete(id);
    }

    // Clean up based on transport type
    if (this.process) {
      // STDIO: Kill the process
      this.process.kill('SIGTERM');

      // Force kill after timeout
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
    }

    // SSE/HTTP: Abort any ongoing connections
    if (this.abortController) {
      this.abortController.abort();
    }

    this.cleanup();
    this.emit('disconnected');
  }

  private cleanup(): void {
    // Clean up STDIO resources
    this.process = null;
    this.inputBuffer = '';
    
    // Clean up SSE/HTTP resources
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.sseEventSource = null;
    this.httpEndpoint = null;
    this.sessionId = null;
    
    // Reset state
    this._protocolVersion = null;
    this._serverInfo = null;
    this._capabilities = null;
    this._tools = [];
    this._resources = [];
    this._prompts = [];
  }

  // ---------------------------------------------------------------------------
  // JSON-RPC Communication
  // ---------------------------------------------------------------------------

  private async sendRequest<T>(
    method: string,
    params?: unknown,
    timeoutMs?: number
  ): Promise<T> {
    // Route to appropriate transport
    switch (this.transport.type) {
      case 'stdio':
        return this.sendRequestStdio(method, params, timeoutMs);
      case 'sse':
      case 'streamable-http':
        return this.sendRequestHTTP(method, params, timeoutMs);
      default:
        throw new Error(`Unknown transport type`);
    }
  }

  private async sendRequestStdio<T>(
    method: string,
    params?: unknown,
    timeoutMs?: number
  ): Promise<T> {
    if (!this.process || this.process.killed) {
      throw new Error('Not connected');
    }

    const id = ++this.requestId;
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout for ${method}`));
      }, timeoutMs ?? this.requestTimeout);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

      const data = JSON.stringify(request) + '\n';
      this.process!.stdin!.write(data, (err) => {
        if (err) {
          clearTimeout(timeout);
          this.pendingRequests.delete(id);
          reject(new Error(`Failed to send request: ${err.message}`));
        }
      });
    });
  }

  private async sendRequestHTTP<T>(
    method: string,
    params?: unknown,
    timeoutMs?: number
  ): Promise<T> {
    if (!this.httpEndpoint) {
      throw new Error('HTTP endpoint not configured');
    }

    const id = ++this.requestId;
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // Add session ID if available
    if (this.sessionId) {
      headers['X-MCP-Session-ID'] = this.sessionId;
    }

    // Add custom headers from transport config
    if ('headers' in this.transport && this.transport.headers) {
      Object.assign(headers, this.transport.headers);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs ?? this.requestTimeout);

    try {
      const response = await fetch(this.httpEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP request failed: ${response.status} ${response.statusText}`);
      }

      // Check if response is streaming (for streamable-http)
      const contentType = response.headers.get('Content-Type') || '';
      
      if (contentType.includes('text/event-stream')) {
        // Handle streaming response
        return this.handleStreamingResponse<T>(response, id);
      }

      // Standard JSON response
      const result = await response.json() as JSONRPCResponse;

      // Update session ID if returned
      const newSessionId = response.headers.get('X-MCP-Session-ID');
      if (newSessionId) {
        this.sessionId = newSessionId;
      }

      if (result.error) {
        throw new Error(`${result.error.code}: ${result.error.message}`);
      }

      return result.result as T;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout for ${method}`);
      }
      throw error;
    }
  }

  /**
   * Handle a streaming HTTP response (for streamable-http transport).
   */
  private async handleStreamingResponse<T>(response: Response, requestId: number): Promise<T> {
    if (!response.body) {
      throw new Error('Streaming response has no body');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Streaming response timeout'));
      }, this.requestTimeout);

      this.pendingRequests.set(requestId, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timeout,
      });

      // Read the streaming response
      this.readSSEStream(response.body!).catch((err) => {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(err);
      });
    });
  }

  private async sendNotification(method: string, params?: unknown): Promise<void> {
    // Route to appropriate transport
    switch (this.transport.type) {
      case 'stdio':
        return this.sendNotificationStdio(method, params);
      case 'sse':
      case 'streamable-http':
        return this.sendNotificationHTTP(method, params);
      default:
        throw new Error(`Unknown transport type`);
    }
  }

  private async sendNotificationStdio(method: string, params?: unknown): Promise<void> {
    if (!this.process || this.process.killed) {
      throw new Error('Not connected');
    }

    const notification: JSONRPCNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const data = JSON.stringify(notification) + '\n';
    return new Promise((resolve, reject) => {
      this.process!.stdin!.write(data, (err) => {
        if (err) {
          reject(new Error(`Failed to send notification: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  private async sendNotificationHTTP(method: string, params?: unknown): Promise<void> {
    if (!this.httpEndpoint) {
      throw new Error('HTTP endpoint not configured');
    }

    const notification: JSONRPCNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add session ID if available
    if (this.sessionId) {
      headers['X-MCP-Session-ID'] = this.sessionId;
    }

    // Add custom headers from transport config
    if ('headers' in this.transport && this.transport.headers) {
      Object.assign(headers, this.transport.headers);
    }

    try {
      const response = await fetch(this.httpEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(notification),
      });

      // Notifications don't expect a response, but we check for errors
      if (!response.ok && response.status >= 500) {
        logger.warn('Notification may have failed', { 
          method, 
          status: response.status 
        });
      }
    } catch (error) {
      logger.warn('Failed to send HTTP notification', { method, error });
      // Notifications are fire-and-forget, so we don't throw
    }
  }

  // ---------------------------------------------------------------------------
  // MCP Protocol Methods
  // ---------------------------------------------------------------------------

  private async initialize(): Promise<void> {
    const result = await this.sendRequest<MCPInitializeResult>('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {
        roots: {
          listChanged: true,
        },
        sampling: {},
        elicitation: {},
      },
      clientInfo: {
        name: 'vyotiq-agent',
        version: '1.0.0',
      },
    });

    this._protocolVersion = result.protocolVersion;
    this._serverInfo = result.serverInfo;
    this._capabilities = result.capabilities;

    // Send initialized notification
    await this.sendNotification('notifications/initialized');
  }

  async refreshTools(): Promise<MCPToolDefinition[]> {
    if (!this._capabilities?.tools) {
      this._tools = [];
      return this._tools;
    }

    const allTools: MCPToolDefinition[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.sendRequest<MCPToolsListResult>('tools/list', {
        cursor,
      });
      allTools.push(...result.tools);
      cursor = result.nextCursor;
    } while (cursor);

    this._tools = allTools;
    this.emit('toolsChanged', this._tools);
    return this._tools;
  }

  async refreshResources(): Promise<MCPResourceDefinition[]> {
    if (!this._capabilities?.resources) {
      this._resources = [];
      return this._resources;
    }

    const allResources: MCPResourceDefinition[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.sendRequest<MCPResourcesListResult>('resources/list', {
        cursor,
      });
      allResources.push(...result.resources);
      cursor = result.nextCursor;
    } while (cursor);

    this._resources = allResources;
    this.emit('resourcesChanged', this._resources);
    return this._resources;
  }

  async refreshPrompts(): Promise<MCPPromptDefinition[]> {
    if (!this._capabilities?.prompts) {
      this._prompts = [];
      return this._prompts;
    }

    const allPrompts: MCPPromptDefinition[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.sendRequest<MCPPromptsListResult>('prompts/list', {
        cursor,
      });
      allPrompts.push(...result.prompts);
      cursor = result.nextCursor;
    } while (cursor);

    this._prompts = allPrompts;
    this.emit('promptsChanged', this._prompts);
    return this._prompts;
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs?: number
  ): Promise<MCPToolCallResult> {
    const startTime = Date.now();

    try {
      const result = await this.sendRequest<MCPToolCallResultRaw>(
        'tools/call',
        {
          name: toolName,
          arguments: args,
        },
        timeoutMs
      );

      const durationMs = Date.now() - startTime;

      if (result.isError) {
        return {
          success: false,
          error: result.content
            .filter((c) => c.type === 'text')
            .map((c) => c.text)
            .join('\n'),
          durationMs,
        };
      }

      return {
        success: true,
        content: result.content,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs,
      };
    }
  }

  async readResource(uri: string): Promise<{
    success: boolean;
    contents?: Array<{
      uri: string;
      mimeType?: string;
      text?: string;
      blob?: string;
    }>;
    error?: string;
  }> {
    try {
      const result = await this.sendRequest<{
        contents: Array<{
          uri: string;
          mimeType?: string;
          text?: string;
          blob?: string;
        }>;
      }>('resources/read', { uri });

      return {
        success: true,
        contents: result.contents,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getPrompt(
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
    try {
      const result = await this.sendRequest<{
        description?: string;
        messages: Array<{
          role: 'user' | 'assistant';
          content: { type: string; text?: string }[];
        }>;
      }>('prompts/get', { name: promptName, arguments: args });

      return {
        success: true,
        description: result.description,
        messages: result.messages,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------

  getTool(name: string): MCPToolDefinition | undefined {
    return this._tools.find((t) => t.name === name);
  }

  getResource(uri: string): MCPResourceDefinition | undefined {
    return this._resources.find((r) => r.uri === uri);
  }

  getPromptDef(name: string): MCPPromptDefinition | undefined {
    return this._prompts.find((p) => p.name === name);
  }
}
