/**
 * TypeScript Language Service Diagnostics
 *
 * Provides real-time workspace-wide diagnostics using TypeScript's Language Service API.
 * This is the same approach VS Code uses for its Problems panel - incremental compilation
 * with proper file watching for instant feedback.
 *
 * Features:
 * - Real-time diagnostics as files change
 * - Incremental compilation (only affected files recompiled)
 * - Event-based push model (like VS Code)
 * - Workspace-wide error detection
 * - Efficient caching with smart invalidation
 */

import { EventEmitter } from 'node:events';
import * as ts from 'typescript';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { Logger } from '../../logger';

// =============================================================================
// Types
// =============================================================================

export interface Diagnostic {
  filePath: string;
  fileName: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  source: 'typescript';
  code?: string | number;
  category: ts.DiagnosticCategory;
}

export interface DiagnosticsSnapshot {
  diagnostics: Diagnostic[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  hintCount: number;
  filesWithErrors: string[];
  timestamp: number;
}

export interface TypeScriptDiagnosticsServiceConfig {
  /** Debounce time for file changes (ms) */
  debounceMs: number;
  /** Maximum diagnostics to return */
  maxDiagnostics: number;
  /** Include suggestion diagnostics */
  includeSuggestions: boolean;
  /** Ignore patterns for files */
  ignorePatterns: string[];
}

export const DEFAULT_TS_DIAGNOSTICS_CONFIG: TypeScriptDiagnosticsServiceConfig = {
  debounceMs: 250,
  maxDiagnostics: 1000,
  includeSuggestions: false,
  ignorePatterns: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
};

export interface DiagnosticsEvent {
  type: 'diagnostics-updated' | 'file-diagnostics' | 'diagnostics-cleared';
  snapshot?: DiagnosticsSnapshot;
  filePath?: string;
  diagnostics?: Diagnostic[];
}

// =============================================================================
// TypeScriptDiagnosticsService
// =============================================================================

export class TypeScriptDiagnosticsService extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: TypeScriptDiagnosticsServiceConfig;
  
  private workspacePath: string | null = null;
  private languageService: ts.LanguageService | null = null;
  private languageServiceHost: TypeScriptLanguageServiceHost | null = null;
  private currentSnapshot: DiagnosticsSnapshot | null = null;
  
  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingFiles: Set<string> = new Set();
  private isInitialized = false;

  constructor(logger: Logger, config: Partial<TypeScriptDiagnosticsServiceConfig> = {}) {
    super();
    this.logger = logger;
    this.config = { ...DEFAULT_TS_DIAGNOSTICS_CONFIG, ...config };
  }

