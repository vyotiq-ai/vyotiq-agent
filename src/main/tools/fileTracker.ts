/**
 * File Read Tracker
 * 
 * Tracks which files have been read per session.
 * Used by write/edit tools to enforce the "read before write" safety pattern.
 * Session-scoped to prevent cross-session contamination.
 */

// Session-scoped cache: sessionId -> (normalizedPath -> timestamp)
const sessionCaches = new Map<string, Map<string, number>>();
const MAX_TRACKED_FILES_PER_SESSION = 2000;

/** Internal: get or create a session-scoped cache */
function getSessionCache(sessionId: string | undefined): Map<string, number> {
  // Fall back to a global session key for callers that don't have session context
  const key = sessionId ?? '__global__';
  let cache = sessionCaches.get(key);
  if (!cache) {
    cache = new Map();
    sessionCaches.set(key, cache);
  }
  return cache;
}

/**
 * Mark a file as read within a session
 * @param filePath - The absolute path to the file
 * @param sessionId - The session that performed the read (optional for backward compat)
 */
export function markFileAsRead(filePath: string, sessionId?: string): void {
  const cache = getSessionCache(sessionId);
  const key = normalizeKey(filePath);
  
  // Enforce per-session size limit with LRU-style eviction
  if (cache.size >= MAX_TRACKED_FILES_PER_SESSION && !cache.has(key)) {
    const toRemove = Math.ceil(MAX_TRACKED_FILES_PER_SESSION * 0.1);
    const keysToRemove = Array.from(cache.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, toRemove)
      .map(([k]) => k);
    keysToRemove.forEach(k => cache.delete(k));
  }
  
  cache.set(key, Date.now());
}

/**
 * Check if a file was recently read within a session
 * @param filePath - The absolute path to the file
 * @param maxAgeMs - Maximum age in milliseconds (default: 1 hour)
 * @param sessionId - The session to check (optional for backward compat)
 * @returns true if the file was read within the time window in this session
 */
export function wasFileRead(filePath: string, maxAgeMs = 3600000, sessionId?: string): boolean {
  const cache = getSessionCache(sessionId);
  const readTime = cache.get(normalizeKey(filePath));
  if (!readTime) return false;
  return Date.now() - readTime < maxAgeMs;
}

/**
 * Get the time a file was last read in a session
 * @param filePath - The absolute path to the file
 * @param sessionId - The session to check
 * @returns The timestamp when the file was read, or undefined if not tracked
 */
export function getFileReadTime(filePath: string, sessionId?: string): number | undefined {
  return getSessionCache(sessionId).get(normalizeKey(filePath));
}

/**
 * Clear the tracking cache for a specific file in a session
 * @param filePath - The absolute path to the file
 * @param sessionId - The session to clear from
 */
export function clearFileTracking(filePath: string, sessionId?: string): void {
  getSessionCache(sessionId).delete(normalizeKey(filePath));
}

/**
 * Clear all file tracking for a specific session
 * @param sessionId - The session to clear (omit to clear global fallback cache)
 */
export function clearSessionFileTracking(sessionId: string): void {
  sessionCaches.delete(sessionId);
}

/**
 * Clear all file tracking across all sessions
 */
export function clearAllFileTracking(): void {
  sessionCaches.clear();
}

/**
 * Get all tracked files for a session
 * @param sessionId - The session to query
 * @returns Array of file paths that have been read in this session
 */
export function getTrackedFiles(sessionId?: string): string[] {
  return Array.from(getSessionCache(sessionId).keys());
}

/**
 * Get the session-scoped cache reference (for tools that need direct access)
 * @param sessionId - The session to get the cache for
 */
export function getReadFilesCache(sessionId?: string): Map<string, number> {
  return getSessionCache(sessionId);
}

/**
 * Normalize the file path key for consistent lookups
 * Uses case-insensitive normalization on Windows, case-sensitive on Unix
 */
function normalizeKey(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}
