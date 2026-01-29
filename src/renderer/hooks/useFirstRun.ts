/**
 * useFirstRun Hook
 * 
 * Detects if this is the first time the app is being run
 * and provides utilities to complete the first run flow.
 */
import { useCallback, useMemo } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { useAgentSelector } from '../state/AgentProvider';

const FIRST_RUN_KEY = 'vyotiq-first-run-completed';

interface UseFirstRunResult {
  /** Whether this is the first run (wizard should be shown) */
  isFirstRun: boolean;
  /** Whether any API keys are configured */
  hasApiKeys: boolean;
  /** Mark first run as completed */
  completeFirstRun: () => void;
  /** Reset first run status (for testing) */
  resetFirstRun: () => void;
}

export function useFirstRun(): UseFirstRunResult {
  const apiKeys = useAgentSelector(
    (state) => state.settings?.apiKeys,
    (a, b) => a === b,
  );
  const [completed, setCompleted, clearStorage] = useLocalStorage<boolean>(
    FIRST_RUN_KEY,
    false
  );

  // Check if any API keys are configured
  const hasApiKeys = useMemo(() => {
    if (!apiKeys) return false;
    return Object.values(apiKeys).some(
      key => typeof key === 'string' && key.trim().length > 0
    );
  }, [apiKeys]);

  // Consider it first run if:
  // 1. The user hasn't completed the wizard AND
  // 2. No API keys are configured
  const isFirstRun = useMemo(() => {
    return !completed && !hasApiKeys;
  }, [completed, hasApiKeys]);

  const completeFirstRun = useCallback(() => {
    setCompleted(true);
  }, [setCompleted]);

  const resetFirstRun = useCallback(() => {
    clearStorage();
  }, [clearStorage]);

  return {
    isFirstRun,
    hasApiKeys,
    completeFirstRun,
    resetFirstRun,
  };
}

export default useFirstRun;
