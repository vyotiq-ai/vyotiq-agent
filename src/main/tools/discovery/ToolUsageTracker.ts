/**
 * Tool Usage Tracker
 *
 * Tracks tool usage patterns for ranking and recommendations.
 */
import type { ToolUsageStats } from '../../../shared/types';
import { createLogger } from '../../logger';

const logger = createLogger('ToolUsageTracker');

/**
 * Usage record
 */
interface UsageRecord {
  toolName: string;
  timestamp: number;
  success: boolean;
  durationMs: number;
  context?: string;
  sessionId: string;
}

/**
 * Tool Usage Tracker class
 */
export class ToolUsageTracker {
  private records: UsageRecord[] = [];
  private maxRecords = 10000;
  private statsCache = new Map<string, { stats: ToolUsageStats; computedAt: number }>();
  private statsCacheTTL = 60 * 1000; // 1 minute

  /**
   * Record a tool usage
   */
  recordUsage(
    toolName: string,
    success: boolean,
    durationMs: number,
    sessionId: string,
    context?: string
  ): void {
    const record: UsageRecord = {
      toolName,
      timestamp: Date.now(),
      success,
      durationMs,
      context,
      sessionId,
    };

    this.records.push(record);

    // Trim old records
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords);
    }

    // Invalidate cache for this tool
    this.statsCache.delete(toolName);

    logger.debug('Usage recorded', { toolName, success, durationMs });
  }

  /**
   * Get usage statistics for a tool
   */
  getStats(toolName: string): ToolUsageStats {
    // Check cache
    const cached = this.statsCache.get(toolName);
    if (cached && Date.now() - cached.computedAt < this.statsCacheTTL) {
      return cached.stats;
    }

    // Compute stats
    const toolRecords = this.records.filter(r => r.toolName === toolName);
    
    if (toolRecords.length === 0) {
      return {
        toolName,
        totalInvocations: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        avgDurationMs: 0,
        lastUsedAt: 0,
        usageByContext: {},
      };
    }

    const successCount = toolRecords.filter(r => r.success).length;
    const failureCount = toolRecords.length - successCount;
    const totalDuration = toolRecords.reduce((sum, r) => sum + r.durationMs, 0);
    const usageByContext: Record<string, number> = {};

    for (const record of toolRecords) {
      if (record.context) {
        usageByContext[record.context] = (usageByContext[record.context] || 0) + 1;
      }
    }

    const stats: ToolUsageStats = {
      toolName,
      totalInvocations: toolRecords.length,
      successCount,
      failureCount,
      successRate: toolRecords.length > 0 ? successCount / toolRecords.length : 0,
      avgDurationMs: Math.round(totalDuration / toolRecords.length),
      lastUsedAt: Math.max(...toolRecords.map(r => r.timestamp)),
      usageByContext,
    };

    // Cache stats
    this.statsCache.set(toolName, { stats, computedAt: Date.now() });

    return stats;
  }

  /**
   * Get top used tools
   */
  getTopTools(limit = 10, timeWindowMs?: number): ToolUsageStats[] {
    const cutoff = timeWindowMs ? Date.now() - timeWindowMs : 0;
    const filteredRecords = this.records.filter(r => r.timestamp >= cutoff);

    // Count by tool
    const toolCounts = new Map<string, number>();
    for (const record of filteredRecords) {
      toolCounts.set(record.toolName, (toolCounts.get(record.toolName) || 0) + 1);
    }

    // Sort by count
    const sorted = Array.from(toolCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    return sorted.map(([toolName]) => this.getStats(toolName));
  }

  /**
   * Get recently used tools
   */
  getRecentTools(limit = 10): ToolUsageStats[] {
    // Get unique tools by most recent usage
    const seen = new Set<string>();
    const recentTools: string[] = [];

    for (let i = this.records.length - 1; i >= 0 && recentTools.length < limit; i--) {
      const toolName = this.records[i].toolName;
      if (!seen.has(toolName)) {
        seen.add(toolName);
        recentTools.push(toolName);
      }
    }

    return recentTools.map(name => this.getStats(name));
  }

  /**
   * Get tools used in a specific context
   */
  getToolsForContext(context: string, limit = 10): ToolUsageStats[] {
    const contextRecords = this.records.filter(r => r.context === context);
    
    // Count by tool
    const toolCounts = new Map<string, number>();
    for (const record of contextRecords) {
      toolCounts.set(record.toolName, (toolCounts.get(record.toolName) || 0) + 1);
    }

    // Sort by count
    const sorted = Array.from(toolCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    return sorted.map(([toolName]) => this.getStats(toolName));
  }

  /**
   * Get session-specific usage
   */
  getSessionUsage(sessionId: string): ToolUsageStats[] {
    const sessionRecords = this.records.filter(r => r.sessionId === sessionId);
    
    const toolNames = new Set(sessionRecords.map(r => r.toolName));
    return Array.from(toolNames).map(name => {
      const toolRecords = sessionRecords.filter(r => r.toolName === name);
      const successCount = toolRecords.filter(r => r.success).length;
      const totalDuration = toolRecords.reduce((sum, r) => sum + r.durationMs, 0);

      return {
        toolName: name,
        totalInvocations: toolRecords.length,
        successCount,
        failureCount: toolRecords.length - successCount,
        successRate: toolRecords.length > 0 ? successCount / toolRecords.length : 0,
        avgDurationMs: Math.round(totalDuration / toolRecords.length),
        lastUsedAt: Math.max(...toolRecords.map(r => r.timestamp)),
        usageByContext: {},
      };
    });
  }

  /**
   * Get global statistics
   */
  getGlobalStats(): {
    totalRecords: number;
    uniqueTools: number;
    overallSuccessRate: number;
    avgDurationMs: number;
    recordsLast24h: number;
  } {
    const uniqueTools = new Set(this.records.map(r => r.toolName)).size;
    const successCount = this.records.filter(r => r.success).length;
    const totalDuration = this.records.reduce((sum, r) => sum + r.durationMs, 0);
    const last24h = Date.now() - 24 * 60 * 60 * 1000;
    const recordsLast24h = this.records.filter(r => r.timestamp >= last24h).length;

    return {
      totalRecords: this.records.length,
      uniqueTools,
      overallSuccessRate: this.records.length > 0 ? successCount / this.records.length : 0,
      avgDurationMs: this.records.length > 0 ? Math.round(totalDuration / this.records.length) : 0,
      recordsLast24h,
    };
  }

  /**
   * Audit tool usage patterns — identifies tools with low usage that are candidates
   * for deferral or removal. Inspired by the "addition by subtraction" principle:
   * fewer tools = faster decisions, less token overhead, better model reasoning.
   *
   * @param registeredTools - All tool names currently registered in the system
   * @param threshold - Usage percentage below which a tool is flagged (default: 1%)
   * @param timeWindowMs - Time window to evaluate (default: 7 days)
   */
  auditToolUsage(
    registeredTools: string[],
    threshold = 0.01,
    timeWindowMs = 7 * 24 * 60 * 60 * 1000
  ): {
    /** Tools that were never called */
    neverUsed: string[];
    /** Tools below the usage threshold */
    lowUsage: Array<{ toolName: string; usagePercent: number; invocations: number; successRate: number }>;
    /** Tools above threshold — healthy usage */
    healthy: Array<{ toolName: string; usagePercent: number; invocations: number; successRate: number }>;
    /** Recommendation: tools to consider deferring */
    deferralCandidates: string[];
    /** Total invocations in the time window */
    totalInvocations: number;
    /** Time window used for analysis */
    timeWindowMs: number;
  } {
    const cutoff = Date.now() - timeWindowMs;
    const windowRecords = this.records.filter(r => r.timestamp >= cutoff);
    const totalInvocations = windowRecords.length;

    // Count invocations per tool in the window
    const invocationMap = new Map<string, { count: number; successes: number }>();
    for (const record of windowRecords) {
      const existing = invocationMap.get(record.toolName) || { count: 0, successes: 0 };
      existing.count++;
      if (record.success) existing.successes++;
      invocationMap.set(record.toolName, existing);
    }

    const neverUsed: string[] = [];
    const lowUsage: Array<{ toolName: string; usagePercent: number; invocations: number; successRate: number }> = [];
    const healthy: Array<{ toolName: string; usagePercent: number; invocations: number; successRate: number }> = [];

    for (const toolName of registeredTools) {
      const usage = invocationMap.get(toolName);
      if (!usage || usage.count === 0) {
        neverUsed.push(toolName);
        continue;
      }

      const usagePercent = totalInvocations > 0 ? usage.count / totalInvocations : 0;
      const successRate = usage.count > 0 ? usage.successes / usage.count : 0;
      const entry = { toolName, usagePercent, invocations: usage.count, successRate };

      if (usagePercent < threshold) {
        lowUsage.push(entry);
      } else {
        healthy.push(entry);
      }
    }

    // Sort by usage ascending for low, descending for healthy
    lowUsage.sort((a, b) => a.usagePercent - b.usagePercent);
    healthy.sort((a, b) => b.usagePercent - a.usagePercent);

    // Deferral candidates: never used + low usage (exclude core tools)
    const coreSafeTools = new Set(['read', 'write', 'edit', 'ls', 'grep', 'glob', 'run', 'TodoWrite', 'request_tools']);
    const deferralCandidates = [
      ...neverUsed.filter(t => !coreSafeTools.has(t)),
      ...lowUsage.filter(t => !coreSafeTools.has(t.toolName)).map(t => t.toolName),
    ];

    logger.info('Tool usage audit complete', {
      totalInvocations,
      registeredCount: registeredTools.length,
      neverUsedCount: neverUsed.length,
      lowUsageCount: lowUsage.length,
      healthyCount: healthy.length,
      deferralCandidateCount: deferralCandidates.length,
    });

    return {
      neverUsed,
      lowUsage,
      healthy,
      deferralCandidates,
      totalInvocations,
      timeWindowMs,
    };
  }

  /**
   * Get a ranked list of tools by usage frequency (most to least used).
   * Useful for understanding which tools are most valuable.
   */
  getUsageRanking(timeWindowMs?: number): Array<{ toolName: string; invocations: number; usagePercent: number; avgDurationMs: number }> {
    const cutoff = timeWindowMs ? Date.now() - timeWindowMs : 0;
    const windowRecords = this.records.filter(r => r.timestamp >= cutoff);
    const total = windowRecords.length;

    const toolMap = new Map<string, { count: number; totalDuration: number }>();
    for (const record of windowRecords) {
      const existing = toolMap.get(record.toolName) || { count: 0, totalDuration: 0 };
      existing.count++;
      existing.totalDuration += record.durationMs;
      toolMap.set(record.toolName, existing);
    }

    return Array.from(toolMap.entries())
      .map(([toolName, data]) => ({
        toolName,
        invocations: data.count,
        usagePercent: total > 0 ? data.count / total : 0,
        avgDurationMs: Math.round(data.totalDuration / data.count),
      }))
      .sort((a, b) => b.invocations - a.invocations);
  }

  /**
   * Clear old records
   */
  clearOldRecords(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    const originalLength = this.records.length;
    this.records = this.records.filter(r => r.timestamp >= cutoff);
    this.statsCache.clear();
    return originalLength - this.records.length;
  }

  /**
   * Clear all records
   */
  clear(): void {
    this.records = [];
    this.statsCache.clear();
    logger.info('Usage tracker cleared');
  }
}

// Singleton instance
let trackerInstance: ToolUsageTracker | null = null;

/**
 * Get or create the tool usage tracker singleton
 */
export function getToolUsageTracker(): ToolUsageTracker {
  if (!trackerInstance) {
    trackerInstance = new ToolUsageTracker();
  }
  return trackerInstance;
}
