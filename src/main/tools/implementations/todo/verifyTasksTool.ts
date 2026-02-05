/**
 * VerifyTasks Tool
 * 
 * Verifies completed tasks against the original user plan.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import type { VerificationResult } from '../../../../shared/types/todoTask';
import { getTaskManager } from './taskManager';
import { generateProgressBar, getProgressColor } from './formatUtils';

interface VerifyTasksToolArgs {
  /** The plan ID to verify (from CreatePlan) */
  planId: string;
  /** Optional: Specific task IDs to verify (verifies all if not provided) */
  taskIds?: string[];
  [key: string]: unknown;
}

/**
 * Format verification result for output with beautiful markdown
 */
function formatVerificationOutput(result: VerificationResult, planId: string): string {
  const lines: string[] = [];
  const progressBar = generateProgressBar(result.completionPercentage);
  
  const statusLabel = result.success ? '[PASS] Verification Passed' : (result.completionPercentage > 50 ? '[WARN] Verification Incomplete' : '[FAIL] Verification Incomplete');
  const progressStatus = getProgressColor(result.completionPercentage);
  
  // Header with centered progress
  lines.push(`# ${statusLabel}`);
  lines.push('');
  lines.push('<div align="center">');
  lines.push('');
  lines.push(`**${result.completionPercentage}% Complete** | ${progressStatus}`);
  lines.push('');
  lines.push('```');
  lines.push(`${progressBar} ${result.completionPercentage}%`);
  lines.push('```');
  lines.push('');
  lines.push('</div>');
  lines.push('');
  lines.push('---');
  lines.push('');
  
  // Summary stats table
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| **Plan ID** | \`${planId}\` |`);
  lines.push(`| **Status** | ${result.success ? 'PASSED' : 'INCOMPLETE'} |`);
  lines.push(`| **Passed Tasks** | ${result.passedTasks.length} |`);
  lines.push(`| **Failed Tasks** | ${result.failedTasks.length} |`);
  lines.push(`| **Unmet Requirements** | ${result.unmetRequirements.length} |`);
  lines.push('');

  if (result.passedTasks.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Completed Tasks');
    lines.push('');
    for (const task of result.passedTasks) {
      lines.push(`- [x] ~~${task.content}~~`);
      if (task.description) {
        lines.push(`  > ${task.description}`);
      }
    }
    lines.push('');
  }

  if (result.failedTasks.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Incomplete Tasks');
    lines.push('');
    for (const task of result.failedTasks) {
      const statusIcon = task.status === 'in_progress' ? '[~]' : '[ ]';
      const statusText = task.status === 'in_progress' ? '(in progress)' : '(not started)';
      lines.push(`- ${statusIcon} **${task.content}** ${statusText}`);
      lines.push(`  - ID: \`${task.id}\``);
    }
    lines.push('');
  }

  if (result.unmetRequirements.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Unmet Requirements');
    lines.push('');
    lines.push('The following requirements from the original plan have not been addressed:');
    lines.push('');
    for (let i = 0; i < result.unmetRequirements.length; i++) {
      lines.push(`${i + 1}. [ ] ${result.unmetRequirements[i]}`);
    }
    lines.push('');
  }

  if (!result.success && result.suggestedTasks.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Suggested Next Tasks');
    lines.push('');
    lines.push('To complete the plan, consider adding these tasks:');
    lines.push('');
    for (let i = 0; i < result.suggestedTasks.length; i++) {
      const suggestion = result.suggestedTasks[i];
      lines.push(`### ${i + 1}. ${suggestion.content}`);
      lines.push('');
      if (suggestion.description) {
        lines.push(`> ${suggestion.description}`);
        lines.push('');
      }
      if (suggestion.targetFiles && suggestion.targetFiles.length > 0) {
        lines.push('**Target Files:**');
        for (const file of suggestion.targetFiles) {
          lines.push(`- \`${file}\``);
        }
        lines.push('');
      }
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('## Quick Reference');
  lines.push('');
  lines.push('| Command | Description |');
  lines.push('|---------|-------------|');
  lines.push(`| \`TodoWrite planId="${planId}"\` | Update task statuses |`);
  lines.push('| `VerifyTasks` | Run verification again |');
  lines.push('| `DeletePlan` | Clean up when finished |');
  lines.push('');
  
  if (result.success) {
    lines.push('> **All requirements met!** The task is complete.');
    lines.push('>');
    lines.push('> Use `DeletePlan` to clean up the plan files and report completion to the user.');
  } else {
    lines.push('> **Plan incomplete.** Address the failed tasks and unmet requirements above.');
    lines.push('>');
    lines.push('> Use `TodoWrite` to update task statuses, then run `VerifyTasks` again.');
  }

  return lines.join('\n');
}

export const verifyTasksTool: ToolDefinition<VerifyTasksToolArgs> = {
  name: 'VerifyTasks',
  description: `Verify completed tasks against the original plan requirements.

## When to Use
- After completing all tasks in a plan
- Before considering work done
- To check if anything was missed
- As the final step before reporting completion to user

## What It Returns
- **success**: true if ALL requirements are met
- **completionPercentage**: How much of the plan is done
- **passedTasks**: Tasks that are completed
- **failedTasks**: Tasks that are incomplete
- **unmetRequirements**: Original requirements not addressed
- **suggestedTasks**: Tasks to create to address gaps

## Workflow Integration
This is the CHECK step in Plan-Do-Check-Act:
\`\`\`
CreatePlan → break down request
TodoWrite → update progress
VerifyTasks → CHECK if all requirements met
[if failed] → create new tasks, continue work
[if passed] → DeletePlan, report completion
\`\`\`

## Important
- If verification fails, create new tasks with TodoWrite and verify again
- Don't declare work complete until VerifyTasks returns success: true
- The tool checks both task completion AND requirement coverage
- Suggested tasks help you address any gaps found`,

  requiresApproval: false,
  category: 'agent-internal',

  schema: {
    type: 'object',
    properties: {
      planId: {
        type: 'string',
        description: 'The plan ID to verify (returned from CreatePlan)',
      },
      taskIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional: Specific task IDs to verify. If not provided, all tasks are verified.',
      },
    },
    required: ['planId'],
  },

  inputExamples: [
    {
      planId: 'plan-1234567890-abc123',
    },
    {
      planId: 'plan-1234567890-abc123',
      taskIds: ['task-1', 'task-2'],
    },
  ],

  searchKeywords: ['verify', 'check', 'validate', 'complete', 'done', 'requirements'],
  riskLevel: 'safe',
  allowedCallers: ['direct', 'code_execution'],

  ui: {
    icon: 'CheckCircle',
    label: 'Verify Tasks',
    color: 'text-[var(--color-success)]',
    runningLabel: 'Verifying tasks',
    completedLabel: 'Verification complete',
  },

  async execute(args: VerifyTasksToolArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { planId, taskIds } = args;
    const { sessionId, runId, logger, workspacePath } = context;

    if (!sessionId) {
      return {
        toolName: 'VerifyTasks',
        success: false,
        output: 'Error: No session ID provided.',
      };
    }

    if (!workspacePath) {
      return {
        toolName: 'VerifyTasks',
        success: false,
        output: 'Error: No workspace path available.',
      };
    }

    if (!planId || planId.trim().length === 0) {
      return {
        toolName: 'VerifyTasks',
        success: false,
        output: 'Error: planId is required.',
      };
    }

    try {
      const taskManager = getTaskManager();
      
      const result = await taskManager.verifyTasks(workspacePath, {
        planId: planId.trim(),
        taskIds: taskIds?.filter(id => id.trim().length > 0),
      });

      logger?.info('Tasks verified', {
        sessionId,
        runId,
        planId,
        success: result.success,
        completionPercentage: result.completionPercentage,
        passedCount: result.passedTasks.length,
        failedCount: result.failedTasks.length,
        unmetRequirements: result.unmetRequirements.length,
      });

      const output = formatVerificationOutput(result, planId);

      return {
        toolName: 'VerifyTasks',
        success: true, // Tool execution succeeded, even if verification found issues
        output,
        metadata: {
          verificationSuccess: result.success,
          completionPercentage: result.completionPercentage,
          passedCount: result.passedTasks.length,
          failedCount: result.failedTasks.length,
          unmetRequirements: result.unmetRequirements,
          suggestedTaskCount: result.suggestedTasks.length,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger?.error('Failed to verify tasks', { error: errorMessage, sessionId, planId });

      return {
        toolName: 'VerifyTasks',
        success: false,
        output: `Error verifying tasks: ${errorMessage}`,
      };
    }
  },
};
