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
