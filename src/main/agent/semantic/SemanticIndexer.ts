/**
 * Semantic Indexer
 *
 * Orchestrates the semantic indexing pipeline:
 * 1. Analyzes workspace structure for context
 * 2. Watches for file changes via fileWatcher integration
 * 3. Chunks files using CodeChunker
 * 4. Generates embeddings using EmbeddingService
 * 5. Stores vectors in VectorStore
 * 6. Provides semantic search capabilities
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createLogger } from '../../logger';
import { getEmbeddingService } from './EmbeddingService';
import { getVectorStore, computeContentHash, type SearchOptions, type SearchResult, type VectorDocument } from './VectorStore';
import { getCodeChunker, detectLanguage, type CodeChunk } from './CodeChunker';
import { getWorkspaceAnalyzer, type WorkspaceStructure } from './WorkspaceAnalyzer';
import { setSemanticIndexChangeHandler, getCurrentWorkspacePath } from '../../workspaces/fileWatcher';
import type { SemanticSettings } from '../../../shared/types';

const logger = createLogger('SemanticIndexer');

// =============================================================================
// Settings Callback Type
// =============================================================================

/**
 * Callback to get current semantic settings
 * This allows the indexer to check settings without tight coupling to SettingsStore
 */
export type SemanticSettingsGetter = () => SemanticSettings | undefined;

// Module-level settings getter (set by main process during initialization)
let settingsGetter: SemanticSettingsGetter | null = null;

/**
 * Set the settings getter callback
 * Called by main process to provide access to semantic settings
 */
export function setSemanticSettingsGetter(getter: SemanticSettingsGetter): void {
  settingsGetter = getter;
  logger.debug('Semantic settings getter registered');
}

/**
 * Get current semantic settings
 */
function getSemanticSettings(): SemanticSettings | undefined {
  return settingsGetter?.();
}

// =============================================================================
// Types
// =============================================================================

export interface IndexingProgress {
  /** Total files to index */
  totalFiles: number;
  /** Files indexed so far */
  indexedFiles: number;
  /** Current file being indexed */
  currentFile: string | null;
  /** Is indexing in progress */
  isIndexing: boolean;
  /** Indexing status */
  status: 'idle' | 'scanning' | 'analyzing' | 'indexing' | 'complete' | 'error' | 'downloading-model';
  /** Error message if status is error */
  error?: string;
  /** Start time */
  startTime?: number;
  /** Estimated remaining time in ms */
  estimatedTimeRemaining?: number;
  /** Files processed per second (rolling average) */
  filesPerSecond?: number;
  /** Total chunks created so far */
  totalChunks?: number;
  /** Current phase description */
  phase?: string;
  /** Model download progress (0-100) */
  modelDownloadProgress?: number;
  /** Model file being downloaded */
  modelDownloadFile?: string;
}

export interface IndexingOptions {
  /** Force reindex all files */
  forceReindex?: boolean;
  /** Only index specific file types */
  fileTypes?: string[];
  /** Exclude patterns */
  excludePatterns?: string[];
  /** Progress callback */
  onProgress?: (progress: IndexingProgress) => void;
}

export interface SemanticSearchQuery {
  /** Search query text */
  query: string;
  /** Search options */
  options?: SearchOptions;
}

export interface SemanticSearchResult {
  /** Search results */
  results: SearchResult[];
  /** Query processing time in ms */
  queryTimeMs: number;
  /** Total documents searched */
  totalDocumentsSearched: number;
}

export interface IndexerStats {
  /** Total indexed files */
  indexedFiles: number;
  /** Total chunks */
  totalChunks: number;
  /** Last indexing time */
  lastIndexTime: number | null;
  /** Index size in bytes */
  indexSizeBytes: number;
  /** Index health */
  indexHealth: 'healthy' | 'degraded' | 'needs-rebuild' | 'empty';
  /** Workspace structure summary (if analyzed) */
  workspaceInfo?: {
    projectType: string;
    framework?: string;
    totalFiles: number;
    estimatedLinesOfCode: number;
  };
  /** Embedding service info */
  embeddingInfo?: {
    isUsingOnnx: boolean;
    cacheSize: number;
    dimension: number;
    modelId?: string;
    quality?: string;
  };
}

