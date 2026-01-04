/**
 * Chat Area - Terminal-style message display
 * 
 * Minimalist design showing:
 * - User prompts with timestamp
 * - AI responses with real-time streaming
 * - Tool executions with status and output
 * - Error handling and recovery
 * - Branch navigation for conversation alternatives
 * 
 * All content is rendered inline without unnecessary cards or modals.
 */
import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { useAgentActions, useAgentSelector } from '../../state/AgentProvider';
import { useChatScroll } from '../../hooks/useChatScroll';
import { useConversationSearch } from '../../hooks/useConversationSearch';
import { useHotkey } from '../../hooks/useKeyboard';
import { useRenderProfiler } from '../../utils/profiler';
import { cn } from '../../utils/cn';
import { createLogger } from '../../utils/logger';
import { MessageLine } from './components/MessageLine';
import { ToolExecution } from './components/ToolExecution';
import { EmptyState } from './components/EmptyState';
import { SessionWelcome } from './components/SessionWelcome';
import { ToolConfirmationPanel } from './components/ToolConfirmationPanel';
import { BranchNavigation } from './components/BranchNavigation';
import { RunGroupHeader } from './components/RunGroupHeader';
import { ConversationSearchBar } from './components/ConversationSearchBar';
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
  const activeSession = useAgentSelector((state) => state.sessions.find((session) => session.id === state.activeSessionId));
  const routingDecision = useAgentSelector((state) => (state.activeSessionId ? state.routingDecisions?.[state.activeSessionId] : undefined));
  const toolResultsByRun = useAgentSelector((state) => state.toolResults);
  const _agentStatus = useAgentSelector((state) => (state.activeSessionId ? state.agentStatus[state.activeSessionId] : undefined));
  const _activeWorkspacePath = useAgentSelector((state) => state.workspaces.find((w) => w.isActive)?.path);

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


  const { scrollRef, forceScrollToBottom } = useChatScroll(
    activeSession?.messages.length ?? 0,
    { enabled: true, threshold: 200 }
  );

  // Track last message to auto-scroll
  const lastMsgRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeSession?.messages) return;
    const lastMsg = activeSession.messages[activeSession.messages.length - 1];
    if (lastMsg && lastMsg.id !== lastMsgRef.current) {
      lastMsgRef.current = lastMsg.id;
      forceScrollToBottom();
    }
  }, [activeSession, forceScrollToBottom]);

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
        className="absolute bottom-0 left-0 right-0 h-10 z-10 pointer-events-none"
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
        ref={scrollRef}
        role="log"
        aria-label="Chat conversation"
        aria-live="polite"
        aria-relevant="additions"
      >
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

        {messageGroups.map((group, groupIdx) => {
          const isLastGroup = groupIdx === messageGroups.length - 1;
          const isGroupRunning = isLastGroup && isRunning;
          const runKey = group.runId ?? `group-${groupIdx}`;
          const collapsed = isRunCollapsed(groupIdx, messageGroups.length, runKey);


          // Pre-compute which assistant messages have tool calls for inline rendering
          const assistantMessagesWithTools = new Set(
            group.messages
              .filter(m => m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0)
              .map(m => m.id)
          );

          // Get tool messages that correspond to each assistant message's tool calls
          const getToolMessagesForAssistant = (assistantMsg: ChatMessageType) => {
            if (!assistantMsg.toolCalls) return [];
            const toolCallIds = new Set(assistantMsg.toolCalls.map(tc => tc.callId).filter(Boolean));
            return group.messages.filter(
              m => m.role === 'tool' && m.toolCallId && toolCallIds.has(m.toolCallId)
            );
          };

          return (
            <div
              key={`group-${groupIdx}`}
              className={cn(
                'rounded-lg overflow-hidden transition-all duration-150',
                isGroupRunning
                  ? 'border border-[var(--color-warning)]/20 shadow-sm shadow-[var(--color-warning)]/5'
                  : 'border border-[var(--color-border-subtle)]/60',
                'bg-[var(--color-surface-1)]/10'
              )}
            >
              {/* Clickable header to toggle collapse */}
              <button
                type="button"
                onClick={() => toggleRunCollapse(runKey)}
                className={cn(
                  "w-full text-left transition-colors",
                  "hover:bg-[var(--color-surface-2)]/20",
                  "focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-accent-primary)]/30"
                )}
              >
                <div className="flex items-center">
                  <div className={cn(
                    "flex items-center justify-center w-7 flex-shrink-0 self-stretch",
                    "border-r border-[var(--color-border-subtle)]/30"
                  )}>
                    {collapsed ? (
                      <ChevronRight size={12} className="text-[var(--color-text-dim)] transition-transform" />
                    ) : (
                      <ChevronDown size={12} className="text-[var(--color-text-dim)] transition-transform" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <RunGroupHeader
                      runId={group.runId}
                      messages={group.messages}
                      toolResults={getToolResultsForRun(group.runId)}
                      isRunning={isGroupRunning}
                    />
                  </div>
                </div>
              </button>

              {/* Collapsible content */}
              {!collapsed && (
                <div className="px-3 sm:px-4 py-2 sm:py-3 space-y-1 border-t border-[var(--color-border-subtle)]/20">
                {group.messages.map((message, msgIdx) => {
                  const isLastMsg = msgIdx === group.messages.length - 1 && isLastGroup;
                  const isStreaming = isLastMsg && message.role === 'assistant' && isRunning;
                  const isMessageSearchMatch = matchingMessageIds.has(message.id);
                  const isCurrentMatch = currentMatchMessageId === message.id;

                  if (message.role === 'user') {
                    return (
                      <MessageLine
                        key={message.id}
                        message={message}
                        type="user"
                        onEdit={handleEditMessage}
                        onFork={handleForkMessage}
                        isSearchMatch={isMessageSearchMatch}
                        isCurrentSearchMatch={isCurrentMatch}
                      />
                    );
                  }

                  if (message.role === 'assistant') {
                    const hasToolCalls = assistantMessagesWithTools.has(message.id);
                    const isLastAssistantInGroup = !group.messages.slice(msgIdx + 1).some(m => m.role === 'assistant');
                    const toolMessages = hasToolCalls ? getToolMessagesForAssistant(message) : [];

                    // Check if this is the first assistant message in the group (show full branding)
                    // or a continuation (show minimal header)
                    const previousAssistantIdx = group.messages.slice(0, msgIdx).findLastIndex(m => m.role === 'assistant');
                    const isFirstAssistantInGroup = previousAssistantIdx === -1;

                    // Messages to pass to ToolExecution: this assistant + its tool results
                    const messagesForToolExecution = hasToolCalls ? [message, ...toolMessages] : [];

                    return (
                      <MessageLine
                        key={message.id}
                        message={message}
                        type="assistant"
                        isStreaming={isStreaming}
                        onFork={handleForkMessage}
                        onRunCode={handleRunCode}
                        onInsertCode={handleInsertCode}
                        routingInfo={routingInfo}
                        onReaction={handleReaction}
                        reaction={message.reaction}
                        isSearchMatch={isMessageSearchMatch}
                        isCurrentSearchMatch={isCurrentMatch}
                        showBranding={isFirstAssistantInGroup}
                      >
                        {hasToolCalls && (
                          <ToolExecution
                            messages={messagesForToolExecution}
                            isRunning={isGroupRunning && isLastAssistantInGroup}
                            toolResults={getToolResultsForRun(group.runId)}
                            sessionId={activeSession?.id}
                          />
                        )}
                      </MessageLine>
                    );
                  }

                  if (message.role === 'tool') {
                    // Tool messages are rendered within tool execution blocks attached to their assistant message
                    return null;
                  }

                  return null;
                })}
                </div>
              )}
            </div>
          );
        })}

        {/* Tool confirmation panel - shows when awaiting approval */}
        <ToolConfirmationPanel />
      </div>
      </div>
      </div>
    </div>
  );
};
