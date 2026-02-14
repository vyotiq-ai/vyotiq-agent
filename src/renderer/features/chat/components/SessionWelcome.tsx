/**
 * Session Welcome Component
 * 
 * Displays a welcome message when a session is active but has no messages yet.
 * Clean terminal aesthetic — no decorative symbols, just terminal flow.
 * 
 * Performance optimizations:
 * - Memoized component to prevent unnecessary re-renders
 * - Cleanup of intervals on unmount
 * - Stable animation timing
 */
import React, { memo, useState, useEffect } from 'react';
import { SESSION_HINTS } from '../utils/welcomeHints';
import { cn } from '../../../utils/cn';

const SessionWelcomeComponent: React.FC = () => {
  const displayedText = SESSION_HINTS[0] ?? 'type a message to begin';
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

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

        {/* Input prompt hint */}
        <div className="pl-7">
          <span className="text-[10px] text-[var(--color-text-dim)]/40">
            type a message below to get started
          </span>
        </div>

        {/* Waiting cursor */}
        <div className="flex items-center gap-2 mt-6 pl-2">
          <span className="text-[var(--color-accent-primary)] text-xs opacity-30">λ</span>
          <span className="inline-block w-[5px] h-[11px] bg-[var(--color-accent-primary)]/30 animate-blink rounded-[1px]" />
        </div>
      </div>
    </div>
  );
};

export const SessionWelcome = memo(SessionWelcomeComponent);
SessionWelcome.displayName = 'SessionWelcome';
