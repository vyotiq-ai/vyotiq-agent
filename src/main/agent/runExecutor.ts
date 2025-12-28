import { randomUUID } from 'node:crypto';
import type {
  AgentEvent,
  ChatMessage,
  LLMProviderName,
  RendererEvent,
  ToolCallPayload,
  ProviderSettings,
  ProgressItem,
  DebugLLMCallEvent,
  DebugToolCallEvent,
  DebugToolResultEvent,
  DebugErrorEvent,
  DebugTraceStartEvent,
  DebugTraceCompleteEvent,
  SafetySettings,
  CacheSettings,
  PromptSettings,
  ComplianceSettings,
  StreamDeltaEvent,
  MediaOutputEvent as _MediaOutputEvent,
  TerminalSettings,
  ProviderResponseChunk,
  TokenUsage,
} from '../../shared/types';
import { DEFAULT_TERMINAL_SETTINGS } from '../../shared/types';
import type { InternalSession, AgenticContext } from './types';
import type { Logger } from '../logger';
import type { ProviderMap } from './providers';
import type { ToolRegistry, TerminalManager, ToolExecutionContext } from '../tools';
import type { WorkspaceManager } from '../workspaces/workspaceManager';
import type { LLMProvider, ProviderMessage, ProviderRequest, ProviderToolDefinition } from './providers/baseProvider';
import { ContextWindowManager, ConversationSummarizer, type ContextMetrics, selectToolsForContext, detectWorkspaceType, extractRecentToolUsage } from './context';
import { AgentDebugger, type AgentTrace } from './debugging';
import { ComplianceValidator, PromptOptimizer } from './compliance';
import { SafetyManager } from './safety';
import { agentMetrics } from './metrics';
import { getSharedModelById, getProviderConfig } from './providers/registry';
import type { DebugSettings, AccessLevelSettings } from '../../shared/types';
import { ACCESS_LEVEL_DEFAULTS } from '../../shared/types';
import { buildSystemPrompt, DEFAULT_PROMPT_SETTINGS, type SystemPromptContext, type TerminalContextInfo, type TerminalProcessInfo, type WorkspaceStructureContext } from './systemPrompt';
import { Minimatch } from 'minimatch';
import { buildImageGenerationSystemPrompt } from './imageGenerationPrompt';
import { AGGRESSIVE_CACHE_CONFIG, CONSERVATIVE_CACHE_CONFIG, DEFAULT_CACHE_CONFIG } from './cache';
import { normalizeStrictJsonSchema, parseToolArguments } from '../utils';

import { modelBelongsToProvider } from './utils/modelUtils';
import { isContextOverflowError, isRateLimitError, isQuotaOrBillingError, shouldTryFallback, isMaxOutputTokensError, isToolSupportError } from './utils/errorUtils';

import { executeToolsParallel, canBenefitFromParallel, type ParallelExecutionConfig, DEFAULT_PARALLEL_CONFIG } from '../tools/executor';
import { getLoopDetector, type LoopDetectionResult as _LoopDetectionResult } from './loopDetection';
import { getModelQualityTracker } from './modelQuality';
import { getSessionHealthMonitor } from './sessionHealth';

// Helper function to use minimatch for pattern matching
function matchPath(path: string, pattern: string): boolean {
  const mm = new Minimatch(pattern, { dot: true, matchBase: true });
  return mm.match(path);
}

interface RunExecutorDeps {
  providers: ProviderMap;
  toolRegistry: ToolRegistry;
  terminalManager: TerminalManager;
  workspaceManager: WorkspaceManager;
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
  getTerminalSettings?: () => TerminalSettings | undefined;
  getEditorState?: () => {
    openFiles: string[];
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
  };
  getWorkspaceDiagnostics?: () => Promise<{
    diagnostics: Array<{
      filePath: string;
      line: number;
      column: number;
      message: string;
      severity: 'error' | 'warning' | 'info' | 'hint';
      source: 'typescript' | 'eslint';
      code?: string | number;
    }>;
    errorCount: number;
    warningCount: number;
    filesWithErrors: string[];
    collectedAt: number;
  } | null>;
}

export class RunExecutor {
  private providers: ProviderMap;
  private readonly toolRegistry: ToolRegistry;
  private readonly terminalManager: TerminalManager;
  private readonly workspaceManager: WorkspaceManager;
  private readonly logger: Logger;
  private readonly emitEvent: (event: RendererEvent | AgentEvent) => void;
  private readonly getProviderSettings: (provider: LLMProviderName) => ProviderSettings | undefined;
  private readonly updateSessionState: (sessionId: string, update: Partial<InternalSession['state']>) => void;
  private readonly getSafetySettings: () => SafetySettings | undefined;
  private readonly getCacheSettings: () => CacheSettings | undefined;
  private readonly getDebugSettings: () => DebugSettings | undefined;
  private readonly getPromptSettings: () => PromptSettings | undefined;
  private readonly getComplianceSettings: () => ComplianceSettings | undefined;
  private readonly getAccessLevelSettings: () => AccessLevelSettings | undefined;
  private readonly getTerminalSettings: () => TerminalSettings | undefined;
  private readonly getEditorState?: () => {
    openFiles: string[];
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
  };
  private readonly getWorkspaceDiagnostics?: () => Promise<{
    diagnostics: Array<{
      filePath: string;
      line: number;
      column: number;
      message: string;
      severity: 'error' | 'warning' | 'info' | 'hint';
      source: 'typescript' | 'eslint';
      code?: string | number;
    }>;
    errorCount: number;
    warningCount: number;
    filesWithErrors: string[];
    collectedAt: number;
  } | null>;

  // Active controllers for cancellation
  private readonly activeControllers = new Map<string, AbortController>();

  // Pause/resume state for agent runs
  private readonly pausedSessions = new Map<string, {
    pausedAt: number;
    resumeResolve?: () => void;
  }>();

  // Provider health tracking to avoid repeatedly selecting a provider that is
  // known to be unusable (e.g., quota/billing errors).
  private readonly providerCooldownUntil = new Map<LLMProviderName, { until: number; reason: string }>();

  // Per-session execution queues for proper serialization
  // Prevents concurrent execution WITHIN a session while allowing different sessions to run concurrently
  private readonly sessionQueues = new Map<string, {
    queue: Array<{ session: InternalSession; resolve: () => void; reject: (err: Error) => void }>;
    isProcessing: boolean;
  }>();

  // Default iteration settings (can be overridden by session config)
  private readonly defaultMaxIterations = 20;
  private readonly defaultMaxRetries = 2;
  private readonly defaultRetryDelayMs = 1500;

  // Context window management
  private contextManager: ContextWindowManager;
  private conversationSummarizer: ConversationSummarizer;
  private analysisTimers = new Map<string, number>();
  private iterationTimers = new Map<string, number>();
  private toolTimers = new Map<string, number>();

  // Run timing tracking for progress display
  // Maps runId -> { startedAt, iterationTimes[] }
  private readonly runTimingData = new Map<string, {
    startedAt: number;
    iterationTimes: number[];
  }>();

  // Debug infrastructure
  private debugger: AgentDebugger;
  private debugEnabled = true; // Can be toggled

  // Compliance infrastructure - runtime rule enforcement
  private complianceValidator: ComplianceValidator;
  private promptOptimizer: PromptOptimizer;

  // Safety managers per run for file operation validation
  private readonly safetyManagers = new Map<string, SafetyManager>();



  constructor(deps: RunExecutorDeps) {
    this.providers = deps.providers;
    this.toolRegistry = deps.toolRegistry;
    this.terminalManager = deps.terminalManager;
    this.workspaceManager = deps.workspaceManager;
    this.logger = deps.logger;
    this.emitEvent = deps.emitEvent;
    this.getProviderSettings = deps.getProviderSettings;
    this.updateSessionState = deps.updateSessionState;
    this.getSafetySettings = deps.getSafetySettings;
    this.getCacheSettings = deps.getCacheSettings ?? (() => undefined);
    this.getDebugSettings = deps.getDebugSettings ?? (() => undefined);
    this.getPromptSettings = deps.getPromptSettings ?? (() => undefined);
    this.getComplianceSettings = deps.getComplianceSettings ?? (() => undefined);
    this.getAccessLevelSettings = deps.getAccessLevelSettings ?? (() => undefined);
    this.getTerminalSettings = deps.getTerminalSettings ?? (() => undefined);
    this.getEditorState = deps.getEditorState;
    this.getWorkspaceDiagnostics = deps.getWorkspaceDiagnostics;

    // Initialize debugger from settings or defaults
    const debugSettings = this.getDebugSettings();
    this.debugger = new AgentDebugger({
      verbose: debugSettings?.verboseLogging ?? process.env.NODE_ENV === 'development',
      captureFullPayloads: debugSettings?.captureFullPayloads ?? false,
      stepMode: debugSettings?.stepByStepMode ?? false,
      exportOnError: debugSettings?.autoExportOnError ?? true,
      exportFormat: debugSettings?.traceExportFormat ?? 'json',
    });
    this.debugEnabled = debugSettings?.verboseLogging ?? true;

    // Initialize context manager with default provider
    this.contextManager = new ContextWindowManager('deepseek');

    // Initialize conversation summarizer with balanced settings
    // Higher token limits = better context preservation but faster context growth
    this.conversationSummarizer = new ConversationSummarizer({
      minMessagesForSummary: 100,      // Start summarizing after 100 messages
      keepRecentMessages: 40,          // Keep last 40 messages fully intact
      maxToolResultTokens: 1200,       // Allow larger tool results (was 600)
    });

    // Initialize compliance validator for runtime rule enforcement
    const complianceSettings = this.getComplianceSettings();
    this.complianceValidator = new ComplianceValidator({
      enabled: complianceSettings?.enabled ?? true,
      enforceReadBeforeWrite: complianceSettings?.enforceReadBeforeWrite ?? true,
      enforceLintAfterEdit: complianceSettings?.enforceLintAfterEdit ?? true,
      blockUnnecessaryFiles: complianceSettings?.blockUnnecessaryFiles ?? false,
      maxViolationsBeforeBlock: complianceSettings?.maxViolationsBeforeBlock ?? 3,
      injectCorrectiveMessages: complianceSettings?.injectCorrectiveMessages ?? true,
      strictMode: complianceSettings?.strictMode ?? false,
      logViolations: complianceSettings?.logViolations ?? true,
    }, {
      info: (msg, meta) => this.logger.info(`[Compliance] ${msg}`, meta),
      warn: (msg, meta) => this.logger.warn(`[Compliance] ${msg}`, meta),
      error: (msg, meta) => this.logger.error(`[Compliance] ${msg}`, meta),
    }, (event) => this.emitEvent(event));

    // Initialize prompt optimizer for model-specific optimizations
    this.promptOptimizer = new PromptOptimizer();
  }

  /**
   * Get iteration settings from session config with fallback to defaults
   */
  private getIterationSettings(session: InternalSession): {
    maxIterations: number;
    maxRetries: number;
    retryDelayMs: number;
  } {
    const config = session.state.config;
    return {
      maxIterations: config.maxIterations ?? this.defaultMaxIterations,
      maxRetries: config.maxRetries ?? this.defaultMaxRetries,
      retryDelayMs: config.retryDelayMs ?? this.defaultRetryDelayMs,
    };
  }

  /**
   * Map tool name/category to access level category for permission checking
   */
  private getAccessLevelCategory(toolName: string, toolCategory?: string): import('../../shared/types').ToolCategory {
    const name = toolName.toLowerCase();

    // Check for destructive operations first
    if (['delete', 'rm', 'remove', 'format'].some(d => name.includes(d))) {
      return 'destructive';
    }

    // Map tool categories
    if (toolCategory) {
      switch (toolCategory) {
        case 'file-read':
        case 'file-search':
          return 'read';
        case 'file-write':
          return 'write';
        case 'terminal':
          return 'terminal';
        case 'system':
          return 'system';
        case 'memory':
          // Memory operations are safe - treat as read operations
          return 'read';
        default:
          break;
      }
    }

    // Fallback to name-based detection
    if (['read', 'list', 'ls', 'glob', 'grep', 'search', 'find'].some(r => name.includes(r))) {
      return 'read';
    }
    if (['write', 'create', 'edit', 'modify', 'append'].some(w => name.includes(w))) {
      return 'write';
    }
    if (['run', 'exec', 'shell', 'bash', 'terminal', 'command'].some(t => name.includes(t))) {
      return 'terminal';
    }
    if (['git', 'commit', 'push', 'pull', 'branch', 'merge'].some(g => name.includes(g))) {
      return 'git';
    }
    if (['install', 'uninstall', 'upgrade', 'system'].some(s => name.includes(s))) {
      return 'system';
    }
    // Memory tool should be treated as safe read operation
    if (name === 'memory') {
      return 'read';
    }

    // Default to read (safest category)
    return 'read';
  }

  /**
   * Check if a tool call is allowed based on access level settings
   */
  private checkAccessLevelPermission(
    toolName: string,
    toolCategory: string | undefined,
    filePath?: string
  ): { allowed: boolean; requiresConfirmation: boolean; reason?: string } {
    const accessSettings = this.getAccessLevelSettings();
    if (!accessSettings) {
      // No access level settings = allow everything
      return { allowed: true, requiresConfirmation: false };
    }

    const category = this.getAccessLevelCategory(toolName, toolCategory);

    // Check tool-specific overrides first
    if (accessSettings.toolOverrides[toolName]) {
      const override = accessSettings.toolOverrides[toolName];
      return {
        allowed: override.allowed,
        requiresConfirmation: override.requiresConfirmation,
        reason: !override.allowed ? `Tool '${toolName}' is blocked by access level override` : undefined,
      };
    }

    // Check category permissions
    const categoryPermission = accessSettings.categoryPermissions[category]
      ?? ACCESS_LEVEL_DEFAULTS[accessSettings.level][category];

    if (!categoryPermission.allowed) {
      return {
        allowed: false,
        requiresConfirmation: true,
        reason: `${category} operations are not allowed at '${accessSettings.level}' access level`,
      };
    }

    // Check path restrictions if a file path is provided
    if (filePath) {
      const normalizedPath = filePath.replace(/\\/g, '/');

      // Check explicitly allowed paths first (overrides restrictions)
      const isExplicitlyAllowed = accessSettings.allowedPaths.some(pattern =>
        matchPath(normalizedPath, pattern)
      );

      if (!isExplicitlyAllowed) {
        // Check restricted paths
        const isRestricted = accessSettings.restrictedPaths.some(pattern =>
          matchPath(normalizedPath, pattern)
        );

        if (isRestricted) {
          return {
            allowed: false,
            requiresConfirmation: true,
            reason: `Path '${filePath}' is restricted by access level settings`,
          };
        }
      }
    }

    return {
      allowed: true,
      requiresConfirmation: categoryPermission.requiresConfirmation,
    };
  }

  /**
   * Update conversation summarizer with session-specific settings
   */
  private updateSummarizerForSession(session: InternalSession): void {
    const config = session.state.config;
    if (config.enableContextSummarization === false) {
      // Disable summarization by setting very high thresholds
      this.conversationSummarizer = new ConversationSummarizer({
        minMessagesForSummary: 10000,
        keepRecentMessages: 10000,
        maxToolResultTokens: 1200,
      });
    } else {
      this.conversationSummarizer = new ConversationSummarizer({
        minMessagesForSummary: config.summarizationThreshold ?? 100,
        keepRecentMessages: config.keepRecentMessages ?? 40,
        maxToolResultTokens: 1200,
      });
    }
  }

  updateProviders(providers: ProviderMap): void {
    this.providers = providers;
  }

  /**
   * Update context manager configuration for a specific provider
   */
  private updateContextManagerForProvider(providerName: LLMProviderName): void {
    this.contextManager.updateConfig(providerName);
  }

  /**
   * Validated session state update
   * Ensures required fields are present before persisting
   */
  private safeUpdateSessionState(
    sessionId: string,
    update: Partial<InternalSession['state']>
  ): void {
    // Validate messages array if being updated
    if (update.messages && Array.isArray(update.messages)) {
      // Ensure all messages have required fields
      for (const msg of update.messages) {
        if (!msg.id || !msg.role || typeof msg.createdAt !== 'number') {
          this.logger.error('Invalid message in state update', {
            sessionId,
            message: { id: msg.id, role: msg.role, createdAt: msg.createdAt },
          });
          return; // Prevent persisting corrupted state
        }
      }
    }

    // Safe to persist
    this.updateSessionState(sessionId, update);
  }

  async executeRun(session: InternalSession): Promise<void> {
    const sessionId = session.state.id;
    
    return new Promise((resolve, reject) => {
      // Get or create per-session queue
      let sessionQueueData = this.sessionQueues.get(sessionId);
      if (!sessionQueueData) {
        sessionQueueData = { queue: [], isProcessing: false };
        this.sessionQueues.set(sessionId, sessionQueueData);
      }
      
      const queuePosition = sessionQueueData.queue.length;
      const isFirstInQueue = queuePosition === 0 && !sessionQueueData.isProcessing;
      
      this.logger.debug('Queueing session execution', {
        sessionId,
        queuePosition,
        isFirstInQueue,
        isProcessing: sessionQueueData.isProcessing,
      });
      
      // Queue the session for execution within its own queue
      sessionQueueData.queue.push({ session, resolve, reject });

      // Process this session's queue if not already processing
      this.processSessionQueue(sessionId).catch(err => {
        this.logger.error('Session queue processing error', { 
          sessionId,
          error: err instanceof Error ? err.message : String(err) 
        });
      });
    });
  }

  /**
   * Clear any queued executions for a session (used when cancelling)
   * Returns the number of items cleared from the queue
   */
  clearSessionQueue(sessionId: string): number {
    const sessionQueueData = this.sessionQueues.get(sessionId);
    if (!sessionQueueData) {
      return 0;
    }
    
    const clearedCount = sessionQueueData.queue.length;
    
    // Reject all queued promises with cancellation error
    for (const { reject } of sessionQueueData.queue) {
      reject(new Error('Session execution cancelled'));
    }
    
    sessionQueueData.queue = [];
    
    this.logger.debug('Cleared session queue', {
      sessionId,
      clearedCount,
    });
    
    return clearedCount;
  }

