/**
 * ChatArea Component
 * 
 * The main chat message display area. Renders conversation messages grouped by run,
 * with collapsible run headers, scroll management (virtualized for large histories),
 * conversation search, branch navigation, and streaming state handling.
 * 
 * Uses the following hooks:
 * - useChatAreaState: branch filtering, message grouping, collapse state
 * - useChatScrollManager: auto-scroll during streaming, virtualization
 * - useConversationSearch: message search with navigation
 * 
 * Follows the terminal aesthetic with monospace fonts and CSS variable theming.
 */
import React, { memo, useState, useCallback, useMemo } from 'react';
import { Search, ChevronsUpDown, ArrowDown } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useAgentSelector, useAgentActions } from '../../state/AgentProvider';
import type { AgentUIState, RoutingDecisionState } from '../../state/types';
import type { ChatMessage, AgentRunStatus } from '../../../shared/types';
import { useChatAreaState } from './hooks/useChatAreaState';
import { useChatScrollManager } from './hooks/useChatScrollManager';
import { useConversationSearch } from '../../hooks/useConversationSearch';
import { MessageLine } from './components/MessageLine';
import { RunGroupHeader } from './components/RunGroupHeader';
import { EmptyState } from './components/EmptyState';
import { SessionWelcome } from './components/SessionWelcome';
import { ConversationSearchBar } from './components/ConversationSearchBar';
import { ToolConfirmationPanel } from './components/ToolConfirmationPanel';
import { BranchNavigation } from './components/BranchNavigation';
import { TodoProgress } from './components/TodoProgress';
import { RunErrorBanner } from './components/RunErrorBanner';

// =============================================================================
// Selectors
// =============================================================================

const VIRTUALIZATION_THRESHOLD = 100;

const selectActiveSession = (state: AgentUIState) => {
  if (!state.activeSessionId) return undefined;
  return state.sessions.find(s => s.id === state.activeSessionId);
};

const selectPendingConfirmations = (state: AgentUIState) => state.pendingConfirmations;
const selectRoutingDecisions = (state: AgentUIState) => state.routingDecisions;
const selectExecutingTools = (state: AgentUIState) => state.executingTools;
const selectQueuedTools = (state: AgentUIState) => state.queuedTools;
const selectTodos = (state: AgentUIState) => state.todos;
const selectAgentStatus = (state: AgentUIState) => state.agentStatus;

// =============================================================================
// Chat Area Component
// =============================================================================

