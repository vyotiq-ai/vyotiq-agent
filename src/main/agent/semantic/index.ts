/**
 * Semantic Indexing Module
 *
 * Provides local vector embedding and semantic search capabilities:
 * - EmbeddingService: Transformers.js-based text embeddings
 * - VectorStore: SQLite-based vector storage with similarity search
 * - CodeChunker: Language-aware code chunking
 * - SemanticIndexer: Orchestrator for workspace indexing
 * - WorkspaceAnalyzer: Workspace structure analysis and mapping
 */

// Export embedding service
export {
  EmbeddingService,
  getEmbeddingService,
  resetEmbeddingService,
  type EmbeddingServiceConfig,
  type EmbeddingResult,
  type BatchEmbeddingResult,
  type ProgressCallback,
} from './EmbeddingService';

// Export vector store
export {
  VectorStore,
  getVectorStore,
  resetVectorStore,
  computeContentHash,
  type VectorDocument,
  type VectorDocumentMetadata,
  type SearchResult,
  type SearchOptions,
  type VectorStoreConfig,
  type VectorStoreStats,
} from './VectorStore';

// Export code chunker
export {
  CodeChunker,
  getCodeChunker,
  resetCodeChunker,
  detectLanguage,
  type CodeChunk,
  type ChunkSymbolType,
  type ChunkerConfig,
} from './CodeChunker';

// Export semantic indexer
export {
  SemanticIndexer,
  getSemanticIndexer,
  resetSemanticIndexer,
  setSemanticSettingsGetter,
  type SemanticSettingsGetter,
  type IndexingProgress,
  type IndexingOptions,
  type SemanticSearchQuery,
  type SemanticSearchResult,
  type IndexerStats,
} from './SemanticIndexer';

// Export workspace analyzer
export {
  WorkspaceAnalyzer,
  getWorkspaceAnalyzer,
  resetWorkspaceAnalyzer,
  type WorkspaceStructure,
  type DirectoryInfo,
  type FileStatistics,
} from './WorkspaceAnalyzer';

// Export semantic context provider
export {
  getSemanticContextForQuery,
  getContextForFiles,
  getContextStats,
  formatContextForPrompt,
  type ContextRetrievalOptions,
  type SemanticContext,
  type ContextSnippet,
  type ContextStats,
} from './SemanticContextProvider';
