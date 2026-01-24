/**
 * TodoWrite Tool
 * 
 * Creates and manages a structured task list for agent coding sessions.
 * Works with both in-memory lists and persistent task plans (when planId provided).
 */
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type { ToolExecutionResult } from '../../../shared/types';
import type { TodoItem, TodoStats } from '../../../shared/types/todo';
import { calculateTodoStats } from '../../../shared/types/todo';
import { getTodoManager } from './todo/todoManager';
import { getTaskManager } from './todo/taskManager';
import { STATUS_ICONS, generateProgressBar, getProgressColor } from './todo/formatUtils';

/**
 * Extended TodoWrite arguments with optional plan ID
 */
interface TodoWriteArgsExtended {
  /** The updated todo list */
  todos: Array<{
    id: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    description?: string;
    targetFiles?: string[];
  }>;
  /** Optional: Plan ID to sync with persistent storage */
  planId?: string;
  /** Parse error flag (set by JSON parser on failure) */
  _parseError?: boolean;
  /** Parse error message */
  _errorMessage?: string;
  /** Raw preview of failed parse */
  _rawPreview?: string;
  [key: string]: unknown;
}

/**
 * Format todo list for output display with beautiful markdown
 */
function formatTodoOutput(todos: TodoItem[], stats: TodoStats, planId?: string): string {
  if (todos.length === 0) {
    return '# Todo List Cleared\n\nNo tasks remaining.';
  }

  const lines: string[] = [];
  const progressBar = generateProgressBar(stats.completionPercentage, 20);
  const isComplete = stats.completionPercentage === 100;
  const progressStatus = getProgressColor(stats.completionPercentage);
  const statusLabel = isComplete ? 'Completed' : stats.inProgress > 0 ? 'In Progress' : 'Active';
  
  // Header with centered progress
  lines.push(`# Task Progress`);
  lines.push('');
  lines.push('<div align="center">');
  lines.push('');
  lines.push(`**${statusLabel}** | ${progressStatus}`);
  lines.push('');
  lines.push('```');
  lines.push(`${progressBar} ${stats.completionPercentage}%`);
  lines.push('```');
  lines.push('');
  lines.push('</div>');
  lines.push('');
  lines.push('---');
  lines.push('');
  
  // Stats table
  if (planId) {
    lines.push(`| Property | Value |`);
    lines.push(`|----------|-------|`);
    lines.push(`| **Plan ID** | \`${planId}\` |`);
    lines.push(`| **Progress** | ${stats.completed}/${stats.total} tasks |`);
    lines.push('');
  }
  
  // Group tasks by status
  const inProgress = todos.filter(t => t.status === 'in_progress');
  const pending = todos.filter(t => t.status === 'pending');
  const completed = todos.filter(t => t.status === 'completed');
  
  if (inProgress.length > 0) {
    lines.push('## In Progress');
    lines.push('');
    for (const todo of inProgress) {
      lines.push(`- ${STATUS_ICONS.in_progress} **${todo.content}**`);
    }
    lines.push('');
  }
  
  if (pending.length > 0) {
    lines.push('## Pending');
    lines.push('');
    for (const todo of pending) {
      lines.push(`- ${STATUS_ICONS.pending} ${todo.content}`);
    }
    lines.push('');
  }
  
  if (completed.length > 0) {
    lines.push('## Completed');
    lines.push('');
    for (const todo of completed) {
      lines.push(`- ${STATUS_ICONS.completed} ~~${todo.content}~~`);
    }
    lines.push('');
  }
  
  lines.push('---');
  lines.push('');
  
  if (isComplete) {
    lines.push('> **All tasks completed!** Use `VerifyTasks` to confirm all requirements are met.');
  } else if (planId) {
    lines.push('> Use `TodoWrite` to continue updating task statuses.');
  }

  return lines.join('\n');
}

