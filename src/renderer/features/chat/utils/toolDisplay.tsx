/**
 * Tool Display Utilities
 * 
 * Formatting helpers for tool execution display in the chat UI.
 * Provides duration formatting, metadata extraction, and elapsed time display.
 */

export function formatElapsed(startTime: number): string {
  const elapsedMs = Date.now() - startTime;
  const elapsed = elapsedMs / 1000;
  
  // Show tenths of seconds for first 10 seconds for smoother feel
  if (elapsed < 10) return `${elapsed.toFixed(1)}s`;
  if (elapsed < 60) return `${Math.floor(elapsed)}s`;
  
  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);
  return `${mins}m ${secs}s`;
}

export function formatDurationMs(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

export function getDurationMsFromMetadata(metadata?: Record<string, unknown>): number | undefined {
  if (!metadata) return undefined;

  const direct = metadata.durationMs;
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;

  const timing = metadata.timing as { durationMs?: unknown } | undefined;
  if (timing && typeof timing.durationMs === 'number' && Number.isFinite(timing.durationMs)) {
    return timing.durationMs;
  }

  return undefined;
}

export function getReadMetadataInfo(metadata: Record<string, unknown> | undefined, toolName: string): string | undefined {
  if (!metadata || !toolName.toLowerCase().includes('read')) return undefined;

  const { startLine, endLine, totalLines, wasTruncated, type } = metadata as {
    startLine?: number;
    endLine?: number;
    totalLines?: number;
    wasTruncated?: boolean;
    type?: string;
  };

  if (type === 'pdf') {
    const pages = metadata.pages as number;
    return pages ? `${pages} pages` : undefined;
  }
  if (type === 'image') {
    return 'image';
  }
  if (type === 'notebook') {
    const cellCount = metadata.cellCount as number;
    return cellCount ? `${cellCount} cells` : undefined;
  }

  if (startLine !== undefined && endLine !== undefined) {
    let info = `L${startLine}-${endLine}`;
    if (totalLines !== undefined) {
      info += ` of ${totalLines}`;
      if (wasTruncated) {
        const remaining = totalLines - endLine;
        if (remaining > 0) {
          info += ` (${remaining} more)`;
        }
      }
    }
    return info;
  }

  if (totalLines !== undefined) {
    return `${totalLines} lines${wasTruncated ? ' (truncated)' : ''}`;
  }

  return undefined;
}
