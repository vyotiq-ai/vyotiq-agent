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
        'text-left max-w-md w-full transition-opacity duration-400',
        visible ? 'opacity-100' : 'opacity-0'
      )}>
        {/* Brand symbol */}
        <div className="flex items-center gap-2.5 mb-3">
          <span className="text-[var(--color-accent-primary)] text-lg font-semibold leading-none opacity-80">λ</span>
          <span className="text-[11px] text-[var(--color-text-secondary)]">new session</span>
        </div>

        {/* Hint text */}
        <div className="pl-6 mb-2">
          <div className="text-[10px] text-[var(--color-text-tertiary)] leading-relaxed">
            {displayedText}
          </div>
        </div>

        {/* Input prompt hint */}
        <div className="pl-6">
          <span className="text-[10px] text-[var(--color-text-dim)]">
            type a message below to get started
          </span>
        </div>

        {/* Waiting cursor */}
        <div className="flex items-center gap-2 mt-5 pl-0.5">
          <span className="text-[var(--color-accent-primary)] text-xs opacity-50">λ</span>
          <span className="inline-block w-[5px] h-[11px] bg-[var(--color-accent-primary)]/60 animate-blink" />
        </div>
      </div>
    </div>
  );
};

export const SessionWelcome = memo(SessionWelcomeComponent);
SessionWelcome.displayName = 'SessionWelcome';
