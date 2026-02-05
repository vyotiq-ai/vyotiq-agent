/**
 * MessageGroup Component
 * 
 * Renders a single run group with all its messages.
 * Extracted from ChatArea to reduce re-renders by memoizing message groups.
 * 
 * Features:
 * - Collapsible run groups with smooth animation
 * - Streaming indicator for active runs
 * - Efficient memoization for performance
 * - Search match highlighting support
 */
import React, { memo, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import type { ChatMessage as ChatMessageType, ToolResultEvent, RoutingDecision } from '../../../../shared/types';
import { cn } from '../../../utils/cn';
import { MessageLine } from './MessageLine';
import { ToolExecution } from './ToolExecution';
import { RunGroupHeader } from './RunGroupHeader';
import { StreamingIndicator } from './StreamingIndicator';

/** Message reaction type */
type MessageReaction = 'up' | 'down' | null;

/**
 * RoutingInfo for display purposes, derived from RoutingDecision
 * Maps RoutingDecision fields to a display-friendly format
 */
interface RoutingInfo {
  /** Task type detected by the router (maps from detectedTaskType) */
  taskType: string;
  /** Selected provider */
  provider: string | null;
  /** Selected model */
  model: string | null;
  /** Confidence of detection (from RoutingDecision.confidence) */
  confidence: number;
  /** Reason for the routing decision */
  reason?: string;
  /** Whether fallback was used */
  usedFallback?: boolean;
  /** Original provider before fallback */
  originalProvider?: string;
}

/**
 * Convert a RoutingDecision to RoutingInfo for display
 * @param decision - The routing decision from the agent
 * @returns RoutingInfo suitable for UI display, or undefined if no decision
 */
export function routingDecisionToInfo(decision: RoutingDecision | undefined): RoutingInfo | undefined {
  if (!decision) return undefined;
  return {
    taskType: typeof decision.detectedTaskType === 'string' ? decision.detectedTaskType : String(decision.detectedTaskType),
    provider: decision.selectedProvider ?? null,
    model: decision.selectedModel ?? null,
    confidence: decision.confidence,
    reason: decision.reason,
    usedFallback: decision.usedFallback,
    originalProvider: decision.originalProvider,
  };
}

export interface MessageGroupProps {
  /** Group messages */
  messages: ChatMessageType[];
  /** Run ID for this group */
  runId?: string;
  /** Index of this group in the list */
  groupIdx: number;
  /** Total number of groups */
  totalGroups: number;
  /** Whether this is the last (most recent) group */
  isLastGroup: boolean;
  /** Whether the agent is currently running */
  isRunning: boolean;
  /** Whether this group is collapsed */
  collapsed: boolean;
  /** Callback to toggle collapse state */
  onToggleCollapse: (runKey: string) => void;
  /** Tool results for this run */
  toolResults?: Map<string, ToolResultEvent>;
  /** Real-time executing tools for this run (keyed by callId) */
  executingTools?: Record<string, { callId: string; name: string; arguments?: Record<string, unknown>; startedAt: number }>;
  /** Queued tools waiting to execute */
  queuedTools?: Array<{ callId: string; name: string; arguments?: Record<string, unknown>; queuePosition: number; queuedAt: number }>;
  /** Tools awaiting approval */
  pendingTools?: Array<{ callId: string; name: string; arguments?: Record<string, unknown> }>;
  /** Session ID */
  sessionId?: string;
  /** Set of message IDs that match the search query */
  matchingMessageIds: Set<string>;
  /** ID of the current search match */
  currentMatchMessageId?: string;
  /** Routing info for the session */
  routingInfo?: RoutingInfo;
  /** Callback when a message is edited */
  onEditMessage: (messageId: string, newContent: string) => Promise<void>;
  /** Callback when a message is forked */
  onForkMessage: (messageId: string) => Promise<void>;
  /** Callback when code is run */
  onRunCode: (code: string, language: string) => Promise<void>;
  /** Callback when code is inserted into a file */
  onInsertCode: (code: string, language: string) => Promise<void>;
  /** Callback when a reaction is added */
  onReaction: (messageId: string, reaction: MessageReaction) => void;
  /** Callback to regenerate the last assistant response */
  onRegenerate?: () => Promise<void>;
}

/**
 * Pre-compute which assistant messages have tool calls
 * This is memoized to avoid recalculating on every render
 */
function useAssistantToolCallMap(messages: ChatMessageType[]): Set<string> {
  return useMemo(() => {
    const set = new Set<string>();
    for (const m of messages) {
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        set.add(m.id);
      }
    }
    return set;
  }, [messages]);
}

