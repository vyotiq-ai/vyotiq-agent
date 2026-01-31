/**
 * Settings IPC Handlers
 * 
 * Handles all settings-related IPC operations including:
 * - Get current settings
 * - Update settings
 * - Reset settings to defaults
 * - Validate settings
 */

import { ipcMain } from 'electron';
import { createLogger } from '../logger';
import type { IpcContext } from './types';
import type { AgentSettings } from '../../shared/types';
import { getToolResultCache, getContextCache } from '../agent/cache';
import { withErrorGuard } from './guards';

const logger = createLogger('IPC:Settings');

// =============================================================================
// Settings Validation
// =============================================================================

interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate settings values for correctness
 */
function validateSettings(settings: Partial<AgentSettings>): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // Validate defaultConfig
  if (settings.defaultConfig) {
    const config = settings.defaultConfig;
    
    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
      errors.push({ field: 'defaultConfig.temperature', message: 'Temperature must be between 0 and 2' });
    }
    
    if (config.maxOutputTokens !== undefined && (config.maxOutputTokens < 1 || config.maxOutputTokens > 200000)) {
      errors.push({ field: 'defaultConfig.maxOutputTokens', message: 'Max output tokens must be between 1 and 200000' });
    }
    
    if (config.maxIterations !== undefined && (config.maxIterations < 1 || config.maxIterations > 100)) {
      errors.push({ field: 'defaultConfig.maxIterations', message: 'Max iterations must be between 1 and 100' });
    }
    
    if (config.maxRetries !== undefined && (config.maxRetries < 0 || config.maxRetries > 10)) {
      errors.push({ field: 'defaultConfig.maxRetries', message: 'Max retries must be between 0 and 10' });
    }
  }
  
  // Validate safetySettings
  if (settings.safetySettings) {
    const safety = settings.safetySettings;
    
    if (safety.maxFilesPerRun !== undefined && (safety.maxFilesPerRun < 1 || safety.maxFilesPerRun > 1000)) {
      errors.push({ field: 'safetySettings.maxFilesPerRun', message: 'Max files per run must be between 1 and 1000' });
    }
    
    if (safety.maxBytesPerRun !== undefined && (safety.maxBytesPerRun < 1024 || safety.maxBytesPerRun > 100 * 1024 * 1024)) {
      errors.push({ field: 'safetySettings.maxBytesPerRun', message: 'Max bytes per run must be between 1KB and 100MB' });
    }
  }
  
  // Validate cacheSettings
  if (settings.cacheSettings) {
    const cache = settings.cacheSettings;
    
    if (cache.toolCache?.maxEntries !== undefined && (cache.toolCache.maxEntries < 1 || cache.toolCache.maxEntries > 100000)) {
      errors.push({ field: 'cacheSettings.toolCache.maxEntries', message: 'Max cache entries must be between 1 and 100000' });
    }
    
    if (cache.contextCache?.maxSizeMb !== undefined && (cache.contextCache.maxSizeMb < 1 || cache.contextCache.maxSizeMb > 1024)) {
      errors.push({ field: 'cacheSettings.contextCache.maxSizeMb', message: 'Max cache size must be between 1MB and 1024MB' });
    }
  }
  
  // Validate semanticSettings
  if (settings.semanticSettings) {
    const semantic = settings.semanticSettings;
    
    if (semantic.targetChunkSize !== undefined && (semantic.targetChunkSize < 100 || semantic.targetChunkSize > 10000)) {
      errors.push({ field: 'semanticSettings.targetChunkSize', message: 'Target chunk size must be between 100 and 10000' });
    }
    
    if (semantic.maxFileSize !== undefined && (semantic.maxFileSize < 1024 || semantic.maxFileSize > 10 * 1024 * 1024)) {
      errors.push({ field: 'semanticSettings.maxFileSize', message: 'Max file size must be between 1KB and 10MB' });
    }
    
    if (semantic.hnswM !== undefined && (semantic.hnswM < 4 || semantic.hnswM > 64)) {
      errors.push({ field: 'semanticSettings.hnswM', message: 'HNSW M parameter must be between 4 and 64' });
    }
    
    if (semantic.minSearchScore !== undefined && (semantic.minSearchScore < 0 || semantic.minSearchScore > 1)) {
      errors.push({ field: 'semanticSettings.minSearchScore', message: 'Min search score must be between 0 and 1' });
    }
  }
  
  return errors;
}

/**
 * Apply cache settings to the cache singletons
 * This ensures changes are immediately effective without restart
 */
