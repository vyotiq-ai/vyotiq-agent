/**
 * Message Actions Component
 * 
 * Enhanced action buttons for messages with terminal-style design.
 * Provides copy, edit, fork, and reaction functionality.
 */
import React, { memo, useState, useCallback } from 'react';
import { Copy, Edit3, GitBranch, ThumbsUp, ThumbsDown, Check, Play, FileCode } from 'lucide-react';
import { cn } from '../../../utils/cn';

interface MessageActionsProps {
  messageId: string;
  content: string;
  role: 'user' | 'assistant' | 'tool';
  canEdit?: boolean;
  canFork?: boolean;
  canReact?: boolean;
  reaction?: 'up' | 'down' | null;
  onCopy?: (content: string) => void;
  onEdit?: (messageId: string) => void;
  onFork?: (messageId: string) => void;
  onReact?: (messageId: string, reaction: 'up' | 'down' | null) => void;
  onRunCode?: (code: string) => void;
  onInsertCode?: (code: string) => void;
  className?: string;
}

export const MessageActions: React.FC<MessageActionsProps> = memo(({
  messageId,
  content,
  role,
  canEdit = true,
  canFork = true,
  canReact = true,
  reaction,
  onCopy,
  onEdit,
  onFork,
  onReact,
  onRunCode,
  onInsertCode,
  className,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!onCopy) return;
    await navigator.clipboard.writeText(content);
    onCopy(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content, onCopy]);

  const handleEdit = useCallback(() => {
    onEdit?.(messageId);
  }, [messageId, onEdit]);

  const handleFork = useCallback(() => {
    onFork?.(messageId);
  }, [messageId, onFork]);

  const handleReaction = useCallback((newReaction: 'up' | 'down') => {
    const finalReaction = reaction === newReaction ? null : newReaction;
    onReact?.(messageId, finalReaction);
  }, [messageId, reaction, onReact]);

  // Check if content looks like runnable code
  const isRunnable = /^(npm|yarn|pnpm|bun|node|python|pip|cargo|go|java|javac|gcc|clang)\s+/.test(content.trim()) ||
                    content.includes('#!/bin/') ||
                    /\.(sh|py|js|ts|rb|go|rs|java|c|cpp)$/.test(content);

  return (
    <div className={cn(
      'flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity',
      'text-[var(--color-text-muted)]',
      className
    )}>
      {/* Copy button - always visible */}
      <button
        onClick={handleCopy}
        className={cn(
          'p-1 rounded text-[10px] font-mono flex items-center gap-1',
          'hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-secondary)]',
          'transition-colors',
          copied && 'text-[var(--color-success)]'
        )}
        title={copied ? 'Copied!' : 'Copy'}
      >
        {copied ? <Check size={10} /> : <Copy size={10} />}
        <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
      </button>

      {/* Edit button - for user messages */}
      {canEdit && role === 'user' && (
        <button
          onClick={handleEdit}
          className={cn(
            'p-1 rounded text-[10px] font-mono flex items-center gap-1',
            'hover:bg-[var(--color-surface-2)] hover:text-[var(--color-info)]',
            'transition-colors'
          )}
          title="Edit and resend"
        >
          <Edit3 size={10} />
          <span className="hidden sm:inline">Edit</span>
        </button>
      )}

      {/* Fork button - for assistant messages */}
      {canFork && role === 'assistant' && (
        <button
          onClick={handleFork}
          className={cn(
            'p-1 rounded text-[10px] font-mono flex items-center gap-1',
            'hover:bg-[var(--color-surface-2)] hover:text-[var(--color-warning)]',
            'transition-colors'
          )}
          title="Fork conversation"
        >
          <GitBranch size={10} />
          <span className="hidden sm:inline">Fork</span>
        </button>
      )}

      {/* Run code button - for runnable content */}
      {isRunnable && onRunCode && (
        <button
          onClick={() => onRunCode(content)}
          className={cn(
            'p-1 rounded text-[10px] font-mono flex items-center gap-1',
            'hover:bg-[var(--color-surface-2)] hover:text-[var(--color-success)]',
            'transition-colors'
          )}
          title="Run in terminal"
        >
          <Play size={10} />
          <span className="hidden sm:inline">Run</span>
        </button>
      )}

      {/* Insert code button - for code content */}
      {content.includes('\n') && onInsertCode && (
        <button
          onClick={() => onInsertCode(content)}
          className={cn(
            'p-1 rounded text-[10px] font-mono flex items-center gap-1',
            'hover:bg-[var(--color-surface-2)] hover:text-[var(--color-info)]',
            'transition-colors'
          )}
          title="Insert into file"
        >
          <FileCode size={10} />
          <span className="hidden sm:inline">Insert</span>
        </button>
      )}

      {/* Reaction buttons - for assistant messages */}
      {canReact && role === 'assistant' && (
        <div className="flex items-center gap-0.5 ml-1 border-l border-[var(--color-border-subtle)] pl-1">
          <button
            onClick={() => handleReaction('up')}
            className={cn(
              'p-1 rounded transition-colors',
              reaction === 'up' 
                ? 'text-[var(--color-success)] bg-[var(--color-success)]/10' 
                : 'hover:bg-[var(--color-surface-2)] hover:text-[var(--color-success)]'
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
                ? 'text-[var(--color-error)] bg-[var(--color-error)]/10' 
                : 'hover:bg-[var(--color-surface-2)] hover:text-[var(--color-error)]'
            )}
            title="Poor response"
          >
            <ThumbsDown size={10} />
          </button>
        </div>
      )}
    </div>
  );
});

MessageActions.displayName = 'MessageActions';