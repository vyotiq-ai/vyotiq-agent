/**
 * Settings Validation Module
 * 
 * Provides validation utilities for all settings types.
 * Ensures settings values are within valid ranges and have correct formats.
 * Uses SETTINGS_CONSTRAINTS from shared/types for consistent validation limits.
 */

import { createLogger } from '../logger';
import type {
  AgentConfig,
  BrowserSettings,
  ComplianceSettings,
  AccessLevelSettings,
  TaskRoutingSettings,
  PromptSettings,
  SafetySettings,
  ToolConfigSettings,
  AppearanceSettings,
  DebugSettings,
  CacheSettings,
  WorkspaceIndexingSettings,
  LLMProviderName,
} from '../../shared/types';
import type {
  MCPSettings,
} from '../../shared/types/mcp';
import {
  DEFAULT_BROWSER_SETTINGS,
  DEFAULT_TOOL_CONFIG_SETTINGS,
  SETTINGS_CONSTRAINTS,
} from '../../shared/types';

const logger = createLogger('SettingsValidation');

// =============================================================================
// Validation Result Types
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

// =============================================================================
// Validation Helpers
// =============================================================================

function validateRange(
  value: number | undefined,
  min: number,
  max: number,
  field: string,
  errors: ValidationError[]
): void {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push({ field, message: `${field} must be a valid number`, value });
    return;
  }
  if (value < min || value > max) {
    errors.push({
      field,
      message: `${field} must be between ${min} and ${max}`,
      value,
    });
  }
}

function validateStringArray(
  value: unknown,
  field: string,
  errors: ValidationError[]
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push({ field, message: `${field} must be an array`, value });
    return;
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string') {
      errors.push({
        field: `${field}[${i}]`,
        message: `${field} items must be strings`,
        value: value[i],
      });
    }
  }
}

function validateEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
  errors: ValidationError[]
): void {
  if (value === undefined) return;
  if (!allowed.includes(value as T)) {
    errors.push({
      field,
      message: `${field} must be one of: ${allowed.join(', ')}`,
      value,
    });
  }
}

// =============================================================================
// Browser Settings Validation
// =============================================================================

