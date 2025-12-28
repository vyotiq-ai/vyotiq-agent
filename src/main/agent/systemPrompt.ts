/**
 * Concise System Prompt Builder
 * 
 * Builds a focused, efficient system prompt containing:
 * - Identity and role
 * - Core workspace context
 * - Tool workflows and best practices
 * - Tool-specific hints for common errors
 * - Available tools list
 * - Execution and validation rules
 * - Error handling
 * - System information and access level
 * - Communication guidelines
 * - Output formatting rules
 * - Persona/custom instructions
 * - Response format
 */

import type { InternalSession } from './types';
import type { PromptSettings, ContextInjectionCondition, AccessLevelSettings, TerminalSettings } from '../../shared/types';
import { ACCESS_LEVEL_DEFAULTS, ACCESS_LEVEL_DESCRIPTIONS, DEFAULT_PROMPT_SETTINGS } from '../../shared/types';
import type { Logger } from '../logger';
import { 
  CORE_IDENTITY, 
  CRITICAL_RULES, 
  TOOL_WORKFLOWS, 
  TOOL_HINTS, 
  OUTPUT_FORMATTING 
} from './prompts';
import type { MemoryEntry } from './memory/types';

/**
 * Tool definition for system prompt (minimal interface)
 */
export interface ToolDefForPrompt {
  name: string;
  description: string;
}

/**
 * Terminal process information for context
 */
export interface TerminalProcessInfo {
  /** Process ID */
  pid: number;
  /** Command that was executed */
  command: string;
  /** Whether the process is still running */
  isRunning: boolean;
  /** Description of what the command does */
  description?: string;
  /** Recent output (truncated) */
  recentOutput?: string;
  /** Exit code if completed */
  exitCode?: number | null;
  /** Duration in ms if completed */
  durationMs?: number;
}

/**
 * Terminal context for the system prompt
 */
export interface TerminalContextInfo {
  /** List of active/recent terminal processes */
  processes: TerminalProcessInfo[];
  /** Terminal settings */
  settings: TerminalSettings;
  /** Default shell being used */
  defaultShell: string;
  /** Current working directory (if known) */
  cwd?: string;
}

/**
 * Task analysis context for system prompt
 */
export interface TaskAnalysisContext {
  /** Intent detected from user message */
  intent: string;
  /** Secondary intents if applicable */
  secondaryIntents?: string[];
  /** Task complexity level */
  complexity: string;
  /** Task scope level */
  scope: string;
  /** Whether task should be decomposed into sub-tasks */
  shouldDecompose: boolean;
  /** Recommended agent specialization */
  recommendedSpecialization?: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Estimated tokens needed */
  estimatedTokens?: number;
}


/**
 * Workspace structure context for better file navigation
 */
export interface WorkspaceStructureContext {
  /** Project type detected (e.g., 'typescript', 'python', 'react') */
  projectType?: string;
  /** Key configuration files present */
  configFiles?: string[];
  /** Main source directories */
  sourceDirectories?: string[];
  /** Test directories */
  testDirectories?: string[];
  /** Package manager detected */
  packageManager?: string;
  /** Framework detected */
  framework?: string;
}

/**
 * Context for building the system prompt
 */
export interface SystemPromptContext {
  /** Session information */
  session: InternalSession;
  /** Provider name */
  providerName: string;
  /** Model ID being used */
  modelId: string;
  /** Workspace information */
  workspace?: { id: string; path: string; name?: string };
  /** List of available tool names */
  toolsList: string;
  /** Tool definitions with descriptions from implementations */
  toolDefinitions?: ToolDefForPrompt[];
  /** Prompt settings from user preferences */
  promptSettings: PromptSettings;
  /** Access level settings */
  accessLevelSettings?: AccessLevelSettings;
  /** Terminal context with active processes and settings */
  terminalContext?: TerminalContextInfo;
  /** Editor context with open files and cursor position */
  editorContext?: {
    openFiles: string[];
    activeFile: string | null;
    cursorPosition: { lineNumber: number; column: number } | null;
    diagnostics?: Array<{
      filePath: string;
      message: string;
      severity: 'error' | 'warning' | 'info' | 'hint';
      line: number;
      column: number;
      endLine?: number;
      endColumn?: number;
      source?: string;
      code?: string | number;
    }>;
  };
  /** Workspace-wide diagnostics (all errors/warnings from entire codebase) */
  workspaceDiagnostics?: {
    diagnostics: Array<{
      filePath: string;
      line: number;
      column: number;
      message: string;
      severity: 'error' | 'warning' | 'info' | 'hint';
      source: 'typescript' | 'eslint';
      code?: string | number;
    }>;
    errorCount: number;
    warningCount: number;
    filesWithErrors: string[];
    collectedAt: number;
  };
  /** Task analysis results from TaskAnalyzer */
  taskAnalysis?: TaskAnalysisContext;
  /** Workspace structure for better navigation */
  workspaceStructure?: WorkspaceStructureContext;
  /** Agent memories for context */
  memories?: MemoryEntry[];
  /** Logger instance */
  logger?: Logger;
}

