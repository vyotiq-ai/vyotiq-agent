/**
 * CreatePlan Tool
 * 
 * Creates a new task plan from the user's request.
 * Stores the plan in .vyotiq/{TASK_NAME} for persistence.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import type { CreatePlanArgs, TaskSession, TaskItem } from '../../../../shared/types/todoTask';
import { getTaskManager } from './taskManager';
import { generateProgressBar } from './formatUtils';

interface CreatePlanToolArgs {
  /** The user's original request/task description */
  userRequest: string;
  /** A short name for the task (used for folder naming) */
  taskName: string;
  /** Optional: Pre-parsed requirements (if you've already broken them down) */
  requirements?: string[];
  [key: string]: unknown;
}

/**
 * Estimate time based on task count and complexity
 */
function estimateTime(tasks: TaskItem[]): string {
  const totalComplexity = tasks.reduce((sum, t) => sum + (t.complexity || 2), 0);
  const avgComplexity = tasks.length > 0 ? totalComplexity / tasks.length : 2;
  const estimatedMinutes = tasks.length * (avgComplexity * 10);
  return estimatedMinutes < 60 
    ? `${Math.round(estimatedMinutes)} minutes` 
    : `${(estimatedMinutes / 60).toFixed(1)} hours`;
}

/**
 * Format the created plan for output with beautiful markdown
 */
function formatPlanOutput(session: TaskSession): string {
  const lines: string[] = [];
  const progressBar = generateProgressBar(session.stats.completionPercentage);
  
  // Header with centered progress
  lines.push(`# Plan Created: ${session.taskName}`);
  lines.push('');
  lines.push('<div align="center">');
  lines.push('');
  lines.push('**Ready to Start**');
  lines.push('');
  lines.push('```');
  lines.push(`${progressBar} ${session.stats.completionPercentage}%`);
  lines.push('```');
  lines.push('');
  lines.push('</div>');
  lines.push('');
  lines.push('---');
  lines.push('');
  
  // Plan details table
  lines.push('## Plan Details');
  lines.push('');
  lines.push(`| Property | Value |`);
  lines.push(`|----------|-------|`);
  lines.push(`| **Plan ID** | \`${session.plan.id}\` |`);
  lines.push(`| **Location** | \`.vyotiq/${session.folderName}/\` |`);
  lines.push(`| **Tasks** | ${session.tasks.length} |`);
  lines.push(`| **Requirements** | ${session.plan.requirements.length} |`);
  lines.push(`| **Est. Time** | ~${estimateTime(session.tasks)} |`);
  lines.push('');
  
  // Original request
  lines.push('---');
  lines.push('');
  lines.push('## Original Request');
  lines.push('');
  const truncatedRequest = session.plan.originalRequest.length > 400 
    ? session.plan.originalRequest.substring(0, 400) + '...' 
    : session.plan.originalRequest;
  lines.push(`> ${truncatedRequest.replace(/\n/g, '\n> ')}`);
  lines.push('');
  
  // Requirements section
  lines.push('---');
  lines.push('');
  lines.push('## Requirements');
  lines.push('');
  for (let i = 0; i < session.plan.requirements.length; i++) {
    lines.push(`- [ ] **${i + 1}.** ${session.plan.requirements[i]}`);
  }
  lines.push('');
  
  // Task list section
  lines.push('---');
  lines.push('');
  lines.push('## Task List');
  lines.push('');
  for (let i = 0; i < session.tasks.length; i++) {
    const task = session.tasks[i];
    lines.push(`${i + 1}. [ ] ${task.content}`);
  }
  lines.push('');
  
  // Workflow mini-diagram
  lines.push('---');
  lines.push('');
  lines.push('## Workflow');
  lines.push('');
  lines.push('```');
  lines.push('START -> Task 1 -> Task 2 -> ... -> Verify -> DONE');
  lines.push('```');
  lines.push('');
  
  // Quick reference table
  lines.push('---');
  lines.push('');
  lines.push('## Quick Reference');
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
  lines.push(`> **Files saved to:** \`.vyotiq/${session.folderName}/plan.md\``);

  return lines.join('\n');
}

