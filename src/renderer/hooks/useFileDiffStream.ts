/**
 * useFileDiffStream Hook
 *
 * Provides real-time file diff stream data for tool calls.
 * Reads from the global agent state where FILE_DIFF_STREAM actions
 * are dispatched by the AgentProvider when file-diff-stream events arrive.
 *
 * Usage:
 *   const diffStream = useFileDiffStream(runId, toolCallId);
 *   if (diffStream) {
 *     <DiffViewer ... isStreaming={!diffStream.isComplete} />
 *   }
 */
import { useMemo, useRef } from 'react';
import { useAgentSelector } from '../state/AgentProvider';
import type { FileDiffStreamState } from '../state/types';

/** Stable empty array to avoid re-renders when no diffs exist */
const EMPTY_ARRAY: FileDiffStreamState[] = [];

/**
 * Get streaming diff data for a specific tool call.
 * Returns null if no streaming diff is available.
 */
export function useFileDiffStream(
  runId: string | undefined,
  toolCallId: string | undefined,
): FileDiffStreamState | null {
  return useAgentSelector(
    (state) => {
      if (!runId || !toolCallId) return null;
      return state.fileDiffStreams[runId]?.[toolCallId] ?? null;
    },
  );
}

/**
 * Get all active (incomplete) streaming diffs for a run.
 * Uses referential stability — returns the same array reference when content hasn't changed.
 */
export function useActiveFileDiffStreams(
  runId: string | undefined,
): FileDiffStreamState[] {
  const prevRef = useRef<FileDiffStreamState[]>(EMPTY_ARRAY);

  const result = useAgentSelector(
    (state) => {
      if (!runId) return EMPTY_ARRAY;
      const runDiffs = state.fileDiffStreams[runId];
      if (!runDiffs) return EMPTY_ARRAY;
      return Object.values(runDiffs).filter(d => !d.isComplete);
    },
  );

  // Referential stability: only update if content actually changed
  return useMemo(() => {
    if (result === EMPTY_ARRAY) {
      prevRef.current = EMPTY_ARRAY;
      return EMPTY_ARRAY;
    }
    const prev = prevRef.current;
    if (
      prev.length === result.length &&
      prev.every((d, i) => d.toolCallId === result[i].toolCallId && d.updatedAt === result[i].updatedAt)
    ) {
      return prev;
    }
    prevRef.current = result;
    return result;
  }, [result]);
}

/**
 * Get all streaming diffs (active and complete) for a run.
 * Uses referential stability — returns the same array reference when content hasn't changed.
 */
export function useAllFileDiffStreams(
  runId: string | undefined,
): FileDiffStreamState[] {
  const prevRef = useRef<FileDiffStreamState[]>(EMPTY_ARRAY);

  const result = useAgentSelector(
    (state) => {
      if (!runId) return EMPTY_ARRAY;
      const runDiffs = state.fileDiffStreams[runId];
      if (!runDiffs) return EMPTY_ARRAY;
      return Object.values(runDiffs).sort((a, b) => a.startedAt - b.startedAt);
    },
  );

  // Referential stability: only update if content actually changed
  return useMemo(() => {
    if (result === EMPTY_ARRAY) {
      prevRef.current = EMPTY_ARRAY;
      return EMPTY_ARRAY;
    }
    const prev = prevRef.current;
    if (
      prev.length === result.length &&
      prev.every((d, i) => d.toolCallId === result[i].toolCallId && d.updatedAt === result[i].updatedAt)
    ) {
      return prev;
    }
    prevRef.current = result;
    return result;
  }, [result]);
}

/**
 * Check if a specific tool call has a streaming diff available.
 */
export function useHasFileDiffStream(
  runId: string | undefined,
  toolCallId: string | undefined,
): boolean {
  return useAgentSelector(
    (state) => {
      if (!runId || !toolCallId) return false;
      return !!state.fileDiffStreams[runId]?.[toolCallId];
    },
  );
}
