/**
 * Request Tools Tool
 * 
 * Allows the agent to explicitly request additional tools to be loaded
 * into its context. This gives the agent full control over which tools
 * are available for the current task.
 * 
 * The agent can:
 * - Request specific tools by name
 * - Search for tools by capability/description
 * - List available tools that can be requested
 * - Get tool usage statistics
 * - Get error recovery suggestions
 * 
 * Requested tools persist for the session, so the agent only needs
 * to request them once.
 */
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type { ToolExecutionResult } from '../../../shared/types';
import { addAgentRequestedTools, addDiscoveredTools, getRecentToolErrors, getSessionToolState, getLoadedToolsInfo } from '../../agent/context/ToolContextManager';
import { getToolResultCache } from '../../agent/cache/ToolResultCache';
import { getErrorRecoveryManager } from '../../agent/recovery/ErrorRecoveryManager';

// Tool categories for listing
const TOOL_CATEGORIES = {
  browser: [
    'browser_navigate', 'browser_extract', 'browser_screenshot', 'browser_click',
    'browser_type', 'browser_scroll', 'browser_snapshot', 'browser_fill_form',
    'browser_evaluate', 'browser_wait', 'browser_state', 'browser_back',
    'browser_forward', 'browser_reload', 'browser_fetch', 'browser_hover',
    'browser_security_status', 'browser_check_url', 'browser_console',
    'browser_network', 'browser_tabs',
  ],
  lsp: [
    'lsp_hover', 'lsp_definition', 'lsp_references', 'lsp_symbols',
    'lsp_diagnostics', 'lsp_completions', 'lsp_code_actions', 'lsp_rename',
  ],
  file: [
    'read', 'write', 'edit', 'ls', 'grep', 'glob', 'bulk', 'read_lints',
  ],
  search: [
    'semantic_search', 'full_text_search', 'code_query', 'code_similarity',
  ],
  terminal: [
    'run', 'check_terminal', 'kill_terminal',
  ],
  // Task tools are ALWAYS available - no need to request them
  task: [
    'TodoWrite', 'CreatePlan', 'VerifyTasks', 'GetActivePlan', 'ListPlans', 'DeletePlan',
  ],
  advanced: [
    'create_tool',
  ],
};

