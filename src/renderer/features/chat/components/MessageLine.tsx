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
import { cn } from '../../../utils/cn';
import { ThinkingPanel } from './ThinkingPanel';
import { GeneratedMedia } from './GeneratedMedia';
import { RoutingBadge } from './RoutingBadge';

interface TokenUsageDisplay {
  text: string;
  tooltip: string;
}

function formatTokenUsage(usage?: ChatMessage['usage']): TokenUsageDisplay | undefined {
  if (!usage) return undefined;
  const total = usage.total ?? (usage.input + usage.output);
  if (!Number.isFinite(total)) return undefined;
  
  // Format the total tokens for display
  let text: string;
  if (total < 1000) {
    text = `${total} tok`;
  } else {
    const k = Math.round((total / 1000) * 10) / 10;
    text = `${k}k tok`;
  }
  
  // Build tooltip with detailed breakdown
  const tooltipLines: string[] = [
    `Total: ${total.toLocaleString()} tokens`,
    `  Input: ${usage.input.toLocaleString()}`,
    `  Output: ${usage.output.toLocaleString()}`,
  ];
  
  // Add cache hit info for DeepSeek if available
  if (usage.cacheHit && usage.cacheHit > 0) {
    const hitRatio = Math.round((usage.cacheHit / usage.input) * 100);
    text += ` (${hitRatio}% cached)`;
    tooltipLines.push(`Cache hit: ${usage.cacheHit.toLocaleString()} (${hitRatio}%)`);
    if (usage.cacheMiss) {
      tooltipLines.push(`Cache miss: ${usage.cacheMiss.toLocaleString()}`);
    }
  }
  
  // Add reasoning tokens info for thinking models
  if (usage.reasoningTokens && usage.reasoningTokens > 0) {
    const reasoningK = Math.round((usage.reasoningTokens / 1000) * 10) / 10;
    text += reasoningK >= 1 ? ` +${reasoningK}k reasoning` : ` +${usage.reasoningTokens} reasoning`;
    tooltipLines.push(`Reasoning: ${usage.reasoningTokens.toLocaleString()}`);
  }
  
  return { text, tooltip: tooltipLines.join('\n') };
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
}) => {
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
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

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

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
  const editedStr = message.updatedAt ? new Date(message.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined;

  const displayContent = message.content;

  // User message - right-aligned with distinct styling
  if (type === 'user') {
    const renderMarkdownUser = Boolean(displayContent && looksLikeMarkdown(displayContent));

    return (
      <div 
        className={cn(
          'py-2 group relative font-mono',
          'transition-colors',
          // Search highlighting
          isSearchMatch && 'bg-[var(--color-warning)]/10 rounded-lg',
          isCurrentSearchMatch && 'ring-2 ring-[var(--color-warning)] ring-offset-1 ring-offset-[var(--color-surface-base)]'
        )}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        role="article"
        aria-label={`Your message at ${timeStr}`}
        data-message-id={message.id}
      >
        <div className="flex justify-end">
          <div className="max-w-[96%] sm:max-w-[90%] md:max-w-[85%] lg:max-w-[80%] flex flex-col items-end min-w-0">
            {/* Header */}
            <div className="w-full flex items-center justify-between gap-2 text-[10px] mb-1 min-w-0">
              <div className="min-w-0 flex items-center gap-2 text-[var(--color-text-placeholder)] font-mono overflow-hidden flex-1">
                <span className="flex-shrink-0">[{timeStr}]</span>
                <span className="text-[var(--color-accent-primary)] font-medium">you</span>
                {tokenSummary && (
                  <span className="truncate hidden sm:inline" title={tokenSummary.tooltip}>• {tokenSummary.text}</span>
                )}
                {editedStr && (
                  <span className="truncate hidden sm:inline">• edited {editedStr}</span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
              {/* Fork button */}
              {onFork && !isEditing && (
                <button
                  onClick={() => onFork(message.id)}
                  className={cn(
                    // On touch screens there is no hover: keep actions visible.
                    'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 p-1 text-[9px] transition-opacity rounded',
                    'text-[var(--color-text-placeholder)] hover:text-[var(--color-info)] hover:bg-[var(--color-surface-2)]',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                  )}
                  title="fork from here"
                  aria-label="Fork conversation from this message"
                >
                  <GitBranch size={10} aria-hidden="true" />
                </button>
              )}
              {/* Edit button */}
              {onEdit && !isEditing && (
                <button
                  onClick={handleStartEdit}
                  className={cn(
                    'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 p-1 text-[9px] transition-opacity rounded',
                    'text-[var(--color-text-placeholder)] hover:text-[var(--color-accent-primary)] hover:bg-[var(--color-surface-2)]',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                  )}
                  title="edit message"
                  aria-label="Edit this message"
                >
                  <Pencil size={10} aria-hidden="true" />
                </button>
              )}
              <button
                onClick={handleCopy}
                className={cn(
                  'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 px-1.5 py-0.5 text-[9px] transition-opacity',
                  'text-[var(--color-text-placeholder)] hover:text-[var(--color-text-secondary)]',
                  // Prevent layout shift when label toggles between "copy" and "copied"
                  'min-w-[44px] text-right',
                  'rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                )}
                title="copy"
                aria-label={copied ? 'Copied to clipboard' : 'Copy message to clipboard'}
              >
                {copied ? 'copied' : 'copy'}
              </button>
              </div>
            </div>

            {/* Message bubble */}
            <div className={cn(
              'px-3.5 py-2 rounded-2xl rounded-tr-sm min-w-0 max-w-full',
              'bg-[var(--color-accent-primary)]/8',
              'border border-[var(--color-accent-primary)]/15',
              'transition-all duration-200 break-words overflow-hidden',
              isHovered && 'bg-[var(--color-accent-primary)]/12 border-[var(--color-accent-primary)]/25 shadow-sm shadow-[var(--color-accent-primary)]/5',
              isEditing && 'ring-2 ring-[var(--color-accent-primary)]/30'
            )}>
              {/* Attachments */}
              {message.attachments && message.attachments.length > 0 && (
                <div className="text-[10px] text-[var(--color-text-muted)] mb-2 pb-2 border-b border-[var(--color-accent-primary)]/10">
                  {message.attachments.map((att, idx) => {
                    const isLast = idx === message.attachments!.length - 1;
                    return (
                      <div key={att.id} className="flex items-center gap-1.5">
                        <span className="text-[var(--color-accent-primary)]/50">
                          {isLast ? '└' : '├'}
                        </span>
                        <span className="text-[var(--color-info)]/80">{att.name}</span>
                        <span className="text-[var(--color-text-dim)]">[{Math.round(att.size / 1024)}kb]</span>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Content - editable or display */}
              {isEditing ? (
                <div className="space-y-2" role="form" aria-label="Edit message">
                  <textarea
                    ref={editTextareaRef}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    className={cn(
                      'w-full min-h-[60px] p-2 text-[12px] bg-[var(--color-surface-1)] rounded-sm',
                      'border border-[var(--color-border-subtle)] focus-visible:border-[var(--color-accent-primary)]',
                      'text-[var(--color-text-primary)] resize-none outline-none'
                    )}
                    placeholder="Edit your message..."
                    aria-label="Edit message content"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={handleCancelEdit}
                      className="p-1.5 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
                      title="Cancel (Esc)"
                      aria-label="Cancel editing"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      className="p-1.5 rounded hover:bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)]"
                      title="Save & Resend (Enter)"
                      aria-label="Save and resend message"
                    >
                      <Check size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : displayContent && (
                <ContentRenderer
                  content={displayContent}
                  useMarkdown={renderMarkdownUser}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Assistant message - left-aligned with different styling
  // Always render assistant messages through markdown for consistent formatting
  // This ensures code blocks, lists, tables, and other formatting are properly displayed
  const renderMarkdown = Boolean(displayContent);

  const isSummaryMessage = Boolean(message.isSummary);

  return (
    <div 
      className={cn(
        'py-2 group relative font-mono',
        'transition-all duration-200',
        // Search highlighting
        isSearchMatch && 'bg-[var(--color-warning)]/10 rounded-lg',
        isCurrentSearchMatch && 'ring-2 ring-[var(--color-warning)] ring-offset-1 ring-offset-[var(--color-surface-base)]'
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      data-message-id={message.id}
    >
      <div className="flex justify-start">
        <div className="w-full min-w-0 max-w-full overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 text-[10px] mb-1">
            <div className="min-w-0 flex items-center gap-2 font-mono overflow-hidden">
              <span className={cn(
                'text-[11px] transition-all',
                isStreaming
                  ? 'text-[var(--color-warning)] animate-pulse'
                  : 'text-[var(--color-info)]'
              )}>
                {'>'}
              </span>
              <span className={cn(
                'font-medium transition-colors',
                isStreaming
                  ? 'text-[var(--color-warning)]'
                  : 'text-[var(--color-info)]'
              )}>
                <span title={message.modelId ? `model: ${message.modelId}` : undefined}>
                  vyotiq
                </span>
              </span>
              <span className="text-[var(--color-text-placeholder)]">[{timeStr}]</span>
              {/* Task-based routing indicator - show badge on larger screens */}
              {routingInfo && routingInfo.provider && (
                <span className="hidden sm:inline-flex">
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
                </span>
              )}
              {isSummaryMessage && (
                <span className="text-[var(--color-accent-secondary)] hidden sm:inline">• summary</span>
              )}
              {tokenSummary && (
                <span className="text-[var(--color-text-dim)] truncate hidden sm:inline" title={tokenSummary.tooltip}>• {tokenSummary.text}</span>
              )}
            </div>

            {displayContent && (
              <div className="flex items-center gap-1">
                {/* Reaction buttons */}
                {onReaction && !isStreaming && (
                  <>
                    <button
                      onClick={() => handleReaction('up')}
                      className={cn(
                        'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 p-1 text-[9px] transition-all duration-150 rounded',
                        reaction === 'up'
                          ? 'text-[var(--color-success)] bg-[var(--color-success)]/10'
                          : 'text-[var(--color-text-placeholder)] hover:text-[var(--color-success)] hover:bg-[var(--color-surface-2)]/50'
                      )}
                      title="Good response"
                      aria-label="Rate as good response"
                      aria-pressed={reaction === 'up'}
                    >
                      <ThumbsUp size={10} />
                    </button>
                    <button
                      onClick={() => handleReaction('down')}
                      className={cn(
                        'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 p-1 text-[9px] transition-all duration-150 rounded',
                        reaction === 'down'
                          ? 'text-[var(--color-error)] bg-[var(--color-error)]/10'
                          : 'text-[var(--color-text-placeholder)] hover:text-[var(--color-error)] hover:bg-[var(--color-surface-2)]/50'
                      )}
                      title="Poor response"
                      aria-label="Rate as poor response"
                      aria-pressed={reaction === 'down'}
                    >
                      <ThumbsDown size={10} />
                    </button>
                  </>
                )}
                {onFork && !isStreaming && (
                  <button
                    onClick={() => onFork(message.id)}
                    className={cn(
                      'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 p-1 text-[9px] transition-all duration-150',
                      'text-[var(--color-text-placeholder)] hover:text-[var(--color-info)] hover:bg-[var(--color-surface-2)]/50 rounded'
                    )}
                    title="fork from here"
                  >
                    <GitBranch size={10} />
                  </button>
                )}
                <button
                  onClick={handleCopy}
                  className={cn(
                    'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 px-1.5 py-0.5 text-[9px] transition-all duration-150',
                    'text-[var(--color-text-placeholder)] hover:text-[var(--color-info)] hover:bg-[var(--color-surface-2)]/50 rounded',
                    // Prevent layout shift when label toggles between "copy" and "copied"
                    'min-w-[52px] text-right'
                  )}
                  title="copy response"
                >
                  {copied ? <span className="text-[var(--color-success)]">copied</span> : 'copy'}
                </button>
              </div>
            )}
          </div>

          {/* Align assistant content/tools to a shared gutter */}
          <div className="ml-3 min-w-0">
            {/* Thinking Panel - shows model's reasoning process */}
            {(message.thinking || message.isThinkingStreaming) && (
              <ThinkingPanel
                thinking={message.thinking || ''}
                isStreaming={message.isThinkingStreaming}
                modelName={getThinkingModelName(message.modelId)}
                defaultCollapsed={!message.isThinkingStreaming} // Expand while streaming
              />
            )}

            {/* Response content area */}
            <div className={cn(
              'px-3 py-2 border-l-2 transition-all duration-200 rounded-r break-words overflow-hidden',
              'bg-[var(--color-surface-1)]/20 min-w-0',
              isStreaming 
                ? 'border-[var(--color-warning)]/50' 
                : 'border-[var(--color-info)]/20',
              isHovered && !isStreaming && 'border-[var(--color-info)]/40 bg-[var(--color-surface-1)]/30'
            )}>
              {isSummaryMessage ? (
                <details className="group">
                  <summary className={cn(
                    'cursor-pointer select-none list-none',
                    'text-[10px] font-mono text-[var(--color-text-muted)]',
                    'flex items-center justify-between gap-2'
                  )}>
                    <span className="truncate">Summary message (context compression)</span>
                    <span className="text-[var(--color-text-dim)] group-open:hidden">show</span>
                    <span className="text-[var(--color-text-dim)] hidden group-open:inline">hide</span>
                  </summary>
                  <div className="pt-2">
                    {displayContent && (
                      <ContentRenderer
                        content={displayContent}
                        useMarkdown={renderMarkdown}
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
                    onRunCode={onRunCode}
                    onInsertCode={onInsertCode}
                  />
                  {!isExpanded && (
                    <div className="mt-1 text-[var(--color-text-muted)] text-[10px]">...</div>
                  )}
                  <button
                    onClick={handleToggleExpand}
                    className={cn(
                      'mt-2 flex items-center gap-1 px-2 py-1 rounded text-[10px]',
                      'text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/10',
                      'transition-colors'
                    )}
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp size={12} />
                        <span>Show less</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown size={12} />
                        <span>Show more ({Math.round((displayContent.length - collapsedContent.length) / 100) * 100}+ chars)</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                displayContent && (
                  <ContentRenderer
                    content={displayContent}
                    useMarkdown={renderMarkdown}
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

            {/* Streaming indicator */}
            {isStreaming && !displayContent && !message.isThinkingStreaming && (
              <div className="mt-1 px-3 border-l-2 border-[var(--color-warning)]/40">
                <div className="flex items-center gap-1.5 text-[var(--color-text-muted)] text-[10px] py-1">
                  <span className="inline-block w-1.5 h-1.5 bg-[var(--color-warning)]/60 animate-pulse rounded-full" aria-hidden="true" />
                  <span className="text-[var(--color-text-placeholder)]">receiving...</span>
                </div>
              </div>
            )}
          </div>
        </div>
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
  onRunCode?: (code: string, language: string) => void;
  onInsertCode?: (code: string, language: string) => void;
}> = memo(({ content, useMarkdown, onRunCode, onInsertCode }) => {
  if (useMarkdown) {
    return (
      <React.Suspense
        fallback={
          <div className="text-[12px] text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap break-words">
            {content}
          </div>
        }
      >
        <LazyMarkdownRenderer 
          content={content} 
          onRunCode={onRunCode} 
          onInsertCode={onInsertCode}
          interactive
        />
      </React.Suspense>
    );
  }
  
  return (
    <div className="text-[12px] text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap break-words">
      {content}
    </div>
  );
});

ContentRenderer.displayName = 'ContentRenderer';

export const MessageLine = memo(MessageLineComponent);
