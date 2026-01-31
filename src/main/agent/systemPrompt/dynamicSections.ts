/**
 * Dynamic Sections Builder
 *
 * Builds context-aware sections that change per-request:
 * - Workspace context
 * - Terminal context
 * - Editor context
 * - Access level
 * - Persona/custom instructions
 *
 * Tools are loaded dynamically with their own descriptions.
 */

import type {
  SystemPromptContext,
  TerminalContextInfo,
  EditorContextInfo,
  WorkspaceDiagnosticsInfo,
  TaskAnalysisContext,
  WorkspaceStructureContext,
  ToolDefForPrompt,
  MCPContextInfo,
  GitContextInfo,
} from './types';
import type { PromptSettings, AccessLevelSettings, ResponseFormatPreferences } from '../../../shared/types';

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

// =============================================================================
// TOOLS REFERENCE - Compact format
// =============================================================================

export function buildToolsReference(tools?: ToolDefForPrompt[]): string {
  if (!tools || tools.length === 0) return '';

  // Compact single-line format per tool
  const toolLines = tools.map(t => `  <t n="${t.name}">${escapeXml(truncate(t.description, 80))}</t>`);
  return `<tools>\n${toolLines.join('\n')}\n</tools>`;
}

// =============================================================================
// CORE CONTEXT - Compact format
// =============================================================================

export function buildCoreContext(context: SystemPromptContext): string {
  if (!context.promptSettings.includeWorkspaceContext) return '';

  const ws = context.workspace?.path || 'none';
  const os = process.platform === 'win32' ? 'win' : (process.platform === 'darwin' ? 'mac' : 'linux');

  return `<ctx ws="${ws}" os="${os}" model="${context.modelId}" provider="${context.providerName}" />`
}

// =============================================================================
// TERMINAL CONTEXT - Compact format
// =============================================================================

export function buildTerminalContext(terminalContext?: TerminalContextInfo): string {
  if (!terminalContext || terminalContext.processes.length === 0) return '';

  const { processes } = terminalContext;
  const running = processes.filter(p => p.isRunning);
  if (running.length === 0) return '';

  const procs = running.slice(0, 3).map(p => 
    `<p pid="${p.pid}">${escapeXml(truncate(p.command, 50))}</p>`
  ).join('');
  
  return `<terminal running="${running.length}">${procs}</terminal>`;
}

// =============================================================================
// EDITOR CONTEXT - Compact format
// =============================================================================

export function buildEditorContext(editorContext?: EditorContextInfo): string {
  if (!editorContext) return '';
  
  const { activeFile, diagnostics } = editorContext;
  if (!activeFile && (!diagnostics || diagnostics.length === 0)) return '';

  const parts: string[] = [];
  if (activeFile) parts.push(`active="${escapeXml(activeFile)}"`);
  
  if (diagnostics && diagnostics.length > 0) {
    const errors = diagnostics.filter(d => d.severity === 'error').length;
    const warnings = diagnostics.filter(d => d.severity === 'warning').length;
    if (errors > 0 || warnings > 0) {
      parts.push(`errors="${errors}" warnings="${warnings}"`);
    }
  }

  return parts.length > 0 ? `<editor ${parts.join(' ')} />` : '';
}

// =============================================================================
// WORKSPACE DIAGNOSTICS - Compact format (only show if errors exist)
// =============================================================================

export function buildWorkspaceDiagnostics(diagnostics?: WorkspaceDiagnosticsInfo): string {
  if (!diagnostics || diagnostics.errorCount === 0) return '';

  const issues = diagnostics.diagnostics.slice(0, 5).map(d => 
    `<i f="${escapeXml(d.filePath)}" l="${d.line}">${escapeXml(truncate(d.message, 60))}</i>`
  ).join('');

  return `<diag errors="${diagnostics.errorCount}" warnings="${diagnostics.warningCount}">${issues}</diag>`;
}