// DEFAULT_PROMPT_SETTINGS is imported from shared/types.ts to avoid duplication
// Re-export for backwards compatibility
export { DEFAULT_PROMPT_SETTINGS };

// =============================================================================
// IDENTITY AND ROLE
// =============================================================================

export { CORE_IDENTITY };

// =============================================================================
// CRITICAL RULES AND EXECUTION GUIDELINES
// =============================================================================

export { CRITICAL_RULES };

// =============================================================================
// TOOL WORKFLOWS AND BEST PRACTICES
// =============================================================================

export { TOOL_WORKFLOWS };

// =============================================================================
// CORE CONTEXT BUILDER
// =============================================================================

/**
 * Build terminal context section with active processes and environment info
 */
export function buildTerminalContext(terminalContext?: TerminalContextInfo): string {
  if (!terminalContext) {
    return '';
  }

  const { processes, settings, defaultShell, cwd } = terminalContext;

  const parts: string[] = [];
  parts.push('<terminal_context>');

  // Terminal environment info
  parts.push('  <environment>');
  parts.push(`    <shell>${defaultShell}</shell>`);
  parts.push(`    <timeout_default>${Math.round(settings.defaultTimeout / 1000)}s</timeout_default>`);
  parts.push(`    <max_concurrent>${settings.maxConcurrentProcesses}</max_concurrent>`);
  if (cwd) {
    parts.push(`    <cwd>${cwd}</cwd>`);
  }
  parts.push('  </environment>');

  // Active/recent processes
  if (processes.length > 0) {
    const runningCount = processes.filter(p => p.isRunning).length;
    const completedCount = processes.length - runningCount;

    parts.push(`  <processes running="${runningCount}" completed="${completedCount}">`);

    for (const proc of processes) {
      const status = proc.isRunning ? 'running' : `exited:${proc.exitCode}`;

      parts.push(`    <process pid="${proc.pid}" status="${status}">`);
      parts.push(`      <command>${escapeXml(truncateCommand(proc.command, 100))}</command>`);
      if (proc.description) {
        parts.push(`      <description>${escapeXml(proc.description)}</description>`);
      }
      if (proc.isRunning && proc.recentOutput) {
        parts.push(`      <recent_output>${escapeXml(truncateOutput(proc.recentOutput, 300))}</recent_output>`);
      }
      if (!proc.isRunning && proc.durationMs !== undefined) {
        parts.push(`      <duration_ms>${proc.durationMs}</duration_ms>`);
      }
      parts.push('    </process>');
    }

    parts.push('  </processes>');

    // Helpful hints for agent
    if (runningCount > 0) {
      parts.push('  <hint>Use check_terminal({ pid: N }) to get full output from running processes</hint>');
      parts.push('  <hint>Use kill_terminal({ pid: N }) to stop a running process</hint>');
    }
  } else {
    parts.push('  <processes>No active terminal processes</processes>');
  }

  parts.push('</terminal_context>');

  return '\n' + parts.join('\n');
}

/**
 * Build editor context section with open files and active editor info
 */
export function buildEditorContext(editorContext?: SystemPromptContext['editorContext']): string {
  if (!editorContext || (editorContext.openFiles.length === 0 && !editorContext.activeFile && (!editorContext.diagnostics || editorContext.diagnostics.length === 0))) {
    return '';
  }

  const { openFiles, activeFile, cursorPosition, diagnostics } = editorContext;

  const parts: string[] = [];
  parts.push('<editor_context>');

  if (openFiles.length > 0) {
    parts.push('  <open_files>');
    for (const file of openFiles) {
      const isActive = file === activeFile ? ' active="true"' : '';
      parts.push(`    <file${isActive}>${escapeXml(file)}</file>`);
    }
    parts.push('  </open_files>');
  }

  if (activeFile) {
    parts.push('  <active_editor>');
    parts.push(`    <file>${escapeXml(activeFile)}</file>`);
    if (cursorPosition) {
      parts.push(`    <cursor_position>`);
      parts.push(`      <line>${cursorPosition.lineNumber}</line>`);
      parts.push(`      <column>${cursorPosition.column}</column>`);
      parts.push(`    </cursor_position>`);
    }
    // Include diagnostics for the active file if available
    if (diagnostics && diagnostics.length > 0) {
      const activeFileDiagnostics = diagnostics.filter(d => d.filePath === activeFile);
      if (activeFileDiagnostics.length > 0) {
        parts.push('    <diagnostics>');
        for (const diag of activeFileDiagnostics.slice(0, 10)) {
          const codeAttr = diag.code ? ` code="${escapeXml(String(diag.code))}"` : '';
          const sourceAttr = diag.source ? ` source="${escapeXml(diag.source)}"` : '';
          parts.push(`      <diagnostic severity="${diag.severity}" line="${diag.line}" column="${diag.column}"${codeAttr}${sourceAttr}>`);
          parts.push(`        ${escapeXml(diag.message)}`);
          parts.push('      </diagnostic>');
        }
        parts.push('    </diagnostics>');
      }
    }
    parts.push('  </active_editor>');
  }

  parts.push('</editor_context>');

  return '\n' + parts.join('\n');
}