  /**
   * Get queue statistics for monitoring/debugging
   */
  getQueueStats(): { totalSessions: number; totalQueued: number; sessionsProcessing: number } {
    let totalQueued = 0;
    let sessionsProcessing = 0;
    
    for (const [, data] of this.sessionQueues) {
      totalQueued += data.queue.length;
      if (data.isProcessing) {
        sessionsProcessing++;
      }
    }
    
    return {
      totalSessions: this.sessionQueues.size,
      totalQueued,
      sessionsProcessing,
    };
  }

  /**
   * Continue a run after tool confirmation.
   * This resumes the iteration loop from where it paused for confirmation.
   */
  async continueAfterToolConfirmation(session: InternalSession): Promise<void> {
    const runId = session.state.activeRunId;
    if (!runId) {
      this.logger.warn('continueAfterToolConfirmation called without activeRunId', {
        sessionId: session.state.id
      });
      return;
    }

    let controller = this.activeControllers.get(session.state.id);
    if (!controller) {
      // Create a new controller if the old one was cleaned up
      controller = new AbortController();
      this.activeControllers.set(session.state.id, controller);
    }

    // Auto-resume if the session was paused - tool confirmation implies user wants to continue
    if (this.pausedSessions.has(session.state.id)) {
      this.logger.info('Auto-resuming paused session after tool confirmation', {
        sessionId: session.state.id,
        runId,
      });
      this.resumeRun(session.state.id);
    }

    this.logger.info('Continuing run after tool confirmation', {
      sessionId: session.state.id,
      runId,
    });

    // Get session-specific iteration settings
    const { maxIterations } = this.getIterationSettings(session);

    try {
      // Prefer the provider that was active when we paused for confirmation.
      let providerForContinuation: LLMProvider | null = null;
      const preferredProviderName = session.agenticContext?.currentProvider;
      if (preferredProviderName) {
        const info = this.providers.get(preferredProviderName);
        const cooldown = this.providerCooldownUntil.get(preferredProviderName);
        if (info?.provider && info.enabled && info.hasApiKey && (!cooldown || cooldown.until <= Date.now())) {
          providerForContinuation = info.provider;
        }
      }

      if (!providerForContinuation) {
        const { primary } = this.selectProvidersWithFallback(session);
        providerForContinuation = primary;
      }

      if (!providerForContinuation) {
        throw new Error('No available provider to continue run');
      }

      // Continue iteration loop - start from current iteration count
      // The agenticContext should still have the iteration count
      const startIteration = session.agenticContext?.iteration || 1;
      let iteration = startIteration;

      while (iteration < maxIterations && !controller.signal.aborted) {
        iteration++;

        // Safe checkpoint: wait if paused before starting iteration
        await this.waitIfPaused(session.state.id);

        // Check if cancelled while paused
        if (controller.signal.aborted) {
          break;
        }

        // Check if loop detector circuit breaker has triggered - stop execution
        const loopDetector = getLoopDetector();
        if (loopDetector.shouldTriggerCircuitBreaker(runId)) {
          this.logger.error('Stopping run due to loop detection circuit breaker', {
            sessionId: session.state.id,
            runId,
            iteration,
          });
          this.emitEvent({
            type: 'agent-status',
            sessionId: session.state.id,
            status: 'error',
            message: 'Run stopped: Agent detected in a loop. Try providing more specific instructions.',
            timestamp: Date.now(),
          });
          break;
        }

        // Check if session health monitor recommends stopping
        const healthMonitor = getSessionHealthMonitor();
        const healthCheck = healthMonitor.shouldStopRun(session.state.id);
        if (healthCheck.shouldStop) {
          this.logger.error('Stopping run due to session health issues', {
            sessionId: session.state.id,
            runId,
            iteration,
            reason: healthCheck.reason,
          });
          this.emitEvent({
            type: 'agent-status',
            sessionId: session.state.id,
            status: 'error',
            message: `Run stopped: ${healthCheck.reason}`,
            timestamp: Date.now(),
          });
          break;
        }

        // Update iteration count in agentic context BEFORE running
        // This ensures it's saved even if we pause for confirmation
        if (session.agenticContext) {
          session.agenticContext.iteration = iteration;
        }

        // Update session health monitor with iteration progress
        healthMonitor.updateIteration(session.state.id, iteration);

        this.logger.debug('Continuing iteration after confirmation', {
          iteration,
          sessionId: session.state.id,
          runId,
          provider: providerForContinuation.name,
        });

        // Emit iteration status for UI progress display
        this.emitIterationStatus(session.state.id, runId, iteration, maxIterations);

        this.startIterationProgress(session, runId, iteration, providerForContinuation.name);

        try {
          const result = await this.runIteration(session, providerForContinuation, controller, runId, iteration);
          const iterationStatus = result === 'cancelled' ? 'error' : 'success';
          this.finishIterationProgress(session, runId, iteration, iterationStatus);

          if (result === 'completed' || result === 'cancelled') {
            break;
          }

          if (result === 'awaiting-confirmation') {
            // Another tool needs confirmation - exit and wait again
            // The iteration count is already saved in agenticContext
            return;
          }
        } catch (error) {
          this.finishIterationProgress(session, runId, iteration, 'error');
          throw error;
        }
      }

      if (iteration >= maxIterations) {
        this.logger.warn('Max iterations reached after confirmation', {
          sessionId: session.state.id,
          runId,
          maxIterations,
        });
        this.emitEvent({
          type: 'agent-status',
          sessionId: session.state.id,
          status: 'error',
          message: `Maximum iterations (${maxIterations}) reached. The agent stopped to prevent an infinite loop.`,
          timestamp: Date.now(),
        });
      }

      this.completeRun(session, runId);
    } catch (error) {
      this.handleRunError(session, runId, error as Error);
    }
  }

