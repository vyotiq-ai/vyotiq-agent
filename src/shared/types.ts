// Local imports for types that are re-exported from sub-modules but also used
// within this file (re-exports don't introduce local names in TypeScript).
import type { PromptSettings } from './types/prompt';
import type { AccessLevelSettings } from './types/accessLevel';
import type { AppearanceSettings } from './types/appearance';
import type { TaskRoutingSettings, RoutingDecision } from './types/taskRouting';
import type { ToolConfigSettings } from './types/tools';
import type { GitEvent, GitRemote, GitCommit } from './types/git';
import type { CommunicationQuestion, DecisionRequest, ProgressLevel } from './types/communication';

export type LLMProviderName = 'anthropic' | 'openai' | 'deepseek' | 'gemini' | 'openrouter' | 'xai' | 'mistral' | 'glm';

export type AgentRole = 'system' | 'user' | 'assistant' | 'tool';

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
  /**
   * DeepSeek context caching: tokens that hit the cache (cheaper pricing).
   * @see https://api-docs.deepseek.com/guides/kv_cache
   */
  cacheHit?: number;
  /**
   * DeepSeek context caching: tokens that missed the cache.
   * @see https://api-docs.deepseek.com/guides/kv_cache
   */
  cacheMiss?: number;
  /**
   * DeepSeek reasoning tokens: tokens used in chain-of-thought reasoning.
   * Only present for deepseek-reasoner or when thinking mode is enabled.
   * @see https://api-docs.deepseek.com/guides/thinking_mode
   */
  reasoningTokens?: number;
}

export interface AttachmentMetadata {
  id: string;
  name: string;
  path?: string;
  mimeType: string;
  size: number;
  encoding: 'utf-8' | 'base64';
  preview?: string;
  description?: string;
  content?: string;
}

export interface AttachmentPayload extends AttachmentMetadata {
  content?: string;
}

export interface ChatMessage {
  id: string;
  role: AgentRole;
  content: string;
  createdAt: number;
  /** Timestamp when the message was last updated (for edited messages) */
  updatedAt?: number;
  provider?: LLMProviderName;
  /** The specific model ID used for this message (e.g., 'claude-sonnet-4-20250514') */
  modelId?: string;
  /** Whether auto mode was used to select this model */
  isAutoRouted?: boolean;
  /** 
   * Run ID - links messages from the same agent run together.
   * All assistant and tool messages from a single user request share the same runId.
   * Used for UI grouping and deduplication.
   */
  runId?: string;
  /**
   * Iteration number within a run - tracks which iteration of the agent loop
   * generated this message. First iteration is 1.
   */
  iteration?: number;
  /**
   * Branch ID - identifies which conversation branch this message belongs to.
   * When a user forks from a message, a new branch is created.
   */
  branchId?: string;
  /**
   * Parent message ID - for branched messages, points to the message from which this branch forked.
   */
  parentMessageId?: string;
  /**
   * Whether this is a follow-up message injected while the agent was running.
   * Follow-ups are sent by the user mid-run to provide additional context,
   * corrections, or instructions to the agent in real-time.
   */
  isFollowUp?: boolean;
  toolName?: string;
  toolCallId?: string;
  toolCalls?: ToolCallPayload[];
  attachments?: AttachmentMetadata[];
  requiresInlineConfirmation?: boolean;
  usage?: TokenUsage;
  /** For tool messages: indicates if the tool execution was successful */
  toolSuccess?: boolean;
  /** Metadata associated with tool results for specialized UI rendering */
  resultMetadata?: Record<string, unknown>;
  /** Indicates this is a summary of previous messages (for context management) */
  isSummary?: boolean;
  /** Original content before compression (for tool results) */
  originalContent?: string;
  /**
   * Thinking/reasoning content from thinking models (Gemini 2.5/3, etc.)
   * Contains the model's internal thought process summary.
   * This is displayed in the UI's Reasoning panel.
   * @see https://ai.google.dev/gemini-api/docs/thinking
   */
  thinking?: string;
  /**
   * Whether thinking is currently being streamed (for UI indicator)
   */
  isThinkingStreaming?: boolean;
  /**
   * Reasoning content for API purposes only (not displayed in UI).
   * Used by DeepSeek to pass reasoning_content back during tool call loops.
   * This is separate from `thinking` which is for UI display.
   * @see https://api-docs.deepseek.com/guides/thinking_mode#tool-calls
   */
  reasoningContent?: string;
  /**
   * Thought signature for maintaining reasoning context across turns.
   * Must be passed back exactly as received for Gemini 3 Pro function calling.
   * @see https://ai.google.dev/gemini-api/docs/thought-signatures
   */
  thoughtSignature?: string;

  /**
   * Anthropic extended thinking signature for verifying thinking blocks.
   * Must be passed back with thinking content for multi-turn conversations.
   * @see https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking#thinking-encryption
   */
  anthropicThinkingSignature?: string;

  /**
   * Redacted thinking content (encrypted) from Anthropic.
   * Safety-flagged reasoning that is encrypted but must be passed back to the API.
   * Not displayed to users but required for multi-turn tool use conversations.
   * @see https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking#thinking-redaction
   */
  redactedThinking?: string;

  /**
   * Generated images from image generation models (Gemini 2.5/3 image models).
   * @see https://ai.google.dev/gemini-api/docs/image-generation
   */
  generatedImages?: Array<{
    /** Base64-encoded image data */
    data: string;
    /** MIME type (e.g., 'image/png', 'image/jpeg') */
    mimeType: string;
  }>;
  /**
   * Generated audio from TTS models (Gemini 2.5 TTS models).
   * @see https://ai.google.dev/gemini-api/docs/speech-generation
   */
  generatedAudio?: {
    /** Base64-encoded audio data (PCM or WAV) */
    data: string;
    /** MIME type (e.g., 'audio/wav', 'audio/pcm') */
    mimeType: string;
  };

  /**
   * Provider-specific internal metadata that should not be rendered in the UI.
   * Used to preserve provider-native conversation state across turns.
   */
  providerInternal?: {
    openai?: {
      /**
       * Reasoning output items (often encrypted) that must be passed back
       * with tool call outputs for reasoning models.
       */
      reasoningItems?: Array<Record<string, unknown>>;
    };
  };
  /**
   * User reaction to the message
   */
  reaction?: 'up' | 'down' | null;
}

export type AgentRunStatus = 'idle' | 'running' | 'awaiting-confirmation' | 'paused' | 'error';

export interface AgentConfig {
  preferredProvider: LLMProviderName | 'auto';
  fallbackProvider: LLMProviderName;
  allowAutoSwitch: boolean;
  /** 
   * Enable fallback to another provider when primary fails.
   * When false, errors will not trigger fallback - the run will fail.
   * @default true
   */
  enableProviderFallback?: boolean;
  /**
   * Enable auto model selection when preferredProvider is 'auto'.
   * When false and preferredProvider is 'auto', uses first available provider.
   * @default true
   */
  enableAutoModelSelection?: boolean;
  yoloMode: boolean;
  temperature: number;
  maxOutputTokens: number;
  /** Specific model ID to use (overrides provider default) */
  selectedModelId?: string;

  // OpenAI Reasoning Model Settings
  /**
   * Reasoning effort level for OpenAI reasoning models (GPT-5.x, o-series).
   * Controls how much compute the model spends on reasoning.
   * - 'none': No reasoning (fastest, temperature allowed)
   * - 'low': Minimal reasoning
   * - 'medium': Balanced reasoning (default)
   * - 'high': Deep reasoning
   * - 'xhigh': Maximum reasoning (GPT-5.2/Codex-Max only)
   * @see https://platform.openai.com/docs/guides/reasoning
   */
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh';

  /**
   * Verbosity level for OpenAI GPT-5.2 models.
   * Controls how verbose the model's responses are.
   * - 'low': Concise responses
   * - 'medium': Balanced verbosity (default)
   * - 'high': More detailed responses
   * @see https://platform.openai.com/docs/guides/text-generation
   */
  verbosity?: 'low' | 'medium' | 'high';

  // DeepSeek Thinking Mode Settings
  /**
   * Enable thinking mode for DeepSeek models that support it (deepseek-chat).
   * When enabled, deepseek-chat will use `thinking: { type: "enabled" }` parameter.
   * - deepseek-reasoner always uses thinking mode (this setting has no effect)
   * - deepseek-v3.2-speciale always uses thinking mode (this setting has no effect)
   * - temperature/top_p/penalties are ignored when thinking is enabled
   * @default true
   * @see https://api-docs.deepseek.com/guides/thinking_mode
   */
  enableDeepSeekThinking?: boolean;

