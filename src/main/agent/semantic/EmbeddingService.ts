/**
 * Embedding Service
 *
 * Generates vector embeddings for text using @huggingface/transformers.
 * Uses sentence-transformers models for semantic similarity.
 * Fully local - models are downloaded once and cached.
 * 
 * Features:
 * - Automatic model download and caching
 * - Progress callbacks for model download
 * - Multiple model quality presets (fast, balanced, quality)
 * - LRU cache for frequently used embeddings
 * - Fallback to hash-based embeddings when model unavailable
 * 
 * Note: ONNX Runtime trace.js is patched via scripts/patch-onnx.mjs
 * to add null checks for Electron compatibility.
 */

import path from 'node:path';
import { app } from 'electron';
import { createLogger } from '../../logger';

const logger = createLogger('EmbeddingService');

// =============================================================================
// Types
// =============================================================================

export interface EmbeddingResult {
  /** Vector embedding (normalized) */
  vector: Float32Array;
  /** Number of tokens in input */
  tokenCount: number;
  /** Generation time in ms */
  durationMs: number;
}

export interface BatchEmbeddingResult {
  /** Array of embeddings */
  embeddings: EmbeddingResult[];
  /** Total generation time in ms */
  totalDurationMs: number;
}

export interface EmbeddingServiceConfig {
  /** Maximum sequence length */
  maxSequenceLength: number;
  /** Batch size for batch embeddings */
  batchSize: number;
  /** Use GPU if available */
  useGpu: boolean;
  /** Cache embeddings in memory */
  enableCache: boolean;
  /** Maximum cache entries */
  maxCacheEntries: number;
  /** Model quality preset */
  modelQuality: 'fast' | 'balanced' | 'quality';
}

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingServiceConfig = {
  maxSequenceLength: 512,
  batchSize: 32,
  useGpu: false,
  enableCache: true,
  maxCacheEntries: 10000,
  modelQuality: 'balanced',
};

/** Progress callback for model download/loading */
export type ProgressCallback = (progress: {
  status: 'downloading' | 'loading' | 'ready' | 'error';
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
  error?: string;
}) => void;

// =============================================================================
// Model Configuration
// =============================================================================

interface ModelConfig {
  modelId: string;
  embeddingDimension: number;
  dtype: 'fp32' | 'fp16' | 'q8' | 'q4';
  description: string;
}

const MODEL_PRESETS: Record<string, ModelConfig> = {
  fast: {
    modelId: 'Xenova/all-MiniLM-L6-v2',
    embeddingDimension: 384,
    dtype: 'q8',
    description: 'Fast, quantized model for quick indexing',
  },
  balanced: {
    modelId: 'Xenova/all-MiniLM-L6-v2',
    embeddingDimension: 384,
    dtype: 'fp32',
    description: 'Full precision for best accuracy',
  },
  quality: {
    modelId: 'Xenova/all-mpnet-base-v2',
    embeddingDimension: 768,
    dtype: 'fp32',
    description: 'Larger model for highest quality embeddings',
  },
};

// =============================================================================
// Embedding Service
// =============================================================================

export class EmbeddingService {
  private config: EmbeddingServiceConfig;
  private pipeline: unknown = null;
  private cache: Map<string, Float32Array> = new Map();
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private progressCallback: ProgressCallback | null = null;
  private currentModelConfig: ModelConfig;
  private cacheDir: string;
  private isModelLoaded = false;
  
  /** Embedding dimension (depends on model) */
  public embeddingDimension: number;

  constructor(config: Partial<EmbeddingServiceConfig> = {}) {
    this.config = { ...DEFAULT_EMBEDDING_CONFIG, ...config };
    this.currentModelConfig = MODEL_PRESETS[this.config.modelQuality] || MODEL_PRESETS.balanced;
    this.embeddingDimension = this.currentModelConfig.embeddingDimension;
    
    // Cache directory in app data
    this.cacheDir = path.join(app.getPath('userData'), 'models', 'transformers-cache');
  }