// Tool descriptions for search - Enhanced with detailed context for autonomous agent workflows
const TOOL_DESCRIPTIONS: Record<string, string> = {
  // Browser tools - Web automation and scraping
  browser_navigate: 'Navigate to a URL in the browser. Use as first step in any web automation workflow. Supports waiting for page load.',
  browser_extract: 'Extract structured content from the current page using CSS selectors. Best for getting specific data like text, links, or tables.',
  browser_screenshot: 'Take a screenshot of the page. Useful for visual verification, debugging, or capturing state before/after actions.',
  browser_click: 'Click an element on the page by selector. Use after browser_navigate to interact with buttons, links, or other clickable elements.',
  browser_type: 'Type text into an input field. Use for single field input. For multiple fields, prefer browser_fill_form.',
  browser_scroll: 'Scroll the page to reveal content. Use when elements are below the fold or for infinite scroll pages.',
  browser_snapshot: 'Get a snapshot of the page DOM structure. Useful for understanding page layout and finding correct selectors.',
  browser_fill_form: 'Fill multiple form fields at once. More efficient than multiple browser_type calls for forms.',
  browser_evaluate: 'Execute JavaScript in the browser context. Use for complex interactions or data extraction not possible with other tools.',
  browser_wait: 'Wait for a condition or element to appear. Essential for dynamic pages that load content asynchronously.',
  browser_state: 'Get current browser state including URL, title, and page status. Use to verify navigation succeeded.',
  browser_back: 'Navigate back in browser history. Use to return to previous page in multi-page workflows.',
  browser_forward: 'Navigate forward in browser history. Use after browser_back to go forward again.',
  browser_reload: 'Reload the current page. Use when page state needs to be refreshed or after making changes.',
  browser_fetch: 'Fetch content from a URL directly without rendering. Faster than navigate for simple content retrieval.',
  browser_hover: 'Hover over an element to trigger hover states. Use for dropdown menus or tooltips.',
  browser_security_status: 'Check page security status (HTTPS, certificates). Use for security audits or verification.',
  browser_check_url: 'Check if a URL is safe before navigating. Use for untrusted URLs.',
  browser_console: 'Get browser console logs. Essential for debugging JavaScript errors or tracking console output.',
  browser_network: 'Monitor network requests. Use to track API calls, verify requests, or debug loading issues.',
  browser_tabs: 'Manage browser tabs (list, switch, close). Use for multi-tab workflows.',
  
  // LSP tools - Code intelligence and navigation
  lsp_hover: 'Get type info and documentation for a symbol at a specific position. Use to understand what a variable/function is.',
  lsp_definition: 'Go to symbol definition. Use to find where a function/class/variable is defined. Essential for code navigation.',
  lsp_references: 'Find all references to a symbol. Use before refactoring to understand impact. Shows everywhere a symbol is used.',
  lsp_symbols: 'Search for symbols in workspace by name. Use to find functions, classes, or variables without knowing their location.',
  lsp_diagnostics: 'Get code diagnostics (errors, warnings) for files. Use after edits to verify no issues introduced.',
  lsp_completions: 'Get code completion suggestions at a position. Use to see available methods, properties, or imports.',
  lsp_code_actions: 'Get available code actions (quick fixes, refactorings). Use to see automated fixes for issues.',
  lsp_rename: 'Rename a symbol across the entire codebase. Safer than find-replace for refactoring.',
  
  // File tools - Core file operations
  read: 'Read file contents with line numbers. Always read before editing. Supports images, PDFs, and notebooks.',
  write: 'Write/create a file. Use for new files or when rewriting most of a file. Creates parent directories automatically.',
  edit: 'Edit a file with exact string replacement. Use for targeted changes. Requires exact match of old_string.',
  ls: 'List directory contents with details. Use to explore directory structure and find files.',
  grep: 'Search file contents with regex patterns. Use to find code patterns, function calls, or text across files.',
  glob: 'Find files by pattern (e.g., **/*.ts). Use to locate files by name pattern without searching content.',
  bulk: 'Batch file operations (rename, move, copy, delete). Use for multiple file operations in one call.',
  read_lints: 'Get TypeScript/ESLint diagnostics for files. Use after edits to verify code quality. Essential verification step.',
  
  // Search tools - Semantic and full-text code search
  semantic_search: 'Vector/embedding-based semantic code search across the indexed workspace. Use natural language queries to find relevant code. Powered by Qwen3 embeddings + usearch HNSW.',
  full_text_search: 'BM25 ranked keyword search via Tantivy engine. Supports fuzzy matching, language filtering, and file pattern filtering. Best for exact keyword/identifier searches.',
  code_query: 'Natural language code query - ask questions about the codebase and get relevant code snippets with explanations.',
  code_similarity: 'Find code similar to a given snippet or description. Uses vector embeddings to find structurally/semantically similar code.',

  // Terminal tools - Command execution
  run: 'Run a terminal command. Use for builds, tests, installs, or any shell operation. Supports background mode for servers.',
  check_terminal: 'Check output of a background process by PID. Use to monitor long-running commands started with run_in_background.',
  kill_terminal: 'Kill a background process by PID. Use to stop servers, watchers, or hung processes.',
  
  // Task tools - Task management for complex workflows
  TodoWrite: 'Update task/todo progress. CRITICAL: Include ALL tasks every call as it replaces the entire list.',
  CreatePlan: 'Create a task plan from user request. Use at START of complex tasks (3+ steps). Parses requirements into tasks.',
  VerifyTasks: 'Verify task completion against original plan. Use BEFORE declaring work complete. Checks all requirements met.',
  GetActivePlan: 'Get the active plan for current session. Use FIRST to check for existing work before creating new plan.',
  ListPlans: 'List all existing plans in workspace. Use to see all tracked work.',
  DeletePlan: 'Delete a completed or abandoned plan. Use to clean up after work is done.',
  
  // Advanced tools
  create_tool: 'Create a new dynamic tool at runtime. Use for specialized operations not covered by existing tools.',
};