  // Anthropic Extended Thinking Settings
  /**
   * Enable extended thinking for Anthropic Claude models that support it.
   * When enabled, Claude will show its reasoning process before providing a final answer.
   * Supported models: Claude 4.5 (Sonnet, Haiku, Opus), Claude 4 (Sonnet, Opus), Claude 3.7 Sonnet
   * @default true
   * @see https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking
   */
  enableAnthropicThinking?: boolean;

  /**
   * Token budget for Anthropic extended thinking (minimum 1024, max < maxOutputTokens).
   * Larger budgets can improve response quality for complex problems.
   * - Start with 10000 for moderate tasks
   * - Use 16000+ for complex reasoning tasks
   * - Maximum 32000 recommended (diminishing returns above this)
   * @default 10000
   * @see https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking#working-with-thinking-budgets
   */
  anthropicThinkingBudget?: number;

  /**
   * Enable interleaved thinking for Anthropic Claude 4 models with tool use.
   * Allows Claude to reason between tool calls for more sophisticated decision-making.
   * Requires the beta header 'interleaved-thinking-2025-05-14'.
   * @default false
   * @see https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking#interleaved-thinking
   */
  enableInterleavedThinking?: boolean;

  // Iteration Settings
  /** Maximum number of iterations per run (1-100, default: 20) */
  maxIterations?: number;
  /** Maximum number of retries on transient errors (0-5, default: 2) */
  maxRetries?: number;
  /** Base delay between retries in milliseconds (100-10000, default: 1500) */
  retryDelayMs?: number;
  /** Enable automatic context summarization when window fills */
  enableContextSummarization?: boolean;
  /** Minimum messages before summarization (10-500, default: 100) */
  summarizationThreshold?: number;
  /** Number of recent messages to keep intact (5-100, default: 40) */
  keepRecentMessages?: number;
}

// =============================================================================
// Settings Validation Constraints
// =============================================================================

/**
 * Centralized validation constraints for settings across UI and backend.
 * Used by both settingsValidation.ts and UI components to ensure consistent limits.
 * All min/max values are inclusive.
 */
export const SETTINGS_CONSTRAINTS = {
  // AgentConfig constraints
  temperature: { min: 0, max: 2, default: 0.7 },
  maxOutputTokens: { min: 1, max: 200000, default: 8192 },
  maxIterations: { min: 1, max: Infinity, default: 20 }, // No upper limit - fully configurable
  maxRetries: { min: 0, max: 10, default: 2 },
  retryDelayMs: { min: 100, max: 10000, default: 1500 },
  summarizationThreshold: { min: 10, max: 500, default: 100 },
  keepRecentMessages: { min: 5, max: 100, default: 40 },
  anthropicThinkingBudget: { min: 1024, max: 65536, default: 10000 },

  // SafetySettings constraints
  maxFilesPerRun: { min: 1, max: 500, default: 50 },
  maxBytesPerRun: { min: 1024, max: 100 * 1024 * 1024, default: 10 * 1024 * 1024 }, // 1KB - 100MB
  backupRetentionCount: { min: 0, max: 50, default: 5 },

  // CacheSettings constraints
  cacheMaxAge: { min: 60000, max: 86400000, default: 3600000 }, // 1min - 24hours
  maxCacheSize: { min: 10, max: 10000, default: 1000 },

  // ComplianceSettings constraints
  auditRetentionDays: { min: 1, max: 365, default: 90 },
  maxTokensPerMessage: { min: 100, max: 200000, default: 100000 },

  // BrowserSettings constraints
  maxPageLoadTimeout: { min: 1000, max: 120000, default: 30000 },
  maxConcurrentPages: { min: 1, max: 20, default: 5 },
  maxScreenshotSize: { min: 100, max: 4096, default: 1920 },

  // PromptSettings constraints
  maxMessageLength: { min: 100, max: 1000000, default: 100000 },
  maxToolResultLength: { min: 1000, max: 500000, default: 50000 },

  // Appearance constraints
  fontSize: { min: 8, max: 24, default: 14 },
  lineHeight: { min: 1, max: 3, default: 1.5 },
} as const;

/**
 * Type-safe accessor for constraint values
 */
export type SettingsConstraintKey = keyof typeof SETTINGS_CONSTRAINTS;

/**
 * Represents a conversation branch for exploring alternatives
 */
export interface ConversationBranch {
  id: string;
  /** Parent branch ID (null for main branch) */
  parentBranchId: string | null;
  /** Message ID where this branch forked from */
  forkPointMessageId: string;
  /** Human-readable name for the branch */
  name: string;
  createdAt: number;
}

export interface AgentSessionState {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  config: AgentConfig;
  status: AgentRunStatus;
  activeRunId?: string;
  messages: ChatMessage[];
  /** Workspace path this session is associated with (null = global/no workspace) */
  workspacePath?: string | null;
  /** All conversation branches for this session */
  branches?: ConversationBranch[];
  /** Currently active branch ID (null or undefined = main branch) */
  activeBranchId?: string | null;
}

/**
 * Session summary without full message content (for lazy loading in sidebar)
 * Contains just enough data to display in the session list without loading all messages
 */
export interface SessionSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  status: AgentRunStatus;
  messageCount: number;
  lastMessagePreview?: string;
  /** Workspace path this session is associated with */
  workspacePath?: string | null;
}

export interface ToolCallPayload {
  name: string;
  arguments: Record<string, unknown>;
  callId?: string;
  /**
   * Internal property to store the raw JSON string during streaming.
   * This is used by the frontend to render partial tool arguments.
   */
  _argsJson?: string;
  /**
   * Thought signature from Gemini 3 Pro models.
   * Required for function calling - must be passed back exactly as received.
   * @see https://ai.google.dev/gemini-api/docs/thought-signatures
   */
  thoughtSignature?: string;
}

export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  output: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderResponse {
  content: string;
  toolCalls?: ToolCallPayload[];
  usage?: TokenUsage;
  finishReason?: string;
  /**
   * Thinking/reasoning content from thinking models.
   * Contains the model's internal thought process summary.
   * @see https://ai.google.dev/gemini-api/docs/thinking
   */
  thinking?: string;
  /**
   * Thought signature for maintaining reasoning context.
   * @see https://ai.google.dev/gemini-api/docs/thought-signatures
   */
  thoughtSignature?: string;
  /**
   * Generated images from image generation models (Gemini 2.5/3 image models).
   * @see https://ai.google.dev/gemini-api/docs/image-generation
   */
  images?: Array<{
    /** Base64-encoded image data */
    data: string;
    /** MIME type (e.g., 'image/png', 'image/jpeg') */
    mimeType: string;
  }>;
  /**
   * Generated audio from TTS models (Gemini 2.5 TTS models).
   * @see https://ai.google.dev/gemini-api/docs/speech-generation
   */
  audio?: {
    /** Base64-encoded PCM audio data */
    data: string;
    /** MIME type (e.g., 'audio/wav') */
    mimeType: string;
  };

  /** Provider-specific internal metadata (never display to users). */
  providerInternal?: ChatMessage['providerInternal'];
}

export interface ProviderResponseChunk {
  /** Content delta for regular text output */
  delta?: string;
  /**
   * Thinking/reasoning delta from thinking models.
   * Streamed separately from content for UI differentiation.
   * @see https://ai.google.dev/gemini-api/docs/thinking
   */
  thinkingDelta?: string;
  /**
   * Store delta content as thinking for API purposes, but don't emit to UI.
   * Used by DeepSeek when tools are present - the reasoning_content must be
   * passed back to the API in subsequent requests, but we display it as
   * regular content (via delta) for better UX.
   * @see https://api-docs.deepseek.com/guides/thinking_mode#tool-calls
   */
  storeAsThinking?: boolean;
  /**
   * Indicates this is the start of thinking content (for UI)
   */
  thinkingStart?: boolean;
  /**
   * Indicates thinking content has completed (for UI)
   */
  thinkingEnd?: boolean;
  /**
   * Thought signature from text parts (non-function-call responses).
   * @see https://ai.google.dev/gemini-api/docs/thought-signatures
   */
  thoughtSignature?: string;
  toolCall?: {
    index: number;
    callId?: string;
    name?: string;
    argsJson?: string;
    /**
     * Indicates argsJson is the complete value (not a delta to append).
     * When true, argsJson should replace any accumulated args.
     * When false/undefined, argsJson is a delta to concatenate.
     */
    argsComplete?: boolean;
    /**
     * Thought signature from Gemini 3 Pro models.
     * Only present on the first function call in a response.
     * @see https://ai.google.dev/gemini-api/docs/thought-signatures
     */
    thoughtSignature?: string;
  };
  usage?: TokenUsage;
  finishReason?: string;

