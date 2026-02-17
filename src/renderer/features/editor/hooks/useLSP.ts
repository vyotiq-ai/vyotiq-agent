/**
 * useLSP Hook
 * 
 * Provides LSP state and actions for React components.
 * Manages initialization, document sync, and diagnostics subscription.
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import {
  initializeLSP,
  registerAllLSPProviders,
  disposeLSPBridge,
  notifyDocumentOpen,
  notifyDocumentChange,
  notifyDocumentClose,
  refreshDiagnostics,
} from '../lsp/lspBridge';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('useLSP');

// =============================================================================
// Types
// =============================================================================

export interface LSPStatus {
  initialized: boolean;
  initializing: boolean;
  error: string | null;
  availableServers: string[];
  activeClients: Array<{
    language: string;
    state: string;
    capabilities: Record<string, unknown> | null;
  }>;
}

export interface UseLSPReturn {
  status: LSPStatus;
  initialize: (workspacePath: string) => Promise<void>;
  openDocument: (filePath: string, content?: string) => Promise<void>;
  updateDocument: (filePath: string, content: string) => Promise<void>;
  closeDocument: (filePath: string) => Promise<void>;
  refreshDiagnostics: (filePath?: string) => Promise<void>;
  getClients: () => Promise<void>;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to manage LSP lifecycle and provide status.
 */
export function useLSP(): UseLSPReturn {
  const [status, setStatus] = useState<LSPStatus>({
    initialized: false,
    initializing: false,
    error: null,
    availableServers: [],
    activeClients: [],
  });

  const initRef = useRef(false);

  const initialize = useCallback(async (workspacePath: string) => {
    if (initRef.current) return;
    initRef.current = true;

    setStatus(prev => ({ ...prev, initializing: true, error: null }));

    try {
      // Register Monaco language providers first
      registerAllLSPProviders();

      // Initialize the LSP manager
      const success = await initializeLSP(workspacePath);

      if (success) {
        // Fetch available servers and active clients
        const lsp = window.vyotiq?.lsp;
        const serversResult = await lsp?.getAvailableServers?.();
        const clientsResult = await lsp?.getClients?.();

        setStatus({
          initialized: true,
          initializing: false,
          error: null,
          availableServers: serversResult?.servers ?? [],
          activeClients: (clientsResult?.clients as LSPStatus['activeClients']) ?? [],
        });
      } else {
        setStatus(prev => ({
          ...prev,
          initializing: false,
          error: 'LSP initialization failed',
        }));
        initRef.current = false;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('LSP initialization failed', { error: errorMsg });
      setStatus(prev => ({
        ...prev,
        initializing: false,
        error: errorMsg,
      }));
      initRef.current = false;
    }
  }, []);

  const openDocument = useCallback(async (filePath: string, content?: string) => {
    await notifyDocumentOpen(filePath, content);
  }, []);

  const updateDocument = useCallback(async (filePath: string, content: string) => {
    await notifyDocumentChange(filePath, content);
  }, []);

  const closeDocument = useCallback(async (filePath: string) => {
    await notifyDocumentClose(filePath);
  }, []);

  const refreshDiags = useCallback(async (filePath?: string) => {
    await refreshDiagnostics(filePath);
  }, []);

  const getClients = useCallback(async () => {
    const lsp = window.vyotiq?.lsp;
    const clientsResult = await lsp?.getClients?.();
    setStatus(prev => ({
      ...prev,
      activeClients: (clientsResult?.clients as LSPStatus['activeClients']) ?? [],
    }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disposeLSPBridge();
    };
  }, []);

  return {
    status,
    initialize,
    openDocument,
    updateDocument,
    closeDocument,
    refreshDiagnostics: refreshDiags,
    getClients,
  };
}

export default useLSP;
