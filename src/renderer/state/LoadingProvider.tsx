/**
 * App-Wide Loading Provider
 * 
 * Provides centralized loading state management across the application.
 * Use this to show consistent loading indicators for global operations.
 */
import React, { createContext, useContext, useCallback, useReducer, useMemo, memo } from 'react';

// =============================================================================
// Types
// =============================================================================

/** Individual loading operation with tracking information */
export interface LoadingOperation {
  /** Unique identifier for this loading operation */
  id: string;
  /** Human-readable label describing what's loading */
  label: string;
  /** Optional detailed description of the operation */
  detail?: string;
  /** Progress percentage (0-100) if available */
  progress?: number;
  /** Priority level for display ordering */
  priority?: 'low' | 'normal' | 'high';
  /** When the operation started */
  startedAt: number;
}

/** Loading context state */
export interface LoadingState {
  /** Map of active loading operations by ID */
  operations: Map<string, LoadingOperation>;
  /** Whether any loading operation is active */
  isLoading: boolean;
  /** The current most relevant loading message */
  currentLabel: string | null;
  /** Optional detail for current loading */
  currentDetail: string | null;
  /** Overall progress if calculable */
  overallProgress: number | null;
}

/** Loading context actions */
type LoadingAction =
  | { type: 'START_LOADING'; payload: LoadingOperation }
  | { type: 'UPDATE_LOADING'; payload: Partial<LoadingOperation> & { id: string } }
  | { type: 'STOP_LOADING'; payload: { id: string } }
  | { type: 'CLEAR_ALL' };

/** Loading context value */
interface LoadingContextValue extends LoadingState {
  /** Start a new loading operation */
  startLoading: (id: string, label: string, detail?: string, priority?: 'low' | 'normal' | 'high') => void;
  /** Update an existing loading operation */
  updateLoading: (id: string, updates: { label?: string; detail?: string; progress?: number }) => void;
  /** Stop a loading operation */
  stopLoading: (id: string) => void;
  /** Clear all loading operations */
  clearAll: () => void;
  /** Check if a specific operation is loading */
  isOperationLoading: (id: string) => boolean;
  /** Get operation count */
  operationCount: number;
}

// =============================================================================
// Context & Reducer
// =============================================================================

const LoadingContext = createContext<LoadingContextValue | null>(null);

const initialState: LoadingState = {
  operations: new Map(),
  isLoading: false,
  currentLabel: null,
  currentDetail: null,
  overallProgress: null,
};

function getHighestPriorityOperation(operations: Map<string, LoadingOperation>): LoadingOperation | null {
  if (operations.size === 0) return null;
  
  const sorted = Array.from(operations.values()).sort((a, b) => {
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    const aPriority = priorityOrder[a.priority || 'normal'];
    const bPriority = priorityOrder[b.priority || 'normal'];
    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.startedAt - b.startedAt;
  });
  
  return sorted[0] || null;
}

function calculateOverallProgress(operations: Map<string, LoadingOperation>): number | null {
  const withProgress = Array.from(operations.values()).filter(op => typeof op.progress === 'number');
  if (withProgress.length === 0) return null;
  const sum = withProgress.reduce((acc, op) => acc + (op.progress || 0), 0);
  return Math.round(sum / withProgress.length);
}

function loadingReducer(state: LoadingState, action: LoadingAction): LoadingState {
  switch (action.type) {
    case 'START_LOADING': {
      const newOperations = new Map(state.operations);
      newOperations.set(action.payload.id, action.payload);
      const current = getHighestPriorityOperation(newOperations);
      return {
        operations: newOperations,
        isLoading: true,
        currentLabel: current?.label || null,
        currentDetail: current?.detail || null,
        overallProgress: calculateOverallProgress(newOperations),
      };
    }
    
    case 'UPDATE_LOADING': {
      const existing = state.operations.get(action.payload.id);
      if (!existing) return state;
      
      const newOperations = new Map(state.operations);
      newOperations.set(action.payload.id, {
        ...existing,
        ...action.payload,
      });
      const current = getHighestPriorityOperation(newOperations);
      return {
        ...state,
        operations: newOperations,
        currentLabel: current?.label || null,
        currentDetail: current?.detail || null,
        overallProgress: calculateOverallProgress(newOperations),
      };
    }
    
    case 'STOP_LOADING': {
      if (!state.operations.has(action.payload.id)) return state;
      
      const newOperations = new Map(state.operations);
      newOperations.delete(action.payload.id);
      const current = getHighestPriorityOperation(newOperations);
      return {
        operations: newOperations,
        isLoading: newOperations.size > 0,
        currentLabel: current?.label || null,
        currentDetail: current?.detail || null,
        overallProgress: calculateOverallProgress(newOperations),
      };
    }
    
    case 'CLEAR_ALL':
      return initialState;
      
    default:
      return state;
  }
}

// =============================================================================
// Provider Component
// =============================================================================

interface LoadingProviderProps {
  children: React.ReactNode;
}

export const LoadingProvider: React.FC<LoadingProviderProps> = memo(({ children }) => {
  const [state, dispatch] = useReducer(loadingReducer, initialState);
  
  const startLoading = useCallback((
    id: string,
    label: string,
    detail?: string,
    priority: 'low' | 'normal' | 'high' = 'normal'
  ) => {
    dispatch({
      type: 'START_LOADING',
      payload: {
        id,
        label,
        detail,
        priority,
        startedAt: Date.now(),
      },
    });
  }, []);
  
  const updateLoading = useCallback((
    id: string,
    updates: { label?: string; detail?: string; progress?: number }
  ) => {
    dispatch({
      type: 'UPDATE_LOADING',
      payload: { id, ...updates },
    });
  }, []);
  
  const stopLoading = useCallback((id: string) => {
    dispatch({ type: 'STOP_LOADING', payload: { id } });
  }, []);
  
  const clearAll = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' });
  }, []);
  
  const isOperationLoading = useCallback((id: string): boolean => {
    return state.operations.has(id);
  }, [state.operations]);
  
  const value = useMemo<LoadingContextValue>(() => ({
    ...state,
    startLoading,
    updateLoading,
    stopLoading,
    clearAll,
    isOperationLoading,
    operationCount: state.operations.size,
  }), [state, startLoading, updateLoading, stopLoading, clearAll, isOperationLoading]);
  
  return (
    <LoadingContext.Provider value={value}>
      {children}
    </LoadingContext.Provider>
  );
});

LoadingProvider.displayName = 'LoadingProvider';

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access the loading context.
 * Use this for global/app-wide loading operations.
 */
export function useLoading(): LoadingContextValue {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
}

/**
 * Hook to track a specific loading operation.
 * Returns functions to start/stop/update the operation with automatic cleanup.
 */
export function useLoadingOperation(id: string) {
  const { startLoading, updateLoading, stopLoading, isOperationLoading } = useLoading();
  
  const start = useCallback((label: string, detail?: string, priority?: 'low' | 'normal' | 'high') => {
    startLoading(id, label, detail, priority);
  }, [id, startLoading]);
  
  const update = useCallback((updates: { label?: string; detail?: string; progress?: number }) => {
    updateLoading(id, updates);
  }, [id, updateLoading]);
  
  const stop = useCallback(() => {
    stopLoading(id);
  }, [id, stopLoading]);
  
  const isActive = isOperationLoading(id);
  
  return { start, update, stop, isActive };
}

export default LoadingProvider;
