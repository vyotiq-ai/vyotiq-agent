/**
 * useChatSubmit Hook
 * 
 * Handles sending messages and related actions.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { AttachmentPayload, AgentSessionState, LLMProviderName } from '../../../../shared/types';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('ChatSubmit');

export interface ChatSubmitState {
  isSending: boolean;
  canSend: boolean;
  handleSendMessage: () => Promise<void>;
  handleToggleYolo: () => void;
}

interface ChatSubmitOptions {
  message: string;
  attachments: AttachmentPayload[];
  clearMessage: () => void;
  activeSession: { id: string; config: { yoloMode: boolean } } | undefined;
  agentBusy: boolean;
  activeWorkspace: { id: string } | undefined;
  sessionWorkspaceValid: boolean;
  selectedProvider: LLMProviderName | 'auto';
  selectedModelId: string | undefined;
  manualModel: string;
  sendMessage: (
    content: string, 
    attachments: AttachmentPayload[], 
    config?: Partial<{ preferredProvider: LLMProviderName | 'auto'; selectedModelId?: string }>
  ) => Promise<void>;
  updateSessionConfig: (sessionId: string, config: Partial<AgentSessionState['config']>) => Promise<void>;
}

/** Timeout for waiting for agent to start running (ms) */
const AGENT_START_TIMEOUT = 5000;

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
    activeWorkspace,
    sessionWorkspaceValid,
    selectedProvider,
    selectedModelId,
    manualModel,
    sendMessage,
    updateSessionConfig,
  } = options;

  const [isSending, setIsSending] = useState(false);
  // Track if we're waiting for the agent to start after sending
  const waitingForAgentRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear isSending when agent becomes busy (message successfully started processing)
  useEffect(() => {
    if (waitingForAgentRef.current && agentBusy) {
      // Agent has started processing - clear the sending state
      logger.info('Agent started, clearing sending state');
      waitingForAgentRef.current = false;
      setIsSending(false);
      
      // Clear any pending timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  }, [agentBusy]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const canSend = useMemo(() => {
    return (message.trim().length > 0 || attachments.length > 0) && 
           !agentBusy && 
           !!activeWorkspace && 
           sessionWorkspaceValid;
  }, [message, attachments, agentBusy, activeWorkspace, sessionWorkspaceValid]);

  const handleSendMessage = useCallback(async () => {
    if (!canSend || isSending) return;

    try {
      setIsSending(true);
      waitingForAgentRef.current = true;
      
      const finalMessage = message.trim();
      
      logger.info('Sending message', {
        messageLength: finalMessage.length,
        attachmentCount: attachments.length,
      });

      await sendMessage(finalMessage, attachments, {
        preferredProvider: selectedProvider,
        selectedModelId: manualModel || selectedModelId || undefined,
      });
      
      logger.info('Message sent successfully, waiting for agent to start');
      clearMessage();
      
      // Set a timeout in case agent never starts (safety fallback)
      timeoutRef.current = setTimeout(() => {
        if (waitingForAgentRef.current) {
          logger.warn('Agent did not start within timeout, clearing sending state');
          waitingForAgentRef.current = false;
          setIsSending(false);
        }
      }, AGENT_START_TIMEOUT);
      
    } catch (error) {
      logger.error('Failed to send message', { error });
      // Clear states on error
      waitingForAgentRef.current = false;
      setIsSending(false);
      // Don't clear the message on error - let the user try again
    }
  }, [message, attachments, isSending, canSend, sendMessage, selectedProvider, selectedModelId, manualModel, clearMessage]);

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
    handleSendMessage,
    handleToggleYolo,
  };
}