/**
 * Get tool messages that correspond to an assistant message's tool calls
 */
function getToolMessagesForAssistant(
  assistantMsg: ChatMessageType,
  allMessages: ChatMessageType[]
): ChatMessageType[] {
  if (!assistantMsg.toolCalls) return [];
  const toolCallIds = new Set(assistantMsg.toolCalls.map(tc => tc.callId).filter(Boolean));
  return allMessages.filter(
    m => m.role === 'tool' && m.toolCallId && toolCallIds.has(m.toolCallId)
  );
}

/**
 * Custom equality check for MessageGroup to prevent unnecessary re-renders
 */
function areMessageGroupPropsEqual(
  prev: MessageGroupProps,
  next: MessageGroupProps
): boolean {
  // Fast path: check identity
  if (prev === next) return true;
  
  // Check primitive props first (fastest)
  if (
    prev.runId !== next.runId ||
    prev.groupIdx !== next.groupIdx ||
    prev.isLastGroup !== next.isLastGroup ||
    prev.isRunning !== next.isRunning ||
    prev.collapsed !== next.collapsed ||
    prev.sessionId !== next.sessionId ||
    prev.currentMatchMessageId !== next.currentMatchMessageId
  ) {
    return false;
  }
  
  // Check messages length and last message
  if (prev.messages.length !== next.messages.length) return false;
  if (prev.messages.length > 0) {
    const lastPrev = prev.messages[prev.messages.length - 1];
    const lastNext = next.messages[next.messages.length - 1];
    if (lastPrev.id !== lastNext.id) return false;
    // Check content length for streaming
    if ((lastPrev.content?.length ?? 0) !== (lastNext.content?.length ?? 0)) return false;
  }
  
  // Check Set sizes (cheaper than full comparison)
  if (prev.matchingMessageIds.size !== next.matchingMessageIds.size) return false;
  
  // Tool results: check Map size
  if (prev.toolResults?.size !== next.toolResults?.size) return false;

  // Pending tools: check length and callIds
  const prevPending = prev.pendingTools;
  const nextPending = next.pendingTools;
  if ((prevPending?.length ?? 0) !== (nextPending?.length ?? 0)) return false;
  if (prevPending && nextPending) {
    for (let i = 0; i < prevPending.length; i += 1) {
      if (prevPending[i]?.callId !== nextPending[i]?.callId) return false;
    }
  }
  
  // Routing info: shallow compare if both exist
  if (prev.routingInfo !== next.routingInfo) {
    if (!prev.routingInfo || !next.routingInfo) return false;
    if (prev.routingInfo.provider !== next.routingInfo.provider) return false;
    if (prev.routingInfo.model !== next.routingInfo.model) return false;
  }
  
  return true;
}

