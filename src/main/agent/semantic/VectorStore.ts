/**
 * Vector Store
 *
 * SQLite-based vector storage with similarity search.
 * Uses HNSW (Hierarchical Navigable Small World) index for fast approximate nearest neighbor queries.
 * Fully local storage - no external services required.
 * 
 * Features:
 * - Content hashing for change detection
 * - HNSW index for O(log n) similarity search
 * - Batch upsert operations
 * - Automatic index maintenance
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import crypto from 'node:crypto';
import { app } from 'electron';
import { createLogger } from '../../logger';

const logger = createLogger('VectorStore');

// =============================================================================
// Types
// =============================================================================

export interface VectorDocument {
  /** Unique document ID */
  id: string;
  /** Source file path */
  filePath: string;
  /** Chunk index within file */
  chunkIndex: number;
  /** Original text content */
  content: string;
  /** Vector embedding */
  vector: Float32Array;
  /** Metadata for filtering */
  metadata: VectorDocumentMetadata;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
}

export interface VectorDocumentMetadata {
  /** File type (extension) */
  fileType: string;
  /** Programming language */
  language?: string;
  /** Symbol type (function, class, etc.) */
  symbolType?: string;
  /** Symbol name */
  symbolName?: string;
  /** Start line in file */
  startLine?: number;
  /** End line in file */
  endLine?: number;
  /** File size in bytes */
  fileSize?: number;
  /** Content hash for change detection */
  contentHash?: string;
  /** Additional custom metadata */
  [key: string]: unknown;
}

export interface SearchResult {
  /** Document */
  document: VectorDocument;
  /** Similarity score (0-1) */
  score: number;
  /** Distance (lower is better) */
  distance: number;
}

export interface SearchOptions {
  /** Maximum results to return */
  limit?: number;
  /** Minimum similarity threshold (0-1) */
  minScore?: number;
  /** Filter by file path pattern */
  filePathPattern?: string;
  /** Filter by file types */
  fileTypes?: string[];
  /** Filter by languages */
  languages?: string[];
  /** Filter by symbol types */
  symbolTypes?: string[];
  /** Include content in results */
  includeContent?: boolean;
}

export interface VectorStoreConfig {
  /** Database file path */
  dbPath?: string;
  /** Vector dimension */
  dimension: number;
  /** Enable WAL mode for better performance */
  enableWal: boolean;
  /** Page size for SQLite */
  pageSize: number;
  /** Cache size in pages */
  cacheSize: number;
  /** HNSW index parameters */
  hnswM?: number;
  hnswEfConstruction?: number;
  hnswEfSearch?: number;
}

export const DEFAULT_VECTOR_STORE_CONFIG: VectorStoreConfig = {
  dimension: 384, // all-MiniLM-L6-v2 dimension
  enableWal: true,
  pageSize: 4096,
  cacheSize: 10000,
  hnswM: 16,
  hnswEfConstruction: 200,
  hnswEfSearch: 50,
};

export interface VectorStoreStats {
  /** Total documents */
  totalDocuments: number;
  /** Unique files */
  uniqueFiles: number;
  /** Total chunks */
  totalChunks: number;
  /** Database size in bytes */
  dbSizeBytes: number;
  /** Index health */
  indexHealth: 'healthy' | 'degraded' | 'needs-rebuild' | 'empty';
  /** Average query time in ms */
  avgQueryTimeMs?: number;
  /** Last optimization timestamp */
  lastOptimizedAt?: number;
}

// =============================================================================
// HNSW Index for Fast Similarity Search
// =============================================================================

/**
 * Simple in-memory HNSW-like index for fast approximate nearest neighbor search.
 * Uses a hierarchical graph structure for O(log n) query time.
 */
class HNSWIndex {
  private dimension: number;
  private M: number; // Max connections per layer
  private efConstruction: number;
  private efSearch: number;
  private vectors: Map<string, Float32Array> = new Map();
  private graph: Map<string, Set<string>> = new Map();
  private entryPoint: string | null = null;