// Error recovery suggestions - maps error patterns to helpful tools
const ERROR_RECOVERY_SUGGESTIONS: Record<string, { tools: string[]; suggestion: string }> = {
  'file not found': {
    tools: ['ls', 'glob', 'grep'],
    suggestion: 'Use ls to list directory contents or glob to find files by pattern',
  },
  'no such file': {
    tools: ['ls', 'glob', 'grep'],
    suggestion: 'Use ls to verify the file path or glob to search for similar files',
  },
  'string not found': {
    tools: ['read', 'grep'],
    suggestion: 'Use read to view the file contents or grep to search for the string',
  },
  'old_string not found': {
    tools: ['read', 'grep'],
    suggestion: 'Read the file first to see its current contents, then use the exact string',
  },
  'syntax error': {
    tools: ['lsp_diagnostics', 'read_lints'],
    suggestion: 'Use lsp_diagnostics or read_lints to get detailed error information',
  },
  'type error': {
    tools: ['lsp_hover', 'lsp_diagnostics'],
    suggestion: 'Use lsp_hover to check types or lsp_diagnostics for detailed errors',
  },
  'cannot find module': {
    tools: ['ls', 'glob', 'run'],
    suggestion: 'Check if the module exists with ls/glob, or install it with run',
  },
  'permission denied': {
    tools: ['ls', 'run'],
    suggestion: 'Check file permissions with ls or use run to change them',
  },
  'element not found': {
    tools: ['browser_snapshot', 'browser_screenshot'],
    suggestion: 'Use browser_snapshot to see the DOM or browser_screenshot to visualize the page',
  },
  'timeout': {
    tools: ['browser_wait', 'browser_state'],
    suggestion: 'Use browser_wait with a longer timeout or browser_state to check page status',
  },
};

interface RequestToolsArgs extends Record<string, unknown> {
  /** Action to perform: 'request', 'search', 'list', 'status', 'recover', or 'reset_cache_stats' */
  action: 'request' | 'search' | 'list' | 'status' | 'recover' | 'reset_cache_stats';
  /** Tool names to request (for 'request' action) */
  tools?: string[];
  /** Search query (for 'search' action) */
  query?: string;
  /** Category to list (for 'list' action) */
  category?: 'browser' | 'lsp' | 'file' | 'search' | 'terminal' | 'task' | 'advanced' | 'all';
  /** Reason for requesting tools (helps with debugging) */
  reason?: string;
  /** Error message to get recovery suggestions for (for 'recover' action) */
  error?: string;
}

