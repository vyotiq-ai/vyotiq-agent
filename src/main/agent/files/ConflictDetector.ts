/**
 * Conflict Detector
 *
 * Detects file conflicts,
 * identifying concurrent edits and suggesting resolutions.
 */

import { EventEmitter } from 'node:events';
import type { Logger } from '../../logger';

// =============================================================================
// Types
// =============================================================================

export type ConflictType =
  | 'concurrent-write'
  | 'overlapping-edit'
  | 'delete-vs-modify'
  | 'create-vs-create'
  | 'stale-read';

export type ConflictSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ResolutionStrategy =
  | 'first-wins'
  | 'last-wins'
  | 'merge'
  | 'manual'
  | 'abort';

export interface FileConflict {
  id: string;
  filePath: string;
  type: ConflictType;
  severity: ConflictSeverity;
  agents: ConflictingAgent[];
  detectedAt: number;
  resolved: boolean;
  resolvedAt?: number;
  resolution?: ConflictResolution;
  details: ConflictDetails;
}

export interface ConflictingAgent {
  agentId: string;
  operation: 'read' | 'write' | 'delete' | 'create';
  timestamp: number;
  contentHash?: string;
  lineRange?: { start: number; end: number };
}

export interface ConflictDetails {
  description: string;
  affectedLines?: { start: number; end: number }[];
  originalContent?: string;
  conflictingChanges?: Array<{
    agentId: string;
    content: string;
  }>;
}

export interface ConflictResolution {
  strategy: ResolutionStrategy;
  resolvedBy: string;
  resultingContent?: string;
  timestamp: number;
}

export interface PendingOperation {
  id: string;
  agentId: string;
  filePath: string;
  operation: 'write' | 'delete' | 'create';
  timestamp: number;
  contentHash?: string;
  lineRange?: { start: number; end: number };
  content?: string;
}

export interface ConflictDetectorConfig {
  maxPendingOperations: number;
  conflictWindowMs: number;
  autoResolveStrategy?: ResolutionStrategy;
  detectStaleReads: boolean;
  staleReadThresholdMs: number;
}

export const DEFAULT_CONFLICT_DETECTOR_CONFIG: ConflictDetectorConfig = {
  maxPendingOperations: 1000,
  conflictWindowMs: 5000,
  autoResolveStrategy: undefined,
  detectStaleReads: true,
  staleReadThresholdMs: 60000,
};

// =============================================================================
// ConflictDetector
// =============================================================================

