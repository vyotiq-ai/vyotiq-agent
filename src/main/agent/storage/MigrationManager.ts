/**
 * Migration Manager Module
 *
 * Handles schema migrations for storage data.
 * Ensures backwards compatibility and smooth upgrades
 * when storage formats change.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createLogger } from '../../logger';
import { getStorageManager, type StorageResult } from './StorageManager';

const logger = createLogger('MigrationManager');

/**
 * Migration definition
 */
export interface Migration {
  /** Version number (sequential, starting from 1) */
  version: number;
  /** Migration name for display */
  name: string;
  /** Description of what this migration does */
  description: string;
  /** Function to apply the migration (up) */
  up: () => Promise<void>;
  /** Function to revert the migration (down) */
  down: () => Promise<void>;
}

/**
 * Migration status
 */
export interface MigrationStatus {
  currentVersion: number;
  latestVersion: number;
  pendingMigrations: number;
  appliedMigrations: AppliedMigration[];
}

/**
 * Record of an applied migration
 */
export interface AppliedMigration {
  version: number;
  name: string;
  appliedAt: number;
  durationMs: number;
}

/**
 * Migration state stored on disk
 */
interface MigrationState {
  currentVersion: number;
  appliedMigrations: AppliedMigration[];
  lastCheckedAt: number;
}

/**
 * Migration Manager
 */
export class MigrationManager {
  private readonly storage = getStorageManager();
  private readonly migrations: Migration[] = [];
  private readonly stateFile: string;

  constructor() {
    this.stateFile = path.join(this.storage.getBasePath(), 'migrations.json');
    this.registerDefaultMigrations();
  }

  /**
   * Initialize migration system
   */
  async initialize(): Promise<void> {
    await this.storage.initialize();

    // Ensure state file exists
    try {
      await fs.access(this.stateFile);
    } catch {
      await this.saveState({
        currentVersion: 0,
        appliedMigrations: [],
        lastCheckedAt: Date.now(),
      });
    }

    logger.info('Migration manager initialized');
  }

  /**
   * Register a migration
   */
  registerMigration(migration: Migration): void {
    // Check for duplicate versions
    if (this.migrations.some(m => m.version === migration.version)) {
      throw new Error(`Migration version ${migration.version} already exists`);
    }

    this.migrations.push(migration);
    this.migrations.sort((a, b) => a.version - b.version);
  }

  /**
   * Check for pending migrations
   */
  async checkMigrations(): Promise<MigrationStatus> {
    const state = await this.loadState();
    const latestVersion = this.migrations.length > 0 ?
      Math.max(...this.migrations.map(m => m.version)) : 0;

    const pendingCount = this.migrations.filter(m => m.version > state.currentVersion).length;

    return {
      currentVersion: state.currentVersion,
      latestVersion,
      pendingMigrations: pendingCount,
      appliedMigrations: state.appliedMigrations,
    };
  }

  /**
   * Run all pending migrations
   */
  async runMigrations(): Promise<StorageResult<AppliedMigration[]>> {
    const state = await this.loadState();
    const pendingMigrations = this.migrations.filter(m => m.version > state.currentVersion);

    if (pendingMigrations.length === 0) {
      logger.info('No pending migrations');
      return { success: true, data: [] };
    }

    const applied: AppliedMigration[] = [];

    for (const migration of pendingMigrations) {
      logger.info('Running migration', { version: migration.version, name: migration.name });

      const startTime = Date.now();
      try {
        await migration.up();

        const appliedMigration: AppliedMigration = {
          version: migration.version,
          name: migration.name,
          appliedAt: Date.now(),
          durationMs: Date.now() - startTime,
        };

        state.currentVersion = migration.version;
        state.appliedMigrations.push(appliedMigration);
        await this.saveState(state);

        applied.push(appliedMigration);
        logger.info('Migration completed', {
          version: migration.version,
          durationMs: appliedMigration.durationMs,
        });
      } catch (error) {
        logger.error('Migration failed', {
          version: migration.version,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          success: false,
          error: `Migration ${migration.version} (${migration.name}) failed: ${error instanceof Error ? error.message : String(error)}`,
          data: applied,
        };
      }
    }

    logger.info('All migrations completed', { count: applied.length });
    return { success: true, data: applied };
  }

  /**
   * Rollback to a specific version
   */
  async rollback(targetVersion: number): Promise<StorageResult<number>> {
    const state = await this.loadState();

    if (targetVersion >= state.currentVersion) {
      return { success: false, error: 'Target version must be lower than current version' };
    }

    if (targetVersion < 0) {
      return { success: false, error: 'Target version cannot be negative' };
    }

    // Find migrations to roll back (in reverse order)
    const toRollback = this.migrations
      .filter(m => m.version > targetVersion && m.version <= state.currentVersion)
      .reverse();

    let rolledBack = 0;

    for (const migration of toRollback) {
      logger.info('Rolling back migration', { version: migration.version, name: migration.name });

      try {
        await migration.down();

        state.currentVersion = migration.version - 1;
        state.appliedMigrations = state.appliedMigrations.filter(
          m => m.version < migration.version
        );
        await this.saveState(state);

        rolledBack++;
        logger.info('Rollback completed', { version: migration.version });
      } catch (error) {
        logger.error('Rollback failed', {
          version: migration.version,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          success: false,
          error: `Rollback of migration ${migration.version} failed`,
          data: rolledBack,
        };
      }
    }

    logger.info('Rollback completed', { rolledBack, targetVersion });
    return { success: true, data: rolledBack };
  }

  /**
   * Get migration by version
   */
  getMigration(version: number): Migration | undefined {
    return this.migrations.find(m => m.version === version);
  }

  /**
   * Get all registered migrations
   */
  getAllMigrations(): Migration[] {
    return [...this.migrations];
  }

  /**
   * Load migration state from disk
   */
  private async loadState(): Promise<MigrationState> {
    try {
      const content = await fs.readFile(this.stateFile, 'utf-8');
      return JSON.parse(content) as MigrationState;
    } catch {
      return {
        currentVersion: 0,
        appliedMigrations: [],
        lastCheckedAt: Date.now(),
      };
    }
  }

  /**
   * Save migration state to disk
   */
  private async saveState(state: MigrationState): Promise<void> {
    state.lastCheckedAt = Date.now();
    await fs.writeFile(this.stateFile, JSON.stringify(state, null, 2), 'utf-8');
  }

  /**
   * Register default migrations
   */
  private registerDefaultMigrations(): void {
    // Migration 1: Initial schema (v1.0)
    this.registerMigration({
      version: 1,
      name: 'initial-schema',
      description: 'Creates initial storage directory structure',
      up: async () => {
        // Storage directories are created by StorageManager.initialize()
        // This migration just marks the initial version
        await this.storage.initialize();
      },
      down: async () => {
        // Cannot roll back initial schema - would destroy all data
        logger.warn('Cannot roll back initial schema migration');
      },
    });

    // Future migrations will be added here as the schema evolves
    // Example:
    // this.registerMigration({
    //   version: 2,
    //   name: 'add-experience-tags',
    //   description: 'Adds tags field to experiences',
    //   up: async () => {
    //     // Add tags to all existing experiences
    //   },
    //   down: async () => {
    //     // Remove tags from all experiences
    //   },
    // });
  }
}

// Singleton instance
let migrationManagerInstance: MigrationManager | null = null;

/**
 * Get or create the migration manager singleton
 */
export function getMigrationManager(): MigrationManager {
  if (!migrationManagerInstance) {
    migrationManagerInstance = new MigrationManager();
  }
  return migrationManagerInstance;
}