/**
 * Build workspace diagnostics context section with all errors/warnings from the entire codebase
 */
export function buildWorkspaceDiagnosticsContext(workspaceDiagnostics?: SystemPromptContext['workspaceDiagnostics']): string {
  if (!workspaceDiagnostics || workspaceDiagnostics.diagnostics.length === 0) {
    return '';
  }

  const { diagnostics, errorCount, warningCount, filesWithErrors, collectedAt } = workspaceDiagnostics;
  const ageSeconds = Math.round((Date.now() - collectedAt) / 1000);

  const parts: string[] = [];
  parts.push('<workspace_diagnostics>');
  parts.push(`  <summary errors="${errorCount}" warnings="${warningCount}" files_with_errors="${filesWithErrors.length}" age_seconds="${ageSeconds}">`);
  parts.push('    <description>These are diagnostics from the ENTIRE workspace codebase (not just open files). Use this to proactively find and fix issues across the project.</description>');
  parts.push('  </summary>');

  // Group diagnostics by file
  const byFile = new Map<string, typeof diagnostics>();
  for (const diag of diagnostics) {
    const existing = byFile.get(diag.filePath) || [];
    existing.push(diag);
    byFile.set(diag.filePath, existing);
  }

  // Sort files by error count (most errors first)
  const sortedFiles = [...byFile.entries()].sort((a, b) => {
    const aErrors = a[1].filter(d => d.severity === 'error').length;
    const bErrors = b[1].filter(d => d.severity === 'error').length;
    return bErrors - aErrors;
  });

  parts.push('  <files>');
  
  // Limit to top 20 files to avoid context overflow
  const filesToShow = sortedFiles.slice(0, 20);
  
  for (const [filePath, fileDiags] of filesToShow) {
    const fileErrors = fileDiags.filter(d => d.severity === 'error').length;
    const fileWarnings = fileDiags.filter(d => d.severity === 'warning').length;
    
    // Make path relative for display
    const displayPath = filePath.replace(/\\/g, '/');
    
    parts.push(`    <file path="${escapeXml(displayPath)}" errors="${fileErrors}" warnings="${fileWarnings}">`);
    
    // Sort by severity and line
    const sorted = [...fileDiags].sort((a, b) => {
      const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2, hint: 3 };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return a.line - b.line;
    });

    // Limit diagnostics per file to avoid bloat
    const diagsToShow = sorted.slice(0, 10);
    
    for (const diag of diagsToShow) {
      const codeAttr = diag.code ? ` code="${escapeXml(String(diag.code))}"` : '';
      const sourceAttr = ` source="${diag.source}"`;
      parts.push(`      <diagnostic severity="${diag.severity}" line="${diag.line}" column="${diag.column}"${codeAttr}${sourceAttr}>`);
      parts.push(`        ${escapeXml(diag.message)}`);
      parts.push('      </diagnostic>');
    }
    
    if (sorted.length > diagsToShow.length) {
      parts.push(`      <truncated>... and ${sorted.length - diagsToShow.length} more diagnostics in this file</truncated>`);
    }
    
    parts.push('    </file>');
  }
  
  if (sortedFiles.length > filesToShow.length) {
    parts.push(`    <truncated>... and ${sortedFiles.length - filesToShow.length} more files with diagnostics</truncated>`);
  }
  
  parts.push('  </files>');

  // Add actionable hints
  if (errorCount > 0) {
    parts.push('  <hints>');
    parts.push('    <hint>There are TypeScript/ESLint errors in the workspace. You should fix these to ensure the code compiles and passes linting.</hint>');
    if (filesWithErrors.length > 0) {
      parts.push(`    <hint>Files with errors that may need attention: ${filesWithErrors.slice(0, 5).map(f => f.split(/[/\\]/).pop()).join(', ')}${filesWithErrors.length > 5 ? '...' : ''}</hint>`);
    }
    parts.push('  </hints>');
  }

  parts.push('</workspace_diagnostics>');

  return '\n' + parts.join('\n');
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Truncate command for display
 */
function truncateCommand(cmd: string, maxLen: number): string {
  if (cmd.length <= maxLen) return cmd;
  return cmd.slice(0, maxLen - 3) + '...';
}

/**
 * Truncate output for context, keeping last N characters
 */
function truncateOutput(output: string, maxLen: number): string {
  const cleaned = output.trim();
  if (cleaned.length <= maxLen) return cleaned;
  return '...' + cleaned.slice(-maxLen + 3);
}

/**
 * Build core context section with workspace, session, and provider info
 */
