/**
 * Settings IPC Handlers
 * 
 * Handles all settings-related IPC operations including:
 * - Get current settings
 * - Update settings
 * - Reset settings to defaults
 * - Validate settings
 * - Safe settings access (excludes API keys)
 */

import { ipcMain } from 'electron';
import { createLogger } from '../logger';
import type { IpcContext } from './types';
import type { AgentSettings } from '../../shared/types';
import { getToolResultCache, getContextCache } from '../agent/cache';
import { getBrowserManager, getBrowserSecurity } from '../browser';
import { withErrorGuard } from './guards';
import { validateAllSettings } from '../agent/settingsValidation';
import { syncMCPSettingsToManager } from './mcpSettingsSync';
import { rustSidecar } from '../rustSidecar';
import { getSystemPromptCache } from '../agent/systemPrompt';

const logger = createLogger('IPC:Settings');

// =============================================================================
// Settings Validation
// =============================================================================

interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate settings values for correctness using comprehensive validators
 */
function validateSettings(settings: Partial<AgentSettings>): ValidationError[] {
  const errors: ValidationError[] = [];

  // Use comprehensive validation from settingsValidation.ts
  const fullValidation = validateAllSettings({
    defaultConfig: settings.defaultConfig,
    browserSettings: settings.browserSettings,
    complianceSettings: settings.complianceSettings,
    accessLevelSettings: settings.accessLevelSettings,
    taskRoutingSettings: settings.taskRoutingSettings,
    promptSettings: settings.promptSettings,
    toolSettings: settings.autonomousFeatureFlags?.toolSettings,
    safetySettings: settings.safetySettings,
    appearanceSettings: settings.appearanceSettings,
    debugSettings: settings.debugSettings,
    cacheSettings: settings.cacheSettings,
    mcpSettings: settings.mcpSettings,
    workspaceSettings: settings.workspaceSettings,
    rateLimits: settings.rateLimits,
  });

  // Convert full validation result to ValidationError array
  for (const [_section, result] of Object.entries(fullValidation.sections)) {
    if (result && result.errors) {
      for (const error of result.errors) {
        errors.push({
          field: error.field,
          message: error.message,
        });
      }
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

/**
 * Apply browser settings to the browser manager and browser security
 * This ensures both behavior and security settings are immediately effective without restart
 */
function applyBrowserSettings(settings: AgentSettings): void {
  try {
    const browserSettings = settings.browserSettings;
    if (!browserSettings) return;

    // Apply behavior settings to BrowserManager
    const browserManager = getBrowserManager();
    browserManager.applyBehaviorSettings({
      navigationTimeout: browserSettings.navigationTimeout,
      maxContentLength: browserSettings.maxContentLength,
      customUserAgent: browserSettings.customUserAgent,
      enableJavaScript: browserSettings.enableJavaScript,
      enableCookies: browserSettings.enableCookies,
      clearDataOnExit: browserSettings.clearDataOnExit,
    });

    // Apply security settings to BrowserSecurity
    try {
      const browserSecurity = getBrowserSecurity();
      browserSecurity.updateConfig({
        urlFilteringEnabled: browserSettings.urlFilteringEnabled,
        popupBlockingEnabled: browserSettings.popupBlockingEnabled,
        adBlockingEnabled: browserSettings.adBlockingEnabled,
        trackerBlockingEnabled: browserSettings.trackerBlockingEnabled,
        downloadProtectionEnabled: browserSettings.downloadProtectionEnabled,
        blockMixedContent: browserSettings.blockMixedContent,
        allowList: browserSettings.allowList,
        customBlockList: browserSettings.customBlockList,
        trustedLocalhostPorts: browserSettings.trustedLocalhostPorts,
      });
    } catch {
      // BrowserSecurity may not be initialized yet (lazy init)
      logger.debug('BrowserSecurity not yet initialized, security settings will be applied on first use');
    }

    logger.debug('Browser settings applied reactively (behavior + security)');
  } catch (error) {
    logger.warn('Failed to apply browser settings', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Apply workspace indexing settings to the Rust sidecar.
 * Restarts the sidecar so it picks up the new env-based config values.
 * After restart, notifies the renderer of the new auth token so it can
 * refresh its cached token and reconnect WebSocket without 401 errors.
 */
async function applyWorkspaceSettings(
  settings: AgentSettings,
  notifyRenderer?: (newToken: string) => void,
): Promise<void> {
  try {
    const ws = settings.workspaceSettings;
    if (!ws) return;

    if (rustSidecar.isRunning()) {
      logger.info('Workspace indexing settings changed — restarting Rust sidecar');
      await rustSidecar.stop();
      await rustSidecar.start(ws);

      // Push the new auth token to the renderer so it doesn't use the stale one
      const newToken = rustSidecar.getAuthToken();
      if (newToken && notifyRenderer) {
        notifyRenderer(newToken);
        logger.debug('Sent new auth token to renderer after sidecar restart');
      }
    }
  } catch (error) {
    logger.warn('Failed to apply workspace settings to Rust sidecar', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function registerSettingsHandlers(context: IpcContext): void {
  const { getSettingsStore, emitToRenderer, getMainWindow } = context;

  /** Notify renderer of a new sidecar auth token after restart */
  const notifyRendererToken = (newToken: string): void => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('rust-backend:auth-token-changed', newToken);
    }
  };

  // ==========================================================================
  // Settings Management
  // ==========================================================================

  /**
   * Get current settings (full access, including API keys)
   * Use settings:get-safe for non-sensitive access
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
   * Get settings excluding sensitive data (API keys)
   * Use this for general UI access to avoid exposing credentials
   */
  ipcMain.handle('settings:get-safe', async () => {
    return withErrorGuard('settings:get-safe', async () => {
      const settingsStore = getSettingsStore();
      const settings = settingsStore.get();

      // Create a copy without sensitive data
      const safeSettings: Partial<AgentSettings> = {
        ...settings,
        // Replace API keys with presence indicators
        apiKeys: settings.apiKeys ? Object.fromEntries(
          Object.entries(settings.apiKeys).map(([provider, key]) => [
            provider,
            key ? '••••••••' : '' // Mask but indicate presence
          ])
        ) : {},
        // Mask Claude subscription tokens
        claudeSubscription: settings.claudeSubscription ? {
          ...settings.claudeSubscription,
          accessToken: settings.claudeSubscription.accessToken ? '••••••••' : '',
          refreshToken: settings.claudeSubscription.refreshToken ? '••••••••' : '',
        } : undefined,
        // Mask GLM subscription
        glmSubscription: settings.glmSubscription ? {
          ...settings.glmSubscription,
          apiKey: settings.glmSubscription.apiKey ? '••••••••' : undefined,
        } : undefined,
      };

      logger.debug('Safe settings retrieved (API keys masked)');
      return safeSettings;
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

      // Apply browser settings immediately if they were updated
      if (payload.settings.browserSettings) {
        applyBrowserSettings(updated);
      }

      // Apply compliance settings immediately if they were updated
      if (payload.settings.complianceSettings) {
        const orchestrator = context.getOrchestrator();
        if (orchestrator) {
          orchestrator.updateComplianceConfig(updated.complianceSettings);
          logger.info('Compliance settings applied to running validator');
        }
      }

      // Apply safety settings immediately if they were updated
      if (payload.settings.safetySettings) {
        const orchestrator = context.getOrchestrator();
        if (orchestrator) {
          orchestrator.updateActiveSafetySettings(updated.safetySettings);
          logger.info('Safety settings applied to active safety managers');
        }
      }

      // Apply debug settings immediately if they were updated
      if (payload.settings.debugSettings) {
        const orchestrator = context.getOrchestrator();
        if (orchestrator) {
          orchestrator.updateDebugConfig({
            verbose: updated.debugSettings?.verboseLogging,
            captureFullPayloads: updated.debugSettings?.captureFullPayloads,
            stepMode: updated.debugSettings?.stepByStepMode,
            exportOnError: updated.debugSettings?.autoExportOnError,
            exportFormat: updated.debugSettings?.traceExportFormat,
          });
          logger.info('Debug settings applied to running orchestrator');
        }
      }

      // Propagate MCP settings/servers changes to live MCPServerManager
      if (payload.settings.mcpSettings || payload.settings.mcpServers) {
        syncMCPSettingsToManager(updated, logger).catch(() => { /* handled internally */ });
      }

      // Restart Rust sidecar if workspace indexing settings changed
      if (payload.settings.workspaceSettings) {
        applyWorkspaceSettings(updated, notifyRendererToken).catch(() => { /* handled internally */ });
      }

      // Refresh provider map when provider-related settings change
      // This ensures API key changes, model selections, enable/disable toggles,
      // priority changes, and base URL updates take effect immediately
      if (
        payload.settings.apiKeys ||
        payload.settings.providerSettings ||
        payload.settings.defaultConfig ||
        payload.settings.rateLimits
      ) {
        const orchestrator = context.getOrchestrator();
        if (orchestrator) {
          orchestrator.refreshProviders();
          logger.info('Providers refreshed after settings update');
        }
      }

      // Invalidate system prompt cache when prompt-affecting settings change
      // This ensures custom system prompts, personas, agent instructions,
      // response format, and context rules are picked up on next request
      if (
        payload.settings.promptSettings ||
        payload.settings.accessLevelSettings ||
        payload.settings.complianceSettings ||
        payload.settings.defaultConfig ||
        payload.settings.safetySettings
      ) {
        try {
          getSystemPromptCache().invalidate();
          logger.debug('System prompt cache invalidated after settings update');
        } catch (err) {
          logger.warn('Failed to invalidate system prompt cache', { error: err });
        }
      }

      // Emit settings update to renderer for real-time application
      emitToRenderer({ type: 'settings-update', settings: updated });

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
      applyBrowserSettings(updated);

      // Sync MCP settings to live MCPServerManager after reset
      syncMCPSettingsToManager(updated, logger).catch(() => { /* handled internally */ });

      // Restart Rust sidecar with reset workspace settings
      applyWorkspaceSettings(updated, notifyRendererToken).catch(() => { /* handled internally */ });

      // Apply compliance and safety settings after reset
      const orchestratorForReset = context.getOrchestrator();
      if (orchestratorForReset) {
        orchestratorForReset.updateComplianceConfig(updated.complianceSettings);
        orchestratorForReset.updateActiveSafetySettings(updated.safetySettings);
        logger.info('Compliance and safety settings applied after reset');

        // Apply debug settings after reset
        if (updated.debugSettings) {
          orchestratorForReset.updateDebugConfig({
            verbose: updated.debugSettings.verboseLogging,
            captureFullPayloads: updated.debugSettings.captureFullPayloads,
            stepMode: updated.debugSettings.stepByStepMode,
            exportOnError: updated.debugSettings.autoExportOnError,
            exportFormat: updated.debugSettings.traceExportFormat,
          });
          logger.info('Debug settings applied after reset');
        }
      }

      // Refresh providers and invalidate prompt cache after reset
      const orchestrator = context.getOrchestrator();
      if (orchestrator) {
        orchestrator.refreshProviders();
        logger.info('Providers refreshed after settings reset');
      }
      try {
        getSystemPromptCache().invalidate();
      } catch { /* handled */ }

      // Emit settings update to renderer for real-time application
      emitToRenderer({ type: 'settings-update', settings: updated });

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

      // Remove sensitive data (API keys, subscription tokens) for export
      const exportData = {
        ...settings,
        apiKeys: {}, // Don't export API keys
        // Strip subscription credentials
        claudeSubscription: settings.claudeSubscription ? {
          ...settings.claudeSubscription,
          accessToken: undefined as string | undefined,
          refreshToken: undefined as string | undefined,
        } : undefined,
        glmSubscription: settings.glmSubscription ? {
          ...settings.glmSubscription,
          apiKey: undefined as string | undefined,
        } : undefined,
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

      // Don't import API keys or subscription credentials from external sources for security
      const safeSettings = { ...payload.settings };
      delete safeSettings.apiKeys;
      delete safeSettings.claudeSubscription;
      delete safeSettings.glmSubscription;

      const updated = settingsStore.set(safeSettings);
      applyCacheSettings(updated);
      applyBrowserSettings(updated);

      // Sync MCP settings to live MCPServerManager after import
      syncMCPSettingsToManager(updated, logger).catch(() => { /* handled internally */ });

      // Restart Rust sidecar with imported workspace settings
      applyWorkspaceSettings(updated, notifyRendererToken).catch(() => { /* handled internally */ });

      // Apply compliance and safety settings after import
      const orchestratorForImport = context.getOrchestrator();
      if (orchestratorForImport) {
        orchestratorForImport.updateComplianceConfig(updated.complianceSettings);
        orchestratorForImport.updateActiveSafetySettings(updated.safetySettings);
        logger.info('Compliance and safety settings applied after import');

        // Apply debug settings after import
        if (updated.debugSettings) {
          orchestratorForImport.updateDebugConfig({
            verbose: updated.debugSettings.verboseLogging,
            captureFullPayloads: updated.debugSettings.captureFullPayloads,
            stepMode: updated.debugSettings.stepByStepMode,
            exportOnError: updated.debugSettings.autoExportOnError,
            exportFormat: updated.debugSettings.traceExportFormat,
          });
          logger.info('Debug settings applied after import');
        }
      }

      // Refresh providers and invalidate prompt cache after import
      const orchestrator = context.getOrchestrator();
      if (orchestrator) {
        orchestrator.refreshProviders();
        logger.info('Providers refreshed after settings import');
      }
      try {
        getSystemPromptCache().invalidate();
      } catch { /* handled */ }

      // Emit settings update to renderer for real-time application
      emitToRenderer({ type: 'settings-update', settings: updated });

      logger.info('Settings imported successfully');
      return { success: true, data: updated };
    });
  });

  logger.info('Settings IPC handlers registered');
}
