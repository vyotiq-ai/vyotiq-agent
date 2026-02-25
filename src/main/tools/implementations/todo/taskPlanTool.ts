/**
 * Unified TaskPlan Tool
 * 
 * Consolidates CreatePlan, GetActivePlan, ListPlans, VerifyTasks, and DeletePlan
 * into a single action-dispatched tool. Reduces tool count in the LLM context
 * from 5 separate tool schemas to 1.
 * 
 * Inspired by the "addition by subtraction" principle:
 * fewer tools = less decision overhead for the model.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import type { CreatePlanArgs, TaskSession, VerificationResult, TaskItem } from '../../../../shared/types/todoTask';
import { getTaskManager } from './taskManager';
import {
  STATUS_ICONS,
  generateProgressBar,
  getProgressColor,
  formatShortDate,
  calculatePercentage,
} from './formatUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaskPlanArgs {
  /** Which plan action to perform */
  action: 'create' | 'get_active' | 'list' | 'verify' | 'delete';

  // --- create action ---
  /** The user's original request/task description (create) */
  userRequest?: string;
  /** Short name for the task, used for folder naming (create) */
  taskName?: string;
  /** Pre-parsed requirements (create) */
  requirements?: string[];

  // --- verify / delete action ---
  /** Plan ID (verify, delete) */
  planId?: string;
  /** Specific task IDs to verify (verify) */
  taskIds?: string[];
  /** Require confirmation for active plan deletion (delete) */
  confirmDelete?: boolean;

  // --- get_active action ---
  /** Include full task details (get_active, default: true) */
  includeDetails?: boolean;

  // --- list action ---
  /** Filter by status (list) */
  status?: 'all' | 'active' | 'completed';
  /** Max plans to return (list) */
  limit?: number;

  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Formatting helpers (kept lean — reuse existing format utils)
// ---------------------------------------------------------------------------

function estimateTime(tasks: TaskItem[]): string {
  const totalComplexity = tasks.reduce((sum, t) => sum + (t.complexity || 2), 0);
  const avgComplexity = tasks.length > 0 ? totalComplexity / tasks.length : 2;
  const mins = tasks.length * (avgComplexity * 10);
  return mins < 60 ? `${Math.round(mins)} minutes` : `${(mins / 60).toFixed(1)} hours`;
}

function fmtCreatedPlan(session: TaskSession): string {
  const lines: string[] = [];
  const pb = generateProgressBar(session.stats.completionPercentage);
  lines.push(`# Plan Created: ${session.taskName}`, '',
    '<div align="center">', '', '**Ready to Start**', '',
    '```', `${pb} ${session.stats.completionPercentage}%`, '```', '', '</div>', '', '---', '',
    '## Details', '',
    '| Property | Value |', '|----------|-------|',
    `| **Plan ID** | \`${session.plan.id}\` |`,
    `| **Location** | \`.vyotiq/${session.folderName}/\` |`,
    `| **Tasks** | ${session.tasks.length} |`,
    `| **Requirements** | ${session.plan.requirements.length} |`,
    `| **Est. Time** | ~${estimateTime(session.tasks)} |`, '',
    '---', '', '## Requirements', '');
  for (let i = 0; i < session.plan.requirements.length; i++) {
    lines.push(`- [ ] **${i + 1}.** ${session.plan.requirements[i]}`);
  }
  lines.push('', '---', '', '## Tasks', '');
  for (let i = 0; i < session.tasks.length; i++) {
    lines.push(`${i + 1}. [ ] ${session.tasks[i].content}`);
  }
  lines.push('', '---', '',
    `> **Files saved to:** \`.vyotiq/${session.folderName}/plan.md\``);
  return lines.join('\n');
}

