/**
 * useSettingsState Hook
 * 
 * Core hook that manages settings state lifecycle.
 * Handles initialization, dirty checking, and state synchronization.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { AgentSettings } from '../../../../shared/types';
import { useAgentSelector } from '../../../state/AgentProvider';
import { createLogger } from '../../../utils/logger';
import type { SaveState } from './types';

const logger = createLogger('SettingsState');

/**
 * Core settings state management hook
 * 
 * Provides the foundational state for the settings panel:
 * - Local copy of settings for editing
 * - Dirty state tracking
 * - Save state management
 * 
 * @param open - Whether settings panel is open
 */
export function useSettingsState(open: boolean) {
  // Get settings from global state
  const settings = useAgentSelector(
    (s) => s.settings,
    (a, b) => a === b,
  );
  
  // Local editing state
  const [localSettings, setLocalSettings] = useState<AgentSettings | null>(null);
  const [baselineSettings, setBaselineSettings] = useState<AgentSettings | null>(null);
  
  // Save operation state
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
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
      
      logger.debug('Settings initialized', { 
        hasProviderSettings: !!snapshot.providerSettings,
        apiKeyCount: snapshot.apiKeys ? Object.keys(snapshot.apiKeys).filter(k => !!snapshot.apiKeys[k as keyof typeof snapshot.apiKeys]).length : 0,
      });
    }
  }, [open, settings]);

  // Check if settings have changed
  const isDirty = useMemo(() => {
    if (!localSettings || !baselineSettings) return false;
    return JSON.stringify(localSettings) !== JSON.stringify(baselineSettings);
  }, [baselineSettings, localSettings]);

  // Reset save state
  const resetSaveState = useCallback(() => {
    setSaveState('idle');
    setErrorMessage(null);
  }, []);

  // Mark as successful save
  const markSaveSuccess = useCallback(() => {
    setSaveState('success');
    // Clear success message after delay
    setTimeout(() => setSaveState('idle'), 3500);
  }, []);

  // Mark as failed save
  const markSaveError = useCallback((error: string) => {
    setSaveState('error');
    setErrorMessage(error);
  }, []);

  // Sync baseline after save
  const syncBaseline = useCallback(() => {
    if (localSettings) {
      setBaselineSettings(JSON.parse(JSON.stringify(localSettings)));
    }
  }, [localSettings]);

  return {
    // State
    localSettings,
    baselineSettings,
    isDirty,
    isSaving,
    saveState,
    errorMessage,
    
    // Setters
    setLocalSettings,
    setBaselineSettings,
    setIsSaving,
    setSaveState,
    setErrorMessage,
    
    // Helpers
    resetSaveState,
    markSaveSuccess,
    markSaveError,
    syncBaseline,
  };
}

export type UseSettingsStateReturn = ReturnType<typeof useSettingsState>;
