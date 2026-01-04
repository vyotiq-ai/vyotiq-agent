/**
 * Dynamic Sections Builder
 * 
 * Builds context-aware sections that change per-request:
 * - Workspace context
 * - Terminal context
 * - Editor context
 * - Access level
 * - Persona/custom instructions
 */

import type {
  SystemPromptContext,
  TerminalContextInfo,
  EditorContextInfo,
  WorkspaceDiagnosticsInfo,
  TaskAnalysisContext,
  WorkspaceStructureContext,
} from './types';
import type { PromptSettings, AccessLevelSettings } from '../../../shared/types';
import { ACCESS_LEVEL_DEFAULTS, ACCESS_LEVEL_DESCRIPTIONS } from '../../../shared/types';

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
// CORE CONTEXT
// =============================================================================

export function buildCoreContext(context: SystemPromptContext): string {
  if (!context.promptSettings.includeWorkspaceContext) {
    return '';
  }

  const workspacePath = context.workspace?.path || 'No workspace selected';
  const isWindows = process.platform === 'win32';
  const osName = isWindows ? 'Windows' : (process.platform === 'darwin' ? 'macOS' : 'Linux');

  return `<context>
  <workspace_root>${workspacePath}</workspace_root>
  <operating_system>${osName}</operating_system>
  <path_separator>${isWindows ? '\\\\' : '/'}</path_separator>
  <session>${context.session.state.id}</session>
  <model>${context.modelId}</model>
  <provider>${context.providerName}</provider>
  <tools_available>${context.toolsList}</tools_available>
  <local_time>${new Date().toISOString()}</local_time>
</context>`;
}

// =============================================================================
// CORE TOOLS
// =============================================================================

export function buildCoreTools(toolsList: string, _toolDefinitions?: { name: string; description: string }[]): string {
  return `<tools>
  <available_tools>${toolsList}</available_tools>
  <note>Refer to the tools array for detailed parameter requirements and usage rules.</note>
</tools>`;
}

// =============================================================================
// TERMINAL CONTEXT
// =============================================================================

export function buildTerminalContext(terminalContext?: TerminalContextInfo): string {
  if (!terminalContext || terminalContext.processes.length === 0) {
    return '';
  }

  const { processes, defaultShell, cwd } = terminalContext;
  const runningCount = processes.filter(p => p.isRunning).length;

  const parts: string[] = [];
  parts.push('<terminal_context>');
  parts.push(`  <shell>${defaultShell}</shell>`);
  if (cwd) parts.push(`  <cwd>${cwd}</cwd>`);

  if (processes.length > 0) {
    parts.push(`  <processes running="${runningCount}">`);
    for (const proc of processes.slice(0, 5)) {
      const status = proc.isRunning ? 'running' : `exited:${proc.exitCode}`;
      parts.push(`    <process pid="${proc.pid}" status="${status}">`);
      parts.push(`      <command>${escapeXml(truncate(proc.command, 100))}</command>`);
      parts.push('    </process>');
    }
    parts.push('  </processes>');

    if (runningCount > 0) {
      parts.push('  <hint>Use check_terminal(pid) for output, kill_terminal(pid) to stop</hint>');
    }
  }

  parts.push('</terminal_context>');
  return parts.join('\n');
}

// =============================================================================
// EDITOR CONTEXT
// =============================================================================

export function buildEditorContext(editorContext?: EditorContextInfo): string {
  if (!editorContext || (editorContext.openFiles.length === 0 && !editorContext.activeFile)) {
    return '';
  }

  const { openFiles, activeFile, cursorPosition, diagnostics } = editorContext;
  const parts: string[] = [];
  parts.push('<editor_context>');

  if (openFiles.length > 0) {
    parts.push('  <open_files>');
    for (const file of openFiles.slice(0, 10)) {
      const isActive = file === activeFile ? ' active="true"' : '';
      parts.push(`    <file${isActive}>${escapeXml(file)}</file>`);
    }
    parts.push('  </open_files>');
  }

  if (activeFile && cursorPosition) {
    parts.push(`  <cursor file="${escapeXml(activeFile)}" line="${cursorPosition.lineNumber}" column="${cursorPosition.column}" />`);
  }

  // Active file diagnostics
  if (diagnostics && diagnostics.length > 0 && activeFile) {
    const fileDiags = diagnostics.filter(d => d.filePath === activeFile).slice(0, 5);
    if (fileDiags.length > 0) {
      parts.push('  <diagnostics>');
      for (const d of fileDiags) {
        parts.push(`    <diagnostic severity="${d.severity}" line="${d.line}">${escapeXml(d.message)}</diagnostic>`);
      }
      parts.push('  </diagnostics>');
    }
  }

  parts.push('</editor_context>');
  return parts.join('\n');
}

// =============================================================================
// WORKSPACE DIAGNOSTICS
// =============================================================================

export function buildWorkspaceDiagnostics(diagnostics?: WorkspaceDiagnosticsInfo): string {
  if (!diagnostics || diagnostics.diagnostics.length === 0) {
    return '';
  }

  const { errorCount, warningCount } = diagnostics;
  const parts: string[] = [];
  parts.push(`<workspace_diagnostics errors="${errorCount}" warnings="${warningCount}">`);

  // Group by file, show top 10 files
  const byFile = new Map<string, typeof diagnostics.diagnostics>();
  for (const d of diagnostics.diagnostics) {
    const existing = byFile.get(d.filePath) || [];
    existing.push(d);
    byFile.set(d.filePath, existing);
  }

  const sortedFiles = [...byFile.entries()]
    .sort((a, b) => b[1].filter(d => d.severity === 'error').length - a[1].filter(d => d.severity === 'error').length)
    .slice(0, 10);

  for (const [filePath, fileDiags] of sortedFiles) {
    const errors = fileDiags.filter(d => d.severity === 'error').length;
    parts.push(`  <file path="${escapeXml(filePath)}" errors="${errors}">`);
    for (const d of fileDiags.slice(0, 3)) {
      parts.push(`    <diagnostic line="${d.line}" severity="${d.severity}">${escapeXml(d.message)}</diagnostic>`);
    }
    parts.push('  </file>');
  }

  if (errorCount > 0) {
    parts.push('  <hint>Fix these errors to ensure code compiles and passes linting.</hint>');
  }

  parts.push('</workspace_diagnostics>');
  return parts.join('\n');
}