export const requestToolsTool: ToolDefinition<RequestToolsArgs> = {
  name: 'request_tools',
  description: `Request additional tools to be loaded into your context. Use this when you need specialized tools that aren't currently available.

## Autonomous Workflow Integration

This tool is essential for autonomous operation. Use it to:
- **Expand capabilities**: Load tools for new task types (browser, LSP, etc.)
- **Recover from errors**: Get suggestions when tools fail
- **Discover tools**: Search for tools by capability when unsure what's available

## Actions

### request - Load specific tools by name
Load tools you know you need. They become available immediately.
\`\`\`
action="request" tools=["browser_navigate", "browser_click"] reason="Need web automation"
\`\`\`

### search - Find tools by capability
Don't know the exact tool name? Search by what you need to do.
\`\`\`
action="search" query="find symbol definition"
action="search" query="screenshot"
\`\`\`

### list - See available tools in a category
Browse tools by category to understand what's available.
\`\`\`
action="list" category="browser"
action="list" category="lsp"
action="list" category="all"
\`\`\`

### status - Check your current tool state
See what tools are loaded, recent errors, and cache statistics.
\`\`\`
action="status"
\`\`\`

### recover - Get help recovering from errors
When a tool fails, get suggestions for alternative approaches.
\`\`\`
action="recover" error="file not found"
action="recover" error="old_string not found"
\`\`\`

### reset_cache_stats - Reset cache statistics
Clear hit/miss counters for fresh measurement.
\`\`\`
action="reset_cache_stats"
\`\`\`

## Categories
- **browser**: Web automation, scraping, form filling, screenshots
- **lsp**: Code intelligence, navigation, refactoring, diagnostics
- **file**: File operations, bulk rename/move/copy/delete, diagnostics
- **search**: Semantic vector search, BM25 keyword search, code queries, code similarity
- **terminal**: Command execution, process management
- **task**: Task tracking, planning, verification (always available)
- **advanced**: Dynamic tool creation

## Best Practices
- Request tools BEFORE you need them (proactive loading)
- Use "recover" when stuck on errors
- Check "status" to see what's already loaded
- Requested tools persist for the entire session`,
  requiresApproval: false,
  category: 'system',
  riskLevel: 'safe',
  allowedCallers: ['direct'],
  schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action: "request" to load tools, "search" to find tools, "list" to see available tools, "status" to see current state, "recover" to get error recovery suggestions, "reset_cache_stats" to reset cache statistics',
        enum: ['request', 'search', 'list', 'status', 'recover', 'reset_cache_stats'],
      },
      tools: {
        type: 'array',
        description: 'Tool names to request (for "request" action)',
        items: { type: 'string' },
      },
      query: {
        type: 'string',
        description: 'Search query (for "search" action)',
      },
      category: {
        type: 'string',
        description: 'Category to list (for "list" action)',
        enum: ['browser', 'lsp', 'file', 'search', 'terminal', 'task', 'advanced', 'all'],
      },
      reason: {
        type: 'string',
        description: 'Why you need these tools (optional, helps with debugging)',
      },
      error: {
        type: 'string',
        description: 'Error message to get recovery suggestions for (for "recover" action)',
      },
    },
    required: ['action'],
  },
  inputExamples: [
    { action: 'request', tools: ['browser_navigate', 'browser_click', 'browser_type'], reason: 'Need to automate web form' },
    { action: 'request', tools: ['lsp_definition', 'lsp_references'], reason: 'Need to trace code dependencies' },
    { action: 'search', query: 'screenshot' },
    { action: 'search', query: 'find symbol definition' },
    { action: 'list', category: 'browser' },
    { action: 'list', category: 'lsp' },
    { action: 'list', category: 'all' },
    { action: 'status' },
    { action: 'recover', error: 'file not found' },
    { action: 'reset_cache_stats' },
  ],
  ui: {
    icon: 'package-plus',
    label: 'Request Tools',
    color: 'blue',
    runningLabel: 'Loading tools...',
    completedLabel: 'Tools loaded',
  },

  async execute(args: RequestToolsArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const sessionId = (context as { sessionId?: string }).sessionId;
    
    switch (args.action) {
      case 'request':
        return handleRequest(args, sessionId);
      case 'search':
        return handleSearch(args, sessionId);
      case 'list':
        return handleList(args);
      case 'status':
        return handleStatus(sessionId);
      case 'recover':
        return handleRecover(args, sessionId);
      case 'reset_cache_stats':
        return handleResetCacheStats();
      default:
        return {
          toolName: 'request_tools',
          success: false,
          output: `Unknown action: ${args.action}. Use "request", "search", "list", "status", "recover", or "reset_cache_stats".`,
        };
    }
  },
};

function handleRequest(args: RequestToolsArgs, sessionId?: string): ToolExecutionResult {
  const { tools, reason } = args;
  
  if (!tools || tools.length === 0) {
    return {
      toolName: 'request_tools',
      success: false,
      output: 'No tools specified. Provide tool names in the "tools" array.',
    };
  }

  // Validate tool names
  const allKnownTools = Object.values(TOOL_CATEGORIES).flat();
  const validTools: string[] = [];
  const invalidTools: string[] = [];
  
  for (const tool of tools) {
    if (allKnownTools.includes(tool) || TOOL_DESCRIPTIONS[tool]) {
      validTools.push(tool);
    } else {
      invalidTools.push(tool);
    }
  }

  if (validTools.length === 0) {
    return {
      toolName: 'request_tools',
      success: false,
      output: `None of the requested tools are valid: ${invalidTools.join(', ')}\n\nUse action="list" category="all" to see available tools.`,
    };
  }

  // Add to session state
  if (sessionId) {
    addAgentRequestedTools(sessionId, validTools, reason || 'Agent request');
  }

  const lines = [
    `[OK] Loaded ${validTools.length} tool${validTools.length > 1 ? 's' : ''}:`,
    '',
    ...validTools.map(t => `  - ${t}${TOOL_DESCRIPTIONS[t] ? ` - ${TOOL_DESCRIPTIONS[t]}` : ''}`),
    '',
    'These tools are now available. You can use them in your next response.',
  ];

  if (invalidTools.length > 0) {
    lines.push('', `[!] Unknown tools (skipped): ${invalidTools.join(', ')}`);
  }

  return {
    toolName: 'request_tools',
    success: true,
    output: lines.join('\n'),
    metadata: {
      loadedTools: validTools,
      invalidTools,
      reason,
    },
  };
}

