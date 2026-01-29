/**
 * Compliance Module Index
 * 
 * Runtime enforcement of system prompt rules, prompt optimization,
 * and dynamic tool validation.
 * 
 * This module provides:
 * - ComplianceValidator: Validates tool calls against system prompt rules
 * - PromptOptimizer: Optimizes prompts for different LLM models
 * - DynamicToolValidator: Validates dynamic tool definitions
 * - PermissionManager: Manages tool permissions and capability grants
 * - AuditLogger: Comprehensive audit logging for compliance
 * - Types and configurations for compliance checking
 */

// Types
export * from './types';

// Core classes
export { ComplianceValidator } from './ComplianceValidator';
export { PromptOptimizer, type OptimizedPromptResult } from './PromptOptimizer';

// Dynamic tool validation
export {
  DynamicToolValidator,
  getDynamicToolValidator,
  DEFAULT_VALIDATOR_CONFIG,
  type ValidationIssue,
  type ValidationSeverity,
  type ValidationCategory,
  type DynamicToolValidationResult,
  type DynamicToolValidatorConfig,
} from './DynamicToolValidator';

// Permission management
export {
  PermissionManager,
  getPermissionManager,
  DEFAULT_PERMISSION_CONFIG,
  type Permission,
  type PermissionScope,
  type PermissionLevel,
  type PermissionConstraints,
  type PermissionCheckResult,
  type PermissionRequest,
  type PermissionManagerConfig,
} from './PermissionManager';

// Audit logging
export {
  AuditLogger,
  getAuditLogger,
  DEFAULT_AUDIT_CONFIG,
  type AuditEvent,
  type AuditCategory,
  type AuditSeverity,
  type AuditTarget,
  type AuditQueryOptions,
  type AuditStats,
  type AuditLoggerConfig,
} from './AuditLogger';
