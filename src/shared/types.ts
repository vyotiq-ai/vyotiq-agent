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

  // EditorAI constraints
  inlineCompletionDebounceMs: { min: 50, max: 2000, default: 300 },
  inlineCompletionMaxTokens: { min: 16, max: 1024, default: 128 },
  contextLinesBefore: { min: 5, max: 200, default: 50 },
  contextLinesAfter: { min: 5, max: 100, default: 10 },

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
  workspaceId?: string;
  config: AgentConfig;
  status: AgentRunStatus;
  activeRunId?: string;
  messages: ChatMessage[];
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
  workspaceId?: string;
  status: AgentRunStatus;
  messageCount: number;
  lastMessagePreview?: string;
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

export interface RunStatusEvent extends AgentEventBase {
  type: 'run-status';
  status: AgentRunStatus;
  message?: string;
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

export interface WorkspaceEntry {
  id: string;
  path: string;
  label: string;
  lastOpenedAt: number;
  isActive: boolean;
}

// =============================================================================
// Multi-Workspace Types
// =============================================================================

/**
 * Represents an open workspace tab in the multi-workspace view.
 * Each tab corresponds to a workspace that the user has explicitly opened.
 */
export interface WorkspaceTab {
  /** Unique workspace ID (matches WorkspaceEntry.id) */
  workspaceId: string;
  /** Order index for tab positioning (lower = more left) */
  order: number;
  /** Whether this tab is currently focused/active in the view */
  isFocused: boolean;
  /** Timestamp when this tab was opened */
  openedAt: number;
  /** Timestamp when this tab was last focused */
  lastFocusedAt: number;
  /** Whether this tab has unsaved changes or pending operations */
  hasUnsavedChanges?: boolean;
  /** Whether an agent run is active in this workspace */
  isRunning?: boolean;
  /** Optional custom label override (defaults to workspace label) */
  customLabel?: string;
}

/**
 * State for managing multiple open workspace tabs.
 * Supports concurrent workspace sessions with tab-based navigation.
 */
export interface MultiWorkspaceState {
  /** Array of currently open workspace tabs */
  tabs: WorkspaceTab[];
  /** ID of the currently focused workspace tab (null if no tabs open) */
  focusedTabId: string | null;
  /** Maximum number of tabs allowed to be open simultaneously */
  maxTabs: number;
  /** Whether to persist tab state across app restarts */
  persistTabs: boolean;
  /** Tab order strategy: 'chronological' | 'manual' */
  orderStrategy: 'chronological' | 'manual';
}

/**
 * Event emitted when workspace tabs change
 */
export interface WorkspaceTabsEvent {
  type: 'workspace-tabs-update';
  tabs: WorkspaceTab[];
  focusedTabId: string | null;
}

/**
 * Workspace resource metrics for monitoring concurrent workspace performance
 */
export interface WorkspaceResourceMetrics {
  workspaceId: string;
  /** Number of active sessions in this workspace */
  activeSessions: number;
  /** Number of active tool executions in this workspace */
  activeToolExecutions: number;
  /** Estimated memory usage in bytes for this workspace */
  memoryEstimateBytes: number;
  /** Last activity timestamp */
  lastActivityAt: number;
  /** Provider request counts in the current rate limit window */
  requestCounts: Record<string, number>;
}

export interface WorkspaceEvent {
  type: 'workspace-update';
  workspaces: WorkspaceEntry[];
}

/**
 * Event emitted when files are created, modified, deleted, or renamed
 * Used for real-time file tree updates in the UI
 */
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
// =============================================================================

/**
 * Predefined persona/role for the AI agent
 */
export interface AgentPersona {
  /** Unique identifier for the persona */
  id: string;
  /** Display name */
  name: string;
  /** Short description of the persona's behavior */
  description: string;
  /** System prompt content for this persona */
  systemPrompt: string;
  /** Icon identifier (lucide icon name) */
  icon?: string;
  /** Whether this is a built-in persona */
  isBuiltIn?: boolean;
}

/**
 * Context injection rule - defines when and how to inject context
 */
export interface ContextInjectionRule {
  /** Unique identifier */
  id: string;
  /** Display name for the rule */
  name: string;
  /** Whether this rule is enabled */
  enabled: boolean;
  /** Priority order (lower = higher priority) */
  priority: number;
  /** Condition for when to apply this rule */
  condition: ContextInjectionCondition;
  /** The context template to inject (supports placeholders) */
  template: string;
  /** 
   * Where to inject context. Note: all positions are treated as 'append' 
   * to protect the core system prompt. Kept for backward compatibility.
   * @deprecated Use 'append' - all values are treated as append now
   */
  position: 'prepend' | 'append' | 'replace';
}

/**
 * Condition for context injection
 */
export interface ContextInjectionCondition {
  /** Type of condition */
  type: 'always' | 'workspace-pattern' | 'keyword' | 'custom' | 'file-type';
  /** Value for the condition (e.g., file extension, glob pattern, keyword) */
  value?: string;
  /** Custom condition function (serialized as string) */
  customFn?: string;
}

/**
 * Response format preferences
 */
export interface ResponseFormatPreferences {
  /** Preferred code block style */
  codeBlockStyle: 'fenced' | 'indented';
  /** Whether to include line numbers in code blocks */
  includeLineNumbers: boolean;
  /** Preferred language for explanations */
  explanationDetail: 'minimal' | 'moderate' | 'detailed';
  /** Whether to include examples in explanations */
  includeExamples: boolean;
  /** Maximum response length preference */
  maxResponseLength: 'short' | 'medium' | 'long' | 'unlimited';
  /** Preferred tone */
  tone: 'professional' | 'casual' | 'technical' | 'friendly';
  /** Whether to use markdown formatting */
  useMarkdown: boolean;
  /** Whether to break up long responses with headers */
  useHeaders: boolean;
}

/**
 * Agent instruction scope determines when instructions are active
 */
export type AgentInstructionScope = 'global' | 'workspace' | 'session';

/**
 * Agent instruction trigger condition
 */
export interface AgentInstructionTrigger {
  /** Type of trigger */
  type: 'always' | 'keyword' | 'file-type' | 'task-type' | 'manual';
  /** Value for the trigger (keywords, file patterns, task types) */
  value?: string;
}

/**
 * Agent instruction - specialized instructions for different agent behaviors
 * 
 * These instructions define how the agent should behave in specific contexts,
 * such as when acting as a researcher, planner, code reviewer, etc.
 */
export interface AgentInstruction {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Short description of what this instruction does */
  description: string;
  /** The instruction content to inject into the system prompt */
  instructions: string;
  /** Icon identifier (lucide icon name) */
  icon?: string;
  /** Whether this is a built-in instruction */
  isBuiltIn?: boolean;
  /** Whether this instruction is enabled */
  enabled: boolean;
  /** Scope of the instruction */
  scope: AgentInstructionScope;
  /** Priority order (lower = higher priority, loaded first) */
  priority: number;
  /** Trigger conditions for when to apply this instruction */
  trigger: AgentInstructionTrigger;
  /** Tags for categorization and filtering */
  tags?: string[];
}

// =============================================================================
// AGENTS.md File Support Types
// =============================================================================

/**
 * Parsed AGENTS.md file content
 * Follows the AGENTS.md specification (https://agents.md/)
 */
export interface AgentsMdFile {
  /** Absolute path to the AGENTS.md file */
  filePath: string;
  /** Relative path from workspace root */
  relativePath: string;
  /** Raw markdown content */
  content: string;
  /** File modification time for cache invalidation */
  mtime: number;
  /** Depth from workspace root (0 = root, 1 = one level down, etc.) */
  depth: number;
  /** Parsed sections from the markdown */
  sections: AgentsMdSection[];
}

/**
 * A section from an AGENTS.md file
 */
export interface AgentsMdSection {
  /** Section heading (e.g., "Setup commands", "Code style") */
  heading: string;
  /** Heading level (1-6) */
  level: number;
  /** Section content (markdown) */
  content: string;
}

/**
 * AGENTS.md context for system prompt injection
 * Represents the resolved AGENTS.md content for a given context
 */
export interface AgentsMdContext {
  /** Whether AGENTS.md files were found */
  found: boolean;
  /** Primary AGENTS.md file (closest to active file or workspace root) */
  primary?: AgentsMdFile;
  /** All discovered AGENTS.md files in the workspace */
  allFiles: AgentsMdFile[];
  /** Combined content from all applicable files (respecting hierarchy) */
  combinedContent: string;
  /** Last scan timestamp */
  scannedAt: number;
}

// =============================================================================
// Project Instruction Files Support Types (Extended AGENTS.md)
// =============================================================================

/**
 * Types of instruction files that can be discovered and loaded.
 * Following the 2025-2026 multi-agent specification standards.
 */
export type InstructionFileType =
  | 'agents-md'           // AGENTS.md - Open standard (Linux Foundation)
  | 'claude-md'           // CLAUDE.md - Anthropic Claude Code
  | 'copilot-instructions' // .github/copilot-instructions.md - GitHub Copilot
  | 'github-instructions' // .github/instructions/*.md - Path-specific Copilot
  | 'gemini-md'           // GEMINI.md - Google Gemini CLI
  | 'cursor-rules';       // .cursor/rules - Cursor editor

/**
 * Frontmatter metadata parsed from instruction files
 */
export interface InstructionFileFrontmatter {
  /** Title of the instruction file */
  title?: string;
  /** Description of the instructions */
  description?: string;
  /** Priority order (lower = higher priority) */
  priority?: number;
  /** Glob patterns for path-specific instructions */
  paths?: string[];
  /** Tags for categorization */
  tags?: string[];
  /** Whether this file should override parent instructions */
  override?: boolean;
  /** Scope of the instructions */
  scope?: 'global' | 'directory' | 'file';
  /** Custom metadata */
  [key: string]: unknown;
}

/**
 * Extended instruction file with type and frontmatter
 */
export interface InstructionFile extends AgentsMdFile {
  /** Type of instruction file */
  type: InstructionFileType;
  /** Parsed frontmatter metadata */
  frontmatter?: InstructionFileFrontmatter;
  /** Whether this file is enabled */
  enabled: boolean;
  /** User-set priority override (null = use default from frontmatter or type) */
  priorityOverride?: number;
  /** Source of the instruction file */
  source: 'workspace' | 'user' | 'global';
}

/**
 * Configuration for which instruction file types to load
 */
export interface InstructionFilesConfig {
  /** Enable AGENTS.md loading */
  enableAgentsMd: boolean;
  /** Enable CLAUDE.md loading */
  enableClaudeMd: boolean;
  /** Enable .github/copilot-instructions.md loading */
  enableCopilotInstructions: boolean;
  /** Enable .github/instructions/*.md loading */
  enableGithubInstructions: boolean;
  /** Enable GEMINI.md loading */
  enableGeminiMd: boolean;
  /** Enable .cursor/rules loading */
  enableCursorRules: boolean;
  /** Per-file enabled/disabled overrides by relative path */
  fileOverrides: Record<string, { enabled: boolean; priority?: number }>;
  /** Maximum combined content length (characters) */
  maxCombinedContentLength: number;
  /** Whether to show instruction sources in the prompt */
  showSourcesInPrompt: boolean;
}

/**
 * Extended context for all instruction files
 */
export interface InstructionFilesContext {
  /** Whether any instruction files were found */
  found: boolean;
  /** All discovered instruction files */
  allFiles: InstructionFile[];
  /** Files filtered by enabled status and config */
  enabledFiles: InstructionFile[];
  /** Combined content from all enabled files (respecting priority) */
  combinedContent: string;
  /** Last scan timestamp */
  scannedAt: number;
  /** Errors encountered during discovery */
  errors: Array<{ path: string; error: string }>;
  /** Config used for this context */
  config: InstructionFilesConfig;
}

/**
 * Default instruction files configuration
 */
export const DEFAULT_INSTRUCTION_FILES_CONFIG: InstructionFilesConfig = {
  enableAgentsMd: true,
  enableClaudeMd: true,
  enableCopilotInstructions: true,
  enableGithubInstructions: true,
  enableGeminiMd: true,
  enableCursorRules: true,
  fileOverrides: {},
  maxCombinedContentLength: 32000, // 32KB combined limit
  showSourcesInPrompt: true,
};

/**
 * Complete prompt customization settings
 */
export interface PromptSettings {
  /** Custom system prompt (overrides default if set) */
  customSystemPrompt: string;
  /** Whether to use custom system prompt */
  useCustomSystemPrompt: boolean;
  /** Currently selected persona ID */
  activePersonaId: string | null;
  /** Available personas (built-in + custom) */
  personas: AgentPersona[];
  /** Context injection rules */
  contextInjectionRules: ContextInjectionRule[];
  /** Response format preferences */
  responseFormat: ResponseFormatPreferences;
  /** Whether to include workspace context in prompts */
  includeWorkspaceContext: boolean;
  /** Agent instructions - specialized behavior definitions */
  agentInstructions: AgentInstruction[];
  /** Configuration for project instruction files (AGENTS.md, CLAUDE.md, etc.) */
  instructionFilesConfig: InstructionFilesConfig;
}

/**
 * Default response format preferences
 */
export const DEFAULT_RESPONSE_FORMAT: ResponseFormatPreferences = {
  codeBlockStyle: 'fenced',
  includeLineNumbers: false,
  explanationDetail: 'moderate',
  includeExamples: true,
  maxResponseLength: 'medium',
  tone: 'professional',
  useMarkdown: true,
  useHeaders: true,
};

/**
 * Built-in agent instructions
 * These provide specialized behaviors that can be dynamically loaded
 */
export const BUILT_IN_AGENT_INSTRUCTIONS: AgentInstruction[] = [
  {
    id: 'researcher',
    name: 'Researcher',
    description: 'Focused on gathering information, searching documentation, and web research',
    instructions: `When acting as a researcher:
- Use browser tools to search for up-to-date documentation and information
- Use grep and glob to find relevant code patterns and implementations
- Gather comprehensive context before providing answers
- Cite sources and provide links to documentation when relevant
- Focus on accuracy and completeness of information
- Synthesize findings into clear, actionable summaries`,
    icon: 'Search',
    isBuiltIn: true,
    enabled: true,
    scope: 'global',
    priority: 1,
    trigger: { type: 'keyword', value: 'research,find,search,documentation,docs' },
    tags: ['research', 'documentation', 'search'],
  },
  {
    id: 'planner',
    name: 'Planner',
    description: 'Creates detailed plans and breaks down complex tasks into steps',
    instructions: `When acting as a planner:
- Use CreatePlan tool to structure multi-step tasks
- Break complex problems into smaller, manageable subtasks
- Consider dependencies between tasks
- Estimate complexity and effort for each step
- Identify potential blockers and risks
- Provide clear success criteria for each task
- Track progress with TodoWrite tool`,
    icon: 'ListTodo',
    isBuiltIn: true,
    enabled: true,
    scope: 'global',
    priority: 2,
    trigger: { type: 'keyword', value: 'plan,breakdown,steps,organize,task' },
    tags: ['planning', 'organization', 'tasks'],
  },
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    description: 'Reviews code for quality, security, and best practices',
    instructions: `When acting as a code reviewer:
- Analyze code for correctness, security vulnerabilities, and bugs
- Check for adherence to best practices and design patterns
- Evaluate code readability and maintainability
- Identify performance issues and optimization opportunities
- Suggest specific improvements with code examples
- Consider edge cases and error handling
- Use LSP tools for comprehensive code analysis`,
    icon: 'CheckCircle2',
    isBuiltIn: true,
    enabled: true,
    scope: 'global',
    priority: 3,
    trigger: { type: 'keyword', value: 'review,audit,check,analyze,quality' },
    tags: ['review', 'quality', 'security'],
  },
  {
    id: 'debugger',
    name: 'Debugger',
    description: 'Specialized in finding and fixing bugs and issues',
    instructions: `When acting as a debugger:
- Systematically trace the source of issues
- Use read_lints to check for diagnostic errors
- Analyze stack traces and error messages carefully
- Form and test hypotheses about the root cause
- Check related code paths for similar issues
- Verify fixes don't introduce new problems
- Document the issue and solution for future reference`,
    icon: 'Bug',
    isBuiltIn: true,
    enabled: true,
    scope: 'global',
    priority: 4,
    trigger: { type: 'keyword', value: 'debug,fix,bug,error,issue,problem' },
    tags: ['debugging', 'troubleshooting', 'fixes'],
  },
  {
    id: 'refactorer',
    name: 'Refactorer',
    description: 'Improves code structure without changing behavior',
    instructions: `When acting as a refactorer:
- Preserve existing functionality while improving code structure
- Apply SOLID principles and design patterns appropriately
- Use LSP tools to find all references before renaming
- Break large functions/files into smaller, focused units
- Improve naming for clarity and consistency
- Remove code duplication through abstraction
- Ensure tests pass after each refactoring step`,
    icon: 'RefreshCw',
    isBuiltIn: true,
    enabled: true,
    scope: 'global',
    priority: 5,
    trigger: { type: 'keyword', value: 'refactor,restructure,reorganize,cleanup,improve' },
    tags: ['refactoring', 'cleanup', 'structure'],
  },
];

