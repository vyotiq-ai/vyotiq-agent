/**
 * DeletePlan Tool
 * 
 * Deletes a task plan from the workspace.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import { getTaskManager } from './taskManager';

interface DeletePlanToolArgs {
  /** The plan ID or folder name to delete */
  planId: string;
  /** Optional: Confirm deletion (required for active plans) */
  confirmDelete?: boolean;
  [key: string]: unknown;
}

export const deletePlanTool: ToolDefinition<DeletePlanToolArgs> = {
  name: 'DeletePlan',
  description: `Delete a task plan from the workspace. Final cleanup step in the Plan-Do-Check-Act cycle.

## When to Use
- After VerifyTasks confirms all requirements are met
- To clean up completed plans and keep workspace organized
- To remove abandoned or obsolete plans
- When user explicitly requests plan deletion

## What It Does
- Permanently removes the plan folder from .vyotiq/
- Deletes all associated task data and metadata
- Cannot be undone - deletion is permanent

## Workflow Integration
This is the FINAL step in the Plan-Do-Check-Act cycle:
\`\`\`
GetActivePlan → Check for existing work
CreatePlan → Break down the request
TodoWrite → Update progress as you work
VerifyTasks → Confirm all requirements met
DeletePlan → CLEAN UP when done (YOU ARE HERE)
\`\`\`

## Safety Checks
- **Completed plans**: Delete directly without confirmation
- **Active plans**: Require \`confirmDelete: true\` to prevent accidental deletion
- **Non-existent plans**: Returns error with helpful message

## Parameters
- **planId** (required): The plan ID or folder name to delete
  - Can use full plan ID (e.g., 'plan-1234567890-abc123')
  - Can use folder name (e.g., 'add-dark-mode')
- **confirmDelete** (optional, default: false): Required for deleting active (incomplete) plans

## Decision Flow
\`\`\`
DeletePlan(planId)
  │
  ├─ Plan completed?
  │   └─ YES → Delete immediately
  │
  └─ Plan still active?
      ├─ confirmDelete: true → Delete (user confirmed)
      └─ confirmDelete: false → Error (prevent accident)
\`\`\`

## Important
- Always call VerifyTasks before DeletePlan to ensure work is complete
- Use ListPlans to find plan IDs if you don't have them
- Deletion is permanent - there is no undo
- Requires user approval (requiresApproval: true) as a destructive operation`,

  requiresApproval: true, // Requires user approval since it's destructive
  category: 'agent-internal',

  schema: {
    type: 'object',
    properties: {
      planId: {
        type: 'string',
        description: 'The plan ID or folder name to delete',
      },
      confirmDelete: {
        type: 'boolean',
        description: 'Required for deleting active (incomplete) plans',
        default: false,
      },
    },
    required: ['planId'],
  },

  inputExamples: [
    { planId: 'plan-1234567890-abc123' },
    { planId: 'plan-1234567890-abc123', confirmDelete: true },
  ],

  searchKeywords: ['delete', 'remove', 'plan', 'cleanup', 'clear'],
  riskLevel: 'moderate',
  allowedCallers: ['direct'],

  ui: {
    icon: 'Trash2',
    label: 'Delete Plan',
    color: 'text-[var(--color-error)]',
    runningLabel: 'Deleting plan',
    completedLabel: 'Plan deleted',
  },

  async execute(args: DeletePlanToolArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { planId, confirmDelete = false } = args;
    const { sessionId, logger, workspacePath } = context;

    if (!workspacePath) {
      return {
        toolName: 'DeletePlan',
        success: false,
        output: 'Error: No workspace path available.',
      };
    }

    if (!planId || planId.trim().length === 0) {
      return {
        toolName: 'DeletePlan',
        success: false,
        output: 'Error: planId is required.',
      };
    }

    try {
      const taskManager = getTaskManager();
      
      // Find the session by plan ID
      const session = await taskManager.getSessionByPlanId(workspacePath, planId.trim());
      
      if (!session) {
        // Try to find by folder name
        const sessions = await taskManager.listSessions(workspacePath);
        const byFolder = sessions.find(s => s.folderName === planId.trim());
        
        if (!byFolder) {
          return {
            toolName: 'DeletePlan',
            success: false,
            output: `Error: Plan not found with ID or folder name: ${planId}`,
          };
        }
        
        // Use the found session
        return await deletePlanSession(byFolder, confirmDelete, taskManager, workspacePath, logger, sessionId);
      }

      return await deletePlanSession(session, confirmDelete, taskManager, workspacePath, logger, sessionId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger?.error('Failed to delete plan', { error: errorMessage, sessionId, planId });

      return {
        toolName: 'DeletePlan',
        success: false,
        output: `Error deleting plan: ${errorMessage}`,
      };
    }
  },
};

/**
 * Helper to delete a plan session
 */
async function deletePlanSession(
  session: import('../../../../shared/types/todoTask').TaskSession,
  confirmDelete: boolean,
  taskManager: import('./taskManager').TaskManager,
  workspacePath: string,
  logger: import('../../types').ToolExecutionContext['logger'],
  sessionId: string | undefined
): Promise<ToolExecutionResult> {
  // Check if plan is active and requires confirmation
  if (!session.plan.isCompleted && !confirmDelete) {
    return {
      toolName: 'DeletePlan',
      success: false,
      output: `# Cannot Delete Active Plan

---

The plan **"${session.taskName}"** is still active and incomplete.

## Current Status

| Property | Value |
|----------|-------|
| **Plan ID** | \`${session.plan.id}\` |
| **Progress** | ${session.stats.completionPercentage}% (${session.stats.completed}/${session.stats.total} tasks) |
| **Location** | \`.vyotiq/${session.folderName}/\` |

---

## Options

1. **Complete the plan first:**
   - Use \`TodoWrite\` to finish remaining tasks
   - Use \`VerifyTasks\` to confirm completion
   - Then delete safely

2. **Force delete:**
   - Set \`confirmDelete: true\` to delete anyway
   - WARNING: This will permanently remove all task data`,
    };
  }

  // Delete the plan
  const deleted = await taskManager.deleteSession(workspacePath, session.folderName);

  if (!deleted) {
    return {
      toolName: 'DeletePlan',
      success: false,
      output: `# Delete Failed

Error: Failed to delete plan folder: \`.vyotiq/${session.folderName}/\``,
    };
  }

  logger?.info('Deleted task plan', {
    sessionId,
    planId: session.plan.id,
    taskName: session.taskName,
    folderName: session.folderName,
    wasCompleted: session.plan.isCompleted,
  });

  return {
    toolName: 'DeletePlan',
    success: true,
    output: `# Plan Deleted

---

Successfully removed plan: **"${session.taskName}"**

## Deleted Items

| Property | Value |
|----------|-------|
| **Plan ID** | \`${session.plan.id}\` |
| **Folder** | \`.vyotiq/${session.folderName}/\` |
| **Tasks** | ${session.stats.total} items |
| **Previous Status** | ${session.plan.isCompleted ? 'Completed' : 'Active'} |

---

*Workspace is now clean. Use \`CreatePlan\` to start a new task.*`,
    metadata: {
      planId: session.plan.id,
      taskName: session.taskName,
      folderName: session.folderName,
      wasCompleted: session.plan.isCompleted,
    },
  };
}