// =============================================================================
// TASK ANALYSIS
// =============================================================================

export function buildTaskAnalysis(taskAnalysis?: TaskAnalysisContext): string {
  if (!taskAnalysis) return '';

  const parts: string[] = [];
  parts.push(`<task_analysis intent="${taskAnalysis.intent}" confidence="${(taskAnalysis.confidence * 100).toFixed(0)}%">`);
  parts.push(`  <complexity>${taskAnalysis.complexity}</complexity>`);
  parts.push(`  <scope>${taskAnalysis.scope}</scope>`);

  if (taskAnalysis.shouldDecompose) {
    parts.push('  <recommendation>Consider decomposing into subtasks</recommendation>');
  }

  parts.push('</task_analysis>');
  return parts.join('\n');
}

// =============================================================================
// WORKSPACE STRUCTURE
// =============================================================================

export function buildWorkspaceStructure(structure?: WorkspaceStructureContext): string {
  if (!structure || !structure.projectType) return '';

  const parts: string[] = [];
  parts.push('<workspace_structure>');

  if (structure.projectType) parts.push(`  <project_type>${structure.projectType}</project_type>`);
  if (structure.framework) parts.push(`  <framework>${structure.framework}</framework>`);
  if (structure.packageManager) parts.push(`  <package_manager>${structure.packageManager}</package_manager>`);

  if (structure.sourceDirectories?.length) {
    parts.push(`  <source_dirs>${structure.sourceDirectories.slice(0, 5).join(', ')}</source_dirs>`);
  }

  parts.push('</workspace_structure>');
  return parts.join('\n');
}

// =============================================================================
// ACCESS LEVEL
// =============================================================================

export function buildAccessLevel(settings?: AccessLevelSettings): string {
  if (!settings || !settings.showInSystemPrompt) return '';

  const { level, categoryPermissions } = settings;
  const levelInfo = ACCESS_LEVEL_DESCRIPTIONS[level];
  const basePermissions = ACCESS_LEVEL_DEFAULTS[level];

  const parts: string[] = [];
  parts.push(`<access_level level="${level}" name="${levelInfo.name}">`);
  parts.push(`  <description>${levelInfo.description}</description>`);
  parts.push('  <permissions>');

  const categories = ['read', 'write', 'terminal', 'git', 'system', 'destructive'] as const;
  for (const cat of categories) {
    const perm = categoryPermissions[cat] ?? basePermissions[cat];
    const status = perm.allowed ? (perm.requiresConfirmation ? '✓ (confirm)' : '✓') : '✗';
    parts.push(`    <${cat}>${status}</${cat}>`);
  }

  parts.push('  </permissions>');

  if (!settings.allowOutsideWorkspace) {
    parts.push('  <restriction>Only access files within workspace</restriction>');
  }

  parts.push('</access_level>');
  return parts.join('\n');
}

// =============================================================================
// PERSONA & CUSTOM INSTRUCTIONS
// =============================================================================

export function buildPersona(promptSettings: PromptSettings): string {
  if (!promptSettings.activePersonaId || promptSettings.activePersonaId === 'default') {
    return '';
  }

  const persona = promptSettings.personas?.find(p => p.id === promptSettings.activePersonaId);
  if (!persona?.systemPrompt) return '';

  return `<persona name="${persona.name || 'Custom'}">
${persona.systemPrompt}
</persona>`;
}

export function buildCustomPrompt(promptSettings: PromptSettings): string {
  if (!promptSettings.useCustomSystemPrompt || !promptSettings.customSystemPrompt) {
    return '';
  }

  return `<custom_instructions>
${promptSettings.customSystemPrompt}
</custom_instructions>`;
}

export function buildAdditionalInstructions(instructions?: string): string {
  if (!instructions) return '';

  return `<additional_instructions>
${instructions}
</additional_instructions>`;
}

// =============================================================================
// COMMUNICATION STYLE
// =============================================================================

export function buildCommunicationStyle(responseFormat?: PromptSettings['responseFormat']): string {
  if (!responseFormat) {
    return `<communication_style tone="professional">
  <guideline>Be concise but conversational</guideline>
  <guideline>Explain approach briefly before using tools</guideline>
  <guideline>Summarize changes after completion</guideline>
</communication_style>`;
  }

  const guidelines: string[] = [];

  switch (responseFormat.tone) {
    case 'casual':
      guidelines.push('Be friendly and approachable');
      break;
    case 'technical':
      guidelines.push('Be precise and technical');
      break;
    case 'friendly':
      guidelines.push('Be warm and encouraging');
      break;
    default:
      guidelines.push('Be concise but conversational');
  }

  switch (responseFormat.explanationDetail) {
    case 'minimal':
      guidelines.push('Keep explanations brief');
      break;
    case 'detailed':
      guidelines.push('Provide thorough explanations');
      break;
  }

  if (responseFormat.includeExamples) {
    guidelines.push('Include examples when helpful');
  }

  const guidelinesXml = guidelines.map(g => `  <guideline>${g}</guideline>`).join('\n');

  return `<communication_style tone="${responseFormat.tone || 'professional'}">
${guidelinesXml}
</communication_style>`;
}
