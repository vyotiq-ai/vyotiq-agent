/**
 * Storage Manager Module
 *
 * Central storage management for the autonomous agent system.
 * Manages paths, data formats, integrity checking, and provides
 * common utilities for all storage modules.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import { createLogger } from '../../logger';

const logger = createLogger('StorageManager');

/**
 * Storage data types supported by the system
 */
export type StorageDataType =
  | 'session'
  | 'dynamic-tool'
  | 'tool-template'
  | 'backup'
  | 'cache';

/**
 * Configuration for the storage manager
 */
export interface StorageManagerConfig {
  /** Base directory for all storage (defaults to app.getPath('userData')) */
  basePath?: string;
  /** Enable data integrity checks */
  enableIntegrityChecks: boolean;
  /** Enable atomic writes */
  enableAtomicWrites: boolean;
  /** Maximum file size in bytes (default: 50MB) */
  maxFileSizeBytes: number;
}

/**
 * Default storage manager configuration
 */
export const DEFAULT_STORAGE_CONFIG: StorageManagerConfig = {
  enableIntegrityChecks: true,
  enableAtomicWrites: true,
  maxFileSizeBytes: 50 * 1024 * 1024, // 50MB
};

/**
 * Result of a storage operation
 */
export interface StorageResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * File metadata for storage entries
 */
export interface StorageFileMetadata {
  id: string;
  type: StorageDataType;
  createdAt: number;
  updatedAt: number;
  sizeBytes: number;
  checksum?: string;
}

/**
 * Central storage manager for the autonomous agent system
 */
export class StorageManager {
  private readonly basePath: string;
  private readonly config: StorageManagerConfig;
  private initialized = false;
  private readonly writeLocks = new Map<string, Promise<void>>();

  constructor(config: Partial<StorageManagerConfig> = {}) {
    this.config = { ...DEFAULT_STORAGE_CONFIG, ...config };
    this.basePath = config.basePath ?? path.join(app.getPath('userData'), 'vyotiq-storage');
  }

  /**
   * Initialize the storage manager and create directory structure
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Create base directories
      const directories = [
        this.basePath,
        this.getDirectoryPath('session'),
        this.getDirectoryPath('dynamic-tool'),
        this.getDirectoryPath('tool-template'),
        this.getDirectoryPath('backup'),
        this.getDirectoryPath('cache'),
      ];

      await Promise.all(directories.map(dir => fs.mkdir(dir, { recursive: true })));

      this.initialized = true;
      logger.info('Storage manager initialized', { basePath: this.basePath });
    } catch (error) {
      logger.error('Failed to initialize storage manager', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get the base storage path
   */
  getBasePath(): string {
    return this.basePath;
  }

  /**
   * Get the directory path for a specific data type
   */
  getDirectoryPath(type: StorageDataType): string {
    const typeDirectories: Record<StorageDataType, string> = {
      session: 'sessions',
      'dynamic-tool': 'tools/dynamic',
      'tool-template': 'tools/templates',
      backup: 'backups',
      cache: 'cache',
    };

    return path.join(this.basePath, typeDirectories[type]);
  }

  /**
   * Get the full file path for a specific item
   */
  getFilePath(type: StorageDataType, id: string): string {
    const sanitizedId = this.sanitizeId(id);
    return path.join(this.getDirectoryPath(type), `${sanitizedId}.json`);
  }