function handleSearch(args: RequestToolsArgs, sessionId?: string): ToolExecutionResult {
  const { query } = args;
  
  if (!query || query.trim().length === 0) {
    return {
      toolName: 'request_tools',
      success: false,
      output: 'No search query provided. Specify what kind of tool you need.',
    };
  }

  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/);
  const matches: Array<{ name: string; description: string; score: number }> = [];

  for (const [name, description] of Object.entries(TOOL_DESCRIPTIONS)) {
    let score = 0;
    const nameLower = name.toLowerCase();
    const descLower = description.toLowerCase();

    // Name match
    if (nameLower.includes(queryLower)) {
      score += 10;
    }
    for (const word of queryWords) {
      if (nameLower.includes(word)) score += 3;
      if (descLower.includes(word)) score += 2;
    }

    if (score > 0) {
      matches.push({ name, description, score });
    }
  }

  // Sort by score
  matches.sort((a, b) => b.score - a.score);
  const topMatches = matches.slice(0, 8);

  if (topMatches.length === 0) {
    return {
      toolName: 'request_tools',
      success: true,
      output: `No tools found matching "${query}".\n\nTry:\n- Different keywords\n- action="list" category="all" to see all tools`,
    };
  }

  // Auto-load discovered tools
  const discoveredNames = topMatches.map(m => m.name);
  if (sessionId) {
    addDiscoveredTools(sessionId, discoveredNames);
  }

  const lines = [
    `Found ${topMatches.length} tool${topMatches.length > 1 ? 's' : ''} matching "${query}":`,
    '',
    ...topMatches.map(m => `  • **${m.name}** - ${m.description}`),
    '',
    'These tools are now available. You can use them directly.',
  ];

  return {
    toolName: 'request_tools',
    success: true,
    output: lines.join('\n'),
    metadata: {
      query,
      matches: topMatches,
      loadedTools: discoveredNames,
    },
  };
}

function handleList(args: RequestToolsArgs): ToolExecutionResult {
  const { category = 'all' } = args;

  if (category === 'all') {
    const lines = ['Available tool categories:', ''];
    
    for (const [cat, tools] of Object.entries(TOOL_CATEGORIES)) {
      lines.push(`**${cat}** (${tools.length} tools):`);
      for (const tool of tools.slice(0, 5)) {
        lines.push(`  • ${tool}${TOOL_DESCRIPTIONS[tool] ? ` - ${TOOL_DESCRIPTIONS[tool]}` : ''}`);
      }
      if (tools.length > 5) {
        lines.push(`  ... and ${tools.length - 5} more`);
      }
      lines.push('');
    }

    lines.push('Use action="list" category="<name>" to see all tools in a category.');
    lines.push('Use action="request" tools=["tool1", "tool2"] to load specific tools.');

    return {
      toolName: 'request_tools',
      success: true,
      output: lines.join('\n'),
    };
  }

  const tools = TOOL_CATEGORIES[category as keyof typeof TOOL_CATEGORIES];
  if (!tools) {
    return {
      toolName: 'request_tools',
      success: false,
      output: `Unknown category: ${category}. Valid categories: ${Object.keys(TOOL_CATEGORIES).join(', ')}, all`,
    };
  }

  const lines = [
    `**${category}** tools (${tools.length}):`,
    '',
    ...tools.map(t => `  • ${t}${TOOL_DESCRIPTIONS[t] ? ` - ${TOOL_DESCRIPTIONS[t]}` : ''}`),
    '',
    `To load these tools: action="request" tools=[${tools.slice(0, 3).map(t => `"${t}"`).join(', ')}]`,
  ];

  return {
    toolName: 'request_tools',
    success: true,
    output: lines.join('\n'),
  };
}

