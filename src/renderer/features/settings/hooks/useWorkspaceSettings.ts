/**
 * useWorkspaceSettings Hook
 * 
 * Manages workspace indexing and embedding settings:
 * - Auto-indexing configuration
 * - File watcher settings
 * - Vector embedding configuration
 * - Exclude/include patterns
 * - Agent context injection settings
 */

import { useCallback } from 'react';
import type { WorkspaceIndexingSettings } from '../../../../shared/types';
import type { UseSettingsStateReturn } from './useSettingsState';

/**
 * Workspace settings management hook
 * 
 * @param settingsState - Core settings state from useSettingsState
 */
export function useWorkspaceSettings(settingsState: UseSettingsStateReturn) {
  const { setLocalSettings } = settingsState;

  // Update workspace indexing settings
  const updateWorkspaceSetting = useCallback(
    <K extends keyof WorkspaceIndexingSettings>(field: K, value: WorkspaceIndexingSettings[K]) => {
      setLocalSettings((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          workspaceSettings: {
            ...prev.workspaceSettings,
            [field]: value,
          } as WorkspaceIndexingSettings,
        };
      });
    },
    [setLocalSettings],
  );

  return {
    updateWorkspaceSetting,
  };
}

export type UseWorkspaceSettingsReturn = ReturnType<typeof useWorkspaceSettings>;
