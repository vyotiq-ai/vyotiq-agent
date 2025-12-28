/**
 * Dynamic Tool Indexer
 *
 * Indexes dynamically created tools for fast search and discovery.
 */
import type { ToolSpecification, DynamicToolState } from '../../../shared/types';
import { createLogger } from '../../logger';

const logger = createLogger('DynamicToolIndexer');

/**
 * Indexed tool entry
 */
export interface IndexedTool {
  /** Tool specification */
  spec: ToolSpecification;
  /** Runtime state */
  state: DynamicToolState;
  /** Search tokens (lowercase) */
  searchTokens: string[];
  /** Last indexed timestamp */
  indexedAt: number;
}

/**
 * Search match
 */
export interface IndexSearchMatch {
  /** Tool ID */
  id: string;
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** Match score */
  score: number;
  /** Whether dynamic */
  isDynamic: true;
}

/**
 * Dynamic Tool Indexer class
 */
export class DynamicToolIndexer {
  private index = new Map<string, IndexedTool>();
  private nameIndex = new Map<string, string>(); // name -> id
  private sessionIndex = new Map<string, Set<string>>(); // sessionId -> tool ids

  /**
   * Index a tool
   */
  indexTool(spec: ToolSpecification, state: DynamicToolState): void {
    const searchTokens = this.buildSearchTokens(spec);

    const entry: IndexedTool = {
      spec,
      state,
      searchTokens,
      indexedAt: Date.now(),
    };

    this.index.set(spec.id, entry);
    this.nameIndex.set(spec.name.toLowerCase(), spec.id);

    // Add to session index
    const sessionId = spec.createdBy.sessionId;
    if (!this.sessionIndex.has(sessionId)) {
      this.sessionIndex.set(sessionId, new Set());
    }
    this.sessionIndex.get(sessionId)!.add(spec.id);

    logger.debug('Tool indexed', { id: spec.id, name: spec.name });
  }

  /**
   * Build search tokens from a specification
   */
  private buildSearchTokens(spec: ToolSpecification): string[] {
    const tokens = new Set<string>();

    // Add name tokens
    const nameParts = spec.name.toLowerCase().split(/[_\-\s]+/);
    for (const part of nameParts) {
      tokens.add(part);
    }

    // Add description tokens
    const descTokens = spec.description.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);
    for (const token of descTokens) {
      tokens.add(token);
    }

    // Add execution type
    tokens.add(spec.executionType.toLowerCase());

    // Add capabilities
    for (const cap of spec.requiredCapabilities) {
      tokens.add(cap.toLowerCase());
    }

    // Add template ID if present
    if (spec.templateId) {
      tokens.add(spec.templateId.toLowerCase());
    }

    return Array.from(tokens);
  }

  /**
   * Re-index a tool (after update)
   */
  reindexTool(spec: ToolSpecification, state: DynamicToolState): void {
    // Remove old name index if name changed
    const existing = this.index.get(spec.id);
    if (existing && existing.spec.name !== spec.name) {
      this.nameIndex.delete(existing.spec.name.toLowerCase());
    }

    this.indexTool(spec, state);
  }

  /**
   * Remove a tool from the index
   */
  removeTool(id: string): boolean {
    const entry = this.index.get(id);
    if (!entry) return false;

    this.index.delete(id);
    this.nameIndex.delete(entry.spec.name.toLowerCase());

    // Remove from session index
    const sessionId = entry.spec.createdBy.sessionId;
    this.sessionIndex.get(sessionId)?.delete(id);

    logger.debug('Tool removed from index', { id });
    return true;
  }

  /**
   * Search the index
   */
  search(query: string, limit = 10): IndexSearchMatch[] {
    const queryTokens = query.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 0);

    if (queryTokens.length === 0) {
      return [];
    }

    const results: Array<{ entry: IndexedTool; score: number }> = [];

    for (const entry of this.index.values()) {
      // Skip inactive tools
      if (entry.state.status !== 'active') continue;

      let score = 0;

      // Name match (highest weight)
      const nameLower = entry.spec.name.toLowerCase();
      for (const token of queryTokens) {
        if (nameLower.includes(token)) {
          score += 10;
          if (nameLower === token) score += 5; // Exact match bonus
        }
      }

      // Token match
      for (const token of queryTokens) {
        for (const searchToken of entry.searchTokens) {
          if (searchToken.includes(token)) {
            score += 2;
            if (searchToken === token) score += 1; // Exact match bonus
          }
        }
      }

      if (score > 0) {
        results.push({ entry, score });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit).map(({ entry, score }) => ({
      id: entry.spec.id,
      name: entry.spec.name,
      description: entry.spec.description,
      score,
      isDynamic: true,
    }));
  }

  /**
   * Get tool by ID
   */
  getTool(id: string): IndexedTool | undefined {
    return this.index.get(id);
  }

  /**
   * Get tool by name
   */
  getToolByName(name: string): IndexedTool | undefined {
    const id = this.nameIndex.get(name.toLowerCase());
    return id ? this.index.get(id) : undefined;
  }

  /**
   * Check if a tool exists
   */
  hasTool(idOrName: string): boolean {
    return this.index.has(idOrName) || this.nameIndex.has(idOrName.toLowerCase());
  }

  /**
   * Get all tools for a session
   */
  getSessionTools(sessionId: string): IndexedTool[] {
    const toolIds = this.sessionIndex.get(sessionId);
    if (!toolIds) return [];

    const tools: IndexedTool[] = [];
    for (const id of toolIds) {
      const entry = this.index.get(id);
      if (entry) tools.push(entry);
    }
    return tools;
  }

  /**
   * Get all active tools
   */
  getAllActive(): IndexedTool[] {
    return Array.from(this.index.values()).filter(
      entry => entry.state.status === 'active'
    );
  }

  /**
   * Get tool count
   */
  getCount(): number {
    return this.index.size;
  }

  /**
   * Clear session tools
   */
  clearSession(sessionId: string): number {
    const toolIds = this.sessionIndex.get(sessionId);
    if (!toolIds) return 0;

    let count = 0;
    for (const id of toolIds) {
      if (this.removeTool(id)) count++;
    }

    this.sessionIndex.delete(sessionId);
    return count;
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.index.clear();
    this.nameIndex.clear();
    this.sessionIndex.clear();
    logger.info('Dynamic tool index cleared');
  }

  /**
   * Get index stats
   */
  getStats(): {
    totalTools: number;
    activeTools: number;
    sessions: number;
    avgTokensPerTool: number;
  } {
    let activeCount = 0;
    let totalTokens = 0;

    for (const entry of this.index.values()) {
      if (entry.state.status === 'active') activeCount++;
      totalTokens += entry.searchTokens.length;
    }

    return {
      totalTools: this.index.size,
      activeTools: activeCount,
      sessions: this.sessionIndex.size,
      avgTokensPerTool: this.index.size > 0 ? Math.round(totalTokens / this.index.size) : 0,
    };
  }
}

// Singleton instance
let indexerInstance: DynamicToolIndexer | null = null;

/**
 * Get or create the dynamic tool indexer singleton
 */
export function getDynamicToolIndexer(): DynamicToolIndexer {
  if (!indexerInstance) {
    indexerInstance = new DynamicToolIndexer();
  }
  return indexerInstance;
}
