/**
 * useConversationSearch Hook
 * 
 * Provides text-based filtering of chat messages with debounced search,
 * match highlighting info, and navigation between matches.
 * 
 * Features:
 * - Debounced search input (300ms default)
 * - Case-insensitive matching
 * - Match count tracking
 * - Navigation between matches (next/prev)
 * - Returns match positions for highlighting
 * 
 * @example
 * const { 
 *   searchQuery, 
 *   setSearchQuery, 
 *   filteredMessages, 
 *   matchCount,
 *   currentMatchIndex,
 *   goToNextMatch,
 *   goToPrevMatch,
 *   clearSearch
 * } = useConversationSearch(messages);
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { ChatMessage } from '../../shared/types';

export interface MessageMatch {
  messageId: string;
  messageIndex: number;
  matchPositions: Array<{ start: number; end: number }>;
}

export interface ConversationSearchResult {
  /** Current search query (raw input) */
  searchQuery: string;
  /** Update the search query */
  setSearchQuery: (query: string) => void;
  /** Debounced search query (used for actual filtering) */
  debouncedQuery: string;
  /** Whether search is active (query is not empty) */
  isSearchActive: boolean;
  /** Messages that match the search query (or all messages if no query) */
  filteredMessages: ChatMessage[];
  /** Set of message IDs that match the search (for highlighting) */
  matchingMessageIds: Set<string>;
  /** Detailed match information per message */
  matches: MessageMatch[];
  /** Total number of matching messages */
  matchCount: number;
  /** Current match index for navigation (0-based) */
  currentMatchIndex: number;
  /** Navigate to next match */
  goToNextMatch: () => void;
  /** Navigate to previous match */
  goToPrevMatch: () => void;
  /** Jump to a specific match */
  goToMatch: (index: number) => void;
  /** Current match message ID (for scrolling) */
  currentMatchMessageId: string | null;
  /** Clear the search */
  clearSearch: () => void;
}

export interface UseConversationSearchOptions {
  /** Debounce delay in ms (default: 300) */
  debounceMs?: number;
  /** Minimum characters to trigger search (default: 2) */
  minQueryLength?: number;
  /** Whether to filter messages or just highlight (default: false = highlight only) */
  filterMessages?: boolean;
}

/**
 * Hook to debounce a value
 */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook for searching through conversation messages
 */
export function useConversationSearch(
  messages: ChatMessage[],
  options: UseConversationSearchOptions = {}
): ConversationSearchResult {
  const {
    debounceMs = 300,
    minQueryLength = 2,
    filterMessages = false,
  } = options;

  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // Debounce the search query using our local hook
  const debouncedQuery = useDebouncedValue(searchQuery, debounceMs);

  // Determine if search is active
  const isSearchActive = debouncedQuery.length >= minQueryLength;

  // Find matches in messages
  const { filteredMessages, matches, matchingMessageIds } = useMemo(() => {
    if (!isSearchActive) {
      return {
        filteredMessages: messages,
        matches: [] as MessageMatch[],
        matchingMessageIds: new Set<string>(),
      };
    }

    const query = debouncedQuery.toLowerCase();
    const matchResults: MessageMatch[] = [];
    const matchIds = new Set<string>();
    const filtered: ChatMessage[] = [];

    messages.forEach((message, index) => {
      // Only search user and assistant messages
      if (message.role !== 'user' && message.role !== 'assistant') {
        if (!filterMessages) filtered.push(message);
        return;
      }

      const content = message.content?.toLowerCase() ?? '';
      const positions: Array<{ start: number; end: number }> = [];

      // Find all match positions
      let searchIndex = 0;
      while (searchIndex < content.length) {
        const matchStart = content.indexOf(query, searchIndex);
        if (matchStart === -1) break;
        
        positions.push({
          start: matchStart,
          end: matchStart + query.length,
        });
        searchIndex = matchStart + 1;
      }

      if (positions.length > 0) {
        matchResults.push({
          messageId: message.id,
          messageIndex: index,
          matchPositions: positions,
        });
        matchIds.add(message.id);
        filtered.push(message);
      } else if (!filterMessages) {
        // Include non-matching messages when not filtering
        filtered.push(message);
      }
    });

    return {
      filteredMessages: filterMessages ? filtered : messages,
      matches: matchResults,
      matchingMessageIds: matchIds,
    };
  }, [messages, debouncedQuery, isSearchActive, filterMessages]);

  // Match count
  const matchCount = matches.length;

  // Current match message ID
  const currentMatchMessageId = useMemo(() => {
    if (matchCount === 0) return null;
    const safeIndex = Math.min(currentMatchIndex, matchCount - 1);
    return matches[safeIndex]?.messageId ?? null;
  }, [matches, currentMatchIndex, matchCount]);

  // Navigation functions
  const goToNextMatch = useCallback(() => {
    if (matchCount === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % matchCount);
  }, [matchCount]);

  const goToPrevMatch = useCallback(() => {
    if (matchCount === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + matchCount) % matchCount);
  }, [matchCount]);

  const goToMatch = useCallback((index: number) => {
    if (matchCount === 0) return;
    setCurrentMatchIndex(Math.max(0, Math.min(index, matchCount - 1)));
  }, [matchCount]);

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setCurrentMatchIndex(0);
  }, []);

  // Reset match index when query changes
  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [debouncedQuery]);

  return {
    searchQuery,
    setSearchQuery,
    debouncedQuery,
    isSearchActive,
    filteredMessages,
    matchingMessageIds,
    matches,
    matchCount,
    currentMatchIndex,
    goToNextMatch,
    goToPrevMatch,
    goToMatch,
    currentMatchMessageId,
    clearSearch,
  };
}

export default useConversationSearch;
