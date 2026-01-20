import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { AgentConfig, AgentSessionState, StartSessionPayload, ConversationBranch, SessionSummary } from '../../shared/types';
import type { InternalSession } from './types';
import type { WorkspaceManager } from '../workspaces/workspaceManager';
import { SessionStorage } from './storage';
import { createLogger } from '../logger';
import { cleanupSession } from './context/ToolContextManager';


const logger = createLogger('SessionManager');

export interface SessionManagerConfig {
  /** Legacy sessions.json file path for migration */
  legacySessionsPath?: string;
  /** Base directory for session storage */
  storageBasePath: string;
}

/** Default debounce interval for session persistence (ms) */
const PERSIST_DEBOUNCE_MS = 1000;

/** Maximum time to wait before forcing persistence (ms) */
const PERSIST_MAX_WAIT_MS = 5000;

export class SessionManager {
  private sessions = new Map<string, InternalSession>();
  private storage: SessionStorage;
  private initialized = false;
  
  /** Debounce timers for session persistence to avoid excessive disk I/O */
  private persistDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  
  /** Track when each session was last persisted */
  private lastPersistTime = new Map<string, number>();
  
  /** Pending sessions that need to be persisted */
  private pendingPersist = new Set<string>();

  constructor(
    private readonly workspaceManager: WorkspaceManager,
    private readonly storagePath?: string
  ) {
    // Initialize session storage with the base path
    const basePath = storagePath ? path.dirname(storagePath) : process.cwd();
    this.storage = new SessionStorage({
      storagePath: basePath,
      maxSessionAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      enableAutoCleanup: true,
    });
  }

