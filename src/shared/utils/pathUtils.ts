/**
 * Path Utilities
 * 
 * Centralized path handling utilities for consistent cross-platform
 * path operations throughout the application.
 * 
 * NOTE: This file is shared between main and renderer processes.
 * All implementations must be browser-safe (no node:path dependency).
 */

// =============================================================================
// Browser-safe path helpers (replaces node:path for renderer compatibility)
// =============================================================================

/** Get the last segment of a path (like path.basename) */
function _basename(p: string, ext?: string): string {
  const normalized = p.replace(/\\/g, '/').replace(/\/+$/, '');
  const lastSlash = normalized.lastIndexOf('/');
  const base = lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);
  if (ext && base.endsWith(ext)) {
    return base.slice(0, -ext.length);
  }
  return base;
}

/** Get the extension of a path including the dot (like path.extname) */
function _extname(p: string): string {
  const base = _basename(p);
  const dotIndex = base.lastIndexOf('.');
  if (dotIndex <= 0) return '';
  return base.slice(dotIndex);
}

/** Get the directory portion of a path (like path.dirname) */
function _dirname(p: string): string {
  const normalized = p.replace(/\\/g, '/').replace(/\/+$/, '');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash === -1) return '.';
  if (lastSlash === 0) return '/';
  return normalized.slice(0, lastSlash);
}

/** Join path segments (like path.join) */
function _join(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join('/')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/');
}

/** Check if a path is absolute (like path.isAbsolute) */
function _isAbsolute(p: string): boolean {
  // Unix absolute or Windows drive letter (C:\) or UNC (\\server)
  return /^\/|^[A-Za-z]:[/\\]|^\\\\/.test(p);
}

/** Simple relative path calculation (like path.relative) */
function _relative(from: string, to: string): string {
  const fromParts = from.replace(/\\/g, '/').replace(/\/+$/, '').split('/').filter(Boolean);
  const toParts = to.replace(/\\/g, '/').replace(/\/+$/, '').split('/').filter(Boolean);
  let common = 0;
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common++;
  }
  const ups = Array(fromParts.length - common).fill('..');
  return [...ups, ...toParts.slice(common)].join('/') || '.';
}

// =============================================================================
// Path Normalization
// =============================================================================

/**
 * Normalize a path for consistent handling across platforms
 * Always uses forward slashes for consistency
 */
export function normalizePath(inputPath: string): string {
  if (!inputPath) return '';
  
  return inputPath
    .replace(/\\/g, '/')      // Normalize to forward slashes
    .replace(/\/+/g, '/')     // Remove duplicate slashes
    .replace(/\/$/, '');      // Remove trailing slash (except root)
}

/**
 * Normalize a path preserving trailing slash if it was present
 */
export function normalizePathPreserveTrailing(inputPath: string): string {
  if (!inputPath) return '';
  
  const hadTrailingSlash = inputPath.endsWith('/') || inputPath.endsWith('\\');
  const normalized = normalizePath(inputPath);
  return hadTrailingSlash && normalized ? `${normalized}/` : normalized;
}

// =============================================================================
// Path Comparison
// =============================================================================

/**
 * Check if a path is within a workspace/directory
 */
export function isWithinDirectory(filePath: string, directoryPath: string): boolean {
  const normalizedFile = normalizePath(filePath);
  const normalizedDir = normalizePath(directoryPath);
  
  return normalizedFile.startsWith(normalizedDir + '/') || 
         normalizedFile === normalizedDir;
}

/**
 * Check if two paths point to the same location
 */
export function pathsEqual(path1: string, path2: string): boolean {
  return normalizePath(path1).toLowerCase() === normalizePath(path2).toLowerCase();
}

/**
 * Compare paths for sorting (case-insensitive on Windows)
 */
export function comparePaths(a: string, b: string): number {
  const normalizedA = normalizePath(a).toLowerCase();
  const normalizedB = normalizePath(b).toLowerCase();
  return normalizedA.localeCompare(normalizedB);
}

// =============================================================================
// Path Extraction
// =============================================================================

/**
 * Get relative path from a base directory
 * Returns normalized path with forward slashes
 */
export function getRelativePath(filePath: string, basePath: string): string {
  const relativePath = _relative(basePath, filePath);
  return normalizePath(relativePath);
}

