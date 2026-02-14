/**
 * useTodos Hook
 * 
 * Manages todo list state for agent sessions.
 * Connects to the AgentProvider state for real-time todo updates.
 * Provides computed statistics and derived state for UI display.
 */
import { useMemo, useCallback } from 'react';
import { useAgentSelector } from '../state/AgentProvider';
import type { TodoItem, TodoStats } from '../../shared/types/todo';
import { calculateTodoStats } from '../../shared/types/todo';

// ============================================================================
// Types
// ============================================================================

interface UseTodosOptions {
  /** Session ID to get todos for */
  sessionId: string | null;
  /** Optional run ID to filter by specific run */
  runId?: string;
}

interface UseTodosReturn {
  /** List of todo items */
  todos: TodoItem[];
  /** Calculated statistics */
  stats: TodoStats;
  /** Whether there are any todos */
  hasTodos: boolean;
  /** Whether there are any active (non-completed) todos */
  isActive: boolean;
  /** Whether all todos are completed */
  isComplete: boolean;
  /** Current active task (in_progress) if any */
  activeTask: TodoItem | null;
  /** Sorted todos: in_progress first, then pending, then completed */
  sortedTodos: TodoItem[];
  /** Run ID associated with current todos */
  currentRunId: string | null;
  /** Timestamp of last update */
  lastUpdated: number | null;
}

// ============================================================================
// Sort Order
// ============================================================================

const STATUS_SORT_ORDER: Record<TodoItem['status'], number> = {
  in_progress: 0,
  pending: 1,
  completed: 2,
};

/**
 * Sort todos by status: in_progress first, then pending, then completed
 */
function sortTodosByStatus(todos: TodoItem[]): TodoItem[] {
  return [...todos].sort((a, b) => STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status]);
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for managing todo state from AgentProvider.
 * Provides computed values for efficient UI rendering.
 */
export function useTodos({ sessionId, runId }: UseTodosOptions): UseTodosReturn {
  // Select todos from the agent state with stable selector
  const todoState = useAgentSelector(
    useCallback(
      (state) => {
        if (!sessionId) return null;
        const sessionTodos = state.todos[sessionId];
        if (!sessionTodos) return null;
        // If runId is specified, only return if it matches
        if (runId && sessionTodos.runId !== runId) return null;
        return sessionTodos;
      },
      [sessionId, runId]
    )
  );

  // Extract todos array with stable reference
  const todos = useMemo(() => todoState?.todos ?? [], [todoState]);

  // Calculate stats from current todos
  const stats = useMemo(() => calculateTodoStats(todos), [todos]);

  // Check if there are any todos
  const hasTodos = todos.length > 0;

  // Check if there are any active (non-completed) todos
  const isActive = useMemo(
    () => todos.some(t => t.status === 'in_progress' || t.status === 'pending'),
    [todos]
  );

  // Check if all todos are completed
  const isComplete = useMemo(
    () => hasTodos && todos.every(t => t.status === 'completed'),
    [hasTodos, todos]
  );

  // Get the current active task (in_progress)
  const activeTask = useMemo(
    () => todos.find(t => t.status === 'in_progress') ?? null,
    [todos]
  );

  // Get sorted todos for display
  const sortedTodos = useMemo(() => sortTodosByStatus(todos), [todos]);

  // Extract run ID and timestamp
  const currentRunId = todoState?.runId ?? null;
  const lastUpdated = todoState?.timestamp ?? null;

  return {
    todos,
    stats,
    hasTodos,
    isActive,
    isComplete,
    activeTask,
    sortedTodos,
    currentRunId,
    lastUpdated,
  };
}
