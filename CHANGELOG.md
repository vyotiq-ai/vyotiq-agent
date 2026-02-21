# Changelog

All notable changes to Vyotiq AI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.9.0] - 2026-02-21

### Added

- **Session Health Indicator**: New `SessionHealthIndicator` component showing real-time session health status (warning/critical) in the chat input bar
- **Cache IPC Handlers**: Expose cache statistics (prompt, tool, context) and management operations to the renderer via new `cacheHandlers` IPC module
- **Rust Backend IPC Bridge**: New `rustBackendHandlers` bridging Electron main process to Rust sidecar for workspace/indexing/search via IPC
- **Transient Sessions**: `registerTransientSession()` / `unregisterTransientSession()` in `SessionManager` for in-memory-only sessions that bypass persistence
- **Budget Enforcement Post-Confirmation**: `RunExecutor` now checks cost budget after tool confirmations, stopping runs that exceed limits mid-execution
- **Workspace Exclude/Include Patterns**: Rust backend supports user-configurable exclude patterns (`VYOTIQ_EXCLUDE_PATTERNS`) and include patterns (`VYOTIQ_INCLUDE_PATTERNS`) for indexing
- **File Watcher Toggle**: Rust backend supports disabling file watchers via `VYOTIQ_ENABLE_FILE_WATCHER` env var, forwarded from app settings
- **Auth Token Change Events**: `onAuthTokenChanged` IPC channel so the renderer auto-refreshes its sidecar auth token after Rust sidecar restarts
- **Workspace Settings Hot-Reload**: Changing workspace indexing settings now restarts the Rust sidecar with new config and pushes fresh auth token to the renderer
- **LSP Extensions**: Add `typeDefinition`, `implementations`, and `prepareRename` APIs; add `onDiagnosticsSnapshot`, `onFileDiagnosticsUpdated`, and `onDiagnosticsCleared` subscriptions
- **Debug APIs**: Add `getBatcherStats()`, `getThrottleStatus()`, and `getAllTraces()` APIs for IPC event batcher and throttle debugging
- **Incomplete-Implementation Compliance**: New `incomplete-implementation` violation type for placeholder/stub code detection

### Changed

- **Status Indicators Redesign**: Replace colored dot indicators with monospace text labels (`[RUN]`, `[IDLE]`, `[PAUSE]`, `[OK]`, `[ERR]`, `[ACTIVE]`, `[WAIT]`, `[ready]`) throughout settings, debugging, session selector, editor tabs, and home page
- **Chat Scroll Rewrite**: Complete rewrite of `useChatScroll` with adaptive threshold scaling, direction-aware intent detection, programmatic scroll isolation, and ~30fps RAF streaming loop
- **Virtualized List Improvements**: Direction-aware auto-scroll re-engagement, explicit `resetUserScroll` API, streaming RAF loop, and measurement batching via ref + version counter
- **Simplified Resize Handles**: Replace three-dot drag affordances with single-line handles in `MainLayout` and `BottomPanel`
- **Simplified IndexStatusPanel**: Remove colored dot indicators, use text-only status display for compact and full modes
- **Streaming Indicator**: Replace pulsing dot indicator with `...` text in `ThinkingPanel` streaming state
- **Session Option Selector**: Replace `Circle` icons with Unicode bullet characters for session selection indicators
- **Provider Capabilities**: Mark Anthropic as supporting thinking, DeepSeek as supporting vision, and Gemini as supporting caching
- **Model Routing**: Add `xai` (grok-*), `mistral` (mistral-*/pixtral-*/codestral-*), and `glm` (glm-*/chatglm*) model ID patterns to `modelBelongsToProvider`
- **Terminal Timeout**: Increase default terminal command timeout from 120s→240s and max from 600s→1200s
- **Rust Backend Startup**: Bind TCP listener before restoring workspace watchers; watchers now initialize in a background task to prevent health endpoint timeout
- **Health Check Deduplication**: `RustBackendClient.isAvailable()` deduplicates concurrent callers, caches results, and uses exponential backoff (5s–120s) when backend is unavailable
- **Session Reducer**: Use `computeSessionDelta` / `applySessionDelta` for optimized session updates that minimize object creation
- **Deep Merge Task Routing**: Deep-merge `taskMappings` and `defaultMapping` in settings updates to prevent data loss on partial updates
- **Centralized Error Classification**: Extract `isTransientError` and `isNetworkConnectivityError` into shared utilities
- **Feature Error Boundaries**: Wrap `EditorPanel`, `BottomPanel`, `SidebarFileTree`, `SearchPanel`, `SymbolOutlinePanel`, and `IndexStatusPanel` in `FeatureErrorBoundary` for crash isolation
- **Structured Logging**: Replace `console.error`/`console.warn` with structured `logger` calls across browser pool, file change notifier, file handlers, bottom panel, and agent metrics