function fmtActivePlan(session: TaskSession | null, details: boolean): string {
  if (!session) {
    return '# No Active Plan\n\nNo active task plan found. Use `task_plan action="create"` to create one, or `task_plan action="list"` to see existing plans.';
  }
  const lines: string[] = [];
  const pb = generateProgressBar(session.stats.completionPercentage);
  const isComplete = session.stats.completionPercentage === 100;
  const label = isComplete ? 'Completed' : session.stats.inProgress > 0 ? 'In Progress' : 'Active';

  lines.push(`# Active Plan: ${session.taskName}`, '',
    '<div align="center">', '', `**${label}**`, '',
    '```', `${pb} ${session.stats.completionPercentage}%`, '```', '', '</div>', '', '---', '',
    '## Overview', '',
    '| Property | Value |', '|----------|-------|',
    `| **Plan ID** | \`${session.plan.id}\` |`,
    `| **Location** | \`.vyotiq/${session.folderName}/\` |`,
    `| **Iterations** | ${session.iterationCount} |`, '',
    '| Status | Count | % |', '|--------|-------|---|',
    `| Completed | ${session.stats.completed} | ${calculatePercentage(session.stats.completed, session.stats.total)}% |`,
    `| In Progress | ${session.stats.inProgress} | ${calculatePercentage(session.stats.inProgress, session.stats.total)}% |`,
    `| Pending | ${session.stats.pending} | ${calculatePercentage(session.stats.pending, session.stats.total)}% |`,
    `| **Total** | **${session.stats.total}** | **100%** |`, '');

  if (details) {
    const inProg = session.tasks.filter(t => t.status === 'in_progress');
    const pending = session.tasks.filter(t => t.status === 'pending');
    const done = session.tasks.filter(t => t.status === 'completed');
    lines.push('---', '', '## Tasks', '');
    for (const t of inProg) lines.push(`- ${STATUS_ICONS.in_progress} **${t.content}** (\`${t.id}\`)`);
    for (const t of pending) lines.push(`- ${STATUS_ICONS.pending} ${t.content} (\`${t.id}\`)`);
    for (const t of done) lines.push(`- ${STATUS_ICONS.completed} ~~${t.content}~~ (\`${t.id}\`)`);
    lines.push('');
  }
  return lines.join('\n');
}

