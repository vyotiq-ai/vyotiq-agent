/**
 * Input Textarea Component
 * 
 * Terminal-styled textarea with blinking cursor and auto-resize.
 * Spell-check disabled to prevent red underlines on file paths.
 * 
 * Features:
 * - Smooth auto-resize using ResizeObserver
 * - Terminal-style blinking cursor for empty state
 * - Debounced selection change events
 * - Character count tracking
 * - Accessibility support with ARIA attributes
 */
import React, { memo, useState, useEffect, useCallback, forwardRef, useRef, useLayoutEffect } from 'react';
import { cn } from '../../../../utils/cn';

// Debounce delay for selection changes (ms) - reduces re-renders during fast typing
const SELECTION_DEBOUNCE_MS = 50;

// Minimum number of rows for the textarea
const MIN_ROWS = 1;

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
  /** Maximum character limit (optional) */
  maxLength?: number;
  /** Show character count when approaching limit */
  showCharCount?: boolean;
}

// =============================================================================
// Blinking Cursor Component
// =============================================================================

const BlinkingCursor: React.FC<{ visible: boolean }> = memo(({ visible }) => (
  <span 
    className={cn(
      'absolute left-0 top-0.5 w-[6px] h-[14px] rounded-[1px]',
      'bg-[var(--color-accent-primary)]',
      'transition-opacity duration-100 ease-in-out',
      visible ? 'opacity-100' : 'opacity-15'
    )}
    style={{ willChange: 'opacity' }}
    aria-hidden="true"
  />
));
BlinkingCursor.displayName = 'BlinkingCursor';

// =============================================================================
// Placeholder Text Component
// =============================================================================

const PlaceholderText: React.FC<{ text: string; show: boolean; disabled?: boolean }> = memo(({ text, show, disabled }) => (
  <span 
    className={cn(
      'absolute left-0 top-0 text-xs pointer-events-none select-none truncate max-w-full',
      'transition-all duration-200 ease-out',
      show ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-0.5',
      disabled 
        ? 'text-[var(--color-text-dim)]' 
        : 'text-[var(--color-text-muted)]'
    )}
    aria-hidden="true"
  >
    {text}
  </span>
));
PlaceholderText.displayName = 'PlaceholderText';

// =============================================================================
// Character Count Component
// =============================================================================

interface CharCountProps {
  current: number;
  max: number;
  visible: boolean;
}

const CharCount: React.FC<CharCountProps> = memo(({ current, max, visible }) => {
  const remaining = max - current;
  const isWarning = remaining < 100;
  const isError = remaining < 0;
  const isCritical = remaining < 20;
  
  return (
    <span 
      className={cn(
        'absolute right-0 bottom-0 text-[9px] tabular-nums font-mono',
        'transition-all duration-200 ease-out',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
        isError ? 'text-[var(--color-error)] font-semibold' : 
        isCritical ? 'text-[var(--color-error)]/80' :
        isWarning ? 'text-[var(--color-warning)]' : 
        'text-[var(--color-text-dim)]'
      )}
      aria-live="polite"
      aria-atomic="true"
    >
      {remaining}
    </span>
  );
});
CharCount.displayName = 'CharCount';

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
  maxLength,
  showCharCount = false,
}, ref) => {
  const [isFocused, setIsFocused] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = (ref as React.RefObject<HTMLTextAreaElement>) || internalRef;
  
  // Blinking cursor effect - only when focused and empty
  useEffect(() => {
    if (!isFocused || value.length > 0) {
      setCursorVisible(false);
      return;
    }
    const interval = setInterval(() => setCursorVisible(v => !v), 530);
    return () => clearInterval(interval);
  }, [isFocused, value.length]);
  
  // Auto-resize textarea based on content
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    // Reset height to auto to get proper scrollHeight
    textarea.style.height = 'auto';
    
    // Calculate new height, respecting min and max
    const scrollHeight = textarea.scrollHeight;
    const minHeight = 20; // MIN_ROWS * line-height approximately
    const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
    
    textarea.style.height = `${newHeight}px`;
    
    // Add overflow-y auto when content exceeds maxHeight
    textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [value, maxHeight, textareaRef]);
  
  const handleFocus = useCallback(() => {
    setIsFocused(true);
    onFocus?.();
  }, [onFocus]);
  
  const handleBlur = useCallback(() => {
    setIsFocused(false);
    onBlur?.();
  }, [onBlur]);
  
  // Debounce selection changes to reduce re-renders during fast typing
  const selectionTimeoutRef = useRef<number | null>(null);
  
  const debouncedSelectionChange = useCallback((position: number) => {
    if (selectionTimeoutRef.current) {
      clearTimeout(selectionTimeoutRef.current);
    }
    selectionTimeoutRef.current = window.setTimeout(() => {
      onSelectionChange?.(position);
    }, SELECTION_DEBOUNCE_MS);
  }, [onSelectionChange]);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
      }
    };
  }, []);
  
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    let newValue = e.target.value;
    
    // Enforce maxLength if specified
    if (maxLength && newValue.length > maxLength) {
      newValue = newValue.slice(0, maxLength);
    }
    
    onChange(newValue);
    // Debounce selection change during typing
    debouncedSelectionChange(e.target.selectionStart ?? newValue.length);
  }, [onChange, debouncedSelectionChange, maxLength]);

  const handleSelect = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    debouncedSelectionChange(target.selectionStart ?? 0);
  }, [debouncedSelectionChange]);
  
  const displayPlaceholder = hasWorkspace ? placeholder : noWorkspacePlaceholder;
  const showPlaceholder = !isFocused && value.length === 0;
  const showCursor = isFocused && value.length === 0;
  
  // Show character count when approaching limit (last 500 chars)
  const shouldShowCharCount = showCharCount && maxLength && (maxLength - value.length) < 500;
  
  return (
    <div className={cn('relative flex items-start gap-0 px-1.5 py-1 min-w-0 overflow-hidden', className)}>
      <div className="flex-1 relative min-h-[20px] min-w-0 overflow-hidden">
        <textarea
          ref={textareaRef}
          data-chat-input
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          className={cn(
            'w-full bg-transparent text-[var(--color-text-primary)] text-xs leading-relaxed',
            'min-h-[20px] resize-none',
            'outline-none caret-[var(--color-accent-primary)]',
            'scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent',
            'font-mono',
            'transition-[height] duration-100 ease-out',
            !hasWorkspace && 'cursor-not-allowed opacity-50'
          )}
          style={{ 
            maxHeight: `${maxHeight}px`,
            overflowY: 'hidden', // Controlled by useLayoutEffect
          }}
          placeholder=""
          rows={MIN_ROWS}
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
          aria-multiline="true"
          maxLength={maxLength}
        />
        {showCursor && <BlinkingCursor visible={cursorVisible} />}
        <PlaceholderText text={displayPlaceholder} show={showPlaceholder || (value.length === 0)} disabled={disabled || !hasWorkspace} />
        {maxLength && (
          <CharCount 
            current={value.length} 
            max={maxLength} 
            visible={shouldShowCharCount ?? false} 
          />
        )}
      </div>
    </div>
  );
}));

InputTextarea.displayName = 'InputTextarea';