  /** Provider-specific internal metadata (never display to users). */
  providerInternal?: ChatMessage['providerInternal'];
  /**
   * Generated image chunk from image generation models.
   * @see https://ai.google.dev/gemini-api/docs/image-generation
   */
  image?: {
    /** Base64-encoded image data */
    data: string;
    /** MIME type (e.g., 'image/png', 'image/jpeg') */
    mimeType: string;
  };
  /**
   * Generated audio chunk from TTS models.
   * @see https://ai.google.dev/gemini-api/docs/speech-generation
   */
  audio?: {
    /** Base64-encoded PCM audio data chunk */
    data: string;
    /** MIME type (e.g., 'audio/wav') */
    mimeType: string;
  };
}

export interface AgentEventBase {
  sessionId: string;
  runId: string;
  timestamp: number;
}

export interface StreamDeltaEvent extends AgentEventBase {
  type: 'stream-delta';
  delta?: string;
  provider: LLMProviderName;
  /** Model ID being used for this response (e.g., 'gemini-3-pro-preview', 'claude-sonnet-4-5') */
  modelId?: string;
  messageId: string; // ID of the assistant message to append to
  /**
   * Whether this delta is thinking/reasoning content (from thinking models).
   * When true, the delta should be appended to the message's thinking field.
   * @see https://ai.google.dev/gemini-api/docs/thinking
   */
  isThinking?: boolean;
  /**
   * Tool call information if this delta is part of a tool call.
   * Used for real-time tool argument streaming.
   */
  toolCall?: {
    index: number;
    callId?: string;
    name?: string;
    argsJson?: string;
    argsComplete?: boolean;
    thoughtSignature?: string;
  };
}

/**
 * Structured error codes for agent run failures.
 * Enables the renderer to show targeted recovery UI.
 */
export type AgentErrorCode =
  | 'RATE_LIMIT'
  | 'AUTH_FAILURE'
  | 'QUOTA_EXCEEDED'
  | 'CONTEXT_OVERFLOW'
  | 'LOOP_DETECTED'
  | 'TOOL_NOT_SUPPORTED'
  | 'DATA_POLICY'
  | 'NETWORK_ERROR'
  | 'PROVIDER_ERROR'
  | 'MODEL_NOT_FOUND'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'COMPLIANCE_VIOLATION'
  | 'SESSION_ERROR'
  | 'UNKNOWN';

export interface RunStatusEvent extends AgentEventBase {
  type: 'run-status';
  status: AgentRunStatus;
  message?: string;
  /** Structured error code for programmatic handling in the renderer */
  errorCode?: AgentErrorCode;
  /** Whether the error is recoverable (show retry UI) */
  recoverable?: boolean;
  /** Suggested recovery action for the user */
  recoveryHint?: string;
}

export interface ToolCallEvent extends AgentEventBase {
  type: 'tool-call';
  toolCall: ToolCallPayload;
  requiresApproval: boolean;
}

export interface ToolResultEvent extends AgentEventBase {
  type: 'tool-result';
  result: ToolExecutionResult;
  /** The tool call ID that this result corresponds to */
  toolCallId?: string;
}

/**
 * Event emitted when tools are queued for execution.
 * Enables UI to show pending tools before they start running.
 */
export interface ToolQueuedEvent extends AgentEventBase {
  type: 'tool-queued';
  /** Tools that have been queued for execution */
  tools: Array<{
    callId: string;
    name: string;
    arguments?: Record<string, unknown>;
    queuePosition: number;
  }>;
  /** Total number of tools in queue */
  totalQueued: number;
}

/**
 * Event emitted when a tool starts executing.
 * Distinct from tool-call which is sent when tool needs approval.
 * This event indicates the tool is actively running.
 */
export interface ToolStartedEvent extends AgentEventBase {
  type: 'tool-started';
  toolCall: ToolCallPayload;
  /** Position in execution order (1-based) */
  executionOrder: number;
  /** Total tools being executed in this batch */
  totalInBatch: number;
}

/**
 * Event for generated media (images, audio) from multimodal models.
 * @see https://ai.google.dev/gemini-api/docs/image-generation
 * @see https://ai.google.dev/gemini-api/docs/speech-generation
 */
export interface MediaOutputEvent extends AgentEventBase {
  type: 'media-output';
  /** Type of media generated */
  mediaType: 'image' | 'audio';
  /** Base64-encoded media data */
  data: string;
  /** MIME type (e.g., 'image/png', 'audio/wav') */
  mimeType: string;
  /** ID of the assistant message this media belongs to */
  messageId: string;
  /** Provider that generated this media */
  provider: LLMProviderName;
}

export interface TerminalOutputEvent {
  type: 'terminal-output';
  pid: number;
  stream: 'stdout' | 'stderr';
  data: string;
  timestamp: number;
}

export interface TerminalExitEvent {
  type: 'terminal-exit';
  pid: number;
  code: number | null;
  timestamp: number;
}

export interface TerminalErrorEvent {
  type: 'terminal-error';
  pid: number;
  error: string;
  timestamp: number;
}

export interface SessionStateEvent {
  type: 'session-state';
  session: AgentSessionState;
}

/**
 * Compliance violation severity levels
 */
export type ComplianceViolationSeverity = 'error' | 'warning' | 'suggestion';

/**
 * Types of compliance violations
 */
export type ComplianceViolationType =
  | 'file-not-read-before-edit'
  | 'no-lint-check-after-edit'
  | 'unnecessary-file-creation'
  | 'excessive-changes'
  | 'path-format-error'
  | 'edit-string-mismatch'
  | 'missing-context-in-edit'
  | 'incomplete-implementation'
  | 'tool-misuse'
  | 'rule-violation';

/**
 * A compliance violation detected during a run
 */
export interface ComplianceViolation {
  /** Unique identifier */
  id: string;
  /** Type of violation */
  type: ComplianceViolationType;
  /** Severity level */
  severity: ComplianceViolationSeverity;
  /** Human-readable message */
  message: string;
  /** The rule that was violated */
  rule: string;
  /** Suggested correction */
  suggestion: string;
  /** Tool call that triggered the violation */
  toolCall?: {
    name: string;
    callId?: string;
  };
  /** When the violation occurred */
  timestamp: number;
}

/**
 * Event emitted when a compliance violation is detected
 */
export interface ComplianceViolationEvent extends AgentEventBase {
  type: 'compliance-violation';
  /** The violation details */
  violation: ComplianceViolation;
  /** Whether the action was blocked */
  wasBlocked: boolean;
  /** Tool name that triggered the violation */
  toolName: string;
}

export interface FileChangedEvent {
  type: 'file-changed';
  changeType: 'create' | 'write' | 'delete' | 'rename' | 'createDir';
  path: string;
  oldPath?: string; // For rename operations
}

export interface SessionsEvent {
  type: 'sessions-update';
  sessions: AgentSessionState[];
}

/**
 * Lightweight session patch event — carries only changed fields.
 * Avoids serializing the entire session (with all messages) over IPC
 * for trivial updates like renames, reactions, config changes, status updates.
 */
export interface SessionPatchEvent {
  type: 'session-patch';
  sessionId: string;
  patch: Partial<Pick<AgentSessionState, 'title' | 'status' | 'config' | 'activeBranchId' | 'branches' | 'updatedAt'>>;
  /** Optionally patch a specific message (e.g., reaction change) */
  messagePatch?: {
    messageId: string;
    changes: Partial<Pick<ChatMessage, 'reaction' | 'updatedAt'>>;
  };
}

// =============================================================================
// Model Configuration Types
// =============================================================================

/** Configuration for a specific model within a provider */
export interface ModelPreferences {
  /** The model ID to use for this provider */
  modelId: string;
  /** Custom temperature override for this provider (optional) */
  temperature?: number;
  /** Custom max tokens override for this provider (optional) */
  maxOutputTokens?: number;
}

/** Provider-specific settings */
export interface ProviderContextSettings {
  /** Whether to enable automatic pruning */
  autoPrune?: boolean;
  /** Utilization percent when context warnings start (0-1). */
  warnThreshold?: number;
  /** Utilization percent when aggressive pruning kicks in (0-1). */
  pruneThreshold?: number;
  /** Target utilization for the sliding window (0-100). */
  targetUtilization?: number;
  /** Minimum number of messages to preserve. */
  minMessagesToKeep?: number;
  /** Whether to preserve tool call/result pairs during pruning. */
  preserveToolPairs?: boolean;
  /** Whether summarization is allowed when window gets large. */
  enableSummarization?: boolean;
  /** Message count threshold before summarization triggers. */
  summarizationThreshold?: number;
}

export interface ProviderSettings {
  /** Whether this provider is enabled */
  enabled: boolean;
  /** Priority order (lower = higher priority) */
  priority: number;
  /** Model preferences for this provider */
  model: ModelPreferences;
  /** Custom base URL for the API (optional, for self-hosted/proxy) */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Optional context window configuration overrides */
  context?: ProviderContextSettings;
}

// =============================================================================
// Settings Types
// =============================================================================

