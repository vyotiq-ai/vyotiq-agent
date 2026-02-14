/**
 * Semantic Search Tool
 *
 * Vector/embedding-based semantic similarity search powered by the Rust backend's
 * Qwen3-Embedding-0.6B model and usearch HNSW index.
 *
 * Enables the agent to find code by meaning rather than exact text matching —
 * understanding intent, synonyms, and conceptual relationships across the codebase.
 */
import { rustSidecar } from '../../rustSidecar';
import { createLogger } from '../../logger';
import { formatToolError, formatToolSuccess, checkCancellation, formatCancelled } from '../types/formatUtils';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type { ToolExecutionResult } from '../../../shared/types';

const logger = createLogger('tool:semanticSearch');

const REQUEST_TIMEOUT = 30_000; // 30s — embedding + HNSW search can take a moment
const MAX_RESULTS = 50;
const MIN_SCORE = 0.15;

// ---------------------------------------------------------------------------
// Rust backend HTTP helper
// ---------------------------------------------------------------------------

async function rustRequest<T>(path: string, options: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const port = rustSidecar.getPort();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  // Chain the external signal
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

interface SemanticSearchArgs extends Record<string, unknown> {
  /** Natural language query describing what you're looking for */
  query: string;
  /** Maximum number of results to return (default: 10, max: 50) */
  limit?: number;
  /** Minimum similarity score threshold 0-1 (default: 0.25) */
  min_score?: number;
  /** Filter results by file extension (e.g., "ts", "rs", "py") */
  file_type?: string;
  /** Filter results by path prefix (e.g., "src/main/agent") */
  path_prefix?: string;
}

interface SemanticResult {
  path: string;
  relative_path: string;
  chunk_text: string;
  line_start: number;
  line_end: number;
  language: string;
  score: number;
}

interface SemanticSearchResponse {
  results: SemanticResult[];
  query_time_ms: number;
}

interface IndexStatusResponse {
  indexed: boolean;
  is_indexing: boolean;
  is_vector_indexing: boolean;
  indexed_count: number;
  total_count: number;
  vector_count: number;
  vector_ready: boolean;
  embedding_model_ready: boolean;
}

// ---------------------------------------------------------------------------
// Workspace ID resolution
// ---------------------------------------------------------------------------

async function resolveWorkspaceId(workspacePath: string): Promise<string | null> {
  try {
    const data = await rustRequest<{ workspaces: Array<{ id: string; path: string }> }>('/api/workspaces');
    const workspaces = data.workspaces ?? (data as unknown as Array<{ id: string; path: string }>);
    const list = Array.isArray(workspaces) ? workspaces : [];

    // Normalize paths for comparison
    const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const target = normalize(workspacePath);

    for (const ws of list) {
      if (normalize(ws.path) === target) return ws.id;
    }
    return null;
  } catch (err) {
    logger.error('Failed to resolve workspace ID', { error: (err as Error).message });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tool Definition
// ---------------------------------------------------------------------------

export const semanticSearchTool: ToolDefinition<SemanticSearchArgs> = {
  name: 'semantic_search',
  description: `Search the codebase using natural language and semantic understanding. Unlike grep which matches exact text patterns, this tool understands meaning and finds conceptually related code.

## When to Use
- **Find by intent**: "functions that handle user authentication" → finds auth middleware, login handlers, token validation
- **Discover related code**: "error handling and recovery logic" → finds try/catch blocks, retry mechanisms, fallback strategies
- **Explore unfamiliar codebases**: "where does the app initialize?" → finds entry points, bootstrap code, setup routines
- **Find similar patterns**: "rate limiting implementation" → finds throttling, debouncing, cooldown logic
- **Locate concepts**: "database connection pooling" → finds pool creation, connection management, cleanup

## When NOT to Use (use grep instead)
- Searching for exact strings, variable names, or function names → use grep
- Finding specific import statements → use grep
- Counting occurrences of a pattern → use grep

## How It Works
Uses Qwen3-Embedding-0.6B to convert your query into a vector and searches a pre-built HNSW index of code chunks. Results are ranked by cosine similarity — higher scores mean closer semantic match.

## Parameters
- **query** (required): Natural language description of what you're looking for
- **limit**: Max results (default 10, max 50)
- **min_score**: Minimum similarity 0-1 (default 0.25, lower = more results but less relevant)
- **file_type**: Filter by extension (e.g., "ts", "py", "rs")
- **path_prefix**: Filter by directory (e.g., "src/main/agent")`,

  requiresApproval: false,
  category: 'file-search',

  schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language query describing the code you want to find',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 10, max: 50)',
      },
      min_score: {
        type: 'number',
        description: 'Minimum similarity score 0-1 (default: 0.25)',
      },
      file_type: {
        type: 'string',
        description: 'Filter by file extension (e.g., "ts", "rs", "py")',
      },
      path_prefix: {
        type: 'string',
        description: 'Filter by path prefix (e.g., "src/main/agent")',
      },
    },
    required: ['query'],
  },

  ui: {
    icon: 'Brain',
    label: 'Semantic Search',
    color: 'text-violet-400',
    runningLabel: 'Searching semantically',
    completedLabel: 'Found semantically',
  },

  searchKeywords: [
    'semantic', 'vector', 'embedding', 'similarity', 'meaning', 'natural language', 
    'find code', 'related code', 'conceptual search', 'AI search', 'smart search',
  ],

  inputExamples: [
    {
      query: 'functions that handle user authentication and session management',
      limit: 10,
    },
    {
      query: 'error recovery and retry logic',
      file_type: 'ts',
    },
    {
      query: 'database connection setup and pooling',
      path_prefix: 'src/main',
      min_score: 0.3,
    },
  ],

  execute: async (args: SemanticSearchArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> => {
    const { query, limit = 10, min_score = 0.25, file_type, path_prefix } = args;

    // Validate
    if (!query || query.trim().length === 0) {
      return {
        toolName: 'semantic_search',
        success: false,
        output: formatToolError({ message: 'Query is required. Provide a natural language description of the code you want to find.' }),
      };
    }

    if (checkCancellation(context.signal)) {
      return formatCancelled('semantic_search');
    }

    // Ensure Rust backend is running
    if (!rustSidecar.isRunning()) {
      return {
        toolName: 'semantic_search',
        success: false,
        output: formatToolError({
          title: 'Backend Not Available',
          message: 'The Rust backend is not running. Semantic search requires the Qwen3 embedding engine.',
          suggestion: 'The backend should start automatically. Try again in a few seconds.',
        }),
      };
    }

    try {
      // Resolve workspace ID
      const workspaceId = await resolveWorkspaceId(context.workspacePath);
      if (!workspaceId) {
        return {
          toolName: 'semantic_search',
          success: false,
          output: formatToolError({
            title: 'Workspace Not Indexed',
            message: 'This workspace is not registered with the search backend.',
            suggestion: 'The workspace may still be initializing. Wait for indexing to complete.',
          }),
        };
      }

      if (checkCancellation(context.signal)) {
        return formatCancelled('semantic_search');
      }

      // Check index status
      const status = await rustRequest<IndexStatusResponse>(
        `/api/workspaces/${workspaceId}/index/status`,
        {},
        context.signal,
      );

      if (!status.vector_ready && !status.is_vector_indexing) {
        // Try triggering indexing
        await rustRequest(`/api/workspaces/${workspaceId}/index`, { method: 'POST' }, context.signal);
        return {
          toolName: 'semantic_search',
          success: false,
          output: formatToolError({
            title: 'Vector Index Not Ready',
            message: `Vector embeddings are not yet built for this workspace. Indexing has been triggered (${status.indexed_count} files discovered).`,
            suggestion: 'Wait for vector indexing to complete, then retry. Use grep for text-based search in the meantime.',
          }),
        };
      }

      if (status.is_vector_indexing) {
        return {
          toolName: 'semantic_search',
          success: false,
          output: formatToolError({
            title: 'Vector Index Building',
            message: `Vector embeddings are currently being built (${status.vector_count} chunks embedded so far).`,
            suggestion: 'Wait for indexing to finish, then retry. Use grep for text-based search in the meantime.',
          }),
        };
      }

      if (checkCancellation(context.signal)) {
        return formatCancelled('semantic_search');
      }

      // Execute semantic search
      const clampedLimit = Math.min(Math.max(1, limit), MAX_RESULTS);
      const clampedScore = Math.max(MIN_SCORE, Math.min(1, min_score));

      const response = await rustRequest<SemanticSearchResponse>(
        `/api/workspaces/${workspaceId}/search/semantic`,
        {
          method: 'POST',
          body: JSON.stringify({ query: query.trim(), limit: clampedLimit }),
        },
        context.signal,
      );

      // Post-filter results
      let results = response.results.filter((r) => r.score >= clampedScore);

      if (file_type) {
        const ext = file_type.startsWith('.') ? file_type : `.${file_type}`;
        results = results.filter((r) => r.relative_path.endsWith(ext));
      }

      if (path_prefix) {
        const prefix = path_prefix.replace(/\\/g, '/').replace(/\/+$/, '');
        results = results.filter((r) => {
          const rp = r.relative_path.replace(/\\/g, '/');
          return rp.startsWith(prefix) || rp.startsWith(`/${prefix}`);
        });
      }

      if (results.length === 0) {
        return {
          toolName: 'semantic_search',
          success: true,
          output: formatToolSuccess({
            title: 'Semantic Search',
            message: `No results found for: "${query}"`,
            details: [
              `Score threshold: ${(clampedScore * 100).toFixed(0)}%`,
              file_type ? `File type filter: .${file_type}` : '',
              path_prefix ? `Path filter: ${path_prefix}` : '',
              `Vector index: ${status.vector_count} chunks indexed`,
              '',
              'Try broadening your query, lowering min_score, or using grep for exact text matches.',
            ].filter(Boolean).join('\n'),
            durationMs: response.query_time_ms,
          }),
          metadata: { resultCount: 0, queryTimeMs: response.query_time_ms },
        };
      }

      // Format results
      const lines: string[] = [];
      lines.push(`Semantic search: "${query}"`);
      lines.push(`${results.length} results in ${response.query_time_ms}ms`);
      lines.push('');

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const scorePercent = (r.score * 100).toFixed(1);
        const lineRange = r.line_end > r.line_start ? `L${r.line_start}-${r.line_end}` : `L${r.line_start}`;

        lines.push(`[${i + 1}] ${r.relative_path}:${lineRange}  (${scorePercent}% match${r.language ? `, ${r.language}` : ''})`);

        // Show chunk text (trimmed)
        const chunk = r.chunk_text.trim();
        if (chunk.length > 0) {
          const previewLines = chunk.split('\n').slice(0, 15);
          for (const line of previewLines) {
            lines.push(`    ${line}`);
          }
          if (chunk.split('\n').length > 15) {
            lines.push('    ...');
          }
        }
        lines.push('');
      }

      logger.info('Semantic search completed', {
        query,
        resultCount: results.length,
        queryTimeMs: response.query_time_ms,
      });

      return {
        toolName: 'semantic_search',
        success: true,
        output: lines.join('\n'),
        metadata: {
          resultCount: results.length,
          queryTimeMs: response.query_time_ms,
          topScore: results[0]?.score,
          vectorCount: status.vector_count,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Semantic search failed', { error: message, query });

      return {
        toolName: 'semantic_search',
        success: false,
        output: formatToolError({
          title: 'Semantic Search Failed',
          message,
          suggestion: 'The backend may be busy or the vector index may be rebuilding. Try again in a moment.',
        }),
      };
    }
  },
};
