/**
 * Path helper utilities for the renderer process.
 * Centralizes path parsing functions used across multiple features.
 */

/**
 * Extract the file name from a full file path.
 * Works with both forward slashes and backslashes.
 */
export function getFileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() ?? filePath;
}

/**
 * Extract the file extension from a file path (lowercase, without dot).
 * Returns empty string if no extension is found.
 */
export function getFileExtension(filePath: string): string {
  const fileName = getFileName(filePath);
  const lastDot = fileName.lastIndexOf('.');
  return lastDot > 0 ? fileName.slice(lastDot + 1).toLowerCase() : '';
}

/**
 * Get the directory portion of a file path.
 * Returns empty string if the path has no directory.
 */
export function getDirectoryPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash >= 0 ? normalized.slice(0, lastSlash) : '';
}

/**
 * Normalize path separators to forward slashes.
 */
export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}
