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
import { withSafeHandler, withErrorGuard, withOrchestratorGuard, sessionCreationMutex, validateIpcPayload } from './guards';

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
        logger.info('Starting session');
        const session = await orchestrator.startSession(payload);
        logger.info('Session started successfully', { sessionId: session?.id });
        return session;
      });
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

  ipcMain.handle('agent:send-followup', async (_event, payload) => {
    // Validate payload structure
    const validationError = validateIpcPayload('agent:send-followup', payload);
    if (validationError) {
      logger.warn('agent:send-followup validation failed', { error: validationError.error });
      return validationError;
    }
    
    return withSafeHandler(context, 'agent:send-followup', async (orchestrator) => {
      logger.info('Sending follow-up for running session', {
        sessionId: payload.sessionId,
        contentLength: payload.content?.length ?? 0,
        attachmentCount: payload.attachments?.length ?? 0,
      });
      await orchestrator.sendFollowUp(payload);
      return { success: true };
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
    return withOrchestratorGuard(context, (orchestrator) => {
      return orchestrator.getSessions();
    }, { operationName: 'agent:get-sessions', returnOnError: [] as never[] });
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

  ipcMain.handle('agent:get-session-summaries', async () => {
    return withSafeHandler(context, 'agent:get-session-summaries', async (orchestrator) => {
      return await orchestrator.getSessionSummaries();
    }, { returnOnError: [] as never[] });
  });

  ipcMain.handle('agent:delete-session', async (_event, sessionId: string) => {
    return withSafeHandler(context, 'agent:delete-session', async (orchestrator) => {
      return orchestrator.deleteSession(sessionId);
    }, { additionalContext: { sessionId } });
  });

  ipcMain.handle('agent:regenerate', async (_event, sessionId: string) => {
    return withSafeHandler(context, 'agent:regenerate', async (orchestrator) => {
      return orchestrator.regenerate(sessionId);
    }, { additionalContext: { sessionId } });
  });

  ipcMain.handle('agent:rename-session', async (_event, sessionId: string, title: string) => {
    return withSafeHandler(context, 'agent:rename-session', async (orchestrator) => {
      return orchestrator.renameSession(sessionId, title);
    }, { additionalContext: { sessionId } });
  });

  // ==========================================================================
  // Run Control
  // ==========================================================================

  ipcMain.handle('agent:cancel-run', async (_event, sessionId: string) => {
    return withSafeHandler(context, 'agent:cancel-run', async (orchestrator) => {
      logger.info('IPC agent:cancel-run received', { sessionId });
      await orchestrator.cancelRun(sessionId);
      logger.info('IPC agent:cancel-run completed', { sessionId });
    }, { additionalContext: { sessionId } });
  });

  ipcMain.handle('agent:pause-run', (_event, sessionId: string) => {
    return withSafeHandler(context, 'agent:pause-run', async (orchestrator) => {
      logger.info('IPC agent:pause-run received', { sessionId });
      const result = orchestrator.pauseRun(sessionId) ?? false;
      logger.info('IPC agent:pause-run completed', { sessionId, result });
      return { success: result };
    }, { returnOnError: { success: false } as { success: boolean }, additionalContext: { sessionId } });
  });

  ipcMain.handle('agent:resume-run', (_event, sessionId: string) => {
    return withSafeHandler(context, 'agent:resume-run', async (orchestrator) => {
      logger.info('IPC agent:resume-run received', { sessionId });
      const result = orchestrator.resumeRun(sessionId) ?? false;
      logger.info('IPC agent:resume-run completed', { sessionId, result });
      return { success: result };
    }, { returnOnError: { success: false } as { success: boolean }, additionalContext: { sessionId } });
  });

  ipcMain.handle('agent:is-run-paused', (_event, sessionId: string) => {
    return getOrchestrator()?.isRunPaused(sessionId) ?? false;
  });

  // ==========================================================================
  // Message Operations
  // ==========================================================================

  ipcMain.handle('agent:edit-message', async (_event, sessionId: string, messageIndex: number, newContent: string) => {
    return withSafeHandler(context, 'agent:edit-message', async (orchestrator) => {
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
    }, { returnOnError: { success: false, error: 'Operation failed' }, additionalContext: { sessionId } });
  });

  ipcMain.handle('agent:add-reaction', async (_event, sessionId: string, messageId: string, reaction: 'up' | 'down' | null) => {
    return withSafeHandler(context, 'agent:add-reaction', async (orchestrator) => {
      return await orchestrator.addReaction(sessionId, messageId, reaction);
    }, { returnOnError: { success: false, error: 'Operation failed' }, additionalContext: { sessionId } });
  });

  // ==========================================================================
  // Branch Management
  // ==========================================================================

  ipcMain.handle('agent:create-branch', async (_event, sessionId: string, messageId: string, name?: string) => {
    return withSafeHandler(context, 'agent:create-branch', async (orchestrator) => {
      return orchestrator.createBranch(sessionId, messageId, name);
    }, { returnOnError: { success: false, error: 'Operation failed' }, additionalContext: { sessionId } });
  });

  ipcMain.handle('agent:switch-branch', async (_event, sessionId: string, branchId: string | null) => {
    return withSafeHandler(context, 'agent:switch-branch', async (orchestrator) => {
      return orchestrator.switchBranch(sessionId, branchId);
    }, { returnOnError: { success: false, error: 'Operation failed' }, additionalContext: { sessionId } });
  });

  ipcMain.handle('agent:delete-branch', async (_event, sessionId: string, branchId: string) => {
    return withSafeHandler(context, 'agent:delete-branch', async (orchestrator) => {
      return orchestrator.deleteBranch(sessionId, branchId);
    }, { returnOnError: { success: false, error: 'Operation failed' }, additionalContext: { sessionId } });
  });

  // Cache module imports to avoid repeated dynamic import overhead
  let cachedSessionHealth: typeof import('../agent/sessionHealth') | null = null;
  let cachedModelQuality: typeof import('../agent/modelQuality') | null = null;
  let cachedLoopDetection: typeof import('../agent/loopDetection') | null = null;

  const getSessionHealthCached = async () => {
    if (!cachedSessionHealth) cachedSessionHealth = await import('../agent/sessionHealth');
    return cachedSessionHealth.getSessionHealthMonitor();
  };

  const getModelQualityCached = async () => {
    if (!cachedModelQuality) cachedModelQuality = await import('../agent/modelQuality');
    return cachedModelQuality.getModelQualityTracker();
  };

  const getLoopDetectorCached = async () => {
    if (!cachedLoopDetection) cachedLoopDetection = await import('../agent/loopDetection');
    return cachedLoopDetection.getLoopDetector();
  };

  ipcMain.handle('agent:get-session-health', async (_event, sessionId: string) => {
    return withErrorGuard('agent:get-session-health', async () => {
      const monitor = await getSessionHealthCached();
      return monitor.getHealthStatus(sessionId);
    }, { returnOnError: null, additionalContext: { sessionId } });
  });

  ipcMain.handle('agent:get-active-health-sessions', async () => {
    return withErrorGuard('agent:get-active-health-sessions', async () => {
      const monitor = await getSessionHealthCached();
      return monitor.getActiveSessions();
    }, { returnOnError: [] as never[] });
  });

  ipcMain.handle('agent:get-model-quality', async (_event, modelId: string, provider: string) => {
    return withErrorGuard('agent:get-model-quality', async () => {
      const tracker = await getModelQualityCached();
      return tracker.getMetrics(modelId, provider as import('../../shared/types').LLMProviderName);
    }, { returnOnError: null, additionalContext: { modelId, provider } });
  });

  ipcMain.handle('agent:get-ranked-models', async () => {
    return withErrorGuard('agent:get-ranked-models', async () => {
      const tracker = await getModelQualityCached();
      return tracker.getRankedModels();
    }, { returnOnError: [] as never[] });
  });

  ipcMain.handle('agent:get-model-quality-stats', async () => {
    return withErrorGuard('agent:get-model-quality-stats', async () => {
      const tracker = await getModelQualityCached();
      return tracker.getGlobalStats();
    }, { returnOnError: null });
  });

  ipcMain.handle('agent:record-model-reaction', async (_event, modelId: string, provider: string, reaction: 'up' | 'down') => {
    return withErrorGuard('agent:record-model-reaction', async () => {
      const tracker = await getModelQualityCached();
      tracker.recordUserReaction(modelId, provider as import('../../shared/types').LLMProviderName, reaction);
      return { success: true };
    }, { returnOnError: { success: false } as { success: boolean }, additionalContext: { modelId, provider, reaction } });
  });

  // ==========================================================================
  // Loop Detection
  // ==========================================================================

  ipcMain.handle('agent:get-loop-detection-state', async (_event, runId: string) => {
    return withErrorGuard('agent:get-loop-detection-state', async () => {
      const detector = await getLoopDetectorCached();
      return detector.getState(runId) ?? null;
    }, { returnOnError: null, additionalContext: { runId } });
  });

  ipcMain.handle('agent:is-circuit-breaker-triggered', async (_event, runId: string) => {
    return withErrorGuard('agent:is-circuit-breaker-triggered', async () => {
      const detector = await getLoopDetectorCached();
      return detector.shouldTriggerCircuitBreaker(runId);
    }, { returnOnError: false, additionalContext: { runId } });
  });

  // ==========================================================================
  // Communication: Questions & Decisions
  // ==========================================================================

  ipcMain.handle('agent:answer-question', async (_event, questionId: string, answer: unknown) => {
    return withSafeHandler(context, 'agent:answer-question', async (orchestrator) => {
      logger.info('Answering question', { questionId });
      // Resolve sessionId from active sessions — questions only exist during active runs
      const sessions = orchestrator.getSessions();
      const resolvedSessionId = sessions.find(s => s.status === 'running' || s.status === 'awaiting-confirmation')?.id ?? '';
      // Emit the answer event back through the orchestrator event system
      orchestrator.emit('event', {
        type: 'question-answered',
        sessionId: resolvedSessionId,
        questionId,
        answer,
        timestamp: Date.now(),
      });
      return { success: true };
    }, { returnOnError: { success: false }, additionalContext: { questionId } });
  });

  ipcMain.handle('agent:skip-question', async (_event, questionId: string) => {
    return withSafeHandler(context, 'agent:skip-question', async (orchestrator) => {
      logger.info('Skipping question', { questionId });
      const sessions = orchestrator.getSessions();
      const resolvedSessionId = sessions.find(s => s.status === 'running' || s.status === 'awaiting-confirmation')?.id ?? '';
      orchestrator.emit('event', {
        type: 'question-skipped',
        sessionId: resolvedSessionId,
        questionId,
        timestamp: Date.now(),
      });
      return { success: true };
    }, { returnOnError: { success: false }, additionalContext: { questionId } });
  });

  ipcMain.handle('agent:make-decision', async (_event, decisionId: string, selectedOptionId: string) => {
    return withSafeHandler(context, 'agent:make-decision', async (orchestrator) => {
      logger.info('Making decision', { decisionId, selectedOptionId });
      const sessions = orchestrator.getSessions();
      const resolvedSessionId = sessions.find(s => s.status === 'running' || s.status === 'awaiting-confirmation')?.id ?? '';
      orchestrator.emit('event', {
        type: 'decision-made',
        sessionId: resolvedSessionId,
        decisionId,
        selectedOption: selectedOptionId,
        timestamp: Date.now(),
      });
      return { success: true };
    }, { returnOnError: { success: false }, additionalContext: { decisionId } });
  });

  ipcMain.handle('agent:skip-decision', async (_event, decisionId: string) => {
    return withSafeHandler(context, 'agent:skip-decision', async (orchestrator) => {
      logger.info('Skipping decision', { decisionId });
      const sessions = orchestrator.getSessions();
      const resolvedSessionId = sessions.find(s => s.status === 'running' || s.status === 'awaiting-confirmation')?.id ?? '';
      orchestrator.emit('event', {
        type: 'decision-skipped',
        sessionId: resolvedSessionId,
        decisionId,
        timestamp: Date.now(),
      });
      return { success: true };
    }, { returnOnError: { success: false }, additionalContext: { decisionId } });
  });

  // ==========================================================================
  // Session Health & Quality Monitoring
  // ==========================================================================
}