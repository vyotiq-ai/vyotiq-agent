/**
 * MCP (Model Context Protocol) Types
 *
 * Type definitions for the dynamic MCP server management system.
 * Based on MCP specification 2025-06-18.
 *
 * @module types/mcp
 */

// =============================================================================
// MCP Server Configuration Types
// =============================================================================

/**
 * Transport type for MCP server communication
 */
export type MCPTransportType = 'stdio' | 'sse' | 'streamable-http';

/**
 * MCP server status
 */
export type MCPServerStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'disabled';

/**
 * MCP server source type
 */
export type MCPServerSource =
  | 'npm'
  | 'pypi'
  | 'local'
  | 'git'
  | 'remote'
  | 'builtin'
  | 'mcpb'; // MCP Bundle format

/**
 * MCP server category for organization
 */
export type MCPServerCategory =
  | 'database'
  | 'api'
  | 'file-system'
  | 'browser'
  | 'developer-tools'
  | 'productivity'
  | 'cloud'
  | 'communication'
  | 'ai'
  | 'analytics'
  | 'security'
  | 'other';

/**
 * MCP Tool definition from server
 */
export interface MCPToolDefinition {
  /** Unique tool name */
  name: string;
  /** Human-readable title */
  title?: string;
  /** Tool description for LLM understanding */
  description: string;
  /** JSON Schema for input parameters */
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  /** Additional annotations */
  annotations?: Record<string, unknown>;
}

/**
 * MCP Resource definition from server
 */
export interface MCPResourceDefinition {
  /** Resource URI */
  uri: string;
  /** Resource name */
  name: string;
  /** Resource description */
  description?: string;
  /** MIME type */
  mimeType?: string;
}

/**
 * MCP Prompt definition from server
 */