export function buildCoreContext(
  context: SystemPromptContext,
  includeWorkspaceContext: boolean
): string {
  if (!includeWorkspaceContext) {
    return '';
  }

  const workspacePath = context.workspace?.path || 'No workspace selected';
  const isWindows = process.platform === 'win32';
  const osName = isWindows ? 'Windows' : (process.platform === 'darwin' ? 'macOS' : 'Linux');
  const pathSeparator = isWindows ? '\\' : '/';

  // Build the base context
  let contextXml = `
<context>
  <workspace_root>${workspacePath}</workspace_root>
  <operating_system>${osName}</operating_system>
  <path_separator>${pathSeparator}</path_separator>
  <session>${context.session.state.id}</session>
  <model>${context.modelId}</model>
  <provider>${context.providerName}</provider>
  <tools_available>${context.toolsList}</tools_available>
  <local_time>${new Date().toISOString()}</local_time>
</context>`;

  // Add terminal context if available
  const terminalSection = buildTerminalContext(context.terminalContext);
  if (terminalSection) {
    contextXml += terminalSection;
  }

  // Add editor context if available (diagnostics from open files)
  const editorSection = buildEditorContext(context.editorContext);
  if (editorSection) {
    contextXml += editorSection;
  }

  // Add workspace-wide diagnostics if available (all errors from entire codebase)
  const workspaceDiagnosticsSection = buildWorkspaceDiagnosticsContext(context.workspaceDiagnostics);
  if (workspaceDiagnosticsSection) {
    contextXml += workspaceDiagnosticsSection;
  }

  return contextXml;
}

/**
 * Build core tools section with available tool information
 */
export function buildCoreTools(toolsList: string, _toolDefinitions?: ToolDefForPrompt[]): string {
  return `
<tools>
  <available_tools>${toolsList}</available_tools>
  <note>Refer to the tools array for detailed parameter requirements and usage rules.</note>
</tools>`;
}

/**
 * Important instruction reminders - placed near end for recency effect
 */
export const IMPORTANT_REMINDERS = `
<pre_action_checklist>
## Before EVERY Tool Call

### File Edits
□ Have I READ this file in the current session?
□ Is the path ABSOLUTE (workspace_root + relative)?
□ Is \`old_string\` EXACT (all whitespace, newlines, indentation)?
□ Does \`old_string\` include 3+ lines of context for uniqueness?

### File Creation
□ Did I SEARCH (glob/grep) for existing similar files?
□ Is this genuinely new functionality, not a duplicate?

### After Edits
□ Will I run \`read_lints([files])\` to verify?
□ If errors, will I fix immediately (max 3 attempts)?
</pre_action_checklist>`;

/**
 * Closing reminder - final recency effect placement
 * This is the last thing the model reads before responding
 */
export const CLOSING_REMINDER = `
<final_reminder priority="CRITICAL">
## ⚠️ STOP — Final Verification

Before your FIRST tool call, confirm:

| Check | Status |
|-------|--------|
| Read before edit? | Files I'll edit have been read this session |
| Absolute paths? | All paths start with workspace root |
| Exact old_string? | Includes ALL whitespace, newlines, indentation |
| Search before create? | Checked for existing files with glob/grep |
| Complete code? | No TODOs, placeholders, or stubs |
| User alignment? | Doing exactly what was requested |

**If editing without reading: STOP. Read the file first.**

**If old_string fails: Re-read the file, find the actual content, retry.**
</final_reminder>`;


/**
 * Build persona section based on active persona
 */
export function buildPersonaSection(
  promptSettings: PromptSettings,
  logger?: Logger
): string {
  if (!promptSettings.activePersonaId || promptSettings.activePersonaId === 'default') {
    logger?.debug('[buildSystemPrompt] Using default persona (no customization)', {
      activePersonaId: promptSettings.activePersonaId,
    });
    return '';
  }

  const personas = promptSettings.personas ?? [];
  const activePersona = personas.find(p => p.id === promptSettings.activePersonaId);

  logger?.debug('[buildSystemPrompt] Looking for persona', {
    activePersonaId: promptSettings.activePersonaId,
    personasCount: personas.length,
    foundPersona: activePersona?.name,
    hasSystemPrompt: !!activePersona?.systemPrompt,
  });

  if (activePersona?.systemPrompt) {
    return `
<persona active="true">
  <name>${activePersona.name || 'Custom Persona'}</name>
  <instructions>${activePersona.systemPrompt}</instructions>
</persona>`;
  }

  logger?.warn('[buildSystemPrompt] Active persona not found or has no systemPrompt', {
    activePersonaId: promptSettings.activePersonaId,
    availablePersonaIds: personas.map(p => p.id),
  });

  return '';
}

/**
 * Build custom prompt section from user settings
 */
export function buildCustomPromptSection(promptSettings: PromptSettings): string {
  if (!promptSettings.useCustomSystemPrompt || !promptSettings.customSystemPrompt) {
    return '';
  }

  return `
<custom_instructions>
${promptSettings.customSystemPrompt}
</custom_instructions>`;
}

/**
 * Build communication style section based on response format preferences
 */
