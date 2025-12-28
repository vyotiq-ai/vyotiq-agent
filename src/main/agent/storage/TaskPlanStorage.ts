/**
 * TaskPlanStorage
 *
 * Persists task plans and their history for sessions.
 * Enables task plan retrieval, step state updates, and history browsing.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { createLogger } from '../../logger';
import type { TaskPlan, SubTask } from '../../../shared/types';
import type { StorageResult } from './StorageManager';

const logger = createLogger('TaskPlanStorage');

/**
 * Task plan entry with metadata
 */
export interface TaskPlanEntry {
  plan: TaskPlan;
  createdAt: number;
  updatedAt: number;
  sessionId: string;
}

/**
 * Step update payload
 */
export interface StepUpdatePayload {
  planId: string;
  stepId: string;
  state?: SubTask['state'];
  result?: SubTask['result'];
  error?: string;
}

/**
 * TaskPlanStorage class for managing task plan persistence
 */
export class TaskPlanStorage {
  private readonly basePath: string;
  private readonly plans: Map<string, TaskPlanEntry> = new Map();
  private readonly sessionIndex: Map<string, Set<string>> = new Map(); // sessionId -> planIds
  private initialized = false;

  constructor(basePath?: string) {
    this.basePath = basePath ?? path.join(app.getPath('userData'), 'vyotiq-storage', 'task-plans');
  }

