/**
 * Undo History Module
 * 
 * Tracks file changes made by the agent for undo/redo functionality.
 * Stores changes per session with the ability to undo individual changes
 * or entire runs.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { createLogger } from '../logger';

const logger = createLogger('UndoHistory');

// =============================================================================
// Types
// =============================================================================

/** Type of file operation */
export type FileChangeType = 'create' | 'modify' | 'delete';

/** Status of an undo entry */
export type UndoEntryStatus = 'undoable' | 'undone' | 'redoable';

/** Single file change entry */
export interface FileChange {
  /** Unique ID for this change */
  id: string;
  /** Session ID this change belongs to */
  sessionId: string;
  /** Run ID this change belongs to (for grouping) */
  runId: string;
  /** Absolute file path */
  filePath: string;
  /** Type of change */
  changeType: FileChangeType;
  /** Content before the change (null for new files) */
  previousContent: string | null;
  /** Content after the change (null for deleted files) */
  newContent: string | null;
  /** Tool that made the change */
  toolName: string;
  /** Human-readable description */
  description: string;
  /** Timestamp when change was made */
  timestamp: number;
  /** Current status of this entry */
  status: UndoEntryStatus;
}

/** Group of changes from a single run */
export interface RunChangeGroup {
  /** Run ID */
  runId: string;
  /** All changes in this run */
  changes: FileChange[];
  /** Timestamp of first change in run */
  startTime: number;
  /** Timestamp of last change in run */
  endTime: number;
  /** Total number of files affected */
  fileCount: number;
}

/** Result of an undo/redo operation */
export interface UndoResult {
  success: boolean;
  message: string;
  /** File path that was affected */
  filePath?: string;
  /** New status of the entry */
  newStatus?: UndoEntryStatus;
}

/** Result of undoing an entire run */
export interface UndoRunResult {
  success: boolean;
  message: string;
  /** Number of changes undone */
  count: number;
  /** Individual results */
  results: UndoResult[];
}

// =============================================================================
// Implementation
// =============================================================================

class UndoHistoryManager {
  /** In-memory storage of changes indexed by sessionId */
  private changes: Map<string, FileChange[]> = new Map();
  
  /** Maximum changes to keep per session */
  private readonly maxChangesPerSession = 100;
  
  /** Storage directory for persistent history */
  private storageDir: string | null = null;

  constructor() {
    this.initStorageDir();
  }

