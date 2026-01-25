/**
 * Semantic Context Provider
 *
 * Provides intelligent context gathering using semantic search.
 * Automatically retrieves relevant code snippets based on user queries
 * to enhance the agent's understanding of the codebase.
 *
 * Features:
 * - Query-aware context retrieval
 * - File-type filtering based on query intent
 * - Relevance scoring with configurable thresholds
 * - Context deduplication and ranking
 * - Token-aware context truncation
 */

import { createLogger } from '../../logger';
import { getSemanticIndexer, type SemanticSearchResult } from './SemanticIndexer';
import type { VectorDocumentMetadata, SearchResult } from './VectorStore';
import { getCurrentWorkspacePath } from '../../workspaces/fileWatcher';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const logger = createLogger('SemanticContextProvider');

// =============================================================================
// Types
// =============================================================================

/**
 * Context retrieval options
 */
export interface ContextRetrievalOptions {
  /** Maximum results to retrieve */
  maxResults?: number;
  /** Minimum similarity score threshold (0-1) */
  minScore?: number;
  /** Maximum tokens for context (to prevent overflow) */
  maxTokens?: number;
  /** Include file path patterns */
  includePatterns?: string[];
  /** Exclude file path patterns */
  excludePatterns?: string[];
  /** File types to include (e.g., ['.ts', '.tsx']) */
  fileTypes?: string[];
  /** Symbol types to prioritize (e.g., ['function', 'class']) */
  symbolTypes?: string[];
  /** Include surrounding context lines from the same file */
  includeSurroundingContext?: boolean;
  /** Number of lines to include before/after for surrounding context */
  surroundingContextLines?: number;
}

/**
 * Semantic context result
 */
export interface SemanticContext {
  /** Relevant code snippets */
  snippets: ContextSnippet[];
  /** Total snippets found (before filtering) */
  totalFound: number;
  /** Query used for retrieval */
  query: string;
  /** Time taken to retrieve context (ms) */
  retrievalTimeMs: number;
  /** Whether context was truncated due to token limit */
  wasTruncated: boolean;
  /** Estimated token count */
  estimatedTokens: number;
}

/**
 * Individual code snippet with metadata
 */
export interface ContextSnippet {
  /** Unique identifier */
  id: string;
  /** File path (relative to workspace) */
  filePath: string;
  /** Code content */
  content: string;
  /** Programming language */
  language: string;
  /** Similarity score (0-1) */
  score: number;
  /** Start line in file */
  startLine?: number;
  /** End line in file */
  endLine?: number;
  /** Symbol type (function, class, etc.) */
  symbolType?: string;
  /** Symbol name */
  symbolName?: string;
  /** Brief description of relevance */
  relevanceHint?: string;
}

/**
 * Query analysis result for intelligent context retrieval
 */