export const createPlanTool: ToolDefinition<CreatePlanToolArgs> = {
  name: 'CreatePlan',
  description: `Create a well-structured and detailed plan based on the user's request/requirements. Parses requirements, creates tasks, and stores in .vyotiq/{taskName}/.

## When to Use
- At the START of complex multi-step tasks (3+ steps).
- When user provides multiple requirements.
- BEFORE starting implementation.
- When you need to track progress across multiple files/operations.


## What It Does
1. Parses user request into discrete requirements
2. Creates granular tasks for each requirement
3. Stores persistently in .vyotiq/{taskName}/
4. Returns plan ID for TodoWrite and VerifyTasks
5. Generates a detailed plan document with requirements, tasks, and next steps
6. Provides a clear and concise plan for the user to follow
7. Stores the plan in .vyotiq/{taskName}/ for future reference
8. Returns the plan ID for TodoWrite and VerifyTasks


## Workflow Integration
This is part of the Plan-Do-Check-Act cycle:
\`\`\`
GetActivePlan → check for existing work
CreatePlan → break down the request
TodoWrite → update progress as you work
VerifyTasks → confirm all requirements met
DeletePlan → clean up when done
\`\`\`

## Parameters
- **userRequest** (required): The user's original request. Include full context.
- **taskName** (required): Short name for the task (e.g., "add-dark-mode", "fix-login-bug"). Used for folder naming.
- **requirements** (optional): Pre-parsed requirements if you've already broken them down.

## Important
- Call ONCE at the beginning of complex tasks
- Ask the user follow up questions if needed to clarify requirements 
- Ask the user to confirm the plan, review the plan and make any necessary adjustments before proceeding
- Use returned planId with TodoWrite to update progress
- Use VerifyTasks to confirm completion before declaring done
- Plans persist across sessions in .vyotiq/ directory`,

  requiresApproval: false,
  category: 'agent-internal',

  schema: {
    type: 'object',
    properties: {
      userRequest: {
        type: 'string',
        description: 'The user\'s original request or task description. Include the full context.',
      },
      taskName: {
        type: 'string',
        description: 'A short, descriptive name for the task (e.g., "add-dark-mode", "fix-login-bug"). Used for folder naming.',
      },
      requirements: {
        type: 'array',
        items: { type: 'string', description: 'A specific requirement or task to complete' },
        description: 'Optional: Pre-parsed requirements if you\'ve already broken them down. If not provided, they will be auto-parsed from userRequest.',
      },
    },
    required: ['userRequest', 'taskName'],
  },

  inputExamples: [
    {
      userRequest: 'Add a dark mode toggle to the settings page. Make sure it persists across sessions and updates all components.',
      taskName: 'add-dark-mode',
      requirements: [
        'Create dark mode toggle component',
        'Add theme state management',
        'Persist theme preference',
        'Update components for theme support',
      ],
    },
    {
      userRequest: 'Fix the login bug where users get logged out after 5 minutes',
      taskName: 'fix-session-timeout',
    },
  ],

  searchKeywords: ['plan', 'task', 'create', 'start', 'begin', 'requirements', 'breakdown'],
  riskLevel: 'safe',
  allowedCallers: ['direct', 'code_execution'],

  ui: {
    icon: 'ClipboardList',
    label: 'Create Plan',
    color: 'text-[var(--color-accent-primary)]',
    runningLabel: 'Creating task plan',
    completedLabel: 'Plan created',
  },

  async execute(args: CreatePlanToolArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { userRequest, taskName, requirements } = args;
    const { sessionId, runId, logger, workspacePath } = context;

    if (!sessionId) {
      return {
        toolName: 'CreatePlan',
        success: false,
        output: 'Error: No session ID provided. Cannot create plan without session context.',
      };
    }

    if (!runId) {
      return {
        toolName: 'CreatePlan',
        success: false,
        output: 'Error: No run ID provided. Cannot create plan without run context.',
      };
    }

    if (!workspacePath) {
      return {
        toolName: 'CreatePlan',
        success: false,
        output: 'Error: No workspace path available. Cannot store plan without workspace.',
      };
    }

    if (!userRequest || userRequest.trim().length === 0) {
      return {
        toolName: 'CreatePlan',
        success: false,
        output: 'Error: userRequest is required and cannot be empty.',
      };
    }

    if (!taskName || taskName.trim().length === 0) {
      return {
        toolName: 'CreatePlan',
        success: false,
        output: 'Error: taskName is required and cannot be empty.',
      };
    }

    try {
      const taskManager = getTaskManager();
      
      const createArgs: CreatePlanArgs = {
        userRequest: userRequest.trim(),
        taskName: taskName.trim(),
        requirements: requirements?.filter(r => r.trim().length > 0),
      };

      const session = await taskManager.createPlan(
        workspacePath,
        createArgs,
        sessionId,
        runId
      );

      logger?.info('Task plan created', {
        sessionId,
        runId,
        planId: session.plan.id,
        taskName: session.taskName,
        folderName: session.folderName,
        taskCount: session.tasks.length,
        requirementCount: session.plan.requirements.length,
      });

      const output = formatPlanOutput(session);

      return {
        toolName: 'CreatePlan',
        success: true,
        output,
        metadata: {
          planId: session.plan.id,
          sessionId: session.id,
          folderName: session.folderName,
          taskCount: session.tasks.length,
          requirementCount: session.plan.requirements.length,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger?.error('Failed to create task plan', { error: errorMessage, sessionId, runId });

      return {
        toolName: 'CreatePlan',
        success: false,
        output: `Error creating task plan: ${errorMessage}`,
      };
    }
  },
};
