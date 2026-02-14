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
            )}>
              {isAssistant ? (
                <MarkdownRenderer content={message.content} compact />
              ) : (
                <span className="whitespace-pre-wrap break-words">{message.content}</span>
              )}
              {/* Streaming cursor */}
              {isStreaming && isAssistant && (
                <span className="animate-blink text-[var(--color-accent-primary)]">▍</span>
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

        {/* Hover actions */}
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

export const MessageLine = memo(MessageLineInternal);
MessageLine.displayName = 'MessageLine';