function applyCacheSettings(settings: AgentSettings): void {
  try {
    // Apply tool cache settings
    if (settings.cacheSettings?.toolCache) {
      const toolCache = getToolResultCache();
      toolCache.updateConfig({
        maxAge: settings.cacheSettings.toolCache.defaultTtlMs,
        maxSize: settings.cacheSettings.toolCache.maxEntries,
        enableLRU: settings.cacheSettings.enableLruEviction,
      });
      logger.debug('Tool cache settings applied', {
        maxAge: settings.cacheSettings.toolCache.defaultTtlMs,
        maxEntries: settings.cacheSettings.toolCache.maxEntries,
        lru: settings.cacheSettings.enableLruEviction,
      });
    }

    // Apply context cache settings
    if (settings.cacheSettings?.contextCache) {
      const contextCache = getContextCache();
      contextCache.setConfig({
        maxSizeBytes: settings.cacheSettings.contextCache.maxSizeMb * 1024 * 1024,
        defaultTTL: settings.cacheSettings.contextCache.defaultTtlMs,
        enableTTL: settings.cacheSettings.contextCache.enabled,
      });
      logger.debug('Context cache settings applied', {
        maxSizeMb: settings.cacheSettings.contextCache.maxSizeMb,
        defaultTtlMs: settings.cacheSettings.contextCache.defaultTtlMs,
        enabled: settings.cacheSettings.contextCache.enabled,
      });
    }
  } catch (error) {
    logger.warn('Failed to apply cache settings', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function registerSettingsHandlers(context: IpcContext): void {
  const { getSettingsStore } = context;

  // ==========================================================================
  // Settings Management
  // ==========================================================================

  /**
   * Get current settings
   */
  ipcMain.handle('settings:get', async () => {
    return withErrorGuard('settings:get', async () => {
      const settingsStore = getSettingsStore();
      const settings = settingsStore.get();
      logger.debug('Settings retrieved');
      return settings;
    });
  });

  /**
   * Update settings with validation
   */
  ipcMain.handle('settings:update', async (_event, payload: { settings: Partial<AgentSettings> }) => {
    return withErrorGuard('settings:update', async () => {
      const settingsStore = getSettingsStore();
      
      // Validate settings before applying
      const validationErrors = validateSettings(payload.settings);
      if (validationErrors.length > 0) {
        logger.warn('Settings validation failed', { errors: validationErrors });
        return {
          success: false,
          error: 'Validation failed',
          validationErrors,
        };
      }
      
      logger.info('Updating settings', { 
        keys: Object.keys(payload.settings),
      });
      
      // Update the settings store (uses set() which persists automatically)
      const updated = settingsStore.set(payload.settings);
      
      // Apply cache settings immediately if they were updated
      if (payload.settings.cacheSettings) {
        applyCacheSettings(updated);
      }
      
      logger.info('Settings updated successfully');
      return { success: true, data: updated };
    });
  });

  /**
   * Reset settings to defaults
   */
  ipcMain.handle('settings:reset', async (_event, payload?: { section?: keyof AgentSettings }) => {
    return withErrorGuard('settings:reset', async () => {
      const settingsStore = getSettingsStore();
      
      if (payload?.section) {
        // Reset only a specific section
        logger.info('Resetting settings section to defaults', { section: payload.section });
        await settingsStore.resetSection(payload.section);
      } else {
        // Reset all settings
        logger.info('Resetting all settings to defaults');
        await settingsStore.resetToDefaults();
      }
      
      const updated = settingsStore.get();
      applyCacheSettings(updated);
      
      logger.info('Settings reset successfully');
      return { success: true, data: updated };
    });
  });

  /**
   * Validate settings without applying them
   */
  ipcMain.handle('settings:validate', async (_event, payload: { settings: Partial<AgentSettings> }) => {
    return withErrorGuard('settings:validate', async () => {
      const errors = validateSettings(payload.settings);
      return {
        valid: errors.length === 0,
        errors,
      };
    });
  });

  /**
   * Export settings for backup
   */
  ipcMain.handle('settings:export', async () => {
    return withErrorGuard('settings:export', async () => {
      const settingsStore = getSettingsStore();
      const settings = settingsStore.get();
      
      // Remove sensitive data (API keys) for export
      const exportData = {
        ...settings,
        apiKeys: {}, // Don't export API keys
      };
      
      return { success: true, data: exportData };
    });
  });

  /**
   * Import settings from backup
   */
  ipcMain.handle('settings:import', async (_event, payload: { settings: Partial<AgentSettings> }) => {
    return withErrorGuard('settings:import', async () => {
      const settingsStore = getSettingsStore();
      
      // Validate before importing
      const validationErrors = validateSettings(payload.settings);
      if (validationErrors.length > 0) {
        return {
          success: false,
          error: 'Validation failed',
          validationErrors,
        };
      }
      
      // Don't import API keys from external sources for security
      const safeSettings = { ...payload.settings };
      delete safeSettings.apiKeys;
      
      const updated = settingsStore.set(safeSettings);
      applyCacheSettings(updated);
      
      logger.info('Settings imported successfully');
      return { success: true, data: updated };
    });
  });

  logger.info('Settings IPC handlers registered');
}
