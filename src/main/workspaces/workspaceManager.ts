import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { WorkspaceEntry } from '../../shared/types';
import { createLogger } from '../logger';

const logger = createLogger('WorkspaceManager');

interface WorkspaceStoreShape {
  entries: WorkspaceEntry[];
}

const defaultStore: WorkspaceStoreShape = {
  entries: [],
};

export class WorkspaceManager {
  private store: WorkspaceStoreShape = defaultStore;

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      this.store = JSON.parse(raw);
      // Validate workspace paths exist on disk
      await this.validateWorkspaces();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        await this.persist();
        return;
      }
      throw error;
    }
  }

  /**
   * Validate that all workspace paths exist on disk.
   * Marks workspaces with missing paths as invalid but keeps them in the list
   * so users can choose to remove or update them.
   * Uses parallel checking for speed.
   */
  private async validateWorkspaces(): Promise<void> {
    // Check all workspace paths in parallel
    const validationResults = await Promise.all(
      this.store.entries.map(async (entry) => {
        try {
          const stat = await fs.stat(entry.path);
          return { entry, valid: stat.isDirectory() };
        } catch {
          return { entry, valid: false };
        }
      })
    );
    
    const invalidPaths = validationResults
      .filter(r => !r.valid)
      .map(r => r.entry.path);
    
    if (invalidPaths.length > 0) {
      logger.warn('Some workspace paths no longer exist', { invalidPaths });
      
      // Filter out invalid workspaces
      this.store.entries = this.store.entries.filter(
        entry => !invalidPaths.includes(entry.path)
      );
      
      // If active workspace was removed, set a new active one
      if (!this.store.entries.some(entry => entry.isActive) && this.store.entries.length > 0) {
        this.store.entries[0].isActive = true;
      }
      
      // Persist the cleaned-up list
      await this.persist();
      
      logger.info('Removed invalid workspaces', { 
        removedCount: invalidPaths.length, 
        remainingCount: this.store.entries.length 
      });
    }
  }

  /**
   * Check if a specific workspace path is valid (exists and is a directory)
   */
  async isValidPath(workspacePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(workspacePath);
      return stat.isDirectory();
    } catch (error) {
      logger.debug('Workspace path validation failed', {
        path: workspacePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  list(): WorkspaceEntry[] {
    return this.store.entries;
  }

  getActive(): WorkspaceEntry | undefined {
    return this.store.entries.find((entry) => entry.isActive);
  }

  async add(workspacePath: string): Promise<WorkspaceEntry[]> {
    // Validate the path exists before adding
    if (!await this.isValidPath(workspacePath)) {
      logger.error('Cannot add workspace: path does not exist or is not a directory', { path: workspacePath });
      throw new Error(`Cannot add workspace: path does not exist or is not a directory: ${workspacePath}`);
    }

    // Check if workspace already exists
    const existing = this.store.entries.find(entry => entry.path === workspacePath);
    if (existing) {
      // Just set it as active if it already exists
      return this.setActive(existing.id);
    }

    const entry: WorkspaceEntry = {
      id: randomUUID(),
      path: workspacePath,
      label: path.basename(workspacePath),
      lastOpenedAt: Date.now(),
      isActive: this.store.entries.length === 0,
    };
    this.store.entries = [entry, ...this.store.entries];
    await this.persist();
    return this.store.entries;
  }

  async setActive(id: string): Promise<WorkspaceEntry[]> {
    const targetEntry = this.store.entries.find(entry => entry.id === id);
    
    // Validate the target workspace path still exists
    if (targetEntry && !await this.isValidPath(targetEntry.path)) {
      logger.warn('Cannot activate workspace: path no longer exists', { 
        id, 
        path: targetEntry.path 
      });
      // Remove the invalid workspace
      await this.remove(id);
      return this.store.entries;
    }

    this.store.entries = this.store.entries.map((entry) => ({
      ...entry,
      isActive: entry.id === id,
      lastOpenedAt: entry.id === id ? Date.now() : entry.lastOpenedAt,
    }));
    await this.persist();
    return this.store.entries;
  }

  async remove(id: string): Promise<WorkspaceEntry[]> {
    this.store.entries = this.store.entries.filter((entry) => entry.id !== id);
    if (!this.store.entries.some((entry) => entry.isActive) && this.store.entries.length) {
      this.store.entries[0].isActive = true;
    }
    await this.persist();
    return this.store.entries;
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.store, null, 2), 'utf-8');
  }
}
