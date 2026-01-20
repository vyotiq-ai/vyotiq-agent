/**
 * Claude Subscription IPC Handlers
 * 
 * Handles all Claude Code subscription OAuth operations including:
 * - OAuth flow initiation
 * - Token refresh
 * - Subscription status
 * - Disconnect/cleanup
 */

import { ipcMain } from 'electron';
import { createLogger } from '../logger';
import type { IpcContext } from './types';

const logger = createLogger('IPC:Claude');

export function registerClaudeHandlers(context: IpcContext): void {
  const { getOrchestrator, getSettingsStore, emitToRenderer } = context;

  // ==========================================================================
  // OAuth Flow
  // ==========================================================================

  ipcMain.handle('claude:start-oauth', async () => {
    try {
      const { 
        importClaudeCodeCredentials, 
        startBackgroundRefresh, 
        setSubscriptionUpdateCallback, 
        setStatusChangeCallback 
      } = await import('../agent/claudeAuth');
      
      const subscription = await importClaudeCodeCredentials();
      
      // Save subscription to settings
      await getSettingsStore().update({ claudeSubscription: subscription });
      
      // Set callback to emit status changes to renderer
      setStatusChangeCallback((event) => {
        emitToRenderer({
          type: 'claude-subscription',
          eventType: event.type,
          message: event.message,
          tier: event.tier,
        });
      });
      
      // Set callback to auto-save refreshed tokens
      setSubscriptionUpdateCallback(async (updated) => {
        await getSettingsStore().update({ claudeSubscription: updated });
        emitToRenderer({ type: 'settings-update', settings: getSettingsStore().get() });
        getOrchestrator()?.refreshProviders();
      });
      
      // Start background refresh
      startBackgroundRefresh(subscription);
      
      // Refresh providers to use new subscription
      getOrchestrator()?.refreshProviders();
      
      // Emit settings update to renderer
      emitToRenderer({ type: 'settings-update', settings: getSettingsStore().get() });
      
      logger.info('Claude Code credentials imported', { tier: subscription.tier });
      return { success: true, subscription };
    } catch (error) {
      logger.error('Claude Code import failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Import failed' };
    }
  });

  ipcMain.handle('claude:launch-auth', async () => {
    try {
      const { launchClaudeAuthentication, setAuthCompleteCallback } = await import('../agent/claudeAuth');
      
      // Set callback to handle auth completion
      setAuthCompleteCallback(async (subscription) => {
        // Save subscription to settings
        await getSettingsStore().update({ claudeSubscription: subscription });
        
        // Refresh providers
        getOrchestrator()?.refreshProviders();
        
        // Emit settings update
        emitToRenderer({ type: 'settings-update', settings: getSettingsStore().get() });
        
        logger.info('Claude auth completed via file watcher', { tier: subscription.tier });
      });
      
      return await launchClaudeAuthentication();
    } catch (error) {
      logger.error('Failed to launch Claude authentication', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Launch failed' };
    }
  });

  // ==========================================================================
  // Disconnect
  // ==========================================================================

  ipcMain.handle('claude:disconnect', async () => {
    try {
      const { 
        clearClaudeSubscription, 
        setSubscriptionUpdateCallback, 
        setStatusChangeCallback 
      } = await import('../agent/claudeAuth');
      
      await clearClaudeSubscription();
      
      // Clear callbacks
      setSubscriptionUpdateCallback(null);
      setStatusChangeCallback(null);
      
      // Remove subscription from settings
      await getSettingsStore().update({ claudeSubscription: undefined });
      
      // Refresh providers
      getOrchestrator()?.refreshProviders();
      
      // Emit settings update to renderer
      emitToRenderer({ type: 'settings-update', settings: getSettingsStore().get() });
      
      logger.info('Claude subscription disconnected');
      return { success: true };
    } catch (error) {
      logger.error('Failed to disconnect Claude subscription', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Disconnect failed' };
    }
  });

  // ==========================================================================
  // Status & Refresh
  // ==========================================================================

  ipcMain.handle('claude:get-subscription-status', async () => {
    try {
      const settings = getSettingsStore().get();
      const { getSubscriptionStatus } = await import('../agent/claudeAuth');
      return getSubscriptionStatus(settings.claudeSubscription);
    } catch (error) {
      logger.error('Failed to get subscription status', { error: error instanceof Error ? error.message : String(error) });
      return { connected: false };
    }
  });

  ipcMain.handle('claude:refresh-token', async () => {
    try {
      const settings = getSettingsStore().get();
      if (!settings.claudeSubscription?.refreshToken) {
        return { success: false, error: 'No refresh token available' };
      }

      const { refreshClaudeToken } = await import('../agent/claudeAuth');
      const subscription = await refreshClaudeToken(settings.claudeSubscription.refreshToken);
      
      // Save updated subscription
      await getSettingsStore().update({ claudeSubscription: subscription });
      
      // Refresh providers to use updated token
      getOrchestrator()?.refreshProviders();
      
      logger.info('Claude token refreshed', { tier: subscription.tier });
      return { success: true, subscription };
    } catch (error) {
      logger.error('Failed to refresh Claude token', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Token refresh failed' };
    }
  });

  // ==========================================================================
  // Installation Check
  // ==========================================================================

  ipcMain.handle('claude:check-installed', async () => {
    try {
      const { 
        isClaudeCodeInstalled, 
        hasClaudeCodeCredentials, 
        isClaudeCodeCLIAvailable 
      } = await import('../agent/claudeAuth');
      
      const cliAvailable = await isClaudeCodeCLIAvailable();
      const installed = await isClaudeCodeInstalled();
      const hasCredentials = installed ? await hasClaudeCodeCredentials() : false;
      
      return { installed, hasCredentials, cliAvailable };
    } catch (error) {
      logger.error('Failed to check Claude Code installation', { error: error instanceof Error ? error.message : String(error) });
      return { installed: false, hasCredentials: false, cliAvailable: false };
    }
  });
}
