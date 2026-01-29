/**
 * MCP stdio Transport Implementation
 * 
 * Implements the stdio transport for MCP servers.
 * The server runs as a subprocess and communicates via stdin/stdout.
 * 
 * @see https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#stdio
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createInterface, type Interface } from 'node:readline';
import type { MCPStdioConfig, MCPClientInfo, MCPClientCapabilities, MCPServerCapabilities, MCPServerInfo } from '../../../../shared/types/mcp';
import type { MCPTransport, MCPTransportEvents, JsonRpcRequest, JsonRpcResponse, MCPMessage } from './types';
import { MCP_PROTOCOL_VERSION } from './types';
import { createLogger } from '../../../logger';

const logger = createLogger('MCPStdioTransport');

/**
 * Pending request tracker
 */
interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
  method: string;
}

export class MCPStdioTransport implements MCPTransport {
  readonly type = 'stdio' as const;
  
  private config: MCPStdioConfig;
  private process: ChildProcess | null = null;
  private readline: Interface | null = null;
  private pendingRequests = new Map<string | number, PendingRequest>();
  private eventHandlers: MCPTransportEvents = {};
  private nextRequestId = 1;
  private timeout: number;
  private emitter = new EventEmitter();
  private _isConnected = false;

  constructor(config: MCPStdioConfig, timeout = 30000) {
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

    logger.info('Connecting to MCP server via stdio', {
      command: this.config.command,
      args: this.config.args,
    });

    return new Promise((resolve, reject) => {
      try {
        // Spawn the server process
        this.process = spawn(this.config.command, this.config.args ?? [], {
          cwd: this.config.cwd,
          env: { ...process.env, ...this.config.env },
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: process.platform === 'win32', // Use shell on Windows for command resolution
        });

        // Handle process errors
        this.process.on('error', (error) => {
          logger.error('MCP server process error', { error: error.message });
          this.handleDisconnect(`Process error: ${error.message}`);
          if (!this._isConnected) {
            reject(error);
          }
        });

        // Handle process exit
        this.process.on('exit', (code, signal) => {
          logger.info('MCP server process exited', { code, signal });
          this.handleDisconnect(`Process exited with code ${code}`);
        });

        // Log stderr
        this.process.stderr?.on('data', (data: Buffer) => {
          const message = data.toString().trim();
          if (message) {
            logger.debug('MCP server stderr', { message });
          }
        });

        // Set up readline for stdout (newline-delimited JSON-RPC messages)
        if (this.process.stdout) {
          this.readline = createInterface({
            input: this.process.stdout,
            crlfDelay: Infinity,
          });

          this.readline.on('line', (line) => {
            this.handleLine(line);
          });

          this.readline.on('close', () => {
            this.handleDisconnect('Readline closed');
          });
        }

        // Mark as connected once process is running
        this._isConnected = true;
        this.eventHandlers.onConnect?.();
        resolve();
      } catch (error) {
        logger.error('Failed to spawn MCP server process', { 
          error: error instanceof Error ? error.message : String(error) 
        });
        reject(error);
      }
    });
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

    // Close readline
    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }

    // Kill the process
    if (this.process) {
      // First try to close stdin gracefully
      this.process.stdin?.end();
      
      // Give it a moment to exit gracefully
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          // If still running, send SIGTERM
          if (this.process && !this.process.killed) {
            this.process.kill('SIGTERM');
          }
          resolve();
        }, 1000);

        this.process!.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      // Force kill if still running
      if (this.process && !this.process.killed) {
        this.process.kill('SIGKILL');
      }

      this.process = null;
    }

    this._isConnected = false;
    this.eventHandlers.onDisconnect?.('Manual disconnect');
  }

  async request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this._isConnected || !this.process?.stdin) {
      throw new Error('Transport not connected');
    }

    const id = this.nextRequestId++;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise<T>((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout for ${method}`));
      }, this.timeout);

      // Track pending request
      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutId,
        method,
      });

      // Send the request
      const message = JSON.stringify(request) + '\n';
      this.process!.stdin!.write(message, (error) => {
        if (error) {
          clearTimeout(timeoutId);
          this.pendingRequests.delete(id);
          reject(error);
        }
      });

      logger.debug('Sent MCP request', { id, method });
    });
  }

  async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    if (!this._isConnected || !this.process?.stdin) {
      throw new Error('Transport not connected');
    }

    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const message = JSON.stringify(notification) + '\n';
    
    return new Promise((resolve, reject) => {
      this.process!.stdin!.write(message, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
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

    // Send initialized notification
    await this.notify('notifications/initialized');

    return result;
  }

  private handleLine(line: string): void {
    if (!line.trim()) {
      return;
    }

    let message: MCPMessage;
    try {
      message = JSON.parse(line) as MCPMessage;
    } catch (error) {
      logger.warn('Failed to parse MCP message', { line, error });
      return;
    }

    // Handle the message
    if ('id' in message && message.id !== null) {
      // This is a response
      this.handleResponse(message as JsonRpcResponse);
    } else if ('method' in message) {
      // This is a notification or request from server
      this.handleNotification(message.method, message.params);
    }

    // Forward to event handlers
    this.eventHandlers.onMessage?.(message);
  }

  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(response.id!);
    if (!pending) {
      logger.warn('Received response for unknown request', { id: response.id });
      return;
    }

    clearTimeout(pending.timeoutId);
    this.pendingRequests.delete(response.id!);

    if (response.error) {
      pending.reject(new Error(`MCP Error ${response.error.code}: ${response.error.message}`));
    } else {
      pending.resolve(response.result);
    }
  }

  private handleNotification(method: string, params?: Record<string, unknown>): void {
    logger.debug('Received MCP notification', { method });
    this.eventHandlers.onNotification?.(method, params);
  }

  private handleDisconnect(reason: string): void {
    if (!this._isConnected) {
      return;
    }

    this._isConnected = false;

    // Cancel all pending requests
    const pendingCount = this.pendingRequests.size;
    if (pendingCount > 0) {
      logger.warn('Cancelling pending requests due to disconnect', { count: pendingCount, reason });
    }
    for (const [id, pending] of this.pendingRequests) {
      logger.debug('Cancelling pending request', { id, method: pending.method });
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(`Disconnected: ${reason}`));
    }
    this.pendingRequests.clear();

    this.eventHandlers.onDisconnect?.(reason);
  }
}