  /**
   * Initialize the storage
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.basePath, { recursive: true });
      await this.loadPlans();
      this.initialized = true;
      logger.info('TaskPlanStorage initialized', { 
        basePath: this.basePath,
        loadedPlans: this.plans.size 
      });
    } catch (error) {
      logger.error('Failed to initialize TaskPlanStorage', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Load existing plans from disk
   */
  private async loadPlans(): Promise<void> {
    try {
      const files = await fs.readdir(this.basePath);
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        try {
          const filePath = path.join(this.basePath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const entry = JSON.parse(content) as TaskPlanEntry;
          
          this.plans.set(entry.plan.id, entry);
          
          // Update session index
          if (!this.sessionIndex.has(entry.sessionId)) {
            this.sessionIndex.set(entry.sessionId, new Set());
          }
          this.sessionIndex.get(entry.sessionId)!.add(entry.plan.id);
        } catch {
          logger.warn('Failed to parse task plan file', { file });
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Save a task plan
   */
  async savePlan(plan: TaskPlan, sessionId: string): Promise<StorageResult<void>> {
    try {
      const entry: TaskPlanEntry = {
        plan,
        sessionId,
        createdAt: plan.createdAt,
        updatedAt: Date.now(),
      };

      // Save to memory
      this.plans.set(plan.id, entry);
      
      // Update session index
      if (!this.sessionIndex.has(sessionId)) {
        this.sessionIndex.set(sessionId, new Set());
      }
      this.sessionIndex.get(sessionId)!.add(plan.id);

      // Persist to disk
      const filePath = path.join(this.basePath, `${plan.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');

      logger.debug('Task plan saved', { planId: plan.id, sessionId });
      return { success: true };
    } catch (error) {
      logger.error('Failed to save task plan', {
        planId: plan.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Get a task plan by ID
   */
  async getPlan(planId: string): Promise<StorageResult<TaskPlan>> {
    const entry = this.plans.get(planId);
    if (!entry) {
      return { success: false, error: 'Plan not found' };
    }
    return { success: true, data: entry.plan };
  }

  /**
   * Get task plan history for a session
   */
  async getSessionHistory(sessionId: string, limit?: number): Promise<StorageResult<TaskPlan[]>> {
    const planIds = this.sessionIndex.get(sessionId);
    if (!planIds || planIds.size === 0) {
      return { success: true, data: [] };
    }

    const plans: TaskPlan[] = [];
    for (const planId of planIds) {
      const entry = this.plans.get(planId);
      if (entry) {
        plans.push(entry.plan);
      }
    }

    // Sort by creation time (newest first)
    plans.sort((a, b) => b.createdAt - a.createdAt);

    // Apply limit if specified
    const limited = limit ? plans.slice(0, limit) : plans;

    return { success: true, data: limited };
  }

  /**
   * Update a subtask step state
   */
  async updateStep(payload: StepUpdatePayload): Promise<StorageResult<TaskPlan>> {
    const entry = this.plans.get(payload.planId);
    if (!entry) {
      return { success: false, error: 'Plan not found' };
    }

    const subtaskIndex = entry.plan.subtasks.findIndex(s => s.id === payload.stepId);
    if (subtaskIndex === -1) {
      return { success: false, error: 'Step not found' };
    }

    // Update the subtask
    if (payload.state) {
      entry.plan.subtasks[subtaskIndex].state = payload.state;
    }
    if (payload.result !== undefined) {
      entry.plan.subtasks[subtaskIndex].result = payload.result;
    }

    // Recalculate plan progress
    const completed = entry.plan.subtasks.filter(s => s.state === 'completed').length;
    entry.plan.progress = Math.round((completed / entry.plan.subtasks.length) * 100);

    // Update plan state based on subtask states
    if (entry.plan.subtasks.every(s => s.state === 'completed')) {
      entry.plan.state = 'completed';
      entry.plan.completedAt = Date.now();
    } else if (entry.plan.subtasks.some(s => s.state === 'failed')) {
      entry.plan.state = 'failed';
    } else if (entry.plan.subtasks.some(s => s.state === 'in-progress')) {
      entry.plan.state = 'executing';
    }

    entry.updatedAt = Date.now();

    // Persist changes
    const filePath = path.join(this.basePath, `${payload.planId}.json`);
    await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');

    logger.debug('Step updated', { planId: payload.planId, stepId: payload.stepId, state: payload.state });
    return { success: true, data: entry.plan };
  }

  /**
   * Skip a step
   */
  async skipStep(planId: string, stepId: string, reason?: string): Promise<StorageResult<TaskPlan>> {
    return this.updateStep({
      planId,
      stepId,
      state: 'skipped',
      result: { success: false, output: reason || 'Skipped by user' },
    });
  }

  /**
   * Retry a failed step (reset it to pending)
   */
  async retryStep(planId: string, stepId: string): Promise<StorageResult<TaskPlan>> {
    const entry = this.plans.get(planId);
    if (!entry) {
      return { success: false, error: 'Plan not found' };
    }

    const subtask = entry.plan.subtasks.find(s => s.id === stepId);
    if (!subtask) {
      return { success: false, error: 'Step not found' };
    }

    // Only failed steps can be retried
    if (subtask.state !== 'failed') {
      return { success: false, error: 'Only failed steps can be retried' };
    }

    return this.updateStep({
      planId,
      stepId,
      state: 'pending',
      result: undefined,
    });
  }

  /**
   * Get the active plan for a session (most recent non-completed plan)
   */
  async getActivePlan(sessionId: string): Promise<StorageResult<TaskPlan | null>> {
    const result = await this.getSessionHistory(sessionId);
    if (!result.success || !result.data) {
      return { success: true, data: null };
    }

    const activePlan = result.data.find(p => 
      p.state === 'planning' || p.state === 'executing'
    );

    return { success: true, data: activePlan || null };
  }

  /**
   * Delete a plan
   */
  async deletePlan(planId: string): Promise<StorageResult<void>> {
    const entry = this.plans.get(planId);
    if (!entry) {
      return { success: false, error: 'Plan not found' };
    }

    // Remove from session index
    const sessionPlans = this.sessionIndex.get(entry.sessionId);
    if (sessionPlans) {
      sessionPlans.delete(planId);
    }

    // Remove from memory
    this.plans.delete(planId);

    // Delete file
    try {
      const filePath = path.join(this.basePath, `${planId}.json`);
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    logger.debug('Task plan deleted', { planId });
    return { success: true };
  }

  /**
   * Clear all plans for a session
   */
  async clearSessionPlans(sessionId: string): Promise<StorageResult<void>> {
    const planIds = this.sessionIndex.get(sessionId);
    if (!planIds) {
      return { success: true };
    }

    for (const planId of planIds) {
      await this.deletePlan(planId);
    }

    this.sessionIndex.delete(sessionId);
    return { success: true };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let taskPlanStorageInstance: TaskPlanStorage | null = null;

/**
 * Get the singleton TaskPlanStorage instance
 */
export function getTaskPlanStorage(): TaskPlanStorage {
  if (!taskPlanStorageInstance) {
    taskPlanStorageInstance = new TaskPlanStorage();
  }
  return taskPlanStorageInstance;
}

/**
 * Initialize the TaskPlanStorage singleton
 */
export async function initTaskPlanStorage(): Promise<TaskPlanStorage> {
  const storage = getTaskPlanStorage();
  await storage.initialize();
  return storage;
}

/**
 * Reset the singleton (for testing)
 */
export function resetTaskPlanStorage(): void {
  taskPlanStorageInstance = null;
}
