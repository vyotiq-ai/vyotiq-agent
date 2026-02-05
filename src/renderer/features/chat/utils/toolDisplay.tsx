import type { ReactElement } from 'react';
import { getToolCategory } from '../../../components/ui/ToolIcons';

export function safeJsonStringify(value: unknown, space = 2): string {
  try {
    return JSON.stringify(value, null, space);
  } catch {
    return String(value);
  }
}

/**
 * Get icon component for a tool name.
 * @deprecated Icons have been removed for minimalist UI
 */
export function getToolIconComponent(_toolName: string): null {
  return null;
}

/**
 * Confirmation-panel style icon element (colored by tool category).
 * @deprecated Icons have been removed for minimalist UI - returns null
 */
export function getToolIconElement(_toolName: string, _size = 12): ReactElement | null {
  return null;
}

/**
 * Get color class for a tool based on its category
 */
export function getToolCategoryColor(toolName: string): string {
  const category = getToolCategory(toolName);
  
  if (category === 'terminal') return 'text-[var(--color-warning)]';
  if (category === 'file' && toolName.toLowerCase().includes('delete')) return 'text-[var(--color-error)]';
  if (category === 'edit') return 'text-[var(--color-info)]';
  
  return 'text-[var(--color-accent-primary)]';
}

/** Extract line range info for read operations */
export function getReadLineRange(args: Record<string, unknown>): string | undefined {
  const offset = args.offset ?? args.startLine;
  const limit = args.limit ?? (args.endLine && args.startLine
    ? (args.endLine as number) - (args.startLine as number) + 1
    : undefined);

  if (typeof offset === 'number') {
    const start = offset;
    const end = typeof limit === 'number' ? start + limit - 1 : start + 149;
    return `L${start}-${end}`;
  }
  return undefined;
}

/** Extract a meaningful target label from tool arguments for compact UI display. */
export function getToolTarget(args: Record<string, unknown>, toolName: string, partialJson?: string): string | undefined {
  const name = toolName.toLowerCase();

  let filePath = (args.path || args.file_path || args.filePath || args.file) as unknown;

  // If no path in parsed args, try to extract from partial JSON string
  if (!filePath && partialJson) {
    // Basic regex to extract path/file/url from partial JSON
    const pathMatch = partialJson.match(/"(?:path|file_path|file|filePath|file_path|url)"\s*:\s*"([^"]*)"/);
    if (pathMatch) {
      filePath = pathMatch[1];
    }
  }

  if (typeof filePath === 'string' && filePath) {
    const parts = filePath.replace(/\\/g, '/').split('/');
    const filename = parts[parts.length - 1] || filePath;

    if (name.includes('read') || name === 'cat') {
      const lineRange = getReadLineRange(args);
      return lineRange ? `${filename} (${lineRange})` : filename;
    }

    return filename;
  }

  // Handle command (terminal)
  let command = args.command as string | undefined;
  if (!command && partialJson) {
    const cmdMatch = partialJson.match(/"command"\s*:\s*"([^"]*)"/);
    if (cmdMatch) command = cmdMatch[1];
  }

  if (command) {
    const firstWord = command.split(/\s+/)[0];
    return command.length > 30 ? `${firstWord}...` : command;
  }

  // Handle pattern (grep)
  let pattern = args.pattern as string | undefined;
  if (!pattern && partialJson) {
    const patternMatch = partialJson.match(/"pattern"\s*:\s*"([^"]*)"/);
    if (patternMatch) pattern = patternMatch[1];
  }
  if (pattern) {
    return pattern.length > 20 ? `"${pattern.slice(0, 17)}..."` : `"${pattern}"`;
  }

  // Handle query (search)
  let query = args.query as string | undefined;
  if (!query && partialJson) {
    const queryMatch = partialJson.match(/"query"\s*:\s*"([^"]*)"/);
    if (queryMatch) query = queryMatch[1];
  }
  if (query) {
    return query.length > 20 ? `"${query.slice(0, 17)}..."` : `"${query}"`;
  }

  if (toolName.includes('ls') || toolName.includes('list')) {
    let dir = (args.dir || args.directory) as string | undefined;
    if (!dir && partialJson) {
      const dirMatch = partialJson.match(/"(?:dir|directory)"\s*:\s*"([^"]*)"/);
      if (dirMatch) dir = dirMatch[1];
    }
    return dir || '.';
  }

  return undefined;
}

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
