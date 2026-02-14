/**
 * Rust Sidecar Manager
 *
 * Spawns and manages the Rust backend process as a sidecar.
 * Handles lifecycle (start, health checks, restart, graceful shutdown).
 */

import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { randomBytes } from 'crypto';
import { app } from 'electron';
import { createLogger } from './logger';

const logger = createLogger('RustSidecar');

const SIDECAR_PORT = parseInt(process.env.VYOTIQ_RUST_PORT || '9721', 10);
const HEALTH_CHECK_INTERVAL = 10_000; // 10s
const STARTUP_TIMEOUT = 15_000; // 15s
const MAX_RESTART_ATTEMPTS = 3;

/**
 * Current embedding model version marker.
 * When the model changes, old vector indexes are incompatible (different
 * embedding weights/quality) and must be rebuilt.
 * Updated: Switched to Qwen3-Embedding-0.6B (Qwen/Qwen3-Embedding-0.6B, 1024d, June 2025).
 * Decoder-only LLM embedder — #1 on MTEB leaderboard. Uses candle backend (pure Rust).
 */
const EMBEDDING_MODEL_VERSION = 'qwen3-embedding-0.6b-1024d';

class RustSidecarManager {
  private process: ChildProcess | null = null;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private restartCount = 0;
  private isShuttingDown = false;
  /** Per-session auth token to secure sidecar communication */
  private authToken: string = '';

  /**
   * Get the path to the compiled Rust binary.
   * In development: rust-backend/target/release/vyotiq-backend
   * In production: bundled alongside the Electron app
   */
  private getBinaryPath(): string {
    const isDev = !app.isPackaged;
    if (isDev) {
      const ext = process.platform === 'win32' ? '.exe' : '';
      return path.join(app.getAppPath(), 'rust-backend', 'target', 'release', `vyotiq-backend${ext}`);
    }
    // Production: binary is bundled in the app resources
    const ext = process.platform === 'win32' ? '.exe' : '';
    return path.join(process.resourcesPath, 'bin', `vyotiq-backend${ext}`);
  }

