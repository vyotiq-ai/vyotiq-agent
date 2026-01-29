/**
 * File Access Tracker
 *
 * Tracks file access, supporting
 * per-agent tracking, inheritance, and validation.
 */

import { EventEmitter } from 'node:events';
import type { Logger } from '../../logger';

// =============================================================================
// Types
// =============================================================================

export interface FileAccess {
  filePath: string;
  agentId: string;
  accessType: 'read' | 'write' | 'delete';
  timestamp: number;
  version?: number;
  contentHash?: string;
}

export interface AgentFileHistory {
  agentId: string;
  parentAgentId?: string;
  reads: Map<string, FileAccess>;
  writes: Map<string, FileAccess>;
  inheritedReads: Set<string>;
}

export type TrackingMode = 'isolated' | 'inherited' | 'shared';

export interface FileAccessTrackerConfig {
  trackingMode: TrackingMode;
  maxAgeMs: number;
  validateReadBeforeWrite: boolean;
  inheritParentReads: boolean;
  maxFilesPerAgent: number;
}

export const DEFAULT_FILE_ACCESS_TRACKER_CONFIG: FileAccessTrackerConfig = {
  trackingMode: 'inherited',
  maxAgeMs: 3600000, // 1 hour
  validateReadBeforeWrite: true,
  inheritParentReads: true,
  maxFilesPerAgent: 1000,
};

// =============================================================================
// FileAccessTracker
// =============================================================================