export interface MCPPromptDefinition {
  /** Prompt name */
  name: string;
  /** Prompt description */
  description?: string;
  /** Required arguments */
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

/**
 * MCP Server capabilities negotiated during initialization
 */
export interface MCPServerCapabilities {
  /** Whether server supports tools */
  tools?: {
    /** Server sends notifications when tool list changes */
    listChanged?: boolean;
  };
  /** Whether server supports resources */
  resources?: {
    /** Server sends notifications when resource list changes */
    listChanged?: boolean;
    /** Server supports subscribing to resource updates */
    subscribe?: boolean;
  };
  /** Whether server supports prompts */
  prompts?: {
    /** Server sends notifications when prompt list changes */
    listChanged?: boolean;
  };
  /** Whether server supports logging */
  logging?: Record<string, never>;
  /** Experimental capabilities */
  experimental?: Record<string, unknown>;
}

/**
 * STDIO transport configuration
 */
export interface MCPStdioConfig {
  type: 'stdio';
  /** Command to execute */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Working directory */
  cwd?: string;
}

/**
 * SSE transport configuration
 */
export interface MCPSSEConfig {
  type: 'sse';
  /** Server URL */
  url: string;
  /** Authentication headers */
  headers?: Record<string, string>;
}

/**
 * Streamable HTTP transport configuration
 */
export interface MCPStreamableHTTPConfig {
  type: 'streamable-http';
  /** Server URL */
  url: string;
  /** Authentication headers */
  headers?: Record<string, string>;
  /** OAuth configuration */
  oauth?: {
    clientId: string;
    tokenEndpoint: string;
    authorizationEndpoint?: string;
  };
}

/**
 * Union type for transport configurations
 */
export type MCPTransportConfig =
  | MCPStdioConfig
  | MCPSSEConfig
  | MCPStreamableHTTPConfig;

/**
 * MCP Server configuration for storage
 */
export interface MCPServerConfig {
  /** Unique server ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description?: string;
  /** Server version */
  version?: string;
  /** Author/maintainer */
  author?: string;
  /** Homepage URL */
  homepage?: string;
  /** Repository URL */
  repository?: string;
  /** Server icon URL or data URI */
  icon?: string;
  /** Server category */
  category: MCPServerCategory;
  /** Installation source */
  source: MCPServerSource;
  /** Source identifier (npm package, git URL, etc.) */
  sourceId?: string;
  /** Transport configuration */
  transport: MCPTransportConfig;
  /** Whether server is enabled */
  enabled: boolean;
  /** Installation timestamp */
  installedAt: number;
  /** Last updated timestamp */
  updatedAt?: number;
  /** Tags for search/filtering */
  tags?: string[];
  /** User notes */
  notes?: string;
  /** Auto-start with agent */
  autoStart: boolean;
  /** Priority order (lower = higher priority) */
  priority: number;
}

/**
 * MCP Server runtime state
 */
export interface MCPServerState {
  /** Server configuration ID */
  configId: string;
  /** Current status */
  status: MCPServerStatus;
  /** Error message if status is 'error' */
  error?: string;
  /** Connected protocol version */
  protocolVersion?: string;
  /** Server info from initialization */
  serverInfo?: {
    name: string;
    version: string;
  };
  /** Negotiated capabilities */
  capabilities?: MCPServerCapabilities;
  /** Available tools */
  tools: MCPToolDefinition[];
  /** Available resources */
  resources: MCPResourceDefinition[];
  /** Available prompts */
  prompts: MCPPromptDefinition[];
  /** Connection timestamp */
  connectedAt?: number;
  /** Last activity timestamp */
  lastActivityAt?: number;
  /** Tool call statistics */
  stats: {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    averageLatencyMs: number;
  };
}

// =============================================================================
// MCP Store Types
// =============================================================================

/**
 * MCP server listing from store/registry
 */
export interface MCPStoreListing {
  /** Package identifier */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Detailed description (markdown) */
  longDescription?: string;
  /** Version */
  version: string;
  /** Author name */
  author: string;
  /** Author homepage */
  authorUrl?: string;
  /** Server homepage */
  homepage?: string;
  /** Repository URL */
  repository?: string;
  /** License */
  license?: string;
  /** Icon URL */
  icon?: string;
  /** Banner image URL */
  banner?: string;
  /** Category */
  category: MCPServerCategory;
  /** Tags for filtering */
  tags: string[];
  /** Installation source */
  source: MCPServerSource;
  /** Install command/package name */
  installCommand: string;
  /** Default transport configuration template */
  transportTemplate: Partial<MCPTransportConfig>;
  /** Required environment variables */
  requiredEnv?: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
  /** Download count */
  downloads?: number;
  /** Star/rating count */
  stars?: number;
  /** Last updated */
  updatedAt: string;
  /** Whether verified/official */
  verified: boolean;
  /** Screenshots */
  screenshots?: string[];
  /** Example tools provided */
  exampleTools?: string[];
  /** Readme content (markdown) */
  readme?: string;
  /** Changelog content (markdown) */
  changelog?: string;
}

/**
 * MCP Store search filters
 */
export interface MCPStoreFilters {
  /** Search query */
  query?: string;
  /** Filter by category */
  category?: MCPServerCategory;
  /** Filter by source type */
  source?: MCPServerSource;
  /** Filter by tags */
  tags?: string[];
  /** Only show verified servers */
  verifiedOnly?: boolean;
  /** Sort by */
  sortBy?: 'relevance' | 'downloads' | 'stars' | 'updated' | 'name';
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
  /** Pagination offset */
  offset?: number;
  /** Results per page */
  limit?: number;
}

/**
 * MCP Store search results
 */
export interface MCPStoreSearchResult {
  /** Total matching results */
  total: number;
  /** Current page results */
  items: MCPStoreListing[];
  /** Whether more results available */
  hasMore: boolean;
}

// =============================================================================
// MCP Settings Types
// =============================================================================

/**
 * MCP system settings
 */
export interface MCPSettings {
  /** Enable MCP integration */
  enabled: boolean;
  /** Auto-start enabled servers with agent */
  autoStartServers: boolean;
  /** Connection timeout (ms) */
  connectionTimeoutMs: number;
  /** Tool execution timeout (ms) */
  toolTimeoutMs: number;
  /** Maximum concurrent server connections */
  maxConcurrentConnections: number;
  /** Cache tool results for repeated calls */
  cacheToolResults: boolean;
  /** Cache TTL (ms) */
  cacheTtlMs: number;
  /** Show MCP tools in tool selection */
  showInToolSelection: boolean;
  /** Log MCP communications for debugging */
  debugLogging: boolean;
  /** Retry failed connections */
  retryFailedConnections: boolean;
  /** Retry count */
  retryCount: number;
  /** Retry delay (ms) */
  retryDelayMs: number;
  /** Custom registry URLs */
  customRegistries: string[];
  /** Enabled registry sources */
  enabledRegistrySources?: {
    smithery: boolean;
    npm: boolean;
    pypi: boolean;
    github: boolean;
    glama: boolean;
  };
}

/**
 * Default MCP settings
 */
export const DEFAULT_MCP_SETTINGS: MCPSettings = {
  enabled: true,
  autoStartServers: true,
  connectionTimeoutMs: 30000,
  toolTimeoutMs: 60000,
  maxConcurrentConnections: 10,
  cacheToolResults: true,
  cacheTtlMs: 300000, // 5 minutes
  showInToolSelection: true,
  debugLogging: false,
  retryFailedConnections: true,
  retryCount: 3,
  retryDelayMs: 2000,
  customRegistries: [],
  enabledRegistrySources: {
    smithery: true,
    npm: true,
    pypi: true,
    github: true,
    glama: false, // Disabled by default
  },
};

// =============================================================================
// MCP Event Types
// =============================================================================

/**
 * MCP event types for IPC communication
 */
export type MCPEventType =
  | 'mcp:server-status-changed'
  | 'mcp:server-installed'
  | 'mcp:server-uninstalled'
  | 'mcp:server-updated'
  | 'mcp:tools-changed'
  | 'mcp:resources-changed'
  | 'mcp:prompts-changed'
  | 'mcp:tool-executed'
  | 'mcp:error';

/**
 * MCP server status changed event
 */
export interface MCPServerStatusChangedEvent {
  type: 'mcp:server-status-changed';
  serverId: string;
  status: MCPServerStatus;
  error?: string;
}

/**
 * MCP server installed event
 */
export interface MCPServerInstalledEvent {
  type: 'mcp:server-installed';
  server: MCPServerConfig;
}

/**
 * MCP server uninstalled event
 */
export interface MCPServerUninstalledEvent {
  type: 'mcp:server-uninstalled';
  serverId: string;
}

/**
 * MCP tools changed event
 */
export interface MCPToolsChangedEvent {
  type: 'mcp:tools-changed';
  serverId: string;
  tools: MCPToolDefinition[];
}

/**
 * MCP tool executed event
 */
export interface MCPToolExecutedEvent {
  type: 'mcp:tool-executed';
  serverId: string;
  toolName: string;
  success: boolean;
  durationMs: number;
  error?: string;
}

/**
 * MCP error event
 */
export interface MCPErrorEvent {
  type: 'mcp:error';
  serverId?: string;
  message: string;
  details?: unknown;
}

/**
 * Union of all MCP events
 */
export type MCPEvent =
  | MCPServerStatusChangedEvent
  | MCPServerInstalledEvent
  | MCPServerUninstalledEvent
  | MCPToolsChangedEvent
  | MCPToolExecutedEvent
  | MCPErrorEvent;

// =============================================================================
// MCP Tool Execution Types
// =============================================================================

/**
 * MCP tool call request
 */
export interface MCPToolCallRequest {
  /** Server ID to call tool on */
  serverId: string;
  /** Tool name */
  toolName: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
  /** Request timeout override */
  timeoutMs?: number;
}

/**
 * MCP tool call result
 */
export interface MCPToolCallResult {
  /** Whether call was successful */
  success: boolean;
  /** Result content */
  content?: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
    uri?: string;
  }>;
  /** Error message if failed */
  error?: string;
  /** Execution duration (ms) */
  durationMs: number;
  /** Whether result is from cache */
  cached?: boolean;
}

