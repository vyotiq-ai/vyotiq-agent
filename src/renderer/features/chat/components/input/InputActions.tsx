/**
 * Input Actions Component
 * 
 * Run/Kill button with terminal styling and keyboard shortcuts.
 * Handles send, stop, and loading states.
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
import React, { memo } from 'react';
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

const KillButton: React.FC<{ onStop: () => void }> = memo(({ onStop }) => (
    <button
      type="button"
      onClick={onStop}
      className={cn(
        'terminal-btn terminal-kill-btn',
        'flex items-center gap-1 px-2 py-1 rounded',
        'bg-[var(--color-error)]/15 text-[var(--color-error)]',
        'border border-[var(--color-error)]/20',
        'hover:bg-[var(--color-error)]/25 hover:border-[var(--color-error)]/30',
        'active:bg-[var(--color-error)]/30',
        'transition-all duration-150 text-[10px] font-mono',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
      )}
      title="Kill process (ESC)"
      aria-label="Stop running process. Press Escape key as shortcut."
    >
      <Square size={9} fill="currentColor" aria-hidden="true" />
      <span className="font-medium">kill</span>
      <kbd 
        className="ml-1 px-1 py-0.5 text-[8px] bg-[var(--color-error)]/15 rounded opacity-70" 
        aria-hidden="true"
      >
        ESC
      </kbd>
    </button>
));
KillButton.displayName = 'KillButton';

// =============================================================================
// Run Button Component
// =============================================================================

interface RunButtonProps {
  canSend: boolean;
  isSending: boolean;
  onSend: () => void;
}

const RunButton: React.FC<RunButtonProps> = memo(({ canSend, isSending, onSend }) => (
  <button
    type="button"
    onClick={onSend}
    disabled={!canSend || isSending}
    className={cn(
      'terminal-btn terminal-run-btn',
      'flex items-center gap-1 px-2 py-1 rounded',
      'transition-all duration-150 text-[10px] font-mono',
      'border',
      canSend
        ? cn(
            'ready',
            'bg-[var(--color-accent-primary)]/15 text-[var(--color-accent-primary)]',
            'border-[var(--color-accent-primary)]/20',
            'hover:bg-[var(--color-accent-primary)]/25 hover:border-[var(--color-accent-primary)]/30',
            'active:bg-[var(--color-accent-primary)]/30'
          )
        : cn(
            'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]',
            'border-[var(--color-border-subtle)]',
            'cursor-not-allowed opacity-60'
          ),
      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
    )}
    aria-label={isSending ? 'Message sending' : 'Send message'}
    aria-busy={isSending}
  >
    {isSending ? (
      <>
        <Loader2 size={9} className="animate-spin" aria-hidden="true" />
        <span className="font-medium">running</span>
      </>
    ) : (
      <>
        <Play size={9} fill="currentColor" aria-hidden="true" />
        <span className="font-medium">run</span>
      </>
    )}
  </button>
));
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
  <div className={cn('flex-shrink-0', className)}>
    {isRunning ? (
      <KillButton onStop={onStop} />
    ) : (
      <RunButton canSend={canSend} isSending={isSending} onSend={onSend} />
    )}
  </div>
));

InputActions.displayName = 'InputActions';
