/**
 * EmptyState Component
 * 
 * Displayed when no session is active or no workspace is selected.
 * Ultra-minimal: centered lambda + a single contextual hint line.
 * Uses shared welcome hints for consistency with SessionWelcome.
 */
import React, { memo, useState, useEffect, useRef } from 'react';
import { cn } from '../../../utils/cn';
import { getContextualHint } from '../utils/welcomeHints';

interface EmptyStateProps {
  /** Whether a workspace is currently active */
  hasWorkspace?: boolean;
  /** Whether a session is currently active */
  hasSession?: boolean;
  /** Additional CSS class */
  className?: string;
}

const EmptyStateInternal: React.FC<EmptyStateProps> = ({
  hasWorkspace = true,
  hasSession = true,
  className,
}) => {
  const [hintIndex, setHintIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [fade, setFade] = useState(true);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  // Cycle hints with fade transition
  useEffect(() => {
    const timer = setInterval(() => {
      setFade(false);
      fadeTimeoutRef.current = setTimeout(() => {
        setHintIndex(prev => prev + 1);
        setFade(true);
      }, 250);
    }, 5000);
    return () => {
      clearInterval(timer);
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    };
  }, []);

  const hint = getContextualHint(hasWorkspace, hasSession, hintIndex);

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center h-full select-none',
        'font-mono',
        'transition-all duration-500 ease-out',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
        className,
      )}
    >
      <div className="flex flex-col items-center gap-4">
        <span 
          className="text-2xl font-bold leading-none text-[var(--color-accent-primary)] opacity-15"
          aria-hidden="true"
        >
          λ
        </span>
        <span className={cn(
          'text-[10px] text-[var(--color-text-dim)] tracking-wide opacity-40',
          'transition-opacity duration-250 ease-in-out',
          fade ? 'opacity-40' : 'opacity-0',
        )}>
          {hint}
        </span>
      </div>
    </div>
  );
};

export const EmptyState = memo(EmptyStateInternal);
EmptyState.displayName = 'EmptyState';
