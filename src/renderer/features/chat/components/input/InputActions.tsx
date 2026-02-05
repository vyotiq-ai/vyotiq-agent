/**
 * Input Actions Component
 * 
 * Run/Kill button with terminal styling and keyboard shortcuts.
 * Handles send, stop, and loading states with smooth transitions.
 * 
 * Features:
 * - Visual feedback for different states (ready, sending, running)
 * - Keyboard shortcut hints
 * - Accessible with ARIA labels and states
 * - Smooth hover and focus transitions
 * - Pulse animation during running state
 * 
 * @example
 * <InputActions
 *   isRunning={false}
 *   canSend={true}
 *   isSending={false}
 *   onSend={handleSend}
 *   onStop={handleStop}
 * />
 */
import React, { memo, useCallback } from 'react';
import { Play, Square, Loader2 } from 'lucide-react';
import { cn } from '../../../../utils/cn';

// =============================================================================
// Types
// =============================================================================

export interface InputActionsProps {
  /** Whether agent is currently running */
  isRunning: boolean;
  /** Whether send is enabled */
  canSend: boolean;
  /** Whether currently sending */
  isSending: boolean;
  /** Send message handler */
  onSend: () => void;
  /** Stop/cancel handler */
  onStop: () => void;
  /** Additional className */
  className?: string;
}

// =============================================================================
// Kill Button Component
// =============================================================================

const KillButton: React.FC<{ onStop: () => void }> = memo(({ onStop }) => {
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onStop();
  }, [onStop]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'terminal-btn terminal-kill-btn group',
        'flex items-center gap-1 px-2.5 py-1.5 rounded',
        'bg-[var(--color-error)]/15 text-[var(--color-error)]',
        'border border-[var(--color-error)]/30',
        'hover:bg-[var(--color-error)]/25 hover:border-[var(--color-error)]/50',
        'active:bg-[var(--color-error)]/30 active:scale-[0.97]',
        'transition-all duration-150 text-[10px] font-mono',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-error)]/40',
        // Subtle pulse animation when running
        'animate-[pulse-subtle_2s_ease-in-out_infinite]'
      )}
      style={{
        // CSS variable for custom animation
        '--tw-animate-pulse-subtle': 'pulse-subtle',
      } as React.CSSProperties}
      title="Stop running (ESC)"
      aria-label="Stop running process. Press Escape key as shortcut."
    >
      <Square 
        size={10} 
        fill="currentColor" 
        className="group-hover:scale-110 transition-transform duration-150" 
        aria-hidden="true" 
      />
      <span className="font-medium tracking-wide">kill</span>
      <kbd 
        className="ml-0.5 px-1 py-0.5 text-[8px] bg-[var(--color-error)]/20 rounded opacity-60 group-hover:opacity-100 transition-opacity" 
        aria-hidden="true"
      >
        ESC
      </kbd>
    </button>
  );
});
KillButton.displayName = 'KillButton';

// =============================================================================
// Run Button Component
// =============================================================================

interface RunButtonProps {
  canSend: boolean;
  isSending: boolean;
  onSend: () => void;
}

const RunButton: React.FC<RunButtonProps> = memo(({ canSend, isSending, onSend }) => {
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (canSend && !isSending) {
      onSend();
    }
  }, [canSend, isSending, onSend]);

  const isDisabled = !canSend || isSending;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      className={cn(
        'terminal-btn terminal-run-btn group',
        'flex items-center gap-1 px-2.5 py-1.5 rounded',
        'transition-all duration-150 text-[10px] font-mono',
        'border',
        // Enabled state - vibrant and inviting
        canSend && !isSending && cn(
          'ready',
          'bg-[var(--color-accent-primary)]/15 text-[var(--color-accent-primary)]',
          'border-[var(--color-accent-primary)]/30',
          'hover:bg-[var(--color-accent-primary)]/25 hover:border-[var(--color-accent-primary)]/50',
          'hover:shadow-[0_0_8px_rgba(var(--color-accent-primary-rgb),0.15)]',
          'active:bg-[var(--color-accent-primary)]/30 active:scale-[0.97]'
        ),
        // Sending state - muted with spinner
        isSending && cn(
          'bg-[var(--color-surface-2)] text-[var(--color-accent-primary)]/80',
          'border-[var(--color-accent-primary)]/20',
          'cursor-wait'
        ),
        // Disabled state - clearly disabled
        !canSend && !isSending && cn(
          'bg-[var(--color-surface-2)]/50 text-[var(--color-text-dim)]',
          'border-[var(--color-border-subtle)]',
          'cursor-not-allowed opacity-50'
        ),
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]/40'
      )}
      aria-label={
        isSending ? 'Message sending...' : 
        canSend ? 'Send message (Enter)' : 
        'Cannot send - enter a message'
      }
      aria-busy={isSending}
      aria-disabled={isDisabled}
    >
      {isSending ? (
        <>
          <Loader2 
            size={10} 
            className="animate-spin" 
            aria-hidden="true" 
          />
          <span className="font-medium tracking-wide">sending</span>
        </>
      ) : (
        <>
          <Play 
            size={10} 
            fill="currentColor" 
            className={cn(
              'transition-transform duration-150',
              canSend && 'group-hover:scale-110 group-hover:translate-x-0.5'
            )} 
            aria-hidden="true" 
          />
          <span className="font-medium tracking-wide">run</span>
        </>
      )}
    </button>
  );
});
RunButton.displayName = 'RunButton';

// =============================================================================
// Main Component
// =============================================================================

export const InputActions: React.FC<InputActionsProps> = memo(({
  isRunning,
  canSend,
  isSending,
  onSend,
  onStop,
  className,
}) => (
  <div 
    className={cn('flex-shrink-0', className)}
    role="group"
    aria-label="Message actions"
  >
    {isRunning ? (
      <KillButton onStop={onStop} />
    ) : (
      <RunButton canSend={canSend} isSending={isSending} onSend={onSend} />
    )}
  </div>
));

InputActions.displayName = 'InputActions';
