/**
 * useTodos Hook
 * 
 * Manages todo list state for agent sessions.
 * Connects to the AgentProvider state for real-time todo updates.
 */
import { useMemo, useCallback } from 'react';
import { useAgentSelector } from '../state/AgentProvider';
import type { TodoItem, TodoStats } from '../../shared/types/todo';
import { calculateTodoStats } from '../../shared/types/todo';

interface UseTodosOptions {
  sessionId: string | null;
  runId?: string;
}

interface UseTodosReturn {
  todos: TodoItem[];
  stats: TodoStats;
  hasTodos: boolean;
  isActive: boolean;
}

/**
 * Hook for managing todo state from AgentProvider
 */
export function useTodos({ sessionId, runId }: UseTodosOptions): UseTodosReturn {
  // Select todos from the agent state
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

  // Extract todos array
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

  return {
    todos,
    stats,
    hasTodos,
    isActive,
  };
}

export default useTodos;
