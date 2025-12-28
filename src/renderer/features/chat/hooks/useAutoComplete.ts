/**
 * useAutoComplete Hook
 * 
 * Provides AI-powered inline autocomplete suggestions for the chat input.
 * Features:
 * - Debounced API requests (avoids excessive calls)
 * - Request cancellation (new input cancels pending)
 * - Local caching for immediate reuse
 * - Integration with settings for enable/disable
 * 
 * @example
 * ```tsx
 * const {
 *   suggestion,
 *   isLoading,
 *   acceptSuggestion,
 *   dismissSuggestion,
 * } = useAutoComplete({
 *   text: message,
 *   cursorPosition,
 *   enabled: true,
 * });
 * ```
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('useAutoComplete');

// =============================================================================
// Types
// =============================================================================

export interface UseAutoCompleteOptions {
  /** Current text in the input */
  text: string;
  /** Current cursor position */
  cursorPosition: number;
  /** Whether autocomplete is enabled (can be disabled during mentions, etc.) */
  enabled?: boolean;
  /** Debounce delay in milliseconds (default: 400) */
  debounceMs?: number;
  /** Minimum characters to trigger autocomplete (default: 10) */
  minChars?: number;
  /** Recent messages for context (optional) */
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Session ID for context (optional) */
  sessionId?: string;
  /** Workspace context for better suggestions */
  context?: {
    workspaceName?: string;
    projectType?: string;
    recentFiles?: string[];
    sessionTopic?: string;
  };
}

