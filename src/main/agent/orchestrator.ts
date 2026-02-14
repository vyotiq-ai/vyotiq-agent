import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type {
  AgentEvent,
  AgentSessionState,
  ConfirmToolPayload,
  RendererEvent,
  SendMessagePayload,
  StartSessionPayload,
  UpdateConfigPayload,
  LLMProviderName,
  ConversationBranch,
  SessionSummary,
} from '../../shared/types';
import { DEFAULT_TOOL_CONFIG_SETTINGS } from '../../shared/types';
import type { SettingsStore } from './settingsStore';
import { buildProviderMap } from './providers';
import type { Logger } from '../logger';
import { buildToolingSystem, ToolRegistry, type ToolLogger, type TerminalManager } from '../tools';
import { SessionManager } from './sessionManager';
import { RunExecutor } from './runExecutor';
import { ToolConfirmationHandler } from './toolConfirmationHandler';
import { SessionManagementHandler } from './sessionManagementHandler';
import { getCacheManager, getContextCache, getToolResultCache } from './cache';
import { TerminalEventHandler } from './terminalEventHandler';
import { ProviderManager } from './providerManager';
import { initRecovery, getSelfHealingAgent } from './recovery';
import { getLoopDetector } from './loopDetection';
import { initGitIntegration } from './git';
import { ModelQualityTracker, getModelQualityTracker } from './modelQuality';
import { getSessionHealthMonitor } from './sessionHealth';

interface OrchestratorDeps {
  settingsStore: SettingsStore;
  logger: Logger;
  sessionsPath?: string;
}

export class AgentOrchestrator extends EventEmitter {
  private readonly settingsStore: SettingsStore;
  private readonly logger: Logger;
  private readonly toolRegistry: ToolRegistry;
  private readonly terminalManager: TerminalManager;
  private readonly modelQualityTracker: ModelQualityTracker;

  private sessionManager: SessionManager;
  private runExecutor: RunExecutor;
  private toolConfirmationHandler: ToolConfirmationHandler;
  private sessionManagementHandler: SessionManagementHandler;
  private terminalEventHandler: TerminalEventHandler;
  private providerManager: ProviderManager;

  // Throttle session-state events to prevent renderer thrashing
  private lastSessionStateEmitTime = new Map<string, number>();
  private pendingSessionStateEmits = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly SESSION_STATE_THROTTLE_MS = 250; // Minimum 250ms between session-state events per session

  // Periodic cleanup interval for orphaned session throttle tracking
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(deps: OrchestratorDeps) {
    super();
    // Allow up to 50 listeners to avoid Node.js memory leak warnings with many sessions
    this.setMaxListeners(50);
    this.settingsStore = deps.settingsStore;
    this.logger = deps.logger;

    // Initialize model quality tracking
    this.modelQualityTracker = new ModelQualityTracker();

    const toolLogger: ToolLogger = {
      info: (message: string, meta?: Record<string, unknown>) => this.logger.info(`[tool] ${message}`, meta),
      warn: (message: string, meta?: Record<string, unknown>) => this.logger.warn(`[tool] ${message}`, meta),
      error: (message: string, meta?: Record<string, unknown>) => this.logger.error(`[tool] ${message}`, meta),
    };
    const tooling = buildToolingSystem({ logger: toolLogger });
    this.toolRegistry = tooling.registry;
    this.terminalManager = tooling.terminalManager;

    // Terminal event listeners are set up by TerminalEventHandler below


    this.sessionManager = new SessionManager(deps.sessionsPath);
    this.runExecutor = new RunExecutor({
      providers: buildProviderMap(this.settingsStore.get()), // Temporary initial providers
      toolRegistry: this.toolRegistry,
      terminalManager: this.terminalManager,
      logger: this.logger,
      emitEvent: (event) => this.emitEvent(event),
      getRateLimit: (provider: LLMProviderName) => this.settingsStore.get().rateLimits[provider] ?? 0,
      getProviderSettings: (provider: LLMProviderName) =>
        this.settingsStore.getProviderSettings(provider) ?? this.settingsStore.get().providerSettings?.[provider],
      updateSessionState: (sessionId, update) => this.sessionManager.updateSessionState(sessionId, update),
      getSafetySettings: () => this.settingsStore.get().safetySettings,
      getCacheSettings: () => this.settingsStore.get().cacheSettings,
      getDebugSettings: () => this.settingsStore.get().debugSettings,
      getPromptSettings: () => this.settingsStore.get().promptSettings,
      getComplianceSettings: () => this.settingsStore.get().complianceSettings,
      getAccessLevelSettings: () => this.settingsStore.get().accessLevelSettings,
      getTaskRoutingSettings: () => this.settingsStore.get().taskRoutingSettings,
      getToolSettings: () => {
        const settings = this.settingsStore.get();
        const toolSettings = settings.autonomousFeatureFlags?.toolSettings;
        // Merge with defaults to ensure all required properties are present
        return toolSettings ? { ...DEFAULT_TOOL_CONFIG_SETTINGS, ...toolSettings } : DEFAULT_TOOL_CONFIG_SETTINGS;
      },
      getWorkspaceDiagnostics: () => this.getWorkspaceDiagnostics(),
    });

    // Initialize new managers
    this.providerManager = new ProviderManager(this.settingsStore, this.logger, this.runExecutor);
    
    // Wire up provider health tracking after ProviderManager is initialized
    this.runExecutor.setProviderHealthCallback((provider, success, latencyMs) => {
      if (success) {
        this.providerManager.recordProviderSuccess(provider, latencyMs);
      } else {
        this.providerManager.recordProviderFailure(provider, latencyMs);
      }
    });
    
    this.terminalEventHandler = new TerminalEventHandler(this.terminalManager, this.logger, (event) => this.emitEvent(event));
    this.terminalEventHandler.setupEventListeners();

    // Initialize handlers
    this.toolConfirmationHandler = new ToolConfirmationHandler(
      this.sessionManager,
      this.runExecutor,
      this.logger,
      (event) => this.emitEvent(event),
    );

    this.sessionManagementHandler = new SessionManagementHandler(
      this.sessionManager,
      this.logger,
      (event) => this.emitEvent(event),
    );
  }

