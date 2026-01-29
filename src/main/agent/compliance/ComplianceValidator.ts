/**
 * Compliance Validator
 * 
 * Runtime enforcement of system prompt rules.
 * Validates tool calls and LLM behavior against defined rules.
 */
import { randomUUID } from 'node:crypto';
import {
  type ComplianceConfig,
  type ComplianceCheckResult,
  type ComplianceViolation,
  type ComplianceRunState,
  type ComplianceViolationType,
  type ComplianceSeverity,
  DEFAULT_COMPLIANCE_CONFIG,
  CORRECTIVE_MESSAGES,
} from './types';
import type { ComplianceViolationEvent } from '../../../shared/types';

/**
 * Event emitter callback for compliance violations
 */
export type ComplianceEventEmitter = (event: ComplianceViolationEvent) => void;

export class ComplianceValidator {
  private config: ComplianceConfig;
  private runStates = new Map<string, ComplianceRunState>();
  private logger?: { info: (msg: string, meta?: Record<string, unknown>) => void; warn: (msg: string, meta?: Record<string, unknown>) => void; error: (msg: string, meta?: Record<string, unknown>) => void };
  private emitEvent?: ComplianceEventEmitter;

  constructor(
    config: Partial<ComplianceConfig> = {}, 
    logger?: ComplianceValidator['logger'],
    emitEvent?: ComplianceEventEmitter
  ) {
    this.config = { ...DEFAULT_COMPLIANCE_CONFIG, ...config };
    this.logger = logger;
    this.emitEvent = emitEvent;
  }

