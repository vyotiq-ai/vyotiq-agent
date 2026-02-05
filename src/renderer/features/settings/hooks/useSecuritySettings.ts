/**
 * useSecuritySettings Hook
 * 
 * Manages security-related settings:
 * - Safety settings (guardrails)
 * - Compliance settings
 * - Access level settings
 * - Browser settings
 */

import { useCallback } from 'react';
import type { 
  SafetySettings, 
  ComplianceSettings, 
  AccessLevelSettings, 
  BrowserSettings 
} from '../../../../shared/types';
import type { UseSettingsStateReturn } from './useSettingsState';

/**
 * Security settings management hook
 * 
 * @param settingsState - Core settings state from useSettingsState
 */
export function useSecuritySettings(settingsState: UseSettingsStateReturn) {
  const { setLocalSettings } = settingsState;

  // Update safety settings
  const updateSafetySetting = useCallback(
    (field: keyof SafetySettings, value: SafetySettings[keyof SafetySettings]) => {
      setLocalSettings((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          safetySettings: {
            ...prev.safetySettings,
            [field]: value,
          } as SafetySettings,
        };
      });
    },
    [setLocalSettings],
  );

  // Update compliance settings
  const updateComplianceSetting = useCallback(
    (field: keyof ComplianceSettings, value: ComplianceSettings[keyof ComplianceSettings]) => {
      setLocalSettings((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          complianceSettings: {
            ...prev.complianceSettings,
            [field]: value,
          } as ComplianceSettings,
        };
      });
    },
    [setLocalSettings],
  );

  // Update access level settings
  const updateAccessLevelSetting = useCallback(
    (field: keyof AccessLevelSettings, value: AccessLevelSettings[keyof AccessLevelSettings]) => {
      setLocalSettings((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          accessLevelSettings: {
            ...prev.accessLevelSettings,
            [field]: value,
          } as AccessLevelSettings,
        };
      });
    },
    [setLocalSettings],
  );

  // Update browser settings
  const updateBrowserSetting = useCallback(
    (field: keyof BrowserSettings, value: BrowserSettings[keyof BrowserSettings]) => {
      setLocalSettings((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          browserSettings: {
            ...prev.browserSettings,
            [field]: value,
          } as BrowserSettings,
        };
      });
    },
    [setLocalSettings],
  );

  return {
    updateSafetySetting,
    updateComplianceSetting,
    updateAccessLevelSetting,
    updateBrowserSetting,
  };
}

export type UseSecuritySettingsReturn = ReturnType<typeof useSecuritySettings>;
