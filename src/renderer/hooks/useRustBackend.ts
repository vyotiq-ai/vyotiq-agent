/**
 * useRustBackend Hook
 *
 * Provides access to the Rust backend client with automatic lifecycle management,
 * connection status tracking, and event subscriptions.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import rustBackend, {
  type ServerEvent,
  type RustWorkspace,
  type RustSearchResult,
  type RustGrepMatch,
  type IndexProgress,
} from '../utils/rustBackendClient';
import { createLogger } from '../utils/logger';

const logger = createLogger('useRustBackend');

// ---------------------------------------------------------------------------
// Connection hook
// ---------------------------------------------------------------------------

/**
 * Track Rust backend connection status and provide the client instance.
 *
 * NOTE: This hook does NOT own the client lifecycle — `RustBackendProvider`
 * handles `init()` / `destroy()`. This hook simply reflects the shared
 * availability state so components can react to it.
 */
export function useRustBackendConnection() {
  const [isAvailable, setIsAvailable] = useState(rustBackend.available);
  const [isConnecting, setIsConnecting] = useState(!rustBackend.available);

  useEffect(() => {
    let cancelled = false;

    // Subscribe to real-time availability changes from the singleton client.
    // No independent polling — the client + RustBackendProvider handle that.
    const unsub = rustBackend.onAvailabilityChange((available) => {
      if (!cancelled) {
        setIsAvailable(available);
        setIsConnecting(false);
      }
    });

    // In case the client already knows the answer (cached), sync once.
    rustBackend.isAvailable().then((available) => {
      if (!cancelled) {
        setIsAvailable(available);
        setIsConnecting(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setIsAvailable(false);
        setIsConnecting(false);
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return { isAvailable, isConnecting, client: rustBackend };
}

// ---------------------------------------------------------------------------
// Event subscription hook
// ---------------------------------------------------------------------------

/** Subscribe to real-time events from the Rust backend. */
export function useRustBackendEvents(handler: (event: ServerEvent) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const unsubscribe = rustBackend.onEvent((event) => handlerRef.current(event));
    return unsubscribe;
  }, []);
}

// ---------------------------------------------------------------------------
// Search hook
// ---------------------------------------------------------------------------

interface SearchState {
  results: RustSearchResult[];
  total: number;
  tookMs: number;
  isSearching: boolean;
  error: string | null;
}

export function useRustSearch(workspaceId: string | null) {
  const [state, setState] = useState<SearchState>({
    results: [],
    total: 0,
    tookMs: 0,
    isSearching: false,
    error: null,
  });

  const search = useCallback(
    async (query: string, options: { limit?: number; offset?: number; extensions?: string[] } = {}) => {
      if (!workspaceId || !query.trim()) {
        setState((prev) => ({ ...prev, results: [], total: 0, error: null }));
        return;
      }

      setState((prev) => ({ ...prev, isSearching: true, error: null }));
      try {
        const result = await rustBackend.search(workspaceId, query, options);
        setState({
          results: result.results,
          total: result.total,
          tookMs: result.took_ms,
          isSearching: false,
          error: null,
        });
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isSearching: false,
          error: err instanceof Error ? err.message : 'Search failed',
        }));
      }
    },
    [workspaceId],
  );

  const clear = useCallback(() => {
    setState({ results: [], total: 0, tookMs: 0, isSearching: false, error: null });
  }, []);

  return { ...state, search, clear };
}

// ---------------------------------------------------------------------------
// Grep search hook
// ---------------------------------------------------------------------------

interface GrepState {
  matches: RustGrepMatch[];
  totalMatches: number;
  filesSearched: number;
  isSearching: boolean;
  error: string | null;
}

export function useRustGrep(workspaceId: string | null) {
  const [state, setState] = useState<GrepState>({
    matches: [],
    totalMatches: 0,
    filesSearched: 0,
    isSearching: false,
    error: null,
  });

  const grep = useCallback(
    async (
      pattern: string,
      options: {
        is_regex?: boolean;
        case_sensitive?: boolean;
        include_patterns?: string[];
        exclude_patterns?: string[];
        max_results?: number;
      } = {},
    ) => {
      if (!workspaceId || !pattern.trim()) {
        setState((prev) => ({ ...prev, matches: [], totalMatches: 0, error: null }));
        return;
      }

      setState((prev) => ({ ...prev, isSearching: true, error: null }));
      try {
        const result = await rustBackend.grepSearch(workspaceId, pattern, options);
        setState({
          matches: result.matches,
          totalMatches: result.total_matches,
          filesSearched: result.files_searched,
          isSearching: false,
          error: null,
        });
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isSearching: false,
          error: err instanceof Error ? err.message : 'Grep failed',
        }));
      }
    },
    [workspaceId],
  );

  const clear = useCallback(() => {
    setState({ matches: [], totalMatches: 0, filesSearched: 0, isSearching: false, error: null });
  }, []);

  return { ...state, grep, clear };
}

