# Changelog

All notable changes to Vyotiq AI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- Error handling in semantic indexer and vector store

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

## [1.1.0] - 2026-01-15

### Added

- Local AI-powered semantic search using vector embeddings
- `codebase_search` tool for semantic code discovery
- Transformers.js with ONNX runtime for local embeddings
- Language-aware code chunking for 15+ languages
- Background workspace indexing with progress tracking
- Optional GPU acceleration for faster indexing

## [1.0.0] - 2026-01-10

### Added

- Initial release of Vyotiq AI
- Multi-provider LLM support (Anthropic, OpenAI, Google, DeepSeek, OpenRouter)
- 40+ built-in tools for file, terminal, and browser automation
- Monaco code editor with syntax highlighting
- Integrated terminal with PTY support
- Playwright-based browser automation
- Session persistence with SQLite
- Conversation branching and history

[Unreleased]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/vyotiq-ai/vyotiq-agent/releases/tag/v1.0.0