  /**
   * Initialize the storage directory
   */
  private async initStorageDir(): Promise<void> {
    try {
      const userDataPath = app.getPath('userData');
      this.storageDir = path.join(userDataPath, 'undo-history');
      await fs.mkdir(this.storageDir, { recursive: true });
      logger.info('Undo history storage initialized', { storageDir: this.storageDir });
    } catch (error) {
      logger.error('Failed to initialize storage directory', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  /**
   * Get the storage file path for a session
   */
  private getSessionFilePath(sessionId: string): string | null {
    if (!this.storageDir) return null;
    return path.join(this.storageDir, `${sessionId}.json`);
  }

  /**
   * Load session history from disk
   */
  private async loadSessionFromDisk(sessionId: string): Promise<FileChange[]> {
    const filePath = this.getSessionFilePath(sessionId);
    if (!filePath) return [];

    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const changes = JSON.parse(data) as FileChange[];
      logger.debug('Loaded session history from disk', { sessionId, count: changes.length });
      return changes;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('Failed to load session history', { 
          sessionId, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
      return [];
    }
  }

  /**
   * Save session history to disk
   */
  private async saveSessionToDisk(sessionId: string): Promise<void> {
    const filePath = this.getSessionFilePath(sessionId);
    if (!filePath) return;

    const changes = this.changes.get(sessionId) || [];
    
    try {
      await fs.writeFile(filePath, JSON.stringify(changes, null, 2), 'utf-8');
      logger.debug('Saved session history to disk', { sessionId, count: changes.length });
    } catch (error) {
      logger.error('Failed to save session history', { 
        sessionId, 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  /**
   * Get or load session changes
   */
  private async getSessionChanges(sessionId: string): Promise<FileChange[]> {
    if (!this.changes.has(sessionId)) {
      const loaded = await this.loadSessionFromDisk(sessionId);
      this.changes.set(sessionId, loaded);
    }
    return this.changes.get(sessionId) || [];
  }

  /**
   * Generate a unique change ID
   */
  private generateChangeId(): string {
    return `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Record a file change
   */
  async recordChange(
    sessionId: string,
    runId: string,
    filePath: string,
    changeType: FileChangeType,
    previousContent: string | null,
    newContent: string | null,
    toolName: string,
    description: string
  ): Promise<FileChange> {
    const changes = await this.getSessionChanges(sessionId);

    const change: FileChange = {
      id: this.generateChangeId(),
      sessionId,
      runId,
      filePath,
      changeType,
      previousContent,
      newContent,
      toolName,
      description,
      timestamp: Date.now(),
      status: 'undoable',
    };

    changes.push(change);

    // Trim if exceeds max
    if (changes.length > this.maxChangesPerSession) {
      changes.splice(0, changes.length - this.maxChangesPerSession);
    }

    this.changes.set(sessionId, changes);
    await this.saveSessionToDisk(sessionId);

    logger.info('Recorded file change', {
      sessionId,
      runId,
      filePath,
      changeType,
      toolName,
    });

    return change;
  }

  /**
   * Get all changes for a session
   */
  async getSessionHistory(sessionId: string): Promise<FileChange[]> {
    const changes = await this.getSessionChanges(sessionId);
    // Return newest first
    return [...changes].reverse();
  }

  /**
   * Get changes grouped by run
   */
  async getGroupedHistory(sessionId: string): Promise<RunChangeGroup[]> {
    const changes = await this.getSessionChanges(sessionId);
    const groups = new Map<string, FileChange[]>();

    for (const change of changes) {
      const existing = groups.get(change.runId) || [];
      existing.push(change);
      groups.set(change.runId, existing);
    }

    const result: RunChangeGroup[] = [];
    for (const [runId, runChanges] of groups) {
      const timestamps = runChanges.map(c => c.timestamp);
      const uniqueFiles = new Set(runChanges.map(c => c.filePath));

      result.push({
        runId,
        changes: runChanges,
        startTime: Math.min(...timestamps),
        endTime: Math.max(...timestamps),
        fileCount: uniqueFiles.size,
      });
    }

    // Sort by end time, newest first
    result.sort((a, b) => b.endTime - a.endTime);
    return result;
  }

  /**
   * Undo a single change
   */
  async undoChange(sessionId: string, changeId: string): Promise<UndoResult> {
    const changes = await this.getSessionChanges(sessionId);
    const changeIndex = changes.findIndex(c => c.id === changeId);

    if (changeIndex === -1) {
      return { success: false, message: 'Change not found' };
    }

    const change = changes[changeIndex];

    if (change.status !== 'undoable') {
      return { success: false, message: `Change is ${change.status}, cannot undo` };
    }

    try {
      // Perform the undo based on change type
      switch (change.changeType) {
        case 'create':
          // File was created, so delete it
          await fs.unlink(change.filePath);
          logger.info('Undid create: deleted file', { filePath: change.filePath });
          break;

        case 'modify':
          // File was modified, restore previous content
          if (change.previousContent !== null) {
            await fs.writeFile(change.filePath, change.previousContent, 'utf-8');
            logger.info('Undid modify: restored previous content', { filePath: change.filePath });
          }
          break;

        case 'delete':
          // File was deleted, restore it
          if (change.previousContent !== null) {
            const dir = path.dirname(change.filePath);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(change.filePath, change.previousContent, 'utf-8');
            logger.info('Undid delete: restored file', { filePath: change.filePath });
          }
          break;
      }

      // Update status
      change.status = 'undone';
      await this.saveSessionToDisk(sessionId);

      return {
        success: true,
        message: `Successfully undid: ${change.description}`,
        filePath: change.filePath,
        newStatus: 'undone',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to undo change', { changeId, error: errorMessage });
      return { success: false, message: `Failed to undo: ${errorMessage}` };
    }
  }

  /**
   * Redo a previously undone change
   */
  async redoChange(sessionId: string, changeId: string): Promise<UndoResult> {
    const changes = await this.getSessionChanges(sessionId);
    const changeIndex = changes.findIndex(c => c.id === changeId);

    if (changeIndex === -1) {
      return { success: false, message: 'Change not found' };
    }

    const change = changes[changeIndex];

    if (change.status !== 'undone') {
      return { success: false, message: `Change is ${change.status}, cannot redo` };
    }

    try {
      // Perform the redo based on change type
      switch (change.changeType) {
        case 'create':
          // Recreate the file
          if (change.newContent !== null) {
            const dir = path.dirname(change.filePath);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(change.filePath, change.newContent, 'utf-8');
            logger.info('Redid create: recreated file', { filePath: change.filePath });
          }
          break;

        case 'modify':
          // Apply the modification again
          if (change.newContent !== null) {
            await fs.writeFile(change.filePath, change.newContent, 'utf-8');
            logger.info('Redid modify: reapplied changes', { filePath: change.filePath });
          }
          break;

        case 'delete':
          // Delete the file again
          await fs.unlink(change.filePath);
          logger.info('Redid delete: deleted file', { filePath: change.filePath });
          break;
      }

      // Update status
      change.status = 'redoable';
      await this.saveSessionToDisk(sessionId);

      return {
        success: true,
        message: `Successfully redid: ${change.description}`,
        filePath: change.filePath,
        newStatus: 'redoable',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to redo change', { changeId, error: errorMessage });
      return { success: false, message: `Failed to redo: ${errorMessage}` };
    }
  }

  /**
   * Undo all changes from a specific run
   */
  async undoRun(sessionId: string, runId: string): Promise<UndoRunResult> {
    const changes = await this.getSessionChanges(sessionId);
    const runChanges = changes
      .filter(c => c.runId === runId && c.status === 'undoable')
      // Undo in reverse order (newest first)
      .reverse();

    if (runChanges.length === 0) {
      return { success: false, message: 'No undoable changes found for this run', count: 0, results: [] };
    }

    const results: UndoResult[] = [];
    let successCount = 0;

    for (const change of runChanges) {
      const result = await this.undoChange(sessionId, change.id);
      results.push(result);
      if (result.success) successCount++;
    }

    return {
      success: successCount === runChanges.length,
      message: `Undid ${successCount} of ${runChanges.length} changes`,
      count: successCount,
      results,
    };
  }

  /**
   * Get count of undoable changes for a session
   */
  async getUndoableCount(sessionId: string): Promise<number> {
    const changes = await this.getSessionChanges(sessionId);
    return changes.filter(c => c.status === 'undoable').length;
  }

  /**
   * Clear all history for a session
   */
  async clearSessionHistory(sessionId: string): Promise<void> {
    this.changes.delete(sessionId);
    
    const filePath = this.getSessionFilePath(sessionId);
    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.error('Failed to delete session history file', { sessionId });
        }
      }
    }

    logger.info('Cleared session history', { sessionId });
  }

  /**
   * Get the last change for a file path (for conflict detection)
   */
  async getLastChangeForFile(sessionId: string, filePath: string): Promise<FileChange | null> {
    const changes = await this.getSessionChanges(sessionId);
    const fileChanges = changes.filter(c => c.filePath === filePath);
    return fileChanges.length > 0 ? fileChanges[fileChanges.length - 1] : null;
  }
}

// Singleton instance
export const undoHistory = new UndoHistoryManager();

export default undoHistory;
