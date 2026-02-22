/**
 * useCopyTimer Hook
 * 
 * Provides a `copied` flag and `triggerCopy` function that automatically
 * resets after a duration. Cleans up the timer on unmount to prevent
 * state updates on unmounted components.
 */
import { useState, useCallback, useRef, useEffect } from 'react';

interface UseCopyTimerResult {
  /** Whether the copy action is currently showing "copied" state */
  copied: boolean;
  /** Call this after a successful copy to trigger the copied state */
  triggerCopy: () => void;
}

/**
 * @param duration Time in ms before `copied` resets to false (default: 2000)
 */
export function useCopyTimer(duration = 2000): UseCopyTimerResult {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerCopy = useCallback(() => {
    // Clear any existing timer
    if (timerRef.current) clearTimeout(timerRef.current);
    setCopied(true);
    timerRef.current = setTimeout(() => {
      setCopied(false);
      timerRef.current = null;
    }, duration);
  }, [duration]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { copied, triggerCopy };
}
