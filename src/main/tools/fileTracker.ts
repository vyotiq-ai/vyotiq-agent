/**
 * File Read Tracker
 * 
 * Tracks which files have been read in the current session.
 * Used by write/edit tools to enforce the "read before write" safety pattern.
 */

// Shared cache for tracking file reads
const readFilesCache = new Map<string, number>();
const MAX_TRACKED_FILES = 2000; // Limit to prevent unbounded memory growth

/**
 * Mark a file as read
 * @param filePath - The absolute path to the file
 */
export function markFileAsRead(filePath: string): void {
  const key = normalizeKey(filePath);
  
  // Enforce size limit with LRU-style eviction
  if (readFilesCache.size >= MAX_TRACKED_FILES && !readFilesCache.has(key)) {
    // Remove oldest entries (first 10% of cache)
    const toRemove = Math.ceil(MAX_TRACKED_FILES * 0.1);
    const keysToRemove = Array.from(readFilesCache.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, toRemove)
      .map(([k]) => k);
    keysToRemove.forEach(k => readFilesCache.delete(k));
  }
  
  readFilesCache.set(key, Date.now());
}

/**
 * Check if a file was recently read
 * @param filePath - The absolute path to the file
 * @param maxAgeMs - Maximum age in milliseconds (default: 1 hour)
 * @returns true if the file was read within the time window
 */
export function wasFileRead(filePath: string, maxAgeMs = 3600000): boolean {
  const readTime = readFilesCache.get(normalizeKey(filePath));
  if (!readTime) return false;
  return Date.now() - readTime < maxAgeMs;
}

/**
 * Get the time a file was last read
 * @param filePath - The absolute path to the file
 * @returns The timestamp when the file was read, or undefined if not tracked
 */
export function getFileReadTime(filePath: string): number | undefined {
  return readFilesCache.get(normalizeKey(filePath));
}

/**
 * Clear the tracking cache for a specific file
 * @param filePath - The absolute path to the file
 */
export function clearFileTracking(filePath: string): void {
  readFilesCache.delete(normalizeKey(filePath));
}

/**
 * Clear all file tracking (e.g., on session reset)
 */
export function clearAllFileTracking(): void {
  readFilesCache.clear();
}

/**
 * Get all tracked files
 * @returns Array of file paths that have been read
 */
export function getTrackedFiles(): string[] {
  return Array.from(readFilesCache.keys());
}

/**
 * Get the shared cache reference (for tools that need direct access)
 */
export function getReadFilesCache(): Map<string, number> {
  return readFilesCache;
}

/**
 * Normalize the file path key for consistent lookups
 */
function normalizeKey(filePath: string): string {
  // Use lowercase for case-insensitive matching on Windows
  // Replace backslashes with forward slashes for consistency
  return filePath.toLowerCase().replace(/\\/g, '/');
}
