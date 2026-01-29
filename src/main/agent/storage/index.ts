/**
 * Storage Module Index
 * 
 * Exports all storage-related functionality for agent system.
 */

// Session storage (existing)
export { SessionStorage, type SessionStorageConfig } from './SessionStorage';

// ============================================================================
// Autonomous Agent System Storage (Phase 1)
// ============================================================================

// Central storage
export { StorageManager, getStorageManager, resetStorageManager } from './StorageManager';

// Domain-specific storage
export { DynamicToolStorage, getDynamicToolStorage } from './DynamicToolStorage';

// Infrastructure
export { BackupManager, getBackupManager } from './BackupManager';
export { MigrationManager, getMigrationManager } from './MigrationManager';
export { CacheStorage, getCacheStorage } from './CacheStorage';
