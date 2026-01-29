/**
 * Workspace Analyzer
 *
 * Analyzes and maps workspace structure for semantic context:
 * - Directory structure analysis
 * - File pattern detection
 * - Project type inference
 * - Entry point identification
 * - Module relationship mapping
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createLogger } from '../../logger';

const logger = createLogger('WorkspaceAnalyzer');

// =============================================================================
// Types
// =============================================================================

export interface WorkspaceStructure {
  /** Root path */
  rootPath: string;
  /** Project type (typescript, javascript, python, rust, go, etc.) */
  projectType: string;
  /** Framework if detected (react, next, vue, express, etc.) */
  framework?: string;
  /** Package manager (npm, pnpm, yarn, bun) */
  packageManager?: string;
  /** Source directories */
  sourceDirectories: string[];
  /** Test directories */
  testDirectories: string[];
  /** Config files found */
  configFiles: string[];
  /** Entry points */
  entryPoints: string[];
  /** Key directories with descriptions */
  keyDirectories: DirectoryInfo[];
  /** File statistics */
  fileStats: FileStatistics;
  /** Analysis timestamp */
  analyzedAt: number;
}

export interface DirectoryInfo {
  /** Relative path from workspace root */
  path: string;
  /** Directory purpose/description */
  purpose: string;
  /** Primary language */
  primaryLanguage?: string;
  /** Number of files */
  fileCount: number;
  /** File types present */
  fileTypes: string[];
}

export interface FileStatistics {
  /** Total files */
  totalFiles: number;
  /** Files by extension */
  byExtension: Record<string, number>;
  /** Files by language */
  byLanguage: Record<string, number>;
  /** Total lines of code (estimated) */
  estimatedLinesOfCode: number;
}

// =============================================================================
// Constants
// =============================================================================

const SOURCE_DIRS = new Set(['src', 'lib', 'app', 'pages', 'components', 'modules', 'packages', 'core']);
const TEST_DIRS = new Set(['test', 'tests', '__tests__', 'spec', 'e2e', 'integration']);
const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.cache',
  '__pycache__', '.vite', 'out', '.turbo', 'coverage', '.nyc_output',
  'vendor', 'target', '.gradle', '.idea', '.vscode', '.DS_Store',
]);

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python', '.pyi': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin', '.kts': 'kotlin',
  '.cs': 'csharp',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.c': 'c', '.h': 'c', '.hpp': 'cpp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.scala': 'scala',
  '.vue': 'vue',
  '.svelte': 'svelte',
};

const ENTRY_POINT_PATTERNS = [
  'index.ts', 'index.tsx', 'index.js', 'index.jsx',
  'main.ts', 'main.tsx', 'main.js', 'main.jsx',
  'app.ts', 'app.tsx', 'app.js', 'app.jsx',
  'server.ts', 'server.js',
  'mod.rs', 'lib.rs', 'main.rs',
  'main.go',
  'main.py', 'app.py', '__main__.py',
  'Main.java', 'Application.java',
  'Program.cs',
];

// =============================================================================
// Directory Purpose Detection
// =============================================================================

const DIRECTORY_PURPOSES: Record<string, string> = {
  'src': 'Main source code',
  'lib': 'Library code',
  'app': 'Application code',
  'pages': 'Page components (Next.js/routing)',
  'components': 'Reusable UI components',
  'hooks': 'Custom React hooks',
  'utils': 'Utility functions',
  'helpers': 'Helper functions',
  'services': 'Service layer / API clients',
  'api': 'API routes/endpoints',
  'routes': 'Route definitions',
  'controllers': 'Controller logic',
  'models': 'Data models',
  'types': 'Type definitions',
  'interfaces': 'Interface definitions',
  'constants': 'Constant values',
  'config': 'Configuration files',
  'public': 'Static public assets',
  'static': 'Static assets',
  'assets': 'Asset files (images, fonts)',
  'styles': 'Style files (CSS, SCSS)',
  'store': 'State management',
  'state': 'State management',
  'reducers': 'Redux reducers',
  'actions': 'Redux actions',
  'selectors': 'Redux selectors',
  'middleware': 'Middleware functions',
  'plugins': 'Plugin modules',
  'features': 'Feature modules',
  'modules': 'Feature modules',
  'layouts': 'Layout components',
  'templates': 'Template files',
  'views': 'View components',
  'screens': 'Screen components',
  'contexts': 'React contexts',
  'providers': 'Context providers',
  'test': 'Test files',
  'tests': 'Test files',
  '__tests__': 'Jest test files',
  'spec': 'Specification tests',
  'e2e': 'End-to-end tests',
  'integration': 'Integration tests',
  'fixtures': 'Test fixtures',
  'mocks': 'Mock implementations',
  'docs': 'Documentation',
  'scripts': 'Build/utility scripts',
  'tools': 'Development tools',
  'bin': 'Executable scripts',
  'core': 'Core functionality',
  'shared': 'Shared code across modules',
  'common': 'Common utilities',
  'vendor': 'Third-party code',
  'main': 'Main process (Electron)',
  'renderer': 'Renderer process (Electron)',
  'preload': 'Preload scripts (Electron)',
};

