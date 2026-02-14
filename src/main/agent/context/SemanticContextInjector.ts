/**
 * Semantic Context Injector
 *
 * Automatically enriches agent conversation context by running semantic search
 * against the user's query before each agent iteration. This provides the LLM
 * with relevant code snippets from the codebase without the user or agent
 * explicitly invoking a search tool.
 *
 * Activated via the `enableAutoContextInjection` workspace setting.
 */
import { rustSidecar } from '../../rustSidecar';
import { createLogger } from '../../logger';

const logger = createLogger('SemanticContextInjector');

const REQUEST_TIMEOUT = 15_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SemanticContextConfig {
  /** Whether auto-injection is enabled */
  enabled: boolean;
  /** Maximum number of semantic results to inject */
  maxResults: number;
  /** Minimum similarity score threshold (0-1) */
  minSimilarityScore: number;
  /** Maximum characters of context to inject */
  maxContextChars: number;
}

export interface SemanticContextResult {
  /** Injected context text (ready to append to system prompt or user message) */
  contextText: string;
  /** Number of results used */
  resultCount: number;
  /** Time taken in ms */
  queryTimeMs: number;
  /** Whether context was actually injected (may be skipped if no relevant results) */
  injected: boolean;
}

interface SemanticResult {
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
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_SEMANTIC_CONTEXT_CONFIG: SemanticContextConfig = {
  enabled: true,
  maxResults: 5,
  minSimilarityScore: 0.35,
  maxContextChars: 4000,
};

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
    if (!response.ok) throw new Error(`${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Workspace ID resolution (cached per path)
// ---------------------------------------------------------------------------

const workspaceIdCache = new Map<string, { id: string; expires: number }>();

async function resolveWorkspaceId(workspacePath: string): Promise<string | null> {
  const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const key = normalize(workspacePath);

  // Check cache (5 minute TTL)
  const cached = workspaceIdCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.id;

  try {
    const data = await rustRequest<{ workspaces: Array<{ id: string; path: string }> }>('/api/workspaces');
    const workspaces = data.workspaces ?? (data as unknown as Array<{ id: string; path: string }>);
    const list = Array.isArray(workspaces) ? workspaces : [];

    for (const ws of list) {
      if (normalize(ws.path) === key) {
        workspaceIdCache.set(key, { id: ws.id, expires: Date.now() + 5 * 60_000 });
        return ws.id;
      }
    }
    return null;
  } catch (err) {
    logger.debug('Failed to resolve workspace ID', { workspacePath, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Query extraction — extract meaningful search terms from user message
// ---------------------------------------------------------------------------

/**
 * Determine if a user message is likely to benefit from semantic context injection.
 * Skip for short messages, commands, confirmations, etc.
 */
export function shouldInjectContext(userMessage: string): boolean {
  const trimmed = userMessage.trim();

  // Too short — likely a confirmation or single word
  if (trimmed.length < 15) return false;

  // Looks like a command/config change rather than a coding question
  const commandPatterns = [
    /^(yes|no|y|n|ok|sure|cancel|stop|pause|resume|undo|redo)\b/i,
    /^(set|change|update|toggle|enable|disable|switch)\s+(setting|config|model|provider|theme)/i,
    /^:config\b/i,
    /^\/\w+/,
  ];
  if (commandPatterns.some((p) => p.test(trimmed))) return false;

  // Likely a coding/search question — inject context
  return true;
}

// ---------------------------------------------------------------------------
// Main injection function
// ---------------------------------------------------------------------------

/**
 * Run semantic search based on the user's message and return formatted context
 * that can be prepended to the conversation.
 *
 * This is designed to be called early in the agent execution loop (before the
 * first LLM call) to enrich the context with relevant code snippets.
 */
export async function injectSemanticContext(
  userMessage: string,
  workspacePath: string,
  config: Partial<SemanticContextConfig> = {},
  signal?: AbortSignal,
): Promise<SemanticContextResult> {
  const mergedConfig: SemanticContextConfig = {
    ...DEFAULT_SEMANTIC_CONTEXT_CONFIG,
    ...config,
  };

  const emptyResult: SemanticContextResult = {
    contextText: '',
    resultCount: 0,
    queryTimeMs: 0,
    injected: false,
  };

  if (!mergedConfig.enabled) return emptyResult;
  if (!shouldInjectContext(userMessage)) return emptyResult;
  if (!rustSidecar.isRunning()) return emptyResult;

  try {
    const workspaceId = await resolveWorkspaceId(workspacePath);
    if (!workspaceId) return emptyResult;

    // Run semantic search using the user's message as the query
    const response = await rustRequest<SemanticSearchResponse>(
      `/api/workspaces/${workspaceId}/search/semantic`,
      {
        method: 'POST',
        body: JSON.stringify({
          query: userMessage.trim(),
          limit: mergedConfig.maxResults * 2, // Over-fetch for filtering
        }),
      },
      signal,
    );

    // Filter by minimum score
    const relevant = response.results.filter((r) => r.score >= mergedConfig.minSimilarityScore);

    if (relevant.length === 0) return emptyResult;

    // Build context text, respecting maxContextChars
    const snippets: string[] = [];
    let totalChars = 0;
    let usedCount = 0;

    for (const r of relevant.slice(0, mergedConfig.maxResults)) {
      const lineRange = r.line_end > r.line_start ? `L${r.line_start}-${r.line_end}` : `L${r.line_start}`;
      const header = `[${r.relative_path}:${lineRange}${r.language ? ` (${r.language})` : ''}]`;
      const snippet = r.chunk_text.trim();
      const entry = `${header}\n${snippet}`;

      if (totalChars + entry.length > mergedConfig.maxContextChars) break;

      snippets.push(entry);
      totalChars += entry.length;
      usedCount++;
    }

    if (snippets.length === 0) return emptyResult;

    const contextText = [
      '<relevant_code_context>',
      'The following code snippets from the workspace are semantically related to the current task:',
      '',
      ...snippets,
      '</relevant_code_context>',
    ].join('\n');

    logger.debug('Semantic context injected', {
      resultCount: usedCount,
      queryTimeMs: response.query_time_ms,
      totalChars,
    });

    return {
      contextText,
      resultCount: usedCount,
      queryTimeMs: response.query_time_ms,
      injected: true,
    };
  } catch (err) {
    logger.debug('Semantic context injection skipped', {
      error: err instanceof Error ? err.message : String(err),
    });
    return emptyResult;
  }
}

/**
 * Clear the workspace ID cache. Call when workspace changes.
 */
export function clearWorkspaceIdCache(): void {
  workspaceIdCache.clear();
}
