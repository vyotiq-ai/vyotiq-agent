/**
 * Rust Backend File Change Notifier
 *
 * Utility for notifying the Rust backend when the agent modifies files,
 * so the full-text indexes are incrementally updated.
 *
 * The Rust backend's file watcher (notify crate) will eventually detect changes,
 * but this notification provides faster re-indexing by sending explicit events
 * via WebSocket. Falls back silently if the backend is unreachable.
 */
import { rustSidecar } from '../rustSidecar';
import { createLogger } from '../logger';

const logger = createLogger('fileChangeNotifier');

/** Debounce window — avoid notifying the same file multiple times in rapid succession */
const DEBOUNCE_MS = 500;
const pendingNotifications = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Notify the Rust backend that a file has been changed by the agent.
 * This triggers incremental re-indexing for the Tantivy (full-text) index.
 *
 * Non-blocking and non-critical — failures are silently logged.
 *
 * @param workspacePath - The root path of the workspace
 * @param filePath - Absolute or relative path to the changed file
 * @param changeType - Type of change: 'created' | 'modified' | 'deleted'
 */
export function notifyFileChanged(
  workspacePath: string,
  filePath: string,
  changeType: 'created' | 'modified' | 'deleted' = 'modified',
): void {
  if (!rustSidecar.isRunning()) return;

  const key = `${workspacePath}:${filePath}:${changeType}`;

  // Debounce rapid notifications for the same file
  const existing = pendingNotifications.get(key);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    pendingNotifications.delete(key);
    sendNotification(workspacePath, filePath, changeType).catch(() => {});
  }, DEBOUNCE_MS);

  pendingNotifications.set(key, timer);
}

async function sendNotification(
  workspacePath: string,
  filePath: string,
  changeType: string,
): Promise<void> {
  try {
    const port = rustSidecar.getPort();

    // Resolve workspace ID first
    const res = await fetch(`http://127.0.0.1:${port}/api/workspaces`, {
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) return;

    const workspaces = (await res.json()) as Array<{ id: string; path: string }>;
    const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const target = normalize(workspacePath);
    const ws = (Array.isArray(workspaces) ? workspaces : []).find(
      (w) => normalize(w.path) === target,
    );
    if (!ws) return;

    // Send reindex_file via WebSocket
    const wsUrl = `ws://127.0.0.1:${port}/ws`;
    const socket = new WebSocket(wsUrl);

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        socket.close();
        resolve();
      }, 3_000);

      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            type: 'reindex_file',
            workspace_id: ws.id,
            path: filePath,
            change_type: changeType,
          }),
        );
        clearTimeout(timeout);
        // Allow time for the message to be processed
        setTimeout(() => {
          socket.close();
          resolve();
        }, 100);
      };

      socket.onerror = () => {
        clearTimeout(timeout);
        socket.close();
        resolve();
      };

      socket.onclose = () => {
        clearTimeout(timeout);
        resolve();
      };
    });

    logger.debug('Notified backend of file change', { filePath, changeType });
  } catch {
    // Non-critical — the Rust backend's file watcher will pick up changes eventually
  }
}
