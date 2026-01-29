/**
 * Workspace Context Provider
 * 
 * Manages workspace-level context including real-time diagnostics subscription.
 */
import React, { createContext, useContext, ReactNode, useEffect, useState, useCallback } from 'react';

// =============================================================================
// Types
// =============================================================================

import { useAgentSelector } from './AgentProvider';
import { WorkspaceEntry } from '../../shared/types';
import { createLogger } from '../utils/logger';

const logger = createLogger('WorkspaceContext');

// =============================================================================
// Types
// =============================================================================

/** Workspace diagnostic from the TypeScript diagnostics service */
export interface WorkspaceDiagnostic {
  filePath: string;
  fileName?: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  source: string;
  code?: string | number;
}

/** Workspace context state */
export interface WorkspaceContextState {
  /** The currently active workspace */
  activeWorkspace: WorkspaceEntry | null;
  /** Recently opened files in this workspace */
  recentFiles: string[];
  /** Current workspace diagnostics */
  diagnostics: WorkspaceDiagnostic[];
  /** Count of errors in the workspace */
  errorCount: number;
  /** Count of warnings in the workspace */
  warningCount: number;
  /** Whether diagnostics are being loaded */
  diagnosticsLoading: boolean;
}

// =============================================================================
// Initial State
// =============================================================================


// =============================================================================
// Context
// =============================================================================

interface WorkspaceContextValue {
  state: WorkspaceContextState;
  addRecentFile: (path: string) => void;
  clearRecentFiles: () => void;
  refreshDiagnostics: () => Promise<void>;
}

const WorkspaceContextContext = createContext<WorkspaceContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface WorkspaceContextProviderProps {
  children: ReactNode;
}

export const WorkspaceContextProvider: React.FC<WorkspaceContextProviderProps> = ({ children }) => {
  // Find active workspace from AgentProvider
  const activeWorkspace = useAgentSelector(
    (s) => s.workspaces.find(w => w.isActive) || null,
    (a, b) => a === b,
  );

  const [recentFiles, setRecentFiles] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('vyotiq-recent-files');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Diagnostics state
  const [diagnostics, setDiagnostics] = useState<WorkspaceDiagnostic[]>([]);
  const [errorCount, setErrorCount] = useState(0);
  const [warningCount, setWarningCount] = useState(0);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);

  // Track recent files in localStorage
  useEffect(() => {
    localStorage.setItem('vyotiq-recent-files', JSON.stringify(recentFiles));
  }, [recentFiles]);

  const addRecentFile = useCallback((path: string) => {
    setRecentFiles(prev => {
      const filtered = prev.filter(p => p !== path);
      return [path, ...filtered].slice(0, 10); // Keep last 10
    });
  }, []);

  const clearRecentFiles = useCallback(() => {
    setRecentFiles([]);
  }, []);

  // Refresh diagnostics manually
  const refreshDiagnostics = useCallback(async () => {
    if (!activeWorkspace) return;
    
    setDiagnosticsLoading(true);
    try {
      const result = await window.vyotiq.workspace.getDiagnostics({ forceRefresh: true });
      if (result.success && result.diagnostics) {
        setDiagnostics(result.diagnostics);
        setErrorCount(result.errorCount || 0);
        setWarningCount(result.warningCount || 0);
      }
    } catch (err) {
      logger.debug('Failed to refresh diagnostics', { error: err });
    } finally {
      setDiagnosticsLoading(false);
    }
  }, [activeWorkspace]);

  // Subscribe to real-time diagnostics updates when workspace is active
  // We intentionally only depend on activeWorkspace (not .id) to satisfy exhaustive-deps
  useEffect(() => {
    if (!activeWorkspace) {
      // Clear diagnostics when no workspace
      setDiagnostics([]);
      setErrorCount(0);
      setWarningCount(0);
      return;
    }

    const workspaceId = activeWorkspace.id;
    let unsubscribe: (() => void) | undefined;

    const setupDiagnostics = async () => {
      try {
        // Subscribe to real-time updates
        const result = await window.vyotiq.workspace.subscribeToDiagnostics();
        if (!result.success) {
          logger.debug('Failed to subscribe to diagnostics', { error: result.error });
          return;
        }

        // Listen for diagnostics changes
        unsubscribe = window.vyotiq.workspace.onDiagnosticsChange((event) => {
          const diags = event.diagnostics ?? [];
          setDiagnostics(diags);
          setErrorCount(event.errorCount ?? 0);
          setWarningCount(event.warningCount ?? 0);
          logger.debug('Diagnostics updated', { 
            count: diags.length,
            errors: event.errorCount ?? 0,
            warnings: event.warningCount ?? 0,
          });
        });

        logger.info('Subscribed to workspace diagnostics', { workspaceId });
      } catch (err) {
        logger.debug('Error setting up diagnostics subscription', { error: err });
      }
    };

    setupDiagnostics();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      // Unsubscribe from diagnostics when workspace changes
      window.vyotiq.workspace.unsubscribeFromDiagnostics().catch(() => {
        // Ignore errors during cleanup
      });
    };
  }, [activeWorkspace]);

  // Sync diagnostics to main process for agent context
  // Note: This is a fallback - EditorProvider also syncs diagnostics with editor state
  // This ensures diagnostics are available even if no files are open
  useEffect(() => {
    if (diagnostics.length === 0) return;

    // Only sync if there are diagnostics and we want to ensure they're available
    // The EditorProvider will include these in its updateEditorState call
    logger.debug('Workspace diagnostics available for agent context', {
      count: diagnostics.length,
      errors: errorCount,
      warnings: warningCount,
    });
  }, [diagnostics, errorCount, warningCount]);

  const value: WorkspaceContextValue = {
    state: {
      activeWorkspace,
      recentFiles,
      diagnostics,
      errorCount,
      warningCount,
      diagnosticsLoading,
    },
    addRecentFile,
    clearRecentFiles,
    refreshDiagnostics,
  };

  return (
    <WorkspaceContextContext.Provider value={value}>
      {children}
    </WorkspaceContextContext.Provider>
  );
};

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access workspace context
 */
export function useWorkspaceContext(): WorkspaceContextValue {
  const context = useContext(WorkspaceContextContext);
  if (!context) {
    throw new Error('useWorkspaceContext must be used within WorkspaceContextProvider');
  }
  return context;
}
