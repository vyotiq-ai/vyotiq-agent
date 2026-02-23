<p align="center">
  <img src="docs/assets/logo.png" alt="Vyotiq AI Logo" width="120" height="120">
</p>

<h1 align="center">Vyotiq AI</h1>

<p align="center">
  <strong>An Advanced AI-Powered Coding Assistant with Autonomous Agent Capabilities</strong>
</p>

<p align="center">
  <a href="https://github.com/vyotiq-ai/Vyotiq-AI/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT">
  </a>
  <a href="https://www.typescriptlang.org/">
    <img src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white" alt="TypeScript">
  </a>
  <a href="https://www.electronjs.org/">
    <img src="https://img.shields.io/badge/Electron-39.2-47848f?logo=electron&logoColor=white" alt="Electron">
  </a>
  <a href="https://reactjs.org/">
    <img src="https://img.shields.io/badge/React-19.2-61dafb?logo=react&logoColor=white" alt="React">
  </a>
  <a href="https://tailwindcss.com/">
    <img src="https://img.shields.io/badge/Tailwind_CSS-4.1-38bdf8?logo=tailwindcss&logoColor=white" alt="Tailwind CSS">
  </a>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-installation">Installation</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-contributing">Contributing</a> •
  <a href="#-license">License</a>
</p>

---

## 🌟 Overview

**Vyotiq AI** is a powerful desktop application that brings enterprise-grade AI assistance directly to your local development environment. Built with **Electron** and **React**, it combines multiple Large Language Models (LLMs) with an intuitive interface—all running **locally** with complete privacy.

> 💡 **Why Vyotiq-ai?** Unlike browser-based AI tools, Vyotiq-ai runs on your machine with direct access to your filesystem, terminal, and git repositories. Your code never leaves your computer—only API calls to your chosen AI provider.

### ✨ Key Highlights

| Feature | Description |
|---------|-------------|
| 🔀 **Multi-Provider AI** | Seamlessly switch between Claude, GPT, Gemini, DeepSeek, and OpenRouter |
| 🤖 **Autonomous Agents** | Advanced task execution with tool confirmation and safety guardrails |
| 💻 **Integrated IDE** | xterm.js terminal and browser automation |
| 🧠 **Context-Aware** | Smart summarization, prompt caching, and context window optimization |
| 🔍 **Full-Text Search** | Fast codebase search powered by Tantivy (BM25) indexing |
| �📊 **Git Integration** | Review changes with git diff and commit directly |
| 🔒 **Local-First** | All data stays on your machine—complete privacy |

---

## 📢 Recent Updates

### Rich Previews, Granular Settings & State Refactor (v1.10.0 - February 2026)

Feature-rich release with inline chat previews, expanded settings panels, and a major state management refactor.

**Highlights:**

- 🖼️ **File Preview Popover**: Hover-based rich previews for chat attachments — images, syntax-highlighted code, and binary metadata
- 🌐 **Browser Result Preview**: Inline visual rendering for browser tool results — screenshots, navigation, content extraction, console logs
- ⚙️ **Granular Settings**: 5 new settings panels — per-provider context windows, instruction files, expanded autonomous/routing/access control
- 🏷️ **Tool Action Descriptions**: Human-readable labels for all 40+ tools with status-specific verb forms
- 🏗️ **AgentProvider Refactor**: Event handling extracted to dedicated module (648 lines), slimming the core provider
- 🔒 **Backend Hardening**: Auth headers on all Rust backend requests, CORS restricted to localhost, browser tool cancellation support

### Indexing Config, Auth Lifecycle & UI Polish (v1.9.0 - February 2026)

Stability and polish release with configurable indexing, auth lifecycle hardening, 20+ bug fixes, and a terminal-aesthetic UI refresh.

**Highlights:**

- 🏥 **Session Health Indicator**: Real-time session health status displayed in the chat input bar
- ⚙️ **Configurable Indexing**: User-defined exclude/include patterns and file watcher toggle for workspace indexing
- 🔄 **Auth Lifecycle**: Auto-refresh auth tokens on sidecar restart; hot-reload workspace settings with seamless reconnection
- 🎨 **Text-Based Status Labels**: Replace colored dots with monospace text labels (`[RUN]`, `[IDLE]`, `[OK]`, `[ERR]`) throughout the UI
- 🚀 **Scroll Performance**: Complete rewrite of chat scroll and virtualized list with ~30fps RAF streaming and direction-aware auto-scroll
- 🐛 **20+ Bug Fixes**: Session flash on reload, cross-session leakage, ghost thinking panels, Tantivy writer lock race, preload TDZ crash, and more
- 🔧 **VS 2025 Build Support**: Auto-patching script for Visual Studio 2025 compatibility with `node-gyp`

