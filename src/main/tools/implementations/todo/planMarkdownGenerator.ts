/**
 * Plan Markdown Generator
 * 
 * Generates beautiful, structured markdown files for task plans.
 * Creates properly formatted documents with architecture, design,
 * diagrams, and custom task list formats.
 */
import type { TaskSession, TaskItem, UserPlan, VerificationAttempt } from '../../../../shared/types/todoTask';

/**
 * Status icons for task display
 */
const STATUS_ICONS = {
  completed: '✅',
  in_progress: '🔄',
  pending: '⬜',
} as const;

/**
 * Priority indicators
 */
const PRIORITY_ICONS = ['🔴', '🟠', '🟡', '🟢', '🔵'] as const;

/**
 * Verification status icons
 */
const VERIFICATION_ICONS = {
  verified: '✓',
  failed: '✗',
  pending: '○',
} as const;

/**
 * Generate a progress bar using unicode characters
 */
function generateProgressBar(percentage: number, width = 20): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  const filledChar = '█';
  const emptyChar = '░';
  return `${filledChar.repeat(filled)}${emptyChar.repeat(empty)}`;
}

/**
 * Format a timestamp to a readable date string
 */
function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Calculate estimated complexity label
 */
function getComplexityLabel(complexity?: number): string {
  if (!complexity) return '';
  const labels = ['', 'Simple', 'Easy', 'Medium', 'Complex', 'Very Complex'];
  return labels[complexity] || '';
}

/**
 * Generate the plan header section
 */
function generateHeader(session: TaskSession): string {
  const status = session.plan.isCompleted ? '✅ Completed' : '🚀 In Progress';
  const progressBar = generateProgressBar(session.stats.completionPercentage);
  const progressColor = session.stats.completionPercentage === 100 ? '🟢' :
                        session.stats.completionPercentage >= 50 ? '🟡' : '🔴';
  
  return `# 📋 ${session.taskName}

<div align="center">

${progressColor} **${status}** ${progressColor}

\`\`\`
${progressBar} ${session.stats.completionPercentage}%
\`\`\`

</div>

---

## 📊 Overview

| Property | Value |
|----------|-------|
| **Plan ID** | \`${session.plan.id}\` |
| **Created** | ${formatTimestamp(session.createdAt)} |
| **Updated** | ${formatTimestamp(session.updatedAt)} |
| **Iterations** | ${session.iterationCount} |

| Status | Count | Percentage |
|--------|-------|------------|
| ✅ Completed | ${session.stats.completed} | ${session.stats.total > 0 ? Math.round((session.stats.completed / session.stats.total) * 100) : 0}% |
| 🔄 In Progress | ${session.stats.inProgress} | ${session.stats.total > 0 ? Math.round((session.stats.inProgress / session.stats.total) * 100) : 0}% |
| ⬜ Pending | ${session.stats.pending} | ${session.stats.total > 0 ? Math.round((session.stats.pending / session.stats.total) * 100) : 0}% |
| **Total** | **${session.stats.total}** | **100%** |

`;
}

/**
 * Generate the original request section
 */
function generateRequestSection(plan: UserPlan): string {
  return `---

## 📝 Original Request

${plan.originalRequest}

`;
}

/**
 * Generate the requirements section with checkmarks
 */