  /**
   * Process a specific session's queue sequentially
   * CRITICAL: Ensures only one run at a time PER SESSION, but different sessions can run concurrently
   */
  private async processSessionQueue(sessionId: string): Promise<void> {
    const sessionQueueData = this.sessionQueues.get(sessionId);
    if (!sessionQueueData) {
      return;
    }

    // Prevent concurrent queue processing for THIS session
    if (sessionQueueData.isProcessing) {
      this.logger.debug('Session queue already processing, skipping', { sessionId });
      return;
    }

    sessionQueueData.isProcessing = true;
    this.logger.debug('Starting session queue processing', { 
      sessionId, 
      queueLength: sessionQueueData.queue.length 
    });

    try {
      while (sessionQueueData.queue.length > 0) {
        const { session, resolve, reject } = sessionQueueData.queue.shift()!;

        this.logger.info('Processing queued session execution', {
          sessionId,
          remainingInQueue: sessionQueueData.queue.length,
        });

        try {
          await this.runSessionExecution(session);
          resolve();
        } catch (error) {
          this.logger.error('Session execution failed', {
            sessionId,
            error: error instanceof Error ? error.message : String(error),
          });
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    } finally {
      sessionQueueData.isProcessing = false;
      this.logger.debug('Session queue processing complete', { sessionId });

      // Check if new items were added while processing
      if (sessionQueueData.queue.length > 0) {
        this.logger.debug('New items queued during processing, restarting', { 
          sessionId,
          newQueueLength: sessionQueueData.queue.length,
        });
        // Process any new items that were queued
        this.processSessionQueue(sessionId).catch(err => {
          this.logger.error('Session queue processing error in retry', { 
            sessionId,
            error: err instanceof Error ? err.message : String(err) 
          });
        });
      } else {
        // Clean up empty session queue data to prevent memory leaks
        this.sessionQueues.delete(sessionId);
        this.logger.debug('Cleaned up empty session queue', { sessionId });
      }
    }
  }

  /**
   * Execute a single session run
   * Called serially from per-session queue to prevent concurrent execution within a session
   */
  private async runSessionExecution(session: InternalSession): Promise<void> {
    const runId = randomUUID();
    const controller = new AbortController();
    this.activeControllers.set(session.state.id, controller);

    session.state.status = 'running';
    session.state.activeRunId = runId;
    session.agenticContext = this.createAgenticContext(runId);
    this.startAnalysisProgress(session, runId);

    // Initialize compliance tracking for this run
    // Extract user request from the last user message for context
    const lastUserMessage = session.state.messages.filter(m => m.role === 'user').pop();
    const userRequest = lastUserMessage?.content || '';
    this.complianceValidator.initializeRun(runId, session.state.id, userRequest);

    // Initialize loop detection for this run
    const loopDetector = getLoopDetector();
    loopDetector.initializeRun(runId, session.state.id);

    // Initialize session health monitoring
    const healthMonitor = getSessionHealthMonitor();
    const modelId = this.getEffectiveModelId(session, { name: session.state.config.preferredProvider as LLMProviderName } as LLMProvider, runId) || 'unknown';
    healthMonitor.startMonitoring(
      session.state.id,
      runId,
      session.state.config.preferredProvider as LLMProviderName || 'deepseek',
      modelId,
      session.state.config.maxIterations ?? this.defaultMaxIterations,
      this.contextManager.getMaxInputTokens()
    );

    // Update the most recent user message with this runId for proper grouping
    // This allows the UI to group user message with its corresponding assistant/tool responses
    const lastUserMessageIndex = session.state.messages.findLastIndex(m => m.role === 'user');
    if (lastUserMessageIndex !== -1) {
      session.state.messages[lastUserMessageIndex] = {
        ...session.state.messages[lastUserMessageIndex],
        runId,
      };
    }

    // Emit session state with updated user message runId before starting the run
    this.emitEvent({ type: 'session-state', session: session.state });

    // Configure summarizer based on session settings
    this.updateSummarizerForSession(session);

    // Get session-specific iteration settings
    const { maxIterations } = this.getIterationSettings(session);

    // Start debug trace for this run
    const trace = this.debugger.startTrace(session.state.id, runId);
    this.emitDebugTraceStart(trace, session.state.id, runId);

    this.emitEvent({
      type: 'run-status',
      sessionId: session.state.id,
      runId,
      status: 'running',
      timestamp: Date.now(),
    });

    try {
      // Get primary and fallback providers
      const { primary, fallback } = this.selectProvidersWithFallback(session);
      if (!primary) {
        const errorMsg = 'No available provider. Please configure at least one LLM provider with an API key in Settings.';
        this.logger.error('Run failed', {
          sessionId: session.state.id,
          runId,
          error: errorMsg,
          availableProviders: Array.from(this.providers.keys()).map(name => {
            const info = this.providers.get(name);
            return {
              name,
              hasApiKey: info?.hasApiKey ?? false,
              enabled: info?.enabled ?? false,
            };
          }),
        });

        this.emitEvent({
          type: 'agent-status',
          sessionId: session.state.id,
          status: 'error',
          message: errorMsg,
          timestamp: Date.now(),
        });

        throw new Error(errorMsg);
      }



      // Start metrics tracking for this run
      agentMetrics.startRun(
        runId,
        session.state.id,
        primary.name,
        maxIterations
      );

      // Initialize run timing for progress display
      this.initRunTiming(runId);

      let currentProvider = primary;
      let usedFallback = false;
      let iteration = 0;

      while (iteration < maxIterations && !controller.signal.aborted) {
        iteration++;

        // Safe checkpoint: wait if paused before starting iteration
        await this.waitIfPaused(session.state.id);

        // Check if cancelled while paused
        if (controller.signal.aborted) {
          break;
        }

        // Check if loop detector circuit breaker has triggered - stop execution
        const loopDetector = getLoopDetector();
        if (loopDetector.shouldTriggerCircuitBreaker(runId)) {
          this.logger.error('Stopping run due to loop detection circuit breaker', {
            sessionId: session.state.id,
            runId,
            iteration,
          });
          this.emitEvent({
            type: 'agent-status',
            sessionId: session.state.id,
            status: 'error',
            message: 'Run stopped: Agent detected in a loop. Try providing more specific instructions.',
            timestamp: Date.now(),
          });
          break;
        }

        // Check if session health monitor recommends stopping
        const healthMonitor = getSessionHealthMonitor();
        const healthCheck = healthMonitor.shouldStopRun(session.state.id);
        if (healthCheck.shouldStop) {
          this.logger.error('Stopping run due to session health issues', {
            sessionId: session.state.id,
            runId,
            iteration,
            reason: healthCheck.reason,
          });
          this.emitEvent({
            type: 'agent-status',
            sessionId: session.state.id,
            status: 'error',
            message: `Run stopped: ${healthCheck.reason}`,
            timestamp: Date.now(),
          });
          break;
        }

        // Track iteration in agentic context for resumption after confirmation
        if (session.agenticContext) {
          session.agenticContext.iteration = iteration;
        }

        // Update session health monitor with iteration progress
        healthMonitor.updateIteration(session.state.id, iteration);

        // Record iteration in metrics
        agentMetrics.recordIteration(runId);

        this.logger.debug('Starting iteration', {
          iteration,
          sessionId: session.state.id,
          runId,
          provider: currentProvider.name,
          usedFallback,
        });

        // Emit iteration status for UI progress display
        this.emitIterationStatus(session.state.id, runId, iteration, maxIterations);

        this.startIterationProgress(session, runId, iteration, currentProvider.name);

        try {
          const result = await this.runIteration(session, currentProvider, controller, runId, iteration);
          const iterationStatus = result === 'cancelled' ? 'error' : 'success';
          this.finishIterationProgress(session, runId, iteration, iterationStatus);

          if (result === 'completed' || result === 'cancelled') {
            break;
          }

          if (result === 'awaiting-confirmation') {
            // Record awaiting confirmation in metrics
            agentMetrics.recordAwaitingConfirmation(runId);
            return;
          }
        } catch (iterationError) {
          this.finishIterationProgress(session, runId, iteration, 'error');

          // If the provider failure is clearly non-recoverable (quota/billing),
          // temporarily cool it down to avoid failing every subsequent run.
          if (isQuotaOrBillingError(iterationError) && currentProvider?.name) {
            this.markProviderCooldown(currentProvider.name, 10 * 60 * 1000, (iterationError as Error).message);
          }

          // Check if fallback is enabled in settings
          const enableFallback = session.state.config.enableProviderFallback !== false;

          // Check if we should try fallback provider
          if (enableFallback && !usedFallback && fallback && shouldTryFallback(iterationError)) {
            this.logger.warn('Primary provider failed, switching to fallback', {
              sessionId: session.state.id,
              runId,
              primaryProvider: currentProvider.name,
              fallbackProvider: fallback.name,
              error: (iterationError as Error).message,
            });

            // Emit notification to UI
            this.emitEvent({
              type: 'agent-status',
              sessionId: session.state.id,
              status: 'recovering',
              message: `Switching to ${fallback.name} after ${currentProvider.name} error`,
              timestamp: Date.now(),
            });

            currentProvider = fallback;
            usedFallback = true;

            if (session.agenticContext) {
              session.agenticContext.currentProvider = fallback.name;
            }

            // Update context manager for new provider
            this.updateContextManagerForProvider(fallback.name);

            // Log new provider's token configuration
            this.logger.info('Fallback provider context configured', {
              provider: fallback.name,
              sessionId: session.state.id,
              messageCount: session.state.messages.length,
            });

            // Retry this iteration with fallback
            iteration--;
            await this.delay(500);
            continue;
          }

          // Re-throw if no fallback or already tried fallback
          // Enhance error message if fallback was already tried
          if (usedFallback) {
            const enhancedError = new Error(
              `Both providers failed. Primary: ${primary?.name || 'unknown'}, Fallback: ${fallback?.name || 'unknown'}. ` +
              `Last error: ${(iterationError as Error).message}`
            );
            throw enhancedError;
          }
          throw iterationError;
        }
      }

      if (iteration >= maxIterations) {
        this.logger.warn('Max iterations reached', { sessionId: session.state.id, runId, maxIterations });

        // CRITICAL: Handle incomplete tool call sequences before completing
        // This prevents API errors on the next request due to missing tool responses
        this.handleIncompleteToolCalls(session);

        // Check if we ended mid-task (last message is a tool result)
        const lastMessage = session.state.messages[session.state.messages.length - 1];
        const endedMidTask = lastMessage?.role === 'tool';

        // Check if there are still pending tool calls that weren't executed
        const lastAssistant = [...session.state.messages].reverse().find(m => m.role === 'assistant');
        const hasPendingTools = lastAssistant?.toolCalls && lastAssistant.toolCalls.length > 0 &&
          !session.state.messages.slice(
            session.state.messages.indexOf(lastAssistant) + 1
          ).some(m => m.role === 'tool');

        // Build an informative error message
        let errorMessage = `Maximum iterations (${maxIterations}) reached. The agent stopped to prevent an infinite loop.`;
        if (endedMidTask) {
          errorMessage += ' The task was interrupted while a tool operation was in progress.';
        }
        if (hasPendingTools) {
          errorMessage += ' Some tool calls were not executed due to the iteration limit.';
        }
        errorMessage += ' You may continue the conversation to complete the task, or adjust the max iterations setting.';

        // Update session state with messages (may have been modified by handleIncompleteToolCalls)
        this.updateSessionState(session.state.id, {
          messages: session.state.messages,
          updatedAt: Date.now(),
        });

        this.emitEvent({
          type: 'agent-status',
          sessionId: session.state.id,
          status: 'error',
          message: errorMessage,
          timestamp: Date.now(),
        });
      }

      this.completeRun(session, runId);
    } catch (error) {
      this.handleRunError(session, runId, error as Error);
    } finally {
      this.activeControllers.delete(session.state.id);
    }
  }





  private markProviderCooldown(provider: LLMProviderName, durationMs: number, reason: string): void {
    const until = Date.now() + durationMs;
    const existing = this.providerCooldownUntil.get(provider);
    if (!existing || existing.until < until) {
      this.providerCooldownUntil.set(provider, { until, reason });
      this.logger.warn('Provider temporarily unavailable (cooldown)', {
        provider,
        until,
        durationMs,
        reason,
      });
    }
  }

  /**
   * Get the effective model ID for a session
   * Session-specific selection takes priority over global provider settings
   * 
   * Priority order:
   * 1. session.manualOverrideModel (user manually typed model ID)
   * 2. session.selectedModelId (user selected from dropdown)  
   * 3. task routing decision model (per-run, if applicable)
   * 4. providerSettings.model.modelId (global provider settings)
   * 5. Provider's default model from registry (fallback)
   */
  private getEffectiveModelId(session: InternalSession, provider: LLMProvider, _runId?: string): string | undefined {
    const sessionModelId = session.state.config.manualOverrideModel || session.state.config.selectedModelId;
    if (sessionModelId) {
      // A session-level model choice may belong to a different provider.
      // This commonly happens when we auto-fallback (e.g., OpenAI -> Gemini).
      // In that case we MUST ignore the session model to avoid cross-provider "invalid model" warnings
      // and rely on the provider's configured default.
      if (modelBelongsToProvider(sessionModelId, provider.name)) {
        return sessionModelId;
      }

      this.logger.debug('Ignoring session model for mismatched provider', {
        sessionId: session.state.id,
        provider: provider.name,
        sessionModelId,
      });
    }

    const providerSettings = this.getProviderSettings(provider.name);
    const settingsModelId = providerSettings?.model?.modelId;
    
    // If provider settings has a model ID, use it
    if (settingsModelId && settingsModelId.trim()) {
      return settingsModelId;
    }
    
    // No model configured - log a warning and fall back to provider default
    // This ensures the system works but alerts users to configure their model
    const providerConfig = getProviderConfig(provider.name);
    if (providerConfig?.defaultModel) {
      this.logger.warn('No model configured in Settings - using provider default (may require credits)', {
        provider: provider.name,
        defaultModel: providerConfig.defaultModel,
        hint: 'Go to Settings > Models to select your preferred model',
      });
      return providerConfig.defaultModel;
    }
    
    return undefined;
  }

  private async runIteration(
    session: InternalSession,
    provider: LLMProvider,
    controller: AbortController,
    runId: string,
    iteration: number
  ): Promise<'completed' | 'tool-continue' | 'awaiting-confirmation' | 'cancelled'> {
    if (controller.signal.aborted) {
      return 'cancelled';
    }

    if (session.agenticContext) {
      session.agenticContext.currentProvider = provider.name;
    }

    // Get effective model ID for this session (used for both message and request)
    const modelId = this.getEffectiveModelId(session, provider, runId);

    let assistantMessage: ChatMessage;

    // Find an existing assistant message from this run that doesn't have tool calls
    // (messages with tool calls represent completed tool-calling turns)
    const existingRunMessage = session.state.messages.find(
      (m) => m.role === 'assistant' && m.runId === runId && !m.toolCalls?.length
    );

    // Reuse existing message on subsequent iterations if available
    if (existingRunMessage && iteration > 1) {
      assistantMessage = existingRunMessage;
      if (assistantMessage.content && assistantMessage.content.trim()) {
        assistantMessage.content += '\n\n';
      }
      // Update model ID in case it changed
      if (modelId) {
        assistantMessage.modelId = modelId;
      }
    } else {
      // Create new message for first iteration or after tool calls completed
      assistantMessage = {
        id: randomUUID(),
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        provider: provider.name,
        modelId, // Include the specific model ID being used
        runId,
        // Initialize thinking field for thinking models
        thinking: undefined,
      };
    }

    const toolCalls: ToolCallPayload[] = [];
    let _streamedContentLength = 0;
    let initialSessionStateSent = false;

    // Track if we're currently receiving thinking content
    let isReceivingThinking = false;

    // Repetition detection state - detects when LLM gets stuck in a loop
    // This is a common issue with some models (especially DeepSeek) where they
    // repeat the same phrase multiple times
    const streamState = {
      recentChunks: [] as string[],
      repetitionDetected: false,
    };
    const MAX_RECENT_CHUNKS = 20;
    const REPETITION_THRESHOLD = 3; // Same phrase 3+ times = stuck

    /**
     * Detect if the LLM is generating repetitive content
     * Returns true if the same phrase appears multiple times consecutively
     */
    const detectRepetition = (content: string): boolean => {
      if (content.length < 100) return false; // Too short to detect
      
      // Look for repeated phrases in the last ~500 chars
      const checkWindow = content.slice(-500);
      
      // Common repetition patterns: same sentence repeated
      const sentences = checkWindow.split(/[.!?:]\s+/).filter(s => s.length > 15);
      if (sentences.length >= REPETITION_THRESHOLD) {
        const lastSentences = sentences.slice(-REPETITION_THRESHOLD);
        const firstSentence = lastSentences[0].trim().toLowerCase();
        const allSame = lastSentences.every(s => 
          s.trim().toLowerCase() === firstSentence ||
          s.trim().toLowerCase().startsWith(firstSentence.slice(0, 30))
        );
        if (allSame && firstSentence.length > 20) {
          return true;
        }
      }
      
      // Check for repeated chunks in recent history
      if (streamState.recentChunks.length >= REPETITION_THRESHOLD) {
        const lastChunks = streamState.recentChunks.slice(-REPETITION_THRESHOLD);
        const normalized = lastChunks.map(c => c.trim().toLowerCase());
        const allSameChunks = normalized.every(c => c === normalized[0] && c.length > 10);
        if (allSameChunks) {
          return true;
        }
      }
      
      return false;
    };

    /**
     * Handle streaming output from the provider
     * @param chunk - The content chunk to append
     * @param isThinking - Whether this is thinking/reasoning content (from thinking models)
     * @param storeAsReasoningContent - Also store in reasoningContent for API passback (DeepSeek tool calls)
     */
    const onStreamOutput = (chunk: string, isThinking = false, storeAsReasoningContent = false) => {
      // Guard against undefined/null chunks - skip if chunk is not a valid string
      if (typeof chunk !== 'string') {
        return;
      }

      // Skip if repetition already detected
      if (streamState.repetitionDetected) {
        return;
      }

      // Track chunks for repetition detection (only for non-thinking content)
      if (!isThinking && chunk.length > 5) {
        streamState.recentChunks.push(chunk);
        if (streamState.recentChunks.length > MAX_RECENT_CHUNKS) {
          streamState.recentChunks.shift();
        }
      }

      // Capture content before append to avoid duplication in initial session state
      const contentBeforeAppend = assistantMessage.content;
      const thinkingBeforeAppend = assistantMessage.thinking;

      if (isThinking) {
        // Append to thinking content (for UI display in Reasoning panel)
        assistantMessage.thinking = (assistantMessage.thinking || '') + chunk;
        assistantMessage.isThinkingStreaming = true;
        isReceivingThinking = true;

        // If storeAsReasoningContent is set, also store in reasoningContent for API passback
        // This is used by DeepSeek - reasoning_content must be passed back during tool call loops
        // @see https://api-docs.deepseek.com/guides/thinking_mode#tool-calls
        if (storeAsReasoningContent) {
          assistantMessage.reasoningContent = (assistantMessage.reasoningContent || '') + chunk;
        }
      } else {
        // Regular content - if we were receiving thinking, mark it as done
        if (isReceivingThinking) {
          assistantMessage.isThinkingStreaming = false;
          isReceivingThinking = false;
        }
        // Ensure content is always a string to prevent "undefined" concatenation
        assistantMessage.content = (assistantMessage.content || '') + chunk;
        _streamedContentLength += chunk.length;

        // Check for repetition in non-thinking content
        if (_streamedContentLength > 200) {
          if (detectRepetition(assistantMessage.content || '')) {
            streamState.repetitionDetected = true;
            this.logger.warn('Repetition detected in LLM output, truncating response', {
              sessionId: session.state.id,
              runId,
              contentLength: _streamedContentLength,
              preview: (assistantMessage.content || '').slice(-200),
            });
            // Append a note about the repetition
            assistantMessage.content += '\n\n[Response truncated due to repetitive content. Please try rephrasing your request.]';
          }
        }
      }

      // Add the assistant message to session state if not already there
      if (!session.state.messages.includes(assistantMessage)) {
        session.state.messages.push(assistantMessage);
      }

      // CRITICAL: Send session-state BEFORE the first stream-delta
      // so the renderer has the assistant message to append content to
      if (!initialSessionStateSent) {
        initialSessionStateSent = true;

        // Create a copy of session state with the message content BEFORE this chunk
        // This prevents double-rendering of the first chunk (once in session-state, once in delta)
        // The frontend will receive the empty message first, then append the delta
        const sessionStateForEvent = {
          ...session.state,
          messages: session.state.messages.map(m =>
            m.id === assistantMessage.id
              ? { ...m, content: contentBeforeAppend, thinking: thinkingBeforeAppend }
              : m
          )
        };

        this.safeUpdateSessionState(session.state.id, {
          messages: session.state.messages,
          updatedAt: Date.now(),
        });
        this.emitEvent({ type: 'session-state', session: sessionStateForEvent });
      }

      // Emit appropriate event based on content type
      if (isThinking) {
        // Emit thinking delta event for UI to handle separately
        this.logger.debug('[THINKING_STREAM] Emitting thinking delta', {
          sessionId: session.state.id,
          deltaLength: chunk.length,
          preview: chunk.slice(0, 50),
        });
        this.emitEvent({
          type: 'stream-delta',
          sessionId: session.state.id,
          runId,
          delta: chunk,
          provider: provider.name,
          modelId: assistantMessage.modelId, // Include model ID for UI visibility
          messageId: assistantMessage.id,
          timestamp: Date.now(),
          isThinking: true, // Flag for UI to differentiate thinking content
        } as StreamDeltaEvent);
      } else {
        this.emitEvent({
          type: 'stream-delta',
          sessionId: session.state.id,
          runId,
          delta: chunk,
          provider: provider.name,
          modelId: assistantMessage.modelId, // Include model ID for UI visibility
          messageId: assistantMessage.id,
          timestamp: Date.now(),
        } as StreamDeltaEvent);
      }
    };

    const onToolCall = (toolCall: ToolCallPayload) => {
      toolCalls.push(toolCall);
    };

    const onToolCallDelta = (toolCall: NonNullable<ProviderResponseChunk['toolCall']>) => {
      this.emitEvent({
        type: 'stream-delta',
        sessionId: session.state.id,
        runId,
        provider: provider.name,
        modelId: assistantMessage.modelId, // Include model ID for UI visibility
        messageId: assistantMessage.id,
        timestamp: Date.now(),
        toolCall,
      } as StreamDeltaEvent);
    };

    /**
     * Handle media output from multimodal models (Gemini image/audio generation)
     * This callback ensures the assistant message is properly created and associated
     * with the generated media before emitting the event.
     */
    const onMediaOutput = (mediaType: 'image' | 'audio', data: string, mimeType: string) => {
      this.logger.debug('Processing media output', {
        mediaType,
        mimeType,
        dataLength: data.length,
        assistantMessageId: assistantMessage.id,
        isMessageInState: session.state.messages.includes(assistantMessage),
      });

      // Ensure assistant message is in session state
      if (!session.state.messages.includes(assistantMessage)) {
        session.state.messages.push(assistantMessage);
        this.logger.debug('Added assistant message to session state for media', {
          messageId: assistantMessage.id,
          sessionId: session.state.id,
        });
      }

      // Add media to the assistant message
      if (mediaType === 'image') {
        if (!assistantMessage.generatedImages) {
          assistantMessage.generatedImages = [];
        }
        assistantMessage.generatedImages.push({ data, mimeType });
        this.logger.debug('Added generated image to assistant message', {
          messageId: assistantMessage.id,
          imageCount: assistantMessage.generatedImages.length,
          mimeType,
        });
      } else if (mediaType === 'audio') {
        assistantMessage.generatedAudio = { data, mimeType };
        this.logger.debug('Added generated audio to assistant message', {
          messageId: assistantMessage.id,
          mimeType,
        });
      }

      // Send session state update to ensure frontend has the message
      if (!initialSessionStateSent) {
        initialSessionStateSent = true;
        this.safeUpdateSessionState(session.state.id, {
          messages: session.state.messages,
          updatedAt: Date.now(),
        });
        this.emitEvent({ type: 'session-state', session: session.state });
        this.logger.debug('Sent initial session state with media', {
          sessionId: session.state.id,
          messageId: assistantMessage.id,
        });
      }

      // Emit media-output event with correct messageId
      this.emitEvent({
        type: 'media-output',
        sessionId: session.state.id,
        runId,
        mediaType,
        data,
        mimeType,
        messageId: assistantMessage.id,
        provider: provider.name,
        timestamp: Date.now(),
      });
      this.logger.debug('Emitted media-output event', {
        sessionId: session.state.id,
        messageId: assistantMessage.id,
        mediaType,
        mimeType,
      });
    };

    const result = await this.runWithRetry(
      provider,
      session,
      controller,
      runId,
      iteration,
      onStreamOutput,
      onToolCall,
      onToolCallDelta,
      onMediaOutput,
      (internal) => {
        if (provider.name !== 'openai') return;
        const items = internal.openai?.reasoningItems;
        if (!items || items.length === 0) return;

        const existing = assistantMessage.providerInternal?.openai?.reasoningItems ?? [];
        const byId = new Map<string, Record<string, unknown>>();

        for (const it of existing) {
          const id = typeof (it as { id?: unknown }).id === 'string' ? (it as { id: string }).id : JSON.stringify(it);
          byId.set(id, it);
        }
        for (const it of items) {
          const id = typeof (it as { id?: unknown }).id === 'string' ? (it as { id: string }).id : JSON.stringify(it);
          byId.set(id, it);
        }

        assistantMessage.providerInternal = {
          ...(assistantMessage.providerInternal ?? {}),
          openai: {
            ...(assistantMessage.providerInternal?.openai ?? {}),
            reasoningItems: Array.from(byId.values()),
          },
        };
      },
    );

    // Attach token usage to the assistant message if available
    if (result.usage && (result.usage.input > 0 || result.usage.output > 0)) {
      assistantMessage.usage = result.usage;
      this.logger.info('Attached usage to assistant message', {
        messageId: assistantMessage.id,
        input: result.usage.input,
        output: result.usage.output,
        total: result.usage.total,
      });

      // Update session health monitor with token usage
      const healthMonitor = getSessionHealthMonitor();
      healthMonitor.updateTokenUsage(session.state.id, result.usage);
    } else {
      this.logger.warn('No usage data to attach to assistant message', {
        messageId: assistantMessage.id,
        hasUsage: !!result.usage,
        input: result.usage?.input,
        output: result.usage?.output,
      });
    }

    // Only add the assistant message if it has content, tool calls, or generated media
    // This prevents empty messages from cluttering the conversation
    const hasContent = assistantMessage.content && assistantMessage.content.trim().length > 0;
    const hasToolCalls = toolCalls.length > 0;
    const hasGeneratedMedia = (assistantMessage.generatedImages && assistantMessage.generatedImages.length > 0) ||
      !!assistantMessage.generatedAudio;

    if (hasContent || hasToolCalls || hasGeneratedMedia) {
      // Mark thinking as done - the model has finished its response
      assistantMessage.isThinkingStreaming = false;

      if (!session.state.messages.includes(assistantMessage)) {
        session.state.messages.push(assistantMessage);
      }

      if (hasToolCalls) {
        assistantMessage.toolCalls = toolCalls;
        // Mark thinking as done when we have tool calls
        assistantMessage.isThinkingStreaming = false;
      }
    } else {
      // Remove empty message if it was already added during streaming
      const emptyMsgIndex = session.state.messages.indexOf(assistantMessage);
      if (emptyMsgIndex !== -1) {
        session.state.messages.splice(emptyMsgIndex, 1);
        this.logger.debug('Removed empty assistant message', {
          sessionId: session.state.id,
          runId,
          iteration,
          messageId: assistantMessage.id,
        });
      }
    }

    this.updateSessionState(session.state.id, {
      messages: session.state.messages,
      updatedAt: Date.now(),
    });

    // Debug: Log usage data before emitting session-state
    const messagesWithUsage = session.state.messages.filter(m => m.usage);
    this.logger.debug('Emitting session-state after iteration', {
      sessionId: session.state.id,
      totalMessages: session.state.messages.length,
      messagesWithUsage: messagesWithUsage.length,
      assistantMessageHasUsage: !!assistantMessage.usage,
      assistantMessageUsage: assistantMessage.usage,
    });

    this.emitEvent({ type: 'session-state', session: session.state });

    if (result.result === 'completed') {
      return 'completed';
    }

    if (result.result === 'tool-continue' && toolCalls.length > 0) {
      session.toolQueue = [...toolCalls];
      return await this.processToolQueue(session);
    }

    return 'completed';
  }

  private async runWithRetry(
    provider: LLMProvider,
    session: InternalSession,
    controller: AbortController,
    runId: string,
    iteration: number,
    onStreamOutput: (chunk: string, isThinking?: boolean, alsoStoreAsThinking?: boolean) => void,
    onToolCall: (toolCall: ToolCallPayload) => void,
    onToolCallDelta?: (toolCall: NonNullable<ProviderResponseChunk['toolCall']>) => void,
    onMediaOutput?: (mediaType: 'image' | 'audio', data: string, mimeType: string) => void,
    onProviderInternal?: (internal: NonNullable<ProviderResponseChunk['providerInternal']>) => void,
  ): Promise<{ result: 'completed' | 'tool-continue' | 'error'; usage?: TokenUsage }> {
    let lastError: Error | null = null;
    let attempt = 0;

    // Get session-specific retry settings
    const { maxRetries, retryDelayMs } = this.getIterationSettings(session);

    while (attempt < maxRetries) {
      attempt++;

      if (controller.signal.aborted) {
        return { result: 'completed' };
      }

      try {
        const request = await this.buildProviderRequest(session, provider);

        // Add abort signal to request
        request.signal = controller.signal;

        this.logger.debug('Sending provider request', {
          provider: provider.name,
          runId,
          iteration,
          attempt,
          messageCount: request.messages.length,
          toolCount: request.tools?.length ?? 0,
        });

        const toolCalls: ToolCallPayload[] = [];
        const pendingToolCalls = new Map<number, ToolCallPayload>();

        // Track streamed content for logging (since assistantMessage is in parent scope)
        let streamedContent = '';

        // Track thinking content from thinking models (Gemini 2.5/3)
        // Note: Content is appended via onStreamOutput callback
        let _streamedThinking = '';
        // Note: Signature is captured directly on tool call objects
        let _lastThoughtSignature: string | undefined;

        // Track token usage from stream
        let streamInputTokens = 0;
        let streamOutputTokens = 0;

        // Use streaming API
        const stream = provider.stream(request);

        for await (const chunk of stream) {
          // Check for abort
          if (controller.signal.aborted) {
            break;
          }

          // Provider-internal metadata (never emit to UI)
          if (chunk.providerInternal && onProviderInternal) {
            onProviderInternal(chunk.providerInternal);
          }

          // Handle thinking delta (from thinking/reasoning models: Gemini 2.5/3, OpenAI GPT-5.x/o-series, DeepSeek)
          // @see https://ai.google.dev/gemini-api/docs/thinking
          // @see https://platform.openai.com/docs/guides/reasoning#reasoning-summaries
          // @see https://api-docs.deepseek.com/guides/thinking_mode
          if (chunk.thinkingDelta) {
            _streamedThinking += chunk.thinkingDelta;
            // Emit thinking event for UI display
            // Pass storeAsThinking to also store in reasoningContent for API passback (DeepSeek)
            onStreamOutput(chunk.thinkingDelta, true, chunk.storeAsThinking); // true = isThinking
          }

          // Capture thought signatures for maintaining reasoning context
          if (chunk.thoughtSignature) {
            _lastThoughtSignature = chunk.thoughtSignature;
          }

          // Handle text delta
          if (chunk.delta) {
            streamedContent += chunk.delta;
            // Pass storeAsThinking flag to also store in thinking field for API requirements
            onStreamOutput(chunk.delta, false, chunk.storeAsThinking);

            // Track thinking content length for logging
            if (chunk.storeAsThinking) {
              _streamedThinking += chunk.delta;
            }
          }

          // Handle usage updates from stream (Anthropic sends input at start, output at end)
          if (chunk.usage) {
            if (chunk.usage.input > 0) {
              streamInputTokens = chunk.usage.input;
            }
            if (chunk.usage.output > 0) {
              streamOutputTokens = chunk.usage.output;
            }
            this.logger.debug('Received usage from stream', {
              chunkInput: chunk.usage.input,
              chunkOutput: chunk.usage.output,
              accumulatedInput: streamInputTokens,
              accumulatedOutput: streamOutputTokens,
            });
          }

          // Handle generated image from multimodal models (Gemini image generation)
          // @see https://ai.google.dev/gemini-api/docs/image-generation
          if (chunk.image) {
            this.logger.debug('Received generated image in stream', {
              mimeType: chunk.image.mimeType,
              dataLength: chunk.image.data.length,
            });
            // Use callback if provided (allows parent scope to use correct messageId)
            if (onMediaOutput) {
              onMediaOutput('image', chunk.image.data, chunk.image.mimeType);
            }
          }

          // Handle generated audio from TTS models (Gemini TTS)
          // @see https://ai.google.dev/gemini-api/docs/speech-generation
          if (chunk.audio) {
            this.logger.debug('Received generated audio in stream', {
              mimeType: chunk.audio.mimeType,
              dataLength: chunk.audio.data.length,
            });
            // Use callback if provided (allows parent scope to use correct messageId)
            if (onMediaOutput) {
              onMediaOutput('audio', chunk.audio.data, chunk.audio.mimeType);
            }
          }

          // Handle tool call chunks with thoughtSignature support
          // Gemini 3 Pro sends thoughtSignature on the first function call
          // @see https://ai.google.dev/gemini-api/docs/thought-signatures
          if (chunk.toolCall) {
            const { index, callId, name, argsJson, argsComplete, thoughtSignature } = chunk.toolCall;

            if (!pendingToolCalls.has(index)) {
              pendingToolCalls.set(index, {
                name: name || '',
                arguments: {},
                callId: callId,
              });
            }

            const pending = pendingToolCalls.get(index)!;

            if (name) {
              pending.name = name;
            }
            if (callId) {
              pending.callId = callId;
            }
            if (argsJson) {
              const pendingWithJson = pending as { _argsJson?: string; _argsIsComplete?: boolean };

              if (argsComplete) {
                // Complete args - replace any accumulated deltas
                pendingWithJson._argsJson = argsJson;
                pendingWithJson._argsIsComplete = true;
              } else {
                // Delta mode - check if we already have complete args
                // If we do, receiving a delta likely means we should start fresh
                // (some providers send complete args followed by the same as deltas)
                const existingJson = pendingWithJson._argsJson || '';
                const wasComplete = pendingWithJson._argsIsComplete;

                if (wasComplete && existingJson) {
                  // We already have complete args - don't append deltas
                  // This prevents {complete}{delta}{delta} concatenation issues
                  this.logger.debug('Ignoring delta after complete args', {
                    existingLength: existingJson.length,
                    deltaLength: argsJson.length,
                  });
                } else {
                  // Accumulate deltas normally
                  pendingWithJson._argsJson = existingJson + argsJson;
                }
              }
            }
            // Capture thoughtSignature from Gemini responses
            if (thoughtSignature) {
              pending.thoughtSignature = thoughtSignature;
            }

            // Emit tool call delta to UI
            if (onToolCallDelta) {
              onToolCallDelta(chunk.toolCall);
            }
          }
        }

        // Process completed tool calls
        for (const [index, pending] of pendingToolCalls) {
          if (pending.name) {
            // Parse accumulated JSON args using robust parser with recovery
            const pendingWithJson = pending as { _argsJson?: string; _argsIsComplete?: boolean };
            const argsJson = pendingWithJson._argsJson;
            if (argsJson) {
              // Use robust parser that handles streaming artifacts like concatenated JSON
              pending.arguments = parseToolArguments(argsJson, pending.name);
            }
            // Clean up temporary properties
            delete pendingWithJson._argsJson;
            delete pendingWithJson._argsIsComplete;

            // Ensure callId is always set - generate one if missing
            if (!pending.callId) {
              pending.callId = `call_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
              this.logger.debug('Generated fallback callId for tool', {
                tool: pending.name,
                callId: pending.callId,
                index,
              });
            }

            toolCalls.push(pending);
            onToolCall(pending);
          }
        }

        if (toolCalls.length > 0) {
          this.logger.debug('Iteration completed with tool calls', {
            toolCount: toolCalls.length,
            tools: toolCalls.map(t => t.name),
            inputTokens: streamInputTokens,
            outputTokens: streamOutputTokens,
            thinkingLength: _streamedThinking.length,
            lastThoughtSignature: _lastThoughtSignature,
          });

          // Record successful provider call in metrics
          agentMetrics.recordProviderCall(runId, true, attempt > 1);

          // Emit debug LLM call event with actual token counts from stream
          const iterationDuration = Date.now() - (this.iterationTimers.get(`${runId}-${iteration}`) || Date.now());
          const activeTraceForLLM = this.debugger.getActiveTrace();
          if (activeTraceForLLM) {
            this.emitDebugLLMCall(
              activeTraceForLLM.traceId,
              session.state.id,
              runId,
              activeTraceForLLM.metrics.totalSteps + 1,
              provider.name as LLMProviderName,
              request.config.model || provider.name,
              streamInputTokens,
              streamOutputTokens,
              iterationDuration,
              request.messages.length,
              request.tools?.length ?? 0,
              undefined,
              toolCalls.length > 0,
              streamedContent.slice(0, 200)
            );
          }

          return { result: 'tool-continue', usage: { input: streamInputTokens, output: streamOutputTokens, total: streamInputTokens + streamOutputTokens } };
        }

        // Log detailed info when completing without tool calls
        // This helps diagnose why the agent stopped
        this.logger.info('Iteration completed without tool calls - agent finished', {
          contentLength: streamedContent.length,
          pendingToolCallsCount: pendingToolCalls.size,
          contentPreview: streamedContent.slice(0, 200),
          inputTokens: streamInputTokens,
          outputTokens: streamOutputTokens,
          thinkingLength: _streamedThinking.length,
          lastThoughtSignature: _lastThoughtSignature,
        });

        // Record successful provider call in metrics
        agentMetrics.recordProviderCall(runId, true, attempt > 1);

        // Emit debug LLM call event for completion with actual token counts
        const completeDuration = Date.now() - (this.iterationTimers.get(`${runId}-${iteration}`) || Date.now());
        const activeTraceForComplete = this.debugger.getActiveTrace();
        if (activeTraceForComplete) {
          this.emitDebugLLMCall(
            activeTraceForComplete.traceId,
            session.state.id,
            runId,
            activeTraceForComplete.metrics.totalSteps + 1,
            provider.name as LLMProviderName,
            request.config.model || provider.name,
            streamInputTokens,
            streamOutputTokens,
            completeDuration,
            request.messages.length,
            request.tools?.length ?? 0,
            'stop',
            false,
            streamedContent.slice(0, 200)
          );
        }

        return { result: 'completed', usage: { input: streamInputTokens, output: streamOutputTokens, total: streamInputTokens + streamOutputTokens } };

      } catch (error) {
        lastError = error as Error;

        if (controller.signal.aborted) {
          return { result: 'completed' };
        }

        // Handle context overflow with emergency pruning
        if (isContextOverflowError(error) && attempt <= 2) {
          this.logger.warn('Context overflow detected, applying emergency pruning', {
            provider: provider.name,
            runId,
            attempt,
            error: (error as Error).message,
          });

          // Apply emergency pruning to session messages
          const pruningResult = this.contextManager.emergencyPrune(
            session.state.messages,
            undefined, // System prompt handled separately
            undefined, // Tools handled separately
            15 // Keep only last 15 messages in emergency
          );

          session.state.messages = pruningResult.messages;
          this.updateSessionState(session.state.id, {
            messages: session.state.messages,
            updatedAt: Date.now(),
          });

          this.logger.info('Emergency pruning completed', {
            sessionId: session.state.id,
            removedMessages: pruningResult.removedCount,
            tokensFreed: pruningResult.tokensFreed,
            remainingMessages: pruningResult.messages.length,
          });

          // Emit notification to UI
          this.emitEvent({
            type: 'agent-status',
            sessionId: session.state.id,
            status: 'recovering',
            message: `Context overflow - pruned ${pruningResult.removedCount} older messages and retrying`,
            timestamp: Date.now(),
          });

          // Brief delay before retry
          await this.delay(500);
          continue;
        }

        // Handle maxOutputTokens being too high for available credits/quota
        // This is different from context overflow - we need to reduce output tokens, not prune input
        if (isMaxOutputTokensError(error) && attempt <= 2) {
          // Extract the affordable tokens from error message if possible
          const errorMsg = (error as Error).message;
          const affordMatch = errorMsg.match(/can only afford (\d+)/i);
          const affordableTokens = affordMatch ? parseInt(affordMatch[1], 10) : null;
          
          // Calculate reduced maxOutputTokens (use affordable amount or halve current)
          const currentMax = session.agenticContext?.maxOutputTokens ?? 8192;
          const reducedMax = affordableTokens 
            ? Math.min(affordableTokens - 100, Math.floor(currentMax * 0.3)) // Leave 100 token buffer
            : Math.floor(currentMax * 0.3); // Reduce to 30% if we can't parse
          
          const newMaxOutputTokens = Math.max(512, reducedMax); // Minimum 512 tokens
          
          this.logger.warn('MaxOutputTokens too high for available credits, reducing', {
            provider: provider.name,
            runId,
            attempt,
            currentMax,
            affordableTokens,
            newMaxOutputTokens,
            error: errorMsg,
          });

          // Store reduced maxOutputTokens in agentic context for this run
          if (session.agenticContext) {
            session.agenticContext.maxOutputTokens = newMaxOutputTokens;
          }

          // Emit notification to UI
          this.emitEvent({
            type: 'agent-status',
            sessionId: session.state.id,
            status: 'recovering',
            message: `Reducing output tokens from ${currentMax} to ${newMaxOutputTokens} due to credit limits`,
            timestamp: Date.now(),
          });

          // Brief delay before retry
          await this.delay(500);
          continue;
        }

        if (isRateLimitError(error)) {
          // Use exponential backoff with jitter for rate limits
          const baseDelay = retryDelayMs * Math.pow(2, attempt - 1); // 1s, 2s, 4s
          const jitter = Math.random() * 1000; // Add up to 1s of jitter
          const retryAfter = this.extractRetryAfter(error); // Check for Retry-After header
          const delay = retryAfter ? retryAfter * 1000 : baseDelay + jitter;

          this.logger.warn('Rate limited, retrying with backoff', {
            provider: provider.name,
            runId,
            attempt,
            delay: Math.round(delay),
            retryAfterHeader: retryAfter,
          });

          // Emit notification so user knows why there's a pause
          this.emitEvent({
            type: 'agent-status',
            sessionId: session.state.id,
            status: 'recovering',
            message: `Rate limited - waiting ${Math.round(delay / 1000)}s before retry`,
            timestamp: Date.now(),
          });

          await this.delay(delay);
          continue;
        }

        if (this.isTransientError(error) && attempt < maxRetries) {
          // Transient errors also use backoff with jitter
          const baseDelay = retryDelayMs * Math.pow(1.5, attempt - 1); // Gentler curve
          const jitter = Math.random() * 500;
          const delay = baseDelay + jitter;

          this.logger.warn('Transient error, retrying', {
            provider: provider.name,
            runId,
            attempt,
            delay: Math.round(delay),
            error: (error as Error).message,
          });
          await this.delay(delay);
          continue;
        }

        // Record failed provider call in metrics (non-recoverable error)
        agentMetrics.recordProviderCall(runId, false, attempt > 1);

        throw error;
      }
    }

    throw lastError ?? new Error('All retry attempts failed');
  }

  /**
   * Extract Retry-After value from rate limit error (if present)
   */
  private extractRetryAfter(error: unknown): number | null {
    if (error instanceof Error) {
      // Look for Retry-After in error message (some providers include it)
      const retryMatch = error.message.match(/retry.?after[:\s]+(\d+)/i);
      if (retryMatch) {
        return parseInt(retryMatch[1], 10);
      }

      // Look for seconds pattern
      const secondsMatch = error.message.match(/(\d+)\s*seconds?/i);
      if (secondsMatch) {
        return parseInt(secondsMatch[1], 10);
      }
    }
    return null;
  }



  private isTransientError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('timeout') ||
        message.includes('econnreset') ||
        message.includes('econnrefused') ||
        message.includes('socket hang up') ||
        message.includes('network') ||
        message.includes('502') ||
        message.includes('503') ||
        message.includes('504')
      );
    }
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async processToolQueue(session: InternalSession): Promise<'completed' | 'tool-continue' | 'awaiting-confirmation'> {
    const runId = session.state.activeRunId;
    if (!runId) {
      this.logger.warn('No active run for tool queue processing', { sessionId: session.state.id });
      return 'completed';
    }

    // Get abort signal for early exit checks
    const controller = this.activeControllers.get(session.state.id);

    // Check if parallel execution is enabled (default: true)
    const parallelEnabled = true;

    while (session.toolQueue && session.toolQueue.length > 0) {
      // Check for abort before processing
      if (controller?.signal.aborted) {
        this.logger.info('Tool queue processing cancelled', {
          sessionId: session.state.id,
          remainingTools: session.toolQueue.length
        });
        session.toolQueue = [];
        return 'completed';
      }

      // Separate tools into: disabled, requiring approval, and executable
      const executableTools: ToolCallPayload[] = [];
      const toolsNeedingApproval: ToolCallPayload[] = [];

      // Process queue to categorize tools
      while (session.toolQueue.length > 0) {
        const tool = session.toolQueue[0];

        // Check if approval is required
        const toolRequiresApproval = this.toolRegistry.requiresApproval(tool.name);
        const requiresApproval = !session.state.config.yoloMode && toolRequiresApproval;

        if (requiresApproval) {
          // Stop collecting - we need to handle approval first
          toolsNeedingApproval.push(session.toolQueue.shift()!);
          break;
        }

        // Tool can be executed without approval
        executableTools.push(session.toolQueue.shift()!);
      }

      // Handle tool requiring approval first (blocks further execution)
      if (toolsNeedingApproval.length > 0) {
        const tool = toolsNeedingApproval[0];
        const progressId = this.ensureToolProgressId(tool);
        
        this.emitRunProgressItem(session, runId, {
          id: progressId,
          type: 'tool-call',
          label: tool.name,
          detail: this.describeToolTarget(tool),
          status: 'pending',
          timestamp: Date.now(),
        });

        session.pendingTool = { tool, runId };
        session.state.status = 'awaiting-confirmation';
        session.state.activeRunId = undefined;

        this.emitEvent({ type: 'session-state', session: session.state });
        this.emitEvent({
          type: 'tool-call',
          sessionId: session.state.id,
          runId,
          toolCall: tool,
          requiresApproval: true,
          timestamp: Date.now(),
        });
        this.emitEvent({
          type: 'run-status',
          sessionId: session.state.id,
          runId,
          status: 'awaiting-confirmation',
          timestamp: Date.now(),
        });

        return 'awaiting-confirmation';
      }

      // Execute tools - use parallel execution if beneficial
      if (executableTools.length > 0) {
        if (parallelEnabled && executableTools.length >= 2 && canBenefitFromParallel(executableTools)) {
          // Execute tools in parallel
          await this.executeToolsInParallel(session, executableTools, runId, controller?.signal);
        } else {
          // Execute tools sequentially
          for (const tool of executableTools) {
            if (controller?.signal.aborted) break;
            await this.executeTool(session, tool, runId);
          }
        }
      }
    }

    return 'tool-continue';
  }

  /**
   * Execute multiple tools in parallel using the ParallelExecutor.
   * Respects dependencies between tools and uses semaphore for concurrency control.
   */
  private async executeToolsInParallel(
    session: InternalSession,
    tools: ToolCallPayload[],
    runId: string,
    signal?: AbortSignal,
    config: ParallelExecutionConfig = DEFAULT_PARALLEL_CONFIG
  ): Promise<void> {
    const startTime = Date.now();
    
    this.logger.info('Starting parallel tool execution', {
      sessionId: session.state.id,
      runId,
      toolCount: tools.length,
      tools: tools.map(t => t.name),
      maxConcurrency: config.maxConcurrency,
    });

    // Emit progress for all tools starting
    for (const tool of tools) {
      const progressId = this.ensureToolProgressId(tool);
      this.emitRunProgressItem(session, runId, {
        id: progressId,
        type: 'tool-call',
        label: tool.name,
        detail: this.describeToolTarget(tool),
        status: 'running',
        timestamp: Date.now(),
        metadata: { callId: tool.callId, parallel: true },
      });
    }

    // Execute tools in parallel
    const result = await executeToolsParallel(
      tools,
      async (tool) => {
        // Create a minimal result wrapper for the parallel executor
        const toolResult = await this.executeToolAndGetResult(session, tool, runId);
        return toolResult;
      },
      config,
      signal
    );

    const duration = Date.now() - startTime;

    this.logger.info('Parallel tool execution completed', {
      sessionId: session.state.id,
      runId,
      totalDurationMs: result.totalDurationMs,
      wallClockDurationMs: duration,
      timeSavedMs: result.timeSavedMs,
      wasParallel: result.wasParallel,
      succeeded: result.succeeded.length,
      failed: result.failed.length,
    });

    // Emit parallel execution summary event
    if (result.wasParallel && result.timeSavedMs > 0) {
      this.emitEvent({
        type: 'agent-status',
        sessionId: session.state.id,
        status: 'executing',
        message: `Parallel execution saved ${Math.round(result.timeSavedMs / 1000)}s`,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Execute a single tool and return the result (for parallel execution).
   * This is a wrapper around executeTool that returns the result.
   */
  private async executeToolAndGetResult(
    session: InternalSession,
    tool: ToolCallPayload,
    runId: string
  ): Promise<import('../tools/types').EnhancedToolResult> {
    const startTime = Date.now();
    
    try {
      await this.executeTool(session, tool, runId);
      
      // Find the tool result message that was just added
      const toolMessage = session.state.messages
        .filter(m => m.role === 'tool' && m.toolCallId === tool.callId)
        .pop();
      
      return {
        toolName: tool.name,
        success: toolMessage?.toolSuccess ?? true,
        output: toolMessage?.content ?? '',
        timing: {
          startedAt: startTime,
          completedAt: Date.now(),
          durationMs: Date.now() - startTime,
        },
      };
    } catch (error) {
      return {
        toolName: tool.name,
        success: false,
        output: error instanceof Error ? error.message : String(error),
        timing: {
          startedAt: startTime,
          completedAt: Date.now(),
          durationMs: Date.now() - startTime,
        },
      };
    }
  }

  async executeTool(session: InternalSession, tool: ToolCallPayload, runId: string): Promise<void> {
    // Get abort signal for this session - enables cancellation of tool execution
    const controller = this.activeControllers.get(session.state.id);
    const signal = controller?.signal;

    // Check if already aborted before starting
    if (signal?.aborted) {
      this.logger.info('Tool execution skipped - run cancelled', { tool: tool.name, sessionId: session.state.id });
      return;
    }

    if (!tool.name || typeof tool.name !== 'string') {
      this.logger.error('Invalid tool call: missing or invalid tool name', {
        tool,
        sessionId: session.state.id,
        runId
      });

      const errorMessage: ChatMessage = {
        id: randomUUID(),
        role: 'tool',
        content: 'Error: Invalid tool call - missing tool name',
        toolCallId: tool.callId,
        toolName: 'unknown',
        createdAt: Date.now(),
        runId, // Include runId for proper message grouping
      };
      session.state.messages.push(errorMessage);
      this.updateSessionState(session.state.id, {
        messages: session.state.messages,
        updatedAt: Date.now(),
      });
      return;
    }

    // Loop detection - check for repetitive tool calls
    const loopDetector = getLoopDetector();
    const iteration = session.agenticContext?.iteration || 1;
    const loopResult = loopDetector.recordToolCall(runId, tool, iteration);
    
    if (loopResult.loopDetected) {
      // Record loop in session health monitor
      const healthMonitor = getSessionHealthMonitor();
      healthMonitor.recordLoopDetected(session.state.id, loopResult.loopType || 'unknown', loopResult.involvedTools);
      
      // Emit loop detection event to UI (use 'recovering' status to indicate issue being handled)
      this.emitEvent({
        type: 'agent-status',
        sessionId: session.state.id,
        status: 'recovering',
        message: `Loop detected: ${loopResult.description}. ${loopResult.suggestion}`,
        timestamp: Date.now(),
      });

      // If circuit breaker triggered, add a message and potentially stop
      if (loopDetector.shouldTriggerCircuitBreaker(runId)) {
        this.logger.warn('Circuit breaker triggered due to loop detection', {
          sessionId: session.state.id,
          runId,
          loopType: loopResult.loopType,
          involvedTools: loopResult.involvedTools,
          repetitionCount: loopResult.repetitionCount,
        });

        // Add a system message about the loop
        const loopMessage: ChatMessage = {
          id: randomUUID(),
          role: 'tool',
          content: `⚠️ Loop detected: ${loopResult.description}\n\nThe same tool has been called repeatedly with identical arguments. This usually indicates the agent is stuck.\n\nSuggestion: ${loopResult.suggestion}`,
          toolCallId: tool.callId,
          toolName: tool.name,
          createdAt: Date.now(),
          runId,
          toolSuccess: false,
        };
        session.state.messages.push(loopMessage);
        this.updateSessionState(session.state.id, {
          messages: session.state.messages,
          updatedAt: Date.now(),
        });
        return;
      }
    }

    this.logger.info('Executing tool', { tool: tool.name, sessionId: session.state.id, runId });
    const progressId = this.ensureToolProgressId(tool);
    const toolLabel = tool.name;
    const toolDetail = this.describeToolTarget(tool);
    const toolTimerKey = this.getToolTimerKey(runId, progressId);
    const progressTimestamp = Date.now();
    this.toolTimers.set(toolTimerKey, progressTimestamp);
    this.emitRunProgressItem(session, runId, {
      id: progressId,
      type: 'tool-call',
      label: toolLabel,
      detail: toolDetail,
      status: 'running',
      timestamp: progressTimestamp,
      metadata: { callId: tool.callId },
    });

    // Emit debug tool call event
    const activeTrace = this.debugger.getActiveTrace();
    if (activeTrace) {
      const argsPreview = JSON.stringify(tool.arguments || {}).slice(0, 300);
      this.emitDebugToolCall(
        activeTrace.traceId,
        session.state.id,
        runId,
        activeTrace.metrics.totalSteps + 1,
        tool.name,
        tool.callId || 'unknown',
        argsPreview,
        false // Already approved if we're here
      );
    }

    this.emitEvent({
      type: 'agent-status',
      sessionId: session.state.id,
      status: 'executing',
      message: `Executing: ${tool.name}`,
      timestamp: Date.now(),
    });

    this.emitEvent({
      type: 'tool-call',
      sessionId: session.state.id,
      runId,
      toolCall: tool,
      requiresApproval: false,
      timestamp: Date.now(),
    });

    const startTime = Date.now();

    try {
      const workspace = session.state.workspaceId
        ? this.workspaceManager.list().find(w => w.id === session.state.workspaceId)
        : this.workspaceManager.getActive();

      if (session.state.workspaceId && !workspace) {
        throw new Error(`Session workspace not found: ${session.state.workspaceId}`);
      }

      if (!workspace) {
        throw new Error('No active workspace available for tool execution');
      }

      // Get or create safety manager for this run
      const safetyManager = this.getOrCreateSafetyManager(runId, workspace.path);

      // Get access level settings for outside workspace access
      const accessSettings = this.getAccessLevelSettings();

      const context: ToolExecutionContext = {
        workspacePath: workspace.path,
        cwd: workspace.path,
        terminalManager: this.terminalManager,
        logger: {
          info: (msg: string, meta?: Record<string, unknown>) => this.logger.info(`[tool] ${msg}`, meta),
          warn: (msg: string, meta?: Record<string, unknown>) => this.logger.warn(`[tool] ${msg}`, meta),
          error: (msg: string, meta?: Record<string, unknown>) => this.logger.error(`[tool] ${msg}`, meta),
        },
        safetyManager,
        runId,
        sessionId: session.state.id,
        yoloMode: session.state.config.yoloMode,
        allowOutsideWorkspace: accessSettings?.allowOutsideWorkspace ?? false,
        signal, // Pass abort signal for cancellation support
      };

      const args = tool.arguments && typeof tool.arguments === 'object'
        ? tool.arguments
        : {};

      // Compliance validation - check tool call against system prompt rules
      const complianceResult = this.complianceValidator.validateToolCall(
        runId,
        tool.name,
        args,
        tool.callId
      );

      // Log compliance violations
      if (!complianceResult.isCompliant) {
        this.logger.warn('Compliance violations detected for tool call', {
          tool: tool.name,
          violations: complianceResult.violations.map(v => ({
            type: v.type,
            severity: v.severity,
            message: v.message,
          })),
          sessionId: session.state.id,
          runId,
        });

        // If we should block, add corrective message and skip execution
        if (complianceResult.shouldBlock) {
          const correctiveMessage: ChatMessage = {
            id: randomUUID(),
            role: 'tool',
            content: complianceResult.correctiveMessage ||
              `Tool call blocked due to compliance violation: ${complianceResult.violations[0]?.message}`,
            toolCallId: tool.callId,
            toolName: tool.name,
            toolSuccess: false,
            createdAt: Date.now(),
            runId,
          };
          session.state.messages.push(correctiveMessage);
          this.finishToolProgress(session, runId, progressId, toolLabel, toolDetail, 'error');
          this.safeUpdateSessionState(session.state.id, {
            messages: session.state.messages,
            updatedAt: Date.now(),
          });
          return;
        }

        // If we should warn but not block, inject corrective message as context
        if (complianceResult.shouldWarn && complianceResult.correctiveMessage) {
          // Add a system note about the violation (will be visible in conversation)
          this.logger.info('Compliance warning injected', {
            tool: tool.name,
            message: complianceResult.correctiveMessage.slice(0, 100),
          });
        }
      }

      // Access level validation - check tool against user-configured access permissions
      const toolDef = this.toolRegistry.getDefinition(tool.name);
      const filePath = (args as Record<string, unknown>).path as string
        ?? (args as Record<string, unknown>).filePath as string
        ?? (args as Record<string, unknown>).file as string
        ?? undefined;

      const accessCheck = this.checkAccessLevelPermission(
        tool.name,
        toolDef?.category,
        filePath
      );

      if (!accessCheck.allowed) {
        this.logger.warn('Access level restriction blocked tool call', {
          tool: tool.name,
          category: this.getAccessLevelCategory(tool.name, toolDef?.category),
          reason: accessCheck.reason,
          sessionId: session.state.id,
          runId,
        });

        const accessSettings = this.getAccessLevelSettings();
        const accessDeniedMessage: ChatMessage = {
          id: randomUUID(),
          role: 'tool',
          content: accessSettings?.accessDeniedMessage
            || accessCheck.reason
            || `Access denied: This operation is not allowed at your current access level.`,
          toolCallId: tool.callId,
          toolName: tool.name,
          toolSuccess: false,
          createdAt: Date.now(),
          runId,
        };
        session.state.messages.push(accessDeniedMessage);
        this.finishToolProgress(session, runId, progressId, toolLabel, toolDetail, 'error');
        this.safeUpdateSessionState(session.state.id, {
          messages: session.state.messages,
          updatedAt: Date.now(),
        });
        return;
      }

      // If confirmation is required but we're not in YOLO mode, we need to request confirmation
      if (accessCheck.requiresConfirmation && !session.state.config.yoloMode) {
        this.logger.info('Access level requires confirmation for tool call', {
          tool: tool.name,
          category: this.getAccessLevelCategory(tool.name, toolDef?.category),
          sessionId: session.state.id,
          runId,
        });
        // Note: Confirmation is handled at a higher level in processToolCalls
        // This check is for tools that might bypass the normal confirmation flow
      }

      const result = await this.toolRegistry.execute(tool.name, args, context);
      const duration = Date.now() - startTime;

      const toolResultMessage: ChatMessage = {
        id: randomUUID(),
        role: 'tool',
        content: result.output,
        toolCallId: tool.callId,
        toolName: tool.name,
        toolSuccess: result.success,
        createdAt: Date.now(),
        runId, // Include runId for proper message grouping
      };
      session.state.messages.push(toolResultMessage);

      if (session.agenticContext) {
        session.agenticContext.toolCallCount++;
        if (result.fileChanges) {
          for (const change of result.fileChanges) {
            if (change.action === 'read') {
              session.agenticContext.filesRead.push(change.path);
            } else {
              session.agenticContext.filesModified.push(change.path);
            }
          }
        }
      }

      // Emit debug tool result event
      const activeTraceForResult = this.debugger.getActiveTrace();
      if (activeTraceForResult) {
        this.emitDebugToolResult(
          activeTraceForResult.traceId,
          session.state.id,
          runId,
          activeTraceForResult.metrics.totalSteps + 1,
          tool.name,
          tool.callId || 'unknown',
          result.success,
          duration,
          result.output.slice(0, 300),
          result.output.length
        );
      }

      this.emitEvent({
        type: 'tool-result',
        sessionId: session.state.id,
        runId,
        result: {
          toolName: tool.name,
          success: result.success,
          output: result.output,
          metadata: result.metadata, // Include metadata for diff generation
        },
        toolCallId: tool.callId,
        timestamp: Date.now(),
      });

      this.logger.debug(result.success ? 'Tool executed successfully' : 'Tool executed with failure', {
        tool: tool.name,
        duration,
        success: result.success,
        sessionId: session.state.id,
      });

      // Record tool execution in metrics
      agentMetrics.recordToolExecution(runId, result.success, false, tool.name);

      this.finishToolProgress(session, runId, progressId, toolLabel, toolDetail, result.success ? 'success' : 'error');
      this.safeUpdateSessionState(session.state.id, {
        messages: session.state.messages,
        updatedAt: Date.now(),
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      this.logger.error('Tool execution failed', {
        tool: tool.name,
        error: errorMsg,
        duration,
        sessionId: session.state.id,
        runId,
      });

      // Record failed tool execution in metrics
      agentMetrics.recordToolExecution(runId, false, false, tool.name);

      this.finishToolProgress(session, runId, progressId, toolLabel, toolDetail, 'error');

      const errorMessage: ChatMessage = {
        id: randomUUID(),
        role: 'tool',
        content: `Error: ${errorMsg}`,
        toolCallId: tool.callId,
        toolName: tool.name,
        toolSuccess: false,
        createdAt: Date.now(),
        runId, // Include runId for proper message grouping
      };
      session.state.messages.push(errorMessage);

      this.emitEvent({
        type: 'tool-result',
        sessionId: session.state.id,
        runId,
        result: {
          toolName: tool.name,
          success: false,
          output: `Error: ${errorMsg}`,
          metadata: undefined, // No metadata for errors
        },
        toolCallId: tool.callId,
        timestamp: Date.now(),
      });

      this.safeUpdateSessionState(session.state.id, {
        messages: session.state.messages,
        updatedAt: Date.now(),
      });
    }
  }

  cancelRun(sessionId: string, session: InternalSession): void {
    this.logger.info('cancelRun: Starting cancellation', {
      sessionId,
      hasController: this.activeControllers.has(sessionId),
      sessionStatus: session.state.status,
      activeRunId: session.state.activeRunId
    });

    // Clear any queued executions for this session
    const clearedFromQueue = this.clearSessionQueue(sessionId);
    if (clearedFromQueue > 0) {
      this.logger.info('cancelRun: Cleared queued executions', { sessionId, clearedFromQueue });
    }

    const controller = this.activeControllers.get(sessionId);
    if (controller) {
      this.logger.info('cancelRun: Aborting controller', { sessionId });
      controller.abort();
      this.activeControllers.delete(sessionId);
    } else {
      this.logger.warn('cancelRun: No active controller found', { sessionId });
    }

    const cancelledRunId = session.state.activeRunId || session.pendingTool?.runId || 'cancelled';
    if (cancelledRunId && cancelledRunId !== 'cancelled') {
      this.completeAnalysisProgress(session, cancelledRunId, 'error');
    }

    // CRITICAL FIX: Handle incomplete tool call sequences
    // When cancelling mid-execution, we may have an assistant message with tool_calls
    // but no corresponding tool result messages. This causes API errors on the next request.
    // Solution: Add cancelled tool result messages for any pending tool_calls
    this.handleIncompleteToolCalls(session);

    session.pendingTool = undefined;
    session.toolQueue = undefined;
    session.agenticContext = undefined;
    session.state.status = 'idle';
    session.state.activeRunId = undefined;

    this.updateSessionState(sessionId, {
      status: 'idle',
      activeRunId: undefined,
      messages: session.state.messages, // Include messages in case we modified them
      updatedAt: Date.now(),
    });

    this.emitEvent({
      type: 'run-status',
      sessionId,
      runId: cancelledRunId,
      status: 'idle',
      timestamp: Date.now(),
    });
    this.emitEvent({ type: 'session-state', session: session.state });
  }

  /**
   * Handle incomplete tool call sequences when cancelling a run.
   * 
   * When a run is cancelled mid-execution, there may be an assistant message
   * with tool_calls that don't have corresponding tool result messages.
   * This causes API errors like:
   * "An assistant message with 'tool_calls' must be followed by tool messages 
   * responding to each 'tool_call_id'"
   * 
   * This method adds synthetic "cancelled" tool result messages for any
   * pending tool_calls to maintain message structure integrity.
   */
  private handleIncompleteToolCalls(session: InternalSession): void {
    const messages = session.state.messages;
    if (!messages || messages.length === 0) return;

    // Find the last assistant message
    let lastAssistantIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        lastAssistantIndex = i;
        break;
      }
    }

    if (lastAssistantIndex === -1) return;

    const lastAssistant = messages[lastAssistantIndex];
    if (!lastAssistant.toolCalls || lastAssistant.toolCalls.length === 0) return;

    // Collect tool_call_ids that need responses
    const toolCallIds = new Set(lastAssistant.toolCalls.map(tc => tc.callId));

    // Check which tool_calls already have corresponding tool messages
    for (let i = lastAssistantIndex + 1; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === 'tool' && msg.toolCallId) {
        toolCallIds.delete(msg.toolCallId);
      }
    }

    // If there are any tool_calls without responses, add cancelled messages
    if (toolCallIds.size > 0) {
      this.logger.info('Adding cancelled tool result messages for incomplete tool calls', {
        sessionId: session.state.id,
        pendingToolCallIds: Array.from(toolCallIds),
      });

      for (const toolCallId of toolCallIds) {
        const toolCall = lastAssistant.toolCalls?.find(tc => tc.callId === toolCallId);
        const toolName = toolCall?.name || 'unknown';

        messages.push({
          id: `cancelled-${toolCallId}-${Date.now()}`,
          role: 'tool',
          content: `Tool execution was cancelled by the user.`,
          toolCallId: toolCallId,
          toolName: toolName,
          createdAt: Date.now(),
          runId: lastAssistant.runId, // Include runId for proper message grouping
        });
      }
    }
  }

  /**
   * Pause an active run. The run will pause at the next safe checkpoint.
   * Returns true if the session was paused, false if it wasn't running.
   */
  pauseRun(sessionId: string): boolean {
    if (this.pausedSessions.has(sessionId)) {
      this.logger.warn('pauseRun: Session already paused', { sessionId });
      return false;
    }

    if (!this.activeControllers.has(sessionId)) {
      this.logger.warn('pauseRun: No active run to pause', { sessionId });
      return false;
    }

    this.logger.info('pauseRun: Pausing session', { sessionId });
    this.pausedSessions.set(sessionId, { pausedAt: Date.now() });

    this.emitEvent({
      type: 'agent-status',
      sessionId,
      timestamp: Date.now(),
      status: 'paused',
      message: 'Paused',
      metadata: {
        paused: true,
      },
    } as import('../../shared/types').AgentStatusEvent);

    return true;
  }

  /**
   * Resume a paused run.
   * Returns true if the session was resumed, false if it wasn't paused.
   */
  resumeRun(sessionId: string): boolean {
    const pauseState = this.pausedSessions.get(sessionId);
    if (!pauseState) {
      this.logger.warn('resumeRun: Session not paused', { sessionId });
      return false;
    }

    this.logger.info('resumeRun: Resuming session', {
      sessionId,
      pausedDuration: Date.now() - pauseState.pausedAt
    });

    // Resolve the pause promise if waiting
    if (pauseState.resumeResolve) {
      pauseState.resumeResolve();
    }

    this.pausedSessions.delete(sessionId);

    this.emitEvent({
      type: 'agent-status',
      sessionId,
      timestamp: Date.now(),
      status: 'executing',
      message: 'Resumed',
      metadata: {
        paused: false,
      },
    } as import('../../shared/types').AgentStatusEvent);

    return true;
  }

  /**
   * Check if a session is paused.
   */
  isRunPaused(sessionId: string): boolean {
    return this.pausedSessions.has(sessionId);
  }

  /**
   * Check if a provider is currently in cooldown (e.g., due to quota/billing errors).
   * Used by autocomplete and other services to avoid making requests to unavailable providers.
   */
  isProviderInCooldown(provider: LLMProviderName): boolean {
    const cooldown = this.providerCooldownUntil.get(provider);
    if (!cooldown) return false;
    return cooldown.until > Date.now();
  }

  /**
   * Get cooldown info for a provider (for diagnostics/UI).
   * Returns null if provider is not in cooldown.
   */
  getProviderCooldownInfo(provider: LLMProviderName): { until: number; reason: string; remainingMs: number } | null {
    const cooldown = this.providerCooldownUntil.get(provider);
    if (!cooldown) return null;
    const remainingMs = cooldown.until - Date.now();
    if (remainingMs <= 0) return null;
    return { until: cooldown.until, reason: cooldown.reason, remainingMs };
  }

  /**
   * Wait if the session is paused. Call this at safe checkpoints in the run loop.
   * Returns a promise that resolves when the session is resumed or immediately if not paused.
   */
  async waitIfPaused(sessionId: string): Promise<void> {
    const pauseState = this.pausedSessions.get(sessionId);
    if (!pauseState) return;

    this.logger.debug('waitIfPaused: Waiting for resume', { sessionId });

    await new Promise<void>((resolve) => {
      pauseState.resumeResolve = resolve;
    });
  }

  /**
   * Select primary and fallback providers for resilient execution
   */
  private selectProvidersWithFallback(session: InternalSession): {
    primary: LLMProvider | null;
    fallback: LLMProvider | null;
  } {
    const preferredProvider = session.state.config.preferredProvider;
    const fallbackProviderName = session.state.config.fallbackProvider;
    const enableProviderFallback = session.state.config.enableProviderFallback !== false;

    // Build list of available providers sorted by priority
    const availableProviders: Array<{ name: string; provider: LLMProvider; priority: number }> = [];

    const now = Date.now();
    for (const [name, info] of this.providers) {
      const providerName = name as LLMProviderName;
      const cooldown = this.providerCooldownUntil.get(providerName);
      if (cooldown && cooldown.until > now) {
        continue;
      }
      if (info.hasApiKey && info.enabled && info.provider) {
        availableProviders.push({
          name,
          provider: info.provider,
          priority: info.priority,
        });
      }
    }

    availableProviders.sort((a, b) => a.priority - b.priority);

    if (availableProviders.length === 0) {
      return { primary: null, fallback: null };
    }

    let primary: LLMProvider | null = null;
    let fallback: LLMProvider | null = null;

    // Select primary provider
    if (preferredProvider && preferredProvider !== 'auto') {
      const preferred = availableProviders.find(p => p.name === preferredProvider);
      if (preferred) {
        primary = preferred.provider;
      }
    }

    if (!primary) {
      primary = availableProviders[0].provider;
    }

    // Select fallback provider only if fallback is enabled
    if (enableProviderFallback) {
      if (fallbackProviderName) {
        const specified = availableProviders.find(
          p => p.name === fallbackProviderName && p.provider !== primary
        );
        if (specified) {
          fallback = specified.provider;
        }
      }

      // If no specified fallback or it's same as primary, pick the next best available
      if (!fallback) {
        const alternative = availableProviders.find(p => p.provider !== primary);
        if (alternative) {
          fallback = alternative.provider;
        }
      }
    }

    this.logger.debug('Selected providers', {
      primary: primary?.name,
      fallback: fallback?.name,
      availableCount: availableProviders.length,
      enableProviderFallback,
    });

    return { primary, fallback };
  }

  private async buildProviderRequest(session: InternalSession, provider: LLMProvider): Promise<ProviderRequest> {
    const workspace = session.state.workspaceId
      ? this.workspaceManager.list().find(w => w.id === session.state.workspaceId)
      : this.workspaceManager.getActive();

    // Validate workspace exists
    if (session.state.workspaceId && !workspace) {
      throw new Error(`Provider request failed: workspace not found for session ${session.state.id}`);
    }

    if (!workspace) {
      this.logger.warn('Building provider request without active workspace', { sessionId: session.state.id });
    }

    // Get model ID early so we can check its capabilities
    const providerSettings = this.getProviderSettings(provider.name);
    const modelId = this.getEffectiveModelId(session, provider, session.state.activeRunId);

    // Check model capabilities
    const modelInfo = modelId ? getSharedModelById(modelId) : undefined;

    // Validate that the model supports multi-turn chat conversations
    // TTS and some specialized models do not support multi-turn chat
    if (modelInfo && modelInfo.supportsMultiturnChat === false) {
      throw new Error(
        `Model "${modelInfo.name}" (${modelId}) does not support multi-turn chat conversations. ` +
        `This model is designed for ${modelInfo.supportsTTS ? 'text-to-speech' : modelInfo.supportsImageGeneration ? 'image generation' : 'specialized'} use cases. ` +
        `Please select a different model for chat functionality.`
      );
    }

    const modelSupportsTools = modelInfo?.supportsTools ?? true; // Default to true for unknown models

    // Build system prompt - use simplified prompt for image generation models
    // Image generation models like Gemini 3 Pro Image work better without complex coding instructions
    let systemPrompt: string;
    if (modelInfo?.supportsImageGeneration) {
      systemPrompt = buildImageGenerationSystemPrompt();
    } else {
      systemPrompt = await this.buildSystemPromptForSession(session, provider, workspace, modelId);
    }

    // Only get tools if the model supports them
    const tools = modelSupportsTools ? this.getToolDefinitions(provider.name, session) : [];

    if (!modelSupportsTools) {
      this.logger.info('Model does not support tools, sending request without tools', {
        sessionId: session.state.id,
        modelId,
        modelName: modelInfo?.name,
      });
    }

    // Update context manager for current provider
    this.updateContextManagerForProvider(provider.name);

    // Get context metrics and apply pruning if needed
    let messages = [...session.state.messages];
    const toolDefs = tools.map(t => ({
      name: t.name,
      description: t.description,
      jsonSchema: t.jsonSchema
    }));

    // Only compress tool results in OLDER messages (keep recent ones intact for context)
    // This preserves agent's working memory while managing context size
    const recentMessageCount = 40; // Keep last 40 messages fully intact
    if (messages.length > recentMessageCount + 10) {
      // Only compress messages older than the recent window
      const oldMessages = messages.slice(0, -recentMessageCount);
      const recentMessages = messages.slice(-recentMessageCount);

      // First, compress tool results (preserves structure but truncates content)
      const compressionResult = this.conversationSummarizer.compressToolResults(oldMessages);
      if (compressionResult.tokensFreed > 0) {
        messages = [...compressionResult.messages, ...recentMessages];
        this.logger.debug('Compressed old tool results', {
          sessionId: session.state.id,
          tokensFreed: compressionResult.tokensFreed,
          oldMessagesCount: oldMessages.length,
          recentMessagesPreserved: recentMessages.length,
        });
      }

      // Second pass: aggressively clear very old tool results (safest lightest touch compaction)
      // This replaces tool result content with minimal summaries for messages beyond the recent window
      const clearResult = this.conversationSummarizer.clearOldToolResults(messages, recentMessageCount + 20);
      if (clearResult.tokensFreed > 0) {
        messages = clearResult.messages;
        this.logger.debug('Cleared old tool results', {
          sessionId: session.state.id,
          tokensFreed: clearResult.tokensFreed,
          clearedCount: clearResult.clearedCount,
        });
      }
    }

    const metrics: ContextMetrics = this.contextManager.getContextMetrics(messages, systemPrompt, toolDefs);

    // Stream real-time context metrics to the renderer for UI display
    this.emitEvent({
      type: 'context-metrics',
      sessionId: session.state.id,
      runId: session.state.activeRunId,
      provider: provider.name,
      modelId,
      timestamp: Date.now(),
      metrics: {
        totalTokens: metrics.totalTokens,
        maxInputTokens: metrics.maxInputTokens,
        utilization: metrics.utilization,
        messageCount: metrics.messageCount,
        availableTokens: metrics.availableTokens,
        isWarning: metrics.isWarning,
        needsPruning: metrics.needsPruning,
        tokensByRole: metrics.tokensByRole,
      },
    });

    // Log context utilization
    this.logger.debug('Context window status', {
      sessionId: session.state.id,
      totalTokens: metrics.totalTokens,
      maxInputTokens: metrics.maxInputTokens,
      utilization: `${(metrics.utilization * 100).toFixed(1)}%`,
      messageCount: metrics.messageCount,
      isWarning: metrics.isWarning,
      needsPruning: metrics.needsPruning,
    });

    // Emit warning if context is filling up
    if (metrics.isWarning && !metrics.needsPruning) {
      this.emitEvent({
        type: 'agent-status',
        sessionId: session.state.id,
        status: 'executing',
        message: `Context window at ${(metrics.utilization * 100).toFixed(0)}% capacity`,
        timestamp: Date.now(),
        metadata: {
          contextUtilization: metrics.utilization,
          messageCount: metrics.messageCount,
        },
      });
    }

    // Apply pruning if context is too large
    if (metrics.needsPruning) {
      this.logger.info('Pruning context to fit within limits', {
        sessionId: session.state.id,
        beforeMessages: messages.length,
        beforeTokens: metrics.totalTokens,
        maxTokens: metrics.maxInputTokens,
      });

      const pruningResult = this.contextManager.pruneMessages(
        messages,
        systemPrompt,
        toolDefs,
        'Context window limit approaching'
      );

      messages = pruningResult.messages;

      this.logger.info('Context pruned', {
        sessionId: session.state.id,
        removedMessages: pruningResult.removedCount,
        tokensFreed: pruningResult.tokensFreed,
        afterMessages: messages.length,
        reason: pruningResult.reason,
      });

      // Record context pruning in metrics
      const runId = session.state.activeRunId;
      if (runId) {
        agentMetrics.updateContextMetrics(runId, messages.length, true, false);
      }

      // Update session state with pruned messages
      session.state.messages = messages;
      this.updateSessionState(session.state.id, {
        messages: session.state.messages,
        updatedAt: Date.now(),
      });

      // Emit pruning event to UI
      this.emitEvent({
        type: 'agent-status',
        sessionId: session.state.id,
        status: 'executing',
        message: `Pruned ${pruningResult.removedCount} messages to manage context window`,
        timestamp: Date.now(),
        metadata: {
          prunedMessages: pruningResult.removedCount,
          tokensFreed: pruningResult.tokensFreed,
        },
      });
    }

    const providerMessages = this.convertMessagesToProvider(messages);

    // providerSettings and modelId already declared at start of method

    const temperature = session.state.config.temperature ?? providerSettings?.model?.temperature ?? 0.2;

    // CRITICAL: Ensure maxTokens is never 0 or invalid
    // Session config should take priority over provider defaults.
    // Use || instead of ?? to treat 0 as falsy and fall back to defaults.
    // Default to 8192 which is widely compatible across providers.
    // If agentic context has a reduced maxOutputTokens (due to credit limits), use that instead.
    const agenticMaxTokens = session.agenticContext?.maxOutputTokens;
    const providerMaxTokens = providerSettings?.model?.maxOutputTokens;
    const sessionMaxTokens = session.state.config.maxOutputTokens;
    
    // Priority: agenticContext (credit-limited) > session > provider > default
    let maxTokens: number;
    if (agenticMaxTokens && agenticMaxTokens > 0) {
      // Use reduced tokens from credit limit recovery
      maxTokens = agenticMaxTokens;
    } else {
      const rawMaxTokens = sessionMaxTokens || providerMaxTokens;
      maxTokens = (rawMaxTokens && rawMaxTokens > 0) ? rawMaxTokens : 8192;
    }

    // Determine response modalities based on model capabilities
    // For image generation models, we need to explicitly request IMAGE modality
    // @see https://ai.google.dev/gemini-api/docs/image-generation
    let responseModalities: ('TEXT' | 'IMAGE' | 'AUDIO')[] | undefined;
    if (modelInfo?.supportsImageGeneration) {
      responseModalities = ['TEXT', 'IMAGE'];
      this.logger.debug('Enabling image generation modality', {
        sessionId: session.state.id,
        modelId,
        responseModalities,
      });
    }

    // Log model selection for debugging and visibility
    const sessionModelId = session.state.config.manualOverrideModel || session.state.config.selectedModelId;
    this.logger.info('Building provider request', {
      provider: provider.name,
      sessionId: session.state.id,
      modelId,
      modelSource: sessionModelId ? 'session-selection' : 'provider-settings',
      sessionManualOverride: session.state.config.manualOverrideModel,
      sessionSelectedModel: session.state.config.selectedModelId,
      providerSettingsModel: providerSettings?.model?.modelId,
      temperature,
      maxOutputTokens: maxTokens,
      responseModalities,
      reasoningEffort: session.state.config.reasoningEffort,
      verbosity: session.state.config.verbosity,
    });

    return {
      systemPrompt,
      messages: providerMessages,
      tools,
      cache: (() => {
        // Provider-level prompt caching controls (Anthropic/OpenAI currently)
        if (!provider.supportsCaching) return undefined;

        const cacheSettings = this.getCacheSettings();
        const enabled = cacheSettings?.enablePromptCache?.[provider.name] ?? true;
        if (!enabled) return undefined;

        const strategy = cacheSettings?.promptCacheStrategy ?? 'default';
        if (strategy === 'aggressive') return { ...AGGRESSIVE_CACHE_CONFIG };
        if (strategy === 'conservative') return { ...CONSERVATIVE_CACHE_CONFIG };
        return { ...DEFAULT_CACHE_CONFIG };
      })(),
      config: {
        model: modelId,
        temperature,
        maxOutputTokens: maxTokens,
        responseModalities,
        // OpenAI-specific reasoning and verbosity settings
        reasoningEffort: session.state.config.reasoningEffort || undefined,
        verbosity: session.state.config.verbosity || undefined,
      },
    };
  }

  /**
   * Build system prompt for the AI agent
   * Delegates to the systemPrompt module for the actual prompt construction
   */
  private async buildSystemPromptForSession(
    session: InternalSession,
    provider: LLMProvider,
    workspace?: { id: string; path: string; name?: string },
    modelIdOverride?: string,
  ): Promise<string> {
    const tools = this.toolRegistry.list();
    const toolsList = tools.map(t => t.name).join(', ');

    // Get tool definitions with descriptions from implementations
    const toolDefinitions = tools.map(t => ({
      name: t.name,
      description: t.description,
    }));

    const rawPromptSettings = this.getPromptSettings();

    // Ensure promptSettings has valid defaults
    const promptSettings = rawPromptSettings ?? DEFAULT_PROMPT_SETTINGS;

    // Ensure personas array exists
    if (!promptSettings.personas) {
      promptSettings.personas = [];
    }

    // Get model ID for context (provider-aware; avoids cross-provider model IDs on fallback)
    const modelId = modelIdOverride ?? (this.getEffectiveModelId(session, provider, session.state.activeRunId) ?? provider.name);

    // Get access level settings for permission context
    const accessLevelSettings = this.getAccessLevelSettings();

    // Build terminal context for agent awareness
    const terminalContext = this.buildTerminalContext(workspace?.path);

    // Build workspace structure context (project type, directories)
    const workspaceStructure = await this.buildWorkspaceStructureContext(workspace?.path);

    // Build workspace-wide diagnostics (all errors from entire codebase)
    const workspaceDiagnostics = await this.getWorkspaceDiagnostics?.();

    // Fetch relevant memories for context injection - context-aware retrieval
    let memories: import('./memory/types').MemoryEntry[] | undefined;
    if (workspace?.path) {
      try {
        const { getMemoryStorage } = await import('./memory');
        const storage = getMemoryStorage();
        
        // Extract context hint from recent user messages for dynamic retrieval
        const recentUserMessages = session.state.messages
          .filter(m => m.role === 'user')
          .slice(-3)
          .map(m => m.content)
          .join(' ');
        
        if (recentUserMessages.length > 10) {
          // Use context-aware retrieval based on conversation content
          memories = storage.getContextAwareMemories(workspace.path, recentUserMessages, 15);
        } else {
          // Fallback to recent memories if no conversation context
          memories = storage.getRecentForContext(workspace.path, 15);
        }
      } catch {
        // Memory storage may not be initialized yet, skip silently
      }
    }

    // Build context for system prompt with all new context types
    const context: SystemPromptContext = {
      session,
      providerName: provider.name,
      modelId,
      workspace,
      toolsList,
      toolDefinitions,
      promptSettings,
      accessLevelSettings,
      terminalContext,
      editorContext: this.getEditorState?.(),
      workspaceDiagnostics: workspaceDiagnostics ?? undefined,
      workspaceStructure,
      memories,
      logger: this.logger,
    };

    // Build the base system prompt
    let systemPrompt = buildSystemPrompt(context);

    // Optimize prompt for the specific provider/model
    const optimizationResult = this.promptOptimizer.optimizePrompt(
      systemPrompt,
      provider.name,
      { forceCondense: false }
    );

    if (optimizationResult.wasOptimized) {
      this.logger.debug('System prompt optimized for provider', {
        provider: provider.name,
        originalTokens: this.estimateTokens(systemPrompt),
        optimizedTokens: optimizationResult.estimatedTokens,
        condensedSections: optimizationResult.condensedSections,
        removedSections: optimizationResult.removedSections,
      });

      if (optimizationResult.removedSections.includes('tool_workflows')) {
        this.logger.warn('System prompt optimization removed tool_workflows (browser/tool guidance may be degraded)', {
          provider: provider.name,
          originalTokens: this.estimateTokens(systemPrompt),
          optimizedTokens: optimizationResult.estimatedTokens,
          condensedSections: optimizationResult.condensedSections,
          removedSections: optimizationResult.removedSections,
        });
      }
      systemPrompt = optimizationResult.systemPrompt;
    }

    // Add mid-conversation reminder if needed (based on message count)
    const messageCount = session.state.messages.length;
    const recentViolations = this.complianceValidator.getViolations(session.state.activeRunId || '')
      .slice(-3)
      .map(v => v.message);

    const reminder = this.promptOptimizer.generateMidConversationReminder(
      provider.name,
      messageCount,
      recentViolations.length > 0 ? recentViolations : undefined
    );

    if (reminder) {
      systemPrompt += reminder;
      this.logger.debug('Added mid-conversation reminder', {
        provider: provider.name,
        messageCount,
        hasViolations: recentViolations.length > 0,
      });
    }

    return systemPrompt;
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private convertMessagesToProvider(messages: ChatMessage[]): ProviderMessage[] {
    return messages.map((msg): ProviderMessage => {
      if (msg.role === 'user') {
        return {
          role: 'user',
          content: msg.content,
          attachments: msg.attachments,
          providerInternal: msg.providerInternal,
        };
      }

      if (msg.role === 'assistant') {
        return {
          role: 'assistant',
          content: msg.content,
          toolCalls: msg.toolCalls,
          providerInternal: msg.providerInternal,
          // Pass through thinking/reasoning content for thinking mode tool call loops
          // DeepSeek requires reasoning_content to be passed back during tool call sequences
          // Use reasoningContent (API-only, not displayed) if available, otherwise thinking (displayed)
          // @see https://api-docs.deepseek.com/guides/thinking_mode
          thinking: msg.reasoningContent || msg.thinking,
          // Pass through generated media for validation (messages with media should not be filtered)
          generatedImages: msg.generatedImages,
          generatedAudio: msg.generatedAudio,
        };
      }

      if (msg.role === 'tool') {
        return {
          role: 'tool',
          content: msg.content,
          toolCallId: msg.toolCallId,
          toolName: msg.toolName,
          providerInternal: msg.providerInternal,
        };
      }

      return {
        role: msg.role as 'system' | 'user' | 'assistant' | 'tool',
        content: msg.content,
        providerInternal: msg.providerInternal,
      };
    });
  }

  private getToolDefinitions(providerName?: LLMProviderName, session?: InternalSession): ProviderToolDefinition[] {
    let tools = this.toolRegistry.list();
    
    // Apply dynamic tool context selection if enabled and session is available
    // This reduces context from 40+ tools to 8-15 relevant tools based on:
    // - Workspace type (TypeScript, Python, etc.)
    // - Task intent (coding, debugging, research, etc.)
    // - Recent tool usage patterns
    if (session) {
      // Get workspace for type detection
      const workspace = session.state.workspaceId
        ? this.workspaceManager.list().find(w => w.id === session.state.workspaceId)
        : this.workspaceManager.getActive();
      
      // Detect workspace type from actual workspace path
      const workspaceType = detectWorkspaceType(workspace?.path ?? null);
      
      // Extract recent tool usage from conversation
      const recentToolUsage = extractRecentToolUsage(session.state.messages);
      
      // Select relevant tools based on context
      const selectedTools = selectToolsForContext(tools, {
        recentMessages: session.state.messages.slice(-10),
        recentToolUsage,
        workspaceType,
      });
      
      // Log tool selection for debugging
      const totalTools = tools.length;
      const selectedCount = selectedTools.length;
      if (selectedCount < totalTools) {
        this.logger.debug('Dynamic tool selection applied', {
          sessionId: session.state.id,
          totalTools,
          selectedTools: selectedCount,
          reduction: `${Math.round((1 - selectedCount / totalTools) * 100)}%`,
          workspaceType,
        });
      }
      
      tools = selectedTools;
    }
    
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      jsonSchema: (() => {
        const schema = (tool.schema as unknown as Record<string, unknown>) || {};
        // OpenAI tool calling uses `strict: true` and expects schemas to conform.
        // Normalize only for OpenAI to avoid changing other providers' behavior.
        if (providerName === 'openai') {
          return normalizeStrictJsonSchema(schema);
        }
        return schema;
      })(),
      requiresApproval: tool.requiresApproval ?? false,
      // CRITICAL FIX: Include input examples for improved LLM accuracy
      // Anthropic research shows this improves tool calling accuracy from 72% to 90%
      input_examples: tool.inputExamples as Array<Record<string, unknown>> | undefined,
    }));
  }

  private createAgenticContext(runId: string): AgenticContext {
    return {
      runId,
      startedAt: Date.now(),
      toolCallCount: 0,
      filesModified: [],
      filesRead: [],
      commandsExecuted: [],
    };
  }

  public markToolAborted(session: InternalSession, runId: string, tool: ToolCallPayload): void {
    const progressId = (tool as ToolCallPayload & { __progressId?: string }).__progressId;
    if (!progressId) return;
    this.emitRunProgressItem(session, runId, {
      id: progressId,
      type: 'tool-call',
      label: tool.name || 'tool',
      detail: this.describeToolTarget(tool),
      status: 'error',
      timestamp: Date.now(),
      metadata: { reason: 'user-denied' },
    });
  }

  private emitRunProgressItem(session: InternalSession, runId: string, item: ProgressItem): void {
    const groupTitle = `${session.state.title || 'Session'} progress`;
    this.emitEvent({
      type: 'progress',
      sessionId: session.state.id,
      runId,
      groupId: runId,
      groupTitle,
      item,
      timestamp: item.timestamp,
    });
  }

  private startAnalysisProgress(session: InternalSession, runId: string): void {
    const timestamp = Date.now();
    this.analysisTimers.set(runId, timestamp);
    this.emitRunProgressItem(session, runId, {
      id: `${runId}-analysis`,
      type: 'analysis',
      label: 'Analyzing request',
      status: 'running',
      timestamp,
    });
  }

  private completeAnalysisProgress(
    session: InternalSession,
    runId: string,
    status: ProgressItem['status']
  ): void {
    const startedAt = this.analysisTimers.get(runId);
    if (!startedAt) return;
    this.analysisTimers.delete(runId);
    const timestamp = Date.now();
    this.emitRunProgressItem(session, runId, {
      id: `${runId}-analysis`,
      type: 'analysis',
      label: 'Analyzing request',
      status,
      timestamp,
      duration: timestamp - startedAt,
    });
  }

  private getIterationKey(runId: string, iteration: number): string {
    return `${runId}:iteration:${iteration}`;
  }

  private startIterationProgress(
    session: InternalSession,
    runId: string,
    iteration: number,
    provider: string
  ): void {
    const key = this.getIterationKey(runId, iteration);
    const timestamp = Date.now();
    this.iterationTimers.set(key, timestamp);
    this.emitRunProgressItem(session, runId, {
      id: `iteration-${iteration}`,
      type: 'iteration',
      label: `Iteration ${iteration}`,
      detail: provider,
      status: 'running',
      timestamp,
    });
  }

  private finishIterationProgress(
    session: InternalSession,
    runId: string,
    iteration: number,
    status: ProgressItem['status']
  ): void {
    const key = this.getIterationKey(runId, iteration);
    const startedAt = this.iterationTimers.get(key);
    if (!startedAt) return;
    this.iterationTimers.delete(key);
    const timestamp = Date.now();
    const duration = timestamp - startedAt;

    // Track iteration time for average calculation
    const timingData = this.runTimingData.get(runId);
    if (timingData) {
      timingData.iterationTimes.push(duration);
    }

    this.emitRunProgressItem(session, runId, {
      id: `iteration-${iteration}`,
      type: 'iteration',
      label: `Iteration ${iteration}`,
      status,
      timestamp,
      duration,
    });
  }

  /**
   * Emit iteration status for UI progress display
   */
  private emitIterationStatus(
    sessionId: string,
    runId: string,
    currentIteration: number,
    maxIterations: number,
    status: 'executing' | 'paused' = 'executing'
  ): void {
    const timingData = this.runTimingData.get(runId);
    const runStartedAt = timingData?.startedAt ?? Date.now();
    const iterationTimes = timingData?.iterationTimes ?? [];

    // Calculate average iteration time (only if we have data)
    const avgIterationTimeMs = iterationTimes.length > 0
      ? Math.round(iterationTimes.reduce((a, b) => a + b, 0) / iterationTimes.length)
      : 0;

    this.emitEvent({
      type: 'agent-status',
      sessionId,
      status,
      message: status === 'paused'
        ? `Paused at iteration ${currentIteration}/${maxIterations}`
        : `Running iteration ${currentIteration}/${maxIterations}`,
      timestamp: Date.now(),
      metadata: {
        currentIteration,
        maxIterations,
        runStartedAt,
        avgIterationTimeMs,
        paused: status === 'paused',
      },
    });
  }

  /**
   * Initialize run timing data when a run starts
   */
  private initRunTiming(runId: string): void {
    this.runTimingData.set(runId, {
      startedAt: Date.now(),
      iterationTimes: [],
    });
  }

  /**
   * Clean up run timing data when a run completes
   */
  private cleanupRunTiming(runId: string): void {
    this.runTimingData.delete(runId);
  }

  /**
   * Get or create a SafetyManager for a specific run
   */
  private getOrCreateSafetyManager(runId: string, _workspacePath: string): SafetyManager {
    let manager = this.safetyManagers.get(runId);
    if (!manager) {
      manager = new SafetyManager();
      this.safetyManagers.set(runId, manager);
    }
    return manager;
  }

  /**
   * Clean up safety manager when a run completes
   */
  private cleanupSafetyManager(runId: string): void {
    this.safetyManagers.delete(runId);
  }

  private ensureToolProgressId(tool: ToolCallPayload): string {
    const annotated = tool as ToolCallPayload & { __progressId?: string };
    if (!annotated.__progressId) {
      annotated.__progressId = tool.callId ? `tool-${tool.callId}` : `tool-${randomUUID()}`;
    }
    return annotated.__progressId;
  }

  private getToolTimerKey(runId: string, progressId: string): string {
    return `${runId}:${progressId}`;
  }

  private finishToolProgress(
    session: InternalSession,
    runId: string,
    progressId: string,
    label: string,
    detail: string | undefined,
    status: ProgressItem['status']
  ): void {
    const key = this.getToolTimerKey(runId, progressId);
    const startedAt = this.toolTimers.get(key);
    if (startedAt) {
      this.toolTimers.delete(key);
    }
    const timestamp = Date.now();
    this.emitRunProgressItem(session, runId, {
      id: progressId,
      type: 'tool-call',
      label,
      detail,
      status,
      timestamp,
      duration: startedAt ? timestamp - startedAt : undefined,
    });
  }

  private describeToolTarget(tool: ToolCallPayload): string | undefined {
    const args = tool.arguments || {};
    const path = (args.path || args.filePath) as string | undefined;
    const command = args.command as string | undefined;
    const query = (args.pattern || args.query) as string | undefined;
    return path || command || query;
  }

  private completeRun(session: InternalSession, runId: string): void {
    this.completeAnalysisProgress(session, runId, 'success');
    const lastMessage = session.state.messages[session.state.messages.length - 1];
    this.logger.info('Run completed', {
      sessionId: session.state.id,
      runId,
      messageCount: session.state.messages.length,
      lastMessageRole: lastMessage?.role,
      lastMessageContentLength: lastMessage?.content?.length ?? 0,
      hasToolCalls: !!lastMessage?.toolCalls?.length,
    });

    // Complete metrics tracking for this run
    const metricsResult = agentMetrics.completeRun(runId, 'completed');
    if (metricsResult) {
      this.logger.debug('Run metrics recorded', {
        runId,
        durationMs: metricsResult.durationMs,
        iterations: metricsResult.iterations,
        toolsExecuted: metricsResult.toolsExecuted,
        toolsSucceeded: metricsResult.toolsSucceeded,
      });
    }

    // Record model quality metrics
    const modelId = session.state.config.selectedModelId || session.state.config.manualOverrideModel;
    const provider = session.agenticContext?.currentProvider || session.state.config.preferredProvider;
    if (modelId && provider && provider !== 'auto') {
      const qualityTracker = getModelQualityTracker();
      const loopDetector = getLoopDetector();
      const loopState = loopDetector.getState(runId);
      const complianceSummary = this.complianceValidator.getViolationSummary(runId);
      
      qualityTracker.recordPerformance({
        modelId,
        provider: provider as LLMProviderName,
        success: true,
        responseTimeMs: metricsResult?.durationMs || 0,
        tokensUsed: 0, // Will be updated from usage tracking
        loopDetected: loopState?.circuitBreakerTriggered || false,
        complianceViolation: complianceSummary.errors > 0,
      });
    }

    // Clean up loop detection state
    const loopDetector = getLoopDetector();
    loopDetector.cleanupRun(runId);

    // Stop session health monitoring
    const healthMonitor = getSessionHealthMonitor();
    healthMonitor.stopMonitoring(session.state.id);

    // Check for pending lint checks (compliance enforcement)
    const lintCheckResult = this.complianceValidator.checkPendingLintChecks(runId);
    if (!lintCheckResult.isCompliant && lintCheckResult.correctiveMessage) {
      this.logger.warn('Run completed with pending lint checks', {
        sessionId: session.state.id,
        runId,
        violations: lintCheckResult.violations.length,
      });
      // Note: We don't block completion, but log the violation for tracking
    }

    // Log compliance summary for the run
    const complianceSummary = this.complianceValidator.getViolationSummary(runId);
    if (complianceSummary.total > 0) {
      this.logger.info('Run compliance summary', {
        sessionId: session.state.id,
        runId,
        totalViolations: complianceSummary.total,
        errors: complianceSummary.errors,
        warnings: complianceSummary.warnings,
        byType: complianceSummary.byType,
      });
    }

    // Clean up safety manager for this run
    this.cleanupSafetyManager(runId);

    // Clean up run timing data
    this.cleanupRunTiming(runId);

    // Complete debug trace
    const activeTrace = this.debugger.getActiveTrace();
    if (activeTrace && activeTrace.runId === runId) {
      this.debugger.completeTrace(activeTrace.traceId, 'completed');
      this.emitDebugTraceComplete(activeTrace, session.state.id, runId, 'completed');
    }

    session.state.status = 'idle';
    session.state.activeRunId = undefined;
    session.agenticContext = undefined;

    this.updateSessionState(session.state.id, {
      status: 'idle',
      activeRunId: undefined,
      messages: session.state.messages, // Ensure messages with usage are persisted
      updatedAt: Date.now(),
    });

    this.emitEvent({
      type: 'run-status',
      sessionId: session.state.id,
      runId,
      status: 'idle',
      timestamp: Date.now(),
    });
    this.emitEvent({ type: 'session-state', session: session.state });
  }

  private handleRunError(session: InternalSession, runId: string, error: Error): void {
    this.completeAnalysisProgress(session, runId, 'error');
    this.logger.error('Run failed', { sessionId: session.state.id, runId, error: error.message });

    // Complete metrics tracking with error status
    agentMetrics.completeRun(runId, 'error');

    // Record model quality metrics for failed run
    const modelId = session.state.config.selectedModelId || session.state.config.manualOverrideModel;
    const provider = session.agenticContext?.currentProvider || session.state.config.preferredProvider;
    if (modelId && provider && provider !== 'auto') {
      const qualityTracker = getModelQualityTracker();
      qualityTracker.recordPerformance({
        modelId,
        provider: provider as LLMProviderName,
        success: false,
        responseTimeMs: 0,
        tokensUsed: 0,
        loopDetected: false,
        complianceViolation: false,
      });
    }

    // Build a more helpful error message based on the error type
    let userFriendlyMessage = error.message;
    const errorLower = error.message.toLowerCase();
    
    // Check for common error patterns and provide actionable advice
    if (isToolSupportError(error)) {
      const modelName = modelId || 'The selected model';
      userFriendlyMessage = `${modelName} does not support tool/function calling.\n\nTo resolve: Select a model that supports tools. In the model selector, look for models with tool support (e.g., Claude, GPT-4, Gemini Pro, or paid OpenRouter models).`;
    } else if (errorLower.includes('insufficient') || errorLower.includes('credits') || errorLower.includes('balance')) {
      const providerName = provider || 'the provider';
      userFriendlyMessage = `${error.message}\n\nTo resolve: Add credits to your ${providerName} account, or switch to a different provider in Settings.`;
    } else if (errorLower.includes(':free') || (modelId && modelId.includes(':free'))) {
      userFriendlyMessage = `${error.message}\n\nNote: Free-tier models have strict rate limits. Consider using a paid model for more reliable performance.`;
    } else if (errorLower.includes('provider returned error') || errorLower.includes('upstream error')) {
      userFriendlyMessage = `${error.message}\n\nThe model provider encountered an error. This may be temporary - try again in a moment, or switch to a different model.`;
    }

    // Clean up loop detection state
    const loopDetector = getLoopDetector();
    loopDetector.cleanupRun(runId);

    // Stop session health monitoring
    const healthMonitor = getSessionHealthMonitor();
    healthMonitor.stopMonitoring(session.state.id);

    // Clean up safety manager for this run
    this.cleanupSafetyManager(runId);

    // Clean up run timing data
    this.cleanupRunTiming(runId);

    // Complete debug trace with failure and record error
    const activeTrace = this.debugger.getActiveTrace();
    if (activeTrace && activeTrace.runId === runId) {
      this.debugger.recordError(activeTrace.traceId, {
        message: error.message,
        stack: error.stack,
        recovered: false,
      });
      this.debugger.completeTrace(activeTrace.traceId, 'failed');
      this.emitDebugTraceComplete(activeTrace, session.state.id, runId, 'failed');

      // Emit debug error event
      this.emitDebugError(activeTrace.traceId, session.state.id, runId, error);
    }

    session.state.status = 'error';
    session.state.activeRunId = undefined;
    session.agenticContext = undefined;

    this.updateSessionState(session.state.id, {
      status: 'error',
      activeRunId: undefined,
      messages: session.state.messages, // Ensure messages with usage are persisted
      updatedAt: Date.now(),
    });

    this.emitEvent({
      type: 'run-status',
      sessionId: session.state.id,
      runId,
      status: 'error',
      message: userFriendlyMessage,
      timestamp: Date.now(),
    });
    this.emitEvent({ type: 'session-state', session: session.state });
  }

  // ==========================================================================
  // Debug Event Emission Helpers
  // ==========================================================================

  private emitDebugTraceStart(trace: AgentTrace, sessionId: string, runId: string): void {
    if (!this.debugEnabled) return;

    const event: DebugTraceStartEvent = {
      type: 'debug:trace-start',
      traceId: trace.traceId,
      sessionId,
      runId,
      timestamp: Date.now(),
    };
    this.emitEvent(event);
  }

  private emitDebugTraceComplete(trace: AgentTrace, sessionId: string, runId: string, status: 'completed' | 'failed'): void {
    if (!this.debugEnabled) return;

    const event: DebugTraceCompleteEvent = {
      type: 'debug:trace-complete',
      traceId: trace.traceId,
      sessionId,
      runId,
      timestamp: Date.now(),
      status,
      durationMs: trace.durationMs ?? 0,
      metrics: {
        totalSteps: trace.metrics.totalSteps,
        llmCalls: trace.metrics.llmCalls,
        toolCalls: trace.metrics.toolCalls,
        successfulToolCalls: trace.metrics.successfulToolCalls,
        failedToolCalls: trace.metrics.failedToolCalls,
        totalInputTokens: trace.metrics.totalInputTokens,
        totalOutputTokens: trace.metrics.totalOutputTokens,
        avgLLMDurationMs: trace.metrics.avgLLMDurationMs,
        avgToolDurationMs: trace.metrics.avgToolDurationMs,
        toolUsage: trace.metrics.toolUsage,
      },
    };
    this.emitEvent(event);
  }

  private emitDebugLLMCall(
    traceId: string,
    sessionId: string,
    runId: string,
    stepNumber: number,
    provider: LLMProviderName,
    model: string,
    promptTokens: number,
    outputTokens: number,
    durationMs: number,
    messageCount: number,
    toolCount: number,
    finishReason: string | undefined,
    hasToolCalls: boolean,
    contentPreview: string
  ): void {
    if (!this.debugEnabled) return;

    // Record in the debugger trace for metrics tracking
    this.debugger.recordLLMCall(
      traceId,
      {
        provider,
        model,
        messageCount,
        toolCount,
        promptTokens,
        systemPromptHash: '', // Not tracked currently - would need system prompt access
      },
      {
        outputTokens,
        hasToolCalls,
        finishReason: finishReason || 'unknown',
        contentPreview: contentPreview.slice(0, 200),
      },
      durationMs
    );

    const event: DebugLLMCallEvent = {
      type: 'debug:llm-call',
      traceId,
      sessionId,
      runId,
      timestamp: Date.now(),
      stepNumber,
      provider,
      model,
      promptTokens,
      outputTokens,
      durationMs,
      messageCount,
      toolCount,
      finishReason,
      hasToolCalls,
      contentPreview: contentPreview.slice(0, 200),
    };
    this.emitEvent(event);
  }

  private emitDebugToolCall(
    traceId: string,
    sessionId: string,
    runId: string,
    stepNumber: number,
    toolName: string,
    callId: string,
    argumentsPreview: string,
    requiresApproval: boolean
  ): void {
    if (!this.debugEnabled) return;

    // Record in the debugger trace for metrics tracking
    this.debugger.recordToolCall(traceId, {
      name: toolName,
      callId,
      arguments: {}, // Full args tracked separately
      argumentsPreview: argumentsPreview.slice(0, 300),
      requiresApproval,
    });

    const event: DebugToolCallEvent = {
      type: 'debug:tool-call',
      traceId,
      sessionId,
      runId,
      timestamp: Date.now(),
      stepNumber,
      toolName,
      callId,
      argumentsPreview: argumentsPreview.slice(0, 300),
      requiresApproval,
    };
    this.emitEvent(event);
  }

  private emitDebugToolResult(
    traceId: string,
    sessionId: string,
    runId: string,
    stepNumber: number,
    toolName: string,
    callId: string,
    success: boolean,
    durationMs: number,
    outputPreview: string,
    outputSize: number,
    errorMessage?: string
  ): void {
    if (!this.debugEnabled) return;

    // Find the matching tool call step ID to associate the result
    const trace = this.debugger.getTrace(traceId);
    const toolCallStep = trace?.steps.find(
      s => s.type === 'tool-call' && s.toolCall?.callId === callId
    );

    // Record in the debugger trace for metrics tracking
    this.debugger.recordToolResult(
      traceId,
      toolCallStep?.stepId || '',
      {
        success,
        outputPreview: outputPreview.slice(0, 500),
        outputSize,
        errorMessage,
      },
      durationMs
    );

    const event: DebugToolResultEvent = {
      type: 'debug:tool-result',
      traceId,
      sessionId,
      runId,
      timestamp: Date.now(),
      stepNumber,
      toolName,
      callId,
      success,
      durationMs,
      outputPreview: outputPreview.slice(0, 300),
      outputSize,
      errorMessage,
    };
    this.emitEvent(event);
  }

  private emitDebugError(traceId: string, sessionId: string, runId: string, error: Error): void {
    if (!this.debugEnabled) return;

    const activeTrace = this.debugger.getTrace(traceId);
    const event: DebugErrorEvent = {
      type: 'debug:error',
      traceId,
      sessionId,
      runId,
      timestamp: Date.now(),
      stepNumber: activeTrace?.metrics.totalSteps ?? 0,
      message: error.message,
      stack: error.stack,
      recovered: false,
    };
    this.emitEvent(event);
  }

  /**
   * Get debug traces for a session (for IPC)
   */
  getDebugTracesForSession(sessionId: string): AgentTrace[] {
    return this.debugger.getTracesForSession(sessionId);
  }

  /**
   * Get the current active trace
   */
  getActiveDebugTrace(): AgentTrace | null {
    return this.debugger.getActiveTrace();
  }

  /**
   * Toggle debug mode
   */
  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  /**
   * Export a trace to the specified format
   */
  exportTrace(traceId: string, format: 'json' | 'markdown' | 'html' = 'json'): string | null {
    try {
      return this.debugger.exportTrace(traceId, { format });
    } catch (error) {
      this.logger.error('Failed to export trace', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  /**
   * Update debug configuration
   */
  updateDebugConfig(config: {
    verbose?: boolean;
    captureFullPayloads?: boolean;
    stepMode?: boolean;
    exportOnError?: boolean;
    exportFormat?: 'json' | 'markdown';
  }): void {
    this.debugger.updateConfig(config);
  }

  /**
   * Get trace by ID
   */
  getTrace(traceId: string): AgentTrace | undefined {
    return this.debugger.getTrace(traceId);
  }

  /**
   * Clear all traces for a session
   */
  clearTracesForSession(sessionId: string): number {
    return this.debugger.deleteTracesForSession(sessionId);
  }

  /**
   * Get current debug configuration
   */
  getDebugConfig() {
    return this.debugger.getConfig();
  }

  /**
   * Get all traces across all sessions
   */
  getAllTraces(): AgentTrace[] {
    return this.debugger.getAllTraces();
  }

  /**
   * Build terminal context for system prompt
   * Provides agent with visibility into active/recent terminal processes
   */
  private buildTerminalContext(workspacePath?: string): TerminalContextInfo | undefined {
    try {
      // Get terminal settings
      const terminalSettings = this.getTerminalSettings() ?? DEFAULT_TERMINAL_SETTINGS;

      // Build process list from terminal manager
      const processes: TerminalProcessInfo[] = [];

      if (this.terminalManager.listProcesses) {
        const rawProcesses = this.terminalManager.listProcesses();

        // Limit to most recent 10 processes to avoid token bloat
        const recentProcesses = rawProcesses.slice(-10);

        for (const proc of recentProcesses) {
          const processInfo: TerminalProcessInfo = {
            pid: proc.pid,
            command: proc.command,
            isRunning: proc.isRunning,
            description: proc.description,
          };

          // Get additional state if available
          const output = this.terminalManager.getOutput(proc.pid);
          if (output) {
            processInfo.exitCode = output.exitCode;
            if (output.finishedAt && output.startedAt) {
              processInfo.durationMs = output.finishedAt - output.startedAt;
            }
            // Include recent output for running processes (truncated)
            if (proc.isRunning && output.stdout) {
              processInfo.recentOutput = output.stdout.slice(-500);
            }
          }

          processes.push(processInfo);
        }
      }

      // Determine default shell based on settings and platform
      const isWindows = process.platform === 'win32';
      let defaultShell: string;

      if (terminalSettings.defaultShell === 'system') {
        defaultShell = isWindows ? 'PowerShell' : (process.env.SHELL || '/bin/bash');
      } else {
        defaultShell = terminalSettings.defaultShell;
      }

      return {
        processes,
        settings: terminalSettings,
        defaultShell,
        cwd: workspacePath,
      };
    } catch (error) {
      this.logger.error('Failed to build terminal context', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Build workspace structure context for system prompt
   * Detects project type, framework, and key directories
   */
  private async buildWorkspaceStructureContext(
    workspacePath?: string
  ): Promise<WorkspaceStructureContext | undefined> {
    if (!workspacePath) {
      return undefined;
    }

    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');

      // Check for common config files to detect project type
      const configFiles: string[] = [];
      const sourceDirectories: string[] = [];
      const testDirectories: string[] = [];
      let projectType: string | undefined;
      let framework: string | undefined;
      let packageManager: string | undefined;

      // Common files to check
      const filesToCheck = [
        'package.json', 'tsconfig.json', 'vite.config.ts', 'vite.config.js',
        'next.config.js', 'next.config.mjs', 'next.config.ts',
        'angular.json', 'vue.config.js', 'svelte.config.js',
        'Cargo.toml', 'go.mod', 'requirements.txt', 'pyproject.toml',
        '.eslintrc.js', '.eslintrc.json', '.prettierrc',
        'pnpm-lock.yaml', 'yarn.lock', 'package-lock.json', 'bun.lockb',
      ];

      for (const file of filesToCheck) {
        try {
          await fs.access(path.join(workspacePath, file));
          configFiles.push(file);
        } catch {
          // File doesn't exist, skip
        }
      }

      // Detect project type and framework from config files
      if (configFiles.includes('package.json')) {
        projectType = 'javascript';
        if (configFiles.includes('tsconfig.json')) {
          projectType = 'typescript';
        }
        
        // Detect framework
        if (configFiles.some(f => f.startsWith('next.config'))) {
          framework = 'Next.js';
        } else if (configFiles.some(f => f.startsWith('vite.config'))) {
          framework = 'Vite';
        } else if (configFiles.includes('angular.json')) {
          framework = 'Angular';
        } else if (configFiles.includes('vue.config.js')) {
          framework = 'Vue';
        } else if (configFiles.includes('svelte.config.js')) {
          framework = 'Svelte';
        }
      } else if (configFiles.includes('Cargo.toml')) {
        projectType = 'rust';
      } else if (configFiles.includes('go.mod')) {
        projectType = 'go';
      } else if (configFiles.includes('requirements.txt') || configFiles.includes('pyproject.toml')) {
        projectType = 'python';
      }

      // Detect package manager
      if (configFiles.includes('pnpm-lock.yaml')) {
        packageManager = 'pnpm';
      } else if (configFiles.includes('yarn.lock')) {
        packageManager = 'yarn';
      } else if (configFiles.includes('bun.lockb')) {
        packageManager = 'bun';
      } else if (configFiles.includes('package-lock.json')) {
        packageManager = 'npm';
      }

      // Check for common directories
      const dirsToCheck = ['src', 'lib', 'app', 'pages', 'components', 'test', 'tests', '__tests__', 'spec'];
      for (const dir of dirsToCheck) {
        try {
          const stat = await fs.stat(path.join(workspacePath, dir));
          if (stat.isDirectory()) {
            if (['test', 'tests', '__tests__', 'spec'].includes(dir)) {
              testDirectories.push(dir);
            } else {
              sourceDirectories.push(dir);
            }
          }
        } catch {
          // Directory doesn't exist, skip
        }
      }

      // Only return if we found useful info
      if (!projectType && configFiles.length === 0 && sourceDirectories.length === 0) {
        return undefined;
      }

      return {
        projectType,
        framework,
        packageManager,
        configFiles: configFiles.slice(0, 10),
        sourceDirectories: sourceDirectories.slice(0, 5),
        testDirectories: testDirectories.slice(0, 3),
      };
    } catch (error) {
      this.logger.error('Failed to build workspace structure context', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Collect all tools used in a session
   */
  private collectToolsFromSession(session: InternalSession): string[] {
    const tools = new Set<string>();
    
    for (const message of session.state.messages) {
      if (message.toolCalls) {
        for (const toolCall of message.toolCalls) {
          tools.add(toolCall.name);
        }
      }
    }
    
    return Array.from(tools);
  }

  /**
   * Generate tags for experience categorization
   */
  private generateExperienceTags(
    _session: InternalSession, 
    context?: AgenticContext
  ): string[] {
    const tags: string[] = [];
    
    // Add context tags
    if (context?.filesModified && context.filesModified.length > 0) {
      tags.push('modified-files');
      // Add file extension tags
      const extensions = new Set(
        context.filesModified.map(f => {
          const ext = f.split('.').pop();
          return ext ? `ext:${ext}` : null;
        }).filter(Boolean) as string[]
      );
      tags.push(...extensions);
    }
    
    if (context?.commandsExecuted && context.commandsExecuted.length > 0) {
      tags.push('ran-commands');
    }
    
    // Add iteration count category
    const iterations = context?.iteration || 1;
    if (iterations === 1) {
      tags.push('single-turn');
    } else if (iterations <= 5) {
      tags.push('few-turns');
    } else {
      tags.push('many-turns');
    }
    
    return tags;
  }
}