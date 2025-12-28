/**
 * Workspace Context Provider
 * 
 * Manages workspace-level context.
 */
import React, { createContext, useContext, ReactNode } from 'react';

// =============================================================================
// Types
// =============================================================================

import { useAgentSelector } from './AgentProvider';
import { WorkspaceEntry } from '../../shared/types';

// =============================================================================
// Types
// =============================================================================

/** Workspace context state */
export interface WorkspaceContextState {
  /** The currently active workspace */
  activeWorkspace: WorkspaceEntry | null;
  /** Recently opened files in this workspace */
  recentFiles: string[];
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

  const [recentFiles, setRecentFiles] = React.useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('vyotiq-recent-files');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Track recent files in localStorage
  React.useEffect(() => {
    localStorage.setItem('vyotiq-recent-files', JSON.stringify(recentFiles));
  }, [recentFiles]);

  const addRecentFile = React.useCallback((path: string) => {
    setRecentFiles(prev => {
      const filtered = prev.filter(p => p !== path);
      return [path, ...filtered].slice(0, 10); // Keep last 10
    });
  }, []);

  const clearRecentFiles = React.useCallback(() => {
    setRecentFiles([]);
  }, []);

  const value: WorkspaceContextValue = {
    state: {
      activeWorkspace,
      recentFiles,
    },
    addRecentFile,
    clearRecentFiles,
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
