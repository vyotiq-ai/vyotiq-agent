# Renderer/UI Codebase Analysis Report

> **Scope**: `src/renderer/` — Complete analysis of ~290 files  
> **Date**: Auto-generated  
> **Type**: Research-only (no code changes)

---

## Table of Contents

1. [Critical: Missing Component Files](#1-critical-missing-component-files)
2. [TODOs, FIXMEs, and Placeholders](#2-todos-fixmes-and-placeholders)
3. [Stubs and Empty Handlers](#3-stubs-and-empty-handlers)
4. [Missing State Connections](#4-missing-state-connections)
5. [Broken Routing / Navigation](#5-broken-routing--navigation)
6. [Unimplemented or Partial Features](#6-unimplemented-or-partial-features)
7. [Missing Error Boundaries](#7-missing-error-boundaries)
8. [Styling Inconsistencies](#8-styling-inconsistencies)
9. [Dead Code and Unused Exports](#9-dead-code-and-unused-exports)
10. [Accessibility Gaps](#10-accessibility-gaps)
11. [Modularity and Code Organization Issues](#11-modularity-and-code-organization-issues)
12. [Missing Type Validation / Prop Issues](#12-missing-type-validation--prop-issues)
13. [Overall Styling Approach](#13-overall-styling-approach)
14. [Terminal/CLI Aesthetic](#14-terminalcli-aesthetic)
15. [Layout and Responsiveness](#15-layout-and-responsiveness)
16. [State Management Pattern](#16-state-management-pattern)
17. [Performance Patterns](#17-performance-patterns)
18. [Summary of Findings](#18-summary-of-findings)

---

## 1. Critical: Missing Component Files

**Severity: CRITICAL — Build-breaking**

### 1a. `features/chat/index.ts` — 10 missing component files

The main chat feature barrel export (`src/renderer/features/chat/index.ts`) exports components from files that **do not exist on disk**:

| Export | Import Path | Exists? |
|--------|------------|---------|
| `ChatArea` | `./ChatArea` | **NO** |
| `MessageLine` | `./components/MessageLine` | **NO** |
| `ToolExecution` | `./components/ToolExecution` | **NO** |
| `EmptyState` | `./components/EmptyState` | **NO** |
| `ToolConfirmationPanel` | `./components/ToolConfirmationPanel` | **NO** |
| `ConversationSearchBar` | `./components/ConversationSearchBar` | **NO** |
| `DynamicToolIndicator` | `./components/DynamicToolIndicator` | **NO** |
| `MessageEditDialog` | `./components/MessageEditDialog` | **NO** |
| `RunGroupHeader` | `./components/RunGroupHeader` | **NO** |
| `ThinkingPanel` | `./components/ThinkingPanel` | **NO** |

**Impact**: `ChatArea` is the **core chat display component** imported by `pages/Home.tsx`. Without it, the main application view cannot render. All 10 missing components would cause TypeScript/bundler errors.

**File**: `src/renderer/features/chat/index.ts` lines 6-31

### 1b. `features/chat/components/toolExecution/index.ts` — 2 missing component files

| Export | Import Path | Exists? |
|--------|------------|---------|
| `ToolExecutionHeader` | `./ToolExecutionHeader` | **NO** |
| `ToolItem` | `./ToolItem` | **NO** |

Existing files in `toolExecution/`: `AutoFetchPreview.tsx`, `CopyIconButton.tsx`, `DiffViewer.tsx`, `FileChangeDiff.tsx`, `LiveFetchPreview.tsx`, `ResearchResultPreview.tsx`, `TerminalOutputPreview.tsx`, `diffUtils.ts`, `types.ts`

**File**: `src/renderer/features/chat/components/toolExecution/index.ts` lines 8-9

---

## 2. TODOs, FIXMEs, and Placeholders

**Finding: NONE detected in renderer code**

A comprehensive grep for `// TODO`, `// FIXME`, `// HACK`, `// XXX`, `// TEMP`, `// STUB` across all `src/renderer/**` files found **zero** matches. All "todo" matches were references to the Todo feature (TodoItem, TodoProgress, etc.), not developer task markers.

This is excellent codebase hygiene.

---

## 3. Stubs and Empty Handlers

**Finding: NONE detected**

A regex search for empty event handlers (`onClick={() => {}}`, `onChange={() => {}}`, `onSubmit={() => {}}`) across all `.tsx` files returned **zero** matches.

No stub functions or placeholder handlers were found. All handlers reference actual implementations.

---

## 4. Missing State Connections

### 4a. `settings` state referenced but not always checked

- `AgentProvider.tsx` line ~821: Error dispatch targets "first session if any" — could silently fail if no sessions exist.
- `useAppearanceSettings.ts`: Falls back to `DEFAULT_APPEARANCE_SETTINGS` if `state.settings?.appearanceSettings` is undefined, which is correct behavior but means appearance settings won't render until the settings state is hydrated.

### 4b. Workspace path synchronization

- `WorkspaceProvider.tsx`: Module-level `_currentWorkspacePath` variable exists for synchronous access outside React. This is a deliberate escape hatch (used by `AgentProvider` via `getCurrentWorkspacePath()`), but creates a potential consistency gap if the React state and module variable diverge.

**File**: `src/renderer/state/WorkspaceProvider.tsx` (module-level export)

### 4c. No centralized error state

While individual hooks and components manage their own error states (e.g., `useRustSearch` has `error: string | null`), there is no centralized error state aggregation visible in the UI.

---

## 5. Broken Routing / Navigation

### 5a. No routing library — intentional design

The application uses **no routing library** (no react-router, no wouter, etc.). All navigation is conditional rendering:

- `pages/Home.tsx`: Shows `WorkspacePrompt` when no workspace, chat area when workspace is selected
- `App.tsx`: Panel visibility via `useUIState()` booleans (settings, browser, undo, etc.)
- `MainLayout.tsx`: Sidebar/editor/bottom panel visibility via local state + custom events

This is appropriate for an Electron desktop app without URL-based navigation.

### 5b. Panel management via custom events

Some panel toggles use `window.dispatchEvent(new CustomEvent(...))` instead of React state:
- `Sidebar.tsx`: `vyotiq:toggle-bottom-panel`, `vyotiq:show-bottom-panel-tab`
- `MainLayout.tsx`: `vyotiq:open-file-in-editor`

**Risk**: Custom events bypass React's unidirectional data flow and are harder to debug. Consider centralizing panel state in `UIProvider`.

---

## 6. Unimplemented or Partial Features

### 6a. Intentionally disabled animations

Multiple CSS animations are defined but explicitly disabled with `/* Intentionally no animation */`:

| Animation | Location (index.css) | Notes |
|-----------|---------------------|-------|
| `.animate-loading-dot` | ~line 785 | "clean static display" |
| `.animate-pulse-slow` | ~line 800 | "disabled for clean design" |
| `.animate-ping-slow` | ~line 803 | "disabled for clean design" |
| `.animate-streaming` | ~line 960 | "clean static indicator" |
| `.thinking-dot` | ~line 964 | "replaced with clean text" |
| `.terminal-dots-animated` | ~line 1250 | "disabled for clean design" |
| `.terminal-dot-breathing` | ~line 1260 | "No animation" |
| `.typewriter-dots` | ~line 1240 | `display: none` |

These indicate a conscious design decision to move toward a cleaner, minimal aesthetic. They're not bugs, but they bloat the CSS with ~100 lines of dead animation code.

### 6b. Diff algorithm in EditorPanel

`features/editor/components/EditorPanel.tsx`: The `InlineDiffView` component uses a naive line-by-line diff algorithm using `Array.includes`. This will produce incorrect results for moved/reordered lines and doesn't detect multi-line changes well.

However, `features/chat/components/toolExecution/diffUtils.ts` contains a proper Myers diff implementation (with extensive test coverage). The EditorPanel should use `diffUtils.ts` instead of its own implementation.

### 6c. Debug panel incomplete functionality

`features/terminal/components/DebugPanel.tsx`: Displays debug traces but relies entirely on IPC events being dispatched. If the main process doesn't emit debug trace events, this panel will remain empty with no indication of why.

---

## 7. Missing Error Boundaries

### 7a. Well-implemented error boundaries

The codebase has a solid error boundary pattern:

- `ErrorBoundary` (`components/layout/ErrorBoundary.tsx`, 267 lines): Full-featured with terminal-styled UI, copy error button, reload/retry, telemetry capture, IPC error reporting
- `FeatureErrorBoundary`: Lighter variant exported from same file, used to wrap individual features
- Provider hierarchy wraps everything: `ErrorBoundary` is the outermost wrapper in `main.tsx`

### 7b. Granular wrapping

`pages/Home.tsx` wraps `ChatArea` and `ChatInput` in separate `FeatureErrorBoundary` instances — good practice, prevents a chat input error from taking down the message display.

### 7c. Potential gap: Editor panel

`EditorPanel` is rendered in `MainLayout.tsx` but it's unclear if it's wrapped in a `FeatureErrorBoundary`. An error in syntax highlighting (e.g., from malformed code) could crash the layout.

### 7d. Potential gap: Bottom panel

`BottomPanel.tsx` (626 lines) manages Terminal, Problems, Output, and Debug Console tabs. Each tab renders complex content (xterm.js, diagnostics views) but individual tabs don't appear to have error boundaries, meaning one failed tab could crash the entire bottom panel.

---

## 8. Styling Inconsistencies

### 8a. Overall consistency: EXCELLENT

The codebase uses a remarkably consistent styling approach:
- **100% Tailwind CSS 4 + CSS custom properties** — no CSS modules, no styled-components, no emotion
- **`cn()` utility** (clsx + tailwind-merge) used consistently across all components
- **CSS variables** (`var(--color-*)`) used for all theming — never hardcoded colors in Tailwind
- **Font sizes**: Consistently small (9px-12px range) across the entire UI, fitting the terminal aesthetic

### 8b. Minor inconsistencies

| Issue | Location | Description |
|-------|----------|-------------|
| Hardcoded platform padding | `Header.tsx` | `pr-[70px] sm:pr-[100px] md:pr-[138px]` for window controls — fragile, Electron-specific |
| Inline styles for dynamic values | 20+ files | `style={{ width: '...' }}` for progress bars, heights, positions — these are appropriate for runtime-dynamic values, not inconsistencies |
| `!important` overrides | `index.css` ~line 560-600 | Animation classes use `!important` on `animation-play-state` and `animation-duration` — indicates CSS specificity conflicts that were resolved with force |
| Mixed border-radius values | Various | Some components use `rounded-sm`, others `rounded`, `rounded-xl`, `rounded-2xl` — intentional hierarchy (panels use larger radius, inner elements use smaller) |

### 8c. Dead CSS

~100+ lines of intentionally disabled animation CSS classes (see Section 6a). These could be removed to reduce CSS bundle size.

### 8d. Color system coherence

The theming is extremely well-organized:
- **Dark mode**: 100+ CSS variables with warm gray tones (`#0b0b0f` base, `#18181b` surfaces)
- **Light mode**: Complete override set with proper contrast ratios
- **Semantic colors**: `--color-success`, `--color-error`, `--color-warning`, `--color-info` 
- **Surface hierarchy**: `surface-base` → `surface-1` → `surface-2` → `surface-3` 
- **Syntax highlighting**: Full dark/light token color sets with GitHub theme

---

## 9. Dead Code and Unused Exports

### 9a. Missing files create dead exports (CRITICAL)

The 12 missing component files (Section 1) create dead exports in `features/chat/index.ts` and `features/chat/components/toolExecution/index.ts`.

### 9b. `eslint-disable` comments

12 `eslint-disable` directives found across renderer code. All are justified with explanatory comments:

| File | Reason |
|------|--------|
| `utils/ansi.ts` (×2) | `no-control-regex` — ANSI escape codes require control character regex |
| `utils/profiler.tsx` | `react-hooks/exhaustive-deps` — deps are caller-controlled |
| `utils/telemetry.ts` | `react-hooks/exhaustive-deps` — deps is caller-provided |
| `utils/performance.ts` | `react-hooks/exhaustive-deps` — intentional memoization by serialized content |
| `features/fileTree/utils/fileIcons.ts` | `@typescript-eslint/no-explicit-any` — only `any` in entire renderer |
| `hooks/useVirtualizedList.ts` (×2) | `react-hooks/exhaustive-deps` — ref tracked via version counter |
| `features/fileTree/useFileTree.ts` (×2) | `react-hooks/exhaustive-deps` — intentional dep omission |
| `features/terminal/components/BottomPanel.tsx` | `react-hooks/exhaustive-deps` |
| `features/chat/hooks/useChatInput.ts` | `react-hooks/exhaustive-deps` — only run on session ID change |

### 9c. `any` type usage

Only **1 instance** of `any` in the entire renderer codebase:
- `features/fileTree/utils/fileIcons.ts:145`: `type IconComponent = ComponentType<any>` — justified for icon component compatibility

This is exceptional type safety.

### 9d. Intentionally disabled animations

Multiple CSS animation classes are defined but contain no animation (see Section 6a). These classes are referenced in the CSS but it's unclear if any components still reference them, potentially creating dead code.

---

## 10. Accessibility Gaps

### 10a. Accessibility infrastructure: COMPREHENSIVE

The codebase has unusually strong accessibility infrastructure:

- **`utils/accessibility.ts`** (902 lines): Full ARIA utilities — `ariaButton`, `ariaDialog`, `ariaAlert`, `ariaTab`/`ariaTabPanel`, `ariaCombobox`, `ariaMenu`, `ariaToolbar`, `ariaAlert`, `ariaLiveRegion`, `focusTrap`, `announcer`
- **`useReducedMotion`**: Hook that respects `prefers-reduced-motion` and user settings
- **`useFocusTrap`**: Modal focus management
- **`useAnnouncer`**: Screen reader announcements
- **CSS**: Complete reduced motion support via `data-reduce-motion` attribute and `@media (prefers-reduced-motion)`

### 10b. Component-level accessibility

**Well-implemented:**
- `Modal.tsx`: `role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-describedby`, focus trap, Escape key, screen reader announcements
- `CommandPalette.tsx`: Full combobox pattern — `role="combobox"`, `aria-expanded`, `aria-activedescendant`, `role="listbox"`, keyboard navigation (Arrow keys + Enter)
- `Toast.tsx`: `role="alert"`, `aria-live="polite"` on each toast
- `UndoHistoryPanel.tsx`: `role`, `aria-label`, `aria-live` throughout
- `Button.tsx`: `aria-label`, `aria-disabled`, loading state communicated to screen readers
- `LoadingState.tsx`: `role="status"`, `aria-live="polite"`

**Potential gaps:**
- `Header.tsx`: Icon-only buttons have `aria-label` but the drag region for window dragging lacks `aria-hidden`
- `Sidebar.tsx`: Tab switching uses custom keyboard shortcuts (Ctrl+Shift+E/F) but the tab interface itself may not implement the full `role="tablist"` pattern
- `BottomPanel.tsx`: Tab headers implement click handlers but the full `role="tab"` / `aria-selected` pattern wasn't verified

### 10c. Focus management

- Focus trapping in modals: ✅ Implemented via `useFocusTrap`
- Skip-to-content link: ❌ Not found (standard for web, less critical for Electron)
- Keyboard navigation for all interactive elements: ✅ Extensive `useKeyboard` hook with modifier support

---

## 11. Modularity and Code Organization Issues

### 11a. Architecture: EXCELLENT

The renderer follows a clear feature-based architecture:

```
renderer/
├── components/      # Shared UI primitives (Button, Modal, Toast, etc.)
│   ├── ui/          # Generic UI components
│   └── layout/      # App layout components
├── features/        # Feature modules (chat, settings, terminal, etc.)
│   ├── chat/        # Chat area, input, tool execution
│   ├── settings/    # Settings panels (16 sub-panels)
│   ├── terminal/    # Terminal + bottom panel
│   ├── editor/      # Code viewer
│   ├── browser/     # Embedded browser
│   ├── workspace/   # Workspace management
│   ├── onboarding/  # First-run wizard
│   ├── undo/        # Undo history
│   ├── fileTree/    # File explorer
│   └── sessions/    # Session management
├── hooks/           # Shared hooks (~25 hooks)
├── state/           # Global state (providers + reducers)
├── utils/           # Shared utilities
├── pages/           # Page-level components
└── types/           # Shared types
```

### 11b. State management: Well-structured domain separation

Reducers are properly decomposed:
- `sessionReducer.ts` — Session CRUD, delta-based updates
- `streamingReducer.ts` — Streaming text deltas
- `taskReducer.ts` — Progress, artifacts, tool execution, terminal, todos
- `confirmationReducer.ts` — Tool confirmations
- `settingsReducer.ts` — Settings updates
- `communicationReducer.ts` — Agent communication (questions, decisions, progress)

Combined via `combinedAgentReducer` with action-type routing for efficiency.

### 11c. Large file concern

| File | Lines | Concern |
|------|-------|---------|
| `AgentProvider.tsx` | 1167 | IPC event handling + store creation — could split IPC handling into separate module |
| `index.css` | 2258 | Monolithic CSS — could split into feature-specific CSS modules |
| `features/fileTree/utils/fileIcons.ts` | 1040 | Icon mappings — large but well-structured |
| `BottomPanel.tsx` | 626 | Terminal + Problems + Output + Debug — could extract each tab into own component |
| `features/chat/hooks/useChatInput.ts` | 416 | Complex but justified by composition pattern |

### 11d. Hook composition pattern

The chat input uses an exemplary composition pattern:
```
useChatInput
├── useMessageState       — Message text, attachments
├── useProviderSelection  — AI provider/model selection
├── useChatSubmit         — Send message logic
├── useMentions           — @ mention detection
├── useDraftMessage       — Draft auto-save
├── useWorkspaceFiles     — File listing for mentions
└── useMessageHistory     — Message history navigation
```

This is one of the best-organized hook compositions in the codebase.

---

## 12. Missing Type Validation / Prop Issues

### 12a. TypeScript strictness: EXCELLENT

- Only 1 `any` usage in 290+ files
- Only 12 `eslint-disable` directives, all justified
- Zero `@ts-ignore` / `@ts-expect-error` directives
- All components use TypeScript interfaces for props
- Shared types properly centralized in `shared/types/` and `state/types.ts`

### 12b. Custom equality functions

The codebase makes extensive use of custom equality functions for selectors, which is excellent for performance but creates maintenance burden:

- `useAgentSelector` accepts custom `isEqual` parameter
- `useChatInput.ts` has a 20-line custom equality function for the session snapshot
- `useAppearanceSettings.ts` has `shallowAppearanceEqual`
- `useAgentSelectors.ts` has `shallowArrayEqual` and `shallowObjectEqual`

These could be consolidated into a shared set of equality utilities.

### 12c. Runtime validation

No runtime prop validation (PropTypes, Zod, etc.) is used. This is acceptable given the strict TypeScript setup but means IPC data from the main process is not validated at the renderer boundary. The `window.vyotiq` API surface is defined in a global.d.ts (1828+ lines) which provides compile-time safety.

---

## 13. Overall Styling Approach

### Architecture

| Aspect | Technology | Notes |
|--------|-----------|-------|
| **CSS Framework** | Tailwind CSS 4 | Using `@import "tailwindcss"` and `@theme` blocks |
| **Theming** | CSS Custom Properties | ~100+ variables per theme (dark/light) |
| **Class Merging** | `cn()` = clsx + tailwind-merge | Used consistently everywhere |
| **Animations** | CSS @keyframes + Tailwind classes | With reduced-motion support |
| **Icons** | Lucide React + Tabler Icons (file tree) | Consistent 12-16px sizing |
| **Fonts** | JetBrains Mono (code), system sans-serif (UI) | Via Google Fonts import |
| **Colors** | Semantic variables only | Never hardcoded hex in Tailwind classes |
| **Compact mode** | CSS overrides on `html.compact-mode` | Reduces spacing globally |

### Design Language

- **Dark-first**: Default dark theme with emerald (`#34d395`) accent
- **Density**: Extremely compact — 9-12px font sizes, 32px header, 22px status bar
- **Glass/blur**: `backdrop-blur-sm` on overlays
- **Terminal chrome**: macOS-style traffic lights on modals, monospace fonts on status elements
- **Micro-interactions**: `active:scale-[0.97]`, hover translates, focus rings

### Theme Customization System

Users can customize via `useAppearanceSettings`:
- Font size scale (smaller/default/larger/largest)
- Accent color presets + custom hex
- Compact mode toggle
- Terminal font family + size
- Animation enable/disable
- Animation speed (slow/normal/fast)
- Loading indicator style (spinner/dots/pulse/minimal)
- Reduce motion (system/always/never)

---

## 14. Terminal/CLI Aesthetic

### Consistent Terminal Elements

- **Prompt symbols**: `❯` (active session), `$` (workspace), `λ` (model) — defined in `utils/theme.ts`
- **CLI labels**: `[READY]`, `[EXEC]`, `[OK]`, `[ERR]`, `[WARN]` — used in Toast, status displays
- **Blinking cursor**: CSS `animation: blink 1s steps(1) infinite` 
- **Traffic lights**: macOS-style dots on Modal header (red/yellow/green)
- **Terminal header bar**: `PID:` prefix style, elapsed time in tabular-nums
- **Status dots**: 6px circles with color-coded states (active/warning/error/idle)

### Terminal CSS Classes (index.css)

Dedicated terminal utility classes:
- `.terminal-container` — border/shadow focus effects
- `.terminal-scanlines` — subtle CRT scanline effect
- `.terminal-header` — process-style header
- `.terminal-status-dot` — color-coded status indicators
- `.terminal-prompt` — prompt symbol with glow effect on focus
- `.terminal-btn` — button with ripple effect
- `.terminal-cursor-block/line/underscore` — cursor variants
- `.cli-flag` — command-line flag display style
- `.vyotiq-typewriter` — typewriter animation container

### Real Terminal Integration

xterm.js integration in `TerminalView.tsx`:
- Terminal theme derived from CSS variables
- `ResizeObserver` with debounced IPC resize events
- `MutationObserver` on `<html>` class list for theme changes
- Addon support: fit, web-links, unicode11

---

## 15. Layout and Responsiveness

### Layout Architecture

```
┌─────────────────────────────────────────────────────┐
│ Header (32px) — drag region, sidebar toggle, panels │
├──────────┬──────────────────────────┬───────────────┤
│ Sidebar  │ Content Area (Chat/Home) │ Editor Panel  │
│ (280px   │ (flex-1)                │ (resizable)   │
│ resizable│                          │               │
│ min 200) │                          │               │
├──────────┴──────────────────────────┴───────────────┤
│ Bottom Panel (resizable, 200-500px)                 │
│  Terminal | Problems | Output | Debug Console       │
├─────────────────────────────────────────────────────┤
│ Status Bar (22px) — workspace, git, online/offline  │
└─────────────────────────────────────────────────────┘
```

### Resize Implementation

`useResizablePanel` hook provides:
- Horizontal (sidebar, editor) and vertical (bottom panel) resize
- Min/max constraints with `clamp()`
- Mouse drag with `pointermove`/`pointerup` listeners
- Cursor changes during drag
- `useResizeObserver` for responsive adjustments

### Responsive Breakpoints (constants.ts)

```
MOBILE_BREAKPOINT = 640   (sm)
TABLET_BREAKPOINT = 768   (md)
DESKTOP_BREAKPOINT = 1024 (lg)
WIDE_BREAKPOINT = 1280    (xl)
```

### Responsive Patterns

- Sidebar collapses fully on small screens
- Header padding adjusts for window controls: `pr-[70px] sm:pr-[100px] md:pr-[138px]`
- Bottom panel has responsive height constraints
- Chat input width adjusts with max-width boundaries

### Limitation

As an Electron app, the layout primarily targets desktop viewports. Mobile-responsive design is minimal — the breakpoints exist but are mainly used for sidebar collapse and spacing adjustments, not for radically different layouts.

---

## 16. State Management Pattern

### Architecture: Custom External Store

**Not Redux. Not Zustand.** The app uses a custom implementation:

```
AgentProvider.tsx
├── createContext<AgentStore>
├── External store object { getState, subscribe, dispatch, actions }
├── useSyncExternalStore (React 18) for subscriptions
├── combinedAgentReducer — domain-routed reducers
├── IPC event batching (16ms intervals)
├── Streaming buffer (useStreamingBuffer) with adaptive batching
└── Low-priority event batching via startTransition
```

### Key Design Patterns

1. **Split-context pattern**: `UIProvider` and `WorkspaceProvider` separate state context from actions context, preventing unnecessary re-renders when only reading state or only calling actions.

2. **useSyncExternalStore**: `AgentProvider` uses React 18's `useSyncExternalStore` instead of `useReducer` for the main agent state. This enables:
   - Selector-based subscriptions (only re-render on selected state changes)
   - Custom equality functions per selector
   - External store that can be updated outside React (e.g., from IPC events)

3. **Event batching**: IPC events from the main process are batched at 16ms intervals. Low-priority events (`SETTINGS_UPDATE`, `PROGRESS_UPDATE`, etc.) are wrapped in `startTransition` for non-blocking updates.

4. **Delta-based session updates**: `sessionDelta.ts` computes minimal diffs between session states to avoid full object copies on every update.

5. **Streaming buffer**: `useStreamingBuffer` batches character-by-character streaming deltas at configurable intervals (32ms balanced, 24ms smooth, 80ms fast, 16ms typewriter) with adaptive throughput detection.

### Provider Hierarchy

```
ErrorBoundary
└── ThemeProvider
    └── AgentProvider         ← Main state (sessions, messages, tools)
        └── UIProvider        ← Panel visibility, command palette
            └── LoadingProvider  ← Loading operations
                └── ToastProvider   ← Notifications
                    └── WorkspaceProvider  ← Workspace path, Rust backend
                        └── RustBackendProvider  ← Backend connection
                            └── App
```

### Optimized Selectors (hooks/useAgentSelectors.ts)

Pre-built selector hooks with appropriate equality checks:
- `useActiveSessionId()` — minimal selector
- `useActiveSessionMessages()` — shallow array comparison
- `useActiveSessionInfo()` — shallow object comparison for combined display data
- Stable empty constants (`EMPTY_MESSAGES`, `EMPTY_TODOS`) to avoid new references

---

## 17. Performance Patterns

### Strengths

1. **Virtualized list**: Custom `useVirtualizedList` hook — binary search for visible range, dynamic height measurement via `measureItem`, overscan buffer, streaming mode with RAF loop, auto-scroll with user-intent tracking.

2. **Adaptive throttling**: `useThrottleControl` detects running agent sessions and reduces throttle delays (16ms vs 100ms) for responsive streaming. `useStreamingBuffer` adapts batching for high-throughput streams (>500 chars/sec).

3. **Memoization discipline**: Extensive use of `useMemo`, `useCallback`, `memo()`. `useStableObject` and `useStableCallback` utility hooks for stable references.

4. **Selective re-rendering**: `AgentProvider`'s selector pattern means components only re-render when their specific slice of state changes, not on every state update.

5. **Delta-based updates**: Session upserts use `computeSessionDelta` → `applySessionDelta` to minimize object creation.

### Potential Concerns

1. **Session lookup by `find()`**: `useAgentSelectors.ts` uses `state.sessions.find(s => s.id === sessionId)` repeatedly. For large session lists, a Map-based lookup would be O(1) vs O(n).

2. **CSS bundle size**: 2258 lines of CSS including ~100 lines of disabled animations. Tree-shaking won't help since CSS classes are string references.

3. **Provider nesting depth**: 7 levels of context providers. Each provider boundary could cause cascading re-renders on its value changes. The split-context pattern mitigates this but the nesting depth is notable.

---

## 18. Summary of Findings

### Critical (must fix)

| # | Issue | Impact |
|---|-------|--------|
| 1 | 10 missing component files in `features/chat/index.ts` | App cannot render main chat view |
| 2 | 2 missing component files in `features/chat/components/toolExecution/index.ts` | Tool execution display incomplete |

### Notable (should address)

| # | Issue | Impact |
|---|-------|--------|
| 3 | Custom events for panel toggling bypass React data flow | Harder to debug, potential state inconsistencies |
| 4 | EditorPanel uses naive diff algorithm | Incorrect diff display for complex changes |
| 5 | ~100 lines of dead CSS (disabled animations) | CSS bundle bloat |
| 6 | BottomPanel tabs lack individual error boundaries | One failed tab crashes entire panel |
| 7 | Custom equality functions duplicated across hooks | Maintenance burden |

### Strengths (commendable)

| # | Aspect | Assessment |
|---|--------|-----------|
| 1 | Type safety | Only 1 `any` in 290+ files, zero `@ts-ignore` |
| 2 | Accessibility infrastructure | 902-line utility module + consistent ARIA usage |
| 3 | Styling consistency | 100% Tailwind + CSS variables, no mixed approaches |
| 4 | State management | Sophisticated external store with optimal re-rendering |
| 5 | Performance optimization | Virtualized lists, adaptive throttling, delta updates |
| 6 | Zero TODOs/FIXMEs | Clean codebase with no deferred work markers |
| 7 | Code organization | Clear feature-based architecture with hook composition |
| 8 | Theme system | Complete dark/light with user customization (font, accent, density, motion) |
| 9 | Terminal aesthetic | Highly consistent CLI-inspired design language |
| 10 | Reduced motion support | Multi-level: CSS media query + user setting + per-component |
