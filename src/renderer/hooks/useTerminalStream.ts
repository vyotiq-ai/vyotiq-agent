/**
 * Terminal Stream Hook
 * 
 * Provides access to real-time terminal output streaming state.
 * Used by components that need to display live terminal output.
 */
import { useMemo } from 'react';
import { useAgentSelector } from '../state/AgentProvider';
import type { TerminalStreamState } from '../state/agentReducer';

/**
 * Get terminal stream state for a specific PID
 * 
 * @param pid - Process ID to get stream for
 * @returns Terminal stream state or undefined if not found
 */
export function useTerminalStream(pid: number | undefined): TerminalStreamState | undefined {
  const selector = useMemo(
    () =>
      (state: { terminalStreams: Record<number, TerminalStreamState> }) => {
        if (pid === undefined) return undefined;
        return state.terminalStreams[pid];
      },
    [pid],
  );

  return useAgentSelector(
    selector,
    (a, b) => a === b,
  );
}

/**
 * Get all active terminal streams
 * 
 * @returns Map of PID to terminal stream state
 */
export function useAllTerminalStreams(): Record<number, TerminalStreamState> {
  const selector = useMemo(
    () => (state: { terminalStreams: Record<number, TerminalStreamState> }) => state.terminalStreams,
    [],
  );

  return useAgentSelector(
    selector,
    (a, b) => a === b,
  );
}

/**
 * Check if a terminal process is currently running
 * 
 * @param pid - Process ID to check
 * @returns true if the process is running
 */
export function useIsTerminalRunning(pid: number | undefined): boolean {
  const stream = useTerminalStream(pid);
  return stream?.isRunning ?? false;
}

/**
 * Get terminal output for a specific PID
 * 
 * @param pid - Process ID to get output for
 * @returns Terminal output string or empty string if not found
 */
export function useTerminalOutput(pid: number | undefined): string {
  const stream = useTerminalStream(pid);
  return stream?.output ?? '';
}
