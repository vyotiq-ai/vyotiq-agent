/**
 * Workspace Tabs Provider
 * 
 * Manages state for multiple open workspace tabs in the multi-workspace view.
 * Provides workspace tab operations and state synchronization with main process.
 */
import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useMemo,
  useRef,
  startTransition,
} from 'react';
import type { WorkspaceEntry, WorkspaceTab } from '../../shared/types';
import { useAgentSelector } from './AgentProvider';
import { createLogger } from '../utils/logger';

const logger = createLogger('WorkspaceTabsProvider');

// =============================================================================
// Types
// =============================================================================

export interface WorkspaceTabWithInfo extends WorkspaceTab {
  /** Associated workspace entry data */
  workspace: WorkspaceEntry | null;
  /** Number of sessions in this workspace */
  sessionCount?: number;
  /** Whether any sessions are running in this workspace */
  hasActiveSessions?: boolean;
}

export interface WorkspaceTabsState {
  /** Array of currently open tabs */
  tabs: WorkspaceTabWithInfo[];
  /** ID of the currently focused tab */
  focusedTabId: string | null;
  /** Maximum tabs allowed */
  maxTabs: number;
  /** Whether tabs are loading */
  isLoading: boolean;
  /** Last error message */
  error: string | null;
}

export interface WorkspaceTabsActions {
  /** Open a workspace in a new tab (or focus if already open) */
  openTab: (workspaceId: string) => Promise<void>;
  /** Close a workspace tab */
  closeTab: (workspaceId: string) => Promise<void>;
  /** Focus a workspace tab */
  focusTab: (workspaceId: string) => Promise<void>;
  /** Reorder tabs by dragging */
  reorderTabs: (workspaceId: string, newOrder: number) => Promise<void>;
  /** Set the maximum number of tabs */
  setMaxTabs: (maxTabs: number) => Promise<void>;
  /** Refresh tabs from main process */
  refreshTabs: () => Promise<void>;
  /** Close all tabs except the given one */
  closeOtherTabs: (workspaceId: string) => Promise<void>;
  /** Close all tabs to the right of the given one */
  closeTabsToRight: (workspaceId: string) => Promise<void>;
}

interface WorkspaceTabsContextValue {
  state: WorkspaceTabsState;
  actions: WorkspaceTabsActions;
}

// =============================================================================
// Context
// =============================================================================

const WorkspaceTabsContext = createContext<WorkspaceTabsContextValue | null>(null);

// =============================================================================
// Hooks
// =============================================================================

export function useWorkspaceTabs(): WorkspaceTabsContextValue {
  const context = useContext(WorkspaceTabsContext);
  if (!context) {
    throw new Error('useWorkspaceTabs must be used within WorkspaceTabsProvider');
  }
  return context;
}

export function useWorkspaceTabsState(): WorkspaceTabsState {
  return useWorkspaceTabs().state;
}

export function useWorkspaceTabsActions(): WorkspaceTabsActions {
  return useWorkspaceTabs().actions;
}

export function useFocusedWorkspace(): WorkspaceEntry | null {
  const { state } = useWorkspaceTabs();
  const focusedTab = state.tabs.find(t => t.workspaceId === state.focusedTabId);
  return focusedTab?.workspace ?? null;
}

export function useIsWorkspaceTabOpen(workspaceId: string): boolean {
  const { state } = useWorkspaceTabs();
  return state.tabs.some(t => t.workspaceId === workspaceId);
}

// =============================================================================
// Provider
// =============================================================================

interface WorkspaceTabsProviderProps {
  children: React.ReactNode;
}

const initialState: WorkspaceTabsState = {
  tabs: [],
  focusedTabId: null,
  maxTabs: 10,
  isLoading: false,
  error: null,
};

