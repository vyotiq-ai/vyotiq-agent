/**
 * Path helper utilities for the renderer process.
 *
 * Re-exports shared path utilities for backward compatibility.
 * New code should import directly from '@shared/utils/pathUtils'.
 */
import {
  getFilename,
  getExtension,
  getDirname,
  normalizePath as sharedNormalizePath,
} from '../../shared/utils/pathUtils';

/**
 * Extract the file name from a full file path.
 * Works with both forward slashes and backslashes.
 */
export function getFileName(filePath: string): string {
  return getFilename(filePath);
}

/**
 * Extract the file extension from a file path (lowercase, without dot).
 * Returns empty string if no extension is found.
 */
export function getFileExtension(filePath: string): string {
  return getExtension(filePath);
}

/**
 * Get the directory portion of a file path.
 * Returns empty string if the path has no directory.
 */
export function getDirectoryPath(filePath: string): string {
  const dir = getDirname(filePath);
  return dir === '.' ? '' : dir;
}

/**
 * Normalize path separators to forward slashes.
 */
export function normalizePath(filePath: string): string {
  return sharedNormalizePath(filePath);
}
