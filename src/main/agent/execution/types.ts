/**
 * Execution Module Types
 * Types specific to run execution and iteration management
 */

import type {
  AgentEvent,
  LLMProviderName,
  RendererEvent,
  ToolCallPayload,
  ProviderSettings,
  SafetySettings,
  CacheSettings,
  PromptSettings,
  ComplianceSettings,
  TokenUsage,
  RoutingDecision,
  TaskRoutingSettings,
  ToolConfigSettings,
} from '../../../shared/types';
import type { InternalSession } from '../types';
import type { Logger } from '../../logger';
import type { ProviderMap } from '../providers';
import type { ToolRegistry, TerminalManager } from '../../tools';
import type { LLMProvider } from '../providers/baseProvider';
import type { DebugSettings, AccessLevelSettings } from '../../../shared/types';

/**
 * Provider health tracking callback
 */
export type ProviderHealthCallback = (
  provider: LLMProviderName,
  success: boolean,
  latencyMs: number
) => void;

/**
 * Dependencies required by RunExecutor
 */
export interface RunExecutorDeps {
  providers: ProviderMap;
  toolRegistry: ToolRegistry;
  terminalManager: TerminalManager;
  logger: Logger;
  emitEvent: (event: RendererEvent | AgentEvent) => void;
  getRateLimit: (provider: LLMProviderName) => number;
  getProviderSettings: (provider: LLMProviderName) => ProviderSettings | undefined;
  updateSessionState: (sessionId: string, update: Partial<InternalSession['state']>) => void;
  getSafetySettings: () => SafetySettings | undefined;
  getCacheSettings?: () => CacheSettings | undefined;
  getDebugSettings?: () => DebugSettings | undefined;
  getPromptSettings?: () => PromptSettings | undefined;
  getComplianceSettings?: () => ComplianceSettings | undefined;
  getAccessLevelSettings?: () => AccessLevelSettings | undefined;
  getToolSettings?: () => ToolConfigSettings | undefined;
  getTaskRoutingSettings?: () => TaskRoutingSettings | undefined;
  getEditorState?: () => EditorState;
  getWorkspaceDiagnostics?: () => Promise<WorkspaceDiagnostics | null>;
  /** Callback for tracking provider health (success/failure, latency) */
  onProviderHealth?: ProviderHealthCallback;
}

/**
 * Editor state for context injection
 */
export interface EditorState {
  activeFile: string | null;
  cursorPosition: { lineNumber: number; column: number } | null;
  diagnostics?: Array<{
    filePath: string;
    message: string;
    severity: 'error' | 'warning' | 'info' | 'hint';
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
    source?: string;
    code?: string | number;
  }>;
}

/**
 * Workspace diagnostics for context injection
 */
export interface WorkspaceDiagnostics {
  diagnostics: Array<{
    filePath: string;
    fileName: string;
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
    message: string;
    severity: 'error' | 'warning' | 'info' | 'hint';
    source: string;
    code?: string | number;
  }>;
  errorCount: number;
  warningCount: number;
  filesWithErrors: string[];
  collectedAt: number;
}

/**
 * Iteration settings for a session
 */
export interface IterationSettings {
  maxIterations: number;
  maxRetries: number;
  retryDelayMs: number;
}

/**
 * Result of an iteration execution
 */
export type IterationResult = 'completed' | 'tool-continue' | 'awaiting-confirmation' | 'cancelled';

/**
 * Result of provider retry logic
 */
export interface RetryResult {
  result: 'completed' | 'tool-continue' | 'error';
  usage?: TokenUsage;
}

/**
 * Provider selection result
 */
export interface ProviderSelectionResult {
  primary: LLMProvider | null;
  fallback: LLMProvider | null;
  allAvailable: LLMProvider[];
  routingDecision?: RoutingDecision;
}

/**
 * Run timing data for progress display
 */
export interface RunTimingData {
  startedAt: number;
  iterationTimes: number[];
}

/**
 * Stream state for repetition detection
 */
export interface StreamState {
  recentChunks: string[];
  repetitionDetected: boolean;
}

/**
 * Callback types for streaming
 */
export type StreamOutputCallback = (chunk: string, isThinking?: boolean, storeAsReasoningContent?: boolean) => void;
export type ToolCallCallback = (toolCall: ToolCallPayload) => void;
export type MediaOutputCallback = (mediaType: 'image' | 'audio', data: string, mimeType: string) => void;

/**
 * Tool with progress ID annotation
 */
export type AnnotatedToolCall = ToolCallPayload & { __progressId?: string };

/**
 * Access check result
 */
export interface AccessCheckResult {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason?: string;
}
