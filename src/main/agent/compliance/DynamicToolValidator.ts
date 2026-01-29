/**
 * Dynamic Tool Validator
 *
 * Validates dynamically created tool definitions for compliance with
 * security, quality, and schema requirements before execution.
 */
import { randomUUID } from 'node:crypto';
import type { ToolSpecification, ToolRiskLevel } from '../../../shared/types';
import { createLogger } from '../../logger';
import { getSecurityAuditLog, type SecurityActor } from '../security/SecurityAuditLog';

const logger = createLogger('DynamicToolValidator');

// =============================================================================
// Types
// =============================================================================

/**
 * Validation rule severity
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Validation rule category
 */
export type ValidationCategory = 
  | 'schema'
  | 'security'
  | 'quality'
  | 'resource'
  | 'behavior';

/**
 * Individual validation issue
 */
export interface ValidationIssue {
  id: string;
  category: ValidationCategory;
  severity: ValidationSeverity;
  code: string;
  message: string;
  suggestion?: string;
  field?: string;
  value?: unknown;
}

/**
 * Validation result
 */
export interface DynamicToolValidationResult {
  valid: boolean;
  toolId: string;
  toolName: string;
  issues: ValidationIssue[];
  riskLevel: ToolRiskLevel;
  requiresConfirmation: boolean;
  qualityScore: number;
  securityScore: number;
  validatedAt: number;
}

/**
 * Validation configuration
 */
export interface DynamicToolValidatorConfig {
  /** Enable schema validation */
  validateSchema: boolean;
  /** Enable security pattern checking */
  validateSecurity: boolean;
  /** Enable quality checks */
  validateQuality: boolean;
  /** Enable resource limit checks */
  validateResources: boolean;
  /** Minimum quality score (0-100) */
  minQualityScore: number;
  /** Block tools with dangerous patterns */
  blockDangerousPatterns: boolean;
  /** Maximum code length for code-based tools */
  maxCodeLength: number;
  /** Maximum number of composition steps */
  maxCompositionSteps: number;
  /** Allowed execution types */
  allowedExecutionTypes: Array<'template' | 'code' | 'composite'>;
}

/**
 * Default configuration
 */
export const DEFAULT_VALIDATOR_CONFIG: DynamicToolValidatorConfig = {
  validateSchema: true,
  validateSecurity: true,
  validateQuality: true,
  validateResources: true,
  minQualityScore: 50,
  blockDangerousPatterns: true,
  maxCodeLength: 10000,
  maxCompositionSteps: 20,
  allowedExecutionTypes: ['template', 'code', 'composite'],
};

// =============================================================================
// Security Patterns
// =============================================================================

/**
 * Dangerous code patterns to detect
 */
