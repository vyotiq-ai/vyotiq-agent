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
  WorkspaceResourceMetrics,
} from '../../shared/types';
import { DEFAULT_TOOL_CONFIG_SETTINGS } from '../../shared/types';
import type { SettingsStore } from './settingsStore';
import type { WorkspaceManager } from '../workspaces/workspaceManager';
import { buildProviderMap } from './providers';
import type { Logger } from '../logger';
import { buildToolingSystem, ToolRegistry, type ToolLogger, type TerminalManager } from '../tools';
import { SessionManager } from './sessionManager';
import { RunExecutor } from './runExecutor';
import { ToolConfirmationHandler } from './toolConfirmationHandler';
import { SessionManagementHandler } from './sessionManagementHandler';
import { getEditorAIService } from './editor';
import { getCacheManager, getContextCache, getToolResultCache } from './cache';
import { TerminalEventHandler } from './terminalEventHandler';
import { ProviderManager } from './providerManager';
import { initRecovery, getSelfHealingAgent } from './recovery';
import { initGitIntegration } from './git';
import { ModelQualityTracker } from './modelQuality';
import { WorkspaceResourceManager } from './execution/workspaceResourceManager';
import { initMultiSessionManager, getMultiSessionManager, type MultiSessionManager } from './execution/multiSessionManager';

interface OrchestratorDeps {
  settingsStore: SettingsStore;
  workspaceManager: WorkspaceManager;
  logger: Logger;
  sessionsPath?: string;
}

export class AgentOrchestrator extends EventEmitter {
  private readonly settingsStore: SettingsStore;
  private readonly workspaceManager: WorkspaceManager;
  private readonly logger: Logger;
  private readonly toolRegistry: ToolRegistry;
  private readonly terminalManager: TerminalManager;
  private readonly modelQualityTracker: ModelQualityTracker;
  private readonly workspaceResourceManager: WorkspaceResourceManager;
  private multiSessionManager: MultiSessionManager | null = null;

  private sessionManager: SessionManager;
  private runExecutor: RunExecutor;
  private toolConfirmationHandler: ToolConfirmationHandler;
  private sessionManagementHandler: SessionManagementHandler;
  private terminalEventHandler: TerminalEventHandler;
  private providerManager: ProviderManager;
  private editorState: {
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
  } = { openFiles: [], activeFile: null, cursorPosition: null, diagnostics: [] };

  // Debounce timer for editor state logging to reduce log noise
  private editorStateLogTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEditorStateLogTime = 0;
  private readonly EDITOR_STATE_LOG_DEBOUNCE_MS = 500; // Only log once per 500ms

  // Throttle session-state events to prevent renderer thrashing
  private lastSessionStateEmitTime = new Map<string, number>();
  private pendingSessionStateEmits = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly SESSION_STATE_THROTTLE_MS = 100; // Minimum 100ms between session-state events per session

