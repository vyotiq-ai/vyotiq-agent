/**
 * useSystemSettings Hook
 * 
 * Manages system-related settings:
 * - Cache settings (performance)
 * - Debug settings
 * - Appearance settings
 * - Task routing settings
 */

import { useCallback } from 'react';
import type { 
  CacheSettings, 
  DebugSettings, 
  AppearanceSettings,
  TaskRoutingSettings,
  RoutingTaskType,
  TaskModelMapping,
} from '../../../../shared/types';
import type { UseSettingsStateReturn } from './useSettingsState';

/**
 * System settings management hook
 * 
 * @param settingsState - Core settings state from useSettingsState
 */
export function useSystemSettings(settingsState: UseSettingsStateReturn) {
  const { setLocalSettings } = settingsState;

  // Update cache settings
  const updateCacheSetting = useCallback(
    (field: keyof CacheSettings, value: CacheSettings[keyof CacheSettings]) => {
      setLocalSettings((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          cacheSettings: {
            ...prev.cacheSettings,
            [field]: value,
          } as CacheSettings,
        };
      });
    },
    [setLocalSettings],
  );

  // Update debug settings
  const updateDebugSetting = useCallback(
    (field: keyof DebugSettings, value: DebugSettings[keyof DebugSettings]) => {
      setLocalSettings((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          debugSettings: {
            ...prev.debugSettings,
            [field]: value,
          } as DebugSettings,
        };
      });
    },
    [setLocalSettings],
  );

  // Update appearance settings
  const updateAppearanceSetting = useCallback(
    (field: keyof AppearanceSettings, value: AppearanceSettings[keyof AppearanceSettings]) => {
      setLocalSettings((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          appearanceSettings: {
            ...prev.appearanceSettings,
            [field]: value,
          } as AppearanceSettings,
        };
      });
    },
    [setLocalSettings],
  );

  // Update task routing settings (top-level fields)
  const updateTaskRoutingSetting = useCallback(
    <K extends keyof TaskRoutingSettings>(field: K, value: TaskRoutingSettings[K]) => {
      setLocalSettings((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          taskRoutingSettings: {
            ...prev.taskRoutingSettings,
            [field]: value,
          } as TaskRoutingSettings,
        };
      });
    },
    [setLocalSettings],
  );

  // Update a specific task mapping within task routing settings
  const updateTaskMapping = useCallback(
    (taskType: RoutingTaskType, mapping: TaskModelMapping) => {
      setLocalSettings((prev) => {
        if (!prev) return prev;
        const currentMappings = prev.taskRoutingSettings?.taskMappings ?? [];
        // Find and update or add the mapping
        const existingIndex = currentMappings.findIndex(m => m.taskType === taskType);
        let newMappings: TaskModelMapping[];
        if (existingIndex >= 0) {
          newMappings = [...currentMappings];
          newMappings[existingIndex] = mapping;
        } else {
          newMappings = [...currentMappings, mapping];
        }
        return {
          ...prev,
          taskRoutingSettings: {
            ...prev.taskRoutingSettings,
            taskMappings: newMappings,
          } as TaskRoutingSettings,
        };
      });
    },
    [setLocalSettings],
  );

  return {
    updateCacheSetting,
    updateDebugSetting,
    updateAppearanceSetting,
    updateTaskRoutingSetting,
    updateTaskMapping,
  };
}

export type UseSystemSettingsReturn = ReturnType<typeof useSystemSettings>;