  /**
   * Validate cached model files are not corrupted
   * Checks that essential JSON files have content and ONNX model exists
   */
  private async validateCacheIntegrity(cacheLocation: string): Promise<boolean> {
    const fs = await import('node:fs/promises');
    const essentialFiles = ['config.json', 'tokenizer.json'];
    
    try {
      for (const file of essentialFiles) {
        const filePath = path.join(cacheLocation, file);
        try {
          const stats = await fs.stat(filePath);
          // File must have actual content (at least 10 bytes for valid JSON)
          if (stats.size < 10) {
            logger.warn('Corrupted cache file detected (too small)', { file, size: stats.size });
            return false;
          }
          // Verify JSON is parseable
          const content = await fs.readFile(filePath, 'utf-8');
          JSON.parse(content);
        } catch (err) {
          logger.warn('Cache file validation failed', { file, error: String(err) });
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear corrupted cache directory
   */
  private async clearCorruptedCache(cacheLocation: string): Promise<void> {
    const fs = await import('node:fs/promises');
    try {
      await fs.rm(cacheLocation, { recursive: true, force: true });
      logger.info('Cleared corrupted model cache', { location: cacheLocation });
    } catch (err) {
      logger.warn('Failed to clear corrupted cache', { location: cacheLocation, error: String(err) });
    }
  }

  /**
   * Ensure all cache directories have valid files before loading
   * Clears any corrupted caches to force re-download
   * Only checks the primary cache location
   */
  private async ensureCacheIntegrity(): Promise<void> {
    const fs = await import('node:fs/promises');
    const modelId = this.currentModelConfig.modelId;
    
    // Only check the primary cache location
    const primaryCacheLocation = path.join(this.cacheDir, modelId);
    
    try {
      const stats = await fs.stat(primaryCacheLocation);
      if (stats.isDirectory()) {
        const isValid = await this.validateCacheIntegrity(primaryCacheLocation);
        if (!isValid) {
          logger.warn('Pre-initialization: clearing corrupted cache', { location: primaryCacheLocation });
          await this.clearCorruptedCache(primaryCacheLocation);
        }
      }
    } catch {
      // Location doesn't exist, that's fine - will be created during download
    }
  }

  /**
   * Check if the model files are already cached locally
   * This allows checking without triggering a download
   * Only checks the primary cache location (this.cacheDir) to avoid confusion
   */
  async isModelCached(): Promise<boolean> {
    const fs = await import('node:fs/promises');
    const modelId = this.currentModelConfig.modelId;
    
    // Only check the primary app data cache - this is where we configure transformers.js to save
    const primaryCacheLocation = path.join(this.cacheDir, modelId);
    
    try {
      const stats = await fs.stat(primaryCacheLocation);
      if (stats.isDirectory()) {
        // Check if it contains the essential files
        const files = await fs.readdir(primaryCacheLocation, { recursive: true });
        const hasOnnxModel = files.some(f => 
          typeof f === 'string' && (f.endsWith('.onnx') || f.includes('model.onnx'))
        );
        const hasConfig = files.some(f => typeof f === 'string' && f === 'config.json');
        const hasTokenizer = files.some(f => typeof f === 'string' && f === 'tokenizer.json');
        
        if (hasOnnxModel && hasConfig && hasTokenizer) {
          // Validate cache integrity before declaring it valid
          const isValid = await this.validateCacheIntegrity(primaryCacheLocation);
          if (!isValid) {
            logger.warn('Model cache is corrupted, will clear and re-download', { location: primaryCacheLocation });
            await this.clearCorruptedCache(primaryCacheLocation);
            return false;
          }
          logger.debug('Model found in cache', { location: primaryCacheLocation });
          return true;
        }
      }
    } catch {
      // Cache doesn't exist
    }
    
    return false;
  }

  /**
   * Get model info including cache status
   */
  async getModelStatus(): Promise<{
    modelId: string;
    quality: string;
    isLoaded: boolean;
    isCached: boolean;
    embeddingDimension: number;
  }> {
    const isCached = await this.isModelCached();
    return {
      modelId: this.currentModelConfig.modelId,
      quality: this.config.modelQuality,
      isLoaded: this.isModelLoaded,
      isCached,
      embeddingDimension: this.embeddingDimension,
    };
  }

  /**
   * Set progress callback for model loading
   */
  setProgressCallback(callback: ProgressCallback | null): void {
    this.progressCallback = callback;
  }

  /**
   * Initialize the embedding service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    // Track download stall state for error diagnostics
    let downloadStalled = false;
    
    try {
      this.progressCallback?.({ status: 'loading' });

      // Pre-validate and clear any corrupted caches before loading
      await this.ensureCacheIntegrity();

      // Dynamic import @huggingface/transformers
      const { pipeline, env } = await import('@huggingface/transformers');

      // Configure environment for Electron main process (Node.js environment)
      // Key settings for Electron/Node.js compatibility:
      // - allowLocalModels: true - Use cached models from disk
      // - useFSCache: true - Enable filesystem caching  
      // - allowRemoteModels: true - Allow downloading if not cached
      // - cacheDir: Set explicit cache directory in app data
      env.allowLocalModels = true;
      env.useFSCache = true;
      env.allowRemoteModels = true;
      env.cacheDir = this.cacheDir;
      
      // Note: In Node.js/Electron environment, transformers.js automatically 
      // uses onnxruntime-node instead of onnxruntime-web. We don't need to
      // manually disable WASM - the library handles this via IS_NODE_ENV detection.
      // See: src/backends/onnx.js in transformers.js source

      logger.info('Transformers.js environment configured for Electron', {
        cacheDir: env.cacheDir,
        localModelPath: env.localModelPath,
        allowLocalModels: env.allowLocalModels,
        useFSCache: env.useFSCache,
        allowRemoteModels: env.allowRemoteModels,
      });

      // Progress callback wrapper with download tracking
      let lastProgressTime = Date.now();
      
      const progressCallback = (data: Record<string, unknown>) => {
        lastProgressTime = Date.now();
        
        if (data.status === 'progress' && typeof data.progress === 'number') {
          this.progressCallback?.({
            status: 'downloading',
            file: data.file as string | undefined,
            progress: data.progress,
            loaded: data.loaded as number | undefined,
            total: data.total as number | undefined,
          });
          logger.debug('Model download progress', {
            file: data.file,
            progress: Math.round(data.progress),
          });
        } else if (data.status === 'done') {
          this.progressCallback?.({
            status: 'loading',
            file: data.file as string | undefined,
          });
          logger.debug('Model file downloaded', { file: data.file });
        } else if (data.status === 'initiate') {
          logger.info('Starting model download', { file: data.file });
        }
      };

      // Create feature extraction pipeline with timeout
      logger.info('Loading embedding model', {
        model: this.currentModelConfig.modelId,
        dtype: this.currentModelConfig.dtype,
        quality: this.config.modelQuality,
      });

      // Set up a download timeout monitor (5 minutes for large models)
      const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;
      let timeoutId: NodeJS.Timeout | null = null;
      let intervalId: NodeJS.Timeout | null = null;
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        intervalId = setInterval(() => {
          if (Date.now() - lastProgressTime > 60000) {
            // No progress in 60 seconds
            downloadStalled = true;
            if (intervalId) clearInterval(intervalId);
            if (timeoutId) clearTimeout(timeoutId);
            reject(new Error('Model download stalled - no progress for 60 seconds'));
          }
        }, 10000);
        
        timeoutId = setTimeout(() => {
          if (intervalId) clearInterval(intervalId);
          if (!this.isModelLoaded) {
            reject(new Error(`Model download timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s`));
          }
        }, DOWNLOAD_TIMEOUT_MS);
      });

      // Race between pipeline creation and timeout
      try {
        this.pipeline = await Promise.race([
          pipeline(
            'feature-extraction',
            this.currentModelConfig.modelId,
            {
              dtype: this.currentModelConfig.dtype,
              progress_callback: progressCallback,
              // Explicitly use CPU device to ensure onnxruntime-node is used
              // This is important for Electron main process compatibility
              device: 'cpu',
            }
          ),
          timeoutPromise,
        ]);
      } finally {
        // Clean up timers regardless of outcome
        if (intervalId) clearInterval(intervalId);
        if (timeoutId) clearTimeout(timeoutId);
      }

      this.isModelLoaded = true;
      this.isInitialized = true;
      this.progressCallback?.({ status: 'ready' });

      logger.info('Embedding service initialized with Transformers.js (onnxruntime-node)', {
        model: this.currentModelConfig.modelId,
        dimension: this.embeddingDimension,
        cacheDir: this.cacheDir,
        device: 'cpu',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      // Log detailed error information for debugging
      logger.error('Failed to initialize embedding service with Transformers.js', { 
        error: errorMessage,
        stack: errorStack,
        model: this.currentModelConfig.modelId,
        cacheDir: this.cacheDir,
        downloadStalled,
        hint: downloadStalled 
          ? 'Download stalled - check network connection or try clearing cache'
          : 'Check if onnxruntime-node is properly installed and the model can be downloaded',
      });
      
      this.progressCallback?.({ status: 'error', error: errorMessage });
      
      // Mark as initialized to use fallback, but log prominently
      this.isInitialized = true;
      this.isModelLoaded = false; // Ensure this is explicitly false
      logger.warn('='.repeat(80));
      logger.warn('FALLING BACK TO HASH-BASED EMBEDDINGS');
      logger.warn('Semantic search quality will be significantly degraded!');
      logger.warn('To fix: Ensure onnxruntime-node is installed and model can download');
      logger.warn(`Model: ${this.currentModelConfig.modelId}`);
      logger.warn(`Error: ${errorMessage}`);
      logger.warn('='.repeat(80));
    }
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<EmbeddingResult> {
    await this.initialize();
    
    const startTime = Date.now();
    
    // Check cache
    if (this.config.enableCache) {
      const cacheKey = this.getCacheKey(text);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        // Move to end for LRU (re-insert to update access order)
        this.cache.delete(cacheKey);
        this.cache.set(cacheKey, cached);
        return {
          vector: cached,
          tokenCount: 0,
          durationMs: Date.now() - startTime,
        };
      }
    }

    let vector: Float32Array;
    let tokenCount: number;

    if (this.pipeline && this.isModelLoaded) {
      // Use Transformers.js pipeline
      const pipelineFn = this.pipeline as (
        text: string,
        options: { pooling: string; normalize: boolean }
      ) => Promise<{ data: Float32Array; dims: number[] }>;
      
      const output = await pipelineFn(text, {
        pooling: 'mean',
        normalize: true,
      });

      // Extract the embedding vector
      vector = new Float32Array(output.data);
      tokenCount = Math.ceil(text.length / 4); // Rough estimate
    } else {
      // Fallback: Use enhanced hash-based embedding
      vector = this.hashBasedEmbedding(text);
      tokenCount = text.split(/\s+/).length;
    }

    // Normalize vector (Transformers.js already does this, but ensure consistency)
    this.normalizeVector(vector);

    // Cache result
    if (this.config.enableCache) {
      this.addToCache(text, vector);
    }

    return {
      vector,
      tokenCount,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Generate embeddings for multiple texts
   */
  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    const startTime = Date.now();
    const embeddings: EmbeddingResult[] = [];

    if (this.pipeline && this.isModelLoaded) {
      // Process in batches using the pipeline
      for (let i = 0; i < texts.length; i += this.config.batchSize) {
        const batch = texts.slice(i, i + this.config.batchSize);
        
        // Check cache for each item first
        const uncachedTexts: string[] = [];
        const uncachedIndices: number[] = [];
        const batchResults: (EmbeddingResult | null)[] = new Array(batch.length).fill(null);
        
        for (let j = 0; j < batch.length; j++) {
          if (this.config.enableCache) {
            const cacheKey = this.getCacheKey(batch[j]);
            const cached = this.cache.get(cacheKey);
            if (cached) {
              // Move to end for LRU (re-insert to update access order)
              this.cache.delete(cacheKey);
              this.cache.set(cacheKey, cached);
              batchResults[j] = {
                vector: cached,
                tokenCount: 0,
                durationMs: 0,
              };
              continue;
            }
          }
          uncachedTexts.push(batch[j]);
          uncachedIndices.push(j);
        }

        // Process uncached texts
        if (uncachedTexts.length > 0) {
          const pipelineFn = this.pipeline as (
            texts: string[],
            options: { pooling: string; normalize: boolean }
          ) => Promise<{ data: Float32Array; dims: number[] }>;
          
          const output = await pipelineFn(uncachedTexts, {
            pooling: 'mean',
            normalize: true,
          });

          // Extract individual embeddings from batch output
          const embDim = this.embeddingDimension;
          
          for (let j = 0; j < uncachedTexts.length; j++) {
            const start = j * embDim;
            const vector = new Float32Array(output.data.slice(start, start + embDim));
            
            // Cache the result
            if (this.config.enableCache) {
              this.addToCache(uncachedTexts[j], vector);
            }
            
            batchResults[uncachedIndices[j]] = {
              vector,
              tokenCount: Math.ceil(uncachedTexts[j].length / 4),
              durationMs: 0,
            };
          }
        }

        // Add all results to final array
        for (const result of batchResults) {
          if (result) {
            embeddings.push(result);
          }
        }
      }
    } else {
      // Fallback: Process individually with hash-based embeddings
      for (const text of texts) {
        const result = await this.embed(text);
        embeddings.push(result);
      }
    }

    return {
      embeddings,
      totalDurationMs: Date.now() - startTime,
    };
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  /**
   * Enhanced hash-based fallback embedding with semantic features
   * Uses multiple techniques for better semantic capture:
   * - Character n-grams (1-4 grams)
   * - Word n-grams (1-3 grams)
   * - Programming keyword weighting
   * - Position-aware hashing
   * - TF-IDF inspired weighting
   */
  private hashBasedEmbedding(text: string): Float32Array {
    const vector = new Float32Array(this.embeddingDimension);
    
    // Preprocessing
    const normalizedText = text.toLowerCase();
    const words = normalizedText.split(/\s+|([{}()[\];,.<>:'"=+\-*/%&|^!?@#$`~\\])/g)
      .filter(w => w && w.trim().length > 0);
    
    // Programming keywords with higher weight
    const programmingKeywords = new Set([
      'function', 'class', 'interface', 'type', 'export', 'import', 'const', 'let', 'var',
      'async', 'await', 'return', 'if', 'else', 'for', 'while', 'try', 'catch', 'throw',
      'new', 'this', 'super', 'extends', 'implements', 'public', 'private', 'protected',
      'static', 'abstract', 'def', 'fn', 'struct', 'enum', 'trait', 'impl', 'mod', 'pub',
      'use', 'self', 'mut', 'ref', 'match', 'loop', 'break', 'continue', 'yield', 'with',
      'lambda', 'print', 'raise', 'except', 'finally', 'pass', 'assert', 'global', 'nonlocal',
    ]);
    
    // Calculate word frequencies for TF-IDF style weighting
    const wordFreq = new Map<string, number>();
    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
    
    // 1. Character n-grams (1-4 grams) with position weighting
    for (let n = 1; n <= 4; n++) {
      const weight = 1.0 / n;
      for (let i = 0; i <= normalizedText.length - n; i++) {
        const ngram = normalizedText.slice(i, i + n);
        const positionWeight = 1.0 + (0.1 * Math.min(i / normalizedText.length, 0.5));
        const hash1 = this.simpleHash(ngram + '_c' + n);
        const hash2 = this.simpleHash(ngram + '_c' + n + '_2');
        const hash3 = this.simpleHash(ngram + '_c' + n + '_3');
        
        const idx1 = Math.abs(hash1) % this.embeddingDimension;
        const idx2 = Math.abs(hash2) % this.embeddingDimension;
        const idx3 = Math.abs(hash3) % this.embeddingDimension;
        
        vector[idx1] += weight * positionWeight;
        vector[idx2] -= weight * 0.3 * positionWeight;
        vector[idx3] += weight * 0.1 * positionWeight;
      }
    }
    
    // 2. Word-level features with TF-IDF style weighting
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const tf = wordFreq.get(word) || 1;
      const idfApprox = Math.log(1 + words.length / tf);
      const weight = Math.min(tf, 3) * idfApprox;
      
      // Extra weight for programming keywords
      const keywordBoost = programmingKeywords.has(word) ? 2.0 : 1.0;
      
      const hash1 = this.simpleHash(word + '_w');
      const hash2 = this.simpleHash(word + '_w2');
      const hash3 = this.simpleHash(word + '_w3');
      
      const idx1 = Math.abs(hash1) % this.embeddingDimension;
      const idx2 = Math.abs(hash2) % this.embeddingDimension;
      const idx3 = Math.abs(hash3) % this.embeddingDimension;
      
      vector[idx1] += weight * keywordBoost;
      vector[idx2] -= weight * 0.4 * keywordBoost;
      vector[idx3] += weight * 0.2;
    }
    
    // 3. Word n-grams (bigrams and trigrams) for context
    for (let n = 2; n <= 3; n++) {
      const weight = 0.5 / n;
      for (let i = 0; i <= words.length - n; i++) {
        const ngram = words.slice(i, i + n).join(' ');
        const hash1 = this.simpleHash(ngram + '_wn' + n);
        const hash2 = this.simpleHash(ngram + '_wn' + n + '_2');
        
        const idx1 = Math.abs(hash1) % this.embeddingDimension;
        const idx2 = Math.abs(hash2) % this.embeddingDimension;
        
        vector[idx1] += weight;
        vector[idx2] -= weight * 0.3;
      }
    }
    
    // 4. Structural features (detect code patterns)
    const structuralPatterns = [
      /function\s+\w+/g,
      /class\s+\w+/g,
      /interface\s+\w+/g,
      /type\s+\w+/g,
      /const\s+\w+\s*=/g,
      /let\s+\w+\s*=/g,
      /def\s+\w+/g,
      /async\s+function/g,
      /export\s+(default\s+)?/g,
      /import\s+.*from/g,
      /=>\s*\{?/g,
      /\(\)\s*=>/g,
    ];
    
    for (let i = 0; i < structuralPatterns.length; i++) {
      const pattern = structuralPatterns[i];
      const matches = normalizedText.match(pattern);
      if (matches && matches.length > 0) {
        const hash = this.simpleHash('_struct_' + i);
        const idx = Math.abs(hash) % this.embeddingDimension;
        vector[idx] += matches.length * 1.5;
      }
    }

    return vector;
  }

  /**
   * Simple string hash function
   */
  private simpleHash(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return hash;
  }

  /**
   * Normalize vector to unit length
   */
  private normalizeVector(vector: Float32Array): void {
    let norm = 0;
    for (let i = 0; i < vector.length; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }
  }

  /**
   * Get cache key for text
   */
  private getCacheKey(text: string): string {
    return this.simpleHash(text).toString(16);
  }

  /**
   * Add to cache with LRU eviction
   * 
   * Uses Map's insertion-order iteration for LRU:
   * - New entries are added at the end
   * - Cache hits re-insert entries to move them to the end
   * - Eviction removes from the beginning (least recently used)
   */
  private addToCache(text: string, vector: Float32Array): void {
    const key = this.getCacheKey(text);
    
    // If key already exists, delete it first to update insertion order
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    
    // Evict oldest (least recently used) if at capacity
    if (this.cache.size >= this.config.maxCacheEntries) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, vector);
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('Embedding cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxCacheEntries,
    };
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Check if using real transformer model or fallback
   */
  isUsingOnnxModel(): boolean {
    logger.debug('isUsingOnnxModel called', {
      isModelLoaded: this.isModelLoaded,
      isInitialized: this.isInitialized,
      hasPipeline: !!this.pipeline,
    });
    return this.isModelLoaded;
  }

  /**
   * Get current model info
   */
  getModelInfo(): { modelId: string; quality: string; isLoaded: boolean } {
    return {
      modelId: this.currentModelConfig.modelId,
      quality: this.config.modelQuality,
      isLoaded: this.isModelLoaded,
    };
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    this.pipeline = null;
    this.cache.clear();
    this.isInitialized = false;
    this.isModelLoaded = false;
    this.initPromise = null;
    logger.info('Embedding service shutdown');
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let embeddingServiceInstance: EmbeddingService | null = null;

/**
 * Get the singleton embedding service instance
 */
export function getEmbeddingService(): EmbeddingService {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new EmbeddingService();
  }
  return embeddingServiceInstance;
}

/**
 * Reset the embedding service (for testing)
 */
export function resetEmbeddingService(): void {
  if (embeddingServiceInstance) {
    embeddingServiceInstance.shutdown();
    embeddingServiceInstance = null;
  }
}
