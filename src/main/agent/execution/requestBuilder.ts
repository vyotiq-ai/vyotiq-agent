/**
 * Request Builder
 * Builds provider requests with system prompts, tools, and context management
 * 
 * Features:
 * - Context-aware tool selection (only loads relevant tools)
 * - Agent-controlled tool loading via request_tools
 * - Session-scoped tool persistence
 */

import type { LLMProviderName, PromptSettings, RoutingDecision } from '../../../shared/types';
import type { InternalSession } from '../types';
import type { Logger } from '../../logger';
import type { ToolRegistry } from '../../tools';
import type { WorkspaceManager } from '../../workspaces/workspaceManager';
import type { LLMProvider, ProviderRequest, ProviderToolDefinition } from '../providers/baseProvider';
import type { EditorState, WorkspaceDiagnostics } from './types';
import type { ContextBuilder } from './contextBuilder';
import { ContextWindowManager, ConversationSummarizer, type ContextMetrics } from '../context';
import { 
  selectToolsForContext, 
  detectWorkspaceType, 
  extractRecentToolUsage,
  getToolSelectionSummary,
  type ToolSelectionContext,
} from '../context';
import { ComplianceValidator, PromptOptimizer } from '../compliance';
import { buildSystemPrompt, DEFAULT_PROMPT_SETTINGS, type SystemPromptContext } from '../systemPrompt';
import { buildImageGenerationSystemPrompt } from '../imageGenerationPrompt';
import { buildMCPContextInfo } from '../../mcp';
import { getAgentsMdReader } from '../workspace/AgentsMdReader';
import { AGGRESSIVE_CACHE_CONFIG, CONSERVATIVE_CACHE_CONFIG, DEFAULT_CACHE_CONFIG } from '../cache';
import { normalizeStrictJsonSchema } from '../../utils';
import { getSharedModelById, getProviderConfig } from '../providers/registry';
import { modelBelongsToProvider } from '../utils/modelUtils';
import { convertMessagesToProvider } from '../utils/messageUtils';
import { agentMetrics } from '../metrics';
import type { RendererEvent, AgentEvent, CacheSettings, AccessLevelSettings, ProviderSettings } from '../../../shared/types';

export class RequestBuilder {
  private readonly toolRegistry: ToolRegistry;
  private readonly workspaceManager: WorkspaceManager;
  private readonly logger: Logger;
  private readonly contextBuilder: ContextBuilder;
  private readonly complianceValidator: ComplianceValidator;
  private readonly promptOptimizer: PromptOptimizer;
  
  // Settings getters
  private readonly getProviderSettings: (provider: LLMProviderName) => ProviderSettings | undefined;
  private readonly getCacheSettings: () => CacheSettings | undefined;
  private readonly getPromptSettings: () => PromptSettings | undefined;
  private readonly getAccessLevelSettings: () => AccessLevelSettings | undefined;
  private readonly getEditorState?: () => EditorState;
  private readonly getWorkspaceDiagnostics?: () => Promise<WorkspaceDiagnostics | null>;
  
  // Context management
  private contextManager: ContextWindowManager;
  private conversationSummarizer: ConversationSummarizer;
  
  // Event emitter
  private readonly emitEvent: (event: RendererEvent | AgentEvent) => void;

