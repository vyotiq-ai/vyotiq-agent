/**
 * Diagnostics Collector
 *
 * Collects and manages diagnostics (errors, warnings) for agents,
 * providing aggregated views and change notifications.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Logger } from '../../logger';

// =============================================================================
// Types
// =============================================================================

export interface Diagnostic {
  id: string;
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  source?: string;
  code?: string | number;
  relatedInfo?: Array<{
    filePath: string;
    line: number;
    column: number;
    message: string;
  }>;
}

export interface DiagnosticSet {
  filePath: string;
  diagnostics: Diagnostic[];
  updatedAt: number;
}

export interface DiagnosticsSubscription {
  id: string;
  agentId: string;
  filePaths?: string[];
  severities?: Diagnostic['severity'][];
  callback: (diagnostics: Diagnostic[], filePath: string) => void;
}

export interface DiagnosticsCollectorConfig {
  maxDiagnosticsPerFile: number;
  maxTotalDiagnostics: number;
  retentionMs: number;
  aggregationDelayMs: number;
}

export const DEFAULT_DIAGNOSTICS_COLLECTOR_CONFIG: DiagnosticsCollectorConfig = {
  maxDiagnosticsPerFile: 100,
  maxTotalDiagnostics: 1000,
  retentionMs: 3600000, // 1 hour
  aggregationDelayMs: 100,
};

// =============================================================================
// DiagnosticsCollector
// =============================================================================

export class DiagnosticsCollector extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: DiagnosticsCollectorConfig;
  private readonly diagnosticSets = new Map<string, DiagnosticSet>(); // filePath -> set
  private readonly subscriptions = new Map<string, DiagnosticsSubscription>();
  private readonly pendingUpdates = new Map<string, NodeJS.Timeout>();
  private totalDiagnosticCount = 0;

  constructor(logger: Logger, config: Partial<DiagnosticsCollectorConfig> = {}) {
    super();
    this.logger = logger;
    this.config = { ...DEFAULT_DIAGNOSTICS_COLLECTOR_CONFIG, ...config };
  }

  /**
   * Set diagnostics for a file
   */
  setDiagnostics(filePath: string, diagnostics: Omit<Diagnostic, 'id'>[]): void {
    // Assign IDs and limit count
    const limitedDiagnostics = diagnostics
      .slice(0, this.config.maxDiagnosticsPerFile)
      .map(d => ({ ...d, id: randomUUID() }));

    // Update total count
    const existingSet = this.diagnosticSets.get(filePath);
    if (existingSet) {
      this.totalDiagnosticCount -= existingSet.diagnostics.length;
    }
    this.totalDiagnosticCount += limitedDiagnostics.length;

    // Check total limit
    if (this.totalDiagnosticCount > this.config.maxTotalDiagnostics) {
      this.pruneOldDiagnostics();
    }

    // Store
    this.diagnosticSets.set(filePath, {
      filePath,
      diagnostics: limitedDiagnostics,
      updatedAt: Date.now(),
    });

    // Schedule notification
    this.scheduleNotification(filePath);
  }

  /**
   * Add diagnostics to a file (append)
   */
  addDiagnostics(filePath: string, diagnostics: Omit<Diagnostic, 'id'>[]): void {
    const existing = this.diagnosticSets.get(filePath);
    const existingDiagnostics = existing?.diagnostics || [];

    const newDiagnostics = diagnostics.map(d => ({ ...d, id: randomUUID() }));
    const combined = [...existingDiagnostics, ...newDiagnostics]
      .slice(0, this.config.maxDiagnosticsPerFile);

    this.setDiagnostics(filePath, combined);
  }

  /**
   * Clear diagnostics for a file
   */
  clearDiagnostics(filePath: string): void {
    const existing = this.diagnosticSets.get(filePath);
    if (existing) {
      this.totalDiagnosticCount -= existing.diagnostics.length;
      this.diagnosticSets.delete(filePath);
      this.scheduleNotification(filePath);
    }
  }

  /**
   * Get diagnostics for a file
   */
  getDiagnostics(filePath: string): Diagnostic[] {
    return this.diagnosticSets.get(filePath)?.diagnostics || [];
  }

  /**
   * Get diagnostics for multiple files
   */
  getDiagnosticsForFiles(filePaths: string[]): Map<string, Diagnostic[]> {
    const result = new Map<string, Diagnostic[]>();
    for (const filePath of filePaths) {
      result.set(filePath, this.getDiagnostics(filePath));
    }
    return result;
  }

  /**
   * Get all diagnostics
   */
  getAllDiagnostics(): Map<string, Diagnostic[]> {
    const result = new Map<string, Diagnostic[]>();
    for (const [filePath, set] of this.diagnosticSets) {
      result.set(filePath, set.diagnostics);
    }
    return result;
  }

  /**
   * Get diagnostics by severity
   */
  getDiagnosticsBySeverity(severity: Diagnostic['severity']): Diagnostic[] {
    const result: Diagnostic[] = [];
    for (const set of this.diagnosticSets.values()) {
      result.push(...set.diagnostics.filter(d => d.severity === severity));
    }
    return result;
  }

  /**
   * Get error count
   */
  getErrorCount(): number {
    return this.getDiagnosticsBySeverity('error').length;
  }

  /**
   * Get warning count
   */
  getWarningCount(): number {
    return this.getDiagnosticsBySeverity('warning').length;
  }

  /**
   * Subscribe to diagnostic changes
   */
  subscribe(
    agentId: string,
    callback: (diagnostics: Diagnostic[], filePath: string) => void,
    options: { filePaths?: string[]; severities?: Diagnostic['severity'][] } = {}
  ): string {
    const subscription: DiagnosticsSubscription = {
      id: randomUUID(),
      agentId,
      filePaths: options.filePaths,
      severities: options.severities,
      callback,
    };

    this.subscriptions.set(subscription.id, subscription);
    return subscription.id;
  }

  /**
   * Unsubscribe from diagnostic changes
   */
  unsubscribe(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }

  /**
   * Get files with errors
   */
  getFilesWithErrors(): string[] {
    const files: string[] = [];
    for (const [filePath, set] of this.diagnosticSets) {
      if (set.diagnostics.some(d => d.severity === 'error')) {
        files.push(filePath);
      }
    }
    return files;
  }

  /**
   * Search diagnostics by message
   */
  searchDiagnostics(pattern: RegExp): Diagnostic[] {
    const results: Diagnostic[] = [];
    for (const set of this.diagnosticSets.values()) {
      results.push(...set.diagnostics.filter(d => pattern.test(d.message)));
    }
    return results;
  }

  /**
   * Get statistics
   */
  getStats(): DiagnosticsCollectorStats {
    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;
    let hintCount = 0;

    for (const set of this.diagnosticSets.values()) {
      for (const d of set.diagnostics) {
        switch (d.severity) {
          case 'error':
            errorCount++;
            break;
          case 'warning':
            warningCount++;
            break;
          case 'info':
            infoCount++;
            break;
          case 'hint':
            hintCount++;
            break;
        }
      }
    }

    return {
      totalDiagnostics: this.totalDiagnosticCount,
      fileCount: this.diagnosticSets.size,
      errorCount,
      warningCount,
      infoCount,
      hintCount,
      subscriptionCount: this.subscriptions.size,
    };
  }

  /**
   * Clear all diagnostics
   */
  clearAll(): void {
    this.diagnosticSets.clear();
    this.totalDiagnosticCount = 0;

    // Cancel pending updates
    for (const timeout of this.pendingUpdates.values()) {
      clearTimeout(timeout);
    }
    this.pendingUpdates.clear();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private scheduleNotification(filePath: string): void {
    // Cancel existing pending notification
    const existing = this.pendingUpdates.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    // Schedule new notification
    const timeout = setTimeout(() => {
      this.pendingUpdates.delete(filePath);
      this.notifySubscribers(filePath);
    }, this.config.aggregationDelayMs);

    this.pendingUpdates.set(filePath, timeout);
  }

  private notifySubscribers(filePath: string): void {
    const diagnostics = this.getDiagnostics(filePath);

    for (const subscription of this.subscriptions.values()) {
      // Check file filter
      if (subscription.filePaths && !subscription.filePaths.includes(filePath)) {
        continue;
      }

      // Filter by severity if specified
      let filteredDiagnostics = diagnostics;
      if (subscription.severities) {
        filteredDiagnostics = diagnostics.filter(d =>
          subscription.severities!.includes(d.severity)
        );
      }

      try {
        subscription.callback(filteredDiagnostics, filePath);
      } catch (error) {
        this.logger.error('Subscription callback error', {
          subscriptionId: subscription.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Emit global event
    this.emit('diagnostics', { filePath, diagnostics });
  }

  private pruneOldDiagnostics(): void {
    const now = Date.now();
    const toRemove: string[] = [];

    // Find oldest sets
    const sortedSets = Array.from(this.diagnosticSets.entries())
      .sort((a, b) => a[1].updatedAt - b[1].updatedAt);

    for (const [filePath, set] of sortedSets) {
      if (now - set.updatedAt > this.config.retentionMs) {
        toRemove.push(filePath);
      }

      // Stop if we're under the limit
      if (this.totalDiagnosticCount - toRemove.reduce((sum, fp) => {
        const s = this.diagnosticSets.get(fp);
        return sum + (s?.diagnostics.length || 0);
      }, 0) <= this.config.maxTotalDiagnostics * 0.8) {
        break;
      }
    }

    for (const filePath of toRemove) {
      this.clearDiagnostics(filePath);
    }
  }
}

// =============================================================================
// Types
// =============================================================================

interface DiagnosticsCollectorStats {
  totalDiagnostics: number;
  fileCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  hintCount: number;
  subscriptionCount: number;
}
