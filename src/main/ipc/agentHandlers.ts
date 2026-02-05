/**
 * Agent IPC Handlers
 * 
 * Handles all agent-related IPC operations including:
 * - Session management (start, send message, delete, etc.)
 * - Run control (cancel, pause, resume)
 * - Tool confirmation
 * - Message editing and reactions
 * - Branch management
 */

import { ipcMain } from 'electron';
import { createLogger } from '../logger';
import type { IpcContext } from './types';
import { withSafeHandler, sessionCreationMutex, validateNonEmptyString as _validateNonEmptyString, validateIpcPayload } from './guards';

const logger = createLogger('IPC:Agent');

export function registerAgentHandlers(context: IpcContext): void {
  const { getOrchestrator } = context;

  // ==========================================================================
  // Session Management
  // ==========================================================================

  ipcMain.handle('agent:start-session', async (_event, payload) => {
    // Use mutex to prevent race conditions in concurrent session creation
    return sessionCreationMutex.withLock(async () => {
      return withSafeHandler(context, 'agent:start-session', async (orchestrator) => {
        logger.info('Starting session', { workspaceId: payload.workspaceId });
        const session = await orchestrator.startSession(payload);
        logger.info('Session started successfully', { sessionId: session?.id });
        return session;
      }, { additionalContext: { workspaceId: payload?.workspaceId } });
    });
  });

  ipcMain.handle('agent:send-message', async (_event, payload) => {
    // Validate payload structure
    const validationError = validateIpcPayload('agent:send-message', payload);
    if (validationError) {
      logger.warn('agent:send-message validation failed', { error: validationError.error });
      return validationError;
    }
    
    return withSafeHandler(context, 'agent:send-message', async (orchestrator) => {
      logger.info('Sending message for session', {
        sessionId: payload.sessionId,
        contentLength: payload.content?.length ?? 0,
        attachmentCount: payload.attachments?.length ?? 0,
      });
      return await orchestrator.sendMessage(payload);
    }, { additionalContext: { sessionId: payload?.sessionId } });
  });

  ipcMain.handle('agent:confirm-tool', async (_event, payload) => {
    // Validate payload structure
    const validationError = validateIpcPayload('agent:confirm-tool', payload);
    if (validationError) {
      logger.warn('agent:confirm-tool validation failed', { error: validationError.error });
      return validationError;
    }
    
    return withSafeHandler(context, 'agent:confirm-tool', async (orchestrator) => {
      await orchestrator.confirmTool(payload);
      return { success: true };
    });
  });
  
  ipcMain.handle('agent:update-config', async (_event, payload) => {
    return withSafeHandler(context, 'agent:update-config', async (orchestrator) => {
      await orchestrator.updateConfig(payload);
      return { success: true };
    });
  });

  ipcMain.handle('agent:get-sessions', () => {
    const orchestrator = getOrchestrator();
    return orchestrator?.getSessions() ?? [];
  });

  ipcMain.handle('agent:has-available-providers', () => {
    return getOrchestrator()?.hasAvailableProviders() ?? false;
  });

  ipcMain.handle('agent:get-available-providers', () => {
    return getOrchestrator()?.getAvailableProviders() ?? [];
  });

  ipcMain.handle('agent:get-providers-cooldown', () => {
    return getOrchestrator()?.getProvidersCooldownStatus() ?? {};
  });

  ipcMain.handle('agent:get-sessions-by-workspace', (_event, workspaceId: string) => {
    try {
      logger.info('Getting sessions for workspace', { workspaceId });
      const sessions = getOrchestrator()?.getSessionsByWorkspace(workspaceId);
      logger.info('Retrieved sessions', { count: sessions?.length ?? 0, workspaceId });
      return sessions ?? [];
    } catch (error) {
      logger.error('Failed to get sessions by workspace', { workspaceId, error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  ipcMain.handle('agent:get-session-summaries', async (_event, workspaceId?: string) => {
    try {
      const summaries = await getOrchestrator()?.getSessionSummaries(workspaceId);
      return summaries ?? [];
    } catch (error) {
      logger.error('Failed to get session summaries', { workspaceId, error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  ipcMain.handle('agent:get-active-workspace-sessions', () => {
    return getOrchestrator()?.getActiveWorkspaceSessions() ?? [];
  });

  ipcMain.handle('agent:delete-session', async (_event, sessionId: string) => {
    const orchestrator = getOrchestrator();
    if (!orchestrator) {
      logger.warn('agent:delete-session called but orchestrator not initialized');
      return { success: false, error: 'Orchestrator not initialized' };
    }
    return orchestrator.deleteSession(sessionId);
  });

  ipcMain.handle('agent:regenerate', async (_event, sessionId: string) => {
    const orchestrator = getOrchestrator();
    if (!orchestrator) {
      logger.warn('agent:regenerate called but orchestrator not initialized');
      return { success: false, error: 'Orchestrator not initialized' };
    }
    return orchestrator.regenerate(sessionId);
  });

  ipcMain.handle('agent:rename-session', async (_event, sessionId: string, title: string) => {
    const orchestrator = getOrchestrator();
    if (!orchestrator) {
      return { success: false, error: 'Orchestrator not initialized' };
    }
    return orchestrator.renameSession(sessionId, title);
  });

  ipcMain.handle('agent:update-editor-state', (_event, state) => {
    getOrchestrator()?.updateEditorState(state);
    return { success: true };
  });

  // ==========================================================================
  // Run Control
  // ==========================================================================

  ipcMain.handle('agent:cancel-run', async (_event, sessionId: string) => {
    logger.info('IPC agent:cancel-run received', { sessionId });
    try {
      await getOrchestrator()?.cancelRun(sessionId);
      logger.info('IPC agent:cancel-run completed', { sessionId });
    } catch (error) {
      logger.error('IPC agent:cancel-run failed', { sessionId, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  });

  ipcMain.handle('agent:pause-run', (_event, sessionId: string) => {
    logger.info('IPC agent:pause-run received', { sessionId });
    try {
      const result = getOrchestrator()?.pauseRun(sessionId) ?? false;
      logger.info('IPC agent:pause-run completed', { sessionId, result });
      return { success: result };
    } catch (error) {
      logger.error('IPC agent:pause-run failed', { sessionId, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('agent:resume-run', (_event, sessionId: string) => {
    logger.info('IPC agent:resume-run received', { sessionId });
    try {
      const result = getOrchestrator()?.resumeRun(sessionId) ?? false;
      logger.info('IPC agent:resume-run completed', { sessionId, result });
      return { success: result };
    } catch (error) {
      logger.error('IPC agent:resume-run failed', { sessionId, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('agent:is-run-paused', (_event, sessionId: string) => {
    return getOrchestrator()?.isRunPaused(sessionId) ?? false;
  });

  // ==========================================================================
  // Message Operations
  // ==========================================================================

  ipcMain.handle('agent:edit-message', async (_event, sessionId: string, messageIndex: number, newContent: string) => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) {
        return { success: false, error: 'Orchestrator not initialized' };
      }
      const sessions = orchestrator.getSessions();
      const session = sessions.find(s => s.id === sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }
      const message = session.messages[messageIndex];
      if (!message) {
        return { success: false, error: `Message at index ${messageIndex} not found` };
      }
      return await orchestrator.editMessageAndResend(sessionId, message.id, newContent);
    } catch (error) {
      logger.error('Failed to edit message', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('agent:add-reaction', async (_event, sessionId: string, messageId: string, reaction: 'up' | 'down' | null) => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) return { success: false, error: 'Orchestrator not available' };
      return await orchestrator.addReaction(sessionId, messageId, reaction);
    } catch (error) {
      logger.error('Failed to add reaction', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  // ==========================================================================
  // Branch Management
  // ==========================================================================

  ipcMain.handle('agent:create-branch', async (_event, sessionId: string, messageId: string, name?: string) => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) return { success: false, error: 'Orchestrator not available' };
      return orchestrator.createBranch(sessionId, messageId, name);
    } catch (error) {
      logger.error('Failed to create branch', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('agent:switch-branch', async (_event, sessionId: string, branchId: string | null) => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) return { success: false, error: 'Orchestrator not available' };
      return orchestrator.switchBranch(sessionId, branchId);
    } catch (error) {
      logger.error('Failed to switch branch', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('agent:delete-branch', async (_event, sessionId: string, branchId: string) => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) return { success: false, error: 'Orchestrator not available' };
      return orchestrator.deleteBranch(sessionId, branchId);
    } catch (error) {
      logger.error('Failed to delete branch', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  // ==========================================================================
  // Session Health & Quality Monitoring
  // ==========================================================================

  ipcMain.handle('agent:get-session-health', async (_event, sessionId: string) => {
    try {
      const { getSessionHealthMonitor } = await import('../agent/sessionHealth');
      const monitor = getSessionHealthMonitor();
      return monitor.getHealthStatus(sessionId);
    } catch (error) {
      logger.error('Failed to get session health', { sessionId, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });

  ipcMain.handle('agent:get-active-health-sessions', async () => {
    try {
      const { getSessionHealthMonitor } = await import('../agent/sessionHealth');
      const monitor = getSessionHealthMonitor();
      return monitor.getActiveSessions();
    } catch (error) {
      logger.error('Failed to get active health sessions', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  ipcMain.handle('agent:get-model-quality', async (_event, modelId: string, provider: string) => {
    try {
      const { getModelQualityTracker } = await import('../agent/modelQuality');
      const tracker = getModelQualityTracker();
      return tracker.getMetrics(modelId, provider as import('../../shared/types').LLMProviderName);
    } catch (error) {
      logger.error('Failed to get model quality', { modelId, provider, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });

  ipcMain.handle('agent:get-ranked-models', async () => {
    try {
      const { getModelQualityTracker } = await import('../agent/modelQuality');
      const tracker = getModelQualityTracker();
      return tracker.getRankedModels();
    } catch (error) {
      logger.error('Failed to get ranked models', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  ipcMain.handle('agent:get-model-quality-stats', async () => {
    try {
      const { getModelQualityTracker } = await import('../agent/modelQuality');
      const tracker = getModelQualityTracker();
      return tracker.getGlobalStats();
    } catch (error) {
      logger.error('Failed to get model quality stats', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });

  ipcMain.handle('agent:record-model-reaction', async (_event, modelId: string, provider: string, reaction: 'up' | 'down') => {
    try {
      const { getModelQualityTracker } = await import('../agent/modelQuality');
      const tracker = getModelQualityTracker();
      tracker.recordUserReaction(modelId, provider as import('../../shared/types').LLMProviderName, reaction);
      return { success: true };
    } catch (error) {
      logger.error('Failed to record model reaction', { modelId, provider, reaction, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  // ==========================================================================
  // Loop Detection
  // ==========================================================================

  ipcMain.handle('agent:get-loop-detection-state', async (_event, runId: string) => {
    try {
      const { getLoopDetector } = await import('../agent/loopDetection');
      const detector = getLoopDetector();
      return detector.getState(runId) ?? null;
    } catch (error) {
      logger.error('Failed to get loop detection state', { runId, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });

  ipcMain.handle('agent:is-circuit-breaker-triggered', async (_event, runId: string) => {
    try {
      const { getLoopDetector } = await import('../agent/loopDetection');
      const detector = getLoopDetector();
      return detector.shouldTriggerCircuitBreaker(runId);
    } catch (error) {
      logger.error('Failed to check circuit breaker', { runId, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  });

  // ==========================================================================
  // Multi-Workspace Session Operations
  // ==========================================================================

  /**
   * Get all running sessions across all workspaces
   * Useful for showing global activity indicators
   */
  ipcMain.handle('agent:get-all-running-sessions', () => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) return [];
      
      const sessions = orchestrator.getSessions();
      return sessions.filter(s => s.status === 'running' || s.status === 'awaiting-confirmation');
    } catch (error) {
      logger.error('Failed to get running sessions', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return [];
    }
  });

  /**
   * Get running session count per workspace
   * Returns a map of workspaceId -> running count
   */
  ipcMain.handle('agent:get-running-sessions-by-workspace', () => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) return {};
      
      const sessions = orchestrator.getSessions();
      const runningByWorkspace: Record<string, number> = {};
      
      for (const session of sessions) {
        if (session.status === 'running' || session.status === 'awaiting-confirmation') {
          const workspaceId = session.workspaceId ?? 'unknown';
          runningByWorkspace[workspaceId] = (runningByWorkspace[workspaceId] ?? 0) + 1;
        }
      }
      
      return runningByWorkspace;
    } catch (error) {
      logger.error('Failed to get running sessions by workspace', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return {};
    }
  });

  /**
   * Get global session statistics for multi-workspace concurrent execution
   */
  ipcMain.handle('agent:get-global-session-stats', () => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) return null;
      
      return orchestrator.getGlobalSessionStats();
    } catch (error) {
      logger.error('Failed to get global session stats', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return null;
    }
  });

  /**
   * Get detailed running session information across all workspaces
   */
  ipcMain.handle('agent:get-detailed-running-sessions', () => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) return [];
      
      return orchestrator.getDetailedRunningSessions();
    } catch (error) {
      logger.error('Failed to get detailed running sessions', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return [];
    }
  });

  /**
   * Check if a new session can be started in a workspace
   */
  ipcMain.handle('agent:can-start-session', (_event, workspaceId: string) => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) return { allowed: true };
      
      return orchestrator.canStartNewSession(workspaceId);
    } catch (error) {
      logger.error('Failed to check if can start session', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return { allowed: true };
    }
  });

  /**
   * Get workspace resource metrics for multi-workspace management
   */
  ipcMain.handle('agent:get-workspace-resources', async () => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) return null;
      
      // Get resource metrics from the orchestrator
      const metrics = orchestrator.getWorkspaceResourceMetrics?.();
      return metrics ?? null;
    } catch (error) {
      logger.error('Failed to get workspace resources', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return null;
    }
  });

  /**
   * Get concurrent execution statistics
   */
  ipcMain.handle('agent:get-concurrent-stats', async () => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) return null;
      
      // Get execution stats if available
      const stats = orchestrator.getConcurrentExecutionStats?.();
      return stats ?? null;
    } catch (error) {
      logger.error('Failed to get concurrent stats', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return null;
    }
  });
}
