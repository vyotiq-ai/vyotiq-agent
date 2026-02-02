/**
 * Settings Validation Module
 * 
 * Provides validation utilities for all settings types.
 * Ensures settings values are within valid ranges and have correct formats.
 */

import { createLogger } from '../logger';
import type {
  BrowserSettings,
  ComplianceSettings,
  AccessLevelSettings,
  TaskRoutingSettings,
  PromptSettings,
  SafetySettings,
  SemanticSettings,
  ToolConfigSettings,
} from '../../shared/types';
import {
  DEFAULT_BROWSER_SETTINGS,
  DEFAULT_COMPLIANCE_SETTINGS as _DEFAULT_COMPLIANCE_SETTINGS,
  DEFAULT_ACCESS_LEVEL_SETTINGS as _DEFAULT_ACCESS_LEVEL_SETTINGS,
  DEFAULT_TASK_ROUTING_SETTINGS as _DEFAULT_TASK_ROUTING_SETTINGS,
  DEFAULT_PROMPT_SETTINGS as _DEFAULT_PROMPT_SETTINGS,
  DEFAULT_SEMANTIC_SETTINGS,
  DEFAULT_TOOL_CONFIG_SETTINGS,
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

function validatePositive(
  value: number | undefined,
  field: string,
  errors: ValidationError[]
): void {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    errors.push({ field, message: `${field} must be a positive number`, value });
  }
}

function validateNonNegative(
  value: number | undefined,
  field: string,
  errors: ValidationError[]
): void {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    errors.push({ field, message: `${field} must be a non-negative number`, value });
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

const VALID_ACCESS_LEVELS = ['standard', 'restricted', 'elevated'] as const;

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

      // Validate priority range (1 to 10)
      if (mapping.priority !== undefined) {
        validateRange(mapping.priority, 1, 10, `taskMappings[${i}].priority`, errors);
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

  return { valid: errors.length === 0, errors, warnings };
}

// =============================================================================
// Prompt Settings Validation
// =============================================================================

const MAX_CUSTOM_PROMPT_LENGTH = 100000; // 100KB

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
// Semantic Settings Validation
// =============================================================================

export function validateSemanticSettings(settings: Partial<SemanticSettings>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate chunk sizes
  validatePositive(settings.targetChunkSize, 'targetChunkSize', errors);
  validatePositive(settings.minChunkSize, 'minChunkSize', errors);
  validatePositive(settings.maxChunkSize, 'maxChunkSize', errors);

  if (
    settings.minChunkSize !== undefined &&
    settings.maxChunkSize !== undefined &&
    settings.minChunkSize > settings.maxChunkSize
  ) {
    errors.push({
      field: 'minChunkSize',
      message: 'minChunkSize cannot be greater than maxChunkSize',
    });
  }

  if (
    settings.targetChunkSize !== undefined &&
    settings.maxChunkSize !== undefined &&
    settings.targetChunkSize > settings.maxChunkSize
  ) {
    warnings.push({
      field: 'targetChunkSize',
      message: 'targetChunkSize is greater than maxChunkSize',
      suggestion: 'Consider setting targetChunkSize <= maxChunkSize',
    });
  }

  // Validate max file size (1KB to 100MB)
  validateRange(settings.maxFileSize, 1024, 100 * 1024 * 1024, 'maxFileSize', errors);

  // Validate cache entries
  validateRange(settings.maxCacheEntries, 100, 1000000, 'maxCacheEntries', errors);

  // Validate HNSW parameters
  validateRange(settings.hnswM, 4, 64, 'hnswM', errors);
  validateRange(settings.hnswEfSearch, 10, 500, 'hnswEfSearch', errors);

  // Validate search score threshold (0 to 1)
  validateRange(settings.minSearchScore, 0, 1, 'minSearchScore', errors);

  // Validate auto-optimize threshold
  validatePositive(settings.autoOptimizeAfter, 'autoOptimizeAfter', errors);

  // Validate embedding quality
  validateEnum(settings.embeddingQuality, ['fast', 'balanced', 'quality'] as const, 'embeddingQuality', errors);

  // Validate file types
  validateStringArray(settings.indexFileTypes, 'indexFileTypes', errors);
  validateStringArray(settings.excludePatterns, 'excludePatterns', errors);

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

  // Validate limits
  validatePositive(settings.maxFilesPerRun, 'maxFilesPerRun', errors);
  validatePositive(settings.maxBytesPerRun, 'maxBytesPerRun', errors);
  validateNonNegative(settings.backupRetentionCount, 'backupRetentionCount', errors);

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
// Combined Settings Validation
// =============================================================================

export interface FullValidationResult {
  valid: boolean;
  sections: {
    browser?: ValidationResult;
    compliance?: ValidationResult;
    accessLevel?: ValidationResult;
    taskRouting?: ValidationResult;
    prompt?: ValidationResult;
    semantic?: ValidationResult;
    tool?: ValidationResult;
    safety?: ValidationResult;
  };
  totalErrors: number;
  totalWarnings: number;
}

export function validateAllSettings(settings: {
  browserSettings?: Partial<BrowserSettings>;
  complianceSettings?: Partial<ComplianceSettings>;
  accessLevelSettings?: Partial<AccessLevelSettings>;
  taskRoutingSettings?: Partial<TaskRoutingSettings>;
  promptSettings?: Partial<PromptSettings>;
  semanticSettings?: Partial<SemanticSettings>;
  toolSettings?: Partial<ToolConfigSettings>;
  safetySettings?: Partial<SafetySettings>;
}): FullValidationResult {
  const sections: FullValidationResult['sections'] = {};
  let totalErrors = 0;
  let totalWarnings = 0;

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

  if (settings.semanticSettings) {
    sections.semantic = validateSemanticSettings(settings.semanticSettings);
    totalErrors += sections.semantic.errors.length;
    totalWarnings += sections.semantic.warnings.length;
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
 * Sanitize semantic settings by clamping values to valid ranges
 */
export function sanitizeSemanticSettings(settings: Partial<SemanticSettings>): SemanticSettings {
  const defaults = DEFAULT_SEMANTIC_SETTINGS;
  const result = {
    ...defaults,
    ...settings,
  };

  // Clamp values to valid ranges
  result.targetChunkSize = Math.max(100, result.targetChunkSize ?? defaults.targetChunkSize);
  result.minChunkSize = Math.max(50, result.minChunkSize ?? defaults.minChunkSize);
  result.maxChunkSize = Math.max(result.minChunkSize, result.maxChunkSize ?? defaults.maxChunkSize);
  result.hnswM = Math.max(4, Math.min(64, result.hnswM ?? defaults.hnswM));
  result.hnswEfSearch = Math.max(10, Math.min(500, result.hnswEfSearch ?? defaults.hnswEfSearch));
  result.minSearchScore = Math.max(0, Math.min(1, result.minSearchScore ?? defaults.minSearchScore));

  return result;
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
