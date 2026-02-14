/**
 * Rust Backend Client
 *
 * Typed HTTP + WebSocket client for the Rust sidecar backend.
 * Provides workspace management, file operations, search, and real-time events.
 */

import { createLogger } from './logger';

const log = createLogger('RustBackend');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = 'http://127.0.0.1:9721';
const DEFAULT_WS_URL = 'ws://127.0.0.1:9721/ws';
const REQUEST_TIMEOUT = 10_000;
const HEALTH_TIMEOUT = 5_000;

/** Auth token for sidecar requests, fetched from main process */
let sidecarAuthToken = '';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RustWorkspace {
  id: string;
  name: string;
  /** Canonical path to the workspace root */
  root_path: string;
  /** Same as root_path – alias from Rust backend */
  path?: string;
  created_at: string;
  last_accessed: string;
  /** Alias for last_accessed for backward compatibility */
  last_opened?: string;
  indexed: boolean;
  /** Total indexed or scanned files */
  total_files: number;
  /** Alias for total_files */
  file_count?: number;
  is_active: boolean;
  total_size_bytes: number;
}

export interface RustFileEntry {
  name: string;
  path: string;
  relative_path: string;
  is_dir: boolean;
  is_symlink: boolean;
  is_hidden: boolean;
  size: number;
  modified: string | null;
  created: string | null;
  extension: string | null;
  children_count: number | null;
}

export interface RustSearchResult {
  path: string;
  relative_path: string;
  filename: string;
  language: string;
  score: number;
  snippet: string;
  line_number: number | null;
  /** File extension derived from filename (e.g. "ts", "rs") */
  extension: string;
}

export interface RustGrepMatch {
  path: string;
  relative_path: string;
  line_number: number;
  line_content: string;
  match_start: number;
  match_end: number;
  context_before: string[];
  context_after: string[];
}

export interface RustSemanticResult {
  path: string;
  relative_path: string;
  chunk_text: string;
  score: number;
  line_start: number;
  line_end: number;
  language: string;
}

export interface IndexProgress {
  workspace_id: string;
  indexed: number;
  total: number;
  current_file: string;
}

export interface FileWatchEvent {
  workspace_id: string;
  event_type: 'created' | 'modified' | 'removed';
  path: string;
}

export type ServerEvent =
  | { type: 'index_started'; data: { workspace_id: string } }
  | { type: 'index_progress'; data: IndexProgress }
  | { type: 'index_complete'; data: { workspace_id: string; total_files: number; duration_ms: number } }
  | { type: 'index_error'; data: { workspace_id: string; error: string } }
  | { type: 'vector_index_progress'; data: { workspace_id: string; embedded_chunks: number; total_chunks: number } }
  | { type: 'vector_index_complete'; data: { workspace_id: string; total_chunks: number; duration_ms: number } }
  | { type: 'file_changed'; data: FileWatchEvent }
  | { type: 'workspace_created'; data: RustWorkspace }
  | { type: 'workspace_removed'; data: { workspace_id: string } }
  | { type: 'search_ready'; data: { workspace_id: string } };

type EventHandler = (event: ServerEvent) => void;

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function request<T>(
  path: string,
  options: RequestInit = {},
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = REQUEST_TIMEOUT,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(sidecarAuthToken ? { 'Authorization': `Bearer ${sidecarAuthToken}` } : {}),
        ...options.headers,
      },
    });

    const durationMs = Math.round(performance.now() - start);

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      log.warn('Backend request failed', { path, status: response.status, durationMs, body: body.slice(0, 200) });
      throw new Error(`Backend request failed: ${response.status} ${response.statusText} — ${body}`);
    }

    log.debug('Backend request completed', { path, status: response.status, durationMs });

    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      log.warn('Backend request timed out', { path, timeoutMs });
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// WebSocket Manager
// ---------------------------------------------------------------------------

class WebSocketManager {
  private ws: WebSocket | null = null;
  private handlers = new Set<EventHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 2000;
  private maxReconnectDelay = 30_000;
  private url: string;
  private connected = false;
  /** Prevents reconnect after intentional disconnect */
  private intentionalClose = false;
  /** Whether the backend has been confirmed available via health check */
  private backendAvailable = false;
  /** Track active workspace subscriptions for replay on reconnect */
  private activeSubscriptions = new Set<string>();
  /** Callback invoked on unexpected WebSocket disconnection */
  private onDisconnectCallback?: () => void;

