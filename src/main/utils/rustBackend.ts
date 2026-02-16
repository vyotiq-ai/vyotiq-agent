/**
 * Shared Rust Backend Utilities
 *
 * Provides a centralized rust backend HTTP helper and workspace ID resolution
 * so tool implementations don't duplicate this logic.
 */
import { rustSidecar } from '../rustSidecar';
import type { Logger } from '../logger';

// =============================================================================
// Path normalization
// =============================================================================

/** Normalize a file path for cross-platform comparison (forward slashes, lowercase, no trailing slash) */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

// =============================================================================
// Rust backend HTTP helper
// =============================================================================

const DEFAULT_TIMEOUT = 30_000;

/**
 * Make an HTTP request to the Rust backend sidecar.
 *
 * @param path - API path (e.g. `/api/workspaces`)
 * @param options - Fetch options
 * @param signal - Optional external AbortSignal
 * @param timeout - Request timeout in ms (default 30 000)
 */
export async function rustRequest<T>(
  path: string,
  options: RequestInit = {},
  signal?: AbortSignal,
  timeout: number = DEFAULT_TIMEOUT,
): Promise<T> {
  const port = rustSidecar.getPort();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const authHeaders = rustSidecar.getAuthHeaders();
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...authHeaders, ...options.headers },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Rust backend ${response.status}: ${body}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// =============================================================================
// Workspace ID resolution (with cache)
// =============================================================================

const workspaceIdCache = new Map<string, { id: string; expires: number }>();

/**
 * Resolve a workspace filesystem path to the Rust backend's workspace UUID.
 * Uses a 5-minute TTL cache to avoid repeated HTTP round-trips.
 */
export async function resolveWorkspaceId(
  workspacePath: string,
  logger?: Logger,
): Promise<string | null> {
  const key = normalizePath(workspacePath);

  // Check cache (5 minute TTL)
  const cached = workspaceIdCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.id;

  try {
    const data = await rustRequest<{ workspaces: Array<{ id: string; path: string }> }>(
      '/api/workspaces',
    );
    const workspaces = data.workspaces ?? (data as unknown as Array<{ id: string; path: string }>);
    const list = Array.isArray(workspaces) ? workspaces : [];

    for (const ws of list) {
      if (normalizePath(ws.path) === key) {
        workspaceIdCache.set(key, { id: ws.id, expires: Date.now() + 5 * 60_000 });
        return ws.id;
      }
    }
    return null;
  } catch (err) {
    logger?.debug?.('Failed to resolve workspace ID', {
      workspacePath,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Clear the workspace ID cache (useful for testing) */
export function clearWorkspaceIdCache(): void {
  workspaceIdCache.clear();
}