// ---------------------------------------------------------------------------
// Workspace management hook
// ---------------------------------------------------------------------------

export function useRustWorkspaces() {
  const [workspaces, setWorkspaces] = useState<RustWorkspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const available = await rustBackend.isAvailable();
      if (!available) return;
      const list = await rustBackend.listWorkspaces();
      setWorkspaces(list);
    } catch (err) {
      logger.debug('Failed to refresh workspaces', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(async (name: string, rootPath: string) => {
    const ws = await rustBackend.createWorkspace(name, rootPath);
    setWorkspaces((prev) => [...prev, ws]);
    return ws;
  }, []);

  const remove = useCallback(async (id: string) => {
    await rustBackend.deleteWorkspace(id);
    setWorkspaces((prev) => prev.filter((w) => w.id !== id));
  }, []);

  return { workspaces, isLoading, refresh, create, remove };
}

// ---------------------------------------------------------------------------
// Index progress hook
// ---------------------------------------------------------------------------

export function useIndexProgress(workspaceId: string | null) {
  const [progress, setProgress] = useState<IndexProgress | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;

    const unsubscribe = rustBackend.onEvent((event) => {
      if (event.type === 'index_progress' && event.data.workspace_id === workspaceId) {
        setProgress(event.data);
        setIsComplete(false);
      } else if (event.type === 'index_complete' && event.data.workspace_id === workspaceId) {
        setIsComplete(true);
        setProgress(null);
      }
    });

    return unsubscribe;
  }, [workspaceId]);

  const trigger = useCallback(async () => {
    if (!workspaceId) return;
    setIsComplete(false);
    await rustBackend.triggerIndex(workspaceId);
  }, [workspaceId]);

  return { progress, isComplete, trigger };
}

// ---------------------------------------------------------------------------
// File change events hook
// ---------------------------------------------------------------------------

export interface FileChangeEvent {
  workspace_id: string;
  path: string;
  change_type: string;
}

/** Subscribe to file change events from the Rust backend file watcher. */
export function useRustFileWatcher(
  workspaceId: string | null,
  handler?: (event: FileChangeEvent) => void,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const [lastChange, setLastChange] = useState<FileChangeEvent | null>(null);

  useEffect(() => {
    if (!workspaceId) return;

    const unsubscribe = rustBackend.onEvent((event) => {
      if (
        event.type === 'file_changed' &&
        event.data.workspace_id === workspaceId
      ) {
        const change: FileChangeEvent = {
          workspace_id: event.data.workspace_id,
          path: event.data.path,
          change_type: event.data.event_type,
        };
        setLastChange(change);
        handlerRef.current?.(change);
      }
    });

    // Subscribe to this workspace's events via WebSocket
    rustBackend.subscribeWorkspace(workspaceId);

    return () => {
      unsubscribe();
      rustBackend.unsubscribeWorkspace(workspaceId);
    };
  }, [workspaceId]);

  return { lastChange };
}

// ---------------------------------------------------------------------------
// Index status hook
// ---------------------------------------------------------------------------

interface IndexStatusState {
  indexed: boolean;
  isIndexing: boolean;
  indexedCount: number;
  totalCount: number;
  searchReady: boolean;
  isLoading: boolean;
}

