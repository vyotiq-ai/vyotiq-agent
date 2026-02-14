/**
 * LSP, Symbol, Diagnostics & File Tree Types
 * 
 * Contains types for code completion, symbols, diagnostics, hover info,
 * file tree representation, and file system operations.
 * Extracted from shared/types.ts for modular organization.
 */

// =============================================================================
// File Tree Types
// =============================================================================

/** Represents a node in the file tree (file or directory) */
export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  /** File size in bytes (only for files) */
  size?: number;
  /** Last modified timestamp */
  modifiedAt?: number;
  /** File extension (only for files) */
  extension?: string;
  /** Whether the directory is expanded in UI */
  isExpanded?: boolean;
  /** Whether this is a hidden file/folder (starts with .) */
  isHidden?: boolean;
}

// =============================================================================
// Symbol Service Types
// =============================================================================

/** Types of code symbols */
export type SymbolKind =
  | 'class'
  | 'interface'
  | 'function'
  | 'method'
  | 'property'
  | 'variable'
  | 'constant'
  | 'enum'
  | 'type'
  | 'import'
  | 'export'
  | 'component';

/** Information about a code symbol */
export interface SymbolInfo {
  /** Symbol name */
  name: string;
  /** Type of symbol */
  kind: SymbolKind;
  /** File path where symbol is defined */
  filePath: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** End line number */
  endLine: number;
  /** End column number */
  endColumn: number;
  /** Parent symbol name (e.g., class name for a method) */
  containerName?: string;
  /** Export modifiers */
  isExported?: boolean;
  /** Default export */
  isDefault?: boolean;
  /** Brief documentation/JSDoc comment */
  documentation?: string;
}

/** Location of a symbol reference or definition */
export interface SymbolLocation {
  /** File path */
  filePath: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** End column number */
  endColumn?: number;
  /** Preview of the line content */
  preview?: string;
  /** Whether this is the definition */
  isDefinition?: boolean;
}

/** Hover information for a symbol */
export interface HoverInfo {
  /** Symbol name */
  name: string;
  /** Symbol kind */
  kind: SymbolKind;
  /** Full signature or type annotation */
  signature?: string;
  /** Documentation/JSDoc */
  documentation?: string;
  /** File path where defined */
  definitionPath?: string;
  /** Definition line number */
  definitionLine?: number;
  /** Content to display */
  content?: string;
  /** Range in the source */
  range?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
}

// =============================================================================
// Diagnostics Service Types
// =============================================================================

/** Severity levels for diagnostics */
export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';

/** A diagnostic (error, warning, etc.) in a file */
export interface DiagnosticInfo {
  /** File path */
  filePath: string;
  /** File name (extracted from path) */
  fileName?: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** End line number */
  endLine?: number;
  /** End column number */
  endColumn?: number;
  /** Diagnostic message */
  message: string;
  /** Severity level */
  severity: DiagnosticSeverity;
  /** Source of the diagnostic (e.g., 'typescript', 'eslint') */
  source: string;
  /** Error code (e.g., 'TS2345', 'no-unused-vars') */
  code?: string;
  /** Suggested fix if available */
  suggestedFix?: string;
}

/** Summary of diagnostics for a workspace or file */
export interface DiagnosticsSummary {
  /** Total error count */
  errors: number;
  /** Total warning count */
  warnings: number;
  /** Total info count */
  infos: number;
  /** Total hint count */
  hints: number;
  /** Grand total */
  total: number;
  /** Count by file path */
  byFile: Record<string, number>;
}

// =============================================================================
// Completion Types
// =============================================================================

export interface CompletionContext {
  filePath: string;
  language: string;
  content: string;
  line: number;
  column: number;
  prefix: string;
  suffix: string;
  triggerCharacter?: string;
  isManualTrigger?: boolean;
}

export interface CompletionItem {
  id: string;
  insertText: string;
  label: string;
  detail?: string;
  documentation?: string;
  kind: CompletionKind;
  range?: CompletionRange;
  sortPriority: number;
  isSnippet?: boolean;
  provider?: string;
  confidence?: number;
}

export interface CompletionRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export type CompletionKind =
  | 'text' | 'method' | 'function' | 'constructor' | 'field'
  | 'variable' | 'class' | 'interface' | 'module' | 'property'
  | 'unit' | 'value' | 'enum' | 'keyword' | 'snippet' | 'color'
  | 'file' | 'reference' | 'constant' | 'struct' | 'event'
  | 'operator' | 'typeParameter';

export interface CompletionResult {
  items: CompletionItem[];
  isComplete: boolean;
  timeTakenMs: number;
  cached: boolean;
}

export interface InlineCompletionContext extends CompletionContext {
  maxTokens?: number;
}

export interface InlineCompletionResult {
  text: string;
  range?: CompletionRange;
  provider?: string;
  confidence?: number;
}

export interface CompletionServiceConfig {
  maxCompletions: number;
  debounceMs: number;
  cacheTtlMs: number;
  contextLinesBefore: number;
  contextLinesAfter: number;
  temperature: number;
  maxTokens: number;
  includeSymbols: boolean;
  includeImports: boolean;
  minPrefixLength: number;
}

// =============================================================================
// File Operations Types
// =============================================================================

/** Type of file change event */
export type FileChangeType = 'change' | 'create' | 'delete' | 'rename';

/** File change event from file watcher */
export interface FileChangeEvent {
  type: FileChangeType;
  path: string;
  oldPath?: string; // For rename events
  timestamp: number;
}

/** Options for file watching */
export interface WatchOptions {
  /** Patterns to ignore (glob-like) */
  ignorePatterns?: string[];
  /** Watch directories recursively */
  recursive?: boolean;
  /** Debounce time in milliseconds for rapid file changes */
  debounceMs?: number;
}

/** Watcher status information */
export interface WatcherStatus {
  watcherCount: number;
  paths: Array<{ path: string; isDirectory: boolean }>;
  pendingEvents: number;
}

/** Type of bulk file operation */
export type BulkOperationType = 'rename' | 'move' | 'copy' | 'delete';

/** A single bulk file operation */
export interface BulkOperation {
  type: BulkOperationType;
  source: string;
  destination?: string;
}

/** Result of a bulk operation */
export interface BulkOperationResult {
  operation: BulkOperation;
  success: boolean;
  error?: string;
}