export const WorkspaceTabsProvider: React.FC<WorkspaceTabsProviderProps> = ({ children }) => {
  const [state, setState] = useState<WorkspaceTabsState>(initialState);
  const loadingRef = useRef(false);
  
  // Get workspaces from AgentProvider for enrichment
  const workspaces = useAgentSelector(
    s => s.workspaces,
    (a, b) => a === b
  );

  // Fetch tabs from main process
  const fetchTabs = useCallback(async () => {
    if (loadingRef.current) return;
    
    loadingRef.current = true;
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const result = await window.vyotiq.workspace.getTabs();
      
      if (result.success && result.tabs) {
        // Enrich tabs with workspace info
        const enrichedTabs: WorkspaceTabWithInfo[] = result.tabs.map(tab => ({
          ...tab,
          workspace: tab.workspace || workspaces.find(w => w.id === tab.workspaceId) || null,
        }));

        startTransition(() => {
          setState(prev => ({
            ...prev,
            tabs: enrichedTabs,
            focusedTabId: result.focusedTabId ?? null,
            maxTabs: result.maxTabs ?? 10,
            isLoading: false,
            error: null,
          }));
        });
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: result.error ?? 'Failed to load workspace tabs',
        }));
      }
    } catch (error) {
      logger.error('Failed to fetch workspace tabs', {
        error: error instanceof Error ? error.message : String(error),
      });
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load workspace tabs',
      }));
    } finally {
      loadingRef.current = false;
    }
  }, [workspaces]);

  // Initial load
  useEffect(() => {
    fetchTabs();
  }, [fetchTabs]);

  // Listen for workspace-tabs-update events from main process
  useEffect(() => {
    const handleEvent = (event: { type: string; tabs?: WorkspaceTab[]; focusedTabId?: string | null }) => {
      if (event.type === 'workspace-tabs-update' && event.tabs) {
        const enrichedTabs: WorkspaceTabWithInfo[] = event.tabs.map(tab => ({
          ...tab,
          workspace: workspaces.find(w => w.id === tab.workspaceId) || null,
        }));

        startTransition(() => {
          setState(prev => ({
            ...prev,
            tabs: enrichedTabs,
            focusedTabId: event.focusedTabId ?? prev.focusedTabId,
          }));
        });
      }
    };

    // Subscribe to agent events for workspace tab updates
    const unsubscribe = window.vyotiq.agent.onEvent(handleEvent as (event: unknown) => void);
    return unsubscribe;
  }, [workspaces]);

  // Actions
  const openTab = useCallback(async (workspaceId: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const result = await window.vyotiq.workspace.openTab(workspaceId);
      
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to open tab');
      }

      logger.info('Opened workspace tab', { workspaceId });
    } catch (error) {
      logger.error('Failed to open workspace tab', {
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to open tab',
      }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const closeTab = useCallback(async (workspaceId: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const result = await window.vyotiq.workspace.closeTab(workspaceId);
      
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to close tab');
      }

      logger.info('Closed workspace tab', { workspaceId });
    } catch (error) {
      logger.error('Failed to close workspace tab', {
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to close tab',
      }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const focusTab = useCallback(async (workspaceId: string) => {
    // Optimistic update
    setState(prev => ({
      ...prev,
      focusedTabId: workspaceId,
      tabs: prev.tabs.map(t => ({
        ...t,
        isFocused: t.workspaceId === workspaceId,
        lastFocusedAt: t.workspaceId === workspaceId ? Date.now() : t.lastFocusedAt,
      })),
    }));
    
    try {
      const result = await window.vyotiq.workspace.focusTab(workspaceId);
      
      if (!result.success) {
        // Revert optimistic update on failure
        await fetchTabs();
        throw new Error(result.error ?? 'Failed to focus tab');
      }
    } catch (error) {
      logger.error('Failed to focus workspace tab', {
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to focus tab',
      }));
    }
  }, [fetchTabs]);

  const reorderTabs = useCallback(async (workspaceId: string, newOrder: number) => {
    try {
      const result = await window.vyotiq.workspace.reorderTabs(workspaceId, newOrder);
      
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to reorder tabs');
      }
    } catch (error) {
      logger.error('Failed to reorder tabs', {
        workspaceId,
        newOrder,
        error: error instanceof Error ? error.message : String(error),
      });
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to reorder tabs',
      }));
    }
  }, []);

  const setMaxTabs = useCallback(async (maxTabs: number) => {
    try {
      const result = await window.vyotiq.workspace.setMaxTabs(maxTabs);
      
      if (result.success) {
        setState(prev => ({ ...prev, maxTabs: result.maxTabs ?? maxTabs }));
      } else {
        throw new Error(result.error ?? 'Failed to set max tabs');
      }
    } catch (error) {
      logger.error('Failed to set max tabs', {
        maxTabs,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  const closeOtherTabs = useCallback(async (workspaceId: string) => {
    const tabsToClose = state.tabs
      .filter(t => t.workspaceId !== workspaceId)
      .map(t => t.workspaceId);
    
    for (const id of tabsToClose) {
      await closeTab(id);
    }
  }, [state.tabs, closeTab]);

  const closeTabsToRight = useCallback(async (workspaceId: string) => {
    const tabIndex = state.tabs.findIndex(t => t.workspaceId === workspaceId);
    if (tabIndex === -1) return;

    const tabsToClose = state.tabs
      .slice(tabIndex + 1)
      .map(t => t.workspaceId);
    
    for (const id of tabsToClose) {
      await closeTab(id);
    }
  }, [state.tabs, closeTab]);

  const actions = useMemo<WorkspaceTabsActions>(() => ({
    openTab,
    closeTab,
    focusTab,
    reorderTabs,
    setMaxTabs,
    refreshTabs: fetchTabs,
    closeOtherTabs,
    closeTabsToRight,
  }), [openTab, closeTab, focusTab, reorderTabs, setMaxTabs, fetchTabs, closeOtherTabs, closeTabsToRight]);

  const value = useMemo<WorkspaceTabsContextValue>(() => ({
    state,
    actions,
  }), [state, actions]);

  return (
    <WorkspaceTabsContext.Provider value={value}>
      {children}
    </WorkspaceTabsContext.Provider>
  );
};

export default WorkspaceTabsProvider;
