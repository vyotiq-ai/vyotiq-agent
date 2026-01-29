/**
 * MCP (Model Context Protocol) Type Definitions
 * 
 * Shared types for MCP server integration following the 2025-06-18 protocol revision.
 * @see https://modelcontextprotocol.io/specification/2025-06-18
 */

// =============================================================================
// Transport Types
// =============================================================================

/**
 * MCP transport type
 * - stdio: Server runs as subprocess communicating via stdin/stdout
 * - http: Server communicates via HTTP/SSE (Streamable HTTP transport)
 */
export type MCPTransportType = 'stdio' | 'http';

/**
 * MCP server connection status
 */
export type MCPConnectionStatus = 
  | 'disconnected'
  | 'connecting'
  | 'initializing'
  | 'connected'
  | 'error'
  | 'reconnecting';

// =============================================================================
// Server Configuration
// =============================================================================

/**
 * Environment variables for MCP server
 */
export interface MCPServerEnv {
  [key: string]: string;
}

/**
 * stdio transport configuration
 */
export interface MCPStdioConfig {
  type: 'stdio';
  /** Command to run the server */
  command: string;
  /** Arguments to pass to the command */
  args?: string[];
  /** Working directory for the server process */
  cwd?: string;
  /** Environment variables */
  env?: MCPServerEnv;
}

/**
 * HTTP transport configuration
 */
export interface MCPHttpConfig {
  type: 'http';
  /** Server URL endpoint */
  url: string;
  /** Optional headers for authentication */
  headers?: Record<string, string>;
  /** Session ID (assigned by server) */
  sessionId?: string;
}

/**
 * Transport configuration union
 */
export type MCPTransportConfig = MCPStdioConfig | MCPHttpConfig;

/**
 * MCP server configuration
 */
export interface MCPServerConfig {
  /** Unique identifier for this server */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of the server's capabilities */
  description?: string;
  /** Transport configuration */
  transport: MCPTransportConfig;
  /** Whether the server is enabled */
  enabled: boolean;
  /** Auto-connect on startup */
  autoConnect: boolean;
  /** Connection timeout in milliseconds */
  timeout?: number;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
  /** Custom icon (emoji or icon name) */
  icon?: string;
  /** Server tags for categorization */
  tags?: string[];
  /** Created timestamp */
  createdAt: number;
  /** Last modified timestamp */
  updatedAt: number;
}

// =============================================================================
// Protocol Capabilities
// =============================================================================

/**
 * Server-declared capabilities
 */
export interface MCPServerCapabilities {
  /** Prompt templates support */
  prompts?: {
    listChanged?: boolean;
  };
  /** Resource access support */
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  /** Tool execution support */
  tools?: {
    listChanged?: boolean;
  };
  /** Logging support */
  logging?: Record<string, unknown>;
  /** Completions support */
  completions?: Record<string, unknown>;
  /** Experimental features */
  experimental?: Record<string, unknown>;
}

/**
 * Client-declared capabilities
 */
export interface MCPClientCapabilities {
  /** Filesystem roots support */
  roots?: {
    listChanged?: boolean;
  };
  /** LLM sampling support */
  sampling?: Record<string, unknown>;
  /** Elicitation support */
  elicitation?: Record<string, unknown>;
  /** Experimental features */
  experimental?: Record<string, unknown>;
}

// =============================================================================
// Protocol Messages
// =============================================================================

/**
 * Server information from initialization
 */
export interface MCPServerInfo {
  name: string;
  title?: string;
  version: string;
  instructions?: string;
}

/**
 * Client information for initialization
 */
export interface MCPClientInfo {
  name: string;
  title?: string;
  version: string;
}

// =============================================================================
// Resources
// =============================================================================

/**
 * Resource annotations
 */
export interface MCPResourceAnnotations {
  /** Intended audience */
  audience?: Array<'user' | 'assistant'>;
  /** Importance (0.0 to 1.0) */
  priority?: number;
  /** Last modification timestamp (ISO 8601) */
  lastModified?: string;
}

/**
 * Resource definition
 */
export interface MCPResource {
  /** Unique URI for the resource */
  uri: string;
  /** Resource name */
  name: string;
  /** Human-readable title */
  title?: string;
  /** Description */
  description?: string;
  /** MIME type */
  mimeType?: string;
  /** Size in bytes */
  size?: number;
  /** Annotations */
  annotations?: MCPResourceAnnotations;
}

/**
 * Resource template for parameterized resources
 */
export interface MCPResourceTemplate {
  /** URI template (RFC 6570) */
  uriTemplate: string;
  /** Template name */
  name: string;
  /** Human-readable title */
  title?: string;
  /** Description */
  description?: string;
  /** Default MIME type */
  mimeType?: string;
  /** Annotations */
  annotations?: MCPResourceAnnotations;
}

/**
 * Resource content (text or binary)
 */