export function buildCommunicationStyle(responseFormat?: PromptSettings['responseFormat']): string {
  const styles: string[] = [];

  if (!responseFormat) {
    return `
<communication_style tone="professional">
  <guideline>Be concise but conversational</guideline>
  <guideline>Briefly explain what you're doing before using tools</guideline>
  <guideline>After completing tasks, provide a clear summary of changes made</guideline>
  <guideline>When multiple tool calls are needed, group them logically</guideline>
</communication_style>`;
  }

  // Tone-based communication adjustments
  switch (responseFormat.tone) {
    case 'casual':
      styles.push('Be friendly and approachable');
      styles.push('Use conversational language');
      styles.push('Keep explanations easy to understand');
      break;
    case 'technical':
      styles.push('Be precise and technical');
      styles.push('Use appropriate terminology');
      styles.push('Focus on implementation details');
      break;
    case 'friendly':
      styles.push('Be warm and encouraging');
      styles.push('Celebrate successes and progress');
      styles.push('Offer supportive guidance');
      break;
    default: // professional
      styles.push('Be concise but conversational');
      styles.push('Briefly explain what you\'re doing before using tools');
      styles.push('After completing tasks, provide a clear summary of changes made');
      break;
  }

  // Explanation detail level
  switch (responseFormat.explanationDetail) {
    case 'minimal':
      styles.push('Keep explanations brief and to the point');
      styles.push('Skip unnecessary details');
      break;
    case 'detailed':
      styles.push('Provide thorough explanations');
      styles.push('Include context and reasoning');
      break;
    // moderate is default, no additional instructions needed
  }

  // Response length preference
  switch (responseFormat.maxResponseLength) {
    case 'short':
      styles.push('Keep responses concise and focused');
      break;
    case 'long':
    case 'unlimited':
      styles.push('Provide comprehensive responses when needed');
      break;
    // medium is default
  }

  // Code formatting preferences
  if (responseFormat.includeLineNumbers) {
    styles.push('Include line numbers in code blocks when helpful');
  }

  if (responseFormat.includeExamples) {
    styles.push('Include examples when explaining concepts');
  }

  if (responseFormat.useHeaders) {
    styles.push('Use headers to organize longer responses');
  }

  const guidelinesXml = styles.map(s => `  <guideline>${s}</guideline>`).join('\n');

  return `
<communication_style tone="${responseFormat.tone || 'professional'}">
${guidelinesXml}
</communication_style>`;
}

/**
 * Build additional instructions section
 */
export function buildAdditionalInstructions(additionalInstructions?: string): string {
  if (!additionalInstructions) {
    return '';
  }

  return `
<additional_instructions>
${additionalInstructions}
</additional_instructions>`;
}

/**
 * Build access level section for system prompt
 * Informs the AI about its current permissions and restrictions
 */
export function buildAccessLevelSection(accessLevelSettings?: AccessLevelSettings): string {
  if (!accessLevelSettings || !accessLevelSettings.showInSystemPrompt) {
    return '';
  }

  const { level, categoryPermissions, restrictedPaths, allowedPaths, allowAccessRequests } = accessLevelSettings;

  const levelInfo = ACCESS_LEVEL_DESCRIPTIONS[level];
  const basePermissions = ACCESS_LEVEL_DEFAULTS[level];

  // Build permission summary
  const permissionLines: string[] = [];

  const categories = ['read', 'write', 'terminal', 'git', 'system', 'destructive'] as const;
  for (const category of categories) {
    const override = categoryPermissions[category];
    const permission = override ?? basePermissions[category];

    const status = permission.allowed
      ? (permission.requiresConfirmation ? '✓ (requires confirmation)' : '✓')
      : '✗ (blocked)';

    permissionLines.push(`  <permission category="${category}">${status}</permission>`);
  }

  // Build restrictions section
  let restrictionsSection = '';
  if (restrictedPaths.length > 0) {
    restrictionsSection = `
  <restricted_paths>
    ${restrictedPaths.map(p => `<path>${p}</path>`).join('\n    ')}
  </restricted_paths>`;
  }

  // Build allowed paths override section
  let allowedSection = '';
  if (allowedPaths.length > 0) {
    allowedSection = `
  <explicitly_allowed_paths>
    ${allowedPaths.map(p => `<path>${p}</path>`).join('\n    ')}
  </explicitly_allowed_paths>`;
  }

  // Build access request info
  const requestInfo = allowAccessRequests
    ? `\n  <note>If an operation requires elevated permissions, you may ask the user to grant temporary access.</note>`
    : '';

  // Build workspace boundary info
  const workspaceBoundaryInfo = accessLevelSettings.allowOutsideWorkspace
    ? `\n  <workspace_access>You have permission to access files outside the workspace when explicitly requested.</workspace_access>`
    : `\n  <workspace_access>You can ONLY access files within the active workspace. Files outside the workspace are blocked.</workspace_access>`;

  return `
<access_level level="${level}" name="${levelInfo.name}">
  <description>${levelInfo.description}</description>
  
  <permissions>
${permissionLines.join('\n')}
  </permissions>
${restrictionsSection}${allowedSection}${requestInfo}${workspaceBoundaryInfo}
  
  <rules>
    <rule>NEVER attempt operations outside your access level</rule>
    <rule>If an operation is blocked, explain why and suggest alternatives</rule>
    <rule>Respect path restrictions - do not read, write, or reference restricted paths</rule>
    <rule>Operations requiring confirmation will prompt the user before executing</rule>${!accessLevelSettings.allowOutsideWorkspace ? '\n    <rule>Only access files within the current workspace - external paths are blocked</rule>' : ''}
  </rules>
</access_level>`;
}

