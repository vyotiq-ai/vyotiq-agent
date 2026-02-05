/**
 * Settings Hooks
 * 
 * Modular hooks for settings management.
 * Split from monolithic useSettings for better separation of concerns.
 * 
 * @example
 * ```tsx
 * // In SettingsPanel - compose all hooks
 * const settingsState = useSettingsState(open);
 * const providerSettings = useProviderSettings(settingsState);
 * const agentConfigSettings = useAgentConfigSettings(settingsState);
 * const securitySettings = useSecuritySettings(settingsState);
 * const systemSettings = useSystemSettings(settingsState);
 * const { saveSettings } = useSettingsSave(settingsState);
 * 
 * // Or use the composed hook for full API
 * const settings = useSettingsComposed(open);
 * 
 * // In individual settings components - use specific hooks
 * const { updateApiKey, updateProviderSetting } = useProviderSettings(settingsState);
 * ```
 */

// =============================================================================
// Hook Exports
// =============================================================================

export { useSettingsState } from './useSettingsState';
export type { UseSettingsStateReturn } from './useSettingsState';

export { useProviderSettings } from './useProviderSettings';
export type { UseProviderSettingsReturn } from './useProviderSettings';

export { useAgentConfigSettings } from './useAgentConfigSettings';
export type { UseAgentConfigSettingsReturn } from './useAgentConfigSettings';

export { useSecuritySettings } from './useSecuritySettings';
export type { UseSecuritySettingsReturn } from './useSecuritySettings';

export { useSystemSettings } from './useSystemSettings';
export type { UseSystemSettingsReturn } from './useSystemSettings';

export { useSettingsSave } from './useSettingsSave';
export type { UseSettingsSaveReturn } from './useSettingsSave';

export { useSettingsComposed } from './useSettingsComposed';
export type { UseSettingsComposedReturn } from './useSettingsComposed';

// =============================================================================
// Type Exports
// =============================================================================

export type { 
  SaveState, 
  SettingsState, 
  SettingsUpdater, 
  SectionUpdater, 
  SaveFunction,
  SettingsContextValue,
} from './types';
