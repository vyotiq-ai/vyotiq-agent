/**
 * Session Welcome Component
 * 
 * Displays a welcome message when a session is active but has no messages yet.
 * Clean terminal aesthetic — no decorative symbols, just terminal flow.
 * Includes quick-start action cards for common tasks.
 * 
 * Performance optimizations:
 * - Memoized component to prevent unnecessary re-renders
 * - Cleanup of intervals on unmount
 * - Stable animation timing
 */
import React, { memo, useState, useEffect, useCallback } from 'react';
import { Bug, Code, FileSearch, Keyboard } from 'lucide-react';
import { SESSION_HINTS } from '../utils/welcomeHints';
import { cn } from '../../../utils/cn';

/**
 * Quick-start action definitions
 */
const QUICK_STARTS = [
  { id: 'fix', label: 'fix a bug', icon: Bug, prompt: 'Help me debug and fix a bug in my codebase. I\'ll describe the issue.' },
  { id: 'explain', label: 'explain code', icon: FileSearch, prompt: 'Explain this codebase architecture and how the major components work together.' },
  { id: 'refactor', label: 'refactor code', icon: Code, prompt: 'Help me refactor and improve the code quality in my project.' },
] as const;

interface SessionWelcomeProps {
  /** Optional callback to pre-fill the chat input */
  onQuickStart?: (prompt: string) => void;
}

const SessionWelcomeComponent: React.FC<SessionWelcomeProps> = ({ onQuickStart }) => {
  const displayedText = SESSION_HINTS[0] ?? 'type a message to begin';
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  const handleQuickStart = useCallback((prompt: string) => {
    if (onQuickStart) {
      onQuickStart(prompt);
    } else {
      // Dispatch a custom event so ChatInput can pick it up without prop drilling
      window.dispatchEvent(new CustomEvent('vyotiq:quick-start', { detail: prompt }));
    }
  }, [onQuickStart]);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] font-mono px-6">
      <div className={cn(
        'text-left max-w-md w-full transition-all duration-300',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
      )}>
        {/* Brand symbol */}
        <div className="flex items-center gap-3 mb-5">
          <span className="text-[var(--color-accent-primary)] text-lg font-semibold leading-none opacity-50">λ</span>
          <span className="text-[12px] text-[var(--color-text-secondary)]/50 tracking-widest uppercase">new session</span>
        </div>

        {/* Hint text */}
        <div className="pl-7 mb-2">
          <div className="text-[10px] text-[var(--color-text-tertiary)]/60 leading-relaxed">
            {displayedText}
          </div>
        </div>

        {/* Quick-start action cards */}
        {onQuickStart && (
          <div className="pl-7 mb-3 flex flex-wrap gap-1.5">
            {QUICK_STARTS.map((qs) => {
              const Icon = qs.icon;
              return (
                <button
                  key={qs.id}
                  type="button"
                  onClick={() => handleQuickStart(qs.prompt)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm',
                    'text-[9px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]',
                    'bg-[var(--color-surface-2)]/40 hover:bg-[var(--color-surface-2)]',
                    'border border-[var(--color-border-subtle)]/30 hover:border-[var(--color-border-subtle)]',
                    'transition-all duration-150',
                    'focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)] focus-visible:outline-none',
                  )}
                >
                  <Icon size={10} className="shrink-0 opacity-60" />
                  {qs.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Input prompt hint */}
        <div className="pl-7">
          <span className="text-[10px] text-[var(--color-text-dim)]/40">
            type a message below to get started
          </span>
        </div>

        {/* Keyboard shortcut hint */}
        <div className="pl-7 mt-1">
          <span className="inline-flex items-center gap-1 text-[9px] text-[var(--color-text-dim)]/30">
            <Keyboard size={9} className="opacity-50" />
            Ctrl+K for commands
          </span>
        </div>

        {/* Waiting cursor */}
        <div className="flex items-center gap-2 mt-5 pl-2">
          <span className="text-[var(--color-accent-primary)] text-xs opacity-30">λ</span>
          <span className="inline-block w-[5px] h-[11px] bg-[var(--color-accent-primary)]/30 animate-blink rounded-[1px]" />
        </div>
      </div>
    </div>
  );
};

export const SessionWelcome = memo(SessionWelcomeComponent);
SessionWelcome.displayName = 'SessionWelcome';
