/**
 * Agent Reducer (Slim)
 * 
 * All type definitions have been extracted to ./types.ts.
 * This file re-exports them for backward compatibility and provides
 * initialState + computeSessionCostSnapshot.
 * 
 * The monolithic agentReducer function has been REMOVED — use
 * combinedAgentReducer from ./reducers/index.ts instead.
 */
import type { AgentSessionState } from '../../shared/types';
import { calculateMessageCost, calculateSessionCost } from '../../shared/utils/costEstimation';
import { createLogger } from '../utils/logger';

// Re-export all types from the centralized types module
export type {
  AgentUIState,
  AgentAction,
  AgentStatusInfo,
  ToolResultState,
  InlineArtifactState,
  RoutingDecisionState,
  TerminalStreamState,
  QueuedTool,
  FileDiffStreamState,
  AgentState,
} from './types';

import type { AgentUIState } from './types';

const logger = createLogger('AgentReducer');

// =============================================================================
// Initial State
// =============================================================================

export const initialState: AgentUIState = {
  sessions: [],
  pendingConfirmations: {},
  progressGroups: {},
  artifacts: {},
  streamingSessions: new Set(),
  agentStatus: {},
  contextMetrics: {},
  terminalStreams: {},
  toolResults: {},
  inlineArtifacts: {},
  routingDecisions: {},
  sessionCost: {},
  todos: {},
  pendingQuestions: [],
  pendingDecisions: [],
  communicationProgress: [],
  executingTools: {},
  queuedTools: {},
  runErrors: {},
  fileDiffStreams: {},
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Compute cost snapshot for a session's messages.
 * Exported for use by domain-specific reducers.
 */
export function computeSessionCostSnapshot(messages: AgentSessionState['messages']): AgentUIState['sessionCost'][string] {
  const messagesWithUsage = messages
    .filter((m) => m.usage)
    .map((m) => ({ usage: m.usage!, modelId: m.modelId, provider: m.provider }));

  if (messagesWithUsage.length === 0 && messages.length > 0) {
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    logger.debug('No messages with usage data found', {
      totalMessages: messages.length,
      assistantMessages: assistantMessages.length,
      sampleMessage: assistantMessages[0] ? {
        id: assistantMessages[0].id,
        hasUsage: !!assistantMessages[0].usage,
        hasProvider: !!assistantMessages[0].provider,
        hasModelId: !!assistantMessages[0].modelId,
      } : null,
    });
  }

  const summary = calculateSessionCost(messagesWithUsage);
  const byProvider = new Map<string, { totalCost: number; totalTokens: number; messageCount: number }>();

  for (const msg of messagesWithUsage) {
    if (!msg.provider) continue;
    const estimate = calculateMessageCost(msg.usage, msg.modelId, msg.provider);
    const tokens = msg.usage.total ?? (msg.usage.input + msg.usage.output);
    const current = byProvider.get(msg.provider) ?? { totalCost: 0, totalTokens: 0, messageCount: 0 };
    byProvider.set(msg.provider, {
      totalCost: current.totalCost + estimate.totalCost,
      totalTokens: current.totalTokens + tokens,
      messageCount: current.messageCount + 1,
    });
  }

  return {
    totalInputTokens: summary.totalInputTokens,
    totalOutputTokens: summary.totalOutputTokens,
    totalCost: summary.totalCost,
    messageCount: summary.messageCount,
    byProvider: Object.fromEntries(byProvider.entries()),
  };
}