  constructor(url = DEFAULT_WS_URL) {
    this.url = url;
  }

  /** Mark backend as available (called after successful health check) */
  setBackendAvailable(available: boolean): void {
    this.backendAvailable = available;
    // If backend just became available and we're not connected, try now
    if (available && !this.connected && !this.intentionalClose) {
      this.connect();
    }
  }

  /** Register a callback for unexpected WebSocket disconnections */
  setOnDisconnect(callback: () => void): void {
    this.onDisconnectCallback = callback;
  }

  /** Connect to the WebSocket server (only if backend is available) */
  connect(): void {
    // Don't attempt connection if backend hasn't been health-checked
    if (!this.backendAvailable) {
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.intentionalClose = false;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.connected = true;
        this.reconnectDelay = 2000;
        log.info('WebSocket connected');

        // Replay active workspace subscriptions on reconnect
        for (const wsId of this.activeSubscriptions) {
          this.send({ type: 'subscribe_workspace', workspace_id: wsId });
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as ServerEvent;
          this.handlers.forEach((handler) => {
            try {
              handler(parsed);
            } catch (err) {
              log.error('Event handler error', { error: err instanceof Error ? err.message : String(err), eventType: parsed?.type });
            }
          });
        } catch {
          log.warn('Failed to parse WebSocket message', { data: typeof event.data === 'string' ? event.data.slice(0, 200) : 'binary' });
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        if (!this.intentionalClose) {
          // Mark backend unavailable to prevent blind reconnection.
          // The health-check polling will re-enable when the backend returns.
          this.backendAvailable = false;
          this.onDisconnectCallback?.();
        }
      };

      this.ws.onerror = () => {
        // WebSocket error events contain no useful info (always [object Event]).
        // The subsequent onclose will trigger reconnect if needed.
      };
    } catch (err) {
      log.warn('WebSocket connect failed', { error: err instanceof Error ? err.message : String(err) });
      this.scheduleReconnect();
    }
  }

  /** Disconnect from the WebSocket server */
  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.backendAvailable = false;
  }

  /** Subscribe to server events */
  subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Send a command to the server via WebSocket */
  send(command: Record<string, unknown>): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(command));
      return true;
    }
    return false;
  }

  /** Whether currently connected */
  isConnected(): boolean {
    return this.connected;
  }

  /** Track a workspace subscription for replay on reconnect */
  trackSubscription(workspaceId: string): void {
    this.activeSubscriptions.add(workspaceId);
  }

  /** Remove a workspace subscription from replay tracking */
  untrackSubscription(workspaceId: string): void {
    this.activeSubscriptions.delete(workspaceId);
  }

  private scheduleReconnect(): void {
    // Don't reconnect if intentionally closed or backend not available
    if (this.intentionalClose || !this.backendAvailable) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, this.reconnectDelay);
  }
}

// ---------------------------------------------------------------------------
// Client Class
// ---------------------------------------------------------------------------

class RustBackendClient {
  private baseUrl: string;
  private wsManager: WebSocketManager;

  // ----- Health check cache & dedup ----------------------------------------
  /** Timestamp of last health check attempt */
  private _lastHealthCheckAt = 0;
  /** Cached result of last health check */
  private _lastHealthResult = false;
  /** Current backoff interval for health checks (ms) */
  private _healthBackoff = 5_000;
  /** Minimum backoff when backend is unavailable */
  private static readonly HEALTH_BACKOFF_MIN = 5_000;
  /** Maximum backoff when backend is unavailable */
  private static readonly HEALTH_BACKOFF_MAX = 120_000;
  /** Heartbeat interval when backend IS available */
  private static readonly HEALTH_HEARTBEAT = 30_000;
  /** In-flight health check promise (deduplication) */
  private _activeHealthCheck: Promise<boolean> | null = null;
  /** Listeners for availability changes */
  private _availabilityListeners = new Set<(available: boolean) => void>();

  constructor(baseUrl = DEFAULT_BASE_URL, wsUrl = DEFAULT_WS_URL) {
    this.baseUrl = baseUrl;
    this.wsManager = new WebSocketManager(wsUrl);

    // When WebSocket drops unexpectedly, trigger a health check.
    // If the backend is still alive (e.g. transient network blip), this
    // will reconnect the WS immediately. Otherwise, the provider's
    // polling loop will reconnect once the backend is back up.
    this.wsManager.setOnDisconnect(() => {
      this.isAvailable(true);
    });
  }