/**
 * Safety settings for agent guardrails
 * Controls file limits, protected paths, dangerous commands, and backup behavior
 */
export interface SafetySettings {
  /** Maximum files that can be modified per run (1-200, default: 50) */
  maxFilesPerRun: number;

  /** Maximum total bytes that can be written per run (1MB-100MB, default: 10MB) */
  maxBytesPerRun: number;

  /** Paths that are always protected (glob patterns) */
  protectedPaths: string[];

  /** Commands that are never allowed */
  blockedCommands: string[];

  /** Enable automatic backups before modifications */
  enableAutoBackup: boolean;

  /** Number of backups to retain per file (1-20, default: 5) */
  backupRetentionCount: number;

  /** Always require confirmation for dangerous commands even in YOLO mode */
  alwaysConfirmDangerous: boolean;

  /** Enable sandbox for code execution (experimental) */
  enableSandbox: boolean;

  /** Network access policy for sandbox */
  sandboxNetworkPolicy: 'none' | 'localhost' | 'allowlist';

  /** Domains/IPs allowed when sandboxNetworkPolicy is 'allowlist' */
  sandboxNetworkAllowlist?: string[];
}

/**
 * Default safety settings
 */
export const DEFAULT_SAFETY_SETTINGS: SafetySettings = {
  maxFilesPerRun: 50,
  maxBytesPerRun: 10 * 1024 * 1024, // 10MB
  protectedPaths: [
    '.git/**',
    '.env',
    '.env.*',
    '.env.local',
    'node_modules/**',
    '*.pem',
    '*.key',
    '*.cert',
    '**/secrets/**',
    '**/credentials/**',
    '**/private/**',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
  ],
  blockedCommands: [
    'format c:',
    'format d:',
    'fdisk',
    'mkfs',
    'dd if=',
    'shutdown',
    'reboot',
    'rm -rf /',
    'rm -rf /*',
    'del /s /q c:',
  ],
  enableAutoBackup: true,
  backupRetentionCount: 5,
  alwaysConfirmDangerous: true,
  enableSandbox: false,
  sandboxNetworkPolicy: 'localhost',
};

/**
 * Cache and Performance Settings
 * Controls caching behavior for LLM responses and tool results
 */
export interface CacheSettings {
  /** Enable prompt caching per provider */
  enablePromptCache: Partial<Record<LLMProviderName, boolean>>;

  /** Tool result cache configuration */
  toolCache: {
    /** Enable tool result caching */
    enabled: boolean;
    /** Default TTL in milliseconds (default: 60000 = 1 minute) */
    defaultTtlMs: number;
    /** Maximum cache entries (default: 200) */
    maxEntries: number;
    /** Per-tool TTL overrides in milliseconds */
    toolTtls: Record<string, number>;
  };

  /** Context cache configuration */
  contextCache: {
    /** Enable context caching */
    enabled: boolean;
    /** Maximum cache size in MB (default: 50) */
    maxSizeMb: number;
    /** Default TTL in milliseconds (default: 300000 = 5 min) */
    defaultTtlMs: number;
  };

  /** Prompt caching strategy */
  promptCacheStrategy: 'default' | 'aggressive' | 'conservative';

  /** Enable LRU eviction for tool cache */
  enableLruEviction: boolean;
}

/**
 * Cache statistics for UI display
 */
export interface CacheStatistics {
  promptCache: {
    hits: number;
    misses: number;
    hitRate: number;
    tokensSaved: number;
    costSaved: number;
    creations: number;
    byProvider: Partial<Record<LLMProviderName, {
      hits: number;
      misses: number;
      tokensSaved: number;
      costSaved: number;
    }>>;
  };
  toolCache: {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: number;
    byTool: Record<string, number>;
  };
  contextCache: {
    entries: number;
    sizeBytes: number;
    maxSizeBytes: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
}

/**
 * Default cache settings
 */
export const DEFAULT_CACHE_SETTINGS: CacheSettings = {
  enablePromptCache: {
    anthropic: true,
    openai: true,
    deepseek: true,
    gemini: true,
  },
  toolCache: {
    enabled: true,
    defaultTtlMs: 60000,
    maxEntries: 200,
    toolTtls: {
      read: 120000,
      read_file: 120000,
      ls: 60000,
      list_dir: 60000,
      grep: 30000,
      glob: 45000,
      diagnostics: 10000,
    },
  },
  contextCache: {
    enabled: true,
    maxSizeMb: 50,
    defaultTtlMs: 300000,
  },
  promptCacheStrategy: 'default',
  enableLruEviction: true,
};

/**
 * Debugging and Tracing Settings
 * Controls verbose logging, payload capture, step-by-step execution,
 * trace export behavior, and debug visualization options.
 */
export interface DebugSettings {
  /** Enable verbose logging for detailed debug output */
  verboseLogging: boolean;

  /** Capture full request/response payloads for debugging */
  captureFullPayloads: boolean;

  /** Enable step-by-step execution mode (pause before each step) */
  stepByStepMode: boolean;

  /** Automatically export traces when an error occurs */
  autoExportOnError: boolean;

  /** Export format for traces (JSON or Markdown) */
  traceExportFormat: 'json' | 'markdown';

  /** Maximum preview length for payloads in trace export */
  maxPreviewLength: number;

  /** Include full payloads in exported traces */
  includeFullPayloadsInExport: boolean;

  /** Auto-scroll to new trace steps in viewer */
  autoScrollTraceViewer: boolean;

  /** Highlight duration threshold in ms (steps taking longer are highlighted) */
  highlightDurationThreshold: number;

  /** Show token usage in trace viewer */
  showTokenUsage: boolean;

  /** Show timing breakdown in trace viewer */
  showTimingBreakdown: boolean;

  /** Enable breakpoints on errors */
  breakOnError: boolean;

  /** Enable breakpoints on specific tools (comma-separated list) */
  breakOnTools: string;

  /** Log level for debugging output */
  logLevel: 'error' | 'warn' | 'info' | 'debug' | 'trace';
}

/**
 * Default debugging settings
 */
export const DEFAULT_DEBUG_SETTINGS: DebugSettings = {
  verboseLogging: false,
  captureFullPayloads: false,
  stepByStepMode: false,
  autoExportOnError: true,
  traceExportFormat: 'json',
  maxPreviewLength: 500,
  includeFullPayloadsInExport: false,
  autoScrollTraceViewer: true,
  highlightDurationThreshold: 5000,
  showTokenUsage: true,
  showTimingBreakdown: true,
  breakOnError: false,
  breakOnTools: '',
  logLevel: 'info',
};

/**
 * Trace summary for display in UI
 */
export interface TraceSummary {
  traceId: string;
  sessionId: string;
  runId: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  totalSteps: number;
  llmCalls: number;
  toolCalls: number;
  successfulToolCalls: number;
  failedToolCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  hasError: boolean;
  errorMessage?: string;
}

/**
 * Detailed trace step for viewing
 */
export interface TraceStepDetail {
  stepId: string;
  stepNumber: number;
  type: 'llm-call' | 'tool-call' | 'tool-result' | 'decision' | 'error';
  startedAt: number;
  completedAt: number;
  durationMs: number;

  // LLM call details
  provider?: string;
  model?: string;
  promptTokens?: number;
  outputTokens?: number;
  finishReason?: string;
  hasToolCalls?: boolean;
  contentPreview?: string;

  // Tool call details
  toolName?: string;
  toolCallId?: string;
  argumentsPreview?: string;
  requiresApproval?: boolean;
  wasApproved?: boolean;

