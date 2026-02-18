/**
 * Rust Backend IPC Handlers
 *
 * Bridges the Electron main process to the Rust sidecar backend,
 * allowing the agent system and renderer to access workspace management,
 * file indexing, and search capabilities via IPC.
 */

import { ipcMain } from 'electron';
import { rustSidecar } from '../rustSidecar';
import { createLogger } from '../logger';
import type { IpcContext } from './types';

const logger = createLogger('IPC:RustBackend');
const BASE_URL = () => `http://127.0.0.1:${rustSidecar.getPort()}`;
const REQUEST_TIMEOUT = 15_000;

// ---------------------------------------------------------------------------
// Fetch helper (main-process side, talks to Rust sidecar via HTTP)
// ---------------------------------------------------------------------------

async function rustRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${BASE_URL()}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...rustSidecar.getAuthHeaders(),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Rust backend ${response.status}: ${body}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Handler Registration
// ---------------------------------------------------------------------------

/**
 * Validate workspaceId to prevent path injection attacks.
 * Workspace IDs should be alphanumeric, hyphens, underscores, or UUIDs.
 */
function validateWorkspaceId(workspaceId: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(workspaceId) && workspaceId.length <= 128;
}

export function registerRustBackendHandlers(_context: IpcContext): void {
  // ---- Health / Status ----

  ipcMain.handle('rust-backend:health', async () => {
    try {
      if (!rustSidecar.isRunning()) {
        return { success: false, error: 'Rust backend not running' };
      }
      const health = await rustRequest<{ status: string; version: string; uptime: number }>('/health');
      return { success: true, ...health };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('rust-backend:is-available', async () => {
    try {
      if (!rustSidecar.isRunning()) return false;
      const health = await rustRequest<{ status: string }>('/health');
      return health.status === 'ok';
    } catch {
      return false;
    }
  });

  ipcMain.handle('rust-backend:get-auth-token', () => {
    return rustSidecar.getAuthToken();
  });

  // ---- Workspace management ----

  ipcMain.handle('rust-backend:list-workspaces', async () => {
    try {
      const workspaces = await rustRequest('/api/workspaces');
      return { success: true, workspaces };
    } catch (error) {
      return { success: false, error: (error as Error).message, workspaces: [] };
    }
  });

  ipcMain.handle('rust-backend:create-workspace', async (_event, name: string, rootPath: string) => {
    try {
      const workspace = await rustRequest('/api/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name, path: rootPath }),
      });
      return { success: true, workspace };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('rust-backend:activate-workspace', async (_event, workspaceId: string) => {
    try {
      if (!validateWorkspaceId(workspaceId)) {
        return { success: false, error: 'Invalid workspace ID format' };
      }
      const workspace = await rustRequest(`/api/workspaces/${workspaceId}/activate`, {
        method: 'POST',
      });
      return { success: true, workspace };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('rust-backend:remove-workspace', async (_event, workspaceId: string) => {
    try {
      if (!validateWorkspaceId(workspaceId)) {
        return { success: false, error: 'Invalid workspace ID format' };
      }
      await rustRequest(`/api/workspaces/${workspaceId}`, { method: 'DELETE' });
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ---- File operations (via Rust backend) ----

  ipcMain.handle('rust-backend:list-files', async (_event, workspaceId: string, subPath?: string, options?: { recursive?: boolean; show_hidden?: boolean; max_depth?: number }) => {
    try {
      if (!validateWorkspaceId(workspaceId)) {
        return { success: false, error: 'Invalid workspace ID format', files: [] };
      }
      const params = new URLSearchParams();
      if (subPath) params.set('path', subPath);
      if (options?.recursive) params.set('recursive', 'true');
      if (options?.show_hidden) params.set('show_hidden', 'true');
      params.set('max_depth', String(options?.max_depth ?? 1));
      const files = await rustRequest(`/api/workspaces/${workspaceId}/files?${params}`);
      return { success: true, files };
    } catch (error) {
      return { success: false, error: (error as Error).message, files: [] };
    }
  });

  ipcMain.handle('rust-backend:read-file', async (_event, workspaceId: string, filePath: string) => {
    try {
      const data = await rustRequest<Record<string, unknown>>(`/api/workspaces/${workspaceId}/files/read?path=${encodeURIComponent(filePath)}`);
      return { success: true, ...data };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('rust-backend:write-file', async (_event, workspaceId: string, filePath: string, content: string) => {
    try {
      await rustRequest(`/api/workspaces/${workspaceId}/files/write`, {
        method: 'POST',
        body: JSON.stringify({ path: filePath, content }),
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ---- Search & Indexing ----

  ipcMain.handle('rust-backend:search', async (_event, workspaceId: string, query: string, options?: { limit?: number; fuzzy?: boolean }) => {
    try {
      const result = await rustRequest<Record<string, unknown>>(`/api/workspaces/${workspaceId}/search`, {
        method: 'POST',
        body: JSON.stringify({ query, limit: options?.limit ?? 20, fuzzy: options?.fuzzy ?? false }),
      });
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: (error as Error).message, results: [] };
    }
  });

  ipcMain.handle('rust-backend:grep', async (_event, workspaceId: string, pattern: string, options?: { is_regex?: boolean; case_sensitive?: boolean; limit?: number }) => {
    try {
      const result = await rustRequest<Record<string, unknown>>(`/api/workspaces/${workspaceId}/search/grep`, {
        method: 'POST',
        body: JSON.stringify({
          pattern,
          is_regex: options?.is_regex ?? false,
          case_sensitive: options?.case_sensitive ?? false,
          limit: options?.limit ?? 200,
          include_context: true,
          context_lines: 2,
        }),
      });
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: (error as Error).message, results: [] };
    }
  });

  ipcMain.handle('rust-backend:trigger-index', async (_event, workspaceId: string) => {
    try {
      const result = await rustRequest<Record<string, unknown>>(`/api/workspaces/${workspaceId}/index`, { method: 'POST' });
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('rust-backend:index-status', async (_event, workspaceId: string) => {
    try {
      const status = await rustRequest<Record<string, unknown>>(`/api/workspaces/${workspaceId}/index/status`);
      return { success: true, ...status };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  logger.info('Rust backend IPC handlers registered');
}
