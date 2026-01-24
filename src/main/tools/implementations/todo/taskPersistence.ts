/**
 * Task Persistence Manager
 * 
 * Handles persistent storage of task sessions in .vyotiq/{TASK_NAME} folders.
 * Provides file-based storage for task plans, progress, and verification history.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TaskSession, TaskItem, UserPlan, VerificationAttempt } from '../../../../shared/types/todoTask';
import { sanitizeFolderName, calculateTaskStats } from '../../../../shared/types/todoTask';
import { createLogger } from '../../../logger';
import { generatePlanMarkdown } from './planMarkdownGenerator';

const logger = createLogger('TaskPersistence');

const VYOTIQ_FOLDER = '.vyotiq';
const TASK_FILE = 'task.json';
const PLAN_FILE = 'plan.md';
const HISTORY_FILE = 'history.json';

/**
 * Validate that a folder name is safe for filesystem operations
 */
function isValidFolderName(name: string): boolean {
  if (!name || name.length === 0) return false;
  if (name.length > 100) return false;
  // Check for invalid characters (including control characters \x00-\x1f)
  // eslint-disable-next-line no-control-regex
  if (/[<>:"/\\|?*\x00-\x1f]/.test(name)) return false;
  // Check for reserved names on Windows
  const reserved = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
  if (reserved.includes(name.toUpperCase())) return false;
  // Check for path traversal
  if (name.includes('..') || name.startsWith('.')) return false;
  return true;
}

/**
 * Validate that a loaded session has the required structure
 */
function isValidTaskSession(session: unknown): session is TaskSession {
  if (!session || typeof session !== 'object') return false;
  const s = session as Record<string, unknown>;
  
  // Check required fields
  if (typeof s.id !== 'string' || !s.id) return false;
  if (typeof s.taskName !== 'string' || !s.taskName) return false;
  if (typeof s.folderName !== 'string' || !s.folderName) return false;
  if (typeof s.workspacePath !== 'string') return false;
  if (typeof s.createdAt !== 'number') return false;
  if (typeof s.updatedAt !== 'number') return false;
  if (typeof s.iterationCount !== 'number') return false;
  
  // Check plan
  if (!s.plan || typeof s.plan !== 'object') return false;
  const plan = s.plan as Record<string, unknown>;
  if (typeof plan.id !== 'string' || !plan.id) return false;
  if (typeof plan.originalRequest !== 'string') return false;
  if (!Array.isArray(plan.requirements)) return false;
  
  // Check tasks array
  if (!Array.isArray(s.tasks)) return false;
  
  // Check stats
  if (!s.stats || typeof s.stats !== 'object') return false;
  
  // Check verification history
  if (!Array.isArray(s.verificationHistory)) return false;
  
  return true;
}

/**
 * TaskPersistenceManager - Handles file-based task storage
 */
export class TaskPersistenceManager {
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Get the .vyotiq folder path
   */
  private getVyotiqPath(): string {
    return path.join(this.workspacePath, VYOTIQ_FOLDER);
  }

  /**
   * Get the task folder path for a specific task
   */
  private getTaskFolderPath(folderName: string): string {
    return path.join(this.getVyotiqPath(), folderName);
  }

  /**
   * Ensure the .vyotiq folder exists
   */
  private ensureVyotiqFolder(): void {
    const vyotiqPath = this.getVyotiqPath();
    if (!fs.existsSync(vyotiqPath)) {
      fs.mkdirSync(vyotiqPath, { recursive: true });
    }
  }

  /**
   * Ensure a task folder exists
   */
  private ensureTaskFolder(folderName: string): string {
    this.ensureVyotiqFolder();
    const taskPath = this.getTaskFolderPath(folderName);
    if (!fs.existsSync(taskPath)) {
      fs.mkdirSync(taskPath, { recursive: true });
    }
    return taskPath;
  }

  /**
   * Save a task session to disk
   * Saves both JSON (for programmatic access) and Markdown (for human readability)
   */
  async saveTaskSession(session: TaskSession): Promise<void> {
    const taskFolder = this.ensureTaskFolder(session.folderName);
    
    // Save main task file (JSON for programmatic access)
    const taskFilePath = path.join(taskFolder, TASK_FILE);
    await fs.promises.writeFile(
      taskFilePath,
      JSON.stringify(session, null, 2),
      'utf-8'
    );

    // Save plan as beautiful markdown file
    const planFilePath = path.join(taskFolder, PLAN_FILE);
    const planMarkdown = generatePlanMarkdown(session);
    await fs.promises.writeFile(
      planFilePath,
      planMarkdown,
      'utf-8'
    );

    // Save verification history (JSON for now, could be markdown later)
    if (session.verificationHistory.length > 0) {
      const historyFilePath = path.join(taskFolder, HISTORY_FILE);
      await fs.promises.writeFile(
        historyFilePath,
        JSON.stringify(session.verificationHistory, null, 2),
        'utf-8'
      );
    }
  }

  /**
   * Load a task session from disk
   */
  async loadTaskSession(folderName: string): Promise<TaskSession | null> {
    // Validate folder name before filesystem access
    if (!isValidFolderName(folderName)) {
      logger.warn('Invalid folder name for task session', { folderName });
      return null;
    }

    const taskFolder = this.getTaskFolderPath(folderName);
    const taskFilePath = path.join(taskFolder, TASK_FILE);

    if (!fs.existsSync(taskFilePath)) {
      return null;
    }

    try {
      const content = await fs.promises.readFile(taskFilePath, 'utf-8');
      const parsed = JSON.parse(content);
      
      // Validate the loaded session structure
      if (!isValidTaskSession(parsed)) {
        logger.warn('Invalid task session structure', { folderName, taskFilePath });
        return null;
      }
      
      return parsed;
    } catch (error) {
      logger.error('Failed to load task session', { 
        folderName, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return null;
    }
  }

  /**
   * Load a task session by plan ID
   */
  async loadTaskSessionByPlanId(planId: string): Promise<TaskSession | null> {
    const sessions = await this.listTaskSessions();
    return sessions.find(s => s.plan.id === planId) || null;
  }

  /**
   * List all task sessions in the workspace
   */
  async listTaskSessions(): Promise<TaskSession[]> {
    const vyotiqPath = this.getVyotiqPath();
    
    if (!fs.existsSync(vyotiqPath)) {
      return [];
    }

    const sessions: TaskSession[] = [];
    const entries = await fs.promises.readdir(vyotiqPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const session = await this.loadTaskSession(entry.name);
        if (session) {
          sessions.push(session);
        }
      }
    }

    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Create a new task session
   */
  async createTaskSession(
    taskName: string,
    plan: UserPlan,
    tasks: TaskItem[]
  ): Promise<TaskSession> {
    let folderName = sanitizeFolderName(taskName);
    
    // Validate the sanitized folder name
    if (!isValidFolderName(folderName)) {
      // Generate a fallback folder name
      folderName = `task-${Date.now()}`;
      logger.warn('Invalid folder name after sanitization, using fallback', { 
        originalName: taskName, 
        fallbackName: folderName 
      });
    }
    
    const now = Date.now();

    // Check if folder already exists, append timestamp if so
    let finalFolderName = folderName;
    let counter = 1;
    while (fs.existsSync(this.getTaskFolderPath(finalFolderName))) {
      finalFolderName = `${folderName}-${counter}`;
      counter++;
      // Safety limit to prevent infinite loop
      if (counter > 100) {
        finalFolderName = `${folderName}-${now}`;
        break;
      }
    }

    const session: TaskSession = {
      id: `session-${now}-${Math.random().toString(36).substring(2, 9)}`,
      taskName,
      folderName: finalFolderName,
      plan,
      tasks,
      stats: calculateTaskStats(tasks),
      workspacePath: this.workspacePath,
      createdAt: now,
      updatedAt: now,
      iterationCount: 1,
      verificationHistory: [],
    };

    await this.saveTaskSession(session);
    return session;
  }

  /**
   * Update tasks in a session
   */
  async updateTasks(
    folderName: string,
    tasks: TaskItem[]
  ): Promise<TaskSession | null> {
    const session = await this.loadTaskSession(folderName);
    if (!session) {
      return null;
    }

    session.tasks = tasks;
    session.stats = calculateTaskStats(tasks);
    session.updatedAt = Date.now();

    // Update plan completion percentage
    session.plan.completionPercentage = session.stats.completionPercentage;
    session.plan.isCompleted = session.stats.completionPercentage === 100;
    session.plan.updatedAt = Date.now();

    await this.saveTaskSession(session);
    return session;
  }

  /**
   * Add a verification attempt to a session
   */
  async addVerificationAttempt(
    folderName: string,
    attempt: VerificationAttempt
  ): Promise<TaskSession | null> {
    const session = await this.loadTaskSession(folderName);
    if (!session) {
      return null;
    }

    session.verificationHistory.push(attempt);
    session.iterationCount++;
    session.updatedAt = Date.now();

    await this.saveTaskSession(session);
    return session;
  }

  /**
   * Get the most recent active task session for a workspace
   */
  async getActiveSession(): Promise<TaskSession | null> {
    const sessions = await this.listTaskSessions();
    
    // Find the most recent incomplete session
    const activeSession = sessions.find(s => !s.plan.isCompleted);
    return activeSession || null;
  }

  /**
   * Delete a task session
   */
  async deleteTaskSession(folderName: string): Promise<boolean> {
    const taskFolder = this.getTaskFolderPath(folderName);
    
    if (!fs.existsSync(taskFolder)) {
      return false;
    }

    try {
      await fs.promises.rm(taskFolder, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Export a task session to markdown
   * Uses the enhanced markdown generator for beautiful output
   */
  async exportToMarkdown(folderName: string): Promise<string | null> {
    const session = await this.loadTaskSession(folderName);
    if (!session) {
      return null;
    }

    return generatePlanMarkdown(session);
  }

  /**
   * Get the path to the plan markdown file
   */
  getPlanMarkdownPath(folderName: string): string {
    return path.join(this.getTaskFolderPath(folderName), PLAN_FILE);
  }
}

// Singleton instances per workspace
const persistenceManagers = new Map<string, TaskPersistenceManager>();

/**
 * Get or create a TaskPersistenceManager for a workspace
 */
export function getTaskPersistenceManager(workspacePath: string): TaskPersistenceManager {
  if (!persistenceManagers.has(workspacePath)) {
    persistenceManagers.set(workspacePath, new TaskPersistenceManager(workspacePath));
  }
  return persistenceManagers.get(workspacePath)!;
}

/**
 * Clear all persistence managers (for testing)
 */
export function clearPersistenceManagers(): void {
  persistenceManagers.clear();
}
