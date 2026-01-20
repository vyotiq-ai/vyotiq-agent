/**
 * Todo System Types
 * 
 * Type definitions for the agent todo/task tracking system.
 * Used for tracking progress on complex multi-step tasks.
 */

/**
 * Status of a todo item
 */
export type TodoStatus = 'pending' | 'in_progress' | 'completed';

/**
 * A single todo item
 */
export interface TodoItem {
  /** Unique identifier for the todo */
  id: string;
  /** Description of the task */
  content: string;
  /** Current status */
  status: TodoStatus;
  /** Timestamp when created */
  createdAt: number;
  /** Timestamp when last updated */
  updatedAt: number;
  /** Optional parent todo ID for subtasks */
  parentId?: string;
  /** Optional priority (1-5, 1 being highest) */
  priority?: number;
}

/**
 * Todo list state for a session
 */
export interface TodoListState {
  /** Session ID this todo list belongs to */
  sessionId: string;
  /** Run ID this todo list was created for */
  runId: string;
  /** All todo items */
  todos: TodoItem[];
  /** Timestamp when the list was created */
  createdAt: number;
  /** Timestamp when the list was last updated */
  updatedAt: number;
}

/**
 * Arguments for the TodoWrite tool
 */
export interface TodoWriteArgs {
  /** The updated todo list */
  todos: Array<{
    /** Unique identifier for the todo */
    id: string;
    /** Description of the task */
    content: string;
    /** Current status */
    status: TodoStatus;
  }>;
  [key: string]: unknown;
}

/**
 * Event emitted when todos are updated
 */
export interface TodoUpdateEvent {
  type: 'todo-update';
  sessionId: string;
  runId: string;
  todos: TodoItem[];
  /** Optional plan ID if todos are associated with a persistent plan */
  planId?: string;
  timestamp: number;
}

/**
 * Summary statistics for a todo list
 */
export interface TodoStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  completionPercentage: number;
}

/**
 * Calculate statistics for a todo list
 */
export function calculateTodoStats(todos: TodoItem[]): TodoStats {
  const total = todos.length;
  const pending = todos.filter(t => t.status === 'pending').length;
  const inProgress = todos.filter(t => t.status === 'in_progress').length;
  const completed = todos.filter(t => t.status === 'completed').length;
  const completionPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, pending, inProgress, completed, completionPercentage };
}