  constructor(
    toolRegistry: ToolRegistry,
    workspaceManager: WorkspaceManager,
    logger: Logger,
    contextBuilder: ContextBuilder,
    complianceValidator: ComplianceValidator,
    promptOptimizer: PromptOptimizer,
    getProviderSettings: (provider: LLMProviderName) => ProviderSettings | undefined,
    getCacheSettings: () => CacheSettings | undefined,
    getPromptSettings: () => PromptSettings | undefined,
    getAccessLevelSettings: () => AccessLevelSettings | undefined,
    emitEvent: (event: RendererEvent | AgentEvent) => void,
    getEditorState?: () => EditorState,
    getWorkspaceDiagnostics?: () => Promise<WorkspaceDiagnostics | null>
  ) {
    this.toolRegistry = toolRegistry;
    this.workspaceManager = workspaceManager;
    this.logger = logger;
    this.contextBuilder = contextBuilder;
    this.complianceValidator = complianceValidator;
    this.promptOptimizer = promptOptimizer;
    this.getProviderSettings = getProviderSettings;
    this.getCacheSettings = getCacheSettings;
    this.getPromptSettings = getPromptSettings;
    this.getAccessLevelSettings = getAccessLevelSettings;
    this.emitEvent = emitEvent;
    this.getEditorState = getEditorState;
    this.getWorkspaceDiagnostics = getWorkspaceDiagnostics;
    
    this.contextManager = new ContextWindowManager('deepseek');
    this.conversationSummarizer = new ConversationSummarizer({
      minMessagesForSummary: 100,
      keepRecentMessages: 40,
      maxToolResultTokens: 1200,
    });
  }

  /**
   * Update context manager for a specific provider
   */
  updateContextManagerForProvider(providerName: LLMProviderName, modelContextWindow?: number): void {
    this.contextManager.updateConfig(providerName, undefined, modelContextWindow);
  }

