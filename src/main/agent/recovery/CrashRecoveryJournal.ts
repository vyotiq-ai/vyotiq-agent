/**
 * Crash Recovery Journal
 * 
 * Write-Ahead Log (WAL) for session state to provide crash resilience.
 * Records in-progress operations so they can be recovered after a crash.
 * 
 * Features:
 * - SQLite WAL mode for atomic commits
 * - Records operation intent before execution
 * - Supports checkpoint and replay for recovery
 * - Automatic cleanup of committed entries
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { createLogger } from '../../logger';

const logger = createLogger('CrashRecoveryJournal');

// =============================================================================
// Types
// =============================================================================

export type JournalOperationType =
  | 'session_create'
  | 'session_update'
  | 'message_add'
  | 'message_update'
  | 'tool_start'
  | 'tool_complete'
  | 'run_start'
  | 'run_complete'
  | 'state_checkpoint';

export type JournalStatus = 'pending' | 'committed' | 'rolled_back' | 'recovered';

export interface JournalEntry {
  /** Unique entry ID */
  id: number;
  /** Session ID */
  sessionId: string;
  /** Operation type */
  operationType: JournalOperationType;
  /** Serialized operation data */
  data: string;
  /** Previous state (for rollback) */
  previousState?: string;
  /** Entry status */
  status: JournalStatus;
  /** When the entry was created */
  createdAt: number;
  /** When the entry was committed/rolled back */
  completedAt?: number;
  /** Sequence number for ordering */
  sequence: number;
}

export interface RecoveryCheckpoint {
  sessionId: string;
  lastCommittedSequence: number;
  pendingOperations: JournalEntry[];
  stateSnapshot?: string;
}

export interface CrashRecoveryJournalConfig {
  /** Database file path */
  dbPath?: string;
  /** Maximum age for journal entries in ms (default: 7 days) */
  maxEntryAge: number;
  /** Enable WAL mode */
  enableWal: boolean;
  /** Checkpoint interval in entries */
  checkpointInterval: number;
}

export const DEFAULT_JOURNAL_CONFIG: CrashRecoveryJournalConfig = {
  maxEntryAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  enableWal: true,
  checkpointInterval: 100,
};

export interface JournalStats {
  totalEntries: number;
  pendingEntries: number;
  committedEntries: number;
  byOperationType: Record<string, number>;
  oldestEntryAge: number | null;
  currentSequence: number;
}

// =============================================================================
// Crash Recovery Journal Implementation
// =============================================================================

export class CrashRecoveryJournal {
  private db: Database.Database | null = null;
  private readonly config: CrashRecoveryJournalConfig;
  private readonly dbPath: string;
  private currentSequence = 0;
  private entryCount = 0;

  constructor(config: Partial<CrashRecoveryJournalConfig> = {}) {
    this.config = { ...DEFAULT_JOURNAL_CONFIG, ...config };
    this.dbPath = config.dbPath ?? path.join(
      app.getPath('userData'),
      'vyotiq-storage',
      'recovery-journal.sqlite'
    );
  }