interface QueryAnalysis {
  /** Primary intent of the query */
  intent: 'search' | 'understand' | 'modify' | 'debug' | 'create' | 'general';
  /** Key concepts/terms extracted */
  concepts: string[];
  /** Suggested file types to search */
  suggestedFileTypes?: string[];
  /** Suggested symbol types to prioritize */
  suggestedSymbolTypes?: string[];
  /** Whether the query is about specific files */
  hasFileReference: boolean;
  /** Referenced file names if any */
  referencedFiles: string[];
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_OPTIONS: Required<ContextRetrievalOptions> = {
  maxResults: 8,
  minScore: 0.35,
  maxTokens: 4000,
  includePatterns: [],
  excludePatterns: [],
  fileTypes: [],
  symbolTypes: [],
  includeSurroundingContext: false,
  surroundingContextLines: 5,
};

// Token estimation: ~4 chars per token
const CHARS_PER_TOKEN = 4;

// =============================================================================
// Query Analysis
// =============================================================================

/**
 * Analyze query to determine optimal search parameters
 */
function analyzeQuery(query: string): QueryAnalysis {
  const lowercaseQuery = query.toLowerCase();
  const words = lowercaseQuery.split(/\s+/);
  
  // Detect intent
  let intent: QueryAnalysis['intent'] = 'general';
  if (/how (does|do|is|can|to)/i.test(query) || /explain|understand|what is/i.test(query)) {
    intent = 'understand';
  } else if (/find|search|where|locate|look for/i.test(query)) {
    intent = 'search';
  } else if (/fix|error|bug|issue|debug|problem|broken/i.test(query)) {
    intent = 'debug';
  } else if (/edit|change|modify|update|refactor|add|remove/i.test(query)) {
    intent = 'modify';
  } else if (/create|new|implement|build|write/i.test(query)) {
    intent = 'create';
  }
  
  // Extract concepts (filter out common words)
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'up',
    'about', 'into', 'through', 'during', 'before', 'after', 'above',
    'below', 'between', 'under', 'again', 'further', 'then', 'once',
    'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
    'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
    'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
    'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while', 'this',
    'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
    'it', 'its', 'he', 'his', 'she', 'her', 'they', 'their', 'what',
    'which', 'who', 'whom', 'code', 'file', 'function', 'class', 'method',
  ]);
  
  const concepts = words
    .filter(word => word.length > 2 && !stopWords.has(word))
    .filter(word => !/^[0-9]+$/.test(word));
  
  // Detect file references
  const filePattern = /\b[\w-]+\.(ts|tsx|js|jsx|py|rs|go|java|cs|cpp|c|h|hpp|vue|svelte|rb|php)\b/gi;
  const referencedFiles = (query.match(filePattern) || []);
  
  // Suggest file types based on query content
  const suggestedFileTypes: string[] = [];
  if (/react|component|jsx|hook/i.test(query)) {
    suggestedFileTypes.push('.tsx', '.jsx');
  }
  if (/api|endpoint|route|handler|controller/i.test(query)) {
    suggestedFileTypes.push('.ts', '.js');
  }
  if (/test|spec|expect|describe|it\(/i.test(query)) {
    suggestedFileTypes.push('.test.ts', '.test.tsx', '.spec.ts');
  }
  if (/style|css|tailwind|design/i.test(query)) {
    suggestedFileTypes.push('.css', '.scss', '.tsx');
  }
  if (/config|setting|environment/i.test(query)) {
    suggestedFileTypes.push('.json', '.ts', '.js', '.toml', '.yaml');
  }
  
  // Suggest symbol types
  const suggestedSymbolTypes: string[] = [];
  if (/function|method|handler|util/i.test(query)) {
    suggestedSymbolTypes.push('function', 'method');
  }
  if (/class|component|service|provider/i.test(query)) {
    suggestedSymbolTypes.push('class');
  }
  if (/interface|type|schema|model/i.test(query)) {
    suggestedSymbolTypes.push('interface', 'type');
  }
  
  return {
    intent,
    concepts,
    suggestedFileTypes: suggestedFileTypes.length > 0 ? suggestedFileTypes : undefined,
    suggestedSymbolTypes: suggestedSymbolTypes.length > 0 ? suggestedSymbolTypes : undefined,
    hasFileReference: referencedFiles.length > 0,
    referencedFiles,
  };
}

// =============================================================================
// Context Formatting
// =============================================================================

/**
 * Format semantic context into a readable string for prompts.
 * Provides an alternative formatting approach using semantic_context tags.
 * 
 * @param context - The semantic context to format
 * @returns Formatted string with XML-like tags
 */
