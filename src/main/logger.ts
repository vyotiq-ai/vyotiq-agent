import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { serializeError } from '../shared/utils/errorHandling';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export { serializeError };

/** Detailed tool execution record */
export interface ToolExecutionRecord {
  id: string;
  timestamp: number;
  toolName: string;
  args: Record<string, unknown>;
  result: string;
  success: boolean;
  duration: number;
  sessionId?: string;
}

/** Decision/routing record */
export interface DecisionRecord {
  id: string;
  timestamp: number;
  type: 'model-routing' | 'provider-selection' | 'tool-selection' | 'iteration' | 'completion';
  decision: string;
  reason?: string;
  confidence?: number;
  alternatives?: string[];
  context?: Record<string, unknown>;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  scope: string;
  message: string;
  meta?: Record<string, unknown>;
  duration?: number;
}

export interface PerformanceMetrics {
  toolInvocations: Map<string, { count: number; totalDuration: number; errors: number; avgDuration: number }>;
  providerCalls: Map<string, { count: number; totalDuration: number; errors: number; tokens: number; avgDuration: number }>;
  sessionActivity: Map<string, { messageCount: number; lastActivity: number }>;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  startTimer(label: string): () => number;
  trackToolInvocation(toolName: string, duration: number, success: boolean, details?: { args?: Record<string, unknown>; result?: string; sessionId?: string }): void;
  trackProviderCall(provider: string, duration: number, success: boolean, tokens?: number): void;
  trackSessionActivity(sessionId: string, messageCount: number): void;
  trackDecision(type: DecisionRecord['type'], decision: string, details?: Omit<DecisionRecord, 'id' | 'timestamp' | 'type' | 'decision'>): void;
  getRecentLogs(count?: number, filter?: { level?: LogLevel; scope?: string; startTime?: number; endTime?: number }): LogEntry[];
  getToolExecutions(filter?: { toolName?: string; sessionId?: string; success?: boolean; limit?: number }): ToolExecutionRecord[];
  getDecisions(filter?: { type?: DecisionRecord['type']; limit?: number }): DecisionRecord[];
  getPerformanceMetrics(): PerformanceMetrics;
  resetMetrics(type?: 'tool' | 'provider' | 'session'): void;
  searchLogs(query: string): LogEntry[];
  exportLogs(filter?: { startTime?: number; endTime?: number; levels?: LogLevel[] }): Promise<string>;
  createChildLogger(scope: string): Logger;
}

class LogBuffer {
  private entries: LogEntry[] = [];
  private maxSize: number;

  constructor(maxSize = 5000) {
    this.maxSize = maxSize;
  }

  push(entry: LogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxSize) {
      // Use splice instead of slice to modify in-place, avoiding a full array copy
      const removeCount = Math.floor(this.maxSize * 0.2);
      this.entries.splice(0, removeCount);
    }
  }

  /** Returns the internal entries array (read-only). Do NOT mutate. */
  getAll(): readonly LogEntry[] {
    return this.entries;
  }

  getRecent(count: number): LogEntry[] {
    return this.entries.slice(-count);
  }

  search(query: string): LogEntry[] {
    const lowerQuery = query.toLowerCase();
    return this.entries.filter(
      (entry) => {
        // Check cheap fields first before falling back to expensive JSON.stringify
        if (entry.message.toLowerCase().includes(lowerQuery)) return true;
        if (entry.scope.toLowerCase().includes(lowerQuery)) return true;
        // Only stringify meta if the cheap checks failed
        if (entry.meta) {
          try {
            return JSON.stringify(entry.meta).toLowerCase().includes(lowerQuery);
          } catch {
            return false;
          }
        }
        return false;
      }
    );
  }

  filter(predicate: (entry: LogEntry) => boolean): LogEntry[] {
    return this.entries.filter(predicate);
  }

  clear(): void {
    this.entries = [];
  }
}

