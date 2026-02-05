/**
 * useProviderSettings Hook
 * 
 * Manages provider-related settings:
 * - API keys
 * - Rate limits
 * - Provider-specific settings (enabled, priority, baseUrl)
 * - Model selection per provider
 */

import { useCallback } from 'react';
import type { LLMProviderName, ProviderSettings } from '../../../../shared/types';
import { getDefaultModel } from '../../../../shared/providers';
import type { UseSettingsStateReturn } from './useSettingsState';

/**
 * Provider settings management hook
 * 
 * @param settingsState - Core settings state from useSettingsState
 */
export function useProviderSettings(settingsState: UseSettingsStateReturn) {
  const { setLocalSettings } = settingsState;

  // Update API key for a provider
  const updateApiKey = useCallback((provider: LLMProviderName, value: string) => {
    setLocalSettings((prev) => {
      if (!prev) return prev;
      return { 
        ...prev, 
        apiKeys: { ...prev.apiKeys, [provider]: value } 
      };
    });
  }, [setLocalSettings]);

  // Update rate limit for a provider
  const updateRateLimit = useCallback((provider: LLMProviderName, value: number) => {
    setLocalSettings((prev) => {
      if (!prev) return prev;
      return { 
        ...prev, 
        rateLimits: { ...prev.rateLimits, [provider]: value } 
      };
    });
  }, [setLocalSettings]);

  // Update provider-specific settings
  const updateProviderSetting = useCallback(
    (provider: LLMProviderName, field: string, value: unknown) => {
      setLocalSettings((prev) => {
        if (!prev) return prev;
        
        const defaultSettings: ProviderSettings = {
          enabled: true,
          priority: 1,
          model: { modelId: getDefaultModel(provider)?.id ?? '' },
        };
        const currentProviderSettings = prev.providerSettings[provider] ?? defaultSettings;
        
        return {
          ...prev,
          providerSettings: {
            ...prev.providerSettings,
            [provider]: {
              ...currentProviderSettings,
              [field]: value,
            },
          },
        };
      });
    },
    [setLocalSettings],
  );

  // Update model selection for a provider
  const updateModelSelection = useCallback(
    (provider: LLMProviderName, modelId: string) => {
      setLocalSettings((prev) => {
        if (!prev) return prev;
        
        const defaultSettings: ProviderSettings = {
          enabled: true,
          priority: 1,
          model: { modelId: '' },
        };
        const currentProviderSettings = prev.providerSettings[provider] ?? defaultSettings;
        
        return {
          ...prev,
          providerSettings: {
            ...prev.providerSettings,
            [provider]: {
              ...currentProviderSettings,
              model: {
                ...currentProviderSettings.model,
                modelId,
              },
            },
          },
        };
      });
    },
    [setLocalSettings],
  );

  return {
    updateApiKey,
    updateRateLimit,
    updateProviderSetting,
    updateModelSelection,
  };
}

export type UseProviderSettingsReturn = ReturnType<typeof useProviderSettings>;