// =============================================================================
// MCP Installation Types
// =============================================================================

/**
 * MCP server installation request
 */
export interface MCPInstallRequest {
  /** Source type */
  source: MCPServerSource;
  /** Package identifier (npm package, git URL, local path) */
  packageId: string;
  /** Custom server name */
  name?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Transport configuration override */
  transportConfig?: Partial<MCPTransportConfig>;
  /** Auto-start after installation */
  autoStart?: boolean;
  /** Category */
  category?: MCPServerCategory;
  /** Tags */
  tags?: string[];
}

/**
 * MCP server installation result
 */
export interface MCPInstallResult {
  /** Whether installation was successful */
  success: boolean;
  /** Installed server config (if successful) */
  server?: MCPServerConfig;
  /** Error message (if failed) */
  error?: string;
  /** Installation logs */
  logs?: string[];
}

// =============================================================================
// Helper Types
// =============================================================================

/**
 * MCP server summary for UI display
 */
export interface MCPServerSummary {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  category: MCPServerCategory;
  status: MCPServerStatus;
  enabled: boolean;
  toolCount: number;
  resourceCount: number;
  promptCount: number;
  source: MCPServerSource;
  /** Source identifier (npm package, git URL, etc.) for matching with store listings */
  sourceId?: string;
  lastActivity?: number;
}

/**
 * MCP tool with server context
 */
export interface MCPToolWithContext {
  /** Server ID */
  serverId: string;
  /** Server name */
  serverName: string;
  /** Tool definition */
  tool: MCPToolDefinition;
}

/**
 * Get all MCP tools across all connected servers
 */
export interface MCPToolsMap {
  /** Map of serverId -> tools */
  byServer: Map<string, MCPToolDefinition[]>;
  /** Flat list of all tools with context */
  all: MCPToolWithContext[];
  /** Total tool count */
  count: number;
}
