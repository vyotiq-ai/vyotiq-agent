/**
 * WorkspaceProvider
 *
 * Manages workspace state: active path, recent paths, and workspace change events.
 * Uses the split-context pattern (same as UIProvider) for optimal re-render performance.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import { createLogger } from '../utils/logger';
import rustBackend from '../utils/rustBackendClient';

const logger = createLogger('WorkspaceProvider');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkspaceStateType {
  /** Active workspace path, null if none is selected */
  workspacePath: string | null;
  /** Derived workspace folder name */
  workspaceName: string;
  /** Recently opened workspace paths */
  recentPaths: string[];
  /** Whether the initial load is still in progress */
  isLoading: boolean;
  /** Rust backend workspace ID (null if not yet registered) */
  rustWorkspaceId: string | null;
  /** Whether the workspace full-text index is ready */
  isIndexed: boolean;
  /** Whether the Rust backend is currently indexing (full-text) */
  isIndexing: boolean;
  /** Whether vector embeddings are ready for this workspace */
  isVectorReady: boolean;
  /** Whether vector indexing is currently in progress */
  isVectorIndexing: boolean;
  /** Whether the workspace is fully search-ready (both full-text and vectors) */
  isSearchReady: boolean;
}

interface WorkspaceActionsType {
  /** Set the workspace path directly (validated on main process) */
  setWorkspacePath: (path: string) => Promise<boolean>;
  /** Open a native folder-selection dialog */
  selectWorkspaceFolder: () => Promise<boolean>;
  /** Close the current workspace (clear the active path) */
  closeWorkspace: () => Promise<void>;
  /** Refresh the recent paths list */
  refreshRecentPaths: () => Promise<void>;
}

// Combined type for convenience hook
interface WorkspaceContextType extends WorkspaceStateType, WorkspaceActionsType {}

// ---------------------------------------------------------------------------
// Contexts
// ---------------------------------------------------------------------------

const WorkspaceStateContext = createContext<WorkspaceStateType | undefined>(undefined);
const WorkspaceActionsContext = createContext<WorkspaceActionsType | undefined>(undefined);
const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

const RECENT_PATHS_KEY = 'vyotiq-recent-workspaces';
const MAX_RECENT = 10;

