/**
 * ListPlans Tool
 * 
 * Lists all task plans in the workspace.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import type { TaskSession } from '../../../../shared/types/todoTask';
import { getTaskManager } from './taskManager';
import { generateProgressBar, formatShortDate } from './formatUtils';

interface ListPlansToolArgs {
  /** Optional: Filter by completion status */
  status?: 'all' | 'active' | 'completed';
  /** Optional: Maximum number of plans to return */
  limit?: number;
  [key: string]: unknown;
}

/**
 * Format plan list for output with beautiful markdown
 */
function formatPlanListOutput(sessions: TaskSession[], status: string): string {
  if (sessions.length === 0) {
    return `# Task Plans

---

No ${status === 'all' ? '' : status + ' '}task plans found in this workspace.

## Create a New Plan

To create a new plan, use \`CreatePlan\` with:

| Parameter | Description |
|-----------|-------------|
| **userRequest** | The user's original request |
| **taskName** | A short name for the task |`;
  }

  const lines: string[] = [];
  const activeCount = sessions.filter(s => !s.plan.isCompleted).length;
  const completedCount = sessions.filter(s => s.plan.isCompleted).length;
  
  lines.push(`# Task Plans`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Status | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Active | ${activeCount} |`);
  lines.push(`| Completed | ${completedCount} |`);
  lines.push(`| **Total** | **${sessions.length}** |`);
  lines.push('');
  
  lines.push('---');
  lines.push('');
  lines.push('## Plans');
  lines.push('');

  // Active plans first
  const activePlans = sessions.filter(s => !s.plan.isCompleted);
  const completedPlans = sessions.filter(s => s.plan.isCompleted);

  if (activePlans.length > 0 && (status === 'all' || status === 'active')) {
    lines.push('### Active Plans');
    lines.push('');
    lines.push('| Plan | Progress | Tasks | Created | Plan ID |');
    lines.push('|------|----------|-------|---------|---------|');
    
    for (const session of activePlans) {
      const progressBar = generateProgressBar(session.stats.completionPercentage);
      lines.push(`| **${session.taskName}** | \`${progressBar}\` ${session.stats.completionPercentage}% | ${session.stats.completed}/${session.stats.total} | ${formatShortDate(session.createdAt)} | \`${session.plan.id.substring(0, 15)}...\` |`);
    }
    lines.push('');
  }

  if (completedPlans.length > 0 && (status === 'all' || status === 'completed')) {
    lines.push('### Completed Plans');
    lines.push('');
    lines.push('| Plan | Tasks | Created | Location |');
    lines.push('|------|-------|---------|----------|');
    
    for (const session of completedPlans) {
      lines.push(`| ~~${session.taskName}~~ | ${session.stats.total} | ${formatShortDate(session.createdAt)} | \`.vyotiq/${session.folderName}/\` |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Actions');
  lines.push('');
  lines.push('| Command | Description |');
  lines.push('|---------|-------------|');
  lines.push('| `GetActivePlan` | Get details of the most recent active plan |');
  lines.push('| `DeletePlan` | Remove completed or abandoned plans |');
  lines.push('| `CreatePlan` | Create a new task plan |');

  return lines.join('\n');
}

export const listPlansTool: ToolDefinition<ListPlansToolArgs> = {
  name: 'ListPlans',
  description: `List all task plans in the workspace with their status, progress, and metadata.

## When to Use
- To see all existing plans (active and completed)
- To find a specific plan ID for resuming work
- Before cleanup to identify completed plans for deletion
- To review task history and past work
- When user asks about previous tasks or work done

## What It Returns
For each plan:
- **Plan ID**: Unique identifier for use with other tools
- **Task Name**: Human-readable name
- **Status**: Active (in progress) or Completed
- **Progress**: Completion percentage and task counts
- **Location**: Storage path (.vyotiq/{taskName}/)
- **Created Date**: When the plan was created

## Workflow Integration
Use ListPlans for discovery and cleanup:
\`\`\`
ListPlans → See all plans in workspace
  │
  ├─ Find active plans → GetActivePlan for details
  │                      Resume work with TodoWrite
  │
  └─ Find completed plans → DeletePlan to clean up
                            Keep workspace organized
\`\`\`

## Parameters
- **status** (optional, default: 'all'): Filter by plan status
  - 'all': Show all plans
  - 'active': Only incomplete plans
  - 'completed': Only finished plans
- **limit** (optional, default: 20): Maximum number of plans to return

## Use Cases
1. **Resume work**: \`ListPlans status="active"\` → find ongoing tasks
2. **Cleanup**: \`ListPlans status="completed"\` → find plans to delete
3. **History**: \`ListPlans\` → see all past and current work

## Important
- Plans are sorted by most recent first
- Use GetActivePlan for detailed view of the current active plan
- Completed plans should be cleaned up with DeletePlan to keep workspace tidy`,

  requiresApproval: false,
  category: 'agent-internal',

  schema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['all', 'active', 'completed'],
        description: 'Filter plans by status (default: all)',
        default: 'all',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of plans to return (default: 20)',
        default: 20,
      },
    },
    required: [],
  },

  inputExamples: [
    {},
    { status: 'active' },
    { status: 'completed', limit: 5 },
  ],

  searchKeywords: ['list', 'plans', 'tasks', 'history', 'all', 'show'],
  riskLevel: 'safe',

  ui: {
    icon: 'List',
    label: 'List Plans',
    color: 'text-[var(--color-text-secondary)]',
    runningLabel: 'Listing plans',
    completedLabel: 'Plans listed',
  },

  async execute(args: ListPlansToolArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { status = 'all', limit = 20 } = args;
    const { sessionId, logger, workspacePath } = context;

    if (!workspacePath) {
      return {
        toolName: 'ListPlans',
        success: false,
        output: 'Error: No workspace path available.',
      };
    }

    try {
      const taskManager = getTaskManager();
      let sessions = await taskManager.listSessions(workspacePath);

      // Filter by status
      if (status === 'active') {
        sessions = sessions.filter(s => !s.plan.isCompleted);
      } else if (status === 'completed') {
        sessions = sessions.filter(s => s.plan.isCompleted);
      }

      // Apply limit
      sessions = sessions.slice(0, limit);

      logger?.info('Listed task plans', {
        sessionId,
        workspacePath,
        totalPlans: sessions.length,
        status,
      });

      const output = formatPlanListOutput(sessions, status);

      return {
        toolName: 'ListPlans',
        success: true,
        output,
        metadata: {
          planCount: sessions.length,
          status,
          plans: sessions.map(s => ({
            id: s.plan.id,
            name: s.taskName,
            isCompleted: s.plan.isCompleted,
            completionPercentage: s.stats.completionPercentage,
          })),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger?.error('Failed to list plans', { error: errorMessage, sessionId, workspacePath });

      return {
        toolName: 'ListPlans',
        success: false,
        output: `Error listing plans: ${errorMessage}`,
      };
    }
  },
};
