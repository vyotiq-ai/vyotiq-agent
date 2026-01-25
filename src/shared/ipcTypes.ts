/**
 * IPC Type Definitions
 * 
 * Defines request/response types for IPC channels.
 * Note: Event types are defined in shared/types.ts to avoid duplication.
 */

// =============================================================================
// Dynamic Tool Types
// =============================================================================

export interface DynamicToolInfoIPC {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'disabled' | 'deprecated';
  category?: string;
  usageCount: number;
  successRate: number;
  createdAt: number;
  createdBy?: string;
  lastUsedAt?: number;
}

export interface DynamicToolListFilter {
  status?: string;
  category?: string;
}

export interface DynamicToolListResponse {
  success: boolean;
  tools: DynamicToolInfoIPC[];
  error?: string;
}

export interface DynamicToolSpecResponse {
  success: boolean;
  spec?: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    implementation?: string;
  };
  error?: string;
}

// =============================================================================
// Semantic Indexing Types
// =============================================================================

export interface SemanticIndexingProgress {
  totalFiles: number;
  indexedFiles: number;
  currentFile: string | null;
  isIndexing: boolean;
  status: 'idle' | 'scanning' | 'indexing' | 'complete' | 'error';
  error?: string;
  startTime?: number;
  estimatedTimeRemaining?: number;
}

export interface SemanticIndexerStats {
  indexedFiles: number;
  totalChunks: number;
  lastIndexTime: number | null;
  indexSizeBytes: number;
  indexHealth: 'healthy' | 'degraded' | 'needs-rebuild' | 'empty';
}

export interface SemanticSearchOptions {
  limit?: number;
  minScore?: number;
  filePathPattern?: string;
  fileTypes?: string[];
  languages?: string[];
  symbolTypes?: string[];
  includeContent?: boolean;
}

export interface SemanticDocumentMetadata {
  fileType: string;
  language?: string;
  symbolType?: string;
  symbolName?: string;
  startLine?: number;
  endLine?: number;
}

export interface SemanticSearchResultItem {
  document: {
    id: string;
    filePath: string;
    chunkIndex: number;
    content: string;
    metadata: SemanticDocumentMetadata;
  };
  score: number;
  distance: number;
}

export interface SemanticSearchResult {
  results: SemanticSearchResultItem[];
  queryTimeMs: number;
  totalDocumentsSearched: number;
}