### Removed

- `DELIVERY_SUMMARY.md`, `RELEASE_PACKAGE_SUMMARY.md`, `RELEASE_PUBLISHING_CHECKLIST.md` — outdated release documents
- Scroll-to-bottom floating button and unread count tracking from `ChatArea` (auto-scroll handling is sufficient)
- Deprecated `buildAdditionalInstructions` no-op function and its export
- Inline indexing/indexed dot indicators from `SidebarFileTree` and `WorkspaceSwitcher` (consolidated into `IndexStatusPanel`)

### Fixed

- **Sessions Flash on Reload**: Replace `SESSIONS_CLEAR` + `SESSIONS_BULK_UPSERT` with atomic `SESSIONS_REPLACE` action to prevent brief empty-state flash
- **Cross-Session Question/Decision Leakage**: Filter `pendingQuestions` and `pendingDecisions` by active session's `runId`
- **Agent IPC Session Resolution**: Resolve `sessionId` from active sessions for question/decision IPC handlers instead of passing empty string
- **Ghost Thinking Panels**: Clean up empty/whitespace-only thinking content in streaming reducer to prevent ghost reasoning panels for non-reasoning models
- **Indexing Stuck in Progress**: Rust indexer now always emits `IndexingCompleted` and `SearchReady` events even for no-op runs
- **Tantivy Writer Lock Race**: Acquire `writer_lock` during full indexing to prevent `LockBusy` errors from concurrent `reindex_file()` calls
- **Duplicate Indexing**: Remove redundant `triggerIndex()` call after `createWorkspace()` since the Rust route already spawns background indexing
- **WebSocket Subscription Cleanup**: Fix `useRustFileWatcher` to call `unsubscribeWorkspace()` on cleanup, preventing leaked subscriptions
- **Index Status Polling Fallback**: Add periodic polling fallback (5s while indexing, 30s idle) to recover from missed WebSocket events
- **Session Delete Confirmation Leak**: Clean up `pendingConfirmations` belonging to a deleted session
- **Auth-Stale WebSocket Reconnect**: Refresh auth token on WebSocket handshake failure instead of entering tight health-check loop
- **ESLint JSON Corruption**: Strip ANSI escape sequences and terminal control codes from ESLint output before JSON parsing in `readLints` tool
- **Preload TDZ Crash**: Disable minification and enable `keepNames` in `vite.preload.config.ts` to prevent `const` reordering causing TDZ errors in production builds
- **Main-Process Auth Headers**: Add auth headers to all `MainRustBackendClient` HTTP requests that were previously unauthenticated
- **RustBackendClient Init Race**: Await `rustBackend.init()` and check cancellation before updating state to prevent race conditions
- **MCP ESM Import**: Change `syncMCPSettingsToManager` from `require()` to dynamic `import()` to avoid Vite bundling issues
- **File Diff Action Shadow**: Rename destructured `action` from `FILE_DIFF_STREAM` payload to `diffAction` to avoid shadowing reducer parameter
- **SESSIONS_CLEAR Missing State**: Add `fileDiffStreams: {}` reset to prevent stale diff state