export class VyotiqLogger implements Logger {
  private buffer: LogBuffer;
  private scope: string;
  private metrics: PerformanceMetrics;
  private toolExecutions: ToolExecutionRecord[] = [];
  private decisions: DecisionRecord[] = [];
  private logFilePath: string;
  private writeQueue: LogEntry[] = [];
  private isWriting = false;
  private minLevel: LogLevel;
  private levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };
  private maxToolExecutions = 1000;
  private maxDecisions = 500;
  /** Per-tool recent error tracking for O(1) error rate computation */
  private toolRecentErrors = new Map<string, { calls: number; errors: number }>();

  constructor(scope: string, options?: { minLevel?: LogLevel; maxBufferSize?: number }) {
    this.scope = scope;
    this.minLevel = options?.minLevel ?? 'debug';
    this.buffer = new LogBuffer(options?.maxBufferSize ?? 5000);
    this.metrics = {
      toolInvocations: new Map(),
      providerCalls: new Map(),
      sessionActivity: new Map(),
    };
    
    const userDataPath = app?.getPath?.('userData') ?? process.cwd();
    const logsDir = path.join(userDataPath, 'logs');
    const dateStr = new Date().toISOString().split('T')[0];
    this.logFilePath = path.join(logsDir, `vyotiq-${dateStr}.log`);
    
    fs.mkdir(logsDir, { recursive: true }).then(() => {
      // Clean up old log files on startup (keep last 7 days)
      this.rotateLogFiles(logsDir, 7).catch(() => {});
    }).catch(() => {
      // Directory creation failed - continue without file logging
    });
  }

  /** Remove log files older than maxAgeDays */
  private async rotateLogFiles(logsDir: string, maxAgeDays: number): Promise<void> {
    try {
      const files = await fs.readdir(logsDir);
      const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
      
      for (const file of files) {
        if (!file.startsWith('vyotiq-') || !file.endsWith('.log')) continue;
        const filePath = path.join(logsDir, file);
        try {
          const stat = await fs.stat(filePath);
          if (stat.mtimeMs < cutoff) {
            await fs.unlink(filePath);
            this.log('info', `Rotated old log file: ${file}`, { file, ageMs: Date.now() - stat.mtimeMs });
          }
        } catch (rotErr) {
          // Skip files we can't stat/delete — log to console since logger may be mid-rotation
          console.debug('[logger] Failed to rotate log file:', file, rotErr instanceof Error ? rotErr.message : rotErr);
        }
      }
    } catch (err) {
      // Rotation failed — non-critical, but inform via console
      console.warn('[logger] Log rotation failed:', err instanceof Error ? err.message : err);
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.minLevel];
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      id: this.generateId(),
      timestamp: Date.now(),
      level,
      scope: this.scope,
      message,
      meta,
    };

    this.buffer.push(entry);
    this.queueWrite(entry);

    // Console output removed - logging continues to file and buffer only
  }

  private async queueWrite(entry: LogEntry): Promise<void> {
    // Cap queue size to prevent unbounded memory growth during disk I/O bottlenecks.
    // Drop oldest entries when the queue exceeds 10,000 entries.
    if (this.writeQueue.length >= 10000) {
      this.writeQueue.splice(0, this.writeQueue.length - 9000);
    }
    this.writeQueue.push(entry);
    
    if (this.isWriting) return;
    this.isWriting = true;

    while (this.writeQueue.length > 0) {
      const batch = this.writeQueue.splice(0, 100);
      const lines = batch.map((e) => JSON.stringify(e)).join('\n') + '\n';
      
      try {
        await fs.appendFile(this.logFilePath, lines, 'utf-8');
      } catch {
        // File write failed - continue without file logging
      }
    }

    this.isWriting = false;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', message, meta);
  }

  startTimer(label: string): () => number {
    const start = performance.now();
    return () => {
      const duration = Math.round(performance.now() - start);
      this.debug(`Timer [${label}] completed`, { duration, label });
      return duration;
    };
  }

  trackToolInvocation(
    toolName: string, 
    duration: number, 
    success: boolean,
    details?: { args?: Record<string, unknown>; result?: string; sessionId?: string }
  ): void {
    // Update aggregate metrics
    const existing = this.metrics.toolInvocations.get(toolName) ?? { count: 0, totalDuration: 0, errors: 0, avgDuration: 0 };
    existing.count += 1;
    existing.totalDuration += duration;
    if (!success) existing.errors += 1;
    existing.avgDuration = Math.round(existing.totalDuration / existing.count);
    this.metrics.toolInvocations.set(toolName, existing);

    // Store detailed execution record
    const record: ToolExecutionRecord = {
      id: this.generateId(),
      timestamp: Date.now(),
      toolName,
      args: details?.args ?? {},
      result: details?.result?.slice(0, 2000) ?? '', // Limit result size
      success,
      duration,
      sessionId: details?.sessionId,
    };
    
    this.toolExecutions.push(record);
    
    // Trim if exceeds max - use splice for in-place modification
    if (this.toolExecutions.length > this.maxToolExecutions) {
      const removeCount = this.toolExecutions.length - this.maxToolExecutions;
      this.toolExecutions.splice(0, removeCount);
    }

    // O(1) per-tool recent error rate tracking (avoids O(n) filter on every invocation)
    const recentStats = this.toolRecentErrors.get(toolName) ?? { calls: 0, errors: 0 };
    recentStats.calls = Math.min(recentStats.calls + 1, 10); // Window of last ~10 calls
    if (!success) recentStats.errors = Math.min(recentStats.errors + 1, 10);
    // Decay: after 10 calls, start reducing old error count proportionally
    if (recentStats.calls >= 10) {
      recentStats.errors = Math.max(0, recentStats.errors - (success ? 0.1 : 0));
    }
    this.toolRecentErrors.set(toolName, recentStats);
    const recentErrorRate = recentStats.calls > 0 ? (recentStats.errors / recentStats.calls) * 100 : 0;

    this.info('Tool invocation', {
      tool: toolName,
      duration,
      success,
      avgDuration: existing.avgDuration,
      totalCalls: existing.count,
      lifetimeErrorRate: ((existing.errors / existing.count) * 100).toFixed(1) + '%',
      recentErrorRate: recentErrorRate.toFixed(1) + '%',
      sessionId: details?.sessionId,
    });
  }

  trackProviderCall(provider: string, duration: number, success: boolean, tokens = 0): void {
    const existing = this.metrics.providerCalls.get(provider) ?? { count: 0, totalDuration: 0, errors: 0, tokens: 0, avgDuration: 0 };
    existing.count += 1;
    existing.totalDuration += duration;
    existing.tokens += tokens;
    if (!success) existing.errors += 1;
    existing.avgDuration = Math.round(existing.totalDuration / existing.count);
    this.metrics.providerCalls.set(provider, existing);

    this.info('Provider call', {
      provider,
      duration,
      success,
      tokens,
      totalTokens: existing.tokens,
      avgDuration: Math.round(existing.totalDuration / existing.count),
    });
  }

  trackSessionActivity(sessionId: string, messageCount: number): void {
    this.metrics.sessionActivity.set(sessionId, {
      messageCount,
      lastActivity: Date.now(),
    });
  }

  trackDecision(
    type: DecisionRecord['type'], 
    decision: string, 
    details?: Omit<DecisionRecord, 'id' | 'timestamp' | 'type' | 'decision'>
  ): void {
    const record: DecisionRecord = {
      id: this.generateId(),
      timestamp: Date.now(),
      type,
      decision,
      ...details,
    };
    
    this.decisions.push(record);
    
    // Trim if exceeds max - use splice for in-place modification
    if (this.decisions.length > this.maxDecisions) {
      const removeCount = this.decisions.length - this.maxDecisions;
      this.decisions.splice(0, removeCount);
    }

    this.info(`Decision: ${type}`, {
      decision,
      reason: details?.reason,
      confidence: details?.confidence,
      alternatives: details?.alternatives?.slice(0, 3),
    });
  }

  getRecentLogs(count = 100, filter?: { level?: LogLevel; scope?: string; startTime?: number; endTime?: number }): LogEntry[] {
    let logs = this.buffer.getRecent(count * 2); // Get more to account for filtering
    
    if (filter?.level) {
      logs = logs.filter((entry) => entry.level === filter.level);
    }
    if (filter?.scope) {
      logs = logs.filter((entry) => entry.scope.includes(filter.scope));
    }
    if (filter?.startTime !== undefined) {
      const startTime = filter.startTime;
      logs = logs.filter((entry) => entry.timestamp >= startTime);
    }
    if (filter?.endTime !== undefined) {
      const endTime = filter.endTime;
      logs = logs.filter((entry) => entry.timestamp <= endTime);
    }
    
    return logs.slice(-count);
  }

  getToolExecutions(filter?: { toolName?: string; sessionId?: string; success?: boolean; limit?: number }): ToolExecutionRecord[] {
    let records = [...this.toolExecutions];
    
    if (filter?.toolName) {
      records = records.filter(r => r.toolName === filter.toolName);
    }
    if (filter?.sessionId) {
      records = records.filter(r => r.sessionId === filter.sessionId);
    }
    if (filter?.success !== undefined) {
      records = records.filter(r => r.success === filter.success);
    }
    
    const limit = filter?.limit ?? 100;
    return records.slice(-limit);
  }

  getDecisions(filter?: { type?: DecisionRecord['type']; limit?: number }): DecisionRecord[] {
    let records = [...this.decisions];
    
    if (filter?.type) {
      records = records.filter(r => r.type === filter.type);
    }
    
    const limit = filter?.limit ?? 100;
    return records.slice(-limit);
  }

  getPerformanceMetrics(): PerformanceMetrics {
    return {
      toolInvocations: new Map(this.metrics.toolInvocations),
      providerCalls: new Map(this.metrics.providerCalls),
      sessionActivity: new Map(this.metrics.sessionActivity),
    };
  }

  /**
   * Reset performance metrics (useful when starting fresh or cleaning up polluted data)
   * @param type - Optional: reset only specific metric type ('tool', 'provider', 'session')
   */
  resetMetrics(type?: 'tool' | 'provider' | 'session'): void {
    if (!type || type === 'tool') {
      this.metrics.toolInvocations.clear();
      this.info('Tool invocation metrics reset');
    }
    if (!type || type === 'provider') {
      this.metrics.providerCalls.clear();
      this.info('Provider call metrics reset');
    }
    if (!type || type === 'session') {
      this.metrics.sessionActivity.clear();
      this.info('Session activity metrics reset');
    }
  }

  searchLogs(query: string): LogEntry[] {
    return this.buffer.search(query);
  }

  async exportLogs(filter?: { startTime?: number; endTime?: number; levels?: LogLevel[] }): Promise<string> {
    let logs = this.buffer.getAll();
    
    // Apply filters
    if (filter?.startTime !== undefined) {
      const startTime = filter.startTime;
      logs = logs.filter(l => l.timestamp >= startTime);
    }
    if (filter?.endTime !== undefined) {
      const endTime = filter.endTime;
      logs = logs.filter(l => l.timestamp <= endTime);
    }
    if (filter?.levels && filter.levels.length > 0) {
      const levels = filter.levels;
      logs = logs.filter(l => levels.includes(l.level));
    }
    
    const metrics = this.getPerformanceMetrics();
    
    const exportData = {
      exportedAt: new Date().toISOString(),
      filterApplied: filter ? {
        startTime: filter.startTime ? new Date(filter.startTime).toISOString() : undefined,
        endTime: filter.endTime ? new Date(filter.endTime).toISOString() : undefined,
        levels: filter.levels,
      } : undefined,
      summary: {
        totalLogs: logs.length,
        totalToolExecutions: this.toolExecutions.length,
        totalDecisions: this.decisions.length,
        byLevel: {
          debug: logs.filter(l => l.level === 'debug').length,
          info: logs.filter(l => l.level === 'info').length,
          warn: logs.filter(l => l.level === 'warn').length,
          error: logs.filter(l => l.level === 'error').length,
        },
      },
      logs,
      toolExecutions: this.toolExecutions,
      decisions: this.decisions,
      metrics: {
        toolInvocations: Object.fromEntries(metrics.toolInvocations),
        providerCalls: Object.fromEntries(metrics.providerCalls),
        sessionActivity: Object.fromEntries(metrics.sessionActivity),
      },
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  createChildLogger(childScope: string): VyotiqLogger {
    const child = new VyotiqLogger(`${this.scope}:${childScope}`);
    // Share state with parent for unified logging
    child.buffer = this.buffer;
    child.metrics = this.metrics;
    child.toolExecutions = this.toolExecutions;
    child.decisions = this.decisions;
    return child;
  }
}

// Legacy ConsoleLogger for backward compatibility
export class ConsoleLogger implements Logger {
  private vyotiqLogger: VyotiqLogger;

  constructor(scope: string) {
    this.vyotiqLogger = new VyotiqLogger(scope);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.vyotiqLogger.debug(message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.vyotiqLogger.info(message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.vyotiqLogger.warn(message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.vyotiqLogger.error(message, meta);
  }

  startTimer(label: string): () => number {
    return this.vyotiqLogger.startTimer(label);
  }

  trackToolInvocation(toolName: string, duration: number, success: boolean, details?: { args?: Record<string, unknown>; result?: string; sessionId?: string }): void {
    this.vyotiqLogger.trackToolInvocation(toolName, duration, success, details);
  }

  trackProviderCall(provider: string, duration: number, success: boolean, tokens?: number): void {
    this.vyotiqLogger.trackProviderCall(provider, duration, success, tokens);
  }

  trackDecision(type: DecisionRecord['type'], decision: string, details?: Omit<DecisionRecord, 'id' | 'timestamp' | 'type' | 'decision'>): void {
    this.vyotiqLogger.trackDecision(type, decision, details);
  }

  getRecentLogs(count?: number, filter?: { level?: LogLevel; scope?: string; startTime?: number; endTime?: number }): LogEntry[] {
    return this.vyotiqLogger.getRecentLogs(count, filter);
  }

  getToolExecutions(filter?: { toolName?: string; sessionId?: string; success?: boolean; limit?: number }): ToolExecutionRecord[] {
    return this.vyotiqLogger.getToolExecutions(filter);
  }

  getDecisions(filter?: { type?: DecisionRecord['type']; limit?: number }): DecisionRecord[] {
    return this.vyotiqLogger.getDecisions(filter);
  }

  getPerformanceMetrics(): PerformanceMetrics {
    return this.vyotiqLogger.getPerformanceMetrics();
  }

  searchLogs(query: string): LogEntry[] {
    return this.vyotiqLogger.searchLogs(query);
  }

  exportLogs(filter?: { startTime?: number; endTime?: number; levels?: LogLevel[] }): Promise<string> {
    return this.vyotiqLogger.exportLogs(filter);
  }

  trackSessionActivity(sessionId: string, messageCount: number): void {
    this.vyotiqLogger.trackSessionActivity(sessionId, messageCount);
  }

  resetMetrics(type?: 'tool' | 'provider' | 'session'): void {
    this.vyotiqLogger.resetMetrics(type);
  }

  createChildLogger(scope: string): Logger {
    return new ConsoleLogger(scope);
  }
}

let globalLogger: VyotiqLogger | null = null;

export function getGlobalLogger(): VyotiqLogger {
  if (!globalLogger) {
    globalLogger = new VyotiqLogger('Vyotiq');
  }
  return globalLogger;
}

export function createLogger(scope: string): VyotiqLogger {
  return getGlobalLogger().createChildLogger(scope);
}