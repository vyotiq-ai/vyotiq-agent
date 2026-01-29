/**
 * Settings IPC Handlers
 * 
 * Handles all settings-related IPC operations including:
 * - Get current settings
 * - Update settings
 */

import { ipcMain } from 'electron';
import { createLogger } from '../logger';
import type { IpcContext } from './types';
import type { AgentSettings } from '../../shared/types';
import { getToolResultCache, getContextCache } from '../agent/cache';

const logger = createLogger('IPC:Settings');

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
    try {
      const settingsStore = getSettingsStore();
      const settings = settingsStore.get();
      logger.debug('Settings retrieved');
      return settings;
    } catch (error) {
      logger.error('Failed to get settings', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  });

  /**
   * Update settings
   */
  ipcMain.handle('settings:update', async (_event, payload: { settings: Partial<AgentSettings> }) => {
    try {
      const settingsStore = getSettingsStore();
      
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
      return updated;
    } catch (error) {
      logger.error('Failed to update settings', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  });
}