export function formatContextForPrompt(context: SemanticContext): string {
  if (context.snippets.length === 0) {
    return '';
  }
  
  const lines: string[] = ['<semantic_context>'];
  
  for (const snippet of context.snippets) {
    const attrs: string[] = [
      `file="${snippet.filePath}"`,
      `score="${snippet.score.toFixed(2)}"`,
    ];
    
    if (snippet.language) {
      attrs.push(`lang="${snippet.language}"`);
    }
    if (snippet.symbolType) {
      attrs.push(`type="${snippet.symbolType}"`);
    }
    if (snippet.symbolName) {
      attrs.push(`name="${snippet.symbolName}"`);
    }
    if (snippet.startLine !== undefined) {
      attrs.push(`lines="${snippet.startLine}-${snippet.endLine ?? snippet.startLine}"`);
    }
    
    lines.push(`<snippet ${attrs.join(' ')}>`);
    lines.push(snippet.content.trim());
    lines.push('</snippet>');
  }
  
  lines.push('</semantic_context>');
  
  logger.debug('Formatted context for prompt', {
    snippetCount: context.snippets.length,
    totalLength: lines.join('\n').length,
  });
  
  return lines.join('\n');
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Add surrounding context lines to a snippet by reading the source file
 * @param snippet - The snippet to enhance
 * @param workspacePath - The workspace root path
 * @param contextLines - Number of lines to add before and after
 * @returns Enhanced content with surrounding context, or original if file read fails
 */
async function addSurroundingContext(
  snippet: ContextSnippet,
  workspacePath: string,
  contextLines: number
): Promise<string> {
  if (!snippet.startLine || !snippet.endLine) {
    return snippet.content;
  }
  
  try {
    const fullPath = path.isAbsolute(snippet.filePath) 
      ? snippet.filePath 
      : path.join(workspacePath, snippet.filePath);
    
    const fileContent = await fs.readFile(fullPath, 'utf-8');
    const lines = fileContent.split('\n');
    
    // Calculate line range with surrounding context
    const startLine = Math.max(0, snippet.startLine - 1 - contextLines);
    const endLine = Math.min(lines.length, snippet.endLine + contextLines);
    
    // Extract lines with context markers
    const contextBefore = startLine < snippet.startLine - 1 
      ? lines.slice(startLine, snippet.startLine - 1).join('\n')
      : '';
    const contextAfter = endLine > snippet.endLine
      ? lines.slice(snippet.endLine, endLine).join('\n')
      : '';
    
    // Build enhanced content with context markers
    let enhanced = '';
    if (contextBefore) {
      enhanced += `// ... context above (lines ${startLine + 1}-${snippet.startLine - 1}) ...\n${contextBefore}\n`;
    }
    enhanced += snippet.content;
    if (contextAfter) {
      enhanced += `\n${contextAfter}\n// ... context below (lines ${snippet.endLine + 1}-${endLine}) ...`;
    }
    
    logger.debug('Added surrounding context to snippet', {
      filePath: snippet.filePath,
      originalLines: `${snippet.startLine}-${snippet.endLine}`,
      enhancedLines: `${startLine + 1}-${endLine}`,
    });
    
    return enhanced;
  } catch (error) {
    logger.debug('Could not add surrounding context', {
      filePath: snippet.filePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return snippet.content;
  }
}

/**
 * Generate a relevance hint based on the snippet's metadata
 */
function generateRelevanceHint(
  result: SearchResult,
  queryAnalysis: QueryAnalysis
): string | undefined {
  const metadata = result.document.metadata;
  const hints: string[] = [];
  
  if (metadata.symbolType && metadata.symbolName) {
    hints.push(`${metadata.symbolType} "${metadata.symbolName}"`);
  }
  
  // Check if any query concepts appear in the content
  const content = result.document.content.toLowerCase();
  const matchedConcepts = queryAnalysis.concepts.filter(c => content.includes(c));
  if (matchedConcepts.length > 0) {
    hints.push(`matches: ${matchedConcepts.slice(0, 3).join(', ')}`);
  }
  
  return hints.length > 0 ? hints.join(' | ') : undefined;
}

// =============================================================================
// Main Context Provider
// =============================================================================

/**
 * Retrieve semantic context for a query
 */
export async function getSemanticContextForQuery(
  query: string,
  options: ContextRetrievalOptions = {}
): Promise<SemanticContext | null> {
  const startTime = Date.now();
  
  // Check if semantic indexer is available
  const indexer = getSemanticIndexer();
  if (!indexer.isReady()) {
    logger.debug('Semantic indexer not ready, skipping context retrieval');
    return null;
  }
  
  // Merge options with defaults
  const opts: Required<ContextRetrievalOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
  
  // Analyze query for intelligent retrieval
  const queryAnalysis = analyzeQuery(query);
  
  // Determine file types to search
  const fileTypes = opts.fileTypes.length > 0
    ? opts.fileTypes
    : queryAnalysis.suggestedFileTypes;
  
  // Determine symbol types to prioritize
  const symbolTypes = opts.symbolTypes.length > 0
    ? opts.symbolTypes
    : queryAnalysis.suggestedSymbolTypes;
  
  try {
    // Perform semantic search
    const searchResult: SemanticSearchResult = await indexer.search({
      query,
      options: {
        limit: opts.maxResults * 2, // Get more to allow for filtering
        minScore: opts.minScore,
        fileTypes,
        symbolTypes,
        includeContent: true,
      },
    });
    
    // Filter by include/exclude patterns
    let filteredResults = searchResult.results;
    
    if (opts.includePatterns.length > 0) {
      filteredResults = filteredResults.filter(r =>
        opts.includePatterns.some(p => r.document.filePath.includes(p))
      );
    }
    
    if (opts.excludePatterns.length > 0) {
      filteredResults = filteredResults.filter(r =>
        !opts.excludePatterns.some(p => r.document.filePath.includes(p))
      );
    }
    
    // Deduplicate by file path (keep highest score per file unless we have symbol diversity)
    const fileScores = new Map<string, SearchResult[]>();
    for (const result of filteredResults) {
      const filePath = result.document.filePath;
      if (!fileScores.has(filePath)) {
        fileScores.set(filePath, []);
      }
      fileScores.get(filePath)!.push(result);
    }
    
    // Select best results per file, allowing multiple if they're different symbols
    const deduplicatedResults: SearchResult[] = [];
    for (const [, results] of fileScores) {
      // Sort by score descending
      results.sort((a, b) => b.score - a.score);
      
      // Take top result, and any others that are different symbol types
      const seenSymbols = new Set<string>();
      for (const result of results) {
        const symbolKey = `${result.document.metadata.symbolType}:${result.document.metadata.symbolName}`;
        if (!seenSymbols.has(symbolKey) && seenSymbols.size < 2) {
          deduplicatedResults.push(result);
          seenSymbols.add(symbolKey);
        }
      }
    }
    
    // Sort by score and take top results
    deduplicatedResults.sort((a, b) => b.score - a.score);
    const topResults = deduplicatedResults.slice(0, opts.maxResults);
    
    // Get workspace path for surrounding context feature
    const workspacePath = getCurrentWorkspacePath() || '';
    
    // Convert to snippets with token tracking
    const snippets: ContextSnippet[] = [];
    let totalTokens = 0;
    let wasTruncated = false;
    
    for (const result of topResults) {
      let content = result.document.content;
      const metadata = result.document.metadata as VectorDocumentMetadata;
      
      // Create initial snippet for potential context enhancement
      const initialSnippet: ContextSnippet = {
        id: result.document.id,
        filePath: result.document.filePath,
        content,
        language: metadata.language || 'unknown',
        score: result.score,
        startLine: metadata.startLine,
        endLine: metadata.endLine,
        symbolType: metadata.symbolType,
        symbolName: metadata.symbolName,
        relevanceHint: generateRelevanceHint(result, queryAnalysis),
      };
      
      // Add surrounding context if enabled
      if (opts.includeSurroundingContext && workspacePath) {
        content = await addSurroundingContext(
          initialSnippet,
          workspacePath,
          opts.surroundingContextLines
        );
      }
      
      const estimatedTokens = Math.ceil(content.length / CHARS_PER_TOKEN);
      
      // Check if adding this snippet would exceed token limit
      if (totalTokens + estimatedTokens > opts.maxTokens) {
        wasTruncated = true;
        break;
      }
      
      snippets.push({
        ...initialSnippet,
        content, // Use potentially enhanced content
      });
      
      totalTokens += estimatedTokens;
    }
    
    const retrievalTimeMs = Date.now() - startTime;
    
    logger.debug('Semantic context retrieved', {
      query: query.substring(0, 50),
      snippetsFound: searchResult.results.length,
      snippetsReturned: snippets.length,
      estimatedTokens: totalTokens,
      retrievalTimeMs,
      queryIntent: queryAnalysis.intent,
    });
    
    return {
      snippets,
      totalFound: searchResult.results.length,
      query,
      retrievalTimeMs,
      wasTruncated,
      estimatedTokens: totalTokens,
    };
  } catch (error) {
    logger.error('Failed to retrieve semantic context', {
      query: query.substring(0, 50),
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Get context for specific files by path
 */
export async function getContextForFiles(
  filePaths: string[],
  options: ContextRetrievalOptions = {}
): Promise<SemanticContext | null> {
  if (filePaths.length === 0) {
    return null;
  }
  
  // Create a query that references all file names
  const fileNames = filePaths.map(p => p.split(/[/\\]/).pop()).join(' ');
  
  return getSemanticContextForQuery(fileNames, {
    ...options,
    includePatterns: filePaths,
    maxResults: Math.min(filePaths.length * 3, options.maxResults ?? DEFAULT_OPTIONS.maxResults),
  });
}

/**
 * Get context summary statistics
 */
export interface ContextStats {
  isReady: boolean;
  indexedFiles: number;
  totalChunks: number;
  lastIndexTime: number | null;
  indexHealth: 'healthy' | 'degraded' | 'needs-rebuild' | 'empty';
}

export async function getContextStats(): Promise<ContextStats> {
  const indexer = getSemanticIndexer();
  
  if (!indexer.isReady()) {
    return {
      isReady: false,
      indexedFiles: 0,
      totalChunks: 0,
      lastIndexTime: null,
      indexHealth: 'empty',
    };
  }
  
  const stats = await indexer.getStats();
  
  return {
    isReady: true,
    indexedFiles: stats.indexedFiles,
    totalChunks: stats.totalChunks,
    lastIndexTime: stats.lastIndexTime,
    indexHealth: stats.indexHealth,
  };
}
