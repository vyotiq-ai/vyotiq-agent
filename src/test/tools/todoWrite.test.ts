/**
 * TodoWrite Tool Tests
 * 
 * Tests for the todo/task tracking tool functionality.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { todoWriteTool } from '../../main/tools/implementations/todoWrite';
import { getTodoManager, resetTodoManager } from '../../main/tools/implementations/todo';
import type { ToolExecutionContext } from '../../main/tools/types';

// Mock context
const createMockContext = (overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext => ({
  workspacePath: '/test/workspace',
  cwd: '/test/workspace',
  terminalManager: {
    run: vi.fn(),
    getOutput: vi.fn(),
    kill: vi.fn(),
    killAll: vi.fn().mockResolvedValue(0),
    on: vi.fn().mockReturnThis(),
  } as unknown as ToolExecutionContext['terminalManager'],
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  sessionId: 'test-session-123',
  runId: 'test-run-456',
  emitEvent: vi.fn(),
  ...overrides,
});

describe('TodoWrite Tool', () => {
  beforeEach(() => {
    resetTodoManager();
  });

  describe('Tool Definition', () => {
    it('should have correct name and category', () => {
      expect(todoWriteTool.name).toBe('TodoWrite');
      expect(todoWriteTool.category).toBe('agent-internal');
      expect(todoWriteTool.requiresApproval).toBe(false);
    });

    it('should have proper schema', () => {
      expect(todoWriteTool.schema.type).toBe('object');
      expect(todoWriteTool.schema.properties.todos).toBeDefined();
      expect(todoWriteTool.schema.required).toContain('todos');
    });

    it('should have input examples', () => {
      expect(todoWriteTool.inputExamples).toBeDefined();
      expect(todoWriteTool.inputExamples!.length).toBeGreaterThan(0);
    });
  });

  describe('Execution', () => {
    it('should create a new todo list', async () => {
      const context = createMockContext();
      const result = await todoWriteTool.execute({
        todos: [
          { id: '1', content: 'First task', status: 'pending' },
          { id: '2', content: 'Second task', status: 'pending' },
        ],
      }, context);

      expect(result.success).toBe(true);
      // New markdown format shows progress bar and task sections
      expect(result.output).toContain('Task Progress');
      expect(result.output).toContain('0%');
      expect(result.output).toContain('First task');
      expect(result.output).toContain('Second task');
      expect(result.metadata?.todoCount).toBe(2);
    });

    it('should update todo status', async () => {
      const context = createMockContext();
      
      // Create initial list
      await todoWriteTool.execute({
        todos: [
          { id: '1', content: 'First task', status: 'pending' },
          { id: '2', content: 'Second task', status: 'pending' },
        ],
      }, context);

      // Update with one completed
      const result = await todoWriteTool.execute({
        todos: [
          { id: '1', content: 'First task', status: 'completed' },
          { id: '2', content: 'Second task', status: 'in_progress' },
        ],
      }, context);

      expect(result.success).toBe(true);
      // New markdown format shows progress bar with percentage and task sections
      expect(result.output).toContain('Task Progress');
      expect(result.output).toContain('50%');
      expect(result.output).toContain('In Progress');
      expect(result.output).toContain('Completed');
    });

    it('should emit todo-update event', async () => {
      const emitEvent = vi.fn();
      const context = createMockContext({ emitEvent });

      await todoWriteTool.execute({
        todos: [
          { id: '1', content: 'Test task', status: 'pending' },
        ],
      }, context);

      expect(emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'todo-update',
          sessionId: 'test-session-123',
          runId: 'test-run-456',
        })
      );
    });

    it('should fail without session ID', async () => {
      const context = createMockContext({ sessionId: undefined });
      const result = await todoWriteTool.execute({
        todos: [{ id: '1', content: 'Task', status: 'pending' }],
      }, context);

      expect(result.success).toBe(false);
      expect(result.output).toContain('No session ID');
    });

    it('should fail without run ID', async () => {
      const context = createMockContext({ runId: undefined });
      const result = await todoWriteTool.execute({
        todos: [{ id: '1', content: 'Task', status: 'pending' }],
      }, context);

      expect(result.success).toBe(false);
      expect(result.output).toContain('No run ID');
    });

    it('should validate todo items', async () => {
      const context = createMockContext();

      // Missing ID - now auto-generates ID
      const result1 = await todoWriteTool.execute({
        todos: [{ id: '', content: 'Task', status: 'pending' }],
      }, context);
      expect(result1.success).toBe(true); // Auto-generates ID now

      // Empty content - still fails
      const result2 = await todoWriteTool.execute({
        todos: [{ id: '1', content: '', status: 'pending' }],
      }, context);
      expect(result2.success).toBe(false);

      // Invalid status - now normalizes to 'pending'
      const result3 = await todoWriteTool.execute({
        todos: [{ id: '1', content: 'Task', status: 'invalid' as 'pending' }],
      }, context);
      expect(result3.success).toBe(true); // Normalizes invalid status to 'pending'
    });

    it('should detect duplicate IDs', async () => {
      const context = createMockContext();
      const result = await todoWriteTool.execute({
        todos: [
          { id: '1', content: 'First task', status: 'pending' },
          { id: '1', content: 'Duplicate ID', status: 'pending' },
        ],
      }, context);

      // Now auto-fixes duplicate IDs instead of failing
      expect(result.success).toBe(true);
      // New markdown format shows task progress header
      expect(result.output).toContain('Task Progress');
    });

    it('should warn about multiple in_progress tasks', async () => {
      const context = createMockContext();
      const result = await todoWriteTool.execute({
        todos: [
          { id: '1', content: 'First task', status: 'in_progress' },
          { id: '2', content: 'Second task', status: 'in_progress' },
        ],
      }, context);

      expect(result.success).toBe(true);
      expect(result.output).toContain('Warning');
      expect(result.output).toContain('2 tasks are marked as in_progress');
    });
  });

  describe('TodoManager', () => {
    it('should store and retrieve todos', () => {
      const manager = getTodoManager();
      const sessionId = 'session-1';
      const runId = 'run-1';

      manager.updateTodos(sessionId, runId, [
        { id: '1', content: 'Task 1', status: 'pending', createdAt: Date.now(), updatedAt: Date.now() },
      ]);

      const todos = manager.getTodosForRun(sessionId, runId);
      expect(todos.length).toBe(1);
      expect(todos[0].content).toBe('Task 1');
    });

    it('should clear todos for a session', () => {
      const manager = getTodoManager();
      const sessionId = 'session-1';
      const runId = 'run-1';

      manager.updateTodos(sessionId, runId, [
        { id: '1', content: 'Task 1', status: 'pending', createdAt: Date.now(), updatedAt: Date.now() },
      ]);

      manager.clearTodos(sessionId);
      const todos = manager.getTodosForRun(sessionId, runId);
      expect(todos.length).toBe(0);
    });

    it('should get current in-progress task', () => {
      const manager = getTodoManager();
      const sessionId = 'session-1';
      const runId = 'run-1';

      manager.updateTodos(sessionId, runId, [
        { id: '1', content: 'Completed', status: 'completed', createdAt: Date.now(), updatedAt: Date.now() },
        { id: '2', content: 'In Progress', status: 'in_progress', createdAt: Date.now(), updatedAt: Date.now() },
        { id: '3', content: 'Pending', status: 'pending', createdAt: Date.now(), updatedAt: Date.now() },
      ]);

      const current = manager.getCurrentTask(sessionId);
      expect(current?.content).toBe('In Progress');
    });

    it('should get next pending task', () => {
      const manager = getTodoManager();
      const sessionId = 'session-1';
      const runId = 'run-1';

      manager.updateTodos(sessionId, runId, [
        { id: '1', content: 'Completed', status: 'completed', createdAt: Date.now(), updatedAt: Date.now() },
        { id: '2', content: 'First Pending', status: 'pending', createdAt: Date.now(), updatedAt: Date.now() },
        { id: '3', content: 'Second Pending', status: 'pending', createdAt: Date.now(), updatedAt: Date.now() },
      ]);

      const next = manager.getNextPendingTask(sessionId);
      expect(next?.content).toBe('First Pending');
    });
  });
});
