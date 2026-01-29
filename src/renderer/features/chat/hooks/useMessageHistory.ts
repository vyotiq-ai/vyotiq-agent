/**
 * useMessageHistory Hook
 * 
 * Provides navigation through previous user messages using arrow keys.
 * Allows users to quickly recall and edit previous messages.
 * 
 * @example
 * ```tsx
 * const { handleHistoryNavigation, currentHistoryIndex } = useMessageHistory({
 *   messages: sessionMessages,
 *   currentMessage: message,
 *   setMessage: setMessage,
 *   isInputEmpty: message.length === 0,
 * });
 * ```
 */

import { useState, useCallback, useMemo } from 'react';
import type { ChatMessage } from '../../../../shared/types';

export interface UseMessageHistoryOptions {
  /** All messages in the current session */
  messages: ChatMessage[];
  /** Current message text in the input */
  currentMessage: string;
  /** Function to update message text */
  setMessage: (value: string) => void;
  /** Whether the input is currently empty */
  isInputEmpty: boolean;
  /** Maximum number of history items to keep (default: 50) */
  maxHistory?: number;
}

export interface UseMessageHistoryReturn {
  /** Handle arrow key navigation - returns true if handled */
  handleHistoryNavigation: (e: React.KeyboardEvent) => boolean;
  /** Current index in history (-1 = new message, 0+ = history) */
  currentHistoryIndex: number;
  /** Total number of user messages in history */
  historyLength: number;
  /** Whether currently browsing history */
  isBrowsingHistory: boolean;
  /** Reset history navigation to default state */
  resetHistory: () => void;
}

/**
 * Hook for navigating through message history with arrow keys
 */
export function useMessageHistory(options: UseMessageHistoryOptions): UseMessageHistoryReturn {
  const { 
    messages, 
    currentMessage, 
    setMessage, 
    isInputEmpty,
    maxHistory = 50 
  } = options;

  // Track current position in history (-1 = typing new message)
  const [historyIndex, setHistoryIndex] = useState(-1);
  // Store the draft message when user starts navigating
  const [draftMessage, setDraftMessage] = useState('');

  // Get user messages only, most recent first
  const userMessages = useMemo(() => {
    return messages
      .filter(msg => msg.role === 'user' && msg.content.trim().length > 0)
      .slice(-maxHistory)
      .reverse();
  }, [messages, maxHistory]);

  const resetHistory = useCallback(() => {
    setHistoryIndex(-1);
    setDraftMessage('');
  }, []);

  const handleHistoryNavigation = useCallback((e: React.KeyboardEvent): boolean => {
    // Only handle up/down arrows
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') {
      return false;
    }

    // Don't handle if there's a selection or cursor isn't at start/end
    const textarea = e.target as HTMLTextAreaElement;
    if (!textarea) return false;

    const isAtStart = textarea.selectionStart === 0 && textarea.selectionEnd === 0;
    const isAtEnd = textarea.selectionStart === currentMessage.length && 
                    textarea.selectionEnd === currentMessage.length;

    // ArrowUp: Go back in history (only when at start of input or input is empty)
    if (e.key === 'ArrowUp') {
      // Only navigate if at the start of input or input is empty
      if (!isAtStart && !isInputEmpty) {
        return false;
      }

      // Don't go beyond history
      if (historyIndex >= userMessages.length - 1) {
        return false;
      }

      e.preventDefault();

      // Save current message as draft when starting to navigate
      if (historyIndex === -1) {
        setDraftMessage(currentMessage);
      }

      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setMessage(userMessages[newIndex]?.content || '');
      return true;
    }

    // ArrowDown: Go forward in history (toward most recent / draft)
    if (e.key === 'ArrowDown') {
      // Only navigate if at the end of input or input is empty
      if (!isAtEnd && !isInputEmpty) {
        return false;
      }

      // Already at the newest position
      if (historyIndex <= -1) {
        return false;
      }

      e.preventDefault();

      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);

      if (newIndex === -1) {
        // Return to draft message
        setMessage(draftMessage);
      } else {
        setMessage(userMessages[newIndex]?.content || '');
      }
      return true;
    }

    return false;
  }, [currentMessage, isInputEmpty, historyIndex, userMessages, draftMessage, setMessage]);

  return {
    handleHistoryNavigation,
    currentHistoryIndex: historyIndex,
    historyLength: userMessages.length,
    isBrowsingHistory: historyIndex >= 0,
    resetHistory,
  };
}

export default useMessageHistory;
