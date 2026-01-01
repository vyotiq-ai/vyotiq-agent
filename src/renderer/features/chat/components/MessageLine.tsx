/**
 * Message Line Component
 * 
 * Renders a single message in terminal-style format with editing support.
 * Supports thinking/reasoning content display for thinking models (Gemini 2.5/3).
 * Supports generated media display for multimodal models (images, audio).
 */
import React, { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Pencil, X, Check, GitBranch, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown } from 'lucide-react';

import type { ChatMessage } from '../../../../shared/types';
import { formatTokenUsageEnhanced } from '../../../utils/messageFormatting';
import { cn } from '../../../utils/cn';
import { ThinkingPanel } from './ThinkingPanel';
import { GeneratedMedia } from './GeneratedMedia';
import { RoutingBadge } from './RoutingBadge';

interface TokenUsageDisplay {
  text: string;
  tooltip: string;
}

function formatTokenUsage(usage?: ChatMessage['usage']): TokenUsageDisplay | undefined {
  const enhanced = formatTokenUsageEnhanced(usage);
  if (!enhanced) return undefined;
  
  return {
    text: enhanced.text,
    tooltip: enhanced.tooltip,
  };
}

/**
 * Get a concise model name for thinking panel display
 * Maps model IDs to user-friendly short names
 */
function getThinkingModelName(modelId?: string): string | undefined {
  if (!modelId) return undefined;
  
  // DeepSeek thinking models (V3.2)
  // @see https://api-docs.deepseek.com/guides/thinking_mode
  if (modelId.includes('deepseek-reasoner')) return 'DeepSeek V3.2 Reasoner';
  if (modelId.includes('deepseek')) return 'DeepSeek';
  
  // Gemini thinking models
  if (modelId.includes('gemini-3')) return 'Gemini 3';
  if (modelId.includes('gemini-2.5-pro')) return 'Gemini 2.5 Pro';
  if (modelId.includes('gemini-2.5-flash')) return 'Gemini 2.5 Flash';
  if (modelId.includes('gemini')) return 'Gemini';
  
  // Future: Add other thinking models as they're supported
  // if (modelId.includes('claude') && modelId.includes('thinking')) return 'Claude';
  
  return undefined;
}