  constructor(deps: OrchestratorDeps) {
    super();
    this.settingsStore = deps.settingsStore;
    this.workspaceManager = deps.workspaceManager;
    this.logger = deps.logger;

    // Initialize model quality tracking
    this.modelQualityTracker = new ModelQualityTracker();

    // Initialize workspace resource manager for multi-workspace concurrent session support
    this.workspaceResourceManager = new WorkspaceResourceManager(this.logger, {
      maxSessionsPerWorkspace: 5,
      maxToolExecutionsPerWorkspace: 10,
      rateLimitWindowMs: 60_000,
      maxRequestsPerWindow: 60,
      minRequestDelayMs: 100,
    });

    const toolLogger: ToolLogger = {
      info: (message: string, meta?: Record<string, unknown>) => this.logger.info(`[tool] ${message}`, meta),
      warn: (message: string, meta?: Record<string, unknown>) => this.logger.warn(`[tool] ${message}`, meta),
      error: (message: string, meta?: Record<string, unknown>) => this.logger.error(`[tool] ${message}`, meta),
    };
    const tooling = buildToolingSystem({ logger: toolLogger });
    this.toolRegistry = tooling.registry;
    this.terminalManager = tooling.terminalManager;

    // Terminal event listeners are set up by TerminalEventHandler below


    this.sessionManager = new SessionManager(this.workspaceManager, deps.sessionsPath);
    this.runExecutor = new RunExecutor({
      providers: buildProviderMap(this.settingsStore.get()), // Temporary initial providers
      toolRegistry: this.toolRegistry,
      terminalManager: this.terminalManager,
      workspaceManager: this.workspaceManager,
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
      getEditorState: () => this.getEditorState(),
      getWorkspaceDiagnostics: () => this.getWorkspaceDiagnostics(),
      workspaceResourceManager: this.workspaceResourceManager,
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
      this.workspaceManager,
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

    // Initialize multi-session manager for concurrent session support across workspaces
    this.multiSessionManager = initMultiSessionManager(
      this.logger,
      this.workspaceResourceManager,
      (event) => this.emitEvent(event),
      {
        maxGlobalConcurrent: 10,
        maxPerWorkspaceConcurrent: 5,
        emitCrossWorkspaceEvents: true,
      }
    );
    this.logger.info('Multi-session manager initialized for concurrent session support');

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

    // Initialize editor AI service for code editor features
    const { initEditorAIService } = await import('./editor');
    initEditorAIService({
      getProviders: () => this.providerManager.getProviders(),
      getConfig: () => this.settingsStore.get().editorAISettings,
      logger: this.logger,
    });
    this.logger.info('Editor AI service initialized');

    // Initialize recovery/self-healing system
    try {
      initRecovery({
        logger: this.logger,
        emitEvent: (event: unknown) => this.emitEvent(event as RendererEvent),
        getSystemState: () => ({
          activeRuns: this.sessionManager.getAllActiveSessions().length,
        }),
        clearCaches: async () => {
          // Prompt cache (stats only; provider-side caching is external)
          try {
            getCacheManager().resetStats();
          } catch {
            // ignore
          }

          // Tool result + context caches
          try {
            const toolCache = getToolResultCache();
            toolCache.invalidateAll();
            toolCache.resetStats();
          } catch {
            // ignore
          }

          try {
            const contextCache = getContextCache();
            contextCache.clear();
            contextCache.resetStats();
          } catch {
            // ignore
          }

          // Editor AI cache
          try {
            getEditorAIService()?.clearCache();
          } catch {
            // ignore
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
  }

  refreshProviders(): void {
    this.providerManager.refreshProviders();
  }

  /**
   * Validate that the system is properly configured
   */
  private validateConfiguration(): void {
    this.providerManager.validateConfiguration();
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

  updateEditorState(state: {
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
  }): void {
    this.editorState = state;
    
    // Debounce editor state logging to reduce log noise
    // Only log if enough time has passed since last log
    const now = Date.now();
    if (now - this.lastEditorStateLogTime >= this.EDITOR_STATE_LOG_DEBOUNCE_MS) {
      this.lastEditorStateLogTime = now;
      this.logger.debug('Editor state updated', {
        openFilesCount: state.openFiles.length,
        activeFile: state.activeFile,
        diagnosticsCount: state.diagnostics?.length ?? 0,
        errorCount: state.diagnostics?.filter(d => d.severity === 'error').length ?? 0,
        warningCount: state.diagnostics?.filter(d => d.severity === 'warning').length ?? 0,
      });
    } else {
      // Schedule a trailing log if we're debouncing
      if (this.editorStateLogTimer) {
        clearTimeout(this.editorStateLogTimer);
      }
      this.editorStateLogTimer = setTimeout(() => {
        this.lastEditorStateLogTime = Date.now();
        this.logger.debug('Editor state updated', {
          openFilesCount: this.editorState.openFiles.length,
          activeFile: this.editorState.activeFile,
          diagnosticsCount: this.editorState.diagnostics?.length ?? 0,
          errorCount: this.editorState.diagnostics?.filter(d => d.severity === 'error').length ?? 0,
          warningCount: this.editorState.diagnostics?.filter(d => d.severity === 'warning').length ?? 0,
        });
        this.editorStateLogTimer = null;
      }, this.EDITOR_STATE_LOG_DEBOUNCE_MS);
    }
  }

  getEditorState() {
    return this.editorState;
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
      source: 'typescript' | 'eslint';
      code?: string | number;
    }>;
    errorCount: number;
    warningCount: number;
    filesWithErrors: string[];
    collectedAt: number;
  } | null> {
    // Get the active workspace path
    const activeWorkspace = this.workspaceManager.getActive();
    if (!activeWorkspace?.path) {
      return null;
    }

    try {
      // Try the new TypeScript Language Service first (real-time, fast)
      const { getTypeScriptDiagnosticsService, initTypeScriptDiagnosticsService } = await import('./workspace/TypeScriptDiagnosticsService');
      
      let service = getTypeScriptDiagnosticsService();
      if (!service || !service.isReady()) {
        // Initialize the service if not ready
        service = initTypeScriptDiagnosticsService(this.logger);
        await service.initialize(activeWorkspace.path);
      }
      
      if (service.isReady()) {
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
            source: 'typescript' as const, // Keep consistent type
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
      }

      // TypeScript service not available
      return null;
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

    // Validate workspace binding before executing any operations
    if (session.state.workspaceId) {
      const workspaceValidation = this.sessionManager.validateSessionWorkspace(payload.sessionId);
      if (!workspaceValidation.valid) {
        this.logger.error('Session workspace validation failed', {
          sessionId: payload.sessionId,
          workspaceId: session.state.workspaceId,
          error: workspaceValidation.error,
        });
        throw new Error(`Cannot send message: ${workspaceValidation.error}. The session's workspace may have been removed.`);
      }

      this.logger.info('Message being sent with workspace context', {
        sessionId: payload.sessionId,
        workspaceId: session.state.workspaceId,
        workspacePath: workspaceValidation.workspacePath,
      });
    } else {
      // Legacy session without workspace binding - log warning
      this.logger.warn('Sending message for session without workspace binding', {
        sessionId: payload.sessionId,
      });
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

    void this.runExecutor.executeRun(session);
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

      // Emit session-state update to reflect config changes
      this.emitEvent({ type: 'session-state', session: session.state });
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

  getSessionsByWorkspace(workspaceId: string): AgentSessionState[] {
    return this.sessionManagementHandler.getSessionsByWorkspace(workspaceId);
  }

  /**
   * Get session summaries for lazy loading (faster than full sessions)
   */
  async getSessionSummaries(workspaceId?: string): Promise<SessionSummary[]> {
    return this.sessionManagementHandler.getSessionSummaries(workspaceId);
  }

  getActiveWorkspaceSessions(): AgentSessionState[] {
    return this.sessionManagementHandler.getActiveWorkspaceSessions();
  }

  // ===========================================================================
  // Multi-Session Management
  // ===========================================================================

  /**
   * Get all running sessions across all workspaces
   * Used for showing global activity indicators in the UI
   */
  getAllRunningSessions(): AgentSessionState[] {
    return this.sessionManager.getAllActiveSessions();
  }

  /**
   * Get global session statistics for multi-workspace concurrent execution
   */
  getGlobalSessionStats(): {
    totalRunning: number;
    totalQueued: number;
    runningByWorkspace: Record<string, number>;
    canStartNew: boolean;
  } {
    if (!this.multiSessionManager) {
      return {
        totalRunning: this.sessionManager.getAllActiveSessions().length,
        totalQueued: 0,
        runningByWorkspace: {},
        canStartNew: true,
      };
    }

    const stats = this.multiSessionManager.getGlobalStats();
    return {
      totalRunning: stats.totalRunning,
      totalQueued: stats.totalQueued,
      runningByWorkspace: Object.fromEntries(stats.runningByWorkspace),
      canStartNew: stats.totalRunning < 10, // maxGlobalConcurrent
    };
  }

  /**
   * Get detailed running session information for all workspaces
   */
  getDetailedRunningSessions(): Array<{
    sessionId: string;
    workspaceId: string;
    status: string;
    startedAt: number;
    iteration: number;
    maxIterations: number;
    provider?: string;
  }> {
    if (!this.multiSessionManager) {
      return this.sessionManager.getAllActiveSessions().map(s => ({
        sessionId: s.id,
        workspaceId: s.workspaceId ?? 'default',
        status: s.status,
        startedAt: s.updatedAt,
        iteration: 0,
        maxIterations: s.config.maxIterations ?? 20,
        provider: s.config.preferredProvider,
      }));
    }

    return this.multiSessionManager.getAllRunningSessions().map(info => ({
      sessionId: info.sessionId,
      workspaceId: info.workspaceId,
      status: info.status,
      startedAt: info.startedAt,
      iteration: info.iteration,
      maxIterations: info.maxIterations,
      provider: info.provider,
    }));
  }

  /**
   * Check if a new session can be started (within concurrency limits)
   */
  canStartNewSession(workspaceId: string): { allowed: boolean; reason?: string } {
    if (!this.multiSessionManager) {
      return { allowed: true };
    }
    return this.multiSessionManager.canStartSession(workspaceId);
  }

  /**
   * Notify multi-session manager when a run starts
   * Called internally by runExecutor
   */
  notifyRunStarted(sessionId: string, runId: string, maxIterations: number): void {
    const session = this.sessionManager.getSession(sessionId);
    if (session && this.multiSessionManager) {
      this.multiSessionManager.registerSessionStart(session, runId, maxIterations);
    }
  }

  /**
   * Notify multi-session manager when a run completes
   * Called internally by runExecutor
   */
  notifyRunCompleted(sessionId: string): void {
    if (this.multiSessionManager) {
      this.multiSessionManager.registerSessionComplete(sessionId);
    }
  }

  /**
   * Notify multi-session manager when a run has an error
   * Called internally by runExecutor
   */
  notifyRunError(sessionId: string, error: string): void {
    if (this.multiSessionManager) {
      this.multiSessionManager.registerSessionError(sessionId, error);
    }
  }

  /**
   * Update multi-session manager with run progress
   */
  notifyRunProgress(sessionId: string, iteration: number, provider?: string): void {
    if (this.multiSessionManager) {
      this.multiSessionManager.updateSessionProgress(sessionId, { iteration, provider });
    }
  }

  async regenerate(sessionId: string): Promise<void> {
    return this.sessionManagementHandler.regenerate(sessionId);
  }

  renameSession(sessionId: string, title: string): void {
    const session = this.sessionManager.getSession(sessionId);
    if (session) {
      this.sessionManager.updateSessionState(sessionId, { title });
      this.emitEvent({ type: 'session-state', session: session.state });
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
    void this.runExecutor.executeRun(session);

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

    // Emit updated session state
    this.emitEvent({ type: 'session-state', session: session.state });

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
        this.emitEvent({ type: 'session-state', session: session.state });
      }
    }
    return result;
  }

  // ==========================================================================
  // Workspace Resource Management Methods (Multi-workspace Concurrent Sessions)
  // ==========================================================================

  /**
   * Get resource metrics for all active workspaces
   */
  getWorkspaceResourceMetrics(): Map<string, WorkspaceResourceMetrics> {
    return this.workspaceResourceManager.getMetrics();
  }

  /**
   * Get resource metrics for a specific workspace
   */
  getWorkspaceMetrics(workspaceId: string): WorkspaceResourceMetrics | null {
    return this.workspaceResourceManager.getWorkspaceMetrics(workspaceId);
  }

  /**
   * Check if a workspace has any active sessions
   */
  hasActiveWorkspaceSessions(workspaceId: string): boolean {
    return this.workspaceResourceManager.hasActiveSessions(workspaceId);
  }

  /**
   * Get active session count for a specific workspace
   */
  getActiveWorkspaceSessionCount(workspaceId: string): number {
    return this.workspaceResourceManager.getActiveSessionCount(workspaceId);
  }

  /**
   * Get total active sessions across all workspaces
   */
  getTotalActiveSessionCount(): number {
    return this.workspaceResourceManager.getTotalActiveSessions();
  }

  /**
   * Initialize workspace resources (called when opening a workspace tab)
   */
  initializeWorkspaceResources(workspaceId: string): void {
    this.workspaceResourceManager.initializeWorkspace(workspaceId);
  }

  /**
   * Clean up workspace resources (called when closing a workspace tab)
   */
  cleanupWorkspaceResources(workspaceId: string): void {
    this.workspaceResourceManager.cleanupWorkspace(workspaceId);
  }

  /**
   * Register callback for workspace resource metrics updates
   */
  onWorkspaceResourceMetricsUpdate(
    callback: (metrics: Map<string, WorkspaceResourceMetrics>) => void
  ): () => void {
    return this.workspaceResourceManager.onMetricsUpdate(callback);
  }

  /**
   * Get current resource limits configuration
   */
  getResourceLimits(): {
    maxSessionsPerWorkspace: number;
    maxToolExecutionsPerWorkspace: number;
    rateLimitWindowMs: number;
    maxRequestsPerWindow: number;
  } {
    const limits = this.workspaceResourceManager.getLimits();
    return {
      maxSessionsPerWorkspace: limits.maxSessionsPerWorkspace,
      maxToolExecutionsPerWorkspace: limits.maxToolExecutionsPerWorkspace,
      rateLimitWindowMs: limits.rateLimitWindowMs,
      maxRequestsPerWindow: limits.maxRequestsPerWindow,
    };
  }

  /**
   * Update resource limits configuration
   */
  updateResourceLimits(limits: {
    maxSessionsPerWorkspace?: number;
    maxToolExecutionsPerWorkspace?: number;
    rateLimitWindowMs?: number;
    maxRequestsPerWindow?: number;
  }): void {
    this.workspaceResourceManager.updateLimits(limits);
  }

  /**
   * Get concurrent execution statistics across all workspaces
   * Returns aggregate metrics for multi-workspace session management
   */
  getConcurrentExecutionStats(): {
    totalActiveSessions: number;
    workspaceCount: number;
    metricsPerWorkspace: Array<{
      workspaceId: string;
      sessionCount: number;
      activeToolExecutions: number;
    }>;
    resourceLimits: {
      maxSessionsPerWorkspace: number;
      maxToolExecutionsPerWorkspace: number;
    };
  } {
    const metrics = this.workspaceResourceManager.getMetrics();
    const limits = this.workspaceResourceManager.getLimits();
    
    const metricsPerWorkspace = Array.from(metrics.entries()).map(([workspaceId, m]) => ({
      workspaceId,
      sessionCount: m.activeSessions,
      activeToolExecutions: m.activeToolExecutions,
    }));
    
    return {
      totalActiveSessions: this.workspaceResourceManager.getTotalActiveSessions(),
      workspaceCount: metrics.size,
      metricsPerWorkspace,
      resourceLimits: {
        maxSessionsPerWorkspace: limits.maxSessionsPerWorkspace,
        maxToolExecutionsPerWorkspace: limits.maxToolExecutionsPerWorkspace,
      },
    };
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

    try {
      // Flush any pending session persistence first (critical for data integrity)
      try {
        await this.sessionManager.flushPendingPersistence();
        this.logger.info('Session persistence flushed');
      } catch (error) {
        this.logger.error('Error flushing session persistence', {
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

      // Dispose workspace resource manager
      try {
        this.workspaceResourceManager.dispose();
        this.logger.debug('Workspace resource manager disposed');
      } catch (error) {
        this.logger.warn('Error disposing workspace resource manager', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Clear editor state log timer if pending
      if (this.editorStateLogTimer) {
        clearTimeout(this.editorStateLogTimer);
        this.editorStateLogTimer = null;
      }
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
                steps: tool.steps.map(s => ({
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
        
        this.logger.info('Custom tools loaded', { count: customTools.filter(t => t.enabled).length });
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
      const sessionEvent = event as { type: 'session-state'; session: { id: string } };
      const sessionId = sessionEvent.session?.id;
      
      if (sessionId) {
        const now = Date.now();
        const lastEmit = this.lastSessionStateEmitTime.get(sessionId) ?? 0;
        
        // If we're within throttle window, schedule for later
        if (now - lastEmit < this.SESSION_STATE_THROTTLE_MS) {
          // Clear existing pending emit
          const existingTimer = this.pendingSessionStateEmits.get(sessionId);
          if (existingTimer) clearTimeout(existingTimer);
          
          // Schedule new emit at the end of throttle window
          const delay = this.SESSION_STATE_THROTTLE_MS - (now - lastEmit);
          const timer = setTimeout(() => {
            this.lastSessionStateEmitTime.set(sessionId, Date.now());
            this.pendingSessionStateEmits.delete(sessionId);
            this.emit('event', event);
          }, delay);
          this.pendingSessionStateEmits.set(sessionId, timer);
          return;
        }
        
        this.lastSessionStateEmitTime.set(sessionId, now);
      }
    }
    
    this.emit('event', event);
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
