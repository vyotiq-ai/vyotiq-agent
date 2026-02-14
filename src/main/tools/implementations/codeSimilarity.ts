/**
 * Code Similarity Tool
 *
 * Computes semantic similarity between code blocks using the Rust backend's
 * Qwen3-Embedding-0.6B model. Embeds code snippets into vectors and computes
 * cosine similarity to find structurally/conceptually similar code.
 *
 * Use cases:
 * - Find duplicate or near-duplicate code for refactoring
 * - Locate similar implementations across the codebase
 * - Compare patterns and detect code clones
 */
import { promises as fs } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { rustSidecar } from '../../rustSidecar';
import { createLogger } from '../../logger';
import { formatToolError, formatToolSuccess, checkCancellation, formatCancelled } from '../types/formatUtils';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type { ToolExecutionResult } from '../../../shared/types';

const logger = createLogger('tool:codeSimilarity');

const REQUEST_TIMEOUT = 30_000;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_SNIPPET_LENGTH = 8000; // chars - stay within embedding model's window

// ---------------------------------------------------------------------------
// Rust backend HTTP helper
// ---------------------------------------------------------------------------

async function rustRequest<T>(path: string, options: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const port = rustSidecar.getPort();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

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

interface CodeSimilarityArgs extends Record<string, unknown> {
  /** Source code snippet or file path to find similar code for */
  source: string;
  /** Whether source is a file path (true) or inline code (false). Auto-detected if omitted. */
  is_file?: boolean;
  /** Scope: directory to search within (defaults to workspace root) */
  scope?: string;
  /** Filter by file extension (e.g., "ts", "py") */
  file_type?: string;
  /** Minimum similarity score 0-1 (default: 0.3) */
  min_score?: number;
  /** Maximum results (default: 10, max: 30) */
  limit?: number;
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

// ---------------------------------------------------------------------------
// Workspace ID resolution
// ---------------------------------------------------------------------------

async function resolveWorkspaceId(workspacePath: string): Promise<string | null> {
  try {
    const data = await rustRequest<{ workspaces: Array<{ id: string; path: string }> }>('/api/workspaces');
    const workspaces = data.workspaces ?? (data as unknown as Array<{ id: string; path: string }>);
    const list = Array.isArray(workspaces) ? workspaces : [];
    const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const target = normalize(workspacePath);
    for (const ws of list) {
      if (normalize(ws.path) === target) return ws.id;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine if input looks like a file path rather than code.
 */
function looksLikeFilePath(input: string): boolean {
  // No newlines, has path separators or known extension
  if (input.includes('\n')) return false;
  if (input.includes('/') || input.includes('\\')) return true;
  const ext = extname(input);
  if (['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.c', '.cpp', '.rb', '.php', '.vue', '.svelte'].includes(ext)) return true;
  return false;
}

/**
 * Read a source file and extract a meaningful query from it.
 * For semantic search, we use the code itself as the query — the embedding model
 * understands code semantics and will find similar implementations.
 */
async function readSourceCode(source: string, workspacePath: string): Promise<{ code: string; filePath: string }> {
  const fullPath = source.startsWith('/') || source.includes(':')
    ? source
    : join(workspacePath, source);

  const stat = await fs.stat(fullPath);
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(`File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
  }

  const content = await fs.readFile(fullPath, 'utf-8');
  return { code: content, filePath: fullPath };
}

/**
 * Extract the most semantically meaningful portion of code for the query.
 */
function extractQueryFromCode(code: string): string {
  // Strip comments and blank lines for a denser semantic signal
  const lines = code.split('\n');
  const meaningful = lines.filter((l) => {
    const trimmed = l.trim();
    if (trimmed === '') return false;
    if (trimmed.startsWith('//') && !trimmed.startsWith('///')) return false;
    if (trimmed.startsWith('#') && !trimmed.startsWith('#!')) return false;
    return true;
  });

  const cleaned = meaningful.join('\n');
  if (cleaned.length <= MAX_SNIPPET_LENGTH) return cleaned;

  // Take the first portion — the embedding model handles truncation well
  return cleaned.substring(0, MAX_SNIPPET_LENGTH);
}

// ---------------------------------------------------------------------------
// Tool Definition
// ---------------------------------------------------------------------------

export const codeSimilarityTool: ToolDefinition<CodeSimilarityArgs> = {
  name: 'code_similarity',
  description: `Find code that is semantically similar to a given code snippet or file. Uses vector embeddings to detect code clones, duplicate patterns, and similar implementations across the codebase.

## When to Use
- **Refactoring**: Find duplicate code to consolidate → provide a function and find copies
- **Code review**: Check if similar logic already exists before writing new code
- **Pattern detection**: Find all implementations following a similar pattern
- **Migration**: Find all code similar to a deprecated pattern that needs updating
- **Learning**: Find similar examples to understand a coding pattern

## Input
Provide either:
- A **code snippet** (inline code directly in the source parameter)
- A **file path** (relative to workspace root)

## How It Works
The code is embedded using Qwen3-Embedding-0.6B (same model used for indexing), then cosine similarity is computed against all indexed code chunks via HNSW nearest-neighbor search. Higher scores indicate more similar code.

## Score Interpretation
- **80-100%**: Nearly identical code (likely copy-paste)
- **60-80%**: Very similar structure/logic (potential refactoring candidate)
- **40-60%**: Related patterns or concepts
- **30-40%**: Loosely related code`,

  requiresApproval: false,
  category: 'file-search',

  schema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: 'Code snippet (inline) or file path to find similar code for',
      },
      is_file: {
        type: 'boolean',
        description: 'Whether source is a file path. Auto-detected if omitted.',
      },
      scope: {
        type: 'string',
        description: 'Directory to search within (defaults to workspace root)',
      },
      file_type: {
        type: 'string',
        description: 'Filter results by file extension (e.g., "ts", "py")',
      },
      min_score: {
        type: 'number',
        description: 'Minimum similarity score 0-1 (default: 0.3)',
      },
      limit: {
        type: 'number',
        description: 'Maximum results (default: 10, max: 30)',
      },
    },
    required: ['source'],
  },

  ui: {
    icon: 'GitCompare',
    label: 'Code Similarity',
    color: 'text-teal-400',
    runningLabel: 'Comparing code',
    completedLabel: 'Similarity found',
  },

  searchKeywords: [
    'similarity', 'similar code', 'duplicate', 'clone', 'copy',
    'refactor', 'dedup', 'near-duplicate', 'pattern', 'compare',
  ],

  inputExamples: [
    {
      source: 'async function fetchData(url: string) {\n  const response = await fetch(url);\n  if (!response.ok) throw new Error(`HTTP ${response.status}`);\n  return response.json();\n}',
      limit: 10,
    },
    {
      source: 'src/main/agent/orchestrator.ts',
      is_file: true,
      min_score: 0.4,
      limit: 5,
    },
    {
      source: 'function retry(fn, maxAttempts = 3) {\n  for (let i = 0; i < maxAttempts; i++) {\n    try { return fn(); } catch (e) { if (i === maxAttempts - 1) throw e; }\n  }\n}',
      scope: 'src/main',
      file_type: 'ts',
    },
  ],

  execute: async (args: CodeSimilarityArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> => {
    const { source, scope, file_type, min_score = 0.3, limit = 10 } = args;
    let { is_file } = args;

    if (!source || source.trim().length === 0) {
      return {
        toolName: 'code_similarity',
        success: false,
        output: formatToolError({ message: 'Source is required. Provide a code snippet or file path.' }),
      };
    }

    if (checkCancellation(context.signal)) return formatCancelled('code_similarity');

    if (!rustSidecar.isRunning()) {
      return {
        toolName: 'code_similarity',
        success: false,
        output: formatToolError({
          title: 'Backend Not Available',
          message: 'The Rust backend is not running. Code similarity requires the embedding engine.',
          suggestion: 'The backend should start automatically. Try again in a few seconds.',
        }),
      };
    }

    try {
      const workspaceId = await resolveWorkspaceId(context.workspacePath);
      if (!workspaceId) {
        return {
          toolName: 'code_similarity',
          success: false,
          output: formatToolError({
            title: 'Workspace Not Indexed',
            message: 'This workspace is not registered with the search backend.',
          }),
        };
      }

      if (checkCancellation(context.signal)) return formatCancelled('code_similarity');

      // Determine if source is a file path or inline code
      if (is_file === undefined) {
        is_file = looksLikeFilePath(source.trim());
      }

      let queryCode: string;
      let sourceFile: string | null = null;

      if (is_file) {
        try {
          const result = await readSourceCode(source.trim(), context.workspacePath);
          queryCode = result.code;
          sourceFile = relative(context.workspacePath, result.filePath).replace(/\\/g, '/');
        } catch (err) {
          return {
            toolName: 'code_similarity',
            success: false,
            output: formatToolError({
              title: 'File Read Error',
              message: `Could not read source file: ${(err as Error).message}`,
              filePath: source,
            }),
          };
        }
      } else {
        queryCode = source.trim();
      }

      // Extract meaningful code for the query
      const searchQuery = extractQueryFromCode(queryCode);
      if (searchQuery.length < 10) {
        return {
          toolName: 'code_similarity',
          success: false,
          output: formatToolError({
            message: 'Source code is too short for meaningful similarity comparison. Provide at least a few lines of code.',
          }),
        };
      }

      if (checkCancellation(context.signal)) return formatCancelled('code_similarity');

      // Run semantic search using the code as the query
      const clampedLimit = Math.min(Math.max(1, limit), 30);
      const clampedScore = Math.max(0.15, Math.min(1, min_score));

      const response = await rustRequest<SemanticSearchResponse>(
        `/api/workspaces/${workspaceId}/search/semantic`,
        {
          method: 'POST',
          body: JSON.stringify({ query: searchQuery, limit: clampedLimit * 2 }),
        },
        context.signal,
      );

      // Post-filter
      let results = response.results.filter((r) => r.score >= clampedScore);

      // Exclude the source file from results (self-match)
      if (sourceFile) {
        results = results.filter((r) => {
          const rp = r.relative_path.replace(/\\/g, '/');
          return rp !== sourceFile;
        });
      }

      if (scope) {
        const scopeNorm = scope.replace(/\\/g, '/').replace(/\/+$/, '');
        results = results.filter((r) => {
          const rp = r.relative_path.replace(/\\/g, '/');
          return rp.startsWith(scopeNorm) || rp.startsWith(`/${scopeNorm}`);
        });
      }

      if (file_type) {
        const ext = file_type.startsWith('.') ? file_type : `.${file_type}`;
        results = results.filter((r) => r.relative_path.endsWith(ext));
      }

      results = results.slice(0, clampedLimit);

      if (results.length === 0) {
        return {
          toolName: 'code_similarity',
          success: true,
          output: formatToolSuccess({
            title: 'Code Similarity',
            message: 'No similar code found.',
            details: [
              sourceFile ? `Source: ${sourceFile}` : `Source: inline code (${queryCode.split('\n').length} lines)`,
              `Score threshold: ${(clampedScore * 100).toFixed(0)}%`,
              scope ? `Scope: ${scope}` : '',
              file_type ? `File type: .${file_type}` : '',
              '',
              'Try lowering min_score or broadening the scope.',
            ].filter(Boolean).join('\n'),
            durationMs: response.query_time_ms,
          }),
          metadata: { resultCount: 0, queryTimeMs: response.query_time_ms },
        };
      }

      // Format output
      const lines: string[] = [];
      lines.push('Code Similarity Results');
      if (sourceFile) {
        lines.push(`Source: ${sourceFile}`);
      } else {
        lines.push(`Source: inline code (${queryCode.split('\n').length} lines)`);
      }
      lines.push(`${results.length} similar code blocks found in ${response.query_time_ms}ms`);
      lines.push('');

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const scorePercent = (r.score * 100).toFixed(1);
        const lineRange = r.line_end > r.line_start ? `L${r.line_start}-${r.line_end}` : `L${r.line_start}`;

        // Similarity classification
        let classification = '';
        if (r.score >= 0.8) classification = ' [near-duplicate]';
        else if (r.score >= 0.6) classification = ' [very similar]';
        else if (r.score >= 0.4) classification = ' [related pattern]';
        else classification = ' [loosely related]';

        lines.push(`[${i + 1}] ${r.relative_path}:${lineRange}  ${scorePercent}% similarity${classification}`);

        const chunk = r.chunk_text.trim();
        if (chunk.length > 0) {
          const previewLines = chunk.split('\n').slice(0, 15);
          for (const cl of previewLines) {
            lines.push(`    ${cl}`);
          }
          if (chunk.split('\n').length > 15) {
            lines.push('    ...');
          }
        }
        lines.push('');
      }

      logger.info('Code similarity search completed', {
        sourceFile: sourceFile || 'inline',
        resultCount: results.length,
        queryTimeMs: response.query_time_ms,
        topScore: results[0]?.score,
      });

      return {
        toolName: 'code_similarity',
        success: true,
        output: lines.join('\n'),
        metadata: {
          resultCount: results.length,
          queryTimeMs: response.query_time_ms,
          topScore: results[0]?.score,
          sourceFile: sourceFile || undefined,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Code similarity failed', { error: message });
      return {
        toolName: 'code_similarity',
        success: false,
        output: formatToolError({
          title: 'Code Similarity Failed',
          message,
          suggestion: 'The semantic search engine may be unavailable. Try again in a moment.',
        }),
      };
    }
  },
};