### LSP Client Integration & Editor Enhancements (v1.8.0 - February 2026)

Major editor productivity release with full LSP client-side integration and IDE-grade editing tools.

**Highlights:**

- 🔗 **LSP Client Bridge**: Full renderer-side LSP integration with auto-initialization, document sync, and Monaco provider registration
- 📋 **Editor Context Menu**: VS Code-like right-click menu with Go to Definition, Peek, Rename, Format, Quick Fix
- 🔢 **Go to Line**: `Ctrl+G` dialog with `line:column` support
- ⚙️ **Editor Settings**: `Ctrl+,` settings panel with appearance, behavior, formatting, and IntelliSense options
- 🗺️ **Symbol Outline**: New sidebar tab (`Ctrl+Shift+O`) with filterable document symbol tree
- 🐛 **Problems Panel**: Overhauled with severity filtering, file grouping, and click-to-navigate
- 📂 **File Duplicate**: New "Duplicate" action in file tree context menu

### Editor Theming, Workspace UX & Indexing Improvements (v1.7.0 - February 2026)

Feature-focused release with editor theming, workspace UX improvements, and indexing/search refinements.

**Highlights:**

- 🎨 **Monaco Custom Themes**: New dark/light Monaco editor themes tuned for Vyotiq UI
- 🗂️ **Workspace Tabs**: Dedicated provider for multi-workspace tab state management
- ⏳ **Global Loading State**: Centralized loading provider for better cross-panel feedback
- 🔍 **Indexing & Search**: Refined workspace indexing and embedding settings across backend/frontend integration
- 💰 **Cost Insights**: Token cost estimation utilities for clearer usage visibility

### Multi-Agent Instruction Files Support (v1.6.0 - February 2026)

New instruction files system following 2025-2026 multi-agent specification standards.

**Highlights:**

