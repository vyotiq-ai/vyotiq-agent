/**
 * MessageEditDialog Component
 * 
 * A dialog for editing a previously sent user message.
 * Allows the user to modify the content and resubmit,
 * which branches the conversation from the edited message.
 */
import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import { X, CornerDownLeft } from 'lucide-react';
import { cn } from '../../../utils/cn';

interface MessageEditDialogProps {
  /** The message ID being edited */
  messageId: string;
  /** Original content of the message */
  originalContent: string;
  /** Callback when the edit is submitted */
  onSubmit: (messageId: string, newContent: string) => void;
  /** Callback to close the dialog */
  onClose: () => void;
  /** Additional CSS class */
  className?: string;
}

const MessageEditDialogInternal: React.FC<MessageEditDialogProps> = ({
  messageId,
  originalContent,
  onSubmit,
  onClose,
  className,
}) => {
  const [content, setContent] = useState(originalContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus and select content on mount
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 300)}px`;
    }
  }, [content]);

  const handleSubmit = useCallback(() => {
    const trimmed = content.trim();
    if (trimmed && trimmed !== originalContent) {
      onSubmit(messageId, trimmed);
    }
    onClose();
  }, [content, originalContent, messageId, onSubmit, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }, [onClose, handleSubmit]);

  const isUnchanged = content.trim() === originalContent;

  return (
    <div
      className={cn(
        'rounded border font-mono',
        'bg-[var(--color-surface-1)] border-[var(--color-border-subtle)]',
        'shadow-sm',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-[var(--color-border-subtle)]">
        <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">
          edit message
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          aria-label="Cancel edit"
        >
          <X size={10} />
        </button>
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={e => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        className={cn(
          'w-full px-2 py-1.5 bg-transparent resize-none outline-none',
          'text-[11px] leading-relaxed',
          'text-[var(--color-text-primary)]',
          'min-h-[40px] max-h-[300px]',
        )}
        spellCheck={false}
      />

      {/* Footer */}
      <div className="flex items-center justify-between px-2 py-1 border-t border-[var(--color-border-subtle)]">
        <span className="text-[9px] text-[var(--color-text-dim)]">
          {isUnchanged ? 'no changes' : 'ctrl+enter to submit'}
        </span>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!content.trim() || isUnchanged}
          className={cn(
            'flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px]',
            'transition-colors duration-100',
            isUnchanged
              ? 'text-[var(--color-text-dim)] cursor-not-allowed'
              : 'text-[var(--color-accent-primary)] hover:bg-[var(--color-surface-2)]',
          )}
        >
          <CornerDownLeft size={9} />
          submit
        </button>
      </div>
    </div>
  );
};

export const MessageEditDialog = memo(MessageEditDialogInternal);
MessageEditDialog.displayName = 'MessageEditDialog';
