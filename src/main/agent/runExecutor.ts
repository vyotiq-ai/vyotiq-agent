import { randomUUID } from 'node:crypto';
import type {
  AgentEvent,
  ChatMessage,
  LLMProviderName,
  RendererEvent,
  ToolCallPayload,
  ProviderSettings,
  SafetySettings,
  CacheSettings,
  PromptSettings,
  ComplianceSettings,
  RoutingDecision,
  ToolConfigSettings,
  TaskRoutingSettings,
} from '../../shared/types';
import type { InternalSession, AgenticContext } from './types';
import type { Logger } from '../logger';
import type { ProviderMap } from './providers';
import type { ToolRegistry, TerminalManager } from '../tools';
import type { WorkspaceManager } from '../workspaces/workspaceManager';
import type { LLMProvider, ProviderRequest } from './providers/baseProvider';
import { ContextWindowManager, ConversationSummarizer } from './context';
import { AgentDebugger, type AgentTrace } from './debugging';
import { ComplianceValidator, PromptOptimizer } from './compliance';
import { agentMetrics } from './metrics';
import type { DebugSettings, AccessLevelSettings } from '../../shared/types';
import { getLoopDetector } from './loopDetection';
import { getModelQualityTracker } from './modelQuality';
import { getSessionHealthMonitor } from './sessionHealth';
import { validateMessages } from './utils/messageUtils';
import { isQuotaOrBillingError, shouldTryFallback, isToolSupportError } from './utils/errorUtils';
import { setSessionRunning } from '../ipc/eventBatcher';
import { getThrottleController } from './performance/BackgroundThrottleController';
import { getThrottleEventLogger } from './performance/ThrottleEventLogger';

