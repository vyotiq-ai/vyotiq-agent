/**
 * Confirmation Reducer
 * 
 * Handles pending tool confirmations state.
 */

import type { ToolCallEvent } from '../../../shared/types';
import type { AgentUIState } from '../agentReducer';

export type ConfirmationAction =
  | { type: 'PENDING_TOOL_ADD'; payload: ToolCallEvent }
  | { type: 'PENDING_TOOL_REMOVE'; payload: string };

/**
 * Confirmation reducer
 */
export function confirmationReducer(
  state: AgentUIState,
  action: ConfirmationAction
): AgentUIState {
  switch (action.type) {
    case 'PENDING_TOOL_ADD':
      return {
        ...state,
        pendingConfirmations: {
          ...state.pendingConfirmations,
          [action.payload.runId]: action.payload,
        },
      };
      
    case 'PENDING_TOOL_REMOVE': {
      const next = { ...state.pendingConfirmations };
      delete next[action.payload];
      return { ...state, pendingConfirmations: next };
    }
    
    default:
      return state;
  }
}