function loadRecentPaths(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_PATHS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentPaths(paths: string[]) {
  try {
    localStorage.setItem(RECENT_PATHS_KEY, JSON.stringify(paths.slice(0, MAX_RECENT)));
  } catch {
    // ignore storage errors
  }
}

function addToRecent(path: string, existing: string[]): string[] {
  const filtered = existing.filter((p) => p !== path);
  const updated = [path, ...filtered].slice(0, MAX_RECENT);
  saveRecentPaths(updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const WorkspaceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [workspacePath, setWorkspacePathState] = useState<string | null>(null);
  const [recentPaths, setRecentPaths] = useState<string[]>(() => loadRecentPaths());
  const [isLoading, setIsLoading] = useState(true);
  const [rustWorkspaceId, setRustWorkspaceId] = useState<string | null>(null);
  const [isIndexed, setIsIndexed] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [isVectorReady, setIsVectorReady] = useState(false);
  const [isVectorIndexing, setIsVectorIndexing] = useState(false);
  const [isSearchReady, setIsSearchReady] = useState(false);

  /** Track which workspace path has already been registered with the Rust backend */
  const registeredPathRef = useRef<string | null>(null);

  const workspaceName = useMemo(
    () => workspacePath?.split(/[/\\]/).pop() || 'No Folder',
    [workspacePath],
  );

  // ---- Initial load -------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const [pathRes, recentRes] = await Promise.all([
          window.vyotiq.workspace.getPath(),
          window.vyotiq.workspace.getRecent(),
        ]);

        if (cancelled) return;

        if (pathRes.success && pathRes.path) {
          setWorkspacePathState(pathRes.path);
        }
        if (recentRes.success && recentRes.paths?.length) {
          setRecentPaths(recentRes.paths);
          saveRecentPaths(recentRes.paths);
        }
      } catch (err) {
        logger.debug('Failed to initialise workspace state', {
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Listen for workspace changes from main process ----------------------
  useEffect(() => {
    const unsubscribe = window.vyotiq.workspace.onWorkspaceChanged((data) => {
      if (data.path) {
        setWorkspacePathState(data.path);
        setRecentPaths((prev) => addToRecent(data.path, prev));
      } else {
        // Workspace was closed
        setWorkspacePathState(null);
        registeredPathRef.current = null;
        setRustWorkspaceId(null);
        setIsIndexed(false);
        setIsIndexing(false);
        setIsVectorReady(false);
        setIsVectorIndexing(false);
        setIsSearchReady(false);
      }
    });
    return unsubscribe;
  }, []);

  // ---- Auto-register workspace in Rust backend for indexing ----------------
  useEffect(() => {
    if (!workspacePath || registeredPathRef.current === workspacePath) return;

    let cancelled = false;

    const registerWorkspace = async () => {
      try {
        // Use cached availability check — the RustBackendProvider handles
        // polling with proper backoff, so we don't spam extra health requests.
        const available = await rustBackend.isAvailable();
        if (!available || cancelled) return;

        // Check if workspace already exists (case-insensitive on Windows)
        const workspaces = await rustBackend.listWorkspaces();
        if (cancelled) return;

        const normPath = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
        const existing = workspaces.find(
          (ws) => normPath(ws.root_path ?? ws.path ?? '') === normPath(workspacePath),
        );

        if (existing) {
          // Activate existing workspace and get full index status
          const activated = await rustBackend.activateWorkspace(existing.id);
          if (!cancelled) {
            registeredPathRef.current = workspacePath;
            setRustWorkspaceId(activated.id);
            setIsIndexed(activated.indexed);

            // Fetch detailed index status to restore vector/search readiness
            try {
              const indexStatus = await rustBackend.getIndexStatus(activated.id);
              if (!cancelled) {
                setIsIndexing(indexStatus.is_indexing);
                setIsVectorReady(indexStatus.vector_ready);
                setIsSearchReady(indexStatus.indexed && indexStatus.vector_ready);
              }
            } catch (err) {
              logger.debug('Failed to fetch index status on activation', { error: err instanceof Error ? err.message : String(err) });
            }
          }
        } else {
          // Create new workspace
          const name = workspacePath.split(/[/\\]/).pop() || 'workspace';
          try {
            const created = await rustBackend.createWorkspace(name, workspacePath);
            if (!cancelled) {
              registeredPathRef.current = workspacePath;
              setRustWorkspaceId(created.id);
              setIsIndexed(false);
              // Auto-trigger indexing for new workspaces
              rustBackend.triggerIndex(created.id).catch(() => {});
              setIsIndexing(true);
            }
          } catch (createErr: unknown) {
            // 409 Conflict – workspace was created between our list and create calls
            const is409 =
              createErr instanceof Error && /409|conflict/i.test(createErr.message);
            if (is409 && !cancelled) {
              const refreshed = await rustBackend.listWorkspaces();
              const match = refreshed.find(
                (ws) => normPath(ws.root_path ?? ws.path ?? '') === normPath(workspacePath),
              );
              if (match) {
                const activated = await rustBackend.activateWorkspace(match.id);
                registeredPathRef.current = workspacePath;
                setRustWorkspaceId(activated.id);
                setIsIndexed(activated.indexed);
              }
            } else {
              throw createErr;
            }
          }
        }
      } catch (err) {
        logger.debug('Failed to register workspace with Rust backend', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    // Retry with exponential backoff — the Rust backend may still be starting
    const MAX_RETRIES = 4;
    const BASE_DELAY = 2_000;

    const registerWithRetry = async () => {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (cancelled) return;
        if (registeredPathRef.current === workspacePath) return; // already done

        await registerWorkspace();

        // If registration succeeded, stop retrying
        if (registeredPathRef.current === workspacePath) return;

        // Wait before next attempt (exponential backoff: 2s, 4s, 8s, 16s)
        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    };

    registerWithRetry();
    return () => { cancelled = true; };
  }, [workspacePath]);

  // ---- Track indexing progress from Rust backend ---------------------------
  useEffect(() => {
    if (!rustWorkspaceId) return;

    // Subscribe to workspace-specific events in the backend
    rustBackend.subscribeWorkspace(rustWorkspaceId);

    const unsubscribe = rustBackend.onEvent((event) => {
      if (!('workspace_id' in event.data) || event.data.workspace_id !== rustWorkspaceId) return;

      switch (event.type) {
        case 'index_started':
          setIsIndexing(true);
          setIsSearchReady(false);
          break;
        case 'index_progress':
          setIsIndexing(true);
          break;
        case 'index_complete':
          setIsIndexing(false);
          setIsIndexed(true);
          break;
        case 'index_error':
          setIsIndexing(false);
          setIsVectorIndexing(false);
          break;
        case 'vector_index_progress':
          setIsVectorIndexing(true);
          break;
        case 'vector_index_complete':
          setIsVectorIndexing(false);
          setIsVectorReady(true);
          break;
        case 'search_ready':
          setIsSearchReady(true);
          break;
      }
    });

    return () => {
      unsubscribe();
      rustBackend.unsubscribeWorkspace(rustWorkspaceId);
    };
  }, [rustWorkspaceId]);

  // ---- Actions -------------------------------------------------------------

  const setWorkspacePath = useCallback(async (path: string): Promise<boolean> => {
    try {
      const result = await window.vyotiq.workspace.setPath(path);
      if (result.success && result.path) {
        setWorkspacePathState(result.path);
        setRecentPaths((prev) => addToRecent(result.path!, prev));
        return true;
      }
      logger.debug('Failed to set workspace path', { error: result.error });
      return false;
    } catch (err) {
      logger.debug('Error setting workspace path', {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }, []);

  const selectWorkspaceFolder = useCallback(async (): Promise<boolean> => {
    try {
      const result = await window.vyotiq.workspace.selectFolder();
      if (result.success && result.path) {
        setWorkspacePathState(result.path);
        setRecentPaths((prev) => addToRecent(result.path!, prev));
        return true;
      }
      return false;
    } catch (err) {
      logger.debug('Error selecting workspace folder', {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }, []);

  const closeWorkspace = useCallback(async () => {
    try {
      await window.vyotiq.workspace.close();
      setWorkspacePathState(null);
      registeredPathRef.current = null;
      setRustWorkspaceId(null);
      setIsIndexed(false);
      setIsIndexing(false);
      setIsVectorReady(false);
      setIsVectorIndexing(false);
      setIsSearchReady(false);
    } catch (err) {
      logger.debug('Error closing workspace', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const refreshRecentPaths = useCallback(async () => {
    try {
      const result = await window.vyotiq.workspace.getRecent();
      if (result.success && result.paths) {
        setRecentPaths(result.paths);
        saveRecentPaths(result.paths);
      }
    } catch (err) {
      logger.debug('Failed to refresh recent paths', { error: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  // ---- Context values (split for performance) ------------------------------

  const stateValue = useMemo<WorkspaceStateType>(
    () => ({ workspacePath, workspaceName, recentPaths, isLoading, rustWorkspaceId, isIndexed, isIndexing, isVectorReady, isVectorIndexing, isSearchReady }),
    [workspacePath, workspaceName, recentPaths, isLoading, rustWorkspaceId, isIndexed, isIndexing, isVectorReady, isVectorIndexing, isSearchReady],
  );

  const actionsValue = useMemo<WorkspaceActionsType>(
    () => ({ setWorkspacePath, selectWorkspaceFolder, closeWorkspace, refreshRecentPaths }),
    [setWorkspacePath, selectWorkspaceFolder, closeWorkspace, refreshRecentPaths],
  );

  const contextValue = useMemo<WorkspaceContextType>(
    () => ({ ...stateValue, ...actionsValue }),
    [stateValue, actionsValue],
  );

  return (
    <WorkspaceActionsContext.Provider value={actionsValue}>
      <WorkspaceStateContext.Provider value={stateValue}>
        <WorkspaceContext.Provider value={contextValue}>
          {children}
        </WorkspaceContext.Provider>
      </WorkspaceStateContext.Provider>
    </WorkspaceActionsContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Access only workspace state (path, name, recent, loading). */
export const useWorkspaceState = () => {
  const ctx = useContext(WorkspaceStateContext);
  if (!ctx) throw new Error('useWorkspaceState must be used within a WorkspaceProvider');
  return ctx;
};

/** Access only workspace actions (setPath, selectFolder, refresh). */
export const useWorkspaceActions = () => {
  const ctx = useContext(WorkspaceActionsContext);
  if (!ctx) throw new Error('useWorkspaceActions must be used within a WorkspaceProvider');
  return ctx;
};

/** Full workspace context (state + actions). Prefer split hooks for performance. */
export const useWorkspace = () => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within a WorkspaceProvider');
  return ctx;
};
