/**
 * Communication Hook
 * 
 * Provides access to the agent communication state: pending questions,
 * pending decisions, and communication progress. Also exposes actions
 * to answer questions and make decisions.
 * 
 * @module hooks/useCommunication
 */

import { useCallback, useMemo } from 'react';
import { useAgentSelector } from '../state/AgentProvider';
import type { AgentUIState } from '../state/types';
import { createLogger } from '../utils/logger';

const logger = createLogger('useCommunication');

// =============================================================================
// Stable empty constants
// =============================================================================

const EMPTY_QUESTIONS: AgentUIState['pendingQuestions'] = [];
const EMPTY_DECISIONS: AgentUIState['pendingDecisions'] = [];
const EMPTY_PROGRESS: AgentUIState['communicationProgress'] = [];

// =============================================================================
// Equality helpers
// =============================================================================

function shallowArrayEqual<T>(a: T[], b: T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// =============================================================================
// Types
// =============================================================================

export interface CommunicationState {
  /** Pending questions from the agent */
  pendingQuestions: AgentUIState['pendingQuestions'];
  /** Pending decisions from the agent */
  pendingDecisions: AgentUIState['pendingDecisions'];
  /** Communication progress updates */
  communicationProgress: AgentUIState['communicationProgress'];
  /** Whether there are any pending questions */
  hasQuestions: boolean;
  /** Whether there are any pending decisions */
  hasDecisions: boolean;
  /** Whether there are any progress updates */
  hasProgress: boolean;
  /** Total count of pending communication items */
  totalPending: number;
  /** Answer a pending question */
  answerQuestion: (questionId: string, answer: unknown) => Promise<void>;
  /** Skip a pending question */
  skipQuestion: (questionId: string) => Promise<void>;
  /** Make a decision */
  makeDecision: (decisionId: string, selectedOptionId: string) => Promise<void>;
  /** Skip a decision */
  skipDecision: (decisionId: string) => Promise<void>;
}

// =============================================================================
// Hook
// =============================================================================

export function useCommunication(): CommunicationState {
  const pendingQuestions = useAgentSelector(
    useCallback((state: AgentUIState) => state.pendingQuestions ?? EMPTY_QUESTIONS, []),
    shallowArrayEqual,
  );

  const pendingDecisions = useAgentSelector(
    useCallback((state: AgentUIState) => state.pendingDecisions ?? EMPTY_DECISIONS, []),
    shallowArrayEqual,
  );

  const communicationProgress = useAgentSelector(
    useCallback((state: AgentUIState) => state.communicationProgress ?? EMPTY_PROGRESS, []),
    shallowArrayEqual,
  );

  const answerQuestion = useCallback(async (questionId: string, answer: unknown) => {
    try {
      await window.vyotiq?.agent?.answerQuestion?.(questionId, answer);
    } catch (error) {
      logger.error('Failed to answer question', { questionId, error: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  const skipQuestion = useCallback(async (questionId: string) => {
    try {
      await window.vyotiq?.agent?.skipQuestion?.(questionId);
    } catch (error) {
      logger.error('Failed to skip question', { questionId, error: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  const makeDecision = useCallback(async (decisionId: string, selectedOptionId: string) => {
    try {
      await window.vyotiq?.agent?.makeDecision?.(decisionId, selectedOptionId);
    } catch (error) {
      logger.error('Failed to make decision', { decisionId, error: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  const skipDecision = useCallback(async (decisionId: string) => {
    try {
      await window.vyotiq?.agent?.skipDecision?.(decisionId);
    } catch (error) {
      logger.error('Failed to skip decision', { decisionId, error: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  return useMemo(() => ({
    pendingQuestions,
    pendingDecisions,
    communicationProgress,
    hasQuestions: pendingQuestions.length > 0,
    hasDecisions: pendingDecisions.length > 0,
    hasProgress: communicationProgress.length > 0,
    totalPending: pendingQuestions.length + pendingDecisions.length,
    answerQuestion,
    skipQuestion,
    makeDecision,
    skipDecision,
  }), [pendingQuestions, pendingDecisions, communicationProgress, answerQuestion, skipQuestion, makeDecision, skipDecision]);
}
