/**
 * Change Aggregator
 *
 * Aggregates file changes,
 * providing summaries and change tracking.
 */

import { EventEmitter } from 'node:events';
import type { Logger } from '../../logger';

// =============================================================================
// Types
// =============================================================================

export type ChangeType = 'create' | 'modify' | 'delete' | 'rename';

export interface FileChange {
  id: string;
  filePath: string;
  agentId: string;
  changeType: ChangeType;
  timestamp: number;
  details: ChangeDetails;
  sessionId?: string;
  taskId?: string;
}

export interface ChangeDetails {
  linesAdded?: number;
  linesRemoved?: number;
  bytesChanged?: number;
  previousPath?: string;
  contentBefore?: string;
  contentAfter?: string;
  diff?: string;
}

export interface FileChangeSummary {
  filePath: string;
  totalChanges: number;
  agents: string[];
  firstChange: number;
  lastChange: number;
  netLinesAdded: number;
  netLinesRemoved: number;
  changeTypes: ChangeType[];
}

export interface AgentChangeSummary {
  agentId: string;
  totalChanges: number;
  filesModified: number;
  linesAdded: number;
  linesRemoved: number;
  changesByType: Record<ChangeType, number>;
}

export interface SessionChangeSummary {
  sessionId: string;
  totalChanges: number;
  filesModified: number;
  agentsInvolved: number;
  linesAdded: number;
  linesRemoved: number;
  duration: number;
  changesByType: Record<ChangeType, number>;
}

export interface ChangeAggregatorConfig {
  maxChanges: number;
  maxChangesPerFile: number;
  retentionMs: number;
  captureContent: boolean;
  captureDiff: boolean;
}

export const DEFAULT_CHANGE_AGGREGATOR_CONFIG: ChangeAggregatorConfig = {
  maxChanges: 10000,
  maxChangesPerFile: 500,
  retentionMs: 86400000, // 24 hours
  captureContent: false,
  captureDiff: true,
};

// =============================================================================
// ChangeAggregator
// =============================================================================

