/**
 * useSettings Hook (Legacy Export)
 * 
 * This file re-exports the composed settings hook from the settings feature
 * for backward compatibility with existing code.
 * 
 * @deprecated Import from '@/renderer/features/settings/hooks' instead
 */

import { useSettingsComposed } from '../features/settings/hooks';

/**
 * Settings Hook
 * 
 * Primary hook for settings management with full provider settings support.
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
export const useSettings = useSettingsComposed;

export type UseSettingsReturn = ReturnType<typeof useSettings>;
