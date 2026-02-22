/**
 * Session Welcome Component
 * 
 * Displayed when a session is active but has no messages yet.
 * Clean, minimal terminal aesthetic — centered lambda symbol with a
 * softly cycling contextual hint. Quick-start actions appear as
 * understated inline text that animate in after a brief delay.
 * 
 * Performance optimizations:
 * - Memoized component to prevent unnecessary re-renders
 * - Cleanup of intervals on unmount
 * - Stable animation timing
 * - useCallback for event dispatch
 */
import React, { memo, useState, useEffect, useCallback, useRef } from 'react';
import { SESSION_HINTS, getRandomHintIndex } from '../utils/welcomeHints';
import { cn } from '../../../utils/cn';

// =============================================================================
// Quick-start definitions — minimal, label-only
// =============================================================================

const QUICK_STARTS = [
  { id: 'debug', label: 'debug an issue', prompt: 'Help me debug and fix a bug in my codebase. I\'ll describe the issue.' },
  { id: 'explain', label: 'explain this codebase', prompt: 'Explain this codebase architecture and how the major components work together.' },
  { id: 'refactor', label: 'refactor code', prompt: 'Help me refactor and improve the code quality in my project.' },
  { id: 'build', label: 'build something new', prompt: 'Help me implement a new feature. I\'ll describe what I need.' },
  { id: 'test', label: 'write tests', prompt: 'Help me write comprehensive tests for my codebase.' },
] as const;

// =============================================================================
// Animated hint that cycles through SESSION_HINTS with a fade transition
// =============================================================================

const CyclingHint: React.FC = memo(() => {
  const [index, setIndex] = useState(() => getRandomHintIndex());
  const [fade, setFade] = useState(true);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      fadeTimeoutRef.current = setTimeout(() => {
        setIndex(prev => (prev + 1) % SESSION_HINTS.length);
        setFade(true);
      }, 300);
    }, 5000);
    return () => {
      clearInterval(interval);
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    };
  }, []);

  return (
    <span
      className={cn(
        'transition-opacity duration-300 ease-in-out',
        fade ? 'opacity-100' : 'opacity-0',
      )}
    >
      {SESSION_HINTS[index]}
    </span>
  );
});
CyclingHint.displayName = 'CyclingHint';

// =============================================================================
// Session Welcome
// =============================================================================

interface SessionWelcomeProps {
  /** Optional callback to pre-fill the chat input */
  onQuickStart?: (prompt: string) => void;
}

const SessionWelcomeComponent: React.FC<SessionWelcomeProps> = ({ onQuickStart }) => {
  const [visible, setVisible] = useState(false);
  const [actionsVisible, setActionsVisible] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const t1 = setTimeout(() => {
      if (mountedRef.current) setVisible(true);
    }, 60);
    const t2 = setTimeout(() => {
      if (mountedRef.current) setActionsVisible(true);
    }, 400);
    return () => {
      mountedRef.current = false;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const handleQuickStart = useCallback((prompt: string) => {
    if (onQuickStart) {
      onQuickStart(prompt);
    } else {
      window.dispatchEvent(new CustomEvent('vyotiq:quick-start', { detail: prompt }));
    }
  }, [onQuickStart]);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] font-mono px-6 select-none">
      <div className={cn(
        'flex flex-col items-center gap-6 max-w-sm w-full',
        'transition-all duration-500 ease-out',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3',
      )}>
        {/* Lambda symbol */}
        <div className="flex flex-col items-center gap-4">
          <span
            className="text-3xl font-bold leading-none text-[var(--color-accent-primary)] opacity-25"
            aria-hidden="true"
          >
            λ
          </span>

          {/* Cycling hint */}
          <div className="text-[11px] text-[var(--color-text-tertiary)] tracking-wide text-center leading-relaxed h-4">
            <CyclingHint />
          </div>
        </div>

        {/* Quick-start actions — subtle inline links */}
        <div className={cn(
          'flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 mt-2',
          'transition-all duration-500 ease-out',
          actionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
        )}>
          {QUICK_STARTS.map((qs, idx) => (
            <React.Fragment key={qs.id}>
              {idx > 0 && (
                <span className="text-[9px] text-[var(--color-text-dim)] opacity-20 select-none" aria-hidden="true">
                  ·
                </span>
              )}
              <button
                type="button"
                onClick={() => handleQuickStart(qs.prompt)}
                className={cn(
                  'text-[10px] text-[var(--color-text-muted)]',
                  'hover:text-[var(--color-accent-primary)]',
                  'transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:text-[var(--color-accent-primary)]',
                  'active:opacity-70',
                )}
              >
                {qs.label}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Keyboard hint */}
        <span className="text-[9px] text-[var(--color-text-dim)] opacity-30 mt-1 tracking-wide">
          ctrl+k commands
        </span>
      </div>
    </div>
  );
};

export const SessionWelcome = memo(SessionWelcomeComponent);
SessionWelcome.displayName = 'SessionWelcome';