export const todoWriteTool: ToolDefinition<TodoWriteArgsExtended> = {
  name: 'TodoWrite',
  description: `Update the task list for your current session. Shows progress to the user.

## CRITICAL: Include ALL Tasks
The todos array REPLACES the entire list. Always include ALL tasks, not just the current one.

### CORRECT (all tasks):
\`\`\`json
{ "todos": [
  { "id": "1", "content": "Analyze codebase", "status": "completed" },
  { "id": "2", "content": "Implement feature", "status": "in_progress" },
  { "id": "3", "content": "Write tests", "status": "pending" }
]}
\`\`\`

### WRONG (loses other tasks):
\`\`\`json
{ "todos": [{ "id": "2", "content": "Implement feature", "status": "in_progress" }]}
\`\`\`

## Task States
- **pending**: Not started yet
- **in_progress**: Currently working (ONE at a time)
- **completed**: Finished and verified

## When to Use
- Complex tasks (3+ steps)
- User provides multiple requirements
- To show progress on significant work
- After completing each major step

## With Plans (Persistent Storage)
Provide planId (from CreatePlan) to sync with persistent storage in .vyotiq/{task-name}/:
\`\`\`json
{ "planId": "plan-123", "todos": [...] }
\`\`\`

## Workflow Integration
This is the DO step in Plan-Do-Check-Act:
\`\`\`
CreatePlan → get planId
TodoWrite → update as you work (include ALL tasks)
VerifyTasks → check completion
\`\`\`

## Best Practices
- Update after completing each task
- Keep only ONE task in_progress at a time
- Include description and targetFiles for complex tasks
- Always include ALL tasks in every call`,

  requiresApproval: false,
  category: 'agent-internal',

  schema: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        description: 'The COMPLETE updated todo list. IMPORTANT: Include ALL tasks every time, not just the current one. This array replaces the entire task list.',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique identifier for the todo item',
            },
            content: {
              type: 'string',
              description: 'Description of the task',
            },
            status: {
              type: 'string',
              description: 'Current status of the task',
              enum: ['pending', 'in_progress', 'completed'],
            },
            description: {
              type: 'string',
              description: 'Optional detailed description of what needs to be done',
            },
            targetFiles: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional list of files that will be modified for this task',
            },
          },
          required: ['id', 'content', 'status'],
        },
      },
      planId: {
        type: 'string',
        description: 'Optional: Plan ID from CreatePlan to sync with persistent storage',
      },
    },
    required: ['todos'],
  },

  // Input examples for improved LLM accuracy
  inputExamples: [
    {
      todos: [
        { id: '1', content: 'Analyze existing codebase structure', status: 'completed' },
        { id: '2', content: 'Create new component file', status: 'in_progress' },
        { id: '3', content: 'Add unit tests', status: 'pending' },
        { id: '4', content: 'Update documentation', status: 'pending' },
      ],
    },
    {
      todos: [
        { id: 'task-1', content: 'Read and understand the current implementation', status: 'completed' },
        { id: 'task-2', content: 'Implement the new feature', status: 'in_progress', targetFiles: ['src/components/Feature.tsx'] },
        { id: 'task-3', content: 'Run tests and fix any failures', status: 'pending' },
      ],
      planId: 'plan-1234567890-abc123',
    },
  ],

  // Search keywords for tool discovery
  searchKeywords: ['todo', 'task', 'checklist', 'progress', 'plan', 'organize', 'track'],

  // Risk level - safe as it only manages internal state
  riskLevel: 'safe',

  // UI metadata
  ui: {
    icon: 'ListTodo',
    label: 'Todo',
    color: 'text-[var(--color-accent-primary)]',
    runningLabel: 'Updating tasks',
    completedLabel: 'Tasks updated',
  },

  async execute(args: TodoWriteArgsExtended, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { planId } = args;
    let { todos } = args;
    const { sessionId, runId, logger, emitEvent, workspacePath } = context;

    if (!sessionId) {
      return {
        toolName: 'TodoWrite',
        success: false,
        output: 'Error: No session ID provided. Cannot track todos without a session context.',
      };
    }

    if (!runId) {
      return {
        toolName: 'TodoWrite',
        success: false,
        output: 'Error: No run ID provided. Cannot track todos without a run context.',
      };
    }

    // Handle parse errors from JSON parsing
    if (args._parseError) {
      return {
        toolName: 'TodoWrite',
        success: false,
        output: `Error: Failed to parse TodoWrite arguments. ${args._errorMessage || 'Please ensure the todos argument is a valid JSON array.'}\n\nExpected format:\n{\n  "todos": [\n    { "id": "1", "content": "Task description", "status": "pending" }\n  ]\n}`,
      };
    }

    // Handle case where todos is undefined or null
    if (todos === undefined || todos === null) {
      // Try to extract todos from other possible argument names
      const possibleTodoKeys = ['todo', 'tasks', 'items', 'list', 'todoList', 'taskList'];
      for (const key of possibleTodoKeys) {
        if (args[key] !== undefined && args[key] !== null) {
          const value = args[key];
          if (Array.isArray(value)) {
            todos = value as typeof todos;
            logger?.info('Found todos under alternative key', { key, count: todos.length });
            break;
          } else if (typeof value === 'object') {
            // Single todo object - wrap in array
            todos = [value as typeof todos[0]];
            logger?.info('Found single todo under alternative key, wrapping in array', { key });
            break;
          }
        }
      }
      
      if (todos === undefined || todos === null) {
        return {
          toolName: 'TodoWrite',
          success: false,
          output: 'Error: Missing required "todos" argument. Please provide an array of todo items.\n\nExpected format:\n{\n  "todos": [\n    { "id": "1", "content": "Task description", "status": "pending" }\n  ]\n}',
        };
      }
    }

    // Handle case where todos is a string (might be JSON that wasn't parsed)
    if (typeof todos === 'string') {
      const todosString = todos as string; // Store for error messages with explicit type
      try {
        const parsed = JSON.parse(todosString);
        if (Array.isArray(parsed)) {
          todos = parsed;
        } else if (typeof parsed === 'object' && parsed !== null) {
          // Single todo object - wrap in array
          todos = [parsed];
          logger?.info('Parsed single todo from string, wrapping in array');
        } else {
          const preview = todosString.length > 100 ? todosString.slice(0, 100) + '...' : todosString;
          return {
            toolName: 'TodoWrite',
            success: false,
            output: `Error: "todos" was provided as a string but did not parse to an array. Please provide todos as a JSON array, not a string.\n\nReceived: ${preview}`,
          };
        }
      } catch (parseError) {
        // Try to extract array from the string using bracket matching
        const arrayMatch = todosString.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          try {
            const extracted = JSON.parse(arrayMatch[0]);
            if (Array.isArray(extracted)) {
              todos = extracted;
              logger?.info('Extracted todos array from string using bracket matching');
            }
          } catch {
            // Fall through to error
          }
        }
        
        if (typeof todos === 'string') {
          const preview = todosString.length > 100 ? todosString.slice(0, 100) + '...' : todosString;
          return {
            toolName: 'TodoWrite',
            success: false,
            output: `Error: "todos" was provided as a string but failed to parse as JSON. Please provide todos as a valid JSON array.\n\nParse error: ${parseError instanceof Error ? parseError.message : String(parseError)}\n\nReceived: ${preview}`,
          };
        }
      }
    }

    // Handle case where todos is an object but not an array (single todo)
    if (typeof todos === 'object' && !Array.isArray(todos) && todos !== null) {
      const todoObj = todos as Record<string, unknown>;
      // Check if it looks like a single todo item
      if ('id' in todoObj || 'content' in todoObj || 'status' in todoObj) {
        todos = [todoObj as typeof todos[0]];
        logger?.info('Converted single todo object to array');
      } else {
        // Check if it has a nested todos/items array
        const nestedKeys = ['todos', 'items', 'tasks', 'list'];
        for (const key of nestedKeys) {
          if (Array.isArray(todoObj[key])) {
            todos = todoObj[key] as typeof todos;
            logger?.info('Extracted todos from nested key', { key });
            break;
          }
        }
      }
    }

    // Validate todos is an array
    if (!Array.isArray(todos)) {
      const receivedType = typeof todos;
      const preview = JSON.stringify(todos)?.slice(0, 200) || String(todos);
      return {
        toolName: 'TodoWrite',
        success: false,
        output: `Error: "todos" must be an array of todo items, but received ${receivedType}.\n\nReceived: ${preview}\n\nExpected format:\n{\n  "todos": [\n    { "id": "1", "content": "Task description", "status": "pending" }\n  ]\n}`,
      };
    }

    // Handle empty array
    if (todos.length === 0) {
      // Empty array is valid - it clears the todo list
      const todoManager = getTodoManager();
      todoManager.clearTodos(sessionId);
      
      return {
        toolName: 'TodoWrite',
        success: true,
        output: 'Todo list cleared.',
        metadata: {
          stats: { total: 0, pending: 0, inProgress: 0, completed: 0, completionPercentage: 0 },
          todoCount: 0,
          planId: planId || null,
          persistentSyncSuccess: false,
        },
      };
    }

    // Validate and normalize each todo item
    const normalizedTodos: Array<{
      id: string;
      content: string;
      status: 'pending' | 'in_progress' | 'completed';
      description?: string;
      targetFiles?: string[];
    }> = [];
    
    for (let i = 0; i < todos.length; i++) {
      const todo = todos[i];
      
      // Check if todo is an object
      if (!todo || typeof todo !== 'object' || Array.isArray(todo)) {
        return {
          toolName: 'TodoWrite',
          success: false,
          output: `Error: Todo item at index ${i} is not a valid object. Each todo must be an object with id, content, and status properties.\n\nReceived: ${JSON.stringify(todo)}`,
        };
      }

      // Normalize id - generate if missing
      let id = todo.id;
      if (!id || typeof id !== 'string') {
        if (typeof id === 'number') {
          id = String(id);
        } else {
          id = `todo-${i + 1}-${Date.now()}`;
          logger?.info('Generated missing todo id', { index: i, generatedId: id });
        }
      }
      
      // Normalize content - try alternative field names
      let content = todo.content;
      if (!content || typeof content !== 'string') {
        const contentKeys = ['text', 'description', 'title', 'task', 'name', 'message'];
        for (const key of contentKeys) {
          const todoRecord = todo as Record<string, unknown>;
          if (todoRecord[key] && typeof todoRecord[key] === 'string') {
            content = todoRecord[key] as string;
            break;
          }
        }
      }
      
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return {
          toolName: 'TodoWrite',
          success: false,
          output: `Error: Todo item at index ${i} (id: ${id}) must have non-empty 'content'. Received: ${JSON.stringify(todo)}`,
        };
      }
      
      // Normalize status - handle various formats
      let status = todo.status;
      if (typeof status !== 'string') {
        status = 'pending'; // Default to pending
      } else {
        // Normalize status values
        const statusLower = status.toLowerCase().trim();
        if (statusLower === 'in_progress' || statusLower === 'inprogress' || statusLower === 'in-progress' || statusLower === 'working' || statusLower === 'active') {
          status = 'in_progress';
        } else if (statusLower === 'completed' || statusLower === 'complete' || statusLower === 'done' || statusLower === 'finished') {
          status = 'completed';
        } else if (statusLower === 'pending' || statusLower === 'todo' || statusLower === 'not_started' || statusLower === 'notstarted') {
          status = 'pending';
        } else {
          // Unknown status - default to pending with warning
          logger?.warn('Unknown todo status, defaulting to pending', { originalStatus: status, todoId: id });
          status = 'pending';
        }
      }
      
      normalizedTodos.push({
        id,
        content: content.trim(),
        status: status as 'pending' | 'in_progress' | 'completed',
        description: todo.description,
        targetFiles: todo.targetFiles,
      });
    }

    // Check for duplicate IDs
    const ids = normalizedTodos.map(t => t.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      // Auto-fix duplicates by appending index
      const seenIds = new Set<string>();
      for (let i = 0; i < normalizedTodos.length; i++) {
        if (seenIds.has(normalizedTodos[i].id)) {
          const newId = `${normalizedTodos[i].id}-${i}`;
          logger?.info('Fixed duplicate todo id', { originalId: normalizedTodos[i].id, newId });
          normalizedTodos[i].id = newId;
        }
        seenIds.add(normalizedTodos[i].id);
      }
    }

    // Warn if multiple tasks are in_progress (but don't fail)
    const inProgressCount = normalizedTodos.filter(t => t.status === 'in_progress').length;
    let warning = '';
    if (inProgressCount > 1) {
      warning = `\nWarning: ${inProgressCount} tasks are marked as in_progress. Best practice is to have only ONE task in_progress at a time.`;
    }

    try {
      const todoManager = getTodoManager();
      const now = Date.now();

      // Convert to TodoItem format with timestamps
      const todoItems: TodoItem[] = normalizedTodos.map(t => ({
        id: t.id,
        content: t.content,
        status: t.status,
        createdAt: now,
        updatedAt: now,
      }));

      // Update the in-memory todo list
      const updatedList = todoManager.updateTodos(sessionId, runId, todoItems);

      // If planId is provided and workspace is available, sync with persistent storage
      let persistentSyncSuccess = false;
      if (planId && workspacePath) {
        try {
          const taskManager = getTaskManager();
          const session = await taskManager.updateTasks(workspacePath, {
            planId,
            tasks: normalizedTodos.map(t => ({
              id: t.id,
              content: t.content,
              status: t.status,
              description: t.description,
              targetFiles: t.targetFiles,
            })),
          });
          
          if (session) {
            persistentSyncSuccess = true;
            logger?.info('Synced todos with persistent plan', {
              planId,
              sessionId,
              taskCount: normalizedTodos.length,
            });
          }
        } catch (syncError) {
          logger?.warn('Failed to sync with persistent plan', {
            planId,
            error: syncError instanceof Error ? syncError.message : String(syncError),
          });
          warning += `\nNote: Could not sync with plan ${planId}. Changes saved to in-memory only.`;
        }
      }

      // Calculate stats
      const stats = calculateTodoStats(updatedList.todos);

      // Emit event to renderer for UI update
      if (emitEvent) {
        emitEvent({
          type: 'todo-update',
          sessionId,
          runId,
          todos: updatedList.todos,
          planId: planId || undefined,
          timestamp: now,
        } as unknown as import('../../../shared/types').RendererEvent);
      }

      logger?.info('Todo list updated', {
        sessionId,
        runId,
        todoCount: normalizedTodos.length,
        stats,
        planId: planId || null,
        persistentSyncSuccess,
      });

      const output = formatTodoOutput(updatedList.todos, stats, planId) + warning;

      return {
        toolName: 'TodoWrite',
        success: true,
        output,
        metadata: {
          stats,
          todoCount: normalizedTodos.length,
          planId: planId || null,
          persistentSyncSuccess,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger?.error('Failed to update todo list', { error: errorMessage, sessionId, runId });

      return {
        toolName: 'TodoWrite',
        success: false,
        output: `Error updating todo list: ${errorMessage}`,
      };
    }
  },
};
