/**
 * Main Process Rust Backend Client
 *
 * HTTP client for the main Electron process to communicate with the Rust backend sidecar.
 * Used by the agent system to search the indexed workspace, query index status, etc.
 *
 * Unlike the renderer client, this runs in the main process with full Node.js access.
 */

import { ConsoleLogger } from '../../logger';
import { rustSidecar } from '../../rustSidecar';

const logger = new ConsoleLogger('RustBackendClient');

/**
 * Resolve the Rust backend base URL dynamically.
 * Uses rustSidecar.getPort() for live port resolution, falling back to env/default.
 */
function getBaseUrl(): string {
  const port = rustSidecar.getPort();
  return `http://127.0.0.1:${port}`;
}

// =============================================================================
// Types
// =============================================================================

export interface MainSearchResult {
  path: string;
  relative_path: string;
  filename: string;
  language: string;
  score: number;
  snippet: string;
  line_number: number | null;
}

export interface MainSearchResponse {
  results: MainSearchResult[];
  total_hits: number;
  query_time_ms: number;
}

export interface MainGrepResult {
  path: string;
  relative_path: string;
  line_number: number;
  line_content: string;
  match_start: number;
  match_end: number;
  context_before: string[];
  context_after: string[];
}

export interface MainGrepResponse {
  results: MainGrepResult[];
  total_matches: number;
  files_searched: number;
  query_time_ms: number;
}

export interface MainWorkspace {
  id: string;
  name: string;
  path: string;
  root_path: string;
  created_at: string;
  last_accessed: string;
  is_active: boolean;
  indexed: boolean;
  total_files: number;
  total_size_bytes: number;
}

export interface MainIndexStatus {
  indexed: boolean;
  is_indexing: boolean;
  indexed_count: number;
  total_count: number;
}

// =============================================================================
// Client
// =============================================================================

class MainRustBackendClient {
  private available: boolean | null = null;

  /**
   * Check if the Rust backend is reachable
   */
  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${getBaseUrl()}/health`, { signal: AbortSignal.timeout(2000) });
      this.available = res.ok;
      return this.available;
    } catch (err) {
      logger.debug('Rust backend health check failed', { error: err instanceof Error ? err.message : String(err) });
      this.available = false;
      return false;
    }
  }

  /**
   * Full-text search across indexed workspace files (Tantivy BM25)
   */
  async search(
    workspaceId: string,
    query: string,
    options?: { limit?: number; fuzzy?: boolean; file_pattern?: string },
  ): Promise<MainSearchResponse> {
    const body = {
      workspace_id: workspaceId,
      query,
      limit: options?.limit ?? 30,
      fuzzy: options?.fuzzy ?? false,
      file_pattern: options?.file_pattern,
    };

    const res = await fetch(`${getBaseUrl()}/api/workspaces/${workspaceId}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    const result: MainSearchResponse = await res.json();
    logger.debug('Search completed', { workspaceId, query, totalHits: result.total_hits });
    return result;
  }

  /**
   * Grep search for pattern matches in workspace files
   */
  async grep(
    workspaceId: string,
    pattern: string,
    options?: {
      case_sensitive?: boolean;
      is_regex?: boolean;
      file_pattern?: string;
      include_context?: boolean;
      context_lines?: number;
      limit?: number;
    },
  ): Promise<MainGrepResponse> {
    const body = {
      pattern,
      is_regex: options?.is_regex ?? false,
      case_sensitive: options?.case_sensitive ?? false,
      limit: options?.limit ?? 50,
      file_pattern: options?.file_pattern,
      include_context: options?.include_context ?? true,
      context_lines: options?.context_lines ?? 2,
    };

    const res = await fetch(`${getBaseUrl()}/api/workspaces/${workspaceId}/search/grep`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`Grep failed: ${res.status}`);
    const result: MainGrepResponse = await res.json();
    logger.debug('Grep completed', { workspaceId, pattern, resultCount: result.results.length });
    return result;
  }

  /**
   * List all workspaces registered in the Rust backend
   */
  async listWorkspaces(): Promise<MainWorkspace[]> {
    const res = await fetch(`${getBaseUrl()}/api/workspaces`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`List workspaces failed: ${res.status}`);
    return res.json();
  }

  /**
   * Create a new workspace in the Rust backend
   */
  async createWorkspace(name: string, rootPath: string): Promise<MainWorkspace> {
    const res = await fetch(`${getBaseUrl()}/api/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, root_path: rootPath }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`Create workspace failed: ${res.status}`);
    return res.json();
  }

  /**
   * Get workspace by root path (finds existing workspace by path)
   */
  async findWorkspaceByPath(rootPath: string): Promise<MainWorkspace | null> {
    try {
      const workspaces = await this.listWorkspaces();
      const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
      const normalizedRoot = normalize(rootPath);
      return workspaces.find((ws) =>
        normalize(ws.root_path) === normalizedRoot ||
        normalize(ws.path) === normalizedRoot
      ) ?? null;
    } catch (err) {
      logger.debug('findWorkspaceByPath failed', { rootPath, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  async triggerIndex(workspaceId: string): Promise<void> {
    const res = await fetch(`${getBaseUrl()}/api/workspaces/${workspaceId}/index`, {
      method: 'POST',
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`Trigger index failed: ${res.status}`);
  }

  /**
   * Get index status for a workspace
   */
  async getIndexStatus(workspaceId: string): Promise<MainIndexStatus> {
    const res = await fetch(`${getBaseUrl()}/api/workspaces/${workspaceId}/index/status`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`Get index status failed: ${res.status}`);
    return res.json();
  }

  /**
   * Read a file's content via the Rust backend
   */
  async readFile(workspaceId: string, filePath: string): Promise<string> {
    const res = await fetch(
      `${getBaseUrl()}/api/workspaces/${workspaceId}/files/read?path=${encodeURIComponent(filePath)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) throw new Error(`Read file failed: ${res.status}`);
    const data = await res.json();
    return data.content;
  }

  /**
   * List files in a directory via the Rust backend
   */
  async listFiles(
    workspaceId: string,
    dirPath?: string,
  ): Promise<Array<{ name: string; path: string; is_dir: boolean; size: number }>> {
    const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
    const res = await fetch(`${getBaseUrl()}/api/workspaces/${workspaceId}/files${params}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`List files failed: ${res.status}`);
    return res.json();
  }
}

// Singleton
export const mainRustBackend = new MainRustBackendClient();
