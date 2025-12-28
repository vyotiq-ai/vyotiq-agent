/**
 * LSP Types
 * 
 * Type definitions for the Language Server Protocol integration.
 */

// =============================================================================
// LSP Protocol Types (subset of official LSP types we need)
// =============================================================================

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

export interface TextDocumentIdentifier {
  uri: string;
}

export interface TextDocumentPositionParams {
  textDocument: TextDocumentIdentifier;
  position: Position;
}

export interface TextEdit {
  range: Range;
  newText: string;
}

export interface WorkspaceEdit {
  changes?: { [uri: string]: TextEdit[] };
}

export type DiagnosticSeverity = 1 | 2 | 3 | 4; // Error, Warning, Info, Hint

export interface Diagnostic {
  range: Range;
  severity?: DiagnosticSeverity;
  code?: number | string;
  source?: string;
  message: string;
  relatedInformation?: DiagnosticRelatedInformation[];
}

export interface DiagnosticRelatedInformation {
  location: Location;
  message: string;
}

export interface CompletionItem {
  label: string;
  kind?: CompletionItemKind;
  detail?: string;
  documentation?: string | MarkupContent;
  insertText?: string;
  textEdit?: TextEdit;
  sortText?: string;
  filterText?: string;
}

export type CompletionItemKind = 
  | 1  // Text
  | 2  // Method
  | 3  // Function
  | 4  // Constructor
  | 5  // Field
  | 6  // Variable
  | 7  // Class
  | 8  // Interface
  | 9  // Module
  | 10 // Property
  | 11 // Unit
  | 12 // Value
  | 13 // Enum
  | 14 // Keyword
  | 15 // Snippet
  | 16 // Color
  | 17 // File
  | 18 // Reference
  | 19 // Folder
  | 20 // EnumMember
  | 21 // Constant
  | 22 // Struct
  | 23 // Event
  | 24 // Operator
  | 25; // TypeParameter

export interface MarkupContent {
  kind: 'plaintext' | 'markdown';
  value: string;
}

export interface Hover {
  contents: MarkupContent | string | Array<MarkupContent | string>;
  range?: Range;
}

export interface SignatureHelp {
  signatures: SignatureInformation[];
  activeSignature?: number;
  activeParameter?: number;
}

export interface SignatureInformation {
  label: string;
  documentation?: string | MarkupContent;
  parameters?: ParameterInformation[];
}

export interface ParameterInformation {
  label: string | [number, number];
  documentation?: string | MarkupContent;
}

export type SymbolKind =
  | 1  // File
  | 2  // Module
  | 3  // Namespace
  | 4  // Package
  | 5  // Class
  | 6  // Method
  | 7  // Property
  | 8  // Field
  | 9  // Constructor
  | 10 // Enum
  | 11 // Interface
  | 12 // Function
  | 13 // Variable
  | 14 // Constant
  | 15 // String
  | 16 // Number
  | 17 // Boolean
  | 18 // Array
  | 19 // Object
  | 20 // Key
  | 21 // Null
  | 22 // EnumMember
  | 23 // Struct
  | 24 // Event
  | 25 // Operator
  | 26; // TypeParameter

export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: SymbolKind;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}

export interface SymbolInformation {
  name: string;
  kind: SymbolKind;
  location: Location;
  containerName?: string;
}

export interface CodeAction {
  title: string;
  kind?: CodeActionKind;
  diagnostics?: Diagnostic[];
  isPreferred?: boolean;
  edit?: WorkspaceEdit;
  command?: Command;
}

export type CodeActionKind = string; // e.g., 'quickfix', 'refactor', 'source'

export interface Command {
  title: string;
  command: string;
  arguments?: unknown[];
}

export interface ReferenceContext {
  includeDeclaration: boolean;
}

// =============================================================================
// Server Capabilities
// =============================================================================

