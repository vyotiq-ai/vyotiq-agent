/**
 * Session Storage Module
 * 
 * Provides persistent storage for agent sessions with:
 * - Individual JSON files per session for data integrity
 * - Workspace-based organization for easy filtering
 * - Automatic cleanup of orphaned sessions
 * - Atomic write operations to prevent corruption
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AgentSessionState, ChatMessage, SessionSummary } from '../../../shared/types';
import { createLogger } from '../../logger';

const logger = createLogger('SessionStorage');

/**
 * Configuration for session storage
 */
export interface SessionStorageConfig {
  /** Base directory for session storage */
  storagePath: string;
  /** Maximum age in milliseconds for sessions before cleanup (default: 30 days) */
  maxSessionAge?: number;
  /** Enable automatic cleanup of old sessions */
  enableAutoCleanup?: boolean;
}

/**
 * Session file metadata
 */
interface SessionFileMetadata {
  sessionId: string;
  workspaceId?: string;
  createdAt: number;
  updatedAt: number;
  fileName: string;
}

/**
 * Session Storage Manager
 * 
 * Manages persistent storage of chat sessions in individual JSON files.
 * Each session is stored in a separate file named by its session ID.
 */
export class SessionStorage {
  private readonly storagePath: string;
  private readonly sessionsDir: string;
  private readonly indexFile: string;
  private readonly maxSessionAge: number;
  private readonly enableAutoCleanup: boolean;
  
  /** In-memory index of sessions for fast lookup */
  private sessionIndex = new Map<string, SessionFileMetadata>();
  
  /** Write lock to prevent concurrent file operations */
  private writeLock = new Map<string, Promise<void>>();

  constructor(config: SessionStorageConfig) {
    this.storagePath = config.storagePath;
    this.sessionsDir = path.join(config.storagePath, 'sessions');
    this.indexFile = path.join(config.storagePath, 'session-index.json');
    this.maxSessionAge = config.maxSessionAge ?? 30 * 24 * 60 * 60 * 1000; // 30 days
    this.enableAutoCleanup = config.enableAutoCleanup ?? true;
  }

  /**
   * Initialize storage directories and load session index
   */
  async initialize(): Promise<void> {
    // Ensure storage directories exist
    await fs.mkdir(this.sessionsDir, { recursive: true });
    
    // Load or rebuild session index
    await this.loadOrRebuildIndex();
    
    // Run auto-cleanup if enabled
    if (this.enableAutoCleanup) {
      await this.cleanupOldSessions();
    }
    
    logger.info('Initialized', {
      storagePath: this.storagePath,
      sessionCount: this.sessionIndex.size,
    });
  }

  /**
   * Load session index from disk or rebuild from session files
   */
  private async loadOrRebuildIndex(): Promise<void> {
    try {
      const indexData = await fs.readFile(this.indexFile, 'utf-8');
      const index = JSON.parse(indexData) as SessionFileMetadata[];
      
      // Validate index entries against actual files in parallel for speed
      const validationResults = await Promise.allSettled(
        index.map(async (entry) => {
          const filePath = this.getSessionFilePath(entry.sessionId);
          try {
            await fs.access(filePath);
            return { entry, exists: true };
          } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code && err.code !== 'ENOENT') {
              logger.debug('Failed to validate session file existence', {
                sessionId: entry.sessionId,
                filePath,
                code: err.code,
                error: err.message,
              });
            }
            return { entry, exists: false };
          }
        })
      );
      
      // Track removed sessions for logging
      const removedSessions: string[] = [];
      
      for (const result of validationResults) {
        if (result.status === 'fulfilled') {
          if (result.value.exists) {
            this.sessionIndex.set(result.value.entry.sessionId, result.value.entry);
          } else {
            removedSessions.push(result.value.entry.sessionId);
          }
        }
      }
      
      // Log summary instead of individual entries to reduce noise
      if (removedSessions.length > 0) {
        logger.info('Cleaned up orphaned session entries from index', {
          count: removedSessions.length,
          sessionIds: removedSessions.slice(0, 5), // Only log first 5 for brevity
        });
        // Persist updated index
        await this.persistIndex();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('Error loading index, rebuilding', { error: error instanceof Error ? error.message : String(error) });
      }
      
