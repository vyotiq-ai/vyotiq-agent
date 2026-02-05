/**
 * Queued Tools Hook
 *
 * Provides access to real-time tool queue state.
 * Used by components that need to display tool execution status.
 */
import { useMemo } from 'react';
import { useAgentSelector } from '../state/AgentProvider';
import type { QueuedTool, AgentState } from '../state/agentReducer';

/**
 * Get queued tools for a specific run
 *
 * @param runId - Run ID to get queued tools for
 * @returns Array of queued tools or empty array if not found
 */
export function useQueuedTools(runId: string | undefined): QueuedTool[] {
  const selector = useMemo(
    () => (state: AgentState) => {
      if (!runId) return [];
      return state.queuedTools[runId] ?? [];
    },
    [runId],
  );

  return useAgentSelector(selector, (a, b) => {
    if (a.length !== b.length) return false;
    return a.every((tool, i) => tool.callId === b[i].callId && tool.queuePosition === b[i].queuePosition);
  });
}

/**
 * Get all queued tools across all runs
 *
 * @returns Map of runId to queued tools array
 */
export function useAllQueuedTools(): Record<string, QueuedTool[]> {
  const selector = useMemo(() => (state: AgentState) => state.queuedTools, []);

  return useAgentSelector(selector, (a, b) => a === b);
}

/**
 * Get total count of queued tools for a specific run
 *
 * @param runId - Run ID to check
 * @returns Number of queued tools
 */
export function useQueuedToolsCount(runId: string | undefined): number {
  const queuedTools = useQueuedTools(runId);
  return queuedTools.length;
}

/**
 * Check if any tools are queued for a specific run
 *
 * @param runId - Run ID to check
 * @returns true if there are queued tools
 */
export function useHasQueuedTools(runId: string | undefined): boolean {
  return useQueuedToolsCount(runId) > 0;
}

/**
 * Get the next tool in queue for a specific run
 *
 * @param runId - Run ID to check
 * @returns Next queued tool or undefined if queue is empty
 */
export function useNextQueuedTool(runId: string | undefined): QueuedTool | undefined {
  const queuedTools = useQueuedTools(runId);
  if (queuedTools.length === 0) return undefined;
  return queuedTools.reduce((min, tool) => (tool.queuePosition < min.queuePosition ? tool : min), queuedTools[0]);
}
