/**
 * Settings Reducer
 * 
 * Handles settings state updates.
 */

import type { AgentSettings } from '../../../shared/types';
import type { AgentUIState } from '../agentReducer';

export type SettingsAction =
  | { type: 'SETTINGS_UPDATE'; payload: AgentSettings };

/**
 * Settings reducer
 */
export function settingsReducer(
  state: AgentUIState,
  action: SettingsAction
): AgentUIState {
  switch (action.type) {
    case 'SETTINGS_UPDATE':
      // Skip update if settings reference hasn't changed
      if (state.settings === action.payload) return state;
      return { ...state, settings: action.payload };
      
    default:
      return state;
  }
}
