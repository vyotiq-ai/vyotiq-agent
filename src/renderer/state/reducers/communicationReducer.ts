/**
 * Communication Reducer
 * 
 * Handles communication-related state: questions, decisions, and progress.
 */

import type { AgentUIState } from '../agentReducer';

export type CommunicationAction =
  | { type: 'COMMUNICATION_QUESTION_ADD'; payload: AgentUIState['pendingQuestions'][0] }
  | { type: 'COMMUNICATION_QUESTION_REMOVE'; payload: string }
  | { type: 'COMMUNICATION_DECISION_ADD'; payload: AgentUIState['pendingDecisions'][0] }
  | { type: 'COMMUNICATION_DECISION_REMOVE'; payload: string }
  | { type: 'COMMUNICATION_PROGRESS_ADD'; payload: AgentUIState['communicationProgress'][0] }
  | { type: 'COMMUNICATION_PROGRESS_UPDATE'; payload: { id: string; progress: number; message?: string } }
  | { type: 'COMMUNICATION_PROGRESS_CLEAR'; payload?: string };

/**
 * Communication reducer
 */
export function communicationReducer(
  state: AgentUIState,
  action: CommunicationAction
): AgentUIState {
  switch (action.type) {
    case 'COMMUNICATION_QUESTION_ADD':
      return {
        ...state,
        pendingQuestions: [...state.pendingQuestions, action.payload],
      };

    case 'COMMUNICATION_QUESTION_REMOVE':
      return {
        ...state,
        pendingQuestions: state.pendingQuestions.filter(q => q.id !== action.payload),
      };

    case 'COMMUNICATION_DECISION_ADD':
      return {
        ...state,
        pendingDecisions: [...state.pendingDecisions, action.payload],
      };

    case 'COMMUNICATION_DECISION_REMOVE':
      return {
        ...state,
        pendingDecisions: state.pendingDecisions.filter(d => d.id !== action.payload),
      };

    case 'COMMUNICATION_PROGRESS_ADD':
      return {
        ...state,
        communicationProgress: [...state.communicationProgress, action.payload],
      };

    case 'COMMUNICATION_PROGRESS_UPDATE':
      return {
        ...state,
        communicationProgress: state.communicationProgress.map(p =>
          p.id === action.payload.id
            ? { ...p, progress: action.payload.progress, message: action.payload.message ?? p.message }
            : p
        ),
      };

    case 'COMMUNICATION_PROGRESS_CLEAR':
      if (action.payload) {
        return {
          ...state,
          communicationProgress: state.communicationProgress.filter(p => p.runId !== action.payload),
        };
      }
      return {
        ...state,
        communicationProgress: [],
      };

    default:
      return state;
  }
}
