/**
 * useSessionSearch Hook
 * 
 * Provides session search functionality with debouncing.
 * Filters sessions by title with configurable debounce delay.
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { AgentSessionState } from '../../../../shared/types';
import { filterSessionsByQuery, sortSessions, type SessionSortKey } from '../utils';

// =============================================================================
// Types
// =============================================================================

export interface SessionSearchOptions {
  /** Sessions to search through */
  sessions: AgentSessionState[];
  /** Debounce delay in milliseconds (default: 150) */
  debounceMs?: number;
  /** Sort key for results (default: 'date') */
  sortBy?: SessionSortKey;
  /** Minimum query length to trigger search (default: 1) */
  minQueryLength?: number;
}

export interface SessionSearchState {
  /** Current search query */
  query: string;
  /** Debounced search query */
  debouncedQuery: string;
  /** Filtered sessions matching the query */
  results: AgentSessionState[];
  /** Whether search is currently debouncing */
  isSearching: boolean;
  /** Total result count */
  resultCount: number;
  /** Whether query is active (non-empty) */
  hasQuery: boolean;
}

export interface SessionSearchActions {
  /** Update search query */
  setQuery: (query: string) => void;
  /** Clear search */
  clearSearch: () => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useSessionSearch(options: SessionSearchOptions): {
  state: SessionSearchState;
  actions: SessionSearchActions;
} {
  const {
    sessions,
    debounceMs = 150,
    sortBy = 'date',
    minQueryLength = 1,
  } = options;

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Handle query debouncing
  useEffect(() => {
    if (query.length < minQueryLength) {
      setDebouncedQuery('');
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(query);
      setIsSearching(false);
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, debounceMs, minQueryLength]);

  // Filter and sort results
  const results = useMemo(() => {
    if (!debouncedQuery.trim()) return sessions;
    
    const filtered = filterSessionsByQuery(sessions, debouncedQuery);
    return sortSessions(filtered, sortBy);
  }, [sessions, debouncedQuery, sortBy]);

  // Build state
  const state = useMemo<SessionSearchState>(() => ({
    query,
    debouncedQuery,
    results,
    isSearching,
    resultCount: results.length,
    hasQuery: query.length >= minQueryLength,
  }), [query, debouncedQuery, results, isSearching, minQueryLength]);

  // Actions
  const clearSearch = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    setIsSearching(false);
  }, []);

  const actions = useMemo<SessionSearchActions>(() => ({
    setQuery,
    clearSearch,
  }), [clearSearch]);

  return { state, actions };
}

export default useSessionSearch;
