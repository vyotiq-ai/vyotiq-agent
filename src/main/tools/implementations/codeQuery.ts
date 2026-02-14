/**
 * Code Query Tool
 *
 * Natural language code query engine that combines semantic vector search
 * with structured code analysis to answer questions like:
 * "find all functions that handle user authentication"
 *
 * Uses the Rust backend's Qwen3-Embedding-0.6B model for semantic matching
 * and augments results with pattern-based code structure analysis.
 */
import { promises as fs } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { rustSidecar } from '../../rustSidecar';
import { createLogger } from '../../logger';
import { formatToolError, formatToolSuccess, checkCancellation, formatCancelled } from '../types/formatUtils';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type { ToolExecutionResult } from '../../../shared/types';

const logger = createLogger('tool:codeQuery');

const REQUEST_TIMEOUT = 30_000;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB for targeted reads

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

interface CodeQueryArgs extends Record<string, unknown> {
  /** Natural language question about the codebase */
  query: string;
  /** Scope to search in — specific directory or file pattern */
  scope?: string;
  /** Focus area: "functions", "classes", "imports", "types", "tests", "config", or "all" */
  focus?: 'functions' | 'classes' | 'imports' | 'types' | 'tests' | 'config' | 'all';
  /** Maximum results (default: 10, max: 30) */
  limit?: number;
  /** Include surrounding context lines for each result (default: 3) */
  context_lines?: number;
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

interface CodeMatch {
  file: string;
  relativePath: string;
  lineStart: number;
  lineEnd: number;
  code: string;
  language: string;
  score: number;
  matchType: 'semantic' | 'structural';
  symbolName?: string;
  symbolKind?: string;
}

// ---------------------------------------------------------------------------
// Structural pattern matchers — augment semantic results with code structure
// ---------------------------------------------------------------------------

const STRUCTURAL_PATTERNS: Record<string, RegExp[]> = {
  functions: [
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
    /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/g,
    /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\))?\s*=>/g,
    /(\w+)\s*\([^)]*\)\s*(?::\s*\w[^{]*)?{/g,
    /def\s+(\w+)\s*\(/g,       // Python
    /fn\s+(\w+)\s*[<(]/g,      // Rust
    /func\s+(\w+)\s*\(/g,      // Go
  ],
  classes: [
    /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g,
    /(?:export\s+)?interface\s+(\w+)/g,
    /(?:export\s+)?type\s+(\w+)\s*=/g,
    /(?:export\s+)?enum\s+(\w+)/g,
    /struct\s+(\w+)/g,          // Rust/Go
    /trait\s+(\w+)/g,           // Rust
    /impl\s+(?:<[^>]+>\s+)?(\w+)/g, // Rust
  ],
  imports: [
    /import\s+.*?from\s+['"]([^'"]+)['"]/g,
    /import\s+['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /use\s+([\w:]+)/g,          // Rust
    /from\s+(\S+)\s+import/g,   // Python
  ],
  types: [
    /(?:export\s+)?(?:type|interface)\s+(\w+)/g,
    /(?:export\s+)?enum\s+(\w+)/g,
    /type\s+(\w+)\s+=/g,
    /struct\s+(\w+)/g,
    /trait\s+(\w+)/g,
  ],
  tests: [
    /(?:describe|it|test|expect)\s*\(/g,
    /(?:beforeEach|afterEach|beforeAll|afterAll)\s*\(/g,
    /#\[(?:test|cfg\(test\))]/g,     // Rust
    /def\s+test_\w+/g,               // Python
    /func\s+Test\w+/g,               // Go
  ],
  config: [
    /(?:export\s+)?(?:default|const)\s+\w*[Cc]onfig/g,
    /(?:export\s+)?(?:default|const)\s+\w*[Ss]ettings/g,
    /(?:export\s+)?(?:default|const)\s+\w*[Oo]ptions/g,
  ],
};

/**
 * Extract structural symbols from code text.
 */
function extractStructuralMatches(
  code: string,
  focus: string,
  queryTerms: string[],
): Array<{ name: string; kind: string; line: number }> {
  const patterns = focus === 'all'
    ? Object.entries(STRUCTURAL_PATTERNS).flatMap(([kind, pats]) => pats.map((p) => ({ kind, pattern: p })))
    : (STRUCTURAL_PATTERNS[focus] || []).map((p) => ({ kind: focus, pattern: p }));

  const matches: Array<{ name: string; kind: string; line: number }> = [];
  const lines = code.split('\n');

  for (const { kind, pattern } of patterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(code)) !== null) {
      const name = match[1] || match[0];
      const lineIdx = code.substring(0, match.index).split('\n').length;

      // Check if any query term appears in the surrounding context
      const contextStart = Math.max(0, lineIdx - 5);
      const contextEnd = Math.min(lines.length, lineIdx + 10);
      const contextText = lines.slice(contextStart, contextEnd).join('\n').toLowerCase();

      const isRelevant = queryTerms.some((term) => contextText.includes(term));
      if (isRelevant) {
        matches.push({ name: name.trim(), kind, line: lineIdx });
      }
    }
  }

  return matches;
}

/**
 * Tokenize a natural language query into search terms.
 */
function tokenizeQuery(query: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
    'should', 'may', 'might', 'must', 'can', 'could', 'to', 'of', 'in',
    'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
    'during', 'before', 'after', 'above', 'below', 'between', 'out',
    'off', 'up', 'down', 'that', 'this', 'these', 'those', 'it', 'its',
    'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
    'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most',
    'other', 'some', 'such', 'no', 'only', 'same', 'than', 'too',
    'very', 'just', 'find', 'show', 'get', 'where', 'how', 'what',
    'which', 'who', 'whom', 'why', 'when', 'me', 'my', 'i',
  ]);

  return query
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
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
// Tool Definition
// ---------------------------------------------------------------------------

export const codeQueryTool: ToolDefinition<CodeQueryArgs> = {
  name: 'code_query',
  description: `Answer natural language questions about the codebase by combining semantic vector search with structural code analysis.

## When to Use
- **"Find all functions that handle user authentication"** → semantic + function pattern matching
- **"What classes manage database connections?"** → semantic + class pattern matching
- **"Where are the API routes defined?"** → semantic search across config/routing files
- **"Show me the error handling patterns"** → semantic search for error/recovery concepts
- **"What tests cover the payment module?"** → semantic + test pattern matching

## How It Works
1. Runs semantic vector search (Qwen3 embeddings + HNSW) to find conceptually relevant code
2. Augments with structural pattern analysis (function/class/import extraction)
3. Scores and ranks results by semantic similarity + structural relevance
4. Returns code snippets with surrounding context

## Parameters
- **query** (required): Natural language question about the code
- **scope**: Directory or file pattern to restrict search (e.g., "src/main/agent")
- **focus**: Code element type — "functions", "classes", "imports", "types", "tests", "config", or "all"
- **limit**: Max results (default 10, max 30)
- **context_lines**: Lines of context around each match (default 3)`,

  requiresApproval: false,
  category: 'file-search',

  schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language question about the codebase',
      },
      scope: {
        type: 'string',
        description: 'Directory or file pattern to restrict search scope',
      },
      focus: {
        type: 'string',
        enum: ['functions', 'classes', 'imports', 'types', 'tests', 'config', 'all'],
        description: 'Type of code element to focus on (default: "all")',
      },
      limit: {
        type: 'number',
        description: 'Maximum results (default: 10, max: 30)',
      },
      context_lines: {
        type: 'number',
        description: 'Context lines around each match (default: 3)',
      },
    },
    required: ['query'],
  },

  ui: {
    icon: 'MessageSquare',
    label: 'Code Query',
    color: 'text-indigo-400',
    runningLabel: 'Querying code',
    completedLabel: 'Query complete',
  },

  searchKeywords: [
    'natural language', 'code query', 'find functions', 'find classes',
    'code search', 'ask', 'question', 'what', 'where', 'how', 'which',
    'authentication', 'handler', 'middleware', 'pattern',
  ],

  inputExamples: [
    {
      query: 'find all functions that handle user authentication',
      focus: 'functions',
      limit: 10,
    },
    {
      query: 'what classes manage database connections?',
      focus: 'classes',
      scope: 'src',
    },
    {
      query: 'show me the error handling patterns in the agent module',
      scope: 'src/main/agent',
      focus: 'functions',
      context_lines: 5,
    },
  ],

  execute: async (args: CodeQueryArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> => {
    const { query, scope, focus = 'all', limit = 10, context_lines = 3 } = args;

    if (!query || query.trim().length === 0) {
      return {
        toolName: 'code_query',
        success: false,
        output: formatToolError({ message: 'Query is required. Ask a natural language question about the codebase.' }),
      };
    }

    if (checkCancellation(context.signal)) return formatCancelled('code_query');

    if (!rustSidecar.isRunning()) {
      return {
        toolName: 'code_query',
        success: false,
        output: formatToolError({
          title: 'Backend Not Available',
          message: 'The Rust backend is not running. Code query requires the semantic search engine.',
          suggestion: 'The backend should start automatically. Try again in a few seconds.',
        }),
      };
    }

    try {
      const workspaceId = await resolveWorkspaceId(context.workspacePath);
      if (!workspaceId) {
        return {
          toolName: 'code_query',
          success: false,
          output: formatToolError({
            title: 'Workspace Not Indexed',
            message: 'This workspace is not registered with the search backend.',
            suggestion: 'The workspace may still be initializing.',
          }),
        };
      }

      if (checkCancellation(context.signal)) return formatCancelled('code_query');

      const startTime = Date.now();
      const clampedLimit = Math.min(Math.max(1, limit), 30);
      const queryTerms = tokenizeQuery(query);

      // Step 1: Semantic vector search
      const semanticResults = await rustRequest<SemanticSearchResponse>(
        `/api/workspaces/${workspaceId}/search/semantic`,
        {
          method: 'POST',
          body: JSON.stringify({ query: query.trim(), limit: clampedLimit * 2 }),
        },
        context.signal,
      ).catch((): SemanticSearchResponse => ({ results: [], query_time_ms: 0 }));

      if (checkCancellation(context.signal)) return formatCancelled('code_query');

      // Step 2: Filter by scope if provided
      let filteredSemantic = semanticResults.results;
      if (scope) {
        const scopeNorm = scope.replace(/\\/g, '/').replace(/\/+$/, '');
        filteredSemantic = filteredSemantic.filter((r) => {
          const rp = r.relative_path.replace(/\\/g, '/');
          return rp.startsWith(scopeNorm) || rp.startsWith(`/${scopeNorm}`);
        });
      }

      // Step 3: For each semantic result, run structural analysis
      const codeMatches: CodeMatch[] = [];
      const seenFiles = new Set<string>();

      for (const sr of filteredSemantic.slice(0, clampedLimit * 2)) {
        if (checkCancellation(context.signal)) return formatCancelled('code_query');

        // Normalize relative path using node path utilities
        const normalizedRelPath = relative(context.workspacePath, sr.path || sr.relative_path)
          .replace(/\\/g, '/');
        // Detect language from file extension when not provided by search result
        const detectedLang = sr.language || extname(sr.relative_path).replace('.', '') || 'unknown';

        // Add the semantic chunk as a result
        codeMatches.push({
          file: sr.path,
          relativePath: normalizedRelPath || sr.relative_path,
          lineStart: sr.line_start,
          lineEnd: sr.line_end,
          code: sr.chunk_text,
          language: detectedLang,
          score: sr.score,
          matchType: 'semantic',
        });

        // Structural analysis on the chunk
        if (focus !== 'all' && !seenFiles.has(normalizedRelPath)) {
          seenFiles.add(normalizedRelPath);
          const structural = extractStructuralMatches(sr.chunk_text, focus, queryTerms);
          for (const sym of structural) {
            codeMatches.push({
              file: sr.path,
              relativePath: normalizedRelPath || sr.relative_path,
              lineStart: sr.line_start + sym.line - 1,
              lineEnd: sr.line_start + sym.line + 5,
              code: sr.chunk_text,
              language: detectedLang,
              score: sr.score * 1.2, // Boost structural matches
              matchType: 'structural',
              symbolName: sym.name,
              symbolKind: sym.kind,
            });
          }
        }
      }

      // Step 4: Deduplicate and sort by score
      const seen = new Set<string>();
      const deduplicated = codeMatches.filter((m) => {
        const key = `${m.relativePath}:${m.lineStart}:${m.matchType}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      deduplicated.sort((a, b) => b.score - a.score);
      const finalResults = deduplicated.slice(0, clampedLimit);
      const totalTimeMs = Date.now() - startTime;

      if (finalResults.length === 0) {
        return {
          toolName: 'code_query',
          success: true,
          output: formatToolSuccess({
            title: 'Code Query',
            message: `No results found for: "${query}"`,
            details: [
              scope ? `Scope: ${scope}` : '',
              focus !== 'all' ? `Focus: ${focus}` : '',
              '',
              'Try broadening your query or removing scope/focus filters.',
              'For exact text matches, use the grep tool instead.',
            ].filter(Boolean).join('\n'),
            durationMs: totalTimeMs,
          }),
          metadata: { resultCount: 0, queryTimeMs: totalTimeMs },
        };
      }

      // Step 5: Enrich results with context lines from the file system
      const enrichedResults: Array<CodeMatch & { contextCode?: string }> = [];
      for (const match of finalResults) {
        let contextCode = match.code;

        // Try to read surrounding context from the file
        if (context_lines > 0) {
          try {
            const filePath = join(context.workspacePath, match.relativePath);
            const stat = await fs.stat(filePath);
            if (stat.size <= MAX_FILE_SIZE) {
              const content = await fs.readFile(filePath, 'utf-8');
              const fileLines = content.split('\n');
              const start = Math.max(0, match.lineStart - 1 - context_lines);
              const end = Math.min(fileLines.length, match.lineEnd + context_lines);
              contextCode = fileLines.slice(start, end).join('\n');
            }
          } catch {
            // Fall back to the chunk text
          }
        }

        enrichedResults.push({ ...match, contextCode });
      }

      // Step 6: Format output
      const lines: string[] = [];
      lines.push(`Code query: "${query}"`);
      if (scope) lines.push(`Scope: ${scope}`);
      if (focus !== 'all') lines.push(`Focus: ${focus}`);
      lines.push(`${enrichedResults.length} results in ${totalTimeMs}ms`);
      lines.push('');

      for (let i = 0; i < enrichedResults.length; i++) {
        const r = enrichedResults[i];
        const scorePercent = (r.score * 100).toFixed(1);
        const lineRange = r.lineEnd > r.lineStart ? `L${r.lineStart}-${r.lineEnd}` : `L${r.lineStart}`;
        const typeTag = r.matchType === 'structural' ? ` [${r.symbolKind}: ${r.symbolName}]` : '';

        lines.push(`[${i + 1}] ${r.relativePath}:${lineRange}  (${scorePercent}%${typeTag})`);

        const code = (r.contextCode || r.code).trim();
        if (code.length > 0) {
          const codeLines = code.split('\n').slice(0, 20);
          for (const cl of codeLines) {
            lines.push(`    ${cl}`);
          }
          if (code.split('\n').length > 20) {
            lines.push('    ...');
          }
        }
        lines.push('');
      }

      logger.info('Code query completed', {
        query,
        focus,
        resultCount: enrichedResults.length,
        totalTimeMs,
      });

      return {
        toolName: 'code_query',
        success: true,
        output: lines.join('\n'),
        metadata: {
          resultCount: enrichedResults.length,
          queryTimeMs: totalTimeMs,
          semanticResults: filteredSemantic.length,
          structuralMatches: codeMatches.filter((m) => m.matchType === 'structural').length,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Code query failed', { error: message, query });
      return {
        toolName: 'code_query',
        success: false,
        output: formatToolError({
          title: 'Code Query Failed',
          message,
          suggestion: 'The semantic search engine may be unavailable. Use grep for text-based search.',
        }),
      };
    }
  },
};
