/**
 * Todo System Index
 * 
 * Exports for the enhanced todo/task tracking system.
 * Includes both the basic TodoWrite tool and the advanced task management tools.
 */

// Basic todo manager (in-memory)
export { TodoManager, getTodoManager, resetTodoManager } from './todoManager';

// Enhanced task manager (persistent storage)
export { TaskManager, getTaskManager, resetTaskManager } from './taskManager';

// Persistence layer
export { 
  TaskPersistenceManager, 
  getTaskPersistenceManager, 
  clearPersistenceManagers 
} from './taskPersistence';

// Format utilities (shared across todo tools)
export {
  STATUS_ICONS,
  PRIORITY_ICONS,
  VERIFICATION_ICONS,
  generateProgressBar,
  formatTimestamp,
  formatShortDate,
  getComplexityLabel,
  getProgressColor,
  calculatePercentage,
} from './formatUtils';

// Markdown generator for beautiful plan output
export {
  generatePlanMarkdown,
  generateTaskListMarkdown,
  generatePlanSummaryMarkdown,
} from './planMarkdownGenerator';

// Tools
export { createPlanTool } from './createPlanTool';
export { verifyTasksTool } from './verifyTasksTool';
export { getActivePlanTool } from './getActivePlanTool';
export { listPlansTool } from './listPlansTool';
export { deletePlanTool } from './deletePlanTool';

// Types from basic todo
export type { 
  TodoItem, 
  TodoListState, 
  TodoWriteArgs, 
  TodoStats, 
  TodoStatus 
} from '../../../../shared/types/todo';

// Types from enhanced task system
export type {
  TaskItem,
  TaskSession,
  TaskStats,
  UserPlan,
  VerificationResult,
  VerificationAttempt,
  CreatePlanArgs,
  UpdateTasksArgs,
  VerifyTasksArgs,
} from '../../../../shared/types/todoTask';

// Utility functions
export {
  calculateTaskStats,
  sanitizeFolderName,
  generateTaskId,
  generatePlanId,
} from '../../../../shared/types/todoTask';
