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
import React, { memo, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Search, ChevronsUpDown, ArrowDown } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useAgentSelector, useAgentActions } from '../../state/AgentProvider';
import type { AgentUIState, RoutingDecisionState } from '../../state/types';
import type { ChatMessage, AgentRunStatus } from '../../../shared/types';
import { useChatAreaState } from './hooks/useChatAreaState';
import { useChatScrollManager } from './hooks/useChatScrollManager';
import { useVirtualItemMeasure } from '../../hooks/useVirtualizedList';
import { useConversationSearch } from '../../hooks/useConversationSearch';
import { useCommunication } from '../../hooks/useCommunication';
import { useLoopDetection } from '../../hooks/useLoopDetection';
import { MessageLine } from './components/MessageLine';
import { RunGroupHeader } from './components/RunGroupHeader';
import { EmptyState } from './components/EmptyState';
import { SessionWelcome } from './components/SessionWelcome';
import { ConversationSearchBar } from './components/ConversationSearchBar';
import { ToolConfirmationPanel } from './components/ToolConfirmationPanel';
import { BranchNavigation } from './components/BranchNavigation';
import { RunErrorBanner } from './components/RunErrorBanner';
import { QuestionPanel } from './components/QuestionPanel';
import { DecisionPanel } from './components/DecisionPanel';
import { CommunicationProgress } from './components/CommunicationProgress';
import { LoopDetectionBanner } from './components/LoopDetectionBanner';

// =============================================================================
// Selectors
// =============================================================================

const VIRTUALIZATION_THRESHOLD = 100;

// ---------------------------------------------------------------------------
// Selectors with stable equality functions to prevent cascading re-renders
// during agent execution.  The key insight: during streaming, almost every
// state update touches `sessions` (new message content), so selectors that
// read unrelated slices MUST use reference-equality on their own slice to
// avoid forcing ChatArea — and every child — to re-render.
// ---------------------------------------------------------------------------

const selectActiveSession = (state: AgentUIState) => {
  if (!state.activeSessionId) return undefined;
  return state.sessions.find(s => s.id === state.activeSessionId);
};

const selectPendingConfirmations = (state: AgentUIState) => state.pendingConfirmations;
const selectRoutingDecisions = (state: AgentUIState) => state.routingDecisions;
const selectExecutingTools = (state: AgentUIState) => state.executingTools;
const selectQueuedTools = (state: AgentUIState) => state.queuedTools;
const selectPendingQuestions = (state: AgentUIState) => state.pendingQuestions;
const selectPendingDecisions = (state: AgentUIState) => state.pendingDecisions;
const selectCommunicationProgress = (state: AgentUIState) => state.communicationProgress;
// Stable empty arrays to avoid new references on every render
const EMPTY_CONFIRMATIONS: never[] = [];

// Reference-equality shortcut: returns true when the two record/object
// references haven't changed (the reducer returns the same object when
// the slice is untouched).  This is intentionally *identity*-only.
const refEqual = <T,>(a: T, b: T) => a === b;

// =============================================================================
// Chat Area Component
// =============================================================================