export interface MCPResourceContent {
  uri: string;
  mimeType?: string;
  /** Text content */
  text?: string;
  /** Binary content (base64 encoded) */
  blob?: string;
  /** Annotations */
  annotations?: MCPResourceAnnotations;
}

// =============================================================================
// Prompts
// =============================================================================

/**
 * Prompt argument definition
 */
export interface MCPPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

/**
 * Prompt definition
 */
export interface MCPPrompt {
  /** Unique identifier */
  name: string;
  /** Human-readable title */
  title?: string;
  /** Description */
  description?: string;
  /** Arguments */
  arguments?: MCPPromptArgument[];
}

/**
 * Prompt message content types
 */
export type MCPPromptContentType = 'text' | 'image' | 'audio' | 'resource';

/**
 * Text content in prompt message
 */
export interface MCPTextContent {
  type: 'text';
  text: string;
  annotations?: MCPResourceAnnotations;
}

/**
 * Image content in prompt message
 */
export interface MCPImageContent {
  type: 'image';
  data: string; // base64
  mimeType: string;
  annotations?: MCPResourceAnnotations;
}

/**
 * Audio content in prompt message
 */
export interface MCPAudioContent {
  type: 'audio';
  data: string; // base64
  mimeType: string;
  annotations?: MCPResourceAnnotations;
}

/**
 * Embedded resource content in prompt message
 */
export interface MCPEmbeddedResourceContent {
  type: 'resource';
  resource: MCPResourceContent;
  annotations?: MCPResourceAnnotations;
}

/**
 * Prompt message content union
 */
export type MCPPromptContent = 
  | MCPTextContent 
  | MCPImageContent 
  | MCPAudioContent 
  | MCPEmbeddedResourceContent;

/**
 * Prompt message
 */
export interface MCPPromptMessage {
  role: 'user' | 'assistant';
  content: MCPPromptContent;
}

/**
 * Resolved prompt result
 */
export interface MCPPromptResult {
  description?: string;
  messages: MCPPromptMessage[];
}

// =============================================================================
// Tools
// =============================================================================

/**
 * Tool annotations (trust/safety hints)
 */
export interface MCPToolAnnotations {
  /** Human-readable title */
  title?: string;
  /** Whether the tool modifies data */
  readOnlyHint?: boolean;
  /** Whether the tool is destructive */
  destructiveHint?: boolean;
  /** Whether the tool requires confirmation */
  idempotentHint?: boolean;
  /** Whether the tool can make network requests */
  openWorldHint?: boolean;
}

/**
 * Tool definition from MCP server
 */
export interface MCPTool {
  /** Unique identifier */
  name: string;
  /** Human-readable title */
  title?: string;
  /** Description */
  description?: string;
  /** JSON Schema for input parameters */
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
  /** Optional output schema */
  outputSchema?: Record<string, unknown>;
  /** Annotations */
  annotations?: MCPToolAnnotations;
}

/**
 * Tool call result content types
 */
export interface MCPToolResultText {
  type: 'text';
  text: string;
  annotations?: MCPResourceAnnotations;
}

export interface MCPToolResultImage {
  type: 'image';
  data: string;
  mimeType: string;
  annotations?: MCPResourceAnnotations;
}

export interface MCPToolResultAudio {
  type: 'audio';
  data: string;
  mimeType: string;
  annotations?: MCPResourceAnnotations;
}

export interface MCPToolResultResourceLink {
  type: 'resource_link';
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
  annotations?: MCPResourceAnnotations;
}

export interface MCPToolResultEmbeddedResource {
  type: 'resource';
  resource: MCPResourceContent;
}

/**
 * Tool result content union
 */
export type MCPToolResultContent = 
  | MCPToolResultText 
  | MCPToolResultImage 
  | MCPToolResultAudio
  | MCPToolResultResourceLink
  | MCPToolResultEmbeddedResource;

/**
 * Tool call result
 */
export interface MCPToolResult {
  content: MCPToolResultContent[];
  /** Structured content (for output schema validation) */
  structuredContent?: Record<string, unknown>;
  /** Whether the tool execution failed */
  isError?: boolean;
}

// =============================================================================
// Server State
// =============================================================================

/**
 * Connected server state including discovered capabilities
 */
export interface MCPServerState {
  /** Server configuration */
  config: MCPServerConfig;
  /** Connection status */
  status: MCPConnectionStatus;
  /** Error message if status is 'error' */
  error?: string;
  /** Server info from initialization */
  serverInfo?: MCPServerInfo;
  /** Server capabilities */
  capabilities?: MCPServerCapabilities;
  /** Discovered prompts */
  prompts: MCPPrompt[];
  /** Discovered resources */
  resources: MCPResource[];
  /** Discovered resource templates */
  resourceTemplates: MCPResourceTemplate[];
  /** Discovered tools */
  tools: MCPTool[];
  /** Current connection established timestamp */
  connectedAt?: number;
  /** Last successful connection timestamp */
  lastConnectedAt?: number;
  /** Connection metrics */
  metrics?: {
    connectTime?: number;
    toolCallCount: number;
    resourceReadCount: number;
    promptGetCount: number;
    errorCount: number;
  };
}