  /** Start the Rust backend sidecar */
  async start(): Promise<boolean> {
    if (this.process) {
      logger.info('Rust sidecar already running');
      return true;
    }

    // Reset shutdown/restart state so auto-restart works after a stop()+start() cycle
    this.isShuttingDown = false;
    this.restartCount = 0;

    const binaryPath = this.getBinaryPath();
    logger.info('Starting Rust sidecar', { binaryPath, port: SIDECAR_PORT });

    const dataDir = path.join(app.getPath('userData'), 'rust-data');

    // Check if the embedding model has changed — if so, clear stale vector indexes
    this.migrateVectorIndexIfNeeded(dataDir);

    // Generate a per-session auth token for sidecar communication security
    this.authToken = randomBytes(32).toString('hex');

    try {
      this.process = spawn(binaryPath, [], {
        env: {
          ...process.env,
          VYOTIQ_PORT: String(SIDECAR_PORT),
          VYOTIQ_DATA_DIR: dataDir,
          VYOTIQ_AUTH_TOKEN: this.authToken,
          RUST_LOG: 'info',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Log stdout/stderr
      this.process.stdout?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) logger.debug(`[rust-stdout] ${msg}`);
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) logger.debug(`[rust-stderr] ${msg}`);
      });

      this.process.on('exit', (code, signal) => {
        logger.info('Rust sidecar exited', { code, signal });
        this.process = null;

        // Attempt restart if not shutting down
        if (!this.isShuttingDown && this.restartCount < MAX_RESTART_ATTEMPTS) {
          this.restartCount++;
          logger.info(`Restarting Rust sidecar (attempt ${this.restartCount}/${MAX_RESTART_ATTEMPTS})`);
          setTimeout(() => this.start().catch(err => logger.error('Sidecar restart failed', { error: err instanceof Error ? err.message : String(err) })), 2000);
        }
      });

      this.process.on('error', (err) => {
        logger.error('Failed to start Rust sidecar', { error: err.message });
        this.process = null;
      });

      // Wait for the sidecar to become healthy
      const healthy = await this.waitForHealthy();
      if (healthy) {
        this.restartCount = 0;
        this.startHealthChecks();
        logger.info('Rust sidecar is healthy');
        return true;
      }

      logger.error('Rust sidecar failed to become healthy within timeout');
      this.stop();
      return false;
    } catch (err) {
      logger.error('Error starting Rust sidecar', {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /** Stop the Rust sidecar gracefully */
  async stop(): Promise<void> {
    this.isShuttingDown = true;
    this.stopHealthChecks();

    if (!this.process) return;

    logger.info('Stopping Rust sidecar');

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        logger.warn('Rust sidecar did not exit gracefully, killing');
        this.process?.kill('SIGKILL');
        this.process = null;
        resolve();
      }, 5_000);

      this.process!.once('exit', () => {
        clearTimeout(timeout);
        this.process = null;
        resolve();
      });

      // On Windows, SIGTERM maps to TerminateProcess (immediate kill) which doesn't
      // allow graceful shutdown. Instead, send a shutdown request via HTTP first.
      // The Rust backend's ctrl_c handler will catch the process termination.
      if (process.platform === 'win32') {
        // Use a fetch to request graceful shutdown, then fall back to process kill
        import('http').then(({ default: http }) => {
          const req = http.request(
            `http://127.0.0.1:${SIDECAR_PORT}/shutdown`,
            { method: 'POST', timeout: 2000 },
            () => {
              logger.info('Graceful shutdown request sent to Rust sidecar');
            }
          );
          req.on('error', () => {
            // If HTTP shutdown fails, fall back to SIGTERM (TerminateProcess on Windows)
            logger.warn('HTTP shutdown request failed, sending SIGTERM');
            this.process?.kill('SIGTERM');
          });
          req.end();
        }).catch(() => {
          this.process?.kill('SIGTERM');
        });
      } else {
        // On Unix, SIGTERM triggers graceful shutdown properly
        this.process!.kill('SIGTERM');
      }
    });
  }

  /** Check if the sidecar is running */
  isRunning(): boolean {
    return this.process !== null;
  }

  /** Get the sidecar port */
  getPort(): number {
    return SIDECAR_PORT;
  }

  /** Get the auth token for authenticating requests to the sidecar */
  getAuthToken(): string {
    return this.authToken;
  }

  /** Get auth headers for sidecar requests */
  getAuthHeaders(): Record<string, string> {
    return this.authToken ? { 'Authorization': `Bearer ${this.authToken}` } : {};
  }

  // ---- Private helpers ----

  private async waitForHealthy(): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < STARTUP_TIMEOUT) {
      try {
        const response = await fetch(`http://127.0.0.1:${SIDECAR_PORT}/health`, {
          signal: AbortSignal.timeout(2000),
          headers: this.getAuthHeaders(),
        });
        if (response.ok) return true;
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }

  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${SIDECAR_PORT}/health`, {
          signal: AbortSignal.timeout(3000),
          headers: this.getAuthHeaders(),
        });
        if (!response.ok) {
          logger.warn('Rust sidecar health check failed', { status: response.status });
        }
      } catch {
        logger.warn('Rust sidecar health check failed (unreachable)');
      }
    }, HEALTH_CHECK_INTERVAL);
    if (this.healthCheckTimer && typeof this.healthCheckTimer === 'object' && 'unref' in this.healthCheckTimer) {
      (this.healthCheckTimer as NodeJS.Timeout).unref();
    }
  }

  private stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * If the embedding model has changed, clear stale vector indexes.
   * The vector indexes store embeddings with specific dimensions (e.g., 768 vs 1024).
   * When the model changes, old vectors are incompatible and must be purged.
   * The Rust backend will automatically rebuild them on next indexing.
   */
  private migrateVectorIndexIfNeeded(dataDir: string): void {
    const versionFile = path.join(dataDir, 'embedding-model-version');
    const vectorsDir = path.join(dataDir, 'vectors');

    try {
      // Read current version marker
      let currentVersion = '';
      if (fs.existsSync(versionFile)) {
        currentVersion = fs.readFileSync(versionFile, 'utf-8').trim();
      }

      if (currentVersion !== EMBEDDING_MODEL_VERSION) {
        logger.info('Embedding model changed, clearing stale vector indexes', {
          from: currentVersion || '(none)',
          to: EMBEDDING_MODEL_VERSION,
        });

        // Remove all vector index directories
        if (fs.existsSync(vectorsDir)) {
          fs.rmSync(vectorsDir, { recursive: true, force: true });
          logger.info('Cleared stale vector indexes');
        }

        // Also clear the old model cache if model family changed
        const modelsDir = path.join(dataDir, 'models');
        if (currentVersion && !currentVersion.startsWith('qwen3') && fs.existsSync(modelsDir)) {
          fs.rmSync(modelsDir, { recursive: true, force: true });
          logger.info('Cleared old embedding model cache (switching to Qwen3-Embedding-0.6B)');
        }

        // Write new version marker
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(versionFile, EMBEDDING_MODEL_VERSION, 'utf-8');
      }
    } catch (err) {
      logger.warn('Failed to check/migrate embedding model version', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// Singleton
export const rustSidecar = new RustSidecarManager();
