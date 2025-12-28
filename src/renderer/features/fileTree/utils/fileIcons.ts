/**
 * File Icons Utility
 * 
 * Maps file extensions and folder names to appropriate icons.
 * Uses Lucide React icons for consistency with the app.
 */

import {
  File,
  FileCode,
  FileJson,
  FileText,
  FileType,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileSpreadsheet,
  Folder,
  FolderOpen,
  FolderGit,
  FolderCode,
  FolderCog,
  Database,
  Lock,
  Settings,
  Package,
  Globe,
  Braces,
  Hash,
  Terminal,
  type LucideIcon,
} from 'lucide-react';

// =============================================================================
// File Extension to Icon Mapping
// =============================================================================

const FILE_ICON_MAP: Record<string, LucideIcon> = {
  // JavaScript/TypeScript
  js: FileCode,
  jsx: FileCode,
  ts: FileCode,
  tsx: FileCode,
  mjs: FileCode,
  cjs: FileCode,
  
  // Web
  html: Globe,
  htm: Globe,
  css: FileCode,
  scss: FileCode,
  sass: FileCode,
  less: FileCode,
  vue: FileCode,
  svelte: FileCode,
  
  // Data/Config
  json: FileJson,
  yaml: FileJson,
  yml: FileJson,
  toml: FileJson,
  xml: FileJson,
  csv: FileSpreadsheet,
  
  // Documentation
  md: FileText,
  mdx: FileText,
  txt: FileText,
  rtf: FileText,
  doc: FileText,
  docx: FileText,
  pdf: FileText,
  
  // Programming Languages
  py: FileCode,
  rb: FileCode,
  php: FileCode,
  java: FileCode,
  kt: FileCode,
  go: FileCode,
  rs: FileCode,
  c: FileCode,
  cpp: FileCode,
  h: FileCode,
  hpp: FileCode,
  cs: FileCode,
  swift: FileCode,
  scala: FileCode,
  r: FileCode,
  lua: FileCode,
  pl: FileCode,
  sh: Terminal,
  bash: Terminal,
  zsh: Terminal,
  fish: Terminal,
  ps1: Terminal,
  bat: Terminal,
  cmd: Terminal,
  
  // Images
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  svg: FileImage,
  webp: FileImage,
  ico: FileImage,
  bmp: FileImage,
  
  // Video
  mp4: FileVideo,
  webm: FileVideo,
  avi: FileVideo,
  mov: FileVideo,
  mkv: FileVideo,
  
  // Audio
  mp3: FileAudio,
  wav: FileAudio,
  ogg: FileAudio,
  flac: FileAudio,
  aac: FileAudio,
  
  // Archives
  zip: FileArchive,
  tar: FileArchive,
  gz: FileArchive,
  rar: FileArchive,
  '7z': FileArchive,
  
  // Database
  sql: Database,
  db: Database,
  sqlite: Database,
  
  // Config files
  env: Lock,
  lock: Lock,
  
  // Fonts
  ttf: FileType,
  otf: FileType,
  woff: FileType,
  woff2: FileType,
  eot: FileType,
};

// =============================================================================
// Special File Names to Icon Mapping
// =============================================================================

const SPECIAL_FILE_MAP: Record<string, LucideIcon> = {
  'package.json': Package,
  'package-lock.json': Package,
  'yarn.lock': Package,
  'pnpm-lock.yaml': Package,
  'tsconfig.json': Settings,
  'jsconfig.json': Settings,
  '.eslintrc': Settings,
  '.eslintrc.js': Settings,
  '.eslintrc.json': Settings,
  '.prettierrc': Settings,
  '.prettierrc.js': Settings,
  '.prettierrc.json': Settings,
  'vite.config.ts': Settings,
  'vite.config.js': Settings,
  'webpack.config.js': Settings,
  'rollup.config.js': Settings,
  '.gitignore': FolderGit,
  '.gitattributes': FolderGit,
  'Dockerfile': Braces,
  'docker-compose.yml': Braces,
  'docker-compose.yaml': Braces,
  '.dockerignore': Braces,
  'Makefile': Hash,
  'CMakeLists.txt': Hash,
};

// =============================================================================
// Folder Name to Icon Mapping
// =============================================================================

