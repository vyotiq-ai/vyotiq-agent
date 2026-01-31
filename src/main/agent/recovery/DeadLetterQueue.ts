/**
 * Dead Letter Queue
 * 
 * Persists failed operations for later retry using SQLite.
 * This provides crash resilience by storing operations that failed
 * due to transient errors (network issues, resource exhaustion, etc.)
 * 
 * Features:
 * - SQLite WAL mode for crash safety
 * - Automatic retry with exponential backoff
 * - Priority-based processing
 * - TTL for expired entries
 * - Categorized failure tracking
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { createLogger } from '../../logger';

const logger = createLogger('DeadLetterQueue');

// =============================================================================
// Types
// =============================================================================

export type OperationType = 
  | 'file_write'
  | 'file_delete'
  | 'terminal_command'
  | 'tool_execution'
  | 'mcp_call'
  | 'llm_request'
  | 'session_save';

export type FailureReason =
  | 'network_error'
  | 'timeout'
  | 'resource_exhausted'
  | 'permission_denied'
  | 'invalid_state'
  | 'unknown';

export interface DeadLetterEntry {
  /** Unique entry ID */
  id: string;
  /** Type of operation that failed */
  operationType: OperationType;
  /** Session ID if applicable */
  sessionId?: string;
  /** Serialized operation payload */
  payload: string;
  /** Error message */
  errorMessage: string;
  /** Categorized failure reason */
  failureReason: FailureReason;
  /** Number of retry attempts */
  retryCount: number;
  /** Maximum retry attempts allowed */
  maxRetries: number;
  /** Priority (higher = more urgent) */
  priority: number;
  /** When the entry was created */
  createdAt: number;
  /** When the entry was last retried */
  lastRetryAt?: number;
  /** When the next retry is scheduled */
  nextRetryAt: number;
  /** When the entry expires (TTL) */
  expiresAt: number;
}

export interface DeadLetterQueueConfig {
  /** Database file path */
  dbPath?: string;
  /** Default max retries for entries */
  defaultMaxRetries: number;
  /** Base delay between retries in ms */
  baseRetryDelayMs: number;
  /** Maximum delay between retries in ms */
  maxRetryDelayMs: number;
  /** Default TTL for entries in ms */
  defaultTtlMs: number;
  /** Enable WAL mode */
  enableWal: boolean;
}

export const DEFAULT_DLQ_CONFIG: DeadLetterQueueConfig = {
  defaultMaxRetries: 5,
  baseRetryDelayMs: 5000,
  maxRetryDelayMs: 300000, // 5 minutes
  defaultTtlMs: 24 * 60 * 60 * 1000, // 24 hours
  enableWal: true,
};

export interface DeadLetterQueueStats {
  totalEntries: number;
  pendingRetries: number;
  expiredEntries: number;
  byOperationType: Record<string, number>;
  byFailureReason: Record<string, number>;
  oldestEntryAge: number | null;
}

// =============================================================================
// Dead Letter Queue Implementation
// =============================================================================

export class DeadLetterQueue {
  private db: Database.Database | null = null;
  private readonly config: DeadLetterQueueConfig;
  private readonly dbPath: string;
  private retryTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(config: Partial<DeadLetterQueueConfig> = {}) {
    this.config = { ...DEFAULT_DLQ_CONFIG, ...config };
    this.dbPath = config.dbPath ?? path.join(
      app.getPath('userData'),
      'vyotiq-storage',
      'dead-letter-queue.sqlite'
    );
  }

