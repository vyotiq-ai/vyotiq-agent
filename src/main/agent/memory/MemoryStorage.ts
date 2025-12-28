/**
 * Memory Storage
 * 
 * SQLite-based persistent storage for agent memories.
 * Provides CRUD operations and search functionality.
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import { createLogger } from '../../logger';
import type {
  MemoryEntry,
  MemoryCategory,
  MemoryImportance,
  CreateMemoryOptions,
  SearchMemoryOptions,
  MemorySearchResult,
  MemoryStats,
} from './types';

const logger = createLogger('MemoryStorage');

export class MemoryStorage {
  private db: Database.Database | null = null;
  private dbPath: string;
  private initialized = false;

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? path.join(app.getPath('userData'), 'memories.db');
  }

  /** Initialize the database and create tables */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      
      // Create memories table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'general',
          importance TEXT NOT NULL DEFAULT 'medium',
          keywords TEXT NOT NULL DEFAULT '[]',
          workspace_id TEXT NOT NULL,
          session_id TEXT,
          created_at INTEGER NOT NULL,
          last_accessed_at INTEGER NOT NULL,
          access_count INTEGER NOT NULL DEFAULT 0,
          is_pinned INTEGER NOT NULL DEFAULT 0,
          source TEXT NOT NULL DEFAULT 'agent'
        );
        
        CREATE INDEX IF NOT EXISTS idx_memories_workspace ON memories(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
        CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
        CREATE INDEX IF NOT EXISTS idx_memories_pinned ON memories(is_pinned);
      `);

      this.initialized = true;
      logger.info('Memory storage initialized', { dbPath: this.dbPath });
    } catch (error) {
      logger.error('Failed to initialize memory storage', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /** Create a new memory entry */
  create(options: CreateMemoryOptions): MemoryEntry {
    if (!this.db) throw new Error('Memory storage not initialized');

    const now = Date.now();
    const entry: MemoryEntry = {
      id: randomUUID(),
      content: options.content,
      category: options.category ?? 'general',
      importance: options.importance ?? 'medium',
      keywords: options.keywords ?? this.extractKeywords(options.content),
      workspaceId: options.workspaceId,
      sessionId: options.sessionId,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
      isPinned: options.isPinned ?? false,
      source: options.source ?? 'agent',
    };

    const stmt = this.db.prepare(`
      INSERT INTO memories (
        id, content, category, importance, keywords, workspace_id,
        session_id, created_at, last_accessed_at, access_count, is_pinned, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      entry.id,
      entry.content,
      entry.category,
      entry.importance,
      JSON.stringify(entry.keywords),
      entry.workspaceId,
      entry.sessionId ?? null,
      entry.createdAt,
      entry.lastAccessedAt,
      entry.accessCount,
      entry.isPinned ? 1 : 0,
      entry.source
    );

    logger.info('Memory created', { id: entry.id, category: entry.category });
    return entry;
  }

  /** Get a memory by ID */
  get(id: string): MemoryEntry | null {
    if (!this.db) throw new Error('Memory storage not initialized');

    const stmt = this.db.prepare('SELECT * FROM memories WHERE id = ?');
    const row = stmt.get(id) as MemoryRow | undefined;
    
    if (!row) return null;
    
    // Update access stats
    this.updateAccessStats(id);
    
    return this.rowToEntry(row);
  }

  /** Update a memory entry */
  update(id: string, updates: Partial<Pick<MemoryEntry, 'content' | 'category' | 'importance' | 'keywords' | 'isPinned'>>): MemoryEntry | null {
    if (!this.db) throw new Error('Memory storage not initialized');

    const existing = this.get(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.content !== undefined) {
      fields.push('content = ?');
      values.push(updates.content);
    }
    if (updates.category !== undefined) {
      fields.push('category = ?');
      values.push(updates.category);
    }
    if (updates.importance !== undefined) {
      fields.push('importance = ?');
      values.push(updates.importance);
    }
    if (updates.keywords !== undefined) {
      fields.push('keywords = ?');
      values.push(JSON.stringify(updates.keywords));
    }
    if (updates.isPinned !== undefined) {
      fields.push('is_pinned = ?');
      values.push(updates.isPinned ? 1 : 0);
    }

    if (fields.length === 0) return existing;

    values.push(id);
    const stmt = this.db.prepare(`UPDATE memories SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    logger.info('Memory updated', { id });
    return this.get(id);
  }

  /** Delete a memory */
  delete(id: string): boolean {
    if (!this.db) throw new Error('Memory storage not initialized');

    const stmt = this.db.prepare('DELETE FROM memories WHERE id = ?');
    const result = stmt.run(id);
    
    if (result.changes > 0) {
      logger.info('Memory deleted', { id });
      return true;
    }
    return false;
  }

  /** Search memories with various filters */
  search(options: SearchMemoryOptions): MemorySearchResult {
    if (!this.db) throw new Error('Memory storage not initialized');

    const conditions: string[] = ['workspace_id = ?'];
    const params: unknown[] = [options.workspaceId];

    if (options.category) {
      conditions.push('category = ?');
      params.push(options.category);
    }

    if (options.importance) {
      conditions.push('importance = ?');
      params.push(options.importance);
    }

    // Text search in content and keywords
    if (options.query) {
      const searchTerms = options.query.toLowerCase().split(/\s+/);
      const searchConditions = searchTerms.map(() => 
        '(LOWER(content) LIKE ? OR LOWER(keywords) LIKE ?)'
      );
      conditions.push(`(${searchConditions.join(' AND ')})`);
      for (const term of searchTerms) {
        params.push(`%${term}%`, `%${term}%`);
      }
    }

    const whereClause = conditions.join(' AND ');
    const limit = options.limit ?? 20;

    // Get total count
    const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM memories WHERE ${whereClause}`);
    const countResult = countStmt.get(...params) as { count: number };

    // Get memories ordered by importance and recency
    const importanceOrder = `CASE importance 
      WHEN 'critical' THEN 4 
      WHEN 'high' THEN 3 
      WHEN 'medium' THEN 2 
      ELSE 1 END`;
    
    const stmt = this.db.prepare(`
      SELECT * FROM memories 
      WHERE ${whereClause}
      ORDER BY is_pinned DESC, ${importanceOrder} DESC, last_accessed_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(...params, limit) as MemoryRow[];
    const memories = rows.map(row => this.rowToEntry(row));

    // Update access stats for retrieved memories
    for (const memory of memories) {
      this.updateAccessStats(memory.id);
    }

    return {
      memories,
      totalCount: countResult.count,
    };
  }

  /** Get all pinned memories for a workspace */
  getPinned(workspaceId: string): MemoryEntry[] {
    if (!this.db) throw new Error('Memory storage not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM memories 
      WHERE workspace_id = ? AND is_pinned = 1
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(workspaceId) as MemoryRow[];
    return rows.map(row => this.rowToEntry(row));
  }

  /** Get recent memories for context injection */
  getRecentForContext(workspaceId: string, limit = 10): MemoryEntry[] {
    if (!this.db) throw new Error('Memory storage not initialized');

    const importanceOrder = `CASE importance 
      WHEN 'critical' THEN 4 
      WHEN 'high' THEN 3 
      WHEN 'medium' THEN 2 
      ELSE 1 END`;

    const stmt = this.db.prepare(`
      SELECT * FROM memories 
      WHERE workspace_id = ?
      ORDER BY is_pinned DESC, ${importanceOrder} DESC, access_count DESC, last_accessed_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(workspaceId, limit) as MemoryRow[];
    return rows.map(row => this.rowToEntry(row));
  }

  /** 
   * Get memories relevant to a conversation context.
   * Extracts key terms from the context and finds matching memories.
   * Combines pinned memories with context-relevant ones.
   */
  getContextAwareMemories(workspaceId: string, contextHint: string, limit = 15): MemoryEntry[] {
    if (!this.db) throw new Error('Memory storage not initialized');

    // Always get pinned memories first
    const pinnedMemories = this.getPinned(workspaceId);
    const pinnedIds = new Set(pinnedMemories.map(m => m.id));

    // Extract meaningful keywords from context (filter common words)
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
      'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
      'into', 'through', 'during', 'before', 'after', 'above', 'below',
      'between', 'under', 'again', 'further', 'then', 'once', 'here',
      'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few',
      'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
      'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
      'and', 'but', 'if', 'or', 'because', 'until', 'while', 'this',
      'that', 'these', 'those', 'what', 'which', 'who', 'whom',
      'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
      'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him',
      'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its',
      'itself', 'they', 'them', 'their', 'theirs', 'themselves',
      'please', 'help', 'want', 'like', 'make', 'get', 'use', 'using',
    ]);

    const keywords = contextHint
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
      .slice(0, 10); // Limit to 10 keywords

    if (keywords.length === 0) {
      // No meaningful keywords, return recent + pinned
      const recent = this.getRecentForContext(workspaceId, limit - pinnedMemories.length);
      return [...pinnedMemories, ...recent.filter(m => !pinnedIds.has(m.id))].slice(0, limit);
    }

    // Build search query with OR conditions for broader matching
    const searchConditions = keywords.map(() => 
      '(LOWER(content) LIKE ? OR LOWER(keywords) LIKE ?)'
    );
    const params: unknown[] = [workspaceId];
    for (const kw of keywords) {
      params.push(`%${kw}%`, `%${kw}%`);
    }

    const importanceOrder = `CASE importance 
      WHEN 'critical' THEN 4 
      WHEN 'high' THEN 3 
      WHEN 'medium' THEN 2 
      ELSE 1 END`;

    // Search with OR to find any matching memories
    const stmt = this.db.prepare(`
      SELECT *, 
        (${searchConditions.map((_, i) => `(CASE WHEN ${searchConditions[i]} THEN 1 ELSE 0 END)`).join(' + ')}) as match_score
      FROM memories 
      WHERE workspace_id = ? AND (${searchConditions.join(' OR ')})
      ORDER BY is_pinned DESC, match_score DESC, ${importanceOrder} DESC, last_accessed_at DESC
      LIMIT ?
    `);

    const searchLimit = limit - pinnedMemories.length;
    const rows = stmt.all(...params, searchLimit) as MemoryRow[];
    const searchResults = rows
      .map(row => this.rowToEntry(row))
      .filter(m => !pinnedIds.has(m.id));

    // Update access stats for retrieved memories
    for (const memory of searchResults) {
      this.updateAccessStats(memory.id);
    }

    // Combine: pinned first, then search results
    return [...pinnedMemories, ...searchResults].slice(0, limit);
  }

  /** Get memory statistics for a workspace */
  getStats(workspaceId: string): MemoryStats {
    if (!this.db) throw new Error('Memory storage not initialized');

    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM memories WHERE workspace_id = ?');
    const total = (totalStmt.get(workspaceId) as { count: number }).count;

    const categoryStmt = this.db.prepare(`
      SELECT category, COUNT(*) as count FROM memories 
      WHERE workspace_id = ? GROUP BY category
    `);
    const categoryRows = categoryStmt.all(workspaceId) as Array<{ category: string; count: number }>;
    const byCategory = {} as Record<MemoryCategory, number>;
    for (const row of categoryRows) {
      byCategory[row.category as MemoryCategory] = row.count;
    }

    const importanceStmt = this.db.prepare(`
      SELECT importance, COUNT(*) as count FROM memories 
      WHERE workspace_id = ? GROUP BY importance
    `);
    const importanceRows = importanceStmt.all(workspaceId) as Array<{ importance: string; count: number }>;
    const byImportance = {} as Record<MemoryImportance, number>;
    for (const row of importanceRows) {
      byImportance[row.importance as MemoryImportance] = row.count;
    }

    const pinnedStmt = this.db.prepare('SELECT COUNT(*) as count FROM memories WHERE workspace_id = ? AND is_pinned = 1');
    const pinnedCount = (pinnedStmt.get(workspaceId) as { count: number }).count;

    return {
      totalMemories: total,
      byCategory,
      byImportance,
      pinnedCount,
    };
  }

  /** Delete all memories for a workspace */
  clearWorkspace(workspaceId: string): number {
    if (!this.db) throw new Error('Memory storage not initialized');

    const stmt = this.db.prepare('DELETE FROM memories WHERE workspace_id = ?');
    const result = stmt.run(workspaceId);
    
    logger.info('Workspace memories cleared', { workspaceId, count: result.changes });
    return result.changes;
  }

  /** Close the database connection */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      logger.info('Memory storage closed');
    }
  }

  /** Extract keywords from content */
  private extractKeywords(content: string): string[] {
    // Simple keyword extraction - split on whitespace and filter
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3);
    
    // Get unique words, prioritize longer ones
    const unique = [...new Set(words)];
    return unique.slice(0, 10);
  }

  /** Update access statistics for a memory */
  private updateAccessStats(id: string): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      UPDATE memories 
      SET last_accessed_at = ?, access_count = access_count + 1 
      WHERE id = ?
    `);
    stmt.run(Date.now(), id);
  }

  /** Convert database row to MemoryEntry */
  private rowToEntry(row: MemoryRow): MemoryEntry {
    return {
      id: row.id,
      content: row.content,
      category: row.category as MemoryCategory,
      importance: row.importance as MemoryImportance,
      keywords: JSON.parse(row.keywords),
      workspaceId: row.workspace_id,
      sessionId: row.session_id ?? undefined,
      createdAt: row.created_at,
      lastAccessedAt: row.last_accessed_at,
      accessCount: row.access_count,
      isPinned: row.is_pinned === 1,
      source: row.source as 'agent' | 'user',
    };
  }
}

/** Database row type */
interface MemoryRow {
  id: string;
  content: string;
  category: string;
  importance: string;
  keywords: string;
  workspace_id: string;
  session_id: string | null;
  created_at: number;
  last_accessed_at: number;
  access_count: number;
  is_pinned: number;
  source: string;
}

// Singleton instance
let memoryStorageInstance: MemoryStorage | null = null;

/** Get or create the memory storage singleton */
export function getMemoryStorage(): MemoryStorage {
  if (!memoryStorageInstance) {
    memoryStorageInstance = new MemoryStorage();
  }
  return memoryStorageInstance;
}

/** Initialize the memory storage */
export async function initMemoryStorage(): Promise<MemoryStorage> {
  const storage = getMemoryStorage();
  await storage.initialize();
  return storage;
}