// =============================================================================
// GIT CONTEXT - Repository state awareness
// =============================================================================

export function buildGitContext(gitContext?: GitContextInfo): string {
  if (!gitContext || !gitContext.isRepo) return '';

  const attrs: string[] = [];
  
  if (gitContext.branch) {
    attrs.push(`branch="${escapeXml(gitContext.branch)}"`);
  }
  
  if (gitContext.uncommittedCount !== undefined && gitContext.uncommittedCount > 0) {
    attrs.push(`uncommitted="${gitContext.uncommittedCount}"`);
  }
  
  if (gitContext.stagedCount !== undefined && gitContext.stagedCount > 0) {
    attrs.push(`staged="${gitContext.stagedCount}"`);
  }
  
  if (gitContext.hasUnpushed) {
    attrs.push(`unpushed="true"`);
  }

  if (attrs.length === 0) return '';

  const content = gitContext.lastCommit 
    ? `>${escapeXml(truncate(gitContext.lastCommit, 60))}</git>`
    : ' />';
  
  return `<git ${attrs.join(' ')}${content}`;
}

// =============================================================================
// TASK ANALYSIS - Compact (only if present)
// =============================================================================

export function buildTaskAnalysis(taskAnalysis?: TaskAnalysisContext): string {
  if (!taskAnalysis) return '';
  return `<task intent="${escapeXml(taskAnalysis.intent)}" complexity="${taskAnalysis.complexity || 'medium'}" />`;
}

// =============================================================================
// WORKSPACE STRUCTURE - Compact but informative
// =============================================================================

export function buildWorkspaceStructure(structure?: WorkspaceStructureContext): string {
  if (!structure) return '';

  const attrs: string[] = [];
  
  // Core project info
  if (structure.projectType) attrs.push(`type="${structure.projectType}"`);
  if (structure.languages?.length) attrs.push(`lang="${structure.languages.slice(0, 3).join(',')}"`);
  if (structure.framework) attrs.push(`fw="${structure.framework}"`);
  if (structure.frameworks?.length && !structure.framework) {
    attrs.push(`fw="${structure.frameworks.slice(0, 2).join(',')}"`);
  }
  
  // Build info
  if (structure.packageManager) attrs.push(`pm="${structure.packageManager}"`);
  if (structure.buildTool) attrs.push(`build="${structure.buildTool}"`);
  if (structure.testFramework) attrs.push(`test="${structure.testFramework}"`);

  // Include key directories for context (truncated for token efficiency)
  const additionalInfo: string[] = [];
  if (structure.sourceDirectories?.length) {
    additionalInfo.push(`src="${structure.sourceDirectories.slice(0, 3).join(',')}"`);
  }
  if (structure.configFiles?.length && structure.configFiles.length > 0) {
    // Include important config files
    const keyConfigs = structure.configFiles.filter(f => 
      f.includes('config') || f.includes('.json') || f === 'Cargo.toml' || f === 'go.mod'
    ).slice(0, 3);
    if (keyConfigs.length > 0) {
      additionalInfo.push(`configs="${keyConfigs.join(',')}"`);
    }
  }

  if (attrs.length === 0) return '';
  
  // Combine all info
  const allAttrs = [...attrs, ...additionalInfo].join(' ');
  return `<ws ${allAttrs} />`;
}

// =============================================================================
// ACCESS LEVEL - Compact
// =============================================================================

export function buildAccessLevel(accessLevel?: AccessLevelSettings): string {
  if (!accessLevel) return '';
  const level = accessLevel.level || 'standard';
  return `<access level="${level}" />`;
}

// =============================================================================
// PERSONA - Only if non-default
// =============================================================================

export function buildPersona(settings?: PromptSettings): string {
  if (!settings?.activePersonaId || settings.activePersonaId === 'default') return '';

  const persona = settings.personas?.find(p => p.id === settings.activePersonaId);
  if (!persona?.systemPrompt) return '';

  return `<persona>${escapeXml(truncate(persona.systemPrompt, 200))}</persona>`;
}

