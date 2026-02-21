# Vyotiq AI v1.9.0

**Release Date:** 2026-02-21

## 🎯 Highlights

- **Session Health Indicator** — Real-time session health monitoring displayed directly in the chat input bar
- **Configurable Workspace Indexing** — User-defined exclude/include patterns and file watcher toggle for Rust sidecar indexing
- **Auth Lifecycle Hardening** — Auto-refresh auth tokens on sidecar restart; hot-reload workspace settings with seamless reconnection
- **20+ Bug Fixes** — Session flash, cross-session leakage, ghost thinking panels, Tantivy writer lock race, preload TDZ crash, and more
- **Text-Based Status UI** — Replace all colored dot indicators with monospace text labels for a consistent terminal aesthetic

## ✨ New Features

- **Session Health Indicator**: New `SessionHealthIndicator` component shows real-time session health (warning/critical) in the chat input bar
- **Cache IPC Handlers**: Expose cache statistics (prompt, tool, context) and management operations to the renderer
- **Rust Backend IPC Bridge**: New IPC bridge for workspace/indexing/search communication with the Rust sidecar
- **Transient Sessions**: In-memory-only sessions that bypass persistence for temporary agent runs
- **Budget Enforcement Post-Confirmation**: RunExecutor checks cost budget after tool confirmations, stopping runs that exceed limits mid-execution
- **Workspace Exclude/Include Patterns**: Configurable `VYOTIQ_EXCLUDE_PATTERNS` and `VYOTIQ_INCLUDE_PATTERNS` for indexing
- **File Watcher Toggle**: Disable file watchers via settings (`VYOTIQ_ENABLE_FILE_WATCHER`)
- **Auth Token Change Events**: Renderer auto-refreshes sidecar auth token after Rust sidecar restarts
- **Workspace Settings Hot-Reload**: Changing indexing settings restarts the Rust sidecar with new config
- **LSP Extensions**: `typeDefinition`, `implementations`, `prepareRename` APIs; diagnostics snapshot/update/clear subscriptions
- **Debug APIs**: `getBatcherStats()`, `getThrottleStatus()`, `getAllTraces()` for troubleshooting

## 🐛 Bug Fixes

- **Sessions Flash on Reload**: Atomic `SESSIONS_REPLACE` prevents brief empty-state flash when reloading sessions
- **Cross-Session Leakage**: Filter pending questions/decisions by active session's `runId`
- **Ghost Thinking Panels**: Clean up whitespace-only thinking content for non-reasoning models
- **Indexing Stuck**: Rust indexer always emits completion events even for no-op runs
- **Tantivy Writer Lock Race**: Acquire writer lock during full indexing to prevent `LockBusy` errors
- **WebSocket Subscription Cleanup**: Properly unsubscribe on component cleanup to prevent leaked subscriptions
- **Index Status Polling Fallback**: Periodic polling to recover from missed WebSocket events
- **Auth-Stale WebSocket Reconnect**: Refresh auth token on handshake failure instead of tight retry loop
- **ESLint JSON Corruption**: Strip ANSI escape sequences before JSON parsing in readLints tool
- **Preload TDZ Crash**: Disable minification and enable `keepNames` in vite preload config
- **Main-Process Auth Headers**: Add missing auth headers to all `MainRustBackendClient` HTTP requests
- **RustBackendClient Init Race**: Await init and check cancellation before state updates
- **MCP ESM Import**: Switch from `require()` to dynamic `import()` to avoid Vite bundling issues

## 🔧 Improvements

- **Chat Scroll Performance**: Complete rewrite with adaptive threshold scaling, direction-aware intent detection, ~30fps RAF streaming loop
- **Virtualized List**: Direction-aware auto-scroll, explicit `resetUserScroll` API, measurement batching
- **Rust Startup Optimization**: Bind TCP before restoring watchers; watchers initialize in background task
- **Health Check Deduplication**: Deduplicate concurrent callers, cache results, exponential backoff (5s–120s)
- **WebSocket Rate-Limiting**: 2s minimum interval between reconnection attempts
- **Session Reducer Delta Updates**: `computeSessionDelta` / `applySessionDelta` for minimal object creation
- **Feature Error Boundaries**: Crash isolation for EditorPanel, BottomPanel, SidebarFileTree, SearchPanel, and more
- **Structured Logging**: Replace ad-hoc console calls with structured logger across multiple modules
- **Centralized Error Classification**: Shared `isTransientError` and `isNetworkConnectivityError` utilities

## 🎨 UI/UX Changes

- Replace colored dot indicators with text labels (`[RUN]`, `[IDLE]`, `[OK]`, `[ERR]`, `[ACTIVE]`, `[WAIT]`, `[ready]`)
- Remove floating scroll-to-bottom button (auto-scroll handling is sufficient)
- Simplify resize handles to single-line style in MainLayout and BottomPanel
- Replace pulsing dot with `...` text in ThinkingPanel streaming state
- Replace `Circle` icons with Unicode bullets in session selector

## 📚 Documentation

- Updated README "Recent Updates" section with v1.9.0 highlights
- Updated RELEASE_PROMPT.md to reference v1.9.0 as the current version
- Updated CHANGELOG.md with comprehensive v1.9.0 entry

## ⚠️ Breaking Changes

None. All changes are backward-compatible.

## 🔧 Build & Tooling

- **VS 2025 Support**: Auto-patching script for Visual Studio 2025 (version 18, toolset v145) compatibility
- **Preload Build Hardening**: Disable minification, enable sourcemaps, preserve CJS format in vite preload config
- **Terminal Timeout**: Increase default timeout from 120s→240s, max from 600s→1200s
- **Provider Capabilities**: Enable Anthropic thinking, DeepSeek vision, Gemini caching
- **Model Routing**: Add xai, mistral, and glm model ID patterns

## 📦 Dependencies

- Package-lock updates for dependency resolution changes
- No major dependency version bumps

## 🗑️ Removed

- `DELIVERY_SUMMARY.md`, `RELEASE_PACKAGE_SUMMARY.md`, `RELEASE_PUBLISHING_CHECKLIST.md` — outdated release documents
- Deprecated `buildAdditionalInstructions` function
- Inline indexing dot indicators (consolidated into IndexStatusPanel)

---

**Full Changelog:** https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.8.0...v1.9.0

## Installation

### From Release
Download the appropriate installer for your platform from the assets below.

### From Source
```bash
git clone https://github.com/vyotiq-ai/Vyotiq-AI.git
cd Vyotiq-AI
npm install
npm start
```

## System Requirements
- Node.js 20.x or higher
- Windows 10/11, macOS 12+, or Linux (Ubuntu 20.04+)
- 8GB RAM recommended
- 500MB disk space