function handleStatus(sessionId?: string): ToolExecutionResult {
  if (!sessionId) {
    return {
      toolName: 'request_tools',
      success: true,
      output: 'No session context available. Tool status tracking requires an active session.',
    };
  }

  const state = getSessionToolState(sessionId);
  const recentErrors = getRecentToolErrors(sessionId);
  const cacheStats = getToolResultCache().getStats();
  const errorRecoveryManager = getErrorRecoveryManager();
  const sessionErrorStats = errorRecoveryManager.getSessionStats(sessionId);
  const loadedToolsInfo = getLoadedToolsInfo(sessionId);
  
  const lines = ['**Tool Loading Status**', ''];
  
  // All loaded tools summary
  lines.push(`**All Loaded Tools (${loadedToolsInfo.totalCount} total)**`);
  lines.push('');
  
  // Core tools (always available)
  lines.push(`Core tools (${loadedToolsInfo.coreTools.length}):`);
  for (const tool of loadedToolsInfo.coreTools) {
    lines.push(`  • ${tool}${TOOL_DESCRIPTIONS[tool] ? ` - ${TOOL_DESCRIPTIONS[tool]}` : ''}`);
  }
  lines.push('');
  
  // Requested tools (agent-requested via request_tools)
  const requestedTools = Array.from(state.requestedTools);
  if (requestedTools.length > 0) {
    lines.push(`Requested tools (${requestedTools.length}):`);
    for (const tool of requestedTools) {
      lines.push(`  • ${tool}${TOOL_DESCRIPTIONS[tool] ? ` - ${TOOL_DESCRIPTIONS[tool]}` : ''}`);
    }
    lines.push('');
  }
  
  // Discovered tools (found via search)
  const discoveredTools = Array.from(state.discoveredTools);
  if (discoveredTools.length > 0) {
    lines.push(`Discovered tools (${discoveredTools.length}):`);
    for (const tool of discoveredTools) {
      lines.push(`  • ${tool}${TOOL_DESCRIPTIONS[tool] ? ` - ${TOOL_DESCRIPTIONS[tool]}` : ''}`);
    }
    lines.push('');
  }
  
  // Successful tools (recently used successfully)
  const successfulTools = Array.from(state.successfulTools);
  if (successfulTools.length > 0) {
    lines.push(`Recently successful tools (${successfulTools.length}):`);  
    for (const tool of successfulTools.slice(0, 10)) {
      lines.push(`  [x] ${tool}`);
    }
    if (successfulTools.length > 10) {
      lines.push(`  ... and ${successfulTools.length - 10} more`);
    }
    lines.push('');
  }
  
  // Cache statistics
  lines.push('**Cache Statistics**');
  lines.push(`  Entries: ${cacheStats.size}/${cacheStats.maxSize}`);
  lines.push(`  Hit rate: ${cacheStats.hitRate}% (${cacheStats.hits} hits, ${cacheStats.misses} misses)`);
  lines.push(`  Estimated tokens saved: ~${cacheStats.estimatedTokensSaved.toLocaleString()}`);
  if (Object.keys(cacheStats.byTool).length > 0) {
    lines.push(`  Cached by tool: ${Object.entries(cacheStats.byTool).map(([t, c]) => `${t}(${c})`).join(', ')}`);
  }
  lines.push(`  (Use action="reset_cache_stats" to reset statistics)`);
  lines.push('');
  
  // Session error history from ErrorRecoveryManager
  if (sessionErrorStats) {
    lines.push('**Session Error History**');
    lines.push(`  Total errors: ${sessionErrorStats.totalErrors}`);
    lines.push(`  Recent errors (last 5 min): ${sessionErrorStats.recentErrors}`);
    
    if (sessionErrorStats.topPatterns.length > 0) {
      lines.push('  Top error patterns:');
      for (const { pattern, count } of sessionErrorStats.topPatterns) {
        lines.push(`    • ${pattern}: ${count} occurrences`);
      }
    }
    
    if (sessionErrorStats.topTools.length > 0) {
      lines.push('  Tools with most errors:');
      for (const { tool, count } of sessionErrorStats.topTools) {
        lines.push(`    • ${tool}: ${count} errors`);
      }
    }
    lines.push('');
  }
  
  // Recent errors (quick view)
  if (recentErrors.length > 0) {
    lines.push(`Recent errors (${recentErrors.length}):`);
    for (const { toolName, error } of recentErrors.slice(0, 5)) {
      const shortError = error.length > 80 ? error.slice(0, 80) + '...' : error;
      lines.push(`  [!] ${toolName}: ${shortError}`);
    }
    lines.push('');
    lines.push('Use action="recover" error="<error message>" to get recovery suggestions.');
  }
  
  // Request history
  if (state.requestHistory.length > 0) {
    lines.push('');
    lines.push(`Request history (${state.requestHistory.length} requests):`);
    for (const req of state.requestHistory.slice(-3)) {
      const time = new Date(req.timestamp).toLocaleTimeString();
      lines.push(`  [${time}] ${req.tools.join(', ')} - ${req.reason}`);
    }
  }

  return {
    toolName: 'request_tools',
    success: true,
    output: lines.join('\n'),
    metadata: {
      loadedToolsInfo,
      requestedTools,
      discoveredTools,
      successfulTools,
      recentErrors,
      requestHistory: state.requestHistory,
      cacheStats,
      sessionErrorStats,
    },
  };
}