export interface UseAutoCompleteReturn {
  /** Current suggestion (null if none) */
  suggestion: string | null;
  /** Whether a request is in progress */
  isLoading: boolean;
  /** Accept the current suggestion and return new text */
  acceptSuggestion: () => string;
  /** Accept only the next word from the suggestion and return new text */
  acceptNextWord: () => string;
  /** Dismiss the current suggestion */
  dismissSuggestion: () => void;
  /** Whether autocomplete is active (has suggestion) */
  isActive: boolean;
  /** Provider that generated the suggestion */
  provider?: string;
  /** Model used for suggestion */
  modelId?: string;
  /** Whether the suggestion was cached */
  cached?: boolean;
  /** Latency of the request in ms */
  latencyMs?: number;
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_DEBOUNCE_MS = 400;
const DEFAULT_MIN_CHARS = 10;

// Characters that suggest the user is done typing (don't suggest after these)
const END_PUNCTUATION = ['.', '!', '?', '\n'];

// =============================================================================
// Hook Implementation
// =============================================================================

export function useAutoComplete(options: UseAutoCompleteOptions): UseAutoCompleteReturn {
  const {
    text,
    cursorPosition,
    enabled = true,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    minChars = DEFAULT_MIN_CHARS,
    recentMessages,
    sessionId,
    context,
  } = options;

  // State
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState<string | undefined>();
  const [modelId, setModelId] = useState<string | undefined>();
  const [cached, setCached] = useState<boolean | undefined>();
  const [latencyMs, setLatencyMs] = useState<number | undefined>();
  const [error, setError] = useState<string | undefined>();

  // Refs for cleanup
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRequestTextRef = useRef<string>('');
  const isEnabledRef = useRef(enabled);
  isEnabledRef.current = enabled;

  // Clear suggestion when text changes
  const textBeforeCursor = text.slice(0, cursorPosition);
  const prevTextRef = useRef<string>(textBeforeCursor);

  // Check if suggestion should trigger
  const shouldTrigger = useMemo(() => {
    if (!enabled) return false;
    
    const trimmed = textBeforeCursor.trim();
    
    // Must have minimum characters
    if (trimmed.length < minChars) return false;
    
    // Cursor must be at the end
    if (cursorPosition < text.length) return false;
    
    // Don't trigger if ends with certain punctuation
    const lastChar = textBeforeCursor.slice(-1);
    if (END_PUNCTUATION.includes(lastChar)) return false;
    
    // Don't trigger if in a mention (starts with @)
    if (textBeforeCursor.endsWith('@')) return false;
    
    // Don't trigger in code blocks
    const backtickCount = (textBeforeCursor.match(/`/g) || []).length;
    if (backtickCount % 2 !== 0) return false;
    
    return true;
  }, [enabled, textBeforeCursor, cursorPosition, text.length, minChars]);

  // Request autocomplete suggestion
  const requestSuggestion = useCallback(async (textToComplete: string) => {
    if (!isEnabledRef.current) return;
    
    // Cancel any existing request
    try {
      await window.vyotiq.autocomplete.cancel();
    } catch {
      // Ignore cancel errors
    }

    lastRequestTextRef.current = textToComplete;
    setIsLoading(true);
    setError(undefined);

    try {
      const response = await window.vyotiq.autocomplete.request({
        text: textToComplete,
        cursorPosition: textToComplete.length,
        recentMessages,
        sessionId,
        context,
      });

      // Check if this is still the latest request
      if (lastRequestTextRef.current !== textToComplete) {
        return;
      }

      if (response.error) {
        logger.debug('Autocomplete error', { error: response.error });
        setError(response.error);
        setSuggestion(null);
      } else if (response.suggestion) {
        logger.debug('Autocomplete suggestion received', {
          length: response.suggestion.length,
          provider: response.provider,
          cached: response.cached,
          latencyMs: response.latencyMs,
        });
        setSuggestion(response.suggestion);
        setProvider(response.provider);
        setModelId(response.modelId);
        setCached(response.cached);
        setLatencyMs(response.latencyMs);
      } else {
        setSuggestion(null);
      }
    } catch (err) {
      if (lastRequestTextRef.current === textToComplete) {
        logger.error('Autocomplete request failed', { 
          error: err instanceof Error ? err.message : String(err) 
        });
        setError(err instanceof Error ? err.message : 'Unknown error');
        setSuggestion(null);
      }
    } finally {
      if (lastRequestTextRef.current === textToComplete) {
        setIsLoading(false);
      }
    }
  }, [recentMessages, sessionId, context]);

  // Handle text changes
  useEffect(() => {
    // Clear timer on any text change
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const prevText = prevTextRef.current;
    prevTextRef.current = textBeforeCursor;

    // If text changed, check if current suggestion still applies
    if (suggestion) {
      // If user typed more and it matches the suggestion, update suggestion
      if (textBeforeCursor.startsWith(prevText) && suggestion) {
        const typedExtra = textBeforeCursor.slice(prevText.length);
        const suggestionLower = suggestion.toLowerCase();
        const typedExtraLower = typedExtra.toLowerCase();
        
        if (suggestionLower.startsWith(typedExtraLower)) {
          // User is typing in line with suggestion, trim it
          const remainingSuggestion = suggestion.slice(typedExtra.length);
          if (remainingSuggestion.length > 0) {
            setSuggestion(remainingSuggestion);
            return;
          }
        }
      }
      
      // Otherwise clear suggestion
      setSuggestion(null);
    }

    // Don't request if conditions not met
    if (!shouldTrigger) {
      return;
    }

    // Debounce the request
    debounceTimerRef.current = setTimeout(() => {
      requestSuggestion(textBeforeCursor);
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [textBeforeCursor, shouldTrigger, debounceMs, requestSuggestion, suggestion]);

  // Clear suggestion when disabled
  useEffect(() => {
    if (!enabled && suggestion) {
      setSuggestion(null);
    }
  }, [enabled, suggestion]);

  // Accept the full suggestion
  const acceptSuggestion = useCallback(() => {
    if (!suggestion) return text;
    
    const newText = textBeforeCursor + suggestion + text.slice(cursorPosition);
    setSuggestion(null);
    
    logger.debug('Autocomplete accepted', { 
      suggestionLength: suggestion.length,
      provider,
    });
    
    return newText;
  }, [suggestion, text, textBeforeCursor, cursorPosition, provider]);

  // Accept only the next word from the suggestion
  const acceptNextWord = useCallback(() => {
    if (!suggestion) return text;
    
    // Find the end of the next word
    // A word ends at whitespace, punctuation, or end of string
    const wordMatch = suggestion.match(/^(\S+)(\s*)/);
    
    if (!wordMatch) {
      // No word found, accept everything
      return acceptSuggestion();
    }
    
    const [fullMatch, word, trailingSpace] = wordMatch;
    const acceptedPart = word + trailingSpace;
    const remainingSuggestion = suggestion.slice(fullMatch.length);
    
    const newText = textBeforeCursor + acceptedPart + text.slice(cursorPosition);
    
    // Update suggestion to remaining text if any
    if (remainingSuggestion.length > 0) {
      setSuggestion(remainingSuggestion);
    } else {
      setSuggestion(null);
    }
    
    logger.debug('Autocomplete word accepted', { 
      word: acceptedPart,
      remaining: remainingSuggestion.length,
      provider,
    });
    
    return newText;
  }, [suggestion, text, textBeforeCursor, cursorPosition, provider, acceptSuggestion]);

  // Dismiss the suggestion
  const dismissSuggestion = useCallback(() => {
    setSuggestion(null);
    setError(undefined);
    
    // Cancel any pending request
    window.vyotiq.autocomplete.cancel().catch(() => {});
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      window.vyotiq.autocomplete.cancel().catch(() => {});
    };
  }, []);

  return {
    suggestion,
    isLoading,
    acceptSuggestion,
    acceptNextWord,
    dismissSuggestion,
    isActive: suggestion !== null,
    provider,
    modelId,
    cached,
    latencyMs,
    error,
  };
}

export default useAutoComplete;
