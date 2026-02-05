import { promises as fs } from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';
import type { AgentConfig, AgentSettings, LLMProviderName, ProviderSettings, CacheSettings, DebugSettings, PromptSettings, AutonomousFeatureFlags } from '../../shared/types';
import { DEFAULT_CACHE_SETTINGS, DEFAULT_DEBUG_SETTINGS, DEFAULT_PROMPT_SETTINGS, DEFAULT_COMPLIANCE_SETTINGS, DEFAULT_ACCESS_LEVEL_SETTINGS, DEFAULT_BROWSER_SETTINGS, DEFAULT_TASK_ROUTING_SETTINGS, DEFAULT_EDITOR_AI_SETTINGS, DEFAULT_AUTONOMOUS_FEATURE_FLAGS, DEFAULT_TOOL_CONFIG_SETTINGS, DEFAULT_APPEARANCE_SETTINGS, DEFAULT_SAFETY_SETTINGS } from '../../shared/types';
import type { MCPSettings, MCPServerConfig } from '../../shared/types/mcp';
import { DEFAULT_MCP_SETTINGS } from '../../shared/types/mcp';
import { getDefaultModel, PROVIDER_ORDER } from '../../shared/providers';
import { createLogger } from '../logger';

const logger = createLogger('SettingsStore');

// =============================================================================
// Model ID Migration Map
// Maps deprecated/renamed model IDs to their current equivalents
// =============================================================================
const MODEL_ID_MIGRATIONS: Record<string, string> = {
  // Gemini model migrations
  'gemini-3-pro': 'gemini-3-pro-preview',
  'gemini-pro': 'gemini-1.5-pro',
  'gemini-pro-vision': 'gemini-1.5-pro',
  // Add future migrations here as models are renamed
};

/**
 * Migrate deprecated model IDs to their current equivalents
 */
function migrateModelId(modelId: string): string {
  if (MODEL_ID_MIGRATIONS[modelId]) {
    logger.info('Migrating deprecated model ID', { from: modelId, to: MODEL_ID_MIGRATIONS[modelId] });
    return MODEL_ID_MIGRATIONS[modelId];
  }
  return modelId;
}

// Use the shared default cache settings for consistency
const defaultCacheSettings: CacheSettings = DEFAULT_CACHE_SETTINGS;

// Use the shared default debug settings for consistency
const defaultDebugSettings: DebugSettings = DEFAULT_DEBUG_SETTINGS;

// Use the shared default safety settings for consistency (single source of truth)
const defaultSafetySettings = DEFAULT_SAFETY_SETTINGS;

const defaultConfig: AgentConfig = {
  preferredProvider: 'auto',
  fallbackProvider: 'anthropic',  // Default to Anthropic as it's highly reliable
  allowAutoSwitch: true,
  enableProviderFallback: true,  // Enable fallback by default
  enableAutoModelSelection: true, // Enable auto model selection by default
  yoloMode: false,
  temperature: 0.2,
  maxOutputTokens: 8192, // Max compatible with DeepSeek
  // Iteration defaults
  maxIterations: 20,
  maxRetries: 2,
  retryDelayMs: 1500,
  enableContextSummarization: true,
  summarizationThreshold: 100,
  keepRecentMessages: 40,
};

// Build default provider settings dynamically from the providers config
function buildDefaultProviderSettings(): Partial<Record<LLMProviderName, ProviderSettings>> {
  const settings: Partial<Record<LLMProviderName, ProviderSettings>> = {};
  
  PROVIDER_ORDER.forEach((provider, index) => {
    const defaultModel = getDefaultModel(provider);
    settings[provider] = {
      enabled: true,
      priority: index + 1,
      model: {
        modelId: defaultModel?.id ?? '',
      },
      timeout: 120000, // 2 minutes default
      context: {},
    };
  });
  
  return settings;
}