export const MessageGroup: React.FC<MessageGroupProps> = memo(({
  messages,
  runId,
  groupIdx,
  isLastGroup,
  isRunning,
  collapsed,
  onToggleCollapse,
  toolResults,
  executingTools,
  queuedTools,
  pendingTools,
  sessionId,
  matchingMessageIds,
  currentMatchMessageId,
  routingInfo,
  onEditMessage,
  onForkMessage,
  onRunCode,
  onInsertCode,
  onReaction,
  onRegenerate,
}) => {
  const runKey = runId ?? `group-${groupIdx}`;
  const isGroupRunning = isLastGroup && isRunning;
  
  // Check if group has content yet (for initial streaming state)
  const hasContent = useMemo(() => {
    return messages.some(m => m.content && m.content.length > 0);
  }, [messages]);
  
  // Show streaming indicator when running but no content yet
  const showStreamingIndicator = isGroupRunning && !hasContent && messages.length > 0;
  
  // Pre-compute assistant messages with tool calls
  const assistantMessagesWithTools = useAssistantToolCallMap(messages);

  // Memoized toggle handler
  const handleToggle = useCallback(() => {
    onToggleCollapse(runKey);
  }, [onToggleCollapse, runKey]);

  return (
    <div
      className={cn(
        'transition-colors duration-150',
        'min-w-0 max-w-full w-full',
        isGroupRunning
          ? 'border-b border-[var(--color-warning)]/40'
          : 'border-b border-[var(--color-border-subtle)]/50'
      )}
    >
      
      {/* Clickable header to toggle collapse */}
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'w-full min-w-0 text-left',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-accent-primary)]/30'
        )}
        aria-expanded={!collapsed}
        aria-controls={`message-group-content-${runKey}`}
      >
        <div className="flex items-center min-w-0 w-full">
          <div className={cn(
            'flex items-center justify-center w-6 flex-shrink-0 self-stretch',
            'border-r border-[var(--color-border-subtle)]/20'
          )}>
            {collapsed ? (
              <ChevronRight size={12} className="text-[var(--color-text-dim)] transition-transform duration-150" />
            ) : (
              <ChevronDown size={12} className="text-[var(--color-text-dim)] transition-transform duration-150" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <RunGroupHeader
              runId={runId}
              messages={messages}
              toolResults={toolResults}
              isRunning={isGroupRunning}
            />
          </div>
        </div>
      </button>

      {/* Collapsible content with smooth animation */}
      {!collapsed && (
        <div id={`message-group-content-${runKey}`}>
          {/* Streaming indicator - shows when waiting for first content */}
          {showStreamingIndicator && (
            <div className="flex items-center gap-2 px-3 py-2 border-t border-[var(--color-border-subtle)]/20">
              <StreamingIndicator 
                isStreaming={true} 
                message="thinking" 
                size="sm" 
                variant="pulse" 
              />
            </div>
          )}
          
          <MessageGroupContent
            messages={messages}
            isLastGroup={isLastGroup}
            isGroupRunning={isGroupRunning}
            assistantMessagesWithTools={assistantMessagesWithTools}
            toolResults={toolResults}
            executingTools={executingTools}
            queuedTools={queuedTools}
            pendingTools={pendingTools}
            sessionId={sessionId}
            matchingMessageIds={matchingMessageIds}
            currentMatchMessageId={currentMatchMessageId}
            routingInfo={routingInfo}
            onEditMessage={onEditMessage}
            onForkMessage={onForkMessage}
            onRunCode={onRunCode}
            onInsertCode={onInsertCode}
            onReaction={onReaction}
            onRegenerate={onRegenerate}
          />
        </div>
      )}
    </div>
  );
}, areMessageGroupPropsEqual);

MessageGroup.displayName = 'MessageGroup';

/**
 * Inner content component for the message group
 * Separated to avoid re-rendering the header when content changes
 */
interface MessageGroupContentProps {
  messages: ChatMessageType[];
  isLastGroup: boolean;
  isGroupRunning: boolean;
  assistantMessagesWithTools: Set<string>;
  toolResults?: Map<string, ToolResultEvent>;
  executingTools?: Record<string, { callId: string; name: string; arguments?: Record<string, unknown>; startedAt: number }>;
  queuedTools?: Array<{ callId: string; name: string; arguments?: Record<string, unknown>; queuePosition: number; queuedAt: number }>;
  pendingTools?: Array<{ callId: string; name: string; arguments?: Record<string, unknown> }>;
  sessionId?: string;
  matchingMessageIds: Set<string>;
  currentMatchMessageId?: string;
  routingInfo?: RoutingInfo;
  onEditMessage: (messageId: string, newContent: string) => Promise<void>;
  onForkMessage: (messageId: string) => Promise<void>;
  onRunCode: (code: string, language: string) => Promise<void>;
  onInsertCode: (code: string, language: string) => Promise<void>;
  onReaction: (messageId: string, reaction: MessageReaction) => void;
  onRegenerate?: () => Promise<void>;
}

