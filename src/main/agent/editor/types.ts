/**
 * Editor AI Types
 * 
 * Type definitions for AI-powered editor features.
 */

import type { LLMProviderName } from '../../../shared/types';

// =============================================================================
// Editor AI Action Types
// =============================================================================

export type EditorAIAction =
  | 'explain'
  | 'refactor'
  | 'fix-errors'
  | 'generate-tests'
  | 'add-documentation'
  | 'optimize'
  | 'complete-inline'
  | 'summarize-file'
  | 'find-issues'
  | 'convert';

export interface EditorAIRequest {
  /** The action to perform */
  action: EditorAIAction;
  /** File path */
  filePath: string;
  /** Programming language */
  language: string;
  /** Selected code (for selection-based actions) */
  selectedCode?: string;
  /** Full file content (for file-level actions) */
  fileContent?: string;
  /** Cursor position */
  cursorPosition?: { line: number; column: number };
  /** Selection range */
  selectionRange?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  /** Additional context (e.g., error messages for fix-errors) */
  context?: EditorAIContext;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

export interface EditorAIContext {
  /** Diagnostic errors/warnings */
  diagnostics?: EditorDiagnostic[];
  /** Surrounding code context */
  surroundingCode?: {
    before: string;
    after: string;
  };
  /** Import statements in the file */
  imports?: string[];
  /** Symbol information */
  symbols?: EditorSymbol[];
  /** Project type (e.g., 'react', 'node', 'typescript') */
  projectType?: string;
  /** Additional instructions from user */
  userInstructions?: string;
}

export interface EditorDiagnostic {
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  source?: string;
  code?: string | number;
}

export interface EditorSymbol {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'variable' | 'type' | 'method' | 'property';
  line: number;
  endLine?: number;
}

// =============================================================================
// Editor AI Response Types
// =============================================================================

export interface EditorAIResponse {
  /** Whether the request was successful */
  success: boolean;
  /** The action that was performed */
  action: EditorAIAction;
  /** Result content */
  result?: EditorAIResult;
  /** Error message if failed */
  error?: string;
  /** Provider used */
  provider?: LLMProviderName;
  /** Model used */
  modelId?: string;
  /** Time taken in ms */
  latencyMs?: number;
}

export interface EditorAIResult {
  /** Text content (explanation, documentation, etc.) */
  text?: string;
  /** Code to insert/replace */
  code?: string;
  /** Code edits to apply */
  edits?: CodeEdit[];
  /** Suggestions/recommendations */
  suggestions?: AISuggestion[];
  /** Generated tests */
  tests?: GeneratedTest[];
}

export interface CodeEdit {
  /** Range to replace */
  range: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  /** New text to insert */
  newText: string;
  /** Description of the edit */
  description?: string;
}

export interface AISuggestion {
  /** Suggestion title */
  title: string;
  /** Detailed description */
  description: string;
  /** Severity/importance */
  severity: 'high' | 'medium' | 'low';
  /** Line number if applicable */
  line?: number;
  /** Suggested fix code */
  fix?: string;
}

export interface GeneratedTest {
  /** Test name */
  name: string;
  /** Test code */
  code: string;
  /** Test framework (jest, vitest, etc.) */
  framework?: string;
}

// =============================================================================
// Inline Completion Types
// =============================================================================

export interface InlineCompletionRequest {
  /** File path */
  filePath: string;
  /** Programming language */
  language: string;
  /** Full file content */
  content: string;
  /** Cursor line (1-indexed) */
  line: number;
  /** Cursor column (1-indexed) */
  column: number;
  /** Text before cursor on current line */
  prefix: string;
  /** Text after cursor on current line */
  suffix: string;
  /** Lines before cursor for context */
  contextBefore?: string[];
  /** Lines after cursor for context */
  contextAfter?: string[];
  /** Trigger kind */
  triggerKind: 'automatic' | 'explicit';
  /** Max tokens to generate */
  maxTokens?: number;
  /** Abort signal */
  signal?: AbortSignal;
}

export interface InlineCompletionResponse {
  /** Completion text */
  text: string | null;
  /** Range to replace (if different from cursor position) */
  range?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  /** Provider used */
  provider?: LLMProviderName;
  /** Model used */
  modelId?: string;
  /** Latency in ms */
  latencyMs?: number;
  /** Whether result was cached */
  cached?: boolean;
  /** Error if failed */
  error?: string;
  /** Whether API quota was exceeded */
  quotaExceeded?: boolean;
  /** Whether rate limit was hit */
  rateLimited?: boolean;
}

// =============================================================================
// Quick Fix Types
// =============================================================================

export interface QuickFixRequest {
  /** File path */
  filePath: string;
  /** Programming language */
  language: string;
  /** The diagnostic to fix */
  diagnostic: EditorDiagnostic;
  /** Code around the error */
  codeContext: string;
  /** Full file content */
  fileContent?: string;
  /** Abort signal */
  signal?: AbortSignal;
}

export interface QuickFixResponse {
  /** Available fixes */
  fixes: QuickFix[];
  /** Provider used */
  provider?: LLMProviderName;
  /** Latency in ms */
  latencyMs?: number;
  /** Error if failed */
  error?: string;
}

export interface QuickFix {
  /** Fix title */
  title: string;
  /** Fix description */
  description?: string;
  /** Code edits to apply */
  edits: CodeEdit[];
  /** Whether this is the preferred fix */
  isPreferred?: boolean;
  /** Fix kind (quickfix, refactor, etc.) */
  kind?: string;
}

// =============================================================================
// Service Configuration
// =============================================================================

export interface EditorAIConfig {
  /** Enable inline completions */
  enableInlineCompletions: boolean;
  /** Enable AI quick fixes */
  enableQuickFixes: boolean;
  /** Enable AI code actions */
  enableCodeActions: boolean;
  /** Debounce delay for inline completions (ms) */
  inlineCompletionDebounceMs: number;
  /** Max tokens for inline completions */
  inlineCompletionMaxTokens: number;
  /** Temperature for completions */
  completionTemperature: number;
  /** Context lines before cursor */
  contextLinesBefore: number;
  /** Context lines after cursor */
  contextLinesAfter: number;
  /** Preferred provider for editor AI */
  preferredProvider: LLMProviderName | 'auto';
}

export const DEFAULT_EDITOR_AI_CONFIG: EditorAIConfig = {
  enableInlineCompletions: true,
  enableQuickFixes: true,
  enableCodeActions: true,
  inlineCompletionDebounceMs: 300,
  inlineCompletionMaxTokens: 128,
  completionTemperature: 0.2,
  contextLinesBefore: 50,
  contextLinesAfter: 10,
  preferredProvider: 'auto',
};