  /**
   * Initialize the diagnostics service for a workspace
   */
  async initialize(workspacePath: string): Promise<boolean> {
    try {
      this.workspacePath = workspacePath;
      
      // Find and parse tsconfig.json
      const configPath = ts.findConfigFile(
        workspacePath,
        ts.sys.fileExists,
        'tsconfig.json'
      );

      if (!configPath) {
        // No tsconfig.json - this is expected for non-TypeScript projects
        this.logger.info('No tsconfig.json found - TypeScript diagnostics disabled for this workspace', { workspacePath });
        return false;
      }

      // Parse tsconfig
      const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
      if (configFile.error) {
        this.logger.warn('Failed to read tsconfig.json - TypeScript diagnostics disabled', {
          workspacePath,
          error: ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'),
        });
        return false;
      }

      const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(configPath)
      );

      // Validate that we have files to analyze
      if (parsedConfig.fileNames.length === 0) {
        this.logger.info('No TypeScript files found in project - diagnostics disabled', { workspacePath });
        return false;
      }

      // Limit the number of files to prevent performance issues
      const maxFiles = 500;
      const fileNames = parsedConfig.fileNames.length > maxFiles 
        ? parsedConfig.fileNames.slice(0, maxFiles)
        : parsedConfig.fileNames;
      
      if (parsedConfig.fileNames.length > maxFiles) {
        this.logger.warn('Large project detected - limiting diagnostics to first 500 files', {
          totalFiles: parsedConfig.fileNames.length,
          analyzedFiles: maxFiles,
        });
      }

      // Create language service host
      this.languageServiceHost = new TypeScriptLanguageServiceHost(
        fileNames,
        parsedConfig.options,
        workspacePath,
        this.logger
      );

      // Create language service
      this.languageService = ts.createLanguageService(
        this.languageServiceHost,
        ts.createDocumentRegistry()
      );

      this.isInitialized = true;
      this.logger.info('TypeScript Diagnostics Service initialized', {
        workspacePath,
        fileCount: fileNames.length,
      });

      // Initial diagnostics collection
      await this.collectAllDiagnostics();

      return true;
    } catch (error) {
      this.logger.error('Failed to initialize TypeScript Diagnostics Service', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Handle file change notification
   */
  onFileChanged(filePath: string, changeType: 'create' | 'change' | 'delete'): void {
    if (!this.isInitialized || !this.languageServiceHost) {
      return;
    }

    // Only process TypeScript/JavaScript files
    if (!this.isRelevantFile(filePath)) {
      return;
    }

    // Ignore files matching patterns
    if (this.shouldIgnoreFile(filePath)) {
      return;
    }

    this.logger.debug('File changed, scheduling diagnostics update', { filePath, changeType });

    // Update the host's knowledge of the file
    if (changeType === 'delete') {
      this.languageServiceHost.removeFile(filePath);
    } else {
      this.languageServiceHost.updateFile(filePath);
    }

    // Add to pending files and debounce
    this.pendingFiles.add(filePath);
    this.scheduleDiagnosticsUpdate();
  }

  /**
   * Force refresh all diagnostics
   */
  async refreshAll(): Promise<DiagnosticsSnapshot> {
    if (!this.isInitialized) {
      return this.getEmptySnapshot();
    }

    this.languageServiceHost?.refreshAllFiles();
    return this.collectAllDiagnostics();
  }

  /**
   * Get current diagnostics snapshot (cached)
   */
  getSnapshot(): DiagnosticsSnapshot {
    return this.currentSnapshot || this.getEmptySnapshot();
  }

  /**
   * Get diagnostics for a specific file
   */
  getFileDiagnostics(filePath: string): Diagnostic[] {
    if (!this.isInitialized || !this.languageService) {
      return [];
    }

    return this.getDiagnosticsForFile(filePath);
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    if (this.languageService) {
      this.languageService.dispose();
    }
    
    this.languageService = null;
    this.languageServiceHost = null;
    this.currentSnapshot = null;
    this.isInitialized = false;
    this.removeAllListeners();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private scheduleDiagnosticsUpdate(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.updateDiagnosticsForPendingFiles();
    }, this.config.debounceMs);
  }

  private async updateDiagnosticsForPendingFiles(): Promise<void> {
    if (!this.isInitialized || this.pendingFiles.size === 0) {
      return;
    }

    const files = Array.from(this.pendingFiles);
    this.pendingFiles.clear();

    this.logger.debug('Updating diagnostics for changed files', { fileCount: files.length });

    // Collect diagnostics for all files (incremental)
    await this.collectAllDiagnostics();

    // Emit file-specific events for each changed file
    for (const file of files) {
      const fileDiagnostics = this.getDiagnosticsForFile(file);
      this.emit('diagnostics', {
        type: 'file-diagnostics',
        filePath: file,
        diagnostics: fileDiagnostics,
      } as DiagnosticsEvent);
    }
  }

  private async collectAllDiagnostics(): Promise<DiagnosticsSnapshot> {
    if (!this.isInitialized || !this.languageService || !this.languageServiceHost) {
      return this.getEmptySnapshot();
    }

    const startTime = Date.now();
    const allDiagnostics: Diagnostic[] = [];
    const filesWithErrors = new Set<string>();
    const program = this.languageService.getProgram();

    if (!program) {
      this.logger.warn('No TypeScript program available');
      return this.getEmptySnapshot();
    }

    // Get all source files from the program
    const sourceFiles = program.getSourceFiles().filter(sf => !sf.isDeclarationFile);

    for (const sourceFile of sourceFiles) {
      const filePath = sourceFile.fileName;
      
      if (this.shouldIgnoreFile(filePath)) {
        continue;
      }

      const fileDiagnostics = this.getDiagnosticsForFile(filePath);
      
      if (fileDiagnostics.length > 0) {
        allDiagnostics.push(...fileDiagnostics);
        
        const hasErrors = fileDiagnostics.some(d => d.severity === 'error');
        if (hasErrors) {
          filesWithErrors.add(filePath);
        }
      }

      // Limit total diagnostics
      if (allDiagnostics.length >= this.config.maxDiagnostics) {
        break;
      }
    }

    // Create snapshot
    const snapshot: DiagnosticsSnapshot = {
      diagnostics: allDiagnostics,
      errorCount: allDiagnostics.filter(d => d.severity === 'error').length,
      warningCount: allDiagnostics.filter(d => d.severity === 'warning').length,
      infoCount: allDiagnostics.filter(d => d.severity === 'info').length,
      hintCount: allDiagnostics.filter(d => d.severity === 'hint').length,
      filesWithErrors: Array.from(filesWithErrors),
      timestamp: Date.now(),
    };

    this.currentSnapshot = snapshot;

    const duration = Date.now() - startTime;
    this.logger.debug('Diagnostics collected', {
      totalDiagnostics: snapshot.diagnostics.length,
      errors: snapshot.errorCount,
      warnings: snapshot.warningCount,
      duration,
    });

    // Emit update event
    this.emit('diagnostics', {
      type: 'diagnostics-updated',
      snapshot,
    } as DiagnosticsEvent);

    return snapshot;
  }

  private getDiagnosticsForFile(filePath: string): Diagnostic[] {
    if (!this.languageService) {
      return [];
    }

    const diagnostics: Diagnostic[] = [];

    try {
      // Get syntactic diagnostics (parsing errors)
      const syntacticDiagnostics = this.languageService.getSyntacticDiagnostics(filePath);
      
      // Get semantic diagnostics (type errors)
      const semanticDiagnostics = this.languageService.getSemanticDiagnostics(filePath);

      // Get suggestion diagnostics (optional)
      const suggestionDiagnostics = this.config.includeSuggestions
        ? this.languageService.getSuggestionDiagnostics(filePath)
        : [];

      // Convert all diagnostics
      for (const diag of [...syntacticDiagnostics, ...semanticDiagnostics, ...suggestionDiagnostics]) {
        const converted = this.convertDiagnostic(diag, filePath);
        if (converted) {
          diagnostics.push(converted);
        }
      }
    } catch (error) {
      this.logger.debug('Error getting diagnostics for file', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return diagnostics;
  }

  private convertDiagnostic(diagnostic: ts.Diagnostic, filePath: string): Diagnostic | null {
    const file = diagnostic.file;
    const start = diagnostic.start ?? 0;
    const length = diagnostic.length ?? 0;

    let line = 1;
    let column = 1;
    let endLine: number | undefined;
    let endColumn: number | undefined;

    if (file) {
      const startPos = file.getLineAndCharacterOfPosition(start);
      line = startPos.line + 1; // 1-indexed
      column = startPos.character + 1;

      if (length > 0) {
        const endPos = file.getLineAndCharacterOfPosition(start + length);
        endLine = endPos.line + 1;
        endColumn = endPos.character + 1;
      }
    }

    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    const severity = this.getSeverity(diagnostic.category);
    const fileName = path.basename(filePath);

    return {
      filePath,
      fileName,
      line,
      column,
      endLine,
      endColumn,
      message,
      severity,
      source: 'typescript',
      code: diagnostic.code,
      category: diagnostic.category,
    };
  }

  private getSeverity(category: ts.DiagnosticCategory): Diagnostic['severity'] {
    switch (category) {
      case ts.DiagnosticCategory.Error:
        return 'error';
      case ts.DiagnosticCategory.Warning:
        return 'warning';
      case ts.DiagnosticCategory.Suggestion:
        return 'hint';
      case ts.DiagnosticCategory.Message:
      default:
        return 'info';
    }
  }

  private isRelevantFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'].includes(ext);
  }

  private shouldIgnoreFile(filePath: string): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/');
    return this.config.ignorePatterns.some(pattern => {
      const regexPattern = pattern
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '.');
      return new RegExp(regexPattern).test(normalizedPath);
    });
  }

