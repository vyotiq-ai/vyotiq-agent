/**
 * Codebase Search Tool
 * 
 * A semantic search tool that uses vector embeddings to find relevant code.
 * Unlike grep which uses exact pattern matching, this tool understands
 * code meaning and can find semantically similar code.
 */
import { relative } from 'node:path';
import { createLogger } from '../../logger';
import { getSemanticIndexer } from '../../agent/semantic';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type { ToolExecutionResult } from '../../../shared/types';
import type { SearchOptions } from '../../agent/semantic/VectorStore';

const logger = createLogger('codebase_search');

// =============================================================================
// Types
// =============================================================================

interface CodebaseSearchArgs extends Record<string, unknown> {
  /** Natural language query describing what you're looking for */
  query: string;
  /** Maximum number of results to return (default: 10) */
  limit?: number;
  /** Minimum similarity score threshold (0-1, default: 0.3) */
  min_score?: number;
  /** Filter by file path pattern (substring match) */
  path_pattern?: string;
  /** Filter by file types (e.g., [".ts", ".tsx"]) */
  file_types?: string[];
  /** Filter by programming languages (e.g., ["typescript", "python"]) */
  languages?: string[];
  /** Filter by symbol types (e.g., ["function", "class", "interface"]) */
  symbol_types?: string[];
  /** Include full code content in results (default: true) */
  include_content?: boolean;
}

// =============================================================================
// Tool Definition
// =============================================================================

