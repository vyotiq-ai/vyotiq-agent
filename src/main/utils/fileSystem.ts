import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createLogger } from '../logger';

const logger = createLogger('FileSystem');

/**
 * Options for resolving paths
 */
export interface ResolvePathOptions {
  /** 
   * Allow paths outside the workspace.
   * When false (default): Throws error for paths outside workspace.
   * When true: Allows access to any path on the system.
   */
  allowOutsideWorkspace?: boolean;
}

/**
 * Check if a path is a Unix-style root path (starts with /) that should be treated
 * as workspace-relative on Windows. This handles the case where LLMs generate
 * paths like "/package.json" expecting them to be relative to the workspace root.
 * 
 * @param targetPath - The path to check
 * @returns true if the path should be treated as workspace-relative
 */
function isUnixRootPath(targetPath: string): boolean {
  // On Windows, paths starting with "/" are technically drive-relative,
  // but when an LLM generates "/package.json", they mean workspace-relative
  const isWindows = process.platform === 'win32';
  if (!isWindows) return false;
  
  // Check if it starts with a single forward slash but isn't a UNC path (\\server)
  // and doesn't have a drive letter after the slash (like /C:/)
  return (
    targetPath.startsWith('/') && 
    !targetPath.startsWith('//') &&
    !targetPath.startsWith('\\') &&
    !/^\/[a-zA-Z]:/.test(targetPath)
  );
}

/**
 * Normalize path separators to the current OS format
 */
function normalizePathSeparators(targetPath: string): string {
  const isWindows = process.platform === 'win32';
  if (isWindows) {
    // Convert forward slashes to backslashes on Windows
    return targetPath.replace(/\//g, '\\');
  }
  return targetPath;
}

/**
 * Resolve a target path relative to a workspace, with security checks.
 * 
 * - If targetPath is already absolute, validate it's within workspace (unless allowOutsideWorkspace)
 * - If targetPath is relative, resolve it against workspacePath
 * - On Windows, handles Unix-style paths like "/package.json" as workspace-relative
 * - Prevents directory traversal attacks
 * 
 * @param workspacePath - The workspace root path
 * @param targetPath - The path to resolve (can be relative or absolute)
 * @param options - Options for path resolution
 * @returns The resolved absolute path
 * @throws Error if path is outside workspace (when not allowed) or invalid
 */
export function resolvePath(
  workspacePath: string | undefined, 
  targetPath: string, 
  options: ResolvePathOptions = {}
): string {
  const { allowOutsideWorkspace = false } = options;
  
  if (!targetPath || typeof targetPath !== 'string') {
    throw new Error('Invalid path: path must be a non-empty string.');
  }
  
  // Normalize the target path (handle Windows/Unix differences)
  let normalizedTarget = targetPath.trim();
  
  // Handle paths that might have quotes or backticks around them
  normalizedTarget = normalizedTarget.replace(/^["'`]+|["'`]+$/g, '');
  
  if (!workspacePath) {
    // No workspace - just resolve the path
    return path.resolve(normalizedTarget);
  }
  
  // Normalize workspace path
  const normalizedWorkspace = path.resolve(workspacePath);
  
  // IMPORTANT: Handle Unix-style root paths on Windows
  // When LLMs generate paths like "/package.json" or "/src/index.ts",
  // they expect these to be relative to the workspace root, not the drive root.
  // On Windows, path.isAbsolute('/package.json') returns true (drive-relative),
  // but we should treat these as workspace-relative paths.
  if (isUnixRootPath(normalizedTarget)) {
    // Convert "/package.json" to "package.json" to make it workspace-relative
    // This handles the common case where LLMs use Unix-style paths
    normalizedTarget = normalizedTarget.slice(1); // Remove leading /
    
    // If it's just "/" alone, use the workspace root
    if (normalizedTarget === '' || normalizedTarget === '.') {
      return normalizedWorkspace;
    }
    
    // Also normalize any remaining forward slashes in the path
    normalizedTarget = normalizePathSeparators(normalizedTarget);
  }
  
  // Check if target is already an absolute path
  const isAbsolute = path.isAbsolute(normalizedTarget);
  
  let fullPath: string;
  
  if (isAbsolute) {
    // For absolute paths, normalize and verify they're within workspace
    fullPath = path.normalize(normalizedTarget);
    
    // Check if the absolute path is within the workspace
    if (!fullPath.toLowerCase().startsWith(normalizedWorkspace.toLowerCase())) {
      if (allowOutsideWorkspace) {
        // User has explicitly allowed outside workspace access
        logger.info('Accessing path outside workspace (allowed by user)', { 
          path: normalizedTarget, 
          workspace: workspacePath 
        });
        return fullPath;
      } else {
        // Block access to paths outside workspace by default
        throw new Error(
          `Access denied: Path "${targetPath}" is outside the workspace. ` +
          `To access files outside the workspace, enable "Allow Outside Workspace" in Settings > Access.`
        );
      }
    }
  } else {
    // Relative path - resolve against workspace
    // Normalize path separators before resolving
    normalizedTarget = normalizePathSeparators(normalizedTarget);
    fullPath = path.resolve(normalizedWorkspace, normalizedTarget);
    
    // Security check: ensure the resolved path doesn't escape workspace via ..
    if (!fullPath.toLowerCase().startsWith(normalizedWorkspace.toLowerCase())) {
      if (allowOutsideWorkspace) {
        // User has explicitly allowed outside workspace access
        logger.info('Path traversal allowed by user', { 
          path: targetPath, 
          resolved: fullPath,
          workspace: workspacePath 
        });
        return fullPath;
      } else {
        throw new Error(
          `Path traversal detected: "${targetPath}" resolves outside workspace. ` +
          `Resolved path: "${fullPath}", Workspace: "${normalizedWorkspace}". ` +
          `To access files outside the workspace, enable "Allow Outside Workspace" in Settings > Access.`
        );
      }
    }
  }
  
  return fullPath;
}

export async function ensureDirectory(targetPath: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
}
