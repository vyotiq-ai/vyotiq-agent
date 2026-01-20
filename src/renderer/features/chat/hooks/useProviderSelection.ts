/**
 * useProviderSelection Hook
 * 
 * Manages provider and model selection state.
 */

import { useState, useCallback, useEffect } from 'react';
import type { LLMProviderName, AgentSessionState } from '../../../../shared/types';
import { useDebounce } from '../../../hooks/useDebounce';

/** Debounce delay for config updates (ms) */
const CONFIG_DEBOUNCE_MS = 300;

export interface ProviderSelectionState {
  selectedProvider: LLMProviderName | 'auto';
  selectedModelId: string | undefined;
  manualModel: string;
  setManualModel: (model: string) => void;
  handleProviderSelect: (provider: LLMProviderName | 'auto', modelId?: string) => void;
  handleManualModelCommit: () => void;
  handleManualModelClear: () => void;
  handleManualModelKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

interface ProviderSelectionOptions {
  activeSession:
    | {
        id: string;
        config: {
          preferredProvider: LLMProviderName | 'auto';
          selectedModelId?: string;
        };
      }
    | undefined;
  updateSessionConfig: (sessionId: string, config: Partial<AgentSessionState['config']>) => Promise<void>;
}

/**
 * Hook for managing provider and model selection
 */
export function useProviderSelection(options: ProviderSelectionOptions): ProviderSelectionState {
  const { activeSession, updateSessionConfig } = options;
  
  const [selectedProvider, setSelectedProvider] = useState<LLMProviderName | 'auto'>('auto');
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>(undefined);
  const [manualModel, setManualModel] = useState('');

  // Sync with active session
  useEffect(() => {
    if (activeSession) {
      setSelectedProvider(activeSession.config.preferredProvider);
      setSelectedModelId(activeSession.config.selectedModelId);
      setManualModel(activeSession.config.selectedModelId ?? '');
    } else {
      setManualModel('');
      setSelectedModelId(undefined);
      setSelectedProvider('auto');
    }
  }, [activeSession]);

  const handleProviderSelect = useCallback((provider: LLMProviderName | 'auto', modelId?: string) => {
    setSelectedProvider(provider);
    setSelectedModelId(modelId);
    
    if (activeSession) {
      updateSessionConfig(activeSession.id, { 
        preferredProvider: provider,
        selectedModelId: modelId,
      });
    }
  }, [activeSession, updateSessionConfig]);

  // Debounced version of config update
  const debouncedUpdateConfig = useDebounce(
    (sessionId: string, config: { selectedModelId?: string }) => {
      updateSessionConfig(sessionId, config);
    },
    CONFIG_DEBOUNCE_MS
  );

  const handleManualModelCommit = useCallback(() => {
    if (!activeSession) return;
    const trimmed = manualModel.trim();
    const current = activeSession.config.selectedModelId ?? '';
    if (trimmed === current) return;
    debouncedUpdateConfig(activeSession.id, { 
      selectedModelId: trimmed || undefined,
    });
  }, [debouncedUpdateConfig, activeSession, manualModel]);

  const handleManualModelClear = useCallback(() => {
    setManualModel('');
    setSelectedModelId(undefined);
    if (!activeSession) return;
    if (activeSession.config.selectedModelId) {
      updateSessionConfig(activeSession.id, { 
        selectedModelId: undefined,
      });
    }
  }, [updateSessionConfig, activeSession]);

  const handleManualModelKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleManualModelCommit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setManualModel(activeSession?.config.selectedModelId ?? '');
      event.currentTarget.blur();
    }
  }, [activeSession?.config.selectedModelId, handleManualModelCommit]);

  return {
    selectedProvider,
    selectedModelId,
    manualModel,
    setManualModel,
    handleProviderSelect,
    handleManualModelCommit,
    handleManualModelClear,
    handleManualModelKeyDown,
  };
}