export const codebaseSearchTool: ToolDefinition<CodebaseSearchArgs> = {
  name: 'codebase_search',
  description: `Semantic codebase search using AI embeddings. Finds code by meaning, not exact text.

## When to Use
- **Conceptual search**: "authentication logic", "error handling", "API endpoints"
- **Find implementations**: "function that validates email", "class for database connection"
- **Discover patterns**: "how is logging done", "where are configs loaded"
- **Similar code**: Find code with similar purpose/functionality

## vs grep
| Use codebase_search for | Use grep for |
|-------------------------|--------------|
| Conceptual/semantic queries | Exact text patterns |
| Finding code by purpose | Finding specific strings |
| "How is X done?" | "Where is X used?" |
| Similar implementations | Symbol references |

## Key Parameters
- **query** (required): Natural language description of what you're looking for
- **limit**: Max results (default: 10)
- **min_score**: Similarity threshold 0-1 (default: 0.3, higher = stricter)
- **file_types**: Filter by extension [".ts", ".py"]
- **languages**: Filter by language ["typescript", "python"]
- **symbol_types**: Filter by ["function", "class", "interface", "type"]

## Example Queries
- "function that handles user authentication"
- "database connection setup and configuration"
- "error handling and logging utilities"
- "React component for file upload"
- "API route handlers"

## Workflow Integration
\`\`\`
codebase_search("concept") → discover relevant files
read(top results) → understand context
grep("specific_symbol") → find exact usages
edit → make changes
\`\`\``,

  requiresApproval: false,
  category: 'file-search',
  riskLevel: 'safe',
  allowedCallers: ['direct', 'code_execution'],
  deferLoading: false, // Always available - essential for context gathering
  searchKeywords: [
    'semantic', 'search', 'find', 'codebase', 'code', 'similar',
    'meaning', 'concept', 'implementation', 'discover', 'relevant',
    'vector', 'embedding', 'AI search', 'smart search',
  ],
  
  ui: {
    icon: 'Brain',
    label: 'Semantic Search',
    color: 'text-indigo-400',
    runningLabel: 'Searching...',
    completedLabel: 'Found',
  },

  inputExamples: [
    // Example 1: Simple conceptual search
    {
      query: 'user authentication and login logic',
    },
    // Example 2: Search with filters
    {
      query: 'database connection handling',
      file_types: ['.ts', '.tsx'],
      limit: 5,
    },
    // Example 3: Search for specific symbol types
    {
      query: 'utility functions for string manipulation',
      symbol_types: ['function'],
      min_score: 0.4,
    },
    // Example 4: Search in specific path
    {
      query: 'API route handlers',
      path_pattern: 'src/api',
      languages: ['typescript'],
    },
    // Example 5: High precision search
    {
      query: 'error boundary React component',
      min_score: 0.5,
      limit: 3,
      include_content: true,
    },
  ],

  schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language query describing what you\'re looking for',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 10)',
      },
      min_score: {
        type: 'number',
        description: 'Minimum similarity score threshold 0-1 (default: 0.3)',
      },
      path_pattern: {
        type: 'string',
        description: 'Filter by file path pattern (substring match)',
      },
      file_types: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by file types (e.g., [".ts", ".tsx"])',
      },
      languages: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by programming languages (e.g., ["typescript", "python"])',
      },
      symbol_types: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by symbol types (e.g., ["function", "class", "interface"])',
      },
      include_content: {
        type: 'boolean',
        description: 'Include full code content in results (default: true)',
      },
    },
    required: ['query'],
  },

  async execute(args: CodebaseSearchArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    // Validate workspace
    if (!context.workspacePath) {
      return {
        toolName: 'codebase_search',
        success: false,
        output: formatNoWorkspaceError(),
      };
    }

    // Validate query
    if (!args.query || typeof args.query !== 'string' || args.query.trim().length === 0) {
      return {
        toolName: 'codebase_search',
        success: false,
        output: formatInvalidQueryError(),
      };
    }

    const query = args.query.trim();

    try {
      // Get the semantic indexer
      const indexer = getSemanticIndexer();
      
      // Check if indexer is ready
      if (!indexer.isReady()) {
        return {
          toolName: 'codebase_search',
          success: false,
          output: formatIndexNotReadyError(),
        };
      }

      // Build search options
      const searchOptions: SearchOptions = {
        limit: args.limit ?? 10,
        minScore: args.min_score ?? 0.3,
        filePathPattern: args.path_pattern,
        fileTypes: args.file_types,
        languages: args.languages,
        symbolTypes: args.symbol_types,
        includeContent: args.include_content ?? true,
      };

      // Perform semantic search
      const result = await indexer.search({ query, options: searchOptions });

      // Check abort signal
      if (context.signal?.aborted) {
        return {
          toolName: 'codebase_search',
          success: false,
          output: 'Search aborted',
        };
      }

      const duration = Date.now() - startTime;

      // Format results
      const output = formatSearchResults(
        result.results,
        query,
        context.workspacePath,
        result.queryTimeMs,
        result.totalDocumentsSearched,
        searchOptions
      );

      logger.info('Semantic search completed', {
        query: query.substring(0, 50),
        resultsCount: result.results.length,
        totalSearched: result.totalDocumentsSearched,
        queryTimeMs: result.queryTimeMs,
        totalDurationMs: duration,
      });

      return {
        toolName: 'codebase_search',
        success: true,
        output,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Semantic search failed', { query, error: errorMessage });

      return {
        toolName: 'codebase_search',
        success: false,
        output: formatSearchError(errorMessage),
      };
    }
  },
};

// =============================================================================
// Output Formatting
// =============================================================================

interface SearchResultItem {
  document: {
    id: string;
    filePath: string;
    chunkIndex: number;
    content: string;
    metadata: {
      fileType: string;
      language?: string;
      symbolType?: string;
      symbolName?: string;
      startLine?: number;
      endLine?: number;
    };
  };
  score: number;
  distance: number;
}

