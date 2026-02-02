/**
 * Chat Area - Terminal-style message display
 * 
 * Minimalist design showing:
 * - User prompts with timestamp
 * - AI responses with real-time streaming
 * - Tool executions with status and output
 * - Error handling and recovery
 * - Branch navigation for conversation alternatives
 * - Todo progress tracking for complex tasks
 * 
 * All content is rendered inline without unnecessary cards or modals.
 */
import React, { useMemo, useRef, useEffect, useCallback, useState, useDeferredValue } from 'react';
import { ChevronsUpDown, ArrowDown } from 'lucide-react';
import { useAgentActions, useAgentSelector } from '../../state/AgentProvider';
import { useChatScroll } from '../../hooks/useChatScroll';
import { useConversationSearch } from '../../hooks/useConversationSearch';
import { useHotkey } from '../../hooks/useKeyboard';
// Virtualization hooks for performance optimization with large chat histories
import { useVirtualizedList } from '../../hooks/useVirtualizedList';
import { useRenderProfiler } from '../../utils/profiler';
import { cn } from '../../utils/cn';
import { createLogger } from '../../utils/logger';
import { EmptyState } from './components/EmptyState';
import { SessionWelcome } from './components/SessionWelcome';
import { ToolConfirmationPanel } from './components/ToolConfirmationPanel';
import { BranchNavigation } from './components/BranchNavigation';
import { ConversationSearchBar } from './components/ConversationSearchBar';
import { MessageGroup } from './components/MessageGroup';
import type { ChatMessage as ChatMessageType, ToolResultEvent, ConversationBranch } from '../../../shared/types';

/** Message reaction type */
type MessageReaction = 'up' | 'down' | null;

const logger = createLogger('ChatArea');

/**
 * Group messages by run to display them as cohesive tasks
 */