/**
 * Built-in personas
 */
export const BUILT_IN_PERSONAS: AgentPersona[] = [
  {
    id: 'default',
    name: 'Default Assistant',
    description: 'Balanced, helpful coding assistant',
    systemPrompt: '',
    icon: 'Bot',
    isBuiltIn: true,
  },
  {
    id: 'senior-dev',
    name: 'Senior Developer',
    description: 'Experienced, thorough, focuses on best practices and code quality',
    systemPrompt: `You are a senior software developer with 15+ years of experience. You:
- Always prioritize code quality, maintainability, and best practices
- Consider edge cases and error handling thoroughly
- Suggest improvements proactively when you see potential issues
- Explain the reasoning behind architectural decisions
- Focus on writing clean, well-documented, testable code`,
    icon: 'Code2',
    isBuiltIn: true,
  },
  {
    id: 'quick-helper',
    name: 'Quick Helper',
    description: 'Fast, concise responses for quick tasks',
    systemPrompt: `You are a fast, efficient coding assistant. You:
- Give concise, direct answers
- Skip unnecessary explanations unless asked
- Focus on getting the task done quickly
- Provide working code first, explanations only if needed
- Assume the user knows what they're doing`,
    icon: 'Zap',
    isBuiltIn: true,
  },
  {
    id: 'teacher',
    name: 'Teacher Mode',
    description: 'Educational, explains concepts in detail',
    systemPrompt: `You are a patient programming teacher. You:
- Explain concepts thoroughly and clearly
- Use analogies and examples to illustrate points
- Break down complex topics into digestible pieces
- Encourage learning and understanding over quick fixes
- Point out learning opportunities in every interaction`,
    icon: 'GraduationCap',
    isBuiltIn: true,
  },
  {
    id: 'architect',
    name: 'System Architect',
    description: 'Focuses on system design and architecture',
    systemPrompt: `You are a systems architect. You:
- Think about scalability and maintainability
- Consider the bigger picture and system interactions
- Suggest appropriate design patterns
- Balance trade-offs between different approaches
- Focus on clean separation of concerns`,
    icon: 'Building2',
    isBuiltIn: true,
  },
];

/**
 * Default prompt settings
 */
export const DEFAULT_PROMPT_SETTINGS: PromptSettings = {
  customSystemPrompt: '',
  useCustomSystemPrompt: false,
  activePersonaId: 'default',
  personas: [...BUILT_IN_PERSONAS],
  contextInjectionRules: [],
  responseFormat: DEFAULT_RESPONSE_FORMAT,
  includeWorkspaceContext: true,
  agentInstructions: [...BUILT_IN_AGENT_INSTRUCTIONS],
  instructionFilesConfig: { ...DEFAULT_INSTRUCTION_FILES_CONFIG },
};

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
// Appearance Settings
// =============================================================================