const FOLDER_ICON_MAP: Record<string, { closed: LucideIcon; open: LucideIcon }> = {
  '.git': { closed: FolderGit, open: FolderGit },
  '.github': { closed: FolderGit, open: FolderGit },
  '.vscode': { closed: FolderCog, open: FolderCog },
  '.idea': { closed: FolderCog, open: FolderCog },
  'node_modules': { closed: Package, open: Package },
  'src': { closed: FolderCode, open: FolderCode },
  'lib': { closed: FolderCode, open: FolderCode },
  'dist': { closed: FolderCode, open: FolderCode },
  'build': { closed: FolderCode, open: FolderCode },
  'out': { closed: FolderCode, open: FolderCode },
  'config': { closed: FolderCog, open: FolderCog },
  'configs': { closed: FolderCog, open: FolderCog },
  'test': { closed: FolderCode, open: FolderCode },
  'tests': { closed: FolderCode, open: FolderCode },
  '__tests__': { closed: FolderCode, open: FolderCode },
  'spec': { closed: FolderCode, open: FolderCode },
  'specs': { closed: FolderCode, open: FolderCode },
};

// =============================================================================
// Icon Getter Functions
// =============================================================================

// Cache for file icon lookups to avoid repeated string operations
const fileIconCache = new Map<string, LucideIcon>();
const MAX_CACHE_SIZE = 500;

/**
 * Get icon for a file based on its name and extension
 * Uses caching to optimize repeated lookups for the same filename
 */
export function getFileIcon(filename: string): LucideIcon {
  // Check cache first
  const cached = fileIconCache.get(filename);
  if (cached) {
    return cached;
  }
  
  let icon: LucideIcon;
  
  // Check special file names first
  const lowerName = filename.toLowerCase();
  if (SPECIAL_FILE_MAP[lowerName]) {
    icon = SPECIAL_FILE_MAP[lowerName];
  } else {
    // Check by extension
    const lastDot = filename.lastIndexOf('.');
    if (lastDot > 0) {
      const ext = filename.slice(lastDot + 1).toLowerCase();
      icon = FILE_ICON_MAP[ext] || File;
    } else {
      icon = File;
    }
  }
  
  // Cache the result (with size limit to prevent memory leaks)
  if (fileIconCache.size >= MAX_CACHE_SIZE) {
    // Clear oldest entries (simple approach: clear half the cache)
    const keysToDelete = Array.from(fileIconCache.keys()).slice(0, MAX_CACHE_SIZE / 2);
    keysToDelete.forEach(key => fileIconCache.delete(key));
  }
  fileIconCache.set(filename, icon);
  
  return icon;
}

/**
 * Get icon for a folder based on its name
 */
export function getFolderIcon(folderName: string, isOpen: boolean): LucideIcon {
  const lowerName = folderName.toLowerCase();
  const mapping = FOLDER_ICON_MAP[lowerName];
  
  if (mapping) {
    return isOpen ? mapping.open : mapping.closed;
  }
  
  return isOpen ? FolderOpen : Folder;
}

/**
 * Get icon color class based on file type
 */
export function getIconColorClass(filename: string, type: 'file' | 'directory'): string {
  if (type === 'directory') {
    return 'text-[var(--color-accent-secondary)]';
  }
  
  const lastDot = filename.lastIndexOf('.');
  if (lastDot > 0) {
    const ext = filename.slice(lastDot + 1).toLowerCase();
    
    // JavaScript/TypeScript - yellow
    if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) {
      return 'text-yellow-500';
    }
    if (['ts', 'tsx'].includes(ext)) {
      return 'text-blue-500';
    }
    
    // Web - orange/pink
    if (['html', 'htm'].includes(ext)) {
      return 'text-orange-500';
    }
    if (['css', 'scss', 'sass', 'less'].includes(ext)) {
      return 'text-pink-500';
    }
    
    // Data - green
    if (['json', 'yaml', 'yml', 'xml'].includes(ext)) {
      return 'text-green-500';
    }
    
    // Documentation - gray
    if (['md', 'mdx', 'txt'].includes(ext)) {
      return 'text-[var(--color-text-muted)]';
    }
    
    // Images - purple
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
      return 'text-purple-500';
    }
  }
  
  return 'text-[var(--color-text-dim)]';
}

/**
 * Get text color class based on git status
 */
export function getGitStatusColor(status: string | null): string {
  switch (status) {
    case 'modified':
      return 'text-yellow-500';
    case 'added':
    case 'untracked':
      return 'text-green-500';
    case 'deleted':
      return 'text-red-500';
    case 'renamed':
      return 'text-blue-500';
    case 'conflicted':
      return 'text-red-600';
    case 'staged':
      return 'text-blue-400';
    case 'ignored':
      return 'text-gray-500 opacity-60';
    default:
      return '';
  }
}