// =============================================================================
// Workspace Analyzer
// =============================================================================

export class WorkspaceAnalyzer {
  private cachedStructure: WorkspaceStructure | null = null;
  private cacheExpiry = 0;
  private readonly cacheDuration = 5 * 60 * 1000; // 5 minutes

  /**
   * Analyze workspace structure
   */
  async analyze(workspacePath: string, forceRefresh = false): Promise<WorkspaceStructure> {
    // Check cache
    if (!forceRefresh && this.cachedStructure && Date.now() < this.cacheExpiry) {
      if (this.cachedStructure.rootPath === workspacePath) {
        return this.cachedStructure;
      }
    }

    const startTime = Date.now();

    try {
      const configFiles = await this.findConfigFiles(workspacePath);
      const projectType = this.detectProjectType(configFiles);
      const framework = this.detectFramework(configFiles);
      const packageManager = this.detectPackageManager(configFiles);

      const directories = await this.analyzeDirectories(workspacePath);
      const sourceDirectories = directories.filter(d => 
        SOURCE_DIRS.has(d.path.split('/')[0]) || d.purpose.includes('source')
      ).map(d => d.path);
      const testDirectories = directories.filter(d =>
        TEST_DIRS.has(d.path.split('/')[0]) || d.purpose.includes('test')
      ).map(d => d.path);

      const entryPoints = await this.findEntryPoints(workspacePath);
      const fileStats = await this.computeFileStats(workspacePath);

      const structure: WorkspaceStructure = {
        rootPath: workspacePath,
        projectType,
        framework,
        packageManager,
        sourceDirectories,
        testDirectories,
        configFiles,
        entryPoints,
        keyDirectories: directories,
        fileStats,
        analyzedAt: Date.now(),
      };

      // Update cache
      this.cachedStructure = structure;
      this.cacheExpiry = Date.now() + this.cacheDuration;

      logger.info('Workspace analyzed', {
        projectType,
        framework,
        totalFiles: fileStats.totalFiles,
        durationMs: Date.now() - startTime,
      });

      return structure;
    } catch (error) {
      logger.error('Failed to analyze workspace', {
        workspacePath,
        error: error instanceof Error ? error.message : String(error),
      });
      
      // Return minimal structure on error
      return {
        rootPath: workspacePath,
        projectType: 'unknown',
        sourceDirectories: [],
        testDirectories: [],
        configFiles: [],
        entryPoints: [],
        keyDirectories: [],
        fileStats: { totalFiles: 0, byExtension: {}, byLanguage: {}, estimatedLinesOfCode: 0 },
        analyzedAt: Date.now(),
      };
    }
  }

  /**
   * Find config files in workspace root
   */
  private async findConfigFiles(workspacePath: string): Promise<string[]> {
    const configPatterns = [
      'package.json', 'tsconfig.json', 'jsconfig.json',
      'vite.config.*', 'next.config.*', 'webpack.config.*',
      'angular.json', 'vue.config.*', 'svelte.config.*',
      'Cargo.toml', 'go.mod', 'go.sum',
      'requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile',
      '.eslintrc.*', '.prettierrc.*', 'biome.json',
      'docker-compose.yml', 'Dockerfile',
      'forge.config.ts', 'electron-builder.json',
    ];

    const found: string[] = [];

    try {
      const entries = await fs.readdir(workspacePath);
      for (const entry of entries) {
        for (const pattern of configPatterns) {
          if (pattern.includes('*')) {
            const prefix = pattern.split('*')[0];
            if (entry.startsWith(prefix)) {
              found.push(entry);
            }
          } else if (entry === pattern) {
            found.push(entry);
          }
        }
      }
    } catch {
      // Ignore errors
    }

    return found;
  }

