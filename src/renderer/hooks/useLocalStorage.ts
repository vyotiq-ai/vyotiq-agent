/**
 * useLocalStorage Hook
 * 
 * Provides a stateful value synced with localStorage with
 * automatic serialization and type safety.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { createLogger } from '../utils/logger';

const logger = createLogger('LocalStorage');

// =============================================================================
// Types
// =============================================================================

interface UseLocalStorageOptions<T> {
    /** Serializer function (defaults to JSON.stringify) */
    serializer?: (value: T) => string;
    /** Deserializer function (defaults to JSON.parse) */
    deserializer?: (value: string) => T;
    /** Sync across tabs */
    syncTabs?: boolean;
}

type SetValue<T> = T | ((prevValue: T) => T);

// =============================================================================
// useLocalStorage Hook
// =============================================================================

export function useLocalStorage<T>(
    key: string,
    initialValue: T,
    options: UseLocalStorageOptions<T> = {}
): [T, (value: SetValue<T>) => void, () => void] {
    const {
        serializer = JSON.stringify,
        deserializer = JSON.parse,
        syncTabs = true,
    } = options;

    // Use ref to avoid re-creating the read function
    const keyRef = useRef(key);
    keyRef.current = key;

    // Read initial value from localStorage
    const readValue = useCallback((): T => {
        if (typeof window === 'undefined') {
            return initialValue;
        }

        try {
            const item = window.localStorage.getItem(keyRef.current);
            return item ? deserializer(item) : initialValue;
        } catch (error) {
            logger.warn(`Error reading key "${keyRef.current}"`, { error });
            return initialValue;
        }
    }, [initialValue, deserializer]);

    const [storedValue, setStoredValue] = useState<T>(readValue);

    // Set value to localStorage
    const setValue = useCallback((value: SetValue<T>) => {
        if (typeof window === 'undefined') {
            logger.warn('Cannot access localStorage in this environment');
            return;
        }

        try {
            // Allow value to be a function
            const valueToStore = value instanceof Function ? value(storedValue) : value;
            
            // Save to local storage
            window.localStorage.setItem(keyRef.current, serializer(valueToStore));
            
            // Save state
            setStoredValue(valueToStore);
            
            // Dispatch custom event for same-tab updates
            window.dispatchEvent(new CustomEvent('local-storage', {
                detail: { key: keyRef.current, value: valueToStore }
            }));
        } catch (error) {
            logger.warn(`Error setting key "${keyRef.current}"`, { error });
        }
    }, [storedValue, serializer]);

    // Remove value from localStorage
    const removeValue = useCallback(() => {
        if (typeof window === 'undefined') return;

        try {
            window.localStorage.removeItem(keyRef.current);
            setStoredValue(initialValue);
        } catch (error) {
            logger.warn(`Error removing key "${keyRef.current}"`, { error });
        }
    }, [initialValue]);

    // Listen for storage changes (cross-tab sync)
    useEffect(() => {
        if (!syncTabs) return;

        const handleStorageChange = (event: StorageEvent) => {
            if (event.key !== keyRef.current || event.storageArea !== localStorage) {
                return;
            }

            try {
                const newValue = event.newValue ? deserializer(event.newValue) : initialValue;
                setStoredValue(newValue);
            } catch (error) {
                logger.warn(`Error parsing storage event for key "${keyRef.current}"`, { error });
            }
        };

        // Listen for same-tab updates via custom event
        const handleLocalStorageEvent = (event: CustomEvent<{ key: string; value: T }>) => {
            if (event.detail.key === keyRef.current) {
                setStoredValue(event.detail.value);
            }
        };

        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('local-storage', handleLocalStorageEvent as EventListener);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('local-storage', handleLocalStorageEvent as EventListener);
        };
    }, [syncTabs, deserializer, initialValue]);

    // Update stored value if key changes
    useEffect(() => {
        setStoredValue(readValue());
    }, [key, readValue]);

    return [storedValue, setValue, removeValue];
}

// =============================================================================
// useSessionStorage Hook
// =============================================================================

export function useSessionStorage<T>(
    key: string,
    initialValue: T,
    options: Omit<UseLocalStorageOptions<T>, 'syncTabs'> = {}
): [T, (value: SetValue<T>) => void, () => void] {
    const {
        serializer = JSON.stringify,
        deserializer = JSON.parse,
    } = options;

    const keyRef = useRef(key);
    keyRef.current = key;

    const readValue = useCallback((): T => {
        if (typeof window === 'undefined') {
            return initialValue;
        }

        try {
            const item = window.sessionStorage.getItem(keyRef.current);
            return item ? deserializer(item) : initialValue;
        } catch (error) {
            logger.warn(`Error reading sessionStorage key "${keyRef.current}"`, { error });
            return initialValue;
        }
    }, [initialValue, deserializer]);

    const [storedValue, setStoredValue] = useState<T>(readValue);

    const setValue = useCallback((value: SetValue<T>) => {
        if (typeof window === 'undefined') return;

        try {
            const valueToStore = value instanceof Function ? value(storedValue) : value;
            window.sessionStorage.setItem(keyRef.current, serializer(valueToStore));
            setStoredValue(valueToStore);
        } catch (error) {
            logger.warn(`Error setting sessionStorage key "${keyRef.current}"`, { error });
        }
    }, [storedValue, serializer]);

    const removeValue = useCallback(() => {
        if (typeof window === 'undefined') return;

        try {
            window.sessionStorage.removeItem(keyRef.current);
            setStoredValue(initialValue);
        } catch (error) {
            logger.warn(`Error removing sessionStorage key "${keyRef.current}"`, { error });
        }
    }, [initialValue]);

    useEffect(() => {
        setStoredValue(readValue());
    }, [key, readValue]);

    return [storedValue, setValue, removeValue];
}
