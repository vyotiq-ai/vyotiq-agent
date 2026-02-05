import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { WorkspaceEntry, WorkspaceTab, MultiWorkspaceState } from '../../shared/types';
import { createLogger } from '../logger';

const logger = createLogger('WorkspaceManager');

interface WorkspaceStoreShape {
  entries: WorkspaceEntry[];
  /** Multi-workspace tab state for concurrent workspace support */
  multiWorkspace?: MultiWorkspaceState;
}

const defaultStore: WorkspaceStoreShape = {
  entries: [],
  multiWorkspace: {
    tabs: [],
    focusedTabId: null,
    maxTabs: 10,
    persistTabs: true,
    orderStrategy: 'chronological',
  },
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
    // Also remove from open tabs if present
    await this.closeTab(id);
    await this.persist();
    return this.store.entries;
  }

  // =============================================================================
  // Multi-Workspace Tab Management
  // =============================================================================

  /**
   * Get current multi-workspace state
   */
  getMultiWorkspaceState(): MultiWorkspaceState {
    // Initialize if not present (migration from older versions)
    if (!this.store.multiWorkspace) {
      this.store.multiWorkspace = {
        tabs: [],
        focusedTabId: null,
        maxTabs: 10,
        persistTabs: true,
        orderStrategy: 'chronological',
      };
    }
    return this.store.multiWorkspace;
  }

  /**
   * Get all currently open workspace tabs
   */
  getOpenTabs(): WorkspaceTab[] {
    return this.getMultiWorkspaceState().tabs;
  }

  /**
   * Get the currently focused workspace tab
   */
  getFocusedTab(): WorkspaceTab | undefined {
    const state = this.getMultiWorkspaceState();
    return state.tabs.find(tab => tab.workspaceId === state.focusedTabId);
  }

  /**
   * Get focused workspace ID (for backward compatibility with single-workspace pattern)
   */
  getFocusedWorkspaceId(): string | null {
    return this.getMultiWorkspaceState().focusedTabId;
  }

  /**
   * Open a workspace in a new tab (or focus existing tab if already open)
   */
  async openTab(workspaceId: string): Promise<WorkspaceTab[]> {
    const workspace = this.store.entries.find(e => e.id === workspaceId);
    if (!workspace) {
      logger.warn('Cannot open tab: workspace not found', { workspaceId });
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    // Validate workspace path
    if (!await this.isValidPath(workspace.path)) {
      logger.warn('Cannot open tab: workspace path invalid', { workspaceId, path: workspace.path });
      throw new Error(`Workspace path invalid: ${workspace.path}`);
    }

    const state = this.getMultiWorkspaceState();
    
    // Check if tab already exists
    const existingTab = state.tabs.find(tab => tab.workspaceId === workspaceId);
    if (existingTab) {
      // Focus existing tab
      return this.focusTab(workspaceId);
    }

    // Check max tabs limit
    if (state.tabs.length >= state.maxTabs) {
      // Close least recently focused tab (excluding currently focused)
      const sortedTabs = [...state.tabs]
        .filter(t => t.workspaceId !== state.focusedTabId)
        .sort((a, b) => a.lastFocusedAt - b.lastFocusedAt);
      
      if (sortedTabs.length > 0) {
        await this.closeTab(sortedTabs[0].workspaceId);
      } else {
        logger.warn('Cannot open new tab: max tabs reached', { maxTabs: state.maxTabs });
        throw new Error(`Maximum tabs (${state.maxTabs}) reached`);
      }
    }

    const now = Date.now();
    const newOrder = state.tabs.length > 0 
      ? Math.max(...state.tabs.map(t => t.order)) + 1 
      : 0;

    const newTab: WorkspaceTab = {
      workspaceId,
      order: newOrder,
      isFocused: true,
      openedAt: now,
      lastFocusedAt: now,
      hasUnsavedChanges: false,
      isRunning: false,
    };

    // Unfocus all other tabs
    state.tabs = state.tabs.map(tab => ({
      ...tab,
      isFocused: false,
    }));

    state.tabs.push(newTab);
    state.focusedTabId = workspaceId;

    // Also set as active workspace for backward compatibility
    await this.setActive(workspaceId);

    await this.persist();
    logger.info('Opened workspace tab', { workspaceId, tabCount: state.tabs.length });
    
    return state.tabs;
  }

  /**
   * Close a workspace tab
   */
  async closeTab(workspaceId: string): Promise<WorkspaceTab[]> {
    const state = this.getMultiWorkspaceState();
    const tabIndex = state.tabs.findIndex(tab => tab.workspaceId === workspaceId);
    
    if (tabIndex === -1) {
      logger.debug('Tab not found for closing', { workspaceId });
      return state.tabs;
    }

    const wasFocused = state.tabs[tabIndex].isFocused;
    state.tabs.splice(tabIndex, 1);

    // If closed tab was focused, focus another tab
    if (wasFocused && state.tabs.length > 0) {
      // Focus the tab to the left, or the first tab
      const newFocusIndex = Math.max(0, tabIndex - 1);
      state.tabs[newFocusIndex].isFocused = true;
      state.tabs[newFocusIndex].lastFocusedAt = Date.now();
      state.focusedTabId = state.tabs[newFocusIndex].workspaceId;
      
      // Update active workspace for backward compatibility
      await this.setActive(state.focusedTabId);
    } else if (state.tabs.length === 0) {
      state.focusedTabId = null;
    }

    await this.persist();
    logger.info('Closed workspace tab', { workspaceId, remainingTabs: state.tabs.length });
    
    return state.tabs;
  }

  /**
   * Focus a specific workspace tab
   */
  async focusTab(workspaceId: string): Promise<WorkspaceTab[]> {
    const state = this.getMultiWorkspaceState();
    const tab = state.tabs.find(t => t.workspaceId === workspaceId);
    
    if (!tab) {
      logger.warn('Cannot focus tab: not found', { workspaceId });
      // Try to open it as a new tab instead
      return this.openTab(workspaceId);
    }

    const now = Date.now();
    state.tabs = state.tabs.map(t => ({
      ...t,
      isFocused: t.workspaceId === workspaceId,
      lastFocusedAt: t.workspaceId === workspaceId ? now : t.lastFocusedAt,
    }));
    state.focusedTabId = workspaceId;

    // Update active workspace for backward compatibility
    await this.setActive(workspaceId);

    await this.persist();
    logger.debug('Focused workspace tab', { workspaceId });
    
    return state.tabs;
  }

  /**
   * Reorder tabs (move a tab to a new position)
   */
  async reorderTabs(workspaceId: string, newOrder: number): Promise<WorkspaceTab[]> {
    const state = this.getMultiWorkspaceState();
    const tab = state.tabs.find(t => t.workspaceId === workspaceId);
    
    if (!tab) {
      logger.warn('Cannot reorder: tab not found', { workspaceId });
      return state.tabs;
    }

    // Clamp newOrder to valid range
    newOrder = Math.max(0, Math.min(newOrder, state.tabs.length - 1));
    const oldOrder = tab.order;

    // Shift other tabs
    state.tabs = state.tabs.map(t => {
      if (t.workspaceId === workspaceId) {
        return { ...t, order: newOrder };
      }
      if (t.order >= newOrder && t.order < oldOrder) {
        return { ...t, order: t.order + 1 };
      }
      if (t.order <= newOrder && t.order > oldOrder) {
        return { ...t, order: t.order - 1 };
      }
      return t;
    });

    // Sort by order
    state.tabs.sort((a, b) => a.order - b.order);

    await this.persist();
    logger.debug('Reordered tabs', { workspaceId, newOrder });
    
    return state.tabs;
  }

  /**
   * Update tab running status (for showing activity indicator)
   */
  async updateTabRunningStatus(workspaceId: string, isRunning: boolean): Promise<void> {
    const state = this.getMultiWorkspaceState();
    const tab = state.tabs.find(t => t.workspaceId === workspaceId);
    
    if (tab) {
      tab.isRunning = isRunning;
      // Don't persist for frequent status updates (performance)
    }
  }

  /**
   * Update tab unsaved changes status
   */
  async updateTabUnsavedStatus(workspaceId: string, hasUnsavedChanges: boolean): Promise<void> {
    const state = this.getMultiWorkspaceState();
    const tab = state.tabs.find(t => t.workspaceId === workspaceId);
    
    if (tab) {
      tab.hasUnsavedChanges = hasUnsavedChanges;
      // Don't persist for frequent status updates (performance)
    }
  }

  /**
   * Get workspaces with open tabs (for efficient multi-workspace operations)
   */
  getActiveWorkspaces(): WorkspaceEntry[] {
    const state = this.getMultiWorkspaceState();
    const openWorkspaceIds = new Set(state.tabs.map(t => t.workspaceId));
    return this.store.entries.filter(entry => openWorkspaceIds.has(entry.id));
  }

  /**
   * Check if a workspace has an open tab
   */
  isTabOpen(workspaceId: string): boolean {
    return this.getMultiWorkspaceState().tabs.some(t => t.workspaceId === workspaceId);
  }

  /**
   * Set max tabs limit
   */
  async setMaxTabs(maxTabs: number): Promise<void> {
    const state = this.getMultiWorkspaceState();
    state.maxTabs = Math.max(1, Math.min(20, maxTabs)); // Clamp between 1 and 20
    await this.persist();
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.store, null, 2), 'utf-8');
  }
}