  /**
   * Detect project type from config files
   */
  private detectProjectType(configFiles: string[]): string {
    if (configFiles.includes('Cargo.toml')) return 'rust';
    if (configFiles.includes('go.mod')) return 'go';
    if (configFiles.some(f => ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'].includes(f))) return 'python';
    if (configFiles.includes('tsconfig.json')) return 'typescript';
    if (configFiles.includes('package.json')) return 'javascript';
    return 'unknown';
  }

  /**
   * Detect framework from config files
   */
  private detectFramework(configFiles: string[]): string | undefined {
    if (configFiles.some(f => f.startsWith('next.config'))) return 'nextjs';
    if (configFiles.some(f => f.startsWith('vite.config'))) return 'vite';
    if (configFiles.includes('angular.json')) return 'angular';
    if (configFiles.some(f => f.startsWith('vue.config'))) return 'vue';
    if (configFiles.some(f => f.startsWith('svelte.config'))) return 'svelte';
    if (configFiles.some(f => f.startsWith('forge.config'))) return 'electron-forge';
    if (configFiles.includes('electron-builder.json')) return 'electron';
    return undefined;
  }

  /**
   * Detect package manager
   */
  private detectPackageManager(configFiles: string[]): string | undefined {
    // Check for lock files
    for (const config of configFiles) {
      if (config.includes('pnpm-lock')) return 'pnpm';
      if (config.includes('yarn.lock')) return 'yarn';
      if (config.includes('bun.lockb')) return 'bun';
      if (config.includes('package-lock')) return 'npm';
    }
    return undefined;
  }

  /**
   * Analyze directory structure
   */
  private async analyzeDirectories(workspacePath: string, maxDepth = 3): Promise<DirectoryInfo[]> {
    const directories: DirectoryInfo[] = [];

    const scan = async (dirPath: string, relativePath: string, depth: number): Promise<void> => {
      if (depth > maxDepth) return;

      let entries;
      try {
        entries = await fs.readdir(dirPath, { withFileTypes: true });
      } catch {
        return;
      }

      const files = entries.filter(e => e.isFile());
      const dirs = entries.filter(e => e.isDirectory() && !IGNORED_DIRS.has(e.name) && !e.name.startsWith('.'));

      if (files.length > 0 && relativePath) {
        const dirName = path.basename(relativePath);
        const purpose = DIRECTORY_PURPOSES[dirName] || this.inferPurpose(dirName, files);
        const fileTypes = [...new Set(files.map(f => path.extname(f.name).toLowerCase()).filter(Boolean))];
        const primaryLanguage = this.getPrimaryLanguage(fileTypes);

        directories.push({
          path: relativePath,
          purpose,
          primaryLanguage,
          fileCount: files.length,
          fileTypes,
        });
      }

      // Recurse into subdirectories
      for (const dir of dirs) {
        const fullPath = path.join(dirPath, dir.name);
        const newRelativePath = relativePath ? `${relativePath}/${dir.name}` : dir.name;
        await scan(fullPath, newRelativePath, depth + 1);
      }
    };

    await scan(workspacePath, '', 0);
    return directories;
  }

  /**
   * Infer directory purpose from name and contents
   */
  private inferPurpose(dirName: string, files: { name: string }[]): string {
    const lowerName = dirName.toLowerCase();
    
    // Check for test patterns
    if (files.some(f => f.name.includes('.test.') || f.name.includes('.spec.'))) {
      return 'Test files';
    }
    
    // Check for component patterns
    if (files.some(f => f.name.endsWith('.tsx') || f.name.endsWith('.jsx'))) {
      if (lowerName.includes('component') || lowerName.includes('ui')) {
        return 'UI components';
      }
    }
    
    // Check for hook patterns
    if (files.some(f => f.name.startsWith('use') && (f.name.endsWith('.ts') || f.name.endsWith('.js')))) {
      return 'Custom hooks';
    }
    
    return 'Source files';
  }

  /**
   * Get primary language from file types
   */
  private getPrimaryLanguage(fileTypes: string[]): string | undefined {
    const langCounts: Record<string, number> = {};
    for (const ext of fileTypes) {
      const lang = LANGUAGE_EXTENSIONS[ext];
      if (lang) {
        langCounts[lang] = (langCounts[lang] || 0) + 1;
      }
    }
    
    let maxLang: string | undefined;
    let maxCount = 0;
    for (const [lang, count] of Object.entries(langCounts)) {
      if (count > maxCount) {
        maxCount = count;
        maxLang = lang;
      }
    }
    
    return maxLang;
  }

  /**
   * Find entry points
   */
  private async findEntryPoints(workspacePath: string): Promise<string[]> {
    const entryPoints: string[] = [];

    // Check root directory
    for (const pattern of ENTRY_POINT_PATTERNS) {
      try {
        const filePath = path.join(workspacePath, pattern);
        await fs.access(filePath);
        entryPoints.push(pattern);
      } catch {
        // File doesn't exist
      }
    }

    // Check src directory
    try {
      const srcPath = path.join(workspacePath, 'src');
      await fs.access(srcPath);
      for (const pattern of ENTRY_POINT_PATTERNS) {
        try {
          const filePath = path.join(srcPath, pattern);
          await fs.access(filePath);
          entryPoints.push(`src/${pattern}`);
        } catch {
          // File doesn't exist
        }
      }
    } catch {
      // src doesn't exist
    }

    return entryPoints;
  }

  /**
   * Compute file statistics
   */
  private async computeFileStats(workspacePath: string): Promise<FileStatistics> {
    const byExtension: Record<string, number> = {};
    const byLanguage: Record<string, number> = {};
    let totalFiles = 0;
    let estimatedLines = 0;

    const scan = async (dirPath: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(dirPath, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
            await scan(path.join(dirPath, entry.name));
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (ext) {
            byExtension[ext] = (byExtension[ext] || 0) + 1;
            const lang = LANGUAGE_EXTENSIONS[ext];
            if (lang) {
              byLanguage[lang] = (byLanguage[lang] || 0) + 1;
            }
          }
          totalFiles++;

          // Estimate lines (rough estimate: avg 50 lines per file for code files)
          if (LANGUAGE_EXTENSIONS[ext]) {
            try {
              const stat = await fs.stat(path.join(dirPath, entry.name));
              // Rough estimate: 30 bytes per line
              estimatedLines += Math.round(stat.size / 30);
            } catch {
              estimatedLines += 50; // Fallback
            }
          }
        }
      }
    };

    await scan(workspacePath);

    return {
      totalFiles,
      byExtension,
      byLanguage,
      estimatedLinesOfCode: estimatedLines,
    };
  }

  /**
   * Get a summary string for context
   */
  getSummary(structure: WorkspaceStructure): string {
    const lines: string[] = [];
    
    lines.push(`Project: ${structure.projectType}${structure.framework ? ` (${structure.framework})` : ''}`);
    
    if (structure.packageManager) {
      lines.push(`Package Manager: ${structure.packageManager}`);
    }
    
    lines.push(`Files: ${structure.fileStats.totalFiles} (~${Math.round(structure.fileStats.estimatedLinesOfCode / 1000)}k LOC)`);
    
    const topLangs = Object.entries(structure.fileStats.byLanguage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([lang, count]) => `${lang}: ${count}`)
      .join(', ');
    if (topLangs) {
      lines.push(`Languages: ${topLangs}`);
    }
    
    if (structure.sourceDirectories.length > 0) {
      lines.push(`Source: ${structure.sourceDirectories.slice(0, 3).join(', ')}`);
    }
    
    return lines.join('\n');
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cachedStructure = null;
    this.cacheExpiry = 0;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let analyzerInstance: WorkspaceAnalyzer | null = null;

/**
 * Get the singleton analyzer instance
 */
export function getWorkspaceAnalyzer(): WorkspaceAnalyzer {
  if (!analyzerInstance) {
    analyzerInstance = new WorkspaceAnalyzer();
  }
  return analyzerInstance;
}

/**
 * Reset the analyzer (for testing)
 */
export function resetWorkspaceAnalyzer(): void {
  if (analyzerInstance) {
    analyzerInstance.clearCache();
    analyzerInstance = null;
  }
}