/**
 * Available accent color presets
 */
export type AccentColorPreset = 
  | 'emerald'   // Default green
  | 'violet'    // Purple
  | 'blue'      // Blue
  | 'amber'     // Orange/yellow
  | 'rose'      // Pink/red
  | 'cyan'      // Teal/cyan
  | 'custom';   // Custom hex color

/**
 * Font size scale options
 */
export type FontSizeScale = 'compact' | 'default' | 'comfortable' | 'large';

/**
 * Available terminal font families
 */
export type TerminalFont = 
  | 'JetBrains Mono'
  | 'Fira Code'
  | 'Source Code Pro'
  | 'Cascadia Code'
  | 'Consolas'
  | 'Monaco'
  | 'Menlo'
  | 'system';

/**
 * Loading indicator visual style
 */
export type LoadingIndicatorStyle = 'spinner' | 'dots' | 'pulse' | 'minimal';

/**
 * Animation speed preference
 */
export type AnimationSpeed = 'slow' | 'normal' | 'fast';

/**
 * Reduce motion behavior preference
 */
export type ReduceMotionPreference = 'system' | 'always' | 'never';

/**
 * Animation speed multipliers
 */
export const ANIMATION_SPEED_MULTIPLIERS: Record<AnimationSpeed, number> = {
  slow: 1.5,
  normal: 1.0,
  fast: 0.5,
};

/**
 * Appearance and UI customization settings
 */
export interface AppearanceSettings {
  /** Font size scale for the entire UI */
  fontSizeScale: FontSizeScale;
  /** Accent color preset */
  accentColor: AccentColorPreset;
  /** Custom accent color (hex) when accentColor is 'custom' */
  customAccentColor?: string;
  /** Enable compact mode (reduced padding/margins) */
  compactMode: boolean;
  /** Terminal font family */
  terminalFont: TerminalFont;
  /** Terminal font size in pixels */
  terminalFontSize: number;
  /** Enable smooth animations */
  enableAnimations: boolean;
  /** Loading indicator visual style */
  loadingIndicatorStyle: LoadingIndicatorStyle;
  /** Animation speed preference */
  animationSpeed: AnimationSpeed;
  /** Reduce motion behavior preference */
  reduceMotion: ReduceMotionPreference;
  /** Show line numbers in code blocks */
  showLineNumbers: boolean;
  /** Enable syntax highlighting in code blocks */
  enableSyntaxHighlighting: boolean;
}

/**
 * Default appearance settings
 */
export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  fontSizeScale: 'default',
  accentColor: 'emerald',
  compactMode: false,
  terminalFont: 'JetBrains Mono',
  terminalFontSize: 12,
  enableAnimations: true,
  loadingIndicatorStyle: 'spinner',
  animationSpeed: 'normal',
  reduceMotion: 'system',
  showLineNumbers: true,
  enableSyntaxHighlighting: true,
};

/**
 * Font size scale CSS variables mapping
 */
export const FONT_SIZE_SCALES: Record<FontSizeScale, {
  base: number;
  sm: number;
  xs: number;
  lg: number;
}> = {
  compact: { base: 11, sm: 10, xs: 9, lg: 12 },
  default: { base: 12, sm: 11, xs: 10, lg: 14 },
  comfortable: { base: 14, sm: 12, xs: 11, lg: 16 },
  large: { base: 16, sm: 14, xs: 12, lg: 18 },
};

/**
 * Accent color CSS variable mappings
 */
export const ACCENT_COLOR_PRESETS: Record<Exclude<AccentColorPreset, 'custom'>, {
  primary: string;
  hover: string;
  active: string;
  muted: string;
}> = {
  emerald: { primary: '#34d399', hover: '#6ee7b7', active: '#a7f3d0', muted: '#047857' },
  violet: { primary: '#a78bfa', hover: '#c4b5fd', active: '#ddd6fe', muted: '#6d28d9' },
  blue: { primary: '#60a5fa', hover: '#93c5fd', active: '#bfdbfe', muted: '#1d4ed8' },
  amber: { primary: '#fbbf24', hover: '#fcd34d', active: '#fde68a', muted: '#b45309' },
  rose: { primary: '#fb7185', hover: '#fda4af', active: '#fecdd3', muted: '#be123c' },
  cyan: { primary: '#22d3ee', hover: '#67e8f9', active: '#a5f3fc', muted: '#0e7490' },
};

// =============================================================================
// Access Level Types
// =============================================================================

/**
 * System access levels defining what the AI agent can do
 * - read-only: Can only read files and run non-modifying commands
 * - standard: Default level - can read/write with confirmations
 * - elevated: Extended permissions with fewer confirmations
 * - admin: Full system access (use with caution)
 */
export type AccessLevel = 'read-only' | 'standard' | 'elevated' | 'admin';

/**
 * Tool category for permission grouping and UI classification
 * This is the canonical definition - import from here in other files
 */
export type ToolCategory =
  | 'read'           // File reading, searching, listing
  | 'write'          // File creation, editing, deletion
  | 'terminal'       // Terminal command execution
  | 'git'            // Git operations
  | 'system'         // System-level operations
  | 'destructive'    // Potentially dangerous operations
  | 'file-read'      // Reading files (alias for read)
  | 'file-write'     // Creating/modifying files (alias for write)
  | 'file-search'    // Finding/searching files
  | 'media'          // Video, audio, media operations
  | 'communication'  // Email, messaging
  | 'code-intelligence' // Symbols, definitions, references, diagnostics
  | 'browser-read'   // Browser read-only operations (fetch, extract, console)
  | 'browser-write'  // Browser state-changing operations (click, type, navigate)
  | 'agent-internal' // Agent internal tools (planning, etc.)
  | 'other';         // Uncategorized

/**
 * Permission setting for a tool category
 */
export interface CategoryPermission {
  /** Whether tools in this category are allowed */
  allowed: boolean;
  /** Whether tools require confirmation */
  requiresConfirmation: boolean;
}

/**
 * Access level configuration
 */
export interface AccessLevelSettings {
  /** Current access level */
  level: AccessLevel;

  /** Category-level permissions (overrides level defaults) */
  categoryPermissions: Partial<Record<ToolCategory, CategoryPermission>>;

  /** Individual tool overrides (highest priority) */
  toolOverrides: Record<string, {
    allowed: boolean;
    requiresConfirmation: boolean;
  }>;

  /** Paths the agent is restricted from accessing (glob patterns) */
  restrictedPaths: string[];

  /** Paths the agent has explicit access to (glob patterns, overrides restrictions) */
  allowedPaths: string[];

  /** Whether to show access level in the system prompt */
  showInSystemPrompt: boolean;

  /** Custom message to include when access is denied */
  accessDeniedMessage: string;

  /** Allow the agent to request elevated access */
  allowAccessRequests: boolean;

  /** 
   * Allow access to files outside the workspace.
   * When false (default): Agent can only access files within the active workspace.
   * When true: Agent can access any file on the system (use with caution).
   */
  allowOutsideWorkspace: boolean;
}

/**
 * Default permissions per access level
 */
export const ACCESS_LEVEL_DEFAULTS: Record<AccessLevel, Record<ToolCategory, CategoryPermission>> = {
  'read-only': {
    read: { allowed: true, requiresConfirmation: false },
    write: { allowed: false, requiresConfirmation: true },
    terminal: { allowed: false, requiresConfirmation: true },
    git: { allowed: false, requiresConfirmation: true },
    system: { allowed: false, requiresConfirmation: true },
    destructive: { allowed: false, requiresConfirmation: true },
    'file-read': { allowed: true, requiresConfirmation: false },
    'file-write': { allowed: false, requiresConfirmation: true },
    'file-search': { allowed: true, requiresConfirmation: false },
    media: { allowed: false, requiresConfirmation: true },
    communication: { allowed: false, requiresConfirmation: true },
    'code-intelligence': { allowed: true, requiresConfirmation: false },
    'browser-read': { allowed: false, requiresConfirmation: true },
    'browser-write': { allowed: false, requiresConfirmation: true },
    'agent-internal': { allowed: true, requiresConfirmation: false },
    other: { allowed: false, requiresConfirmation: true },
  },
  'standard': {
    read: { allowed: true, requiresConfirmation: false },
    write: { allowed: true, requiresConfirmation: true },
    terminal: { allowed: true, requiresConfirmation: true },
    git: { allowed: true, requiresConfirmation: true },
    system: { allowed: false, requiresConfirmation: true },
    destructive: { allowed: false, requiresConfirmation: true },
    'file-read': { allowed: true, requiresConfirmation: false },
    'file-write': { allowed: true, requiresConfirmation: true },
    'file-search': { allowed: true, requiresConfirmation: false },
    media: { allowed: true, requiresConfirmation: true },
    communication: { allowed: false, requiresConfirmation: true },
    'code-intelligence': { allowed: true, requiresConfirmation: false },
    'browser-read': { allowed: true, requiresConfirmation: false },
    'browser-write': { allowed: true, requiresConfirmation: true },
    'agent-internal': { allowed: true, requiresConfirmation: false },
    other: { allowed: true, requiresConfirmation: true },
  },
  'elevated': {
    read: { allowed: true, requiresConfirmation: false },
    write: { allowed: true, requiresConfirmation: false },
    terminal: { allowed: true, requiresConfirmation: false },
    git: { allowed: true, requiresConfirmation: false },
    system: { allowed: true, requiresConfirmation: true },
    destructive: { allowed: false, requiresConfirmation: true },
    'file-read': { allowed: true, requiresConfirmation: false },
    'file-write': { allowed: true, requiresConfirmation: false },
    'file-search': { allowed: true, requiresConfirmation: false },
    media: { allowed: true, requiresConfirmation: false },
    communication: { allowed: true, requiresConfirmation: true },
    'code-intelligence': { allowed: true, requiresConfirmation: false },
    'browser-read': { allowed: true, requiresConfirmation: false },
    'browser-write': { allowed: true, requiresConfirmation: false },
    'agent-internal': { allowed: true, requiresConfirmation: false },
    other: { allowed: true, requiresConfirmation: false },
  },
  'admin': {
    read: { allowed: true, requiresConfirmation: false },
    write: { allowed: true, requiresConfirmation: false },
    terminal: { allowed: true, requiresConfirmation: false },
    git: { allowed: true, requiresConfirmation: false },
    system: { allowed: true, requiresConfirmation: false },
    destructive: { allowed: true, requiresConfirmation: true },
    'file-read': { allowed: true, requiresConfirmation: false },
    'file-write': { allowed: true, requiresConfirmation: false },
    'file-search': { allowed: true, requiresConfirmation: false },
    media: { allowed: true, requiresConfirmation: false },
    communication: { allowed: true, requiresConfirmation: false },
    'code-intelligence': { allowed: true, requiresConfirmation: false },
    'browser-read': { allowed: true, requiresConfirmation: false },
    'browser-write': { allowed: true, requiresConfirmation: false },
    'agent-internal': { allowed: true, requiresConfirmation: false },
    other: { allowed: true, requiresConfirmation: false },
  },
};

