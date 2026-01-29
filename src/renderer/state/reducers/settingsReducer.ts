/**
 * Settings Reducer
 * 
 * Handles settings and workspace state updates.
 */

import type { AgentSettings, WorkspaceEntry } from '../../../shared/types';
import type { AgentUIState } from '../agentReducer';

export type SettingsAction =
  | { type: 'WORKSPACES_UPDATE'; payload: WorkspaceEntry[] }
  | { type: 'SETTINGS_UPDATE'; payload: AgentSettings };

/**
 * Settings reducer
 */
export function settingsReducer(
  state: AgentUIState,
  action: SettingsAction
): AgentUIState {
  switch (action.type) {
    case 'WORKSPACES_UPDATE':
      return { ...state, workspaces: action.payload };
      
    case 'SETTINGS_UPDATE':
      return { ...state, settings: action.payload };
      
    default:
      return state;
  }
}
