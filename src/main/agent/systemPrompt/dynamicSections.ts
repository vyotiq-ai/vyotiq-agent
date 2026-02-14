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
// ADDITIONAL INSTRUCTIONS - DEPRECATED (use AGENTS.md instead)
// =============================================================================

/**
 * Build additional instructions section
 * @deprecated Use AGENTS.md, CLAUDE.md, or copilot-instructions.md instead.
 * This function is kept for backward compatibility only.
 */
export function buildAdditionalInstructions(_instructions?: string): string {
  // Deprecated - always returns empty string
  // Users should use AGENTS.md files for project-specific instructions
  return '';
}

// =============================================================================
// AGENT INSTRUCTIONS - Dynamic agent behavior instructions
// =============================================================================

import type { AgentInstruction, AgentInstructionTrigger } from '../../../shared/types';

/**
 * Evaluate if an agent instruction trigger condition is met
 */
function evaluateAgentInstructionTrigger(
  trigger: AgentInstructionTrigger,
  lastUserMessage?: string
): boolean {
  switch (trigger.type) {
    case 'always':
      return true;

    case 'manual':
      // Manual triggers are only activated explicitly - not included by default
      return false;

    case 'keyword': {
      if (!trigger.value || !lastUserMessage) return false;
      const keywords = trigger.value.toLowerCase().split(',').map(k => k.trim());
      const messageLower = lastUserMessage.toLowerCase();
      return keywords.some(kw => messageLower.includes(kw));
    }

    case 'file-type': {
      if (!trigger.value || !lastUserMessage) return false;
      const patterns = trigger.value.split(',').map(p => p.trim());
      return patterns.some(pattern => {
        try {
          const regex = new RegExp(pattern.replace(/\./g, '\\.').replace(/\*/g, '.*'), 'i');
          return regex.test(lastUserMessage);
        } catch {
          return lastUserMessage.includes(pattern);
        }
      });
    }

    case 'task-type': {
      // Task type matching - check if keywords match the task context
      if (!trigger.value || !lastUserMessage) return false;
      const taskTypes = trigger.value.toLowerCase().split(',').map(t => t.trim());
      const messageLower = lastUserMessage.toLowerCase();
      return taskTypes.some(taskType => messageLower.includes(taskType));
    }

    default:
      return false;
  }
}

/**
 * Build agent instructions section for the system prompt
 * 
 * Processes enabled agent instructions based on their triggers and priority.
 * Instructions are sorted by priority (lower = higher priority) and
 * only included if their trigger conditions are met.
 */