// =============================================================================
// CUSTOM PROMPT - Only if enabled
// =============================================================================

export function buildCustomPrompt(settings?: PromptSettings): string {
  if (!settings?.useCustomSystemPrompt || !settings.customSystemPrompt) return '';
  return `<custom>${escapeXml(settings.customSystemPrompt)}</custom>`;
}

// =============================================================================
// ADDITIONAL INSTRUCTIONS - Only if present
// =============================================================================

export function buildAdditionalInstructions(instructions?: string): string {
  if (!instructions) return '';
  return `<extra>${escapeXml(instructions)}</extra>`;
}

// =============================================================================
// COMMUNICATION STYLE - Only if non-default
// =============================================================================

export function buildCommunicationStyle(responseFormat?: ResponseFormatPreferences): string {
  if (!responseFormat) return '';
  
  const isDefault = responseFormat.explanationDetail === 'moderate' && responseFormat.tone === 'professional';
  if (isDefault) return '';

  return `<style detail="${responseFormat.explanationDetail}" tone="${responseFormat.tone}" />`;
}

// =============================================================================
// CORE TOOLS (Alias for buildToolsReference)
// =============================================================================

/**
 * Alias for buildToolsReference for backward compatibility
 */
export function buildCoreTools(tools?: ToolDefForPrompt[]): string {
  return buildToolsReference(tools);
}

// =============================================================================
// DYNAMIC TOOL CATEGORIES
// =============================================================================

/**
 * Tool categories - compact format for token efficiency
 * Must match actual tool names from implementations
 */
export const DYNAMIC_TOOL_CATEGORIES: Record<string, { tools: string[]; description: string }> = {
  file: {
    tools: ['read', 'write', 'edit', 'ls', 'grep', 'glob', 'codebase_search', 'bulk', 'read_lints', 'rename', 'delete'],
    description: 'File operations, search, semantic search, diagnostics',
  },
  terminal: {
    tools: ['run', 'check_terminal', 'kill_terminal', 'list_terminals'],
    description: 'Command execution, process management',
  },
  browser: {
    tools: [
      // Primary (always loaded)
      'browser_fetch', 'browser_navigate', 'browser_extract', 'browser_snapshot', 'browser_screenshot',
      'browser_click', 'browser_type', 'browser_scroll', 'browser_wait', 'browser_console', 'browser_check_url',
      // Secondary (deferred, use request_tools to load)
      'browser_fill_form', 'browser_hover', 'browser_evaluate', 'browser_state',
      'browser_back', 'browser_forward', 'browser_reload', 'browser_network', 'browser_tabs', 'browser_security_status',
    ],
    description: 'Web automation, scraping, form filling, debugging',
  },
  lsp: {
    tools: ['lsp_hover', 'lsp_definition', 'lsp_references', 'lsp_symbols', 'lsp_diagnostics', 'lsp_completions', 'lsp_code_actions', 'lsp_rename'],
    description: 'Code intelligence, navigation, refactoring',
  },
  task: {
    tools: ['TodoWrite', 'CreatePlan', 'VerifyTasks', 'GetActivePlan', 'ListPlans', 'DeletePlan'],
    description: 'Task tracking, planning, verification',
  },
  mcp: {
    tools: ['mcp_*'],
    description: 'External MCP server tools (dynamically loaded from connected servers)',
  },
  advanced: {
    tools: ['create_tool', 'request_tools'],
    description: 'Dynamic tool creation, tool discovery',
  },
};

/**
 * Build compact tool categories section
 * 
 * NOTE: This is the single source of truth for tool categories.
 * The static system prompt references this via "see <tool_categories>" 
 * to avoid duplication.
 */