## [1.8.0] - 2026-02-17

### Added

- **LSP Client Integration**:
  - `lspBridge.ts` renderer-side bridge for LSP communication via IPC
  - `useLSP` hook for managing LSP lifecycle, document sync, and diagnostics
  - Auto-initialization of LSP when workspace opens in `MainLayout`
  - Debounced document change synchronization in `MonacoWrapper`
  - LSP provider registration for Monaco (completions, hover, definitions, references, code actions)
  - `lsp/index.ts` barrel for clean public API
- **Editor Context Menu**: VS Code-like right-click menu with Go to Definition, Find References, Peek, Rename, Format, Quick Fix, clipboard, and navigation actions
- **Go to Line Dialog**: `Ctrl+G` dialog supporting `line:column` format navigation
- **Editor Settings Panel**: `Ctrl+,` panel with categorized settings (appearance, behavior, formatting, IntelliSense) persisted via localStorage
- **Symbol Outline Panel**: New sidebar tab (`Ctrl+Shift+O`) displaying document symbols from LSP with filtering and hierarchical display
- **`useEditorActions` Hook**: Imperative editor actions (Go to Definition, Rename, Format, clipboard, etc.) via Monaco commands
- **`useEditorSettings` Hook**: Manages extended editor settings with live application to all Monaco instances
- **File Tree Duplicate Action**: "Duplicate" option in file tree context menu with auto-naming conflict resolution

### Changed

- **Problems Panel**: Overhauled with severity filtering (errors/warnings/info), grouping by file, collapsible file sections, click-to-navigate to source location, and refreshed layout
- **MonacoWrapper**: Extended with `onEditorMount` and `onContextMenu` callbacks, LSP document open/change/close notifications, and persisted editor settings application
- **EditorPanel**: Integrated context menu, Go to Line, and settings panel; added `Ctrl+G` and `Ctrl+,` keyboard shortcuts; wired `useEditorActions` for editor commands
- **Sidebar**: Added "Outline" tab with lazy-loaded `SymbolOutlinePanel` and `Ctrl+Shift+O` shortcut
- **Editor barrel exports**: Updated `features/editor/index.ts` and `hooks/index.ts` with all new components, hooks, and LSP bridge functions
- **FileTreeContextMenu**: Added "Duplicate" menu item with `Files` icon

## [1.7.0] - 2026-02-16

### Added

- Monaco editor dark/light custom theme support
- Workspace tabs provider for multi-workspace tab state management
- Centralized loading provider for global loading state
- Cost estimation utilities for token usage insights

### Changed

- Workspace indexing and embedding settings refactor
- Chat and editor UI enhancements, including no-drag behavior and button type updates
- Rust backend workspace indexing/search configuration refinements
- Internal token counter and hook cleanup for maintainability

### Fixed

- Improved workspace indexing stability across backend and UI integration

## [1.6.0] - 2026-02-02

### Added