// =============================================================================
// Settings
// =============================================================================

/**
 * MCP settings stored in AgentSettings
 */
export interface MCPSettings {
  /** Whether MCP is enabled globally */
  enabled: boolean;
  /** Registered MCP servers */
  servers: MCPServerConfig[];
  /** Default timeout for all servers (ms) */
  defaultTimeout: number;
  /** Auto-reconnect on connection loss */
  autoReconnect: boolean;
  /** Show tool confirmation for MCP tools */
  requireToolConfirmation: boolean;
  /** Include MCP tools in agent context */
  includeInAgentContext: boolean;
  /** Maximum concurrent server connections */
  maxConcurrentConnections: number;
}

/**
 * Default MCP settings
 */
export const DEFAULT_MCP_SETTINGS: MCPSettings = {
  enabled: true,
  servers: [],
  defaultTimeout: 30000,
  autoReconnect: true,
  requireToolConfirmation: true,
  includeInAgentContext: true,
  maxConcurrentConnections: 10,
};

// =============================================================================
// Events
// =============================================================================

/**
 * MCP-related events for renderer
 */
export interface MCPStateEvent {
  type: 'mcp-state';
  servers: MCPServerState[];
}

export interface MCPServerConnectedEvent {
  type: 'mcp-server-connected';
  serverId: string;
  serverInfo: MCPServerInfo;
  capabilities: MCPServerCapabilities;
}

export interface MCPServerDisconnectedEvent {
  type: 'mcp-server-disconnected';
  serverId: string;
  reason?: string;
}

export interface MCPServerErrorEvent {
  type: 'mcp-server-error';
  serverId: string;
  error: string;
}

export interface MCPToolsChangedEvent {
  type: 'mcp-tools-changed';
  serverId: string;
  tools: MCPTool[];
}

export interface MCPResourcesChangedEvent {
  type: 'mcp-resources-changed';
  serverId: string;
  resources: MCPResource[];
}

export interface MCPPromptsChangedEvent {
  type: 'mcp-prompts-changed';
  serverId: string;
  prompts: MCPPrompt[];
}

export type MCPEvent = 
  | MCPStateEvent
  | MCPServerConnectedEvent
  | MCPServerDisconnectedEvent
  | MCPServerErrorEvent
  | MCPToolsChangedEvent
  | MCPResourcesChangedEvent
  | MCPPromptsChangedEvent;

// =============================================================================
// IPC Types
// =============================================================================

export interface MCPAddServerRequest {
  name: string;
  transport: MCPTransportConfig;
  description?: string;
  autoConnect?: boolean;
  icon?: string;
  tags?: string[];
}

export interface MCPUpdateServerRequest {
  id: string;
  updates: Partial<Omit<MCPServerConfig, 'id' | 'createdAt'>>;
}

export interface MCPToolCallRequest {
  serverId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface MCPResourceReadRequest {
  serverId: string;
  uri: string;
}

export interface MCPPromptGetRequest {
  serverId: string;
  name: string;
  arguments?: Record<string, unknown>;
}

// =============================================================================
// Server Presets
// =============================================================================

/**
 * MCP server preset for quick setup
 */
export interface MCPServerPreset {
  id: string;
  name: string;
  description: string;
  transport: MCPStdioConfig;
  icon: string;
  tags: string[];
  /** Environment variables required (user must provide) */
  requiredEnv?: string[];
}

/**
 * Common MCP server presets for quick setup
 */
export const MCP_SERVER_PRESETS: MCPServerPreset[] = [
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Access local filesystem with read/write capabilities',
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', './'],
    },
    icon: '📁',
    tags: ['official', 'filesystem'],
  },
  {
    id: 'fetch',
    name: 'Fetch',
    description: 'Fetch and convert web pages to markdown',
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-fetch'],
    },
    icon: '🌐',
    tags: ['official', 'web'],
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Access GitHub repositories and issues',
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
    },
    icon: '🐙',
    tags: ['official', 'git'],
    requiredEnv: ['GITHUB_TOKEN'],
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    description: 'Read and query SQLite databases',
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', './database.db'],
    },
    icon: '🗃️',
    tags: ['official', 'database'],
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Persistent knowledge graph memory',
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    },
    icon: '🧠',
    tags: ['official', 'memory'],
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Web search using Brave Search API',
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
    },
    icon: '🔍',
    tags: ['official', 'search'],
    requiredEnv: ['BRAVE_API_KEY'],
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: 'Browser automation and web scraping',
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    },
    icon: '🎭',
    tags: ['official', 'browser'],
  },
];