// =============================================================================
// Constants
// =============================================================================

const INDEXABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs',
  '.py', '.pyi', '.rs', '.go', '.java', '.cs', '.cpp', '.c', '.h', '.hpp',
  '.rb', '.php', '.swift', '.kt', '.scala', '.sh', '.bash',
  '.vue', '.svelte',
]);

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.cache',
  '__pycache__', '.vite', 'out', '.turbo', 'coverage', '.nyc_output',
  'vendor', 'target', '.gradle', '.idea', '.vscode',
]);

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

// =============================================================================
// Semantic Indexer
// =============================================================================

export class SemanticIndexer {
  private isInitialized = false;
  private currentWorkspace: string | null = null;
  private workspaceStructure: WorkspaceStructure | null = null;
  private progress: IndexingProgress = {
    totalFiles: 0,
    indexedFiles: 0,
    currentFile: null,
    isIndexing: false,
    status: 'idle',
  };
  private indexingAborted = false;
  private progressCallback: ((progress: IndexingProgress) => void) | null = null;
  private pendingChanges: Map<string, 'created' | 'changed' | 'deleted'> = new Map();
  private changeDebounceTimer: NodeJS.Timeout | null = null;
  private totalChunksIndexed = 0;
  private lastIndexStartTime: number | null = null;
  private indexingMetrics = {
    filesProcessed: [] as number[],  // Timestamps for rate calculation
    chunksCreated: 0,
  };

  /**
   * Initialize the indexer
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Get semantic settings for configuration
      const settings = getSemanticSettings();

      // Initialize embedding service first to get dimension
      const embeddingService = getEmbeddingService();
      
      // Set up progress callback for model download
      embeddingService.setProgressCallback((modelProgress) => {
        if (modelProgress.status === 'downloading' && this.progressCallback) {
          this.progressCallback({
            ...this.progress,
            status: 'downloading-model',
            phase: `Downloading model: ${modelProgress.file || 'model files'}`,
            modelDownloadProgress: modelProgress.progress,
            modelDownloadFile: modelProgress.file,
          });
        } else if (modelProgress.status === 'loading' && this.progressCallback) {
          this.progressCallback({
            ...this.progress,
            status: 'downloading-model',
            phase: 'Loading embedding model...',
            modelDownloadProgress: 100,
          });
        }
      });
      
      await embeddingService.initialize();
      
      // Clear progress callback after initialization
      embeddingService.setProgressCallback(null);

      // Initialize vector store with embedding dimension
      const vectorStore = getVectorStore({
        dimension: embeddingService.embeddingDimension,
        ...(settings ? {
          hnswM: settings.hnswM,
          hnswEfSearch: settings.hnswEfSearch,
        } : {}),
      });
      await vectorStore.initialize();

      // Register file change handler
      setSemanticIndexChangeHandler(this.handleFileChange.bind(this));

      this.isInitialized = true;
      logger.info('Semantic indexer initialized', {
        hnswM: settings?.hnswM,
        hnswEfSearch: settings?.hnswEfSearch,
      });
    } catch (error) {
      logger.error('Failed to initialize semantic indexer', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Index a workspace
   */
  async indexWorkspace(workspacePath: string, options: IndexingOptions = {}): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const { forceReindex = false, fileTypes, excludePatterns, onProgress } = options;

    this.currentWorkspace = workspacePath;
    this.progressCallback = onProgress || null;
    this.indexingAborted = false;
    this.lastIndexStartTime = Date.now();
    this.indexingMetrics = { filesProcessed: [], chunksCreated: 0 };

