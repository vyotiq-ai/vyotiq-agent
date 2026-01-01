/**
 * Input Textarea Component
 * 
 * Terminal-styled textarea with blinking cursor and auto-resize.
 * Spell-check disabled to prevent red underlines on file paths.
 */
import React, { memo, useState, useEffect, useCallback, forwardRef } from 'react';
import { cn } from '../../../../utils/cn';

// =============================================================================
// Types
// =============================================================================

export interface InputTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onPaste?: (e: React.ClipboardEvent) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onSelectionChange?: (position: number) => void;
  placeholder?: string;
  noWorkspacePlaceholder?: string;
  disabled?: boolean;
  hasWorkspace?: boolean;
  className?: string;
  maxHeight?: number;
  ariaDescribedBy?: string;
}

// =============================================================================
// Blinking Cursor Component
// =============================================================================

const BlinkingCursor: React.FC<{ visible: boolean }> = memo(({ visible }) => (
  <span 
    className={cn(
      'absolute left-0 top-0 w-2 h-5 bg-[var(--color-accent-primary)] transition-opacity',
      visible ? 'opacity-100' : 'opacity-0'
    )}
    aria-hidden="true"
  />
));
BlinkingCursor.displayName = 'BlinkingCursor';

// =============================================================================
// Placeholder Text Component
// =============================================================================

const PlaceholderText: React.FC<{ text: string; show: boolean }> = memo(({ text, show }) => {
  if (!show) return null;
  return (
    <span 
      className="absolute left-0 top-0 text-xs text-[var(--color-text-muted)] pointer-events-none"
      aria-hidden="true"
    >
      {text}
    </span>
  );
});
PlaceholderText.displayName = 'PlaceholderText';

// =============================================================================
// Main Component
// =============================================================================

export const InputTextarea = memo(forwardRef<HTMLTextAreaElement, InputTextareaProps>(({
  value,
  onChange,
  onKeyDown,
  onPaste,
  onFocus,
  onBlur,
  onSelectionChange,
  placeholder = 'describe what to do…',
  noWorkspacePlaceholder = 'select a workspace to start…',
  disabled = false,
  hasWorkspace = true,
  className,
  maxHeight = 160,
  ariaDescribedBy,
}, ref) => {
  const [isFocused, setIsFocused] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);
  
  useEffect(() => {
    if (!isFocused || value.length > 0) {
      setCursorVisible(false);
      return;
    }
    const interval = setInterval(() => setCursorVisible(v => !v), 530);
    return () => clearInterval(interval);
  }, [isFocused, value.length]);
  
  const handleFocus = useCallback(() => {
    setIsFocused(true);
    onFocus?.();
  }, [onFocus]);
  
  const handleBlur = useCallback(() => {
    setIsFocused(false);
    onBlur?.();
  }, [onBlur]);
  
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    onSelectionChange?.(e.target.selectionStart ?? e.target.value.length);
  }, [onChange, onSelectionChange]);

  const handleSelect = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    onSelectionChange?.(target.selectionStart ?? 0);
  }, [onSelectionChange]);
  
  const displayPlaceholder = hasWorkspace ? placeholder : noWorkspacePlaceholder;
  const showPlaceholder = !isFocused && value.length === 0;
  const showCursor = isFocused && value.length === 0;
  
  return (
    <div className={cn('relative flex items-start gap-0 px-2 py-1.5 min-w-0 overflow-hidden', className)}>
      <div className="flex-1 relative min-h-[20px] min-w-0 overflow-hidden">
        <textarea
          ref={ref}
          data-chat-input
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          className={cn(
            'w-full bg-transparent text-[var(--color-text-primary)] text-xs leading-relaxed',
            'min-h-[20px] resize-none',
            'outline-none caret-[var(--color-accent-primary)]',
            'scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)]',
            'font-mono',
            !hasWorkspace && 'cursor-not-allowed opacity-50'
          )}
          style={{ maxHeight: `${maxHeight}px` }}
          placeholder=""
          rows={1}
          value={value}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          onKeyUp={handleSelect}
          onClick={handleSelect}
          onSelect={handleSelect}
          onPaste={onPaste}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled || !hasWorkspace}
          aria-label="Message input"
          aria-describedby={ariaDescribedBy}
          aria-disabled={disabled || !hasWorkspace}
        />
        {showCursor && <BlinkingCursor visible={cursorVisible} />}
        <PlaceholderText text={displayPlaceholder} show={showPlaceholder} />
      </div>
    </div>
  );
}));

InputTextarea.displayName = 'InputTextarea';
