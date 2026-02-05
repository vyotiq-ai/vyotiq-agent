/**
 * GetActivePlan Tool
 * 
 * Retrieves the currently active task plan for the workspace.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import type { TaskSession } from '../../../../shared/types/todoTask';
import { getTaskManager } from './taskManager';
import { STATUS_ICONS, generateProgressBar, calculatePercentage } from './formatUtils';

interface GetActivePlanToolArgs {
  /** Optional: Include full task details (default: true) */
  includeDetails?: boolean;
  [key: string]: unknown;
}

/**
 * Format active plan for output with beautiful markdown
 */
function formatActivePlanOutput(session: TaskSession | null, includeDetails: boolean): string {
  if (!session) {
    return `# No Active Plan

---

No active task plan found in this workspace.

## Create a New Plan

To create a new plan, use \`CreatePlan\` with:

| Parameter | Description |
|-----------|-------------|
| **userRequest** | The user's original request |
| **taskName** | A short name for the task (e.g., "add-dark-mode") |

---

*Use \`ListPlans\` to see all existing plans in this workspace.*`;
  }

  const lines: string[] = [];
  const progressBar = generateProgressBar(session.stats.completionPercentage);
  const isComplete = session.stats.completionPercentage === 100;
  const statusLabel = isComplete ? 'Completed' : session.stats.inProgress > 0 ? 'In Progress' : 'Active';
  const progressStatus = isComplete ? 'DONE' : session.stats.completionPercentage >= 50 ? 'PROGRESS' : 'STARTED';
  
  // Header with centered progress
  lines.push(`# Active Plan: ${session.taskName}`);
  lines.push('');
  lines.push('<div align="center">');
  lines.push('');
  lines.push(`**${statusLabel}** | ${progressStatus}`);
  lines.push('');
  lines.push('```');
  lines.push(`${progressBar} ${session.stats.completionPercentage}%`);
  lines.push('```');
  lines.push('');
  lines.push('</div>');
  lines.push('');
  lines.push('---');
  lines.push('');
  
  // Stats overview table
  lines.push('## Overview');
  lines.push('');
  lines.push(`| Property | Value |`);
  lines.push(`|----------|-------|`);
  lines.push(`| **Plan ID** | \`${session.plan.id}\` |`);
  lines.push(`| **Location** | \`.vyotiq/${session.folderName}/\` |`);
  lines.push(`| **Iterations** | ${session.iterationCount} |`);
  lines.push('');
  lines.push('| Status | Count | Percentage |');
  lines.push('|--------|-------|------------|');
  lines.push(`| Completed | ${session.stats.completed} | ${calculatePercentage(session.stats.completed, session.stats.total)}% |`);
  lines.push(`| In Progress | ${session.stats.inProgress} | ${calculatePercentage(session.stats.inProgress, session.stats.total)}% |`);
  lines.push(`| Pending | ${session.stats.pending} | ${calculatePercentage(session.stats.pending, session.stats.total)}% |`);
  lines.push(`| **Total** | **${session.stats.total}** | **100%** |`);
  lines.push('');

  if (includeDetails) {
    lines.push('---');
    lines.push('');
    lines.push('## Original Request');
    lines.push('');
    const truncatedRequest = session.plan.originalRequest.length > 400 
      ? session.plan.originalRequest.substring(0, 400) + '...' 
      : session.plan.originalRequest;
    lines.push(`> ${truncatedRequest}`);
    lines.push('');

    lines.push('---');
    lines.push('');
    lines.push('## Current Tasks');
    lines.push('');
    
    // Group tasks by status
    const inProgress = session.tasks.filter(t => t.status === 'in_progress');
    const pending = session.tasks.filter(t => t.status === 'pending');
    const completed = session.tasks.filter(t => t.status === 'completed');
    
    if (inProgress.length > 0) {
      lines.push('### In Progress');
      lines.push('');
      for (const task of inProgress) {
        lines.push(`- ${STATUS_ICONS.in_progress} **${task.content}**`);
        lines.push(`  - ID: \`${task.id}\``);
      }
      lines.push('');
    }
    
    if (pending.length > 0) {
      lines.push('### Pending');
      lines.push('');
      for (const task of pending) {
        lines.push(`- ${STATUS_ICONS.pending} ${task.content}`);
        lines.push(`  - ID: \`${task.id}\``);
      }
      lines.push('');
    }
    
    if (completed.length > 0) {
      lines.push('### Completed');
      lines.push('');
      for (const task of completed) {
        lines.push(`- ${STATUS_ICONS.completed} ~~${task.content}~~`);
        lines.push(`  - ID: \`${task.id}\``);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('## Quick Reference');
  lines.push('');
  lines.push('| Command | Description |');
  lines.push('|---------|-------------|');
  lines.push(`| \`TodoWrite planId="${session.plan.id}"\` | Update task statuses |`);
  lines.push('| `VerifyTasks` | Check if all requirements are met |');
  lines.push('| `DeletePlan` | Clean up when finished |');
  lines.push('');
  
  if (isComplete) {
    lines.push('> **All tasks complete!** Run `VerifyTasks` to confirm requirements are met.');
  } else if (session.stats.inProgress > 0) {
    lines.push(`> **${session.stats.inProgress} task(s) in progress.** Continue working and update with \`TodoWrite\`.`);
  } else {
    lines.push(`> **Ready to start!** Use \`TodoWrite\` to mark tasks as in progress.`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`> **Plan file:** \`.vyotiq/${session.folderName}/plan.md\``);

  return lines.join('\n');
}

export const getActivePlanTool: ToolDefinition<GetActivePlanToolArgs> = {
  name: 'GetActivePlan',
  description: `Retrieve the currently active task plan for this workspace. Essential first step in the Plan-Do-Check-Act cycle.

## When to Use
- **ALWAYS at session START** - Check for existing work before doing anything else
- Before calling CreatePlan - Avoid creating duplicate plans
- To get plan ID for TodoWrite updates
- When resuming work after interruption
- To check current progress on ongoing tasks

## What It Returns
- **Plan ID**: Required for TodoWrite and VerifyTasks
- **Original Request**: The user's initial task description
- **Current Tasks**: All tasks with their statuses (pending/in_progress/completed)
- **Progress Statistics**: Completion percentage, task counts
- **Location**: Path to plan storage (.vyotiq/{taskName}/)

## Workflow Integration
This is the FIRST step in the Plan-Do-Check-Act cycle:
\`\`\`
GetActivePlan → CHECK for existing work (YOU ARE HERE)
  ├─ If plan exists → Resume work, use TodoWrite to update
  └─ If no plan → CreatePlan to start new task
TodoWrite → Update progress as you work
VerifyTasks → Confirm all requirements met
DeletePlan → Clean up when done
\`\`\`

## Decision Flow
\`\`\`
GetActivePlan
  │
  ├─ Has active plan?
  │   ├─ YES → Read tasks, continue from where you left off
  │   │        Use returned planId with TodoWrite
  │   │
  │   └─ NO → Safe to call CreatePlan for new task
  │
  └─ Plan 100% complete?
      └─ YES → Call VerifyTasks to confirm, then DeletePlan
\`\`\`

## Parameters
- **includeDetails** (optional, default: true): Include full task list and original request

## Important
- Call this BEFORE CreatePlan to avoid duplicate plans 
- The returned planId is required for all other task management tools
- Plans persist across sessions in .vyotiq/ directory
- If no active plan exists, output includes guidance on creating one`,

  requiresApproval: false,
  category: 'agent-internal',

  schema: {
    type: 'object',
    properties: {
      includeDetails: {
        type: 'boolean',
        description: 'Whether to include full task details (default: true)',
        default: true,
      },
    },
    required: [],
  },

  inputExamples: [
    {},
    { includeDetails: false },
  ],

  searchKeywords: ['active', 'current', 'plan', 'resume', 'progress', 'status'],
  riskLevel: 'safe',
  allowedCallers: ['direct', 'code_execution'],

  ui: {
    icon: 'FileSearch',
    label: 'Get Active Plan',
    color: 'text-[var(--color-accent-secondary)]',
    runningLabel: 'Finding active plan',
    completedLabel: 'Plan retrieved',
  },

  async execute(args: GetActivePlanToolArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { includeDetails = true } = args;
    const { sessionId, logger, workspacePath } = context;

    if (!workspacePath) {
      return {
        toolName: 'GetActivePlan',
        success: false,
        output: 'Error: No workspace path available.',
      };
    }

    try {
      const taskManager = getTaskManager();
      const session = await taskManager.getActiveSession(workspacePath);

      logger?.info('Retrieved active plan', {
        sessionId,
        workspacePath,
        hasActivePlan: !!session,
        planId: session?.plan.id,
        progress: session?.stats.completionPercentage,
      });

      const output = formatActivePlanOutput(session, includeDetails);

      return {
        toolName: 'GetActivePlan',
        success: true,
        output,
        metadata: session ? {
          planId: session.plan.id,
          sessionId: session.id,
          folderName: session.folderName,
          taskCount: session.tasks.length,
          completionPercentage: session.stats.completionPercentage,
          isCompleted: session.plan.isCompleted,
        } : {
          hasActivePlan: false,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger?.error('Failed to get active plan', { error: errorMessage, sessionId, workspacePath });

      return {
        toolName: 'GetActivePlan',
        success: false,
        output: `Error getting active plan: ${errorMessage}`,
      };
    }
  },
};
