/**
 * MessageGroup Component
 * 
 * Renders a single run group with all its messages.
 * Extracted from ChatArea to reduce re-renders by memoizing message groups.
 */
import React, { memo, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import type { ChatMessage as ChatMessageType, ToolResultEvent, RoutingDecision } from '../../../../shared/types';
import { cn } from '../../../utils/cn';
import { MessageLine } from './MessageLine';
import { ToolExecution } from './ToolExecution';
import { RunGroupHeader } from './RunGroupHeader';

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
  
  // Pre-compute assistant messages with tool calls
  const assistantMessagesWithTools = useAssistantToolCallMap(messages);

  // Memoized toggle handler
  const handleToggle = useCallback(() => {
    onToggleCollapse(runKey);
  }, [onToggleCollapse, runKey]);

  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden transition-all duration-200',
        'min-w-0 max-w-full w-full', // Prevent horizontal overflow
        isGroupRunning
          ? 'border border-[var(--color-warning)]/30 shadow-sm shadow-[var(--color-warning)]/5'
          : 'border border-[var(--color-border-subtle)]/60',
        'bg-[var(--color-surface-1)]/10'
      )}
    >
      
      {/* Clickable header to toggle collapse */}
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          "w-full min-w-0 text-left transition-colors overflow-hidden",
          "hover:bg-[var(--color-surface-2)]/20",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-accent-primary)]/30"
        )}
      >
        <div className="flex items-center min-w-0 w-full overflow-hidden">
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
          <div className="flex-1 min-w-0 overflow-hidden">
            <RunGroupHeader
              runId={runId}
              messages={messages}
              toolResults={toolResults}
              isRunning={isGroupRunning}
            />
          </div>
        </div>
      </button>

      {/* Collapsible content */}
      {!collapsed && (
        <MessageGroupContent
          messages={messages}
          isLastGroup={isLastGroup}
          isGroupRunning={isGroupRunning}
          assistantMessagesWithTools={assistantMessagesWithTools}
          toolResults={toolResults}
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
    <div className="px-3 sm:px-4 py-2 sm:py-3 space-y-1 border-t border-[var(--color-border-subtle)]/20 min-w-0 w-full overflow-hidden">
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
