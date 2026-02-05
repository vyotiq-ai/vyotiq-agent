/**
 * Settings Hooks Types
 * 
 * Shared types for settings hooks system.
 */

import type { AgentSettings } from '../../../../shared/types';

/**
 * Save state for settings
 */
export type SaveState = 'idle' | 'success' | 'error';

/**
 * Base settings state returned by settings hooks
 */
export interface SettingsState {
  localSettings: AgentSettings | null;
  isDirty: boolean;
  isSaving: boolean;
  saveState: SaveState;
  errorMessage: string | null;
}

/**
 * Settings updater function type
 */
export type SettingsUpdater<T> = (field: keyof T, value: T[keyof T]) => void;

/**
 * Generic settings section update function
 */
export type SectionUpdater<T> = <K extends keyof T>(field: K, value: T[K]) => void;

/**
 * Settings save function
 */
export type SaveFunction = () => Promise<void>;

/**
 * Settings context for sharing state between hooks
 */
export interface SettingsContextValue extends SettingsState {
  setLocalSettings: React.Dispatch<React.SetStateAction<AgentSettings | null>>;
  setBaselineSettings: React.Dispatch<React.SetStateAction<AgentSettings | null>>;
  setSaveState: React.Dispatch<React.SetStateAction<SaveState>>;
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>;
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>;
}