  async init(): Promise<void> {
    const settings = this.settingsStore.get();

    // Log API keys status
    this.logger.info('Orchestrator initializing', {
      openaiKeyLength: settings.apiKeys.openai?.length ?? 0,
      deepseekKeyLength: settings.apiKeys.deepseek?.length ?? 0,
      anthropicKeyLength: settings.apiKeys.anthropic?.length ?? 0,
      geminiKeyLength: settings.apiKeys.gemini?.length ?? 0,
    });

    this.refreshProviders();
    // Load persisted sessions from disk into memory
    await this.sessionManager.load();
    this.providerManager.validateConfiguration();

    // Initialize git integration components
    try {
      initGitIntegration(this.logger);
      this.logger.info('Git integration initialized');
    } catch (error) {
      this.logger.warn('Failed to initialize git integration', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Initialize DynamicToolFactory with registry (Phase 2)
    // This allows dynamically created tools to be registered and available to agents
    await this.initializeDynamicToolFactory();

    // Load custom tools from settings
    await this.loadCustomTools();

    // Initialize MCP (Model Context Protocol) integration
    await this.initializeMCPIntegration();

    // Initialize recovery/self-healing system
    try {
      await initRecovery({
        logger: this.logger,
        emitEvent: (event: unknown) => this.emitEvent(event as RendererEvent),
        getSystemState: () => ({
          activeRuns: this.sessionManager.getAllActiveSessions().length,
        }),
        reduceConcurrency: async (factor: number) => {
          // Reduce concurrency by pausing a proportion of active sessions
          const activeSessions = this.sessionManager.getAllActiveSessions();
          const sessionsToReduce = Math.max(1, Math.ceil(activeSessions.length * Math.min(1, Math.max(0, factor))));
          const sessionsToPause = activeSessions.slice(0, sessionsToReduce);
          for (const session of sessionsToPause) {
            try {
              this.runExecutor.pauseRun(session.id);
            } catch (err) {
              this.logger.warn('Failed to pause session during concurrency reduction', {
                sessionId: session.id,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
          this.logger.info('Self-healing: paused sessions to reduce concurrency', {
            pausedCount: sessionsToPause.length,
            totalActive: activeSessions.length,
            reductionFactor: factor,
          });
        },
        pauseNewTasks: async (durationMs: number) => {
          // Pause all active sessions and auto-resume after duration
          const activeSessions = this.sessionManager.getAllActiveSessions();
          for (const session of activeSessions) {
            try {
              this.runExecutor.pauseRun(session.id);
            } catch (err) {
              this.logger.warn('Failed to pause session', {
                sessionId: session.id,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
          setTimeout(() => {
            // Re-fetch active sessions to avoid resuming stale/completed sessions
            const currentSessions = this.sessionManager.getAllActiveSessions();
            for (const session of currentSessions) {
              try {
                this.runExecutor.resumeRun(session.id);
              } catch (err) {
                this.logger.warn('Failed to resume session', {
                  sessionId: session.id,
                  error: err instanceof Error ? err.message : String(err),
                });
              }
            }
            this.logger.info('Self-healing: auto-resumed paused sessions', { durationMs });
          }, durationMs);
        },
        triggerCircuitBreak: async () => {
          // Cancel all active runs as emergency measure
          const activeSessions = this.sessionManager.getAllActiveSessions();
          let cancelledCount = 0;
          for (const sessionState of activeSessions) {
            try {
              const session = this.sessionManager.getSession(sessionState.id);
              if (session) {
                this.runExecutor.cancelRun(sessionState.id, session);
                cancelledCount++;
              }
            } catch (err) {
              this.logger.warn('Failed to cancel session during circuit break', {
                sessionId: sessionState.id,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
          this.logger.warn('Self-healing: circuit break triggered, cancelled all active runs', {
            cancelledCount,
          });
        },
        clearCaches: async () => {
          // Prompt cache (stats only; provider-side caching is external)
          try {
            getCacheManager().resetStats();
          } catch (err) {
            // Cache reset is non-critical; log for debugging
            this.logger.debug('Failed to reset cache manager stats', { error: err instanceof Error ? err.message : String(err) });
          }

          // Tool result + context caches
          try {
            const toolCache = getToolResultCache();
            toolCache.invalidateAll();
            toolCache.resetStats();
          } catch (err) {
            // Tool cache reset is non-critical; log for debugging
            this.logger.debug('Failed to reset tool cache', { error: err instanceof Error ? err.message : String(err) });
          }

          try {
            const contextCache = getContextCache();
            contextCache.clear();
            contextCache.resetStats();
          } catch (err) {
            // Context cache reset is non-critical; log for debugging
            this.logger.debug('Failed to reset context cache', { error: err instanceof Error ? err.message : String(err) });
          }
        },
      });
      // Start the self-healing agent for proactive monitoring
      const selfHealingAgent = getSelfHealingAgent();
      selfHealingAgent.start();
      this.logger.info('Recovery/self-healing system initialized and started');
    } catch (err) {
      this.logger.warn('Failed to initialize recovery system', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Periodic cleanup of orphaned session throttle tracking entries (every 5 minutes)
    // Prevents memory leaks from sessions that expired without explicit deletion
    this.cleanupIntervalId = setInterval(() => {
      const activeSessions = new Set(this.sessionManager.getAllSessions().map(s => s.id));
      for (const sessionId of this.lastSessionStateEmitTime.keys()) {
        if (!activeSessions.has(sessionId)) {
          this.cleanupSessionThrottleTracking(sessionId);
        }
      }
    }, 5 * 60 * 1000);
    if (this.cleanupIntervalId && typeof this.cleanupIntervalId === 'object' && 'unref' in this.cleanupIntervalId) {
      (this.cleanupIntervalId as NodeJS.Timeout).unref();
    }
  }

  refreshProviders(): void {
    this.providerManager.refreshProviders();
  }

  /**
   * Check if the system has at least one available provider configured
   */
  hasAvailableProviders(): boolean {
    return this.providerManager.hasAvailableProviders();
  }

  /**
   * Get the list of configured providers (has API key and is enabled)
   */
  getAvailableProviders(): string[] {
    return this.providerManager.getAvailableProviders();
  }

  /**
   * Get detailed info about all providers (for diagnostics)
   */
  getProvidersInfo(): Array<{ name: string; enabled: boolean; hasApiKey: boolean; priority: number }> {
    return this.providerManager.getProvidersInfo();
  }

  /**
   * Get cooldown status for all providers
   */
  getProvidersCooldownStatus(): Record<string, { inCooldown: boolean; remainingMs: number; reason: string } | null> {
    return this.providerManager.getProvidersCooldownStatus();
  }

  /**
   * Get workspace-wide diagnostics (all errors/warnings from entire codebase)
   * Uses the new TypeScript Language Service for real-time diagnostics
   * Also integrates with LSP for multi-language support
   */
  async getWorkspaceDiagnostics(): Promise<{
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
  } | null> {
    try {
      // Try the new TypeScript Language Service first (real-time, fast)
      const { getTypeScriptDiagnosticsService } = await import('./workspace/TypeScriptDiagnosticsService');
      
      const service = getTypeScriptDiagnosticsService();
      if (!service || !service.isReady()) {
        return null;
      }
      
      const snapshot = service.getSnapshot();
      
      // Also get LSP diagnostics for multi-language support
      const { getLSPManager } = await import('../lsp');
      const lspManager = getLSPManager();
      const lspDiagnostics = lspManager?.getAllDiagnostics() ?? [];
      
      // Merge TypeScript and LSP diagnostics, avoiding duplicates
      const tsDiagnostics = snapshot.diagnostics.map((d: { filePath: string; fileName: string; line: number; column: number; endLine?: number; endColumn?: number; message: string; severity: 'error' | 'warning' | 'info' | 'hint'; code?: string | number }) => ({
        filePath: d.filePath,
        fileName: d.fileName,
        line: d.line,
        column: d.column,
        endLine: d.endLine,
        endColumn: d.endColumn,
        message: d.message,
        severity: d.severity,
        source: 'typescript' as const,
        code: d.code,
      }));
      
      // Add non-TypeScript LSP diagnostics (Python, Rust, Go, etc.)
      const nonTsDiagnostics = lspDiagnostics
        .filter(d => !d.filePath.match(/\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/))
        .map(d => ({
          filePath: d.filePath,
          fileName: d.filePath.split(/[/\\]/).pop() || d.filePath,
          line: d.line,
          column: d.column,
          endLine: d.endLine,
          endColumn: d.endColumn,
          message: d.message,
          severity: d.severity,
          source: d.source || 'lsp',
          code: d.code,
        }));
      
      const allDiagnostics = [...tsDiagnostics, ...nonTsDiagnostics];
      const errorCount = allDiagnostics.filter(d => d.severity === 'error').length;
      const warningCount = allDiagnostics.filter(d => d.severity === 'warning').length;
      const filesWithErrors = [...new Set(allDiagnostics.filter(d => d.severity === 'error').map(d => d.filePath))];
      
      return {
        diagnostics: allDiagnostics,
        errorCount,
        warningCount,
        filesWithErrors,
        collectedAt: snapshot.timestamp,
      };
    } catch (error) {
      this.logger.error('Failed to get workspace diagnostics', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async startSession(payload: StartSessionPayload): Promise<AgentSessionState> {
    return this.sessionManagementHandler.startSession(payload, this.settingsStore.get().defaultConfig);
  }

  async sendMessage(payload: SendMessagePayload): Promise<void> {
    // Validate that providers are configured before allowing message sending
    if (!this.hasAvailableProviders()) {
      const errorMsg = 'No available provider. Please configure at least one LLM provider with an API key in Settings.';
      // Don't log error here - runExecutor.handleRunError will log it
      this.emitEvent({
        type: 'agent-status',
        sessionId: payload.sessionId,
        status: 'error',
        message: errorMsg,
        timestamp: Date.now(),
      } as RendererEvent);
      throw new Error(errorMsg);
    }

    const session = this.sessionManager.getSession(payload.sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Debug: Log attachment info to trace content flow
    if (payload.attachments?.length) {
      this.logger.info('Processing message attachments', {
        attachmentCount: payload.attachments.length,
        attachments: payload.attachments.map(a => ({
          id: a.id,
          name: a.name,
          mimeType: a.mimeType,
          size: a.size,
          hasContent: !!a.content,
          contentLength: a.content?.length || 0,
        })),
      });
    }

    const message = {
      id: randomUUID(),
      role: 'user' as const,
      content: payload.content,
      attachments: payload.attachments?.map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        path: attachment.path,
        mimeType: attachment.mimeType,
        size: attachment.size,
        encoding: attachment.encoding,
        content: attachment.content,
      })),
      createdAt: Date.now(),
    };

    session.state.messages.push(message);
    session.state.updatedAt = Date.now();


    // Auto-generate session title from first user message
    if (session.state.title === 'New Session' && session.state.messages.filter(m => m.role === 'user').length === 1) {
      session.state.title = this.sessionManagementHandler.generateSessionTitle(payload.content);
    }

    // Persist session state after adding user message
    this.sessionManager.updateSessionState(session.state.id, {
      messages: session.state.messages,
      updatedAt: session.state.updatedAt,
      title: session.state.title,
    });

    this.emitEvent({ type: 'session-state', session: session.state });

    this.runExecutor.executeRun(session).catch((err) => {
      this.logger.error('Run execution failed', {
        sessionId: session.state.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  async confirmTool(payload: ConfirmToolPayload): Promise<void> {
    return this.toolConfirmationHandler.confirmTool(payload);
  }

  async updateConfig(payload: UpdateConfigPayload): Promise<void> {
    // updateConfig is for per-session config updates (like yoloMode toggle, maxIterations, etc.)
    this.logger.debug('updateConfig called for session', { sessionId: payload.sessionId, config: payload.config });

    const session = this.sessionManager.getSession(payload.sessionId);
    if (session) {
      const previousMaxIterations = session.state.config.maxIterations;
      
      // Merge the new config with existing config
      const updatedConfig = { ...session.state.config, ...payload.config };

      // Update the session state with new config
      this.sessionManager.updateSessionState(payload.sessionId, {
        config: updatedConfig,
      });

      // If maxIterations changed during an active run, emit real-time update
      if (
        payload.config.maxIterations !== undefined &&
        payload.config.maxIterations !== previousMaxIterations &&
        session.state.status === 'running'
      ) {
        this.logger.info('maxIterations updated during active run', {
          sessionId: payload.sessionId,
          previousMaxIterations,
          newMaxIterations: payload.config.maxIterations,
          currentIteration: session.agenticContext?.iteration,
        });

        // Emit agent-status with updated iteration info for real-time UI update
        this.emitEvent({
          type: 'agent-status',
          sessionId: payload.sessionId,
          status: 'executing',
          message: `Max iterations updated to ${payload.config.maxIterations}`,
          timestamp: Date.now(),
          metadata: {
            currentIteration: session.agenticContext?.iteration,
            maxIterations: payload.config.maxIterations,
            provider: session.agenticContext?.currentProvider,
          },
        });
      }

      // Emit lightweight patch for config changes (avoids serializing all messages)
      this.emitEvent({
        type: 'session-patch',
        sessionId: payload.sessionId,
        patch: { config: session.state.config, updatedAt: Date.now() },
      });
    }
  }

  async cancelRun(sessionId: string): Promise<void> {
    this.logger.info('cancelRun called', { sessionId });
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      this.logger.warn('cancelRun: session not found', { sessionId });
      return;
    }
    this.logger.info('cancelRun: calling runExecutor.cancelRun', { sessionId, status: session.state.status });
    this.runExecutor.cancelRun(sessionId, session);
    this.logger.info('cancelRun completed', { sessionId });
  }

  /**
   * Pause an active run. The run will pause at the next safe checkpoint.
   */
  pauseRun(sessionId: string): boolean {
    this.logger.info('pauseRun called', { sessionId });
    return this.runExecutor.pauseRun(sessionId);
  }

  /**
   * Resume a paused run.
   */
  resumeRun(sessionId: string): boolean {
    this.logger.info('resumeRun called', { sessionId });
    return this.runExecutor.resumeRun(sessionId);
  }

  /**
   * Check if a session's run is paused.
   */
  isRunPaused(sessionId: string): boolean {
    return this.runExecutor.isRunPaused(sessionId);
  }

  deleteSession(sessionId: string): void {
    // Clean up run executor resources for this session (abort controllers, queues, etc.)
    this.runExecutor.cleanupDeletedSession(sessionId);
    
    // Clean up session-state emit throttle tracking to prevent memory leaks
    this.cleanupSessionThrottleTracking(sessionId);
    
    // Delete the session from storage and memory
    this.sessionManagementHandler.deleteSession(sessionId);
  }

  /**
   * Clean up session-state emit throttle tracking for a deleted session.
   * Prevents memory leaks from accumulating throttle state for deleted sessions.
   */
  private cleanupSessionThrottleTracking(sessionId: string): void {
    // Clear the last emit time tracking
    this.lastSessionStateEmitTime.delete(sessionId);
    
    // Cancel and clear any pending emit timer
    const pendingTimer = this.pendingSessionStateEmits.get(sessionId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.pendingSessionStateEmits.delete(sessionId);
    }
  }


  getSessions(): AgentSessionState[] {
    return this.sessionManagementHandler.getSessions();
  }

  /**
   * Get session summaries for lazy loading (faster than full sessions)
   */
  async getSessionSummaries(): Promise<SessionSummary[]> {
    return this.sessionManagementHandler.getSessionSummaries();
  }

  async regenerate(sessionId: string): Promise<void> {
    return this.sessionManagementHandler.regenerate(sessionId);
  }

  renameSession(sessionId: string, title: string): void {
    const session = this.sessionManager.getSession(sessionId);
    if (session) {
      this.sessionManager.updateSessionState(sessionId, { title });
      // Use lightweight patch instead of full session-state to avoid sending all messages
      this.emitEvent({ type: 'session-patch', sessionId, patch: { title, updatedAt: Date.now() } });
    }
  }

  /**
   * Edit a user message in a session and resend.
   * Truncates conversation from that point and triggers a new run with the edited content.
   */
  async editMessageAndResend(
    sessionId: string,
    messageId: string,
    newContent: string
  ): Promise<{ success: boolean; error?: string }> {
    // Validate provider availability
    if (!this.hasAvailableProviders()) {
      return { success: false, error: 'No available provider configured' };
    }

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    // Edit message and truncate conversation
    const editResult = this.sessionManager.editMessage(sessionId, messageId, newContent);
    if (!editResult.success) {
      return editResult;
    }

    // Emit updated session state
    this.emitEvent({ type: 'session-state', session: session.state });

    // Execute new run with the edited message context
    this.runExecutor.executeRun(session).catch((err) => {
      this.logger.error('Run execution failed after message edit', {
        sessionId: session.state.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return { success: true };
  }

  /**
   * Add a reaction to a message in a session.
   */
  async addReaction(
    sessionId: string,
    messageId: string,
    reaction: 'up' | 'down' | null
  ): Promise<{ success: boolean; error?: string }> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const messages = session.state.messages;
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) {
      return { success: false, error: 'Message not found' };
    }

    // Update message reaction
    messages[messageIndex] = {
      ...messages[messageIndex],
      reaction,
      updatedAt: Date.now(),
    };

    // Persist session state
    this.sessionManager.updateSessionState(sessionId, {
      messages: [...messages],
      updatedAt: Date.now(),
    });

    // Use lightweight patch for reaction change (avoids serializing all messages)
    this.emitEvent({
      type: 'session-patch',
      sessionId,
      patch: { updatedAt: Date.now() },
      messagePatch: { messageId, changes: { reaction, updatedAt: Date.now() } },
    });

    return { success: true };
  }

  /**
   * Create a new conversation branch from a specific message.
   */
  createBranch(
    sessionId: string,
    forkPointMessageId: string,
    name?: string
  ): { success: boolean; branch?: ConversationBranch; error?: string } {
    const result = this.sessionManager.createBranch(sessionId, forkPointMessageId, name);
    if (result.success) {
      const session = this.sessionManager.getSession(sessionId);
      if (session) {
        // Branch operations need full session (messages change), but we send it
        this.emitEvent({ type: 'session-state', session: session.state });
      }
    }
    return result;
  }

  /**
   * Switch to a different branch.
   */
  switchBranch(sessionId: string, branchId: string | null): { success: boolean; error?: string } {
    const result = this.sessionManager.switchBranch(sessionId, branchId);
    if (result.success) {
      const session = this.sessionManager.getSession(sessionId);
      if (session) {
        // Branch switch changes visible messages, needs full session
        this.emitEvent({ type: 'session-state', session: session.state });
      }
    }
    return result;
  }

  /**
   * Delete a branch.
   */
  deleteBranch(sessionId: string, branchId: string): { success: boolean; error?: string } {
    const result = this.sessionManager.deleteBranch(sessionId, branchId);
    if (result.success) {
      const session = this.sessionManager.getSession(sessionId);
      if (session) {
        // Branch delete changes messages, needs full session
        this.emitEvent({ type: 'session-state', session: session.state });
      }
    }
    return result;
  }

  // ==========================================================================
  // Debug Methods
  // ==========================================================================

  /**
   * Get debug traces for a specific session
   */
  getDebugTracesForSession(sessionId: string) {
    return this.runExecutor.getDebugTracesForSession(sessionId);
  }

  /**
   * Get the currently active debug trace
   */
  getActiveDebugTrace() {
    return this.runExecutor.getActiveDebugTrace();
  }

  /**
   * Enable or disable debug mode
   */
  setDebugEnabled(enabled: boolean): void {
    this.runExecutor.setDebugEnabled(enabled);
  }

  /**
   * Export a trace to the specified format
   */
  exportTrace(traceId: string, format: 'json' | 'markdown' | 'html' = 'json'): string | null {
    return this.runExecutor.exportTrace(traceId, format);
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
    this.runExecutor.updateDebugConfig(config);
  }

  /**
   * Get trace by ID
   */
  getTrace(traceId: string) {
    return this.runExecutor.getTrace(traceId);
  }

  /**
   * Clear all traces for a session
   */
  clearTracesForSession(sessionId: string): number {
    return this.runExecutor.clearTracesForSession(sessionId);
  }

  /**
   * Get current debug configuration
   */
  getDebugConfig() {
    return this.runExecutor.getDebugConfig();
  }

  /**
   * Get all traces across all sessions
   */
  getAllTraces() {
    return this.runExecutor.getAllTraces();
  }

  // ==========================================================================
  // Cleanup Methods
  // ==========================================================================

  /**
   * Clean up all resources (terminal processes, etc.)
   * Should be called when the app is shutting down
   */
  async cleanup(): Promise<void> {
    this.logger.info('Orchestrator cleanup started');

    // Clear the periodic orphaned session throttle cleanup interval
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }

    // Clear all pending session state emit timers to prevent leaks
    for (const [sessionId, timer] of this.pendingSessionStateEmits) {
      clearTimeout(timer);
      this.logger.debug('Cleared pending session state emit timer', { sessionId });
    }
    this.pendingSessionStateEmits.clear();

    // Dispose loop detector to stop its cleanup interval
    try {
      getLoopDetector().dispose();
      this.logger.debug('Loop detector disposed');
    } catch {
      // Loop detector may not be initialized
    }

    // Dispose session health monitor singleton
    try {
      const healthMonitor = getSessionHealthMonitor();
      healthMonitor.dispose();
      this.logger.debug('Session health monitor disposed');
    } catch {
      // Health monitor may not be initialized
    }

    // Clear model quality tracker records
    try {
      const qualityTracker = getModelQualityTracker();
      qualityTracker.clear();
      this.logger.debug('Model quality tracker cleared');
    } catch {
      // Tracker may not be initialized
    }

    // Stop provider health monitor checks
    try {
      this.providerManager.getHealthMonitor()?.stopHealthChecks();
      this.logger.debug('Provider health monitor stopped');
    } catch {
      // Provider health monitor may not be initialized
    }

    try {
      // Flush any pending session persistence first (critical for data integrity)
      try {
        await this.sessionManager.dispose();
        this.logger.info('Session manager disposed');
      } catch (error) {
        this.logger.error('Error disposing session manager', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Stop self-healing agent
      try {
        const selfHealingAgent = getSelfHealingAgent();
        selfHealingAgent.stop();
        this.logger.debug('Self-healing agent stopped');
      } catch {
        // Recovery system may not be initialized, ignore
      }

      // Shutdown git integration
      try {
        const { shutdownGitIntegration } = await import('./git');
        shutdownGitIntegration();
        this.logger.debug('Git integration shutdown complete');
      } catch (error) {
        this.logger.warn('Error shutting down git integration', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Shutdown LSP Manager
      try {
        const { getLSPManager } = await import('../lsp');
        const lspManager = getLSPManager();
        if (lspManager) {
          await lspManager.shutdown();
          this.logger.debug('LSP manager shutdown complete');
        }
      } catch (error) {
        this.logger.warn('Error shutting down LSP manager', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Shutdown MCP Server Manager
      try {
        const { getMCPServerManager } = await import('../mcp');
        const mcpManager = getMCPServerManager();
        if (mcpManager) {
          await mcpManager.shutdown();
          this.logger.debug('MCP server manager shutdown complete');
        }
      } catch (error) {
        this.logger.warn('Error shutting down MCP server manager', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Shutdown Browser Manager
      try {
        const { getBrowserManager } = await import('../browser');
        const browserManager = getBrowserManager();
        if (browserManager) {
          browserManager.destroy();
          this.logger.debug('Browser manager cleanup complete');
        }
      } catch (error) {
        this.logger.warn('Error cleaning up browser manager', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Kill all running terminal processes
      const killedCount = await this.terminalManager.killAll();
      if (killedCount > 0) {
        this.logger.info('Killed terminal processes during cleanup', { count: killedCount });
      }

      // Clean up old completed processes
      const cleanedCount = this.terminalManager.cleanup(0); // Clean all completed processes
      if (cleanedCount > 0) {
        this.logger.debug('Cleaned up completed terminal processes', { count: cleanedCount });
      }

      // Remove terminal event listeners to prevent memory leaks
      this.terminalEventHandler.removeEventListeners();

    } catch (error) {
      this.logger.error('Error during orchestrator cleanup', {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    this.logger.info('Orchestrator cleanup completed');
  }

  /**
   * Get the terminal manager for direct terminal operations
   */
  getTerminalManager(): TerminalManager {
    return this.terminalManager;
  }

  /**
   * Get the tool registry for tool management (Phase 2)
   */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  /**
   * Initialize the DynamicToolFactory with the tool registry
   */
  private async initializeDynamicToolFactory(): Promise<void> {
    const { initDynamicToolFactory } = await import('../tools/factory/DynamicToolFactory');
    initDynamicToolFactory(this.toolRegistry);
    this.logger.info('DynamicToolFactory initialized');
  }

  /**
   * Load custom tools from settings and register them with the factory
   */
  private async loadCustomTools(): Promise<void> {
    try {
      const settings = this.settingsStore.get();
      const customTools = settings.autonomousFeatureFlags?.toolSettings?.customTools ?? [];
      
      if (customTools.length > 0) {
        const { getDynamicToolFactory } = await import('../tools/factory/DynamicToolFactory');
        const factory = getDynamicToolFactory();
        
        for (const tool of customTools) {
          if (tool.enabled) {
            try {
              await factory.createTool({
                name: tool.name,
                description: tool.description,
                steps: tool.steps.map((s: { toolName: string; input: Record<string, unknown>; condition?: string; onError?: string }) => ({
                  toolName: s.toolName,
                  input: s.input,
                  condition: s.condition,
                  onError: (s.onError === 'stop' || s.onError === 'continue') ? s.onError : undefined,
                })),
              });
            } catch (toolErr) {
              this.logger.warn('Failed to register custom tool', {
                toolName: tool.name,
                error: toolErr instanceof Error ? toolErr.message : String(toolErr),
              });
            }
          }
        }
        
        this.logger.info('Custom tools loaded', { count: customTools.filter((t: { enabled: boolean }) => t.enabled).length });
      }
    } catch (err) {
      this.logger.warn('Failed to load custom tools', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Initialize MCP (Model Context Protocol) integration
   * Connects MCP server tools to the main tool registry
   * Server connections run in background to avoid blocking startup
   */
  private async initializeMCPIntegration(): Promise<void> {
    try {
      const { initializeMCPServerManager, initializeMCPToolRegistryAdapter, getMCPServerManager } = await import('../mcp');
      
      // Initialize MCP server manager
      initializeMCPServerManager();
      
      // Initialize the tool registry adapter to sync MCP tools with main registry
      initializeMCPToolRegistryAdapter(this.toolRegistry);
      
      // Load saved MCP servers from settings and connect them
      const settings = this.settingsStore.get();
      const mcpServers = settings.mcpServers ?? [];
      const mcpSettings = settings.mcpSettings;
      
      if (mcpSettings?.enabled && mcpSettings?.autoStartServers) {
        const manager = getMCPServerManager();
        
        // Register saved servers (fast, in-memory)
        for (const serverConfig of mcpServers) {
          try {
            manager.registerServer(serverConfig);
          } catch (err) {
            this.logger.warn('Failed to register MCP server', {
              serverName: serverConfig.name,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        
        // Connect enabled servers in BACKGROUND (don't await)
        const enabledServers = mcpServers.filter(s => s.enabled);
        if (enabledServers.length > 0) {
          // Use setImmediate to not block the init chain
          setImmediate(() => {
            Promise.allSettled(
              enabledServers.map(async (serverConfig) => {
                try {
                  await manager.connectServer(serverConfig.id);
                  this.logger.debug('MCP server connected', { name: serverConfig.name });
                } catch (err) {
                  this.logger.warn('Failed to connect MCP server', {
                    serverName: serverConfig.name,
                    error: err instanceof Error ? err.message : String(err),
                  });
                }
              })
            ).then(() => {
              this.logger.info('MCP servers connected in background', {
                attempted: enabledServers.length,
              });
            });
          });
        }
        
        this.logger.info('MCP integration initialized', {
          serversLoaded: mcpServers.length,
          autoConnecting: enabledServers.length,
        });
      } else {
        this.logger.info('MCP integration initialized (auto-connect disabled)');
      }
    } catch (err) {
      this.logger.warn('Failed to initialize MCP integration', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private emitEvent(event: RendererEvent | AgentEvent): void {
    // Throttle session-state events to prevent renderer thrashing
    if (event.type === 'session-state') {
      const sessionEvent = event as { type: 'session-state'; session: AgentSessionState };
      const sessionId = sessionEvent.session?.id;
      
      if (sessionId) {
        const now = Date.now();
        const lastEmit = this.lastSessionStateEmitTime.get(sessionId) ?? 0;
        
        // If we're within throttle window, schedule for later
        if (now - lastEmit < this.SESSION_STATE_THROTTLE_MS) {
          // Clear existing pending emit
          const existingTimer = this.pendingSessionStateEmits.get(sessionId);
          if (existingTimer) clearTimeout(existingTimer);
          
          // Schedule new emit at the end of throttle window — use lightweight version
          const delay = this.SESSION_STATE_THROTTLE_MS - (now - lastEmit);
          const timer = setTimeout(() => {
            this.lastSessionStateEmitTime.set(sessionId, Date.now());
            this.pendingSessionStateEmits.delete(sessionId);
            this.emit('event', this.createLightweightSessionEvent(sessionEvent));
          }, delay);
          this.pendingSessionStateEmits.set(sessionId, timer);
          return;
        }
        
        this.lastSessionStateEmitTime.set(sessionId, now);
        // Emit lightweight version to reduce IPC payload
        this.emit('event', this.createLightweightSessionEvent(sessionEvent));
        return;
      }
    }
    
    this.emit('event', event);
  }

  /**
   * Create a lightweight version of session-state events.
   * When a session is actively running (streaming), the renderer already has
   * message content from stream-delta events. We strip large content fields
   * from messages to reduce IPC payload from ~400KB to ~5KB.
   * 
   * The renderer's SESSION_UPSERT handler preserves existing streamed content
   * when the incoming message has shorter content — so this is safe.
   */
  private createLightweightSessionEvent(
    event: { type: 'session-state'; session: AgentSessionState }
  ): { type: 'session-state'; session: AgentSessionState } {
    const session = event.session;
    
    // Only strip content for running sessions — idle sessions need full data
    if (session.status !== 'running') {
      return event;
    }

    // Strip large content from messages — renderer has this from stream-delta
    const lightMessages = session.messages.map(msg => {
      if (msg.role !== 'assistant') {
        // User messages are small, keep them; but strip attachment content (base64)
        if (msg.attachments?.some(a => a.content && a.content.length > 1000)) {
          return {
            ...msg,
            attachments: msg.attachments.map(a => ({
              ...a,
              content: a.content && a.content.length > 1000 ? undefined : a.content,
            })),
          };
        }
        return msg;
      }
      
      // For assistant messages, send structure but strip large content
      // The renderer will keep its longer (streamed) version
      return {
        ...msg,
        // Send empty content — renderer's merge keeps its own longer streamed version
        content: '',
        thinking: '',
        reasoningContent: undefined,
        // Strip generated images base64 data (can be 100KB+ each)
        generatedImages: msg.generatedImages?.map(img => ({
          ...img,
          data: '',  // Renderer already has this from media-output event
        })),
        generatedAudio: msg.generatedAudio ? { ...msg.generatedAudio, data: '' } : undefined,
      };
    });

    return {
      type: 'session-state',
      session: {
        ...session,
        messages: lightMessages,
      },
    };
  }

  // ==========================================================================
  // Model Quality API
  // ==========================================================================

  /**
   * Record a model performance event
   */
  recordModelPerformance(
    modelId: string,
    provider: LLMProviderName,
    success: boolean,
    responseTimeMs: number,
    tokensUsed: number,
    loopDetected = false,
    complianceViolation = false
  ): void {
    this.modelQualityTracker.recordPerformance({
      modelId,
      provider,
      success,
      responseTimeMs,
      tokensUsed,
      loopDetected,
      complianceViolation,
    });
  }

  /**
   * Record user reaction to a model response (thumbs up/down)
   */
  recordUserReaction(modelId: string, provider: LLMProviderName, reaction: 'up' | 'down'): void {
    this.modelQualityTracker.recordUserReaction(modelId, provider, reaction);
  }

  /**
   * Get quality metrics for a specific model
   */
  getModelQualityMetrics(modelId: string, provider: LLMProviderName) {
    return this.modelQualityTracker.getMetrics(modelId, provider);
  }

  /**
   * Get all models ranked by quality score
   */
  getRankedModels() {
    return this.modelQualityTracker.getRankedModels();
  }

  /**
   * Get global model quality statistics
   */
  getModelQualityStats() {
    return this.modelQualityTracker.getGlobalStats();
  }

  /**
   * Get the model quality tracker instance
   */
  getModelQualityTracker(): ModelQualityTracker {
    return this.modelQualityTracker;
  }
}