  // Tool result details
  success?: boolean;
  outputPreview?: string;
  outputSize?: number;
  errorMessage?: string;
}

// =============================================================================
// Prompt Customization Types
// → Extracted to ./types/prompt.ts
// =============================================================================
export {
  type AgentPersona,
  type ContextInjectionRule,
  type ContextInjectionCondition,
  type ResponseFormatPreferences,
  type AgentInstructionScope,
  type AgentInstructionTrigger,
  type AgentInstruction,
  type AgentsMdFile,
  type AgentsMdSection,
  type AgentsMdContext,
  type InstructionFileType,
  type InstructionFileFrontmatter,
  type InstructionFile,
  type InstructionFilesConfig,
  type InstructionFilesContext,
  DEFAULT_INSTRUCTION_FILES_CONFIG,
  type PromptSettings,
  DEFAULT_RESPONSE_FORMAT,
  BUILT_IN_AGENT_INSTRUCTIONS,
  BUILT_IN_PERSONAS,
  DEFAULT_PROMPT_SETTINGS,
} from './types/prompt';

/**
 * Compliance Settings
 * Controls runtime enforcement of system prompt rules
 */
export interface ComplianceSettings {
  /** Enable compliance checking */
  enabled: boolean;
  /** Enforce read-before-write rule */
  enforceReadBeforeWrite: boolean;
  /** Enforce lint check after edit */
  enforceLintAfterEdit: boolean;
  /** Block unnecessary file creation */
  blockUnnecessaryFiles: boolean;
  /** Maximum violations before blocking */
  maxViolationsBeforeBlock: number;
  /** Inject corrective messages into conversation */
  injectCorrectiveMessages: boolean;
  /** Strict mode - block on any violation */
  strictMode: boolean;
  /** Log violations for debugging */
  logViolations: boolean;
}

/**
 * Default compliance settings
 */
export const DEFAULT_COMPLIANCE_SETTINGS: ComplianceSettings = {
  enabled: true,
  enforceReadBeforeWrite: true,
  enforceLintAfterEdit: false, // Disabled by default - can be noisy
  blockUnnecessaryFiles: false,
  maxViolationsBeforeBlock: 3,
  injectCorrectiveMessages: true,
  strictMode: false,
  logViolations: true,
};

// =============================================================================
// Browser Security Settings
// =============================================================================

/**
 * Browser security configuration settings
 * Controls security features for the embedded browser
 */
export interface BrowserSettings {
  /** Enable URL filtering (blocks phishing, malware sites) */
  urlFilteringEnabled: boolean;
  /** Enable popup blocking */
  popupBlockingEnabled: boolean;
  /** Enable ad blocking */
  adBlockingEnabled: boolean;
  /** Block known trackers */
  trackerBlockingEnabled: boolean;
  /** Enable download protection (blocks dangerous file types) */
  downloadProtectionEnabled: boolean;
  /** URLs/domains that bypass security checks */
  allowList: string[];
  /** Additional URLs/domains to block */
  customBlockList: string[];
  /** Navigation timeout in milliseconds */
  navigationTimeout: number;
  /** Maximum content extraction length */
  maxContentLength: number;
  /** Custom user agent string (empty = default) */
  customUserAgent: string;
  /** Enable JavaScript execution */
  enableJavaScript: boolean;
  /** Enable cookies */
  enableCookies: boolean;
  /** Clear browsing data on exit */
  clearDataOnExit: boolean;
  /** Block mixed content (HTTP resources on HTTPS pages) */
  blockMixedContent: boolean;
  /** Trusted domains for localhost development */
  trustedLocalhostPorts: number[];
}

/**
 * Default browser settings
 */
export const DEFAULT_BROWSER_SETTINGS: BrowserSettings = {
  urlFilteringEnabled: true,
  popupBlockingEnabled: true,
  adBlockingEnabled: true,
  trackerBlockingEnabled: true,
  downloadProtectionEnabled: true,
  allowList: [
    // Localhost
    'localhost',
    '127.0.0.1',
    // Developer documentation sites
    'github.com',
    'developer.mozilla.org',
    'react.dev',
    'nodejs.org',
    'typescriptlang.org',
    'npmjs.com',
    'stackoverflow.com',
    // Developer blogs and content sites (often false-positived by ad filters)
    'dev.to',
    'medium.com',
    'hashnode.dev',
    'freecodecamp.org',
    'css-tricks.com',
    'smashingmagazine.com',
    'web.dev',
    'hackernoon.com',
    'dzone.com',
    'infoq.com',
    'sitepoint.com',
    'scotch.io',
    'tutorialzine.com',
    'codrops.com',
    // Tech news and resources
    'techcrunch.com',
    'theverge.com',
    'arstechnica.com',
    'wired.com',
    'hacker-news.firebaseio.com',
    'news.ycombinator.com',
    // Package registries and docs
    'pypi.org',
    'crates.io',
    'rubygems.org',
    'packagist.org',
    'nuget.org',
    'docs.rs',
    'pkg.go.dev',
    // Cloud provider docs
    'docs.aws.amazon.com',
    'cloud.google.com',
    'docs.microsoft.com',
    'learn.microsoft.com',
    'azure.microsoft.com',
  ],
  customBlockList: [],
  navigationTimeout: 30000,
  maxContentLength: 100000,
  customUserAgent: '',
  enableJavaScript: true,
  enableCookies: true,
  clearDataOnExit: false,
  blockMixedContent: true,
  trustedLocalhostPorts: [3000, 3001, 4000, 5000, 5173, 8000, 8080, 8888],
};

// =============================================================================
// Appearance Settings (extracted to ./types/appearance.ts)
// =============================================================================
export {
  type AccentColorPreset,
  type FontSizeScale,
  type TerminalFont,
  type LoadingIndicatorStyle,
  type AnimationSpeed,
  type ReduceMotionPreference,
  ANIMATION_SPEED_MULTIPLIERS,
  type AppearanceSettings,
  DEFAULT_APPEARANCE_SETTINGS,
  FONT_SIZE_SCALES,
  ACCENT_COLOR_PRESETS,
} from './types/appearance';

// =============================================================================
// Workspace & Indexing Settings
// =============================================================================

/**
 * Workspace indexing settings
 * Controls how workspace files are indexed and searched
 */
export interface WorkspaceIndexingSettings {
  /** Automatically index workspace files when a workspace is opened or activated */
  autoIndexOnOpen: boolean;

  /** Enable real-time file watching for automatic re-indexing on file changes */
  enableFileWatcher: boolean;

  /** File watcher debounce in milliseconds (100-5000, default: 300) */
  watcherDebounceMs: number;

  /** Maximum file size in bytes to index (files larger than this are skipped) */
  maxFileSizeBytes: number;

  /** Maximum total index size in MB before pruning old entries */
  maxIndexSizeMb: number;

  /** Batch size for indexing operations (10-500, default: 50) */
  indexBatchSize: number;

  /** Additional glob patterns of files/directories to exclude from indexing */
  excludePatterns: string[];

