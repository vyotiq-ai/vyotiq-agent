/**
 * Safety System
 * Provides file operation validation, protected path checking, command blocking,
 * and automatic file backup/restore functionality.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { minimatch } from 'minimatch';
import type { 
  SafetyConfig, 
  SafetyCheckResult, 
  SafetyOperation, 
  SafetyIssue,
  BackupInfo 
} from './types';
import type { SafetySettings } from '../../../shared/types';
import { createLogger } from '../../logger';

export * from './types';

const logger = createLogger('SafetyManager');

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

  /**
   * Get the backup directory path
   */
  private getBackupDir(): string {
    const baseDir = process.env.VYOTIQ_DATA_DIR
      || (process.env.HOME ? path.join(process.env.HOME, '.vyotiq') : null)
      || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, '.vyotiq') : null)
      || path.join(os.tmpdir(), 'vyotiq');
    return path.join(baseDir, 'backups');
  }

  /**
   * Ensure backup directory exists.
   * Falls back to a temp-directory path if the primary location is not writable.
   */
  private ensureBackupDir(): string {
    const backupDir = this.getBackupDir();
    try {
      if (!existsSync(backupDir)) {
        mkdirSync(backupDir, { recursive: true });
      }
      return backupDir;
    } catch (primaryError) {
      // Primary path failed (permissions, disk full, etc.) — try OS temp dir
      logger.warn('Primary backup directory creation failed, falling back to temp directory', {
        backupDir,
        error: primaryError instanceof Error ? primaryError.message : String(primaryError),
      });
      const fallbackDir = path.join(os.tmpdir(), 'vyotiq-backups');
      try {
        if (!existsSync(fallbackDir)) {
          mkdirSync(fallbackDir, { recursive: true });
        }
        return fallbackDir;
      } catch (fallbackError) {
        logger.error('Fallback backup directory creation also failed', {
          fallbackDir,
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        });
        throw primaryError;
      }
    }
  }

  /**
   * Generate a unique backup ID
   */
  private generateBackupId(filePath: string): string {
    const hash = crypto.createHash('md5').update(filePath).digest('hex').slice(0, 8);
    return `backup-${hash}-${Date.now()}`;
  }

  /**
   * Create a backup of a file before modification
   * @param filePath The path to the file to backup
   * @returns BackupInfo with backup details
   */
  async createBackup(filePath: string): Promise<BackupInfo> {
    const userSettings = this.config.userSettings;
    
    // Check if backups are enabled
    if (!userSettings?.enableAutoBackup) {
      logger.debug('Auto backup disabled, skipping backup', { filePath });
      return {
        id: `skip-${Date.now()}`,
        path: filePath,
        timestamp: Date.now(),
        size: 0,
      };
    }

    try {
      const backupDir = this.ensureBackupDir();
      const backupId = this.generateBackupId(filePath);
      
      // Check if file exists
      if (!existsSync(filePath)) {
        logger.debug('File does not exist, cannot backup', { filePath });
        return {
          id: backupId,
          path: filePath,
          timestamp: Date.now(),
          size: 0,
        };
      }

      // Read file stats and content
      const stats = await fs.stat(filePath);
      const content = await fs.readFile(filePath);
      
      // Create backup file path with original extension preserved
      const ext = path.extname(filePath);
      const backupFileName = `${backupId}${ext}`;
      const backupPath = path.join(backupDir, backupFileName);
      
      // Write backup
      await fs.writeFile(backupPath, content);
      
      // Store backup metadata
      const metadata: BackupInfo & { originalPath: string } = {
        id: backupId,
        path: backupPath,
        originalPath: filePath,
        timestamp: Date.now(),
        size: stats.size,
      };
      
      // Write metadata file
      await fs.writeFile(
        path.join(backupDir, `${backupId}.meta.json`),
        JSON.stringify(metadata, null, 2)
      );
      
      logger.info('Created backup', { backupId, filePath, size: stats.size });
      
      // Cleanup old backups based on retention count
      await this.cleanupOldBackups(filePath);
      
      return {
        id: backupId,
        path: backupPath,
        timestamp: metadata.timestamp,
        size: metadata.size,
      };
    } catch (error) {
      logger.error('Failed to create backup', { filePath, error });
      // Return a stub backup info on failure - don't block the operation
      return {
        id: `failed-${Date.now()}`,
        path: filePath,
        timestamp: Date.now(),
        size: 0,
      };
    }
  }

  /**
   * Restore a file from backup
   * @param backupId The backup ID to restore
   */
  async restoreBackup(backupId: string): Promise<void> {
    try {
      const backupDir = this.getBackupDir();
      const metadataPath = path.join(backupDir, `${backupId}.meta.json`);
      
      // Read metadata
      if (!existsSync(metadataPath)) {
        throw new Error(`Backup metadata not found: ${backupId}`);
      }
      
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent) as BackupInfo & { originalPath: string };
      
      // Check backup file exists
      if (!existsSync(metadata.path)) {
        throw new Error(`Backup file not found: ${metadata.path}`);
      }
      
      // Read backup content
      const content = await fs.readFile(metadata.path);
      
      // Restore to original path
      await fs.writeFile(metadata.originalPath, content);
      
      logger.info('Restored backup', { backupId, originalPath: metadata.originalPath });
    } catch (error) {
      logger.error('Failed to restore backup', { backupId, error });
      throw error;
    }
  }

  /**
   * List all backups for a specific file
   * @param filePath The original file path
   * @returns Array of BackupInfo for the file
   */
  async listBackups(filePath?: string): Promise<BackupInfo[]> {
    try {
      const backupDir = this.getBackupDir();
      if (!existsSync(backupDir)) {
        return [];
      }
      
      const files = await fs.readdir(backupDir);
      const metaFiles = files.filter(f => f.endsWith('.meta.json'));
      
      const backups: BackupInfo[] = [];
      for (const metaFile of metaFiles) {
        try {
          const content = await fs.readFile(path.join(backupDir, metaFile), 'utf-8');
          const metadata = JSON.parse(content) as BackupInfo & { originalPath: string };
          
          // Filter by file path if provided
          if (!filePath || metadata.originalPath === filePath) {
            backups.push({
              id: metadata.id,
              path: metadata.path,
              timestamp: metadata.timestamp,
              size: metadata.size,
            });
          }
        } catch {
          // Skip invalid metadata files
        }
      }
      
      // Sort by timestamp descending (newest first)
      return backups.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      logger.error('Failed to list backups', { filePath, error });
      return [];
    }
  }

  /**
   * Delete a backup
   * @param backupId The backup ID to delete
   */
  async deleteBackup(backupId: string): Promise<void> {
    try {
      const backupDir = this.getBackupDir();
      const metadataPath = path.join(backupDir, `${backupId}.meta.json`);
      
      if (existsSync(metadataPath)) {
        const content = await fs.readFile(metadataPath, 'utf-8');
        const metadata = JSON.parse(content) as BackupInfo;
        
        // Delete backup file
        if (existsSync(metadata.path)) {
          await fs.unlink(metadata.path);
        }
        
        // Delete metadata file
        await fs.unlink(metadataPath);
        
        logger.info('Deleted backup', { backupId });
      }
    } catch (error) {
      logger.error('Failed to delete backup', { backupId, error });
      throw error;
    }
  }

  /**
   * Cleanup old backups based on retention settings
   * @param filePath The file path to cleanup backups for
   */
  private async cleanupOldBackups(filePath: string): Promise<void> {
    const retentionCount = this.config.userSettings?.backupRetentionCount ?? 5;
    
    if (retentionCount <= 0) {
      return; // No cleanup if retention is disabled
    }
    
    try {
      const backups = await this.listBackups(filePath);
      
      // Delete backups beyond retention count
      if (backups.length > retentionCount) {
        const toDelete = backups.slice(retentionCount);
        for (const backup of toDelete) {
          await this.deleteBackup(backup.id);
          logger.debug('Cleaned up old backup', { backupId: backup.id, filePath });
        }
      }
    } catch (error) {
      logger.warn('Failed to cleanup old backups', { filePath, error });
    }
  }
}