// =============================================================================
// TASK ANALYSIS CONTEXT
// =============================================================================

/**
 * Build task analysis context section for system prompt
 * Provides the AI with understanding of the current task's nature and requirements
 */
export function buildTaskAnalysisContext(taskAnalysis?: TaskAnalysisContext): string {
  if (!taskAnalysis) {
    return '';
  }

  const parts: string[] = [];
  parts.push('<task_analysis>');
  parts.push(`  <intent primary="${taskAnalysis.intent}" confidence="${(taskAnalysis.confidence * 100).toFixed(0)}%">`);
  
  if (taskAnalysis.secondaryIntents && taskAnalysis.secondaryIntents.length > 0) {
    parts.push(`    <secondary_intents>${taskAnalysis.secondaryIntents.join(', ')}</secondary_intents>`);
  }
  
  parts.push('  </intent>');
  parts.push(`  <complexity level="${taskAnalysis.complexity}" />`);
  parts.push(`  <scope level="${taskAnalysis.scope}" />`);
  
  if (taskAnalysis.shouldDecompose) {
    parts.push('  <recommendation>This task is complex enough to benefit from decomposition into subtasks</recommendation>');
  }
  
  if (taskAnalysis.recommendedSpecialization) {
    parts.push(`  <recommended_approach>${taskAnalysis.recommendedSpecialization}</recommended_approach>`);
  }

  if (taskAnalysis.estimatedTokens) {
    parts.push(`  <estimated_tokens>${taskAnalysis.estimatedTokens}</estimated_tokens>`);
  }

  parts.push('</task_analysis>');

  return '\n' + parts.join('\n');
}

// =============================================================================
// WORKSPACE STRUCTURE CONTEXT
// =============================================================================

/**
 * Build workspace structure context for better file navigation
 */
export function buildWorkspaceStructureContext(workspaceStructure?: WorkspaceStructureContext): string {
  if (!workspaceStructure) {
    return '';
  }

  const hasContent = (
    workspaceStructure.projectType ||
    (workspaceStructure.configFiles && workspaceStructure.configFiles.length > 0) ||
    (workspaceStructure.sourceDirectories && workspaceStructure.sourceDirectories.length > 0)
  );

  if (!hasContent) {
    return '';
  }

  const parts: string[] = [];
  parts.push('<workspace_structure>');

  if (workspaceStructure.projectType) {
    parts.push(`  <project_type>${workspaceStructure.projectType}</project_type>`);
  }

  if (workspaceStructure.framework) {
    parts.push(`  <framework>${workspaceStructure.framework}</framework>`);
  }

  if (workspaceStructure.packageManager) {
    parts.push(`  <package_manager>${workspaceStructure.packageManager}</package_manager>`);
  }

  if (workspaceStructure.configFiles && workspaceStructure.configFiles.length > 0) {
    parts.push('  <config_files>');
    for (const file of workspaceStructure.configFiles.slice(0, 10)) {
      parts.push(`    <file>${escapeXml(file)}</file>`);
    }
    parts.push('  </config_files>');
  }

  if (workspaceStructure.sourceDirectories && workspaceStructure.sourceDirectories.length > 0) {
    parts.push('  <source_directories>');
    for (const dir of workspaceStructure.sourceDirectories.slice(0, 5)) {
      parts.push(`    <dir>${escapeXml(dir)}</dir>`);
    }
    parts.push('  </source_directories>');
  }

  if (workspaceStructure.testDirectories && workspaceStructure.testDirectories.length > 0) {
    parts.push('  <test_directories>');
    for (const dir of workspaceStructure.testDirectories.slice(0, 3)) {
      parts.push(`    <dir>${escapeXml(dir)}</dir>`);
    }
    parts.push('  </test_directories>');
  }

  parts.push('</workspace_structure>');

  return '\n' + parts.join('\n');
}

/**
 * Build memory context section for system prompt
 * Injects relevant memories to provide persistent context across sessions
 */
export function buildMemoryContext(memories?: MemoryEntry[]): string {
  if (!memories || memories.length === 0) {
    return '';
  }

  const parts: string[] = [];
  parts.push('<agent_memory>');
  parts.push('  <description>These are memories from previous sessions. Use them to maintain context and consistency.</description>');

  // Group by category for better organization
  const pinned = memories.filter(m => m.isPinned);
  const unpinned = memories.filter(m => !m.isPinned);

  if (pinned.length > 0) {
    parts.push('  <pinned_memories>');
    for (const mem of pinned) {
      parts.push(`    <memory category="${mem.category}" importance="${mem.importance}">`);
      parts.push(`      ${escapeXml(mem.content)}`);
      parts.push('    </memory>');
    }
    parts.push('  </pinned_memories>');
  }

  if (unpinned.length > 0) {
    parts.push('  <recent_memories>');
    for (const mem of unpinned.slice(0, 10)) {
      parts.push(`    <memory category="${mem.category}" importance="${mem.importance}">`);
      parts.push(`      ${escapeXml(mem.content)}`);
      parts.push('    </memory>');
    }
    parts.push('  </recent_memories>');
  }

  parts.push('  <hint>Use the memory tool to store important context, decisions, and patterns for future sessions.</hint>');
  parts.push('</agent_memory>');

  return '\n' + parts.join('\n');
}