export class ChangeAggregator extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: ChangeAggregatorConfig;
  private readonly changes: FileChange[] = [];
  private readonly changesByFile = new Map<string, FileChange[]>();
  private readonly changesByAgent = new Map<string, FileChange[]>();
  private readonly changesBySession = new Map<string, FileChange[]>();
  private changeIdCounter = 0;

  constructor(logger: Logger, config: Partial<ChangeAggregatorConfig> = {}) {
    super();
    this.logger = logger;
    this.config = { ...DEFAULT_CHANGE_AGGREGATOR_CONFIG, ...config };
  }

  /**
   * Record a file change
   */
  recordChange(
    agentId: string,
    filePath: string,
    changeType: ChangeType,
    details: Partial<ChangeDetails> = {},
    options: { sessionId?: string; taskId?: string } = {}
  ): string {
    const normalizedPath = this.normalizePath(filePath);
    const changeId = `change-${++this.changeIdCounter}`;

    const change: FileChange = {
      id: changeId,
      filePath: normalizedPath,
      agentId,
      changeType,
      timestamp: Date.now(),
      details: {
        linesAdded: details.linesAdded || 0,
        linesRemoved: details.linesRemoved || 0,
        bytesChanged: details.bytesChanged,
        previousPath: details.previousPath,
        contentBefore: this.config.captureContent ? details.contentBefore : undefined,
        contentAfter: this.config.captureContent ? details.contentAfter : undefined,
        diff: this.config.captureDiff ? details.diff : undefined,
      },
      sessionId: options.sessionId,
      taskId: options.taskId,
    };

    // Add to main list
    this.changes.push(change);

    // Index by file
    let fileChanges = this.changesByFile.get(normalizedPath);
    if (!fileChanges) {
      fileChanges = [];
      this.changesByFile.set(normalizedPath, fileChanges);
    }
    fileChanges.push(change);

    // Index by agent
    let agentChanges = this.changesByAgent.get(agentId);
    if (!agentChanges) {
      agentChanges = [];
      this.changesByAgent.set(agentId, agentChanges);
    }
    agentChanges.push(change);

    // Index by session
    if (options.sessionId) {
      let sessionChanges = this.changesBySession.get(options.sessionId);
      if (!sessionChanges) {
        sessionChanges = [];
        this.changesBySession.set(options.sessionId, sessionChanges);
      }
      sessionChanges.push(change);
    }

    // Prune old entries
    this.pruneOldChanges();

    this.emit('change-recorded', { change });
    return changeId;
  }

  /**
   * Get changes for a file
   */
  getFileChanges(filePath: string, limit?: number): FileChange[] {
    const normalizedPath = this.normalizePath(filePath);
    const changes = this.changesByFile.get(normalizedPath) || [];

    if (limit) {
      return changes.slice(-limit);
    }
    return [...changes];
  }

  /**
   * Get changes by an agent
   */
  getAgentChanges(agentId: string, limit?: number): FileChange[] {
    const changes = this.changesByAgent.get(agentId) || [];

    if (limit) {
      return changes.slice(-limit);
    }
    return [...changes];
  }

  /**
   * Get changes in a session
   */
  getSessionChanges(sessionId: string, limit?: number): FileChange[] {
    const changes = this.changesBySession.get(sessionId) || [];

    if (limit) {
      return changes.slice(-limit);
    }
    return [...changes];
  }

  /**
   * Get all changes
   */
  getAllChanges(limit?: number): FileChange[] {
    if (limit) {
      return this.changes.slice(-limit);
    }
    return [...this.changes];
  }

  /**
   * Get changes in a time range
   */
  getChangesInRange(startTime: number, endTime: number): FileChange[] {
    return this.changes.filter(
      c => c.timestamp >= startTime && c.timestamp <= endTime
    );
  }

  /**
   * Get summary for a file
   */
  getFileSummary(filePath: string): FileChangeSummary | null {
    const normalizedPath = this.normalizePath(filePath);
    const changes = this.changesByFile.get(normalizedPath);

    if (!changes || changes.length === 0) return null;

    const agents = new Set<string>();
    const changeTypes = new Set<ChangeType>();
    let netLinesAdded = 0;
    let netLinesRemoved = 0;

    for (const change of changes) {
      agents.add(change.agentId);
      changeTypes.add(change.changeType);
      netLinesAdded += change.details.linesAdded || 0;
      netLinesRemoved += change.details.linesRemoved || 0;
    }

    return {
      filePath: normalizedPath,
      totalChanges: changes.length,
      agents: Array.from(agents),
      firstChange: changes[0].timestamp,
      lastChange: changes[changes.length - 1].timestamp,
      netLinesAdded,
      netLinesRemoved,
      changeTypes: Array.from(changeTypes),
    };
  }

  /**
   * Get summary for an agent
   */
  getAgentSummary(agentId: string): AgentChangeSummary | null {
    const changes = this.changesByAgent.get(agentId);

    if (!changes || changes.length === 0) return null;

    const files = new Set<string>();
    const changesByType: Record<string, number> = {};
    let linesAdded = 0;
    let linesRemoved = 0;

    for (const change of changes) {
      files.add(change.filePath);
      changesByType[change.changeType] = (changesByType[change.changeType] || 0) + 1;
      linesAdded += change.details.linesAdded || 0;
      linesRemoved += change.details.linesRemoved || 0;
    }

    return {
      agentId,
      totalChanges: changes.length,
      filesModified: files.size,
      linesAdded,
      linesRemoved,
      changesByType: changesByType as Record<ChangeType, number>,
    };
  }

  /**
   * Get summary for a session
   */
  getSessionSummary(sessionId: string): SessionChangeSummary | null {
    const changes = this.changesBySession.get(sessionId);

    if (!changes || changes.length === 0) return null;

    const files = new Set<string>();
    const agents = new Set<string>();
    const changesByType: Record<string, number> = {};
    let linesAdded = 0;
    let linesRemoved = 0;

    for (const change of changes) {
      files.add(change.filePath);
      agents.add(change.agentId);
      changesByType[change.changeType] = (changesByType[change.changeType] || 0) + 1;
      linesAdded += change.details.linesAdded || 0;
      linesRemoved += change.details.linesRemoved || 0;
    }

    const firstChange = changes[0].timestamp;
    const lastChange = changes[changes.length - 1].timestamp;

    return {
      sessionId,
      totalChanges: changes.length,
      filesModified: files.size,
      agentsInvolved: agents.size,
      linesAdded,
      linesRemoved,
      duration: lastChange - firstChange,
      changesByType: changesByType as Record<ChangeType, number>,
    };
  }

  /**
   * Summarize all changes
   */
  summarizeChanges(): {
    totalChanges: number;
    uniqueFiles: number;
    uniqueAgents: number;
    linesAdded: number;
    linesRemoved: number;
    changesByType: Record<ChangeType, number>;
    recentChanges: FileChange[];
  } {
    const files = new Set<string>();
    const agents = new Set<string>();
    const changesByType: Record<string, number> = {};
    let linesAdded = 0;
    let linesRemoved = 0;

    for (const change of this.changes) {
      files.add(change.filePath);
      agents.add(change.agentId);
      changesByType[change.changeType] = (changesByType[change.changeType] || 0) + 1;
      linesAdded += change.details.linesAdded || 0;
      linesRemoved += change.details.linesRemoved || 0;
    }

    return {
      totalChanges: this.changes.length,
      uniqueFiles: files.size,
      uniqueAgents: agents.size,
      linesAdded,
      linesRemoved,
      changesByType: changesByType as Record<ChangeType, number>,
      recentChanges: this.changes.slice(-10),
    };
  }

  /**
   * Get files modified by different sessions
   */
  getMultiSessionFiles(): Array<{ filePath: string; agents: string[]; changeCount: number }> {
    const result: Array<{ filePath: string; agents: string[]; changeCount: number }> = [];

    for (const [filePath, changes] of this.changesByFile) {
      const agents = new Set<string>();
      for (const change of changes) {
        agents.add(change.agentId);
      }

      if (agents.size > 1) {
        result.push({
          filePath,
          agents: Array.from(agents),
          changeCount: changes.length,
        });
      }
    }

    return result.sort((a, b) => b.agents.length - a.agents.length);
  }

  /**
   * Get change timeline
   */
  getTimeline(
    options: {
      startTime?: number;
      endTime?: number;
      agentId?: string;
      filePath?: string;
      limit?: number;
    } = {}
  ): FileChange[] {
    let filtered = this.changes;

    if (options.startTime) {
      filtered = filtered.filter(c => c.timestamp >= options.startTime!);
    }

    if (options.endTime) {
      filtered = filtered.filter(c => c.timestamp <= options.endTime!);
    }

    if (options.agentId) {
      filtered = filtered.filter(c => c.agentId === options.agentId);
    }

    if (options.filePath) {
      const normalizedPath = this.normalizePath(options.filePath);
      filtered = filtered.filter(c => c.filePath === normalizedPath);
    }

    filtered = filtered.sort((a, b) => a.timestamp - b.timestamp);

    if (options.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  /**
   * Clear changes for a file
   */
  clearFileChanges(filePath: string): number {
    const normalizedPath = this.normalizePath(filePath);
    const fileChanges = this.changesByFile.get(normalizedPath) || [];
    const count = fileChanges.length;

    // Remove from main list
    for (let i = this.changes.length - 1; i >= 0; i--) {
      if (this.changes[i].filePath === normalizedPath) {
        this.changes.splice(i, 1);
      }
    }

    // Remove from agent indexes
    for (const [_agentId, agentChanges] of this.changesByAgent) {
      for (let i = agentChanges.length - 1; i >= 0; i--) {
        if (agentChanges[i].filePath === normalizedPath) {
          agentChanges.splice(i, 1);
        }
      }
    }

    // Remove from session indexes
    for (const [_sessionId, sessionChanges] of this.changesBySession) {
      for (let i = sessionChanges.length - 1; i >= 0; i--) {
        if (sessionChanges[i].filePath === normalizedPath) {
          sessionChanges.splice(i, 1);
        }
      }
    }

    this.changesByFile.delete(normalizedPath);
    return count;
  }

  /**
   * Clear all changes
   */
  clearAllChanges(): void {
    this.changes.length = 0;
    this.changesByFile.clear();
    this.changesByAgent.clear();
    this.changesBySession.clear();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private normalizePath(filePath: string): string {
    return filePath.toLowerCase().replace(/\\/g, '/');
  }

  private pruneOldChanges(): void {
    const now = Date.now();
    const cutoff = now - this.config.retentionMs;

    // Prune from main list
    while (this.changes.length > 0 && this.changes[0].timestamp < cutoff) {
      const removed = this.changes.shift()!;
      this.removeFromIndexes(removed);
    }

    // Enforce max limit
    while (this.changes.length > this.config.maxChanges) {
      const removed = this.changes.shift()!;
      this.removeFromIndexes(removed);
    }

    // Enforce per-file limit
    for (const [_filePath, fileChanges] of this.changesByFile) {
      while (fileChanges.length > this.config.maxChangesPerFile) {
        fileChanges.shift();
      }
    }
  }

  private removeFromIndexes(change: FileChange): void {
    // Remove from file index
    const fileChanges = this.changesByFile.get(change.filePath);
    if (fileChanges) {
      const idx = fileChanges.findIndex(c => c.id === change.id);
      if (idx !== -1) fileChanges.splice(idx, 1);
    }

    // Remove from agent index
    const agentChanges = this.changesByAgent.get(change.agentId);
    if (agentChanges) {
      const idx = agentChanges.findIndex(c => c.id === change.id);
      if (idx !== -1) agentChanges.splice(idx, 1);
    }

    // Remove from session index
    if (change.sessionId) {
      const sessionChanges = this.changesBySession.get(change.sessionId);
      if (sessionChanges) {
        const idx = sessionChanges.findIndex(c => c.id === change.id);
        if (idx !== -1) sessionChanges.splice(idx, 1);
      }
    }
  }
}