  /**
   * Set event emitter for violation notifications
   */
  setEventEmitter(emitEvent: ComplianceEventEmitter): void {
    this.emitEvent = emitEvent;
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(config: Partial<ComplianceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): ComplianceConfig {
    return { ...this.config };
  }

  /**
   * Initialize state for a new run
   */
  initializeRun(runId: string, sessionId: string, userRequest: string): void {
    this.runStates.set(runId, {
      runId,
      sessionId,
      filesRead: new Set(),
      filesEdited: new Set(),
      filesNeedingLintCheck: new Set(),
      violations: [],
      toolCalls: [],
      userRequest,
      startedAt: Date.now(),
    });
  }

  /**
   * Register files that were provided through editor context (not read tool).
   * This allows the compliance validator to know about files the agent has seen
   * even if they weren't explicitly read via the read tool.
   */
  registerEditorContextFiles(runId: string, filePaths: string[]): void {
    const state = this.runStates.get(runId);
    if (!state) return;
    
    for (const filePath of filePaths) {
      if (filePath && typeof filePath === 'string') {
        state.filesRead.add(this.normalizePath(filePath));
      }
    }
    
    this.logger?.info('Registered editor context files for compliance', {
      runId,
      fileCount: filePaths.length,
    });
  }

  /**
   * Get run state
   */
  getRunState(runId: string): ComplianceRunState | undefined {
    return this.runStates.get(runId);
  }

  /**
   * Clean up old run states
   */
  cleanupOldRuns(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    for (const [runId, state] of this.runStates) {
      if (now - state.startedAt > maxAgeMs) {
        this.runStates.delete(runId);
      }
    }
  }

  /**
   * Validate a tool call before execution
   */
  validateToolCall(
    runId: string,
    toolName: string,
    args: Record<string, unknown>,
    callId?: string
  ): ComplianceCheckResult {
    if (!this.config.enabled) {
      return { isCompliant: true, violations: [], shouldBlock: false, shouldWarn: false };
    }

    const state = this.runStates.get(runId);
    if (!state) {
      // No state - can't validate, allow by default
      return { isCompliant: true, violations: [], shouldBlock: false, shouldWarn: false };
    }

    const violations: ComplianceViolation[] = [];

    // Track the tool call
    state.toolCalls.push({
      name: toolName,
      arguments: args,
      callId,
      timestamp: Date.now(),
    });

    // Validate based on tool type
    switch (toolName) {
      case 'read':
      case 'read_file':
        this.handleReadTool(state, args);
        break;

      case 'edit':
      case 'replace_string_in_file':
        violations.push(...this.validateEditTool(state, args, callId));
        break;

      case 'write':
      case 'create_file':
        violations.push(...this.validateWriteTool(state, args, callId));
        break;

      case 'read_lints':
        this.handleLintTool(state, args);
        break;
    }

    // Add violations to state
    state.violations.push(...violations);

    // Determine result
    const errorViolations = violations.filter(v => v.severity === 'error');
    const warningViolations = violations.filter(v => v.severity === 'warning');

    const shouldBlock = this.config.strictMode 
      ? violations.length > 0
      : errorViolations.length > 0 || state.violations.length >= this.config.maxViolationsBeforeBlock;

    const shouldWarn = warningViolations.length > 0;

    // Build corrective message
    let correctiveMessage: string | undefined;
    if (this.config.injectCorrectiveMessages && violations.length > 0) {
      correctiveMessage = this.buildCorrectiveMessage(violations);
    }

    // Log violations
    if (this.config.logViolations && violations.length > 0) {
      this.logger?.warn('Compliance violations detected', {
        runId,
        toolName,
        violationCount: violations.length,
        violations: violations.map(v => ({ type: v.type, severity: v.severity, message: v.message })),
      });
    }

    // Emit violation events for UI visibility
    if (this.emitEvent && violations.length > 0) {
      for (const violation of violations) {
        this.emitEvent({
          type: 'compliance-violation',
          sessionId: state.sessionId,
          runId,
          timestamp: Date.now(),
          violation: {
            id: violation.id,
            type: violation.type,
            severity: violation.severity,
            message: violation.message,
            rule: violation.rule,
            suggestion: violation.suggestion,
            toolCall: violation.toolCall ? {
              name: violation.toolCall.name,
              callId: violation.toolCall.callId,
            } : undefined,
            timestamp: violation.timestamp,
          },
          wasBlocked: shouldBlock,
          toolName,
        });
      }
    }

    return {
      isCompliant: violations.length === 0,
      violations,
      correctiveMessage,
      shouldBlock,
      shouldWarn,
    };
  }

  /**
   * Check for pending lint checks at end of iteration
   */
  checkPendingLintChecks(runId: string): ComplianceCheckResult {
    if (!this.config.enabled || !this.config.enforceLintAfterEdit) {
      return { isCompliant: true, violations: [], shouldBlock: false, shouldWarn: false };
    }

    const state = this.runStates.get(runId);
    if (!state || state.filesNeedingLintCheck.size === 0) {
      return { isCompliant: true, violations: [], shouldBlock: false, shouldWarn: false };
    }

    const violations: ComplianceViolation[] = [];
    const filesNeedingCheck = Array.from(state.filesNeedingLintCheck);

    violations.push(this.createViolation(
      'no-lint-check-after-edit',
      'warning',
      `Files were edited but not checked for errors: ${filesNeedingCheck.join(', ')}`,
      'Always run read_lints after editing files',
      `Run read_lints on: ${filesNeedingCheck.join(', ')}`,
      undefined,
      { files: filesNeedingCheck }
    ));

    state.violations.push(...violations);

    return {
      isCompliant: false,
      violations,
      correctiveMessage: this.config.injectCorrectiveMessages 
        ? CORRECTIVE_MESSAGES['no-lint-check-after-edit']
        : undefined,
      shouldBlock: false,
      shouldWarn: true,
    };
  }

  /**
   * Get all violations for a run
   */
  getViolations(runId: string): ComplianceViolation[] {
    return this.runStates.get(runId)?.violations || [];
  }

  /**
   * Get violation summary for a run
   */
  getViolationSummary(runId: string): {
    total: number;
    errors: number;
    warnings: number;
    suggestions: number;
    byType: Record<string, number>;
  } {
    const violations = this.getViolations(runId);
    const byType: Record<string, number> = {};

    for (const v of violations) {
      byType[v.type] = (byType[v.type] || 0) + 1;
    }

    return {
      total: violations.length,
      errors: violations.filter(v => v.severity === 'error').length,
      warnings: violations.filter(v => v.severity === 'warning').length,
      suggestions: violations.filter(v => v.severity === 'suggestion').length,
      byType,
    };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private handleReadTool(state: ComplianceRunState, args: Record<string, unknown>): void {
    const filePath = this.extractFilePath(args);
    if (filePath) {
      state.filesRead.add(this.normalizePath(filePath));
    }
  }

  private handleLintTool(state: ComplianceRunState, args: Record<string, unknown>): void {
    // Mark files as checked
    const files = args.files as string[] | undefined;
    if (files && Array.isArray(files)) {
      for (const file of files) {
        const normalizedFile = this.normalizePath(file);
        // Try to match against files needing lint check
        // Handle both absolute and relative paths by checking if either matches
        for (const pendingFile of state.filesNeedingLintCheck) {
          if (pendingFile === normalizedFile || 
              pendingFile.endsWith(normalizedFile) || 
              normalizedFile.endsWith(pendingFile)) {
            state.filesNeedingLintCheck.delete(pendingFile);
          }
        }
      }
    }
    
    // Also check if 'path' argument is used (some tools use path instead of files)
    const path = args.path as string | undefined;
    if (path && typeof path === 'string') {
      const normalizedPath = this.normalizePath(path);
      for (const pendingFile of state.filesNeedingLintCheck) {
        if (pendingFile === normalizedPath || 
            pendingFile.endsWith(normalizedPath) || 
            normalizedPath.endsWith(pendingFile)) {
          state.filesNeedingLintCheck.delete(pendingFile);
        }
      }
    }
  }

  private validateEditTool(
    state: ComplianceRunState,
    args: Record<string, unknown>,
    callId?: string
  ): ComplianceViolation[] {
    const violations: ComplianceViolation[] = [];
    const filePath = this.extractFilePath(args);

    if (!filePath) {
      return violations;
    }

    const normalizedPath = this.normalizePath(filePath);

    // Check read-before-write rule using flexible path matching
    const hasReadFile = this.hasPath(state.filesRead, filePath);
    if (this.config.enforceReadBeforeWrite && !hasReadFile) {
      violations.push(this.createViolation(
        'file-not-read-before-edit',
        'error',
        `Attempting to edit file without reading it first: ${filePath}`,
        'Always read a file before editing it',
        `Use the read tool on "${filePath}" first, then retry the edit`,
        { name: 'edit', arguments: args, callId }
      ));
    }

    // Track that this file was edited and needs lint check
    state.filesEdited.add(normalizedPath);
    if (this.config.enforceLintAfterEdit) {
      state.filesNeedingLintCheck.add(normalizedPath);
    }

    // Check for insufficient context in old_string
    // If the edit is already invalid due to read-before-write, skip additional
    // context warnings to avoid redundant violations.
    if (this.config.enforceReadBeforeWrite && !hasReadFile) {
      return violations;
    }
    const oldString = args.old_string as string | undefined;
    if (oldString && typeof oldString === 'string') {
      const lineCount = oldString.split('\n').length;
      if (lineCount < 3 && oldString.length < 50) {
        violations.push(this.createViolation(
          'missing-context-in-edit',
          'warning',
          `Edit old_string may not have enough context (${lineCount} lines, ${oldString.length} chars)`,
          'Include 3+ lines of surrounding context to ensure unique matching',
          'Add more surrounding lines to the old_string',
          { name: 'edit', arguments: args, callId },
          { lineCount, charCount: oldString.length }
        ));
      }
    }

    return violations;
  }

  private validateWriteTool(
    state: ComplianceRunState,
    args: Record<string, unknown>,
    callId?: string
  ): ComplianceViolation[] {
    const violations: ComplianceViolation[] = [];
    const filePath = this.extractFilePath(args);

    if (!filePath) {
      return violations;
    }

    const normalizedPath = this.normalizePath(filePath);

    // Check if file already exists and could be edited instead
    // Use flexible path matching for better accuracy
    if (this.config.blockUnnecessaryFiles && this.hasPath(state.filesRead, filePath)) {
      violations.push(this.createViolation(
        'unnecessary-file-creation',
        'warning',
        `Creating file that was previously read (consider editing instead): ${filePath}`,
        'Prefer editing existing files over creating new ones',
        'Use the edit tool to modify the existing file',
        { name: 'write', arguments: args, callId }
      ));
    }

    // Track that this file needs lint check
    if (this.config.enforceLintAfterEdit) {
      state.filesNeedingLintCheck.add(normalizedPath);
    }

    return violations;
  }

  private extractFilePath(args: Record<string, unknown>): string | undefined {
    return (args.file_path || args.path || args.filePath || args.file) as string | undefined;
  }

  /**
   * Normalize a path for comparison.
   * Handles both Windows and Unix paths, absolute and relative.
   */
  private normalizePath(filePath: string): string {
    // Convert backslashes to forward slashes
    let normalized = filePath.replace(/\\/g, '/');
    
    // Convert to lowercase for case-insensitive comparison (important for Windows)
    normalized = normalized.toLowerCase();
    
    // Remove trailing slashes
    normalized = normalized.replace(/\/+$/, '');
    
    // Trim whitespace
    normalized = normalized.trim();
    
    return normalized;
  }

  /**
   * Check if two paths refer to the same file.
   * Handles absolute vs relative, different separators, case sensitivity.
   */
  private pathsMatch(path1: string, path2: string): boolean {
    const norm1 = this.normalizePath(path1);
    const norm2 = this.normalizePath(path2);
    
    // Direct match
    if (norm1 === norm2) return true;
    
    // Check if one ends with the other (handles absolute vs relative)
    if (norm1.endsWith(norm2) || norm2.endsWith(norm1)) return true;
    
    // Extract just the filename and compare (last resort)
    const file1 = norm1.split('/').pop();
    const file2 = norm2.split('/').pop();
    if (file1 && file2 && file1 === file2) {
      // Filename matches, check if directory structure also matches at end
      const parts1 = norm1.split('/');
      const parts2 = norm2.split('/');
      const minParts = Math.min(parts1.length, parts2.length);
      
      // Compare from the end, up to the shorter path length
      for (let i = 1; i <= minParts; i++) {
        if (parts1[parts1.length - i] !== parts2[parts2.length - i]) {
          return false;
        }
      }
      return true;
    }
    
    return false;
  }

  /**
   * Check if a path exists in a set using flexible matching
   */
  private hasPath(pathSet: Set<string>, targetPath: string): boolean {
    const normalizedTarget = this.normalizePath(targetPath);
    
    // Direct lookup first (fastest)
    if (pathSet.has(normalizedTarget)) return true;
    
    // Flexible matching
    for (const existingPath of pathSet) {
      if (this.pathsMatch(existingPath, targetPath)) {
        return true;
      }
    }
    
    return false;
  }

  private createViolation(
    type: ComplianceViolationType,
    severity: ComplianceSeverity,
    message: string,
    rule: string,
    suggestion: string,
    toolCall?: ComplianceViolation['toolCall'],
    context?: Record<string, unknown>
  ): ComplianceViolation {
    return {
      id: randomUUID(),
      type,
      severity,
      message,
      rule,
      suggestion,
      toolCall,
      timestamp: Date.now(),
      context,
    };
  }

  private buildCorrectiveMessage(violations: ComplianceViolation[]): string {
    const messages: string[] = [];

    for (const violation of violations) {
      const template = CORRECTIVE_MESSAGES[violation.type as keyof typeof CORRECTIVE_MESSAGES];
      if (template) {
        messages.push(template);
      } else {
        messages.push(`[!] COMPLIANCE ISSUE: ${violation.message}\nRULE: ${violation.rule}\nACTION: ${violation.suggestion}`);
      }
    }

    return messages.join('\n\n');
  }
}
