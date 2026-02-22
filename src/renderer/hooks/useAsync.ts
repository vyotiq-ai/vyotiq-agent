/**
 * useAsync Hook
 * 
 * A hook for handling asynchronous operations with loading, error, and data states.
 * Provides a consistent pattern for async data fetching across the application.
 */
import { useState, useCallback, useRef, useEffect } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface AsyncState<T> {
  /** The data returned from the async function */
  data: T | null;
  /** Whether the async operation is in progress */
  isLoading: boolean;
  /** Error if the operation failed */
  error: Error | null;
  /** Whether the operation has completed at least once */
  isInitialized: boolean;
  /** Whether the operation completed successfully */
  isSuccess: boolean;
  /** Whether the operation failed */
  isError: boolean;
}

export interface UseAsyncOptions<T> {
  /** Initial data value */
  initialData?: T | null;
  /** Whether to run immediately on mount */
  immediate?: boolean;
  /** Callback when operation succeeds */
  onSuccess?: (data: T) => void;
  /** Callback when operation fails */
  onError?: (error: Error) => void;
  /** Whether to reset error state on new execution */
  resetErrorOnExecute?: boolean;
}

export interface UseAsyncResult<T, Args extends unknown[]> extends AsyncState<T> {
  /** Execute the async function */
  execute: (...args: Args) => Promise<T | null>;
  /** Reset state to initial values */
  reset: () => void;
  /** Set data manually */
  setData: (data: T | null) => void;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useAsync<T, Args extends unknown[] = []>(
  asyncFunction: (...args: Args) => Promise<T>,
  options: UseAsyncOptions<T> = {}
): UseAsyncResult<T, Args> {
  const {
    initialData = null,
    immediate = false,
    onSuccess,
    onError,
    resetErrorOnExecute = true,
  } = options;

  const [state, setState] = useState<AsyncState<T>>({
    data: initialData,
    isLoading: immediate,
    error: null,
    isInitialized: false,
    isSuccess: false,
    isError: false,
  });

  // Track mounted state to avoid state updates on unmounted components
  const mountedRef = useRef(true);
  // Track the latest async function to avoid stale closures
  const asyncFunctionRef = useRef(asyncFunction);
  asyncFunctionRef.current = asyncFunction;
  // Store callbacks in refs to avoid re-creating execute on every render
  // when consumers pass inline onSuccess/onError (prevents infinite loop with immediate: true)
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const execute = useCallback(async (...args: Args): Promise<T | null> => {
    setState(prev => ({
      ...prev,
      isLoading: true,
      error: resetErrorOnExecute ? null : prev.error,
      isError: resetErrorOnExecute ? false : prev.isError,
    }));

    try {
      const result = await asyncFunctionRef.current(...args);
      
      if (mountedRef.current) {
        setState({
          data: result,
          isLoading: false,
          error: null,
          isInitialized: true,
          isSuccess: true,
          isError: false,
        });
        onSuccessRef.current?.(result);
      }
      
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      
      if (mountedRef.current) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error,
          isInitialized: true,
          isSuccess: false,
          isError: true,
        }));
        onErrorRef.current?.(error);
      }
      
      return null;
    }
  }, [resetErrorOnExecute]);

  const reset = useCallback(() => {
    setState({
      data: initialData,
      isLoading: false,
      error: null,
      isInitialized: false,
      isSuccess: false,
      isError: false,
    });
  }, [initialData]);

  const setData = useCallback((data: T | null) => {
    setState(prev => ({
      ...prev,
      data,
    }));
  }, []);

  // Run immediately if requested
  useEffect(() => {
    if (immediate) {
      execute(...([] as unknown as Args));
    }
  }, [immediate, execute]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    ...state,
    execute,
    reset,
    setData,
  };
}

// =============================================================================
// useAsyncCallback - Simpler version for one-off async operations
// =============================================================================

export interface UseAsyncCallbackResult<T, Args extends unknown[]> {
  execute: (...args: Args) => Promise<T | null>;
  isLoading: boolean;
  error: Error | null;
  reset: () => void;
}

export function useAsyncCallback<T, Args extends unknown[] = []>(
  asyncFunction: (...args: Args) => Promise<T>,
  onSuccess?: (data: T) => void,
  onError?: (error: Error) => void
): UseAsyncCallbackResult<T, Args> {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const asyncFunctionRef = useRef(asyncFunction);
  asyncFunctionRef.current = asyncFunction;

  const execute = useCallback(async (...args: Args): Promise<T | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await asyncFunctionRef.current(...args);
      
      if (mountedRef.current) {
        setIsLoading(false);
        onSuccess?.(result);
      }
      
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      
      if (mountedRef.current) {
        setIsLoading(false);
        setError(e);
        onError?.(e);
      }
      
      return null;
    }
  }, [onSuccess, onError]);

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return { execute, isLoading, error, reset };
}

export default useAsync;
