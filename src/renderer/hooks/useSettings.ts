import { useState, useEffect, useMemo, useCallback } from 'react';
import type { AgentSettings, LLMProviderName, ProviderSettings, SafetySettings, CacheSettings, DebugSettings, PromptSettings, ComplianceSettings, AccessLevelSettings, BrowserSettings, TaskRoutingSettings, RoutingTaskType, TaskModelMapping, EditorAISettings, AutonomousFeatureFlags, SemanticSettings, AppearanceSettings } from '../../shared/types';
import { useAgentSelector } from '../state/AgentProvider';
import { getDefaultModel } from '../../shared/providers';
import { createLogger } from '../utils/logger';

const logger = createLogger('Settings');

type AgentConfigField = keyof AgentSettings['defaultConfig'];

/**
 * Settings Hook
 * 
 * Primary hook for settings management with full provider settings support.
 * Features:
 * - Provider-specific settings (enabled, priority, baseUrl)
 * - Model selection per provider
 * - Context window configuration
 * - Rate limit configuration
 * 
 * @param open - Whether the settings dialog is open
 * @returns Settings state and update functions
 * 
 * @example
 * ```tsx
 * const {
 *   localSettings,
 *   isDirty,
 *   isSaving,
 *   updateConfig,
 *   updateApiKey,
 *   updateProviderSetting,
 *   updateModelSelection,
 *   saveSettings,
 * } = useSettings(isOpen);
 * ```
 */
export const useSettings = (open: boolean) => {
  const settings = useAgentSelector(
    (s) => s.settings,
    (a, b) => a === b,
  );
  const [localSettings, setLocalSettings] = useState<AgentSettings | null>(null);
  const [baselineSettings, setBaselineSettings] = useState<AgentSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize local settings when dialog opens
  useEffect(() => {
    if (!open) {
      return;
    }
    if (settings) {
      // Deep clone to avoid mutating the store
      const snapshot = JSON.parse(JSON.stringify(settings)) as AgentSettings;
      
      // Ensure providerSettings exists (for backwards compatibility)
      if (!snapshot.providerSettings) {
        snapshot.providerSettings = {};
      }
      
      setLocalSettings(snapshot);
      setBaselineSettings(snapshot);
      setSaveState('idle');
      setErrorMessage(null);
    }
  }, [open, settings]);

  // Check if settings have changed
  const isDirty = useMemo(() => {
    if (!localSettings || !baselineSettings) return false;
    return JSON.stringify(localSettings) !== JSON.stringify(baselineSettings);
  }, [baselineSettings, localSettings]);

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
    [],
  );

  // Update API key for a provider
  const updateApiKey = useCallback((provider: LLMProviderName, value: string) => {
    setLocalSettings((prev) => {
      if (!prev) return prev;
      return { 
        ...prev, 
        apiKeys: { ...prev.apiKeys, [provider]: value } 
      };
    });
  }, []);

  // Update rate limit for a provider
  const updateRateLimit = useCallback((provider: LLMProviderName, value: number) => {
    setLocalSettings((prev) => {
      if (!prev) return prev;
      return { 
        ...prev, 
        rateLimits: { ...prev.rateLimits, [provider]: value } 
      };
    });
  }, []);

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
    [],
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
    [],
  );

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
    [],
  );

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
    [],
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
    [],
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
    [],
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
    [],
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
    [],
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
    [],
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
    [],
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
    [],
  );

  // Update editor AI settings
  const updateEditorAISetting = useCallback(
    (field: keyof EditorAISettings, value: EditorAISettings[keyof EditorAISettings]) => {
      setLocalSettings((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          editorAISettings: {
            ...prev.editorAISettings,
            [field]: value,
          } as EditorAISettings,
        };
      });
    },
    [],
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
    [],
  );

  // Update semantic indexing settings
  const updateSemanticSetting = useCallback(
    (field: keyof SemanticSettings, value: SemanticSettings[keyof SemanticSettings]) => {
      setLocalSettings((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          semanticSettings: {
            ...prev.semanticSettings,
            [field]: value,
          } as SemanticSettings,
        };
      });
    },
    [],
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
    [],
  );

  // Save settings to the store
  const saveSettings = useCallback(async () => {
    if (!localSettings) {
      return;
    }
    try {
      setIsSaving(true);
      setSaveState('idle');
      setErrorMessage(null);
      
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
      
      setBaselineSettings(nextSnapshot);
      setLocalSettings(nextSnapshot);
      setSaveState('success');
      
      // Clear success message after delay
      setTimeout(() => setSaveState('idle'), 3500);
    } catch (error) {
      logger.error('Failed to save settings', { error });
      setSaveState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unable to persist settings');
    } finally {
      setIsSaving(false);
    }
  }, [localSettings]);

  return {
    localSettings,
    isDirty,
    isSaving,
    saveState,
    errorMessage,
    updateConfig,
    updateApiKey,
    updateRateLimit,
    updateProviderSetting,
    updateModelSelection,
    updateSafetySetting,
    updateComplianceSetting,
    updateAccessLevelSetting,
    updateCacheSetting,
    updateDebugSetting,
    updatePromptSetting,
    updateBrowserSetting,
    updateTaskRoutingSetting,
    updateTaskMapping,
    updateEditorAISetting,
    updateAutonomousSetting,
    updateSemanticSetting,
    updateAppearanceSetting,
    saveSettings,
  };
};
