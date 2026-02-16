/**
 * MessageLine Component
 * 
 * Renders a single chat message (user, assistant, or tool role).
 * Handles markdown rendering, attachments, thinking panels, tool executions,
 * reactions, generated media, routing badges, and message editing.
 * 
 * Follows the existing terminal aesthetic with monospace fonts,
 * lambda branding, and CSS variable-based theming.
 */
import React, { memo, useState, useCallback, useMemo } from 'react';
import {
  User,
  Bot,
  Wrench,
  ThumbsUp,
  ThumbsDown,
  Pencil,
  Copy,
  Check,
  Zap,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { ChatMessage } from '../../../../shared/types';
import { MarkdownRenderer } from '../../../components/ui/MarkdownRenderer';
import { MessageAttachments } from './MessageAttachments';
import { ThinkingPanel } from './ThinkingPanel';
import { ToolExecution } from './ToolExecution';
import { GeneratedMedia } from './GeneratedMedia';
import { RoutingBadge } from './RoutingBadge';
import { DynamicToolIndicator } from './DynamicToolIndicator';
import { MessageEditDialog } from './MessageEditDialog';
import { formatTokenUsageEnhanced, formatModelDisplayName } from '../../../utils/messageFormatting';

// =============================================================================
// Types
// =============================================================================

interface MessageLineProps {
  /** The message to render */
  message: ChatMessage;
  /** All messages (for tool result matching) */
  messages: ChatMessage[];
  /** Whether this message should be highlighted (search match) */
  isHighlighted?: boolean;
  /** Whether the message is currently streaming */
  isStreaming?: boolean;
  /** Routing decision info for this message */
  routingDecision?: {
    taskType: string;
    selectedProvider: string | null;
    selectedModel: string | null;
    confidence: number;
    reason: string;
    usedFallback?: boolean;
    originalProvider?: string;
  };
  /** Executing tools map from agent state */
  executingTools?: Record<string, { callId: string; name: string; startedAt: number }>;
  /** Queued tools from agent state */
  queuedTools?: Array<{ callId: string; name: string; queuePosition: number }>;
  /** Callback for adding a reaction */
  onReaction?: (messageId: string, reaction: 'up' | 'down' | null) => void;
  /** Callback for editing a message */
  onEdit?: (messageId: string, newContent: string) => void;
  /** Additional CSS class */
  className?: string;
}

// =============================================================================
// Helpers
// =============================================================================

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// =============================================================================
// Sub-components
// =============================================================================

const RoleIcon: React.FC<{ role: string }> = memo(({ role }) => {
  if (role === 'user') {
    return <User size={10} className="shrink-0" style={{ color: 'var(--color-text-secondary)' }} />;
  }
  if (role === 'assistant') {
    return <span className="shrink-0 text-[10px] font-bold" style={{ color: 'var(--color-accent-primary)' }}>λ</span>;
  }
  if (role === 'tool') {
    return <Wrench size={10} className="shrink-0" style={{ color: 'var(--color-text-muted)' }} />;
  }
  return <Bot size={10} className="shrink-0" />;
});
RoleIcon.displayName = 'RoleIcon';

// =============================================================================
// Main Component
// =============================================================================

const MessageLineInternal: React.FC<MessageLineProps> = ({
  message,
  messages,
  isHighlighted = false,
  isStreaming = false,
  routingDecision,
  executingTools,
  queuedTools,
  onReaction,
  onEdit,
  className,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isTool = message.role === 'tool';

  // Copy message content
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  // Toggle reaction
  const handleReaction = useCallback((type: 'up' | 'down') => {
    if (!onReaction) return;
    const current = message.reaction;
    onReaction(message.id, current === type ? null : type);
  }, [onReaction, message.id, message.reaction]);

  // Edit message
  const handleEditSubmit = useCallback((messageId: string, newContent: string) => {
    onEdit?.(messageId, newContent);
    setIsEditing(false);
  }, [onEdit]);

  // Token usage display
  const usageInfo = useMemo(() => {
    if (!message.usage) return null;
    return formatTokenUsageEnhanced(message.usage);
  }, [message.usage]);

  // Model display name
  const modelDisplay = useMemo(() => {
    if (!message.modelId) return null;
    return formatModelDisplayName(message.modelId, message.provider);
  }, [message.modelId, message.provider]);

  // Check if message has tool calls to render
  const hasToolCalls = isAssistant && message.toolCalls && message.toolCalls.length > 0;

  return (
    <div
      className={cn(
        'group relative font-mono',
        isHighlighted && 'bg-[var(--color-accent-primary)] bg-opacity-5 rounded',
        className,
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onFocus={() => setShowActions(true)}
      onBlur={(e) => {
        // Only hide if focus moved outside this message container
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setShowActions(false);
        }
      }}
    >
      {/* Message header */}
      <div className="flex items-center gap-1.5 mb-0.5">
        <RoleIcon role={message.role} />

        {/* Role label */}
        <span className={cn(
          'text-[9px] uppercase tracking-wider',
          isUser ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-muted)]',
        )}>
          {isUser ? 'you' : isTool ? (message.toolName ?? 'tool') : 'assistant'}
        </span>

        {/* Follow-up badge */}
        {isUser && message.isFollowUp && (
          <span className="inline-flex items-center gap-0.5 text-[8px] text-[var(--color-accent-primary)] uppercase tracking-wider opacity-80">
            <Zap size={8} aria-hidden="true" />
            follow-up
          </span>
        )}

        {/* Model info */}
        {isAssistant && modelDisplay && (
          <span className="text-[8px] text-[var(--color-text-dim)] truncate">
            {modelDisplay.shortName ?? modelDisplay.name}
          </span>
        )}

        {/* Auto-routed badge */}
        {isAssistant && message.isAutoRouted && (
          <span className="text-[8px] text-[var(--color-text-dim)] uppercase tracking-wider">
            auto
          </span>
        )}

        {/* Routing decision */}
        {isAssistant && routingDecision && (
          <RoutingBadge
            taskType={routingDecision.taskType}
            provider={routingDecision.selectedProvider ?? undefined}
            model={routingDecision.selectedModel ?? undefined}
            confidence={routingDecision.confidence}
            reason={routingDecision.reason}
            usedFallback={routingDecision.usedFallback}
            originalProvider={routingDecision.originalProvider}
            compact
          />
        )}

        {/* Timestamp */}
        <span className="ml-auto text-[8px] tabular-nums text-[var(--color-text-dim)]">
          {formatTimestamp(message.createdAt)}
        </span>
      </div>

      {/* Thinking panel (before content) */}
      {isAssistant && message.thinking && (
        <ThinkingPanel
          content={message.thinking}
          isStreaming={message.isThinkingStreaming}
          className="mb-1"
        />
      )}

      {/* Message content */}
      {isEditing && isUser ? (
        <MessageEditDialog
          messageId={message.id}
          originalContent={message.content || ''}
          onSubmit={handleEditSubmit}
          onClose={() => setIsEditing(false)}
        />
      ) : (
        <>
          {message.content && (
            <div className={cn(
              'text-[11px] leading-relaxed',
              isUser
                ? 'text-[var(--color-text-primary)]'
                : isTool
                  ? 'text-[var(--color-text-secondary)] text-[10px]'
                  : 'text-[var(--color-text-primary)]',
              isStreaming && isAssistant && 'streaming-active streaming-text-container',
            )}
              {...(isStreaming && isAssistant ? { 'aria-live': 'polite', 'aria-busy': 'true' } : {})}
            >
              {isAssistant ? (
                <MarkdownRenderer content={message.content} compact />
              ) : (
                <span className="whitespace-pre-wrap break-words">{message.content}</span>
              )}
              {/* Streaming cursor */}
              {isStreaming && isAssistant && (
                <span className="streaming-cursor">▍</span>
              )}
            </div>
          )}
        </>
      )}

      {/* Attachments (user messages) */}
      {isUser && message.attachments && message.attachments.length > 0 && (
        <MessageAttachments attachments={message.attachments} variant="inline" />
      )}

      {/* Tool executions (assistant messages with tool calls) */}
      {hasToolCalls && (
        <ToolExecution
          message={message}
          messages={messages}
          executingTools={executingTools}
          queuedTools={queuedTools}
          className="mt-1"
        />
      )}

      {/* Generated media */}
      {isAssistant && (message.generatedImages || message.generatedAudio) && (
        <GeneratedMedia
          images={message.generatedImages}
          audio={message.generatedAudio}
        />
      )}

      {/* Footer: usage, reactions, actions */}
      <div className="flex items-center gap-1.5 mt-0.5">
        {/* Token usage */}
        {usageInfo && (
          <span
            className="text-[8px] tabular-nums text-[var(--color-text-dim)]"
            title={usageInfo.tooltip}
          >
            {usageInfo.text}
          </span>
        )}

        {/* Iteration badge */}
        {message.iteration != null && message.iteration > 0 && (
          <span className="text-[8px] tabular-nums text-[var(--color-text-dim)]">
            iter {message.iteration}
          </span>
        )}

        {/* Message actions - visible on hover/focus, with a persistent muted copy icon */}
        {!showActions && message.content && (
          <button
            type="button"
            onClick={handleCopy}
            className="ml-auto p-0.5 text-[var(--color-text-dim)]/40 hover:text-[var(--color-text-secondary)] transition-colors focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)] focus-visible:outline-none rounded"
            title={copied ? 'Copied' : 'Copy message'}
          >
            {copied ? <Check size={9} style={{ color: 'var(--color-success)' }} /> : <Copy size={9} />}
          </button>
        )}
        {showActions && (
          <div className="flex items-center gap-0.5 ml-auto">
            {/* Copy */}
            {message.content && (
              <button
                type="button"
                onClick={handleCopy}
                className="p-0.5 text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors"
                title={copied ? 'Copied' : 'Copy message'}
              >
                {copied ? <Check size={10} style={{ color: 'var(--color-success)' }} /> : <Copy size={10} />}
              </button>
            )}

            {/* Edit (user messages only) */}
            {isUser && onEdit && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="p-0.5 text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors"
                title="Edit message"
              >
                <Pencil size={10} />
              </button>
            )}

            {/* Reactions (assistant messages only) */}
            {isAssistant && onReaction && (
              <>
                <button
                  type="button"
                  onClick={() => handleReaction('up')}
                  className={cn(
                    'p-0.5 transition-colors',
                    message.reaction === 'up'
                      ? 'text-[var(--color-success)]'
                      : 'text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)]',
                  )}
                  title="Good response"
                >
                  <ThumbsUp size={10} />
                </button>
                <button
                  type="button"
                  onClick={() => handleReaction('down')}
                  className={cn(
                    'p-0.5 transition-colors',
                    message.reaction === 'down'
                      ? 'text-[var(--color-error)]'
                      : 'text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)]',
                  )}
                  title="Bad response"
                >
                  <ThumbsDown size={10} />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// PERF: Custom memo comparator to prevent non-streaming messages from
// re-rendering when a sibling's streaming delta updates the `messages` array.
// The `messages` prop (full array) gets a new reference on every delta dispatch
// because the session's message list is replaced.  We only need to re-render
// when *this* message's data changes or the props that affect *this* item change.
function areMessageLinePropsEqual(
  prev: Readonly<MessageLineProps>,
  next: Readonly<MessageLineProps>,
): boolean {
  // Fast path: if message reference is the same AND non-streaming, nothing changed
  if (
    prev.message === next.message &&
    !prev.isStreaming &&
    !next.isStreaming &&
    prev.isHighlighted === next.isHighlighted &&
    prev.routingDecision === next.routingDecision &&
    prev.executingTools === next.executingTools &&
    prev.queuedTools === next.queuedTools &&
    prev.onReaction === next.onReaction &&
    prev.onEdit === next.onEdit &&
    prev.className === next.className
  ) {
    return true; // skip re-render
  }

  // If streaming, always re-render so the cursor and content update
  if (next.isStreaming) return false;

  // For non-streaming messages: check if the actual message data changed
  if (prev.message !== next.message) return false;
  if (prev.isHighlighted !== next.isHighlighted) return false;
  if (prev.routingDecision !== next.routingDecision) return false;
  if (prev.executingTools !== next.executingTools) return false;
  if (prev.queuedTools !== next.queuedTools) return false;
  if (prev.onReaction !== next.onReaction) return false;
  if (prev.onEdit !== next.onEdit) return false;
  if (prev.className !== next.className) return false;

  // `messages` array changes on every streaming delta, but non-streaming
  // MessageLines only use it for ToolExecution result matching.  Skip
  // re-render when only the messages reference changed.
  return true;
}

export const MessageLine = memo(MessageLineInternal, areMessageLinePropsEqual);
MessageLine.displayName = 'MessageLine';