const MessageGroupContent: React.FC<MessageGroupContentProps> = memo(({
  messages,
  isLastGroup,
  isGroupRunning,
  assistantMessagesWithTools,
  toolResults,
  executingTools,
  queuedTools,
  pendingTools,
  sessionId,
  matchingMessageIds,
  currentMatchMessageId,
  routingInfo,
  onEditMessage,
  onForkMessage,
  onRunCode,
  onInsertCode,
  onReaction,
  onRegenerate,
}) => {
  return (
    <div className="px-2 sm:px-3 md:px-4 lg:px-5 py-1.5 sm:py-2 space-y-1 border-t border-[var(--color-border-subtle)]/20 min-w-0 w-full">
      {messages.map((message, msgIdx) => {
        const isLastMsg = msgIdx === messages.length - 1 && isLastGroup;
        const isStreaming = isLastMsg && message.role === 'assistant' && isGroupRunning;
        const isMessageSearchMatch = matchingMessageIds.has(message.id);
        const isCurrentMatch = currentMatchMessageId === message.id;

        if (message.role === 'user') {
          return (
            <MessageLine
              key={message.id}
              message={message}
              type="user"
              onEdit={onEditMessage}
              onFork={onForkMessage}
              isSearchMatch={isMessageSearchMatch}
              isCurrentSearchMatch={isCurrentMatch}
            />
          );
        }

        if (message.role === 'assistant') {
          const hasToolCalls = assistantMessagesWithTools.has(message.id);
          const isLastAssistantInGroup = !messages.slice(msgIdx + 1).some(m => m.role === 'assistant');
          const toolMessages = hasToolCalls ? getToolMessagesForAssistant(message, messages) : [];

          // Check if this is the first assistant message in the group (show full branding)
          const previousAssistantIdx = messages.slice(0, msgIdx).findLastIndex(m => m.role === 'assistant');
          const isFirstAssistantInGroup = previousAssistantIdx === -1;

          // Messages to pass to ToolExecution: this assistant + its tool results
          const messagesForToolExecution = hasToolCalls ? [message, ...toolMessages] : [];

          // Show regenerate button on the last assistant message of the last group when not running
          const canRegenerate = isLastGroup && isLastAssistantInGroup && !isGroupRunning && onRegenerate;

          return (
            <MessageLine
              key={message.id}
              message={message}
              type="assistant"
              isStreaming={isStreaming}
              onFork={onForkMessage}
              onRunCode={onRunCode}
              onInsertCode={onInsertCode}
              routingInfo={routingInfo}
              onReaction={onReaction}
              reaction={message.reaction}
              isSearchMatch={isMessageSearchMatch}
              isCurrentSearchMatch={isCurrentMatch}
              showBranding={isFirstAssistantInGroup}
              onRegenerate={canRegenerate ? onRegenerate : undefined}
            >
              {hasToolCalls && (
                <ToolExecution
                  messages={messagesForToolExecution}
                  isRunning={isGroupRunning && isLastAssistantInGroup}
                  toolResults={toolResults}
                  executingTools={executingTools}
                  queuedTools={queuedTools}
                  pendingTools={pendingTools}
                  sessionId={sessionId}
                />
              )}
            </MessageLine>
          );
        }

        // Tool messages are rendered within tool execution blocks attached to their assistant message
        return null;
      })}
    </div>
  );
});

MessageGroupContent.displayName = 'MessageGroupContent';