const ChatAreaInternal: React.FC = () => {
  // PERF: Every selector below uses refEqual so that when a *different*
  // slice of state changes (e.g. streaming delta updates sessions[]),
  // these selectors short-circuit and ChatArea does NOT re-render.
  const activeSession = useAgentSelector(selectActiveSession);
  const pendingConfirmations = useAgentSelector(selectPendingConfirmations, refEqual);
  const routingDecisions = useAgentSelector(selectRoutingDecisions, refEqual);
  const executingToolsMap = useAgentSelector(selectExecutingTools, refEqual);
  const queuedToolsMap = useAgentSelector(selectQueuedTools, refEqual);
  const pendingQuestions = useAgentSelector(selectPendingQuestions, refEqual);
  const pendingDecisions = useAgentSelector(selectPendingDecisions, refEqual);
  const communicationProgress = useAgentSelector(selectCommunicationProgress, refEqual);
  const { addReaction } = useAgentActions();

  // Communication actions
  const communication = useCommunication();

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

  // ---------------------------------------------------------------------------
  // Unread message count — tracks how many new messages arrived while the user
  // is scrolled up.  Resets when the user scrolls back to bottom.
  // ---------------------------------------------------------------------------
  const unreadAnchorRef = useRef(branchFilteredMessages.length);
  const unreadCount = useMemo(() => {
    if (!showScrollToBottom) return 0;
    return Math.max(0, branchFilteredMessages.length - unreadAnchorRef.current);
  }, [showScrollToBottom, branchFilteredMessages.length]);

  // When scroll-to-bottom becomes hidden (user scrolled back), reset anchor
  useEffect(() => {
    if (!showScrollToBottom) {
      unreadAnchorRef.current = branchFilteredMessages.length;
    }
  }, [showScrollToBottom, branchFilteredMessages.length]);

  // Get session-specific state
  const sessionId = activeSession?.id;
  const sessionConfirmations = useMemo(() => {
    if (!sessionId) return EMPTY_CONFIRMATIONS;
    const vals = Object.values(pendingConfirmations).filter(c => c.sessionId === sessionId);
    return vals.length > 0 ? vals : EMPTY_CONFIRMATIONS;
  }, [pendingConfirmations, sessionId]);

  const sessionRoutingDecision = sessionId ? routingDecisions[sessionId] : undefined;

  // Loop detection for the active run
  const activeRunId = activeSession?.activeRunId;
  const loopDetection = useLoopDetection(activeRunId ?? undefined);

  // Session-specific communication state
  // Filter questions and decisions to only show those belonging to the active session's run,
  // preventing cross-session leakage when multiple sessions are running concurrently.
  const sessionQuestions = useMemo(
    () => activeRunId
      ? pendingQuestions.filter(q => q.runId === activeRunId || !q.runId)
      : pendingQuestions,
    [pendingQuestions, activeRunId],
  );
  const sessionDecisions = useMemo(
    () => activeRunId
      ? pendingDecisions.filter(d => d.runId === activeRunId || !d.runId)
      : pendingDecisions,
    [pendingDecisions, activeRunId],
  );

  // Toggle search
  const toggleSearch = useCallback(() => {
    setIsSearchOpen(prev => {
      if (prev) searchResult.clearSearch();
      return !prev;
    });
  }, [searchResult]);

  // Handle keyboard shortcuts: search (Ctrl+F) and scroll to bottom (End)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      toggleSearch();
    }
    if (e.key === 'End' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      handleScrollToBottom();
    }
  }, [toggleSearch, handleScrollToBottom]);

  // Reaction handler
  const handleReaction = useCallback((messageId: string, reaction: 'up' | 'down' | null) => {
    if (!sessionId) return;
    addReaction(sessionId, messageId, reaction as 'up' | 'down');
  }, [addReaction, sessionId]);

  // Branch delete handler
  const handleDeleteBranch = useCallback((branchId: string) => {
    if (!sessionId) return;
    window.vyotiq?.agent?.deleteBranch?.(sessionId, branchId);
  }, [sessionId]);

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
      role="log"
      aria-label="Chat messages"
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
          className={cn('flex-1 overflow-y-auto px-3 py-2', isStreaming && 'streaming-scroll-area')}
        >
          <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
            {virtualItems.map(vItem => {
              const group = messageGroups[vItem.index];
              if (!group) return null;
              const runKey = group.runId ?? `group-${vItem.index}`;
              const isCollapsed = collapseState.isRunCollapsed(vItem.index, messageGroups.length, runKey);

              return (
                <MeasuredVirtualItem
                  key={runKey}
                  index={vItem.index}
                  offsetTop={vItem.offsetTop}
                  measureItem={measureItem}
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
                </MeasuredVirtualItem>
              );
            })}
          </div>
        </div>
      ) : (
        /* Non-virtualized rendering */
        <div
          ref={scrollRef}
          className={cn('flex-1 overflow-y-auto px-3 py-2', isStreaming && 'streaming-scroll-area')}
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

      {/* Loop detection banner */}
      {(loopDetection.isLooping || loopDetection.isCircuitBreakerTriggered) && (
        <div className="px-3 py-1 shrink-0 border-t border-[var(--color-border-subtle)]">
          <LoopDetectionBanner
            isCircuitBreakerTriggered={loopDetection.isCircuitBreakerTriggered}
            isLooping={loopDetection.isLooping}
            severity={loopDetection.severity}
            loopCount={loopDetection.state?.loopCount ?? 0}
            repeatPatterns={loopDetection.state?.repeatPatterns ?? []}
          />
        </div>
      )}

      {/* Communication progress */}
      {communicationProgress.length > 0 && (
        <div className="px-3 py-1 shrink-0 border-t border-[var(--color-border-subtle)]">
          <CommunicationProgress entries={communicationProgress} />
        </div>
      )}

      {/* Pending questions */}
      {sessionQuestions.length > 0 && (
        <div className="px-3 py-1.5 shrink-0 border-t border-[var(--color-border-subtle)] flex flex-col gap-1.5">
          {sessionQuestions.map(q => (
            <QuestionPanel
              key={q.id}
              question={q}
              onAnswer={communication.answerQuestion}
              onSkip={communication.skipQuestion}
            />
          ))}
        </div>
      )}

      {/* Pending decisions */}
      {sessionDecisions.length > 0 && (
        <div className="px-3 py-1.5 shrink-0 border-t border-[var(--color-border-subtle)] flex flex-col gap-1.5">
          {sessionDecisions.map(d => (
            <DecisionPanel
              key={d.id}
              decision={d}
              onDecide={communication.makeDecision}
              onSkip={communication.skipDecision}
            />
          ))}
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

      {/* Scroll to bottom button with unread message count badge */}
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
              'focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)] focus-visible:outline-none',
            )}
            aria-label={unreadCount > 0 ? `Scroll to bottom (${unreadCount} new)` : 'Scroll to bottom'}
            title={unreadCount > 0 ? `Scroll to bottom (${unreadCount} new)` : 'Scroll to bottom (End)'}
          >
            <ArrowDown size={14} />
            {/* Unread badge */}
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-[var(--color-accent-primary)] text-[8px] font-mono font-semibold text-white tabular-nums">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Measured Virtual Item Wrapper
// =============================================================================

/**
 * Wraps each virtual item with a ResizeObserver that reports actual rendered
 * height to the virtualizer.  Without this, collapsed RunGroups (~20px) are
 * allocated the full estimatedItemHeight (150px), creating large blank gaps.
 */
interface MeasuredVirtualItemProps {
  index: number;
  offsetTop: number;
  measureItem: (index: number, height: number) => void;
  children: React.ReactNode;
}

const MeasuredVirtualItem: React.FC<MeasuredVirtualItemProps> = memo(({ index, offsetTop, measureItem, children }) => {
  const measureRef = useVirtualItemMeasure(measureItem, index);

  return (
    <div
      ref={measureRef}
      data-index={index}
      style={{
        position: 'absolute',
        top: 0,
        transform: `translateY(${offsetTop}px)`,
        width: '100%',
      }}
    >
      {children}
    </div>
  );
});
MeasuredVirtualItem.displayName = 'MeasuredVirtualItem';

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