const defaultSettings: AgentSettings = {
  apiKeys: {},
  rateLimits: {},
  providerSettings: buildDefaultProviderSettings(),
  defaultConfig,
  safetySettings: defaultSafetySettings,
  cacheSettings: defaultCacheSettings,
  debugSettings: defaultDebugSettings,
  promptSettings: DEFAULT_PROMPT_SETTINGS,
  complianceSettings: DEFAULT_COMPLIANCE_SETTINGS,
  accessLevelSettings: DEFAULT_ACCESS_LEVEL_SETTINGS,
  browserSettings: DEFAULT_BROWSER_SETTINGS,
  taskRoutingSettings: DEFAULT_TASK_ROUTING_SETTINGS,
  editorAISettings: DEFAULT_EDITOR_AI_SETTINGS,
  autonomousFeatureFlags: DEFAULT_AUTONOMOUS_FEATURE_FLAGS,
  appearanceSettings: DEFAULT_APPEARANCE_SETTINGS,
};

export class SettingsStore {
  private settings: AgentSettings = defaultSettings;

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      logger.debug('Loading settings', { filePath: this.filePath });
      let raw = await fs.readFile(this.filePath, 'utf-8');
      // Strip BOM (Byte Order Mark) if present - fixes JSON parse errors
      if (raw.charCodeAt(0) === 0xFEFF) {
        raw = raw.slice(1);
      }
      const parsed = JSON.parse(raw);
      
      // Check safeStorage availability
      const encryptionAvailable = safeStorage.isEncryptionAvailable();
      logger.debug('Encryption availability', { encryptionAvailable });
      
      // Decrypt API keys if possible
      const apiKeys: Partial<Record<LLMProviderName, string>> = {};
      if (parsed.apiKeys) {
        logger.debug('Found API keys in settings', { keys: Object.keys(parsed.apiKeys) });
        for (const [key, value] of Object.entries(parsed.apiKeys)) {
          if (typeof value === 'string' && value.length > 0) {
            try {
              if (value.startsWith('enc:')) {
                if (encryptionAvailable) {
                  const encrypted = Buffer.from(value.slice(4), 'base64');
                  const decrypted = safeStorage.decryptString(encrypted);
                  apiKeys[key as LLMProviderName] = decrypted;
                  logger.debug('Successfully decrypted API key', { provider: key, length: decrypted.length });
                } else {
                  // Encryption not available but key is encrypted - this is a problem
                  logger.error('Cannot decrypt API key: safeStorage not available', { provider: key });
                  // Keep the encrypted value so it can be decrypted later
                  apiKeys[key as LLMProviderName] = '';
                }
              } else {
                // Plain text key (shouldn't happen in production but handle it)
                apiKeys[key as LLMProviderName] = value;
                logger.debug('Using plain text API key', { provider: key, length: value.length });
              }
            } catch (error) {
              logger.error('Failed to decrypt API key', { provider: key, error: error instanceof Error ? error.message : String(error) });
              // Don't set to empty - leave it undefined so we know it failed
            }
          }
        }
      } else {
        logger.debug('No API keys found in settings file');
      }
      logger.debug('Loaded API keys', { keys: Object.keys(apiKeys).map(k => ({ key: k, length: apiKeys[k as LLMProviderName]?.length || 0 })) });
      
      // Deep merge provider settings to ensure all fields are present
      const mergedProviderSettings = { ...defaultSettings.providerSettings };
      if (parsed.providerSettings) {
        for (const [key, value] of Object.entries(parsed.providerSettings)) {
          if (value && typeof value === 'object') {
            const providerName = key as LLMProviderName;
            const savedSettings = value as Partial<ProviderSettings>;
            const defaultProviderSettings = defaultSettings.providerSettings[providerName];
            
            // Migrate deprecated model IDs to current equivalents
            const savedModelId = savedSettings.model?.modelId ?? '';
            const migratedModelId = migrateModelId(savedModelId) || defaultProviderSettings?.model?.modelId || '';
            
            mergedProviderSettings[providerName] = {
              enabled: savedSettings.enabled ?? defaultProviderSettings?.enabled ?? true,
              priority: savedSettings.priority ?? defaultProviderSettings?.priority ?? 99,
              model: {
                modelId: migratedModelId,
                temperature: savedSettings.model?.temperature,
                maxOutputTokens: savedSettings.model?.maxOutputTokens,
              },
              baseUrl: savedSettings.baseUrl,
              timeout: savedSettings.timeout ?? defaultProviderSettings?.timeout ?? 120000,
              context: {
                ...(defaultProviderSettings?.context ?? {}),
                ...(savedSettings.context ?? {}),
              },
            };
          }
        }
      }

