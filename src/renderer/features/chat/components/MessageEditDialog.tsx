/**
 * Message Edit Dialog Component
 * 
 * Modal dialog for editing user messages using the existing
 * prompt input styling for consistency.
 */
import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { X, Send, RotateCcw } from 'lucide-react';
import { cn } from '../../../utils/cn';

interface MessageEditDialogProps {
  isOpen: boolean;
  originalContent: string;
  onSave: (newContent: string) => void;
  onCancel: () => void;
}

export const MessageEditDialog: React.FC<MessageEditDialogProps> = memo(({
  isOpen,
  originalContent,
  onSave,
  onCancel,
}) => {
  const [content, setContent] = useState(originalContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);

  // Reset content when dialog opens
  useEffect(() => {
    if (isOpen) {
      setContent(originalContent);
      // Focus textarea after a brief delay
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(originalContent.length, originalContent.length);
      }, 50);
    }
  }, [isOpen, originalContent]);

  // Blinking cursor effect
  useEffect(() => {
    if (!isFocused || content.length > 0) {
      setCursorVisible(false);
      return;
    }
    const interval = setInterval(() => {
      setCursorVisible(v => !v);
    }, 530);
    return () => clearInterval(interval);
  }, [isFocused, content.length]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 300)}px`;
    }
  }, [content]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (content.trim() && content !== originalContent) {
        onSave(content.trim());
      }
    } else if (e.key === 'Escape') {
      onCancel();
    }
  }, [content, originalContent, onSave, onCancel]);

  const handleReset = useCallback(() => {
    setContent(originalContent);
    textareaRef.current?.focus();
  }, [originalContent]);

  const hasChanges = content.trim() !== originalContent;
  const canSave = content.trim().length > 0 && hasChanges;

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div 
        className={cn(
          "w-full max-w-2xl mx-4",
          "animate-in zoom-in-95 duration-150"
        )}
      >
        {/* Terminal-style container */}
        <div className={cn(
          "terminal-container relative",
          "bg-[var(--color-surface-editor)]",
          "rounded-lg overflow-hidden",
          "border border-[var(--color-border-subtle)]",
          "font-mono",
          "shadow-[0_4px_20px_-4px_rgba(0,0,0,0.3)]"
        )}>
          {/* Header bar */}
          <div className={cn(
            "flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)]",
            "bg-[var(--color-surface-header)]"
          )}>
            <div className="flex items-center gap-2">
              {/* Traffic light dots */}
              <div className="flex items-center gap-1">
                <button
                  onClick={onCancel}
                  className={cn(
                    'w-2.5 h-2.5 rounded-full transition-colors',
                    'bg-[var(--color-error)]/70 hover:bg-[var(--color-error)]'
                  )}
                  title="Cancel (Esc)"
                />
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-warning)]/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-success)]/70" />
              </div>
              <span className="text-[10px] text-[var(--color-text-muted)]">
                edit message
              </span>
            </div>
            <div className="flex items-center gap-2">
              {hasChanges && (
                <span className="text-[9px] text-[var(--color-warning)]">• unsaved</span>
              )}
              <button
                onClick={onCancel}
                className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
                title="Cancel"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Editor area */}
          <div className="relative flex items-start gap-0 px-3 py-3">
            {/* Prompt symbol */}
            <span className={cn(
              "terminal-prompt mr-2 mt-px text-xs",
              isFocused ? "text-[var(--color-accent-primary)]" : "text-[var(--color-text-muted)]"
            )}>
              λ
            </span>

            {/* Input wrapper */}
            <div className="flex-1 relative min-h-[60px]">
              <textarea
                ref={textareaRef}
                className={cn(
                  "w-full bg-transparent text-[var(--color-text-primary)] text-xs leading-relaxed",
                  "min-h-[60px] max-h-[300px] resize-none",
                  "outline-none placeholder-[var(--color-text-placeholder)] caret-[var(--color-accent-primary)]",
                  "scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)]",
                  "font-mono"
                )}
                placeholder="Edit your message..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
              />
              {/* Blinking cursor when empty and focused */}
              {isFocused && content.length === 0 && (
                <span className={cn(
                  "absolute left-0 top-0 w-2 h-5 bg-[var(--color-accent-primary)] transition-opacity",
                  cursorVisible ? "opacity-100" : "opacity-0"
                )} />
              )}
            </div>
          </div>

          {/* Footer / Action bar */}
          <div className="flex items-center justify-between px-3 py-2 bg-[var(--color-surface-header)] border-t border-[var(--color-border-subtle)]">
            <div className="flex items-center gap-2 text-[9px] text-[var(--color-text-muted)]">
              <span>⏎ save</span>
              <span>⇧⏎ newline</span>
              <span>Esc cancel</span>
            </div>
            <div className="flex items-center gap-2">
              {/* Reset button */}
              {hasChanges && (
                <button
                  onClick={handleReset}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded text-[10px]",
                    "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
                    "hover:bg-[var(--color-surface-2)] transition-colors"
                  )}
                  title="Reset to original"
                >
                  <RotateCcw size={10} />
                  <span>reset</span>
                </button>
              )}
              
              {/* Save button */}
              <button
                onClick={() => canSave && onSave(content.trim())}
                disabled={!canSave}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded text-[10px] transition-all",
                  canSave
                    ? "bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/30"
                    : "bg-[var(--color-surface-2)] text-[var(--color-text-muted)] cursor-not-allowed"
                )}
              >
                <Send size={10} />
                <span>save & resend</span>
              </button>
            </div>
          </div>
        </div>

        {/* Info text */}
        <p className="text-center mt-2 text-[9px] text-[var(--color-text-dim)]">
          Editing will resend from this point, removing later messages
        </p>
      </div>
    </div>
  );
});

MessageEditDialog.displayName = 'MessageEditDialog';

export default MessageEditDialog;