  async load(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Initialize storage system
      await this.storage.initialize();
      
      // Try to migrate from legacy single-file storage
      if (this.storagePath) {
        const migratedCount = await this.storage.migrateFromLegacyStorage(this.storagePath);
        if (migratedCount > 0) {
          logger.info('Migrated sessions from legacy storage', { count: migratedCount });
        }
      }
      
      // Load all sessions into memory
      const activeWorkspace = this.workspaceManager.getActive();
      const sessions = await this.storage.loadAllSessions();
      
      // Debug: Log usage data availability in loaded sessions
      const sessionsWithUsage = sessions.filter(s => 
        s.messages.some(m => m.usage)
      );
      logger.info('Loading sessions from storage', { 
        count: sessions.length,
        sessionsWithUsage: sessionsWithUsage.length,
      });
      if (sessions.length > 0 && sessionsWithUsage.length === 0) {
        logger.warn('No sessions have usage data - metrics dashboard will show empty', {
          sampleSession: sessions[0] ? {
            id: sessions[0].id,
            messageCount: sessions[0].messages.length,
            assistantMessages: sessions[0].messages.filter(m => m.role === 'assistant').length,
          } : null,
        });
      }
      
      this.sessions.clear();
      let migratedCount = 0;
      
      for (const sessionState of sessions) {
        let needsSave = false;

        // Migrate legacy sessions without workspaceId
        if (!sessionState.workspaceId && activeWorkspace) {
          sessionState.workspaceId = activeWorkspace.id;
          migratedCount++;
          needsSave = true;
          logger.info('Migrated legacy session to workspace', {
            sessionId: sessionState.id,
            workspaceId: activeWorkspace.id,
          });
        }

        // Rehydrate session
        this.sessions.set(sessionState.id, {
          state: sessionState,
        });

        if (needsSave) {
          await this.storage.saveSession(sessionState);
        }
      }
      
      logger.info('Sessions loaded successfully', {
        total: sessions.length,
        migrated: migratedCount,
      });
      
      this.initialized = true;
    } catch (error) {
      logger.error('Failed to load sessions', { error: error instanceof Error ? error.message : String(error) });
      this.initialized = true; // Mark as initialized to prevent retry loops
    }
  }

  /**
   * Persist session state to disk.
   * This saves the session to its individual file.
   * Should be called after any state change that needs to be preserved.
   */
  public async persist(): Promise<void> {
    // With the new storage system, persistence happens per-session
    // This method is kept for backward compatibility
    // The actual persistence is done in updateSessionState
    await this.storage.flush();
  }

  /**
   * Persist a specific session to disk immediately.
   */
  private async persistSessionImmediate(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await this.storage.saveSession(session.state);
      this.lastPersistTime.set(sessionId, Date.now());
      this.pendingPersist.delete(sessionId);
    }
  }

  /**
   * Schedule debounced persistence for a session.
   * This reduces disk I/O by batching multiple updates within the debounce window.
   */
  private schedulePersist(sessionId: string, immediate = false): void {
    // If immediate persistence requested, skip debouncing
    if (immediate) {
      const existingTimer = this.persistDebounceTimers.get(sessionId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        this.persistDebounceTimers.delete(sessionId);
      }
      this.persistSessionImmediate(sessionId).catch(err => {
        logger.error('Failed to persist session immediately', {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
      return;
    }

    // Mark session as pending persistence
    this.pendingPersist.add(sessionId);

    // Check if we've exceeded max wait time since last persist
    const lastPersist = this.lastPersistTime.get(sessionId) ?? 0;
    const timeSinceLastPersist = Date.now() - lastPersist;
    
    if (timeSinceLastPersist >= PERSIST_MAX_WAIT_MS) {
      // Force immediate persistence if we've waited too long
      const existingTimer = this.persistDebounceTimers.get(sessionId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        this.persistDebounceTimers.delete(sessionId);
      }
      this.persistSessionImmediate(sessionId).catch(err => {
        logger.error('Failed to persist session (max wait exceeded)', {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
      return;
    }

    // Clear existing timer if any
    const existingTimer = this.persistDebounceTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new debounced persistence
    const timer = setTimeout(() => {
      this.persistDebounceTimers.delete(sessionId);
      this.persistSessionImmediate(sessionId).catch(err => {
        logger.error('Failed to persist session (debounced)', {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, PERSIST_DEBOUNCE_MS);

    this.persistDebounceTimers.set(sessionId, timer);
  }

  /**
   * Flush all pending session persistence immediately.
   * Call this before app shutdown or when immediate persistence is critical.
   */
  async flushPendingPersistence(): Promise<void> {
    const pendingSessions = Array.from(this.pendingPersist);
    
    // Clear all debounce timers
    for (const [sessionId, timer] of this.persistDebounceTimers) {
      clearTimeout(timer);
      this.persistDebounceTimers.delete(sessionId);
    }

    // Persist all pending sessions in parallel
    await Promise.all(
      pendingSessions.map(sessionId => 
        this.persistSessionImmediate(sessionId).catch(err => {
          logger.error('Failed to flush session persistence', {
            sessionId,
            error: err instanceof Error ? err.message : String(err),
          });
        })
      )
    );
  }

  createSession(payload: StartSessionPayload, defaultConfig: AgentConfig): InternalSession {
    const sessionId = randomUUID();
    const config: AgentConfig = { ...defaultConfig, ...payload.initialConfig };
    
    // Get workspace ID - explicit from payload takes priority, then active workspace
    // This ensures every session is bound to a specific workspace
    let workspaceId = payload.workspaceId ?? this.workspaceManager.getActive()?.id;
    
    // Validate the workspaceId exists - REQUIRED for new sessions
    if (workspaceId) {
      const workspaceExists = this.workspaceManager.list().some(w => w.id === workspaceId);
      if (!workspaceExists) {
        logger.warn('Workspace not found, using active workspace instead', {
          requestedWorkspaceId: workspaceId,
        });
        workspaceId = this.workspaceManager.getActive()?.id;
      }
    }
    
    // STRICT: Require a workspace for session creation
    if (!workspaceId) {
      logger.error('Cannot create session without a workspace');
      throw new Error('Cannot create session: No workspace selected. Please select a workspace first.');
    }
    
    const session: InternalSession = {
      state: {
        id: sessionId,
        title: 'New Session',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        workspaceId,
        config,
        status: 'idle',
        messages: [],
      },
    };

    this.sessions.set(sessionId, session);
    
    // Persist immediately for session creation (critical operation)
    this.schedulePersist(sessionId, true);
    
    return session;
  }

  /**
   * Update session state and schedule debounced persistence.
   * This is the primary method for updating session state.
   * Persistence is debounced to reduce disk I/O during rapid updates.
   */
  updateSessionState(sessionId: string, update: Partial<AgentSessionState>): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.state = { ...session.state, ...update, updatedAt: Date.now() };
      // Schedule debounced persistence to reduce disk I/O
      this.schedulePersist(sessionId, false);
    }
  }

  /**
   * Update session state and wait for persistence to complete.
   * Use this when you need to ensure data is saved before continuing.
   */
  async updateSessionStateAsync(sessionId: string, update: Partial<AgentSessionState>): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.state = { ...session.state, ...update, updatedAt: Date.now() };
      // Immediate persistence for critical updates
      await this.persistSessionImmediate(sessionId);
    }
  }

  /**
   * Update session state with immediate persistence.
   * Use this for critical updates that must be persisted immediately (e.g., session creation, deletion).
   */
  updateSessionStateImmediate(sessionId: string, update: Partial<AgentSessionState>): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.state = { ...session.state, ...update, updatedAt: Date.now() };
      // Schedule immediate persistence
      this.schedulePersist(sessionId, true);
    }
  }

  /**
   * Edit a user message and truncate the conversation from that point.
   * This allows the user to resend with different content.
   * Returns the truncated messages for creating a branch if needed.
   */
  editMessage(
    sessionId: string,
    messageId: string,
    newContent: string
  ): { success: boolean; truncatedMessages?: AgentSessionState['messages']; error?: string } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const messageIndex = session.state.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) {
      return { success: false, error: 'Message not found' };
    }

    const message = session.state.messages[messageIndex];
    if (message.role !== 'user') {
      return { success: false, error: 'Can only edit user messages' };
    }

    // Store truncated messages for potential branching
    const truncatedMessages = session.state.messages.slice(messageIndex + 1);

    // Update the message content and truncate conversation
    session.state.messages[messageIndex] = {
      ...message,
      content: newContent,
      updatedAt: Date.now(),
    };
    session.state.messages = session.state.messages.slice(0, messageIndex + 1);
    session.state.updatedAt = Date.now();

    // Schedule debounced persistence (message edits are user-triggered, debounce is fine)
    this.schedulePersist(sessionId, false);

    return { success: true, truncatedMessages };
  }

  getSession(sessionId: string): InternalSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): AgentSessionState[] {
    return Array.from(this.sessions.values())
      .map((session) => session.state)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Get all sessions that have an active run (status === 'running')
   * Used by orchestrator for recovery/self-healing system state
   */
  getAllActiveSessions(): AgentSessionState[] {
    return Array.from(this.sessions.values())
      .filter((session) => session.state.status === 'running')
      .map((session) => session.state)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Get sessions filtered by workspace ID
   * Returns all sessions that belong to the specified workspace
   */
  getSessionsByWorkspace(workspaceId: string): AgentSessionState[] {
    return Array.from(this.sessions.values())
      .filter((session) => session.state.workspaceId === workspaceId)
      .map((session) => session.state)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Get session summaries for lazy loading (sidebar display without full message content)
   * This is much faster for workspaces with many sessions or long conversations
   */
  async getSessionSummaries(workspaceId?: string): Promise<SessionSummary[]> {
    return this.storage.getSessionSummaries(workspaceId);
  }

  /**
   * Get sessions for the currently active workspace
   */
  getActiveWorkspaceSessions(): AgentSessionState[] {
    const activeWorkspace = this.workspaceManager.getActive();
    if (!activeWorkspace) return [];
    return this.getSessionsByWorkspace(activeWorkspace.id);
  }

  /**
   * Delete a session by ID.
   */
  deleteSession(sessionId: string): boolean {
    const result = this.sessions.delete(sessionId);
    if (result) {
      // Clean up session-specific data
      void this.storage.deleteSession(sessionId);
      // Clean up session tool state (agent-requested tools), cache entries, and free memory
      // Note: cleanupSession now handles cache clearing internally
      const cleanupStats = cleanupSession(sessionId);
      if (cleanupStats) {
        logger.info('Session cleanup completed during deletion', {
          sessionId,
          requestedToolsCleared: cleanupStats.requestedToolsCleared,
          discoveredToolsCleared: cleanupStats.discoveredToolsCleared,
          cacheEntriesCleared: cleanupStats.cacheEntriesCleared,
          cacheBytesFreed: cleanupStats.cacheBytesFreed,
        });
      }
    }
    return result;
  }

  /**
   * Get a session's workspace path.
   * This resolves the workspaceId to an actual path.
   */
  getSessionWorkspacePath(sessionId: string): string | undefined {
    const session = this.sessions.get(sessionId);
    if (!session?.state.workspaceId) return undefined;
    
    const workspace = this.workspaceManager.list().find(
      w => w.id === session.state.workspaceId
    );
    return workspace?.path;
  }

  /**
   * Validate that a session's workspace still exists and is valid.
   */
  validateSessionWorkspace(sessionId: string): { valid: boolean; workspacePath?: string; error?: string } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { valid: false, error: 'Session not found' };
    }
    
    if (!session.state.workspaceId) {
      return { valid: false, error: 'Session has no workspace binding' };
    }
    
    const workspace = this.workspaceManager.list().find(
      w => w.id === session.state.workspaceId
    );
    
    if (!workspace) {
      return { valid: false, error: `Workspace ${session.state.workspaceId} not found` };
    }
    
    return { valid: true, workspacePath: workspace.path };
  }

  /**
   * Get storage statistics
   */
  getStorageStats(): { sessionCount: number; workspaceSessionCounts: Record<string, number> } {
    const workspaceSessionCounts: Record<string, number> = {};
    
    for (const session of this.sessions.values()) {
      const wsId = session.state.workspaceId ?? 'unassigned';
      workspaceSessionCounts[wsId] = (workspaceSessionCounts[wsId] ?? 0) + 1;
    }
    
    return {
      sessionCount: this.sessions.size,
      workspaceSessionCounts,
    };
  }

  /**
   * Force flush all pending persistence operations
   */
  async flush(): Promise<void> {
    await this.storage.flush();
  }

  /**
   * Create a new conversation branch from a specific message.
   */
  createBranch(
    sessionId: string,
    forkPointMessageId: string,
    branchName?: string
  ): { success: boolean; branch?: ConversationBranch; error?: string } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    // Find the fork point message
    const messageIndex = session.state.messages.findIndex(m => m.id === forkPointMessageId);
    if (messageIndex === -1) {
      return { success: false, error: 'Fork point message not found' };
    }

    // Initialize branches array if not exists
    if (!session.state.branches) {
      session.state.branches = [];
    }

    // Generate branch name if not provided
    const branchNumber = session.state.branches.length + 1;
    const name = branchName || `Branch ${branchNumber}`;

    const branch: ConversationBranch = {
      id: `branch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      parentBranchId: session.state.activeBranchId ?? null,
      forkPointMessageId,
      name,
      createdAt: Date.now(),
    };

    session.state.branches.push(branch);
    session.state.activeBranchId = branch.id;
    session.state.updatedAt = Date.now();

    // Schedule immediate persistence for branch creation (structural change)
    this.schedulePersist(sessionId, true);

    return { success: true, branch };
  }

  /**
   * Switch to a different branch.
   */
  switchBranch(sessionId: string, branchId: string | null): { success: boolean; error?: string } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    // Validate branch exists (if not null/main)
    if (branchId !== null) {
      const branchExists = session.state.branches?.some(b => b.id === branchId);
      if (!branchExists) {
        return { success: false, error: 'Branch not found' };
      }
    }

    session.state.activeBranchId = branchId ?? undefined;
    session.state.updatedAt = Date.now();

    // Schedule debounced persistence for branch switch
    this.schedulePersist(sessionId, false);

    return { success: true };
  }

  /**
   * Delete a branch.
   */
  deleteBranch(sessionId: string, branchId: string): { success: boolean; error?: string } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    if (!session.state.branches) {
      return { success: false, error: 'No branches exist' };
    }

    const branchIndex = session.state.branches.findIndex(b => b.id === branchId);
    if (branchIndex === -1) {
      return { success: false, error: 'Branch not found' };
    }

    // Remove the branch
    session.state.branches.splice(branchIndex, 1);

    // If active branch was deleted, switch to main
    if (session.state.activeBranchId === branchId) {
      session.state.activeBranchId = undefined;
    }

    // Remove messages belonging to this branch
    session.state.messages = session.state.messages.filter(m => m.branchId !== branchId);

    session.state.updatedAt = Date.now();

    // Schedule immediate persistence for branch deletion (structural change)
    this.schedulePersist(sessionId, true);

    return { success: true };
  }
}
