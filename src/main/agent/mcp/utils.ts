/**
 * MCP Utility Functions
 */

import { randomUUID } from 'node:crypto';
import type { MCPServerConfig, MCPTransportConfig, MCPStdioConfig, MCPHttpConfig } from '../../../shared/types/mcp';

/**
 * Generate a unique server ID
 */
export function generateServerId(): string {
  return randomUUID();
}

/**
 * Validate server configuration
 */
export function validateServerConfig(config: Partial<MCPServerConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.name || config.name.trim().length === 0) {
    errors.push('Server name is required');
  }

  if (!config.transport) {
    errors.push('Transport configuration is required');
  } else {
    const transportErrors = validateTransportConfig(config.transport);
    errors.push(...transportErrors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate transport configuration
 */
export function validateTransportConfig(transport: MCPTransportConfig): string[] {
  const errors: string[] = [];

  if (transport.type === 'stdio') {
    if (!transport.command || transport.command.trim().length === 0) {
      errors.push('Command is required for stdio transport');
    }
  } else if (transport.type === 'http') {
    if (!transport.url || transport.url.trim().length === 0) {
      errors.push('URL is required for HTTP transport');
    } else {
      try {
        new URL(transport.url);
      } catch {
        errors.push('Invalid URL format');
      }
    }
  } else {
    errors.push('Invalid transport type');
  }

  return errors;
}

/**
 * Parse a server command string into components
 * Handles formats like:
 * - "npx -y @modelcontextprotocol/server-filesystem /path/to/dir"
 * - "python -m mcp_server"
 * - "node /path/to/server.js --arg value"
 */
export function parseServerCommand(commandStr: string): MCPStdioConfig {
  const parts = commandStr.trim().split(/\s+/);
  const command = parts[0] ?? '';
  const args = parts.slice(1);

  return {
    type: 'stdio',
    command,
    args: args.length > 0 ? args : undefined,
  };
}

/**
 * Format an MCP error for display
 */
export function formatMCPError(error: unknown): string {
  if (error instanceof Error) {
    // Parse MCP error format: "MCP Error -32602: Invalid params"
    const match = error.message.match(/MCP Error (-?\d+): (.+)/);
    if (match) {
      const code = parseInt(match[1], 10);
      const message = match[2];
      return `${getErrorCodeName(code)}: ${message}`;
    }
    return error.message;
  }
  return String(error);
}

/**
 * Get human-readable error code name
 */
function getErrorCodeName(code: number): string {
  switch (code) {
    case -32700:
      return 'Parse Error';
    case -32600:
      return 'Invalid Request';
    case -32601:
      return 'Method Not Found';
    case -32602:
      return 'Invalid Params';
    case -32603:
      return 'Internal Error';
    case -32002:
      return 'Resource Not Found';
    default:
      return `Error ${code}`;
  }
}

/**
 * Create a stdio config from a command string
 */
export function createStdioConfig(command: string, args?: string[], cwd?: string, env?: Record<string, string>): MCPStdioConfig {
  return {
    type: 'stdio',
    command,
    args,
    cwd,
    env,
  };
}

/**
 * Create an HTTP config from a URL
 */
export function createHttpConfig(url: string, headers?: Record<string, string>): MCPHttpConfig {
  return {
    type: 'http',
    url,
    headers,
  };
}

/**
 * Check if a server config uses stdio transport
 */
export function isStdioTransport(config: MCPTransportConfig): config is MCPStdioConfig {
  return config.type === 'stdio';
}

/**
 * Check if a server config uses HTTP transport
 */
export function isHttpTransport(config: MCPTransportConfig): config is MCPHttpConfig {
  return config.type === 'http';
}

/**
 * Get display name for a transport type
 */
export function getTransportDisplayName(type: 'stdio' | 'http'): string {
  switch (type) {
    case 'stdio':
      return 'Local Process (stdio)';
    case 'http':
      return 'Remote Server (HTTP)';
    default:
      return type;
  }
}

/**
 * Sanitize environment variables (remove sensitive values for logging)
 */
export function sanitizeEnvForLogging(env?: Record<string, string>): Record<string, string> | undefined {
  if (!env) return undefined;

  const sensitiveKeys = ['key', 'token', 'secret', 'password', 'auth', 'credential'];
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(k => lowerKey.includes(k));
    result[key] = isSensitive ? '[REDACTED]' : value;
  }

  return result;
}

/**
 * Common MCP server presets
 */
export const MCP_SERVER_PRESETS = [
  {
    name: 'Filesystem',
    description: 'Access local filesystem with read/write capabilities',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', './'],
    icon: '📁',
    tags: ['official', 'filesystem'],
  },
  {
    name: 'Fetch',
    description: 'Fetch and convert web pages to markdown',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    icon: '🌐',
    tags: ['official', 'web'],
  },
  {
    name: 'GitHub',
    description: 'Access GitHub repositories and issues',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    icon: '🐙',
    tags: ['official', 'git'],
  },
  {
    name: 'SQLite',
    description: 'Read and query SQLite databases',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', './database.db'],
    icon: '🗃️',
    tags: ['official', 'database'],
  },
  {
    name: 'Memory',
    description: 'Persistent knowledge graph memory',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    icon: '🧠',
    tags: ['official', 'memory'],
  },
  {
    name: 'Brave Search',
    description: 'Web search using Brave Search API',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    icon: '🔍',
    tags: ['official', 'search'],
  },
  {
    name: 'Puppeteer',
    description: 'Browser automation and web scraping',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    icon: '🎭',
    tags: ['official', 'browser'],
  },
] as const;