function groupMessagesByRun(messages: ChatMessageType[]) {
  const groups: {
    runId?: string;
    messages: ChatMessageType[];
  }[] = [];

  let currentGroup: { runId?: string; messages: ChatMessageType[] } = { runId: undefined, messages: [] };

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

export const ChatArea: React.FC = () => {
  useRenderProfiler('ChatArea');

  const actions = useAgentActions();
  
  // PERFORMANCE OPTIMIZATION: Use stable selectors with efficient equality checks
  // Only extract the fields we actually need to minimize re-renders
  const activeSessionId = useAgentSelector(
    (state) => state.activeSessionId
  );
  
  // PERF: Memoize session selector with shallow equality on essential fields only
  const activeSession = useAgentSelector(
    (state) => {
      if (!state.activeSessionId) return undefined;
      return state.sessions.find((session) => session.id === state.activeSessionId);
    },
    (a, b) => {
      if (a === b) return true;
      if (!a || !b) return a === b;
      // Fast path: compare identity fields first
      if (a.id !== b.id || a.status !== b.status || a.activeBranchId !== b.activeBranchId) return false;
      // Messages: only check length and last message essentials
      const aLen = a.messages.length, bLen = b.messages.length;
      if (aLen !== bLen) return false;
      if (aLen > 0) {
        const lastA = a.messages[aLen - 1], lastB = b.messages[bLen - 1];
        if (lastA.id !== lastB.id) return false;
        // Only check content length for streaming updates
        const aContentLen = lastA.content?.length ?? 0, bContentLen = lastB.content?.length ?? 0;
        if (aContentLen !== bContentLen) return false;
      }
      // Branches: only check length (detailed comparison not needed for render)
      return (a.branches?.length ?? 0) === (b.branches?.length ?? 0);
    }
  );
  
  const routingDecision = useAgentSelector(
    (state) => (state.activeSessionId ? state.routingDecisions?.[state.activeSessionId] : undefined),
    (a, b) => {
      if (a === b) return true;
      if (!a || !b) return false;
      return a.selectedProvider === b.selectedProvider && 
             a.selectedModel === b.selectedModel &&
             a.taskType === b.taskType;
    }
  );
  
  // OPTIMIZATION: Tool results selector - only re-render when the specific session's results change
  const toolResultsByRun = useAgentSelector(
    (state) => state.toolResults,
    (a, b) => {
      if (a === b) return true;
      // Quick check: same number of runs
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      // Check if any run has different number of results
      for (const key of keysA) {
        if (!b[key]) return false;
        if (Object.keys(a[key]).length !== Object.keys(b[key]).length) return false;
      }
      return true;
    }
  );

  // Log session changes for debugging (only on session ID change)
  useEffect(() => {
    if (activeSessionId && process.env.NODE_ENV === 'development') {
      logger.debug('Active session changed', { sessionId: activeSessionId });
    }
  }, [activeSessionId]);

  // Branch state
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [branches, setBranches] = useState<ConversationBranch[]>([]);

  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false);

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

  // Conversation search - uses branch-filtered messages
  const {
    searchQuery,
    setSearchQuery,
    isSearchActive,
    matchingMessageIds,
    matchCount,
    currentMatchIndex,
    goToNextMatch,
    goToPrevMatch,
    currentMatchMessageId,
    clearSearch,
  } = useConversationSearch(branchFilteredMessages);

  // Close search when switching sessions
  useEffect(() => {
    setIsSearchOpen(false);
    clearSearch();
  }, [activeSession?.id, clearSearch]);

  // Keyboard shortcut to open search (Ctrl/Cmd+F)
  useHotkey('ctrl+f', () => {
    setIsSearchOpen(true);
  });

  // Handle closing search
  const handleCloseSearch = useCallback(() => {
    setIsSearchOpen(false);
    clearSearch();
  }, [clearSearch]);

  // Group messages by run - defined early so other effects can reference it
  const messageGroups = useMemo(() => {
    return groupMessagesByRun(branchFilteredMessages);
  }, [branchFilteredMessages]);

  // Determine if agent is currently streaming content (defined early for deferred rendering)
  const isStreaming = activeSession?.status === 'running';
  
  // PERFORMANCE OPTIMIZATION: Use deferred value for message groups during heavy streaming
  // This allows React to prioritize input responsiveness over rendering message updates
  // When the agent is actively streaming, message updates are deferred to avoid UI jank
  const deferredMessageGroups = useDeferredValue(messageGroups);
  
  // Use deferred groups for rendering to keep input responsive during streaming
  const renderGroups = isStreaming ? deferredMessageGroups : messageGroups;

  // Enable virtualization for large chat histories (100+ messages for better performance)
  const VIRTUALIZATION_THRESHOLD = 100;
  const shouldVirtualize = branchFilteredMessages.length > VIRTUALIZATION_THRESHOLD;
  // Get the last assistant message content length for scroll dependency
  // This is used for both virtualized and non-virtualized scroll modes
  const lastAssistantContentLength = useMemo(() => {
    if (!activeSession?.messages) return 0;
    const lastAssistant = [...activeSession.messages].reverse().find(m => m.role === 'assistant');
    return lastAssistant?.content?.length ?? 0;
  }, [activeSession?.messages]);

  // Virtualized list for performance with large histories
  // gap: 12 matches Tailwind's gap-3 (0.75rem = 12px) used in non-virtualized mode
  const {
    virtualItems,
    totalHeight,
    containerRef: virtualContainerRef,
    scrollToBottom: virtualScrollToBottom,
    isNearBottom,
    measureItem,
  } = useVirtualizedList({
    items: renderGroups,
    estimatedItemHeight: 150,
    overscan: 3,
    gap: 12, // Match gap-3 from non-virtualized mode
    autoScrollToBottom: true,
    getItemKey: (item, index) => item.runId ?? `group-${index}`,
    streamingMode: isStreaming,
    streamingDep: lastAssistantContentLength,
  });

  // Virtualization debug logging (dev only, on threshold change)
  useEffect(() => {
    if (shouldVirtualize && process.env.NODE_ENV === 'development') {
      logger.debug('Virtualization enabled', { messageCount: branchFilteredMessages.length });
    }
  }, [shouldVirtualize, branchFilteredMessages.length]);

  // Reset manually toggled runs when session changes
  useEffect(() => {
    setManuallyToggledRuns(new Set());
  }, [activeSession?.id]);

  // #7: Auto-expand runs containing search matches
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

    // Expand runs with matches (add to manually toggled if they would be collapsed by default)
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
  }, [isSearchActive, matchingMessageIds, messageGroups]);

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

  // #1: Expand/Collapse all runs
  const expandAllRuns = useCallback(() => {
    // Add all older runs to manually toggled (they default to collapsed)
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

  const collapseAllRuns = useCallback(() => {
    // Clear all manual toggles (returns to default: older collapsed, latest expanded)
    // Then add the last group to toggle it to collapsed
    const toToggle = new Set<string>();
    if (messageGroups.length > 0) {
      const lastGroup = messageGroups[messageGroups.length - 1];
      const runKey = lastGroup.runId ?? `group-${messageGroups.length - 1}`;
      toToggle.add(runKey); // Toggle last to collapse it
    }
    setManuallyToggledRuns(toToggle);
  }, [messageGroups]);

  // Check if all runs are expanded or collapsed
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
  // Default: older runs collapsed, latest expanded
  // If manually toggled, invert the default behavior
  const isRunCollapsed = useCallback((groupIdx: number, totalGroups: number, runKey: string) => {
    const isLastGroup = groupIdx === totalGroups - 1;
    const defaultCollapsed = !isLastGroup; // Older runs collapsed by default
    const isManuallyToggled = manuallyToggledRuns.has(runKey);
    return isManuallyToggled ? !defaultCollapsed : defaultCollapsed;
  }, [manuallyToggledRuns]);

  // Get routing decision for active session (stable memoization)
  const routingInfo = useMemo(() => {
    if (!routingDecision?.selectedProvider) return undefined;
    return {
      taskType: routingDecision.taskType,
      provider: routingDecision.selectedProvider,
      model: routingDecision.selectedModel,
      confidence: routingDecision.confidence,
      reason: routingDecision.reason,
      usedFallback: routingDecision.usedFallback,
      originalProvider: routingDecision.originalProvider,
    };
  }, [
    routingDecision?.taskType,
    routingDecision?.selectedProvider,
    routingDecision?.selectedModel,
    routingDecision?.confidence,
    routingDecision?.reason,
    routingDecision?.usedFallback,
    routingDecision?.originalProvider,
  ]);

  // Helper to get tool results for a specific runId (stable reference)
  const toolResultsByRunRef = useRef(toolResultsByRun);
  toolResultsByRunRef.current = toolResultsByRun;
  const activeSessionIdRef = useRef(activeSession?.id);
  activeSessionIdRef.current = activeSession?.id;
  
  const getToolResultsForRun = useCallback((runId: string | undefined): Map<string, ToolResultEvent> | undefined => {
    if (!runId || !activeSessionIdRef.current) return undefined;
    const runResults = toolResultsByRunRef.current[runId];
    if (!runResults) return undefined;

    // Convert to Map<callId, ToolResultEvent> format expected by ToolExecution
    const resultsMap = new Map<string, ToolResultEvent>();
    for (const [callId, resultState] of Object.entries(runResults)) {
      resultsMap.set(callId, {
        type: 'tool-result',
        sessionId: activeSessionIdRef.current,
        runId,
        timestamp: resultState.timestamp,
        result: {
          toolName: resultState.toolName,
          success: resultState.result.success,
          output: resultState.result.output,
          metadata: resultState.result.metadata,
        },
      });
    }
    return resultsMap;
  }, []);


  // Scroll hook for non-virtualized mode only
  // When virtualized, the useVirtualizedList handles scrolling
  const { scrollRef, forceScrollToBottom, isNearBottom: isNearBottomNonVirt } = useChatScroll(
    `${activeSession?.messages.length ?? 0}-${lastAssistantContentLength}`,
    {
      enabled: !shouldVirtualize, // Only active when NOT virtualized
      threshold: 200,
      streamingMode: isStreaming && !shouldVirtualize, // Only stream scroll when not virtualized
    }
  );

  // Unified isNearBottom for both virtualized and non-virtualized modes
  const showScrollToBottom = shouldVirtualize ? !isNearBottom : !isNearBottomNonVirt();

  // Handle scroll to bottom button click
  const handleScrollToBottom = useCallback(() => {
    if (shouldVirtualize) {
      virtualScrollToBottom('smooth');
    } else {
      forceScrollToBottom();
    }
  }, [shouldVirtualize, virtualScrollToBottom, forceScrollToBottom]);

  // Track last message to auto-scroll on new messages
  const lastMsgRef = useRef<string | null>(null);
  const lastMsgCountRef = useRef(0);
  const wasStreamingRef = useRef(false);
  const prevSessionIdRef = useRef<string | null>(null);

  // Scroll to bottom when session loads or changes
  useEffect(() => {
    if (!activeSession?.id) return;
    
    // Only scroll on session change (not on every render)
    if (prevSessionIdRef.current !== activeSession.id) {
      prevSessionIdRef.current = activeSession.id;
      
      // Wait for the container to be mounted and measured
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (shouldVirtualize) {
            virtualScrollToBottom('instant');
          } else {
            forceScrollToBottom();
          }
        });
      });
    }
  }, [activeSession?.id, shouldVirtualize, virtualScrollToBottom, forceScrollToBottom]);

  // Force scroll to bottom when streaming starts
  useEffect(() => {
    if (isStreaming && !wasStreamingRef.current) {
      // Streaming just started - force scroll to bottom
      requestAnimationFrame(() => {
        if (shouldVirtualize) {
          virtualScrollToBottom('instant');
        } else {
          forceScrollToBottom();
        }
      });
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming, shouldVirtualize, virtualScrollToBottom, forceScrollToBottom]);

  useEffect(() => {
    if (!activeSession?.messages) return;
    const msgCount = activeSession.messages.length;
    const lastMsg = activeSession.messages[msgCount - 1];

    // Force scroll when new message is added (not just content update)
    if (lastMsg && (lastMsg.id !== lastMsgRef.current || msgCount > lastMsgCountRef.current)) {
      lastMsgRef.current = lastMsg.id;
      lastMsgCountRef.current = msgCount;
      // Use virtualized scroll when virtualization is enabled
      if (shouldVirtualize) {
        virtualScrollToBottom();
      } else {
        forceScrollToBottom();
      }
    }
  }, [activeSession?.messages, forceScrollToBottom, virtualScrollToBottom, shouldVirtualize]);

  // Note: Continuous scroll during streaming is handled by the scroll hooks
  // useChatScroll handles non-virtualized mode
  // useVirtualizedList handles virtualized mode with streamingDep

  // Handle message edit - resends from that point
  const handleEditMessage = useCallback(async (messageId: string, newContent: string) => {
    if (!activeSession) return;

    // Find the message index
    const messageIndex = activeSession.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    // Use the editMessage API to truncate and resend
    const result = await window.vyotiq?.agent?.editMessage(
      activeSession.id,
      messageIndex,
      newContent
    );

    if (!result?.success) {
      logger.error('Failed to edit message', { error: result?.error, messageId });
    }
  }, [activeSession]);

  // Handle forking conversation from a message
  const handleForkMessage = useCallback(async (messageId: string) => {
    if (!activeSession) return;

    // Find the message
    const message = activeSession.messages.find(m => m.id === messageId);
    if (!message) return;

    // Use the API to create a branch
    const result = await window.vyotiq?.agent?.createBranch(
      activeSession.id,
      messageId
    );

    if (result?.success && result.branchId) {
      // Create a local branch object for UI
      const newBranch: ConversationBranch = {
        id: result.branchId,
        parentBranchId: activeBranchId,
        forkPointMessageId: messageId,
        name: `Branch from message`,
        createdAt: Date.now(),
      };
      setBranches(prev => [...prev, newBranch]);
      setActiveBranchId(newBranch.id);
    } else {
      logger.error('Failed to create branch', { error: result?.error, messageId });
    }
  }, [activeSession, activeBranchId]);

  // Handle switching branches
  const handleSwitchBranch = useCallback(async (branchId: string | null) => {
    if (!activeSession) return;

    const result = await window.vyotiq?.agent?.switchBranch(activeSession.id, branchId);
    if (result?.success) {
      setActiveBranchId(branchId);
    }
  }, [activeSession]);

  // Handle deleting a branch
  const handleDeleteBranch = useCallback(async (branchId: string) => {
    if (!activeSession) return;

    const result = await window.vyotiq?.agent?.deleteBranch(activeSession.id, branchId);
    if (result?.success) {
      setBranches(prev => prev.filter(b => b.id !== branchId));
      if (activeBranchId === branchId) {
        setActiveBranchId(null);
      }
    }
  }, [activeSession, activeBranchId]);

  const handleRunCode = useCallback(async (code: string, language: string) => {
    // Shell commands should be run through the agent's terminal tools, not directly
    // This is a UI-only action that shows the code - actual execution happens via agent
    if (['bash', 'sh', 'shell', 'zsh', 'cmd', 'powershell', 'ps1'].includes(language.toLowerCase())) {
      logger.info('Code block run requested - use agent to execute shell commands', { language, codeLength: code.length });
    }
  }, []);

  // Handle message reactions
  const handleReaction = useCallback((messageId: string, reaction: MessageReaction) => {
    if (activeSession) {
      actions.addReaction(activeSession.id, messageId, reaction);
    }
  }, [activeSession, actions]);

  // Handle regenerating the last assistant response
  const handleRegenerate = useCallback(async () => {
    if (!activeSession) return;
    try {
      await actions.regenerate(activeSession.id);
    } catch (err) {
      logger.error('Failed to regenerate response', { error: err, sessionId: activeSession.id });
    }
  }, [activeSession, actions]);

  // Handle inserting code into files with file picker
  const handleInsertCode = useCallback(async (code: string, language: string) => {
    // Get file extension based on language
    const getExtension = (lang: string): string => {
      const extensions: Record<string, string> = {
        javascript: 'js', typescript: 'ts', python: 'py', java: 'java',
        csharp: 'cs', cpp: 'cpp', c: 'c', go: 'go', rust: 'rs',
        ruby: 'rb', php: 'php', swift: 'swift', kotlin: 'kt',
        html: 'html', css: 'css', scss: 'scss', json: 'json',
        yaml: 'yaml', xml: 'xml', markdown: 'md', sql: 'sql',
        bash: 'sh', shell: 'sh', powershell: 'ps1',
      };
      return extensions[lang.toLowerCase()] ?? 'txt';
    };

    const extension = getExtension(language);

    try {
      const result = await window.vyotiq.files.saveAs(code, {
        title: 'Save Code',
        defaultPath: `code.${extension}`,
        filters: [
          { name: `${language.charAt(0).toUpperCase() + language.slice(1)} Files`, extensions: [extension] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.success && result.path) {
        logger.info('Code saved to file', { path: result.path, language });
      } else if (result.error !== 'Save cancelled') {
        // Fall back to clipboard if save failed (but not if user cancelled)
        await navigator.clipboard.writeText(code);
        logger.warn('File save failed, copied to clipboard', { error: result.error });
      }
    } catch (err) {
      // Fall back to clipboard on error
      await navigator.clipboard.writeText(code);
      logger.error('Error saving file, copied to clipboard', { error: err, language });
    }
  }, []);

  if (!activeSession) {
    return <EmptyState />;
  }

  const isRunning = activeSession.status === 'running';
  const hasMessages = activeSession.messages && activeSession.messages.length > 0;

  // Show welcome screen for empty sessions
  if (!hasMessages && !isRunning) {
    return (
      <div
        className={cn(
          "flex-1 min-h-0 overflow-y-auto overflow-x-hidden",
          "bg-[var(--color-surface-base)] transition-colors"
        )}
      >
        <SessionWelcome />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 min-w-0 w-full relative overflow-hidden flex flex-col">
      {/* Conversation Search Bar */}
      {isSearchOpen && (
        <ConversationSearchBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          matchCount={matchCount}
          currentMatchIndex={currentMatchIndex}
          isSearchActive={isSearchActive}
          onNextMatch={goToNextMatch}
          onPrevMatch={goToPrevMatch}
          onClose={handleCloseSearch}
        />
      )}

      {/* Main chat area */}
      <div className="flex-1 min-h-0 min-w-0 w-full relative overflow-hidden">
        {/* Branch navigation - show when there are branches */}
        {branches.length > 0 && (
          <div className="absolute top-2 right-4 z-20">
            <BranchNavigation
              branches={branches}
              activeBranchId={activeBranchId}
              onSwitchBranch={handleSwitchBranch}
              onDeleteBranch={handleDeleteBranch}
            />
          </div>
        )}



        {/* Bottom fade gradient - smooth edge transition */}
        <div
          className="absolute bottom-0 left-0 right-0 h-8 z-10 pointer-events-none"
          style={{
            background: 'linear-gradient(to top, var(--color-surface-base) 0%, transparent 100%)'
          }}
          aria-hidden="true"
        />

        {/* Scroll to bottom button - appears when scrolled away from bottom */}
        {showScrollToBottom && hasMessages && (
          <button
            onClick={handleScrollToBottom}
            className={cn(
              'absolute bottom-12 right-4 z-20',
              'flex items-center justify-center w-8 h-8 rounded-full',
              'bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]',
              'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
              'hover:bg-[var(--color-surface-3)] shadow-lg',
              'transition-all duration-200 ease-out',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]/50'
            )}
            title="Scroll to bottom"
            aria-label="Scroll to bottom"
          >
            <ArrowDown size={16} />
          </button>
        )}
        <div
          className={cn(
            "h-full w-full min-w-0 overflow-y-auto overflow-x-hidden",
            "scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent",
            "bg-[var(--color-surface-base)] transition-colors"
          )}
          ref={shouldVirtualize ? virtualContainerRef : scrollRef}
          role="log"
          aria-label="Chat conversation"
          aria-live="polite"
          aria-relevant="additions"
        >
          {/* Virtualized rendering for large histories */}
          {shouldVirtualize ? (
            <div className="w-full max-w-[1400px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 pt-4 sm:pt-5 md:pt-6 pb-8 sm:pb-10 min-w-0 overflow-hidden">
              {/* Expand/Collapse all - fixed at top when multiple runs */}
              {messageGroups.length > 1 && (
                <div className="flex justify-end pb-2">
                  <button
                    onClick={allExpanded ? collapseAllRuns : expandAllRuns}
                    className={cn(
                      'flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono',
                      'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
                      'bg-[var(--color-surface-base)]/90 backdrop-blur-sm rounded',
                      'transition-colors'
                    )}
                    title={allExpanded ? 'Collapse all runs' : 'Expand all runs'}
                  >
                    <ChevronsUpDown size={10} />
                    <span>{allExpanded ? 'collapse all' : 'expand all'}</span>
                  </button>
                </div>
              )}
              
              {/* Virtualized items container */}
              <div style={{ height: totalHeight, position: 'relative' }}>
                {/* Render only visible virtualized items */}
                {virtualItems.map((virtualItem) => {
                  const group = virtualItem.item;
                  const groupIdx = virtualItem.index;
                  const isLastGroup = groupIdx === renderGroups.length - 1;
                  const runKey = group.runId ?? `group-${groupIdx}`;
                  const collapsed = isRunCollapsed(groupIdx, renderGroups.length, runKey);

                  return (
                    <div
                      key={virtualItem.key}
                      className="min-w-0 overflow-hidden"
                      style={{
                        position: 'absolute',
                        top: virtualItem.offsetTop,
                        left: 0,
                      right: 0,
                    }}
                    ref={(el) => {
                      if (el) {
                        // Measure actual height for accurate virtualization
                        const height = el.getBoundingClientRect().height;
                        if (height > 0) {
                          measureItem(groupIdx, height);
                        }
                      }
                    }}
                  >
                    <MessageGroup
                      messages={group.messages}
                      runId={group.runId}
                      groupIdx={groupIdx}
                      totalGroups={renderGroups.length}
                      isLastGroup={isLastGroup}
                      isRunning={isRunning}
                      collapsed={collapsed}
                      onToggleCollapse={toggleRunCollapse}
                      toolResults={getToolResultsForRun(group.runId)}
                      sessionId={activeSession?.id}
                      matchingMessageIds={matchingMessageIds}
                      currentMatchMessageId={currentMatchMessageId}
                      routingInfo={routingInfo}
                      onEditMessage={handleEditMessage}
                      onForkMessage={handleForkMessage}
                      onRunCode={handleRunCode}
                      onInsertCode={handleInsertCode}
                      onReaction={handleReaction}
                      onRegenerate={isLastGroup ? handleRegenerate : undefined}
                    />
                  </div>
                );
              })}
              </div>

              {/* Tool confirmation panel - shows when awaiting approval */}
              <ToolConfirmationPanel />
            </div>
          ) : (
            /* Standard rendering for smaller histories */
            <div className="w-full max-w-[1400px] mx-auto flex flex-col gap-3 px-3 sm:px-4 md:px-6 lg:px-8 pt-4 sm:pt-5 md:pt-6 pb-8 sm:pb-10 min-w-0 overflow-hidden">
              {/* Expand/Collapse all - inline at top when multiple runs */}
              {messageGroups.length > 1 && (
                <div className="flex justify-end">
                  <button
                    onClick={allExpanded ? collapseAllRuns : expandAllRuns}
                    className={cn(
                      'flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono',
                      'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
                      'transition-colors'
                    )}
                    title={allExpanded ? 'Collapse all runs' : 'Expand all runs'}
                  >
                    <ChevronsUpDown size={10} />
                    <span>{allExpanded ? 'collapse all' : 'expand all'}</span>
                  </button>
                </div>
              )}

              {renderGroups.map((group, groupIdx) => {
                const isLastGroup = groupIdx === renderGroups.length - 1;
                const runKey = group.runId ?? `group-${groupIdx}`;
                const collapsed = isRunCollapsed(groupIdx, renderGroups.length, runKey);

                return (
                  <MessageGroup
                    key={`group-${groupIdx}`}
                    messages={group.messages}
                    runId={group.runId}
                    groupIdx={groupIdx}
                    totalGroups={renderGroups.length}
                    isLastGroup={isLastGroup}
                    isRunning={isRunning}
                    collapsed={collapsed}
                    onToggleCollapse={toggleRunCollapse}
                    toolResults={getToolResultsForRun(group.runId)}
                    sessionId={activeSession?.id}
                    matchingMessageIds={matchingMessageIds}
                    currentMatchMessageId={currentMatchMessageId}
                    routingInfo={routingInfo}
                    onEditMessage={handleEditMessage}
                    onForkMessage={handleForkMessage}
                    onRunCode={handleRunCode}
                    onInsertCode={handleInsertCode}
                    onReaction={handleReaction}
                    onRegenerate={isLastGroup ? handleRegenerate : undefined}
                  />
                );
              })}

              {/* Tool confirmation panel - shows when awaiting approval */}
              <ToolConfirmationPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