function fmtPlanList(sessions: TaskSession[], status: string): string {
  if (sessions.length === 0) {
    return `# Task Plans\n\nNo ${status === 'all' ? '' : status + ' '}plans found. Use \`task_plan action="create"\` to create one.`;
  }
  const lines: string[] = [];
  const active = sessions.filter(s => !s.plan.isCompleted);
  const completed = sessions.filter(s => s.plan.isCompleted);

  lines.push('# Task Plans', '', '---', '',
    '| Status | Count |', '|--------|-------|',
    `| Active | ${active.length} |`,
    `| Completed | ${completed.length} |`,
    `| **Total** | **${sessions.length}** |`, '');

  if (active.length > 0 && (status === 'all' || status === 'active')) {
    lines.push('### Active', '',
      '| Plan | Progress | Tasks | Created | Plan ID |',
      '|------|----------|-------|---------|---------|');
    for (const s of active) {
      lines.push(`| **${s.taskName}** | \`${generateProgressBar(s.stats.completionPercentage)}\` ${s.stats.completionPercentage}% | ${s.stats.completed}/${s.stats.total} | ${formatShortDate(s.createdAt)} | \`${s.plan.id.substring(0, 15)}...\` |`);
    }
    lines.push('');
  }
  if (completed.length > 0 && (status === 'all' || status === 'completed')) {
    lines.push('### Completed', '',
      '| Plan | Tasks | Created |',
      '|------|-------|---------|');
    for (const s of completed) {
      lines.push(`| ~~${s.taskName}~~ | ${s.stats.total} | ${formatShortDate(s.createdAt)} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function fmtVerification(result: VerificationResult, planId: string): string {
  const lines: string[] = [];
  const pb = generateProgressBar(result.completionPercentage);
  const label = result.success ? 'PASS' : result.completionPercentage > 50 ? 'WARN' : 'FAIL';

  lines.push(`# [${label}] Verification`, '',
    '<div align="center">', '', `**${result.completionPercentage}% Complete** | ${getProgressColor(result.completionPercentage)}`, '',
    '```', `${pb} ${result.completionPercentage}%`, '```', '', '</div>', '', '---', '',
    '## Summary', '',
    '| Metric | Value |', '|--------|-------|',
    `| **Plan ID** | \`${planId}\` |`,
    `| **Status** | ${result.success ? 'PASSED' : 'INCOMPLETE'} |`,
    `| **Passed** | ${result.passedTasks.length} |`,
    `| **Failed** | ${result.failedTasks.length} |`,
    `| **Unmet Reqs** | ${result.unmetRequirements.length} |`, '');

  if (result.failedTasks.length > 0) {
    lines.push('## Incomplete Tasks', '');
    for (const t of result.failedTasks) {
      lines.push(`- [ ] **${t.content}** (${t.status})`);
    }
    lines.push('');
  }
  if (result.unmetRequirements.length > 0) {
    lines.push('## Unmet Requirements', '');
    for (let i = 0; i < result.unmetRequirements.length; i++) {
      lines.push(`${i + 1}. ${result.unmetRequirements[i]}`);
    }
    lines.push('');
  }
  if (!result.success && result.suggestedTasks.length > 0) {
    lines.push('## Suggested Tasks', '');
    for (const s of result.suggestedTasks) {
      lines.push(`- ${s.content}${s.description ? ` — ${s.description}` : ''}`);
    }
    lines.push('');
  }
  if (result.success) {
    lines.push('> **All requirements met!** Use `task_plan action="delete"` to clean up.');
  } else {
    lines.push('> **Incomplete.** Update tasks with `TodoWrite`, then verify again.');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleCreate(args: TaskPlanArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
  const { userRequest, taskName, requirements } = args;
  const { sessionId, runId, logger, workspacePath } = context;

  if (!sessionId || !runId) return fail('Session and run ID required for plan creation.');
  if (!workspacePath) return fail('No workspace path available.');
  if (!userRequest?.trim()) return fail('userRequest is required.');
  if (!taskName?.trim()) return fail('taskName is required.');

  const mgr = getTaskManager();
  const createArgs: CreatePlanArgs = {
    userRequest: userRequest.trim(),
    taskName: taskName.trim(),
    requirements: requirements?.filter(r => r.trim().length > 0),
  };

  const session = await mgr.createPlan(workspacePath, createArgs, sessionId, runId);
  logger?.info('Plan created', { planId: session.plan.id, taskName: session.taskName, tasks: session.tasks.length });

  return {
    toolName: 'task_plan',
    success: true,
    output: fmtCreatedPlan(session),
    metadata: { planId: session.plan.id, folderName: session.folderName, taskCount: session.tasks.length },
  };
}

async function handleGetActive(args: TaskPlanArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
  const { workspacePath, sessionId, logger } = context;
  if (!workspacePath) return fail('No workspace path available.');

  const mgr = getTaskManager();
  const session = await mgr.getActiveSession(workspacePath);
  logger?.info('Retrieved active plan', { sessionId, hasActive: !!session, planId: session?.plan.id });

  return {
    toolName: 'task_plan',
    success: true,
    output: fmtActivePlan(session, args.includeDetails !== false),
    metadata: session
      ? { planId: session.plan.id, completionPercentage: session.stats.completionPercentage }
      : { hasActivePlan: false },
  };
}

async function handleList(args: TaskPlanArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
  const { workspacePath, sessionId, logger } = context;
  if (!workspacePath) return fail('No workspace path available.');

  const status = args.status || 'all';
  const limit = args.limit || 20;
  const mgr = getTaskManager();
  let sessions = await mgr.listSessions(workspacePath);

  if (status === 'active') sessions = sessions.filter(s => !s.plan.isCompleted);
  else if (status === 'completed') sessions = sessions.filter(s => s.plan.isCompleted);
  sessions = sessions.slice(0, limit);

  logger?.info('Listed plans', { sessionId, count: sessions.length, status });

  return {
    toolName: 'task_plan',
    success: true,
    output: fmtPlanList(sessions, status),
    metadata: { planCount: sessions.length, status },
  };
}

async function handleVerify(args: TaskPlanArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
  const { workspacePath, sessionId, logger } = context;
  if (!workspacePath) return fail('No workspace path available.');
  if (!args.planId?.trim()) return fail('planId is required for verify.');

  const mgr = getTaskManager();
  const result = await mgr.verifyTasks(workspacePath, {
    planId: args.planId.trim(),
    taskIds: args.taskIds?.filter(id => id.trim().length > 0),
  });

  logger?.info('Tasks verified', {
    sessionId, planId: args.planId,
    success: result.success, pct: result.completionPercentage,
  });

  return {
    toolName: 'task_plan',
    success: true,
    output: fmtVerification(result, args.planId),
    metadata: {
      verificationSuccess: result.success,
      completionPercentage: result.completionPercentage,
      passedCount: result.passedTasks.length,
      failedCount: result.failedTasks.length,
    },
  };
}

async function handleDelete(args: TaskPlanArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
  const { workspacePath, sessionId, logger } = context;
  if (!workspacePath) return fail('No workspace path available.');
  if (!args.planId?.trim()) return fail('planId is required for delete.');

  const mgr = getTaskManager();
  let session = await mgr.getSessionByPlanId(workspacePath, args.planId.trim());

  if (!session) {
    const all = await mgr.listSessions(workspacePath);
    session = all.find(s => s.folderName === args.planId!.trim()) ?? null;
  }
  if (!session) return fail(`Plan not found: ${args.planId}`);

  // Safety: require confirmDelete for active plans
  if (!session.plan.isCompleted && !args.confirmDelete) {
    return {
      toolName: 'task_plan',
      success: false,
      output: `# Cannot Delete Active Plan\n\n**"${session.taskName}"** is still active (${session.stats.completionPercentage}% done). Set \`confirmDelete: true\` to force delete, or complete it first.`,
    };
  }

  const deleted = await mgr.deleteSession(workspacePath, session.folderName);
  if (!deleted) return fail(`Failed to delete plan folder: .vyotiq/${session.folderName}/`);

  logger?.info('Deleted plan', { sessionId, planId: session.plan.id, taskName: session.taskName });

  return {
    toolName: 'task_plan',
    success: true,
    output: `# Plan Deleted\n\nRemoved **"${session.taskName}"** (\`${session.plan.id}\`). ${session.stats.total} tasks cleared.`,
    metadata: { planId: session.plan.id, taskName: session.taskName },
  };
}

function fail(msg: string): ToolExecutionResult {
  return { toolName: 'task_plan', success: false, output: `Error: ${msg}` };
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export const taskPlanTool: ToolDefinition<TaskPlanArgs> = {
  name: 'task_plan',
  description: `Manage persistent task plans. One tool for the entire plan lifecycle.

## Actions
- **create**: Create a plan from user request. Requires \`userRequest\` and \`taskName\`.
- **get_active**: Get the active plan for this workspace. Check FIRST before creating.
- **list**: List all plans. Optional \`status\` filter ("all"|"active"|"completed").
- **verify**: Verify task completion against requirements. Requires \`planId\`.
- **delete**: Delete a plan. Requires \`planId\`. Active plans need \`confirmDelete: true\`.

Workflow: get_active → create → TodoWrite (update progress) → verify → delete`,

  requiresApproval: false,
  category: 'agent-internal',
  riskLevel: 'safe',
  allowedCallers: ['direct', 'code_execution'],

  schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Plan action to perform',
        enum: ['create', 'get_active', 'list', 'verify', 'delete'],
      },
      userRequest: {
        type: 'string',
        description: 'User\'s request to plan (create)',
      },
      taskName: {
        type: 'string',
        description: 'Short name for the task, e.g. "add-dark-mode" (create)',
      },
      requirements: {
        type: 'array',
        items: { type: 'string' },
        description: 'Pre-parsed requirements (create, optional)',
      },
      planId: {
        type: 'string',
        description: 'Plan ID or folder name (verify, delete)',
      },
      taskIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific task IDs to verify (verify, optional)',
      },
      confirmDelete: {
        type: 'boolean',
        description: 'Confirm deletion of active plan (delete)',
      },
      includeDetails: {
        type: 'boolean',
        description: 'Include full task list (get_active, default: true)',
      },
      status: {
        type: 'string',
        enum: ['all', 'active', 'completed'],
        description: 'Filter plans by status (list, default: all)',
      },
      limit: {
        type: 'number',
        description: 'Max plans to return (list, default: 20)',
      },
    },
    required: ['action'],
  },

  inputExamples: [
    { action: 'get_active' },
    { action: 'create', userRequest: 'Add dark mode toggle to settings', taskName: 'add-dark-mode' },
    { action: 'list', status: 'active' },
    { action: 'verify', planId: 'plan-123' },
    { action: 'delete', planId: 'plan-123' },
  ],

  searchKeywords: ['plan', 'task', 'create', 'verify', 'list', 'delete', 'active'],

  ui: {
    icon: 'ClipboardList',
    label: 'Task Plan',
    color: 'text-[var(--color-accent-primary)]',
    runningLabel: 'Managing plan...',
    completedLabel: 'Plan updated',
  },

  async execute(args: TaskPlanArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    try {
      switch (args.action) {
        case 'create':
          return await handleCreate(args, context);
        case 'get_active':
          return await handleGetActive(args, context);
        case 'list':
          return await handleList(args, context);
        case 'verify':
          return await handleVerify(args, context);
        case 'delete':
          return await handleDelete(args, context);
        default:
          return fail(`Unknown action: ${args.action}. Use: create, get_active, list, verify, delete`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      context.logger?.error('task_plan failed', { error: msg, action: args.action });
      return fail(msg);
    }
  },
};
