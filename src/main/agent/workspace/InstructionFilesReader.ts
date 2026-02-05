/**
 * Instruction Files Reader Service
 * 
 * Extended reader that discovers and parses multiple types of instruction files
 * following the 2025-2026 multi-agent specification standards:
 * - AGENTS.md - Open standard (Linux Foundation) - https://agents.md/
 * - CLAUDE.md - Anthropic Claude Code
 * - .github/copilot-instructions.md - GitHub Copilot
 * - .github/instructions/*.md - Path-specific GitHub Copilot
 * - GEMINI.md - Google Gemini CLI
 * - .cursor/rules - Cursor editor
 * 
 * Features:
 * - Discovers all instruction files in the workspace
 * - Parses YAML frontmatter for metadata
 * - Supports file-level enable/disable configuration
 * - Respects priority ordering from config and frontmatter
 * - Caches content with file modification time validation
 * - Hierarchical content resolution
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  AgentsMdSection,
  InstructionFile,
  InstructionFileType,
  InstructionFileFrontmatter,
  InstructionFilesConfig,
  InstructionFilesContext,
} from '../../../shared/types';
import { createLogger } from '../../logger';

const logger = createLogger('InstructionFilesReader');

// =============================================================================
// File Discovery Patterns
// =============================================================================

/**
 * Patterns for discovering instruction files
 */
interface FilePattern {
  type: InstructionFileType;
  /** File names to match (case-insensitive) */
  fileNames?: string[];
  /** Directory paths relative to workspace root */
  directories?: string[];
  /** Glob pattern for matching */
  pattern?: string;
  /** Default priority for this type (lower = higher priority) */
  defaultPriority: number;
  /** Config key to check if enabled */
  configKey: keyof InstructionFilesConfig;
}

const FILE_PATTERNS: FilePattern[] = [
  {
    type: 'agents-md',
    fileNames: ['AGENTS.md', 'agents.md', 'AGENT.md', 'agent.md'],
    defaultPriority: 10,
    configKey: 'enableAgentsMd',
  },
  {
    type: 'claude-md',
    fileNames: ['CLAUDE.md', 'claude.md', 'CLAUDE.local.md', 'claude.local.md'],
    directories: ['.claude'],
    defaultPriority: 20,
    configKey: 'enableClaudeMd',
  },
  {
    type: 'copilot-instructions',
    directories: ['.github'],
    fileNames: ['copilot-instructions.md'],
    defaultPriority: 30,
    configKey: 'enableCopilotInstructions',
  },
  {
    type: 'github-instructions',
    directories: ['.github/instructions'],
    pattern: '*.instructions.md',
    defaultPriority: 35,
    configKey: 'enableGithubInstructions',
  },
  {
    type: 'gemini-md',
    fileNames: ['GEMINI.md', 'gemini.md'],
    defaultPriority: 40,
    configKey: 'enableGeminiMd',
  },
  {
    type: 'cursor-rules',
    directories: ['.cursor'],
    fileNames: ['rules', 'rules.md'],
    defaultPriority: 50,
    configKey: 'enableCursorRules',
  },
];

// =============================================================================
// Cache Types
// =============================================================================

interface CachedInstructionFile {
  file: InstructionFile;
  cachedAt: number;
}

// Cache TTL (5 minutes)
const CACHE_TTL_MS = 5 * 60 * 1000;

// Max file size to read (1MB)
const MAX_FILE_SIZE = 1024 * 1024;

// Max recursion depth for directory scanning
const MAX_SCAN_DEPTH = 10;

// Directories to skip during scanning
const SKIP_DIRECTORIES = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  '.cache',
  '.turbo',
  'out',
];

