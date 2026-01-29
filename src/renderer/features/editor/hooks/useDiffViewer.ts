/**
 * useDiffViewer Hook
 * 
 * Manages diff viewer state for standalone usage.
 */

import { useState, useCallback, useMemo } from 'react';
import type { DiffViewMode } from '../components/DiffViewer';

export interface DiffState {
  original: string;
  modified: string;
  viewMode: DiffViewMode;
  isVisible: boolean;
  filePath?: string;
  language?: string;
  originalLabel?: string;
  modifiedLabel?: string;
}

const initialState: DiffState = {
  original: '',
  modified: '',
  viewMode: 'split',
  isVisible: false,
};

export function useDiffViewer(initialViewMode: DiffViewMode = 'split') {
  const [state, setState] = useState<DiffState>({ ...initialState, viewMode: initialViewMode });

  const showDiff = useCallback((params: {
    original: string;
    modified: string;
    filePath?: string;
    language?: string;
    originalLabel?: string;
    modifiedLabel?: string;
  }) => {
    setState(prev => ({
      ...prev,
      ...params,
      isVisible: true,
    }));
  }, []);

  const hideDiff = useCallback(() => {
    setState(prev => ({ ...prev, isVisible: false }));
  }, []);

  const setViewMode = useCallback((mode: DiffViewMode) => {
    setState(prev => ({ ...prev, viewMode: mode }));
  }, []);

  const reset = useCallback(() => {
    setState({ ...initialState, viewMode: initialViewMode });
  }, [initialViewMode]);

  const hasDifferences = useMemo(() => state.original !== state.modified, [state.original, state.modified]);

  return {
    state,
    showDiff,
    hideDiff,
    setViewMode,
    reset,
    hasDifferences,
  };
}
