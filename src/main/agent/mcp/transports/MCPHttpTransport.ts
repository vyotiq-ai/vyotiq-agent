/**
 * MCP HTTP Transport Implementation
 * 
 * Implements the Streamable HTTP transport for MCP servers.
 * Uses HTTP POST for requests and Server-Sent Events (SSE) for server messages.
 * 
 * @see https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http
 */

import type { MCPHttpConfig, MCPClientInfo, MCPClientCapabilities, MCPServerCapabilities, MCPServerInfo } from '../../../../shared/types/mcp';
import type { MCPTransport, MCPTransportEvents, JsonRpcRequest, JsonRpcResponse, MCPMessage } from './types';
import { MCP_PROTOCOL_VERSION } from './types';
import { createLogger } from '../../../logger';

const logger = createLogger('MCPHttpTransport');

/**
 * Pending request tracker
 */
interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
  method: string;
}

export class MCPHttpTransport implements MCPTransport {
  readonly type = 'http' as const;
  
  private config: MCPHttpConfig;
  private sessionId: string | null = null;
  private protocolVersion: string = MCP_PROTOCOL_VERSION;
  private pendingRequests = new Map<string | number, PendingRequest>();
  private eventHandlers: MCPTransportEvents = {};
  private nextRequestId = 1;
  private timeout: number;
  private sseController: AbortController | null = null;
  private _isConnected = false;

