/**
 * Input Textarea Component
 * 
 * Terminal-styled textarea with lambda prompt, blinking cursor,
 * auto-resize functionality, and inline autocomplete ghost text.
 * 
 * @example
 * <InputTextarea
 *   value={message}
 *   onChange={setMessage}
 *   onKeyDown={handleKeyDown}
 *   placeholder="type a command..."
 *   disabled={false}
 *   ghostText="plement a binary search"
 * />
 */
import React, { memo, useState, useEffect, useCallback, forwardRef } from 'react';
import { cn } from '../../../../utils/cn';
import { GhostText } from './GhostText';

// =============================================================================
// Types
// =============================================================================

export interface InputTextareaProps {
  /** Current message value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Key down handler */
  onKeyDown?: (e: React.KeyboardEvent) => void;
  /** Paste handler */
  onPaste?: (e: React.ClipboardEvent) => void;
  /** Focus handler */
  onFocus?: () => void;
  /** Blur handler */
  onBlur?: () => void;
  /** Selection/cursor change handler */
  onSelectionChange?: (position: number) => void;
  /** Placeholder text */
  placeholder?: string;
  /** No workspace placeholder */
  noWorkspacePlaceholder?: string;
  /** Whether input is disabled */
  disabled?: boolean;
  /** Whether workspace is available */
  hasWorkspace?: boolean;
  /** Additional className */
  className?: string;
  /** Max height for textarea */
  maxHeight?: number;
  /** Whether to show prompt symbol */
  showPrompt?: boolean;
  /** Custom prompt symbol */
  promptSymbol?: string;
  /** Optional aria-describedby target id */
  ariaDescribedBy?: string;
  /** Ghost text suggestion for autocomplete */
  ghostText?: string | null;
  /** Whether autocomplete is loading */
  ghostTextLoading?: boolean;
  /** Whether to show Tab hint for ghost text */
  showGhostTextHint?: boolean;
  /** Provider that generated the suggestion (for tooltip) */
  ghostTextProvider?: string;
  /** Latency in ms (for tooltip) */
  ghostTextLatencyMs?: number;
}

// =============================================================================
// Prompt Symbol Component
// =============================================================================

const PromptSymbol: React.FC<{ 
  isFocused: boolean; 
  symbol?: string;
}> = memo(({ isFocused, symbol = 'λ' }) => (
  <span 
    className={cn(
      'terminal-prompt mr-2 mt-px select-none',
      isFocused ? 'focused' : 'idle'
    )}
    aria-hidden="true"
  >
    {symbol}
  </span>
));
PromptSymbol.displayName = 'PromptSymbol';

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

const PlaceholderText: React.FC<{ 
  text: string; 
  show: boolean;
}> = memo(({ text, show }) => {
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
  showPrompt = true,
  promptSymbol = 'λ',
  ariaDescribedBy,
  ghostText,
  ghostTextLoading = false,
  showGhostTextHint = true,
  ghostTextProvider,
  ghostTextLatencyMs,
}, ref) => {
  const [isFocused, setIsFocused] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);
  
  // Blinking cursor effect when focused and empty
  useEffect(() => {
    if (!isFocused || value.length > 0) {
      setCursorVisible(false);
      return;
    }
    
    const interval = setInterval(() => {
      setCursorVisible(v => !v);
    }, 530);
    
    return () => clearInterval(interval);
  }, [isFocused, value.length]);
  
  // Focus handlers
  const handleFocus = useCallback(() => {
    setIsFocused(true);
    onFocus?.();
  }, [onFocus]);
  
  const handleBlur = useCallback(() => {
    setIsFocused(false);
    onBlur?.();
  }, [onBlur]);
  
  // Change handler
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    // Report cursor position after change
    onSelectionChange?.(e.target.selectionStart ?? e.target.value.length);
  }, [onChange, onSelectionChange]);

  // Handle selection changes (click, arrow keys)
  const handleSelect = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    onSelectionChange?.(target.selectionStart ?? 0);
  }, [onSelectionChange]);
  
  // Determine placeholder text
  const displayPlaceholder = hasWorkspace ? placeholder : noWorkspacePlaceholder;
  const showPlaceholder = !isFocused && value.length === 0;
  const showCursor = isFocused && value.length === 0;
  
  // Show ghost text only when focused and has suggestion
  const showGhostText = isFocused && (ghostText || ghostTextLoading);
  
  return (
    <div className={cn('relative flex items-start gap-0 px-2 py-1.5 min-w-0 overflow-hidden', className)}>
      {/* Prompt symbol */}
      {showPrompt && (
        <PromptSymbol isFocused={isFocused} symbol={promptSymbol} />
      )}
      
      {/* Input wrapper */}
      <div className="flex-1 relative min-h-[20px] min-w-0 overflow-hidden">
        {/* Ghost text overlay - positioned absolutely to overlay the textarea */}
        {showGhostText && (
          <div 
            className="absolute left-0 top-0 right-0 pointer-events-none overflow-hidden"
            style={{ maxHeight: `${maxHeight}px` }}
            aria-hidden="true"
          >
            {/* Invisible text to match cursor position */}
            <span className="invisible whitespace-pre-wrap text-xs leading-relaxed font-mono">
              {value}
            </span>
            {/* Ghost text suggestion */}
            <GhostText 
              suggestion={ghostText}
              isLoading={ghostTextLoading}
              showHint={showGhostTextHint}
              provider={ghostTextProvider}
              latencyMs={ghostTextLatencyMs}
              className="text-xs leading-relaxed"
            />
          </div>
        )}
        
        <textarea
          ref={ref}
          data-chat-input
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
        
        {/* Blinking cursor when empty and focused */}
        {showCursor && <BlinkingCursor visible={cursorVisible} />}
        
        {/* Placeholder text */}
        <PlaceholderText text={displayPlaceholder} show={showPlaceholder} />
      </div>
    </div>
  );
}));

InputTextarea.displayName = 'InputTextarea';