  /**
   * Initialize the journal
   */
  async initialize(): Promise<void> {
    // Ensure directory exists
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });

    // Open database
    this.db = new Database(this.dbPath);

    // Enable WAL mode for crash safety
    if (this.config.enableWal) {
      this.db.pragma('journal_mode = WAL');
      // Synchronous mode for durability
      this.db.pragma('synchronous = NORMAL');
    }

    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS journal_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        data TEXT NOT NULL,
        previous_state TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        sequence INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_journal_session 
        ON journal_entries(session_id);
      
      CREATE INDEX IF NOT EXISTS idx_journal_status 
        ON journal_entries(status);
      
      CREATE INDEX IF NOT EXISTS idx_journal_sequence 
        ON journal_entries(sequence);
      
      CREATE TABLE IF NOT EXISTS checkpoints (
        session_id TEXT PRIMARY KEY,
        last_sequence INTEGER NOT NULL,
        state_snapshot TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    // Get current sequence number
    const seqResult = this.db.prepare(
      'SELECT MAX(sequence) as max_seq FROM journal_entries'
    ).get() as { max_seq: number | null };
    this.currentSequence = seqResult.max_seq ?? 0;

    logger.info('Crash recovery journal initialized', { 
      dbPath: this.dbPath,
      currentSequence: this.currentSequence,
    });
  }

  /**
   * Record an operation in the journal (before execution)
   * Returns the journal entry ID for later commit/rollback
   */
  recordOperation(
    sessionId: string,
    operationType: JournalOperationType,
    data: unknown,
    previousState?: unknown
  ): number {
    if (!this.db) {
      throw new Error('CrashRecoveryJournal not initialized');
    }

    this.currentSequence++;
    this.entryCount++;

    const stmt = this.db.prepare(`
      INSERT INTO journal_entries (
        session_id, operation_type, data, previous_state, 
        status, created_at, sequence
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?)
    `);

    const result = stmt.run(
      sessionId,
      operationType,
      JSON.stringify(data),
      previousState ? JSON.stringify(previousState) : null,
      Date.now(),
      this.currentSequence
    );

    // Auto-checkpoint
    if (this.entryCount >= this.config.checkpointInterval) {
      this.pruneCommittedEntries();
      this.entryCount = 0;
    }

    return result.lastInsertRowid as number;
  }

  /**
   * Mark an operation as successfully committed
   */
  commitOperation(entryId: number): void {
    if (!this.db) {
      return;
    }

    const stmt = this.db.prepare(`
      UPDATE journal_entries 
      SET status = 'committed', completed_at = ?
      WHERE id = ?
    `);

    stmt.run(Date.now(), entryId);
  }

  /**
   * Mark an operation as rolled back
   */
  rollbackOperation(entryId: number): void {
    if (!this.db) {
      return;
    }

    const stmt = this.db.prepare(`
      UPDATE journal_entries 
      SET status = 'rolled_back', completed_at = ?
      WHERE id = ?
    `);

    stmt.run(Date.now(), entryId);
  }

  /**
   * Get pending operations for a session (for recovery)
   */
  getPendingOperations(sessionId: string): JournalEntry[] {
    if (!this.db) {
      return [];
    }

    const stmt = this.db.prepare(`
      SELECT * FROM journal_entries 
      WHERE session_id = ? AND status = 'pending'
      ORDER BY sequence ASC
    `);

    const rows = stmt.all(sessionId) as Array<Record<string, unknown>>;
    return rows.map(this.rowToEntry);
  }

  /**
   * Get all sessions with pending operations (for startup recovery)
   */
  getSessionsWithPendingOperations(): string[] {
    if (!this.db) {
      return [];
    }

    const stmt = this.db.prepare(`
      SELECT DISTINCT session_id FROM journal_entries 
      WHERE status = 'pending'
    `);

    const rows = stmt.all() as Array<{ session_id: string }>;
    return rows.map(r => r.session_id);
  }

  /**
   * Create a checkpoint for a session
   */
  createCheckpoint(sessionId: string, stateSnapshot?: unknown): void {
    if (!this.db) {
      return;
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO checkpoints (
        session_id, last_sequence, state_snapshot, created_at
      ) VALUES (?, ?, ?, ?)
    `);

    stmt.run(
      sessionId,
      this.currentSequence,
      stateSnapshot ? JSON.stringify(stateSnapshot) : null,
      Date.now()
    );

    logger.debug('Created checkpoint', { sessionId, sequence: this.currentSequence });
  }

  /**
   * Get checkpoint for a session
   */
  getCheckpoint(sessionId: string): RecoveryCheckpoint | null {
    if (!this.db) {
      return null;
    }

    const checkpointStmt = this.db.prepare(
      'SELECT * FROM checkpoints WHERE session_id = ?'
    );
    const checkpoint = checkpointStmt.get(sessionId) as Record<string, unknown> | undefined;

    if (!checkpoint) {
      return null;
    }

    // Get pending operations after the checkpoint
    const pendingStmt = this.db.prepare(`
      SELECT * FROM journal_entries 
      WHERE session_id = ? AND status = 'pending' AND sequence > ?
      ORDER BY sequence ASC
    `);
    const pendingRows = pendingStmt.all(
      sessionId, 
      checkpoint.last_sequence as number
    ) as Array<Record<string, unknown>>;

    return {
      sessionId,
      lastCommittedSequence: checkpoint.last_sequence as number,
      pendingOperations: pendingRows.map(this.rowToEntry),
      stateSnapshot: checkpoint.state_snapshot as string | undefined,
    };
  }

  /**
   * Mark pending operations as recovered
   */
  markRecovered(sessionId: string): void {
    if (!this.db) {
      return;
    }

    const stmt = this.db.prepare(`
      UPDATE journal_entries 
      SET status = 'recovered', completed_at = ?
      WHERE session_id = ? AND status = 'pending'
    `);

    const result = stmt.run(Date.now(), sessionId);
    logger.info('Marked operations as recovered', { 
      sessionId, 
      count: result.changes 
    });
  }

  /**
   * Prune old committed entries
   */
  pruneCommittedEntries(): void {
    if (!this.db) {
      return;
    }

    const cutoffTime = Date.now() - this.config.maxEntryAge;

    const stmt = this.db.prepare(`
      DELETE FROM journal_entries 
      WHERE status IN ('committed', 'rolled_back', 'recovered') 
        AND completed_at < ?
    `);

    const result = stmt.run(cutoffTime);
    
    if (result.changes > 0) {
      logger.debug('Pruned old journal entries', { count: result.changes });
    }
  }

  /**
   * Get journal statistics
   */
  getStats(): JournalStats {
    if (!this.db) {
      return {
        totalEntries: 0,
        pendingEntries: 0,
        committedEntries: 0,
        byOperationType: {},
        oldestEntryAge: null,
        currentSequence: this.currentSequence,
      };
    }

    const now = Date.now();

    // Total entries
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM journal_entries');
    const totalResult = totalStmt.get() as { count: number };

    // Pending entries
    const pendingStmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM journal_entries WHERE status = 'pending'"
    );
    const pendingResult = pendingStmt.get() as { count: number };

    // Committed entries
    const committedStmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM journal_entries WHERE status = 'committed'"
    );
    const committedResult = committedStmt.get() as { count: number };

    // By operation type
    const byTypeStmt = this.db.prepare(`
      SELECT operation_type, COUNT(*) as count FROM journal_entries GROUP BY operation_type
    `);
    const byTypeRows = byTypeStmt.all() as Array<{ operation_type: string; count: number }>;
    const byOperationType: Record<string, number> = {};
    for (const row of byTypeRows) {
      byOperationType[row.operation_type] = row.count;
    }

    // Oldest entry
    const oldestStmt = this.db.prepare(
      'SELECT MIN(created_at) as oldest FROM journal_entries'
    );
    const oldestResult = oldestStmt.get() as { oldest: number | null };
    const oldestEntryAge = oldestResult.oldest ? now - oldestResult.oldest : null;

    return {
      totalEntries: totalResult.count,
      pendingEntries: pendingResult.count,
      committedEntries: committedResult.count,
      byOperationType,
      oldestEntryAge,
      currentSequence: this.currentSequence,
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      // Checkpoint WAL before closing
      try {
        this.db.pragma('wal_checkpoint(TRUNCATE)');
      } catch {
        // Ignore checkpoint errors on close
      }
      this.db.close();
      this.db = null;
      logger.info('Crash recovery journal closed');
    }
  }

  /**
   * Convert a database row to a JournalEntry
   */
  private rowToEntry(row: Record<string, unknown>): JournalEntry {
    return {
      id: row.id as number,
      sessionId: row.session_id as string,
      operationType: row.operation_type as JournalOperationType,
      data: row.data as string,
      previousState: row.previous_state as string | undefined,
      status: row.status as JournalStatus,
      createdAt: row.created_at as number,
      completedAt: row.completed_at as number | undefined,
      sequence: row.sequence as number,
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let journalInstance: CrashRecoveryJournal | null = null;

export function getCrashRecoveryJournal(): CrashRecoveryJournal | null {
  return journalInstance;
}

export async function initCrashRecoveryJournal(
  config?: Partial<CrashRecoveryJournalConfig>
): Promise<CrashRecoveryJournal> {
  if (journalInstance) {
    return journalInstance;
  }

  journalInstance = new CrashRecoveryJournal(config);
  await journalInstance.initialize();
  return journalInstance;
}

export function closeCrashRecoveryJournal(): void {
  if (journalInstance) {
    journalInstance.close();
    journalInstance = null;
  }
}