    try {
      // Phase 1: Analyze workspace structure
      this.updateProgress({
        totalFiles: 0,
        indexedFiles: 0,
        currentFile: null,
        isIndexing: true,
        status: 'analyzing',
        startTime: Date.now(),
        phase: 'Analyzing workspace structure...',
      });

      const analyzer = getWorkspaceAnalyzer();
      this.workspaceStructure = await analyzer.analyze(workspacePath);

      if (this.indexingAborted) return;

      // Phase 2: Scan for files
      this.updateProgress({
        status: 'scanning',
        phase: 'Scanning for files to index...',
      });

      // Scan for files
      const files = await this.scanDirectory(workspacePath, fileTypes, excludePatterns);
      
      if (this.indexingAborted) return;

      // Get already indexed files if not forcing reindex
      const vectorStore = getVectorStore();
      const indexedFilePaths = forceReindex ? [] : vectorStore.getIndexedFilePaths();
      const indexedSet = new Set(indexedFilePaths);

      // Filter to only new/changed files using content hash for change detection
      let filesToIndex: string[] = [];
      if (forceReindex) {
        filesToIndex = files;
      } else {
        // Check each file for changes using content hash
        for (const file of files) {
          if (!indexedSet.has(file)) {
            // New file, needs indexing
            filesToIndex.push(file);
          } else {
            // Existing file - check if content changed using hash
            try {
              const content = await fs.readFile(file, 'utf-8');
              const contentHash = computeContentHash(content);
              if (vectorStore.needsReindex(file, contentHash)) {
                filesToIndex.push(file);
                logger.debug('File content changed, will reindex', { file, contentHash });
              }
            } catch {
              // If we can't read the file, skip it
            }
          }
        }
        logger.info('Incremental indexing check complete', {
          totalFiles: files.length,
          alreadyIndexed: indexedSet.size,
          needsReindex: filesToIndex.length,
        });
      }

      // Remove deleted files from index
      if (!forceReindex) {
        const filesSet = new Set(files);
        const deletedFiles = indexedFilePaths.filter(f => !filesSet.has(f));
        if (deletedFiles.length > 0) {
          vectorStore.deleteByFilePaths(deletedFiles);
          logger.info('Removed deleted files from index', { count: deletedFiles.length });
        }
      }

      this.updateProgress({
        totalFiles: filesToIndex.length,
        indexedFiles: 0,
        status: 'indexing',
        phase: `Indexing ${filesToIndex.length} files...`,
      });

      // Index files with periodic yielding to keep UI responsive
      const embeddingService = getEmbeddingService();
      const chunker = getCodeChunker();
      
      // Yield to event loop every N files to prevent blocking
      const YIELD_INTERVAL = 5;

      for (let i = 0; i < filesToIndex.length; i++) {
        if (this.indexingAborted) {
          logger.info('Indexing aborted');
          break;
        }

        const filePath = filesToIndex[i];

        try {
          const chunksCreated = await this.indexFile(filePath, chunker, embeddingService, vectorStore);
          this.indexingMetrics.chunksCreated += chunksCreated;
          this.indexingMetrics.filesProcessed.push(Date.now());
        } catch (error) {
          logger.warn('Failed to index file', {
            filePath,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        const elapsed = Date.now() - (this.progress.startTime || Date.now());
        const avgTimePerFile = elapsed / (i + 1);
        const remaining = filesToIndex.length - i - 1;

        // Calculate files per second (rolling window of last 10 seconds)
        const now = Date.now();
        const recentFiles = this.indexingMetrics.filesProcessed.filter(t => now - t < 10000);
        const filesPerSecond = recentFiles.length > 1 
          ? recentFiles.length / ((now - recentFiles[0]) / 1000)
          : 0;

        this.updateProgress({
          indexedFiles: i + 1,
          currentFile: filePath,
          estimatedTimeRemaining: Math.round(avgTimePerFile * remaining),
          filesPerSecond: Math.round(filesPerSecond * 10) / 10,
          totalChunks: this.indexingMetrics.chunksCreated,
          phase: `Indexing files (${Math.round(filesPerSecond * 10) / 10} files/sec)...`,
        });
        
        // Yield to event loop periodically to keep UI responsive
        if ((i + 1) % YIELD_INTERVAL === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }

      this.totalChunksIndexed = this.indexingMetrics.chunksCreated;

      this.updateProgress({
        isIndexing: false,
        status: this.indexingAborted ? 'idle' : 'complete',
        currentFile: null,
      });

      logger.info('Workspace indexing complete', {
        workspacePath,
        totalFiles: filesToIndex.length,
        timeMs: Date.now() - (this.progress.startTime || Date.now()),
      });
    } catch (error) {
      this.updateProgress({
        isIndexing: false,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Index a single file
   * @returns Number of chunks created
   */
  private async indexFile(
    filePath: string,
    chunker: ReturnType<typeof getCodeChunker>,
    embeddingService: ReturnType<typeof getEmbeddingService>,
    vectorStore: ReturnType<typeof getVectorStore>
  ): Promise<number> {
    // Read file content
    const content = await fs.readFile(filePath, 'utf-8');
    
    if (!content.trim()) {
      return 0; // Skip empty files
    }

    // Compute content hash for change detection
    const contentHash = computeContentHash(content);

    // Detect language for logging and metadata
    const language = detectLanguage(filePath);

    // Chunk the file with type annotation
    const chunks: CodeChunk[] = chunker.chunk(content, filePath);

    if (chunks.length === 0) {
      return 0;
    }

    logger.debug('Indexing file', { 
      filePath, 
      language, 
      chunkCount: chunks.length,
      contentLength: content.length,
      contentHash,
    });

    // Generate embeddings for all chunks
    const chunkContents = chunks.map(c => c.content);
    const batchResult = await embeddingService.embedBatch(chunkContents);

    // Create vector documents with content hash
    const documents: VectorDocument[] = chunks.map((chunk, idx) => ({
      id: this.generateDocumentId(filePath, chunk.index),
      filePath,
      chunkIndex: chunk.index,
      content: chunk.content,
      vector: batchResult.embeddings[idx].vector,
      metadata: {
        fileType: path.extname(filePath),
        language: chunk.language,
        symbolType: chunk.symbolType,
        symbolName: chunk.symbolName,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        contentHash, // Store hash for change detection
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    // Store in vector store
    vectorStore.upsertBatch(documents);
    
    return chunks.length;
  }

  /**
   * Perform semantic search
   */
  async search(query: SemanticSearchQuery): Promise<SemanticSearchResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const startTime = Date.now();

    const embeddingService = getEmbeddingService();
    const vectorStore = getVectorStore();

    // Generate query embedding
    const queryResult = await embeddingService.embed(query.query);

    // Search vector store
    const results = vectorStore.search(queryResult.vector, query.options);

    const stats = await vectorStore.getStats();

    return {
      results,
      queryTimeMs: Date.now() - startTime,
      totalDocumentsSearched: stats.totalDocuments,
    };
  }

  /**
   * Handle file change from file watcher
   * Uses smart debouncing with different delays for different change types
   */
  private handleFileChange(filePath: string, changeType: 'created' | 'changed' | 'deleted'): void {
    // Check if watch for changes is enabled in settings
    const settings = getSemanticSettings();
    if (settings?.watchForChanges === false) {
      logger.debug('Ignoring file change - watchForChanges is disabled', { filePath, changeType });
      return;
    }

    // Don't process changes while a full indexing is in progress
    if (this.progress.isIndexing) {
      logger.debug('Ignoring file change - indexing in progress', { filePath, changeType });
      return;
    }

    // Validate file is within current workspace
    const workspacePath = getCurrentWorkspacePath();
    if (workspacePath && !filePath.startsWith(workspacePath)) {
      logger.debug('Ignoring file change - outside workspace', { filePath, workspacePath });
      return;
    }

    // Queue change for debounced processing
    // For deleted files, keep as deleted even if later marked as changed
    const existingChange = this.pendingChanges.get(filePath);
    if (existingChange === 'deleted' && changeType !== 'created') {
      // Keep deleted status
    } else {
      this.pendingChanges.set(filePath, changeType);
    }

    // Smart debounce: shorter delay for deletions (immediate cleanup)
    // longer delay for creates/changes (wait for file to stabilize)
    const hasDeletedFiles = [...this.pendingChanges.values()].some(t => t === 'deleted');
    const debounceDelay = hasDeletedFiles ? 200 : 800;

    // Debounce processing
    if (this.changeDebounceTimer) {
      clearTimeout(this.changeDebounceTimer);
    }

    this.changeDebounceTimer = setTimeout(() => {
      this.processPendingChanges();
    }, debounceDelay);
  }

  /**
   * Process pending file changes
   * Batches changes efficiently and handles them in priority order
   */
  private async processPendingChanges(): Promise<void> {
    if (this.pendingChanges.size === 0) return;

    const changes = new Map(this.pendingChanges);
    this.pendingChanges.clear();

    const vectorStore = getVectorStore();
    const embeddingService = getEmbeddingService();
    const chunker = getCodeChunker();

    // Process deletions first (fast, no embedding needed)
    const deletedFiles = [...changes.entries()]
      .filter(([, type]) => type === 'deleted')
      .map(([path]) => path);
    
    if (deletedFiles.length > 0) {
      vectorStore.deleteByFilePaths(deletedFiles);
      logger.debug('Files removed from index', { count: deletedFiles.length });
    }

    // Process creates and changes
    const filesToIndex = [...changes.entries()]
      .filter(([, type]) => type !== 'deleted')
      .map(([path]) => path);

    for (const filePath of filesToIndex) {
      try {
        // Remove old chunks for this file first
        vectorStore.deleteByFilePath(filePath);
        // Index the file
        await this.indexFile(filePath, chunker, embeddingService, vectorStore);
        logger.debug('File reindexed', { filePath });
      } catch (error) {
        logger.warn('Failed to process file change', {
          filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Update workspace structure if many files changed
    if (changes.size >= 5 && this.currentWorkspace) {
      const analyzer = getWorkspaceAnalyzer();
      this.workspaceStructure = await analyzer.analyze(this.currentWorkspace, true);
    }
  }

  /**
   * Scan directory for indexable files
   */
  private async scanDirectory(
    dirPath: string,
    fileTypes?: string[],
    excludePatterns?: string[]
  ): Promise<string[]> {
    const files: string[] = [];
    const fileTypesSet = fileTypes ? new Set(fileTypes) : null;

    const scan = async (currentPath: string): Promise<void> => {
      if (this.indexingAborted) return;

      let entries;
      try {
        entries = await fs.readdir(currentPath, { withFileTypes: true });
      } catch {
        return; // Skip inaccessible directories
      }

      for (const entry of entries) {
        if (this.indexingAborted) return;

        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          // Skip ignored directories
          if (IGNORED_DIRS.has(entry.name)) continue;
          if (entry.name.startsWith('.')) continue;
          
          // Check exclude patterns
          if (excludePatterns?.some(p => fullPath.includes(p))) continue;

          await scan(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          
          // Check if indexable
          if (!INDEXABLE_EXTENSIONS.has(ext)) continue;
          
          // Check file types filter
          if (fileTypesSet && !fileTypesSet.has(ext)) continue;

          // Check exclude patterns
          if (excludePatterns?.some(p => fullPath.includes(p))) continue;

          // Check file size
          try {
            const stat = await fs.stat(fullPath);
            if (stat.size > MAX_FILE_SIZE) continue;
          } catch {
            continue;
          }

          files.push(fullPath);
        }
      }
    };

    await scan(dirPath);
    return files;
  }

  /**
   * Generate document ID
   */
  private generateDocumentId(filePath: string, chunkIndex: number): string {
    return `${filePath}:${chunkIndex}`;
  }

  /**
   * Update progress
   */
  private updateProgress(update: Partial<IndexingProgress>): void {
    this.progress = { ...this.progress, ...update };
    if (this.progressCallback) {
      this.progressCallback(this.progress);
    }
  }

  /**
   * Abort current indexing
   */
  abortIndexing(): void {
    this.indexingAborted = true;
  }

  /**
   * Get current progress
   */
  getProgress(): IndexingProgress {
    return { ...this.progress };
  }

  /**
   * Get indexer statistics
   */
  async getStats(): Promise<IndexerStats> {
    if (!this.isInitialized) {
      logger.debug('getStats called but indexer not initialized');
      return {
        indexedFiles: 0,
        totalChunks: 0,
        lastIndexTime: null,
        indexSizeBytes: 0,
        indexHealth: 'empty',
      };
    }

    const vectorStore = getVectorStore();
    const embeddingService = getEmbeddingService();
    const stats = await vectorStore.getStats();
    const cacheStats = embeddingService.getCacheStats();
    const isUsingOnnx = embeddingService.isUsingOnnxModel();
    
    logger.debug('getStats: embedding info', {
      isUsingOnnx,
      cacheSize: cacheStats.size,
      dimension: embeddingService.embeddingDimension,
    });

    // Get model status for model name/quality info
    const modelStatus = await embeddingService.getModelStatus();

    const result: IndexerStats = {
      indexedFiles: stats.uniqueFiles,
      totalChunks: stats.totalChunks,
      lastIndexTime: this.lastIndexStartTime,
      indexSizeBytes: stats.dbSizeBytes,
      indexHealth: stats.totalDocuments === 0 ? 'empty' : stats.indexHealth,
      embeddingInfo: {
        isUsingOnnx,
        cacheSize: cacheStats.size,
        dimension: embeddingService.embeddingDimension,
        modelId: modelStatus.modelId,
        quality: modelStatus.quality,
      },
    };

    // Include workspace info if available
    if (this.workspaceStructure) {
      result.workspaceInfo = {
        projectType: this.workspaceStructure.projectType,
        framework: this.workspaceStructure.framework,
        totalFiles: this.workspaceStructure.fileStats.totalFiles,
        estimatedLinesOfCode: this.workspaceStructure.fileStats.estimatedLinesOfCode,
      };
    }

    return result;
  }

  /**
   * Clear the index
   */
  async clearIndex(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const vectorStore = getVectorStore();
    vectorStore.clear();
    
    // Clear workspace structure cache
    this.workspaceStructure = null;
    this.totalChunksIndexed = 0;
    this.lastIndexStartTime = null;
    
    logger.info('Semantic index cleared');
  }

  /**
   * Reindex a single file
   * @returns Number of chunks created
   */
  async reindexFile(filePath: string): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const vectorStore = getVectorStore();
    const embeddingService = getEmbeddingService();
    const chunker = getCodeChunker();

    // Remove old chunks for this file
    vectorStore.deleteByFilePath(filePath);

    // Index the file
    const chunksCreated = await this.indexFile(filePath, chunker, embeddingService, vectorStore);
    
    logger.info('File reindexed', { filePath, chunksCreated });
    return chunksCreated;
  }

  /**
   * Get indexed files
   */
  getIndexedFiles(): string[] {
    if (!this.isInitialized) return [];

    const vectorStore = getVectorStore();
    return vectorStore.getIndexedFilePaths();
  }

  /**
   * Check if ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get cached workspace structure
   */
  getWorkspaceStructure(): WorkspaceStructure | null {
    return this.workspaceStructure;
  }

  /**
   * Get workspace structure in system prompt compatible format
   * Used by ContextBuilder for rich workspace context injection
   */
  getWorkspaceStructureForPrompt(): {
    projectType?: string;
    configFiles?: string[];
    sourceDirectories?: string[];
    testDirectories?: string[];
    packageManager?: string;
    framework?: string;
    frameworks?: string[];
    languages?: string[];
    testFramework?: string;
    buildTool?: string;
  } | null {
    if (!this.workspaceStructure) return null;

    const ws = this.workspaceStructure;
    
    // Map internal structure to prompt-compatible format
    const languages: string[] = [];
    if (ws.projectType) {
      languages.push(ws.projectType);
    }
    // Add languages from file extensions in structure
    if (ws.fileStats?.byExtension) {
      for (const ext of Object.keys(ws.fileStats.byExtension)) {
        const langMap: Record<string, string> = {
          '.ts': 'typescript', '.tsx': 'typescript',
          '.js': 'javascript', '.jsx': 'javascript',
          '.py': 'python', '.rs': 'rust', '.go': 'go',
          '.java': 'java', '.cs': 'csharp', '.cpp': 'cpp',
        };
        if (langMap[ext] && !languages.includes(langMap[ext])) {
          languages.push(langMap[ext]);
        }
      }
    }

    const frameworks: string[] = [];
    if (ws.framework) frameworks.push(ws.framework);

    // Detect build tool from config files
    let buildTool: string | undefined;
    if (ws.configFiles.includes('vite.config.ts') || ws.configFiles.includes('vite.config.js')) {
      buildTool = 'vite';
    } else if (ws.configFiles.includes('webpack.config.js')) {
      buildTool = 'webpack';
    } else if (ws.configFiles.includes('esbuild.config.js') || ws.configFiles.includes('esbuild.mjs')) {
      buildTool = 'esbuild';
    } else if (ws.configFiles.includes('rollup.config.js')) {
      buildTool = 'rollup';
    }

    // Detect test framework
    let testFramework: string | undefined;
    if (ws.configFiles.includes('vitest.config.ts') || ws.configFiles.includes('vitest.config.js')) {
      testFramework = 'vitest';
    } else if (ws.configFiles.includes('jest.config.js') || ws.configFiles.includes('jest.config.ts')) {
      testFramework = 'jest';
    } else if (ws.testDirectories.some(d => d.includes('cypress'))) {
      testFramework = 'cypress';
    }

    return {
      projectType: ws.projectType,
      configFiles: ws.configFiles.slice(0, 10),
      sourceDirectories: ws.sourceDirectories.slice(0, 5),
      testDirectories: ws.testDirectories.slice(0, 3),
      packageManager: ws.packageManager,
      framework: ws.framework,
      frameworks: frameworks.length > 0 ? frameworks : undefined,
      languages: languages.length > 0 ? languages : undefined,
      testFramework,
      buildTool,
    };
  }

  /**
   * Get a summary of the indexed workspace for context
   */
  getContextSummary(): string | null {
    if (!this.workspaceStructure) return null;
    
    const analyzer = getWorkspaceAnalyzer();
    return analyzer.getSummary(this.workspaceStructure);
  }

  /**
   * Shutdown the indexer
   */
  async shutdown(): Promise<void> {
    // Unregister file change handler
    setSemanticIndexChangeHandler(null);

    // Clear any pending changes
    if (this.changeDebounceTimer) {
      clearTimeout(this.changeDebounceTimer);
    }
    this.pendingChanges.clear();

    // Clear cached data
    this.workspaceStructure = null;
    this.totalChunksIndexed = 0;

    this.isInitialized = false;
    logger.info('Semantic indexer shutdown');
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let indexerInstance: SemanticIndexer | null = null;

/**
 * Get the singleton indexer instance
 */
export function getSemanticIndexer(): SemanticIndexer {
  if (!indexerInstance) {
    indexerInstance = new SemanticIndexer();
  }
  return indexerInstance;
}

/**
 * Reset the indexer (for testing)
 */
export function resetSemanticIndexer(): void {
  if (indexerInstance) {
    indexerInstance.shutdown();
    indexerInstance = null;
  }
}
