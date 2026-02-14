/**
 * useChatAreaState Hook
 * 
 * Centralized state management hook for ChatArea component.
 * Extracts complex state logic for better separation of concerns,
 * improved testability, and reduced re-renders.
 * 
 * Features:
 * - Branch state management
 * - Run collapse state tracking
 * - Message grouping with stable references
 * - Optimized scroll state coordination
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import type { ChatMessage, ConversationBranch, AgentSessionState } from '../../../../shared/types';

/**
 * Group messages by run to display them as cohesive tasks
 * Memoized for performance - only recalculates when messages change
 */
export function groupMessagesByRun(messages: ChatMessage[]) {
  const groups: {
    runId?: string;
    messages: ChatMessage[];
  }[] = [];

  let currentGroup: { runId?: string; messages: ChatMessage[] } = { runId: undefined, messages: [] };

  for (const msg of messages) {
    const msgRunId = msg.runId;

    if (msgRunId !== currentGroup.runId && currentGroup.messages.length > 0) {
      groups.push(currentGroup);
      currentGroup = { runId: msgRunId, messages: [] };
    }

    currentGroup.runId = msgRunId;
    currentGroup.messages.push(msg);
  }

  if (currentGroup.messages.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

export interface UseChatAreaStateOptions {
  activeSession: AgentSessionState | undefined;
}

export interface BranchState {
  activeBranchId: string | null;
  branches: ConversationBranch[];
  setActiveBranchId: (id: string | null) => void;
  setBranches: React.Dispatch<React.SetStateAction<ConversationBranch[]>>;
}

export interface CollapseState {
  manuallyToggledRuns: Set<string>;
  toggleRunCollapse: (runKey: string) => void;
  expandAllRuns: () => void;
  collapseAllRuns: () => void;
  isRunCollapsed: (groupIdx: number, totalGroups: number, runKey: string) => boolean;
  allExpanded: boolean;
}

export interface ChatAreaStateResult {
  // Branch state
  branchState: BranchState;
  // Filtered messages based on active branch
  branchFilteredMessages: ChatMessage[];
  // Grouped messages for rendering
  messageGroups: ReturnType<typeof groupMessagesByRun>;
  // Collapse state management
  collapseState: CollapseState;
  // Streaming state
  isStreaming: boolean;
  // Last assistant content length (for scroll dependency)
  lastAssistantContentLength: number;
}

/**
 * Custom hook for ChatArea state management
 * Consolidates branch, collapse, and streaming state logic
 */
export function useChatAreaState({ activeSession }: UseChatAreaStateOptions): ChatAreaStateResult {
  // Branch state
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [branches, setBranches] = useState<ConversationBranch[]>([]);

  // Collapsed runs state - tracks which runs are manually expanded/collapsed
  // By default, older runs are collapsed, latest is expanded
  const [manuallyToggledRuns, setManuallyToggledRuns] = useState<Set<string>>(new Set());

  // Initialize branches from session (only update if actually changed)
  useEffect(() => {
    const newBranches = activeSession?.branches ?? [];
    setBranches(prev => {
      if (prev.length === newBranches.length && prev.every((b, i) => b.id === newBranches[i]?.id)) {
        return prev;
      }
      return newBranches;
    });
    setActiveBranchId(prev => {
      const newId = activeSession?.activeBranchId ?? null;
      return prev === newId ? prev : newId;
    });
  }, [activeSession?.id, activeSession?.branches, activeSession?.activeBranchId]);

  // Reset manually toggled runs when session changes
  useEffect(() => {
    setManuallyToggledRuns(new Set());
  }, [activeSession?.id]);

  // Streaming state
  const isStreaming = activeSession?.status === 'running';

  // Filter messages by active branch
  const branchFilteredMessages = useMemo(() => {
    const messages = activeSession?.messages || [];
    if (!activeBranchId) {
      // Main branch: show messages without branchId or with main branchId
      return messages.filter(m => !m.branchId);
    }
    // Show messages for this branch + messages before the fork point
    const branch = branches.find(b => b.id === activeBranchId);
    if (!branch) return messages;

    // Get the fork point index
    const forkPointIdx = messages.findIndex(m => m.id === branch.forkPointMessageId);
    if (forkPointIdx === -1) return messages;

    // Messages before fork + messages in this branch
    const beforeFork = messages.slice(0, forkPointIdx + 1).filter(m => !m.branchId);
    const inBranch = messages.filter(m => m.branchId === activeBranchId);
    return [...beforeFork, ...inBranch];
  }, [activeSession?.messages, activeBranchId, branches]);

  // Group messages by run
  const messageGroups = useMemo(() => {
    return groupMessagesByRun(branchFilteredMessages);
  }, [branchFilteredMessages]);

  // Get the last assistant message content length for scroll dependency
  const lastAssistantContentLength = useMemo(() => {
    if (!activeSession?.messages) return 0;
    // Backward loop avoids copying the entire messages array with .reverse()
    const msgs = activeSession.messages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant') return msgs[i].content?.length ?? 0;
    }
    return 0;
  }, [activeSession?.messages]);

  // Toggle run collapse state
  const toggleRunCollapse = useCallback((runKey: string) => {
    setManuallyToggledRuns(prev => {
      const next = new Set(prev);
      if (next.has(runKey)) {
        next.delete(runKey);
      } else {
        next.add(runKey);
      }
      return next;
    });
  }, []);

  // Expand all runs
  const expandAllRuns = useCallback(() => {
    const toToggle = new Set<string>();
    messageGroups.forEach((group, idx) => {
      const runKey = group.runId ?? `group-${idx}`;
      const isLastGroup = idx === messageGroups.length - 1;
      if (!isLastGroup) {
        toToggle.add(runKey);
      }
    });
    setManuallyToggledRuns(toToggle);
  }, [messageGroups]);

  // Collapse all runs
  const collapseAllRuns = useCallback(() => {
    const toToggle = new Set<string>();
    if (messageGroups.length > 0) {
      const lastGroup = messageGroups[messageGroups.length - 1];
      const runKey = lastGroup.runId ?? `group-${messageGroups.length - 1}`;
      toToggle.add(runKey); // Toggle last to collapse it
    }
    setManuallyToggledRuns(toToggle);
  }, [messageGroups]);

  // Check if all runs are expanded
  const allExpanded = useMemo(() => {
    if (messageGroups.length <= 1) return true;
    return messageGroups.every((group, idx) => {
      const runKey = group.runId ?? `group-${idx}`;
      const isLastGroup = idx === messageGroups.length - 1;
      const defaultCollapsed = !isLastGroup;
      const isManuallyToggled = manuallyToggledRuns.has(runKey);
      const isCollapsed = isManuallyToggled ? !defaultCollapsed : defaultCollapsed;
      return !isCollapsed;
    });
  }, [messageGroups, manuallyToggledRuns]);

  // Check if a run should be collapsed
  const isRunCollapsed = useCallback((groupIdx: number, totalGroups: number, runKey: string) => {
    const isLastGroup = groupIdx === totalGroups - 1;
    const defaultCollapsed = !isLastGroup;
    const isManuallyToggled = manuallyToggledRuns.has(runKey);
    return isManuallyToggled ? !defaultCollapsed : defaultCollapsed;
  }, [manuallyToggledRuns]);

  return {
    branchState: {
      activeBranchId,
      branches,
      setActiveBranchId,
      setBranches,
    },
    branchFilteredMessages,
    messageGroups,
    collapseState: {
      manuallyToggledRuns,
      toggleRunCollapse,
      expandAllRuns,
      collapseAllRuns,
      isRunCollapsed,
      allExpanded,
    },
    isStreaming,
    lastAssistantContentLength,
  };
}

/**
 * Hook for managing search-related run expansion
 * Automatically expands runs that contain search matches
 */
export function useSearchRunExpansion(
  isSearchActive: boolean,
  matchingMessageIds: Set<string>,
  messageGroups: ReturnType<typeof groupMessagesByRun>,
  setManuallyToggledRuns: React.Dispatch<React.SetStateAction<Set<string>>>
) {
  useEffect(() => {
    if (!isSearchActive || matchingMessageIds.size === 0) return;

    // Find which runs contain matching messages and expand them
    const runsToExpand = new Set<string>();
    messageGroups.forEach((group, idx) => {
      const runKey = group.runId ?? `group-${idx}`;
      const hasMatch = group.messages.some(m => matchingMessageIds.has(m.id));
      if (hasMatch) {
        runsToExpand.add(runKey);
      }
    });

    // Expand runs with matches
    if (runsToExpand.size > 0) {
      setManuallyToggledRuns(prev => {
        const next = new Set(prev);
        messageGroups.forEach((group, idx) => {
          const runKey = group.runId ?? `group-${idx}`;
          const isLastGroup = idx === messageGroups.length - 1;
          const defaultCollapsed = !isLastGroup;

          if (runsToExpand.has(runKey) && defaultCollapsed && !next.has(runKey)) {
            next.add(runKey); // Toggle to expand
          }
        });
        return next;
      });
    }
  }, [isSearchActive, matchingMessageIds, messageGroups, setManuallyToggledRuns]);
}