export class ConflictDetector extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: ConflictDetectorConfig;
  private readonly conflicts = new Map<string, FileConflict>();
  private readonly pendingOperations = new Map<string, PendingOperation[]>();
  private readonly fileVersions = new Map<string, { hash: string; timestamp: number; agentId: string }>();
  private conflictIdCounter = 0;

  constructor(logger: Logger, config: Partial<ConflictDetectorConfig> = {}) {
    super();
    this.logger = logger;
    this.config = { ...DEFAULT_CONFLICT_DETECTOR_CONFIG, ...config };
  }

  /**
   * Check for conflicts before an operation
   */
  checkConflict(
    agentId: string,
    filePath: string,
    operation: 'write' | 'delete' | 'create',
    options: {
      contentHash?: string;
      lineRange?: { start: number; end: number };
      content?: string;
      lastReadTimestamp?: number;
    } = {}
  ): FileConflict | null {
    const normalizedPath = this.normalizePath(filePath);
    const pending = this.pendingOperations.get(normalizedPath) || [];
    const now = Date.now();

    // Check for stale read
    if (this.config.detectStaleReads && options.lastReadTimestamp) {
      const fileVersion = this.fileVersions.get(normalizedPath);
      if (fileVersion && fileVersion.timestamp > options.lastReadTimestamp) {
        return this.createConflict(normalizedPath, 'stale-read', 'high', [
          { agentId, operation, timestamp: now, contentHash: options.contentHash },
          { agentId: fileVersion.agentId, operation: 'write', timestamp: fileVersion.timestamp, contentHash: fileVersion.hash },
        ], {
          description: `File was modified by ${fileVersion.agentId} after ${agentId} read it`,
        });
      }
    }

    // Check for concurrent operations
    const recentPending = pending.filter(
      op => now - op.timestamp < this.config.conflictWindowMs && op.agentId !== agentId
    );

    if (recentPending.length === 0) {
      return null;
    }

    // Detect specific conflict types
    for (const pendingOp of recentPending) {
      const conflict = this.detectConflictType(
        normalizedPath,
        { agentId, operation, timestamp: now, ...options },
        pendingOp
      );

      if (conflict) {
        return conflict;
      }
    }

    return null;
  }

  /**
   * Register a pending operation
   */
  registerOperation(
    agentId: string,
    filePath: string,
    operation: 'write' | 'delete' | 'create',
    options: {
      contentHash?: string;
      lineRange?: { start: number; end: number };
      content?: string;
    } = {}
  ): string {
    const normalizedPath = this.normalizePath(filePath);
    const operationId = `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const pendingOp: PendingOperation = {
      id: operationId,
      agentId,
      filePath: normalizedPath,
      operation,
      timestamp: Date.now(),
      contentHash: options.contentHash,
      lineRange: options.lineRange,
      content: options.content,
    };

    let pending = this.pendingOperations.get(normalizedPath);
    if (!pending) {
      pending = [];
      this.pendingOperations.set(normalizedPath, pending);
    }

    pending.push(pendingOp);
    this.pruneOldOperations(normalizedPath);

    return operationId;
  }

  /**
   * Complete an operation (remove from pending)
   */
  completeOperation(operationId: string, contentHash?: string): void {
    for (const [filePath, pending] of this.pendingOperations) {
      const index = pending.findIndex(op => op.id === operationId);
      if (index !== -1) {
        const op = pending[index];
        pending.splice(index, 1);

        // Update file version
        if (op.operation === 'write' || op.operation === 'create') {
          this.fileVersions.set(filePath, {
            hash: contentHash || op.contentHash || '',
            timestamp: Date.now(),
            agentId: op.agentId,
          });
        } else if (op.operation === 'delete') {
          this.fileVersions.delete(filePath);
        }

        break;
      }
    }
  }

  /**
   * Get all active conflicts
   */
  getConflicts(): FileConflict[] {
    return Array.from(this.conflicts.values()).filter(c => !c.resolved);
  }

  /**
   * Get conflict by ID
   */
  getConflict(conflictId: string): FileConflict | undefined {
    return this.conflicts.get(conflictId);
  }

  /**
   * Get conflicts for a file
   */
  getFileConflicts(filePath: string): FileConflict[] {
    const normalizedPath = this.normalizePath(filePath);
    return Array.from(this.conflicts.values())
      .filter(c => c.filePath === normalizedPath && !c.resolved);
  }

  /**
   * Analyze a conflict and suggest resolutions
   */
  analyzeConflict(conflictId: string): {
    conflict: FileConflict;
    suggestedStrategies: ResolutionStrategy[];
    canAutoResolve: boolean;
  } | null {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) return null;

    const suggestedStrategies: ResolutionStrategy[] = [];
    let canAutoResolve = false;

    switch (conflict.type) {
      case 'concurrent-write':
        suggestedStrategies.push('last-wins', 'merge', 'manual');
        canAutoResolve = conflict.severity !== 'critical';
        break;

      case 'overlapping-edit':
        suggestedStrategies.push('merge', 'manual');
        canAutoResolve = false;
        break;

      case 'delete-vs-modify':
        suggestedStrategies.push('manual', 'abort');
        canAutoResolve = false;
        break;

      case 'create-vs-create':
        suggestedStrategies.push('first-wins', 'merge', 'manual');
        canAutoResolve = true;
        break;

      case 'stale-read':
        suggestedStrategies.push('abort', 'last-wins', 'manual');
        canAutoResolve = false;
        break;
    }

    return { conflict, suggestedStrategies, canAutoResolve };
  }

  /**
   * Suggest resolution for a conflict
   */
  suggestResolution(conflictId: string): ResolutionStrategy | null {
    const analysis = this.analyzeConflict(conflictId);
    if (!analysis) return null;

    // Return auto-resolve strategy if configured and applicable
    if (this.config.autoResolveStrategy && analysis.canAutoResolve) {
      return this.config.autoResolveStrategy;
    }

    // Return first suggested strategy
    return analysis.suggestedStrategies[0] || null;
  }

  /**
   * Resolve a conflict
   */
  resolveConflict(
    conflictId: string,
    strategy: ResolutionStrategy,
    resolvedBy: string,
    resultingContent?: string
  ): boolean {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict || conflict.resolved) return false;

    conflict.resolved = true;
    conflict.resolvedAt = Date.now();
    conflict.resolution = {
      strategy,
      resolvedBy,
      resultingContent,
      timestamp: Date.now(),
    };

    this.logger.info('Conflict resolved', {
      conflictId,
      strategy,
      resolvedBy,
      filePath: conflict.filePath,
    });

    this.emit('conflict-resolved', { conflict });
    return true;
  }

  /**
   * Clear resolved conflicts
   */
  clearResolvedConflicts(): number {
    let cleared = 0;
    for (const [id, conflict] of this.conflicts) {
      if (conflict.resolved) {
        this.conflicts.delete(id);
        cleared++;
      }
    }
    return cleared;
  }

  /**
   * Clear all conflicts
   */
  clearAllConflicts(): void {
    this.conflicts.clear();
    this.pendingOperations.clear();
  }

  /**
   * Get conflict statistics
   */
  getStats(): {
    totalConflicts: number;
    activeConflicts: number;
    resolvedConflicts: number;
    byType: Record<ConflictType, number>;
    bySeverity: Record<ConflictSeverity, number>;
  } {
    const conflicts = Array.from(this.conflicts.values());
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const conflict of conflicts) {
      byType[conflict.type] = (byType[conflict.type] || 0) + 1;
      bySeverity[conflict.severity] = (bySeverity[conflict.severity] || 0) + 1;
    }

    return {
      totalConflicts: conflicts.length,
      activeConflicts: conflicts.filter(c => !c.resolved).length,
      resolvedConflicts: conflicts.filter(c => c.resolved).length,
      byType: byType as Record<ConflictType, number>,
      bySeverity: bySeverity as Record<ConflictSeverity, number>,
    };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private detectConflictType(
    filePath: string,
    newOp: { agentId: string; operation: string; timestamp: number; contentHash?: string; lineRange?: { start: number; end: number } },
    existingOp: PendingOperation
  ): FileConflict | null {
    // Concurrent write
    if (newOp.operation === 'write' && existingOp.operation === 'write') {
      // Check for overlapping line ranges
      if (newOp.lineRange && existingOp.lineRange) {
        if (this.rangesOverlap(newOp.lineRange, existingOp.lineRange)) {
          return this.createConflict(filePath, 'overlapping-edit', 'high', [
            { agentId: newOp.agentId, operation: 'write', timestamp: newOp.timestamp, lineRange: newOp.lineRange },
            { agentId: existingOp.agentId, operation: 'write', timestamp: existingOp.timestamp, lineRange: existingOp.lineRange },
          ], {
            description: 'Overlapping edit regions detected',
            affectedLines: [newOp.lineRange, existingOp.lineRange],
          });
        }
      }

      return this.createConflict(filePath, 'concurrent-write', 'medium', [
        { agentId: newOp.agentId, operation: 'write', timestamp: newOp.timestamp, contentHash: newOp.contentHash },
        { agentId: existingOp.agentId, operation: 'write', timestamp: existingOp.timestamp, contentHash: existingOp.contentHash },
      ], {
        description: 'Agents attempting to write to the same file',
      });
    }

    // Delete vs modify
    if (
      (newOp.operation === 'delete' && existingOp.operation === 'write') ||
      (newOp.operation === 'write' && existingOp.operation === 'delete')
    ) {
      return this.createConflict(filePath, 'delete-vs-modify', 'critical', [
        { agentId: newOp.agentId, operation: newOp.operation as 'write' | 'delete', timestamp: newOp.timestamp },
        { agentId: existingOp.agentId, operation: existingOp.operation, timestamp: existingOp.timestamp },
      ], {
        description: 'One agent is deleting while another is modifying',
      });
    }

    // Create vs create
    if (newOp.operation === 'create' && existingOp.operation === 'create') {
      return this.createConflict(filePath, 'create-vs-create', 'medium', [
        { agentId: newOp.agentId, operation: 'create', timestamp: newOp.timestamp },
        { agentId: existingOp.agentId, operation: 'create', timestamp: existingOp.timestamp },
      ], {
        description: 'Agents attempting to create the same file',
      });
    }

    return null;
  }

  private createConflict(
    filePath: string,
    type: ConflictType,
    severity: ConflictSeverity,
    agents: ConflictingAgent[],
    details: ConflictDetails
  ): FileConflict {
    const conflict: FileConflict = {
      id: `conflict-${++this.conflictIdCounter}`,
      filePath,
      type,
      severity,
      agents,
      detectedAt: Date.now(),
      resolved: false,
      details,
    };

    this.conflicts.set(conflict.id, conflict);
    this.logger.warn('Conflict detected', {
      conflictId: conflict.id,
      type,
      severity,
      filePath,
      agents: agents.map(a => a.agentId),
    });

    this.emit('conflict-detected', { conflict });
    return conflict;
  }

  private rangesOverlap(
    range1: { start: number; end: number },
    range2: { start: number; end: number }
  ): boolean {
    return range1.start <= range2.end && range2.start <= range1.end;
  }

  private normalizePath(filePath: string): string {
    return filePath.toLowerCase().replace(/\\/g, '/');
  }

  private pruneOldOperations(filePath: string): void {
    const pending = this.pendingOperations.get(filePath);
    if (!pending) return;

    const now = Date.now();
    const filtered = pending.filter(
      op => now - op.timestamp < this.config.conflictWindowMs * 2
    );

    if (filtered.length !== pending.length) {
      this.pendingOperations.set(filePath, filtered);
    }

    // Enforce max limit
    if (filtered.length > this.config.maxPendingOperations) {
      filtered.splice(0, filtered.length - this.config.maxPendingOperations);
    }
  }
}