      // Merge with defaults
      this.settings = { 
        ...defaultSettings, 
        ...parsed,
        apiKeys: { ...defaultSettings.apiKeys, ...apiKeys },
        providerSettings: mergedProviderSettings,
        defaultConfig: { ...defaultSettings.defaultConfig, ...(parsed.defaultConfig ?? {}) },
        safetySettings: { ...defaultSettings.safetySettings, ...(parsed.safetySettings ?? {}) },
        cacheSettings: { ...defaultSettings.cacheSettings, ...(parsed.cacheSettings ?? {}) },
        debugSettings: { ...defaultSettings.debugSettings, ...(parsed.debugSettings ?? {}) },
        complianceSettings: { ...defaultSettings.complianceSettings, ...(parsed.complianceSettings ?? {}) },
        browserSettings: { ...defaultSettings.browserSettings, ...(parsed.browserSettings ?? {}) },
        accessLevelSettings: { ...defaultSettings.accessLevelSettings, ...(parsed.accessLevelSettings ?? {}) },
        editorAISettings: { ...defaultSettings.editorAISettings, ...(parsed.editorAISettings ?? {}) },
        taskRoutingSettings: { 
          ...defaultSettings.taskRoutingSettings, 
          ...(parsed.taskRoutingSettings ?? {}),
          // Deep merge task mappings to preserve structure
          taskMappings: parsed.taskRoutingSettings?.taskMappings?.length > 0
            ? parsed.taskRoutingSettings.taskMappings
            : defaultSettings.taskRoutingSettings?.taskMappings ?? [],
          defaultMapping: {
            ...(defaultSettings.taskRoutingSettings?.defaultMapping ?? {}),
            ...(parsed.taskRoutingSettings?.defaultMapping ?? {}),
          },
        },
        promptSettings: { 
          ...defaultSettings.promptSettings, 
          ...(parsed.promptSettings ?? {}),
          // Deep merge personas to preserve built-in ones
          personas: [
            ...(defaultSettings.promptSettings?.personas ?? []),
            ...((parsed.promptSettings?.personas ?? []).filter(
              (p: { id: string; isBuiltIn?: boolean }) => !p.isBuiltIn
            )),
          ],
          // Deep merge agent instructions to preserve built-in ones
          agentInstructions: [
            ...(defaultSettings.promptSettings?.agentInstructions ?? []),
            ...((parsed.promptSettings?.agentInstructions ?? []).filter(
              (i: { id: string; isBuiltIn?: boolean }) => !i.isBuiltIn
            )),
          ],
          responseFormat: {
            ...(defaultSettings.promptSettings?.responseFormat ?? {}),
            ...(parsed.promptSettings?.responseFormat ?? {}),
          },
        },
        autonomousFeatureFlags: this.mergeAutonomousFeatureFlags(
          defaultSettings.autonomousFeatureFlags,
          parsed.autonomousFeatureFlags
        ),
        appearanceSettings: { ...defaultSettings.appearanceSettings, ...(parsed.appearanceSettings ?? {}) },
        mcpSettings: { ...DEFAULT_MCP_SETTINGS, ...(parsed.mcpSettings ?? {}) },
        mcpServers: parsed.mcpServers ?? [],
      };
      
      // Log loaded access level settings
      logger.debug('Access level settings loaded', {
        level: this.settings.accessLevelSettings?.level,
        restrictedPathsCount: this.settings.accessLevelSettings?.restrictedPaths?.length,
        allowedPathsCount: this.settings.accessLevelSettings?.allowedPaths?.length,
      });
      
      // Log loaded prompt settings
      logger.debug('Prompt settings loaded', {
        activePersonaId: this.settings.promptSettings?.activePersonaId,
        personasCount: this.settings.promptSettings?.personas?.length,
      });
      
      // Log loaded MCP settings
      logger.debug('MCP settings loaded', {
        enabled: this.settings.mcpSettings?.enabled,
        serversCount: this.settings.mcpServers?.length ?? 0,
      });
      