- **Instruction Files System**:
  - `AgentsMdReader` service for parsing AGENTS.md files following the [agents.md specification](https://agents.md/)
  - `InstructionFilesReader` for multi-type instruction file support (AGENTS.md, CLAUDE.md, copilot-instructions.md, GEMINI.md, .cursor/rules)
  - YAML frontmatter parsing with metadata extraction
  - File-level enable/disable configuration
  - Priority ordering from config and frontmatter
  - Hierarchical content resolution (closest to current file wins)
- **UI Components**:
  - `TodoProgressInline` component for compact task progress display in ChatInput header
  - Expandable task progress panel in `InputHeader` showing all tasks
  - Minimal progress bar with status icons and responsive design
- **LSP Enhancements**:
  - Extended language server configurations for additional languages
  - Improved bundled server path resolution for development and production
- **Workspace Handlers**:
  - IPC handlers for instruction file discovery and retrieval
  - Workspace context API extensions

### Changed

- **System Prompt Builder**:
  - Enhanced dynamic sections with instruction files integration
  - Improved context injection with multi-source instructions
- **Chat Interface**:
  - Improved `ChatArea` with better scroll handling
  - Enhanced `MessageGroup` with updated styling
  - Refined `TodoProgress` component with better task visualization
- **InputHeader**:
  - Integrated expandable task progress panel
  - Context-aware status messages based on agent phase
- **Settings UI**:
  - Extended `SettingsPrompts` with instruction files configuration panel
  - Added toggles for each instruction file type
  - Priority ordering controls
- **Chat Input**:
  - Integrated `TodoProgressInline` in input header
  - Improved scroll behavior in `useChatScroll` hook
- **Build Configuration**:
  - Updated `forge.config.ts` with improved packaging settings

### Fixed

- Improved virtualized list performance in chat
- Better handling of large instruction files (1MB limit)
- Cache invalidation for modified instruction files
- LSP server path resolution in packaged builds

## [1.5.0] - 2026-02-02

### Added

- **UI Components**:
  - `ErrorState` component for consistent error display across the app
  - `FeatureToggle` component for feature flag management
  - `LoadingState` component for loading indicators
  - `MessageAttachments` component for chat message attachments
- **React Hooks**:
  - `useAsync` hook for async operation management
  - `useFormValidation` hook for form validation logic
  - `usePagination` hook for paginated data handling
- **Core Utilities**:
  - `eventBatcher` for batching IPC events and reducing overhead
  - `settingsValidation` for validating settings schemas
  - `performance` utilities for main process performance tracking
  - `timeFormatting` utilities for consistent time display
- **Provider Enhancements**:
  - Extended Anthropic provider with improved streaming support
  - Enhanced GLM provider with additional model configurations
  - Extended base provider with common streaming utilities
- **Documentation**:
  - Complete MCP API reference in `docs/API.md`
  - MCP architecture diagrams in `docs/ARCHITECTURE.md`
  - Enhanced release documentation with GitHub CLI examples

### Changed

- **Chat System Refactoring**:
  - Improved `ChatArea` with better scroll handling and virtualization
  - Enhanced `MessageLine` with attachment support and better rendering
  - Updated `MessageGroup` for improved message organization
  - Refactored `useChatSubmit` hook for better error handling
  - Improved `useChatScroll` with optimized scroll behavior
- **Settings UI Improvements**:
  - Enhanced `SettingsAppearance` with more customization options
- **Build Configuration**:
  - Updated `forge.config.ts` with improved build settings
  - Enhanced `vite.main.config.ts` with better optimization
  - Improved `vite.renderer.config.mjs` for faster HMR
- **MCP Client Enhancements**:
  - Improved connection handling and error recovery
  - Better tool execution with timeout handling
- **LSP Manager Improvements**:
  - Enhanced language server lifecycle management
  - Better diagnostic handling and caching
- **Code Chunker Optimization**:
  - Improved language-aware chunking for search indexing
  - Better handling of large files
- **IPC System**:
  - Added event batching for reduced IPC overhead
  - Enhanced type guards for safer IPC communication
- **Session Storage**:
  - Improved debounced persistence logic
  - Better error handling for storage operations
- **Context Injection**:
  - Enhanced system prompt context injection
  - Better workspace context handling
- **ESLint Migration**:
  - Migrated to flat config format (`eslint.config.js`)

### Removed

- `docs/context.md` - Consolidated into main documentation
- `RunProgress.tsx` - Replaced with improved `TodoProgress` component

### Fixed

- Improved scroll behavior in chat interface
- Better error handling in provider streaming
- TypeScript diagnostics service reliability improvements
- Workspace manager path handling edge cases

## [1.4.0] - 2026-01-31

### Added

- **MCP Registry System**: Dynamic registry for discovering and installing MCP servers from community sources
  - `MCPDynamicRegistry` for fetching available servers
  - Registry caching and rate limiting
  - Server metadata and version tracking
- **MCP Server Management UI**: New comprehensive UI for managing MCP servers
  - `AddServerModal` for adding new servers with guided configuration
  - `ServerDetailModal` for viewing server details, tools, and status
  - `MCPToolsList` for browsing available tools across all servers
  - `ImportExportPanel` for backing up and restoring MCP configurations
  - `EnvVarEditor` for managing environment variables per server
- **Recovery System Enhancements**:
  - `CrashRecoveryJournal` for tracking and recovering from agent crashes
  - `DeadLetterQueue` for handling failed operations
- **New React Hooks**:
  - `useAgentSelectors` for optimized state selection
  - `useAppearanceSettings` for theme and appearance management
- **UI Components**:
  - `Skeleton` loading component for improved UX
  - `MessageGroup` for better message organization in chat
- **IPC Improvements**:
  - `providerHandlers` for provider-specific IPC operations
  - `guards` for type-safe IPC validation
- **Utility Additions**:
  - `schemaValidator` for JSON schema validation of tool parameters

### Changed

- **MCP Architecture Refactoring**: Completely reorganized MCP module structure
  - Moved from `src/main/agent/mcp/` to `src/main/mcp/` for better separation of concerns
  - New `MCPClient` replaces `MCPServerConnection` with improved connection handling
  - New `MCPServerManager` replaces `MCPManager` with enhanced lifecycle management
  - New `MCPStore` for persistent MCP configuration storage
  - Simplified `MCPToolAdapter` with cleaner tool conversion logic
  - New `MCPContextProvider` with improved context injection
- **Type System Improvements**: Extensive updates to MCP types in `src/shared/types/mcp.ts`
- **Browser Tools**: Updated all 21 browser tools with improved error handling
- **System Prompt**: Enhanced dynamic sections and context injection
- **Test Infrastructure**: Improved test setup with better mocking

### Removed

- Deleted legacy MCP implementation from `src/main/agent/mcp/`:
  - `MCPManager`, `MCPServerConnection`, `MCPToolSync`
  - Transport layer (`MCPHttpTransport`, `MCPStdioTransport`)
  - Discovery system (`MCPServerDiscovery`)
  - Health monitoring (`MCPHealthMonitor`)
  - Context integration (`MCPContextIntegration`)
- Removed `MCPDiscoveryPanel` and `MCPHealthDashboard` UI components (replaced with new UI)
- Removed `.markdownlint.json` configuration file

### Fixed

- Markdown formatting across all documentation files
- Type safety improvements in IPC handlers
- Error handling in file indexer and search

## [1.3.0] - 2026-01-25

### Added

- MCP system stability improvements with enhanced error handling
- Complete TypeScript type coverage for MCP integration
- Health-related events (degraded, unhealthy, recovered) in event system
- Full MCP API types in global.d.ts

### Changed

- Fixed risk level type mismatches in MCP tools
- Added MCP metadata to tool definitions
- Corrected property access patterns in tool sync and handlers

## [1.2.0] - 2026-01-20

### Added

- Model Context Protocol (MCP) server integration
- Automatic detection of local MCP servers from known locations
- Support for stdio and HTTP-based MCP servers
- Dynamic MCP tool integration with the agent
- Real-time server status monitoring and reconnection
- Server metrics including connection statistics and latency tracking

## [1.0.0] - 2026-01-10

### Added

- Initial release of Vyotiq AI
- Multi-provider LLM support (Anthropic, OpenAI, Google, DeepSeek, OpenRouter)
- 40+ built-in tools for file, terminal, and browser automation
- Integrated terminal with PTY support
- Playwright-based browser automation
- Session persistence with SQLite
- Conversation branching and history

[Unreleased]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.9.0...HEAD
[1.9.0]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/vyotiq-ai/vyotiq-agent/releases/tag/v1.0.0
