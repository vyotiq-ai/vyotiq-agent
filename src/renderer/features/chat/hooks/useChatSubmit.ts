/**
 * useChatSubmit Hook
 * 
 * Handles sending messages and related actions.
 */

import { useState, useCallback, useMemo } from 'react';
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
    config?: Partial<{ preferredProvider: LLMProviderName | 'auto'; selectedModelId?: string; manualOverrideModel?: string }>
  ) => Promise<void>;
  updateSessionConfig: (sessionId: string, config: Partial<AgentSessionState['config']>) => Promise<void>;
}

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
      
      const finalMessage = message.trim();
      
      logger.info('Sending message', {
        messageLength: finalMessage.length,
        attachmentCount: attachments.length,
      });

      await sendMessage(finalMessage, attachments, {
        preferredProvider: selectedProvider,
        selectedModelId: selectedModelId,
        manualOverrideModel: manualModel || selectedModelId || undefined,
      });
      
      logger.info('Message sent successfully');
      clearMessage();
    } catch (error) {
      logger.error('Failed to send message', { error });
      // Don't clear the message on error - let the user try again
    } finally {
      setIsSending(false);
    }
  }, [message, attachments, isSending, canSend, sendMessage, selectedProvider, selectedModelId, manualModel, clearMessage]);

  const handleToggleYolo = useCallback(() => {
    if (!activeSession) return;
    updateSessionConfig(activeSession.id, { yoloMode: !activeSession.config.yoloMode });
  }, [updateSessionConfig, activeSession]);

  return {
    isSending,
    canSend,
    handleSendMessage,
    handleToggleYolo,
  };
}
