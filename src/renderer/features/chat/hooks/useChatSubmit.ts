/**
 * useChatSubmit Hook
 * 
 * Handles sending messages and follow-up injections.
 * 
 * Features:
 * - Optimistic UI updates with proper state management
 * - Debounced state transitions to avoid flickering
 * - Proper cleanup on unmount
 * - Error recovery with state rollback
 * - Real-time follow-up injection when agent is running
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { AttachmentPayload, AgentSessionState, LLMProviderName } from '../../../../shared/types';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('ChatSubmit');

export interface ChatSubmitState {
  isSending: boolean;
  canSend: boolean;
  /** Whether a follow-up can be sent (agent is running and input has content) */
  canSendFollowUp: boolean;
  /** Whether the agent is currently running (follow-up mode active) */
  isFollowUpMode: boolean;
  handleSendMessage: () => Promise<void>;
  handleToggleYolo: () => void;
}

interface ChatSubmitOptions {
  message: string;
  attachments: AttachmentPayload[];
  clearMessage: () => void;
  activeSession: { id: string; config: { yoloMode: boolean } } | undefined;
  agentBusy: boolean;
  sessionWorkspaceValid: boolean;
  selectedProvider: LLMProviderName | 'auto';
  selectedModelId: string | undefined;
  manualModel: string;
  sendMessage: (
    content: string, 
    attachments: AttachmentPayload[], 
    config?: Partial<{ preferredProvider: LLMProviderName | 'auto'; selectedModelId?: string }>
  ) => Promise<void>;
  sendFollowUp: (sessionId: string, content: string, attachments?: AttachmentPayload[]) => Promise<void>;
  updateSessionConfig: (sessionId: string, config: Partial<AgentSessionState['config']>) => Promise<void>;
}

/** Timeout for waiting for agent to start running (ms) */
const AGENT_START_TIMEOUT = 5000;

/** Minimum time to show sending state to avoid flickering (ms) */
const MIN_SENDING_DURATION = 200;

/**
 * Hook for handling message submission
 */
export function useChatSubmit(options: ChatSubmitOptions): ChatSubmitState {
  const {
    message,
    attachments,
    clearMessage,
    activeSession,
    agentBusy,
    sessionWorkspaceValid,
    selectedProvider,
    selectedModelId,
    manualModel,
    sendMessage,
    sendFollowUp,
    updateSessionConfig,
  } = options;

  const [isSending, setIsSending] = useState(false);
  // Track if we're waiting for the agent to start after sending
  const waitingForAgentRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sendStartTimeRef = useRef<number>(0);
  const isMountedRef = useRef(true);

  // Track mounted state for safe async updates
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Safe state setter that checks mounted state
  const safeSetIsSending = useCallback((value: boolean) => {
    if (isMountedRef.current) {
      setIsSending(value);
    }
  }, []);

  // Clear isSending when agent becomes busy (message successfully started processing)
  useEffect(() => {
    if (waitingForAgentRef.current && agentBusy) {
      // Agent has started processing - clear the sending state
      // but ensure minimum duration to avoid flickering
      const elapsed = Date.now() - sendStartTimeRef.current;
      const remainingDelay = Math.max(0, MIN_SENDING_DURATION - elapsed);
      
      if (remainingDelay > 0) {
        const delayTimeout = setTimeout(() => {
          logger.info('Agent started, clearing sending state after delay');
          waitingForAgentRef.current = false;
          safeSetIsSending(false);
        }, remainingDelay);
        
        return () => clearTimeout(delayTimeout);
      }
      
      logger.info('Agent started, clearing sending state');
      waitingForAgentRef.current = false;
      safeSetIsSending(false);
      
      // Clear any pending timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  }, [agentBusy, safeSetIsSending]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Memoize canSend to avoid unnecessary recalculations
  const canSend = useMemo(() => {
    const hasContent = message.trim().length > 0 || attachments.length > 0;
    return hasContent && !agentBusy && sessionWorkspaceValid;
  }, [message, attachments.length, agentBusy, sessionWorkspaceValid]);

  // Whether a follow-up can be sent (agent is running and we have content)
  const canSendFollowUp = useMemo(() => {
    const hasContent = message.trim().length > 0 || attachments.length > 0;
    return hasContent && agentBusy && !!activeSession && sessionWorkspaceValid;
  }, [message, attachments.length, agentBusy, activeSession, sessionWorkspaceValid]);

  // Whether we're in follow-up mode (agent is running with an active session)
  const isFollowUpMode = useMemo(() => {
    return agentBusy && !!activeSession;
  }, [agentBusy, activeSession]);

  const handleSendMessage = useCallback(async () => {
    // Route to follow-up send when agent is busy
    if (canSendFollowUp && agentBusy && activeSession) {
      if (isSending) return;

      try {
        safeSetIsSending(true);
        const finalMessage = message.trim();
        
        logger.info('Sending follow-up to running agent', {
          sessionId: activeSession.id,
          messageLength: finalMessage.length,
          attachmentCount: attachments.length,
        });

        await sendFollowUp(activeSession.id, finalMessage, attachments.length > 0 ? attachments : undefined);
        
        logger.info('Follow-up sent successfully');
        clearMessage();

        // Brief sending state for visual feedback
        setTimeout(() => {
          safeSetIsSending(false);
        }, MIN_SENDING_DURATION);
        
      } catch (error) {
        logger.error('Failed to send follow-up', { error });
        safeSetIsSending(false);
      }
      return;
    }

    // Normal message send when agent is idle
    if (!canSend || isSending) return;

    try {
      sendStartTimeRef.current = Date.now();
      safeSetIsSending(true);
      waitingForAgentRef.current = true;
      
      const finalMessage = message.trim();
      
      logger.info('Sending message', {
        messageLength: finalMessage.length,
        attachmentCount: attachments.length,
        provider: selectedProvider,
      });

      await sendMessage(finalMessage, attachments, {
        preferredProvider: selectedProvider,
        selectedModelId: manualModel || selectedModelId || undefined,
      });
      
      logger.info('Message sent successfully, waiting for agent to start');
      clearMessage();
      
      // Set a timeout in case agent never starts (safety fallback)
      timeoutRef.current = setTimeout(() => {
        if (waitingForAgentRef.current && isMountedRef.current) {
          logger.warn('Agent did not start within timeout, clearing sending state');
          waitingForAgentRef.current = false;
          safeSetIsSending(false);
        }
      }, AGENT_START_TIMEOUT);
      
    } catch (error) {
      logger.error('Failed to send message', { error });
      // Clear states on error
      waitingForAgentRef.current = false;
      safeSetIsSending(false);
      // Don't clear the message on error - let the user try again
    }
  }, [message, attachments, isSending, canSend, canSendFollowUp, agentBusy, activeSession, sendMessage, sendFollowUp, selectedProvider, selectedModelId, manualModel, clearMessage, safeSetIsSending]);

  const handleToggleYolo = useCallback(() => {
    if (!activeSession) {
      logger.warn('Cannot toggle yolo mode: no active session');
      return;
    }
    const newYoloMode = !activeSession.config.yoloMode;
    logger.info('Toggling yolo mode', { sessionId: activeSession.id, newValue: newYoloMode });
    updateSessionConfig(activeSession.id, { yoloMode: newYoloMode });
  }, [updateSessionConfig, activeSession]);

  return {
    isSending,
    canSend,
    canSendFollowUp,
    isFollowUpMode,
    handleSendMessage,
    handleToggleYolo,
  };
}
