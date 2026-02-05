/**
 * Backup Manager Module
 *
 * Manages backup and restore operations for all storage data.
 * Supports full, incremental, and selective backups with
 * automatic retention policies.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createLogger } from '../../logger';
import {
  getStorageManager,
  type StorageDataType,
  type StorageResult,
} from './StorageManager';

const logger = createLogger('BackupManager');

/**
 * Backup types
 */
export type BackupType = 'full' | 'incremental' | 'selective';

/**
 * Backup metadata
 */
export interface BackupMetadata {
  id: string;
  type: BackupType;
  createdAt: number;
  sizeBytes: number;
  dataTypes: StorageDataType[];
  itemCounts: Partial<Record<StorageDataType, number>>;
  description?: string;
  parentBackupId?: string; // For incremental backups
}

/**
 * Backup configuration
 */
export interface BackupConfig {
  /** Maximum number of backups to retain */
  maxBackups: number;
  /** Maximum total backup size in bytes */
  maxTotalSizeBytes: number;
  /** Data types to include in backups */
  includedDataTypes: StorageDataType[];
}

/**
 * Default backup configuration
 */
export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  maxBackups: 10,
  maxTotalSizeBytes: 500 * 1024 * 1024, // 500MB
  includedDataTypes: [
    'session',
    'dynamic-tool',
    'tool-template',
  ],
};

/**
 * Backup Manager
 */
export class BackupManager {
  private readonly storage = getStorageManager();
  private readonly config: BackupConfig;

  constructor(config: Partial<BackupConfig> = {}) {
    this.config = { ...DEFAULT_BACKUP_CONFIG, ...config };
  }

  /**
   * Initialize backup system
   */
  async initialize(): Promise<void> {
    await this.storage.initialize();
    logger.info('Backup manager initialized');
  }

  /**
   * Create a full backup of all data
   */
  async createFullBackup(description?: string): Promise<StorageResult<BackupMetadata>> {
    return this.createBackup('full', this.config.includedDataTypes, description);
  }

  /**
   * Create a selective backup of specific data types
   */
  async createSelectiveBackup(
    dataTypes: StorageDataType[],
    description?: string
  ): Promise<StorageResult<BackupMetadata>> {
    return this.createBackup('selective', dataTypes, description);
  }