/** Get and track the indexing status of a workspace. */
export function useRustIndexStatus(workspaceId: string | null) {
  const [state, setState] = useState<IndexStatusState>({
    indexed: false,
    isIndexing: false,
    indexedCount: 0,
    totalCount: 0,
    searchReady: false,
    isLoading: true,
  });

  // Fetch initial status
  useEffect(() => {
    if (!workspaceId) {
      setState((prev) => ({ ...prev, isLoading: false }));
      return;
    }

    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const status = await rustBackend.getIndexStatus(workspaceId);
        if (!cancelled) {
          setState({
            indexed: status.indexed,
            isIndexing: status.is_indexing,
            indexedCount: status.indexed_count,
            totalCount: status.total_count,
            searchReady: status.indexed,
            isLoading: false,
          });
        }
      } catch (err) {
        logger.debug('Failed to fetch index status', { workspaceId, error: err instanceof Error ? err.message : String(err) });
        if (!cancelled) {
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      }
    };

    fetchStatus();
    return () => { cancelled = true; };
  }, [workspaceId]);

  // Track real-time indexing progress events
  useEffect(() => {
    if (!workspaceId) return;

    const unsubscribe = rustBackend.onEvent((event) => {
      if (event.type === 'index_progress' && event.data.workspace_id === workspaceId) {
        setState((prev) => ({
          ...prev,
          isIndexing: true,
          indexedCount: event.data.indexed,
          totalCount: event.data.total,
        }));
      } else if (event.type === 'index_complete' && event.data.workspace_id === workspaceId) {
        setState((prev) => ({
          ...prev,
          indexed: true,
          isIndexing: false,
          indexedCount: event.data.total_files,
          totalCount: event.data.total_files,
        }));
      } else if (event.type === 'search_ready' && event.data.workspace_id === workspaceId) {
        setState((prev) => ({
          ...prev,
          searchReady: true,
        }));
      } else if (event.type === 'index_started' && event.data.workspace_id === workspaceId) {
        setState((prev) => ({
          ...prev,
          isIndexing: true,
          searchReady: false,
        }));
      } else if (event.type === 'index_error' && event.data.workspace_id === workspaceId) {
        setState((prev) => ({
          ...prev,
          isIndexing: false,
        }));
      }
    });

    return unsubscribe;
  }, [workspaceId]);

  // Fallback: poll index status periodically to recover from missed WebSocket
  // events (e.g., WS not connected when indexing completed, no-op runs, etc.)
  const isIndexingRef = useRef(state.isIndexing);
  isIndexingRef.current = state.isIndexing;

  useEffect(() => {
    if (!workspaceId) return;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled) return;
      try {
        const status = await rustBackend.getIndexStatus(workspaceId);
        if (cancelled) return;
        setState((prev) => {
          // Only update if there's an actual discrepancy
          if (prev.isIndexing !== status.is_indexing || prev.indexed !== status.indexed) {
            return {
              ...prev,
              indexed: status.indexed,
              isIndexing: status.is_indexing,
              indexedCount: status.indexed_count,
              totalCount: status.total_count,
              searchReady: status.indexed && !status.is_indexing,
            };
          }
          return prev;
        });
      } catch {
        // Ignore — backend may be temporarily unreachable
      }
      if (!cancelled) {
        // Poll faster while indexing (5s), slower when idle (30s)
        const interval = isIndexingRef.current ? 5_000 : 30_000;
        pollTimer = setTimeout(poll, interval);
      }
    };

    // Start first poll after a short delay
    pollTimer = setTimeout(poll, 3_000);

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [workspaceId]);

  const triggerIndex = useCallback(async () => {
    if (!workspaceId) return;
    setState((prev) => ({ ...prev, isIndexing: true }));
    await rustBackend.triggerIndex(workspaceId);
  }, [workspaceId]);

  return { ...state, triggerIndex };
}

// ---------------------------------------------------------------------------
// Unified workspace manager hook (bridges Electron + Rust backend)
// ---------------------------------------------------------------------------

interface UnifiedWorkspaceState {
  /** Active Rust backend workspace (null if not yet registered) */
  activeWorkspace: RustWorkspace | null;
  /** All registered workspaces in the Rust backend */
  workspaces: RustWorkspace[];
  /** Whether the workspaces are loading */
  isLoading: boolean;
}

/**
 * Manages workspaces across both the Electron file system and Rust backend.
 * When a user selects a workspace folder (via Electron), this hook ensures
 * it's also registered in the Rust backend for indexing and search.
 */