/**
 * Default access level settings
 */
export const DEFAULT_ACCESS_LEVEL_SETTINGS: AccessLevelSettings = {
  level: 'standard',
  categoryPermissions: {},
  toolOverrides: {},
  restrictedPaths: [
    '**/.env',
    '**/.env.*',
    '**/secrets/**',
    '**/credentials/**',
    '**/*.pem',
    '**/*.key',
    '**/id_rsa*',
    '**/authorized_keys',
  ],
  allowedPaths: [],
  showInSystemPrompt: true,
  accessDeniedMessage: 'This action is not permitted at your current access level.',
  allowAccessRequests: false,
  allowOutsideWorkspace: false,
};

/**
 * Human-readable descriptions for access levels
 */
export const ACCESS_LEVEL_DESCRIPTIONS: Record<AccessLevel, { name: string; description: string; icon: string }> = {
  'read-only': {
    name: 'Read Only',
    description: 'Can only read files and search. No modifications allowed.',
    icon: 'Eye',
  },
  'standard': {
    name: 'Standard',
    description: 'Default level. Can read and write with confirmations.',
    icon: 'Shield',
  },
  'elevated': {
    name: 'Elevated',
    description: 'Extended permissions with fewer confirmation prompts.',
    icon: 'ShieldCheck',
  },
  'admin': {
    name: 'Administrator',
    description: 'Full system access. Use with extreme caution.',
    icon: 'ShieldAlert',
  },
};

// =============================================================================
// Task-Based Model Routing Types
// =============================================================================

/**
 * Task types that the agent can detect and route to different models.
 * Each task type can be configured to use a specific provider/model combination.
 */
export type RoutingTaskType =
  | 'frontend'       // React, Vue, CSS, HTML, UI components
  | 'backend'        // Node.js, APIs, databases, server logic
  | 'debugging'      // Bug fixing, error analysis
  | 'analysis'       // Code review, refactoring suggestions
  | 'planning'       // Architecture, system design, planning
  | 'documentation'  // READMEs, comments, docs
  | 'testing'        // Test writing, test analysis
  | 'devops'         // CI/CD, Docker, deployment
  | 'general';       // Default fallback

/**
 * Human-readable info for each task type
 */
export const ROUTING_TASK_INFO: Record<RoutingTaskType, { name: string; description: string; icon: string; keywords: string[] }> = {
  frontend: {
    name: 'Frontend Development',
    description: 'React, Vue, CSS, HTML, UI components, styling',
    icon: 'Layout',
    keywords: ['react', 'vue', 'angular', 'css', 'html', 'component', 'ui', 'ux', 'tailwind', 'style', 'dom', 'browser', 'responsive', 'animation'],
  },
  backend: {
    name: 'Backend Development',
    description: 'Node.js, APIs, databases, server logic, authentication',
    icon: 'Server',
    keywords: ['api', 'database', 'server', 'node', 'express', 'fastify', 'mongodb', 'postgres', 'sql', 'rest', 'graphql', 'auth', 'middleware', 'endpoint'],
  },
  debugging: {
    name: 'Debugging',
    description: 'Bug fixing, error analysis, troubleshooting',
    icon: 'Bug',
    keywords: ['bug', 'error', 'fix', 'crash', 'issue', 'debug', 'broken', 'fail', 'exception', 'stack', 'trace', 'undefined', 'null', 'TypeError'],
  },
  analysis: {
    name: 'Code Analysis',
    description: 'Code review, refactoring, optimization suggestions',
    icon: 'Search',
    keywords: ['review', 'analyze', 'refactor', 'optimize', 'improve', 'performance', 'clean', 'smell', 'pattern', 'best practice', 'audit'],
  },
  planning: {
    name: 'Planning & Architecture',
    description: 'System design, architecture decisions, project planning',
    icon: 'Map',
    keywords: ['design', 'architect', 'plan', 'structure', 'organize', 'strategy', 'roadmap', 'diagram', 'flow', 'system', 'scale', 'microservice'],
  },
  documentation: {
    name: 'Documentation',
    description: 'READMEs, comments, API docs, guides',
    icon: 'FileText',
    keywords: ['document', 'readme', 'comment', 'jsdoc', 'describe', 'explain', 'guide', 'tutorial', 'api doc', 'changelog'],
  },
  testing: {
    name: 'Testing',
    description: 'Unit tests, integration tests, test analysis',
    icon: 'TestTube',
    keywords: ['test', 'jest', 'vitest', 'mocha', 'spec', 'unit', 'integration', 'e2e', 'coverage', 'mock', 'assert', 'expect'],
  },
  devops: {
    name: 'DevOps & Deployment',
    description: 'CI/CD, Docker, deployment, infrastructure',
    icon: 'Cloud',
    keywords: ['deploy', 'docker', 'kubernetes', 'ci', 'cd', 'pipeline', 'github actions', 'aws', 'azure', 'vercel', 'nginx', 'container'],
  },
  general: {
    name: 'General',
    description: 'Default for unclassified tasks',
    icon: 'MessageSquare',
    keywords: [],
  },
};

/**
 * Configuration for a single task-to-model mapping
 */
export interface TaskModelMapping {
  /** The task type this mapping applies to */
  taskType: RoutingTaskType;
  /** Provider to use for this task ('auto' uses the default provider selection) */
  provider: LLMProviderName | 'auto';
  /** Specific model ID to use (optional - uses provider default if not set) */
  modelId?: string;
  /** Whether this mapping is enabled */
  enabled: boolean;
  /** Custom temperature for this task type (optional) */
  temperature?: number;
  /** Custom max tokens for this task type (optional) */
  maxOutputTokens?: number;
  /** Priority when multiple mappings could apply (lower = higher priority) */
  priority: number;
  /** Fallback provider if primary is unavailable */
  fallbackProvider?: LLMProviderName;
  /** Fallback model if primary model fails */
  fallbackModelId?: string;
  /** Custom label for display in UI (for custom tasks) */
  label?: string;
  /** Description for this mapping */
  description?: string;
  /** Color for UI display (hex color or CSS variable) */
  color?: string;
}

/**
 * Custom user-defined task type for routing
 */
export interface CustomTaskType {
  /** Unique identifier for this custom task */
  id: string;
  /** Display name */
  name: string;
  /** Description of what this task handles */
  description: string;
  /** Icon name (from lucide-react) */
  icon: string;
  /** Keywords that trigger this task detection */
  keywords: string[];
  /** File patterns that indicate this task (glob-like) */
  filePatterns?: string[];
  /** Context patterns to match in user messages */
  contextPatterns?: string[];
  /** Priority relative to built-in tasks (lower = higher priority) */
  priority: number;
  /** Whether this custom task is active */
  enabled: boolean;
}

/**
 * Complete task-based routing configuration
 */
export interface TaskRoutingSettings {
  /** Enable task-based model routing */
  enabled: boolean;
  /** Default mapping when no specific task is detected */
  defaultMapping: TaskModelMapping;
  /** Task-specific mappings */
  taskMappings: TaskModelMapping[];
  /** Custom user-defined task types */
  customTaskTypes?: CustomTaskType[];
  /** Show routing decisions in the UI (for transparency) */
  showRoutingDecisions: boolean;
  /** Show routing badge on assistant messages */
  showRoutingBadge: boolean;
  /** Allow agent to override routing in complex scenarios */
  allowAgentOverride: boolean;
  /** Minimum confidence required to apply task-specific routing (0-1) */
  confidenceThreshold: number;
  /** Enable logging of routing decisions for debugging */
  logRoutingDecisions: boolean;
  /** Use conversation context for better task detection */
  useConversationContext: boolean;
  /** Number of recent messages to consider for context (1-20) */
  contextWindowSize: number;
  /** Enable fallback to default when routed provider fails */
  enableFallback: boolean;
}

/**
 * Default task routing settings
 */
export const DEFAULT_TASK_ROUTING_SETTINGS: TaskRoutingSettings = {
  enabled: false,
  defaultMapping: {
    taskType: 'general',
    provider: 'auto',
    enabled: true,
    priority: 100,
  },
  taskMappings: [
    { taskType: 'frontend', provider: 'auto', enabled: false, priority: 1, label: 'Frontend Development', description: 'React, Vue, CSS, HTML, UI components' },
    { taskType: 'backend', provider: 'auto', enabled: false, priority: 2, label: 'Backend Development', description: 'Node.js, APIs, databases' },
    { taskType: 'debugging', provider: 'auto', enabled: false, priority: 3, label: 'Debugging', description: 'Bug fixing, error analysis' },
    { taskType: 'analysis', provider: 'auto', enabled: false, priority: 4, label: 'Code Analysis', description: 'Code review, optimization' },
    { taskType: 'planning', provider: 'auto', enabled: false, priority: 5, label: 'Planning', description: 'Architecture, design' },
    { taskType: 'documentation', provider: 'auto', enabled: false, priority: 6, label: 'Documentation', description: 'READMEs, docs' },
    { taskType: 'testing', provider: 'auto', enabled: false, priority: 7, label: 'Testing', description: 'Tests, assertions' },
    { taskType: 'devops', provider: 'auto', enabled: false, priority: 8, label: 'DevOps', description: 'CI/CD, Docker' },
  ],
  customTaskTypes: [],
  showRoutingDecisions: true,
  showRoutingBadge: true,
  allowAgentOverride: true,
  confidenceThreshold: 0.6,
  logRoutingDecisions: false,
  useConversationContext: true,
  contextWindowSize: 10,
  enableFallback: true,
};