  /** Glob patterns of files to include (empty = all files) */
  includePatterns: string[];
}

/**
 * Default workspace indexing settings
 */
export const DEFAULT_WORKSPACE_INDEXING_SETTINGS: WorkspaceIndexingSettings = {
  autoIndexOnOpen: true,
  enableFileWatcher: true,
  watcherDebounceMs: 300,
  maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
  maxIndexSizeMb: 512,
  indexBatchSize: 50,
  excludePatterns: [
    'node_modules/**',
    '.git/**',
    'dist/**',
    'build/**',
    'target/**',
    '.next/**',
    '.nuxt/**',
    'coverage/**',
    '*.min.js',
    '*.min.css',
    '*.map',
    '*.lock',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
  ],
  includePatterns: [],
};

// =============================================================================
// Access Level Types (extracted to ./types/accessLevel.ts)
// =============================================================================
export {
  type AccessLevel,
  type ToolCategory,
  type CategoryPermission,
  type AccessLevelSettings,
  ACCESS_LEVEL_DEFAULTS,
  DEFAULT_ACCESS_LEVEL_SETTINGS,
  ACCESS_LEVEL_DESCRIPTIONS,
} from './types/accessLevel';

// =============================================================================
// Task-Based Model Routing Types (extracted to ./types/taskRouting.ts)
// =============================================================================
export {
  type RoutingTaskType,
  ROUTING_TASK_INFO,
  type TaskModelMapping,
  type CustomTaskType,
  type TaskRoutingSettings,
  DEFAULT_TASK_ROUTING_SETTINGS,
  type TaskDetectionResult,
  type RoutingDecision,
} from './types/taskRouting';

/**
 * Claude Code subscription tier
 */
export type ClaudeSubscriptionTier = 'free' | 'pro' | 'max' | 'team' | 'enterprise';

/**
 * Claude Code subscription authentication data
 * Stores OAuth tokens and subscription information for Claude Code integration
 */
export interface ClaudeSubscription {
  /** OAuth access token for API calls */
  accessToken: string;
  /** OAuth refresh token for token renewal */
  refreshToken: string;
  /** Token expiration timestamp (Unix ms) */
  expiresAt: number;
  /** User's subscription tier */
  tier: ClaudeSubscriptionTier;
  /** Organization ID for team/enterprise plans */
  organizationId?: string;
  /** User's email address */
  email?: string;
  /** When the subscription was connected */
  connectedAt: number;
}

/**
 * GLM Coding Plan subscription tier
 * - lite: $3/month - Basic usage
 * - pro: $15/month - High-frequency, complex projects
 * @see https://docs.z.ai/devpack/overview
 */
export type GLMSubscriptionTier = 'lite' | 'pro';

/**
 * GLM Coding Plan subscription data
 * API key-based subscription for Z.AI GLM models
 */
export interface GLMSubscription {
  /** API key for the coding plan */
  apiKey: string;
  /** Subscription tier */
  tier: GLMSubscriptionTier;
  /** Whether to use the coding endpoint */
  useCodingEndpoint: boolean;
  /** When the subscription was connected */
  connectedAt: number;
}

export interface AgentSettings {
  apiKeys: Partial<Record<LLMProviderName, string>>;
  rateLimits: Partial<Record<LLMProviderName, number>>;
  /** Per-provider configuration (new) */
  providerSettings: Partial<Record<LLMProviderName, ProviderSettings>>;
  defaultConfig: AgentConfig;
  /** Safety and guardrails configuration */
  safetySettings?: SafetySettings;
  /** Cache and performance configuration */
  cacheSettings?: CacheSettings;
  /** Debugging and tracing configuration */
  debugSettings?: DebugSettings;
  /** Prompt customization settings */
  promptSettings?: PromptSettings;
  /** Compliance enforcement settings */
  complianceSettings?: ComplianceSettings;
  /** Access level configuration */
  accessLevelSettings?: AccessLevelSettings;
  /** Browser security settings */
  browserSettings?: BrowserSettings;
  /** Appearance and UI customization settings */
  appearanceSettings?: AppearanceSettings;
  /** Task-based model routing configuration */
  taskRoutingSettings?: TaskRoutingSettings;
  /** Autonomous feature flags */
  autonomousFeatureFlags?: AutonomousFeatureFlags;
  /** Claude Code subscription authentication (OAuth-based) */
  claudeSubscription?: ClaudeSubscription;
  /** GLM Coding Plan subscription (API key-based) */
  glmSubscription?: GLMSubscription;
  /** MCP (Model Context Protocol) settings */
  mcpSettings?: import('./types/mcp').MCPSettings;
  /** Configured MCP servers */
  mcpServers?: import('./types/mcp').MCPServerConfig[];
  /** Workspace indexing settings */
  workspaceSettings?: WorkspaceIndexingSettings;
}

// =============================================================================
// Task Intent Types
// =============================================================================

/**
 * Task intent type
 */
export type TaskIntentType = 'create' | 'modify' | 'fix' | 'explain' | 'understand' | 'research' | 'automate' | 'review' | 'test' | 'refactor' | 'document' | 'unknown';

/**
 * Autonomous Feature Flags
 * Configuration for autonomous agent capabilities
 */
export interface AutonomousFeatureFlags {
  /** Enable autonomous mode */
  enableAutonomousMode: boolean;
  /** Enable task planning */
  enableTaskPlanning: boolean;
  /** Enable dynamic tools */
  enableDynamicTools: boolean;
  /** Enable safety framework */
  enableSafetyFramework: boolean;
  /** Enable performance monitoring */
  enablePerformanceMonitoring: boolean;
  /** Enable advanced debugging */
  enableAdvancedDebugging: boolean;
  /** Tool settings for dynamic tools and parallel execution */
  toolSettings?: Partial<ToolConfigSettings>;
}

/**
 * Default autonomous feature flags
 */
export const DEFAULT_AUTONOMOUS_FEATURE_FLAGS: AutonomousFeatureFlags = {
  enableAutonomousMode: false,
  enableTaskPlanning: false,
  enableDynamicTools: false,
  enableSafetyFramework: true,
  enablePerformanceMonitoring: false,
  enableAdvancedDebugging: false,
  toolSettings: undefined, // Will be merged with DEFAULT_TOOL_CONFIG_SETTINGS at runtime
};

export interface AgentSettingsEvent {
  type: 'settings-update';
  settings: AgentSettings;
}

// Git events re-exported from ./types/git.ts (see Git Service Types section below)

// =============================================================================
// Completion Types (extracted to ./types/lsp.ts)
// =============================================================================
export {
  type CompletionContext,
  type CompletionItem,
  type CompletionRange,
  type CompletionKind,
  type CompletionResult,
  type InlineCompletionContext,
  type InlineCompletionResult,
  type CompletionServiceConfig,
} from './types/lsp';

// =============================================================================
// Dynamic Tools, Security, Discovery, Templates, Sandbox Types
// → Extracted to ./types/tools.ts
// =============================================================================
export {
  type ToolConfigSettings,
  type CustomToolConfig,
  type CustomToolStep,
  DEFAULT_TOOL_CONFIG_SETTINGS,
  type ToolExecutionType,
  type ToolRiskLevel,
  type DynamicToolStatus,
  type ToolSpecification,
  type ToolCompositionStep,
  type ToolTemplate,
  type ToolParameterBinding,
  type DynamicToolState,
  type SecurityEventType,
  type SecurityEvent,
  type SecurityViolation,
  type RateLimitConfig,
  type RateLimitState,
  type SecurityLevel,
  type DynamicToolSecuritySettings,
  type ToolCapability,
  type CapabilityGrant,
  type ToolUsageStats,
  type ToolRankingFactors,
  type ToolRankingConfig,
  type ToolSuggestion,
  type ToolSearchContext,
  type RankedToolResult,
  type ToolTemplateCategory,
  type TemplateExecutionContext,
  type TemplateExecutionResult,
  type SandboxMode,
  type SandboxConfig,
  type SandboxExecutionResult,
} from './types/tools';

// -----------------------------------------------------------------------------
// Agent Specialization Types
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Task Analysis Types
// -----------------------------------------------------------------------------

// TaskIntentType is defined in Task Intent Types section above

/**
 * Task scope level
 */
export type TaskScopeLevel =
  | 'file'
  | 'single-file'
  | 'multi-file'
  | 'package'
  | 'feature'
  | 'project'
  | 'workspace'
  | 'unknown';

/**
 * Task complexity level
 */
export type TaskComplexityLevel =
  | 'trivial'
  | 'simple'
  | 'moderate'
  | 'complex'
  | 'high'
  | 'unknown';

/**
 * SubTask execution status
 */
export type SubTaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped';

/**
 * Task plan execution status
 */
export type TaskPlanStatus = 'planning' | 'executing' | 'paused' | 'completed' | 'failed';

/**
 * User's intent classification
 */
export interface TaskIntent {
  /** Intent type */
  type: TaskIntentType;
  /** Specific description */
  description: string;
  /** Urgency level (1-5) */
  urgency: number;
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Task scope definition
 */
export interface TaskScope {
  /** Scope level */
  level: TaskScopeLevel;
  /** Specific files involved */
  files: string[];
  /** File patterns (glob) */
  patterns: string[];
  /** Directories involved */
  directories: string[];
}

/**
 * Task complexity assessment
 */
export interface TaskComplexity {
  /** Complexity level */
  level: TaskComplexityLevel;
  /** Factors contributing to complexity */
  factors: string[];
  /** Numeric complexity score (0-100) */
  score: number;
  /** Estimated human time (minutes) */
  estimatedHumanTime: number;
}

// =============================================================================
// Browser State Event Types
// =============================================================================



// =============================================================================
// Browser State Event Types
// =============================================================================

/**
 * Browser state for real-time updates
 */
export interface BrowserState {
  id: string;
  url: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error?: string;
}

/**
 * Event emitted when browser state changes (navigation, loading, etc.)
 */
export interface BrowserStateEvent {
  type: 'browser-state';
  state: BrowserState;
}

/**
 * Claude subscription status change event
 */
export interface ClaudeSubscriptionEvent {
  type: 'claude-subscription';
  eventType: 'auto-imported' | 'credentials-changed' | 'token-refreshed' | 'token-refresh-failed' | 'token-expiring-soon' | 'disconnected';
  message: string;
  tier?: ClaudeSubscriptionTier;
  subscription?: ClaudeSubscription;
}

/**
 * GLM subscription status change event
 */
export interface GLMSubscriptionEvent {
  type: 'glm-subscription';
  eventType: 'connected' | 'disconnected' | 'tier-changed';
  message: string;
  tier?: GLMSubscriptionTier;
  subscription?: GLMSubscription;
}

// Import and re-export TodoUpdateEvent from todo types to avoid duplication
import type { TodoUpdateEvent as TodoUpdateEventType } from './types/todo';
export type TodoUpdateEvent = TodoUpdateEventType;

/**
 * Session health update event - emitted when session health status changes
 */
export interface SessionHealthUpdateEvent {
  type: 'session-health-update';
  sessionId: string;
  data: unknown;
}

/**
 * Throttle state changed event - emitted when background throttling state changes
 */
export interface ThrottleStateChangedEvent {
  type: 'throttle-state-changed';
  state: {
    isThrottled: boolean;
    agentRunning: boolean;
    windowVisible: boolean;
    windowFocused: boolean;
    effectiveInterval: number;
  };
}

/**
 * MCP (Model Context Protocol) server status change event
 */
export interface MCPServerStatusEvent {
  type: 'mcp:server-status-changed';
  serverId: string;
  status: string;
  error?: string;
}

/**
 * MCP server tools changed event
 */
export interface MCPServerToolsEvent {
  type: 'mcp:server-tools-changed';
  serverId: string;
  tools: unknown[];
}

/**
 * MCP global tools updated event
 */
export interface MCPToolsUpdatedEvent {
  type: 'mcp:tools-updated';
  tools: unknown[];
}

/**
 * Generic MCP event (forwarded from MCP server callbacks)
 */
export interface MCPGenericEvent {
  type: 'mcp:event';
  [key: string]: unknown;
}

export type MCPRendererEvent = MCPServerStatusEvent | MCPServerToolsEvent | MCPToolsUpdatedEvent | MCPGenericEvent;

export type RendererEvent = AgentEvent | SessionsEvent | SessionPatchEvent | AgentSettingsEvent | GitEvent | BrowserStateEvent | FileChangedEvent | ClaudeSubscriptionEvent | GLMSubscriptionEvent | TodoUpdateEvent | SessionHealthUpdateEvent | ThrottleStateChangedEvent | MCPRendererEvent;


export interface StartSessionPayload {
  initialConfig?: Partial<AgentConfig>;
  /** Workspace path to associate with this session */
  workspacePath?: string | null;
}

/**
 * Payload sent with messages to provide AI with context.
 */
export interface SendMessagePayload {
  sessionId: string;
  content: string;
  attachments?: AttachmentPayload[];
  metadata?: Record<string, unknown>;
}

export interface ConfirmToolPayload {
  sessionId: string;
  runId: string;
  approved: boolean;
  /** Optional feedback when user wants to suggest an alternative action */
  feedback?: string;
  /** Action type for enhanced confirmation */
  action?: 'approve' | 'deny' | 'feedback';
}

/**
 * Payload for sending a follow-up message while the agent is running.
 * Follow-ups are injected into the agent's context in real-time,
 * allowing the user to provide additional instructions, corrections,
 * or context without stopping the current run.
 */
export interface FollowUpPayload {
  /** Session ID for the active run */
  sessionId: string;
  /** Follow-up message content */
  content: string;
  /** Optional file attachments */
  attachments?: AttachmentPayload[];
  /** Optional metadata for the follow-up */
  metadata?: Record<string, unknown>;
}

export interface UpdateConfigPayload {
  sessionId: string;
  config: Partial<AgentConfig>;
}

// ============================================
// Task-Oriented Architecture Types
// ============================================

export type TaskStepStatus = 'pending' | 'in-progress' | 'completed' | 'failed';

export interface TaskStep {
  id: string;
  title: string;
  description?: string;
  status: TaskStepStatus;
  startedAt?: number;
  completedAt?: number;
  toolCalls?: string[]; // IDs of associated tool calls
}

export interface ProgressGroup {
  id: string;
  title: string;
  items: ProgressItem[];
  isExpanded: boolean;
  startedAt: number;
  completedAt?: number;
}

export interface ProgressItem {
  id: string;
  type: 'tool-call' | 'file-read' | 'file-write' | 'command' | 'search' | 'analysis' | 'iteration';
  label: string;
  detail?: string;
  status: 'pending' | 'running' | 'success' | 'error';
  timestamp: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export interface ArtifactCard {
  id: string;
  type: 'file' | 'code' | 'document' | 'link';
  title: string;
  description?: string;
  path?: string;
  language?: string;
  preview?: string;
  createdAt: number;
  action?: 'created' | 'modified' | 'deleted';
}

// Extended message content for task-oriented display
export interface TaskMessageContent {
  progress?: ProgressGroup[];
  artifacts?: ArtifactCard[];
  finalAnswer?: string;
}

export interface ProgressEvent extends AgentEventBase {
  type: 'progress';
  groupId: string;
  groupTitle: string;
  item: ProgressItem;
}

export interface ArtifactEvent extends AgentEventBase {
  type: 'artifact';
  artifact: ArtifactCard;
}

export interface TaskStepEvent extends AgentEventBase {
  type: 'task-step';
  step: TaskStep;
}

export interface AgentStatusEvent {
  type: 'agent-status';
  sessionId: string;
  status: 'planning' | 'analyzing' | 'reasoning' | 'executing' | 'recovering' | 'error' | 'completed' | 'paused';
  message: string;
  timestamp: number;
  metadata?: {
    planId?: string;
    stepCount?: number;
    complexity?: string;
    confidence?: number;
    // Context management fields
    contextUtilization?: number;
    messageCount?: number;
    prunedMessages?: number;
    tokensFreed?: number;
    // Iteration tracking fields for progress display
    currentIteration?: number;
    maxIterations?: number;
    runStartedAt?: number;
    avgIterationTimeMs?: number;
    paused?: boolean;
    // Provider/model info for current iteration
    provider?: string;
    modelId?: string;
  };
}

// =============================================================================
// Context Metrics Event (Real-Time Context Window)
// =============================================================================

export interface ContextMetricsSnapshot {
  totalTokens: number;
  maxInputTokens: number;
  utilization: number; // 0-1
  messageCount: number;
  availableTokens: number;
  isWarning: boolean;
  needsPruning: boolean;
  /** Token breakdown by message role */
  tokensByRole?: {
    system: number;
    user: number;
    assistant: number;
    tool: number;
  };
}

export interface ContextMetricsEvent {
  type: 'context-metrics';
  sessionId: string;
  runId?: string;
  provider: LLMProviderName;
  modelId?: string;
  timestamp: number;
  metrics: ContextMetricsSnapshot;
}

// =============================================================================
// Debug Event Types
// =============================================================================

/** Debug trace step for LLM calls */
export interface DebugLLMCallEvent {
  type: 'debug:llm-call';
  traceId: string;
  sessionId: string;
  runId: string;
  timestamp: number;
  stepNumber: number;
  provider: LLMProviderName;
  model: string;
  promptTokens: number;
  outputTokens: number;
  durationMs: number;
  messageCount: number;
  toolCount: number;
  finishReason?: string;
  hasToolCalls: boolean;
  contentPreview: string;
}

/** Debug trace step for tool calls */
export interface DebugToolCallEvent {
  type: 'debug:tool-call';
  traceId: string;
  sessionId: string;
  runId: string;
  timestamp: number;
  stepNumber: number;
  toolName: string;
  callId: string;
  argumentsPreview: string;
  requiresApproval: boolean;
}

/** Debug trace step for tool results */
export interface DebugToolResultEvent {
  type: 'debug:tool-result';
  traceId: string;
  sessionId: string;
  runId: string;
  timestamp: number;
  stepNumber: number;
  toolName: string;
  callId: string;
  success: boolean;
  durationMs: number;
  outputPreview: string;
  outputSize: number;
  errorMessage?: string;
}

/** Debug error event */
export interface DebugErrorEvent {
  type: 'debug:error';
  traceId: string;
  sessionId: string;
  runId: string;
  timestamp: number;
  stepNumber: number;
  message: string;
  code?: string;
  stack?: string;
  recovered: boolean;
}

/** Debug trace started event */
export interface DebugTraceStartEvent {
  type: 'debug:trace-start';
  traceId: string;
  sessionId: string;
  runId: string;
  timestamp: number;
}

/** Debug trace completed event */
export interface DebugTraceCompleteEvent {
  type: 'debug:trace-complete';
  traceId: string;
  sessionId: string;
  runId: string;
  timestamp: number;
  status: 'completed' | 'failed';
  durationMs: number;
  metrics: {
    totalSteps: number;
    llmCalls: number;
    toolCalls: number;
    successfulToolCalls: number;
    failedToolCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    avgLLMDurationMs: number;
    avgToolDurationMs: number;
    toolUsage: Record<string, number>;
  };
}

/** Debug log event for general logging */
export interface DebugLogEvent {
  type: 'debug:log';
  sessionId?: string;
  runId?: string;
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: 'main' | 'renderer' | 'agent' | 'tool' | 'provider';
  message: string;
  data?: Record<string, unknown>;
}

export type DebugEvent =
  | DebugLLMCallEvent
  | DebugToolCallEvent
  | DebugToolResultEvent
  | DebugErrorEvent
  | DebugTraceStartEvent
  | DebugTraceCompleteEvent
  | DebugLogEvent;

/**
 * Event emitted when the task router makes a routing decision
 */
export interface RoutingDecisionEvent extends AgentEventBase {
  type: 'routing-decision';
  /** The routing decision details */
  decision: RoutingDecision;
}

// =============================================================================
// Recovery & Monitoring Events (Phase 5)
// =============================================================================

/**
 * Event emitted when recovery is needed and user input is required
 */
export interface RecoveryEscalationEvent {
  type: 'recovery-escalation';
  sessionId: string;
  runId?: string;
  timestamp: number;
  request: {
    id: string;
    question: string;
    context: string;
    options: Array<{
      id: string;
      label: string;
      description: string;
      type: string;
      isRecommended: boolean;
    }>;
    timeoutMs: number;
  };
  error: {
    message: string;
    category: string;
    severity: string;
  };
}

/**
 * Event emitted for user notifications during recovery
 */
export interface UserNotificationEvent {
  type: 'user-notification';
  sessionId?: string;
  timestamp: number;
  notification: {
    id: string;
    level: 'info' | 'warning' | 'error' | 'critical';
    title: string;
    message: string;
    details?: string;
    actions?: Array<{
      id: string;
      label: string;
      type: string;
    }>;
    persistent: boolean;
  };
}

/**
 * Event emitted when self-healing triggers an action
 */
export interface SelfHealingActionEvent {
  type: 'self-healing-action';
  sessionId?: string;
  timestamp: number;
  action: string;
  details: Record<string, unknown>;
  success?: boolean;
}

/**
 * Event emitted for health status updates
 */
export interface HealthStatusEvent {
  type: 'health-status';
  sessionId?: string;
  timestamp: number;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'critical';
  indicators: Array<{
    name: string;
    value: number;
    status: 'healthy' | 'warning' | 'critical';
  }>;
  metrics?: {
    errorRate: number;
    latencyP95: number;
    activeAgents: number;
  };
}

/**
 * Event emitted when a file diff is streaming in real-time during tool execution.
 * Enables the renderer to display line-by-line diffs as they are computed.
 */
export interface FileDiffStreamEvent extends AgentEventBase {
  type: 'file-diff-stream';
  /** The tool call ID this diff belongs to */
  toolCallId: string;
  /** Tool name that produced the change (write_file, edit_file, etc.) */
  toolName: string;
  /** Absolute file path being modified */
  filePath: string;
  /** Original file content (empty for new files) */
  originalContent: string;
  /** Current partial or full modified content */
  modifiedContent: string;
  /** Whether this is a new file creation */
  isNewFile: boolean;
  /** Whether the stream is complete (final event) */
  isComplete: boolean;
  /** Action: 'created' | 'modified' */
  action: 'created' | 'modified';
}

/**
 * Event emitted for detailed progress tracking
 */
export interface DetailedProgressEvent {
  type: 'detailed-progress';
  sessionId: string;
  runId?: string;
  timestamp: number;
  progress: {
    runId: string;
    status: 'active' | 'paused' | 'completed' | 'failed';
    percentage: number;
    startedAt: number;
    eta?: number;
    tasks: Array<{
      id: string;
      name: string;
      status: string;
      percentage: number;
    }>;
  };
}

// Update AgentEvent union
export type AgentEvent =
  | StreamDeltaEvent
  | RunStatusEvent
  | ToolCallEvent
  | ToolResultEvent
  | ToolQueuedEvent
  | ToolStartedEvent
  | MediaOutputEvent
  | SessionStateEvent
  | ProgressEvent
  | ArtifactEvent
  | TaskStepEvent
  | AgentStatusEvent
  | ContextMetricsEvent
  | TerminalOutputEvent
  | TerminalExitEvent
  | TerminalErrorEvent
  | ComplianceViolationEvent
  | RoutingDecisionEvent
  | DebugEvent
  // Phase 5 recovery & monitoring events
  | RecoveryEscalationEvent
  | UserNotificationEvent
  | SelfHealingActionEvent
  | HealthStatusEvent
  | DetailedProgressEvent
  | FileDiffStreamEvent
  // Phase 4 communication events
  | { type: 'question-asked'; sessionId: string; question: CommunicationQuestion; timestamp: number }
  | { type: 'question-answered'; sessionId: string; questionId: string; answer: unknown; timestamp: number }
  | { type: 'question-skipped'; sessionId: string; questionId: string; timestamp: number }
  | { type: 'decision-requested'; sessionId: string; decision: DecisionRequest; timestamp: number }
  | { type: 'decision-made'; sessionId: string; decisionId: string; selectedOption: string; timestamp: number }
  | { type: 'decision-skipped'; sessionId: string; decisionId: string; timestamp: number }
  | { type: 'progress-update'; sessionId: string; update: ProgressUpdate; timestamp: number }
  // Real-time follow-up injection events
  | { type: 'follow-up-received'; sessionId: string; messageId: string; content: string; timestamp: number }
  | { type: 'follow-up-injected'; sessionId: string; messageId: string; runId: string; iteration: number; timestamp: number };

// =============================================================================
// Progress Update Types
// =============================================================================

/**
 * Progress update for task execution
 */
export interface ProgressUpdate {
  /** Progress level */
  level: ProgressLevel;
  /** Progress percentage (0-100) */
  percentage: number;
  /** Current status message */
  message: string;
  /** Detailed status */
  details?: string;
  /** Associated task/subtask ID */
  taskId?: string;
  /** Agent ID if applicable */
  agentId?: string;
  /** Timestamp */
  timestamp: number;
}

// =============================================================================
// File Tree, Symbol, Diagnostics & File Operations Types (extracted to ./types/lsp.ts)
// =============================================================================
export {
  type FileTreeNode,
  type SymbolKind,
  type SymbolInfo,
  type SymbolLocation,
  type HoverInfo,
  type DiagnosticSeverity,
  type DiagnosticInfo,
  type DiagnosticsSummary,
  type FileChangeType,
  type FileChangeEvent,
  type WatchOptions,
  type WatcherStatus,
  type BulkOperationType,
  type BulkOperation,
  type BulkOperationResult,
} from './types/lsp';

// =============================================================================
// Git Service Types (extracted to ./types/git.ts)
// =============================================================================
export {
  type GitFileStatus,
  type GitFileChange,
  type GitBranch,
  type GitCommit,
  type GitStash,
  type GitRemote,
  type GitRepoStatus,
  type GitBlameEntry,
  type GitStatusChangedEvent,
  type GitBranchChangedEvent,
  type GitOperationCompleteEvent,
  type GitErrorEvent,
  type GitEvent,
} from './types/git';



// =============================================================================
// Project Analysis Types
// =============================================================================

/** Project technology stack info */
export interface ProjectTechStack {
  languages: Array<{ name: string; percentage: number; fileCount: number }>;
  frameworks: string[];
  buildTools: string[];
  testFrameworks: string[];
  linters: string[];
  packageManager?: string;
}

/** Project structure analysis */
export interface ProjectStructure {
  totalFiles: number;
  totalDirectories: number;
  totalLines: number;
  largestFiles: Array<{ path: string; lines: number; size: number }>;
  entryPoints: string[];
  configFiles: string[];
}

/** Project dependency info */
export interface ProjectDependencies {
  production: Array<{ name: string; version: string }>;
  development: Array<{ name: string; version: string }>;
  outdated: Array<{ name: string; current: string; latest: string }>;
}

/** Complete project analysis */
export interface ProjectAnalysis {
  name: string;
  rootPath: string;
  techStack: ProjectTechStack;
  structure: ProjectStructure;
  dependencies: ProjectDependencies;
  gitInfo?: {
    remotes: GitRemote[];
    currentBranch: string;
    lastCommit?: GitCommit;
  };
  analyzedAt: string;
}











// =============================================================================
// Phase 4: Task Analysis & Resource Types (extracted to ./types/taskPlanning.ts)
// =============================================================================
export {
  type TaskRequirements,
  type TaskDependency,
  type SubTask,
  type DecompositionPattern,
  type TaskPlan,
  type ResourceType,
  type AllocationStrategy,
  type ResourceAllocation,
  type ResourceBudget,
  type ResourceBudgetItem,
  type ResourceUsage,
  type ResourceUsageMetrics,
  type ResourceRequest,
  type AllocationResult,
  type ResourcePoolStatus,
} from './types/taskPlanning';

// =============================================================================
// Phase 4: User Communication Types (extracted to ./types/communication.ts)
// =============================================================================
export {
  type QuestionType,
  type QuestionOption,
  type CommunicationQuestion,
  type QuestionResponse,
  type ProgressLevel,
  type DecisionOption,
  type DecisionRequest,
  type DecisionResponse,
  type FeedbackType,
  type UserFeedback,
} from './types/communication';

// =============================================================================
// Metrics & Observability Types (extracted to ./types/metrics.ts)
// =============================================================================
export {
  type MetricsWidgetData,
  type MetricsDashboardLayout,
  type ToolMetricsSummary,
  type AgentMetricsSummary,
  type CostRecord,
  type CostBudget,
  type CostThresholdEvent,
  type ProviderHealth,
  type FailoverConfig,
  type CostMetricsSummary,
  type QualityMetricsSummary,
  type SystemMetricsSummary,
  type MetricsAlert,
  type SafetyStatus,
  type SafetyResourceLimits,
  type SafetyResourceUsage,
  type SafetyViolation,
  type SafetyState,
  type PerformanceBottleneck,
  type PerformanceReport,
  type MetricsUpdateEvent,
  type SafetyViolationEvent,
  type EmergencyStopEvent,
} from './types/metrics';