  /**
   * Initialize the dead letter queue
   */
  async initialize(): Promise<void> {
    // Ensure directory exists
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });

    // Open database
    this.db = new Database(this.dbPath);

    // Enable WAL mode for crash safety
    if (this.config.enableWal) {
      this.db.pragma('journal_mode = WAL');
    }

    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dead_letters (
        id TEXT PRIMARY KEY,
        operation_type TEXT NOT NULL,
        session_id TEXT,
        payload TEXT NOT NULL,
        error_message TEXT NOT NULL,
        failure_reason TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        last_retry_at INTEGER,
        next_retry_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_dead_letters_next_retry 
        ON dead_letters(next_retry_at);
      
      CREATE INDEX IF NOT EXISTS idx_dead_letters_operation_type 
        ON dead_letters(operation_type);
      
      CREATE INDEX IF NOT EXISTS idx_dead_letters_session 
        ON dead_letters(session_id);
      
      CREATE INDEX IF NOT EXISTS idx_dead_letters_expires 
        ON dead_letters(expires_at);
    `);

    logger.info('Dead letter queue initialized', { dbPath: this.dbPath });
  }

  /**
   * Add a failed operation to the queue
   */
  enqueue(
    operationType: OperationType,
    payload: unknown,
    errorMessage: string,
    options: {
      sessionId?: string;
      failureReason?: FailureReason;
      maxRetries?: number;
      priority?: number;
      ttlMs?: number;
    } = {}
  ): string {
    if (!this.db) {
      throw new Error('DeadLetterQueue not initialized');
    }

    const now = Date.now();
    const id = `dlq_${now}_${Math.random().toString(36).slice(2, 11)}`;
    const maxRetries = options.maxRetries ?? this.config.defaultMaxRetries;
    const ttlMs = options.ttlMs ?? this.config.defaultTtlMs;

    const stmt = this.db.prepare(`
      INSERT INTO dead_letters (
        id, operation_type, session_id, payload, error_message, 
        failure_reason, retry_count, max_retries, priority,
        created_at, next_retry_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      operationType,
      options.sessionId ?? null,
      JSON.stringify(payload),
      errorMessage,
      options.failureReason ?? 'unknown',
      0,
      maxRetries,
      options.priority ?? 0,
      now,
      now + this.config.baseRetryDelayMs,
      now + ttlMs
    );

    logger.info('Operation added to dead letter queue', {
      id,
      operationType,
      failureReason: options.failureReason ?? 'unknown',
    });

    return id;
  }

  /**
   * Get entries ready for retry
   */
  getPendingRetries(limit = 10): DeadLetterEntry[] {
    if (!this.db) {
      return [];
    }

    const now = Date.now();

    const stmt = this.db.prepare(`
      SELECT * FROM dead_letters 
      WHERE next_retry_at <= ? 
        AND retry_count < max_retries 
        AND expires_at > ?
      ORDER BY priority DESC, created_at ASC
      LIMIT ?
    `);

    const rows = stmt.all(now, now, limit) as Array<Record<string, unknown>>;
    return rows.map(this.rowToEntry);
  }

  /**
   * Mark an entry as retried (success or failure)
   */
  markRetried(id: string, success: boolean, newError?: string): void {
    if (!this.db) {
      return;
    }

    const now = Date.now();

    if (success) {
      // Remove successful entries
      const stmt = this.db.prepare('DELETE FROM dead_letters WHERE id = ?');
      stmt.run(id);
      logger.info('Dead letter entry completed successfully', { id });
    } else {
      // Update retry count and schedule next retry
      const entry = this.getEntry(id);
      if (!entry) return;

      const retryCount = entry.retryCount + 1;
      const delay = Math.min(
        this.config.baseRetryDelayMs * Math.pow(2, retryCount),
        this.config.maxRetryDelayMs
      );
      const nextRetryAt = now + delay;

      const stmt = this.db.prepare(`
        UPDATE dead_letters 
        SET retry_count = ?, 
            last_retry_at = ?, 
            next_retry_at = ?,
            error_message = COALESCE(?, error_message)
        WHERE id = ?
      `);

      stmt.run(retryCount, now, nextRetryAt, newError ?? null, id);
      logger.warn('Dead letter retry failed', { id, retryCount, nextRetryAt: new Date(nextRetryAt) });
    }
  }

  /**
   * Get a specific entry
   */
  getEntry(id: string): DeadLetterEntry | null {
    if (!this.db) {
      return null;
    }

    const stmt = this.db.prepare('SELECT * FROM dead_letters WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToEntry(row) : null;
  }

  /**
   * Remove an entry from the queue
   */
  remove(id: string): boolean {
    if (!this.db) {
      return false;
    }

    const stmt = this.db.prepare('DELETE FROM dead_letters WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Remove all entries for a session
   */
  removeBySession(sessionId: string): number {
    if (!this.db) {
      return 0;
    }

    const stmt = this.db.prepare('DELETE FROM dead_letters WHERE session_id = ?');
    const result = stmt.run(sessionId);
    return result.changes;
  }

  /**
   * Cleanup expired entries
   */
  cleanupExpired(): number {
    if (!this.db) {
      return 0;
    }

    const stmt = this.db.prepare('DELETE FROM dead_letters WHERE expires_at <= ?');
    const result = stmt.run(Date.now());
    
    if (result.changes > 0) {
      logger.info('Cleaned up expired dead letter entries', { count: result.changes });
    }
    
    return result.changes;
  }

  /**
   * Get queue statistics
   */
  getStats(): DeadLetterQueueStats {
    if (!this.db) {
      return {
        totalEntries: 0,
        pendingRetries: 0,
        expiredEntries: 0,
        byOperationType: {},
        byFailureReason: {},
        oldestEntryAge: null,
      };
    }

    const now = Date.now();

    // Total entries
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM dead_letters');
    const totalResult = totalStmt.get() as { count: number };

    // Pending retries
    const pendingStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM dead_letters 
      WHERE next_retry_at <= ? AND retry_count < max_retries AND expires_at > ?
    `);
    const pendingResult = pendingStmt.get(now, now) as { count: number };

    // Expired entries
    const expiredStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM dead_letters WHERE expires_at <= ?
    `);
    const expiredResult = expiredStmt.get(now) as { count: number };

    // By operation type
    const byTypeStmt = this.db.prepare(`
      SELECT operation_type, COUNT(*) as count FROM dead_letters GROUP BY operation_type
    `);
    const byTypeRows = byTypeStmt.all() as Array<{ operation_type: string; count: number }>;
    const byOperationType: Record<string, number> = {};
    for (const row of byTypeRows) {
      byOperationType[row.operation_type] = row.count;
    }

    // By failure reason
    const byReasonStmt = this.db.prepare(`
      SELECT failure_reason, COUNT(*) as count FROM dead_letters GROUP BY failure_reason
    `);
    const byReasonRows = byReasonStmt.all() as Array<{ failure_reason: string; count: number }>;
    const byFailureReason: Record<string, number> = {};
    for (const row of byReasonRows) {
      byFailureReason[row.failure_reason] = row.count;
    }

    // Oldest entry
    const oldestStmt = this.db.prepare(`
      SELECT MIN(created_at) as oldest FROM dead_letters
    `);
    const oldestResult = oldestStmt.get() as { oldest: number | null };
    const oldestEntryAge = oldestResult.oldest ? now - oldestResult.oldest : null;

    return {
      totalEntries: totalResult.count,
      pendingRetries: pendingResult.count,
      expiredEntries: expiredResult.count,
      byOperationType,
      byFailureReason,
      oldestEntryAge,
    };
  }

  /**
   * Start the retry processor
   */
  startRetryProcessor(
    retryHandler: (entry: DeadLetterEntry) => Promise<boolean>,
    intervalMs = 30000
  ): void {
    if (this.retryTimer) {
      return;
    }

    this.retryTimer = setInterval(async () => {
      if (this.isProcessing) {
        return;
      }

      this.isProcessing = true;
      try {
        // Cleanup expired first
        this.cleanupExpired();

        // Process pending retries
        const entries = this.getPendingRetries(5);
        for (const entry of entries) {
          try {
            const success = await retryHandler(entry);
            this.markRetried(entry.id, success);
          } catch (error) {
            this.markRetried(
              entry.id,
              false,
              error instanceof Error ? error.message : String(error)
            );
          }
        }
      } catch (error) {
        logger.error('Error in retry processor', { 
          error: error instanceof Error ? error.message : String(error) 
        });
      } finally {
        this.isProcessing = false;
      }
    }, intervalMs);

    // Unref to allow Node to exit
    if (typeof this.retryTimer === 'object' && 'unref' in this.retryTimer) {
      this.retryTimer.unref();
    }

    logger.info('Dead letter retry processor started', { intervalMs });
  }

  /**
   * Stop the retry processor
   */
  stopRetryProcessor(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
      logger.info('Dead letter retry processor stopped');
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.stopRetryProcessor();
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.info('Dead letter queue closed');
    }
  }

  /**
   * Convert a database row to a DeadLetterEntry
   */
  private rowToEntry(row: Record<string, unknown>): DeadLetterEntry {
    return {
      id: row.id as string,
      operationType: row.operation_type as OperationType,
      sessionId: row.session_id as string | undefined,
      payload: row.payload as string,
      errorMessage: row.error_message as string,
      failureReason: row.failure_reason as FailureReason,
      retryCount: row.retry_count as number,
      maxRetries: row.max_retries as number,
      priority: row.priority as number,
      createdAt: row.created_at as number,
      lastRetryAt: row.last_retry_at as number | undefined,
      nextRetryAt: row.next_retry_at as number,
      expiresAt: row.expires_at as number,
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let dlqInstance: DeadLetterQueue | null = null;

export function getDeadLetterQueue(): DeadLetterQueue | null {
  return dlqInstance;
}

export async function initDeadLetterQueue(
  config?: Partial<DeadLetterQueueConfig>
): Promise<DeadLetterQueue> {
  if (dlqInstance) {
    return dlqInstance;
  }

  dlqInstance = new DeadLetterQueue(config);
  await dlqInstance.initialize();
  return dlqInstance;
}

export function closeDeadLetterQueue(): void {
  if (dlqInstance) {
    dlqInstance.close();
    dlqInstance = null;
  }
}