/**
 * Result of task detection
 */
export interface TaskDetectionResult {
  /** Detected task type (built-in or custom) */
  taskType: RoutingTaskType | string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Signals that triggered this detection */
  signals: string[];
  /** Alternative task types considered */
  alternatives?: Array<{ taskType: RoutingTaskType | string; confidence: number }>;
  /** Whether this is a custom task type */
  isCustomTask?: boolean;
}

/**
 * Routing decision made by the task router
 */
export interface RoutingDecision {
  /** Detected task type (built-in or custom) */
  detectedTaskType: RoutingTaskType | string;
  /** Confidence of detection */
  confidence: number;
  /** Selected provider */
  selectedProvider: LLMProviderName;
  /** Selected model ID */
  selectedModel: string;
  /** Human-readable reason for the decision */
  reason: string;
  /** Whether the default was used (no matching task mapping) */
  usedDefault: boolean;
  /** The mapping that was applied */
  appliedMapping?: TaskModelMapping;
  /** Signals that triggered the task detection */
  signals?: string[];
  /** Alternative task types that were considered */
  alternatives?: Array<{ taskType: RoutingTaskType | string; confidence: number }>;
  /** Whether fallback was used due to primary provider failure */
  usedFallback?: boolean;
  /** Original provider before fallback (if fallback was used) */
  originalProvider?: LLMProviderName;
  /** Whether this was a custom task type */
  isCustomTask?: boolean;
}

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
  /** Editor AI settings (inline completions, code actions) */
  editorAISettings?: EditorAISettings;
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
}

/**
 * Editor AI Settings
 * Configuration for AI-powered editor features
 */