      // Rebuild index from session files
      await this.rebuildIndex();
    }
  }

  /**
   * Rebuild index by scanning session files
   * Uses parallel loading with concurrency limit to prevent blocking
   */
  private async rebuildIndex(): Promise<void> {
    this.sessionIndex.clear();
    
    try {
      const files = await fs.readdir(this.sessionsDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      // Process files in parallel batches to avoid overwhelming the event loop
      const BATCH_SIZE = 10;
      for (let i = 0; i < jsonFiles.length; i += BATCH_SIZE) {
        const batch = jsonFiles.slice(i, i + BATCH_SIZE);
        
        const results = await Promise.allSettled(
          batch.map(async (file) => {
            const filePath = path.join(this.sessionsDir, file);
            const content = await fs.readFile(filePath, 'utf-8');
            const session = JSON.parse(content) as AgentSessionState;
            return { file, session };
          })
        );
        
        for (const result of results) {
          if (result.status === 'fulfilled') {
            const { file, session } = result.value;
            this.sessionIndex.set(session.id, {
              sessionId: session.id,
              workspaceId: session.workspaceId,
              createdAt: session.createdAt,
              updatedAt: session.updatedAt,
              fileName: file,
            });
          }
        }
        
        // Yield to event loop between batches
        if (i + BATCH_SIZE < jsonFiles.length) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }
      
      // Save rebuilt index
      await this.persistIndex();
      
      logger.info('Index rebuilt', {
        sessionCount: this.sessionIndex.size,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('Error rebuilding index', { error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  /**
   * Persist session index to disk
   */
  private async persistIndex(): Promise<void> {
    const indexData = Array.from(this.sessionIndex.values());
    await this.atomicWrite(this.indexFile, JSON.stringify(indexData, null, 2));
  }

  /**
   * Get the file path for a session
   */
  private getSessionFilePath(sessionId: string): string {
    // Sanitize session ID for use as filename
    const safeId = sessionId.replace(/[^a-zA-Z0-9-]/g, '_');
    return path.join(this.sessionsDir, `${safeId}.json`);
  }

  /**
   * Atomic write to prevent file corruption
   */
  private async atomicWrite(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    // Ensure directory exists before writing
    await fs.mkdir(dir, { recursive: true });
    
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, content, 'utf-8');
    await fs.rename(tempPath, filePath);
  }

  /**
   * Acquire write lock for a session
   */
  private async acquireLock(sessionId: string): Promise<void> {
    while (this.writeLock.has(sessionId)) {
      await this.writeLock.get(sessionId);
    }
    
    let resolve: () => void;
    const lockPromise = new Promise<void>(r => { resolve = r; });
    this.writeLock.set(sessionId, lockPromise);
    
    // Return the resolve function to release the lock
    return new Promise(r => {
      r();
      // Store resolve to be called later
      (lockPromise as Promise<void> & { release: () => void }).release = resolve!;
    });
  }

  /**
   * Release write lock for a session
   */
  private releaseLock(sessionId: string): void {
    const lock = this.writeLock.get(sessionId);
    if (lock) {
      this.writeLock.delete(sessionId);
      // Trigger any waiting operations
      (lock as Promise<void> & { release?: () => void }).release?.();
    }
  }

  /**
   * Save a session to disk
   */
  async saveSession(session: AgentSessionState): Promise<void> {
    await this.acquireLock(session.id);
    
    try {
      // Validate and fix message structure before saving
      const validatedSession = {
        ...session,
        messages: this.validateMessages(session.messages),
        updatedAt: Date.now(),
      };
      
      const filePath = this.getSessionFilePath(session.id);
      await this.atomicWrite(filePath, JSON.stringify(validatedSession, null, 2));
      
      // Update index
      this.sessionIndex.set(session.id, {
        sessionId: session.id,
        workspaceId: session.workspaceId,
        createdAt: session.createdAt,
        updatedAt: validatedSession.updatedAt,
        fileName: path.basename(filePath),
      });
      
      // Persist index periodically (not on every save for performance)
      // Use a debounced approach
      this.scheduleIndexPersist();
    } finally {
      this.releaseLock(session.id);
    }
  }

  /** Debounce timer for index persistence */
  private indexPersistTimer: NodeJS.Timeout | null = null;

  /**
   * Schedule index persistence with debouncing
   */
  private scheduleIndexPersist(): void {
    if (this.indexPersistTimer) {
      clearTimeout(this.indexPersistTimer);
    }
    
    this.indexPersistTimer = setTimeout(async () => {
      await this.persistIndex();
      this.indexPersistTimer = null;
    }, 5000); // 5 second debounce
  }

  /**
   * Get session summaries (without full message content) for faster loading
   * This enables lazy loading by only loading metadata for the sidebar
   */
  async getSessionSummaries(workspaceId?: string): Promise<SessionSummary[]> {
    const summaries: SessionSummary[] = [];
    
    for (const metadata of this.sessionIndex.values()) {
      // Filter by workspace if specified
      if (workspaceId && metadata.workspaceId !== workspaceId) {
        continue;
      }
      
      try {
        const filePath = this.getSessionFilePath(metadata.sessionId);
        const content = await fs.readFile(filePath, 'utf-8');
        const session = JSON.parse(content) as AgentSessionState;
        
        // Get last non-empty message for preview
        let lastMessagePreview: string | undefined;
        for (let i = session.messages.length - 1; i >= 0; i--) {
          const msg = session.messages[i];
          if (msg.role === 'assistant' || msg.role === 'user') {
            const content = msg.content?.slice(0, 100);
            if (content) {
              lastMessagePreview = content.length === 100 ? content + '...' : content;
              break;
            }
          }
        }
        
        summaries.push({
          id: session.id,
          title: session.title,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          workspaceId: session.workspaceId,
          status: session.status,
          messageCount: session.messages.length,
          lastMessagePreview,
        });
      } catch (error) {
        logger.error('Error reading session summary', {
          sessionId: metadata.sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    // Sort by updatedAt descending
    return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Load a session from disk
   */
  async loadSession(sessionId: string): Promise<AgentSessionState | null> {
    const metadata = this.sessionIndex.get(sessionId);
    if (!metadata) {
      return null;
    }
    
    try {
      const filePath = this.getSessionFilePath(sessionId);
      const content = await fs.readFile(filePath, 'utf-8');
      const session = JSON.parse(content) as AgentSessionState;
      
      // Validate and fix message structure on load
      session.messages = this.validateMessages(session.messages);
      
      return session;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File deleted - remove from index
        this.sessionIndex.delete(sessionId);
        return null;
      }
      throw error;
    }
  }

  /**
   * Load all sessions (optionally filtered by workspace)
   * Uses parallel loading with batching to prevent blocking
   */
  async loadAllSessions(workspaceId?: string): Promise<AgentSessionState[]> {
    // Get filtered metadata first (fast, in-memory)
    const metadataList = Array.from(this.sessionIndex.values())
      .filter(m => !workspaceId || m.workspaceId === workspaceId);
    
    const sessions: AgentSessionState[] = [];
    const BATCH_SIZE = 10;
    
    // Load sessions in parallel batches
    for (let i = 0; i < metadataList.length; i += BATCH_SIZE) {
      const batch = metadataList.slice(i, i + BATCH_SIZE);
      
      const results = await Promise.allSettled(
        batch.map(metadata => this.loadSession(metadata.sessionId))
      );
      
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          sessions.push(result.value);
        }
      }
      
      // Yield to event loop between batches
      if (i + BATCH_SIZE < metadataList.length) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
    
    // Sort by updatedAt descending
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Get sessions by workspace ID (fast lookup from index)
   */
  getSessionMetadataByWorkspace(workspaceId: string): SessionFileMetadata[] {
    return Array.from(this.sessionIndex.values())
      .filter(m => m.workspaceId === workspaceId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Get all session metadata
   */
  getAllSessionMetadata(): SessionFileMetadata[] {
    return Array.from(this.sessionIndex.values())
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    await this.acquireLock(sessionId);
    
    try {
      const filePath = this.getSessionFilePath(sessionId);
      
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
      
      this.sessionIndex.delete(sessionId);
      this.scheduleIndexPersist();
      
      return true;
    } finally {
      this.releaseLock(sessionId);
    }
  }

  /**
   * Delete all sessions for a workspace
   */
  async deleteSessionsByWorkspace(workspaceId: string): Promise<number> {
    const metadata = this.getSessionMetadataByWorkspace(workspaceId);
    let deletedCount = 0;
    
    for (const m of metadata) {
      const success = await this.deleteSession(m.sessionId);
      if (success) deletedCount++;
    }
    
    return deletedCount;
  }

  /**
   * Cleanup old sessions
   */
  async cleanupOldSessions(): Promise<number> {
    const now = Date.now();
    const cutoff = now - this.maxSessionAge;
    let cleanedCount = 0;
    
    for (const metadata of this.sessionIndex.values()) {
      if (metadata.updatedAt < cutoff) {
        logger.info('Cleaning up old session', {
          sessionId: metadata.sessionId,
          age: Math.round((now - metadata.updatedAt) / (24 * 60 * 60 * 1000)),
        });
        
        await this.deleteSession(metadata.sessionId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.info('Cleaned up old sessions', { count: cleanedCount });
    }
    
    return cleanedCount;
  }

  /**
   * Check if a session exists
   */
  hasSession(sessionId: string): boolean {
    return this.sessionIndex.has(sessionId);
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessionIndex.size;
  }

  /**
   * Get session count by workspace
   */
  getSessionCountByWorkspace(workspaceId: string): number {
    let count = 0;
    for (const m of this.sessionIndex.values()) {
      if (m.workspaceId === workspaceId) count++;
    }
    return count;
  }

  /** Track orphan tool messages we've already logged to avoid spam */
  private loggedOrphanToolCallIds = new Set<string>();

  /**
   * Validate and fix message structure
   * 
   * Ensures:
   * 1. Tool messages follow assistant messages with tool_calls
   * 2. All tool_calls have corresponding tool responses
   */
  private validateMessages(messages: ChatMessage[]): ChatMessage[] {
    const result: ChatMessage[] = [];
    let currentAssistantWithToolCalls: { 
      message: ChatMessage; 
      pendingIds: Set<string>;
    } | null = null;
    const orphansSkipped: string[] = [];

    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        // Handle previous incomplete sequence
        if (currentAssistantWithToolCalls && currentAssistantWithToolCalls.pendingIds.size > 0) {
          // Remove incomplete sequence
          const assistantIdx = result.findIndex(m => m.id === currentAssistantWithToolCalls!.message.id);
          if (assistantIdx >= 0) {
            const toolIdsToRemove = new Set(
              currentAssistantWithToolCalls.message.toolCalls?.map(tc => tc.callId).filter(Boolean) as string[]
            );
            for (let j = result.length - 1; j >= assistantIdx; j--) {
              if (result[j].id === currentAssistantWithToolCalls.message.id || 
                  (result[j].role === 'tool' && result[j].toolCallId && toolIdsToRemove.has(result[j].toolCallId!))) {
                result.splice(j, 1);
              }
            }
          }
        }
        
        const pendingIds = new Set(
          msg.toolCalls.map(tc => tc.callId).filter((id): id is string => !!id && id.length > 0)
        );
        currentAssistantWithToolCalls = { message: msg, pendingIds };
        result.push(msg);
      } else if (msg.role === 'tool') {
        const toolCallId = msg.toolCallId;
        const hasValidToolCallId = toolCallId && toolCallId.length > 0;
        
        if (currentAssistantWithToolCalls && hasValidToolCallId) {
          if (currentAssistantWithToolCalls.pendingIds.has(toolCallId)) {
            currentAssistantWithToolCalls.pendingIds.delete(toolCallId);
            result.push(msg);
            
            if (currentAssistantWithToolCalls.pendingIds.size === 0) {
              currentAssistantWithToolCalls = null;
            }
          } else {
            result.push(msg);
          }
        } else if (!currentAssistantWithToolCalls) {
          // Skip orphan tool messages - only log once per toolCallId to avoid spam
          if (toolCallId && !this.loggedOrphanToolCallIds.has(toolCallId)) {
            this.loggedOrphanToolCallIds.add(toolCallId);
            orphansSkipped.push(toolCallId);
          }
        } else {
          result.push(msg);
        }
      } else {
        // Non-tool message
        if (currentAssistantWithToolCalls && currentAssistantWithToolCalls.pendingIds.size > 0) {
          // Remove incomplete sequence
          const assistantIdx = result.findIndex(m => m.id === currentAssistantWithToolCalls!.message.id);
          if (assistantIdx >= 0) {
            const toolIdsToRemove = new Set(
              currentAssistantWithToolCalls.message.toolCalls?.map(tc => tc.callId).filter(Boolean) as string[]
            );
            for (let j = result.length - 1; j >= assistantIdx; j--) {
              if (result[j].id === currentAssistantWithToolCalls.message.id || 
                  (result[j].role === 'tool' && result[j].toolCallId && toolIdsToRemove.has(result[j].toolCallId!))) {
                result.splice(j, 1);
              }
            }
          }
          currentAssistantWithToolCalls = null;
        }
        result.push(msg);
      }
    }
    
    // Final cleanup
    if (currentAssistantWithToolCalls && currentAssistantWithToolCalls.pendingIds.size > 0) {
      const assistantIdx = result.findIndex(m => m.id === currentAssistantWithToolCalls!.message.id);
      if (assistantIdx >= 0) {
        const toolIdsToRemove = new Set(
          currentAssistantWithToolCalls.message.toolCalls?.map(tc => tc.callId).filter(Boolean) as string[]
        );
        for (let j = result.length - 1; j >= assistantIdx; j--) {
          if (result[j].id === currentAssistantWithToolCalls.message.id || 
              (result[j].role === 'tool' && result[j].toolCallId && toolIdsToRemove.has(result[j].toolCallId!))) {
            result.splice(j, 1);
          }
        }
      }
    }

    // Log summary of orphans skipped (only new ones)
    if (orphansSkipped.length > 0) {
      logger.debug('Skipped orphan tool messages', {
        count: orphansSkipped.length,
        toolCallIds: orphansSkipped.slice(0, 3), // Only show first 3 for brevity
      });
    }

    return result;
  }

  /**
   * Migrate from legacy single-file storage
   */
  async migrateFromLegacyStorage(legacyFilePath: string): Promise<number> {
    try {
      const raw = await fs.readFile(legacyFilePath, 'utf-8');
      const sessions = JSON.parse(raw) as AgentSessionState[];
      
      if (!Array.isArray(sessions)) {
        logger.warn('Invalid legacy data format');
        return 0;
      }
      
      let migratedCount = 0;
      
      for (const session of sessions) {
        if (!session.id) continue;
        
        // Check if already migrated
        if (this.sessionIndex.has(session.id)) {
          continue;
        }
        
        await this.saveSession(session);
        migratedCount++;
      }
      
      if (migratedCount > 0) {
        logger.info('Migrated sessions from legacy storage', {
          count: migratedCount,
        });
        
        // Rename legacy file as backup
        const backupPath = `${legacyFilePath}.migrated.${Date.now()}`;
        await fs.rename(legacyFilePath, backupPath);
        logger.info('Legacy file backed up', { path: backupPath });
      }
      
      return migratedCount;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return 0;
      }
      logger.error('Migration failed', { error: error instanceof Error ? error.message : String(error) });
      return 0;
    }
  }

  /**
   * Force persist index now (for shutdown)
   */
  async flush(): Promise<void> {
    if (this.indexPersistTimer) {
      clearTimeout(this.indexPersistTimer);
      this.indexPersistTimer = null;
    }
    await this.persistIndex();
  }
}
