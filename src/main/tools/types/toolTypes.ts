/**
 * Tool System Types
 * 
 * Centralized type definitions for the tool execution system.
 */
import type { ToolExecutionResult, RendererEvent } from '../../../shared/types';
import type { SafetyManager } from '../../agent/safety';

// =============================================================================
// Core Tool Types
// =============================================================================

export interface ToolExecutionContext {
  /** Workspace root path - always provided for tool execution */
  workspacePath: string;
  /** Current working directory - defaults to workspace root */
  cwd: string;
  terminalManager: TerminalManager;
  logger: ToolLogger;
  /** Safety manager for validating operations */
  safetyManager?: SafetyManager;
  /** Current run ID for tracking limits */
  runId?: string;
  /** Current session ID for undo history */
  sessionId?: string;
  /** Whether YOLO mode is enabled (skip confirmations) */
  yoloMode?: boolean;
  /** Whether to allow file access outside the workspace (default: false) */
  allowOutsideWorkspace?: boolean;
  /**
   * Abort signal for cancellation support.
   * Tools SHOULD check this signal and abort operations when signaled.
   * Long-running operations MUST respect this signal.
   */
  signal?: AbortSignal;
  /**
   * Optional callback to emit events to the renderer
   */
  emitEvent?: (event: RendererEvent) => void;
}

export interface ToolLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface ToolDefinition<TArgs extends Record<string, unknown> = Record<string, unknown>> {
  /** Unique identifier for the tool */
  name: string;
  /** Human-readable description shown to the LLM */
  description: string;
  /** Whether this tool requires user approval before execution */
  requiresApproval: boolean;
  /** JSON Schema for the tool arguments */
  schema: ToolSchema;
  /** The tool execution function */
  execute: (args: TArgs, context: ToolExecutionContext) => Promise<ToolExecutionResult>;
  /** Tool category for UI grouping */
  category?: ToolCategory;
  /** UI metadata for display */
  ui?: ToolUIMetadata;

  // ==========================================================================
  // Advanced Tool Use Features (from Anthropic engineering patterns)
  // ==========================================================================

  /**
   * Examples of correct tool usage to improve accuracy.
   * Anthropic research shows this improves tool call accuracy from 72% to 90%.
   * Each example should demonstrate proper parameter formatting.
   */
  inputExamples?: TArgs[];

  /**
   * When true, tool schema is not loaded upfront but discovered on-demand.
   * Use for rarely-used tools to reduce context token usage by up to 85%.
   * Tool becomes available through the tool search mechanism.
   */
  deferLoading?: boolean;

  /**
   * Keywords for tool discovery when deferLoading is enabled.
   * Used by the tool search mechanism to find relevant tools.
   */
  searchKeywords?: string[];

  /**
   * Specifies who can call this tool.
   * - 'direct': Called directly by the LLM (default)
   * - 'code_execution': Called from within programmatic tool execution
   * Use this to enable Programmatic Tool Calling (PTC) for safe, read-only operations.
   */
  allowedCallers?: ('direct' | 'code_execution')[];

  /**
   * Risk level for safety validation.
   * - 'safe': Read-only operations, no side effects
   * - 'moderate': May modify files but reversible
   * - 'dangerous': Destructive or irreversible operations
   */
  riskLevel?: 'safe' | 'moderate' | 'dangerous';

  /**
   * Patterns that always require user confirmation even in YOLO mode.
   * Applied during safety validation.
   */
  alwaysConfirmPatterns?: RegExp[];

  /**
   * When true, this tool requires that the target file was read first.
   * Used by write/edit tools to ensure file contents are understood before modification.
   */
  mustReadBeforeWrite?: boolean;

  /**
   * Reference to a shared cache that tracks which files have been read.
   * Used in conjunction with mustReadBeforeWrite for safety validation.
   */
  trackedReadsInSession?: Map<string, number>;
}

// =============================================================================
// Tool Schema Types
// =============================================================================

export interface ToolSchema {
  type: 'object';
  properties: Record<string, SchemaProperty>;
  required?: string[];
}

export interface SchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: SchemaProperty;
  default?: unknown;
  /** For object types: nested property definitions */
  properties?: Record<string, SchemaProperty>;
  /** For object types: required property names */
  required?: string[];
}