  /**
   * Sanitize an ID for use as a filename
   */
  private sanitizeId(id: string): string {
    // Remove or replace unsafe characters
    return id.replace(/[<>:"/\\|?*]/g, '_').substring(0, 200);
  }

  /**
   * Read data from storage
   */
  async read<T>(type: StorageDataType, id: string): Promise<StorageResult<T>> {
    const filePath = this.getFilePath(type, id);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as T;

      if (this.config.enableIntegrityChecks) {
        // Verify checksum if present in metadata wrapper
        const wrapper = data as { _meta?: { checksum?: string }; data?: T };
        if (wrapper._meta?.checksum && wrapper.data) {
          // IMPORTANT: Use same JSON formatting as write (null, 2) for consistent checksum
          const computed = this.computeChecksum(JSON.stringify(wrapper.data, null, 2));
          if (computed !== wrapper._meta.checksum) {
            logger.warn('Checksum mismatch', { type, id, expected: wrapper._meta.checksum, computed });
          }
          return { success: true, data: wrapper.data };
        }
      }

      return { success: true, data };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { success: false, error: 'Not found' };
      }
      logger.error('Failed to read storage', {
        type,
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Write data to storage
   */
  async write<T>(type: StorageDataType, id: string, data: T): Promise<StorageResult<void>> {
    const filePath = this.getFilePath(type, id);

    // Serialize and check size
    const content = JSON.stringify(data, null, 2);
    if (content.length > this.config.maxFileSizeBytes) {
      return {
        success: false,
        error: `Data exceeds maximum size (${content.length} > ${this.config.maxFileSizeBytes})`,
      };
    }

    // Acquire write lock for this file
    await this.acquireWriteLock(filePath);

    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      let finalContent = content;

      // Add integrity wrapper if enabled
      if (this.config.enableIntegrityChecks) {
        const wrapper = {
          _meta: {
            id,
            type,
            checksum: this.computeChecksum(content),
            updatedAt: Date.now(),
          },
          data,
        };
        finalContent = JSON.stringify(wrapper, null, 2);
      }

      if (this.config.enableAtomicWrites) {
        await this.atomicWrite(filePath, finalContent);
      } else {
        await fs.writeFile(filePath, finalContent, 'utf-8');
      }

      return { success: true };
    } catch (error) {
      logger.error('Failed to write storage', {
        type,
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    } finally {
      this.releaseWriteLock(filePath);
    }
  }

  /**
   * Delete data from storage
   */
  async delete(type: StorageDataType, id: string): Promise<StorageResult<void>> {
    const filePath = this.getFilePath(type, id);

    try {
      await fs.unlink(filePath);
      return { success: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { success: true }; // Already deleted
      }
      logger.error('Failed to delete storage', {
        type,
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * List all items of a specific type
   */
  async list(type: StorageDataType): Promise<StorageResult<string[]>> {
    const dirPath = this.getDirectoryPath(type);

    try {
      const files = await fs.readdir(dirPath);
      const ids = files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
      return { success: true, data: ids };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { success: true, data: [] };
      }
      logger.error('Failed to list storage', {
        type,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Check if an item exists
   */
  async exists(type: StorageDataType, id: string): Promise<boolean> {
    const filePath = this.getFilePath(type, id);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get metadata for a stored item
   */
  async getMetadata(type: StorageDataType, id: string): Promise<StorageResult<StorageFileMetadata>> {
    const filePath = this.getFilePath(type, id);

    try {
      const stats = await fs.stat(filePath);
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);

      const metadata: StorageFileMetadata = {
        id,
        type,
        createdAt: stats.birthtimeMs,
        updatedAt: stats.mtimeMs,
        sizeBytes: stats.size,
        checksum: parsed._meta?.checksum,
      };

      return { success: true, data: metadata };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { success: false, error: 'Not found' };
      }
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Clean up orphaned data and expired cache entries
   */
  async vacuum(): Promise<StorageResult<{ deleted: number; recovered: number }>> {
    let deleted = 0;
    const recovered = 0;

    try {
      // Clean up cache directory
      const cacheDir = this.getDirectoryPath('cache');
      const cacheFiles = await this.safeReadDir(cacheDir);

      for (const file of cacheFiles) {
        const filePath = path.join(cacheDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(content);
          if (data._meta?.expiresAt && data._meta.expiresAt < Date.now()) {
            await fs.unlink(filePath);
            deleted++;
          }
        } catch {
          // Skip invalid files
        }
      }

      logger.info('Vacuum completed', { deleted, recovered });
      return { success: true, data: { deleted, recovered } };
    } catch (error) {
      logger.error('Vacuum failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Generate a unique ID
   */
  generateId(): string {
    return randomUUID();
  }

  /**
   * Compute a checksum for data integrity
   */
  computeChecksum(content: string): string {
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Atomic write operation (write to temp then rename)
   */
  private async atomicWrite(filePath: string, content: string): Promise<void> {
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    try {
      await fs.writeFile(tempPath, content, 'utf-8');
      await fs.rename(tempPath, filePath);
    } catch (error) {
      // Clean up temp file if rename failed
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Acquire a write lock for a file path
   */
  private async acquireWriteLock(filePath: string): Promise<void> {
    while (this.writeLocks.has(filePath)) {
      await this.writeLocks.get(filePath);
    }
    const lock = new Promise<void>(resolve => {
      // Lock will be released when releaseWriteLock is called
      this.writeLocks.set(filePath, new Promise<void>(innerResolve => {
        (this.writeLocks as Map<string, Promise<void> & { resolve?: () => void }>).get(filePath)!;
        // Store the resolve function for later
        setTimeout(() => {
          innerResolve();
          resolve();
        }, 0);
      }));
    });
    await lock;
  }

  /**
   * Release a write lock
   */
  private releaseWriteLock(filePath: string): void {
    this.writeLocks.delete(filePath);
  }

  /**
   * Safely read a directory (returns empty array if doesn't exist)
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
let storageManagerInstance: StorageManager | null = null;

/**
 * Get or create the storage manager singleton
 */
export function getStorageManager(config?: Partial<StorageManagerConfig>): StorageManager {
  if (!storageManagerInstance) {
    storageManagerInstance = new StorageManager(config);
  }
  return storageManagerInstance;
}

/**
 * Reset the storage manager (for testing)
 */
export function resetStorageManager(): void {
  storageManagerInstance = null;
}