export function useUnifiedWorkspace(electronWorkspacePath: string | null) {
  const [state, setState] = useState<UnifiedWorkspaceState>({
    activeWorkspace: null,
    workspaces: [],
    isLoading: true,
  });

  // Load workspaces from Rust backend
  const loadWorkspaces = useCallback(async () => {
    try {
      const available = await rustBackend.isAvailable();
      if (!available) {
        setState((prev) => ({ ...prev, isLoading: false }));
        return [];
      }
      const list = await rustBackend.listWorkspaces();
      setState((prev) => ({ ...prev, workspaces: list, isLoading: false }));
      return list;
    } catch (err) {
      logger.debug('Failed to load workspaces from backend', { error: err instanceof Error ? err.message : String(err) });
      setState((prev) => ({ ...prev, isLoading: false }));
      return [];
    }
  }, []);

  // Register a workspace path with the Rust backend if not already registered
  const ensureWorkspaceRegistered = useCallback(
    async (workspacePath: string) => {
      try {
        const available = await rustBackend.isAvailable();
        if (!available) {
          setState((prev) => ({ ...prev, isLoading: false }));
          return null;
        }
        const list = await rustBackend.listWorkspaces();
        const normPath = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
        const existing = list.find(
          (ws) => normPath(ws.root_path ?? ws.path ?? '') === normPath(workspacePath),
        );

        if (existing) {
          // Activate existing workspace
          const activated = await rustBackend.activateWorkspace(existing.id);
          setState((prev) => ({
            ...prev,
            activeWorkspace: activated,
            workspaces: list,
            isLoading: false,
          }));
          return activated;
        }

        // Create new workspace
        const name = workspacePath.split(/[/\\]/).pop() || 'workspace';
        try {
          const created = await rustBackend.createWorkspace(name, workspacePath);
          setState((prev) => ({
            ...prev,
            activeWorkspace: created,
            workspaces: [...list, created],
            isLoading: false,
          }));
          return created;
        } catch (createErr: unknown) {
          // 409 Conflict – workspace was created between list and create calls
          const is409 = createErr instanceof Error && /409|conflict/i.test(createErr.message);
          if (is409) {
            const refreshed = await rustBackend.listWorkspaces();
            const match = refreshed.find(
              (ws) => normPath(ws.root_path ?? ws.path ?? '') === normPath(workspacePath),
            );
            if (match) {
              const activated = await rustBackend.activateWorkspace(match.id);
              setState((prev) => ({
                ...prev,
                activeWorkspace: activated,
                workspaces: refreshed,
                isLoading: false,
              }));
              return activated;
            }
          }
          throw createErr;
        }
      } catch (err) {
        logger.warn('Failed to register workspace', { error: err instanceof Error ? err.message : String(err) });
        setState((prev) => ({ ...prev, isLoading: false }));
        return null;
      }
    },
    [],
  );

  // Sync with Electron workspace path
  useEffect(() => {
    if (!electronWorkspacePath) {
      setState((prev) => ({ ...prev, activeWorkspace: null, isLoading: false }));
      return;
    }

    ensureWorkspaceRegistered(electronWorkspacePath);
  }, [electronWorkspacePath, ensureWorkspaceRegistered]);

  // Listen for workspace changes from Rust backend
  useEffect(() => {
    const unsubscribe = rustBackend.onEvent((event) => {
      if (event.type === 'workspace_created') {
        setState((prev) => ({
          ...prev,
          workspaces: [...prev.workspaces.filter((w) => w.id !== event.data.id), event.data],
        }));
      } else if (event.type === 'workspace_removed') {
        setState((prev) => ({
          ...prev,
          workspaces: prev.workspaces.filter((w) => w.id !== event.data.workspace_id),
          activeWorkspace:
            prev.activeWorkspace?.id === event.data.workspace_id
              ? null
              : prev.activeWorkspace,
        }));
      }
    });

    return unsubscribe;
  }, []);

  const removeWorkspace = useCallback(async (id: string) => {
    await rustBackend.deleteWorkspace(id);
    setState((prev) => ({
      ...prev,
      workspaces: prev.workspaces.filter((w) => w.id !== id),
      activeWorkspace: prev.activeWorkspace?.id === id ? null : prev.activeWorkspace,
    }));
  }, []);

  const switchWorkspace = useCallback(async (id: string) => {
    try {
      const activated = await rustBackend.activateWorkspace(id);
      setState((prev) => ({ ...prev, activeWorkspace: activated }));
      return activated;
    } catch (err) {
      logger.warn('Failed to switch workspace', { id, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }, []);

  return useMemo(
    () => ({
      ...state,
      loadWorkspaces,
      ensureWorkspaceRegistered,
      removeWorkspace,
      switchWorkspace,
    }),
    [state, loadWorkspaces, ensureWorkspaceRegistered, removeWorkspace, switchWorkspace],
  );
}
