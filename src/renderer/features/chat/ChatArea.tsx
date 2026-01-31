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
import { ChevronsUpDown } from 'lucide-react';
import { useAgentActions, useAgentSelector } from '../../state/AgentProvider';
import { useChatScroll } from '../../hooks/useChatScroll';
import { useConversationSearch } from '../../hooks/useConversationSearch';
import { useHotkey } from '../../hooks/useKeyboard';
import { useTodos } from '../../hooks/useTodos';
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
import { TodoProgress } from './components/TodoProgress';
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
  
  const activeSession = useAgentSelector(
    (state) => {
      if (!state.activeSessionId) return undefined;
      return state.sessions.find((session) => session.id === state.activeSessionId);
    },
    (a, b) => {
      if (a === b) return true;
      if (!a || !b) return false;
      // OPTIMIZATION: Compare by value, not reference for arrays
      // Only re-render when essential fields change
      if (a.id !== b.id) return false;
      if (a.status !== b.status) return false;
      if (a.activeBranchId !== b.activeBranchId) return false;
      // For messages, compare length and last message id/content length
      if (a.messages.length !== b.messages.length) return false;
      const lastA = a.messages[a.messages.length - 1];
      const lastB = b.messages[b.messages.length - 1];
      if (lastA && lastB) {
        if (lastA.id !== lastB.id) return false;
        if ((lastA.content?.length ?? 0) !== (lastB.content?.length ?? 0)) return false;
        if ((lastA.toolCalls?.length ?? 0) !== (lastB.toolCalls?.length ?? 0)) return false;
      }
      // Branches comparison
      if (a.branches?.length !== b.branches?.length) return false;
      return true;
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
  
  // Agent status and workspace context for UI display
  const agentStatus = useAgentSelector((state) => (state.activeSessionId ? state.agentStatus[state.activeSessionId] : undefined));
  const activeWorkspacePath = useAgentSelector((state) => state.workspaces.find((w) => w.isActive)?.path);

  // Log session changes for debugging
  useEffect(() => {
    if (activeSessionId) {
      logger.debug('Active session changed', { 
        sessionId: activeSessionId,
        workspacePath: activeWorkspacePath,
        status: agentStatus 
      });
    }
  }, [activeSessionId, activeWorkspacePath, agentStatus]);

  // Todo state for the active session
  const { todos, hasTodos } = useTodos({ sessionId: activeSession?.id ?? null });

  // Branch state
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [branches, setBranches] = useState<ConversationBranch[]>([]);

  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Collapsed runs state - tracks which runs are manually expanded/collapsed
  // By default, older runs are collapsed, latest is expanded
  const [manuallyToggledRuns, setManuallyToggledRuns] = useState<Set<string>>(new Set());

  // Initialize branches from session
  useEffect(() => {
    if (activeSession?.branches) {
      setBranches(activeSession.branches);
    } else {
      setBranches(activeSession?.branches ?? []);
    }
    setActiveBranchId(activeSession?.activeBranchId ?? null);
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
  
  // Virtualized list for performance with large histories
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
    autoScrollToBottom: true,
    getItemKey: (item, index) => item.runId ?? `group-${index}`,
  });

  // Log virtualization state for debugging
  useEffect(() => {
    if (shouldVirtualize) {
      logger.debug('Virtualization enabled', { 
        messageCount: branchFilteredMessages.length,
        groupCount: renderGroups.length,
        isNearBottom
      });
    }
  }, [shouldVirtualize, branchFilteredMessages.length, renderGroups.length, isNearBottom]);

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

  // Get routing decision for active session (if task routing is enabled)
  const routingInfo = useMemo(() => {
    const decision = routingDecision;
    if (!decision?.selectedProvider) return undefined;
    return {
      taskType: decision.taskType,
      provider: decision.selectedProvider,
      model: decision.selectedModel,
      confidence: decision.confidence,
      reason: decision.reason,
      usedFallback: decision.usedFallback,
      originalProvider: decision.originalProvider,
    };
  }, [routingDecision]);

  // Helper to get tool results for a specific runId
  const getToolResultsForRun = useCallback((runId: string | undefined): Map<string, ToolResultEvent> | undefined => {
    if (!runId || !activeSession) return undefined;
    const runResults = toolResultsByRun[runId];
    if (!runResults) {
      return undefined;
    }

    // Convert to Map<callId, ToolResultEvent> format expected by ToolExecution
    const resultsMap = new Map<string, ToolResultEvent>();
    for (const [callId, resultState] of Object.entries(runResults)) {
      resultsMap.set(callId, {
        type: 'tool-result',
        sessionId: activeSession.id,
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
  }, [activeSession, toolResultsByRun]);


  // Get the last assistant message content length for scroll dependency
  const lastAssistantContentLength = useMemo(() => {
    if (!activeSession?.messages) return 0;
    const lastAssistant = [...activeSession.messages].reverse().find(m => m.role === 'assistant');
    return lastAssistant?.content?.length ?? 0;
  }, [activeSession?.messages]);

  // Scroll hook with streaming mode for smooth auto-focus
  const { scrollRef, forceScrollToBottom } = useChatScroll(
    `${activeSession?.messages.length ?? 0}-${lastAssistantContentLength}`,
    {
      enabled: true,
      threshold: 200,
      streamingMode: isStreaming,
    }
  );

  // Track last message to auto-scroll on new messages
  const lastMsgRef = useRef<string | null>(null);
  const lastMsgCountRef = useRef(0);

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
    <div className="flex-1 min-h-0 relative overflow-hidden flex flex-col">
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
      <div className="flex-1 min-h-0 relative">
        {/* Workspace context indicator - shows current workspace */}
        {activeWorkspacePath && (
          <div className="absolute top-2 left-4 z-20">
            <div className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-md',
              'bg-[var(--color-surface-2)]/80 backdrop-blur-sm',
              'text-[10px] font-mono text-[var(--color-text-muted)]',
              'border border-[var(--color-border-subtle)]/30'
            )}>
              <span className={cn(
                'w-1.5 h-1.5 rounded-full',
                agentStatus?.status === 'executing' || agentStatus?.status === 'analyzing' || agentStatus?.status === 'reasoning'
                  ? 'bg-[var(--color-warning)] animate-pulse' :
                agentStatus?.status === 'error' ? 'bg-[var(--color-error)]' :
                agentStatus?.status === 'completed' ? 'bg-[var(--color-success)]' :
                'bg-[var(--color-text-dim)]'
              )} />
              <span className="truncate max-w-[200px]" title={activeWorkspacePath}>
                {activeWorkspacePath.split(/[\\/]/).pop()}
              </span>
              {shouldVirtualize && (
                <span className="text-[var(--color-text-dim)] ml-1">
                  ({branchFilteredMessages.length} msgs)
                </span>
              )}
            </div>
          </div>
        )}

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
        <div
          className={cn(
            "h-full overflow-y-auto overflow-x-hidden",
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
            <div 
              className="w-full max-w-[1400px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 pt-4 sm:pt-5 md:pt-6 pb-8 sm:pb-10"
              style={{ height: totalHeight, position: 'relative' }}
            >
              {/* Expand/Collapse all - inline at top when multiple runs */}
              {messageGroups.length > 1 && (
                <div className="flex justify-end sticky top-0 z-10 pb-2">
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
                    />
                  </div>
                );
              })}

              {/* Todo progress - shows when agent has created a task list */}
              {hasTodos && activeSession && (
                <div style={{ position: 'absolute', top: totalHeight - 50, left: 0, right: 0 }}>
                  <TodoProgress
                    todos={todos}
                    sessionId={activeSession.id}
                    className="mt-2"
                  />
                </div>
              )}

              {/* Tool confirmation panel - shows when awaiting approval */}
              <ToolConfirmationPanel />
            </div>
          ) : (
            /* Standard rendering for smaller histories */
            <div className="w-full max-w-[1400px] mx-auto flex flex-col gap-3 px-3 sm:px-4 md:px-6 lg:px-8 pt-4 sm:pt-5 md:pt-6 pb-8 sm:pb-10">
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
                  />
                );
              })}

              {/* Todo progress - shows when agent has created a task list */}
              {hasTodos && activeSession && (
                <TodoProgress
                  todos={todos}
                  sessionId={activeSession.id}
                  className="mt-2"
                />
              )}

              {/* Tool confirmation panel - shows when awaiting approval */}
              <ToolConfirmationPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
