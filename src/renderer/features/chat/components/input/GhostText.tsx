/**
 * GhostText Component
 * 
 * Renders inline autocomplete suggestions as semi-transparent "ghost" text
 * that appears after the user's cursor. The ghost text can be accepted with Tab.
 * 
 * Features:
 * - Animated fade-in appearance
 * - Animated loading dots
 * - Tab/Ctrl+→ keyboard hints
 * 
 * @example
 * <GhostText
 *   suggestion="plement a binary search tree"
 *   showHint={true}
 * />
 */
import React, { memo, useEffect, useState } from 'react';
import { cn } from '../../../../utils/cn';

export interface GhostTextProps {
  /** The suggestion text to display */
  suggestion: string | null;
  /** Whether to show the Tab hint */
  showHint?: boolean;
  /** Whether the suggestion is loading */
  isLoading?: boolean;
  /** Additional className */
  className?: string;
  /** Provider that generated the suggestion (for status) */
  provider?: string;
  /** Latency in ms (for status) */
  latencyMs?: number;
}

/**
 * Animated loading dots indicator
 */
const LoadingDots: React.FC = memo(() => (
  <span 
    className="inline-flex items-center ml-1 text-[var(--color-text-muted)] opacity-60"
    aria-hidden="true"
    aria-label="Loading suggestion"
  >
    <span className="inline-flex gap-[2px]">
      <span 
        className="w-[3px] h-[3px] rounded-full bg-current animate-bounce"
        style={{ animationDelay: '0ms', animationDuration: '600ms' }}
      />
      <span 
        className="w-[3px] h-[3px] rounded-full bg-current animate-bounce"
        style={{ animationDelay: '150ms', animationDuration: '600ms' }}
      />
      <span 
        className="w-[3px] h-[3px] rounded-full bg-current animate-bounce"
        style={{ animationDelay: '300ms', animationDuration: '600ms' }}
      />
    </span>
  </span>
));
LoadingDots.displayName = 'LoadingDots';

/**
 * Tab hint indicator with Ctrl+→ option
 */
const AcceptHints: React.FC = memo(() => (
  <span 
    className={cn(
      "ml-2 inline-flex items-center gap-1 text-[8px] font-mono",
      "text-[var(--color-text-muted)] opacity-60"
    )}
    aria-hidden="true"
  >
    <kbd className="px-1 py-0.5 rounded bg-[var(--color-surface-3)] border border-[var(--color-border-subtle)]">
      Tab
    </kbd>
    <span className="opacity-50">or</span>
    <kbd className="px-1 py-0.5 rounded bg-[var(--color-surface-3)] border border-[var(--color-border-subtle)]">
      Ctrl→
    </kbd>
  </span>
));
AcceptHints.displayName = 'AcceptHints';

/**
 * GhostText - renders autocomplete suggestion as ghost text with animation
 */
export const GhostText: React.FC<GhostTextProps> = memo(({
  suggestion,
  showHint = true,
  isLoading = false,
  className,
  provider,
  latencyMs,
}) => {
  // Track whether to show (for animation)
  const [isVisible, setIsVisible] = useState(false);
  const [displayedSuggestion, setDisplayedSuggestion] = useState<string | null>(null);

  // Animate in when suggestion changes
  useEffect(() => {
    if (suggestion) {
      setDisplayedSuggestion(suggestion);
      // Small delay for animation trigger
      const timer = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
      // Clear after fade out
      const timer = setTimeout(() => setDisplayedSuggestion(null), 150);
      return () => clearTimeout(timer);
    }
  }, [suggestion]);

  // Don't render if no suggestion and not loading
  if (!displayedSuggestion && !isLoading) {
    return null;
  }

  return (
    <span 
      className={cn(
        "pointer-events-none select-none",
        "text-[var(--color-text-muted)] opacity-50",
        "font-mono",
        // Fade-in/out animation
        "transition-opacity duration-150 ease-out",
        isVisible ? "opacity-50" : "opacity-0",
        className
      )}
      aria-hidden="true"
      data-testid="ghost-text"
      title={provider && latencyMs ? `${provider} • ${latencyMs}ms` : undefined}
    >
      {isLoading && !displayedSuggestion ? (
        <LoadingDots />
      ) : displayedSuggestion ? (
        <>
          <span className="whitespace-pre-wrap">{displayedSuggestion}</span>
          {showHint && <AcceptHints />}
        </>
      ) : null}
    </span>
  );
});

GhostText.displayName = 'GhostText';

export default GhostText;