/**
 * Evaluate context injection condition
 */
export function evaluateContextInjectionCondition(
  condition: ContextInjectionCondition,
  session: InternalSession,
  logger?: Logger
): boolean {
  switch (condition.type) {
    case 'always':
      return true;

    case 'workspace-pattern': {
      if (!condition.value) return false;
      const workspacePath = session.state.workspaceId || '';
      // Simple glob-like matching
      const patternRegex = condition.value
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      try {
        return new RegExp(patternRegex, 'i').test(workspacePath);
      } catch (error) {
        logger?.debug('Invalid workspace-pattern regex; falling back to substring match', {
          pattern: condition.value,
          error: error instanceof Error ? error.message : String(error),
        });
        return workspacePath.toLowerCase().includes(condition.value.toLowerCase());
      }
    }

    case 'keyword': {
      if (!condition.value) return false;
      // Check if the last user message contains any of the keywords
      const lastUserMessage = session.state.messages
        .filter(m => m.role === 'user')
        .slice(-1)[0]?.content || '';
      const keywords = condition.value.toLowerCase().split(',').map(k => k.trim());
      const messageLower = lastUserMessage.toLowerCase();
      return keywords.some(keyword => messageLower.includes(keyword));
    }

    case 'file-type': {
      if (!condition.value) return false;
      // Check if any recent file operations match the file type pattern
      // This would typically check against files mentioned in recent messages
      const lastUserMessage = session.state.messages
        .filter(m => m.role === 'user')
        .slice(-1)[0]?.content || '';
      const patterns = condition.value.split(',').map(p => p.trim());
      return patterns.some(pattern => {
        // Convert glob pattern to regex (e.g., *.ts -> \.ts$)
        const regexPattern = pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*');
        try {
          return new RegExp(regexPattern, 'i').test(lastUserMessage);
        } catch (error) {
          logger?.debug('Invalid file-type glob regex; falling back to substring match', {
            pattern,
            error: error instanceof Error ? error.message : String(error),
          });
          return lastUserMessage.includes(pattern);
        }
      });
    }

    case 'custom':
      // Custom conditions are not evaluated at runtime for security
      // They would need to be pre-evaluated or handled differently
      logger?.debug('Custom context injection conditions are not supported at runtime');
      return false;

    default:
      return false;
  }
}

/**
 * Process context rule template with placeholder replacements
 */
export function processContextRuleTemplate(
  template: string,
  session: InternalSession,
  workspace: { id: string; path: string; name?: string } | undefined,
  providerName: string,
  editorContext?: SystemPromptContext['editorContext']
): string {
  let result = template;

  // Basic placeholders
  result = result.replace(/\{\{workspace\}\}/g, workspace?.path ?? 'No workspace');
  result = result.replace(/\{\{session\}\}/g, session.state.id);
  result = result.replace(/\{\{provider\}\}/g, providerName);

  // Editor context placeholders
  if (editorContext) {
    result = result.replace(/\{\{activeFile\}\}/g, editorContext.activeFile || 'None');
    result = result.replace(/\{\{openFiles\}\}/g, editorContext.openFiles.join(', ') || 'None');
  } else {
    result = result.replace(/\{\{activeFile\}\}/g, 'None');
    result = result.replace(/\{\{openFiles\}\}/g, 'None');
  }

  return result;
}

/**
 * Build injected context from context injection rules
 */
export function buildInjectedContext(
  promptSettings: PromptSettings,
  session: InternalSession,
  workspace: { id: string; path: string; name?: string } | undefined,
  providerName: string,
  editorContext?: SystemPromptContext['editorContext'],
  logger?: Logger
): string {
  if (!promptSettings.contextInjectionRules?.length) {
    return '';
  }

  logger?.debug('[buildSystemPrompt] Processing context injection rules', {
    totalRules: promptSettings.contextInjectionRules.length,
    enabledRules: promptSettings.contextInjectionRules.filter(r => r.enabled).length,
  });

  const applicableRules = promptSettings.contextInjectionRules
    .filter(rule => rule.enabled)
    .filter(rule => evaluateContextInjectionCondition(rule.condition, session, logger))
    .sort((a, b) => a.priority - b.priority);

  logger?.debug('[buildSystemPrompt] Applicable rules after evaluation', {
    applicableRules: applicableRules.map(r => ({ name: r.name, condition: r.condition.type })),
  });

  if (applicableRules.length === 0) {
    return '';
  }

  const injectedContextParts: string[] = [];

  for (const rule of applicableRules) {
    // Replace placeholders in template
    const template = processContextRuleTemplate(rule.template, session, workspace, providerName, editorContext);

    // Context injection rules are always appended as extra context
    injectedContextParts.push(`  <rule name="${rule.name}" priority="${rule.priority}">
    ${template}
  </rule>`);
  }

  return `
<injected_context>
${injectedContextParts.join('\n')}
</injected_context>`;
}