  // ----- Lifecycle ---------------------------------------------------------

  /** Initialize the client — fetches auth token, marks backend as available and connects WebSocket */
  init(): void {
    // Fetch auth token from main process if available
    try {
      window.vyotiq?.rustBackend?.getAuthToken?.().then((token: string) => {
        if (token) {
          sidecarAuthToken = token;
          log.debug('Sidecar auth token received');
        }
      }).catch(() => {
        // Auth token not available, continuing without authentication
      });
    } catch (err) {
      log.debug('Preload API not available for auth token', { error: err instanceof Error ? err.message : String(err) });
    }
    this.wsManager.setBackendAvailable(true);
    this.wsManager.connect();
  }

  /** Tear down the client and disconnect WebSocket */
  destroy(): void {
    this.wsManager.disconnect();
    this._activeHealthCheck = null;
    this._availabilityListeners.clear();
  }

  // ----- Availability subscription -----------------------------------------

  /** Subscribe to availability state changes. Returns unsubscribe fn. */
  onAvailabilityChange(listener: (available: boolean) => void): () => void {
    this._availabilityListeners.add(listener);
    return () => this._availabilityListeners.delete(listener);
  }

  /** Get the last-known availability without making a network request. */
  get available(): boolean {
    return this._lastHealthResult;
  }

  // ----- Health ------------------------------------------------------------

  async health(): Promise<{ status: string; version: string; uptime: number }> {
    return request('/health', {}, this.baseUrl, HEALTH_TIMEOUT);
  }

  /**
   * Check if the Rust backend is reachable.
   *
   * **Deduplication**: concurrent callers share one in-flight request.
   * **Caching**: returns the cached result if the last check was within
   * the current backoff window (avoids flooding the console with
   * ERR_CONNECTION_REFUSED when the backend is down).
   * **Backoff**: 5 s → 10 s → 20 s → … → 120 s when unavailable;
   * resets to 5 s once the backend responds.
   *
   * @param force  Skip the cache and actually hit the network.
   */
  async isAvailable(force = false): Promise<boolean> {
    const now = Date.now();
    const age = now - this._lastHealthCheckAt;
    const window = this._lastHealthResult
      ? RustBackendClient.HEALTH_HEARTBEAT
      : this._healthBackoff;

    // Return cached result if still fresh
    if (!force && this._lastHealthCheckAt > 0 && age <= window) {
      return this._lastHealthResult;
    }

    // Deduplicate concurrent callers
    if (this._activeHealthCheck) {
      return this._activeHealthCheck;
    }

    this._activeHealthCheck = this._performHealthCheck();
    try {
      return await this._activeHealthCheck;
    } finally {
      this._activeHealthCheck = null;
    }
  }

  private async _performHealthCheck(): Promise<boolean> {
    const prev = this._lastHealthResult;
    try {
      await this.health();
      this._lastHealthCheckAt = Date.now();
      this._lastHealthResult = true;
      this._healthBackoff = RustBackendClient.HEALTH_BACKOFF_MIN;
      this.wsManager.setBackendAvailable(true);
    } catch (err) {
      log.debug('Health check failed', { error: err instanceof Error ? err.message : String(err) });
      this._lastHealthCheckAt = Date.now();
      this._lastHealthResult = false;
      // Exponential backoff: double on each failure, cap at max
      this._healthBackoff = Math.min(
        this._healthBackoff * 2,
        RustBackendClient.HEALTH_BACKOFF_MAX,
      );
      this.wsManager.setBackendAvailable(false);
    }
    // Notify listeners on state change
    if (prev !== this._lastHealthResult) {
      for (const fn of this._availabilityListeners) {
        try { fn(this._lastHealthResult); } catch (err) { log.warn('Availability listener error', { error: err instanceof Error ? err.message : String(err) }); }
      }
    }
    return this._lastHealthResult;
  }

  // ----- Workspaces --------------------------------------------------------

  async listWorkspaces(): Promise<RustWorkspace[]> {
    return request('/api/workspaces', {}, this.baseUrl);
  }