function formatSearchResults(
  results: SearchResultItem[],
  query: string,
  workspacePath: string,
  queryTimeMs: number,
  totalDocuments: number,
  options: SearchOptions
): string {
  const lines: string[] = [];

  // Header
  lines.push(`═══ SEMANTIC SEARCH RESULTS ═══`);
  lines.push(``);
  lines.push(`Query: "${query}"`);
  lines.push(`Found: ${results.length} relevant matches (searched ${totalDocuments} chunks in ${queryTimeMs}ms)`);
  
  // Show active filters if any
  const filters: string[] = [];
  if (options.fileTypes?.length) filters.push(`types: ${options.fileTypes.join(', ')}`);
  if (options.languages?.length) filters.push(`languages: ${options.languages.join(', ')}`);
  if (options.symbolTypes?.length) filters.push(`symbols: ${options.symbolTypes.join(', ')}`);
  if (options.filePathPattern) filters.push(`path: *${options.filePathPattern}*`);
  if (filters.length > 0) {
    lines.push(`Filters: ${filters.join(' | ')}`);
  }
  lines.push(``);

  if (results.length === 0) {
    lines.push(`No matching code found.`);
    lines.push(``);
    lines.push(`═══ SUGGESTIONS ═══`);
    lines.push(`• Try different/broader query terms`);
    lines.push(`• Lower min_score threshold (current: ${options.minScore})`);
    lines.push(`• Remove file type/language filters`);
    lines.push(`• Use grep for exact text patterns`);
    return lines.join('\n');
  }

  lines.push(`═══ MATCHES ═══`);
  lines.push(``);

  // Format each result
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const { document, score } = result;
    const relativePath = relative(workspacePath, document.filePath).replace(/\\/g, '/');
    
    // Result header
    const scorePercent = (score * 100).toFixed(0);
    const symbolInfo = document.metadata.symbolName 
      ? ` • ${document.metadata.symbolType || 'symbol'}: ${document.metadata.symbolName}`
      : '';
    const lineInfo = document.metadata.startLine 
      ? ` (L${document.metadata.startLine}-${document.metadata.endLine})`
      : '';
    
    lines.push(`[${i + 1}] ${relativePath}${lineInfo}`);
    lines.push(`    Score: ${scorePercent}% | ${document.metadata.language || document.metadata.fileType}${symbolInfo}`);
    
    // Content preview (if included)
    if (options.includeContent && document.content) {
      lines.push(`    ─────────────────────────────────────`);
      const contentLines = document.content.split('\n').slice(0, 15);
      for (const line of contentLines) {
        lines.push(`    ${line}`);
      }
      if (document.content.split('\n').length > 15) {
        lines.push(`    ... (${document.content.split('\n').length - 15} more lines)`);
      }
    }
    lines.push(``);
  }

  // Footer with next steps
  lines.push(`═══ NEXT STEPS ═══`);
  lines.push(`• Use \`read\` to see full file content`);
  lines.push(`• Use \`grep\` for exact symbol/text search`);
  lines.push(`• Use \`lsp_definition\` to navigate to definitions`);

  return lines.join('\n');
}

function formatNoWorkspaceError(): string {
  return `═══ NO WORKSPACE ═══

Semantic search requires an active workspace context.

═══ POSSIBLE CAUSES ═══
• The session's workspace was deleted or removed
• The session was created without a workspace binding

═══ SOLUTION ═══
Create a new session after selecting a workspace.`;
}

function formatInvalidQueryError(): string {
  return `═══ INVALID QUERY ═══

Query must be a non-empty string describing what you're looking for.

═══ EXAMPLES ═══
• "user authentication and login logic"
• "database connection handling"
• "React component for file upload"
• "error handling utilities"
• "API route handlers for users"`;
}

function formatIndexNotReadyError(): string {
  return `═══ INDEX NOT READY ═══

The semantic index is not yet initialized or is still building.

═══ POSSIBLE CAUSES ═══
• Workspace was just opened and indexing is in progress
• Indexing was disabled in settings
• The index failed to initialize

═══ ALTERNATIVES ═══
• Wait for indexing to complete
• Use \`grep\` for text-based search in the meantime
• Check settings to ensure indexing is enabled`;
}

function formatSearchError(errorMessage: string): string {
  return `═══ SEARCH ERROR ═══

Failed to perform semantic search.

═══ ERROR ═══
${errorMessage}

═══ ALTERNATIVES ═══
• Try again with a simpler query
• Use \`grep\` for text-based search
• Check if the workspace is properly indexed`;
}