/**
 * Build the complete system prompt for the AI agent
 * 
 * Structure (in order):
 * 1. Identity and role
 * 2. Critical rules (highest priority)
 * 3. Core context (workspace, session, system info)
 * 4. Workspace structure (project type, directories)
 * 5. Task analysis (intent, complexity, scope)
 * 6. Access level and permissions
 * 7. Available tools list
 * 8. Tool workflows and best practices
 * 9. Guidelines (file ops, response behavior, code quality, error handling)
 * 10. Persona/custom instructions (if set)
 * 11. Communication style (tone, format preferences)
 * 12. Additional instructions
 * 13. Injected context (dynamic rules)
 * 14. Reminders and final check
 */
export function buildSystemPrompt(context: SystemPromptContext): string {
  const { promptSettings, accessLevelSettings, logger } = context;

  // Log prompt settings for debugging
  if (process.env.NODE_ENV === 'development') {
    logger?.debug('[buildSystemPrompt] Prompt settings:', {
      activePersonaId: promptSettings.activePersonaId,
      useCustomSystemPrompt: promptSettings.useCustomSystemPrompt,
      personasCount: promptSettings.personas?.length,
      contextRulesCount: promptSettings.contextInjectionRules?.length,
      responseFormatTone: promptSettings.responseFormat?.tone,
      accessLevel: accessLevelSettings?.level,
      hasTaskAnalysis: !!context.taskAnalysis,
      hasWorkspaceStructure: !!context.workspaceStructure,
      hasMemories: !!context.memories?.length,
    });
  }

  // Build all sections
  const coreContext = buildCoreContext(context, promptSettings.includeWorkspaceContext !== false);
  const workspaceStructureSection = buildWorkspaceStructureContext(context.workspaceStructure);
  const taskAnalysisSection = buildTaskAnalysisContext(context.taskAnalysis);
  const accessLevelSection = buildAccessLevelSection(accessLevelSettings);
  const memorySection = buildMemoryContext(context.memories);
  const coreTools = buildCoreTools(context.toolsList, context.toolDefinitions);
  const personaSection = buildPersonaSection(promptSettings, logger);
  const customPromptSection = buildCustomPromptSection(promptSettings);
  const communicationStyle = buildCommunicationStyle(promptSettings.responseFormat);
  const additionalInstructions = buildAdditionalInstructions(promptSettings.additionalInstructions);
  const injectedContext = buildInjectedContext(
    promptSettings,
    context.session,
    context.workspace,
    context.providerName,
    context.editorContext,
    logger
  );

  // Log final prompt components for debugging
  logger?.debug('[buildSystemPrompt] Final prompt assembly', {
    hasPersonaSection: !!personaSection,
    hasCustomPrompt: !!customPromptSection,
    hasCommunicationStyle: !!communicationStyle,
    hasAdditionalInstructions: !!additionalInstructions,
    hasInjectedContext: !!injectedContext,
    hasAccessLevelSection: !!accessLevelSection,
    hasTaskAnalysis: !!taskAnalysisSection,
    hasWorkspaceStructure: !!workspaceStructureSection,
    hasMemorySection: !!memorySection,
    responseFormatTone: promptSettings.responseFormat?.tone,
  });

  // Assemble in optimal order for LLM comprehension
  // Structure: Identity → Rules → Context → Analysis → Tools → Workflows → Style → Reminders
  const systemPrompt = [
    CORE_IDENTITY,              // 1. Identity and role (who you are)
    CRITICAL_RULES,             // 2. Critical rules (highest priority - what you MUST do)
    coreContext,                // 3. Core context (workspace, session, system info)
    workspaceStructureSection,  // 4. Workspace structure (project type, directories)
    taskAnalysisSection,        // 5. Task analysis (intent, complexity, scope)
    accessLevelSection,         // 6. Access level and permissions
    memorySection,              // 7. Agent memories (persistent context)
    coreTools,                  // 8. Available tools list
    TOOL_WORKFLOWS,             // 9. Tool workflows and patterns
    TOOL_HINTS,                 // 10. Tool-specific parameter guidance
    OUTPUT_FORMATTING,          // 11. Response formatting guidelines
    personaSection,             // 12. Persona/custom instructions
    customPromptSection,        // 13. Custom user prompt
    communicationStyle,         // 14. Communication style (tone)
    additionalInstructions,     // 15. Additional instructions
    injectedContext,            // 16. Dynamic injected context
    IMPORTANT_REMINDERS,        // 17. Pre-action checklist
    CLOSING_REMINDER,           // 18. Final verification (recency effect)
  ].filter(Boolean).join('\n');


  return systemPrompt;
}
