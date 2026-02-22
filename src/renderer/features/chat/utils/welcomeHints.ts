/**
 * Welcome Hints Utilities
 * 
 * Shared constants and utilities for welcome/empty state hints.
 * Consolidates duplicate logic from SessionWelcome and EmptyState components.
 */

/**
 * Hints shown when a session is active and ready for input.
 * Each hint is a short, intelligent phrase reflecting agent capabilities.
 */
export const SESSION_HINTS = [
  'ask me anything about your code',
  'describe a bug and i will trace it',
  'paste an error and i will investigate',
  'tell me what to build',
  'i can refactor, debug, or explain',
  'ask me to write tests for a module',
  'point me to a file and i will review it',
] as const;

/**
 * Hints shown when no workspace is selected
 */
export const EMPTY_STATE_HINTS = [
  'open a workspace to begin',
  'select a project folder',
] as const;

/**
 * Hints shown when no session is active but workspace is loaded
 */
export const NO_SESSION_HINTS = [
  'start a new session',
  'ready when you are',
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
    return EMPTY_STATE_HINTS[hintIndex % EMPTY_STATE_HINTS.length];
  }
  if (!hasSession) {
    return NO_SESSION_HINTS[hintIndex % NO_SESSION_HINTS.length];
  }
  return SESSION_HINTS[hintIndex % SESSION_HINTS.length];
}

/**
 * Get a random session hint index (avoids always starting at 0)
 */
export function getRandomHintIndex(): number {
  return Math.floor(Math.random() * SESSION_HINTS.length);
}