// =============================================================================
// Tool Categories & UI
// =============================================================================

export type ToolCategory =
  | 'file-read'      // Reading files
  | 'file-write'     // Creating/modifying files
  | 'file-search'    // Finding/searching files
  | 'terminal'       // Running commands
  | 'media'          // Video, audio, media operations
  | 'communication'  // Email, messaging
  | 'system'         // System operations
  | 'code-intelligence' // Symbols, definitions, references, diagnostics
  | 'browser-read'   // Browser read-only operations (fetch, extract, console)
  | 'browser-write'  // Browser state-changing operations (click, type, navigate)
  | 'agent-internal' // Agent internal tools (planning, etc.)
  | 'other';         // Uncategorized

export interface ToolUIMetadata {
  /** Icon name from lucide-react */
  icon: string;
  /** Short label for display */
  label: string;
  /** Color class for the icon */
  color: string;
  /** Running state label */
  runningLabel: string;
  /** Completed state label */
  completedLabel: string;
}

// =============================================================================
// Terminal Types
// =============================================================================

export interface TerminalRunResult {
  pid: number;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  startedAt: number;
  finishedAt?: number;
}

export interface TerminalProcessState extends TerminalRunResult {
  command: string;
  /** Whether the process is still running */
  isRunning: boolean;
}

/** Terminal event payload for stdout/stderr events */
export interface TerminalOutputPayload {
  pid: number;
  chunk: string;
}

/** Terminal event payload for exit events */
export interface TerminalExitPayload {
  pid: number;
  code: number | null;
}

/** Terminal event payload for error events */
export interface TerminalErrorPayload {
  pid: number;
  error: string;
}

export interface TerminalManager {
  run(command: string, options?: TerminalRunOptions): Promise<TerminalProcessState>;
  getOutput(pid: number, options?: TerminalGetOutputOptions): TerminalProcessState | undefined;
  kill(pid: number): Promise<boolean>;
  /** Kill all running processes. Returns count of processes killed. */
  killAll(): Promise<number>;
  /** List all tracked processes (optional implementation) */
  listProcesses?(): Array<{ pid: number; command: string; isRunning: boolean; description?: string }>;
  /** Check if a process is still running (optional implementation) */
  isRunning?(pid: number): boolean;
  /** Clean up old completed processes (optional implementation) */
  cleanup?(maxAgeMs?: number): number;

  // Event emitter methods for real-time output
  on(event: 'stdout', listener: (payload: TerminalOutputPayload) => void): this;
  on(event: 'stderr', listener: (payload: TerminalOutputPayload) => void): this;
  on(event: 'exit', listener: (payload: TerminalExitPayload) => void): this;
  on(event: 'error', listener: (payload: TerminalErrorPayload) => void): this;
}

export interface TerminalRunOptions {
  /** Working directory for the command */
  cwd?: string;
  /** Wait for exit (false = background mode) */
  waitForExit?: boolean;
  /** Timeout in milliseconds (default: 120000ms, max: 600000ms) */
  timeout?: number;
  /** Human-readable description of the command */
  description?: string;
}

export interface TerminalGetOutputOptions {
  /** Optional regex pattern to filter output lines */
  filter?: string;
  /** Only return new output since last check (default: true for background processes) */
  incrementalOnly?: boolean;
}

// =============================================================================
// Execution Result Types
// =============================================================================

export interface EnhancedToolResult extends ToolExecutionResult {
  /** Timing information */
  timing?: {
    startedAt: number;
    completedAt: number;
    durationMs: number;
  };
  /** File changes if applicable */
  fileChanges?: FileChangeInfo[];
  /** Preview of output for UI display */
  preview?: string;
  /** Structured data for specific tool types */
  structured?: Record<string, unknown>;
}

export interface FileChangeInfo {
  path: string;
  action: 'created' | 'modified' | 'deleted' | 'read';
  linesAdded?: number;
  linesRemoved?: number;
  preview?: string;
}

// =============================================================================
// Tool Registration Types
// =============================================================================

export interface ToolRegistryEntry {
  definition: ToolDefinition;
  category: ToolCategory;
  metadata: ToolUIMetadata;
}

export interface ToolRegistryConfig {
  tools: ToolDefinition[];
  logger: ToolLogger;
}