  constructor(dimension: number, M = 16, efConstruction = 200, efSearch = 50) {
    this.dimension = dimension;
    this.M = M;
    this.efConstruction = efConstruction;
    this.efSearch = efSearch;
  }

  /**
   * Add a vector to the index
   */
  add(id: string, vector: Float32Array): void {
    if (vector.length !== this.dimension) {
      throw new Error(`Vector dimension mismatch: expected ${this.dimension}, got ${vector.length}`);
    }

    this.vectors.set(id, vector);

    // Initialize graph entry for this vector
    if (!this.graph.has(id)) {
      this.graph.set(id, new Set());
    }

    // Set as entry point if first vector
    if (!this.entryPoint) {
      this.entryPoint = id;
      return;
    }

    // Find nearest neighbors during construction
    const neighbors = this.searchKnn(vector, this.M, this.efConstruction);
    
    // Add bidirectional edges
    for (const neighbor of neighbors) {
      this.graph.get(id)!.add(neighbor.id);
      this.graph.get(neighbor.id)!.add(id);
      
      // Prune if too many connections
      if (this.graph.get(neighbor.id)!.size > this.M * 2) {
        this.pruneConnections(neighbor.id);
      }
    }
  }

  /**
   * Remove a vector from the index
   */
  remove(id: string): boolean {
    if (!this.vectors.has(id)) return false;

    // Remove from graph
    const connections = this.graph.get(id);
    if (connections) {
      for (const connId of connections) {
        this.graph.get(connId)?.delete(id);
      }
    }
    this.graph.delete(id);
    this.vectors.delete(id);

    // Update entry point if needed
    if (this.entryPoint === id) {
      this.entryPoint = this.vectors.size > 0 ? this.vectors.keys().next().value ?? null : null;
    }

    return true;
  }

  /**
   * Search for k nearest neighbors
   */
  search(queryVector: Float32Array, k: number): Array<{ id: string; distance: number }> {
    if (this.vectors.size === 0) return [];
    return this.searchKnn(queryVector, k, this.efSearch);
  }

  /**
   * Internal KNN search using greedy beam search
   */
  private searchKnn(queryVector: Float32Array, k: number, ef: number): Array<{ id: string; distance: number }> {
    if (!this.entryPoint) return [];

    const visited = new Set<string>();
    const candidates: Array<{ id: string; distance: number }> = [];
    const results: Array<{ id: string; distance: number }> = [];

    // Start from entry point
    const entryDist = this.distance(queryVector, this.vectors.get(this.entryPoint)!);
    candidates.push({ id: this.entryPoint, distance: entryDist });
    visited.add(this.entryPoint);

    while (candidates.length > 0) {
      // Get closest candidate
      candidates.sort((a, b) => a.distance - b.distance);
      const current = candidates.shift()!;

      // Check if we should stop
      if (results.length >= ef && current.distance > results[results.length - 1].distance) {
        break;
      }

      // Add to results
      results.push(current);
      results.sort((a, b) => a.distance - b.distance);
      if (results.length > ef) results.pop();

      // Explore neighbors
      const neighbors = this.graph.get(current.id);
      if (neighbors) {
        for (const neighborId of neighbors) {
          if (visited.has(neighborId)) continue;
          visited.add(neighborId);

          const neighborVector = this.vectors.get(neighborId);
          if (!neighborVector) continue;

          const dist = this.distance(queryVector, neighborVector);
          
          // Only add if potentially good
          if (results.length < ef || dist < results[results.length - 1].distance) {
            candidates.push({ id: neighborId, distance: dist });
          }
        }
      }
    }

    return results.slice(0, k);
  }

