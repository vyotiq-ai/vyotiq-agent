/**
 * Safety System - Minimal Implementation
 * Provides basic functionality to satisfy existing code dependencies
 */

import type { 
  SafetyConfig, 
  SafetyCheckResult, 
  SafetyOperation, 
  SafetyIssue,
  BackupInfo 
} from './types';

export * from './types';

/** Result of file operation validation */
export interface FileOperationValidationResult {
  allowed: boolean;
  issues: Array<{
    severity: 'block' | 'warn' | 'info';
    reason: string;
  }>;
  backupPath?: string;
}

const DEFAULT_SAFETY_CONFIG: SafetyConfig = {
  enabled: true,
  strictMode: false,
  allowedOperations: ['file-write', 'network-request'],
  blockedOperations: ['system-access'],
  requireConfirmation: ['file-delete', 'command-execute'],
};

export class SafetyManager {
  private config: SafetyConfig;

  constructor(config: Partial<SafetyConfig> = {}) {
    this.config = { ...DEFAULT_SAFETY_CONFIG, ...config };
  }

  /**
   * Validate a file operation before execution
   */
  async validateFileOperation(
    _operation: 'write' | 'read' | 'delete',
    _filePath: string,
    _runId: string,
    _content?: string
  ): Promise<FileOperationValidationResult> {
    // Minimal implementation - allow all operations
    return {
      allowed: true,
      issues: [],
    };
  }

  checkOperation(operation: SafetyOperation, _context?: unknown): SafetyCheckResult {
    const issues: SafetyIssue[] = [];
    
    // Check if operation is blocked
    if (this.config.blockedOperations.includes(operation)) {
      issues.push({
        type: 'error',
        operation,
        message: `Operation ${operation} is blocked by safety policy`,
        suggestion: 'Contact administrator to modify safety settings',
      });
      
      return {
        allowed: false,
        issues,
        requiresConfirmation: false,
      };
    }

    // Check if confirmation is required
    const requiresConfirmation = this.config.requireConfirmation.includes(operation);
    
    if (requiresConfirmation) {
      issues.push({
        type: 'warning',
        operation,
        message: `Operation ${operation} requires user confirmation`,
      });
    }

    return {
      allowed: true,
      issues,
      requiresConfirmation,
    };
  }

  updateConfig(newConfig: Partial<SafetyConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): SafetyConfig {
    return { ...this.config };
  }

  createBackup(filePath: string): BackupInfo {
    // Minimal implementation - return mock backup info
    return {
      id: `backup-${Date.now()}`,
      path: filePath,
      timestamp: Date.now(),
      size: 0,
    };
  }

  restoreBackup(_backupId: string): Promise<void> {
    // Minimal implementation - no-op for now
    return Promise.resolve();
  }
}