  async createWorkspace(name: string, rootPath: string): Promise<RustWorkspace> {
    return request('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name, path: rootPath }),
    }, this.baseUrl);
  }

  async getWorkspace(id: string): Promise<RustWorkspace> {
    return request(`/api/workspaces/${id}`, {}, this.baseUrl);
  }

  async deleteWorkspace(id: string): Promise<void> {
    await request(`/api/workspaces/${id}`, { method: 'DELETE' }, this.baseUrl);
  }

  // ----- Files -------------------------------------------------------------

  async listFiles(
    workspaceId: string,
    subPath = '',
    depth = 1,
    options: { recursive?: boolean; show_hidden?: boolean } = {},
  ): Promise<RustFileEntry[]> {
    const params = new URLSearchParams();
    if (subPath) params.set('path', subPath);
    if (options.recursive) params.set('recursive', 'true');
    if (options.show_hidden) params.set('show_hidden', 'true');
    params.set('max_depth', String(depth));
    return request(`/api/workspaces/${workspaceId}/files?${params}`, {}, this.baseUrl);
  }

  async readFile(workspaceId: string, filePath: string): Promise<{ content: string; size: number; language: string }> {
    return request(`/api/workspaces/${workspaceId}/files/read?path=${encodeURIComponent(filePath)}`, {}, this.baseUrl);
  }

  async writeFile(workspaceId: string, filePath: string, content: string): Promise<{ success: boolean }> {
    return request(`/api/workspaces/${workspaceId}/files/write`, {
      method: 'POST',
      body: JSON.stringify({ path: filePath, content }),
    }, this.baseUrl);
  }

  async createFile(workspaceId: string, filePath: string, content = ''): Promise<{ success: boolean }> {
    return request(`/api/workspaces/${workspaceId}/files/create`, {
      method: 'POST',
      body: JSON.stringify({ path: filePath, content }),
    }, this.baseUrl);
  }

  async deleteFile(workspaceId: string, filePath: string): Promise<{ success: boolean }> {
    return request(`/api/workspaces/${workspaceId}/files/delete`, {
      method: 'POST',
      body: JSON.stringify({ path: filePath }),
    }, this.baseUrl);
  }

  async renameFile(workspaceId: string, oldPath: string, newPath: string): Promise<{ success: boolean }> {
    return request(`/api/workspaces/${workspaceId}/files/rename`, {
      method: 'POST',
      body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
    }, this.baseUrl);
  }

  async createDirectory(workspaceId: string, dirPath: string): Promise<{ success: boolean }> {
    return request(`/api/workspaces/${workspaceId}/files/mkdir`, {
      method: 'POST',
      body: JSON.stringify({ path: dirPath }),
    }, this.baseUrl);
  }

  async searchFiles(
    workspaceId: string,
    query: string,
    options: { file_types?: string[]; limit?: number } = {},
  ): Promise<RustFileEntry[]> {
    return request(`/api/workspaces/${workspaceId}/files/search`, {
      method: 'POST',
      body: JSON.stringify({ query, ...options }),
    }, this.baseUrl);
  }

  // ----- Search & Indexing -------------------------------------------------

  async triggerIndex(workspaceId: string): Promise<{ message: string }> {
    return request(`/api/workspaces/${workspaceId}/index`, { method: 'POST' }, this.baseUrl);
  }

  async search(
    workspaceId: string,
    query: string,
    options: { limit?: number; offset?: number; extensions?: string[]; fuzzy?: boolean } = {},
  ): Promise<{ results: RustSearchResult[]; total: number; took_ms: number }> {
    const raw = await request<{ results: RustSearchResult[]; total_hits: number; query_time_ms: number }>(
      `/api/workspaces/${workspaceId}/search`,
      {
        method: 'POST',
        body: JSON.stringify({ query, limit: options.limit, fuzzy: options.fuzzy }),
      },
      this.baseUrl,
    );
    const results = raw.results.map((r) => ({
      ...r,
      extension: r.extension || r.filename.split('.').pop() || '',
    }));
    return { results, total: raw.total_hits, took_ms: raw.query_time_ms };
  }

  async grepSearch(
    workspaceId: string,
    pattern: string,
    options: { is_regex?: boolean; case_sensitive?: boolean; include_patterns?: string[]; exclude_patterns?: string[]; max_results?: number } = {},
  ): Promise<{ matches: RustGrepMatch[]; total_matches: number; files_searched: number }> {
    const raw = await request<{ results: RustGrepMatch[]; total_matches: number; files_searched: number; query_time_ms: number }>(
      `/api/workspaces/${workspaceId}/search/grep`,
      {
        method: 'POST',
        body: JSON.stringify({
          pattern,
          is_regex: options.is_regex || false,
          case_sensitive: options.case_sensitive || false,
          limit: options.max_results || 200,
          file_pattern: options.include_patterns?.[0],
          include_context: true,
          context_lines: 2,
        }),
      },
      this.baseUrl,
    );
    return { matches: raw.results, total_matches: raw.total_matches, files_searched: raw.files_searched };
  }

  async semanticSearch(
    workspaceId: string,
    query: string,
    options: { limit?: number } = {},
  ): Promise<{ results: RustSemanticResult[]; query_time_ms: number }> {
    return request<{ results: RustSemanticResult[]; query_time_ms: number }>(
      `/api/workspaces/${workspaceId}/search/semantic`,
      {
        method: 'POST',
        body: JSON.stringify({ query, limit: options.limit || 20 }),
      },
      this.baseUrl,
    );
  }

  // ----- Events ------------------------------------------------------------

  /** Subscribe to real-time server events via WebSocket */
  onEvent(handler: EventHandler): () => void {
    return this.wsManager.subscribe(handler);
  }

  /** Send a command to the backend via WebSocket */
  sendCommand(command: Record<string, unknown>): boolean {
    return this.wsManager.send(command);
  }

  /** Subscribe to workspace-specific events via WebSocket */
  subscribeWorkspace(workspaceId: string): boolean {
    this.wsManager.trackSubscription(workspaceId);
    return this.sendCommand({ type: 'subscribe_workspace', workspace_id: workspaceId });
  }

  /** Unsubscribe from workspace-specific events (stops replay on reconnect) */
  unsubscribeWorkspace(workspaceId: string): void {
    this.wsManager.untrackSubscription(workspaceId);
  }

  /** Trigger incremental reindex for a specific file via WebSocket */
  triggerReindexFile(workspaceId: string, filePath: string, changeType: string): boolean {
    return this.sendCommand({
      type: 'reindex_file',
      workspace_id: workspaceId,
      path: filePath,
      change_type: changeType,
    });
  }

  /** Trigger full index via WebSocket (non-blocking) */
  triggerIndexViaWs(workspaceId: string): boolean {
    return this.sendCommand({ type: 'trigger_index', workspace_id: workspaceId });
  }

  /** Get indexing status for a workspace */
  async getIndexStatus(workspaceId: string): Promise<{
    indexed: boolean;
    is_indexing: boolean;
    is_vector_indexing: boolean;
    indexed_count: number;
    total_count: number;
    vector_count: number;
    vector_ready: boolean;
    embedding_model_ready: boolean;
  }> {
    return request(`/api/workspaces/${workspaceId}/index/status`, {}, this.baseUrl);
  }

  /** Activate a workspace (set as current) */
  async activateWorkspace(workspaceId: string): Promise<RustWorkspace> {
    return request(`/api/workspaces/${workspaceId}/activate`, { method: 'POST' }, this.baseUrl);
  }

  /** Move a file within a workspace */
  async moveFile(workspaceId: string, sourcePath: string, destPath: string): Promise<{ success: boolean }> {
    return request(`/api/workspaces/${workspaceId}/files/move`, {
      method: 'POST',
      body: JSON.stringify({ source: sourcePath, destination: destPath }),
    }, this.baseUrl);
  }

  /** Copy a file within a workspace */
  async copyFile(workspaceId: string, sourcePath: string, destPath: string): Promise<{ success: boolean }> {
    return request(`/api/workspaces/${workspaceId}/files/copy`, {
      method: 'POST',
      body: JSON.stringify({ source: sourcePath, destination: destPath }),
    }, this.baseUrl);
  }

  /** Get file stats */
  async statFile(workspaceId: string, filePath: string): Promise<{
    name: string;
    size: number;
    is_file: boolean;
    is_directory: boolean;
    modified: string;
    extension: string | null;
  }> {
    return request(`/api/workspaces/${workspaceId}/files/stat`, {
      method: 'POST',
      body: JSON.stringify({ path: filePath }),
    }, this.baseUrl);
  }

  /** Whether the WebSocket is connected */
  get isConnected(): boolean {
    return this.wsManager.isConnected();
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

export const rustBackend = new RustBackendClient();

export default rustBackend;
