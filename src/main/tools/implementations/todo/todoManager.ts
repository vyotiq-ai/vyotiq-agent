/**
 * Todo Manager
 * 
 * Manages todo lists for agent sessions. Provides in-memory storage
 * with optional persistence for tracking task progress across runs.
 */
import type { TodoItem, TodoListState } from '../../../../shared/types/todo';

/**
 * TodoManager - Singleton for managing todo lists across sessions
 */
class TodoManager {
  /** Map of session ID to todo list state */
  private todoLists = new Map<string, TodoListState>();

  /**
   * Get the todo list for a session
   */
  getTodos(sessionId: string): TodoListState | undefined {
    return this.todoLists.get(sessionId);
  }

  /**
   * Get todos for a specific run within a session
   */
  getTodosForRun(sessionId: string, runId: string): TodoItem[] {
    const list = this.todoLists.get(sessionId);
    if (!list || list.runId !== runId) {
      return [];
    }
    return list.todos;
  }

  /**
   * Update the todo list for a session
   * Creates a new list if one doesn't exist for the session/run
   */
  updateTodos(sessionId: string, runId: string, todos: TodoItem[]): TodoListState {
    const now = Date.now();
    const existing = this.todoLists.get(sessionId);

    // If there's an existing list for a different run, we start fresh
    // but preserve any completed items from the previous run if relevant
    if (existing && existing.runId !== runId) {
      // New run - create fresh list
      const newList: TodoListState = {
        sessionId,
        runId,
        todos,
        createdAt: now,
        updatedAt: now,
      };
      this.todoLists.set(sessionId, newList);
      return newList;
    }

    // Update existing list or create new one
    const updatedList: TodoListState = {
      sessionId,
      runId,
      todos: this.mergeTodos(existing?.todos || [], todos),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    this.todoLists.set(sessionId, updatedList);
    return updatedList;
  }

  /**
   * Merge existing todos with new todos
   * Preserves timestamps from existing items when IDs match
   */
  private mergeTodos(existing: TodoItem[], incoming: TodoItem[]): TodoItem[] {
    const existingMap = new Map(existing.map(t => [t.id, t]));
    const now = Date.now();

    return incoming.map(todo => {
      const existingTodo = existingMap.get(todo.id);
      if (existingTodo) {
        // Preserve createdAt, update updatedAt if status changed
        const statusChanged = existingTodo.status !== todo.status;
        return {
          ...todo,
          createdAt: existingTodo.createdAt,
          updatedAt: statusChanged ? now : existingTodo.updatedAt,
        };
      }
      // New todo
      return {
        ...todo,
        createdAt: now,
        updatedAt: now,
      };
    });
  }

  /**
   * Add a single todo to a session's list
   */
  addTodo(sessionId: string, runId: string, todo: Omit<TodoItem, 'createdAt' | 'updatedAt'>): TodoItem {
    const now = Date.now();
    const newTodo: TodoItem = {
      ...todo,
      createdAt: now,
      updatedAt: now,
    };

    const existing = this.todoLists.get(sessionId);
    if (existing && existing.runId === runId) {
      existing.todos.push(newTodo);
      existing.updatedAt = now;
    } else {
      // Create new list with this todo
      this.todoLists.set(sessionId, {
        sessionId,
        runId,
        todos: [newTodo],
        createdAt: now,
        updatedAt: now,
      });
    }

    return newTodo;
  }

  /**
   * Update a single todo's status
   */
  updateTodoStatus(
    sessionId: string,
    todoId: string,
    status: TodoItem['status']
  ): TodoItem | undefined {
    const list = this.todoLists.get(sessionId);
    if (!list) return undefined;

    const todo = list.todos.find(t => t.id === todoId);
    if (!todo) return undefined;

    todo.status = status;
    todo.updatedAt = Date.now();
    list.updatedAt = Date.now();

    return todo;
  }

  /**
   * Remove a todo from a session's list
   */
  removeTodo(sessionId: string, todoId: string): boolean {
    const list = this.todoLists.get(sessionId);
    if (!list) return false;

    const index = list.todos.findIndex(t => t.id === todoId);
    if (index === -1) return false;

    list.todos.splice(index, 1);
    list.updatedAt = Date.now();
    return true;
  }

  /**
   * Clear all todos for a session
   */
  clearTodos(sessionId: string): void {
    this.todoLists.delete(sessionId);
  }

  /**
   * Clear todos for a specific run
   */
  clearRunTodos(sessionId: string, runId: string): void {
    const list = this.todoLists.get(sessionId);
    if (list && list.runId === runId) {
      this.todoLists.delete(sessionId);
    }
  }

  /**
   * Get all active todo lists (for debugging/monitoring)
   */
  getAllLists(): TodoListState[] {
    return Array.from(this.todoLists.values());
  }

  /**
   * Check if a session has any incomplete todos
   */
  hasIncompleteTodos(sessionId: string): boolean {
    const list = this.todoLists.get(sessionId);
    if (!list) return false;
    return list.todos.some(t => t.status !== 'completed');
  }

  /**
   * Get the current in-progress todo for a session
   */
  getCurrentTask(sessionId: string): TodoItem | undefined {
    const list = this.todoLists.get(sessionId);
    if (!list) return undefined;
    return list.todos.find(t => t.status === 'in_progress');
  }

  /**
   * Get the next pending todo for a session
   */
  getNextPendingTask(sessionId: string): TodoItem | undefined {
    const list = this.todoLists.get(sessionId);
    if (!list) return undefined;
    return list.todos.find(t => t.status === 'pending');
  }
}

// Singleton instance
let todoManagerInstance: TodoManager | null = null;

/**
 * Get the singleton TodoManager instance
 */
export function getTodoManager(): TodoManager {
  if (!todoManagerInstance) {
    todoManagerInstance = new TodoManager();
  }
  return todoManagerInstance;
}

/**
 * Reset the TodoManager (for testing)
 */
export function resetTodoManager(): void {
  todoManagerInstance = null;
}

export { TodoManager };
