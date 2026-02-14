/**
 * Settings Formatters
 * 
 * Shared formatting utilities used across settings components.
 * Prevents duplication of common formatting logic.
 */

/**
 * Format byte values for display (e.g., 1024 → "1 KB")
 */
export const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${bytes} B`;
};

/**
 * Format millisecond durations for display (e.g., 60000 → "1.0m")
 */
export const formatDuration = (ms: number): string => {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
};

/**
 * Format millisecond durations for display with full units
 */
export const formatDurationFull = (ms: number): string => {
  if (ms >= 60000) return `${(ms / 60000).toFixed(0)} min`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(0)} sec`;
  return `${ms} ms`;
};

/**
 * Format cost values for display (e.g., 0.005 → "$0.005")
 */
export const formatCost = (cost: number): string => {
  if (cost >= 1) return `$${cost.toFixed(2)}`;
  if (cost >= 0.01) return `$${cost.toFixed(3)}`;
  if (cost > 0) return `$${cost.toFixed(4)}`;
  return '$0.00';
};

/**
 * Format a date timestamp for display
 */
export const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};