const DANGEROUS_PATTERNS = [
  { pattern: /eval\s*\(/gi, code: 'EVAL_USAGE', message: 'Use of eval() is not allowed' },
  { pattern: /new\s+Function\s*\(/gi, code: 'FUNCTION_CONSTRUCTOR', message: 'Function constructor is not allowed' },
  { pattern: /process\.exit/gi, code: 'PROCESS_EXIT', message: 'process.exit is not allowed' },
  { pattern: /child_process/gi, code: 'CHILD_PROCESS', message: 'child_process module is restricted' },
  { pattern: /require\s*\(\s*['"`]fs['"`]\s*\)/gi, code: 'FS_REQUIRE', message: 'Direct fs require is restricted' },
  { pattern: /require\s*\(\s*['"`]net['"`]\s*\)/gi, code: 'NET_REQUIRE', message: 'Direct net require is restricted' },
  { pattern: /require\s*\(\s*['"`]http['"`]\s*\)/gi, code: 'HTTP_REQUIRE', message: 'Direct http require is restricted' },
  { pattern: /require\s*\(\s*['"`]https['"`]\s*\)/gi, code: 'HTTPS_REQUIRE', message: 'Direct https require is restricted' },
  { pattern: /__dirname|__filename/gi, code: 'PATH_GLOBALS', message: 'Path globals are restricted' },
  { pattern: /process\.env/gi, code: 'ENV_ACCESS', message: 'Direct environment access is restricted' },
  { pattern: /globalThis|global\./gi, code: 'GLOBAL_ACCESS', message: 'Global object access is restricted' },
  { pattern: /while\s*\(\s*true\s*\)/gi, code: 'INFINITE_LOOP', message: 'Potential infinite loop detected' },
  { pattern: /for\s*\(\s*;\s*;\s*\)/gi, code: 'INFINITE_LOOP', message: 'Potential infinite loop detected' },
  { pattern: /rm\s+-rf|rmdir\s+\/s/gi, code: 'DESTRUCTIVE_CMD', message: 'Destructive command pattern detected' },
  { pattern: /DROP\s+TABLE|DELETE\s+FROM\s+\w+\s*;/gi, code: 'SQL_DANGER', message: 'Dangerous SQL pattern detected' },
];

/**
 * Suspicious patterns (warnings)
 */
const SUSPICIOUS_PATTERNS = [
  { pattern: /setTimeout|setInterval/gi, code: 'TIMER_USAGE', message: 'Timer usage may cause issues' },
  { pattern: /fetch\s*\(/gi, code: 'FETCH_USAGE', message: 'Network fetch detected' },
  { pattern: /XMLHttpRequest/gi, code: 'XHR_USAGE', message: 'XMLHttpRequest detected' },
  { pattern: /localStorage|sessionStorage/gi, code: 'STORAGE_ACCESS', message: 'Browser storage access detected' },
  { pattern: /document\.|window\./gi, code: 'DOM_ACCESS', message: 'DOM access detected' },
  { pattern: /crypto\.subtle/gi, code: 'CRYPTO_USAGE', message: 'Cryptographic operations detected' },
];

// =============================================================================
// DynamicToolValidator
// =============================================================================

export class DynamicToolValidator {
  private config: DynamicToolValidatorConfig;
  private validationHistory: DynamicToolValidationResult[] = [];
  private maxHistorySize = 500;

  constructor(config?: Partial<DynamicToolValidatorConfig>) {
    this.config = { ...DEFAULT_VALIDATOR_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DynamicToolValidatorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): DynamicToolValidatorConfig {
    return { ...this.config };
  }

  /**
   * Validate a tool specification
   */
  validate(
    spec: ToolSpecification,
    actor?: SecurityActor
  ): DynamicToolValidationResult {
    const issues: ValidationIssue[] = [];
    let riskLevel: ToolRiskLevel = 'safe';

    // Schema validation
    if (this.config.validateSchema) {
      issues.push(...this.validateSchema(spec));
    }

    // Security validation
    if (this.config.validateSecurity) {
      const securityIssues = this.validateSecurity(spec);
      issues.push(...securityIssues);
      
      // Upgrade risk level based on security issues
      if (securityIssues.some(i => i.severity === 'error')) {
        riskLevel = 'dangerous';
      } else if (securityIssues.some(i => i.severity === 'warning')) {
        riskLevel = riskLevel === 'safe' ? 'moderate' : riskLevel;
      }
    }

    // Quality validation
    if (this.config.validateQuality) {
      issues.push(...this.validateQuality(spec));
    }

    // Resource validation
    if (this.config.validateResources) {
      issues.push(...this.validateResources(spec));
    }

    // Calculate scores
    const qualityScore = this.calculateQualityScore(spec, issues);
    const securityScore = this.calculateSecurityScore(spec, issues);

    // Determine if valid
    const hasBlockingErrors = issues.some(
      i => i.severity === 'error' && 
           (i.category === 'schema' || 
            (i.category === 'security' && this.config.blockDangerousPatterns))
    );

    const valid = !hasBlockingErrors && qualityScore >= this.config.minQualityScore;

    // Determine if confirmation required
    const requiresConfirmation = 
      riskLevel !== 'safe' ||
      spec.executionType === 'code' ||
      issues.some(i => i.severity === 'warning' && i.category === 'security');

    const result: DynamicToolValidationResult = {
      valid,
      toolId: spec.id,
      toolName: spec.name,
      issues,
      riskLevel: spec.riskLevel || riskLevel,
      requiresConfirmation,
      qualityScore,
      securityScore,
      validatedAt: Date.now(),
    };

    // Store in history
    this.validationHistory.push(result);
    if (this.validationHistory.length > this.maxHistorySize) {
      this.validationHistory = this.validationHistory.slice(-this.maxHistorySize);
    }

    // Log to security audit
    if (actor) {
      const auditLog = getSecurityAuditLog();
      auditLog.logEvent(
        valid ? 'tool_creation_success' : 'validation_failure',
        actor,
        {
          toolName: spec.name,
          toolId: spec.id,
          valid,
          issueCount: issues.length,
          qualityScore,
          securityScore,
        },
        valid ? 'allowed' : 'denied',
        riskLevel === 'dangerous' ? 'high' : riskLevel === 'moderate' ? 'medium' : 'low'
      );
    }

    logger.debug('Tool validation completed', {
      toolName: spec.name,
      valid,
      issueCount: issues.length,
      qualityScore,
      securityScore,
    });

    return result;
  }

  /**
   * Validate schema
   */
  private validateSchema(spec: ToolSpecification): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Name validation
    if (!spec.name || spec.name.length === 0) {
      issues.push(this.createIssue('schema', 'error', 'MISSING_NAME', 'Tool name is required', 'name'));
    } else if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(spec.name)) {
      issues.push(this.createIssue(
        'schema', 'error', 'INVALID_NAME_FORMAT',
        'Tool name must start with a letter and contain only alphanumeric characters and underscores',
        'name', spec.name
      ));
    } else if (spec.name.length > 64) {
      issues.push(this.createIssue('schema', 'warning', 'NAME_TOO_LONG', 'Tool name should be under 64 characters', 'name'));
    }

    // Description validation
    if (!spec.description || spec.description.length === 0) {
      issues.push(this.createIssue('schema', 'error', 'MISSING_DESCRIPTION', 'Tool description is required', 'description'));
    } else if (spec.description.length < 10) {
      issues.push(this.createIssue('schema', 'warning', 'SHORT_DESCRIPTION', 'Tool description should be more detailed', 'description'));
    }

    // Input schema validation
    if (!spec.inputSchema) {
      issues.push(this.createIssue('schema', 'error', 'MISSING_INPUT_SCHEMA', 'Input schema is required', 'inputSchema'));
    } else {
      if (spec.inputSchema.type !== 'object') {
        issues.push(this.createIssue('schema', 'error', 'INVALID_SCHEMA_TYPE', 'Input schema type must be "object"', 'inputSchema.type'));
      }
      
      const properties = spec.inputSchema.properties as Record<string, unknown> | undefined;
      if (properties) {
        for (const [propName, propDef] of Object.entries(properties)) {
          const prop = propDef as Record<string, unknown>;
          if (!prop.type && !prop.$ref) {
            issues.push(this.createIssue(
              'schema', 'warning', 'MISSING_PROPERTY_TYPE',
              `Property "${propName}" should have a type defined`,
              `inputSchema.properties.${propName}`
            ));
          }
        }
      }
    }

    // Execution type validation
    if (!this.config.allowedExecutionTypes.includes(spec.executionType)) {
      issues.push(this.createIssue(
        'schema', 'error', 'INVALID_EXECUTION_TYPE',
        `Execution type "${spec.executionType}" is not allowed`,
        'executionType', spec.executionType
      ));
    }

    // Type-specific validation
    if (spec.executionType === 'template' && !spec.templateId) {
      issues.push(this.createIssue('schema', 'error', 'MISSING_TEMPLATE_ID', 'Template-based tools require templateId', 'templateId'));
    }

    if (spec.executionType === 'code' && !spec.executionCode) {
      issues.push(this.createIssue('schema', 'error', 'MISSING_EXECUTION_CODE', 'Code-based tools require executionCode', 'executionCode'));
    }

    if (spec.executionType === 'composite' && (!spec.compositionSteps || spec.compositionSteps.length === 0)) {
      issues.push(this.createIssue('schema', 'error', 'MISSING_COMPOSITION_STEPS', 'Composite tools require composition steps', 'compositionSteps'));
    }

    return issues;
  }

  /**
   * Validate security
   */
  private validateSecurity(spec: ToolSpecification): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Check execution code for dangerous patterns
    if (spec.executionCode) {
      for (const { pattern, code, message } of DANGEROUS_PATTERNS) {
        if (pattern.test(spec.executionCode)) {
          issues.push(this.createIssue(
            'security', 'error', code, message, 'executionCode',
            undefined, 'Remove or replace the dangerous pattern'
          ));
        }
      }

      for (const { pattern, code, message } of SUSPICIOUS_PATTERNS) {
        if (pattern.test(spec.executionCode)) {
          issues.push(this.createIssue(
            'security', 'warning', code, message, 'executionCode',
            undefined, 'Review usage and ensure it is necessary'
          ));
        }
      }

      // Check code length
      if (spec.executionCode.length > this.config.maxCodeLength) {
        issues.push(this.createIssue(
          'security', 'warning', 'CODE_TOO_LONG',
          `Execution code exceeds maximum length (${this.config.maxCodeLength} chars)`,
          'executionCode'
        ));
      }
    }

    // Check composition steps
    if (spec.compositionSteps) {
      if (spec.compositionSteps.length > this.config.maxCompositionSteps) {
        issues.push(this.createIssue(
          'security', 'warning', 'TOO_MANY_STEPS',
          `Composition has too many steps (max: ${this.config.maxCompositionSteps})`,
          'compositionSteps'
        ));
      }

      // Check for circular references
      const stepIds = new Set<string>();
      for (const step of spec.compositionSteps) {
        if (stepIds.has(step.id)) {
          issues.push(this.createIssue(
            'security', 'error', 'DUPLICATE_STEP_ID',
            `Duplicate step ID: ${step.id}`,
            'compositionSteps'
          ));
        }
        stepIds.add(step.id);
      }
    }

    // Check required capabilities
    if (spec.requiredCapabilities) {
      const dangerousCapabilities = ['terminal', 'network', 'filesystem'];
      const hasDangerous = spec.requiredCapabilities.some(c => dangerousCapabilities.includes(c));
      
      if (hasDangerous) {
        issues.push(this.createIssue(
          'security', 'warning', 'DANGEROUS_CAPABILITIES',
          'Tool requires potentially dangerous capabilities',
          'requiredCapabilities', spec.requiredCapabilities,
          'Ensure these capabilities are necessary'
        ));
      }
    }

    return issues;
  }

  /**
   * Validate quality
   */
  private validateQuality(spec: ToolSpecification): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Description quality
    if (spec.description && spec.description.length < 50) {
      issues.push(this.createIssue(
        'quality', 'info', 'BRIEF_DESCRIPTION',
        'Consider providing a more detailed description',
        'description'
      ));
    }

    // Input schema documentation
    const properties = spec.inputSchema?.properties as Record<string, Record<string, unknown>> | undefined;
    if (properties) {
      for (const [propName, propDef] of Object.entries(properties)) {
        if (!propDef.description) {
          issues.push(this.createIssue(
            'quality', 'info', 'MISSING_PARAM_DESCRIPTION',
            `Parameter "${propName}" should have a description`,
            `inputSchema.properties.${propName}.description`
          ));
        }
      }
    }

    // Code quality checks
    if (spec.executionCode) {
      // Check for comments
      const hasComments = /\/\/|\/\*/.test(spec.executionCode);
      if (!hasComments && spec.executionCode.length > 200) {
        issues.push(this.createIssue(
          'quality', 'info', 'NO_COMMENTS',
          'Consider adding comments to explain the code',
          'executionCode'
        ));
      }

      // Check for error handling
      const hasErrorHandling = /try\s*{|catch\s*\(|\.catch\s*\(/.test(spec.executionCode);
      if (!hasErrorHandling && spec.executionCode.length > 100) {
        issues.push(this.createIssue(
          'quality', 'warning', 'NO_ERROR_HANDLING',
          'Code should include error handling',
          'executionCode',
          undefined,
          'Add try-catch blocks or .catch() handlers'
        ));
      }
    }

    return issues;
  }

  /**
   * Validate resources
   */
  private validateResources(spec: ToolSpecification): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Check composition complexity
    if (spec.compositionSteps && spec.compositionSteps.length > 10) {
      issues.push(this.createIssue(
        'resource', 'warning', 'COMPLEX_COMPOSITION',
        'Composition has many steps which may impact performance',
        'compositionSteps'
      ));
    }

    // Check for potential resource-intensive patterns
    if (spec.executionCode) {
      // Recursive patterns - check for function calling itself
      const funcMatch = spec.executionCode.match(/function\s+(\w+)/);
      if (funcMatch && new RegExp(`\\b${funcMatch[1]}\\s*\\(`).test(spec.executionCode)) {
        issues.push(this.createIssue(
          'resource', 'warning', 'RECURSIVE_PATTERN',
          'Recursive function detected - ensure proper termination',
          'executionCode'
        ));
      }

      // Large array operations
      if (/\.map\s*\(|\.filter\s*\(|\.reduce\s*\(/.test(spec.executionCode)) {
        issues.push(this.createIssue(
          'resource', 'info', 'ARRAY_OPERATIONS',
          'Array operations detected - consider data size limits',
          'executionCode'
        ));
      }
    }

    return issues;
  }

  /**
   * Calculate quality score
   */
  private calculateQualityScore(spec: ToolSpecification, issues: ValidationIssue[]): number {
    let score = 100;

    // Deduct for issues
    for (const issue of issues) {
      if (issue.category === 'quality' || issue.category === 'schema') {
        switch (issue.severity) {
          case 'error': score -= 30; break;
          case 'warning': score -= 15; break;
          case 'info': score -= 5; break;
        }
      }
    }

    // Bonus for good practices
    if (spec.description && spec.description.length >= 50) score += 5;
    
    const properties = spec.inputSchema?.properties as Record<string, Record<string, unknown>> | undefined;
    if (properties) {
      const allHaveDescriptions = Object.values(properties).every(p => p.description);
      if (allHaveDescriptions) score += 5;
    }

    if (spec.executionCode && /\/\/|\/\*/.test(spec.executionCode)) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate security score
   */
  private calculateSecurityScore(spec: ToolSpecification, issues: ValidationIssue[]): number {
    let score = 100;

    // Deduct for security issues
    for (const issue of issues) {
      if (issue.category === 'security') {
        switch (issue.severity) {
          case 'error': score -= 40; break;
          case 'warning': score -= 20; break;
          case 'info': score -= 5; break;
        }
      }
    }

    // Deduct for risky execution types
    if (spec.executionType === 'code') score -= 10;

    // Deduct for dangerous capabilities
    const dangerousCapabilities = ['terminal', 'network', 'filesystem'];
    const dangerousCount = (spec.requiredCapabilities || []).filter(
      c => dangerousCapabilities.includes(c)
    ).length;
    score -= dangerousCount * 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Create a validation issue
   */
  private createIssue(
    category: ValidationCategory,
    severity: ValidationSeverity,
    code: string,
    message: string,
    field?: string,
    value?: unknown,
    suggestion?: string
  ): ValidationIssue {
    return {
      id: randomUUID(),
      category,
      severity,
      code,
      message,
      field,
      value,
      suggestion,
    };
  }

  /**
   * Get validation history
   */
  getHistory(limit = 50): DynamicToolValidationResult[] {
    return this.validationHistory.slice(-limit);
  }

  /**
   * Get validation statistics
   */
  getStats(): {
    totalValidations: number;
    passedCount: number;
    failedCount: number;
    passRate: number;
    avgQualityScore: number;
    avgSecurityScore: number;
    issuesByCategory: Record<ValidationCategory, number>;
  } {
    const total = this.validationHistory.length;
    const passed = this.validationHistory.filter(r => r.valid).length;
    
    const issuesByCategory: Record<ValidationCategory, number> = {
      schema: 0,
      security: 0,
      quality: 0,
      resource: 0,
      behavior: 0,
    };

    let totalQuality = 0;
    let totalSecurity = 0;

    for (const result of this.validationHistory) {
      totalQuality += result.qualityScore;
      totalSecurity += result.securityScore;
      
      for (const issue of result.issues) {
        issuesByCategory[issue.category]++;
      }
    }

    return {
      totalValidations: total,
      passedCount: passed,
      failedCount: total - passed,
      passRate: total > 0 ? passed / total : 0,
      avgQualityScore: total > 0 ? totalQuality / total : 0,
      avgSecurityScore: total > 0 ? totalSecurity / total : 0,
      issuesByCategory,
    };
  }

  /**
   * Clear validation history
   */
  clearHistory(): void {
    this.validationHistory = [];
  }
}

// Singleton instance
let validatorInstance: DynamicToolValidator | null = null;

/**
 * Get or create the dynamic tool validator singleton
 */
export function getDynamicToolValidator(): DynamicToolValidator {
  if (!validatorInstance) {
    validatorInstance = new DynamicToolValidator();
  }
  return validatorInstance;
}
