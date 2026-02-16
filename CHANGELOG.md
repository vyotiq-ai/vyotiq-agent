# Changelog

All notable changes to Vyotiq AI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.7.0...HEAD
[1.7.0]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/vyotiq-ai/vyotiq-agent/releases/tag/v1.0.0