- 📄 **AGENTS.md Support**: Full implementation of the [agents.md specification](https://agents.md/)
- 🔀 **Multi-Format**: Support for CLAUDE.md, copilot-instructions.md, GEMINI.md, .cursor/rules
- 📊 **TodoProgressInline**: Compact task progress display in chat input header
- ⚙️ **Settings UI**: New instruction files configuration panel with priority ordering

### UI & Developer Experience Improvements (v1.5.0 - February 2026)

Major update with new UI components, React hooks, and developer experience improvements.

**Highlights:**

- 🎨 **New UI Components**: ErrorState, LoadingState, FeatureToggle, MessageAttachments
- 🪝 **React Hooks**: useAsync, useFormValidation, usePagination for cleaner code
- ⚡ **Performance**: Event batching, improved virtualization, optimized HMR
- 📚 **Documentation**: Complete MCP API reference and architecture docs
- 🔧 **Build System**: ESLint flat config, improved Vite configuration
- 🛡️ **Settings**: Schema validation and enhanced appearance options

### MCP System Refactoring (v1.4.0 - January 2026)

Complete architectural overhaul of the Model Context Protocol system with new registry, enhanced UI, and improved reliability.

**Features:**

- 📦 **MCP Registry**: Dynamic server discovery and installation from community sources
- 🖥️ **Enhanced UI**: New modals for adding, configuring, and managing MCP servers
- 🔧 **Import/Export**: Backup and restore MCP configurations
- 🛡️ **Crash Recovery**: New journal and dead letter queue for improved reliability
- ⚡ **Performance**: Optimized state selection hooks and improved error handling

### MCP System Stability & Type Safety (v1.3.0 - January 2026)

Major improvements to MCP integration with enhanced stability, better error handling, and complete TypeScript type coverage.

**Improvements:**

- 🛡️ **Type Safety**: Fixed risk level type mismatches, added MCP metadata to tool definitions
- 🔧 **API Fixes**: Corrected property access patterns in tool sync and handlers
- 💚 **Health Events**: Extended event system with health-related events
- 🔄 **Better Sync**: Improved tool synchronization between MCP servers and agent
- 📘 **Complete Type Declarations**: Full MCP API types in global.d.ts

### MCP Server Integration (v1.2.0 - January 2026)

Added comprehensive Model Context Protocol (MCP) server integration for dynamic tool discovery and external server connections.

**Features:**

- 🔌 **Server Discovery**: Automatic detection of local MCP servers from known locations
- 📡 **Multiple Transports**: Support for stdio and HTTP-based MCP servers
- 🔧 **Dynamic Tool Integration**: MCP tools seamlessly available in the agent
- 📊 **Real-time Status**: Live server status monitoring and reconnection handling

---

## 🚀 Features

### 🤖 AI Capabilities

<details>
<summary><strong>Multi-Provider Support</strong></summary>

| Provider | Models | Best For |
|----------|--------|----------|
| **Anthropic** | Claude 4.5 Sonnet, Opus, Haiku | Complex coding, long context |
| **OpenAI** | GPT-5.2, GPT-5.1, GPT-4.1, o-series | Flagship reasoning, coding |
| **Google** | Gemini 3 Pro, 2.5 Pro/Flash | Multimodal, 2M context window |
| **DeepSeek** | V3.2, V3.2 Reasoner | Reasoning, cost-effective |
| **OpenRouter** | 200+ models | Access to any model via single API |

</details>

<details>
<summary><strong>Intelligent Routing & Failover</strong></summary>

- 🎯 **Auto Model Selection**: Automatically picks the best model for your task
- 🔄 **Task-Based Routing**: Routes to specialized models (coding vs. reasoning vs. general)
- 🛡️ **Automatic Failover**: Gracefully handles rate limits with provider fallback chains
- 📊 **Health Monitoring**: Real-time provider health tracking and cost management
- 💰 **Cost Tracking**: Per-session and aggregate cost monitoring across providers

</details>

<details>
<summary><strong>Advanced Context Management</strong></summary>

- 📝 **Smart Summarization**: Automatically compresses long conversations
- 📊 **Token Optimization**: Efficiently manages context windows across providers
- 📎 **Attachments**: Drag & drop files, images, and PDFs into conversations
- 🗄️ **Prompt Caching**: Provider-specific caching (Anthropic, OpenAI, Gemini, DeepSeek)
- 🔄 **Tool Result Caching**: Configurable TTL-based caching for tool outputs

</details>

### 🛠️ Development Tools

<details open>
<summary><strong> Integrated Terminal</strong></summary>

- **xterm.js Powered**: Full-featured terminal with Unicode support
- **Multiple Shells**: bash, zsh, PowerShell, cmd.exe
- **Process Control**: Start, monitor, and kill processes
- **AI Execution**: Let the agent run commands for you
- **Real-Time Streaming**: Live output streaming to UI
- **Persistent Sessions**: Terminal state preserved across restarts

</details>

<details>
<summary><strong>🌐 Browser Automation</strong></summary>

- **Headless Browsing**: AI can research and fetch web content
- **Screenshot Capture**: Visual debugging and documentation
- **Content Extraction**: Scrape and parse web pages
- **Form Filling**: Automate web interactions
- **Navigation Control**: Back, forward, reload, tab management
- **Security Status**: Check URL safety and SSL status
- **Console & Network**: Debug tools for web automation

</details>

<details>
<summary><strong>🔧 LSP Integration</strong></summary>

Multi-language code intelligence via Language Server Protocol:

- **Hover Information**: Type info and documentation on hover
- **Go to Definition**: Jump to symbol definitions
- **Find References**: Find all usages of a symbol
- **Symbol Search**: Search symbols across workspace
- **Diagnostics**: Real-time error and warning detection
- **Code Completions**: Context-aware suggestions
- **Code Actions**: Quick fixes and refactoring
- **Rename Refactoring**: Safe symbol renaming

Supported languages: TypeScript, JavaScript, Python, Go, Rust, Java, C/C++, and more.

</details>

### 🤖 Agent System

<details>
<summary><strong>Built-in Tools (40+)</strong></summary>

| Category | Tools |
|----------|-------|
| **File Operations** | `read`, `write`, `edit`, `ls`, `grep`, `glob`, `bulkOperations` |
| **Terminal** | `run`, `checkTerminal`, `killTerminal` |
| **Browser** | `browser_fetch`, `browser_navigate`, `browser_extract`, `browser_snapshot`, `browser_screenshot`, `browser_click`, `browser_type`, `browser_scroll`, `browser_fill_form`, `browser_wait`, `browser_hover`, `browser_evaluate`, `browser_state`, `browser_back`, `browser_forward`, `browser_reload`, `browser_console`, `browser_network`, `browser_tabs`, `browser_security_status`, `browser_check_url` |
| **LSP** | `lsp_hover`, `lsp_definition`, `lsp_references`, `lsp_symbols`, `lsp_diagnostics`, `lsp_completions`, `lsp_code_actions`, `lsp_rename` |
| **Linting** | `readLints` for code quality checks |
| **Dynamic** | `createTool` for runtime tool generation |

</details>

<details>
<summary><strong>Session Management</strong></summary>

- **Persistent Sessions**: Conversations saved to SQLite database
- **Conversation Branching**: Explore alternative paths from any message
- **Message Reactions**: Up/down voting for feedback
- **Session Search**: Find conversations by content
- **Auto-Cleanup**: Configurable retention (default 30 days)
- **Workspace Filtering**: Sessions organized by workspace

</details>

<details>
<summary><strong>Error Recovery & Self-Healing</strong></summary>

- **Error Classification**: Categorizes errors for appropriate handling
- **Diagnostic Engine**: Analyzes root causes
- **Recovery Strategies**: Retry, fallback, context reduction, tool substitution
- **Self-Healing Agent**: Attempts automatic recovery before failing

</details>

### 🔒 Safety & Compliance

| Feature | Description |
|---------|-------------|
| ✅ **Tool Confirmation** | Review and approve dangerous operations before execution |
| 🛡️ **Safety Boundaries** | Configurable limits for file operations and commands |
| 📋 **Audit Trail** | Complete logging of all agent actions |
| 🚫 **Protected Paths** | Prevent access to `.git`, `.env`, `node_modules`, etc. |
| ⛔ **Blocked Commands** | Prevent dangerous shell commands |
| 💾 **Auto-Backup** | Automatic backup before file modifications |
| 📊 **Compliance Monitoring** | Violation detection and reporting |

### 🐛 Debugging & Observability

<details>
<summary><strong>Execution Tracing</strong></summary>

- **Step-by-Step Recording**: Full trace of agent execution
- **Breakpoint Support**: Pause on specific tools or errors
- **State Inspection**: View context at any point
- **Payload Capture**: Full request/response logging
- **Trace Export**: JSON, Markdown, or HTML formats
- **Performance Profiling**: Timing and resource usage

</details>

---

## 📦 Installation

### Prerequisites

- **Node.js** 20.x or higher
- **npm** 10.x or higher
- **Git** (for version control features)
- **Windows 10/11**, **macOS 12+**, or **Linux** (Ubuntu 20.04+)

### Quick Install

```bash
# Clone the repository
git clone https://github.com/vyotiq-ai/Vyotiq-AI.git
cd Vyotiq-AI

# Install dependencies (this may take a few minutes for native modules)
npm install

# Start the development server
npm start
```

> ⚠️ **Windows Users**: You may need [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) for native module compilation (`node-pty`, `better-sqlite3`).

### Building for Production

```bash
# Create distributable package
npm run package

# Create platform-specific installers
npm run make        # Creates .exe (Windows), .dmg (macOS), .deb/.rpm (Linux)
```

📁 Built packages are output to the `out/` directory.

---

## ⚡ Quick Start

### 1. Configure AI Provider

1. Open **Settings** (gear icon or `Ctrl + ,`)
2. Navigate to **AI Providers**
3. Add your API key for at least one provider:
   - [Anthropic](https://console.anthropic.com/) (Claude)
   - [OpenAI](https://platform.openai.com/) (GPT-4)
   - [Google AI](https://makersuite.google.com/app/apikey) (Gemini)
   - [DeepSeek](https://platform.deepseek.com/) (DeepSeek)
   - [OpenRouter](https://openrouter.ai/) (200+ models)

### 2. Open a Workspace

1. Click **Open Folder** in the sidebar
2. Select your project directory
3. The file tree will populate automatically

### 3. Start Chatting

Type your request in the chat input:

```text
"Create a React component for a user profile with local storage persistence"
```

```text
"Fix the TypeScript errors in src/utils/parser.ts"
```

```text
"Explain how the authentication flow works in this codebase"
```

### 4. Review & Apply Changes

- Review AI-generated code changes before committing
- Use the **Undo History** panel to revert any changes

---

## ⌨️ Keyboard Shortcuts

| Action | Windows/Linux | macOS |
|--------|---------------|-------|
| Command Palette | `Ctrl + Shift + P` | `Cmd + Shift + P` |
| Quick Open File | `Ctrl + P` | `Cmd + P` |
| Go to Symbol | `Ctrl + Shift + O` | `Cmd + Shift + O` |
| Find in Files | `Ctrl + Shift + F` | `Cmd + Shift + F` |
| Open Settings | `Ctrl + ,` | `Cmd + ,` |
| Toggle Terminal | `` Ctrl + ` `` | `` Cmd + ` `` |
| New Chat Session | `Ctrl + N` | `Cmd + N` |
| Go to Line | `Ctrl + G` | `Cmd + G` |
| Editor Settings | `Ctrl + ,` | `Cmd + ,` |
| Save File | `Ctrl + S` | `Cmd + S` |
| Undo | `Ctrl + Z` | `Cmd + Z` |
| Redo | `Ctrl + Y` | `Cmd + Shift + Z` |

---

## 🏗️ Architecture

```text
vyotiq/
├── src/
│   ├── main/                     # Electron main process
│   │   ├── agent/                # AI agent system (core)
│   │   │   ├── orchestrator.ts   # Main agent coordinator
│   │   │   ├── sessionManager.ts # Conversation persistence
│   │   │   ├── runExecutor.ts    # Agent loop execution
│   │   │   ├── providers/        # LLM provider integrations
│   │   │   ├── context/          # Context management
│   │   │   ├── cache/            # Caching systems
│   │   │   ├── compliance/       # Safety & compliance
│   │   │   ├── recovery/         # Error recovery
│   │   │   └── debugging/        # Execution tracing
│   │   ├── tools/                # Tool system
│   │   │   ├── implementations/  # Built-in tools
│   │   │   ├── factory/          # Dynamic tool creation
│   │   │   ├── executor/         # Tool execution engine
│   │   │   └── registry/         # Tool registry
│   │   ├── browser/              # Browser automation
│   │   ├── lsp/                  # Language Server Protocol
│   │   ├── workspaces/           # Workspace management
│   │   ├── ipc.ts                # IPC handlers
│   │   └── logger.ts             # Logging system
│   │
│   ├── renderer/                 # React frontend
│   │   ├── features/             # Feature modules
│   │   │   ├── chat/             # Chat interface
│   │   │   ├── terminal/         # Terminal emulator
│   │   │   ├── browser/          # Browser panel
│   │   │   ├── settings/         # Settings panel
│   │   │   ├── fileTree/         # File tree explorer
│   │   │   ├── sessions/         # Session management
│   │   │   ├── undo/             # Undo history
│   │   │   └── workspaces/       # Workspace switcher
│   │   ├── state/                # State management
│   │   │   ├── AgentProvider.tsx # Agent state context
│   │   │   └── UIProvider.tsx    # UI state context
│   │   ├── hooks/                # React hooks
│   │   └── components/           # Shared UI components
│   │
│   ├── shared/                   # Shared types & utilities
│   │   └── types.ts              # Type definitions
│   │
│   ├── main.ts                   # Electron entry point
│   └── preload.ts                # Preload script
│
├── docs/                         # Documentation
└── package.json
```

### Tech Stack

| Technology | Version | Purpose |
|------------|---------|----------|
| [Electron](https://www.electronjs.org/) | 39.2 | Desktop application framework |
| [React](https://reactjs.org/) | 19.2 | UI library with hooks |
| [TypeScript](https://www.typescriptlang.org/) | 5.9 | Type-safe JavaScript |
| [Vite](https://vitejs.dev/) | 7.2 | Lightning-fast build tool |
| [Tailwind CSS](https://tailwindcss.com/) | 4.1 | Utility-first styling |
| [xterm.js](https://xtermjs.org/) | 5.5 | Terminal emulator |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | 12.5 | Local database |
| [node-pty](https://github.com/microsoft/node-pty) | 1.1 | Terminal process management |

---

## 🔧 Configuration

### Settings

All settings are accessible via the Settings panel (`Ctrl + ,`):

- **AI Providers**: Configure API keys and default models
- **Terminal**: Shell path, font family, cursor style
- **Safety**: Tool confirmation, file limits, protected paths, blocked commands
- **Cache**: Prompt caching, tool result caching, context caching
- **Debug**: Verbose logging, trace export, breakpoints
- **Advanced**: Context limits, summarization settings

---

## 🐛 Troubleshooting

<details>
<summary><strong>❌ "Module not found" or native module errors</strong></summary>

```bash
# Windows (PowerShell)
Remove-Item -Recurse -Force node_modules, package-lock.json
npm install

# macOS/Linux
rm -rf node_modules package-lock.json
npm install
```

If issues persist with native modules:

```bash
npm rebuild
# or specifically for node-pty:
npx electron-rebuild -f -w node-pty
```

</details>

<details>
<summary><strong>❌ Terminal not working</strong></summary>

- **Windows**: Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++" workload
- **macOS**: Run `xcode-select --install` for build tools
- **Linux**: Install `build-essential` package
- Ensure your shell (bash, zsh, powershell) is in PATH

</details>

<details>
<summary><strong>❌ API key errors</strong></summary>

- Verify keys are entered correctly (no extra spaces)
- Check API key permissions and usage quotas on provider dashboard
- Try a different provider to isolate the issue

</details>

<details>
<summary><strong>❌ Performance issues</strong></summary>

- Enable context compression for long conversations
- Reduce tool result cache size in Settings
- Restart the app to clear caches

</details>

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Quick Start

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/Vyotiq-AI.git`
3. Install dependencies: `npm install`
4. Create a feature branch: `git checkout -b feature/amazing-feature`
5. Make your changes and test: `npm test && npm run lint`
6. Commit: `git commit -m "feat: add amazing feature"`
7. Push and open a Pull Request

---

## 📜 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

For third-party dependency licenses, see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

## ⚠️ AI Usage Disclaimer

Vyotiq is an AI-assisted coding tool that integrates with third-party AI services. Please be aware:

### AI-Generated Content

- **No Guarantee of Accuracy**: AI-generated code may contain errors, bugs, or security vulnerabilities. Always review and test before production use.
- **User Responsibility**: You are solely responsible for any code you accept, modify, or deploy.
- **Not a Substitute for Expertise**: AI assistance should complement, not replace, your professional judgment.

### Third-Party AI Services

When using Vyotiq-ai, your prompts and code context are sent to your chosen AI provider(s). Comply with each provider's terms of service:

- [Anthropic Terms](https://www.anthropic.com/legal/terms) (Claude)
- [OpenAI Terms](https://openai.com/policies/terms-of-use) (GPT)
- [Google AI Terms](https://ai.google.dev/terms) (Gemini)
- [DeepSeek Terms](https://www.deepseek.com/terms)
- [OpenRouter Terms](https://openrouter.ai/terms)

### Data Privacy

- **Local-First Architecture**: All data stored locally on your machine
- **AI API Calls**: Only context you provide in chat is sent to AI providers
- **No Telemetry**: No tracking or analytics sent to Vyotiq-ai servers

---

## 🙏 Acknowledgments

- [Electron](https://www.electronjs.org/) - Desktop framework
- [xterm.js](https://xtermjs.org/) - Terminal emulator
- [Anthropic](https://www.anthropic.com/), [OpenAI](https://openai.com/), [Google](https://ai.google.dev/), [DeepSeek](https://www.deepseek.com/), [OpenRouter](https://openrouter.ai/) - AI providers
- All our contributors and supporters!

---

<p align="center">
  <strong>Built with ❤️ by the Vyotiq team</strong>
</p>

<p align="center">
  <a href="https://github.com/vyotiq-ai/Vyotiq-AI/issues/new?template=bug_report.md">Report Bug</a> •
  <a href="https://github.com/vyotiq-ai/Vyotiq-AI/issues/new?template=feature_request.md">Request Feature</a> •
  <a href="https://github.com/vyotiq-ai/Vyotiq-AI/discussions">Discussions</a>
</p>

<p align="center">
  ⭐ Star us on GitHub — it motivates us a lot!
</p>