/**
 * Get the file extension (without the dot)
 */
export function getExtension(filePath: string): string {
  const ext = _extname(filePath);
  return ext.startsWith('.') ? ext.slice(1).toLowerCase() : ext.toLowerCase();
}

/**
 * Get the file name without extension
 */
export function getBasename(filePath: string): string {
  return _basename(filePath, _extname(filePath));
}

/**
 * Get the directory name from a path
 */
export function getDirname(filePath: string): string {
  return normalizePath(_dirname(filePath));
}

/**
 * Get the file name including extension
 */
export function getFilename(filePath: string): string {
  return _basename(filePath);
}

// =============================================================================
// Path Construction
// =============================================================================

/**
 * Join paths and normalize the result
 */
export function joinPaths(...paths: string[]): string {
  return normalizePath(_join(...paths));
}

/**
 * Resolve paths to an absolute path and normalize
 */
export function resolvePath(...paths: string[]): string {
  return normalizePath(_join(...paths));
}

/**
 * Ensure a path ends with a trailing slash
 */
export function ensureTrailingSlash(inputPath: string): string {
  const normalized = normalizePath(inputPath);
  return normalized && !normalized.endsWith('/') ? `${normalized}/` : normalized;
}

/**
 * Remove trailing slash from a path
 */
export function removeTrailingSlash(inputPath: string): string {
  return normalizePath(inputPath);
}

// =============================================================================
// Language Detection
// =============================================================================

/**
 * Language extensions mapping
 */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  // JavaScript/TypeScript
  ts: 'typescript',
  tsx: 'typescriptreact',
  js: 'javascript',
  jsx: 'javascriptreact',
  mjs: 'javascript',
  cjs: 'javascript',
  mts: 'typescript',
  cts: 'typescript',
  
  // Web
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  vue: 'vue',
  svelte: 'svelte',
  
  // Data/Config
  json: 'json',
  jsonc: 'jsonc',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  
  // Systems
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  c: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  swift: 'swift',
  rb: 'ruby',
  php: 'php',
  
  // Shell
  sh: 'shellscript',
  bash: 'shellscript',
  zsh: 'shellscript',
  ps1: 'powershell',
  psm1: 'powershell',
  bat: 'bat',
  cmd: 'bat',
  
  // Documentation
  md: 'markdown',
  mdx: 'mdx',
  rst: 'restructuredtext',
  txt: 'plaintext',
  
  // Other
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  cmake: 'cmake',
};

/**
 * Special filenames that have specific languages
 */
const FILENAME_TO_LANGUAGE: Record<string, string> = {
  dockerfile: 'dockerfile',
  'docker-compose.yml': 'yaml',
  'docker-compose.yaml': 'yaml',
  makefile: 'makefile',
  'cmakelists.txt': 'cmake',
  '.gitignore': 'ignore',
  '.dockerignore': 'ignore',
  '.env': 'dotenv',
  '.env.local': 'dotenv',
  '.env.development': 'dotenv',
  '.env.production': 'dotenv',
  '.editorconfig': 'editorconfig',
  '.prettierrc': 'json',
  '.eslintrc': 'json',
  'tsconfig.json': 'jsonc',
  'jsconfig.json': 'jsonc',
  'package.json': 'json',
  'package-lock.json': 'json',
  'yarn.lock': 'yaml',
  'pnpm-lock.yaml': 'yaml',
  'cargo.toml': 'toml',
  'go.mod': 'go.mod',
  'go.sum': 'go.sum',
};

/**
 * Detect language from file path
 */
export function detectLanguage(filePath: string): string {
  const filename = getFilename(filePath).toLowerCase();
  
  // Check exact filename match first
  if (FILENAME_TO_LANGUAGE[filename]) {
    return FILENAME_TO_LANGUAGE[filename];
  }
  
  // Check extension
  const ext = getExtension(filePath);
  if (EXTENSION_TO_LANGUAGE[ext]) {
    return EXTENSION_TO_LANGUAGE[ext];
  }
  
  return 'plaintext';
}

/**
 * Check if a file is a text file based on extension
 */
