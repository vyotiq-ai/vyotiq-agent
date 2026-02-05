/**
 * Session Welcome Component
 * 
 * Displays a welcome message when a session is active but has no messages yet.
 * Shows typewriter effect with helpful hints.
 * 
 * Performance optimizations:
 * - Memoized component to prevent unnecessary re-renders
 * - Cleanup of intervals on unmount
 * - Stable animation timing
 */
import React, { memo } from 'react';
import { SESSION_HINTS } from '../utils/welcomeHints';

const SessionWelcomeComponent: React.FC = () => {
  const displayedText = SESSION_HINTS[0] ?? 'type a message to begin';

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] font-mono px-4">
      <div className="text-center space-y-3 max-w-lg w-full">
        <div className="flex items-center justify-center">
          <span className="text-[var(--color-accent-primary)] text-xl font-medium leading-none opacity-80">λ</span>
        </div>
        <div className="text-[11px] text-[var(--color-text-secondary)] truncate">
          {displayedText}
        </div>
        <p className="text-[10px] text-[var(--color-text-dim)]">
          type a message below to get started
        </p>
      </div>
    </div>
  );
};

export const SessionWelcome = memo(SessionWelcomeComponent);