  /**
   * Create a backup
   */
  private async createBackup(
    type: BackupType,
    dataTypes: StorageDataType[],
    description?: string
  ): Promise<StorageResult<BackupMetadata>> {
    const backupId = `backup-${Date.now()}-${this.storage.generateId().slice(0, 8)}`;
    const backupDir = path.join(this.storage.getDirectoryPath('backup'), backupId);

    try {
      // Create backup directory
      await fs.mkdir(backupDir, { recursive: true });

      const itemCounts: Partial<Record<StorageDataType, number>> = {};
      let totalSize = 0;

      // Copy data for each type
      for (const dataType of dataTypes) {
        const sourceDir = this.storage.getDirectoryPath(dataType);
        const targetDir = path.join(backupDir, dataType);

        try {
          await fs.mkdir(targetDir, { recursive: true });

          const files = await this.safeReadDir(sourceDir);
          let count = 0;

          for (const file of files) {
            if (!file.endsWith('.json')) continue;

            const sourcePath = path.join(sourceDir, file);
            const targetPath = path.join(targetDir, file);

            const content = await fs.readFile(sourcePath, 'utf-8');
            await fs.writeFile(targetPath, content, 'utf-8');

            totalSize += content.length;
            count++;
          }

          itemCounts[dataType] = count;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
          }
          itemCounts[dataType] = 0;
        }
      }

      // Save backup metadata
      const metadata: BackupMetadata = {
        id: backupId,
        type,
        createdAt: Date.now(),
        sizeBytes: totalSize,
        dataTypes,
        itemCounts,
        description,
      };

      await fs.writeFile(
        path.join(backupDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2),
        'utf-8'
      );

      // Prune old backups if needed
      await this.pruneOldBackups();

      logger.info('Backup created', { id: backupId, type, sizeBytes: totalSize });
      return { success: true, data: metadata };
    } catch (error) {
      // Clean up failed backup
      try {
        await fs.rm(backupDir, { recursive: true, force: true });
      } catch (err) {
        // Cleanup failure is non-critical; log for debugging
        logger.debug('Failed to clean up failed backup directory', { error: err instanceof Error ? err.message : String(err) });
      }

      logger.error('Failed to create backup', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Restore from a backup
   */
  async restoreBackup(
    backupId: string,
    dataTypes?: StorageDataType[]
  ): Promise<StorageResult<{ restored: number }>> {
    const backupDir = path.join(this.storage.getDirectoryPath('backup'), backupId);

    try {
      // Load metadata
      const metadataContent = await fs.readFile(
        path.join(backupDir, 'metadata.json'),
        'utf-8'
      );
      const metadata = JSON.parse(metadataContent) as BackupMetadata;

      // Determine which types to restore
      const typesToRestore = dataTypes ?? metadata.dataTypes;
      let totalRestored = 0;

      for (const dataType of typesToRestore) {
        const sourceDir = path.join(backupDir, dataType);
        const targetDir = this.storage.getDirectoryPath(dataType);

        try {
          const files = await this.safeReadDir(sourceDir);

          for (const file of files) {
            if (!file.endsWith('.json')) continue;

            const sourcePath = path.join(sourceDir, file);
            const targetPath = path.join(targetDir, file);

            const content = await fs.readFile(sourcePath, 'utf-8');
            await fs.writeFile(targetPath, content, 'utf-8');
            totalRestored++;
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
          }
        }
      }

      logger.info('Backup restored', { backupId, restored: totalRestored });
      return { success: true, data: { restored: totalRestored } };
    } catch (error) {
      logger.error('Failed to restore backup', {
        backupId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * List all available backups
   */
  async listBackups(): Promise<StorageResult<BackupMetadata[]>> {
    const backupsDir = this.storage.getDirectoryPath('backup');

    try {
      const entries = await this.safeReadDir(backupsDir);
      const backups: BackupMetadata[] = [];

      for (const entry of entries) {
        const metadataPath = path.join(backupsDir, entry, 'metadata.json');
        try {
          const content = await fs.readFile(metadataPath, 'utf-8');
          backups.push(JSON.parse(content) as BackupMetadata);
        } catch (err) {
          // Skip invalid backup directories; log for debugging
          logger.debug('Skipping invalid backup directory', { entry, error: err instanceof Error ? err.message : String(err) });
        }
      }

      // Sort by creation time descending
      backups.sort((a, b) => b.createdAt - a.createdAt);

      return { success: true, data: backups };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Delete a backup
   */
  async deleteBackup(backupId: string): Promise<StorageResult<void>> {
    const backupDir = path.join(this.storage.getDirectoryPath('backup'), backupId);

    try {
      await fs.rm(backupDir, { recursive: true, force: true });
      logger.info('Deleted backup', { backupId });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Prune old backups based on retention policy
   */
  async pruneOldBackups(): Promise<StorageResult<number>> {
    const listResult = await this.listBackups();
    if (!listResult.success || !listResult.data) {
      return { success: false, error: listResult.error };
    }

    let deleted = 0;
    const backups = listResult.data;

    // Delete backups beyond max count
    if (backups.length > this.config.maxBackups) {
      const toDelete = backups.slice(this.config.maxBackups);
      for (const backup of toDelete) {
        const result = await this.deleteBackup(backup.id);
        if (result.success) deleted++;
      }
    }

    // Check total size and delete oldest if over limit
    let totalSize = backups.reduce((sum, b) => sum + b.sizeBytes, 0);
    let index = backups.length - 1;

    while (totalSize > this.config.maxTotalSizeBytes && index >= 0) {
      const backup = backups[index];
      const result = await this.deleteBackup(backup.id);
      if (result.success) {
        deleted++;
        totalSize -= backup.sizeBytes;
      }
      index--;
    }

    if (deleted > 0) {
      logger.info('Pruned old backups', { deleted });
    }

    return { success: true, data: deleted };
  }

  /**
   * Export data as a downloadable archive
   */
  async exportData(dataTypes?: StorageDataType[]): Promise<StorageResult<{ data: string; filename: string }>> {
    const typesToExport = dataTypes ?? this.config.includedDataTypes;
    const exportData: Record<string, unknown[]> = {};

    for (const dataType of typesToExport) {
      const items: unknown[] = [];
      const listResult = await this.storage.list(dataType);

      if (listResult.success && listResult.data) {
        for (const id of listResult.data) {
          const readResult = await this.storage.read(dataType, id);
          if (readResult.success && readResult.data) {
            items.push(readResult.data);
          }
        }
      }

      exportData[dataType] = items;
    }

    const content = JSON.stringify({
      exportedAt: Date.now(),
      dataTypes: typesToExport,
      data: exportData,
    }, null, 2);

    const filename = `vyotiq-export-${new Date().toISOString().split('T')[0]}.json`;

    return { success: true, data: { data: content, filename } };
  }

  /**
   * Safely read directory
   */
  private async safeReadDir(dirPath: string): Promise<string[]> {
    try {
      return await fs.readdir(dirPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}

// Singleton instance
let backupManagerInstance: BackupManager | null = null;

/**
 * Get or create the backup manager singleton
 */
export function getBackupManager(config?: Partial<BackupConfig>): BackupManager {
  if (!backupManagerInstance) {
    backupManagerInstance = new BackupManager(config);
  }
  return backupManagerInstance;
}