function handleRecover(args: RequestToolsArgs, sessionId?: string): ToolExecutionResult {
  const { error } = args;
  const errorRecoveryManager = getErrorRecoveryManager();
  
  // Get recent errors if no specific error provided
  let errorToAnalyze = error;
  let toolNameForError: string | undefined;
  
  if (!errorToAnalyze && sessionId) {
    const recentErrors = errorRecoveryManager.getRecentErrors(sessionId);
    if (recentErrors.length > 0) {
      const lastError = recentErrors[recentErrors.length - 1];
      errorToAnalyze = lastError.error;
      toolNameForError = lastError.toolName;
    }
  }
  
  if (!errorToAnalyze) {
    return {
      toolName: 'request_tools',
      success: true,
      output: 'No error to analyze. Provide an error message or wait for a tool error to occur.',
    };
  }
  
  // Use ErrorRecoveryManager for sophisticated error analysis
  const suggestion = errorRecoveryManager.analyzeError(
    errorToAnalyze,
    toolNameForError || 'unknown',
    sessionId
  );
  
  // Get session recovery suggestions for additional context
  const sessionSuggestions = sessionId 
    ? errorRecoveryManager.getSessionRecovery(sessionId)
    : [];
  
  // Get session stats for context
  const sessionStats = sessionId 
    ? errorRecoveryManager.getSessionStats(sessionId)
    : null;
  
  // Collect all suggested tools from ErrorRecoveryManager
  const allSuggestedTools = new Set<string>(suggestion.suggestedTools);
  for (const s of sessionSuggestions) {
    for (const tool of s.suggestedTools) {
      allSuggestedTools.add(tool);
    }
  }
  
  // Also check our local ERROR_RECOVERY_SUGGESTIONS for additional tool suggestions
  // This provides a fallback and additional context for common error patterns
  const errorLower = errorToAnalyze.toLowerCase();
  let localSuggestion: { tools: string[]; suggestion: string } | undefined;
  
  for (const [pattern, recovery] of Object.entries(ERROR_RECOVERY_SUGGESTIONS)) {
    if (errorLower.includes(pattern.toLowerCase())) {
      localSuggestion = recovery;
      // Add local suggestion tools to the set
      for (const tool of recovery.tools) {
        allSuggestedTools.add(tool);
      }
      break;
    }
  }
  
  // Auto-load suggested tools
  const toolsToLoad = Array.from(allSuggestedTools);
  if (sessionId && toolsToLoad.length > 0) {
    addAgentRequestedTools(sessionId, toolsToLoad, `Error recovery: ${errorToAnalyze.slice(0, 50)}`);
  }
  
  const lines = [
    `**Recovery suggestions for:** "${errorToAnalyze.slice(0, 100)}"`,
    '',
    `**Pattern matched:** ${suggestion.errorPattern}`,
    `**Category:** ${suggestion.category}`,
    `**Confidence:** ${Math.round(suggestion.confidence * 100)}%`,
    '',
    `**Suggested action:** ${suggestion.suggestedAction}`,
    '',
  ];
  
  // Add local suggestion if available and different from main suggestion
  if (localSuggestion && localSuggestion.suggestion !== suggestion.suggestedAction) {
    lines.push(`**Additional tip:** ${localSuggestion.suggestion}`);
    lines.push('');
  }
  
  if (suggestion.isAlternative) {
    lines.push('[!] This is an alternative approach since previous attempts failed repeatedly.');
    lines.push('');
  }
  
  // Show session error statistics if available
  if (sessionStats && sessionStats.totalErrors > 1) {
    lines.push('**Session Error History:**');
    lines.push(`  Total errors: ${sessionStats.totalErrors}`);
    lines.push(`  Recent errors (last 5 min): ${sessionStats.recentErrors}`);
    if (sessionStats.topPatterns.length > 0) {
      lines.push(`  Top error patterns:`);
      for (const { pattern, count } of sessionStats.topPatterns.slice(0, 3)) {
        lines.push(`    • ${pattern}: ${count} occurrences`);
      }
    }
    if (sessionStats.topTools.length > 0) {
      lines.push(`  Tools with most errors:`);
      for (const { tool, count } of sessionStats.topTools.slice(0, 3)) {
        lines.push(`    • ${tool}: ${count} errors`);
      }
    }
    lines.push('');
  }
  
  // Show additional session suggestions if different from main suggestion
  if (sessionSuggestions.length > 1) {
    lines.push('**Additional recovery suggestions from session history:**');
    for (const s of sessionSuggestions.slice(0, 3)) {
      if (s.errorPattern !== suggestion.errorPattern) {
        lines.push(`  • ${s.errorPattern}: ${s.suggestedAction}`);
      }
    }
    lines.push('');
  }
  
  if (toolsToLoad.length > 0) {
    lines.push(`[OK] Loaded ${toolsToLoad.length} recovery tools: ${toolsToLoad.join(', ')}`);
    lines.push('');
    lines.push('These tools are now available to help you recover from the error.');
  }

  return {
    toolName: 'request_tools',
    success: true,
    output: lines.join('\n'),
    metadata: {
      error: errorToAnalyze,
      suggestion,
      localSuggestion,
      sessionStats,
      loadedTools: toolsToLoad,
    },
  };
}

