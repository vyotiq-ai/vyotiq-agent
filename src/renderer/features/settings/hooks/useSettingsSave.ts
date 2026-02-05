/**
 * useSettingsSave Hook
 * 
 * Handles saving settings to the main process and syncing browser settings.
 */

import { useCallback } from 'react';
import type { AgentSettings } from '../../../../shared/types';
import { createLogger } from '../../../utils/logger';
import type { UseSettingsStateReturn } from './useSettingsState';

const logger = createLogger('SettingsSave');

/**
 * Settings save management hook
 * 
 * @param settingsState - Core settings state from useSettingsState
 */
export function useSettingsSave(settingsState: UseSettingsStateReturn) {
  const {
    localSettings,
    setLocalSettings,
    setIsSaving,
    markSaveSuccess,
    markSaveError,
    syncBaseline,
  } = settingsState;

  // Save settings to the store
  const saveSettings = useCallback(async () => {
    if (!localSettings) {
      return;
    }
    
    try {
      setIsSaving(true);
      
      const updated = await window.vyotiq.settings.update(localSettings);
      const nextSnapshot = (updated || localSettings) as AgentSettings;
      
      // Sync browser settings to BrowserSecurity and BrowserManager
      if (localSettings.browserSettings) {
        try {
          // Sync security settings
          await window.vyotiq.browser.security.updateConfig({
            urlFilteringEnabled: localSettings.browserSettings.urlFilteringEnabled,
            popupBlockingEnabled: localSettings.browserSettings.popupBlockingEnabled,
            adBlockingEnabled: localSettings.browserSettings.adBlockingEnabled,
            trackerBlockingEnabled: localSettings.browserSettings.trackerBlockingEnabled,
            downloadProtectionEnabled: localSettings.browserSettings.downloadProtectionEnabled,
            allowList: localSettings.browserSettings.allowList,
            customBlockList: localSettings.browserSettings.customBlockList,
            blockMixedContent: localSettings.browserSettings.blockMixedContent,
            trustedLocalhostPorts: localSettings.browserSettings.trustedLocalhostPorts,
          });
          logger.info('Browser security settings synced');
          
          // Sync behavior settings
          await window.vyotiq.browser.applyBehaviorSettings({
            navigationTimeout: localSettings.browserSettings.navigationTimeout,
            maxContentLength: localSettings.browserSettings.maxContentLength,
            customUserAgent: localSettings.browserSettings.customUserAgent,
            enableJavaScript: localSettings.browserSettings.enableJavaScript,
            enableCookies: localSettings.browserSettings.enableCookies,
            clearDataOnExit: localSettings.browserSettings.clearDataOnExit,
          });
          logger.info('Browser behavior settings synced');
        } catch (syncError) {
          logger.warn('Failed to sync browser settings', { error: syncError });
          // Don't fail the save if browser sync fails
        }
      }
      
      setLocalSettings(nextSnapshot);
      syncBaseline();
      markSaveSuccess();
      
      logger.info('Settings saved successfully');
    } catch (error) {
      logger.error('Failed to save settings', { error });
      markSaveError(error instanceof Error ? error.message : 'Unable to persist settings');
    } finally {
      setIsSaving(false);
    }
  }, [localSettings, setLocalSettings, setIsSaving, markSaveSuccess, markSaveError, syncBaseline]);

  return {
    saveSettings,
  };
}

export type UseSettingsSaveReturn = ReturnType<typeof useSettingsSave>;
