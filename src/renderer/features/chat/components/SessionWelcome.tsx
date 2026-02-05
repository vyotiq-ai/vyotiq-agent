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
import React, { memo, useState, useEffect, useRef } from 'react';
import { cn } from '../../../utils/cn';
import { SESSION_HINTS } from '../utils/welcomeHints';

/** Blinking cursor component */
const BlinkingCursor: React.FC<{ visible: boolean }> = memo(({ visible }) => (
  <span className={cn(
    "w-[8px] h-[16px] bg-[var(--color-accent-primary)] rounded-[1px] flex-shrink-0",
    visible ? 'opacity-100' : 'opacity-30'
  )} />
));
BlinkingCursor.displayName = 'BlinkingCursor';

/** Typewriter text hook for cleaner state management */
function useTypewriter(hints: readonly string[]) {
  const [displayedText, setDisplayedText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const currentHint = hints[hintIndex % hints.length];

  useEffect(() => {
    const clearPendingTimeout = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const scheduleNext = (callback: () => void, delay: number) => {
      clearPendingTimeout();
      timeoutRef.current = setTimeout(callback, delay);
    };

    const tick = () => {
      if (isDeleting) {
        if (displayedText.length > 0) {
          setDisplayedText(prev => prev.slice(0, -1));
          scheduleNext(tick, 20);
        } else {
          setIsDeleting(false);
          setHintIndex(prev => prev + 1);
          scheduleNext(tick, 300);
        }
      } else {
        if (displayedText.length < currentHint.length) {
          setDisplayedText(currentHint.slice(0, displayedText.length + 1));
          scheduleNext(tick, 35 + Math.random() * 35);
        } else {
          // Done typing, wait then delete
          scheduleNext(() => {
            setIsDeleting(true);
            tick();
          }, 2500);
        }
      }
    };

    scheduleNext(tick, 100);

    return clearPendingTimeout;
  }, [displayedText, isDeleting, currentHint]);

  return displayedText;
}

const SessionWelcomeComponent: React.FC = () => {
  const [showCursor, setShowCursor] = useState(true);
  const displayedText = useTypewriter(SESSION_HINTS);

  // Cursor blink effect
  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor(v => !v);
    }, 530);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] font-mono px-4">
      <div className="text-center space-y-5 max-w-lg w-full">
        {/* Lambda brand mark */}
        <div className="flex items-center justify-center mb-1">
          <span className="text-[var(--color-accent-primary)] text-3xl font-medium leading-none opacity-80">λ</span>
        </div>

        {/* Typewriter prompt */}
        <div className="flex items-center justify-center gap-1.5 text-xs min-w-0 overflow-hidden">
          <span className="text-[var(--color-text-secondary)] min-w-0 text-left truncate">{displayedText}</span>
          <BlinkingCursor visible={showCursor} />
        </div>

        {/* Subtle hint */}
        <p className="text-[10px] text-[var(--color-text-dim)]">
          type a message below to get started
        </p>
      </div>
    </div>
  );
};

export const SessionWelcome = memo(SessionWelcomeComponent);