  /**
   * Update summarizer settings for a session
   */
  updateSummarizerForSession(session: InternalSession): void {
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

  /**
   * Get the effective model ID for a session
   */
  getEffectiveModelId(
    session: InternalSession,
    provider: LLMProvider,
    _runId?: string,
    routingDecision?: RoutingDecision
  ): string | undefined {
    const sessionModelId = session.state.config.selectedModelId;
    if (sessionModelId) {
      if (modelBelongsToProvider(sessionModelId, provider.name)) {
        return sessionModelId;
      }
      this.logger.debug('Ignoring session model for mismatched provider', {
        sessionId: session.state.id,
        provider: provider.name,
        sessionModelId,
      });
    }

    if (routingDecision && routingDecision.selectedProvider === provider.name) {
      this.logger.debug('Using routing decision model for Auto mode', {
        sessionId: session.state.id,
        provider: provider.name,
        selectedModel: routingDecision.selectedModel,
        taskType: routingDecision.detectedTaskType,
      });
      return routingDecision.selectedModel;
    }

    const providerSettings = this.getProviderSettings(provider.name);
    const settingsModelId = providerSettings?.model?.modelId;
    
    if (settingsModelId && settingsModelId.trim()) {
      return settingsModelId;
    }
    
    const providerConfig = getProviderConfig(provider.name);
    if (providerConfig?.defaultModel) {
      this.logger.warn('No model configured in Settings - using provider default', {
        provider: provider.name,
        defaultModel: providerConfig.defaultModel,
      });
      return providerConfig.defaultModel;
    }
    
    return undefined;
  }

  /**
   * Get tool definitions for a provider with dynamic context-aware filtering
   * 
   * This method implements TRUE dynamic tool loading where:
   * - Core tools are always loaded (essential for any task)
   * - Deferred tools are ONLY loaded when explicitly requested by the agent
   * - Agent-requested tools persist for the entire session
   * - Task intent detection adds relevant tools dynamically
   * 
   * This approach significantly reduces context token usage by:
   * - Not loading all tool schemas upfront
   * - Only including tools relevant to the current task
   * - Allowing the agent to request additional tools as needed
   * 
   * @param providerName - The provider name for logging/debugging purposes
   * @param session - The session context for tool selection
   */
  getToolDefinitions(providerName?: LLMProviderName, session?: InternalSession): ProviderToolDefinition[] {
    const allTools = this.toolRegistry.list();

    // If no session, return only non-deferred tools (minimal set)
    if (!session) {
      const nonDeferredTools = allTools.filter(tool => !tool.deferLoading);
      this.logger.debug('No session context, returning non-deferred tools only', {
        provider: providerName,
        totalTools: allTools.length,
        loadedTools: nonDeferredTools.length,
        deferredTools: allTools.length - nonDeferredTools.length,
      });
      return this.convertToProviderFormat(nonDeferredTools);
    }

    // Build selection context with session ID for proper state tracking
    const recentMessages = session.state.messages.slice(-10);
    const recentToolUsage = extractRecentToolUsage(session.state.messages);
    const workspace = session.state.workspaceId
      ? this.workspaceManager.list().find(w => w.id === session.state.workspaceId)
      : this.workspaceManager.getActive();
    const workspaceType = detectWorkspaceType(workspace?.path || null);

    const selectionContext: ToolSelectionContext = {
      recentMessages,
      recentToolUsage,
      workspaceType,
      sessionId: session.state.id,
      maxTools: 18, // Reduced to minimize token consumption - agent can request more via request_tools
      useSuccessRateBoost: true,
      // Include error recovery tools if there were recent errors
      includeErrorRecoveryTools: true,
    };

    // Select relevant tools using the context-aware selection
    // This respects deferLoading flags and session tool state
    const selectedTools = selectToolsForContext(allTools, selectionContext);

    // Calculate token savings from deferred loading
    const deferredCount = allTools.filter(t => t.deferLoading).length;
    const loadedDeferredCount = selectedTools.filter(t => t.deferLoading).length;
    const tokensSaved = (deferredCount - loadedDeferredCount) * 150; // ~150 tokens per tool schema

    // Log selection summary with dynamic loading metrics
    const summary = getToolSelectionSummary(selectedTools, allTools.length);
    this.logger.debug('Dynamic tool selection complete', {
      provider: providerName,
      sessionId: session.state.id,
      summary,
      workspaceType,
      recentToolCount: recentToolUsage.length,
      dynamicLoadingMetrics: {
        totalTools: allTools.length,
        selectedTools: selectedTools.length,
        deferredToolsTotal: deferredCount,
        deferredToolsLoaded: loadedDeferredCount,
        estimatedTokensSaved: tokensSaved,
      },
    });

    return this.convertToProviderFormat(selectedTools);
  }

  /**
   * Convert tool definitions to provider format
   */
  private convertToProviderFormat(tools: import('../../tools/types').ToolDefinition[]): ProviderToolDefinition[] {
    return tools.map(tool => {
      const schema = tool.schema ? normalizeStrictJsonSchema(tool.schema as unknown as Record<string, unknown>) : {};
      return {
        name: tool.name,
        description: tool.description,
        jsonSchema: schema,
        requiresApproval: tool.requiresApproval,
        input_examples: tool.inputExamples,
      };
    });
  }

  /**
   * Get context metrics for current state
   */
  getContextMetrics(
    messages: import('../../../shared/types').ChatMessage[],
    systemPrompt: string,
    tools: Array<{ name: string; description: string; jsonSchema: unknown }>
  ): ContextMetrics {
    return this.contextManager.getContextMetrics(messages, systemPrompt, tools);
  }

  /**
   * Get max input tokens for current context manager
   */
  getMaxInputTokens(): number {
    return this.contextManager.getMaxInputTokens();
  }

  /**
   * Build provider request for a session
   */
  async buildProviderRequest(
    session: InternalSession,
    provider: LLMProvider,
    updateSessionState: (sessionId: string, update: Partial<InternalSession['state']>) => void
  ): Promise<ProviderRequest> {
    const workspace = session.state.workspaceId
      ? this.workspaceManager.list().find(w => w.id === session.state.workspaceId)
      : this.workspaceManager.getActive();

    if (session.state.workspaceId && !workspace) {
      throw new Error(`Provider request failed: workspace not found for session ${session.state.id}`);
    }

    const providerSettings = this.getProviderSettings(provider.name);
    const modelId = this.getEffectiveModelId(session, provider, session.state.activeRunId, session.agenticContext?.routingDecision);
    const modelInfo = modelId ? getSharedModelById(modelId) : undefined;

    if (modelInfo && modelInfo.supportsMultiturnChat === false) {
      throw new Error(
        `Model "${modelInfo.name}" (${modelId}) does not support multi-turn chat conversations.`
      );
    }

    const modelSupportsTools = modelInfo?.supportsTools ?? true;

    // Build system prompt
    let systemPrompt: string;
    if (modelInfo?.supportsImageGeneration) {
      systemPrompt = buildImageGenerationSystemPrompt();
    } else {
      systemPrompt = await this.buildSystemPromptForSession(session, provider, workspace, modelId);
    }

    const tools = modelSupportsTools ? this.getToolDefinitions(provider.name, session) : [];

    // Update context manager for current provider
    this.updateContextManagerForProvider(provider.name, modelInfo?.contextWindow);

    // Process messages with context management
    let messages = [...session.state.messages];
    const toolDefs: Array<{ name: string; description: string; jsonSchema: unknown }> = tools.map(t => ({
      name: t.name,
      description: t.description,
      jsonSchema: t.jsonSchema
    }));

    // Compress old tool results
    const recentMessageCount = 40;
    if (messages.length > recentMessageCount + 10) {
      const oldMessages = messages.slice(0, -recentMessageCount);
      const recentMessages = messages.slice(-recentMessageCount);

      const compressionResult = this.conversationSummarizer.compressToolResults(oldMessages);
      if (compressionResult.tokensFreed > 0) {
        messages = [...compressionResult.messages, ...recentMessages];
      }

      const clearResult = this.conversationSummarizer.clearOldToolResults(messages, recentMessageCount + 20);
      if (clearResult.tokensFreed > 0) {
        messages = clearResult.messages;
      }
    }

    const metrics = this.contextManager.getContextMetrics(messages, systemPrompt, toolDefs);

    // Emit context metrics
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

    // Apply pruning if needed
    if (metrics.needsPruning) {
      const pruningResult = this.contextManager.pruneMessages(
        messages,
        systemPrompt,
        toolDefs,
        'Context window limit approaching'
      );

      messages = pruningResult.messages;
      session.state.messages = messages;
      updateSessionState(session.state.id, {
        messages: session.state.messages,
        updatedAt: Date.now(),
      });

      const runId = session.state.activeRunId;
      if (runId) {
        agentMetrics.updateContextMetrics(runId, messages.length, true, false);
      }
    }

    const providerMessages = convertMessagesToProvider(messages);
    const temperature = session.state.config.temperature ?? providerSettings?.model?.temperature ?? 0.2;

    // Calculate max tokens
    const agenticMaxTokens = session.agenticContext?.maxOutputTokens;
    const providerMaxTokens = providerSettings?.model?.maxOutputTokens;
    const sessionMaxTokens = session.state.config.maxOutputTokens;
    
    let maxTokens: number;
    if (agenticMaxTokens && agenticMaxTokens > 0) {
      maxTokens = agenticMaxTokens;
    } else {
      const rawMaxTokens = sessionMaxTokens || providerMaxTokens;
      maxTokens = (rawMaxTokens && rawMaxTokens > 0) ? rawMaxTokens : 8192;
    }

    // Determine response modalities
    let responseModalities: ('TEXT' | 'IMAGE' | 'AUDIO')[] | undefined;
    if (modelInfo?.supportsImageGeneration) {
      responseModalities = ['TEXT', 'IMAGE'];
    }

    // Anthropic extended thinking settings
    // Enable by default for Claude models that support it, unless explicitly disabled
    // @see https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking
    const enableAnthropicThinking = session.state.config.enableAnthropicThinking ?? true;
    const anthropicThinkingBudget = session.state.config.anthropicThinkingBudget ?? 10000;
    const enableInterleavedThinking = session.state.config.enableInterleavedThinking ?? false;

    return {
      systemPrompt,
      messages: providerMessages,
      tools,
      cache: this.buildCacheConfig(provider),
      config: {
        model: modelId,
        temperature,
        maxOutputTokens: maxTokens,
        responseModalities,
        reasoningEffort: session.state.config.reasoningEffort || undefined,
        verbosity: session.state.config.verbosity || undefined,
        // Anthropic extended thinking configuration
        enableAnthropicThinking: provider.name === 'anthropic' ? enableAnthropicThinking : undefined,
        anthropicThinkingBudget: provider.name === 'anthropic' ? anthropicThinkingBudget : undefined,
        enableInterleavedThinking: provider.name === 'anthropic' ? enableInterleavedThinking : undefined,
      },
    };
  }

  /**
   * Build cache configuration for a provider
   */
  private buildCacheConfig(provider: LLMProvider): import('../providers/baseProvider').CacheConfig | undefined {
    if (!provider.supportsCaching) return undefined;

    const cacheSettings = this.getCacheSettings();
    const enabled = cacheSettings?.enablePromptCache?.[provider.name] ?? true;
    if (!enabled) return undefined;

    const strategy = cacheSettings?.promptCacheStrategy ?? 'default';
    if (strategy === 'aggressive') return { ...AGGRESSIVE_CACHE_CONFIG };
    if (strategy === 'conservative') return { ...CONSERVATIVE_CACHE_CONFIG };
    return { ...DEFAULT_CACHE_CONFIG };
  }

  /**
   * Build system prompt for a session
   */
  private async buildSystemPromptForSession(
    session: InternalSession,
    provider: LLMProvider,
    workspace?: { id: string; path: string; name?: string },
    modelIdOverride?: string
  ): Promise<string> {
    const tools = this.toolRegistry.list();
    const toolsList = tools.map(t => t.name).join(', ');
    const toolDefinitions = tools.map(t => ({
      name: t.name,
      description: t.description,
    }));

    const rawPromptSettings = this.getPromptSettings();
    const promptSettings = rawPromptSettings ?? DEFAULT_PROMPT_SETTINGS;
    if (!promptSettings.personas) {
      promptSettings.personas = [];
    }

    const modelId = modelIdOverride ?? (this.getEffectiveModelId(session, provider, session.state.activeRunId, session.agenticContext?.routingDecision) ?? provider.name);
    const accessLevelSettings = this.getAccessLevelSettings();
    const terminalContext = this.contextBuilder.buildTerminalContext(workspace?.path);
    const workspaceStructure = await this.contextBuilder.buildWorkspaceStructureContext(workspace?.path);
    const workspaceDiagnostics = await this.getWorkspaceDiagnostics?.();

    // Build MCP context for available external tools
    const mcpContext = buildMCPContextInfo({ enabled: true });

    // Read AGENTS.md context from workspace (project-specific agent instructions)
    const agentsMdReader = getAgentsMdReader();
    if (workspace?.path) {
      agentsMdReader.setWorkspace(workspace.path);
    }
    const editorState = this.getEditorState?.();
    const agentsMdContext = await agentsMdReader.getContextForFile(editorState?.activeFile);

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
      editorContext: editorState,
      workspaceDiagnostics: workspaceDiagnostics ?? undefined,
      workspaceStructure,
      mcpContext,
      agentsMdContext,
      logger: this.logger,
    };

    let systemPrompt = buildSystemPrompt(context);

    // Optimize prompt
    const optimizationResult = this.promptOptimizer.optimizePrompt(
      systemPrompt,
      provider.name,
      { forceCondense: false }
    );

    if (optimizationResult.wasOptimized) {
      systemPrompt = optimizationResult.systemPrompt;
    }

    // Add mid-conversation reminder
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
    }

    return systemPrompt;
  }

  /**
   * Estimate token count
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