function looksLikeMarkdown(content: string): boolean {
  // Cheap heuristics to avoid rendering plain text through the markdown pipeline.
  // This keeps the UI fast while enabling proper formatting for structured replies.
  
  // Code blocks (fenced or indented)
  if (content.includes('```')) return true;
  
  // Headings
  if (/(^|\n)#{1,6}\s+/.test(content)) return true;
  
  // Lists (unordered and ordered)
  if (/(^|\n)\s*([-*+]\s+|\d+\.\s+)/.test(content)) return true;
  
  // Blockquotes
  if (/(^|\n)>\s+/.test(content)) return true;
  
  // Tables
  if (/(^|\n)\|.+\|/.test(content)) return true;
  
  // Links [text](url) or [text][ref]
  if (/\[.+?\]\(.+?\)/.test(content)) return true;
  if (/\[.+?\]\[.+?\]/.test(content)) return true;
  
  // Bold text (**text** or __text__)
  if (/\*\*[^*]+\*\*/.test(content)) return true;
  if (/__[^_]+__/.test(content)) return true;
  
  // Italic text (*text* or _text_) - be careful not to match underscores in identifiers
  if (/(?<!\*)\*(?!\*)[^*\n]+(?<!\*)\*(?!\*)/.test(content)) return true;
  
  // Inline code `code`
  if (/`[^`]+`/.test(content)) return true;
  
  // Strikethrough ~~text~~
  if (/~~[^~]+~~/.test(content)) return true;
  
  // Horizontal rules
  if (/(^|\n)(---|\*\*\*|___)\s*(\n|$)/.test(content)) return true;
  
  // Math expressions
  if (content.includes('$') && /\$[^$]+\$/.test(content)) return true;
  if (content.includes('\\(') || content.includes('\\[')) return true;
  
  // Task lists
  if (/\[[ x]\]/i.test(content)) return true;
  
  // Images ![alt](url)
  if (/!\[.*?\]\(.+?\)/.test(content)) return true;
  
  return false;
}

interface RoutingInfo {
  taskType: string;
  provider: string | null;
  model: string | null;
  confidence: number;
  reason?: string;
  usedFallback?: boolean;
  originalProvider?: string;
}

/**
 * Format model ID for compact display
 * Extracts the meaningful part of model IDs like "gemini-2.5-flash-preview-05-20"
 */
function formatModelIdShort(modelId: string): string {
  // Remove provider prefix if present (e.g., "openai/gpt-4" -> "gpt-4")
  const withoutPrefix = modelId.split('/').pop() || modelId;
  // For long model names, take first 3 segments
  const parts = withoutPrefix.split('-');
  if (parts.length > 3) {
    return parts.slice(0, 3).join('-');
  }
  return withoutPrefix;
}

/** Compact provider/model badge for message headers */
const ProviderModelBadge: React.FC<{
  provider: string;
  modelId?: string;
  iteration?: number;
  isAutoRouted?: boolean;
}> = memo(({ provider, modelId, iteration, isAutoRouted }) => {
  const shortModel = modelId ? formatModelIdShort(modelId) : null;
  const tooltip = [
    `Provider: ${provider}`,
    modelId && `Model: ${modelId}`,
    iteration && `Iteration: ${iteration}`,
    isAutoRouted && 'Auto-routed',
  ].filter(Boolean).join('\n');

  return (
    <span 
      className="inline-flex items-center gap-1 text-[9px] text-[var(--color-text-muted)] font-mono"
      title={tooltip}
    >
      <span className="text-[var(--color-text-secondary)]">{provider}</span>
      {shortModel && (
        <>
          <span className="text-[var(--color-text-dim)]">/</span>
          <span>{shortModel}</span>
        </>
      )}
      {iteration && (
        <span className="text-[var(--color-text-dim)]">[{iteration}]</span>
      )}
    </span>
  );
});
ProviderModelBadge.displayName = 'ProviderModelBadge';

/** Threshold for collapsible long messages (in characters) */
const COLLAPSE_THRESHOLD = 1500;
/** Number of characters to show when collapsed */
const COLLAPSED_PREVIEW_LENGTH = 800;

interface MessageLineProps {
  message: ChatMessage;
  type: 'user' | 'assistant';
  isStreaming?: boolean;
  onEdit?: (messageId: string, newContent: string) => void;
  onFork?: (messageId: string) => void;
  onRunCode?: (code: string, language: string) => void;
  onInsertCode?: (code: string, language: string) => void;
  /** Routing decision info for assistant messages */
  routingInfo?: RoutingInfo;
  /** Callback for message reactions/ratings */
  onReaction?: (messageId: string, reaction: 'up' | 'down' | null) => void;
  /** Current reaction state */
  reaction?: 'up' | 'down' | null;
  /** Whether this message matches the current search query */
  isSearchMatch?: boolean;
  /** Whether this is the currently focused search match */
  isCurrentSearchMatch?: boolean;
  /** Children to render inside the message (e.g., tool executions) */
  children?: React.ReactNode;
  /** Whether to show lambda branding (first assistant message after user) */
  showBranding?: boolean;
}

const MessageLineComponent: React.FC<MessageLineProps> = ({
  message,
  type,
  isStreaming = false,
  onEdit,
  onFork,
  onRunCode,
  onInsertCode,
  routingInfo,
  onReaction,
  reaction,
  isSearchMatch = false,
  isCurrentSearchMatch = false,
  children,
  showBranding = true,
}) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isExpanded, setIsExpanded] = useState(false);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Check if message is long enough to be collapsible
  const isLongMessage = useMemo(() => 
    message.content.length > COLLAPSE_THRESHOLD && !isStreaming,
    [message.content.length, isStreaming]
  );

  // Get truncated content for collapsed view
  const collapsedContent = useMemo(() => {
    if (!isLongMessage || isExpanded) return message.content;
    // Find a good break point (end of sentence or paragraph)
    const truncated = message.content.slice(0, COLLAPSED_PREVIEW_LENGTH);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastNewline = truncated.lastIndexOf('\n');
    const breakPoint = Math.max(lastPeriod, lastNewline);
    return breakPoint > COLLAPSED_PREVIEW_LENGTH / 2 
      ? truncated.slice(0, breakPoint + 1) 
      : truncated;
  }, [message.content, isLongMessage, isExpanded]);

  const handleToggleExpand = useCallback(() => setIsExpanded(prev => !prev), []);

  const handleReaction = useCallback((newReaction: 'up' | 'down') => {
    if (!onReaction) return;
    // Toggle off if clicking the same reaction
    onReaction(message.id, reaction === newReaction ? null : newReaction);
  }, [onReaction, message.id, reaction]);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && editTextareaRef.current) {
      editTextareaRef.current.focus();
      editTextareaRef.current.setSelectionRange(editContent.length, editContent.length);
    }
  }, [isEditing, editContent.length]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  const handleMouseEnter = useCallback(() => {}, []);
  const handleMouseLeave = useCallback(() => {}, []);

  const handleStartEdit = useCallback(() => {
    setEditContent(message.content);
    setIsEditing(true);
  }, [message.content]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditContent(message.content);
  }, [message.content]);

  const handleSaveEdit = useCallback(() => {
    if (editContent.trim() && editContent !== message.content && onEdit) {
      onEdit(message.id, editContent.trim());
    }
    setIsEditing(false);
  }, [editContent, message.content, message.id, onEdit]);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  }, [handleCancelEdit, handleSaveEdit]);

  const timeStr = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const tokenSummary = formatTokenUsage(message.usage);

  const displayContent = message.content;

  // User message - terminal/CLI style, right-aligned
  if (type === 'user') {
    const renderMarkdownUser = Boolean(displayContent && looksLikeMarkdown(displayContent));

    return (
      <div 
        className={cn(
          'py-1.5 group relative font-mono',
          isSearchMatch && 'bg-[var(--color-warning)]/10',
          isCurrentSearchMatch && 'ring-1 ring-[var(--color-warning)]'
        )}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        data-message-id={message.id}
      >
        {/* Header row */}
        <div className="flex items-center justify-between gap-2 text-[10px] mb-1">
          {/* Left - actions on hover */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              className="px-1.5 py-0.5 text-[9px] text-[var(--color-text-placeholder)] hover:text-[var(--color-accent-primary)] rounded transition-colors"
            >
              {copied ? 'copied' : 'copy'}
            </button>
            {onFork && !isEditing && (
              <button
                onClick={() => onFork(message.id)}
                className="p-1 text-[var(--color-text-placeholder)] hover:text-[var(--color-info)] rounded transition-colors"
                title="fork"
              >
                <GitBranch size={10} />
              </button>
            )}
            {onEdit && !isEditing && (
              <button
                onClick={handleStartEdit}
                className="p-1 text-[var(--color-text-placeholder)] hover:text-[var(--color-accent-primary)] rounded transition-colors"
                title="edit"
              >
                <Pencil size={10} />
              </button>
            )}
          </div>
          
          {/* Right - timestamp and label */}
          <div className="flex items-center gap-2 text-[9px]">
            <span className="text-[var(--color-text-dim)]">{timeStr}</span>
            <span className="text-[var(--color-accent-primary)] font-medium">you</span>
          </div>
        </div>

        {/* Content - right aligned with right border */}
        <div className="flex justify-end">
          <div className="pr-3 mr-2 border-r border-[var(--color-accent-primary)]/20">
            {/* Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="text-[10px] text-[var(--color-text-muted)] mb-1 text-right">
                {message.attachments.map((att) => (
                  <div key={att.id} className="flex items-center justify-end gap-1.5">
                    <span className="text-[var(--color-info)]">{att.name}</span>
                    <span className="text-[var(--color-text-dim)]">{Math.round(att.size / 1024)}kb</span>
                  </div>
                ))}
              </div>
            )}
            
            {/* Content */}
            {isEditing ? (
              <div className="space-y-2 text-left max-w-[500px]">
                <textarea
                  ref={editTextareaRef}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  className="w-full min-h-[60px] p-2 text-[12px] bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] focus:border-[var(--color-accent-primary)] text-[var(--color-text-primary)] resize-none outline-none"
                />
                <div className="flex justify-end gap-2">
                  <button onClick={handleCancelEdit} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]">
                    <X size={12} />
                  </button>
                  <button onClick={handleSaveEdit} className="p-1 text-[var(--color-accent-primary)] hover:text-[var(--color-accent-hover)]">
                    <Check size={12} />
                  </button>
                </div>
              </div>
            ) : displayContent && (
              <div className="text-[12px] text-[var(--color-text-primary)] leading-relaxed break-words text-right max-w-[600px]">
                <ContentRenderer content={displayContent} useMarkdown={renderMarkdownUser} messageType="user" />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Assistant message - left-aligned with different styling
  const renderMarkdown = Boolean(displayContent);

  const isSummaryMessage = Boolean(message.isSummary);

  return (
    <div 
      className={cn(
        'py-1.5 group relative font-mono',
        isSearchMatch && 'bg-[var(--color-warning)]/10 rounded-lg',
        isCurrentSearchMatch && 'ring-2 ring-[var(--color-warning)] ring-offset-1 ring-offset-[var(--color-surface-base)]'
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      data-message-id={message.id}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 text-[10px] mb-1">
        <div className="min-w-0 flex items-center gap-2 font-mono overflow-hidden">
          {showBranding ? (
            <>
              <span className="text-[var(--color-accent-primary)] text-sm font-medium">λ</span>
              <span className="text-[var(--color-text-muted)] text-[9px]">vyotiq</span>
              <span className="text-[var(--color-text-dim)] text-[9px]">{timeStr}</span>
            </>
          ) : (
            <span className="text-[var(--color-text-dim)] text-[9px]">{timeStr}</span>
          )}
          {/* Provider/model badge - show on first message with routing, or inline on all */}
          {routingInfo && routingInfo.provider && showBranding && (
            <RoutingBadge
              taskType={routingInfo.taskType}
              provider={routingInfo.provider}
              model={routingInfo.model ?? undefined}
              confidence={routingInfo.confidence}
              reason={routingInfo.reason}
              usedFallback={routingInfo.usedFallback}
              originalProvider={routingInfo.originalProvider}
              compact
            />
          )}
          {/* Show provider/model inline when no routing info or on continuation messages */}
          {message.provider && (!routingInfo || !showBranding) && (
            <span 
              className="text-[9px] font-mono text-[var(--color-text-muted)]"
              title={message.modelId || message.provider}
            >
              <span className="text-[var(--color-text-secondary)]">{message.provider}</span>
              {message.modelId && (
                <>
                  <span className="text-[var(--color-text-dim)]">/</span>
                  <span className="text-[var(--color-text-dim)]">{message.modelId.split('-').slice(0, 2).join('-')}</span>
                </>
              )}
            </span>
          )}
          {isSummaryMessage && (
            <span className="text-[var(--color-accent-secondary)] text-[9px]">summary</span>
          )}
        </div>

        {/* Right side: tokens + actions */}
        <div className="flex items-center gap-2">
          {tokenSummary && (
            <span className="text-[var(--color-text-dim)] text-[9px] tabular-nums" title={tokenSummary.tooltip}>{tokenSummary.text}</span>
          )}
          
          {displayContent && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {onReaction && !isStreaming && (
                <>
                  <button
                    onClick={() => handleReaction('up')}
                    className={cn(
                      'p-1 rounded transition-colors',
                      reaction === 'up'
                        ? 'opacity-100 text-[var(--color-success)] bg-[var(--color-success)]/10'
                        : 'text-[var(--color-text-placeholder)] hover:text-[var(--color-success)] hover:bg-[var(--color-surface-2)]/50'
                    )}
                    title="Good response"
                  >
                    <ThumbsUp size={10} />
                  </button>
                  <button
                    onClick={() => handleReaction('down')}
                    className={cn(
                      'p-1 rounded transition-colors',
                      reaction === 'down'
                        ? 'opacity-100 text-[var(--color-error)] bg-[var(--color-error)]/10'
                        : 'text-[var(--color-text-placeholder)] hover:text-[var(--color-error)] hover:bg-[var(--color-surface-2)]/50'
                    )}
                    title="Poor response"
                  >
                    <ThumbsDown size={10} />
                  </button>
                </>
              )}
              {onFork && !isStreaming && (
                <button
                  onClick={() => onFork(message.id)}
                  className="p-1 text-[var(--color-text-placeholder)] hover:text-[var(--color-info)] hover:bg-[var(--color-surface-2)]/50 rounded transition-colors"
                  title="fork from here"
                >
                  <GitBranch size={10} />
                </button>
              )}
              <button
                onClick={handleCopy}
                className="px-1.5 py-0.5 text-[9px] text-[var(--color-text-placeholder)] hover:text-[var(--color-info)] hover:bg-[var(--color-surface-2)]/50 rounded transition-colors"
                title="copy response"
              >
                {copied ? <span className="text-[var(--color-success)]">copied</span> : 'copy'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className={cn(
        'pl-3 border-l',
        showBranding 
          ? 'ml-2 border-[var(--color-accent-primary)]/15' 
          : 'ml-4 border-[var(--color-border-subtle)]/30'
      )}>
        {/* Thinking Panel */}
        {(message.thinking || message.isThinkingStreaming) && (
          <div className="mb-2">
            <ThinkingPanel
              thinking={message.thinking || ''}
              isStreaming={message.isThinkingStreaming}
              modelName={getThinkingModelName(message.modelId)}
              defaultCollapsed={!message.isThinkingStreaming}
            />
          </div>
        )}

        {/* Response content */}
        <div className="break-words overflow-hidden min-w-0">
          {isSummaryMessage ? (
            <details className="group/summary">
              <summary className="cursor-pointer select-none list-none text-[10px] font-mono text-[var(--color-text-muted)] flex items-center gap-2">
                <span>Summary (context compression)</span>
                <span className="text-[var(--color-text-dim)] text-[9px] group-open/summary:hidden">show</span>
                <span className="text-[var(--color-text-dim)] text-[9px] hidden group-open/summary:inline">hide</span>
              </summary>
              <div className="pt-2">
                {displayContent && (
                  <ContentRenderer
                    content={displayContent}
                    useMarkdown={renderMarkdown}
                    messageType="assistant"
                    onRunCode={onRunCode}
                    onInsertCode={onInsertCode}
                  />
                )}
              </div>
            </details>
          ) : isLongMessage ? (
            <div>
              <ContentRenderer
                content={isExpanded ? displayContent : collapsedContent}
                useMarkdown={renderMarkdown}
                messageType="assistant"
                onRunCode={onRunCode}
                onInsertCode={onInsertCode}
              />
              {!isExpanded && (
                <span className="text-[var(--color-text-muted)] text-[10px]">...</span>
              )}
              <button
                onClick={handleToggleExpand}
                className="mt-2 flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/10 transition-colors"
              >
                {isExpanded ? <><ChevronUp size={12} /><span>Show less</span></> : <><ChevronDown size={12} /><span>Show more</span></>}
              </button>
            </div>
          ) : (
            displayContent && (
              <ContentRenderer
                content={displayContent}
                useMarkdown={renderMarkdown}
                messageType="assistant"
                onRunCode={onRunCode}
                onInsertCode={onInsertCode}
              />
            )
          )}

          {(message.generatedImages || message.generatedAudio) && (
            <GeneratedMedia
              images={message.generatedImages}
              audio={message.generatedAudio}
            />
          )}
        </div>

        {/* Tool executions */}
        {children && <div className="mt-2">{children}</div>}

        {/* Streaming indicator */}
        {isStreaming && !displayContent && !message.isThinkingStreaming && (
          <div className="flex items-center gap-1.5 text-[10px] py-1">
            <span className="w-1.5 h-1.5 bg-[var(--color-accent-primary)] animate-pulse rounded-full" />
            <span className="text-[var(--color-text-placeholder)]">thinking...</span>
          </div>
        )}
      </div>
    </div>
  );
};

// Lazy load MarkdownRenderer outside component for proper code splitting
const LazyMarkdownRenderer = React.lazy(() => import('../../../components/ui/MarkdownRenderer'));

/**
 * Render content with markdown and code block support
 */
const ContentRenderer: React.FC<{ 
  content: string;
  useMarkdown: boolean;
  messageType?: 'user' | 'assistant';
  onRunCode?: (code: string, language: string) => void;
  onInsertCode?: (code: string, language: string) => void;
}> = memo(({ content, useMarkdown, messageType = 'assistant', onRunCode, onInsertCode }) => {
  const textColorClass = messageType === 'user' 
    ? 'text-white' 
    : 'text-[var(--color-text-secondary)]';

  if (useMarkdown) {
    return (
      <React.Suspense
        fallback={
          <div className={`text-[12px] ${textColorClass} leading-relaxed whitespace-pre-wrap break-words`}>
            {content}
          </div>
        }
      >
        <LazyMarkdownRenderer 
          content={content} 
          onRunCode={onRunCode} 
          onInsertCode={onInsertCode}
          messageType={messageType}
          interactive
        />
      </React.Suspense>
    );
  }
  
  return (
    <div className={`text-[12px] ${textColorClass} leading-relaxed whitespace-pre-wrap break-words`}>
      {content}
    </div>
  );
});

ContentRenderer.displayName = 'ContentRenderer';

export const MessageLine = memo(MessageLineComponent);