export function validateBrowserSettings(settings: Partial<BrowserSettings>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate navigation timeout (1000ms to 300000ms / 5 minutes)
  validateRange(settings.navigationTimeout, 1000, 300000, 'navigationTimeout', errors);

  // Validate max content length (1KB to 50MB)
  validateRange(settings.maxContentLength, 1024, 50 * 1024 * 1024, 'maxContentLength', errors);

  // Validate trusted localhost ports (valid port numbers)
  if (settings.trustedLocalhostPorts) {
    for (let i = 0; i < settings.trustedLocalhostPorts.length; i++) {
      const port = settings.trustedLocalhostPorts[i];
      if (typeof port !== 'number' || port < 1 || port > 65535) {
        errors.push({
          field: `trustedLocalhostPorts[${i}]`,
          message: 'Port must be between 1 and 65535',
          value: port,
        });
      }
    }
  }

  // Validate URL lists
  validateStringArray(settings.allowList, 'allowList', errors);
  validateStringArray(settings.customBlockList, 'customBlockList', errors);

  // Warn if security features are disabled
  if (settings.urlFilteringEnabled === false) {
    warnings.push({
      field: 'urlFilteringEnabled',
      message: 'URL filtering is disabled - this may expose the browser to malicious sites',
      suggestion: 'Consider enabling URL filtering for security',
    });
  }

  if (settings.downloadProtectionEnabled === false) {
    warnings.push({
      field: 'downloadProtectionEnabled',
      message: 'Download protection is disabled',
      suggestion: 'Consider enabling to prevent downloading dangerous file types',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

// =============================================================================
// Agent Config (defaultConfig) Validation
// =============================================================================

/**
 * Validate agent configuration settings (defaultConfig)
 * These are the core agent behavior settings including iterations, retries, etc.
 */
export function validateAgentConfig(config: Partial<AgentConfig>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate temperature (0 to 2)
  validateRange(
    config.temperature,
    SETTINGS_CONSTRAINTS.temperature.min,
    SETTINGS_CONSTRAINTS.temperature.max,
    'temperature',
    errors
  );

  // Validate maxOutputTokens (1 to 200000)
  validateRange(
    config.maxOutputTokens,
    SETTINGS_CONSTRAINTS.maxOutputTokens.min,
    SETTINGS_CONSTRAINTS.maxOutputTokens.max,
    'maxOutputTokens',
    errors
  );

  // Validate maxIterations (minimum 1, no upper limit)
  if (config.maxIterations !== undefined) {
    if (typeof config.maxIterations !== 'number' || !Number.isFinite(config.maxIterations)) {
      errors.push({ field: 'maxIterations', message: 'maxIterations must be a valid number', value: config.maxIterations });
    } else if (config.maxIterations < SETTINGS_CONSTRAINTS.maxIterations.min) {
      errors.push({ field: 'maxIterations', message: `maxIterations must be at least ${SETTINGS_CONSTRAINTS.maxIterations.min}`, value: config.maxIterations });
    }
  }

  // Validate maxRetries (0 to 5)
  validateRange(
    config.maxRetries,
    SETTINGS_CONSTRAINTS.maxRetries.min,
    SETTINGS_CONSTRAINTS.maxRetries.max,
    'maxRetries',
    errors
  );

  // Validate retryDelayMs (100 to 10000)
  validateRange(
    config.retryDelayMs,
    SETTINGS_CONSTRAINTS.retryDelayMs.min,
    SETTINGS_CONSTRAINTS.retryDelayMs.max,
    'retryDelayMs',
    errors
  );

  // Validate summarizationThreshold (10 to 500)
  validateRange(
    config.summarizationThreshold,
    SETTINGS_CONSTRAINTS.summarizationThreshold.min,
    SETTINGS_CONSTRAINTS.summarizationThreshold.max,
    'summarizationThreshold',
    errors
  );

  // Validate keepRecentMessages (5 to 100)
  validateRange(
    config.keepRecentMessages,
    SETTINGS_CONSTRAINTS.keepRecentMessages.min,
    SETTINGS_CONSTRAINTS.keepRecentMessages.max,
    'keepRecentMessages',
    errors
  );

  // Validate anthropic thinking budget if present
  if (config.anthropicThinkingBudget !== undefined) {
    validateRange(
      config.anthropicThinkingBudget,
      SETTINGS_CONSTRAINTS.anthropicThinkingBudget.min,
      SETTINGS_CONSTRAINTS.anthropicThinkingBudget.max,
      'anthropicThinkingBudget',
      errors
    );
  }

  // Validate reasoning effort enum
  if (config.reasoningEffort !== undefined) {
    validateEnum(config.reasoningEffort, ['none', 'low', 'medium', 'high', 'xhigh'] as const, 'reasoningEffort', errors);
  }

  // Validate verbosity enum
  if (config.verbosity !== undefined) {
    validateEnum(config.verbosity, ['low', 'medium', 'high'] as const, 'verbosity', errors);
  }

  // Validate boolean thinking flags
  if (config.enableAnthropicThinking !== undefined && typeof config.enableAnthropicThinking !== 'boolean') {
    errors.push({ field: 'enableAnthropicThinking', message: 'enableAnthropicThinking must be a boolean', value: config.enableAnthropicThinking });
  }
  if (config.enableInterleavedThinking !== undefined && typeof config.enableInterleavedThinking !== 'boolean') {
    errors.push({ field: 'enableInterleavedThinking', message: 'enableInterleavedThinking must be a boolean', value: config.enableInterleavedThinking });
  }
  if (config.enableDeepSeekThinking !== undefined && typeof config.enableDeepSeekThinking !== 'boolean') {
    errors.push({ field: 'enableDeepSeekThinking', message: 'enableDeepSeekThinking must be a boolean', value: config.enableDeepSeekThinking });
  }
  if (config.enableProviderFallback !== undefined && typeof config.enableProviderFallback !== 'boolean') {
    errors.push({ field: 'enableProviderFallback', message: 'enableProviderFallback must be a boolean', value: config.enableProviderFallback });
  }
  if (config.enableAutoModelSelection !== undefined && typeof config.enableAutoModelSelection !== 'boolean') {
    errors.push({ field: 'enableAutoModelSelection', message: 'enableAutoModelSelection must be a boolean', value: config.enableAutoModelSelection });
  }

  // Warnings for high-risk configurations
  if (config.yoloMode === true) {
    warnings.push({
      field: 'yoloMode',
      message: 'YOLO mode is enabled - all tool confirmations will be skipped',
      suggestion: 'This can lead to unintended file modifications or command executions',
    });
  }

  if (config.maxIterations !== undefined && config.maxIterations > 50) {
    warnings.push({
      field: 'maxIterations',
      message: 'High iteration limit may lead to long-running agent loops',
      suggestion: 'Consider using a lower limit unless explicitly needed',
    });
  }

  if (config.temperature !== undefined && config.temperature > 1.5) {
    warnings.push({
      field: 'temperature',
      message: 'Very high temperature may produce less coherent responses',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

// =============================================================================
// Compliance Settings Validation
// =============================================================================

export function validateComplianceSettings(settings: Partial<ComplianceSettings>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate max violations before block (1 to 100)
  validateRange(settings.maxViolationsBeforeBlock, 1, 100, 'maxViolationsBeforeBlock', errors);

  // Warn about strict mode
  if (settings.strictMode === true) {
    warnings.push({
      field: 'strictMode',
      message: 'Strict mode is enabled - any compliance violation will block execution',
      suggestion: 'This may interrupt workflows unexpectedly',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

// =============================================================================
// Access Level Settings Validation
// =============================================================================

// Must match AccessLevel type: 'read-only' | 'standard' | 'elevated' | 'admin'
const VALID_ACCESS_LEVELS = ['read-only', 'standard', 'elevated', 'admin'] as const;

export function validateAccessLevelSettings(settings: Partial<AccessLevelSettings>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate level enum
  validateEnum(settings.level, VALID_ACCESS_LEVELS, 'level', errors);

  // Validate path arrays
  validateStringArray(settings.restrictedPaths, 'restrictedPaths', errors);
  validateStringArray(settings.allowedPaths, 'allowedPaths', errors);

  // Validate path patterns (should be valid glob patterns)
  if (settings.restrictedPaths) {
    for (let i = 0; i < settings.restrictedPaths.length; i++) {
      const path = settings.restrictedPaths[i];
      if (typeof path === 'string' && path.includes('**/**/**')) {
        warnings.push({
          field: `restrictedPaths[${i}]`,
          message: 'Redundant glob pattern detected',
          suggestion: 'Simplify to "**/*"',
        });
      }
    }
  }

  // Warn about elevated access
  if (settings.level === 'elevated') {
    warnings.push({
      field: 'level',
      message: 'Elevated access level grants broader permissions',
      suggestion: 'Use with caution, especially in production environments',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

// =============================================================================
// Task Routing Settings Validation
// =============================================================================

export function validateTaskRoutingSettings(settings: Partial<TaskRoutingSettings>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate task mappings
  if (settings.taskMappings) {
    for (let i = 0; i < settings.taskMappings.length; i++) {
      const mapping = settings.taskMappings[i];
      
      if (!mapping.taskType) {
        errors.push({
          field: `taskMappings[${i}].taskType`,
          message: 'Task type is required',
        });
      }

      if (!mapping.provider) {
        errors.push({
          field: `taskMappings[${i}].provider`,
          message: 'Provider is required',
        });
      }

      // Validate priority range (1 to 100)
      if (mapping.priority !== undefined) {
        validateRange(mapping.priority, 1, 100, `taskMappings[${i}].priority`, errors);
      }
    }

    // Check for duplicate task types
    const taskTypes = settings.taskMappings.map(m => m.taskType);
    const duplicates = taskTypes.filter((t, i) => taskTypes.indexOf(t) !== i);
    if (duplicates.length > 0) {
      warnings.push({
        field: 'taskMappings',
        message: `Duplicate task types found: ${[...new Set(duplicates)].join(', ')}`,
        suggestion: 'Each task type should appear only once',
      });
    }
  }

  // Validate default mapping
  if (settings.defaultMapping) {
    if (!settings.defaultMapping.provider) {
      errors.push({
        field: 'defaultMapping.provider',
        message: 'Default mapping requires a provider',
      });
    }
  }

  // Validate confidenceThreshold (0 to 1)
  if (settings.confidenceThreshold !== undefined) {
    validateRange(settings.confidenceThreshold, 0, 1, 'confidenceThreshold', errors);
  }

  // Validate contextWindowSize (1 to 20)
  if (settings.contextWindowSize !== undefined) {
    validateRange(settings.contextWindowSize, 1, 20, 'contextWindowSize', errors);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// =============================================================================
// Prompt Settings Validation
// =============================================================================

// Use centralized constraints for prompt length validation
const MAX_CUSTOM_PROMPT_LENGTH = SETTINGS_CONSTRAINTS.maxMessageLength.max;

export function validatePromptSettings(settings: Partial<PromptSettings>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate custom system prompt length
  if (settings.customSystemPrompt && settings.customSystemPrompt.length > MAX_CUSTOM_PROMPT_LENGTH) {
    errors.push({
      field: 'customSystemPrompt',
      message: `Custom system prompt exceeds maximum length of ${MAX_CUSTOM_PROMPT_LENGTH} characters`,
      value: settings.customSystemPrompt.length,
    });
  }

  // Validate personas
  if (settings.personas) {
    for (let i = 0; i < settings.personas.length; i++) {
      const persona = settings.personas[i];
      
      if (!persona.id) {
        errors.push({
          field: `personas[${i}].id`,
          message: 'Persona ID is required',
        });
      }

      if (!persona.name || persona.name.trim().length === 0) {
        errors.push({
          field: `personas[${i}].name`,
          message: 'Persona name is required',
        });
      }

      if (persona.systemPrompt && persona.systemPrompt.length > MAX_CUSTOM_PROMPT_LENGTH) {
        errors.push({
          field: `personas[${i}].systemPrompt`,
          message: `Persona prompt exceeds maximum length of ${MAX_CUSTOM_PROMPT_LENGTH} characters`,
          value: persona.systemPrompt.length,
        });
      }
    }

    // Check for duplicate persona IDs
    const ids = settings.personas.map(p => p.id);
    const duplicateIds = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (duplicateIds.length > 0) {
      errors.push({
        field: 'personas',
        message: `Duplicate persona IDs found: ${[...new Set(duplicateIds)].join(', ')}`,
      });
    }
  }

  // Validate active persona exists
  if (settings.activePersonaId && settings.personas) {
    const personaExists = settings.personas.some(p => p.id === settings.activePersonaId);
    if (!personaExists) {
      warnings.push({
        field: 'activePersonaId',
        message: `Active persona "${settings.activePersonaId}" not found in personas list`,
        suggestion: 'The default persona will be used',
      });
    }
  }

  // Validate context injection rules
  if (settings.contextInjectionRules) {
    for (let i = 0; i < settings.contextInjectionRules.length; i++) {
      const rule = settings.contextInjectionRules[i];

      if (!rule.name || rule.name.trim().length === 0) {
        errors.push({
          field: `contextInjectionRules[${i}].name`,
          message: 'Rule name is required',
        });
      }

      if (!rule.template || rule.template.trim().length === 0) {
        errors.push({
          field: `contextInjectionRules[${i}].template`,
          message: 'Rule template is required',
        });
      }

      validateRange(rule.priority, 0, 100, `contextInjectionRules[${i}].priority`, errors);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// =============================================================================
// Tool Settings Validation
// =============================================================================

export function validateToolSettings(settings: Partial<ToolConfigSettings>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate max tool execution time (1 second to 30 minutes)
  validateRange(settings.maxToolExecutionTime, 1000, 30 * 60 * 1000, 'maxToolExecutionTime', errors);

  // Validate max concurrent tools (1 to 20)
  validateRange(settings.maxConcurrentTools, 1, 20, 'maxConcurrentTools', errors);

  // Validate arrays
  validateStringArray(settings.alwaysConfirmTools, 'alwaysConfirmTools', errors);
  validateStringArray(settings.disabledTools, 'disabledTools', errors);

  return { valid: errors.length === 0, errors, warnings };
}

// =============================================================================
// Safety Settings Validation
// =============================================================================

export function validateSafetySettings(settings: Partial<SafetySettings>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate limits using centralized constraints
  validateRange(
    settings.maxFilesPerRun,
    SETTINGS_CONSTRAINTS.maxFilesPerRun.min,
    SETTINGS_CONSTRAINTS.maxFilesPerRun.max,
    'maxFilesPerRun',
    errors
  );
  validateRange(
    settings.maxBytesPerRun,
    SETTINGS_CONSTRAINTS.maxBytesPerRun.min,
    SETTINGS_CONSTRAINTS.maxBytesPerRun.max,
    'maxBytesPerRun',
    errors
  );
  validateRange(
    settings.backupRetentionCount,
    0,
    SETTINGS_CONSTRAINTS.backupRetentionCount.max,
    'backupRetentionCount',
    errors
  );

  // Validate arrays
  validateStringArray(settings.protectedPaths, 'protectedPaths', errors);
  validateStringArray(settings.blockedCommands, 'blockedCommands', errors);

  // Warn if sandbox is enabled but network is not restricted
  if (settings.enableSandbox && settings.sandboxNetworkPolicy === 'none') {
    warnings.push({
      field: 'sandboxNetworkPolicy',
      message: 'Sandbox is enabled but network policy allows no restrictions',
      suggestion: 'Consider using localhost or allowlist network policy in sandbox mode',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

// =============================================================================
// Appearance Settings Validation
// =============================================================================

const VALID_FONT_SIZE_SCALES = ['compact', 'default', 'comfortable', 'large'] as const;
const VALID_ACCENT_COLORS = ['emerald', 'violet', 'blue', 'amber', 'rose', 'cyan', 'custom'] as const;
const VALID_TERMINAL_FONTS = ['JetBrains Mono', 'Fira Code', 'Source Code Pro', 'Cascadia Code', 'Monaco', 'Menlo', 'Consolas', 'system'] as const;
// Must match LoadingIndicatorStyle type: 'spinner' | 'dots' | 'pulse' | 'minimal'
const VALID_LOADING_INDICATOR_STYLES = ['spinner', 'dots', 'pulse', 'minimal'] as const;
const VALID_ANIMATION_SPEEDS = ['slow', 'normal', 'fast'] as const;
const VALID_REDUCE_MOTION = ['system', 'always', 'never'] as const;

export function validateAppearanceSettings(settings: Partial<AppearanceSettings>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate enums
  validateEnum(settings.fontSizeScale, VALID_FONT_SIZE_SCALES, 'fontSizeScale', errors);
  validateEnum(settings.accentColor, VALID_ACCENT_COLORS, 'accentColor', errors);
  validateEnum(settings.terminalFont, VALID_TERMINAL_FONTS, 'terminalFont', errors);
  validateEnum(settings.loadingIndicatorStyle, VALID_LOADING_INDICATOR_STYLES, 'loadingIndicatorStyle', errors);
  validateEnum(settings.animationSpeed, VALID_ANIMATION_SPEEDS, 'animationSpeed', errors);
  validateEnum(settings.reduceMotion, VALID_REDUCE_MOTION, 'reduceMotion', errors);

  // Validate terminal font size (8 to 24)
  validateRange(settings.terminalFontSize, 8, 24, 'terminalFontSize', errors);

  // Validate custom accent color if using custom
  if (settings.accentColor === 'custom') {
    if (!settings.customAccentColor) {
      errors.push({
        field: 'customAccentColor',
        message: 'Custom accent color is required when accentColor is "custom"',
      });
    } else if (!/^#[0-9a-fA-F]{6}$/.test(settings.customAccentColor)) {
      errors.push({
        field: 'customAccentColor',
        message: 'Custom accent color must be a valid hex color (e.g., #10B981)',
        value: settings.customAccentColor,
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// =============================================================================
// Debug Settings Validation
// =============================================================================

const VALID_TRACE_FORMATS = ['json', 'markdown'] as const;
const VALID_LOG_LEVELS = ['error', 'warn', 'info', 'debug', 'trace'] as const;

export function validateDebugSettings(settings: Partial<DebugSettings>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate enums
  validateEnum(settings.traceExportFormat, VALID_TRACE_FORMATS, 'traceExportFormat', errors);
  validateEnum(settings.logLevel, VALID_LOG_LEVELS, 'logLevel', errors);

  // Validate ranges
  validateRange(settings.maxPreviewLength, 100, 10000, 'maxPreviewLength', errors);
  validateRange(settings.highlightDurationThreshold, 100, 60000, 'highlightDurationThreshold', errors);

  // Validate breakOnTools format (comma-separated tool names)
  if (settings.breakOnTools && typeof settings.breakOnTools === 'string') {
    const tools = settings.breakOnTools.split(',').map(t => t.trim()).filter(Boolean);
    for (const tool of tools) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tool)) {
        errors.push({
          field: 'breakOnTools',
          message: `Invalid tool name format: "${tool}"`,
          value: tool,
        });
      }
    }
  }

  // Warn about performance impact
  if (settings.verboseLogging === true && settings.captureFullPayloads === true) {
    warnings.push({
      field: 'debugSettings',
      message: 'Verbose logging with full payload capture may impact performance',
      suggestion: 'Consider disabling one of these options in production',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

// =============================================================================
// Cache Settings Validation
// =============================================================================

const VALID_CACHE_STRATEGIES = ['default', 'aggressive', 'conservative'] as const;

export function validateCacheSettings(settings: Partial<CacheSettings>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate prompt cache strategy
  validateEnum(settings.promptCacheStrategy, VALID_CACHE_STRATEGIES, 'promptCacheStrategy', errors);

  // Validate tool cache settings
  if (settings.toolCache) {
    validateRange(settings.toolCache.defaultTtlMs, 1000, 3600000, 'toolCache.defaultTtlMs', errors);
    validateRange(settings.toolCache.maxEntries, 10, 10000, 'toolCache.maxEntries', errors);

    // Validate per-tool TTLs
    if (settings.toolCache.toolTtls) {
      for (const [tool, ttl] of Object.entries(settings.toolCache.toolTtls)) {
        if (typeof ttl !== 'number' || ttl < 1000 || ttl > 3600000) {
          errors.push({
            field: `toolCache.toolTtls.${tool}`,
            message: `TTL for ${tool} must be between 1000ms and 3600000ms`,
            value: ttl,
          });
        }
      }
    }
  }

  // Validate context cache settings
  if (settings.contextCache) {
    validateRange(settings.contextCache.maxSizeMb, 1, 1024, 'contextCache.maxSizeMb', errors);
    validateRange(settings.contextCache.defaultTtlMs, 1000, 3600000, 'contextCache.defaultTtlMs', errors);
  }

  // Validate enablePromptCache
  if (settings.enablePromptCache) {
    const validProviders: LLMProviderName[] = ['anthropic', 'openai', 'deepseek', 'gemini', 'openrouter', 'xai', 'mistral', 'glm'];
    for (const [provider] of Object.entries(settings.enablePromptCache)) {
      if (!validProviders.includes(provider as LLMProviderName)) {
        warnings.push({
          field: `enablePromptCache.${provider}`,
          message: `Unknown provider "${provider}" in prompt cache settings`,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// =============================================================================
// MCP Settings Validation
// =============================================================================

export function validateMCPSettings(settings: Partial<MCPSettings>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate timeouts
  validateRange(settings.connectionTimeoutMs, 1000, 120000, 'connectionTimeoutMs', errors);
  validateRange(settings.toolTimeoutMs, 1000, 300000, 'toolTimeoutMs', errors);

  // Validate connection limits
  validateRange(settings.maxConcurrentConnections, 1, 50, 'maxConcurrentConnections', errors);

  // Validate cache TTL
  validateRange(settings.cacheTtlMs, 1000, 3600000, 'cacheTtlMs', errors);

  // Validate retry settings
  validateRange(settings.retryCount, 0, 10, 'retryCount', errors);
  validateRange(settings.retryDelayMs, 100, 30000, 'retryDelayMs', errors);

  // Validate custom registries (must be valid URLs)
  if (settings.customRegistries) {
    for (let i = 0; i < settings.customRegistries.length; i++) {
      const url = settings.customRegistries[i];
      try {
        new URL(url);
      } catch {
        errors.push({
          field: `customRegistries[${i}]`,
          message: 'Invalid URL format',
          value: url,
        });
      }
    }
  }

  // Warn if MCP is enabled but all registry sources are disabled
  if (settings.enabled !== false && settings.enabledRegistrySources) {
    const anyEnabled = Object.values(settings.enabledRegistrySources).some(v => v === true);
    if (!anyEnabled && (!settings.customRegistries || settings.customRegistries.length === 0)) {
      warnings.push({
        field: 'enabledRegistrySources',
        message: 'No registry sources are enabled and no custom registries are configured',
        suggestion: 'Enable at least one registry source or add a custom registry URL',
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// =============================================================================
// Rate Limits Validation
// =============================================================================

/**
 * Validate rate limits settings.
 * rateLimits is a map of provider name to requests-per-minute number.
 */
export function validateRateLimits(
  rateLimits: Partial<Record<LLMProviderName, number>> | undefined
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!rateLimits || typeof rateLimits !== 'object') {
    return { valid: true, errors, warnings };
  }

  for (const [provider, value] of Object.entries(rateLimits)) {
    if (value === undefined || value === null) continue;

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push({
        field: `rateLimits.${provider}`,
        message: `Rate limit for ${provider} must be a valid number`,
        value,
      });
      continue;
    }

    if (value < 1 || value > 10000) {
      errors.push({
        field: `rateLimits.${provider}`,
        message: `Rate limit for ${provider} must be between 1 and 10000 requests per minute`,
        value,
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// =============================================================================
// Workspace Indexing Settings Validation
// =============================================================================

export function validateWorkspaceSettings(settings: Partial<WorkspaceIndexingSettings>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate ranges
  validateRange(settings.watcherDebounceMs, 100, 5000, 'watcherDebounceMs', errors);
  validateRange(settings.maxFileSizeBytes, 512 * 1024, 50 * 1024 * 1024, 'maxFileSizeBytes', errors);
  validateRange(settings.maxIndexSizeMb, 64, 2048, 'maxIndexSizeMb', errors);
  validateRange(settings.indexBatchSize, 10, 500, 'indexBatchSize', errors);

  // Validate arrays
  validateStringArray(settings.excludePatterns, 'excludePatterns', errors);
  validateStringArray(settings.includePatterns, 'includePatterns', errors);

  return { valid: errors.length === 0, errors, warnings };
}

// =============================================================================
// Combined Settings Validation
// =============================================================================

export interface FullValidationResult {
  valid: boolean;
  sections: {
    defaultConfig?: ValidationResult;
    browser?: ValidationResult;
    compliance?: ValidationResult;
    accessLevel?: ValidationResult;
    taskRouting?: ValidationResult;
    prompt?: ValidationResult;
    tool?: ValidationResult;
    safety?: ValidationResult;
    appearance?: ValidationResult;
    debug?: ValidationResult;
    cache?: ValidationResult;
    mcp?: ValidationResult;
    workspace?: ValidationResult;
    rateLimits?: ValidationResult;
  };
  totalErrors: number;
  totalWarnings: number;
}

export function validateAllSettings(settings: {
  defaultConfig?: Partial<AgentConfig>;
  browserSettings?: Partial<BrowserSettings>;
  complianceSettings?: Partial<ComplianceSettings>;
  accessLevelSettings?: Partial<AccessLevelSettings>;
  taskRoutingSettings?: Partial<TaskRoutingSettings>;
  promptSettings?: Partial<PromptSettings>;
  toolSettings?: Partial<ToolConfigSettings>;
  safetySettings?: Partial<SafetySettings>;
  appearanceSettings?: Partial<AppearanceSettings>;
  debugSettings?: Partial<DebugSettings>;
  cacheSettings?: Partial<CacheSettings>;
  mcpSettings?: Partial<MCPSettings>;
  workspaceSettings?: Partial<WorkspaceIndexingSettings>;
  rateLimits?: Partial<Record<LLMProviderName, number>>;
}): FullValidationResult {
  const sections: FullValidationResult['sections'] = {};
  let totalErrors = 0;
  let totalWarnings = 0;

  if (settings.rateLimits) {
    sections.rateLimits = validateRateLimits(settings.rateLimits);
    totalErrors += sections.rateLimits.errors.length;
    totalWarnings += sections.rateLimits.warnings.length;
  }

  if (settings.defaultConfig) {
    sections.defaultConfig = validateAgentConfig(settings.defaultConfig);
    totalErrors += sections.defaultConfig.errors.length;
    totalWarnings += sections.defaultConfig.warnings.length;
  }

  if (settings.browserSettings) {
    sections.browser = validateBrowserSettings(settings.browserSettings);
    totalErrors += sections.browser.errors.length;
    totalWarnings += sections.browser.warnings.length;
  }

  if (settings.complianceSettings) {
    sections.compliance = validateComplianceSettings(settings.complianceSettings);
    totalErrors += sections.compliance.errors.length;
    totalWarnings += sections.compliance.warnings.length;
  }

  if (settings.accessLevelSettings) {
    sections.accessLevel = validateAccessLevelSettings(settings.accessLevelSettings);
    totalErrors += sections.accessLevel.errors.length;
    totalWarnings += sections.accessLevel.warnings.length;
  }

  if (settings.taskRoutingSettings) {
    sections.taskRouting = validateTaskRoutingSettings(settings.taskRoutingSettings);
    totalErrors += sections.taskRouting.errors.length;
    totalWarnings += sections.taskRouting.warnings.length;
  }

  if (settings.promptSettings) {
    sections.prompt = validatePromptSettings(settings.promptSettings);
    totalErrors += sections.prompt.errors.length;
    totalWarnings += sections.prompt.warnings.length;
  }

  if (settings.toolSettings) {
    sections.tool = validateToolSettings(settings.toolSettings);
    totalErrors += sections.tool.errors.length;
    totalWarnings += sections.tool.warnings.length;
  }

  if (settings.safetySettings) {
    sections.safety = validateSafetySettings(settings.safetySettings);
    totalErrors += sections.safety.errors.length;
    totalWarnings += sections.safety.warnings.length;
  }

  if (settings.appearanceSettings) {
    sections.appearance = validateAppearanceSettings(settings.appearanceSettings);
    totalErrors += sections.appearance.errors.length;
    totalWarnings += sections.appearance.warnings.length;
  }

  if (settings.debugSettings) {
    sections.debug = validateDebugSettings(settings.debugSettings);
    totalErrors += sections.debug.errors.length;
    totalWarnings += sections.debug.warnings.length;
  }

  if (settings.cacheSettings) {
    sections.cache = validateCacheSettings(settings.cacheSettings);
    totalErrors += sections.cache.errors.length;
    totalWarnings += sections.cache.warnings.length;
  }

  if (settings.mcpSettings) {
    sections.mcp = validateMCPSettings(settings.mcpSettings);
    totalErrors += sections.mcp.errors.length;
    totalWarnings += sections.mcp.warnings.length;
  }

  if (settings.workspaceSettings) {
    sections.workspace = validateWorkspaceSettings(settings.workspaceSettings);
    totalErrors += sections.workspace.errors.length;
    totalWarnings += sections.workspace.warnings.length;
  }

  const valid = totalErrors === 0;

  if (!valid) {
    logger.warn('Settings validation failed', {
      totalErrors,
      totalWarnings,
      sections: Object.keys(sections),
    });
  }

  return { valid, sections, totalErrors, totalWarnings };
}

// =============================================================================
// Sanitize/Coerce Functions
// =============================================================================

/**
 * Sanitize browser settings by clamping values to valid ranges
 */
export function sanitizeBrowserSettings(settings: Partial<BrowserSettings>): BrowserSettings {
  const defaults = DEFAULT_BROWSER_SETTINGS;
  return {
    ...defaults,
    ...settings,
    navigationTimeout: Math.max(1000, Math.min(300000, settings.navigationTimeout ?? defaults.navigationTimeout)),
    maxContentLength: Math.max(1024, Math.min(50 * 1024 * 1024, settings.maxContentLength ?? defaults.maxContentLength)),
    trustedLocalhostPorts: (settings.trustedLocalhostPorts ?? defaults.trustedLocalhostPorts)
      .filter(p => typeof p === 'number' && p >= 1 && p <= 65535),
  };
}

/**
 * Sanitize tool settings by clamping values to valid ranges
 */
export function sanitizeToolSettings(settings: Partial<ToolConfigSettings>): ToolConfigSettings {
  const defaults = DEFAULT_TOOL_CONFIG_SETTINGS;
  return {
    ...defaults,
    ...settings,
    maxToolExecutionTime: Math.max(1000, Math.min(30 * 60 * 1000, settings.maxToolExecutionTime ?? defaults.maxToolExecutionTime)),
    maxConcurrentTools: Math.max(1, Math.min(20, settings.maxConcurrentTools ?? defaults.maxConcurrentTools)),
    alwaysConfirmTools: settings.alwaysConfirmTools ?? defaults.alwaysConfirmTools,
    disabledTools: settings.disabledTools ?? defaults.disabledTools,
    toolTimeouts: settings.toolTimeouts ?? defaults.toolTimeouts,
    allowDynamicCreation: settings.allowDynamicCreation ?? defaults.allowDynamicCreation,
    requireDynamicToolConfirmation: settings.requireDynamicToolConfirmation ?? defaults.requireDynamicToolConfirmation,
    enableToolCaching: settings.enableToolCaching ?? defaults.enableToolCaching,
  };
}
