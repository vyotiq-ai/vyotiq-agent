/**
 * Smart Placeholder Hook
 * 
 * Generates context-aware, dynamic placeholder text for the chat input
 * based on the current agent state, status phase, and session context.
 * 
 * When the agent is idle, shows the default prompt placeholder.
 * When the agent is running, shows contextual follow-up suggestions
 * that rotate periodically and adapt to the current agent phase.
 * When paused, shows pause-specific hints.
 * 
 * #### Architecture
 * - Pure logic hook with no UI dependencies
 * - Rotates through contextual suggestions on a timer
 * - Adapts to agent phase (planning, executing, analyzing, etc.)
 * - Supports awaiting-confirmation state
 * 
 * @example
 * ```tsx
 * const placeholder = useSmartPlaceholder({
 *   agentBusy: true,
 *   statusPhase: 'executing',
 *   isFollowUpMode: true,
 *   isPaused: false,
 *   hasSession: true,
 *   messageCount: 5,
 * });
 * // => "add more context or redirect the approach..."
 * ```
 */

import { useMemo, useState, useEffect, useRef } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface SmartPlaceholderOptions {
  /** Whether the agent is actively running */
  agentBusy: boolean;
  /** Current agent phase (planning, executing, etc.) */
  statusPhase?: string;
  /** Whether follow-up injection is available */
  isFollowUpMode: boolean;
  /** Whether the agent is paused */
  isPaused: boolean;
  /** Whether there is an active session */
  hasSession: boolean;
  /** Number of messages in the session */
  messageCount: number;
  /** Whether the agent is awaiting user confirmation */
  isAwaitingConfirmation: boolean;
}

export interface SmartPlaceholderResult {
  /** The current placeholder text */
  text: string;
  /** Whether the placeholder is in follow-up mode (contextual hints) */
  isContextual: boolean;
}

// =============================================================================
// Placeholder Pools
// =============================================================================

/** Default idle placeholder */
const IDLE_PLACEHOLDER = 'describe what to do...';

/** New session (no messages yet) */
const NEW_SESSION_PLACEHOLDER = 'describe what to do...';

/** Follow-up placeholders when agent is actively running */
const RUNNING_FOLLOW_UPS: readonly string[] = [
  'send a follow-up to guide the agent...',
  'add more context while the agent works...',
  'redirect the approach if needed...',
  'provide additional instructions...',
  'refine the current task...',
  'share relevant details or constraints...',
  'adjust the scope or priorities...',
  'mention files or paths to focus on...',
] as const;

/** Phase-specific follow-up suggestions */
const PHASE_FOLLOW_UPS: Record<string, readonly string[]> = {
  planning: [
    'adjust the plan or add constraints...',
    'clarify requirements before execution...',
    'narrow the scope or add priorities...',
    'mention specific approaches to consider...',
  ],
  analyzing: [
    'point to specific files or areas...',
    'add context about the codebase...',
    'share relevant implementation details...',
    'narrow down what to focus on...',
  ],
  reasoning: [
    'add constraints or edge cases...',
    'provide additional context...',
    'clarify expected behavior...',
    'mention related components or files...',
  ],
  executing: [
    'send corrections or adjustments...',
    'add follow-up instructions...',
    'mention additional changes needed...',
    'refine the current approach...',
  ],
  recovering: [
    'provide hints to resolve the issue...',
    'suggest an alternative approach...',
    'share error details or context...',
    'point to relevant documentation...',
  ],
  summarizing: [
    'ask for more details on the changes...',
    'request additional modifications...',
    'follow up with next steps...',
  ],
} as const;

/** Placeholders when agent is paused */
const PAUSED_FOLLOW_UPS: readonly string[] = [
  'add instructions before resuming...',
  'adjust the task while paused...',
  'provide context for when it resumes...',
] as const;

/** Placeholders when awaiting user confirmation */
const CONFIRMATION_PLACEHOLDERS: readonly string[] = [
  'respond to proceed or provide guidance...',
  'confirm, deny, or adjust the action...',
  'reply with additional instructions...',
] as const;

// =============================================================================
// Rotation interval (ms)
// =============================================================================

const ROTATION_INTERVAL_MS = 5000;

// =============================================================================
// Hook
// =============================================================================

/**
 * Generates smart, context-aware placeholder text for the chat input.
 * Rotates through relevant suggestions based on agent state.
 */
export function useSmartPlaceholder(options: SmartPlaceholderOptions): SmartPlaceholderResult {
  const {
    agentBusy,
    statusPhase,
    isFollowUpMode,
    isPaused,
    hasSession,
    messageCount,
    isAwaitingConfirmation,
  } = options;

  const [rotationIndex, setRotationIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Determine which pool of placeholders to use
  const placeholderPool = useMemo<readonly string[]>(() => {
    // Not in a session yet
    if (!hasSession) {
      return [NEW_SESSION_PLACEHOLDER];
    }

    // Awaiting confirmation takes priority
    if (isAwaitingConfirmation) {
      return CONFIRMATION_PLACEHOLDERS;
    }

    // Paused state
    if (isPaused) {
      return PAUSED_FOLLOW_UPS;
    }

    // Agent is actively running — follow-up mode
    if (agentBusy && isFollowUpMode) {
      // Try phase-specific suggestions first
      if (statusPhase && statusPhase in PHASE_FOLLOW_UPS) {
        return PHASE_FOLLOW_UPS[statusPhase];
      }
      // Fall back to generic running follow-ups
      return RUNNING_FOLLOW_UPS;
    }

    // Idle with no messages — fresh session
    if (messageCount === 0) {
      return [NEW_SESSION_PLACEHOLDER];
    }

    // Default idle state
    return [IDLE_PLACEHOLDER];
  }, [hasSession, isAwaitingConfirmation, isPaused, agentBusy, isFollowUpMode, statusPhase, messageCount]);

  // Reset rotation index when pool changes
  useEffect(() => {
    setRotationIndex(0);
  }, [placeholderPool]);

  // Rotate through placeholders when there are multiple options
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Only rotate if there are multiple options
    if (placeholderPool.length <= 1) {
      return;
    }

    intervalRef.current = setInterval(() => {
      setRotationIndex((prev) => (prev + 1) % placeholderPool.length);
    }, ROTATION_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [placeholderPool]);

  // Compute current placeholder text
  const text = useMemo(() => {
    const safeIndex = rotationIndex % placeholderPool.length;
    return placeholderPool[safeIndex] ?? IDLE_PLACEHOLDER;
  }, [placeholderPool, rotationIndex]);

  // Whether we're showing contextual (non-default) placeholders
  const isContextual = useMemo(() => {
    return agentBusy || isPaused || isAwaitingConfirmation;
  }, [agentBusy, isPaused, isAwaitingConfirmation]);

  return { text, isContextual };
}