export function isTextFile(filePath: string): boolean {
  const textExtensions = new Set([
    // Code
    'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts',
    'py', 'rs', 'go', 'java', 'kt', 'c', 'cpp', 'h', 'hpp', 'cs', 'swift', 'rb', 'php',
    // Web
    'html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte',
    // Data/Config
    'json', 'jsonc', 'yaml', 'yml', 'toml', 'xml', 'ini', 'cfg', 'conf',
    // Shell
    'sh', 'bash', 'zsh', 'ps1', 'psm1', 'bat', 'cmd',
    // Documentation
    'md', 'mdx', 'rst', 'txt', 'log',
    // Other
    'sql', 'graphql', 'gql', 'env', 'gitignore', 'dockerignore', 'editorconfig',
  ]);
  
  const ext = getExtension(filePath);
  return textExtensions.has(ext);
}

/**
 * Check if a file is a binary file based on extension
 */
export function isBinaryFile(filePath: string): boolean {
  const binaryExtensions = new Set([
    // Images
    'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'svg', 'webp', 'avif',
    // Documents
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    // Archives
    'zip', 'tar', 'gz', 'rar', '7z', 'bz2',
    // Executables
    'exe', 'dll', 'so', 'dylib', 'bin',
    // Media
    'mp3', 'mp4', 'wav', 'avi', 'mov', 'mkv', 'webm',
    // Fonts
    'ttf', 'otf', 'woff', 'woff2', 'eot',
    // Other
    'db', 'sqlite', 'lock',
  ]);
  
  const ext = getExtension(filePath);
  return binaryExtensions.has(ext);
}

// =============================================================================
// Path Validation
// =============================================================================

/**
 * Check if a path is absolute
 */
export function isAbsolutePath(inputPath: string): boolean {
  return _isAbsolute(inputPath);
}

/**
 * Check if a path looks like a valid path (basic validation)
 */
export function isValidPath(inputPath: string): boolean {
  if (!inputPath || typeof inputPath !== 'string') {
    return false;
  }
  
  // Check for null bytes
  if (inputPath.includes('\0')) {
    return false;
  }
  
  // Check for very long paths (Windows limit)
  if (inputPath.length > 260 && typeof process !== 'undefined' && process.platform === 'win32') {
    return false;
  }
  
  return true;
}

/**
 * Check if a path component is a hidden file/directory
 */
export function isHidden(inputPath: string): boolean {
  const filename = getFilename(inputPath);
  return filename.startsWith('.');
}

// =============================================================================
// Glob/Pattern Helpers
// =============================================================================

/**
 * Convert a simple glob pattern to a regex
 */
export function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape special regex chars
    .replace(/\*/g, '.*')                   // * -> .*
    .replace(/\?/g, '.');                   // ? -> .
  
  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * Check if a path matches a simple glob pattern
 */
export function matchesGlob(inputPath: string, pattern: string): boolean {
  const normalizedPath = normalizePath(inputPath);
  const regex = globToRegex(pattern);
  return regex.test(normalizedPath);
}

/**
 * Filter paths that match any of the given patterns
 */
export function filterPaths(paths: string[], patterns: string[]): string[] {
  const regexes = patterns.map(globToRegex);
  return paths.filter(p => {
    const normalized = normalizePath(p);
    return regexes.some(r => r.test(normalized));
  });
}

/**
 * Filter paths that don't match any of the given patterns (exclusion)
 */
export function excludePaths(paths: string[], patterns: string[]): string[] {
  const regexes = patterns.map(globToRegex);
  return paths.filter(p => {
    const normalized = normalizePath(p);
    return !regexes.some(r => r.test(normalized));
  });
}

// =============================================================================
// Exports as PathUtils class for backward compatibility
// =============================================================================

export const PathUtils = {
  normalize: normalizePath,
  normalizePreserveTrailing: normalizePathPreserveTrailing,
  isWithinDirectory,
  pathsEqual,
  comparePaths,
  getRelativePath,
  getExtension,
  getBasename,
  getDirname,
  getFilename,
  join: joinPaths,
  resolve: resolvePath,
  ensureTrailingSlash,
  removeTrailingSlash,
  detectLanguage,
  isTextFile,
  isBinaryFile,
  isAbsolute: isAbsolutePath,
  isValid: isValidPath,
  isHidden,
  globToRegex,
  matchesGlob,
  filterPaths,
  excludePaths,
};