  private getEmptySnapshot(): DiagnosticsSnapshot {
    return {
      diagnostics: [],
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      hintCount: 0,
      filesWithErrors: [],
      timestamp: Date.now(),
    };
  }
}

// =============================================================================
// TypeScript Language Service Host
// =============================================================================

class TypeScriptLanguageServiceHost implements ts.LanguageServiceHost {
  private readonly files: Map<string, { version: number; content: string | undefined }> = new Map();
  private readonly compilerOptions: ts.CompilerOptions;
  private readonly workspacePath: string;
  private readonly logger: Logger;
  private fileNames: string[];

  constructor(
    fileNames: string[],
    compilerOptions: ts.CompilerOptions,
    workspacePath: string,
    logger: Logger
  ) {
    this.fileNames = fileNames;
    this.compilerOptions = compilerOptions;
    this.workspacePath = workspacePath;
    this.logger = logger;

    // Initialize file versions
    for (const fileName of fileNames) {
      this.files.set(fileName, { version: 0, content: undefined });
    }
  }

  getScriptFileNames(): string[] {
    return this.fileNames;
  }

  getScriptVersion(fileName: string): string {
    const file = this.files.get(fileName);
    return file ? file.version.toString() : '0';
  }

  getScriptSnapshot(fileName: string): ts.IScriptSnapshot | undefined {
    let content: string | undefined;

    // Try cached content first
    const cached = this.files.get(fileName);
    if (cached?.content !== undefined) {
      content = cached.content;
    } else {
      // Read from disk
      try {
        content = fs.readFileSync(fileName, 'utf-8');
        // Cache it
        if (cached) {
          cached.content = content;
        }
      } catch {
        return undefined;
      }
    }

    return ts.ScriptSnapshot.fromString(content);
  }

