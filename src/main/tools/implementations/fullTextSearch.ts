/**
 * Full-Text Search Tool
 *
 * BM25-based full-text search powered by the Rust backend's Tantivy engine.
 * Provides ranked keyword search across the entire indexed codebase with
 * optional fuzzy matching and file/language filtering.
 *
 * Complements grep (exact pattern matching) by offering ranked relevance search with Tantivy's BM25 scoring algorithm.
 */
import { rustSidecar } from '../../rustSidecar';
import { createLogger } from '../../logger';
import { resolveWorkspaceId } from '../../utils/rustBackend';
import { formatToolError, formatToolSuccess, checkCancellation, formatCancelled } from '../types/formatUtils';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type { ToolExecutionResult } from '../../../shared/types';

const logger = createLogger('tool:fullTextSearch');

const REQUEST_TIMEOUT = 15_000;
const MAX_RESULTS = 100;

// ---------------------------------------------------------------------------
// Rust backend HTTP helper
// ---------------------------------------------------------------------------

async function rustRequest<T>(path: string, options: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const port = rustSidecar.getPort();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Rust backend ${response.status}: ${body}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FullTextSearchArgs extends Record<string, unknown> {
  /** Keywords or phrase to search for across the codebase */
  query: string;
  /** Maximum number of results (default: 20, max: 100) */
  limit?: number;
  /** Enable fuzzy matching for typo tolerance (default: false) */
  fuzzy?: boolean;
  /** Glob pattern to filter files (e.g., "*.ts", "src\/**\/*.rs") */
  file_pattern?: string;
  /** Filter by programming language (e.g., "typescript", "rust", "python") */
  language?: string;
}

interface SearchResult {
  path: string;
  relative_path: string;
  filename: string;
  language: string;
  score: number;
  snippet: string;
  line_number: number | null;
}

interface SearchResponse {
  results: SearchResult[];
  total_hits: number;
  query_time_ms: number;
}

interface IndexStatusResponse {
  indexed: boolean;
  is_indexing: boolean;
  indexed_count: number;
  total_count: number;
}

// ---------------------------------------------------------------------------
// Tool Definition
// ---------------------------------------------------------------------------

export const fullTextSearchTool: ToolDefinition<FullTextSearchArgs> = {
  name: 'full_text_search',
  description: `Search the indexed codebase using ranked keyword matching (BM25). Returns results ordered by relevance score with contextual snippets.

## When to Use
- **Keyword search**: Find files containing specific terms ranked by relevance
- **Multi-word queries**: "database connection pool config" — ranks files by how well they match all terms
- **Fuzzy matching**: Find code even with typos or slight variations
- **Broad discovery**: Quickly survey which files are most relevant to a topic
- **Alternative to grep**: When you want relevance-ranked results instead of line-by-line matches

## When NOT to Use
- Exact regex pattern matching → use grep

## How It Works
Uses Tantivy (Rust search engine) with BM25 scoring to rank documents by keyword relevance. Searches across file content, filenames, and symbols. Optional fuzzy mode tolerates edit distance up to 2.

## Parameters
- **query** (required): Keywords or phrase to search for
- **limit**: Max results (default 20, max 100)
- **fuzzy**: Enable typo-tolerant fuzzy matching (default false)
- **file_pattern**: Glob to filter files (e.g., "*.ts")
- **language**: Filter by language (e.g., "typescript", "rust")`,

  requiresApproval: false,
  category: 'file-search',
  riskLevel: 'safe',
  deferLoading: true,

  schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Keywords or phrase to search for across the codebase',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 20, max: 100)',
      },
      fuzzy: {
        type: 'boolean',
        description: 'Enable fuzzy matching for typo tolerance (default: false)',
      },
      file_pattern: {
        type: 'string',
        description: 'Glob pattern to filter files (e.g., "*.ts", "src/**/*.rs")',
      },
      language: {
        type: 'string',
        description: 'Filter by programming language (e.g., "typescript", "rust", "python")',
      },
    },
    required: ['query'],
  },

  ui: {
    icon: 'FileSearch',
    label: 'Full-Text Search',
    color: 'text-teal-400',
    runningLabel: 'Searching index',
    completedLabel: 'Search complete',
  },

  searchKeywords: [
    'search', 'find', 'keyword', 'full text', 'fulltext', 'bm25', 'tantivy',
    'ranked search', 'relevance', 'fuzzy', 'index search', 'text search',
  ],

  inputExamples: [
    {
      query: 'context window management token pruning',
      limit: 15,
    },
    {
      query: 'WebSocket connection',
      fuzzy: true,
      language: 'typescript',
    },
    {
      query: 'error handler middleware',
      file_pattern: '*.ts',
      limit: 10,
    },
  ],

  execute: async (args: FullTextSearchArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> => {
    const { query, limit = 20, fuzzy = false, file_pattern, language } = args;

    if (!query || query.trim().length === 0) {
      return {
        toolName: 'full_text_search',
        success: false,
        output: formatToolError({ message: 'Query is required. Provide keywords or a phrase to search for.' }),
      };
    }

    if (checkCancellation(context.signal)) {
      return formatCancelled('full_text_search');
    }

    if (!rustSidecar.isRunning()) {
      return {
        toolName: 'full_text_search',
        success: false,
        output: formatToolError({
          title: 'Backend Not Available',
          message: 'The Rust backend is not running. Full-text search requires the Tantivy search engine.',
          suggestion: 'The backend should start automatically. Try again in a few seconds.',
        }),
      };
    }

    try {
      const workspaceId = await resolveWorkspaceId(context.workspacePath);
      if (!workspaceId) {
        return {
          toolName: 'full_text_search',
          success: false,
          output: formatToolError({
            title: 'Workspace Not Indexed',
            message: 'This workspace is not registered with the search backend.',
            suggestion: 'The workspace may still be initializing. Wait for indexing to complete.',
          }),
        };
      }

      if (checkCancellation(context.signal)) {
        return formatCancelled('full_text_search');
      }

      // Check index status
      const status = await rustRequest<IndexStatusResponse>(
        `/api/workspaces/${workspaceId}/index/status`,
        {},
        context.signal,
      );

      if (!status.indexed && !status.is_indexing) {
        await rustRequest(`/api/workspaces/${workspaceId}/index`, { method: 'POST' }, context.signal);
        return {
          toolName: 'full_text_search',
          success: false,
          output: formatToolError({
            title: 'Index Not Ready',
            message: 'Full-text index is not yet built. Indexing has been triggered.',
            suggestion: 'Wait for indexing to complete, then retry. Use grep for immediate text search.',
          }),
        };
      }

      if (status.is_indexing) {
        return {
          toolName: 'full_text_search',
          success: false,
          output: formatToolError({
            title: 'Index Building',
            message: `Full-text index is currently being built (${status.indexed_count}/${status.total_count} files).`,
            suggestion: 'Wait for indexing to finish, then retry. Use grep for immediate text search.',
          }),
        };
      }

      if (checkCancellation(context.signal)) {
        return formatCancelled('full_text_search');
      }

      // Execute full-text search
      const clampedLimit = Math.min(Math.max(1, limit), MAX_RESULTS);

      const body: Record<string, unknown> = {
        query: query.trim(),
        limit: clampedLimit,
        fuzzy,
      };
      if (file_pattern) body.file_pattern = file_pattern;
      if (language) body.language = language;

      const response = await rustRequest<SearchResponse>(
        `/api/workspaces/${workspaceId}/search`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
        context.signal,
      );

      if (response.results.length === 0) {
        return {
          toolName: 'full_text_search',
          success: true,
          output: formatToolSuccess({
            title: 'Full-Text Search',
            message: `No results found for: "${query}"`,
            details: [
              `Fuzzy: ${fuzzy ? 'enabled' : 'disabled'}`,
              file_pattern ? `File pattern: ${file_pattern}` : '',
              language ? `Language: ${language}` : '',
              `Indexed files: ${status.indexed_count}`,
              '',
              fuzzy ? 'Try different keywords or broader terms.' : 'Try enabling fuzzy matching or broadening your search terms.',
            ].filter(Boolean).join('\n'),
            durationMs: response.query_time_ms,
          }),
          metadata: { resultCount: 0, totalHits: 0, queryTimeMs: response.query_time_ms },
        };
      }

      // Format results
      const lines: string[] = [];
      lines.push(`Full-text search: "${query}"${fuzzy ? ' (fuzzy)' : ''}`);
      lines.push(`${response.total_hits} total hits, showing top ${response.results.length} in ${response.query_time_ms}ms`);
      lines.push('');

      for (let i = 0; i < response.results.length; i++) {
        const r = response.results[i];
        const scoreStr = r.score.toFixed(2);
        const lineInfo = r.line_number != null ? `:${r.line_number}` : '';

        lines.push(`[${i + 1}] ${r.relative_path || r.filename}${lineInfo}  (score: ${scoreStr}${r.language ? `, ${r.language}` : ''})`);

        // Show snippet
        if (r.snippet) {
          const snippetLines = r.snippet.trim().split('\n').slice(0, 8);
          for (const line of snippetLines) {
            lines.push(`    ${line}`);
          }
          if (r.snippet.trim().split('\n').length > 8) {
            lines.push('    ...');
          }
        }
        lines.push('');
      }

      logger.info('Full-text search completed', {
        query,
        resultCount: response.results.length,
        totalHits: response.total_hits,
        queryTimeMs: response.query_time_ms,
      });

      return {
        toolName: 'full_text_search',
        success: true,
        output: lines.join('\n'),
        metadata: {
          resultCount: response.results.length,
          totalHits: response.total_hits,
          queryTimeMs: response.query_time_ms,
          topScore: response.results[0]?.score,
          indexedFiles: status.indexed_count,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Full-text search failed', { error: message, query });

      return {
        toolName: 'full_text_search',
        success: false,
        output: formatToolError({
          title: 'Full-Text Search Failed',
          message,
          suggestion: 'The backend may be busy or the index may be rebuilding. Try again shortly.',
        }),
      };
    }
  },
};
