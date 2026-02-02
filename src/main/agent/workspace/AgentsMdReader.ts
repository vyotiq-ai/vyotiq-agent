/**
 * AGENTS.md Reader Service
 * 
 * Reads and parses AGENTS.md files from the workspace following the
 * AGENTS.md specification (https://agents.md/).
 * 
 * Features:
 * - Discovers all AGENTS.md files in the workspace
 * - Supports nested AGENTS.md files (closest to current file wins)
 * - Parses markdown sections for structured access
 * - Caches content with file modification time validation
 * - Hierarchical content resolution
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AgentsMdFile, AgentsMdSection, AgentsMdContext } from '../../../shared/types';
import { createLogger } from '../../logger';

const logger = createLogger('AgentsMdReader');

// Cache for AGENTS.md files
interface CachedAgentsMd {
  file: AgentsMdFile;
  cachedAt: number;
}

// File names to look for (in order of preference)
const AGENTS_MD_FILENAMES = ['AGENTS.md', 'agents.md', 'AGENT.md', 'agent.md'];

// Cache TTL (5 minutes)
const CACHE_TTL_MS = 5 * 60 * 1000;

// Max file size to read (1MB)
const MAX_FILE_SIZE = 1024 * 1024;

/**
 * AgentsMdReader - Discovers and parses AGENTS.md files
 */
export class AgentsMdReader {
  private cache: Map<string, CachedAgentsMd> = new Map();
  private workspacePath: string | null = null;
  private lastScanTime: number = 0;
  private discoveredFiles: string[] = [];

