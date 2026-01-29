/**
 * Prompt Templates
 *
 * Reusable prompt templates for common agent interactions.
 */

// =============================================================================
// Confirmation Templates
// =============================================================================

/**
 * Template for confirming destructive actions
 */
export function confirmDestructiveAction(options: {
  action: string;
  target: string;
  consequences?: string[];
}): string {
  let template = `
## Confirmation Required

You are about to perform a destructive action:
- **Action**: ${options.action}
- **Target**: ${options.target}
`;

  if (options.consequences && options.consequences.length > 0) {
    template += `
### Potential Consequences
${options.consequences.map(c => `- ${c}`).join('\n')}
`;
  }

  template += `
Are you sure you want to proceed? Consider if this is reversible and if you have backups.
`;

  return template;
}

/**
 * Template for asking user to choose
 */
export function askUserChoice(options: {
  question: string;
  choices: { key: string; description: string }[];
  default?: string;
}): string {
  let template = `
## User Input Required

${options.question}

### Options
${options.choices.map(c => `- **${c.key}**: ${c.description}`).join('\n')}
`;

  if (options.default) {
    template += `\nDefault: ${options.default}`;
  }

  return template;
}

// =============================================================================
// Error Templates
// =============================================================================

/**
 * Template for reporting errors to user
 */
export function reportError(options: {
  context: string;
  error: string;
  suggestion?: string;
  canRetry?: boolean;
}): string {
  let template = `
## Error Encountered

**Context**: ${options.context}
**Error**: ${options.error}
`;

  if (options.suggestion) {
    template += `
**Suggestion**: ${options.suggestion}
`;
  }

  if (options.canRetry) {
    template += `
This operation can be retried.
`;
  }

  return template;
}

/**
 * Template for tool execution error
 */
export function toolExecutionError(options: {
  tool: string;
  parameters?: object;
  error: string;
  alternatives?: string[];
}): string {
  let template = `
## Tool Execution Failed

**Tool**: ${options.tool}
**Error**: ${options.error}
`;

  if (options.parameters) {
    template += `
**Parameters Used**:
\`\`\`json
${JSON.stringify(options.parameters, null, 2)}
\`\`\`
`;
  }

  if (options.alternatives && options.alternatives.length > 0) {
    template += `
### Alternative Approaches
${options.alternatives.map(a => `- ${a}`).join('\n')}
`;
  }

  return template;
}

// =============================================================================
// Status Templates
// =============================================================================

/**
 * Template for progress report
 */
export function progressReport(options: {
  task: string;
  percentComplete: number;
  completed: string[];
  remaining: string[];
  blockers?: string[];
}): string {
  const bar = '█'.repeat(Math.floor(options.percentComplete / 5)) +
              '░'.repeat(20 - Math.floor(options.percentComplete / 5));

  let template = `
## Progress Report

**Task**: ${options.task}
**Progress**: [${bar}] ${options.percentComplete}%

### Completed
${options.completed.map(c => `- [x] ${c}`).join('\n')}

### Remaining
${options.remaining.map(r => `- [ ] ${r}`).join('\n')}
`;

  if (options.blockers && options.blockers.length > 0) {
    template += `
### Blockers
${options.blockers.map(b => `- [!] ${b}`).join('\n')}
`;
  }

  return template;
}

/**
 * Template for completion summary
 */
export function completionSummary(options: {
  task: string;
  success: boolean;
  outputs: string[];
  metrics?: { key: string; value: string }[];
  nextSteps?: string[];
}): string {
  const status = options.success ? '[OK] Completed Successfully' : '[!] Completed with Issues';

  let template = `
## Task Completion

**Task**: ${options.task}
**Status**: ${status}

### Outputs
${options.outputs.map(o => `- ${o}`).join('\n')}
`;

  if (options.metrics && options.metrics.length > 0) {
    template += `
### Metrics
${options.metrics.map(m => `- **${m.key}**: ${m.value}`).join('\n')}
`;
  }

  if (options.nextSteps && options.nextSteps.length > 0) {
    template += `
### Suggested Next Steps
${options.nextSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}
`;
  }

  return template;
}

// =============================================================================
// Context Templates
// =============================================================================

/**
 * Template for workspace context
 */
export function workspaceContext(options: {
  projectType?: string;
  languages?: string[];
  frameworks?: string[];
  structure?: string;
}): string {
  let template = `
## Workspace Context
`;

  if (options.projectType) {
    template += `**Project Type**: ${options.projectType}\n`;
  }

  if (options.languages && options.languages.length > 0) {
    template += `**Languages**: ${options.languages.join(', ')}\n`;
  }

  if (options.frameworks && options.frameworks.length > 0) {
    template += `**Frameworks**: ${options.frameworks.join(', ')}\n`;
  }

  if (options.structure) {
    template += `
### Structure
\`\`\`
${options.structure}
\`\`\`
`;
  }

  return template;
}

/**
 * Template for file context
 */
export function fileContext(options: {
  path: string;
  language?: string;
  summary?: string;
  relevantSections?: { lineRange: string; description: string }[];
}): string {
  let template = `
## File: ${options.path}
`;

  if (options.language) {
    template += `**Language**: ${options.language}\n`;
  }

  if (options.summary) {
    template += `
### Summary
${options.summary}
`;
  }

  if (options.relevantSections && options.relevantSections.length > 0) {
    template += `
### Relevant Sections
${options.relevantSections.map(s => `- **Lines ${s.lineRange}**: ${s.description}`).join('\n')}
`;
  }

  return template;
}

// =============================================================================
// Instruction Templates
// =============================================================================

/**
 * Template for step-by-step instructions
 */
export function stepByStepInstructions(options: {
  goal: string;
  steps: { action: string; details?: string }[];
  warnings?: string[];
}): string {
  let template = `
## Instructions

**Goal**: ${options.goal}

### Steps
${options.steps.map((s, i) => {
  let step = `${i + 1}. ${s.action}`;
  if (s.details) {
    step += `\n   ${s.details}`;
  }
  return step;
}).join('\n')}
`;

  if (options.warnings && options.warnings.length > 0) {
    template += `
### Warnings
${options.warnings.map(w => `[!] ${w}`).join('\n')}
`;
  }

  return template;
}

/**
 * Template for constraints and requirements
 */
export function constraintsAndRequirements(options: {
  mustDo: string[];
  mustNotDo: string[];
  preferences?: string[];
}): string {
  let template = `
## Requirements

### Must Do
${options.mustDo.map(r => `- [x] ${r}`).join('\n')}

### Must Not Do
${options.mustNotDo.map(r => `- [!] ${r}`).join('\n')}
`;

  if (options.preferences && options.preferences.length > 0) {
    template += `
### Preferences (if possible)
${options.preferences.map(p => `- [ ] ${p}`).join('\n')}
`;
  }

  return template;
}