// Execution modules
import { ProgressTracker } from './execution/progressTracker';
import { ProviderSelector } from './execution/providerSelector';
import { ContextBuilder } from './execution/contextBuilder';
import { DebugEmitter } from './execution/debugEmitter';
import { RunLifecycleManager } from './execution/runLifecycle';
import { StreamHandler } from './execution/streamHandler';
import { IterationRunner } from './execution/iterationRunner';
import { ToolQueueProcessor } from './execution/toolQueueProcessor';
import { SessionQueueManager } from './execution/sessionQueueManager';
import { PauseResumeManager } from './execution/pauseResumeManager';
import { RequestBuilder } from './execution/requestBuilder';
import { WorkspaceResourceManager } from './execution/workspaceResourceManager';

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
  getToolSettings?: () => ToolConfigSettings | undefined;
  getTaskRoutingSettings?: () => TaskRoutingSettings | undefined;
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
      fileName: string;
      line: number;
      column: number;
      endLine?: number;
      endColumn?: number;
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
  onProviderHealth?: (provider: LLMProviderName, success: boolean, latencyMs: number) => void;
  /** Workspace resource manager for multi-workspace concurrent session support */
  workspaceResourceManager?: WorkspaceResourceManager;
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
  private readonly getToolSettings: () => ToolConfigSettings | undefined;
  private readonly getTaskRoutingSettings: () => TaskRoutingSettings | undefined;
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
      fileName: string;
      line: number;
      column: number;
      endLine?: number;
      endColumn?: number;
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

  // Provider health tracking (can be set after construction)
  private onProviderHealth?: (provider: LLMProviderName, success: boolean, latencyMs: number) => void;

  // Workspace resource manager for multi-workspace concurrent sessions
  private readonly workspaceResourceManager?: WorkspaceResourceManager;

  // Default iteration settings
  private readonly defaultMaxIterations = 20;
  private readonly defaultMaxRetries = 2;
  private readonly defaultRetryDelayMs = 1500;

  // Context window management
  private contextManager: ContextWindowManager;
  private conversationSummarizer: ConversationSummarizer;

  // Debug infrastructure
  private debugger: AgentDebugger;
  private debugEnabled = true;

  // Compliance infrastructure
  private complianceValidator: ComplianceValidator;
  private promptOptimizer: PromptOptimizer;

  // Execution modules
  private readonly progressTracker: ProgressTracker;
  private readonly providerSelector: ProviderSelector;
  private readonly contextBuilder: ContextBuilder;
  private readonly debugEmitter: DebugEmitter;
  private readonly lifecycleManager: RunLifecycleManager;
  private readonly streamHandler: StreamHandler;
  private readonly iterationRunner: IterationRunner;
  private readonly toolQueueProcessor: ToolQueueProcessor;
  private readonly sessionQueueManager: SessionQueueManager;
  private readonly pauseResumeManager: PauseResumeManager;
  private readonly requestBuilder: RequestBuilder;

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
    this.getToolSettings = deps.getToolSettings ?? (() => undefined);
    this.getTaskRoutingSettings = deps.getTaskRoutingSettings ?? (() => undefined);
    this.getEditorState = deps.getEditorState;
    this.getWorkspaceDiagnostics = deps.getWorkspaceDiagnostics;
    this.onProviderHealth = deps.onProviderHealth;
    this.workspaceResourceManager = deps.workspaceResourceManager;

    // Initialize debugger
    const debugSettings = this.getDebugSettings();
    this.debugger = new AgentDebugger({
      verbose: debugSettings?.verboseLogging ?? process.env.NODE_ENV === 'development',
      captureFullPayloads: debugSettings?.captureFullPayloads ?? false,
      stepMode: debugSettings?.stepByStepMode ?? false,
      exportOnError: debugSettings?.autoExportOnError ?? true,
      exportFormat: debugSettings?.traceExportFormat ?? 'json',
    });
    this.debugEnabled = debugSettings?.verboseLogging ?? true;

    // Initialize context manager
    this.contextManager = new ContextWindowManager('deepseek');
    this.conversationSummarizer = new ConversationSummarizer({
      minMessagesForSummary: 100,
      keepRecentMessages: 40,
      maxToolResultTokens: 1200,
    });

    // Initialize compliance validator
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

    this.promptOptimizer = new PromptOptimizer();

    // Initialize execution modules
    this.progressTracker = new ProgressTracker(this.emitEvent);
    this.providerSelector = new ProviderSelector(this.providers, this.logger);
    this.contextBuilder = new ContextBuilder(this.terminalManager, this.logger);
    this.debugEmitter = new DebugEmitter(this.emitEvent, this.debugger, this.debugEnabled);
    this.lifecycleManager = new RunLifecycleManager(
      this.logger,
      this.emitEvent,
      this.progressTracker,
      this.debugEmitter,
      this.debugger,
      this.updateSessionState
    );
    this.streamHandler = new StreamHandler(this.logger, this.emitEvent, this.updateSessionState);
    this.iterationRunner = new IterationRunner(
      this.logger,
      this.emitEvent,
      this.progressTracker,
      this.debugEmitter,
      this.streamHandler,
      this.updateSessionState,
      () => this.onProviderHealth
    );
    this.toolQueueProcessor = new ToolQueueProcessor(
      this.toolRegistry,
      this.terminalManager,
      this.workspaceManager,
      this.logger,
      this.emitEvent,
      this.progressTracker,
      this.debugEmitter,
      this.complianceValidator,
      this.updateSessionState,
      this.getAccessLevelSettings,
      this.activeControllers,
      this.getToolSettings,
      this.getSafetySettings
    );
    this.sessionQueueManager = new SessionQueueManager(
      this.logger,
      (session) => this.runSessionExecution(session)
    );
    this.pauseResumeManager = new PauseResumeManager(this.logger, this.emitEvent);
    this.requestBuilder = new RequestBuilder(
      this.toolRegistry,
      this.workspaceManager,
      this.logger,
      this.contextBuilder,
      this.complianceValidator,
      this.promptOptimizer,
      this.getProviderSettings,
      this.getCacheSettings,
      this.getPromptSettings,
      this.getAccessLevelSettings,
      this.emitEvent,
      this.getEditorState,
      this.getWorkspaceDiagnostics
    );
  }

  /**
   * Get iteration settings from session config
   * This is called on each iteration to support real-time updates to maxIterations
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
   * Get current maxIterations from session config (for dynamic updates during run)
   */
  private getCurrentMaxIterations(session: InternalSession): number {
    return session.state.config.maxIterations ?? this.defaultMaxIterations;
  }

  /**
   * Update conversation summarizer for session
   */
  private updateSummarizerForSession(session: InternalSession): void {
    const config = session.state.config;
    if (config.enableContextSummarization === false) {
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
    this.providerSelector.updateProviders(providers);
  }

  /**
   * Set the provider health callback for tracking success/failure and latency.
   * This is called after ProviderManager is initialized.
   */
  setProviderHealthCallback(
    callback: (provider: LLMProviderName, success: boolean, latencyMs: number) => void
  ): void {
    this.onProviderHealth = callback;
  }

  /**
   * Validated session state update
   */
  private safeUpdateSessionState(
    sessionId: string,
    update: Partial<InternalSession['state']>
  ): void {
    if (update.messages && Array.isArray(update.messages)) {
      const validation = validateMessages(update.messages);
      if (!validation.valid) {
        const invalidMsg = update.messages[validation.invalidIndex!];
        this.logger.error('Invalid message in state update', {
          sessionId,
          invalidIndex: validation.invalidIndex,
          message: { id: invalidMsg?.id, role: invalidMsg?.role, createdAt: invalidMsg?.createdAt },
        });
        return;
      }
    }
    this.updateSessionState(sessionId, update);
  }

  async executeRun(session: InternalSession): Promise<void> {
    return this.sessionQueueManager.queueExecution(session);
  }

  clearSessionQueue(sessionId: string): number {
    return this.sessionQueueManager.clearSessionQueue(sessionId);
  }

  getQueueStats(): { totalSessions: number; totalQueued: number; sessionsProcessing: number } {
    return this.sessionQueueManager.getQueueStats();
  }

  /**
   * Continue a run after tool confirmation
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
      controller = new AbortController();
      this.activeControllers.set(session.state.id, controller);
    }

    if (this.pauseResumeManager.isRunPaused(session.state.id)) {
      this.logger.info('Auto-resuming paused session after tool confirmation', {
        sessionId: session.state.id,
        runId,
      });
      this.pauseResumeManager.resumeRun(session.state.id);
    }

    this.logger.info('Continuing run after tool confirmation', {
      sessionId: session.state.id,
      runId,
    });

    // Note: maxIterations is read dynamically in the loop to support real-time updates

    try {
      let providerForContinuation: LLMProvider | null = null;
      const preferredProviderName = session.agenticContext?.currentProvider;
      if (preferredProviderName) {
        const info = this.providers.get(preferredProviderName);
        const isInCooldown = this.providerSelector.isProviderInCooldown(preferredProviderName);
        if (info?.provider && info.enabled && info.hasApiKey && !isInCooldown) {
          providerForContinuation = info.provider;
        }
      }

      if (!providerForContinuation) {
        const taskRoutingSettings = this.getTaskRoutingSettings();
        const { primary } = await this.providerSelector.selectProvidersWithFallback(
          session, 
          undefined, 
          taskRoutingSettings
        );
        providerForContinuation = primary;
      }

      if (!providerForContinuation) {
        throw new Error('No available provider to continue run');
      }

      const startIteration = session.agenticContext?.iteration || 1;
      let iteration = startIteration;

      // Use dynamic maxIterations that can be updated during run
      while (iteration < this.getCurrentMaxIterations(session) && !controller.signal.aborted) {
        iteration++;
        // Re-read maxIterations on each iteration to support real-time updates
        const currentMaxIterations = this.getCurrentMaxIterations(session);

        await this.pauseResumeManager.waitIfPaused(session.state.id);

        if (controller.signal.aborted) break;

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

        if (session.agenticContext) {
          session.agenticContext.iteration = iteration;
        }

        healthMonitor.updateIteration(session.state.id, iteration);

        const iterationModelId = this.requestBuilder.getEffectiveModelId(
          session,
          providerForContinuation,
          runId,
          session.agenticContext?.routingDecision
        );
        this.progressTracker.emitIterationStatus(
          session.state.id,
          runId,
          iteration,
          currentMaxIterations,
          'executing',
          providerForContinuation.name,
          iterationModelId ?? undefined
        );

        this.progressTracker.startIterationProgress(session, runId, iteration, providerForContinuation.name);

        try {
          const buildRequest = (): Promise<ProviderRequest> => 
            this.requestBuilder.buildProviderRequest(session, providerForContinuation!, this.updateSessionState);
          const result = await this.iterationRunner.runIteration(
            session,
            providerForContinuation,
            controller,
            runId,
            iteration,
            buildRequest,
            () => this.toolQueueProcessor.processToolQueue(session),
            (s, p, r, rd) => this.requestBuilder.getEffectiveModelId(s, p, r, rd)
          );
          const iterationStatus = result === 'cancelled' ? 'error' : 'success';
          this.progressTracker.finishIterationProgress(session, runId, iteration, iterationStatus);

          if (result === 'completed' || result === 'cancelled') break;
          if (result === 'awaiting-confirmation') return;
        } catch (error) {
          this.progressTracker.finishIterationProgress(session, runId, iteration, 'error');
          throw error;
        }
      }

      // Use final maxIterations value (may have been updated during run)
      const finalMaxIterations = this.getCurrentMaxIterations(session);
      if (iteration >= finalMaxIterations) {
        this.logger.warn('Max iterations reached after confirmation', {
          sessionId: session.state.id,
          runId,
          maxIterations: finalMaxIterations,
        });
        this.emitEvent({
          type: 'agent-status',
          sessionId: session.state.id,
          status: 'error',
          message: `Maximum iterations (${finalMaxIterations}) reached. The agent stopped to prevent an infinite loop.`,
          timestamp: Date.now(),
        });
      }

      this.completeRun(session, runId);
    } catch (error) {
      this.handleRunError(session, runId, error as Error);
    }
  }

  /**
   * Execute a single session run
   */
  private async runSessionExecution(session: InternalSession): Promise<void> {
    const runId = randomUUID();
    const controller = new AbortController();
    this.activeControllers.set(session.state.id, controller);

    // Register session with workspace resource manager for concurrent session tracking
    if (this.workspaceResourceManager) {
      const registration = this.workspaceResourceManager.registerSession(session);
      if (!registration.acquired) {
        this.logger.warn('Failed to register session with workspace resource manager', {
          sessionId: session.state.id,
          workspaceId: session.state.workspaceId,
          reason: registration.reason,
        });
        // Emit error but continue - resource manager is advisory
        this.emitEvent({
          type: 'agent-status',
          sessionId: session.state.id,
          status: 'error',
          message: `Resource warning: ${registration.reason || 'Workspace session limit reached'}`,
          timestamp: Date.now(),
        });
      }
    }

    session.state.status = 'running';
    session.state.activeRunId = runId;
    session.agenticContext = this.createAgenticContext(runId);
    this.progressTracker.startAnalysisProgress(session, runId);

    // Notify IPC event batcher that agent is running to disable background throttling
    // This ensures responsive streaming during agent execution
    setSessionRunning(session.state.id, true);
    
    // Notify throttle controller for coordinated throttle bypass
    const throttleController = getThrottleController();
    const throttleLogger = getThrottleEventLogger();
    if (throttleController) {
      throttleController.setAgentRunning(session.state.id, true);
      throttleLogger.logAgentStarted(session.state.id, throttleController.getRunningSessions().length);
    }

    // Initialize compliance tracking
    const lastUserMessage = session.state.messages.filter(m => m.role === 'user').pop();
    const userRequest = lastUserMessage?.content || '';
    this.complianceValidator.initializeRun(runId, session.state.id, userRequest);

    // Initialize loop detection
    const loopDetector = getLoopDetector();
    loopDetector.initializeRun(runId, session.state.id);

    // Initialize session health monitoring
    const healthMonitor = getSessionHealthMonitor();
    const modelId = this.requestBuilder.getEffectiveModelId(
      session,
      { name: session.state.config.preferredProvider as LLMProviderName } as LLMProvider,
      runId
    ) || 'unknown';
    healthMonitor.startMonitoring(
      session.state.id,
      runId,
      session.state.config.preferredProvider as LLMProviderName || 'deepseek',
      modelId,
      session.state.config.maxIterations ?? this.defaultMaxIterations,
      this.requestBuilder.getMaxInputTokens()
    );

    // Update user message with runId
    const lastUserMessageIndex = session.state.messages.findLastIndex(m => m.role === 'user');
    if (lastUserMessageIndex !== -1) {
      session.state.messages[lastUserMessageIndex] = {
        ...session.state.messages[lastUserMessageIndex],
        runId,
      };
    }

    this.emitEvent({ type: 'session-state', session: session.state });
    this.updateSummarizerForSession(session);

    const { maxIterations } = this.getIterationSettings(session);

    // Start debug trace
    const trace = this.debugger.startTrace(session.state.id, runId);
    this.debugEmitter.emitTraceStart(trace, session.state.id, runId);

    this.emitEvent({
      type: 'run-status',
      sessionId: session.state.id,
      runId,
      status: 'running',
      timestamp: Date.now(),
    });

    try {
      const taskRoutingSettings = this.getTaskRoutingSettings();
      const { primary, fallback, allAvailable, routingDecision }: { 
        primary: LLMProvider | null; 
        fallback: LLMProvider | null; 
        allAvailable: LLMProvider[]; 
        routingDecision?: RoutingDecision;
      } = await this.providerSelector.selectProvidersWithFallback(
        session, 
        undefined, 
        taskRoutingSettings
      );

      if (routingDecision && session.agenticContext) {
        session.agenticContext.routingDecision = routingDecision;
      }

      if (!primary) {
        const preferredProvider = session.state.config.preferredProvider;
        const cooldownInfo = preferredProvider && preferredProvider !== 'auto'
          ? this.providerSelector.getProviderCooldownInfo(preferredProvider as LLMProviderName)
          : null;

        let errorMsg: string;
        if (cooldownInfo && cooldownInfo.remainingMs > 0) {
          const remainingSecs = Math.ceil(cooldownInfo.remainingMs / 1000);
          errorMsg = `Provider "${preferredProvider}" is temporarily unavailable (cooldown: ${remainingSecs}s remaining). ` +
            `Switch to "Auto" mode or select a different provider to continue.`;
        } else {
          errorMsg = 'No available provider. Please configure at least one LLM provider with an API key in Settings.';
        }

        this.emitEvent({
          type: 'agent-status',
          sessionId: session.state.id,
          status: 'error',
          message: errorMsg,
          timestamp: Date.now(),
        });

        throw new Error(errorMsg);
      }

      agentMetrics.startRun(runId, session.state.id, primary.name, maxIterations);
      this.progressTracker.initRunTiming(runId);

      let currentProvider = primary;
      let usedFallback = false;
      let providerIndex = 0;
      let iteration = 0;

      // Use dynamic maxIterations that can be updated during run
      while (iteration < this.getCurrentMaxIterations(session) && !controller.signal.aborted) {
        iteration++;
        // Re-read maxIterations on each iteration to support real-time updates
        const currentMaxIterations = this.getCurrentMaxIterations(session);

        await this.pauseResumeManager.waitIfPaused(session.state.id);

        if (controller.signal.aborted) break;

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

        if (session.agenticContext) {
          session.agenticContext.iteration = iteration;
        }

        healthMonitor.updateIteration(session.state.id, iteration);
        agentMetrics.recordIteration(runId);

        const iterationModelId = this.requestBuilder.getEffectiveModelId(
          session,
          currentProvider,
          runId,
          session.agenticContext?.routingDecision
        );
        this.progressTracker.emitIterationStatus(
          session.state.id,
          runId,
          iteration,
          currentMaxIterations,
          'executing',
          currentProvider.name,
          iterationModelId ?? undefined
        );

        this.progressTracker.startIterationProgress(session, runId, iteration, currentProvider.name);

        try {
          const result = await this.iterationRunner.runIteration(
            session,
            currentProvider,
            controller,
            runId,
            iteration,
            () => this.requestBuilder.buildProviderRequest(session, currentProvider, this.updateSessionState),
            () => this.toolQueueProcessor.processToolQueue(session),
            (s, p, r, rd) => this.requestBuilder.getEffectiveModelId(s, p, r, rd)
          );
          const iterationStatus = result === 'cancelled' ? 'error' : 'success';
          this.progressTracker.finishIterationProgress(session, runId, iteration, iterationStatus);

          if (result === 'completed' || result === 'cancelled') break;
          if (result === 'awaiting-confirmation') {
            agentMetrics.recordAwaitingConfirmation(runId);
            return;
          }
        } catch (iterationError) {
          this.progressTracker.finishIterationProgress(session, runId, iteration, 'error');

          // If the provider failure is clearly non-recoverable (quota/billing),
          // temporarily cool it down to avoid failing every subsequent run.
          if (isQuotaOrBillingError(iterationError) && currentProvider?.name) {
            this.providerSelector.markProviderCooldown(currentProvider.name, 10 * 60 * 1000, (iterationError as Error).message);
          }

          // Handle provider fallback
          const enableFallback = session.state.config.enableProviderFallback !== false;

          // In Auto mode, try all available providers sequentially
          // Pass isAutoMode=true so rate limit errors also trigger fallback to other providers
          if (enableFallback && allAvailable.length > 1 && shouldTryFallback(iterationError, true)) {
            providerIndex++;
            const nextProvider = allAvailable[providerIndex];

            if (nextProvider && nextProvider !== currentProvider) {
              this.logger.warn('Provider failed, trying next available provider', {
                sessionId: session.state.id,
                runId,
                failedProvider: currentProvider.name,
                nextProvider: nextProvider.name,
                providerIndex,
                totalProviders: allAvailable.length,
                error: (iterationError as Error).message,
              });

              this.emitEvent({
                type: 'agent-status',
                sessionId: session.state.id,
                status: 'recovering',
                message: `Switching to ${nextProvider.name} after ${currentProvider.name} error (${providerIndex}/${allAvailable.length - 1} fallbacks)`,
                timestamp: Date.now(),
              });

              currentProvider = nextProvider;
              usedFallback = true;

              if (session.agenticContext) {
                session.agenticContext.currentProvider = nextProvider.name;
              }

              this.requestBuilder.updateContextManagerForProvider(nextProvider.name);

              // Log new provider's token configuration
              this.logger.info('Fallback provider context configured', {
                provider: nextProvider.name,
                sessionId: session.state.id,
                messageCount: session.state.messages.length,
              });

              iteration--;
              await this.delay(500);
              continue;
            }
          }
          // Legacy fallback support (single fallback provider)
          // Pass isAutoMode=false - rate limits should retry with same provider
          else if (enableFallback && !usedFallback && fallback && shouldTryFallback(iterationError, false)) {
            this.logger.warn('Primary provider failed, switching to fallback', {
              sessionId: session.state.id,
              runId,
              primaryProvider: currentProvider.name,
              fallbackProvider: fallback.name,
              error: (iterationError as Error).message,
            });

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

            this.requestBuilder.updateContextManagerForProvider(fallback.name);

            // Log new provider's token configuration
            this.logger.info('Fallback provider context configured', {
              provider: fallback.name,
              sessionId: session.state.id,
              messageCount: session.state.messages.length,
            });

            iteration--;
            await this.delay(500);
            continue;
          }

          // Re-throw if no fallback or already tried all providers
          // Enhance error message if multiple providers were tried
          if (providerIndex > 0 || usedFallback) {
            const triedProviders = allAvailable.slice(0, providerIndex + 1).map(p => p.name).join(', ');
            const enhancedError = new Error(
              `All configured providers failed. Tried: ${triedProviders}. ` +
              `Last error: ${(iterationError as Error).message}`
            );
            throw enhancedError;
          }
          throw iterationError;
        }
      }

      // Use final maxIterations value (may have been updated during run)
      const finalMaxIterations = this.getCurrentMaxIterations(session);
      if (iteration >= finalMaxIterations) {
        this.lifecycleManager.handleMaxIterationsReached(session, runId, finalMaxIterations);
      }
      this.completeRun(session, runId);
    } catch (error) {
      this.handleRunError(session, runId, error as Error);
    } finally {
      this.activeControllers.delete(session.state.id);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Helper to notify both event batcher and throttle controller when session stops
   */
  private notifySessionStopped(sessionId: string, runDurationMs?: number): void {
    // Notify IPC event batcher
    setSessionRunning(sessionId, false);
    
    // Notify throttle controller
    const throttleController = getThrottleController();
    const throttleLogger = getThrottleEventLogger();
    if (throttleController) {
      throttleController.setAgentRunning(sessionId, false);
      throttleLogger.logAgentStopped(
        sessionId,
        throttleController.getRunningSessions().length,
        runDurationMs ?? 0
      );
    }
  }

  cancelRun(sessionId: string, session: InternalSession): void {
    this.logger.info('cancelRun: Starting cancellation', {
      sessionId,
      hasController: this.activeControllers.has(sessionId),
      sessionStatus: session.state.status,
      activeRunId: session.state.activeRunId
    });

    // Notify IPC event batcher and throttle controller that this session stopped running
    // Re-enables background throttling when no sessions are active
    this.notifySessionStopped(sessionId);

    const clearedFromQueue = this.clearSessionQueue(sessionId);
    if (clearedFromQueue > 0) {
      this.logger.info('cancelRun: Cleared queued executions', { sessionId, clearedFromQueue });
    }

    const controller = this.activeControllers.get(sessionId);
    if (controller) {
      this.logger.info('cancelRun: Aborting controller', { sessionId });
      controller.abort();
      this.activeControllers.delete(sessionId);
    }

    const cancelledRunId = session.state.activeRunId || session.pendingTool?.runId || 'cancelled';
    if (cancelledRunId && cancelledRunId !== 'cancelled') {
      this.progressTracker.completeAnalysisProgress(session, cancelledRunId, 'error');
    }

    this.lifecycleManager.handleIncompleteToolCalls(session);
    this.pauseResumeManager.clearPauseState(sessionId);

    session.pendingTool = undefined;
    session.toolQueue = undefined;
    session.agenticContext = undefined;
    session.state.status = 'idle';
    session.state.activeRunId = undefined;

    this.updateSessionState(sessionId, {
      status: 'idle',
      activeRunId: undefined,
      messages: session.state.messages,
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

  pauseRun(sessionId: string): boolean {
    return this.pauseResumeManager.pauseRun(sessionId, this.activeControllers.has(sessionId));
  }

  resumeRun(sessionId: string): boolean {
    return this.pauseResumeManager.resumeRun(sessionId);
  }

  isRunPaused(sessionId: string): boolean {
    return this.pauseResumeManager.isRunPaused(sessionId);
  }

  isProviderInCooldown(provider: LLMProviderName): boolean {
    return this.providerSelector.isProviderInCooldown(provider);
  }

  getProviderCooldownInfo(provider: LLMProviderName): { until: number; reason: string; remainingMs: number } | null {
    return this.providerSelector.getProviderCooldownInfo(provider);
  }

  async waitIfPaused(sessionId: string): Promise<void> {
    return this.pauseResumeManager.waitIfPaused(sessionId);
  }

  public markToolAborted(session: InternalSession, runId: string, tool: ToolCallPayload): void {
    this.toolQueueProcessor.markToolAborted(session, runId, tool);
  }

  public async executeTool(session: InternalSession, tool: ToolCallPayload, runId: string): Promise<void> {
    return this.toolQueueProcessor.executeTool(session, tool, runId);
  }

  public async processToolQueue(session: InternalSession): Promise<'completed' | 'tool-continue' | 'awaiting-confirmation'> {
    return this.toolQueueProcessor.processToolQueue(session);
  }

  private createAgenticContext(runId: string): AgenticContext {
    return this.lifecycleManager.createAgenticContext(runId);
  }

  private completeRun(session: InternalSession, runId: string): void {
    this.progressTracker.completeAnalysisProgress(session, runId, 'success');
    const lastMessage: ChatMessage | undefined = session.state.messages[session.state.messages.length - 1];
    this.logger.info('Run completed', {
      sessionId: session.state.id,
      runId,
      messageCount: session.state.messages.length,
      lastMessageRole: lastMessage?.role,
    });

    // Calculate run duration from metrics
    const metricsResult = agentMetrics.completeRun(runId, 'completed');
    const runDurationMs = metricsResult?.durationMs ?? 0;

    // Notify IPC event batcher and throttle controller that this session stopped running
    // Re-enables background throttling when no sessions are active
    this.notifySessionStopped(session.state.id, runDurationMs);

    // Unregister session from workspace resource manager
    if (this.workspaceResourceManager) {
      this.workspaceResourceManager.unregisterSession(session);
    }

    if (metricsResult) {
      this.logger.debug('Run metrics recorded', {
        runId,
        durationMs: metricsResult.durationMs,
        iterations: metricsResult.iterations,
      });
    }

    // Record model quality metrics
    const modelId = session.state.config.selectedModelId;
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
        tokensUsed: 0,
        loopDetected: loopState?.circuitBreakerTriggered || false,
        complianceViolation: complianceSummary.errors > 0,
      });
    }

    // Cleanup
    getLoopDetector().cleanupRun(runId);
    getSessionHealthMonitor().stopMonitoring(session.state.id);
    this.toolQueueProcessor.cleanupSafetyManager(runId);
    this.progressTracker.cleanupRunTiming(runId);

    // Complete debug trace
    const activeTrace = this.debugger.getActiveTrace();
    if (activeTrace && activeTrace.runId === runId) {
      this.debugger.completeTrace(activeTrace.traceId, 'completed');
      this.debugEmitter.emitTraceComplete(activeTrace, session.state.id, runId, 'completed');
    }

    session.state.status = 'idle';
    session.state.activeRunId = undefined;
    session.agenticContext = undefined;

    this.updateSessionState(session.state.id, {
      status: 'idle',
      activeRunId: undefined,
      messages: session.state.messages,
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
    this.progressTracker.completeAnalysisProgress(session, runId, 'error');
    this.logger.error('Run failed', { sessionId: session.state.id, runId, error: error.message });

    // Notify IPC event batcher and throttle controller that this session stopped running
    // Re-enables background throttling when no sessions are active
    this.notifySessionStopped(session.state.id);

    // Unregister session from workspace resource manager
    if (this.workspaceResourceManager) {
      this.workspaceResourceManager.unregisterSession(session);
    }

    agentMetrics.completeRun(runId, 'error');

    // Record model quality metrics for failed run
    const modelId = session.state.config.selectedModelId;
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
    } else if (errorLower.includes('no endpoints found matching your data policy') || errorLower.includes('free model training')) {
      userFriendlyMessage = `${error.message}\n\nTo resolve: Visit https://openrouter.ai/settings/privacy and enable "Allow free model training" in your data policy settings, or switch to a paid model.`;
    } else if (errorLower.includes('insufficient') || errorLower.includes('credits') || errorLower.includes('balance')) {
      const providerName = provider || 'the provider';
      userFriendlyMessage = `${error.message}\n\nTo resolve: Add credits to your ${providerName} account, or switch to a different provider in Settings.`;
    } else if (errorLower.includes(':free') || (modelId && modelId.includes(':free'))) {
      userFriendlyMessage = `${error.message}\n\nNote: Free-tier models have strict rate limits. Consider using a paid model for more reliable performance.`;
    } else if (errorLower.includes('provider returned error') || errorLower.includes('upstream error')) {
      userFriendlyMessage = `${error.message}\n\nThe model provider encountered an error. This may be temporary - try again in a moment, or switch to a different model.`;
    }

    // Cleanup
    getLoopDetector().cleanupRun(runId);
    getSessionHealthMonitor().stopMonitoring(session.state.id);
    this.toolQueueProcessor.cleanupSafetyManager(runId);
    this.progressTracker.cleanupRunTiming(runId);

    // Complete debug trace with failure
    const activeTrace = this.debugger.getActiveTrace();
    if (activeTrace && activeTrace.runId === runId) {
      this.debugger.recordError(activeTrace.traceId, {
        message: error.message,
        stack: error.stack,
        recovered: false,
      });
      this.debugger.completeTrace(activeTrace.traceId, 'failed');
      this.debugEmitter.emitTraceComplete(activeTrace, session.state.id, runId, 'failed');
      this.debugEmitter.emitError(activeTrace.traceId, session.state.id, runId, error);
    }

    session.state.status = 'error';
    session.state.activeRunId = undefined;
    session.agenticContext = undefined;

    this.updateSessionState(session.state.id, {
      status: 'error',
      activeRunId: undefined,
      messages: session.state.messages,
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

  // Debug API methods
  getDebugTracesForSession(sessionId: string): AgentTrace[] {
    return this.debugger.getTracesForSession(sessionId);
  }

  getActiveDebugTrace(): AgentTrace | null {
    return this.debugger.getActiveTrace();
  }

  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
    this.debugEmitter.setDebugEnabled(enabled);
  }

  exportTrace(traceId: string, format: 'json' | 'markdown' | 'html' = 'json'): string | null {
    try {
      return this.debugger.exportTrace(traceId, { format });
    } catch (error) {
      this.logger.error('Failed to export trace', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  updateDebugConfig(config: {
    verbose?: boolean;
    captureFullPayloads?: boolean;
    stepMode?: boolean;
    exportOnError?: boolean;
    exportFormat?: 'json' | 'markdown';
  }): void {
    this.debugger.updateConfig(config);
  }

  getTrace(traceId: string): AgentTrace | undefined {
    return this.debugger.getTrace(traceId);
  }

  clearTracesForSession(sessionId: string): number {
    return this.debugger.deleteTracesForSession(sessionId);
  }

  getDebugConfig() {
    return this.debugger.getConfig();
  }

  getAllTraces(): AgentTrace[] {
    return this.debugger.getAllTraces();
  }

  /**
   * Cleanup resources for a deleted session.
   * This should be called when a session is deleted to prevent memory leaks.
   */
  cleanupDeletedSession(sessionId: string): void {
    // Notify IPC event batcher and throttle controller that this session stopped running
    // Re-enables background throttling when no sessions are active
    this.notifySessionStopped(sessionId);

    // Abort any active controller for this session
    const controller = this.activeControllers.get(sessionId);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(sessionId);
      this.logger.debug('Aborted active controller for deleted session', { sessionId });
    }

    // Clear any queued executions for this session
    const clearedFromQueue = this.clearSessionQueue(sessionId);
    if (clearedFromQueue > 0) {
      this.logger.debug('Cleared queued executions for deleted session', { sessionId, count: clearedFromQueue });
    }

    // Clear pause state if any
    this.pauseResumeManager.clearPauseState(sessionId);

    // Clear debug traces for this session
    const clearedTraces = this.clearTracesForSession(sessionId);
    if (clearedTraces > 0) {
      this.logger.debug('Cleared debug traces for deleted session', { sessionId, count: clearedTraces });
    }

    this.logger.info('Cleaned up resources for deleted session', { sessionId });
  }
}