const ChatAreaInternal: React.FC = () => {
  const activeSession = useAgentSelector(selectActiveSession);
  const pendingConfirmations = useAgentSelector(selectPendingConfirmations);
  const routingDecisions = useAgentSelector(selectRoutingDecisions);
  const executingToolsMap = useAgentSelector(selectExecutingTools);
  const queuedToolsMap = useAgentSelector(selectQueuedTools);
  const todosMap = useAgentSelector(selectTodos);
  const agentStatusMap = useAgentSelector(selectAgentStatus);
  const { addReaction } = useAgentActions();

  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Core state management
  const {
    branchState,
    branchFilteredMessages,
    messageGroups,
    collapseState,
    isStreaming,
    lastAssistantContentLength,
  } = useChatAreaState({ activeSession });

  // Search
  const searchResult = useConversationSearch(branchFilteredMessages);

  // Determine if we should virtualize
  const shouldVirtualize = branchFilteredMessages.length > VIRTUALIZATION_THRESHOLD;

  // Scroll management
  const {
    scrollRef,
    virtualContainerRef,
    handleScrollToBottom,
    showScrollToBottom,
    virtualItems,
    totalHeight,
    measureItem,
  } = useChatScrollManager({
    shouldVirtualize,
    sessionId: activeSession?.id,
    messages: branchFilteredMessages,
    isStreaming,
    lastAssistantContentLength,
    renderGroups: messageGroups,
  });

  // Get session-specific state
  const sessionId = activeSession?.id;
  const sessionConfirmations = useMemo(() => {
    if (!sessionId) return [];
    return Object.values(pendingConfirmations).filter(c => c.sessionId === sessionId);
  }, [pendingConfirmations, sessionId]);

  const sessionRoutingDecision = sessionId ? routingDecisions[sessionId] : undefined;
  const sessionTodos = sessionId ? todosMap[sessionId] : undefined;
  const sessionStatus = sessionId ? agentStatusMap[sessionId] : undefined;

  // Toggle search
  const toggleSearch = useCallback(() => {
    setIsSearchOpen(prev => {
      if (prev) searchResult.clearSearch();
      return !prev;
    });
  }, [searchResult]);

  // Handle keyboard shortcut for search
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      toggleSearch();
    }
  }, [toggleSearch]);

  // Reaction handler
  const handleReaction = useCallback((messageId: string, reaction: 'up' | 'down' | null) => {
    if (!sessionId) return;
    addReaction(sessionId, messageId, reaction as 'up' | 'down');
  }, [addReaction, sessionId]);

  // Branch delete handler
  const handleDeleteBranch = useCallback((_branchId: string) => {
    // Branch deletion through the session manager
    // This would need to be wired to the agent actions
  }, []);

  // ==========================================================================
  // Render
  // ==========================================================================

  // No session state
  if (!activeSession) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState hasWorkspace hasSession={false} />
      </div>
    );
  }

  // Empty session
  const hasMessages = branchFilteredMessages.length > 0;

  return (
    <div
      className="flex-1 flex flex-col min-h-0 font-mono"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Top bar: branches + search toggle + collapse toggle */}
      {hasMessages && (
        <div className="flex items-center gap-1 px-3 py-1 shrink-0 border-b border-[var(--color-border-subtle)]">
          {/* Branch navigation */}
          {branchState.branches.length > 0 && (
            <BranchNavigation
              branches={branchState.branches}
              activeBranchId={branchState.activeBranchId}
              onSwitchBranch={branchState.setActiveBranchId}
              onDeleteBranch={handleDeleteBranch}
            />
          )}

          <div className="flex-1" />

          {/* Collapse/Expand toggle */}
          {messageGroups.length > 1 && (
            <button
              type="button"
              onClick={collapseState.allExpanded ? collapseState.collapseAllRuns : collapseState.expandAllRuns}
              className="p-0.5 text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors"
              title={collapseState.allExpanded ? 'Collapse all runs' : 'Expand all runs'}
            >
              <ChevronsUpDown size={12} />
            </button>
          )}

          {/* Search toggle */}
          <button
            type="button"
            onClick={toggleSearch}
            className={cn(
              'p-0.5 transition-colors',
              isSearchOpen
                ? 'text-[var(--color-accent-primary)]'
                : 'text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)]',
            )}
            title="Search messages (Ctrl+F)"
          >
            <Search size={12} />
          </button>
        </div>
      )}

      {/* Search bar */}
      {isSearchOpen && (
        <ConversationSearchBar
          search={searchResult}
          onClose={() => {
            searchResult.clearSearch();
            setIsSearchOpen(false);
          }}
        />
      )}

      {/* Messages area */}
      {!hasMessages ? (
        <div className="flex-1">
          <SessionWelcome />
        </div>
      ) : shouldVirtualize ? (
        /* Virtualized rendering */
        <div
          ref={virtualContainerRef}
          className="flex-1 overflow-y-auto px-3 py-2"
        >
          <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
            {virtualItems.map(vItem => {
              const group = messageGroups[vItem.index];
              if (!group) return null;
              const runKey = group.runId ?? `group-${vItem.index}`;
              const isCollapsed = collapseState.isRunCollapsed(vItem.index, messageGroups.length, runKey);

              return (
                <div
                  key={runKey}
                  data-index={vItem.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    transform: `translateY(${vItem.offsetTop}px)`,
                    width: '100%',
                  }}
                >
                  <RunGroup
                    group={group}
                    groupIndex={vItem.index}
                    totalGroups={messageGroups.length}
                    isCollapsed={isCollapsed}
                    onToggleCollapse={() => collapseState.toggleRunCollapse(runKey)}
                    runStatus={isStreaming && vItem.index === messageGroups.length - 1 ? activeSession.status : undefined}
                    messages={branchFilteredMessages}
                    isStreaming={isStreaming && vItem.index === messageGroups.length - 1}
                    matchingMessageIds={searchResult.matchingMessageIds}
                    routingDecision={sessionRoutingDecision}
                    executingToolsMap={executingToolsMap}
                    queuedToolsMap={queuedToolsMap}
                    sessionId={sessionId!}
                    onReaction={handleReaction}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Non-virtualized rendering */
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-3 py-2"
        >
          <div className="flex flex-col gap-3">
            {messageGroups.map((group, idx) => {
              const runKey = group.runId ?? `group-${idx}`;
              const isCollapsed = collapseState.isRunCollapsed(idx, messageGroups.length, runKey);

              return (
                <RunGroup
                  key={runKey}
                  group={group}
                  groupIndex={idx}
                  totalGroups={messageGroups.length}
                  isCollapsed={isCollapsed}
                  onToggleCollapse={() => collapseState.toggleRunCollapse(runKey)}
                  runStatus={isStreaming && idx === messageGroups.length - 1 ? activeSession.status : undefined}
                  messages={branchFilteredMessages}
                  isStreaming={isStreaming && idx === messageGroups.length - 1}
                  matchingMessageIds={searchResult.matchingMessageIds}
                  routingDecision={sessionRoutingDecision}
                  executingToolsMap={executingToolsMap}
                  queuedToolsMap={queuedToolsMap}
                  sessionId={sessionId!}
                  onReaction={handleReaction}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Todo progress (if active) */}
      {sessionTodos && sessionTodos.todos.length > 0 && (
        <div className="px-3 py-1 shrink-0 border-t border-[var(--color-border-subtle)]">
          <TodoProgress
            todos={sessionTodos.todos}

          />
        </div>
      )}

      {/* Run error banner — shown when agent run fails with structured error info */}
      {sessionId && activeSession.status === 'error' && (
        <RunErrorBanner
          sessionId={sessionId}
          className="shrink-0"
        />
      )}

      {/* Pending tool confirmations */}
      {sessionConfirmations.length > 0 && (
        <div className="px-3 py-1.5 shrink-0 border-t border-[var(--color-border-subtle)] flex flex-col gap-1.5">
          {sessionConfirmations.map(conf => (
            <ToolConfirmationPanel
              key={conf.runId ?? conf.toolCall?.callId ?? 'confirm'}
              toolCall={conf}
              sessionId={sessionId!}
            />
          ))}
        </div>
      )}

      {/* Status bar */}
      {isStreaming && sessionStatus && (
        <div className="px-3 py-0.5 shrink-0 border-t border-[var(--color-border-subtle)] flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full animate-pulse"
            style={{ backgroundColor: 'var(--color-accent-primary)' }}
          />
          <span className="text-[9px] text-[var(--color-text-muted)] truncate">
            {sessionStatus.message}
          </span>
          {sessionStatus.currentIteration != null && sessionStatus.maxIterations != null && (
            <span className="ml-auto text-[8px] tabular-nums text-[var(--color-text-dim)]">
              {sessionStatus.currentIteration}/{sessionStatus.maxIterations}
            </span>
          )}
        </div>
      )}

      {/* Scroll to bottom button */}
      {showScrollToBottom && (
        <div className="absolute bottom-20 right-6">
          <button
            type="button"
            onClick={handleScrollToBottom}
            className={cn(
              'flex items-center justify-center',
              'h-7 w-7 rounded-full shadow-md',
              'bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]',
              'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
              'transition-all duration-150 hover:scale-105',
            )}
            title="Scroll to bottom"
          >
            <ArrowDown size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// RunGroup Sub-component
// =============================================================================

interface RunGroupProps {
  group: { runId?: string; messages: ChatMessage[] };
  groupIndex: number;
  totalGroups: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  runStatus?: AgentRunStatus;
  messages: ChatMessage[];
  isStreaming: boolean;
  matchingMessageIds: Set<string>;
  routingDecision?: {
    taskType: string;
    selectedProvider: string | null;
    selectedModel: string | null;
    confidence: number;
    reason: string;
    usedFallback?: boolean;
    originalProvider?: string;
  };
  executingToolsMap: Record<string, Record<string, { callId: string; name: string; startedAt: number }>>;
  queuedToolsMap: Record<string, Array<{ callId: string; name: string; queuePosition: number }>>;
  sessionId: string;
  onReaction: (messageId: string, reaction: 'up' | 'down' | null) => void;
}

const RunGroup: React.FC<RunGroupProps> = memo(({
  group,
  groupIndex,
  totalGroups,
  isCollapsed,
  onToggleCollapse,
  runStatus,
  messages: allMessages,
  isStreaming,
  matchingMessageIds,
  routingDecision,
  executingToolsMap,
  queuedToolsMap,
  sessionId,
  onReaction,
}) => {
  const showHeader = totalGroups > 1;
  const runId = group.runId;

  // Get executing/queued tools for this run
  const executingTools = runId ? executingToolsMap[runId] : undefined;
  const queuedTools = runId ? queuedToolsMap[runId] : undefined;

  return (
    <div>
      {/* Run Header */}
      {showHeader && (
        <RunGroupHeader
          runId={runId}
          groupIndex={groupIndex}
          messages={group.messages}
          isCollapsed={isCollapsed}
          onToggleCollapse={onToggleCollapse}
          runStatus={runStatus}
        />
      )}

      {/* Messages (hidden when collapsed) */}
      {!isCollapsed && (
        <div className={cn('flex flex-col gap-2', showHeader && 'ml-2 pl-2 border-l border-[var(--color-border-subtle)] border-opacity-30')}>
          {group.messages.map((msg, msgIdx) => {
            // Skip tool messages rendered inline by their parent assistant's ToolExecution
            if (msg.role === 'tool') return null;

            const isLastInGroup = msgIdx === group.messages.length - 1;
            const isCurrentlyStreaming = isStreaming && isLastInGroup && msg.role === 'assistant';

            return (
              <MessageLine
                key={msg.id}
                message={msg}
                messages={allMessages}
                isHighlighted={matchingMessageIds.has(msg.id)}
                isStreaming={isCurrentlyStreaming}
                routingDecision={msg.role === 'assistant' ? routingDecision : undefined}
                executingTools={executingTools}
                queuedTools={queuedTools}
                onReaction={onReaction}
              />
            );
          })}
        </div>
      )}
    </div>
  );
});
RunGroup.displayName = 'RunGroup';

// =============================================================================
// Export
// =============================================================================

export const ChatArea = memo(ChatAreaInternal);
ChatArea.displayName = 'ChatArea';