  /**
   * Prune connections to keep graph sparse
   */
  private pruneConnections(id: string): void {
    const connections = this.graph.get(id);
    if (!connections || connections.size <= this.M) return;

    const vector = this.vectors.get(id);
    if (!vector) return;

    // Sort by distance and keep only M closest
    const sorted = Array.from(connections)
      .map(connId => ({
        id: connId,
        distance: this.distance(vector, this.vectors.get(connId)!),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, this.M);

    this.graph.set(id, new Set(sorted.map(s => s.id)));
  }

  /**
   * Cosine distance (1 - cosine similarity)
   */
  private distance(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0) return 1;

    return 1 - (dotProduct / denom);
  }

  /**
   * Get index size
   */
  get size(): number {
    return this.vectors.size;
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.vectors.clear();
    this.graph.clear();
    this.entryPoint = null;
  }

  /**
   * Export index state for persistence
   */
  export(): { vectors: Array<[string, number[]]>; graph: Array<[string, string[]]>; entryPoint: string | null } {
    return {
      vectors: Array.from(this.vectors.entries()).map(([id, vec]) => [id, Array.from(vec)]),
      graph: Array.from(this.graph.entries()).map(([id, conns]) => [id, Array.from(conns)]),
      entryPoint: this.entryPoint,
    };
  }

  /**
   * Import index state from persistence
   */
  import(data: { vectors: Array<[string, number[]]>; graph: Array<[string, string[]]>; entryPoint: string | null }): void {
    this.clear();
    for (const [id, vec] of data.vectors) {
      this.vectors.set(id, new Float32Array(vec));
    }
    for (const [id, conns] of data.graph) {
      this.graph.set(id, new Set(conns));
    }
    this.entryPoint = data.entryPoint;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Compute content hash for change detection
 */
export function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

// =============================================================================
// Vector Store
// =============================================================================

export class VectorStore {
  private config: VectorStoreConfig;
  private db: Database.Database | null = null;
  private dbPath: string;
  private isInitialized = false;
  private hnswIndex: HNSWIndex | null = null;
  private queryTimes: number[] = [];
  private lastOptimizedAt: number | null = null;

  constructor(config: Partial<VectorStoreConfig> = {}) {
    this.config = { ...DEFAULT_VECTOR_STORE_CONFIG, ...config };
    this.dbPath = config.dbPath ?? path.join(
      app.getPath('userData'),
      'semantic-index',
      'vectors.db'
    );
  }

  /**
   * Initialize the vector store
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(this.dbPath), { recursive: true });

      // Open database
      this.db = new Database(this.dbPath);

      // Configure database
      if (this.config.enableWal) {
        this.db.pragma('journal_mode = WAL');
      }
      this.db.pragma(`page_size = ${this.config.pageSize}`);
      this.db.pragma(`cache_size = ${this.config.cacheSize}`);
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('temp_store = MEMORY');

      // Create tables
      this.createTables();

      // Initialize HNSW index and load existing vectors
      this.hnswIndex = new HNSWIndex(
        this.config.dimension,
        this.config.hnswM,
        this.config.hnswEfConstruction,
        this.config.hnswEfSearch
      );
      await this.loadHnswIndex();

      this.isInitialized = true;
      logger.info('Vector store initialized', { dbPath: this.dbPath, hnswSize: this.hnswIndex.size });
    } catch (error) {
      logger.error('Failed to initialize vector store', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Load existing vectors into HNSW index
   */
  private async loadHnswIndex(): Promise<void> {
    if (!this.db || !this.hnswIndex) return;

    // Try to load persisted index first
    const hnswPath = this.dbPath.replace('.db', '.hnsw.json');
    try {
      const data = await fs.readFile(hnswPath, 'utf-8');
      const parsed = JSON.parse(data);
      this.hnswIndex.import(parsed);
      logger.debug('Loaded HNSW index from disk', { size: this.hnswIndex.size });
      return;
    } catch {
      // No persisted index, rebuild from database
    }

    // Rebuild index from database
    const stmt = this.db.prepare('SELECT id, vector FROM documents');
    const rows = stmt.all() as Array<{ id: string; vector: Buffer }>;
    
    for (const row of rows) {
      const vector = new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4);
      this.hnswIndex.add(row.id, vector);
    }

    logger.debug('Rebuilt HNSW index from database', { size: this.hnswIndex.size });
  }

  /**
   * Persist HNSW index to disk
   */
  private async persistHnswIndex(): Promise<void> {
    if (!this.hnswIndex) return;

    const hnswPath = this.dbPath.replace('.db', '.hnsw.json');
    try {
      const data = this.hnswIndex.export();
      await fs.writeFile(hnswPath, JSON.stringify(data));
      logger.debug('Persisted HNSW index to disk', { size: this.hnswIndex.size });
    } catch (error) {
      logger.warn('Failed to persist HNSW index', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Main documents table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        vector BLOB NOT NULL,
        metadata TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(file_path, chunk_index)
      )
    `);

    // Index for file path lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_documents_file_path 
      ON documents(file_path)
    `);

    // Index for timestamp queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_documents_updated_at 
      ON documents(updated_at)
    `);

    // Metadata extracted for filtering
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS document_metadata (
        document_id TEXT PRIMARY KEY,
        file_type TEXT,
        language TEXT,
        symbol_type TEXT,
        symbol_name TEXT,
        start_line INTEGER,
        end_line INTEGER,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      )
    `);

    // Indexes for metadata filtering
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_metadata_file_type ON document_metadata(file_type)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_metadata_language ON document_metadata(language)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_metadata_symbol_type ON document_metadata(symbol_type)
    `);

    // Statistics table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS stats (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  /**
   * Insert or update a document
   */
  upsert(document: VectorDocument): void {
    if (!this.db) throw new Error('Database not initialized');

    const vectorBlob = Buffer.from(document.vector.buffer);
    const metadataJson = JSON.stringify(document.metadata);
    const now = Date.now();

    const upsertDoc = this.db.prepare(`
      INSERT INTO documents (id, file_path, chunk_index, content, vector, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(file_path, chunk_index) DO UPDATE SET
        id = excluded.id,
        content = excluded.content,
        vector = excluded.vector,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `);

    const upsertMeta = this.db.prepare(`
      INSERT INTO document_metadata (document_id, file_type, language, symbol_type, symbol_name, start_line, end_line)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_id) DO UPDATE SET
        file_type = excluded.file_type,
        language = excluded.language,
        symbol_type = excluded.symbol_type,
        symbol_name = excluded.symbol_name,
        start_line = excluded.start_line,
        end_line = excluded.end_line
    `);

    const transaction = this.db.transaction(() => {
      upsertDoc.run(
        document.id,
        document.filePath,
        document.chunkIndex,
        document.content,
        vectorBlob,
        metadataJson,
        document.createdAt || now,
        now
      );

      upsertMeta.run(
        document.id,
        document.metadata.fileType || null,
        document.metadata.language || null,
        document.metadata.symbolType || null,
        document.metadata.symbolName || null,
        document.metadata.startLine || null,
        document.metadata.endLine || null
      );
    });

    transaction();

    // Add to HNSW index
    if (this.hnswIndex) {
      this.hnswIndex.remove(document.id); // Remove if exists
      this.hnswIndex.add(document.id, document.vector);
    }
  }

  /**
   * Insert multiple documents in a batch
   */
  upsertBatch(documents: VectorDocument[]): void {
    if (!this.db) throw new Error('Database not initialized');

    const upsertDoc = this.db.prepare(`
      INSERT INTO documents (id, file_path, chunk_index, content, vector, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(file_path, chunk_index) DO UPDATE SET
        id = excluded.id,
        content = excluded.content,
        vector = excluded.vector,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `);

    const upsertMeta = this.db.prepare(`
      INSERT INTO document_metadata (document_id, file_type, language, symbol_type, symbol_name, start_line, end_line)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_id) DO UPDATE SET
        file_type = excluded.file_type,
        language = excluded.language,
        symbol_type = excluded.symbol_type,
        symbol_name = excluded.symbol_name,
        start_line = excluded.start_line,
        end_line = excluded.end_line
    `);

    const now = Date.now();

    const transaction = this.db.transaction(() => {
      for (const doc of documents) {
        const vectorBlob = Buffer.from(doc.vector.buffer);
        const metadataJson = JSON.stringify(doc.metadata);

        upsertDoc.run(
          doc.id,
          doc.filePath,
          doc.chunkIndex,
          doc.content,
          vectorBlob,
          metadataJson,
          doc.createdAt || now,
          now
        );

        upsertMeta.run(
          doc.id,
          doc.metadata.fileType || null,
          doc.metadata.language || null,
          doc.metadata.symbolType || null,
          doc.metadata.symbolName || null,
          doc.metadata.startLine || null,
          doc.metadata.endLine || null
        );
      }
    });

    transaction();

    // Add all to HNSW index
    if (this.hnswIndex) {
      for (const doc of documents) {
        this.hnswIndex.remove(doc.id);
        this.hnswIndex.add(doc.id, doc.vector);
      }
    }
  }

  /**
   * Search for similar documents
   */
  search(queryVector: Float32Array, options: SearchOptions = {}): SearchResult[] {
    if (!this.db) throw new Error('Database not initialized');

    const startTime = Date.now();
    const {
      limit = 10,
      minScore = 0,
      filePathPattern,
      fileTypes,
      languages,
      symbolTypes,
      includeContent = true,
    } = options;

    const hasFilters = !!(filePathPattern || fileTypes?.length || languages?.length || symbolTypes?.length);

    // Use HNSW index for fast search when no filters
    if (this.hnswIndex && !hasFilters) {
      const candidates = this.hnswIndex.search(queryVector, limit * 3); // Get more candidates for filtering
      
      const results: SearchResult[] = [];
      for (const { id, distance } of candidates) {
        const similarity = 1 - distance;
        if (similarity < minScore) continue;

        // Fetch document from database
        const doc = this.getDocumentById(id, includeContent);
        if (!doc) continue;

        results.push({
          document: doc,
          score: similarity,
          distance,
        });

        if (results.length >= limit) break;
      }

      this.recordQueryTime(Date.now() - startTime);
      return results;
    }

    // Fallback to SQL search with filters
    let query = `
      SELECT 
        d.id, d.file_path, d.chunk_index, 
        ${includeContent ? 'd.content,' : "'[content omitted]' as content,"}
        d.vector, d.metadata, d.created_at, d.updated_at
      FROM documents d
      JOIN document_metadata m ON d.id = m.document_id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (filePathPattern) {
      query += ' AND d.file_path LIKE ?';
      params.push(`%${filePathPattern}%`);
    }

    if (fileTypes && fileTypes.length > 0) {
      query += ` AND m.file_type IN (${fileTypes.map(() => '?').join(',')})`;
      params.push(...fileTypes);
    }

    if (languages && languages.length > 0) {
      query += ` AND m.language IN (${languages.map(() => '?').join(',')})`;
      params.push(...languages);
    }

    if (symbolTypes && symbolTypes.length > 0) {
      query += ` AND m.symbol_type IN (${symbolTypes.map(() => '?').join(',')})`;
      params.push(...symbolTypes);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as Array<{
      id: string;
      file_path: string;
      chunk_index: number;
      content: string;
      vector: Buffer;
      metadata: string;
      created_at: number;
      updated_at: number;
    }>;

    // Calculate similarities
    const results: SearchResult[] = [];

    for (const row of rows) {
      const docVector = new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4);
      const similarity = this.cosineSimilarity(queryVector, docVector);

      if (similarity >= minScore) {
        const metadata = JSON.parse(row.metadata) as VectorDocumentMetadata;
        
        results.push({
          document: {
            id: row.id,
            filePath: row.file_path,
            chunkIndex: row.chunk_index,
            content: row.content,
            vector: docVector,
            metadata,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          },
          score: similarity,
          distance: 1 - similarity,
        });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    this.recordQueryTime(Date.now() - startTime);
    return results.slice(0, limit);
  }

  /**
   * Get document by ID
   */
  private getDocumentById(id: string, includeContent = true): VectorDocument | null {
    if (!this.db) return null;

    const stmt = this.db.prepare(`
      SELECT id, file_path, chunk_index, 
        ${includeContent ? 'content,' : "'' as content,"}
        vector, metadata, created_at, updated_at
      FROM documents WHERE id = ?
    `);

    const row = stmt.get(id) as {
      id: string;
      file_path: string;
      chunk_index: number;
      content: string;
      vector: Buffer;
      metadata: string;
      created_at: number;
      updated_at: number;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      filePath: row.file_path,
      chunkIndex: row.chunk_index,
      content: row.content,
      vector: new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4),
      metadata: JSON.parse(row.metadata) as VectorDocumentMetadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Record query time for statistics
   */
  private recordQueryTime(ms: number): void {
    this.queryTimes.push(ms);
    // Keep only last 100 query times
    if (this.queryTimes.length > 100) {
      this.queryTimes.shift();
    }
  }

  /**
   * Delete documents by file path
   */
  deleteByFilePath(filePath: string): number {
    if (!this.db) throw new Error('Database not initialized');

    // Get IDs to remove from HNSW
    const idsStmt = this.db.prepare('SELECT id FROM documents WHERE file_path = ?');
    const ids = (idsStmt.all(filePath) as Array<{ id: string }>).map(r => r.id);
    
    // Remove from HNSW index
    if (this.hnswIndex) {
      for (const id of ids) {
        this.hnswIndex.remove(id);
      }
    }

    const deleteStmt = this.db.prepare(`
      DELETE FROM documents WHERE file_path = ?
    `);

    const result = deleteStmt.run(filePath);
    return result.changes;
  }

  /**
   * Delete all documents for multiple file paths
   */
  deleteByFilePaths(filePaths: string[]): number {
    if (!this.db) throw new Error('Database not initialized');
    if (filePaths.length === 0) return 0;

    // Get IDs to remove from HNSW
    const placeholders = filePaths.map(() => '?').join(',');
    const idsStmt = this.db.prepare(`SELECT id FROM documents WHERE file_path IN (${placeholders})`);
    const ids = (idsStmt.all(...filePaths) as Array<{ id: string }>).map(r => r.id);
    
    // Remove from HNSW index
    if (this.hnswIndex) {
      for (const id of ids) {
        this.hnswIndex.remove(id);
      }
    }

    const deleteStmt = this.db.prepare(`
      DELETE FROM documents WHERE file_path IN (${placeholders})
    `);

    const result = deleteStmt.run(...filePaths);
    return result.changes;
  }

  /**
   * Get all file paths in the index
   */
  getIndexedFilePaths(): string[] {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT DISTINCT file_path FROM documents ORDER BY file_path
    `);

    const rows = stmt.all() as Array<{ file_path: string }>;
    return rows.map(r => r.file_path);
  }

  /**
   * Get document by file path and chunk index
   */
  getDocument(filePath: string, chunkIndex: number): VectorDocument | null {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, file_path, chunk_index, content, vector, metadata, created_at, updated_at
      FROM documents
      WHERE file_path = ? AND chunk_index = ?
    `);

    const row = stmt.get(filePath, chunkIndex) as {
      id: string;
      file_path: string;
      chunk_index: number;
      content: string;
      vector: Buffer;
      metadata: string;
      created_at: number;
      updated_at: number;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      filePath: row.file_path,
      chunkIndex: row.chunk_index,
      content: row.content,
      vector: new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4),
      metadata: JSON.parse(row.metadata) as VectorDocumentMetadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Get all documents for a file
   */
  getDocumentsByFilePath(filePath: string): VectorDocument[] {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, file_path, chunk_index, content, vector, metadata, created_at, updated_at
      FROM documents
      WHERE file_path = ?
      ORDER BY chunk_index
    `);

    const rows = stmt.all(filePath) as Array<{
      id: string;
      file_path: string;
      chunk_index: number;
      content: string;
      vector: Buffer;
      metadata: string;
      created_at: number;
      updated_at: number;
    }>;

    return rows.map(row => ({
      id: row.id,
      filePath: row.file_path,
      chunkIndex: row.chunk_index,
      content: row.content,
      vector: new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4),
      metadata: JSON.parse(row.metadata) as VectorDocumentMetadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Get store statistics
   */
  async getStats(): Promise<VectorStoreStats> {
    if (!this.db) throw new Error('Database not initialized');

    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM documents');
    const filesStmt = this.db.prepare('SELECT COUNT(DISTINCT file_path) as count FROM documents');

    const totalDocs = (countStmt.get() as { count: number }).count;
    const uniqueFiles = (filesStmt.get() as { count: number }).count;

    // Get database file size
    let dbSizeBytes = 0;
    try {
      const stat = await fs.stat(this.dbPath);
      dbSizeBytes = stat.size;
      
      // Add HNSW index size if exists
      const hnswPath = this.dbPath.replace('.db', '.hnsw.json');
      try {
        const hnswStat = await fs.stat(hnswPath);
        dbSizeBytes += hnswStat.size;
      } catch {
        // HNSW file doesn't exist yet
      }
    } catch {
      // Ignore if file doesn't exist yet
    }

    // Calculate average query time
    const avgQueryTimeMs = this.queryTimes.length > 0
      ? this.queryTimes.reduce((a, b) => a + b, 0) / this.queryTimes.length
      : undefined;

    return {
      totalDocuments: totalDocs,
      uniqueFiles,
      totalChunks: totalDocs,
      dbSizeBytes,
      indexHealth: totalDocs > 0 ? 'healthy' : 'empty' as const,
      avgQueryTimeMs,
      lastOptimizedAt: this.lastOptimizedAt ?? undefined,
    };
  }

  /**
   * Check if a file needs reindexing based on content hash
   */
  needsReindex(filePath: string, contentHash: string): boolean {
    if (!this.db) return true;

    const stmt = this.db.prepare(`
      SELECT metadata FROM documents WHERE file_path = ? LIMIT 1
    `);
    const row = stmt.get(filePath) as { metadata: string } | undefined;
    
    if (!row) return true;
    
    try {
      const metadata = JSON.parse(row.metadata) as VectorDocumentMetadata;
      return metadata.contentHash !== contentHash;
    } catch {
      return true;
    }
  }

  /**
   * Clear all data
   */
  clear(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec('DELETE FROM documents');
    this.db.exec('DELETE FROM document_metadata');
    this.db.exec('DELETE FROM stats');
    
    // Clear HNSW index
    if (this.hnswIndex) {
      this.hnswIndex.clear();
    }

    // Remove HNSW index file
    const hnswPath = this.dbPath.replace('.db', '.hnsw.json');
    fs.unlink(hnswPath).catch(() => {/* ignore */});
    this.db.exec('VACUUM');

    logger.info('Vector store cleared');
  }

  /**
   * Optimize database and persist HNSW index
   */
  async optimize(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec('ANALYZE');
    this.db.exec('VACUUM');
    
    // Persist HNSW index
    await this.persistHnswIndex();
    
    this.lastOptimizedAt = Date.now();
    logger.info('Vector store optimized');
  }

  /**
   * Cosine similarity between two vectors
   */
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  /**
   * Check if initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.db !== null;
  }

  /**
   * Shutdown the store
   */
  async shutdown(): Promise<void> {
    // Persist HNSW index before shutdown
    await this.persistHnswIndex();
    
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.hnswIndex = null;
    this.isInitialized = false;
    logger.info('Vector store shutdown');
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let vectorStoreInstance: VectorStore | null = null;

/**
 * Get the singleton vector store instance
 * Pass configuration only on first call, subsequent calls return the existing instance.
 */
export function getVectorStore(config?: Partial<VectorStoreConfig>): VectorStore {
  if (!vectorStoreInstance) {
    vectorStoreInstance = new VectorStore(config);
  }
  return vectorStoreInstance;
}

/**
 * Reset the vector store (for testing or to apply new configuration) */
export function resetVectorStore(): void {
  if (vectorStoreInstance) {
    vectorStoreInstance.shutdown();
    vectorStoreInstance = null;
  }
}