// =============================================================================
// Frontmatter Parsing
// =============================================================================

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): { frontmatter?: InstructionFileFrontmatter; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { body: content };
  }

  try {
    const yamlContent = match[1];
    const frontmatter: InstructionFileFrontmatter = {};

    // Simple YAML parser for common fields
    const lines = yamlContent.split('\n');
    let currentKey: string | null = null;
    let currentArrayValue: string[] = [];
    let inArray = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Array item
      if (trimmed.startsWith('- ') && inArray && currentKey) {
        currentArrayValue.push(trimmed.slice(2).trim().replace(/^['"]|['"]$/g, ''));
        continue;
      }

      // Save previous array if we were in one
      if (inArray && currentKey && currentArrayValue.length > 0) {
        (frontmatter as Record<string, unknown>)[currentKey] = currentArrayValue;
        currentArrayValue = [];
        inArray = false;
      }

      // Key-value pair
      const kvMatch = trimmed.match(/^(\w+):\s*(.*)$/);
      if (kvMatch) {
        const [, key, value] = kvMatch;
        currentKey = key;

        if (!value || value === '') {
          // Might be an array starting on next lines
          inArray = true;
          currentArrayValue = [];
        } else if (value.startsWith('[') && value.endsWith(']')) {
          // Inline array
          const items = value.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
          (frontmatter as Record<string, unknown>)[key] = items.filter(Boolean);
        } else if (value === 'true' || value === 'false') {
          // Boolean
          (frontmatter as Record<string, unknown>)[key] = value === 'true';
        } else if (/^\d+$/.test(value)) {
          // Number
          (frontmatter as Record<string, unknown>)[key] = parseInt(value, 10);
        } else {
          // String (remove quotes if present)
          (frontmatter as Record<string, unknown>)[key] = value.replace(/^['"]|['"]$/g, '');
        }
      }
    }

    // Save final array if needed
    if (inArray && currentKey && currentArrayValue.length > 0) {
      (frontmatter as Record<string, unknown>)[currentKey] = currentArrayValue;
    }

    const body = content.slice(match[0].length);
    return { frontmatter, body };
  } catch (error) {
    logger.debug('Failed to parse frontmatter', { error });
    return { body: content };
  }
}

/**
 * Parse markdown content into sections
 */
function parseSections(content: string): AgentsMdSection[] {
  const sections: AgentsMdSection[] = [];
  const lines = content.split('\n');

  let currentSection: AgentsMdSection | null = null;
  let contentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      if (currentSection) {
        currentSection.content = contentLines.join('\n').trim();
        sections.push(currentSection);
      }

      currentSection = {
        heading: headingMatch[2].trim(),
        level: headingMatch[1].length,
        content: '',
      };
      contentLines = [];
    } else {
      contentLines.push(line);
    }
  }

  if (currentSection) {
    currentSection.content = contentLines.join('\n').trim();
    sections.push(currentSection);
  }

  return sections;
}

// =============================================================================
// InstructionFilesReader Class
// =============================================================================

/**
 * InstructionFilesReader - Discovers and parses all instruction file types
 */
export class InstructionFilesReader {
  private cache: Map<string, CachedInstructionFile> = new Map();
  private workspacePath: string | null = null;
  private lastScanTime: number = 0;
  private discoveredFiles: InstructionFile[] = [];
  private config: InstructionFilesConfig;

  constructor(config?: Partial<InstructionFilesConfig>) {
    // Import the default config at runtime to avoid circular dependencies
    this.config = {
      enableAgentsMd: true,
      enableClaudeMd: true,
      enableCopilotInstructions: true,
      enableGithubInstructions: true,
      enableGeminiMd: true,
      enableCursorRules: true,
      fileOverrides: {},
      maxCombinedContentLength: 32000,
      showSourcesInPrompt: true,
      ...config,
    };
  }

  /**
   * Set the workspace path for scanning
   */
  setWorkspace(workspacePath: string): void {
    if (this.workspacePath !== workspacePath) {
      this.workspacePath = workspacePath;
      this.cache.clear();
      this.discoveredFiles = [];
      this.lastScanTime = 0;
      logger.debug('Workspace set for instruction files scanning', { workspacePath });
    }
  }

  /**
   * Update the configuration
   */
  setConfig(config: Partial<InstructionFilesConfig>): void {
    this.config = { ...this.config, ...config };
    // Clear cache when config changes
    this.cache.clear();
    this.discoveredFiles = [];
    this.lastScanTime = 0;
  }

  /**
   * Get current configuration
   */
  getConfig(): InstructionFilesConfig {
    return { ...this.config };
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    this.discoveredFiles = [];
    this.lastScanTime = 0;
    logger.debug('Instruction files cache cleared');
  }

  /**
   * Discover all instruction files in the workspace
   */
  async discoverFiles(): Promise<InstructionFile[]> {
    if (!this.workspacePath) {
      return [];
    }

    // Use cached discovery if recent enough
    if (Date.now() - this.lastScanTime < CACHE_TTL_MS && this.discoveredFiles.length > 0) {
      return this.discoveredFiles;
    }

    const allFiles: InstructionFile[] = [];
    const errors: Array<{ path: string; error: string }> = [];

    try {
      for (const pattern of FILE_PATTERNS) {
        // Check if this type is enabled in config
        if (!this.config[pattern.configKey]) {
          continue;
        }

        const files = await this.discoverByPattern(pattern, errors);
        allFiles.push(...files);
      }

      // Sort by priority (lower = higher priority)
      allFiles.sort((a, b) => {
        const priorityA = a.priorityOverride ?? a.frontmatter?.priority ?? this.getDefaultPriority(a.type);
        const priorityB = b.priorityOverride ?? b.frontmatter?.priority ?? this.getDefaultPriority(b.type);
        return priorityA - priorityB;
      });

      this.discoveredFiles = allFiles;
      this.lastScanTime = Date.now();

      logger.info('Discovered instruction files', {
        count: allFiles.length,
        types: [...new Set(allFiles.map(f => f.type))],
        files: allFiles.map(f => f.relativePath),
      });

      if (errors.length > 0) {
        logger.warn('Errors during instruction file discovery', { errors });
      }

      return allFiles;
    } catch (error) {
      logger.error('Error discovering instruction files', { error });
      return [];
    }
  }

  /**
   * Discover files matching a specific pattern
   */
  private async discoverByPattern(
    pattern: FilePattern,
    errors: Array<{ path: string; error: string }>
  ): Promise<InstructionFile[]> {
    const files: InstructionFile[] = [];

    if (!this.workspacePath) return files;

    // Scan for files matching the pattern
    if (pattern.directories) {
      for (const dir of pattern.directories) {
        const dirPath = path.join(this.workspacePath, dir);
        try {
          const stat = await fs.stat(dirPath);
          if (stat.isDirectory()) {
            if (pattern.pattern) {
              // Match pattern in directory
              const entries = await fs.readdir(dirPath);
              for (const entry of entries) {
                if (this.matchesPattern(entry, pattern.pattern)) {
                  const filePath = path.join(dirPath, entry);
                  const file = await this.readFile(filePath, pattern.type);
                  if (file) files.push(file);
                }
              }
            } else if (pattern.fileNames) {
              // Match specific file names in directory
              for (const fileName of pattern.fileNames) {
                const filePath = path.join(dirPath, fileName);
                try {
                  const file = await this.readFile(filePath, pattern.type);
                  if (file) files.push(file);
                } catch {
                  // File doesn't exist - expected behavior when scanning optional locations
                }
              }
            }
          }
        } catch {
          // Directory doesn't exist - expected for optional instruction file locations
        }
      }
    }

    if (pattern.fileNames) {
      // Also scan workspace root and subdirectories for these file names
      const rootFiles = await this.scanForFileNames(
        this.workspacePath,
        pattern.fileNames,
        pattern.type,
        0,
        errors
      );
      files.push(...rootFiles);
    }

    return files;
  }

  /**
   * Recursively scan for specific file names
   */
  private async scanForFileNames(
    dir: string,
    fileNames: string[],
    type: InstructionFileType,
    depth: number,
    errors: Array<{ path: string; error: string }>
  ): Promise<InstructionFile[]> {
    if (depth > MAX_SCAN_DEPTH) return [];

    const files: InstructionFile[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isFile()) {
          const nameLower = entry.name.toLowerCase();
          if (fileNames.some(fn => fn.toLowerCase() === nameLower)) {
            const file = await this.readFile(fullPath, type);
            if (file) files.push(file);
          }
        } else if (entry.isDirectory()) {
          // Skip certain directories
          if (SKIP_DIRECTORIES.includes(entry.name) || entry.name.startsWith('.')) {
            continue;
          }
          const subFiles = await this.scanForFileNames(fullPath, fileNames, type, depth + 1, errors);
          files.push(...subFiles);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EACCES') {
        errors.push({
          path: dir,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return files;
  }

  /**
   * Check if a filename matches a glob-like pattern
   */
  private matchesPattern(fileName: string, pattern: string): boolean {
    // Simple pattern matching for *.extension patterns
    if (pattern.startsWith('*')) {
      return fileName.endsWith(pattern.slice(1));
    }
    return fileName === pattern;
  }

  /**
   * Read and parse an instruction file
   */
  async readFile(filePath: string, type: InstructionFileType): Promise<InstructionFile | null> {
    // Check cache first
    const cached = this.cache.get(filePath);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      try {
        const stat = await fs.stat(filePath);
        if (stat.mtimeMs === cached.file.mtime) {
          return cached.file;
        }
      } catch {
        this.cache.delete(filePath);
        return null;
      }
    }

    try {
      const stat = await fs.stat(filePath);

      if (stat.size > MAX_FILE_SIZE) {
        logger.warn('Instruction file too large, skipping', { filePath, size: stat.size });
        return null;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const relativePath = this.workspacePath
        ? path.relative(this.workspacePath, filePath)
        : filePath;

      // Parse frontmatter
      const { frontmatter, body } = parseFrontmatter(content);

      // Calculate depth from workspace root
      const depth = relativePath === '' || relativePath === '.'
        ? 0
        : relativePath.split(path.sep).filter(p => p && p !== '.').length - 1;

      // Check for file-level override
      const override = this.config.fileOverrides[relativePath];
      const enabled = override?.enabled ?? true;
      const priorityOverride = override?.priority;

      const file: InstructionFile = {
        filePath,
        relativePath,
        content: body,
        mtime: stat.mtimeMs,
        depth: Math.max(0, depth),
        sections: parseSections(body),
        type,
        frontmatter,
        enabled,
        priorityOverride,
        source: 'workspace',
      };

      // Cache the file
      this.cache.set(filePath, {
        file,
        cachedAt: Date.now(),
      });

      logger.debug('Read instruction file', {
        filePath: relativePath,
        type,
        sectionsCount: file.sections.length,
        hasFrontmatter: !!frontmatter,
      });

      return file;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.debug('Error reading instruction file', { filePath, error });
      }
      return null;
    }
  }

  /**
   * Get default priority for an instruction file type
   */
  private getDefaultPriority(type: InstructionFileType): number {
    const pattern = FILE_PATTERNS.find(p => p.type === type);
    return pattern?.defaultPriority ?? 100;
  }

  /**
   * Get the instruction files context for a given file path
   */
  async getContextForFile(activeFilePath?: string): Promise<InstructionFilesContext> {
    if (!this.workspacePath) {
      return {
        found: false,
        allFiles: [],
        enabledFiles: [],
        combinedContent: '',
        scannedAt: Date.now(),
        errors: [],
        config: this.config,
      };
    }

    // Discover all files
    const allFiles = await this.discoverFiles();

    if (allFiles.length === 0) {
      return {
        found: false,
        allFiles: [],
        enabledFiles: [],
        combinedContent: '',
        scannedAt: Date.now(),
        errors: [],
        config: this.config,
      };
    }

    // Filter to enabled files
    const enabledFiles = allFiles.filter(f => f.enabled);

    // Build combined content following priority and hierarchy
    const combinedContent = this.buildCombinedContent(enabledFiles, activeFilePath);

    return {
      found: true,
      allFiles,
      enabledFiles,
      combinedContent,
      scannedAt: Date.now(),
      errors: [],
      config: this.config,
    };
  }

  /**
   * Build combined content from all applicable instruction files
   */
  private buildCombinedContent(files: InstructionFile[], activeFilePath?: string): string {
    if (files.length === 0) return '';

    // Filter files applicable to the active file path
    let applicableFiles = files;

    if (activeFilePath && this.workspacePath) {
      const targetDir = path.dirname(activeFilePath);

      // Check frontmatter paths for path-specific files
      applicableFiles = files.filter(file => {
        // Files without path restrictions always apply
        if (!file.frontmatter?.paths || file.frontmatter.paths.length === 0) {
          // But check if file is in an ancestor directory
          const fileDir = path.dirname(file.filePath);
          return targetDir.startsWith(fileDir) || targetDir === fileDir || file.depth === 0;
        }

        // Check if any path pattern matches
        return file.frontmatter.paths.some(pattern => {
          // Simple glob matching
          if (pattern.includes('*')) {
            const regex = new RegExp(
              '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
            );
            return regex.test(activeFilePath) || regex.test(path.relative(this.workspacePath!, activeFilePath));
          }
          return activeFilePath.includes(pattern) || path.relative(this.workspacePath!, activeFilePath).includes(pattern);
        });
      });
    }

    // Sort by priority (already sorted, but re-sort applicable files)
    applicableFiles.sort((a, b) => {
      const priorityA = a.priorityOverride ?? a.frontmatter?.priority ?? this.getDefaultPriority(a.type);
      const priorityB = b.priorityOverride ?? b.frontmatter?.priority ?? this.getDefaultPriority(b.type);
      return priorityA - priorityB;
    });

    // Build combined content with source markers
    const parts: string[] = [];
    let totalLength = 0;

    for (const file of applicableFiles) {
      const content = file.content.trim();
      if (!content) continue;

      // Check length limit
      if (totalLength + content.length > this.config.maxCombinedContentLength) {
        logger.warn('Combined instruction content exceeds limit, truncating', {
          currentLength: totalLength,
          maxLength: this.config.maxCombinedContentLength,
          remainingFiles: applicableFiles.length - parts.length,
        });
        break;
      }

      if (this.config.showSourcesInPrompt && file.relativePath !== 'AGENTS.md') {
        parts.push(`<!-- From: ${file.relativePath} (${file.type}) -->`);
      }
      parts.push(content);
      totalLength += content.length;
    }

    return parts.join('\n\n---\n\n');
  }

  /**
   * Get a summary of discovered instruction files
   */
  async getSummary(): Promise<{
    found: boolean;
    fileCount: number;
    enabledCount: number;
    files: Array<{
      path: string;
      type: InstructionFileType;
      enabled: boolean;
      priority: number;
      sectionsCount: number;
      hasFrontmatter: boolean;
    }>;
    byType: Record<string, number>;
  }> {
    const context = await this.getContextForFile();

    const byType: Record<string, number> = {};
    for (const file of context.allFiles) {
      byType[file.type] = (byType[file.type] || 0) + 1;
    }

    return {
      found: context.found,
      fileCount: context.allFiles.length,
      enabledCount: context.enabledFiles.length,
      files: context.allFiles.map(f => ({
        path: f.relativePath,
        type: f.type,
        enabled: f.enabled,
        priority: f.priorityOverride ?? f.frontmatter?.priority ?? this.getDefaultPriority(f.type),
        sectionsCount: f.sections.length,
        hasFrontmatter: !!f.frontmatter,
      })),
      byType,
    };
  }

  /**
   * Toggle a file's enabled status
   */
  toggleFile(relativePath: string, enabled: boolean): void {
    this.config.fileOverrides[relativePath] = {
      ...this.config.fileOverrides[relativePath],
      enabled,
    };
    // Update cached file if present
    for (const [, cached] of this.cache.entries()) {
      if (cached.file.relativePath === relativePath) {
        cached.file.enabled = enabled;
        break;
      }
    }
    // Clear discovered files to force re-discovery
    this.discoveredFiles = [];
    this.lastScanTime = 0;
  }

  /**
   * Set a file's priority override
   */
  setFilePriority(relativePath: string, priority: number): void {
    this.config.fileOverrides[relativePath] = {
      ...this.config.fileOverrides[relativePath],
      enabled: this.config.fileOverrides[relativePath]?.enabled ?? true,
      priority,
    };
    // Clear discovered files to force re-discovery
    this.discoveredFiles = [];
    this.lastScanTime = 0;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: InstructionFilesReader | null = null;

/**
 * Get the singleton InstructionFilesReader instance
 */
export function getInstructionFilesReader(): InstructionFilesReader {
  if (!instance) {
    instance = new InstructionFilesReader();
  }
  return instance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetInstructionFilesReader(): void {
  if (instance) {
    instance.clearCache();
  }
  instance = null;
}