export function buildToolCategories(): string {
  const categories = Object.entries(DYNAMIC_TOOL_CATEGORIES);
  if (categories.length === 0) return '';

  const parts: string[] = ['<tool_categories>'];
  parts.push('  <hint>Use request_tools to list/search tools by category</hint>');
  
  for (const [name, info] of categories) {
    const samples = info.tools.slice(0, 3).join(', ');
    parts.push(`  <cat name="${name}" desc="${info.description}" samples="${samples}" />`);
  }
  
  parts.push('</tool_categories>');
  return parts.join('\n');
}

// =============================================================================
// SEMANTIC CONTEXT - Relevant code snippets
// =============================================================================

import type { SemanticContextInfo } from './types';

/**
 * Build semantic context section with relevant code snippets
 * This provides the agent with relevant code from the codebase
 * based on the user's query for improved contextual understanding.
 */
export function buildSemanticContext(semanticContext?: SemanticContextInfo): string {
  if (!semanticContext || semanticContext.snippets.length === 0) return '';
  
  const parts: string[] = ['<relevant_code hint="Semantically retrieved code relevant to the current query">'];
  
  for (const snippet of semanticContext.snippets) {
    const attrs: string[] = [
      `file="${escapeXml(snippet.filePath)}"`,
      `score="${snippet.score.toFixed(2)}"`,
    ];
    
    if (snippet.language) {
      attrs.push(`lang="${snippet.language}"`);
    }
    if (snippet.symbolType && snippet.symbolName) {
      attrs.push(`symbol="${snippet.symbolType}:${escapeXml(snippet.symbolName)}"`);
    }
    if (snippet.startLine !== undefined) {
      const lineRange = snippet.endLine 
        ? `${snippet.startLine}-${snippet.endLine}`
        : `${snippet.startLine}`;
      attrs.push(`lines="${lineRange}"`);
    }
    
    parts.push(`<snippet ${attrs.join(' ')}>`);
    // Trim and limit content length for token efficiency
    const content = snippet.content.trim();
    const maxContentLength = 1500;
    if (content.length > maxContentLength) {
      parts.push(content.substring(0, maxContentLength) + '\n... (truncated)');
    } else {
      parts.push(content);
    }
    parts.push('</snippet>');
  }
  
  parts.push('</relevant_code>');
  return parts.join('\n');
}

// =============================================================================
// MCP CONTEXT - External tool servers
// =============================================================================

/**
 * Build MCP context section with connected servers and available tools
 * This informs the agent about external MCP servers and their capabilities
 */
export function buildMCPContext(mcpContext?: MCPContextInfo): string {
  if (!mcpContext || !mcpContext.enabled) return '';
  if (mcpContext.connectedServers === 0) return '';
  
  const parts: string[] = [];
  
  // Header with summary
  parts.push(`<mcp_servers count="${mcpContext.connectedServers}" tools="${mcpContext.totalTools}">`);
  parts.push('  <hint>MCP tools are prefixed with mcp_[server]_[tool]. Call like regular tools.</hint>');
  
  // List connected servers
  for (const server of mcpContext.servers) {
    if (server.status === 'connected') {
      parts.push(`  <server id="${escapeXml(server.id)}" name="${escapeXml(server.name)}" tools="${server.toolCount}" />`);
    }
  }
  
  // Show sample tools (limited to avoid token bloat)
  if (mcpContext.sampleTools.length > 0) {
    parts.push('  <sample_tools>');
    for (const tool of mcpContext.sampleTools.slice(0, 10)) {
      parts.push(`    <tool server="${escapeXml(tool.serverName)}" name="${escapeXml(tool.toolName)}">${escapeXml(truncate(tool.description, 80))}</tool>`);
    }
    if (mcpContext.sampleTools.length > 10) {
      parts.push(`    <more count="${mcpContext.sampleTools.length - 10}" />`);
    }
    parts.push('  </sample_tools>');
  }
  
  parts.push('</mcp_servers>');
  return parts.join('\n');
}
