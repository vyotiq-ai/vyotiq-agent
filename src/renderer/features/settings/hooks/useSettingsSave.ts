/**
 * useSettingsSave Hook
 * 
 * Handles saving settings to the main process and syncing browser settings.
 * Also propagates relevant defaultConfig changes to all existing sessions
 * so that settings like enableAutoModelSelection take effect immediately.
 */

import { useCallback } from 'react';
import type { AgentSettings, AgentConfig } from '../../../../shared/types';
import { createLogger } from '../../../utils/logger';
import { useAgentSelector } from '../../../state/AgentProvider';
import type { UseSettingsStateReturn } from './useSettingsState';

const logger = createLogger('SettingsSave');

/**
 * Config keys that should be propagated to existing sessions when changed.
 * These are the keys from defaultConfig that affect runtime behavior.
 */
const PROPAGATABLE_CONFIG_KEYS: (keyof AgentConfig)[] = [
  'enableAutoModelSelection',
  'enableProviderFallback',
  'allowAutoSwitch',
  'temperature',
  'maxOutputTokens',
  'yoloMode',
  'maxIterations',
  'maxRetries',
  'enableContextSummarization',
  'preferredProvider',
  'fallbackProvider',
];

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

  // Get all session IDs to propagate config changes
  const sessionIds = useAgentSelector(
    state => state.sessions.map(s => s.id),
    (a, b) => a.length === b.length && a.every((id, i) => id === b[i])
  );

  // Save settings to the store
  const saveSettings = useCallback(async () => {
    if (!localSettings) {
      return;
    }
    
    try {
      setIsSaving(true);
      
      const result = await window.vyotiq.settings.update(localSettings);
      if (result && !result.success) {
        throw new Error(result.error || 'Settings update failed');
      }
      const nextSnapshot = (result?.data || localSettings) as AgentSettings;
      
      // Propagate relevant defaultConfig changes to all existing sessions
      // so settings like enableAutoModelSelection take effect immediately
      if (localSettings.defaultConfig && window.vyotiq?.agent) {
        const configPatch: Partial<AgentConfig> = {};
        let hasPatch = false;
        
        for (const key of PROPAGATABLE_CONFIG_KEYS) {
          if (key in localSettings.defaultConfig && localSettings.defaultConfig[key] !== undefined) {
            (configPatch as Record<string, unknown>)[key] = localSettings.defaultConfig[key];
            hasPatch = true;
          }
        }
        
        if (hasPatch && sessionIds.length > 0) {
          // Fire-and-forget: propagate to all sessions in parallel
          Promise.all(
            sessionIds.map(sessionId =>
              window.vyotiq.agent.updateConfig({ sessionId, config: configPatch })
                .catch(err => logger.warn('Failed to propagate config to session', { sessionId, error: err }))
            )
          ).then(() => {
            logger.info('Propagated config changes to existing sessions', {
              sessionCount: sessionIds.length,
              keys: Object.keys(configPatch),
            });
          });
        }
      }
      
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
  }, [localSettings, setLocalSettings, setIsSaving, markSaveSuccess, markSaveError, syncBaseline, sessionIds]);

  return {
    saveSettings,
  };
}

export type UseSettingsSaveReturn = ReturnType<typeof useSettingsSave>;
