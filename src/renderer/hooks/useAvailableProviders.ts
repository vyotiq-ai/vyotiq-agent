/**
 * useAvailableProviders Hook
 * 
 * Fetches and caches the list of available (configured) LLM providers.
 * Updates when settings change.
 */

import { useState, useEffect, useCallback } from 'react';
import type { LLMProviderName } from '../../shared/types';
import { createLogger } from '../utils/logger';

const logger = createLogger('useAvailableProviders');

interface UseAvailableProvidersResult {
  /** List of available provider names */
  availableProviders: LLMProviderName[];
  /** Whether the providers are being loaded */
  isLoading: boolean;
  /** Error if fetch failed */
  error: Error | null;
  /** Refetch available providers */
  refetch: () => Promise<void>;
}

/**
 * Hook to get the list of available (configured) LLM providers
 * 
 * @returns Available providers info
 */
export function useAvailableProviders(): UseAvailableProvidersResult {
  const [availableProviders, setAvailableProviders] = useState<LLMProviderName[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProviders = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const providers = await window.vyotiq.agent.getAvailableProviders();
      setAvailableProviders(providers as LLMProviderName[]);
    } catch (err) {
      logger.error('Failed to fetch available providers', { error: err });
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  // Listen for settings updates to refetch providers
  useEffect(() => {
    const unsubscribe = window.vyotiq.agent.onEvent((event) => {
      // Refetch when settings are updated (API keys may have changed)
      if (event.type === 'settings-update') {
        fetchProviders();
      }
    });
    return unsubscribe;
  }, [fetchProviders]);

  return {
    availableProviders,
    isLoading,
    error,
    refetch: fetchProviders,
  };
}