export class FileAccessTracker extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: FileAccessTrackerConfig;
  private readonly agentHistories = new Map<string, AgentFileHistory>();
  private readonly globalReads = new Map<string, FileAccess>();
  private readonly globalWrites = new Map<string, FileAccess>();

  constructor(logger: Logger, config: Partial<FileAccessTrackerConfig> = {}) {
    super();
    this.logger = logger;
    this.config = { ...DEFAULT_FILE_ACCESS_TRACKER_CONFIG, ...config };
  }

  /**
   * Register an agent for tracking
   */
  registerAgent(agentId: string, parentAgentId?: string): void {
    if (this.agentHistories.has(agentId)) {
      return;
    }

    const history: AgentFileHistory = {
      agentId,
      parentAgentId,
      reads: new Map(),
      writes: new Map(),
      inheritedReads: new Set(),
    };

    // Inherit parent reads if configured
    if (this.config.inheritParentReads && parentAgentId) {
      this.inheritFromParent(history, parentAgentId);
    }

    this.agentHistories.set(agentId, history);
    this.logger.debug('Agent registered for file tracking', { agentId, parentAgentId });
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    this.agentHistories.delete(agentId);
    this.logger.debug('Agent unregistered from file tracking', { agentId });
  }

  /**
   * Mark a file as read by an agent
   */
  markRead(agentId: string, filePath: string, contentHash?: string): void {
    const normalizedPath = this.normalizePath(filePath);
    const access: FileAccess = {
      filePath: normalizedPath,
      agentId,
      accessType: 'read',
      timestamp: Date.now(),
      contentHash,
    };

    // Update agent history
    const history = this.getOrCreateHistory(agentId);
    history.reads.set(normalizedPath, access);

    // Update global tracking for shared mode
    if (this.config.trackingMode === 'shared') {
      this.globalReads.set(normalizedPath, access);
    }

    this.pruneOldEntries(history);
    this.emit('file-read', { agentId, filePath: normalizedPath });
  }

  /**
   * Mark a file as written by an agent
   */
  markWrite(agentId: string, filePath: string, contentHash?: string): void {
    const normalizedPath = this.normalizePath(filePath);
    const access: FileAccess = {
      filePath: normalizedPath,
      agentId,
      accessType: 'write',
      timestamp: Date.now(),
      contentHash,
    };

    // Update agent history
    const history = this.getOrCreateHistory(agentId);
    history.writes.set(normalizedPath, access);

    // Update global tracking for shared mode
    if (this.config.trackingMode === 'shared') {
      this.globalWrites.set(normalizedPath, access);
    }

    this.emit('file-written', { agentId, filePath: normalizedPath });
  }

  /**
   * Check if a file was read by an agent
   */
  wasRead(agentId: string, filePath: string): boolean {
    const normalizedPath = this.normalizePath(filePath);

    switch (this.config.trackingMode) {
      case 'shared':
        return this.wasReadGlobally(normalizedPath);

      case 'inherited':
        return this.wasReadByAgentOrAncestors(agentId, normalizedPath);

      case 'isolated':
      default:
        return this.wasReadByAgent(agentId, normalizedPath);
    }
  }

  /**
   * Check if a file was written by an agent
   */
  wasWritten(agentId: string, filePath: string): boolean {
    const normalizedPath = this.normalizePath(filePath);
    const history = this.agentHistories.get(agentId);
    if (!history) return false;

    const access = history.writes.get(normalizedPath);
    if (!access) return false;

    return Date.now() - access.timestamp < this.config.maxAgeMs;
  }

  /**
   * Validate read-before-write rule
   */
  validateWriteAccess(agentId: string, filePath: string): { valid: boolean; reason?: string } {
    if (!this.config.validateReadBeforeWrite) {
      return { valid: true };
    }

    const normalizedPath = this.normalizePath(filePath);

    if (!this.wasRead(agentId, normalizedPath)) {
      return {
        valid: false,
        reason: `File ${filePath} must be read before writing`,
      };
    }

    return { valid: true };
  }

  /**
   * Get all files accessed by an agent
   */
  getAgentFiles(agentId: string): { reads: string[]; writes: string[] } {
    const history = this.agentHistories.get(agentId);
    if (!history) {
      return { reads: [], writes: [] };
    }

    const now = Date.now();
    const reads: string[] = [];
    const writes: string[] = [];

    for (const [path, access] of history.reads) {
      if (now - access.timestamp < this.config.maxAgeMs) {
        reads.push(path);
      }
    }

    for (const [path, access] of history.writes) {
      if (now - access.timestamp < this.config.maxAgeMs) {
        writes.push(path);
      }
    }

    // Include inherited reads
    for (const path of history.inheritedReads) {
      if (!reads.includes(path)) {
        reads.push(path);
      }
    }

    return { reads, writes };
  }

  /**
   * Get read time for a file
   */
  getReadTime(agentId: string, filePath: string): number | undefined {
    const normalizedPath = this.normalizePath(filePath);
    const history = this.agentHistories.get(agentId);
    return history?.reads.get(normalizedPath)?.timestamp;
  }

  /**
   * Get write time for a file
   */
  getWriteTime(agentId: string, filePath: string): number | undefined {
    const normalizedPath = this.normalizePath(filePath);
    const history = this.agentHistories.get(agentId);
    return history?.writes.get(normalizedPath)?.timestamp;
  }

  /**
   * Inherit reads from parent agent
   */
  inheritFromParent(childAgentId: string, parentAgentId: string): void;
  inheritFromParent(childHistory: AgentFileHistory, parentAgentId: string): void;
  inheritFromParent(
    childOrId: string | AgentFileHistory,
    parentAgentId: string
  ): void {
    const childHistory = typeof childOrId === 'string'
      ? this.agentHistories.get(childOrId)
      : childOrId;

    if (!childHistory) return;

    const parentHistory = this.agentHistories.get(parentAgentId);
    if (!parentHistory) return;

    // Copy parent reads to inherited set
    for (const path of parentHistory.reads.keys()) {
      childHistory.inheritedReads.add(path);
    }

    // Also inherit parent's inherited reads
    for (const path of parentHistory.inheritedReads) {
      childHistory.inheritedReads.add(path);
    }

    this.logger.debug('Inherited reads from parent', {
      childAgentId: childHistory.agentId,
      parentAgentId,
      inheritedCount: childHistory.inheritedReads.size,
    });
  }

  /**
   * Clear tracking for an agent
   */
  clearAgentTracking(agentId: string): void {
    const history = this.agentHistories.get(agentId);
    if (history) {
      history.reads.clear();
      history.writes.clear();
      history.inheritedReads.clear();
    }
  }

  /**
   * Clear all tracking
   */
  clearAllTracking(): void {
    this.agentHistories.clear();
    this.globalReads.clear();
    this.globalWrites.clear();
  }

  /**
   * Get tracking statistics
   */
  getStats(): {
    agentCount: number;
    totalReads: number;
    totalWrites: number;
    uniqueFilesRead: number;
    uniqueFilesWritten: number;
  } {
    const allReads = new Set<string>();
    const allWrites = new Set<string>();
    let totalReads = 0;
    let totalWrites = 0;

    for (const history of this.agentHistories.values()) {
      for (const path of history.reads.keys()) {
        allReads.add(path);
        totalReads++;
      }
      for (const path of history.writes.keys()) {
        allWrites.add(path);
        totalWrites++;
      }
    }

    return {
      agentCount: this.agentHistories.size,
      totalReads,
      totalWrites,
      uniqueFilesRead: allReads.size,
      uniqueFilesWritten: allWrites.size,
    };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private getOrCreateHistory(agentId: string): AgentFileHistory {
    let history = this.agentHistories.get(agentId);
    if (!history) {
      history = {
        agentId,
        reads: new Map(),
        writes: new Map(),
        inheritedReads: new Set(),
      };
      this.agentHistories.set(agentId, history);
    }
    return history;
  }

  private wasReadByAgent(agentId: string, filePath: string): boolean {
    const history = this.agentHistories.get(agentId);
    if (!history) return false;

    const access = history.reads.get(filePath);
    if (!access) return false;

    return Date.now() - access.timestamp < this.config.maxAgeMs;
  }

  private wasReadByAgentOrAncestors(agentId: string, filePath: string): boolean {
    const history = this.agentHistories.get(agentId);
    if (!history) return false;

    // Check direct reads
    if (this.wasReadByAgent(agentId, filePath)) {
      return true;
    }

    // Check inherited reads
    if (history.inheritedReads.has(filePath)) {
      return true;
    }

    // Check parent chain
    if (history.parentAgentId) {
      return this.wasReadByAgentOrAncestors(history.parentAgentId, filePath);
    }

    return false;
  }

  private wasReadGlobally(filePath: string): boolean {
    const access = this.globalReads.get(filePath);
    if (!access) return false;

    return Date.now() - access.timestamp < this.config.maxAgeMs;
  }

  private normalizePath(filePath: string): string {
    return filePath.toLowerCase().replace(/\\/g, '/');
  }

  private pruneOldEntries(history: AgentFileHistory): void {
    const now = Date.now();

    // Prune old reads
    for (const [path, access] of history.reads) {
      if (now - access.timestamp >= this.config.maxAgeMs) {
        history.reads.delete(path);
      }
    }

    // Prune old writes
    for (const [path, access] of history.writes) {
      if (now - access.timestamp >= this.config.maxAgeMs) {
        history.writes.delete(path);
      }
    }

    // Enforce max files limit
    if (history.reads.size > this.config.maxFilesPerAgent) {
      const entries = Array.from(history.reads.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);

      const toRemove = entries.slice(0, entries.length - this.config.maxFilesPerAgent);
      for (const [path] of toRemove) {
        history.reads.delete(path);
      }
    }
  }
}
