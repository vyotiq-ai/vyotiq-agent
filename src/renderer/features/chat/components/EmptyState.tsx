/**
 * EmptyState Component
 * 
 * Displayed when a session has no messages yet.
 * Shows a minimal terminal-style prompt encouraging the user to start chatting.
 * Uses shared welcome hints for consistency with SessionWelcome.
 */
import React, { memo, useState, useEffect } from 'react';
import { Terminal } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { EMPTY_STATE_HINTS, getContextualHint } from '../utils/welcomeHints';

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

  // Cycle hints with a longer interval for a calm feel
  useEffect(() => {
    if (!hasWorkspace || !hasSession) return;
    const timer = setInterval(() => {
      setHintIndex(prev => prev + 1);
    }, 6000);
    return () => clearInterval(timer);
  }, [hasWorkspace, hasSession]);

  const hint = getContextualHint(hasWorkspace, hasSession, hintIndex);

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center h-full select-none',
        'text-[var(--color-text-muted)] font-mono',
        className,
      )}
    >
      <Terminal
        size={20}
        className="mb-3 opacity-30"
        style={{ color: 'var(--color-accent-primary)' }}
      />
      <span className="text-[11px] tracking-wide opacity-50">
        {hint}
        <span className="animate-blink ml-0.5">_</span>
      </span>
    </div>
  );
};

export const EmptyState = memo(EmptyStateInternal);
EmptyState.displayName = 'EmptyState';
