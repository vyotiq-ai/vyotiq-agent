/**
 * Memory System Types
 * 
 * Type definitions for the agent memory system.
 */

/** Memory entry categories for organization */
export type MemoryCategory = 
  | 'decision'      // Architectural/design decisions
  | 'context'       // Project context and background
  | 'preference'    // User preferences and patterns
  | 'fact'          // Facts about the codebase
  | 'task'          // Task-related notes
  | 'error'         // Error patterns and solutions
  | 'general';      // General notes

/** Memory importance levels for retrieval prioritization */
export type MemoryImportance = 'low' | 'medium' | 'high' | 'critical';

/** A single memory entry */
export interface MemoryEntry {
  id: string;
  /** The memory content */
  content: string;
  /** Category for organization */
  category: MemoryCategory;
  /** Importance level */
  importance: MemoryImportance;
  /** Keywords for search */
  keywords: string[];
  /** Workspace ID this memory belongs to */
  workspaceId: string;
  /** Session ID where memory was created (optional) */
  sessionId?: string;
  /** When the memory was created */
  createdAt: number;
  /** When the memory was last accessed */
  lastAccessedAt: number;
  /** Number of times this memory was retrieved */
  accessCount: number;
  /** Whether this memory is pinned (always included) */
  isPinned: boolean;
  /** Source of the memory (agent or user) */
  source: 'agent' | 'user';
}

/** Options for creating a memory */
export interface CreateMemoryOptions {
  content: string;
  category?: MemoryCategory;
  importance?: MemoryImportance;
  keywords?: string[];
  workspaceId: string;
  sessionId?: string;
  source?: 'agent' | 'user';
  isPinned?: boolean;
}

/** Options for searching memories */
export interface SearchMemoryOptions {
  workspaceId: string;
  query?: string;
  category?: MemoryCategory;
  importance?: MemoryImportance;
  limit?: number;
  includePinned?: boolean;
}

/** Result of a memory search */
export interface MemorySearchResult {
  memories: MemoryEntry[];
  totalCount: number;
}

/** Memory statistics */
export interface MemoryStats {
  totalMemories: number;
  byCategory: Record<MemoryCategory, number>;
  byImportance: Record<MemoryImportance, number>;
  pinnedCount: number;
}