export interface EditorAISettings {
  /** Enable inline completions (ghost text) */
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

/**
 * Default editor AI settings
 */
export const DEFAULT_EDITOR_AI_SETTINGS: EditorAISettings = {
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

// Git events for renderer
export interface GitStatusChangedEvent {
  type: 'git:status-changed';
  status: GitRepoStatus;
}

export interface GitBranchChangedEvent {
  type: 'git:branch-changed';
  from: string;
  to: string;
}

export interface GitOperationCompleteEvent {
  type: 'git:operation-complete';
  operation: string;
  success: boolean;
  message?: string;
}

export interface GitErrorEvent {
  type: 'git:error';
  operation: string;
  error: string;
}

export type GitEvent = GitStatusChangedEvent | GitBranchChangedEvent | GitOperationCompleteEvent | GitErrorEvent;

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
// Browser State Event Types
// =============================================================================

/**
 * Tool configuration settings
 */
export interface ToolConfigSettings {
  /** Tools that require confirmation when NOT in YOLO mode (YOLO mode bypasses all confirmations) */
  alwaysConfirmTools: string[];
  /** Tools that are completely disabled */
  disabledTools: string[];
  /** Per-tool timeout overrides (ms) */
  toolTimeouts: Record<string, number>;
  /** Allow dynamic tool creation */
  allowDynamicCreation: boolean;
  /** Require confirmation for dynamic tools */
  requireDynamicToolConfirmation: boolean;
  /** Maximum execution time for any tool (ms) */
  maxToolExecutionTime: number;
  /** Enable tool result caching */
  enableToolCaching: boolean;
  /** Maximum concurrent tool executions for parallel execution (default: 5) */
  maxConcurrentTools: number;
  /** User-defined custom tools */
  customTools?: CustomToolConfig[];
}

/**
 * User-defined custom tool configuration
 */
export interface CustomToolConfig {
  /** Unique identifier */
  id: string;
  /** Tool name (must be unique) */
  name: string;
  /** Description of what this tool does */
  description: string;
  /** Workflow steps (chain of existing tools) */
  steps: CustomToolStep[];
  /** Whether this tool is enabled */
  enabled: boolean;
  /** Whether this tool requires confirmation */
  requiresConfirmation: boolean;
  /** Creation timestamp */
  createdAt: number;
  /** Last modified timestamp */
  updatedAt: number;
  /** Usage count */
  usageCount: number;
}

/**
 * A step in a custom tool workflow
 */
export interface CustomToolStep {
  /** Step ID */
  id: string;
  /** Tool to execute */
  toolName: string;
  /** Input mapping (can reference $input or $stepN) */
  input: Record<string, unknown>;
  /** Condition for execution (optional) */
  condition?: string;
  /** Error handling: 'stop' or 'continue' */
  onError: 'stop' | 'continue';
}

/**
 * Default tool configuration settings
 */
export const DEFAULT_TOOL_CONFIG_SETTINGS: ToolConfigSettings = {
  alwaysConfirmTools: ['run', 'write', 'edit', 'delete'],
  disabledTools: [],
  toolTimeouts: {},
  allowDynamicCreation: true,
  requireDynamicToolConfirmation: true,
  maxToolExecutionTime: 120000, // 2 minutes
  enableToolCaching: true,
  maxConcurrentTools: 5, // Default max concurrent tools for parallel execution
};

/**
// =============================================================================
// Browser State Event Types
// =============================================================================

/**
 * Types of tool execution
 */
export type ToolExecutionType = 'template' | 'code' | 'composite';

/**
 * Risk level for dynamic tools
 */
export type ToolRiskLevel = 'safe' | 'moderate' | 'dangerous';

/**
 * Status of a dynamic tool
 */
export type DynamicToolStatus = 'active' | 'disabled' | 'expired';

/**
 * Specification of a dynamically created tool
 */
export interface ToolSpecification {
  /** Unique identifier for the tool */
  id: string;
  /** Tool name (must be unique within session) */
  name: string;
  /** Human-readable description */
  description: string;
  /** JSON Schema for tool parameters */
  inputSchema: Record<string, unknown>;
  /** How the tool executes */
  executionType: ToolExecutionType;
  /** Reference to template if template-based */
  templateId?: string;
  /** Workflow steps if composite tool */
  compositionSteps?: ToolCompositionStep[];
  /** Code to execute if code-based */
  executionCode?: string;
  /** Required capabilities/permissions */
  requiredCapabilities: string[];
  /** Risk assessment */
  riskLevel: ToolRiskLevel;
  /** Session/run that created this tool */
  createdBy: {
    sessionId: string;
    runId?: string;
    agentId?: string;
  };
  /** Creation timestamp */
  createdAt: number;
  /** Version number for tracking changes */
  version: number;
}

/**
 * A step in a composite tool workflow
 */
export interface ToolCompositionStep {
  /** Step identifier */
  id: string;
  /** Tool to execute */
  toolName: string;
  /** Arguments for the tool (can reference previous step outputs) */
  arguments: Record<string, unknown>;
  /** Dependencies on other steps */
  dependsOn: string[];
  /** Condition for execution (optional) */
  condition?: string;
  /** Output variable name */
  outputAs?: string;
}

/**
 * Pre-defined template for creating tools
 */
export interface ToolTemplate {
  /** Template identifier */
  id: string;
  /** Template name */
  name: string;
  /** What the template does */
  description: string;
  /** Configurable parameter bindings */
  parameterBindings: ToolParameterBinding[];
  /** Base schema template */
  baseSchema: Record<string, unknown>;
  /** Execution logic (template code) */
  executionLogic: string;
  /** Category for organization */
  category: string;
}

/**
 * Parameter binding for a tool template
 */
export interface ToolParameterBinding {
  /** Parameter name */
  name: string;
  /** Parameter type */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  /** Description */
  description: string;
  /** Default value */
  defaultValue?: unknown;
  /** Whether required */
  required: boolean;
}

/**
 * Runtime state of a dynamic tool
 */
export interface DynamicToolState {
  /** Tool name */
  name: string;
  /** Current status */
  status: DynamicToolStatus;
  /** Times used */
  usageCount: number;
  /** Last usage timestamp */
  lastUsedAt?: number;
  /** Error count */
  errorCount: number;
  /** Last error message */
  lastError?: string;
}

// -----------------------------------------------------------------------------
// Phase 2: Security Types
// -----------------------------------------------------------------------------

/**
 * Security event types for audit logging
 */
export type SecurityEventType =
  | 'tool_creation_attempt'
  | 'tool_creation_success'
  | 'tool_creation_denied'
  | 'tool_execution_attempt'
  | 'tool_execution_success'
  | 'tool_execution_denied'
  | 'capability_request'
  | 'capability_denied'
  | 'rate_limit_hit'
  | 'validation_failure'
  | 'sandbox_violation'
  | 'anomaly_detected';

/**
 * Security event for audit logging
 */
export interface SecurityEvent {
  /** Unique event ID */
  id: string;
  /** Event type */
  type: SecurityEventType;
  /** When the event occurred */
  timestamp: number;
  /** Actor (agent/session) that triggered the event */
  actor: {
    sessionId: string;
    agentId?: string;
    runId?: string;
  };
  /** Event details */
  details: {
    toolName?: string;
    toolId?: string;
    capability?: string;
    reason?: string;
    riskLevel?: ToolRiskLevel;
    [key: string]: unknown;
  };
  /** Outcome of the event */
  outcome: 'allowed' | 'denied' | 'flagged';
  /** Risk level assessment */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Security violation record
 */
export interface SecurityViolation {
  /** Violation ID */
  id: string;
  /** Violation type */
  type: 'code_injection' | 'privilege_escalation' | 'resource_abuse' | 'policy_violation';
  /** Severity */
  severity: 'warning' | 'error' | 'critical';
  /** Description */
  description: string;
  /** When detected */
  detectedAt: number;
  /** Related event ID */
  relatedEventId?: string;
  /** Action taken */
  actionTaken: 'logged' | 'blocked' | 'quarantined' | 'alerted';
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum operations per window */
  maxOperations: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Action when limit exceeded */
  onExceeded: 'reject' | 'queue' | 'throttle';
  /** Cooldown period after limit hit (ms) */
  cooldownMs?: number;
}

/**
 * Rate limit state
 */
export interface RateLimitState {
  /** Current operation count */
  count: number;
  /** Window start timestamp */
  windowStart: number;
  /** Whether currently in cooldown */
  inCooldown: boolean;
  /** Cooldown ends at */
  cooldownEndsAt?: number;
}

/**
 * Security level configuration
 */
export type SecurityLevel = 'maximum' | 'high' | 'standard' | 'permissive';

/**
 * Security settings for dynamic tools
 */
export interface DynamicToolSecuritySettings {
  /** Overall security level */
  level: SecurityLevel;
  /** Allow dynamic tool creation */
  allowDynamicTools: boolean;
  /** Allow code-based tools (most risky) */
  allowCodeBasedTools: boolean;
  /** Require confirmation for moderate risk */
  confirmModerateRisk: boolean;
  /** Require confirmation for dangerous */
  confirmDangerous: boolean;
  /** Maximum dynamic tools per session */
  maxToolsPerSession: number;
  /** Maximum tool creations per minute */
  maxCreationsPerMinute: number;
  /** Allowed capabilities for dynamic tools */
  allowedCapabilities: ToolCapability[];
  /** Blocked patterns in tool code */
  blockedPatterns: string[];
}

// -----------------------------------------------------------------------------
// Phase 2: Tool Capability Types
// -----------------------------------------------------------------------------

/**
 * Capability a tool can request
 */
export type ToolCapability =
  | 'file_read'
  | 'file_write'
  | 'network'
  | 'terminal'
  | 'environment'
  | 'system_info'
  | 'browser'
  | 'none';

/**
 * Capability grant for a dynamic tool
 */
export interface CapabilityGrant {
  /** The capability */
  capability: ToolCapability;
  /** Scope restrictions */
  scope?: {
    /** Allowed file paths (glob patterns) */
    paths?: string[];
    /** Allowed domains */
    domains?: string[];
    /** Allowed commands */
    commands?: string[];
  };
  /** When granted */
  grantedAt: number;
  /** When expires (optional) */
  expiresAt?: number;
}

// -----------------------------------------------------------------------------
// Phase 2: Tool Composition Types
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Phase 2: Tool Discovery Types
// -----------------------------------------------------------------------------

/**
 * Tool usage statistics
 */
export interface ToolUsageStats {
  /** Tool name */
  toolName: string;
  /** Total invocations */
  totalInvocations: number;
  /** Successful invocations */
  successCount: number;
  /** Failed invocations */
  failureCount: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Average execution time (ms) */
  avgDurationMs: number;
  /** Last used timestamp */
  lastUsedAt: number;
  /** Usage by context type */
  usageByContext: Record<string, number>;
}

/**
 * Ranking factors for tool search results
 */
export interface ToolRankingFactors {
  /** Text relevance score (0-1) */
  relevance: number;
  /** Usage frequency score (0-1) */
  frequency: number;
  /** Success rate score (0-1) */
  successRate: number;
  /** Recency score (0-1) */
  recency: number;
  /** User preference score (0-1) */
  preference: number;
}

/**
 * Weighted ranking configuration
 */
export interface ToolRankingConfig {
  /** Weight for relevance (default 0.4) */
  relevanceWeight: number;
  /** Weight for frequency (default 0.2) */
  frequencyWeight: number;
  /** Weight for success rate (default 0.2) */
  successRateWeight: number;
  /** Weight for recency (default 0.1) */
  recencyWeight: number;
  /** Weight for preference (default 0.1) */
  preferenceWeight: number;
}

/**
 * Tool suggestion with context
 */
export interface ToolSuggestion {
  /** Tool name */
  toolName: string;
  /** Why suggested */
  reason: 'task_match' | 'context_match' | 'pattern_match' | 'gap_fill' | 'alternative';
  /** Confidence score (0-1) */
  confidence: number;
  /** Explanation for user */
  explanation: string;
  /** Suggested arguments (if applicable) */
  suggestedArgs?: Record<string, unknown>;
}

/**
 * Search context for enhanced tool discovery
 */
export interface ToolSearchContext {
  /** Current task description */
  taskDescription?: string;
  /** Recent tool calls in session */
  recentToolCalls?: string[];
  /** File types being worked with */
  fileTypes?: string[];
  /** Programming language context */
  language?: string;
  /** Whether to include dynamic tools */
  includeDynamic?: boolean;
  /** Maximum results */
  maxResults?: number;
}

/**
 * Enhanced search result with ranking
 */
export interface RankedToolResult {
  /** Tool name */
  toolName: string;
  /** Tool description */
  description: string;
  /** Whether dynamic */
  isDynamic: boolean;
  /** Combined ranking score */
  score: number;
  /** Individual ranking factors */
  factors: ToolRankingFactors;
  /** Match explanation */
  matchReason?: string;
}

// -----------------------------------------------------------------------------
// Phase 2: Template Types
// -----------------------------------------------------------------------------

/**
 * Template categories
 */
export type ToolTemplateCategory =
  | 'http'
  | 'file'
  | 'data'
  | 'aggregate'
  | 'filter'
  | 'validate'
  | 'transform'
  | 'custom';

/**
 * Template execution context
 */
export interface TemplateExecutionContext {
  /** Bound parameters */
  params: Record<string, unknown>;
  /** Input data */
  input: unknown;
  /** Workspace path */
  workspacePath?: string;
  /** Capability grants */
  capabilities: CapabilityGrant[];
}

/**
 * Template execution result
 */
export interface TemplateExecutionResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Output data */
  output?: unknown;
  /** Error if failed */
  error?: string;
  /** Execution metadata */
  metadata?: {
    durationMs: number;
    bytesProcessed?: number;
    itemsProcessed?: number;
  };
}

// -----------------------------------------------------------------------------
// Phase 2: Sandbox Types
// -----------------------------------------------------------------------------

/**
 * Sandbox execution mode
 */
export type SandboxMode = 'strict' | 'limited' | 'standard' | 'privileged';

/**
 * Sandbox configuration
 */
export interface SandboxConfig {
  /** Execution mode */
  mode: SandboxMode;
  /** CPU time limit in milliseconds */
  cpuTimeLimitMs: number;
  /** I/O operations limit */
  ioOperationsLimit: number;
  /** Allowed globals */
  allowedGlobals: string[];
  /** Blocked patterns in code */
  blockedPatterns: string[];
}

/**
 * Sandbox execution result
 */
export interface SandboxExecutionResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Return value */
  result?: unknown;
  /** Error if failed */
  error?: string;
  /** Resource usage */
  resourceUsage: {
    cpuTimeMs: number;
    ioOperations: number;
  };
  /** Security events during execution */
  securityEvents: SecurityEvent[];
}

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
 * Global sessions event types - emitted by MultiSessionManager
 */
export type GlobalSessionEventType = 
  | 'global-session-started'
  | 'global-session-completed'
  | 'global-session-error'
  | 'global-session-progress'
  | 'global-stats-updated'
  | 'global-sessions-update';

/**
 * Global session event - emitted when session states change across workspaces
 */
export interface GlobalSessionEvent {
  type: GlobalSessionEventType;
  sessionId?: string;
  workspaceId?: string;
  runId?: string;
  stats?: GlobalSessionStats;
  error?: string;
  timestamp: number;
}

/**
 * Global sessions update event - periodic update of all running sessions
 */
export interface GlobalSessionsUpdateEvent {
  type: 'global-sessions-update';
  totalRunning: number;
  totalQueued: number;
  runningByWorkspace: Record<string, number>;
  sessions: Array<{
    sessionId: string;
    workspaceId: string;
    status: AgentRunStatus;
    startedAt: number;
    iteration: number;
    maxIterations: number;
    provider: string;
  }>;
  timestamp: number;
}

/**
 * Stats for running sessions across all workspaces
 */
export interface GlobalSessionStats {
  totalRunning: number;
  totalQueued: number;
  runningByWorkspace: Record<string, number>;
  canStartNew: boolean;
  maxGlobal: number;
  maxPerWorkspace: number;
}

export type RendererEvent = AgentEvent | WorkspaceEvent | SessionsEvent | AgentSettingsEvent | GitEvent | BrowserStateEvent | FileChangedEvent | ClaudeSubscriptionEvent | GLMSubscriptionEvent | TodoUpdateEvent | SessionHealthUpdateEvent | GlobalSessionEvent | GlobalSessionsUpdateEvent;


export interface StartSessionPayload {
  workspaceId?: string;
  initialConfig?: Partial<AgentConfig>;
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

export interface UpdateConfigPayload {
  sessionId: string;
  config: Partial<AgentConfig>;
}

export interface UpdateSettingsPayload {
  settings: Partial<AgentSettings>;
}

export type RendererToMainRequest =
  | { type: 'agent:start-session'; payload: StartSessionPayload }
  | { type: 'agent:send-message'; payload: SendMessagePayload }
  | { type: 'agent:confirm-tool'; payload: ConfirmToolPayload }
  | { type: 'agent:update-config'; payload: UpdateConfigPayload }
  | { type: 'agent:cancel-run'; payload: { sessionId: string; runId: string } }
  | { type: 'settings:update'; payload: UpdateSettingsPayload };

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
  // Phase 4 communication events
  | { type: 'question-asked'; sessionId: string; question: CommunicationQuestion; timestamp: number }
  | { type: 'question-answered'; sessionId: string; questionId: string; answer: unknown; timestamp: number }
  | { type: 'question-skipped'; sessionId: string; questionId: string; timestamp: number }
  | { type: 'decision-requested'; sessionId: string; decision: DecisionRequest; timestamp: number }
  | { type: 'decision-made'; sessionId: string; decisionId: string; selectedOption: string; timestamp: number }
  | { type: 'decision-skipped'; sessionId: string; decisionId: string; timestamp: number }
  | { type: 'progress-update'; sessionId: string; update: ProgressUpdate; timestamp: number };

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
// Enhanced File Operations Types
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

// =============================================================================
// Git Service Types
// =============================================================================

/** Git file status */
export type GitFileStatus =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'ignored'
  | 'conflicted'
  | 'unmerged';

/** Git file change information */
export interface GitFileChange {
  path: string;
  status: GitFileStatus;
  staged: boolean;
  oldPath?: string;
  additions?: number;
  deletions?: number;
}

/** Git branch information */
export interface GitBranch {
  name: string;
  current: boolean;
  remote?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  lastCommit?: string;
}

/** Git commit information */
export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  authorEmail: string;
  date: string;
  message: string;
  body?: string;
  parents: string[];
}

/** Git stash entry */
export interface GitStash {
  index: number;
  message: string;
  branch: string;
  date: string;
}

/** Git remote configuration */
export interface GitRemote {
  name: string;
  url: string;
  type: 'fetch' | 'push';
}

/** Comprehensive git repository status */
export interface GitRepoStatus {
  branch: string;
  upstream?: string;
  ahead: number;
  behind: number;
  isClean: boolean;
  isRebasing: boolean;
  isMerging: boolean;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: GitFileChange[];
  conflicted: GitFileChange[];
  stashCount: number;
}

/** Git blame entry */
export interface GitBlameEntry {
  commit: string;
  author: string;
  date: string;
  line: number;
  content: string;
}



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
// Phase 4: Task Analysis Types
// NOTE: TaskIntentType is defined in Task Intent Types section
// TaskScopeLevel, TaskComplexityLevel are defined in Task Analysis section above
// TaskIntent, TaskScope, TaskComplexity are interfaces that wrap these types with additional context
// TaskAnalysis is defined in Task Analysis section above with merged properties
// =============================================================================

/**
 * Requirements extracted from the task
 */
export interface TaskRequirements {
  /** Files that need to be read or modified */
  targetFiles: string[];
  /** Files that may need to be created */
  newFiles: string[];
  /** Expected output format */
  outputFormat?: 'code' | 'explanation' | 'both' | 'file-changes';
  /** User-specified constraints */
  constraints: string[];
  /** Quality requirements */
  qualityRequirements: string[];
  /** Inferred context from conversation */
  context: string[];
}

// NOTE: TaskAnalysis is defined in Task Analysis section above

/**
 * Dependency relationship between subtasks
 */
export interface TaskDependency {
  /** ID of the dependent subtask */
  subtaskId: string;
  /** IDs of subtasks this depends on */
  dependsOn: string[];
  /** Type of dependency */
  type: 'sequential' | 'data' | 'resource';
  /** Whether this is a hard dependency (must complete) or soft (preferred) */
  isHard: boolean;
}

/**
 * Individual subtask in a decomposed task
 */
export interface SubTask {
  /** Unique identifier */
  id: string;
  /** Parent subtask ID (for hierarchical decomposition) */
  parentId?: string;
  /** Order within parent or root */
  order: number;
  /** Subtask name */
  name: string;
  /** Detailed description */
  description: string;
  /** Type of subtask */
  type: TaskIntentType;
  /** Target files for this subtask */
  targetFiles: string[];
  /** Estimated token cost */
  estimatedTokens: number;
  /** Estimated time in milliseconds */
  estimatedTimeMs: number;
  /** Current state */
  state: 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped';
  /** Result of execution */
  result?: {
    success: boolean;
    output?: string;
    error?: string;
    tokensUsed?: number;
    timeMs?: number;
  };
  /** Dependencies */
  dependencies: string[];
  /** Priority (lower = higher priority) */
  priority: number;
  /** Can be executed in parallel with other subtasks */
  canParallelize: boolean;
}

/**
 * Decomposition pattern type
 */
export type DecompositionPattern =
  | 'sequential'   // Tasks in order
  | 'parallel'     // Independent tasks
  | 'hierarchical' // Tasks with subtasks
  | 'iterative';   // Repeat until condition

/**
 * Execution plan for a decomposed task
 */
export interface TaskPlan {
  /** Unique identifier */
  id: string;
  /** Analysis that generated this plan */
  analysisId: string;
  /** Session this plan belongs to */
  sessionId: string;
  /** Root subtasks */
  subtasks: SubTask[];
  /** All dependencies */
  dependencies: TaskDependency[];
  /** Decomposition pattern used */
  pattern: DecompositionPattern;
  /** Total estimated tokens */
  totalEstimatedTokens: number;
  /** Total estimated time in milliseconds */
  totalEstimatedTimeMs: number;
  /** Plan creation timestamp */
  createdAt: number;
  /** Plan state */
  state: 'planning' | 'executing' | 'completed' | 'failed' | 'cancelled';
  /** Progress percentage (0-100) */
  progress: number;
  /** Execution start time */
  startedAt?: number;
  /** Execution end time */
  completedAt?: number;
  /** Maximum parallel execution */
  maxParallelism: number;
  /** Whether plan was validated */
  isValidated: boolean;
  /** Validation errors if any */
  validationErrors: string[];
}

// =============================================================================
// Phase 4: Resource Types
// =============================================================================

/**
 * Types of resources that can be allocated
 */
export type ResourceType = 'tokens' | 'agents' | 'files' | 'terminals' | 'time' | 'api-calls';

/**
 * Strategy for resource allocation
 */
export type AllocationStrategy = 'fair-share' | 'priority' | 'fifo' | 'greedy' | 'reserved';

/**
 * Resource allocation record
 */
export interface ResourceAllocation {
  id: string;
  type: ResourceType;
  amount: number;
  used: number;
  holderId?: string;
  agentId?: string;
  holderType: 'session' | 'agent' | 'run';
  status: 'pending' | 'granted' | 'released' | 'expired';
  grantedAt: number;
  expiresAt?: number;
  isActive: boolean;
}

/**
 * Resource budget configuration
 */
export interface ResourceBudget {
  type: ResourceType;
  total: number;
  allocated: number;
  available: number;
  reserved: number;
}

/**
 * Resource budget item
 */
export interface ResourceBudgetItem {
  id: string;
  type: ResourceType;
  total: number;
  allocated: number;
  used: number;
  reserved: number;
  softLimit: number;
  hardLimit: number;
  isExhausted: boolean;
  percentUsed: number;
  ownerId: string;
  ownerType: 'session' | 'agent' | 'run';
}

/**
 * Resource usage tracking
 */
export interface ResourceUsage {
  type: ResourceType;
  current: number;
  peak: number;
  average: number;
  timestamp: number;
}

/**
 * Resource usage metrics
 */
export interface ResourceUsageMetrics {
  type: ResourceType;
  current: number;
  peak: number;
  average: number;
  history: Array<{ timestamp: number; value: number }>;
  allocationCount: number;
  releaseCount: number;
  waitTimeStats: {
    min: number;
    max: number;
    average: number;
  };
}

// =============================================================================
// Phase 4: Resource Allocation Types (Extended)
// =============================================================================

/**
 * Request for resource allocation
 */
export interface ResourceRequest {
  /** Unique request ID */
  id: string;
  /** Type of resource requested */
  type: ResourceType;
  /** Amount requested */
  amount: number;
  /** Requesting agent ID (null for main agent) */
  agentId?: string;
  /** Priority of the request */
  priority: 'low' | 'normal' | 'high' | 'critical';
  /** Reason for the request */
  reason: string;
  /** Maximum time to wait for allocation */
  timeoutMs?: number;
  /** Whether to queue if not immediately available */
  allowQueue: boolean;
  /** Timestamp of request */
  requestedAt: number;
}

/**
 * Result of an allocation attempt
 */
export interface AllocationResult {
  /** Whether allocation succeeded */
  success: boolean;
  /** Allocation if successful */
  allocation?: ResourceAllocation;
  /** Error message if failed */
  error?: string;
  /** Whether request was queued */
  queued: boolean;
  /** Position in queue if queued */
  queuePosition?: number;
  /** Estimated wait time if queued */
  estimatedWaitMs?: number;
}

/**
 * Resource pool status
 */
export interface ResourcePoolStatus {
  /** Pool type */
  type: ResourceType;
  /** Total capacity */
  capacity: number;
  /** Available amount */
  available: number;
  /** Active allocations count */
  activeAllocations: number;
  /** Queued requests count */
  queuedRequests: number;
  /** Pool health */
  health: 'healthy' | 'degraded' | 'exhausted';
  /** Last update timestamp */
  updatedAt: number;
}

// =============================================================================
// Phase 4: User Communication Types
// =============================================================================

/**
 * Types of questions that can be asked
 */
export type QuestionType =
  | 'yes-no'            // Simple yes/no question
  | 'multiple-choice'   // Select from options
  | 'text'              // Free-form text input
  | 'file-selection'    // Choose file(s)
  | 'priority-ranking'  // Rank items by priority
  | 'confirmation';     // Confirm an action

/**
 * An option in a multiple choice question
 */
export interface QuestionOption {
  /** Option ID */
  id: string;
  /** Display label */
  label: string;
  /** Description */
  description?: string;
  /** Whether this is the recommended option */
  isRecommended?: boolean;
  /** Whether this option is disabled */
  isDisabled?: boolean;
}

/**
 * A question to ask the user
 */
export interface CommunicationQuestion {
  /** Question ID */
  id: string;
  /** Question type */
  type: QuestionType;
  /** Question text */
  text: string;
  /** Additional context */
  context?: string;
  /** Options for multiple-choice */
  options?: QuestionOption[];
  /** Default answer */
  defaultAnswer?: string;
  /** Placeholder for text input */
  placeholder?: string;
  /** Timeout in milliseconds (0 = no timeout) */
  timeoutMs: number;
  /** Whether question is required (vs skippable) */
  isRequired: boolean;
  /** Whether question is blocking execution */
  isBlocking: boolean;
  /** Priority of the question */
  priority: 'low' | 'normal' | 'high' | 'urgent';
  /** Requesting agent ID */
  requesterId?: string;
  /** Session ID */
  sessionId: string;
  /** Run ID */
  runId?: string;
  /** Creation timestamp */
  createdAt: number;
  /** Validation pattern for text input */
  validationPattern?: string;
  /** Validation error message */
  validationMessage?: string;
}

/**
 * User's response to a question
 */
export interface QuestionResponse {
  /** Question ID */
  questionId: string;
  /** The answer */
  answer: string | string[] | boolean;
  /** Response timestamp */
  respondedAt: number;
  /** Whether question was skipped */
  skipped: boolean;
  /** Whether response timed out */
  timedOut: boolean;
}

/**
 * Progress level for updates
 */
export type ProgressLevel =
  | 'task'       // Overall task progress
  | 'subtask'    // Individual subtask
  | 'agent'      // Per-agent progress
  | 'operation'; // Current operation

// ProgressUpdate defined earlier at line ~3358

/**
 * A decision option with implications
 */
export interface DecisionOption {
  /** Option ID */
  id: string;
  /** Option label */
  label: string;
  /** Detailed description */
  description: string;
  /** Pros of this option */
  pros: string[];
  /** Cons of this option */
  cons: string[];
  /** Whether this is the recommended option */
  isRecommended: boolean;
  /** Risk level of this option */
  riskLevel: 'low' | 'medium' | 'high';
  /** Estimated impact description */
  impact: string;
}

/**
 * A decision request to the user
 */
export interface DecisionRequest {
  /** Decision ID */
  id: string;
  /** Decision title */
  title: string;
  /** Decision context/description */
  description: string;
  /** Available options */
  options: DecisionOption[];
  /** Why this decision is needed */
  reason: string;
  /** Urgency of the decision */
  urgency: 'low' | 'normal' | 'high' | 'blocking';
  /** Default option ID if user doesn't respond */
  defaultOptionId?: string;
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Session ID */
  sessionId: string;
  /** Run ID */
  runId?: string;
  /** Requesting agent ID */
  requesterId?: string;
  /** Creation timestamp */
  createdAt: number;
}

/**
 * User's decision response
 */
export interface DecisionResponse {
  /** Decision ID */
  decisionId: string;
  /** Selected option ID */
  selectedOptionId: string;
  /** Optional user comment */
  comment?: string;
  /** Response timestamp */
  respondedAt: number;
  /** Whether decision timed out (used default) */
  timedOut: boolean;
}

/**
 * Types of feedback
 */
export type FeedbackType =
  | 'rating'      // Satisfaction rating
  | 'issue'       // Report an issue
  | 'suggestion'  // Improvement suggestion
  | 'preference'; // Preference update

/**
 * User feedback on agent actions
 */
export interface UserFeedback {
  /** Feedback ID */
  id: string;
  /** Feedback type */
  type: FeedbackType;
  /** Related session ID */
  sessionId: string;
  /** Related run ID */
  runId?: string;
  /** Related message ID */
  messageId?: string;
  /** Rating (1-5) for rating type */
  rating?: number;
  /** Text feedback */
  text?: string;
  /** Specific issue description */
  issue?: string;
  /** Suggestion text */
  suggestion?: string;
  /** Preference key-value */
  preference?: { key: string; value: unknown };
  /** Timestamp */
  createdAt: number;
}

// =============================================================================
// Metrics & Observability Types (Phase 10)
// =============================================================================

/**
 * Metrics dashboard widget data
 */
export interface MetricsWidgetData {
  id: string;
  type: 'counter' | 'gauge' | 'chart' | 'table' | 'status';
  title: string;
  value: number | string | unknown[];
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: number;
  status?: 'healthy' | 'warning' | 'critical';
  chartData?: Array<{ timestamp: number; value: number }>;
  tableData?: Array<Record<string, unknown>>;
}

/**
 * Metrics dashboard layout
 */
export interface MetricsDashboardLayout {
  widgets: MetricsWidgetData[];
  lastUpdated: number;
  period: 'hour' | 'day' | 'week' | 'month';
}

/**
 * Tool metrics summary
 */
export interface ToolMetricsSummary {
  totalExecutions: number;
  successRate: number;
  avgDurationMs: number;
  topTools: Array<{ name: string; count: number; successRate: number }>;
  failingTools: Array<{ name: string; failureRate: number; errorCount: number }>;
}

/**
 * Agent metrics summary
 */
export interface AgentMetricsSummary {
  totalSpawned: number;
  completionRate: number;
  avgDurationMs: number;
  avgTokensPerAgent: number;
  bySpecialization: Array<{ specialization: string; count: number; successRate: number }>;
}

// =============================================================================
// Cost Management Types
// =============================================================================

/**
 * Cost record for tracking LLM usage costs
 */
export interface CostRecord {
  id: string;
  agentId: string;
  sessionId: string;
  provider: LLMProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: number;
  requestType: 'chat' | 'tool';
}

/**
 * Cost budget configuration
 */
export interface CostBudget {
  sessionBudget: number;
  perAgentBudget: number;
  warningThreshold: number;
  enforceHardLimit: boolean;
}

/**
 * Cost threshold event
 */
export interface CostThresholdEvent {
  type: 'cost-threshold-reached';
  agentId?: string;
  currentCost: number;
  budget: number;
  percentUsed: number;
  isHardLimit: boolean;
  timestamp: number;
}

// =============================================================================
// Provider Health Types
// =============================================================================

/**
 * Provider health status
 */
export interface ProviderHealth {
  provider: LLMProviderName;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs: number;
  errorRate: number;
  lastCheck: number;
  consecutiveFailures: number;
}

/**
 * Failover configuration
 */
export interface FailoverConfig {
  enabled: boolean;
  maxFailovers: number;
  maxRetries: number;
  retryDelayMs: number;
  failoverThreshold: number;
  recoveryPeriodMs: number;
  excludedProviders: LLMProviderName[];
  failoverChain: LLMProviderName[];
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
}

/**
 * Cost metrics summary
 */
export interface CostMetricsSummary {
  totalTokens: number;
  totalCostUsd: number;
  byProvider: Array<{ provider: string; tokens: number; costUsd: number }>;
  avgCostPerTask: number;
}

/**
 * Quality metrics summary
 */
export interface QualityMetricsSummary {
  taskSuccessRate: number;
  errorRate: number;
  userSatisfaction: number;
}

/**
 * System-wide metrics summary
 */
export interface SystemMetricsSummary {
  period: 'hour' | 'day' | 'week' | 'month';
  periodStart: number;
  periodEnd: number;
  tools: ToolMetricsSummary;
  agents: AgentMetricsSummary;
  costs: CostMetricsSummary;
  quality: QualityMetricsSummary;
  trends: {
    successRateTrend: 'improving' | 'stable' | 'declining';
    costTrend: 'increasing' | 'stable' | 'decreasing';
    performanceTrend: 'improving' | 'stable' | 'declining';
  };
}

/**
 * Metrics alert
 */
export interface MetricsAlert {
  severity: 'info' | 'warning' | 'error';
  message: string;
  timestamp: number;
}

/**
 * Safety status
 */
export interface SafetyStatus {
  isActive: boolean;
  emergencyStopTriggered: boolean;
  lastCheck: number;
  overallHealth: 'healthy' | 'warning' | 'critical';
}

/**
 * Resource limits configuration
 */
export interface SafetyResourceLimits {
  maxTokensPerRun: number;
  maxApiCallsPerRun: number;
  maxConcurrentAgents: number;
  maxFilesPerRun: number;
  maxBytesPerRun: number;
}

/**
 * Resource usage tracking
 */
export interface SafetyResourceUsage {
  tokensUsed: number;
  apiCallsUsed: number;
  activeAgents: number;
  filesModified: number;
  bytesWritten: number;
}

/**
 * Safety violation record
 */
export interface SafetyViolation {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  agentId?: string;
  action?: string;
  timestamp: number;
  wasBlocked: boolean;
}

/**
 * Complete safety state
 */
export interface SafetyState {
  status: SafetyStatus;
  limits: SafetyResourceLimits;
  usage: SafetyResourceUsage;
  recentViolations: SafetyViolation[];
  blockedActions: number;
  allowedActions: number;
}

/**
 * Performance bottleneck info
 */
export interface PerformanceBottleneck {
  type: 'slow-operation' | 'high-frequency' | 'blocking';
  severity: 'low' | 'medium' | 'high' | 'critical';
  operation: string;
  description: string;
  recommendation: string;
  metrics: {
    avgDurationMs?: number;
    callCount?: number;
    blockingTimeMs?: number;
  };
}

/**
 * Performance report
 */
export interface PerformanceReport {
  generatedAt: number;
  periodMs: number;
  summary: {
    totalOperations: number;
    avgDurationMs: number;
    p95DurationMs: number;
    p99DurationMs: number;
    slowestOperation: string;
    fastestOperation: string;
  };
  bottlenecks: PerformanceBottleneck[];
  recommendations: string[];
}

/**
 * Event emitted when metrics are updated
 */
export interface MetricsUpdateEvent {
  type: 'metrics-update';
  timestamp: number;
  metrics: Array<{
    name: string;
    value: number;
    labels?: Record<string, string>;
  }>;
}

/**
 * Event emitted when safety violation occurs
 */
export interface SafetyViolationEvent {
  type: 'safety-violation';
  sessionId?: string;
  timestamp: number;
  violation: SafetyViolation;
  wasBlocked: boolean;
}

/**
 * Event emitted when emergency stop is triggered
 */
export interface EmergencyStopEvent {
  type: 'emergency-stop';
  timestamp: number;
  reason: string;
  triggeredBy: 'user' | 'system' | 'safety-framework';
}
