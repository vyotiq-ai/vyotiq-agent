/**
 * Task Manager
 * 
 * Central manager for the enhanced todo/task system.
 * Coordinates between in-memory state and persistent storage.
 * Provides context-aware task management for the agent.
 */
import type { 
  TaskSession, 
  TaskItem, 
  UserPlan, 
  VerificationResult,
  VerificationAttempt,
  TaskStats,
  CreatePlanArgs,
  UpdateTasksArgs,
  VerifyTasksArgs,
} from '../../../../shared/types/todoTask';
import { 
  generateTaskId, 
  generatePlanId, 
} from '../../../../shared/types/todoTask';
import { getTaskPersistenceManager, type TaskPersistenceManager } from './taskPersistence';
import type { TodoStatus } from '../../../../shared/types/todo';

/**
 * TaskManager - Singleton for managing task sessions
 */
export class TaskManager {
  /** In-memory cache of active sessions by workspace */
  private activeSessions = new Map<string, TaskSession>();
  /** Map of session ID to workspace path */
  private sessionWorkspaceMap = new Map<string, string>();

  /**
   * Check if a requirement is matched by a task content
   * Uses multiple matching strategies for better accuracy
   */
  private requirementMatchesTask(requirement: string, taskContent: string): boolean {
    const reqLower = requirement.toLowerCase();
    const taskLower = taskContent.toLowerCase();
    
    // Direct substring match (either direction)
    if (taskLower.includes(reqLower) || reqLower.includes(taskLower)) {
      return true;
    }
    
    // Extract key words (3+ chars, not common words)
    const commonWords = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'will', 'should', 'must', 'can', 'add', 'create', 'make', 'update', 'fix', 'implement']);
    const extractKeywords = (text: string): string[] => {
      return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3 && !commonWords.has(w));
    };
    
    const reqKeywords = extractKeywords(requirement);
    const taskKeywords = extractKeywords(taskContent);
    
    // Check for significant keyword overlap (at least 50% of requirement keywords)
    if (reqKeywords.length > 0) {
      const matchingKeywords = reqKeywords.filter(kw => 
        taskKeywords.some(tk => tk.includes(kw) || kw.includes(tk))
      );
      const matchRatio = matchingKeywords.length / reqKeywords.length;
      if (matchRatio >= 0.5) {
        return true;
      }
    }
    
    // Check for partial word matches (handles variations like "persist" vs "persistence")
    const reqWords = reqLower.split(/\s+/).filter(w => w.length >= 4);
    const taskWords = taskLower.split(/\s+/).filter(w => w.length >= 4);
    
    for (const reqWord of reqWords) {
      for (const taskWord of taskWords) {
        // Check if words share a common root (first 4 chars)
        if (reqWord.substring(0, 4) === taskWord.substring(0, 4)) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Get persistence manager for a workspace
   */
  private getPersistence(workspacePath: string): TaskPersistenceManager {
    return getTaskPersistenceManager(workspacePath);
  }

  /**
   * Create a new task plan from user request
   */
  async createPlan(
    workspacePath: string,
    args: CreatePlanArgs,
    sessionId: string,
    runId: string
  ): Promise<TaskSession> {
    const now = Date.now();
    
    // Parse requirements from user request if not provided
    const requirements = args.requirements || this.parseRequirements(args.userRequest);

    // Create the plan
    const plan: UserPlan = {
      id: generatePlanId(),
      originalRequest: args.userRequest,
      requirements,
      sessionId,
      runId,
      createdAt: now,
      updatedAt: now,
      isCompleted: false,
      completionPercentage: 0,
    };

    // Create initial tasks from requirements
    const tasks: TaskItem[] = requirements.map((req, index) => ({
      id: generateTaskId(),
      content: req,
      status: 'pending' as TodoStatus,
      planId: plan.id,
      createdAt: now,
      updatedAt: now,
      priority: index + 1,
    }));

    // Create and save the session
    const persistence = this.getPersistence(workspacePath);
    const session = await persistence.createTaskSession(args.taskName, plan, tasks);

    // Cache in memory
    this.activeSessions.set(session.id, session);
    this.sessionWorkspaceMap.set(session.id, workspacePath);

    return session;
  }

  /**
   * Parse requirements from a user request
   * Handles multiple formats: numbered lists, bullets, comma-separated, "and" conjunctions
   */
  private parseRequirements(userRequest: string): string[] {
    const requirements: string[] = [];
    
    // Split by common delimiters
    const lines = userRequest.split(/[\n\r]+/);
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Check for numbered items (1. 2. etc) - matches "1." or "1)"
      const numberedMatch = trimmed.match(/^\d+[.)]\s*(.+)/);
      if (numberedMatch) {
        requirements.push(numberedMatch[1].trim());
        continue;
      }
      
      // Check for bullet points
      const bulletMatch = trimmed.match(/^[-*•]\s*(.+)/);
      if (bulletMatch) {
        requirements.push(bulletMatch[1].trim());
        continue;
      }
      
      // Check for comma-separated items (only if no periods - likely a list)
      if (trimmed.includes(',') && !trimmed.includes('.')) {
        const items = trimmed.split(',').map(s => s.trim()).filter(s => s.length > 3);
        if (items.length > 1) {
          requirements.push(...items);
          continue;
        }
      }
      
      // Check for "and" conjunctions that indicate multiple requirements
      // e.g., "Add dark mode and persist settings and update UI"
      if (trimmed.toLowerCase().includes(' and ') && !trimmed.includes('.')) {
        const andParts = trimmed.split(/\s+and\s+/i).map(s => s.trim()).filter(s => s.length > 5);
        if (andParts.length > 1) {
          requirements.push(...andParts);
          continue;
        }
      }
      
      // Check for "also" keyword indicating additional requirement
      // e.g., "Fix the bug, also add tests"
      if (trimmed.toLowerCase().includes(', also ') || trimmed.toLowerCase().includes('. also ')) {
        const alsoParts = trimmed.split(/[,.]?\s*also\s+/i).map(s => s.trim()).filter(s => s.length > 5);
        if (alsoParts.length > 1) {
          requirements.push(...alsoParts);
          continue;
        }
      }
      
      // Add as single requirement if it's a reasonable length
      if (trimmed.length > 10 && trimmed.length < 500) {
        requirements.push(trimmed);
      }
    }

    // If no requirements parsed, treat the whole request as one requirement
    if (requirements.length === 0 && userRequest.trim().length > 0) {
      requirements.push(userRequest.trim());
    }

    // Deduplicate requirements (case-insensitive)
    const seen = new Set<string>();
    const uniqueRequirements = requirements.filter(req => {
      const lower = req.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });

    return uniqueRequirements;
  }

  /**
   * Update tasks in a session
   */
  async updateTasks(
    workspacePath: string,
    args: UpdateTasksArgs
  ): Promise<TaskSession | null> {
    // Find the session by plan ID
    const persistence = this.getPersistence(workspacePath);
    let session = await persistence.loadTaskSessionByPlanId(args.planId);
    
    if (!session) {
      return null;
    }

    const now = Date.now();

    // Update existing tasks and add new ones
    const updatedTasks: TaskItem[] = [];

    for (const taskUpdate of args.tasks) {
      const existing = session.tasks.find(t => t.id === taskUpdate.id);
      
      if (existing) {
        // Update existing task
        const statusChanged = existing.status !== taskUpdate.status;
        updatedTasks.push({
          ...existing,
          content: taskUpdate.content,
          status: taskUpdate.status,
          description: taskUpdate.description ?? existing.description,
          targetFiles: taskUpdate.targetFiles ?? existing.targetFiles,
          complexity: taskUpdate.complexity ?? existing.complexity,
          dependencies: taskUpdate.dependencies ?? existing.dependencies,
          updatedAt: statusChanged ? now : existing.updatedAt,
          // Track time if transitioning to completed
          timeSpentMs: statusChanged && taskUpdate.status === 'completed' && existing.status === 'in_progress'
            ? now - existing.updatedAt
            : existing.timeSpentMs,
        });
      } else {
        // New task
        updatedTasks.push({
          id: taskUpdate.id,
          content: taskUpdate.content,
          status: taskUpdate.status,
          planId: args.planId,
          description: taskUpdate.description,
          targetFiles: taskUpdate.targetFiles,
          complexity: taskUpdate.complexity,
          dependencies: taskUpdate.dependencies,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Keep tasks that weren't in the update (preserve history)
    for (const task of session.tasks) {
      if (!args.tasks.find(t => t.id === task.id)) {
        updatedTasks.push(task);
      }
    }

    // Save updated session
    session = await persistence.updateTasks(session.folderName, updatedTasks);
    
    if (session) {
      this.activeSessions.set(session.id, session);
    }

    return session;
  }

  /**
   * Verify tasks against the original plan
   */
  async verifyTasks(
    workspacePath: string,
    args: VerifyTasksArgs
  ): Promise<VerificationResult> {
    const persistence = this.getPersistence(workspacePath);
    const session = await persistence.loadTaskSessionByPlanId(args.planId);

    if (!session) {
      return {
        success: false,
        completionPercentage: 0,
        passedTasks: [],
        failedTasks: [],
        unmetRequirements: [],
        suggestedTasks: [],
        notes: 'Task session not found',
      };
    }

    const tasksToVerify = args.taskIds 
      ? session.tasks.filter(t => args.taskIds!.includes(t.id))
      : session.tasks;

    const passedTasks: TaskItem[] = [];
    const failedTasks: TaskItem[] = [];
    const unmetRequirements: string[] = [];

    // Check each task
    for (const task of tasksToVerify) {
      if (task.status === 'completed') {
        // Mark as verified
        task.verificationStatus = 'verified';
        passedTasks.push(task);
      } else {
        task.verificationStatus = 'failed';
        failedTasks.push(task);
      }
    }

    // Check requirements coverage using improved matching
    for (const req of session.plan.requirements) {
      const hasMatchingTask = session.tasks.some(t => 
        t.status === 'completed' && this.requirementMatchesTask(req, t.content)
      );
      
      if (!hasMatchingTask) {
        unmetRequirements.push(req);
      }
    }

    // Generate suggested tasks for unmet requirements
    const suggestedTasks: Array<{
      content: string;
      description: string;
      targetFiles?: string[];
    }> = unmetRequirements.map(req => ({
      content: `Complete: ${req}`,
      description: `This requirement from the original plan has not been addressed: "${req}"`,
    }));

    // Add suggestions for failed tasks
    for (const task of failedTasks) {
      if (task.status === 'pending') {
        suggestedTasks.push({
          content: task.content,
          description: `This task was not started: "${task.content}"`,
          targetFiles: task.targetFiles,
        });
      } else if (task.status === 'in_progress') {
        suggestedTasks.push({
          content: `Complete: ${task.content}`,
          description: `This task was started but not completed: "${task.content}"`,
          targetFiles: task.targetFiles,
        });
      }
    }

    const completionPercentage = tasksToVerify.length > 0
      ? Math.round((passedTasks.length / tasksToVerify.length) * 100)
      : 0;

    const success = completionPercentage === 100 && unmetRequirements.length === 0;

    // Record verification attempt
    const attempt: VerificationAttempt = {
      id: `verify-${Date.now()}`,
      timestamp: Date.now(),
      passedTasks: passedTasks.map(t => t.id),
      failedTasks: failedTasks.map(t => t.id),
      newTasksCreated: [],
      result: success ? 'success' : (passedTasks.length > 0 ? 'partial' : 'failed'),
      notes: success 
        ? 'All tasks completed and requirements met'
        : `${failedTasks.length} tasks incomplete, ${unmetRequirements.length} requirements unmet`,
    };

    await persistence.addVerificationAttempt(session.folderName, attempt);

    // Update task verification statuses
    await persistence.updateTasks(session.folderName, session.tasks);

    return {
      success,
      completionPercentage,
      passedTasks,
      failedTasks,
      unmetRequirements,
      suggestedTasks,
      notes: attempt.notes,
    };
  }

  /**
   * Get the active task session for a workspace
   */
  async getActiveSession(workspacePath: string): Promise<TaskSession | null> {
    const persistence = this.getPersistence(workspacePath);
    return persistence.getActiveSession();
  }

  /**
   * Get a task session by ID
   */
  async getSession(sessionId: string): Promise<TaskSession | null> {
    // Check cache first
    if (this.activeSessions.has(sessionId)) {
      return this.activeSessions.get(sessionId)!;
    }

    // Try to find in workspace
    const workspacePath = this.sessionWorkspaceMap.get(sessionId);
    if (workspacePath) {
      const persistence = this.getPersistence(workspacePath);
      const sessions = await persistence.listTaskSessions();
      const session = sessions.find(s => s.id === sessionId);
      if (session) {
        this.activeSessions.set(sessionId, session);
        return session;
      }
    }

    return null;
  }

  /**
   * Get a task session by plan ID
   */
  async getSessionByPlanId(workspacePath: string, planId: string): Promise<TaskSession | null> {
    const persistence = this.getPersistence(workspacePath);
    return persistence.loadTaskSessionByPlanId(planId);
  }

  /**
   * List all task sessions for a workspace
   */
  async listSessions(workspacePath: string): Promise<TaskSession[]> {
    const persistence = this.getPersistence(workspacePath);
    return persistence.listTaskSessions();
  }

  /**
   * Get task statistics for a session
   */
  async getStats(workspacePath: string, planId: string): Promise<TaskStats | null> {
    const session = await this.getSessionByPlanId(workspacePath, planId);
    if (!session) {
      return null;
    }
    return session.stats;
  }

  /**
   * Export a task session to markdown
   */
  async exportToMarkdown(workspacePath: string, folderName: string): Promise<string | null> {
    const persistence = this.getPersistence(workspacePath);
    return persistence.exportToMarkdown(folderName);
  }

  /**
   * Delete a task session
   */
  async deleteSession(workspacePath: string, folderName: string): Promise<boolean> {
    const persistence = this.getPersistence(workspacePath);
    const session = await persistence.loadTaskSession(folderName);
    
    if (session) {
      this.activeSessions.delete(session.id);
      this.sessionWorkspaceMap.delete(session.id);
    }

    return persistence.deleteTaskSession(folderName);
  }

  /**
   * Clear all cached sessions (for testing)
   */
  clearCache(): void {
    this.activeSessions.clear();
    this.sessionWorkspaceMap.clear();
  }
}

// Singleton instance
let taskManagerInstance: TaskManager | null = null;

/**
 * Get the singleton TaskManager instance
 */
export function getTaskManager(): TaskManager {
  if (!taskManagerInstance) {
    taskManagerInstance = new TaskManager();
  }
  return taskManagerInstance;
}

/**
 * Reset the TaskManager (for testing)
 */
export function resetTaskManager(): void {
  if (taskManagerInstance) {
    taskManagerInstance.clearCache();
  }
  taskManagerInstance = null;
}