function generateRequirementsSection(plan: UserPlan, tasks: TaskItem[]): string {
  if (plan.requirements.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('---\n');
  lines.push('## 🎯 Requirements\n');
  lines.push('');

  for (let i = 0; i < plan.requirements.length; i++) {
    const req = plan.requirements[i];
    // Check if this requirement has a matching completed task
    const isAddressed = tasks.some(t => 
      t.status === 'completed' && 
      (t.content.toLowerCase().includes(req.toLowerCase().substring(0, 20)) ||
       req.toLowerCase().includes(t.content.toLowerCase().substring(0, 20)))
    );
    const icon = isAddressed ? '✅' : '⬜';
    lines.push(`- ${icon} **${i + 1}.** ${req}`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Generate a design approach section based on task analysis
 */
function generateDesignSection(session: TaskSession): string {
  const lines: string[] = [];
  lines.push('---\n');
  lines.push('## 💡 Design Approach\n');
  lines.push('');
  
  // Analyze task complexity
  const totalComplexity = session.tasks.reduce((sum, t) => sum + (t.complexity || 2), 0);
  const avgComplexity = session.tasks.length > 0 ? totalComplexity / session.tasks.length : 0;
  const complexityLabel = avgComplexity <= 1.5 ? 'Simple' : 
                          avgComplexity <= 2.5 ? 'Moderate' : 
                          avgComplexity <= 3.5 ? 'Complex' : 'Very Complex';
  
  // Estimate time based on task count and complexity
  const estimatedMinutes = session.tasks.length * (avgComplexity * 10);
  const estimatedTime = estimatedMinutes < 60 
    ? `${Math.round(estimatedMinutes)} minutes` 
    : `${(estimatedMinutes / 60).toFixed(1)} hours`;
  
  lines.push('| Aspect | Assessment |');
  lines.push('|--------|------------|');
  lines.push(`| **Overall Complexity** | ${complexityLabel} |`);
  lines.push(`| **Estimated Time** | ~${estimatedTime} |`);
  lines.push(`| **Task Count** | ${session.tasks.length} tasks |`);
  lines.push(`| **Dependencies** | ${session.tasks.filter(t => t.dependencies?.length).length} tasks with dependencies |`);
  lines.push('');
  
  // Strategy based on task types
  const hasMultipleFiles = session.tasks.some(t => (t.targetFiles?.length || 0) > 1);
  const hasDependencies = session.tasks.some(t => t.dependencies?.length);
  
  lines.push('### 📐 Implementation Strategy');
  lines.push('');
  
  if (hasDependencies) {
    lines.push('> ⚠️ **Sequential execution required** - Some tasks have dependencies');
    lines.push('> Complete dependent tasks before proceeding to the next.');
  } else if (hasMultipleFiles) {
    lines.push('> 📁 **Multi-file changes** - This plan involves changes across multiple files.');
    lines.push('> Consider testing incrementally after each major change.');
  } else {
    lines.push('> ✨ **Independent tasks** - Tasks can be completed in any order.');
    lines.push('> Focus on one task at a time for best results.');
  }
  
  lines.push('');
  return lines.join('\n');
}

/**
 * Generate the architecture section (auto-generated based on task analysis)
 */
function generateArchitectureSection(session: TaskSession): string {
  // Extract file references from tasks to build architecture overview
  const fileReferences = new Set<string>();
  const directories = new Set<string>();

  for (const task of session.tasks) {
    if (task.targetFiles) {
      for (const file of task.targetFiles) {
        fileReferences.add(file);
        // Extract directory
        const parts = file.split('/');
        if (parts.length > 1) {
          directories.add(parts.slice(0, -1).join('/'));
        }
      }
    }
  }

  if (fileReferences.size === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('---\n');
  lines.push('## 🏗️ Architecture Overview\n');
  lines.push('');
  lines.push('### Affected Directories\n');
  lines.push('');
  lines.push('```');
  
  // Sort directories and display as tree-like structure
  const sortedDirs = Array.from(directories).sort();
  for (const dir of sortedDirs) {
    lines.push(`📁 ${dir}/`);
  }
  
  lines.push('```\n');
  
  lines.push('### Target Files\n');
  lines.push('');
  
  // Group files by their task status
  const filesByStatus: Record<string, string[]> = {
    completed: [],
    in_progress: [],
    pending: [],
  };

  for (const task of session.tasks) {
    if (task.targetFiles) {
      for (const file of task.targetFiles) {
        if (!filesByStatus[task.status].includes(file)) {
          filesByStatus[task.status].push(file);
        }
      }
    }
  }

  if (filesByStatus.completed.length > 0) {
    lines.push('**Modified Files (Completed):**');
    for (const file of filesByStatus.completed) {
      lines.push(`- ✅ \`${file}\``);
    }
    lines.push('');
  }

  if (filesByStatus.in_progress.length > 0) {
    lines.push('**Files In Progress:**');
    for (const file of filesByStatus.in_progress) {
      lines.push(`- 🔄 \`${file}\``);
    }
    lines.push('');
  }

  if (filesByStatus.pending.length > 0) {
    lines.push('**Pending Files:**');
    for (const file of filesByStatus.pending) {
      lines.push(`- ⬜ \`${file}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate a single task item in custom format
 */
function generateTaskItem(task: TaskItem, index: number): string {
  const statusIcon = STATUS_ICONS[task.status];
  const priorityIcon = task.priority ? PRIORITY_ICONS[Math.min(task.priority - 1, 4)] : '';
  const complexityLabel = getComplexityLabel(task.complexity);
  const verificationIcon = task.verificationStatus ? ` ${VERIFICATION_ICONS[task.verificationStatus]}` : '';
  
  const lines: string[] = [];
  
  // Task header with custom checkbox-like format
  lines.push(`### ${statusIcon} Task ${index + 1}: ${task.content}${verificationIcon}`);
  lines.push('');
  
  // Task metadata table
  const metadata: string[] = [];
  metadata.push(`| Property | Value |`);
  metadata.push(`|----------|-------|`);
  metadata.push(`| **ID** | \`${task.id}\` |`);
  metadata.push(`| **Status** | ${task.status} |`);
  
  if (priorityIcon) {
    metadata.push(`| **Priority** | ${priorityIcon} ${task.priority} |`);
  }
  if (complexityLabel) {
    metadata.push(`| **Complexity** | ${complexityLabel} |`);
  }
  if (task.timeSpentMs) {
    const minutes = Math.round(task.timeSpentMs / 60000);
    metadata.push(`| **Time Spent** | ${minutes} min |`);
  }
  
  lines.push(metadata.join('\n'));
  lines.push('');
  
  // Description
  if (task.description) {
    lines.push('**Description:**');
    lines.push(`> ${task.description}`);
    lines.push('');
  }
  
  // Target files
  if (task.targetFiles && task.targetFiles.length > 0) {
    lines.push('**Target Files:**');
    for (const file of task.targetFiles) {
      lines.push(`- \`${file}\``);
    }
    lines.push('');
  }
  
  // Modified files
  if (task.modifiedFiles && task.modifiedFiles.length > 0) {
    lines.push('**Modified Files:**');
    for (const file of task.modifiedFiles) {
      lines.push(`- ✅ \`${file}\``);
    }
    lines.push('');
  }
  
  // Dependencies
  if (task.dependencies && task.dependencies.length > 0) {
    lines.push('**Dependencies:**');
    lines.push(`Depends on: ${task.dependencies.map(d => `\`${d}\``).join(', ')}`);
    lines.push('');
  }
  
  // Error if any
  if (task.error) {
    lines.push('**⚠️ Error:**');
    lines.push('```');
    lines.push(task.error);
    lines.push('```');
    lines.push('');
  }
  
  // Subtasks
  if (task.subtasks && task.subtasks.length > 0) {
    lines.push('**Subtasks:**');
    for (const subtask of task.subtasks) {
      const subIcon = STATUS_ICONS[subtask.status];
      lines.push(`  - ${subIcon} ${subtask.content}`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Generate the task list section with custom formatting
 */
function generateTaskListSection(tasks: TaskItem[]): string {
  if (tasks.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('---\n');
  lines.push('## 📋 Task List\n');
  lines.push('');
  
  // Quick overview with custom checkbox format
  lines.push('### Quick Overview\n');
  lines.push('');
  
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const statusIcon = STATUS_ICONS[task.status];
    const statusText = task.status === 'completed' ? '~~' + task.content + '~~' : task.content;
    lines.push(`${i + 1}. ${statusIcon} ${statusText}`);
  }
  
  lines.push('');
  lines.push('### Detailed Tasks\n');
  lines.push('');
  
  // Group tasks by status
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const pending = tasks.filter(t => t.status === 'pending');
  const completed = tasks.filter(t => t.status === 'completed');
  
  // In Progress first
  if (inProgress.length > 0) {
    lines.push('#### 🔄 In Progress\n');
    for (let i = 0; i < inProgress.length; i++) {
      lines.push(generateTaskItem(inProgress[i], tasks.indexOf(inProgress[i])));
    }
  }
  
  // Pending next
  if (pending.length > 0) {
    lines.push('#### ⬜ Pending\n');
    for (let i = 0; i < pending.length; i++) {
      lines.push(generateTaskItem(pending[i], tasks.indexOf(pending[i])));
    }
  }
  
  // Completed last
  if (completed.length > 0) {
    lines.push('#### ✅ Completed\n');
    for (let i = 0; i < completed.length; i++) {
      lines.push(generateTaskItem(completed[i], tasks.indexOf(completed[i])));
    }
  }
  
  return lines.join('\n');
}

/**
 * Generate the verification history section
 */
function generateVerificationHistorySection(history: VerificationAttempt[]): string {
  if (history.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('---\n');
  lines.push('## 🔍 Verification History\n');
  lines.push('');
  
  for (let i = 0; i < history.length; i++) {
    const attempt = history[i];
    const resultIcon = attempt.result === 'success' ? '✅' : attempt.result === 'partial' ? '🟡' : '❌';
    
    lines.push(`### Attempt ${i + 1} ${resultIcon}\n`);
    lines.push('');
    lines.push(`| Property | Value |`);
    lines.push(`|----------|-------|`);
    lines.push(`| **Time** | ${formatTimestamp(attempt.timestamp)} |`);
    lines.push(`| **Result** | ${attempt.result} |`);
    lines.push(`| **Passed** | ${attempt.passedTasks.length} tasks |`);
    lines.push(`| **Failed** | ${attempt.failedTasks.length} tasks |`);
    
    if (attempt.newTasksCreated.length > 0) {
      lines.push(`| **New Tasks** | ${attempt.newTasksCreated.length} |`);
    }
    
    lines.push('');
    
    if (attempt.notes) {
      lines.push(`> ${attempt.notes}`);
      lines.push('');
    }
    
    if (attempt.passedTasks.length > 0) {
      lines.push('**Passed Tasks:**');
      for (const taskId of attempt.passedTasks) {
        lines.push(`- ✅ \`${taskId}\``);
      }
      lines.push('');
    }
    
    if (attempt.failedTasks.length > 0) {
      lines.push('**Failed Tasks:**');
      for (const taskId of attempt.failedTasks) {
        lines.push(`- ❌ \`${taskId}\``);
      }
      lines.push('');
    }
  }
  
  return lines.join('\n');
}

/**
 * Generate a simple workflow diagram using ASCII/Unicode
 */
function generateWorkflowDiagram(tasks: TaskItem[]): string {
  if (tasks.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('---\n');
  lines.push('## 📈 Workflow Diagram\n');
  lines.push('');
  lines.push('```mermaid');
  lines.push('flowchart TD');
  lines.push('    START([🚀 Start]) --> T1');
  
  // Generate task nodes
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const nodeId = `T${i + 1}`;
    const nextNodeId = i < tasks.length - 1 ? `T${i + 2}` : 'VERIFY';
    const statusEmoji = task.status === 'completed' ? '✅' : 
                        task.status === 'in_progress' ? '🔄' : '⬜';
    const truncatedContent = task.content.length > 30 
      ? task.content.substring(0, 27) + '...' 
      : task.content;
    
    lines.push(`    ${nodeId}["${statusEmoji} ${truncatedContent}"] --> ${nextNodeId}`);
  }
  
  lines.push('    VERIFY{{"🔍 Verify"}} --> |Pass| DONE([✅ Complete])');
  lines.push('    VERIFY --> |Fail| T1');
  lines.push('```');
  lines.push('');
  
  // Also include ASCII fallback
  lines.push('<details>');
  lines.push('<summary>📊 ASCII Flow (if Mermaid not supported)</summary>');
  lines.push('');
  lines.push('```');
  lines.push('┌─────────────────────────────────────────┐');
  lines.push('│              🚀 START                   │');
  lines.push('└────────────────────┬────────────────────┘');
  lines.push('                     │');
  
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const statusIcon = task.status === 'completed' ? '✓' : 
                       task.status === 'in_progress' ? '→' : ' ';
    const truncatedContent = task.content.length > 35 
      ? task.content.substring(0, 32) + '...' 
      : task.content.padEnd(35);
    
    lines.push('                     ▼');
    lines.push('┌─────────────────────────────────────────┐');
    lines.push(`│ [${statusIcon}] ${truncatedContent} │`);
    lines.push('└────────────────────┬────────────────────┘');
    lines.push('                     │');
  }
  
  lines.push('                     ▼');
  lines.push('┌─────────────────────────────────────────┐');
  lines.push('│            🔍 VERIFICATION              │');
  lines.push('└────────────────────┬────────────────────┘');
  lines.push('                     │');
  lines.push('          ┌──────────┴──────────┐');
  lines.push('          ▼                     ▼');
  lines.push('    ┌──────────┐          ┌──────────┐');
  lines.push('    │ ✅ DONE  │          │ 🔄 RETRY │');
  lines.push('    └──────────┘          └──────────┘');
  lines.push('```');
  lines.push('</details>');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Generate the footer section
 */
function generateFooter(session: TaskSession): string {
  const lines: string[] = [];
  lines.push('---\n');
  lines.push('## 📌 Quick Reference\n');
  lines.push('');
  lines.push('| Command | Description |');
  lines.push('|---------|-------------|');
  lines.push(`| \`TodoWrite planId="${session.plan.id}"\` | Update task statuses |`);
  lines.push('| `VerifyTasks` | Check if all requirements are met |');
  lines.push('| `GetActivePlan` | View current progress |');
  lines.push('| `DeletePlan` | Clean up when finished |');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`> 📁 **Storage:** \`.vyotiq/${session.folderName}/\``);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`*Generated by Vyotiq Agent • ${formatTimestamp(Date.now())}*`);
  
  return lines.join('\n');
}

/**
 * Generate a complete markdown plan document
 */
export function generatePlanMarkdown(session: TaskSession): string {
  const sections: string[] = [];
  
  // Header with progress overview
  sections.push(generateHeader(session));
  
  // Original request
  sections.push(generateRequestSection(session.plan));
  
  // Requirements with status
  sections.push(generateRequirementsSection(session.plan, session.tasks));
  
  // Design approach section
  sections.push(generateDesignSection(session));
  
  // Architecture overview (if applicable)
  sections.push(generateArchitectureSection(session));
  
  // Workflow diagram
  sections.push(generateWorkflowDiagram(session.tasks));
  
  // Detailed task list
  sections.push(generateTaskListSection(session.tasks));
  
  // Verification history
  sections.push(generateVerificationHistorySection(session.verificationHistory));
  
  // Footer
  sections.push(generateFooter(session));
  
  return sections.filter(s => s.length > 0).join('\n');
}

/**
 * Generate a compact task list markdown (for quick overview)
 */
export function generateTaskListMarkdown(tasks: TaskItem[]): string {
  if (tasks.length === 0) {
    return 'No tasks available.';
  }

  const lines: string[] = [];
  lines.push('# 📋 Task List\n');
  lines.push('');
  
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const statusIcon = STATUS_ICONS[task.status];
    const statusText = task.status === 'completed' ? '~~' + task.content + '~~' : task.content;
    lines.push(`${i + 1}. ${statusIcon} ${statusText}`);
    
    if (task.description) {
      lines.push(`   > ${task.description}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Generate a summary markdown for quick display
 */
export function generatePlanSummaryMarkdown(session: TaskSession): string {
  const progressBar = generateProgressBar(session.stats.completionPercentage, 15);
  
  const lines: string[] = [];
  lines.push(`## 📋 ${session.taskName}`);
  lines.push('');
  lines.push(`\`${progressBar}\` **${session.stats.completionPercentage}%**`);
  lines.push('');
  lines.push(`✅ ${session.stats.completed} done • 🔄 ${session.stats.inProgress} active • ⬜ ${session.stats.pending} pending`);
  lines.push('');
  lines.push('**Tasks:**');
  
  for (const task of session.tasks) {
    const icon = STATUS_ICONS[task.status];
    lines.push(`- ${icon} ${task.content}`);
  }
  
  return lines.join('\n');
}