export function buildAgentInstructions(
  agentInstructions?: AgentInstruction[],
  lastUserMessage?: string
): string {
  if (!agentInstructions || agentInstructions.length === 0) return '';

  // Filter enabled instructions and sort by priority
  const activeInstructions = agentInstructions
    .filter(instruction => {
      if (!instruction.enabled) return false;
      // Evaluate trigger condition
      return evaluateAgentInstructionTrigger(instruction.trigger, lastUserMessage);
    })
    .sort((a, b) => a.priority - b.priority);

  if (activeInstructions.length === 0) return '';

  // Build the agent instructions section
  const parts: string[] = ['<agent_instructions hint="Specialized behavior instructions for this context">'];
  
  for (const instruction of activeInstructions) {
    const attrs: string[] = [
      `id="${escapeXml(instruction.id)}"`,
      `name="${escapeXml(instruction.name)}"`,
    ];
    
    if (instruction.scope !== 'global') {
      attrs.push(`scope="${instruction.scope}"`);
    }
    
    parts.push(`  <instruction ${attrs.join(' ')}>`);
    // Include the full instruction content
    parts.push(`    ${escapeXml(instruction.instructions)}`);
    parts.push('  </instruction>');
  }
  
  parts.push('</agent_instructions>');
  return parts.join('\n');
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
    tools: ['read', 'write', 'edit', 'ls', 'grep', 'glob', 'bulk', 'read_lints'],
    description: 'File operations, bulk rename/move/copy/delete, diagnostics',
  },
  search: {
    tools: ['semantic_search', 'full_text_search', 'code_query', 'code_similarity'],
    description: 'Semantic vector search, BM25 keyword search, natural language code queries, code similarity detection',
  },
  terminal: {
    tools: ['run', 'check_terminal', 'kill_terminal'],
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
// =============================================================================
// AGENTS.md CONTEXT - Project-specific agent instructions
// =============================================================================

import type { AgentsMdContext, InstructionFilesContext, InstructionFile } from '../../../shared/types';

/**
 * Get instruction file type label for display
 */
function getInstructionFileTypeLabel(type: string): string {
  switch (type) {
    case 'agents-md': return 'AGENTS.md';
    case 'claude-md': return 'CLAUDE.md';
    case 'copilot-instructions': return 'Copilot Instructions';
    case 'github-instructions': return 'GitHub Instructions';
    case 'gemini-md': return 'GEMINI.md';
    case 'cursor-rules': return 'Cursor Rules';
    default: return type;
  }
}

/**
 * Build AGENTS.md context section
 * Injects project-specific instructions from AGENTS.md files
 * Following the AGENTS.md specification (https://agents.md/)
 */
export function buildAgentsMdContext(agentsMdContext?: AgentsMdContext): string {
  if (!agentsMdContext || !agentsMdContext.found) return '';
  if (!agentsMdContext.combinedContent) return '';

  const parts: string[] = [];
  
  // Header with metadata
  const fileCount = agentsMdContext.allFiles.length;
  const primaryFile = agentsMdContext.primary?.relativePath ?? 'AGENTS.md';
  
  parts.push(`<agents_md hint="Project-specific instructions from AGENTS.md" files="${fileCount}" primary="${escapeXml(primaryFile)}">`);
  
  // Add the combined content
  // We include the raw markdown as agents can parse it well
  const content = agentsMdContext.combinedContent.trim();
  
  // Limit content length to avoid token bloat (max 8KB)
  const maxContentLength = 8000;
  if (content.length > maxContentLength) {
    parts.push(content.substring(0, maxContentLength));
    parts.push('\n... (truncated, see full AGENTS.md file)');
  } else {
    parts.push(content);
  }
  
  parts.push('</agents_md>');
  return parts.join('\n');
}

/**
 * Build extended instruction files context section
 * Injects project-specific instructions from all instruction file types:
 * - AGENTS.md (Linux Foundation standard)
 * - CLAUDE.md (Anthropic Claude Code)
 * - .github/copilot-instructions.md (GitHub Copilot)
 * - .github/instructions/*.md (Path-specific Copilot)
 * - GEMINI.md (Google Gemini CLI)
 * - .cursor/rules (Cursor editor)
 */
export function buildInstructionFilesContext(context?: InstructionFilesContext): string {
  if (!context || !context.found) return '';
  if (!context.combinedContent) return '';

  const parts: string[] = [];
  
  // Build file types summary
  const enabledFiles = context.enabledFiles || [];
  const fileTypes = [...new Set(enabledFiles.map((f: InstructionFile) => f.type))];
  const fileTypesStr = fileTypes.map(t => getInstructionFileTypeLabel(t)).join(', ');
  
  // Header with metadata
  parts.push(`<project_instructions hint="Project-specific instructions" files="${enabledFiles.length}" types="${escapeXml(fileTypesStr)}">`);
  
  // Add file sources if configured to show them
  if (context.config?.showSourcesInPrompt && enabledFiles.length > 1) {
    parts.push('  <sources>');
    for (const file of enabledFiles) {
      parts.push(`    <file path="${escapeXml(file.relativePath)}" type="${file.type}" priority="${file.priorityOverride ?? file.frontmatter?.priority ?? 0}" />`);
    }
    parts.push('  </sources>');
  }
  
  // Add the combined content
  const content = context.combinedContent.trim();
  
  // Use configured max length or default to 32KB
  const maxContentLength = context.config?.maxCombinedContentLength ?? 32000;
  if (content.length > maxContentLength) {
    parts.push(content.substring(0, maxContentLength));
    parts.push('\n... (truncated due to length limit)');
  } else {
    parts.push(content);
  }
  
  parts.push('</project_instructions>');
  return parts.join('\n');
}