# Vyotiq AI - Architecture Documentation

## Table of Contents

1. [System Overview](#system-overview)
2. [Core Architecture](#core-architecture)
3. [Main Process (Electron)](#main-process-electron)
4. [Renderer Process (React)](#renderer-process-react)
5. [Agent System](#agent-system)
6. [Tool System](#tool-system)
7. [State Management](#state-management)
8. [Communication Patterns](#communication-patterns)
9. [Data Flow](#data-flow)

---

## System Overview

Vyotiq AI is a desktop application built with **Electron** and **React** that provides an AI-powered coding assistant with autonomous agent capabilities. The application follows a multi-process architecture:

- **Main Process**: Electron main process running Node.js (handles system operations, file I/O, terminal management)
- **Renderer Process**: React frontend running in Chromium (handles UI and user interactions)
- **IPC Bridge**: Secure communication between main and renderer processes

### Key Principles

- **Local-First**: All data stays on the user's machine
- **Privacy-Focused**: Code and context never leave the user's computer (only API calls to chosen providers)
- **Modular**: Each feature is self-contained and independently testable
- **Type-Safe**: Full TypeScript implementation with strict mode enabled

---

## Core Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                    Electron Application                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────┐          ┌──────────────────────┐ │
│  │   Main Process       │          │  Renderer Process    │ │
│  │   (Node.js)          │◄────────►│  (React/Chromium)    │ │
│  │                      │   IPC    │                      │ │
│  │ • Agent Orchestrator │          │ • Chat Interface     │ │
│  │ • Tool System        │          │ • Editor             │ │
│  │ • Terminal Manager   │          │ • Terminal Panel     │ │
│  │ • File Operations    │          │ • Browser Panel      │ │
│  │ • LSP Integration    │          │ • Settings Panel     │ │
│  │ • Git Integration    │          │ • Session Manager    │ │
│  │ • Database (SQLite)  │          │ • State Management   │ │
│  │                      │          │                      │ │
│  └──────────────────────┘          └──────────────────────┘ │
│                                                               │
└─────────────────────────────────────────────────────────────┘
         │                                          │
         │                                          │
         ▼                                          ▼
    ┌─────────────┐                        ┌──────────────┐
    │ File System │                        │ External APIs│
    │ Terminal    │                        │ • Claude     │
    │ Git Repos   │                        │ • GPT-5      │
    │ SQLite DB   │                        │ • Gemini     │
    └─────────────┘                        │ • DeepSeek   │
                                           │ • OpenRouter │
                                           └──────────────┘
```

---

## Main Process (Electron)

### Directory Structure

```text
src/main/
├── agent/                    # AI agent system (core)
│   ├── orchestrator.ts       # Main agent coordinator
│   ├── sessionManager.ts     # Conversation persistence
│   ├── runExecutor.ts        # Agent loop execution
│   ├── providers/            # LLM provider integrations
│   ├── context/              # Context management & summarization
│   ├── cache/                # Caching systems (prompt, tool result, context)
│   ├── semantic/             # Vector embeddings & semantic search
│   ├── compliance/           # Safety & compliance checks
│   ├── recovery/             # Error recovery & self-healing
│   ├── debugging/            # Execution tracing & debugging
│   ├── systemPrompt/         # System prompt building & caching
│   ├── settingsStore.ts      # Settings persistence
│   └── providerManager.ts    # Provider lifecycle management
│
├── mcp/                      # Model Context Protocol (v1.4.0+)
│   ├── MCPServerManager.ts   # Server lifecycle management
│   ├── MCPClient.ts          # Client connections
│   ├── MCPStore.ts           # Configuration persistence
│   ├── MCPToolAdapter.ts     # Tool conversion
│   ├── MCPContextProvider.ts # Context injection
│   └── registry/             # Dynamic server registry
│
├── tools/                    # Tool system
│   ├── implementations/      # Built-in tools (20+)
│   ├── factory/              # Dynamic tool creation
│   ├── executor/             # Tool execution engine
│   └── registry/             # Tool registry & discovery
│
├── browser/                  # Browser automation
│   ├── manager.ts            # Browser lifecycle
│   └── handlers/             # Browser action handlers
│
├── lsp/                      # Language Server Protocol
│   ├── manager.ts            # LSP server management
│   └── bridge.ts             # File change synchronization
│
├── workspaces/               # Workspace management
│   ├── workspaceManager.ts   # Workspace lifecycle
│   └── fileWatcher.ts        # Real-time file monitoring
│
├── ipc.ts                    # IPC handlers
├── logger.ts                 # Logging system
└── git.ts                    # Git integration
```

### Agent Orchestrator

The `AgentOrchestrator` is the central coordinator that manages:

- **Session Management**: Create, load, and persist conversations
- **Run Execution**: Execute agent loops with tool calls
- **Provider Management**: Manage LLM provider lifecycle and failover
- **Tool Registry**: Register and execute tools
- **Event Emission**: Broadcast events to the renderer process

```typescript
// Core orchestrator flow
orchestrator.startSession()
  ├─ Create new session
  ├─ Initialize workspace context
  └─ Emit session-state event

orchestrator.sendMessage(payload)
  ├─ Add user message to session
  ├─ Persist session state
  └─ Execute run (agent loop)

runExecutor.executeRun(session)
  ├─ Get LLM response
  ├─ Parse tool calls
  ├─ Execute tools
  ├─ Collect results
  └─ Repeat until completion
```

### Tool System

Tools are the interface between the agent and the system. Each tool:

- Has a schema (name, description, parameters)
- Implements execution logic
- Returns structured results
- Can be confirmed by user before execution (safety)

#### Built-in Tools (40+)

##### File Operations (7 tools)

- `read` - Read file contents
- `write` - Write/create files
- `edit` - Edit specific lines in files
- `ls` - List directory contents
- `grep` - Search file contents
- `glob` - Find files by pattern
- `bulkOperations` - Batch file operations
##### Semantic Search (1 tool)

- `codebase_search` - AI-powered semantic code search using vector embeddings

##### Terminal (3 tools)

**Terminal (3 tools)**
- `run` - Execute shell commands
##### Browser Automation (21 tools)
l status
- `killTerminal` - Kill terminal process

**Browser Automation (21 tools)**
- `browser_fetch` - Fetch web content
- `browser_navigate` - Navigate to URL
- `browser_extract` - Extract page content
- `browser_snapshot` - Get page structure
- `browser_screenshot` - Capture screenshots
- `browser_click` - Click elements
- `browser_type` - Type text
- `browser_scroll` - Scroll page
- `browser_fill_form` - Fill form fields
- `browser_wait` - Wait for conditions
- `browser_hover` - Hover interactions
- `browser_evaluate` - Execute JavaScript
- `browser_state` - Get browser state
- `browser_back` - Navigate back
- `browser_forward` - Navigate forward
- `browser_reload` - Reload page
- `browser_console` - Get console logs
- `browser_network` - Monitor network requests
- `browser_tabs` - Tab management
##### LSP Code Intelligence (8 tools)ity monitoring
- `browser_check_url` - URL safety check

**LSP Code Intelligence (8 tools)**

- `lsp_hover` - Get hover information
- `lsp_definition` - Go to definition
- `lsp_references` - Find references
- `lsp_symbols` - Search symbols
- `lsp_diagnostics` - Get diagnostics
- `lsp_completions` - Get completions
- `lsp_code_actions` - Get code actions
- `lsp_rename` - Rename symbol
##### Linting (1 tool)

- `readLints` - Get linting errors

##### Dynamic (1 tool)

**Dynamic (1 tool)**
- `createTool` - Create custom tools at runtime

### MCP Integration (Model Context Protocol)

*Last updated: v1.4.0 - January 2026*

The MCP system enables dynamic integration with external tool servers using the Model Context Protocol standard.

#### Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                     MCPServerManager                         │
│  (Central coordinator for all MCP server connections)        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │  MCPClient      │  │  MCPClient      │  │  MCPClient   │ │
│  │  (stdio)        │  │  (HTTP)         │  │  (custom)    │ │
│  └────────┬────────┘  └────────┬────────┘  └──────┬───────┘ │
│           │                    │                   │         │
│           ▼                    ▼                   ▼         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ External Server │  │ External Server │  │ MCP Server   │ │
│  │ (filesystem)    │  │ (database)      │  │ (custom)     │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  MCPToolAdapter │
                    │ (Converts MCP   │
                    │  tools to       │
                    │  internal       │
                    │  ToolDefinition)│
                    └─────────────────┘
```

#### Directory Structure

```text
src/main/mcp/
├── index.ts              # Module exports
├── MCPClient.ts          # Client connection handling
├── MCPServerManager.ts   # Server lifecycle management
├── MCPStore.ts           # Persistent configuration storage
├── MCPToolAdapter.ts     # Tool conversion to internal format
├── MCPContextProvider.ts # Context injection for prompts
└── registry/             # Dynamic server registry
    ├── MCPDynamicRegistry.ts  # Fetch available servers
    ├── cache.ts          # Registry caching
    ├── fetchers.ts       # API fetchers
    └── types.ts          # Registry types
```

#### Key Components

| Component | Purpose |
|-----------|---------|
| `MCPServerManager` | Manages server lifecycle (connect, disconnect, reconnect) |
| `MCPClient` | Handles communication with individual MCP servers |
| `MCPStore` | Persists server configurations to SQLite |
| `MCPToolAdapter` | Converts MCP tools to internal `ToolDefinition` format |
| `MCPDynamicRegistry` | Discovers available servers from community sources |

#### Usage

```typescript
import { MCPServerManager } from './mcp';

// Initialize manager
const mcpManager = new MCPServerManager(store);

// Add a server
await mcpManager.addServer({
  name: 'filesystem',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/path'],
});

// Get available tools
const tools = mcpManager.getAllTools();

// Execute a tool
const result = await mcpManager.executeTool('filesystem', 'read_file', { path: '/file.txt' });
```

### Session Management

Sessions are persisted to SQLite database with the following structure:

```typescript
interface AgentSessionState {
  id: string;                    // Unique session ID
  title: string;                 // User-friendly title
  workspaceId: string;           // Associated workspace
  status: 'idle' | 'running' | 'paused' | 'error';
  messages: Message[];           // Conversation history
  config: SessionConfig;         // Session-specific config
  createdAt: number;             // Creation timestamp
  updatedAt: number;             // Last update timestamp
  branches?: ConversationBranch[];// Alternative conversation paths
}
```

### Context Management

The context system handles:

- **Smart Summarization**: Compresses long conversations to fit context windows
- **Token Optimization**: Efficiently manages tokens across providers
- **Prompt Caching**: Provider-specific caching (Anthropic, OpenAI, Gemini, DeepSeek)
- **Tool Result Caching**: Configurable TTL-based caching for tool outputs

### System Prompt Module

*Last updated: January 2026*

The `systemPrompt/` module provides a modular, cached system for building system prompts:
text
```
src/main/agent/systemPrompt/
├── index.ts              # Re-exports (backward compatible)
├── builder.ts            # Main prompt assembly
├── sections.ts           # Static prompt sections (cached)
├── dynamicSections.ts    # Context-aware sections (per-request)
├── contextInjection.ts   # Rule-based context injection
├── cache.ts              # Prompt caching for performance
└── types.ts              # Type definitions
```

```typescript
import { buildSystemPrompt, getSystemPromptCache, PROMPT_SECTIONS } from './systemPrompt';

// Build a system prompt with full context
const prompt = buildSystemPrompt({
  session,
  providerName: 'anthropic',
  modelId: 'claude-4.5-sonnet',
  workspace: { id: 'ws-1', path: '/project', name: 'MyProject' },
  toolsList: 'read, write, edit, run',
  promptSettings: { /* ... */ },
});

// Use caching for performance
const cache = getSystemPromptCache();
const staticPrompt = cache.getStaticPrompt();
```

Key features:
- **Modular Architecture**: Separated static sections (cached) from dynamic sections (per-request)
- **Dynamic Context Injection**: Workspace, terminal, editor, and diagnostics context
- **Provider-Level Caching**: Static content cached with hash-based invalidation
- **XML-Structured Output**: Clear parsing for LLM consumption

---

## Renderer Process (React)
Renderer Directory Structure

```text
```
src/renderer/
├── features/                 # Feature modules
│   ├── chat/                 # Chat interface
│   ├── editor/               # Monaco code editor
│   ├── terminal/             # Terminal emulator (xterm.js)
│   ├── browser/              # Browser panel
│   ├── settings/             # Settings panel
│   ├── fileTree/             # File tree explorer
│   ├── sessions/             # Session management
│   ├── undo/                 # Undo history
│   ├── workspaces/           # Workspace switcher
│   └── onboarding/           # First-run wizard
│
├── state/                    # State management
│   ├── AgentProvider.tsx     # Agent state context
│   ├── EditorProvider.tsx    # Editor state context
│   ├── UIProvider.tsx        # UI state context
│   └── WorkspaceContextProvider.tsx
│
├── components/               # Shared UI components
│   ├── layout/               # Layout components
│   └── ui/                   # UI primitives
│
├── hooks/                    # Custom React hooks
│   ├── useAgentStatus.ts
│   ├── useSettings.ts
│   ├── useTerminalStream.ts
│   └── ... (15+ hooks)
│
├── utils/                    # Utility functions
│   ├── cn.ts                 # Class name utility
│   ├── theme.ts              # Theme management
│   ├── models.ts             # Model utilities
│   └── ... (15+ utilities)
│
└── types/                    # Type definitions
```

### State Management

Vyotiq uses three context providers for state management:

#### 1. AgentProvider (Global Agent State)

Manages:
- Active session and messages
- Agent status (running, paused, idle)
- Sessions list
- Settings and configuration

```typescript
const { 
  activeSessionId, 
  sessions, 
  settings,
  actions: { createSession, sendMessage, cancelRun }
} = useAgent();
```

#### 2. EditorProvider (Editor State)

Manages:
- Open tabs and active tab
- File content and dirty state
- Undo/redo history

```typescript
const { 
  tabs, 
  activeTabId, 
  actions: { openFile, saveFile }
} = useEditor();
```

#### 3. UIProvider (UI-Only State)

Manages:
- Panel visibility (browser, settings)
- Panel sizes (resizable panels)
- Modal states (shortcuts, command palette)
- Theme and layout preferences

```typescript
const { 
  browserPanelOpen, 
  browserPanelWidth,
  actions: { openBrowserPanel, setBrowserPanelWidth }
} = useUI();
```

### Component Architecture

Components follow a strict separation of concerns:

```text
components/
├── ui/                       # Reusable UI primitives
│   ├── Button.tsx
│   ├── Modal.tsx
│   ├── Input.tsx
│   └── ... (10+ primitives)
│
└── layout/                   # App structure
    ├── MainLayout.tsx        # Main app layout
    ├── Sidebar.tsx           # Left sidebar
    └── Header.tsx            # Top header

features/
├── chat/
│   ├── ChatPanel.tsx         # Main chat component
│   ├── MessageList.tsx       # Message rendering
│   ├── ChatInput.tsx         # Input component
│   └── hooks/                # Feature-specific hooks
│
├── editor/
│   ├── EditorPanel.tsx       # Editor container
│   ├── TabBar.tsx            # Tab management
│   └── hooks/                # Feature-specific hooks
│
└── ... (other features)
```

### Styling

- **Tailwind CSS v4**: Utility-first styling
- **CSS Variables**: Theme colors (dark mode by default)
- **Responsive Design**: Mobile-friendly layouts
- **Accessibility**: WCAG 2.1 AA compliance

```typescript
// Theme variables
--color-surface-base
--color-surface-header
--color-text-primary
--color-text-secondary
--color-accent-primary
--color-border-subtle
```

---

## Agent System

### Agent Loop

The agent operates in a loop:

```text
1. Get LLM Response
   ├─ Build context (messages, workspace, diagnostics)
   ├─ Call LLM provider
   └─ Parse response

2. Parse Tool Calls
   ├─ Extract tool names and parameters
   ├─ Validate against tool schema
   └─ Request user confirmation (if enabled)

3. Execute Tools
   ├─ Run tool implementation
   ├─ Capture output/errors
   └─ Collect results

4. Process Results
   ├─ Add assistant message
   ├─ Add tool results
   ├─ Update session state
   └─ Emit events to renderer

5. Check Completion
   ├─ If stop_reason === "end_turn" → Done
   ├─ If tool calls remain → Go to step 2
   └─ If error → Error recovery
```

### Provider System

Supports multiple LLM providers with intelligent routing:

```typescript
interface LLMProvider {
  name: LLMProviderName;
  models: Model[];
  call(request: LLMRequest): Promise<LLMResponse>;
  getStatus(): ProviderStatus;
}

// Supported providers
- Anthropic (Claude 4.5 Sonnet, Opus, Haiku)
- OpenAI (GPT-5.2, GPT-5.1, GPT-4.1, o-series)
- Google (Gemini 3 Pro, 2.5 Pro/Flash)
- DeepSeek (V3.2, V3.2 Reasoner)
- OpenRouter (200+ models)
```

### Error Recovery

The recovery system provides:

- **Error Classification**: Categorizes errors for appropriate handling
- **Diagnostic Engine**: Analyzes root causes
- **Recovery Strategies**: Retry, fallback, context reduction, tool substitution
- **Self-Healing Agent**: Attempts automatic recovery before failing

---

## Tool System

### Tool Execution Flow Diagram

```text
Tool Request
    ↓
Validate Schema
    ↓
Check Safety Rules
    ↓
Request Confirmation (if enabled)
    ↓
Execute Tool
    ├─ File operations
    ├─ Terminal commands
    ├─ Browser actions
    ├─ LSP queries
    └─ Custom tools
    ↓
Capture Results
    ↓
Cache Results (if enabled)
    ↓
Return to Agent
```

### Tool Confirmation

Safety-critical tools require user confirmation:

```typescript
interface ToolConfirmation {
  toolName: string;
  parameters: Record<string, unknown>;
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  estimatedImpact: string;
}
```

---

## State Management

### State Data Flow

```text
User Input
    ↓
Renderer (React)
    ├─ Update local state
    ├─ Emit IPC event
    └─ Update UI
    ↓
Main Process (Electron)
    ├─ Process request
    ├─ Update database
    ├─ Execute operations
    └─ Emit IPC event
    ↓
Renderer (React)
    ├─ Update context
    ├─ Re-render components
    └─ Display results
```

### Session Persistence

Sessions are persisted to SQLite with automatic saving:

```typescript
// Session saved on:
- New message added
- Tool executed
- Session config changed
- Session renamed
- Branch created/switched
```

---

## Communication Patterns

### IPC Channels

Main ↔ Renderer communication uses typed IPC channels:

```typescript
// Renderer → Main
ipc.invoke('agent:sendMessage', payload)
ipc.invoke('agent:confirmTool', payload)
ipc.invoke('editor:saveFile', payload)
ipc.invoke('terminal:run', payload)

// Main → Renderer (events)
ipc.on('agent:event', handler)
ipc.on('terminal:output', handler)
ipc.on('browser:state-changed', handler)
ipc.on('files:changed', handler)
```

### Event System

The orchestrator emits events that flow to the renderer:

```typescript
type RendererEvent = 
  | { type: 'agent-status'; status: string; message?: string }
  | { type: 'session-state'; session: AgentSessionState }
  | { type: 'tool-confirmation'; payload: ConfirmToolPayload }
  | { type: 'terminal-output'; pid: number; data: string }
  | { type: 'browser-state'; state: BrowserState }
  | { type: 'file-changed'; path: string; changeType: string }
  | ...
```

---

## Data Flow

### Message Sending Flow Diagram

```text
User types message
    ↓
ChatInput component
    ↓
useAgent().sendMessage()
    ↓
IPC: agent:sendMessage
    ↓
Orchestrator.sendMessage()
    ├─ Add message to session
    ├─ Persist to database
    ├─ Emit session-state event
    └─ Execute run
    ↓
RunExecutor.executeRun()
    ├─ Get LLM response
    ├─ Parse tool calls
    ├─ Execute tools
    └─ Emit events
    ↓
IPC: agent:event
    ↓
AgentProvider context
    ↓
Components re-render
    ↓
UI updates
```

### File Operation Flow Diagram

```text
User edits file in editor
    ↓
EditorProvider updates state
    ↓
User clicks "Save"
    ↓
IPC: editor:saveFile
    ↓
Main process writes to disk
    ↓
File watcher detects change
    ↓
LSP bridge notifies LSP servers
    ↓
Diagnostics updated
    ↓
IPC: diagnostics:updated
    ↓
EditorProvider updates diagnostics
    ↓
UI shows updated diagnostics
```

---

## Performance Considerations

### Optimization Strategies

1. **Code Splitting**: Lazy load heavy components (Settings, Terminal, Browser)
2. **Memoization**: Prevent unnecessary re-renders with `useMemo` and `useCallback`
3. **Virtualization**: Virtualize long lists (messages, file tree)
4. **Caching**: Cache tool results, context, and LLM responses
5. **Debouncing**: Debounce editor state updates and file watcher events

### Memory Management

- Terminal processes are cleaned up on exit
- Old sessions are archived after 30 days (configurable)
- Large files are streamed instead of loaded entirely
- Context is compressed for long conversations

---

## Security Considerations

### Safety Boundaries

- **Protected Paths**: Prevent access to `.git`, `.env`, `node_modules`
- **Blocked Commands**: Prevent dangerous shell commands
- **Tool Confirmation**: Review dangerous operations before execution
- **Audit Trail**: Complete logging of all agent actions
- **Auto-Backup**: Automatic backup before file modifications

### Data Privacy

- **Local-First**: All data stored locally on user's machine
- **No Telemetry**: No tracking or analytics
- **Encrypted Storage**: Sensitive data encrypted at rest
- **Secure IPC**: Sandboxed renderer process with context isolation

---

## Extension Points

### Adding New Tools

1. Create tool implementation in `src/main/tools/implementations/`
2. Export from `src/main/tools/implementations/index.ts`
3. Register in `ALL_TOOLS` array
4. Tool automatically available to agent

### Adding New Providers

1. Extend `BaseProvider` class
2. Implement `call()` method
3. Add to `src/main/agent/providers/index.ts`
4. Configure API key in settings

### Adding New Features

1. Create feature module in `src/renderer/features/{name}/`
2. Add state management if needed
3. Create UI components
4. Add IPC handlers if needed
5. Integrate into main layout

---

## Debugging

### Logging

- Main process logs: `src/main/logger.ts`
- Renderer logs: Browser DevTools console
- Log levels: debug, info, warn, error

### DevTools

- Electron DevTools: `Ctrl+Shift+I` (main process)
- Chrome DevTools: `Ctrl+Shift+I` (renderer process)
- Network tab: Monitor IPC and API calls

### Execution Tracing

- Enable debug mode in settings
- View execution traces in debug panel
- Export traces as JSON, Markdown, or HTML

---

## Semantic Indexing Module

*Added: January 2026*

The `semantic/` module provides local vector embeddings and AI-powered code search:

```text
src/main/agent/semantic/
├── index.ts                  # Module exports
├── EmbeddingService.ts       # Transformers.js embedding generation
├── VectorStore.ts            # SQLite-backed vector storage with HNSW
├── CodeChunker.ts            # Language-aware code chunking
├── SemanticIndexer.ts        # Workspace indexing orchestrator
├── SemanticContextProvider.ts # Context retrieval for prompts
└── WorkspaceAnalyzer.ts      # Project structure analysis
```

### Components

#### EmbeddingService

- Uses Transformers.js with ONNX runtime for local inference
- Supports GPU acceleration (optional)
- Caches embeddings for repeated queries
- Quality presets: fast, balanced, quality


#### VectorStore
- SQLite-backed persistent storage
- HNSW algorithm for similarity search
- Configurable M and efSearch parameters
- Automatic index optimization


#### CodeChunker
- Language-aware code splitting (15+ languages)
- Preserves semantic boundaries (functions, classes)

- Configurable chunk sizes

#### SemanticIndexer
- Orchestrates workspace indexing
- Progress tracking with time estimates
- File change watching for incremental updates
- Abort capability for long operations

### Usage

```typescript
import { getSemanticIndexer, getSemanticContextForQuery } from './semantic';

// Index a workspace
const indexer = getSemanticIndexer();
await indexer.indexWorkspace('/path/to/workspace', {
  onProgress: (progress) => console.log(progress),
});

// Search the codebase
const result = await indexer.search({
  query: 'authentication logic',
  options: { limit: 10, minScore: 0.3 },
});

// Get context for prompt injection
const context = await getSemanticContextForQuery(
  '/path/to/workspace',
  'user query',
  { maxSnippets: 5, maxTotalLength: 4000 }
);
```


### Settings

Configurable via Settings → Indexing:
- Enable/disable indexing
- Auto-index on startup
- Watch for file changes
- Chunk size configuration
- File type filters
- Exclude patterns
- GPU acceleration
- HNSW parameters

---
