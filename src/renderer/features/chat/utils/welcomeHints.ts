/**
 * Welcome Hints Utilities
 * 
 * Shared constants and utilities for welcome/empty state hints.
 * Consolidates duplicate logic from SessionWelcome and EmptyState components.
 */

/**
 * Hints shown when a session is active and ready for input
 */
export const SESSION_HINTS = [
  'ask me anything about your code',
] as const;

/**
 * Hints shown when no workspace is selected
 */
export const EMPTY_STATE_HINTS = [
  'select a workspace to begin',
  'create a new session to chat',
] as const;

/**
 * Get a contextual hint based on application state
 * @param hasWorkspace - Whether a workspace is active
 * @param hasSession - Whether a session is active  
 * @param hintIndex - Current hint index for cycling
 */
export function getContextualHint(
  hasWorkspace: boolean, 
  hasSession: boolean, 
  hintIndex: number = 0
): string {
  if (!hasWorkspace) {
    return 'select a workspace to begin';
  }
  if (!hasSession) {
    return 'create a new session';
  }
  // Cycle through session hints when ready
  return SESSION_HINTS[hintIndex % SESSION_HINTS.length];
}

/**
 * Hook-like utility for managing typewriter effect state
 */
export interface TypewriterState {
  displayedText: string;
  isDeleting: boolean;
  hintIndex: number;
}

export const initialTypewriterState: TypewriterState = {
  displayedText: '',
  isDeleting: false,
  hintIndex: 0,
};
