/**
 * Safety System
 * Provides file operation validation, protected path checking, and command blocking
 */

import path from 'node:path';
import { minimatch } from 'minimatch';
import type { 
  SafetyConfig, 
  SafetyCheckResult, 
  SafetyOperation, 
  SafetyIssue,
  BackupInfo 
} from './types';
import type { SafetySettings } from '../../../shared/types';

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

/** Extended SafetyConfig with user settings */
interface ExtendedSafetyConfig extends SafetyConfig {
  /** User's safety settings from UI */
  userSettings?: SafetySettings;
}

const DEFAULT_SAFETY_CONFIG: ExtendedSafetyConfig = {
  enabled: true,
  strictMode: false,
  allowedOperations: ['file-write', 'network-request'],
  blockedOperations: ['system-access'],
  requireConfirmation: ['file-delete', 'command-execute'],
};

/**
 * Track file write stats per run
 */
interface RunStats {
  filesModified: number;
  bytesWritten: number;
}

export class SafetyManager {
  private config: ExtendedSafetyConfig;
  /** Track files/bytes per run to enforce limits */
  private runStats = new Map<string, RunStats>();

  constructor(config: Partial<ExtendedSafetyConfig> = {}) {
    this.config = { ...DEFAULT_SAFETY_CONFIG, ...config };
  }

  /**
   * Update safety configuration with user settings
   */
  updateUserSettings(userSettings: SafetySettings): void {
    this.config.userSettings = userSettings;
    this.config.enabled = true;
  }

  /**
   * Check if a file path matches any protected pattern
   */
  private isPathProtected(filePath: string): { protected: boolean; pattern?: string } {
    const protectedPaths = this.config.userSettings?.protectedPaths ?? [];
    const normalizedPath = filePath.replace(/\\/g, '/'); // Normalize to forward slashes
    
    for (const pattern of protectedPaths) {
      if (minimatch(normalizedPath, pattern, { dot: true }) ||
          minimatch(path.basename(normalizedPath), pattern, { dot: true })) {
        return { protected: true, pattern };
      }
    }
    
    return { protected: false };
  }

  /**
   * Validate a file operation before execution
   */
  async validateFileOperation(
    operation: 'write' | 'read' | 'delete',
    filePath: string,
    runId: string,
    content?: string
  ): Promise<FileOperationValidationResult> {
    const issues: FileOperationValidationResult['issues'] = [];
    const userSettings = this.config.userSettings;

    // If no user settings, allow the operation (backwards compatible)
    if (!userSettings) {
      return { allowed: true, issues: [] };
    }

    // Check protected paths (applies to write and delete operations)
    if (operation === 'write' || operation === 'delete') {
      const protectedCheck = this.isPathProtected(filePath);
      if (protectedCheck.protected) {
        issues.push({
          severity: 'block',
          reason: `Path "${filePath}" is protected by pattern "${protectedCheck.pattern}"`,
        });
        return { allowed: false, issues };
      }
    }

    // For write operations, check file and byte limits
    if (operation === 'write' && content) {
      const stats = this.runStats.get(runId) ?? { filesModified: 0, bytesWritten: 0 };
      
      // Check file count limit
      if (stats.filesModified >= userSettings.maxFilesPerRun) {
        issues.push({
          severity: 'block',
          reason: `Maximum files per run limit reached (${userSettings.maxFilesPerRun})`,
        });
        return { allowed: false, issues };
      }
      
      // Check byte limit
      const newBytes = Buffer.byteLength(content, 'utf-8');
      if (stats.bytesWritten + newBytes > userSettings.maxBytesPerRun) {
        const limitMb = (userSettings.maxBytesPerRun / (1024 * 1024)).toFixed(1);
        issues.push({
          severity: 'block',
          reason: `Maximum bytes per run limit would be exceeded (limit: ${limitMb}MB)`,
        });
        return { allowed: false, issues };
      }
      
      // Update stats
      stats.filesModified++;
      stats.bytesWritten += newBytes;
      this.runStats.set(runId, stats);
      
      // Add info about current usage
      if (stats.filesModified > userSettings.maxFilesPerRun * 0.8) {
        issues.push({
          severity: 'warn',
          reason: `Approaching file limit (${stats.filesModified}/${userSettings.maxFilesPerRun})`,
        });
      }
    }

    return { allowed: true, issues };
  }

  /**
   * Check if a command is blocked
   */
  isCommandBlocked(command: string): { blocked: boolean; reason?: string } {
    const blockedCommands = this.config.userSettings?.blockedCommands ?? [];
    const normalizedCommand = command.toLowerCase().trim();
    
    for (const blocked of blockedCommands) {
      if (normalizedCommand.includes(blocked.toLowerCase())) {
        return { blocked: true, reason: `Command contains blocked pattern: "${blocked}"` };
      }
    }
    
    return { blocked: false };
  }

  /**
   * Check if a command is dangerous (requires confirmation even in YOLO mode)
   */
  isDangerousCommand(command: string): boolean {
    const dangerousPatterns = [
      'rm -rf', 'rm -r /', 'rm -rf /',
      'del /s /q', 'format ',
      'fdisk', 'mkfs', 'dd if=',
      'shutdown', 'reboot',
      '> /dev/sda', '> /dev/null',
    ];
    
    const normalized = command.toLowerCase().trim();
    return dangerousPatterns.some(p => normalized.includes(p));
  }

  /**
   * Clear run stats when a run completes
   */
  clearRunStats(runId: string): void {
    this.runStats.delete(runId);
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