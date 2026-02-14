/**
 * useSettingsComposed Hook
 * 
 * Composed settings hook that combines all domain-specific hooks.
 * This provides backward compatibility with the old useSettings API
 * while using the new modular architecture internally.
 * 
 * @example
 * ```tsx
 * const {
 *   localSettings,
 *   isDirty,
 *   isSaving,
 *   updateConfig,
 *   updateApiKey,
 *   saveSettings,
 *   ...
 * } = useSettingsComposed(open);
 * ```
 */

import { useSettingsState } from './useSettingsState';
import { useProviderSettings } from './useProviderSettings';
import { useAgentConfigSettings } from './useAgentConfigSettings';
import { useSecuritySettings } from './useSecuritySettings';
import { useSystemSettings } from './useSystemSettings';
import { useWorkspaceSettings } from './useWorkspaceSettings';
import { useSettingsSave } from './useSettingsSave';

/**
 * Composed settings hook
 * 
 * Combines all domain-specific hooks into a single unified API.
 * Use this when you need access to all settings functions,
 * or use individual hooks for specific domains.
 * 
 * @param open - Whether settings panel is open
 */
export function useSettingsComposed(open: boolean) {
  // Core state management
  const settingsState = useSettingsState(open);
  
  // Domain-specific hooks
  const providerSettings = useProviderSettings(settingsState);
  const agentConfigSettings = useAgentConfigSettings(settingsState);
  const securitySettings = useSecuritySettings(settingsState);
  const systemSettings = useSystemSettings(settingsState);
  const workspaceSettings = useWorkspaceSettings(settingsState);
  const { saveSettings } = useSettingsSave(settingsState);

  return {
    // State
    localSettings: settingsState.localSettings,
    isDirty: settingsState.isDirty,
    isSaving: settingsState.isSaving,
    saveState: settingsState.saveState,
    errorMessage: settingsState.errorMessage,
    
    // Provider settings
    ...providerSettings,
    
    // Agent config settings
    ...agentConfigSettings,
    
    // Security settings
    ...securitySettings,
    
    // System settings
    ...systemSettings,
    
    // Workspace settings
    ...workspaceSettings,
    
    // Save function
    saveSettings,
  };
}

export type UseSettingsComposedReturn = ReturnType<typeof useSettingsComposed>;
