/**
 * useAvailableProviders Hook
 * 
 * Fetches and caches the list of available (configured) LLM providers.
 * Also fetches cooldown status for rate-limited providers.
 * Updates when settings change.
 */

import { useState, useEffect, useCallback } from 'react';
import type { LLMProviderName } from '../../shared/types';
import { createLogger } from '../utils/logger';

const logger = createLogger('useAvailableProviders');

/** Cooldown info for a provider */
export interface ProviderCooldownInfo {
  inCooldown: boolean;
  remainingMs: number;
  reason: string;
}

interface UseAvailableProvidersResult {
  /** List of available provider names */
  availableProviders: LLMProviderName[];
  /** Cooldown status for each provider (null if not in cooldown) */
  providersCooldown: Record<string, ProviderCooldownInfo | null>;
  /** Whether the providers are being loaded */
  isLoading: boolean;
  /** Error if fetch failed */
  error: Error | null;
  /** Refetch available providers and cooldown status */
  refetch: () => Promise<void>;
}

/**
 * Hook to get the list of available (configured) LLM providers and their cooldown status
 * 
 * @returns Available providers info with cooldown status
 */
export function useAvailableProviders(): UseAvailableProvidersResult {
  const [availableProviders, setAvailableProviders] = useState<LLMProviderName[]>([]);
  const [providersCooldown, setProvidersCooldown] = useState<Record<string, ProviderCooldownInfo | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProviders = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [providers, cooldown] = await Promise.all([
        window.vyotiq.agent.getAvailableProviders(),
        window.vyotiq.agent.getProvidersCooldown(),
      ]);
      setAvailableProviders(providers as LLMProviderName[]);
      setProvidersCooldown(cooldown as Record<string, ProviderCooldownInfo | null>);
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
      // Refetch when agent status changes (cooldown may have changed)
      if (event.type === 'agent-status' && event.status === 'recovering') {
        fetchProviders();
      }
    });
    return unsubscribe;
  }, [fetchProviders]);

  return {
    availableProviders,
    providersCooldown,
    isLoading,
    error,
    refetch: fetchProviders,
  };
}
