/**
 * Time Formatting Utilities
 * 
 * Centralized time formatting functions for consistent display across the app.
 * Uses the shared utilities as base but provides renderer-specific convenience.
 * 
 * @module utils/timeFormatting
 */

// Re-export from shared for convenience
export { 
  formatRelativeTime,
  formatElapsedTime,
  formatToolDuration as formatDuration,
} from '../../shared/utils/toolUtils';

/**
 * Format a timestamp as HH:MM time string (24-hour or locale-based)
 * Used for message timestamps, session headers, etc.
 */
export function formatTimeShort(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a timestamp as full date+time string for tooltips
 * Example: "Jan 15, 2026, 2:30:45 PM"
 */
export function formatFullDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Format relative time with "ago" suffix for display
 * Example: "5m ago", "2h ago", "3d ago"
 */
export function formatRelativeTimeWithSuffix(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return 'just now';
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  
  // For older timestamps, show the date
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Format duration in seconds to MM:SS format
 * Used for audio/video playback indicators
 */
export function formatPlaybackDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format milliseconds to human-readable duration
 * Examples: "150ms", "1.5s", "2m 30s"
 */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}
