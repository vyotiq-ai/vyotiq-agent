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
import type { SettingsStore } from './settingsStore';
import type { WorkspaceManager } from '../workspaces/workspaceManager';
import { buildProviderMap } from './providers';
import type { Logger } from '../logger';
import { buildToolingSystem, ToolRegistry, type ToolLogger, type TerminalManager } from '../tools';
import { SessionManager } from './sessionManager';
import { RunExecutor } from './runExecutor';
import { ToolConfirmationHandler } from './toolConfirmationHandler';
import { SessionManagementHandler } from './sessionManagementHandler';
import { initAutocompleteService } from './autocomplete';
import { getAutocompleteService } from './autocomplete';
import { getEditorAIService } from './editor';
import { getCacheManager, getContextCache, getToolResultCache } from './cache';
import { TerminalEventHandler } from './terminalEventHandler';
import { ProviderManager } from './providerManager';
import { initRecovery, getSelfHealingAgent } from './recovery';
import { initGitIntegration } from './git';

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

  constructor(deps: OrchestratorDeps) {
    super();
    this.settingsStore = deps.settingsStore;
    this.workspaceManager = deps.workspaceManager;
    this.logger = deps.logger;

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
      getTerminalSettings: () => this.settingsStore.get().terminalSettings,
      getEditorState: () => this.getEditorState(),
      getWorkspaceDiagnostics: () => this.getWorkspaceDiagnostics(),
    });

    // Initialize new managers
    this.providerManager = new ProviderManager(this.settingsStore, this.logger, this.runExecutor);
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

    // Initialize autocomplete service with access to providers and settings
    initAutocompleteService({
      getProviders: () => this.providerManager.getProviders(),
      getSettings: () => this.settingsStore.get().autocompleteSettings,
      logger: this.logger,
      isProviderInCooldown: (provider) => this.runExecutor.isProviderInCooldown(provider),
    });
    this.logger.info('Autocomplete service initialized');

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

          // Editor AI + Autocomplete caches
          try {
            getEditorAIService()?.clearCache();
          } catch {
            // ignore
          }

          try {
            getAutocompleteService()?.clearCache();
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
        const tsDiagnostics = snapshot.diagnostics.map((d: { filePath: string; line: number; column: number; message: string; severity: 'error' | 'warning' | 'info' | 'hint'; code?: string | number }) => ({
          filePath: d.filePath,
          line: d.line,
          column: d.column,
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
            line: d.line,
            column: d.column,
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
      this.logger.error('Run failed', { error: errorMsg });
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
    // updateConfig is for per-session config updates (like yoloMode toggle)
    this.logger.debug('updateConfig called for session', { sessionId: payload.sessionId, config: payload.config });

    const session = this.sessionManager.getSession(payload.sessionId);
    if (session) {
      // Merge the new config with existing config
      const updatedConfig = { ...session.state.config, ...payload.config };

      // Update the session state with new config
      this.sessionManager.updateSessionState(payload.sessionId, {
        config: updatedConfig,
      });

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
    this.sessionManagementHandler.deleteSession(sessionId);
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

  private emitEvent(event: RendererEvent | AgentEvent): void {
    this.emit('event', event);
  }
}
