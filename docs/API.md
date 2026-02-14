# Vyotiq AI - API Documentation

## Table of Contents

1. [IPC API](#ipc-api)
2. [Agent API](#agent-api)
3. [Tool API](#tool-api)
4. [MCP API](#mcp-api)
5. [Provider API](#provider-api)
6. [Event System](#event-system)
7. [Type Definitions](#type-definitions)

---

## IPC API

The IPC API provides communication between the main process and renderer process.

### Agent Operations

#### `agent:startSession`

Start a new chat session.

```typescript
const session = await window.vyotiq.agent.startSession({
  title?: string;
  workspaceId?: string;
  config?: SessionConfig;
});
```

**Response:**

```typescript
interface AgentSessionState {
  id: string;
  title: string;
  workspaceId: string;
  status: 'idle' | 'running' | 'paused' | 'error';
  messages: Message[];
  config: SessionConfig;
  createdAt: number;
  updatedAt: number;
}
```

#### `agent:sendMessage`

Send a message to the agent.

```typescript
await window.vyotiq.agent.sendMessage({
  sessionId: string;
  content: string;
  attachments?: Attachment[];
});
```

**Parameters:**

- `sessionId`: ID of the session
- `content`: User message content
- `attachments`: Optional file attachments

#### `agent:confirmTool`

Confirm or reject a tool execution.

```typescript
await window.vyotiq.agent.confirmTool({
  sessionId: string;
  runId: string;
  toolName: string;
  confirmed: boolean;
  reason?: string;
});
```

#### `agent:cancelRun`

Cancel the current agent run.

```typescript
await window.vyotiq.agent.cancelRun(sessionId: string);
```

#### `agent:pauseRun`

Pause the current agent run.

```typescript
const paused = await window.vyotiq.agent.pauseRun(sessionId: string);
```

#### `agent:resumeRun`

Resume a paused agent run.

```typescript
const resumed = await window.vyotiq.agent.resumeRun(sessionId: string);
```

#### `agent:deleteSession`

Delete a session.

```typescript
await window.vyotiq.agent.deleteSession(sessionId: string);
```

#### `agent:getSessions`

Get all sessions.

```typescript
const sessions = await window.vyotiq.agent.getSessions();
```

#### `agent:getSessionsByWorkspace`

Get sessions for a specific workspace.

```typescript
const sessions = await window.vyotiq.agent.getSessionsByWorkspace(workspaceId: string);
```

#### `agent:regenerate`

Regenerate the last assistant response.

```typescript
await window.vyotiq.agent.regenerate(sessionId: string);
```

#### `agent:renameSession`

Rename a session.

```typescript
await window.vyotiq.agent.renameSession(sessionId: string, title: string);
```

#### `agent:editMessageAndResend`

Edit a user message and resend.

```typescript
const result = await window.vyotiq.agent.editMessageAndResend(
  sessionId: string,
  messageId: string,
  newContent: string
);
```

#### `agent:addReaction`

Add a reaction to a message.

```typescript
const result = await window.vyotiq.agent.addReaction(
  sessionId: string,
  messageId: string,
  reaction: 'up' | 'down' | null
);
```

#### `agent:createBranch`

Create a conversation branch.

```typescript
const result = await window.vyotiq.agent.createBranch(
  sessionId: string,
  forkPointMessageId: string,
  name?: string
);
```

#### `agent:switchBranch`

Switch to a different branch.

```typescript
const result = await window.vyotiq.agent.switchBranch(
  sessionId: string,
  branchId: string | null
);
```

#### `agent:deleteBranch`

Delete a branch.

```typescript
const result = await window.vyotiq.agent.deleteBranch(
  sessionId: string,
  branchId: string
);
```

### Terminal Operations

#### `terminal:run`

Run a command in the terminal.

```typescript
const result = await window.vyotiq.terminal.run({
  command: string;
  cwd?: string;
  shell?: string;
  timeout?: number;
});
```

**Response:**

```typescript
interface TerminalResult {
  pid: number;
  stdout: string;
  stderr: string;
  exitCode: number;
}
```

#### `terminal:kill`

Kill a terminal process.

```typescript
await window.vyotiq.terminal.kill(pid: number);
```

#### `terminal:check`

Check terminal process status.

```typescript
const status = await window.vyotiq.terminal.check(pid: number);
```

### File Operations

#### `files:read`

Read a file.

```typescript
const content = await window.vyotiq.files.read(filePath: string);
```

#### `files:write`

Write a file.

```typescript
await window.vyotiq.files.write(filePath: string, content: string);
```

#### `files:delete`

Delete a file.

```typescript
await window.vyotiq.files.delete(filePath: string);
```

#### `files:list`

List files in a directory.

```typescript
const files = await window.vyotiq.files.list(dirPath: string);
```

#### `files:search`

Search for files.

```typescript
const results = await window.vyotiq.files.search({
  pattern: string;
  cwd?: string;
  limit?: number;
});
```

### Settings Operations

#### `settings:get`

Get current settings.

```typescript
const settings = await window.vyotiq.settings.get();
```

#### `settings:update`

Update settings.

```typescript
await window.vyotiq.settings.update(settings: Partial<Settings>);
```

#### `settings:reset`

Reset settings to defaults.

```typescript
await window.vyotiq.settings.reset();
```

### Workspace Operations

#### `workspaces:list`

List all workspaces.

```typescript
const workspaces = await window.vyotiq.workspaces.list();
```

#### `workspaces:add`

Add a new workspace.

```typescript
const workspace = await window.vyotiq.workspaces.add(folderPath: string);
```

#### `workspaces:remove`

Remove a workspace.

```typescript
await window.vyotiq.workspaces.remove(workspaceId: string);
```

#### `workspaces:setActive`

Set the active workspace.

```typescript
await window.vyotiq.workspaces.setActive(workspaceId: string);
```

#### `workspaces:getActive`

Get the active workspace.

```typescript
const workspace = await window.vyotiq.workspaces.getActive();
```

### Browser Operations

#### `browser:navigate`

Navigate to a URL.

```typescript
await window.vyotiq.browser.navigate(url: string);
```

#### `browser:screenshot`

Take a screenshot.

```typescript
const imageData = await window.vyotiq.browser.screenshot();
```

#### `browser:click`

Click an element.

```typescript
await window.vyotiq.browser.click(selector: string);
```

#### `browser:type`

Type text.

```typescript
await window.vyotiq.browser.type(selector: string, text: string);
```

#### `browser:extract`

Extract page content.

```typescript
const content = await window.vyotiq.browser.extract();
```

### MCP Operations

*Added in v1.4.0*

#### `mcp:get-settings`

Get current MCP settings.

```typescript
const settings = await window.vyotiq.mcp.getSettings();
```

**Response:**

```typescript
interface MCPSettings {
  enabled: boolean;
  autoConnect: boolean;
  connectionTimeout: number;
  customRegistries: string[];
}
```

#### `mcp:update-settings`

Update MCP settings.

```typescript
await window.vyotiq.mcp.updateSettings({
  enabled: true,
  autoConnect: true,
});
```

#### `mcp:get-servers`

Get all registered MCP servers.

```typescript
const servers = await window.vyotiq.mcp.getServers();
```

**Response:**

```typescript
interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}
```

#### `mcp:get-server-states`

Get all server states with status information.

```typescript
const states = await window.vyotiq.mcp.getServerStates();
```

**Response:**

```typescript
interface MCPServerState {
  id: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: string;
  tools: MCPTool[];
  lastConnected?: number;
}
```

#### `mcp:register-server`

Register a new MCP server.

```typescript
await window.vyotiq.mcp.registerServer({
  id: 'filesystem',
  name: 'Filesystem Server',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/path'],
});
```

#### `mcp:connect-server`

Connect to an MCP server.

```typescript
await window.vyotiq.mcp.connectServer(serverId: string);
```

#### `mcp:disconnect-server`

Disconnect from an MCP server.

```typescript
await window.vyotiq.mcp.disconnectServer(serverId: string);
```

#### `mcp:unregister-server`

Unregister an MCP server.

```typescript
await window.vyotiq.mcp.unregisterServer(serverId: string);
```

#### `mcp:get-all-tools`

Get all tools from all connected servers.

```typescript
const tools = await window.vyotiq.mcp.getAllTools();
```

#### `mcp:execute-tool`

Execute an MCP tool.

```typescript
const result = await window.vyotiq.mcp.executeTool({
  serverId: 'filesystem',
  toolName: 'read_file',
  arguments: { path: '/path/to/file.txt' },
});
```

#### `mcp:browse-store`

Browse available servers from the registry.

```typescript
const servers = await window.vyotiq.mcp.browseStore({
  query?: string;
  category?: string;
  limit?: number;
});
```

#### `mcp:install-from-store`

Install a server from the registry.

```typescript
await window.vyotiq.mcp.installFromStore({
  serverId: 'official/filesystem',
  customEnv?: Record<string, string>,
});
```

#### `mcp:export-config`

Export MCP configuration for backup.

```typescript
const config = await window.vyotiq.mcp.exportConfig();
```

#### `mcp:import-config`

Import MCP configuration from backup.

```typescript
await window.vyotiq.mcp.importConfig(config: string);
```

---

## Agent API

The Agent API provides programmatic access to the agent system.

### Session Management

```typescript
// Create a new session
const session = await orchestrator.startSession({
  title: 'My Session',
  workspaceId: 'workspace-1',
});

// Get all sessions
const sessions = orchestrator.getSessions();

// Get sessions for a workspace
const workspaceSessions = orchestrator.getSessionsByWorkspace('workspace-1');

// Delete a session
orchestrator.deleteSession(sessionId);

// Rename a session
orchestrator.renameSession(sessionId, 'New Title');
```

### Message Operations

```typescript
// Send a message
await orchestrator.sendMessage({
  sessionId: 'session-1',
  content: 'What does this code do?',
  attachments: [
    {
      id: 'file-1',
      name: 'main.ts',
      path: '/path/to/main.ts',
      mimeType: 'text/typescript',
      size: 1024,
      content: 'const x = 1;',
    },
  ],
});

// Edit and resend a message
const result = await orchestrator.editMessageAndResend(
  sessionId,
  messageId,
  'New message content'
);

// Add a reaction to a message
await orchestrator.addReaction(sessionId, messageId, 'up');
```

### Run Control

```typescript
// Cancel the current run
await orchestrator.cancelRun(sessionId);

// Pause the current run
orchestrator.pauseRun(sessionId);

// Resume a paused run
orchestrator.resumeRun(sessionId);

// Check if run is paused
const isPaused = orchestrator.isRunPaused(sessionId);

// Regenerate the last response
await orchestrator.regenerate(sessionId);
```

### Conversation Branching

```typescript
// Create a branch from a message
const branch = orchestrator.createBranch(
  sessionId,
  messageId,
  'Alternative approach'
);

// Switch to a branch
orchestrator.switchBranch(sessionId, branchId);

// Delete a branch
orchestrator.deleteBranch(sessionId, branchId);
```

### Configuration

```typescript
// Update session config
await orchestrator.updateConfig({
  sessionId,
  config: {
    yoloMode: true,
    maxTokens: 8000,
  },
});
```

### Provider Management

```typescript
// Check if providers are available
const hasProviders = orchestrator.hasAvailableProviders();

// Get available providers
const providers = orchestrator.getAvailableProviders();

// Get provider info
const info = orchestrator.getProvidersInfo();
```

### Debugging

```typescript
// Get debug traces for a session
const traces = orchestrator.getDebugTracesForSession(sessionId);

// Get the active debug trace
const activeTrace = orchestrator.getActiveDebugTrace();

// Enable/disable debug mode
orchestrator.setDebugEnabled(true);

// Export a trace
const json = orchestrator.exportTrace(traceId, 'json');

// Update debug config
orchestrator.updateDebugConfig({
  verbose: true,
  captureFullPayloads: true,
  stepMode: false,
});

// Get all traces
const allTraces = orchestrator.getAllTraces();

// Clear traces for a session
const cleared = orchestrator.clearTracesForSession(sessionId);
```

---

## Tool API

### Tool Definition

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ParameterSchema>;
    required?: string[];
  };
}

interface ParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  enum?: unknown[];
  default?: unknown;
  items?: ParameterSchema;
}
```

### Tool Execution

```typescript
interface ToolExecutor {
  (params: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

interface ToolContext {
  workspacePath: string;
  sessionId: string;
  logger: Logger;
  terminalManager: TerminalManager;
}

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
```

### Built-in Tools

#### File Operations

**read**

```typescript
{
  name: 'read',
  parameters: {
    path: string;
    encoding?: 'utf-8' | 'base64';
  }
}
```

**write**

```typescript
{
  name: 'write',
  parameters: {
    path: string;
    content: string;
    encoding?: 'utf-8' | 'base64';
  }
}
```

**edit**

```typescript
{
  name: 'edit',
  parameters: {
    path: string;
    oldStr: string;
    newStr: string;
  }
}
```

**ls**

```typescript
{
  name: 'ls',
  parameters: {
    path: string;
    recursive?: boolean;
  }
}
```

**bulkOperations**

```typescript
{
  name: 'bulkOperations',
  parameters: {
    operations: Array<{
      type: 'read' | 'write' | 'delete' | 'rename';
      path: string;
      content?: string;
      newPath?: string;
    }>;
  }
}
```

#### Search

**grep**

```typescript
{
  name: 'grep',
  parameters: {
    pattern: string;
    path?: string;
    caseSensitive?: boolean;
  }
}
```

**glob**

```typescript
{
  name: 'glob',
  parameters: {
    pattern: string;
    cwd?: string;
  }
}
```

#### Terminal

**run**

```typescript
{
  name: 'run',
  parameters: {
    command: string;
    cwd?: string;
    shell?: string;
    timeout?: number;
  }
}
```

**checkTerminal**

```typescript
{
  name: 'checkTerminal',
  parameters: {
    pid: number;
  }
}
```

**killTerminal**

```typescript
{
  name: 'killTerminal',
  parameters: {
    pid: number;
  }
}
```

#### Browser (21 tools)

**browser_fetch**

```typescript
{
  name: 'browser_fetch',
  parameters: {
    url: string;
  }
}
```

**browser_navigate**

```typescript
{
  name: 'browser_navigate',
  parameters: {
    url: string;
  }
}
```

**browser_screenshot**

```typescript
{
  name: 'browser_screenshot',
  parameters: {
    fullPage?: boolean;
  }
}
```

**browser_click**

```typescript
{
  name: 'browser_click',
  parameters: {
    selector: string;
  }
}
```

**browser_type**

```typescript
{
  name: 'browser_type',
  parameters: {
    selector: string;
    text: string;
  }
}
```

**browser_extract**

```typescript
{
  name: 'browser_extract',
  parameters: {
    selector?: string;
  }
}
```

**browser_snapshot**

```typescript
{
  name: 'browser_snapshot',
  parameters: {}
}
```

**browser_scroll**

```typescript
{
  name: 'browser_scroll',
  parameters: {
    direction: 'up' | 'down';
    amount?: number;
  }
}
```

**browser_fill_form**

```typescript
{
  name: 'browser_fill_form',
  parameters: {
    fields: Array<{ selector: string; value: string }>;
  }
}
```

**browser_wait**

```typescript
{
  name: 'browser_wait',
  parameters: {
    selector?: string;
    timeout?: number;
  }
}
```

**browser_hover**

```typescript
{
  name: 'browser_hover',
  parameters: {
    selector: string;
  }
}
```

**browser_evaluate**

```typescript
{
  name: 'browser_evaluate',
  parameters: {
    script: string;
  }
}
```

**browser_state**

```typescript
{
  name: 'browser_state',
  parameters: {}
}
```

**browser_back / browser_forward / browser_reload**

```typescript
{
  name: 'browser_back' | 'browser_forward' | 'browser_reload',
  parameters: {}
}
```

**browser_console**

```typescript
{
  name: 'browser_console',
  parameters: {}
}
```

**browser_network**

```typescript
{
  name: 'browser_network',
  parameters: {}
}
```

**browser_tabs**

```typescript
{
  name: 'browser_tabs',
  parameters: {
    action: 'list' | 'new' | 'close' | 'switch';
    tabId?: number;
  }
}
```

**browser_security_status**

```typescript
{
  name: 'browser_security_status',
  parameters: {}
}
```

**browser_check_url**

```typescript
{
  name: 'browser_check_url',
  parameters: {
    url: string;
  }
}
```

#### LSP Code Intelligence (8 tools)

**lsp_hover**

```typescript
{
  name: 'lsp_hover',
  parameters: {
    path: string;
    line: number;
    column: number;
  }
}
```

**lsp_definition**

```typescript
{
  name: 'lsp_definition',
  parameters: {
    path: string;
    line: number;
    column: number;
  }
}
```

**lsp_references**

```typescript
{
  name: 'lsp_references',
  parameters: {
    path: string;
    line: number;
    column: number;
  }
}
```

**lsp_symbols**

```typescript
{
  name: 'lsp_symbols',
  parameters: {
    query: string;
    path?: string;
  }
}
```

**lsp_diagnostics**

```typescript
{
  name: 'lsp_diagnostics',
  parameters: {
    path: string;
  }
}
```

**lsp_completions**

```typescript
{
  name: 'lsp_completions',
  parameters: {
    path: string;
    line: number;
    column: number;
  }
}
```

**lsp_code_actions**

```typescript
{
  name: 'lsp_code_actions',
  parameters: {
    path: string;
    line: number;
    column: number;
  }
}
```

**lsp_rename**

```typescript
{
  name: 'lsp_rename',
  parameters: {
    path: string;
    line: number;
    column: number;
    newName: string;
  }
}
```

#### Linting

**readLints**

```typescript
{
  name: 'readLints',
  parameters: {
    path: string;
  }
}
```

#### Dynamic Tool Creation

**createTool**

```typescript
{
  name: 'createTool',
  parameters: {
    name: string;
    description: string;
    parameters: object;
    implementation: string;
  }
}
```

---

## MCP API

*Added in v1.4.0*

The MCP (Model Context Protocol) API provides integration with external MCP servers for dynamic tool discovery.

### MCPServerManager

The central coordinator for all MCP server connections.

```typescript
import { MCPServerManager } from './mcp';

const manager = new MCPServerManager(store);

// Register a server
manager.registerServer({
  id: 'my-server',
  name: 'My MCP Server',
  command: 'node',
  args: ['server.js'],
  env: { API_KEY: 'xxx' },
  enabled: true,
});

// Connect to server
await manager.connectServer('my-server');

// Get all tools
const tools = manager.getAllTools();

// Execute a tool
const result = await manager.executeTool('my-server', 'tool_name', { arg: 'value' });

// Disconnect
await manager.disconnectServer('my-server');

// Unregister
manager.unregisterServer('my-server');
```

### MCPClient

Handles communication with individual MCP servers.

```typescript
import { MCPClient } from './mcp';

const client = new MCPClient({
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/path'],
});

await client.connect();
const tools = await client.listTools();
const result = await client.callTool('read_file', { path: '/file.txt' });
await client.disconnect();
```

### MCPStore

Provides server discovery from community registries.

```typescript
import { getMCPStore } from './mcp';

const store = getMCPStore(manager);

// Browse available servers
const servers = await store.browse({
  query: 'filesystem',
  category: 'utilities',
  limit: 10,
});

// Install a server
await store.install({
  serverId: 'official/filesystem',
  customEnv: { PATH: '/custom/path' },
});

// Set custom registries
store.setCustomRegistries(['https://my-registry.com/servers.json']);
```

### MCP Events

The MCPServerManager emits events for server state changes:

```typescript
manager.on('server:status-changed', (serverId, status, error) => {
  console.log(`Server ${serverId} is now ${status}`);
});

manager.on('server:tools-changed', (serverId, tools) => {
  console.log(`Server ${serverId} now has ${tools.length} tools`);
});

manager.on('tools:updated', (allTools) => {
  console.log(`Total tools available: ${allTools.length}`);
});
```

### MCP Types

```typescript
interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
  description?: string;
  autoConnect?: boolean;
}

interface MCPServerState {
  id: string;
  config: MCPServerConfig;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: string;
  tools: MCPTool[];
  lastConnected?: number;
  metrics?: MCPServerMetrics;
}

interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: object;
  serverId: string;
}

interface MCPServerMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageLatency: number;
}

interface MCPSettings {
  enabled: boolean;
  autoConnect: boolean;
  connectionTimeout: number;
  customRegistries: string[];
}
```

---

## Provider API

### Provider Interface

```typescript
interface LLMProvider {
  name: LLMProviderName;
  models: Model[];
  call(request: LLMRequest): Promise<LLMResponse>;
  getStatus(): ProviderStatus;
}

type LLMProviderName = 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'openrouter';

interface LLMRequest {
  model: string;
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
  tools?: Tool[];
  systemPrompt?: string;
}

interface LLMResponse {
  content: string;
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'error';
  toolCalls?: ToolCall[];
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

interface ProviderStatus {
  available: boolean;
  healthy: boolean;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
}
```

### Supported Models

#### Anthropic

- Claude 4.5 Sonnet
- Claude Opus
- Claude Haiku

#### OpenAI

- GPT-5.2
- GPT-5.1
- GPT-4.1
- o1
- o1-mini

#### Google

- Gemini 3 Pro
- Gemini 2.5 Pro
- Gemini 2.5 Flash

#### DeepSeek

- DeepSeek V3.2
- DeepSeek V3.2 Reasoner

#### OpenRouter

- 200+ models available

---

## Event System

### Event Types

```typescript
type RendererEvent =
  | { type: 'agent-status'; sessionId: string; status: string; message?: string }
  | { type: 'session-state'; session: AgentSessionState }
  | { type: 'tool-confirmation'; payload: ConfirmToolPayload }
  | { type: 'terminal-output'; pid: number; data: string; stream: 'stdout' | 'stderr' }
  | { type: 'terminal-exit'; pid: number; code: number }
  | { type: 'terminal-error'; pid: number; error: string }
  | { type: 'browser-state'; state: BrowserState }
  | { type: 'file-changed'; path: string; changeType: string; oldPath?: string }
  | { type: 'workspace-update'; workspaces: Workspace[] }
  | { type: 'settings-update'; settings: Settings }
  | { type: 'sessions-update'; sessions: AgentSessionState[] }
  | { type: 'diagnostics-updated'; diagnostics: Diagnostic[] }
  | { type: 'lsp:diagnostics-updated'; diagnostics: Diagnostic[] };
```

### Listening to Events

```typescript
// In renderer process
window.vyotiq.on('agent:event', (event) => {
  if (event.type === 'session-state') {
    console.log('Session updated:', event.session);
  }
});

// In main process
orchestrator.on('event', (event) => {
  console.log('Event:', event);
});
```

---

## Type Definitions

### Core Types

```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: Attachment[];
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  reaction?: 'up' | 'down';
  createdAt: number;
  updatedAt?: number;
}

interface Attachment {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  size: number;
  encoding?: string;
  content?: string;
}

interface ToolCall {
  id: string;
  name: string;
  parameters: Record<string, unknown>;
}

interface ToolResult {
  toolCallId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

interface SessionConfig {
  yoloMode?: boolean;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  provider?: LLMProviderName;
}

interface ConversationBranch {
  id: string;
  name: string;
  forkPointMessageId: string;
  messages: Message[];
  createdAt: number;
}

interface Workspace {
  id: string;
  name: string;
  path: string;
  createdAt: number;
}

interface Settings {
  apiKeys: Record<string, string>;
  providerSettings: Record<string, ProviderConfig>;
  safetySettings: SafetySettings;
  cacheSettings: CacheSettings;
  debugSettings: DebugSettings;
  // ... more settings
}
```

---

## Error Handling

### Error Types

```typescript
interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Common error codes
'SESSION_NOT_FOUND'
'PROVIDER_NOT_AVAILABLE'
'TOOL_EXECUTION_FAILED'
'FILE_NOT_FOUND'
'PERMISSION_DENIED'
'INVALID_PARAMETERS'
'TIMEOUT'
'RATE_LIMITED'
```

### Error Handling Pattern

```typescript
try {
  const result = await window.vyotiq.agent.sendMessage(payload);
} catch (error) {
  if (error instanceof Error) {
    console.error('Error:', error.message);
  } else {
    console.error('Unknown error:', error);
  }
}
```

---

## Rate Limiting

### Rate Limit Headers

Responses include rate limit information:

```typescript
interface RateLimitInfo {
  remaining: number;
  reset: number;
  limit: number;
}
```

### Handling Rate Limits

The system automatically:

- Detects rate limit errors
- Switches to alternative providers
- Implements exponential backoff
- Queues requests for retry

---

## Caching

### Cache Configuration

```typescript
interface CacheSettings {
  toolCache?: {
    enabled: boolean;
    defaultTtlMs: number;
    maxEntries: number;
  };
  contextCache?: {
    enabled: boolean;
    maxSizeMb: number;
    defaultTtlMs: number;
  };
  promptCacheStrategy: 'aggressive' | 'moderate' | 'conservative';
}
```

### System Prompt Module

> Last updated: January 2026

The system prompt module provides modular, cached prompt generation with dynamic context injection.

#### Module Structure

```text
src/main/agent/systemPrompt/
├── index.ts              # Re-exports (backward compatible)
├── builder.ts            # Main prompt assembly
├── sections.ts           # Static prompt sections (cached)
├── dynamicSections.ts    # Context-aware sections (per-request)
├── contextInjection.ts   # Rule-based context injection
├── cache.ts              # Prompt caching for performance
└── types.ts              # Type definitions
```

#### Prompt Module Exports

> Last updated: January 2026

```typescript
// Import from either location (backward compatible)
import { 
  // Main builder
  buildSystemPrompt,
  
  // Cache
  SystemPromptCache, 
  getSystemPromptCache,
  
  // Static sections
  PROMPT_SECTIONS,
  getStaticSections,
  getStaticContent,
  CORE_IDENTITY,
  CAPABILITIES,
  RESPONSE_STYLE,
  CODING_QUESTIONS,
  RULES,
  KEY_FEATURES,
  TOOLS_REFERENCE,
  TOOL_WORKFLOWS,
  GOAL,
  SUBAGENTS,
  IMPORTANT_REMINDERS,
  CLOSING_REMINDER,
  
  // Legacy aliases (backward compatible)
  CRITICAL_RULES,      // alias for RULES
  TOOL_HINTS,          // alias for TOOL_WORKFLOWS
  OUTPUT_FORMATTING,   // alias for RESPONSE_STYLE
  
  // Dynamic section builders
  buildCoreContext,
  buildCoreTools,
  buildTerminalContext,
  buildEditorContext,
  buildWorkspaceDiagnosticsContext,
  buildTaskAnalysisContext,
  buildWorkspaceStructureContext,
  buildAccessLevelSection,
  buildPersonaSection,
  buildCustomPromptSection,
  buildAdditionalInstructions,
  buildCommunicationStyle,
  
  // Context injection
  buildInjectedContext,
  evaluateContextInjectionCondition,
  processContextRuleTemplate,
  
  // Settings
  DEFAULT_PROMPT_SETTINGS,
  
  // Types
  type SystemPromptContext,
  type PromptSection,
  type CachedPrompt,
  type ToolDefForPrompt,
  type TerminalProcessInfo,
  type TerminalContextInfo,
  type EditorContextInfo,
  type WorkspaceDiagnosticsInfo,
  type TaskAnalysisContext,
  type WorkspaceStructureContext,
  type InternalTerminalSettings,
} from '@/main/agent/systemPrompt';
```

#### Building System Prompts

```typescript
// Build complete system prompt with context
const prompt = buildSystemPrompt({
  session,
  providerName: 'anthropic',
  modelId: 'claude-4-sonnet',
  workspace: { id: 'ws-1', path: '/project' },
  toolsList: 'read, write, edit, run',
  promptSettings,
  accessLevelSettings,
  terminalContext,
  editorContext,
});
```

#### Cache Management

```typescript
const cache = getSystemPromptCache();

// Get cached static content
const cached = cache.getStaticPrompt();

// Build prompt with dynamic sections
const prompt = cache.buildPrompt(['<context>...</context>']);

// Check cache status
cache.isValid();
cache.getEstimatedTokens();
cache.invalidate();
```

#### Core Types

```typescript
interface SystemPromptContext {
  session: InternalSession;
  providerName: string;
  modelId: string;
  workspace?: { id: string; path: string; name?: string };
  toolsList: string;
  toolDefinitions?: ToolDefForPrompt[];
  promptSettings: PromptSettings;
  accessLevelSettings?: AccessLevelSettings;
  terminalContext?: TerminalContextInfo;
  editorContext?: EditorContextInfo;
  workspaceDiagnostics?: WorkspaceDiagnosticsInfo;
  taskAnalysis?: TaskAnalysisContext;
  workspaceStructure?: WorkspaceStructureContext;
  logger?: Logger;
}

interface CachedPrompt {
  staticContent: string;
  staticHash: string;
  createdAt: number;
  estimatedTokens: number;
}

interface PromptSection {
  id: string;
  name: string;
  priority: number;
  isStatic: boolean;
  content: string | ((context: SystemPromptContext) => string);
}
```

### Cache Keys

- Tool results: `{toolName}:{parametersHash}`
- Context: `{sessionId}:{messageCount}`
- Prompts: Provider-specific (Anthropic, OpenAI, etc.)

---

## Best Practices

### Error Handling

1. Always catch errors from async operations
2. Log errors with context
3. Provide user-friendly error messages
4. Implement retry logic for transient errors

### Performance

1. Use caching for repeated operations
2. Batch file operations when possible
3. Stream large responses
4. Debounce frequent updates

### Security

1. Validate all user input
2. Sanitize file paths
3. Check permissions before operations
4. Log security-relevant events

### Testing

1. Mock IPC calls in tests
2. Test error scenarios
3. Verify event emissions
4. Test with various data sizes
