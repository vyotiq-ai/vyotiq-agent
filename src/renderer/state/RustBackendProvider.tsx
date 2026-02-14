/**
 * RustBackendProvider
 *
 * Initializes and manages the connection to the Rust backend sidecar.
 * Provides connection status and event broadcasting to child components.
 */

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, ReactNode } from 'react';
import rustBackend, { type ServerEvent } from '../utils/rustBackendClient';
import { createLogger } from '../utils/logger';

const logger = createLogger('RustBackendProvider');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RustBackendContextType {
  /** Whether the Rust backend is available and connected */
  isAvailable: boolean;
  /** Whether the initial availability check is still in progress */
  isConnecting: boolean;
  /** Subscribe to real-time events from the backend */
  onEvent: (handler: (event: ServerEvent) => void) => () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RustBackendContext = createContext<RustBackendContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const RustBackendProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let initialized = false;

    // Use the client's built-in dedup + backoff for health checks.
    // We only need a single polling loop here — the client will
    // return cached results when called too frequently.
    const poll = async () => {
      if (cancelled) return;
      try {
        const available = await rustBackend.isAvailable();
        if (cancelled) return;

        if (available && !initialized) {
          initialized = true;
          rustBackend.init();
        } else if (!available && initialized) {
          initialized = false;
        }

        setIsAvailable(available);
        setIsConnecting(false);
      } catch (err) {
        logger.warn('Backend availability check failed', { error: err instanceof Error ? err.message : String(err) });
        if (!cancelled) {
          setIsAvailable(false);
          setIsConnecting(false);
        }
      }

      // Schedule next poll — the client handles backoff internally,
      // so a fixed 10 s interval is fine here (most calls return cached).
      if (!cancelled) {
        pollTimer = setTimeout(poll, 10_000);
      }
    };

    // Also subscribe to availability changes from the client so
    // UI updates immediately when backend appears / disappears.
    const unsubAvailability = rustBackend.onAvailabilityChange((available) => {
      if (cancelled) return;
      setIsAvailable(available);
      setIsConnecting(false);
      if (available && !initialized) {
        initialized = true;
        rustBackend.init();
      } else if (!available && initialized) {
        initialized = false;
      }
    });

    // Initial check
    poll();

    return () => {
      cancelled = true;
      unsubAvailability();
      if (pollTimer) clearTimeout(pollTimer);
      rustBackend.destroy();
    };
  }, []);

  const onEvent = useCallback(
    (handler: (event: ServerEvent) => void) => rustBackend.onEvent(handler),
    []
  );

  const contextValue = useMemo<RustBackendContextType>(() => ({
    isAvailable,
    isConnecting,
    onEvent,
  }), [isAvailable, isConnecting, onEvent]);

  return (
    <RustBackendContext.Provider value={contextValue}>
      {children}
    </RustBackendContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useRustBackendContext = () => {
  const ctx = useContext(RustBackendContext);
  if (!ctx) throw new Error('useRustBackendContext must be used within a RustBackendProvider');
  return ctx;
};