      // MIGRATION: Fix invalid maxOutputTokens values
      // This handles legacy settings files that may have 0 or invalid values stored
      if (!this.settings.defaultConfig.maxOutputTokens || this.settings.defaultConfig.maxOutputTokens <= 0) {
        logger.info('Migrating invalid maxOutputTokens', { from: this.settings.defaultConfig.maxOutputTokens, to: defaultConfig.maxOutputTokens });
        this.settings.defaultConfig.maxOutputTokens = defaultConfig.maxOutputTokens;
        // Persist the fix
        await this.persist();
      }
      
      // Also fix provider-specific maxOutputTokens if invalid
      let needsPersist = false;
      for (const [providerName, providerSettings] of Object.entries(this.settings.providerSettings)) {
        if (providerSettings?.model?.maxOutputTokens !== undefined && providerSettings.model.maxOutputTokens <= 0) {
          logger.info('Clearing invalid maxOutputTokens for provider', { provider: providerName });
          delete (providerSettings.model as { maxOutputTokens?: number }).maxOutputTokens;
          needsPersist = true;
        }
      }
      if (needsPersist) {
        await this.persist();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        await this.persist();
        return;
      }
      throw error;
    }
  }

  get(): AgentSettings {
    return this.settings;
  }

  getApiKey(provider: LLMProviderName): string | undefined {
    return this.settings.apiKeys[provider];
  }

  getProviderSettings(provider: LLMProviderName): ProviderSettings | undefined {
    return this.settings.providerSettings[provider];
  }

  set(settings: AgentSettings | Partial<AgentSettings>): AgentSettings {
    return this.setSync(settings);
  }

  setSync(settings: AgentSettings | Partial<AgentSettings>): AgentSettings {
    if (!settings) {
      logger.warn('setSync called with undefined settings');
      return this.settings;
    }
    
    // Deep merge provider settings to preserve all nested properties
    const mergedProviderSettings = { ...this.settings.providerSettings };
    if (settings.providerSettings) {
      for (const [key, value] of Object.entries(settings.providerSettings)) {
        if (value) {
          const providerName = key as LLMProviderName;
          const existingModel = mergedProviderSettings[providerName]?.model;
          const newModel = value.model;
          mergedProviderSettings[providerName] = {
            ...mergedProviderSettings[providerName],
            ...value,
            model: {
              modelId: newModel?.modelId ?? existingModel?.modelId ?? '',
              temperature: newModel?.temperature ?? existingModel?.temperature,
              maxOutputTokens: newModel?.maxOutputTokens ?? existingModel?.maxOutputTokens,
            },
            context: {
              ...(mergedProviderSettings[providerName]?.context ?? {}),
              ...(value.context ?? {}),
            },
          };
        }
      }
    }
    
    // Deep merge prompt settings to preserve nested properties
    const mergedPromptSettings = this.mergePromptSettings(
      this.settings.promptSettings,
      settings.promptSettings
    );
    
    // Deep merge autonomous feature flags to preserve nested settings
    const mergedAutonomousFlags = this.mergeAutonomousFeatureFlags(
      this.settings.autonomousFeatureFlags,
      settings.autonomousFeatureFlags
    );
    
    // Deep merge MCP settings
    const mergedMCPSettings = this.mergeMCPSettings(
      this.settings.mcpSettings,
      settings.mcpSettings
    );
    
    // Merge MCP servers (full replacement when provided)
    const mergedMCPServers = this.mergeMCPServers(
      this.settings.mcpServers,
      settings.mcpServers
    );
    
    this.settings = {
      ...this.settings,
      ...settings,
      apiKeys: { ...this.settings.apiKeys, ...(settings.apiKeys ?? {}) },
      rateLimits: { ...this.settings.rateLimits, ...(settings.rateLimits ?? {}) },
      providerSettings: mergedProviderSettings,
      defaultConfig: { ...this.settings.defaultConfig, ...(settings.defaultConfig ?? {}) },
      safetySettings: { ...this.settings.safetySettings, ...(settings.safetySettings ?? {}) },
      cacheSettings: { ...this.settings.cacheSettings, ...(settings.cacheSettings ?? {}) },
      debugSettings: { ...this.settings.debugSettings, ...(settings.debugSettings ?? {}) },
      complianceSettings: { ...this.settings.complianceSettings, ...(settings.complianceSettings ?? {}) },
      browserSettings: { ...this.settings.browserSettings, ...(settings.browserSettings ?? {}) },
      accessLevelSettings: { ...this.settings.accessLevelSettings, ...(settings.accessLevelSettings ?? {}) },
      editorAISettings: { ...this.settings.editorAISettings, ...(settings.editorAISettings ?? {}) },
      promptSettings: mergedPromptSettings,
      autonomousFeatureFlags: mergedAutonomousFlags,
      mcpSettings: mergedMCPSettings,
      mcpServers: mergedMCPServers,
    };
    
    logger.debug('Settings updated via setSync', {
      accessLevel: this.settings.accessLevelSettings?.level,
    });
    
    // Persist asynchronously without blocking
    this.persist().catch(err => logger.error('Failed to persist settings', { error: err instanceof Error ? err.message : String(err) }));
    
    return this.settings;
  }

  async update(partial: Partial<AgentSettings>): Promise<AgentSettings> {
    // Deep merge provider settings to preserve all nested properties
    const mergedProviderSettings = { ...this.settings.providerSettings };
    if (partial.providerSettings) {
      for (const [key, value] of Object.entries(partial.providerSettings)) {
        if (value) {
          const providerName = key as LLMProviderName;
          const existingModel = mergedProviderSettings[providerName]?.model;
          const newModel = value.model;
          mergedProviderSettings[providerName] = {
            ...mergedProviderSettings[providerName],
            ...value,
            model: {
              modelId: newModel?.modelId ?? existingModel?.modelId ?? '',
              temperature: newModel?.temperature ?? existingModel?.temperature,
              maxOutputTokens: newModel?.maxOutputTokens ?? existingModel?.maxOutputTokens,
            },
            context: {
              ...(mergedProviderSettings[providerName]?.context ?? {}),
              ...(value.context ?? {}),
            },
          };
        }
      }
    }
    
    // Deep merge prompt settings to preserve nested properties
    const mergedPromptSettings = this.mergePromptSettings(
      this.settings.promptSettings,
      partial.promptSettings
    );
    
    // Deep merge autonomous feature flags to preserve nested settings
    const mergedAutonomousFlags = this.mergeAutonomousFeatureFlags(
      this.settings.autonomousFeatureFlags,
      partial.autonomousFeatureFlags
    );
    
    // Deep merge MCP settings
    const mergedMCPSettings = this.mergeMCPSettings(
      this.settings.mcpSettings,
      partial.mcpSettings
    );
    
    // Merge MCP servers (full replacement when provided)
    const mergedMCPServers = this.mergeMCPServers(
      this.settings.mcpServers,
      partial.mcpServers
    );
    
    this.settings = {
      ...this.settings,
      ...partial,
      apiKeys: { ...this.settings.apiKeys, ...(partial.apiKeys ?? {}) },
      rateLimits: { ...this.settings.rateLimits, ...(partial.rateLimits ?? {}) },
      providerSettings: mergedProviderSettings,
      defaultConfig: { ...this.settings.defaultConfig, ...(partial.defaultConfig ?? {}) },
      safetySettings: { ...this.settings.safetySettings, ...(partial.safetySettings ?? {}) },
      cacheSettings: { ...this.settings.cacheSettings, ...(partial.cacheSettings ?? {}) },
      debugSettings: { ...this.settings.debugSettings, ...(partial.debugSettings ?? {}) },
      complianceSettings: { ...this.settings.complianceSettings, ...(partial.complianceSettings ?? {}) },
      browserSettings: { ...this.settings.browserSettings, ...(partial.browserSettings ?? {}) },
      accessLevelSettings: { ...this.settings.accessLevelSettings, ...(partial.accessLevelSettings ?? {}) },
      editorAISettings: { ...this.settings.editorAISettings, ...(partial.editorAISettings ?? {}) },
      promptSettings: mergedPromptSettings,
      autonomousFeatureFlags: mergedAutonomousFlags,
      mcpSettings: mergedMCPSettings,
      mcpServers: mergedMCPServers,
    };
    
    logger.debug('Settings updated via update()', {
      accessLevel: this.settings.accessLevelSettings?.level,
      restrictedPaths: this.settings.accessLevelSettings?.restrictedPaths?.length,
    });
    
    await this.persist();
    return this.settings;
  }

  /**
   * Deep merge prompt settings to preserve nested properties
   */
  private mergePromptSettings(
    existing: PromptSettings | undefined,
    incoming: Partial<PromptSettings> | undefined
  ): PromptSettings {
    const base = existing ?? DEFAULT_PROMPT_SETTINGS;
    
    if (!incoming) {
      return base;
    }
    
    // Merge personas - keep existing ones and update/add incoming ones
    let mergedPersonas = [...base.personas];
    if (incoming.personas) {
      // Replace with incoming personas (full replacement since UI manages full array)
      mergedPersonas = incoming.personas;
    }
    
    // Merge context injection rules
    let mergedRules = [...(base.contextInjectionRules ?? [])];
    if (incoming.contextInjectionRules !== undefined) {
      // Replace with incoming rules (full replacement since UI manages full array)
      mergedRules = incoming.contextInjectionRules;
    }

    // Merge agent instructions
    let mergedAgentInstructions = [...(base.agentInstructions ?? [])];
    if (incoming.agentInstructions !== undefined) {
      // Replace with incoming instructions (full replacement since UI manages full array)
      mergedAgentInstructions = incoming.agentInstructions;
    }
    
    // Merge response format
    const mergedResponseFormat = {
      ...(base.responseFormat ?? DEFAULT_PROMPT_SETTINGS.responseFormat),
      ...(incoming.responseFormat ?? {}),
    };

    // Merge instruction files config - spread all boolean flags and nested objects
    const mergedInstructionFilesConfig = {
      ...(base.instructionFilesConfig ?? DEFAULT_PROMPT_SETTINGS.instructionFilesConfig),
      ...(incoming.instructionFilesConfig ?? {}),
      // Deep merge nested fileOverrides object
      fileOverrides: {
        ...(base.instructionFilesConfig?.fileOverrides ?? {}),
        ...(incoming.instructionFilesConfig?.fileOverrides ?? {}),
      },
    };
    
    const result = {
      customSystemPrompt: incoming.customSystemPrompt ?? base.customSystemPrompt,
      useCustomSystemPrompt: incoming.useCustomSystemPrompt ?? base.useCustomSystemPrompt,
      activePersonaId: incoming.activePersonaId ?? base.activePersonaId,
      personas: mergedPersonas,
      contextInjectionRules: mergedRules,
      agentInstructions: mergedAgentInstructions,
      responseFormat: mergedResponseFormat,
      includeWorkspaceContext: incoming.includeWorkspaceContext ?? base.includeWorkspaceContext,
      instructionFilesConfig: mergedInstructionFilesConfig,
    };
    
    return result;
  }

  /**
   * Deep merge autonomous feature flags to preserve nested settings
   */
  private mergeAutonomousFeatureFlags(
    existing: AutonomousFeatureFlags | undefined,
    incoming: Partial<AutonomousFeatureFlags> | undefined
  ): AutonomousFeatureFlags {
    const base = existing ?? DEFAULT_AUTONOMOUS_FEATURE_FLAGS;
    
    if (!incoming) {
      return base;
    }
    
    // Deep merge toolSettings
    const mergedToolSettings = {
      ...DEFAULT_TOOL_CONFIG_SETTINGS,
      ...(base.toolSettings ?? {}),
      ...(incoming.toolSettings ?? {}),
    };
    
    return {
      enableAutonomousMode: incoming.enableAutonomousMode ?? base.enableAutonomousMode,
      enableTaskPlanning: incoming.enableTaskPlanning ?? base.enableTaskPlanning,
      enableDynamicTools: incoming.enableDynamicTools ?? base.enableDynamicTools,
      enableSafetyFramework: incoming.enableSafetyFramework ?? base.enableSafetyFramework,
      enablePerformanceMonitoring: incoming.enablePerformanceMonitoring ?? base.enablePerformanceMonitoring,
      enableAdvancedDebugging: incoming.enableAdvancedDebugging ?? base.enableAdvancedDebugging,
      toolSettings: mergedToolSettings,
    };
  }

  /**
   * Deep merge MCP settings to preserve all properties
   */
  private mergeMCPSettings(
    existing: MCPSettings | undefined,
    incoming: Partial<MCPSettings> | undefined
  ): MCPSettings {
    const base = existing ?? DEFAULT_MCP_SETTINGS;
    
    if (!incoming) {
      return base;
    }
    
    // Log MCP settings changes for debugging
    if (incoming.enabled !== undefined && incoming.enabled !== base.enabled) {
      logger.info('MCP enabled state changed', { from: base.enabled, to: incoming.enabled });
    }
    
    return {
      enabled: incoming.enabled ?? base.enabled,
      autoStartServers: incoming.autoStartServers ?? base.autoStartServers,
      connectionTimeoutMs: incoming.connectionTimeoutMs ?? base.connectionTimeoutMs,
      toolTimeoutMs: incoming.toolTimeoutMs ?? base.toolTimeoutMs,
      maxConcurrentConnections: incoming.maxConcurrentConnections ?? base.maxConcurrentConnections,
      cacheToolResults: incoming.cacheToolResults ?? base.cacheToolResults,
      cacheTtlMs: incoming.cacheTtlMs ?? base.cacheTtlMs,
      showInToolSelection: incoming.showInToolSelection ?? base.showInToolSelection,
      debugLogging: incoming.debugLogging ?? base.debugLogging,
      retryFailedConnections: incoming.retryFailedConnections ?? base.retryFailedConnections,
      retryCount: incoming.retryCount ?? base.retryCount,
      retryDelayMs: incoming.retryDelayMs ?? base.retryDelayMs,
      customRegistries: incoming.customRegistries ?? base.customRegistries,
    };
  }

  /**
   * Merge MCP server configurations (replace entire array if provided)
   */
  private mergeMCPServers(
    existing: MCPServerConfig[] | undefined,
    incoming: MCPServerConfig[] | undefined
  ): MCPServerConfig[] | undefined {
    // If incoming is provided, replace entirely (server management handles merging)
    if (incoming !== undefined) {
      logger.debug('MCP servers updated', { count: incoming.length });
      return incoming;
    }
    return existing;
  }

  /**
   * Reset all settings to defaults, preserving API keys
   */
  async resetToDefaults(): Promise<AgentSettings> {
    logger.info('Resetting all settings to defaults');
    
    // Preserve API keys only
    const apiKeys = this.settings.apiKeys;
    
    this.settings = {
      ...defaultSettings,
      apiKeys,
    };
    
    await this.persist();
    return this.settings;
  }

  /**
   * Reset a specific settings section to its default
   */
  async resetSection(section: keyof AgentSettings): Promise<AgentSettings> {
    logger.info('Resetting settings section to default', { section });
    
    // Don't allow resetting API keys through this method
    if (section === 'apiKeys') {
      logger.warn('Cannot reset API keys through resetSection');
      return this.settings;
    }
    
    const defaultValue = defaultSettings[section];
    if (defaultValue !== undefined) {
      // Type-safe assignment: use the key directly on this.settings
      // We know section is a valid key of AgentSettings
      (this.settings[section] as typeof defaultValue) = defaultValue;
      await this.persist();
    }
    
    return this.settings;
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    
    // Encrypt API keys before saving
    const encryptedKeys: Partial<Record<LLMProviderName, string>> = {};
    if (this.settings.apiKeys) {
      for (const [key, value] of Object.entries(this.settings.apiKeys)) {
        if (value) {
          if (safeStorage.isEncryptionAvailable()) {
            const encrypted = safeStorage.encryptString(value);
            encryptedKeys[key as LLMProviderName] = `enc:${encrypted.toString('base64')}`;
          } else {
            encryptedKeys[key as LLMProviderName] = value;
          }
        }
      }
    }

    const toSave = {
      ...this.settings,
      apiKeys: encryptedKeys,
    };

    await fs.writeFile(this.filePath, JSON.stringify(toSave, null, 2), 'utf-8');
  }
}