  getCurrentDirectory(): string {
    return this.workspacePath;
  }

  getCompilationSettings(): ts.CompilerOptions {
    return this.compilerOptions;
  }

  getDefaultLibFileName(options: ts.CompilerOptions): string {
    return ts.getDefaultLibFilePath(options);
  }

  fileExists(path: string): boolean {
    return ts.sys.fileExists(path);
  }

  readFile(path: string): string | undefined {
    return ts.sys.readFile(path);
  }

  readDirectory(
    path: string,
    extensions?: readonly string[],
    exclude?: readonly string[],
    include?: readonly string[],
    depth?: number
  ): string[] {
    return ts.sys.readDirectory(path, extensions, exclude, include, depth);
  }

  directoryExists(directoryName: string): boolean {
    return ts.sys.directoryExists(directoryName);
  }

  getDirectories(directoryName: string): string[] {
    return ts.sys.getDirectories(directoryName);
  }

  /**
   * Update a file (marks it as changed, invalidates cache)
   */
  updateFile(filePath: string): void {
    const existing = this.files.get(filePath);
    if (existing) {
      existing.version++;
      existing.content = undefined; // Invalidate cache
    } else {
      // New file
      this.files.set(filePath, { version: 0, content: undefined });
      if (!this.fileNames.includes(filePath)) {
        this.fileNames.push(filePath);
      }
    }
  }

  /**
   * Remove a file from tracking
   */
  removeFile(filePath: string): void {
    this.files.delete(filePath);
    this.fileNames = this.fileNames.filter(f => f !== filePath);
  }

  /**
   * Refresh all files (invalidate all caches)
   */
  refreshAllFiles(): void {
    for (const [fileName, file] of this.files) {
      file.version++;
      file.content = undefined;

      // Keep `fileNames` in sync with tracked files.
      // This avoids subtle issues where a file is tracked but missing from the root names list.
      if (!this.fileNames.includes(fileName)) {
        this.fileNames.push(fileName);
      }
    }
  }
}

// =============================================================================
// Singleton Access
// =============================================================================

let instance: TypeScriptDiagnosticsService | null = null;

export function initTypeScriptDiagnosticsService(
  logger: Logger,
  config?: Partial<TypeScriptDiagnosticsServiceConfig>
): TypeScriptDiagnosticsService {
  if (instance) {
    instance.dispose();
  }
  instance = new TypeScriptDiagnosticsService(logger, config);
  return instance;
}

export function getTypeScriptDiagnosticsService(): TypeScriptDiagnosticsService | null {
  return instance;
}
