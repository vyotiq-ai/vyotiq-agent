/**
 * GLM IPC Handlers
 * 
 * Handles all GLM (Z.AI) related IPC operations including:
 * - Fetch available models
 * - Connect with API key
 * - Disconnect
 * - Get subscription status
 * - Update settings
 */

import { ipcMain } from 'electron';
import { createLogger } from '../logger';
import type { IpcContext } from './types';
import { GLMProvider, GLM_GENERAL_ENDPOINT, GLM_CODING_ENDPOINT, type GLMModel } from '../agent/providers/glmProvider';

const logger = createLogger('IPC:GLM');

interface GLMSubscriptionStatus {
  connected: boolean;
  tier?: 'lite' | 'pro';
  useCodingEndpoint: boolean;
}

interface GLMConnectParams {
  apiKey: string;
  tier: 'lite' | 'pro';
  useCodingEndpoint: boolean;
}

export function registerGLMHandlers(context: IpcContext): void {
  const { getSettingsStore, getOrchestrator, emitToRenderer } = context;

  // ==========================================================================
  // Fetch Models
  // ==========================================================================

  ipcMain.handle('glm:fetch-models', async (): Promise<{ success: boolean; models: GLMModel[]; error?: string }> => {
    try {
      const settings = getSettingsStore().get();
      const apiKey = settings.apiKeys?.glm;
      
      if (!apiKey) {
        return { success: false, models: [], error: 'No GLM API key configured' };
      }

      const useCodingEndpoint = settings.glmSubscription?.useCodingEndpoint ?? true;
      const endpoint = useCodingEndpoint ? GLM_CODING_ENDPOINT : GLM_GENERAL_ENDPOINT;
      const provider = new GLMProvider(apiKey, endpoint);
      const models = await provider.fetchModels();
      
      logger.debug('Fetched GLM models', { count: models.length });
      return { success: true, models };
    } catch (error) {
      logger.error('Failed to fetch GLM models', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, models: [], error: error instanceof Error ? error.message : 'Failed to fetch models' };
    }
  });

  // ==========================================================================
  // Connect
  // ==========================================================================

  ipcMain.handle('glm:connect', async (_event, params: GLMConnectParams): Promise<{ success: boolean; error?: string }> => {
    try {
      const { apiKey, tier, useCodingEndpoint } = params;

      if (!apiKey?.trim()) {
        return { success: false, error: 'API key is required' };
      }

      // Validate the API key by trying to fetch models
      const endpoint = useCodingEndpoint ? GLM_CODING_ENDPOINT : GLM_GENERAL_ENDPOINT;
      const provider = new GLMProvider(apiKey.trim(), endpoint);
      
      try {
        await provider.fetchModels();
      } catch (fetchError) {
        logger.warn('GLM API key validation failed', { error: fetchError instanceof Error ? fetchError.message : String(fetchError) });
        return { success: false, error: 'Invalid API key or connection failed' };
      }

      // Save the API key and subscription settings
      const currentSettings = getSettingsStore().get();
      await getSettingsStore().update({
        apiKeys: { ...currentSettings.apiKeys, glm: apiKey.trim() },
        glmSubscription: {
          apiKey: apiKey.trim(),
          tier,
          useCodingEndpoint,
          connectedAt: Date.now(),
        },
      });

      // Refresh providers
      getOrchestrator()?.refreshProviders();

      // Emit event to renderer
      emitToRenderer({
        type: 'glm-subscription',
        eventType: 'connected',
        message: `Connected to GLM (${tier} tier)`,
        tier,
      });

      // Emit settings update
      emitToRenderer({ type: 'settings-update', settings: getSettingsStore().get() });

      logger.info('GLM connected', { tier, useCodingEndpoint });
      return { success: true };
    } catch (error) {
      logger.error('Failed to connect GLM', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Connection failed' };
    }
  });

  // ==========================================================================
  // Disconnect
  // ==========================================================================

  ipcMain.handle('glm:disconnect', async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const currentSettings = getSettingsStore().get();
      
      // Clear the API key and subscription
      await getSettingsStore().update({
        apiKeys: { ...currentSettings.apiKeys, glm: '' },
        glmSubscription: undefined,
      });

      // Refresh providers
      getOrchestrator()?.refreshProviders();

      // Emit event to renderer
      emitToRenderer({
        type: 'glm-subscription',
        eventType: 'disconnected',
        message: 'Disconnected from GLM',
      });

      // Emit settings update
      emitToRenderer({ type: 'settings-update', settings: getSettingsStore().get() });

      logger.info('GLM disconnected');
      return { success: true };
    } catch (error) {
      logger.error('Failed to disconnect GLM', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Disconnect failed' };
    }
  });

  // ==========================================================================
  // Get Subscription Status
  // ==========================================================================

  ipcMain.handle('glm:get-subscription-status', async (): Promise<GLMSubscriptionStatus> => {
    try {
      const settings = getSettingsStore().get();
      const apiKey = settings.apiKeys?.glm;
      const glmSubscription = settings.glmSubscription;

      const connected = !!(apiKey && apiKey.trim().length > 0 && glmSubscription);
      
      return {
        connected,
        tier: connected ? glmSubscription?.tier : undefined,
        useCodingEndpoint: glmSubscription?.useCodingEndpoint ?? true,
      };
    } catch (error) {
      logger.error('Failed to get GLM subscription status', { error: error instanceof Error ? error.message : String(error) });
      return { connected: false, useCodingEndpoint: true };
    }
  });

  // ==========================================================================
  // Update Settings
  // ==========================================================================

  ipcMain.handle('glm:update-settings', async (_event, settings: { useCodingEndpoint?: boolean }): Promise<{ success: boolean; error?: string }> => {
    try {
      const currentSettings = getSettingsStore().get();
      
      if (currentSettings.glmSubscription) {
        await getSettingsStore().update({
          glmSubscription: {
            ...currentSettings.glmSubscription,
            ...settings,
          },
        });
      }

      // Refresh providers to use new settings
      getOrchestrator()?.refreshProviders();

      // Emit settings update
      emitToRenderer({ type: 'settings-update', settings: getSettingsStore().get() });

      logger.info('GLM settings updated', settings);
      return { success: true };
    } catch (error) {
      logger.error('Failed to update GLM settings', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Update failed' };
    }
  });
}