  constructor(config: MCPHttpConfig, timeout = 30000) {
    this.config = config;
    this.timeout = timeout;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  setEventHandlers(handlers: MCPTransportEvents): void {
    this.eventHandlers = handlers;
  }

  async connect(): Promise<void> {
    if (this._isConnected) {
      return;
    }

    logger.info('Connecting to MCP server via HTTP', { url: this.config.url });

    // For HTTP transport, we just verify the endpoint is reachable
    // The actual session is established during initialize()
    try {
      // Simple connectivity check
      const connectResponse = await fetch(this.config.url, {
        method: 'HEAD',
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(5000),
      }).catch((): null => null);

      // Log the connectivity check result
      if (connectResponse) {
        logger.debug('Server reachable', { status: connectResponse.status });
      } else {
        logger.debug('HEAD check failed, will attempt connection anyway');
      }

      // Even if HEAD fails, we consider it connected and let initialize handle errors
      this._isConnected = true;
      this.eventHandlers.onConnect?.();
    } catch (error) {
      logger.error('Failed to connect to MCP server', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this._isConnected) {
      return;
    }

    logger.info('Disconnecting from MCP server');

    // Cancel all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('Transport disconnected'));
      this.pendingRequests.delete(id);
    }

    // Close SSE connection
    if (this.sseController) {
      this.sseController.abort();
      this.sseController = null;
    }

    // Send session termination if we have a session
    if (this.sessionId) {
      try {
        await fetch(this.config.url, {
          method: 'DELETE',
          headers: {
            ...this.getHeaders(),
            'Mcp-Session-Id': this.sessionId,
          },
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        // Ignore errors on disconnect
      }
      this.sessionId = null;
    }

    this._isConnected = false;
    this.eventHandlers.onDisconnect?.('Manual disconnect');
  }

  async request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this._isConnected) {
      throw new Error('Transport not connected');
    }

    const id = this.nextRequestId++;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    logger.debug('Sending MCP HTTP request', { id, method });

    const headers: Record<string, string> = {
      ...this.getHeaders(),
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };

    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
      headers['MCP-Protocol-Version'] = this.protocolVersion;
    }

    const response = await fetch(this.config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.timeout),
    });

    // Check for session ID in response headers
    const newSessionId = response.headers.get('Mcp-Session-Id');
    if (newSessionId && !this.sessionId) {
      this.sessionId = newSessionId;
      logger.info('MCP session established', { sessionId: this.sessionId });
    }

    const contentType = response.headers.get('Content-Type') ?? '';

    if (contentType.includes('text/event-stream')) {
      // Handle SSE response
      return this.handleSSEResponse<T>(response, id);
    } else if (contentType.includes('application/json')) {
      // Handle JSON response
      const jsonResponse = await response.json() as JsonRpcResponse;
      
      if (jsonResponse.error) {
        throw new Error(`MCP Error ${jsonResponse.error.code}: ${jsonResponse.error.message}`);
      }

      return jsonResponse.result as T;
    } else {
      throw new Error(`Unexpected content type: ${contentType}`);
    }
  }

  async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    if (!this._isConnected) {
      throw new Error('Transport not connected');
    }

    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const headers: Record<string, string> = {
      ...this.getHeaders(),
      'Content-Type': 'application/json',
    };

    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
      headers['MCP-Protocol-Version'] = this.protocolVersion;
    }

    const response = await fetch(this.config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(notification),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok && response.status !== 202) {
      throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }
  }

  async initialize(
    clientInfo: MCPClientInfo,
    clientCapabilities: MCPClientCapabilities
  ): Promise<{
    protocolVersion: string;
    capabilities: MCPServerCapabilities;
    serverInfo: MCPServerInfo;
    instructions?: string;
  }> {
    // Send initialize request
    const result = await this.request<{
      protocolVersion: string;
      capabilities: MCPServerCapabilities;
      serverInfo: MCPServerInfo;
      instructions?: string;
    }>('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: clientCapabilities,
      clientInfo,
    });

    // Store negotiated protocol version
    this.protocolVersion = result.protocolVersion;

    // Send initialized notification
    await this.notify('notifications/initialized');

    // Optionally start SSE listener for server-initiated messages
    this.startSSEListener();

    return result;
  }

  private getHeaders(): Record<string, string> {
    return {
      ...this.config.headers,
    };
  }

  private async handleSSEResponse<T>(response: Response, requestId: number): Promise<T> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let result: T | undefined;
    let hasResult = false;

    try {
      let done = false;
      while (!done) {
        const readResult = await reader.read();
        done = readResult.done;
        if (done) break;

        buffer += decoder.decode(readResult.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const message = JSON.parse(data) as MCPMessage;
              
              // Forward to event handlers
              this.eventHandlers.onMessage?.(message);

              // Check if this is the response to our request
              if ('id' in message && message.id === requestId) {
                const jsonRpcResponse = message as JsonRpcResponse;
                if (jsonRpcResponse.error) {
                  throw new Error(`MCP Error ${jsonRpcResponse.error.code}: ${jsonRpcResponse.error.message}`);
                }
                result = jsonRpcResponse.result as T;
                hasResult = true;
              } else if ('method' in message && !('id' in message)) {
                // Notification from server
                this.eventHandlers.onNotification?.(message.method, message.params);
              }
            } catch (parseError) {
              // Skip invalid JSON but log it
              if (parseError instanceof SyntaxError) {
                logger.debug('Skipping invalid JSON in SSE', { data });
              } else {
                throw parseError;
              }
            }
          }
        }
      }

      if (hasResult) {
        return result!;
      } else {
        throw new Error('No response received in SSE stream');
      }
    } finally {
      reader.releaseLock();
    }
  }

  private startSSEListener(): void {
    // Start a background SSE listener for server-initiated messages
    this.sseController = new AbortController();

    const headers: Record<string, string> = {
      ...this.getHeaders(),
      'Accept': 'text/event-stream',
    };

    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }

    // Don't await - run in background
    fetch(this.config.url, {
      method: 'GET',
      headers,
      signal: this.sseController.signal,
    }).then(async (response) => {
      if (!response.ok || response.status === 405) {
        // Server doesn't support GET for SSE, that's OK
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        let done = false;
        while (!done) {
          const readResult = await reader.read();
          done = readResult.done;
          if (done) break;

          buffer += decoder.decode(readResult.value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              try {
                const message = JSON.parse(data) as MCPMessage;
                this.eventHandlers.onMessage?.(message);

                if ('method' in message && !('id' in message)) {
                  this.eventHandlers.onNotification?.(message.method, message.params);
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          logger.warn('SSE listener error', { error: (error as Error).message });
        }
      } finally {
        reader.releaseLock();
      }
    }).catch((error) => {
      if (error.name !== 'AbortError') {
        logger.debug('SSE listener not available', { error: error.message });
      }
    });
  }
}