  /**
   * Set the workspace path for scanning
   */
  setWorkspace(workspacePath: string): void {
    if (this.workspacePath !== workspacePath) {
      this.workspacePath = workspacePath;
      this.cache.clear();
      this.discoveredFiles = [];
      this.lastScanTime = 0;
      logger.debug('Workspace set for AGENTS.md scanning', { workspacePath });
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    this.discoveredFiles = [];
    this.lastScanTime = 0;
    logger.debug('AGENTS.md cache cleared');
  }

  /**
   * Discover all AGENTS.md files in the workspace
   */
  async discoverFiles(): Promise<string[]> {
    if (!this.workspacePath) {
      return [];
    }

    // Use cached discovery if recent enough
    if (Date.now() - this.lastScanTime < CACHE_TTL_MS && this.discoveredFiles.length > 0) {
      return this.discoveredFiles;
    }

    const files: string[] = [];
    
    try {
      await this.scanDirectory(this.workspacePath, files);
      this.discoveredFiles = files;
      this.lastScanTime = Date.now();
      
      logger.info('Discovered AGENTS.md files', { 
        count: files.length,
        files: files.map(f => path.relative(this.workspacePath!, f)),
      });
    } catch (error) {
      logger.error('Error discovering AGENTS.md files', { error });
    }

    return files;
  }

  /**
   * Recursively scan directory for AGENTS.md files
   */
  private async scanDirectory(dir: string, files: string[], depth: number = 0): Promise<void> {
    // Limit recursion depth to avoid scanning too deep
    if (depth > 10) return;

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isFile()) {
          // Check if it's an AGENTS.md file
          if (AGENTS_MD_FILENAMES.includes(entry.name)) {
            files.push(fullPath);
          }
        } else if (entry.isDirectory()) {
          // Skip common directories that shouldn't contain AGENTS.md
          const skipDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__', '.venv', 'venv'];
          if (!skipDirs.includes(entry.name) && !entry.name.startsWith('.')) {
            await this.scanDirectory(fullPath, files, depth + 1);
          }
        }
      }
    } catch (error) {
      // Ignore permission errors and continue
      if ((error as NodeJS.ErrnoException).code !== 'EACCES') {
        logger.debug('Error scanning directory', { dir, error });
      }
    }
  }

  /**
   * Read and parse an AGENTS.md file
   */
  async readFile(filePath: string): Promise<AgentsMdFile | null> {
    // Check cache first
    const cached = this.cache.get(filePath);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      // Verify mtime hasn't changed
      try {
        const stat = await fs.stat(filePath);
        if (stat.mtimeMs === cached.file.mtime) {
          return cached.file;
        }
      } catch {
        // File may have been deleted
        this.cache.delete(filePath);
        return null;
      }
    }

    try {
      const stat = await fs.stat(filePath);
      
      // Skip files that are too large
      if (stat.size > MAX_FILE_SIZE) {
        logger.warn('AGENTS.md file too large, skipping', { filePath, size: stat.size });
        return null;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const relativePath = this.workspacePath 
        ? path.relative(this.workspacePath, filePath)
        : filePath;

      // Calculate depth from workspace root
      const depth = relativePath === '' || relativePath === '.' 
        ? 0 
        : relativePath.split(path.sep).filter(p => p && p !== '.').length - 1;

      const file: AgentsMdFile = {
        filePath,
        relativePath,
        content,
        mtime: stat.mtimeMs,
        depth: Math.max(0, depth),
        sections: this.parseSections(content),
      };

      // Cache the file
      this.cache.set(filePath, {
        file,
        cachedAt: Date.now(),
      });

      logger.debug('Read AGENTS.md file', { 
        filePath: relativePath,
        sectionsCount: file.sections.length,
      });

      return file;
    } catch (error) {
      logger.error('Error reading AGENTS.md file', { filePath, error });
      return null;
    }
  }

  /**
   * Parse markdown content into sections
   */
  private parseSections(content: string): AgentsMdSection[] {
    const sections: AgentsMdSection[] = [];
    const lines = content.split('\n');
    
    let currentSection: AgentsMdSection | null = null;
    let contentLines: string[] = [];

    for (const line of lines) {
      // Check for heading
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      
      if (headingMatch) {
        // Save previous section
        if (currentSection) {
          currentSection.content = contentLines.join('\n').trim();
          sections.push(currentSection);
        }

        // Start new section
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

    // Save last section
    if (currentSection) {
      currentSection.content = contentLines.join('\n').trim();
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * Get the AGENTS.md context for a given file path
   * Uses hierarchical resolution - closest AGENTS.md wins
   */
  async getContextForFile(activeFilePath?: string): Promise<AgentsMdContext> {
    if (!this.workspacePath) {
      return {
        found: false,
        allFiles: [],
        combinedContent: '',
        scannedAt: Date.now(),
      };
    }

    // Discover all files
    const filePaths = await this.discoverFiles();
    
    if (filePaths.length === 0) {
      return {
        found: false,
        allFiles: [],
        combinedContent: '',
        scannedAt: Date.now(),
      };
    }

    // Read all files
    const allFiles: AgentsMdFile[] = [];
    for (const fp of filePaths) {
      const file = await this.readFile(fp);
      if (file) {
        allFiles.push(file);
      }
    }

    if (allFiles.length === 0) {
      return {
        found: false,
        allFiles: [],
        combinedContent: '',
        scannedAt: Date.now(),
      };
    }

    // Find the primary file (closest to active file or workspace root)
    let primary = this.findClosestFile(allFiles, activeFilePath);
    
    // If no active file, use the root AGENTS.md
    if (!primary) {
      primary = allFiles.find(f => 
        path.dirname(f.filePath) === this.workspacePath
      ) ?? allFiles[0];
    }

    // Build combined content following hierarchy
    const combinedContent = this.buildCombinedContent(allFiles, activeFilePath);

    return {
      found: true,
      primary,
      allFiles,
      combinedContent,
      scannedAt: Date.now(),
    };
  }

  /**
   * Find the closest AGENTS.md file to a given file path
   */
  private findClosestFile(files: AgentsMdFile[], targetPath?: string): AgentsMdFile | undefined {
    if (!targetPath || !this.workspacePath) {
      return undefined;
    }

    // Normalize paths
    const targetDir = path.dirname(targetPath);
    
    // Sort files by how close they are to the target
    const sortedFiles = files
      .map(file => {
        const fileDir = path.dirname(file.filePath);
        // Check if file is in an ancestor directory of target
        const isAncestor = targetDir.startsWith(fileDir);
        const depth = isAncestor 
          ? targetDir.replace(fileDir, '').split(path.sep).filter(Boolean).length
          : Infinity;
        return { file, depth, isAncestor };
      })
      .filter(item => item.isAncestor)
      .sort((a, b) => a.depth - b.depth);

    return sortedFiles[0]?.file;
  }

  /**
   * Build combined content from all applicable AGENTS.md files
   * Respects hierarchy: more specific (nested) files take precedence
   */
  private buildCombinedContent(files: AgentsMdFile[], activeFilePath?: string): string {
    if (files.length === 0) return '';

    // If there's an active file, find applicable files in order
    if (activeFilePath && this.workspacePath) {
      const targetDir = path.dirname(activeFilePath);
      
      // Get files that apply to this path, sorted from root to most specific
      const applicableFiles = files
        .filter(file => {
          const fileDir = path.dirname(file.filePath);
          return targetDir.startsWith(fileDir) || targetDir === fileDir;
        })
        .sort((a, b) => {
          const aDir = path.dirname(a.filePath);
          const bDir = path.dirname(b.filePath);
          return aDir.length - bDir.length; // Shorter paths (root) first
        });

      if (applicableFiles.length > 0) {
        // Combine content with more specific files overriding
        // For now, we concatenate with the most specific last
        const parts = applicableFiles.map(file => {
          const header = file.relativePath !== 'AGENTS.md' && file.relativePath !== 'agents.md'
            ? `<!-- From: ${file.relativePath} -->\n`
            : '';
          return header + file.content;
        });
        return parts.join('\n\n---\n\n');
      }
    }

    // Default: just use the root AGENTS.md
    const rootFile = files.find(f => 
      path.dirname(f.filePath) === this.workspacePath
    ) ?? files[0];
    
    return rootFile.content;
  }

  /**
   * Get a summary of discovered AGENTS.md files
   */
  async getSummary(): Promise<{
    found: boolean;
    fileCount: number;
    files: Array<{ path: string; sectionsCount: number }>;
  }> {
    const context = await this.getContextForFile();
    
    return {
      found: context.found,
      fileCount: context.allFiles.length,
      files: context.allFiles.map(f => ({
        path: f.relativePath,
        sectionsCount: f.sections.length,
      })),
    };
  }
}

// Singleton instance
let instance: AgentsMdReader | null = null;

/**
 * Get the singleton AgentsMdReader instance
 */
export function getAgentsMdReader(): AgentsMdReader {
  if (!instance) {
    instance = new AgentsMdReader();
  }
  return instance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetAgentsMdReader(): void {
  if (instance) {
    instance.clearCache();
  }
  instance = null;
}
