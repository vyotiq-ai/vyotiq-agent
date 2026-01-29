import path from 'node:path';

/**
 * Comprehensive MIME type mapping for files
 * Organized by category for better maintainability
 */
const MIME_TYPES: Record<string, string> = {
  // Programming Languages
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.js': 'text/javascript',
  '.jsx': 'text/javascript',
  '.mjs': 'text/javascript',
  '.cjs': 'text/javascript',
  '.py': 'text/x-python',
  '.rb': 'text/x-ruby',
  '.rs': 'text/x-rust',
  '.go': 'text/x-go',
  '.java': 'text/x-java',
  '.kt': 'text/x-kotlin',
  '.swift': 'text/x-swift',
  '.c': 'text/x-c',
  '.cpp': 'text/x-c++',
  '.cc': 'text/x-c++',
  '.h': 'text/x-c',
  '.hpp': 'text/x-c++',
  '.cs': 'text/x-csharp',
  '.php': 'text/x-php',
  '.scala': 'text/x-scala',
  '.clj': 'text/x-clojure',
  '.ex': 'text/x-elixir',
  '.exs': 'text/x-elixir',
  '.erl': 'text/x-erlang',
  '.hs': 'text/x-haskell',
  '.lua': 'text/x-lua',
  '.pl': 'text/x-perl',
  '.r': 'text/x-r',
  '.dart': 'text/x-dart',
  '.vue': 'text/x-vue',
  '.svelte': 'text/x-svelte',

  // Data & Config
  '.json': 'application/json',
  '.jsonc': 'application/json',
  '.json5': 'application/json',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.toml': 'text/toml',
  '.xml': 'application/xml',
  '.ini': 'text/plain',
  '.cfg': 'text/plain',
  '.conf': 'text/plain',
  '.env': 'text/plain',
  '.properties': 'text/plain',

  // Web Technologies
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.scss': 'text/x-scss',
  '.sass': 'text/x-sass',
  '.less': 'text/x-less',

  // Documentation
  '.md': 'text/markdown',
  '.mdx': 'text/markdown',
  '.rst': 'text/x-rst',
  '.txt': 'text/plain',
  '.rtf': 'application/rtf',
  '.pdf': 'application/pdf',

  // Shell & Scripts
  '.sh': 'text/x-sh',
  '.bash': 'text/x-sh',
  '.zsh': 'text/x-sh',
  '.fish': 'text/x-fish',
  '.ps1': 'text/x-powershell',
  '.psm1': 'text/x-powershell',
  '.bat': 'text/x-bat',
  '.cmd': 'text/x-bat',

  // Images
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',

  // Audio
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.wma': 'audio/x-ms-wma',

  // Video
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',

  // Archives
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.7z': 'application/x-7z-compressed',
  '.rar': 'application/vnd.rar',
  '.bz2': 'application/x-bzip2',

  // Documents
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.csv': 'text/csv',

  // Fonts
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',

  // SQL & Database
  '.sql': 'application/sql',
  '.sqlite': 'application/x-sqlite3',
  '.db': 'application/octet-stream',

  // Build & Package files
  '.lock': 'text/plain',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
};

/**
 * Image MIME types for quick lookup
 */
const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
  'image/bmp',
  'image/tiff',
  'image/avif',
  'image/heic',
  'image/heif',
]);

/**
 * Text-based MIME types that can be displayed as text
 */
const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/html',
  'text/css',
  'text/javascript',
  'text/typescript',
  'text/markdown',
  'text/yaml',
  'text/csv',
  'text/xml',
  'application/json',
  'application/xml',
  'application/javascript',
]);

/**
 * Guess MIME type from file path or extension
 * @param filePath - File path or just the extension (e.g., ".png")
 * @returns MIME type string
 */
export const guessMimeType = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
};

/**
 * Guess MIME type from extension only (without path parsing)
 * @param extension - Extension with or without dot (e.g., "png" or ".png")
 * @returns MIME type string
 */
export const getMimeTypeFromExtension = (extension: string): string => {
  const ext = extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  return MIME_TYPES[ext] ?? 'application/octet-stream';
};

/**
 * Check if a MIME type represents an image
 * @param mimeType - MIME type to check
 * @returns true if the MIME type is an image type
 */
export const isImageMimeType = (mimeType: string): boolean => {
  return IMAGE_MIME_TYPES.has(mimeType) || mimeType.startsWith('image/');
};

/**
 * Check if a MIME type represents text content
 * @param mimeType - MIME type to check
 * @returns true if the MIME type can be displayed as text
 */
export const isTextMimeType = (mimeType: string): boolean => {
  return TEXT_MIME_TYPES.has(mimeType) || 
         mimeType.startsWith('text/') ||
         mimeType.includes('json') ||
         mimeType.includes('xml') ||
         mimeType.includes('javascript');
};

/**
 * Get file category based on MIME type
 * @param mimeType - MIME type to categorize
 * @returns Category string
 */
export const getFileCategory = (mimeType: string): 'image' | 'video' | 'audio' | 'document' | 'code' | 'archive' | 'other' => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('text/') || TEXT_MIME_TYPES.has(mimeType)) return 'code';
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('compressed')) return 'archive';
  if (mimeType.includes('document') || mimeType.includes('pdf') || mimeType.includes('word') || mimeType.includes('excel')) return 'document';
  return 'other';
};

/**
 * Get appropriate encoding for a MIME type
 * @param mimeType - MIME type to check
 * @returns 'utf-8' for text types, 'base64' for binary types
 */
export const getEncodingForMimeType = (mimeType: string): 'utf-8' | 'base64' => {
  return isTextMimeType(mimeType) ? 'utf-8' : 'base64';
};
