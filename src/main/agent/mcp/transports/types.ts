/**
 * MCP Transport Interface
 * 
 * Abstract interface for MCP transport implementations.
 * Supports both stdio and HTTP (Streamable HTTP) transports.
 */

import type { 
  MCPServerCapabilities, 
  MCPServerInfo,
  MCPClientInfo,
  MCPClientCapabilities,
} from '../../../../shared/types/mcp';

/**
 * JSON-RPC 2.0 Request
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 Notification
 */
export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 Response
 */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

/**
 * JSON-RPC 2.0 Error
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * MCP message types
 */
export type MCPMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

/**
 * Transport event handlers
 */
export interface MCPTransportEvents {
  /** Called when transport connects */
  onConnect?: () => void;
  /** Called when transport disconnects */
  onDisconnect?: (reason?: string) => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
  /** Called when a message is received */
  onMessage?: (message: MCPMessage) => void;
  /** Called when a notification is received */
  onNotification?: (method: string, params?: Record<string, unknown>) => void;
}

/**
 * Abstract MCP transport interface
 */
export interface MCPTransport {
  /** Transport type identifier */
  readonly type: 'stdio' | 'http';
  
  /** Whether the transport is connected */
  readonly isConnected: boolean;

  /**
   * Connect to the server
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the server
   */
  disconnect(): Promise<void>;

  /**
   * Send a request and wait for response
   */
  request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;

  /**
   * Send a notification (no response expected)
   */
  notify(method: string, params?: Record<string, unknown>): Promise<void>;

  /**
   * Set event handlers
   */
  setEventHandlers(handlers: MCPTransportEvents): void;

  /**
   * Initialize the MCP session
   */
  initialize(
    clientInfo: MCPClientInfo,
    clientCapabilities: MCPClientCapabilities
  ): Promise<{
    protocolVersion: string;
    capabilities: MCPServerCapabilities;
    serverInfo: MCPServerInfo;
    instructions?: string;
  }>;
}

/**
 * Standard JSON-RPC error codes
 */
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // MCP-specific
  RESOURCE_NOT_FOUND: -32002,
} as const;

/**
 * MCP protocol version
 */
export const MCP_PROTOCOL_VERSION = '2025-06-18';