function handleResetCacheStats(): ToolExecutionResult {
  const cache = getToolResultCache();
  
  // Get stats before reset for reporting
  const statsBefore = cache.getStats();
  
  // Reset the statistics
  cache.resetStats();
  
  // Get stats after reset to confirm
  const statsAfter = cache.getStats();
  
  const lines = [
    '**Cache Statistics Reset**',
    '',
    'Previous statistics:',
    `  Hits: ${statsBefore.hits}`,
    `  Misses: ${statsBefore.misses}`,
    `  Hit rate: ${statsBefore.hitRate}%`,
    `  Estimated tokens saved: ~${statsBefore.estimatedTokensSaved.toLocaleString()}`,
    '',
    '[OK] Statistics have been reset to zero.',
    '',
    'Current statistics:',
    `  Hits: ${statsAfter.hits}`,
    `  Misses: ${statsAfter.misses}`,
    `  Hit rate: ${statsAfter.hitRate}%`,
    `  Estimated tokens saved: ~${statsAfter.estimatedTokensSaved.toLocaleString()}`,
    '',
    `Note: Cache entries (${statsBefore.size}) are preserved. Only statistics counters were reset.`,
    'Use action="status" to see full cache details.',
  ];

  return {
    toolName: 'request_tools',
    success: true,
    output: lines.join('\n'),
    metadata: {
      statsBefore: {
        hits: statsBefore.hits,
        misses: statsBefore.misses,
        hitRate: statsBefore.hitRate,
        estimatedTokensSaved: statsBefore.estimatedTokensSaved,
      },
      statsAfter: {
        hits: statsAfter.hits,
        misses: statsAfter.misses,
        hitRate: statsAfter.hitRate,
        estimatedTokensSaved: statsAfter.estimatedTokensSaved,
      },
      cacheEntriesPreserved: statsBefore.size,
    },
  };
}
