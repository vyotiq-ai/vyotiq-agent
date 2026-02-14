/**
 * useAgentConfigSettings Hook
 * 
 * Manages agent configuration settings:
 * - Default config (temperature, maxOutputTokens, etc.)
 * - Prompt settings
 * - Autonomous feature flags
 */

import { useCallback } from 'react';
import type { 
  AgentSettings, 
  PromptSettings, 
  AutonomousFeatureFlags 
} from '../../../../shared/types';
import type { UseSettingsStateReturn } from './useSettingsState';

type AgentConfigField = keyof AgentSettings['defaultConfig'];

/**
 * Agent config settings management hook
 * 
 * @param settingsState - Core settings state from useSettingsState
 */
export function useAgentConfigSettings(settingsState: UseSettingsStateReturn) {
  const { setLocalSettings } = settingsState;

  // Update default config fields
  const updateConfig = useCallback(
    (field: AgentConfigField, value: AgentSettings['defaultConfig'][AgentConfigField]) => {
      setLocalSettings((prev) => {
        if (!prev) return prev;
        return { 
          ...prev, 
          defaultConfig: { ...prev.defaultConfig, [field]: value } 
        };
      });
    },
    [setLocalSettings],
  );

  // Update prompt settings
  const updatePromptSetting = useCallback(
    <K extends keyof PromptSettings>(field: K, value: PromptSettings[K]) => {
      setLocalSettings((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          promptSettings: {
            ...prev.promptSettings,
            [field]: value,
          } as PromptSettings,
        };
      });
    },
    [setLocalSettings],
  );

  // Update autonomous feature flags
  const updateAutonomousSetting = useCallback(
    <K extends keyof AutonomousFeatureFlags>(field: K, value: AutonomousFeatureFlags[K]) => {
      setLocalSettings((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          autonomousFeatureFlags: {
            ...prev.autonomousFeatureFlags,
            [field]: value,
          } as AutonomousFeatureFlags,
        };
      });
    },
    [setLocalSettings],
  );

  return {
    updateConfig,
    updatePromptSetting,
    updateAutonomousSetting,
  };
}

export type UseAgentConfigSettingsReturn = ReturnType<typeof useAgentConfigSettings>;