export interface ServerCapabilities {
  textDocumentSync?: number | TextDocumentSyncOptions;
  completionProvider?: CompletionOptions;
  hoverProvider?: boolean;
  signatureHelpProvider?: SignatureHelpOptions;
  definitionProvider?: boolean;
  typeDefinitionProvider?: boolean;
  implementationProvider?: boolean;
  referencesProvider?: boolean;
  documentHighlightProvider?: boolean;
  documentSymbolProvider?: boolean;
  workspaceSymbolProvider?: boolean;
  codeActionProvider?: boolean | CodeActionOptions;
  documentFormattingProvider?: boolean;
  documentRangeFormattingProvider?: boolean;
  renameProvider?: boolean | RenameOptions;
  diagnosticProvider?: DiagnosticOptions;
}

export interface TextDocumentSyncOptions {
  openClose?: boolean;
  change?: number; // 0=None, 1=Full, 2=Incremental
  save?: boolean | { includeText?: boolean };
}

export interface CompletionOptions {
  triggerCharacters?: string[];
  resolveProvider?: boolean;
}

export interface SignatureHelpOptions {
  triggerCharacters?: string[];
  retriggerCharacters?: string[];
}

export interface CodeActionOptions {
  codeActionKinds?: CodeActionKind[];
  resolveProvider?: boolean;
}

export interface RenameOptions {
  prepareProvider?: boolean;
}

export interface DiagnosticOptions {
  identifier?: string;
  interFileDependencies: boolean;
  workspaceDiagnostics: boolean;
}

// =============================================================================
// Language Server Configuration
// =============================================================================

export type SupportedLanguage = 
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'rust'
  | 'go'
  | 'java'
  | 'csharp'
  | 'cpp'
  | 'c'
  | 'ruby'
  | 'php'
  | 'swift'
  | 'kotlin'
  | 'scala'
  | 'html'
  | 'css'
  | 'json'
  | 'yaml'
  | 'markdown';

export interface LanguageServerConfig {
  /** Language identifier */
  language: SupportedLanguage;
  /** Display name */
  displayName: string;
  /** File extensions this server handles */
  extensions: string[];
  /** Command to start the server */
  command: string;
  /** Arguments for the command */
  args: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Initialization options */
  initializationOptions?: Record<string, unknown>;
  /** Root URI patterns to detect this language */
  rootPatterns?: string[];
  /** Whether this server is installed/available */
  installed?: boolean;
}

// =============================================================================
// LSP Client Types
// =============================================================================

export type LSPClientState = 'stopped' | 'starting' | 'running' | 'error';

export interface LSPClientInfo {
  language: SupportedLanguage;
  state: LSPClientState;
  capabilities: ServerCapabilities | null;
  error?: string;
  pid?: number;
  startedAt?: number;
}

// =============================================================================
// LSP Event Types
// =============================================================================

export interface LSPDiagnosticsEvent {
  uri: string;
  diagnostics: Diagnostic[];
}

export interface LSPEvent {
  type: 'diagnostics' | 'log' | 'error' | 'state-change';
  language: SupportedLanguage;
  data: unknown;
}

// =============================================================================
// Normalized Result Types (for tools and UI)
// =============================================================================

export interface NormalizedDiagnostic {
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  source: string;
  code?: string | number;
}

export interface NormalizedHover {
  contents: string;
  range?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
}

export interface NormalizedCompletion {
  label: string;
  kind: string;
  detail?: string;
  documentation?: string;
  insertText?: string;
  sortText?: string;
}

export interface NormalizedLocation {
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

export interface NormalizedSymbol {
  name: string;
  kind: string;
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  containerName?: string;
  children?: NormalizedSymbol[];
}

export interface NormalizedCodeAction {
  title: string;
  kind?: string;
  isPreferred?: boolean;
  edits?: Array<{
    filePath: string;
    range: {
      startLine: number;
      startColumn: number;
      endLine: number;
      endColumn: number;
    };
    newText: string;
  }>;
}

export interface NormalizedSignatureHelp {
  signatures: Array<{
    label: string;
    documentation?: string;
    parameters?: Array<{
      label: string;
      documentation?: string;
    }>;
  }>;
  activeSignature?: number;
  activeParameter?: number;
}
