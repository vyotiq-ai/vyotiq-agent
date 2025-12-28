/**
 * useSessionCost Hook
 * 
 * Tracks and calculates costs for the current session.
 */

import { useMemo } from 'react';
import { useAgentSelector } from '../../../state/AgentProvider';
import { formatCost, formatTokenCount, calculateMessageCost } from '../../../../shared/utils/costEstimation';
import type { SessionCostSummary } from '../../../../shared/utils/costEstimation';
import type { LLMProviderName } from '../../../../shared/types';

export interface SessionCostState extends SessionCostSummary {
  formattedInputTokens: string;
  formattedOutputTokens: string;
  formattedTotalTokens: string;
  hasUsage: boolean;
  /** Per-provider breakdown (best-effort based on message usage + model pricing table) */
  providerBreakdown: Array<{
    provider: LLMProviderName;
    totalCost: number;
    formattedCost: string;
    totalTokens: number;
    formattedTokens: string;
    messageCount: number;
  }>;
  /** Human-readable tooltip string for UI */
  breakdownTitle: string;
}

export function useSessionCost(): SessionCostState {
  const snapshot = useAgentSelector(
    (state) => {
      const activeSessionId = state.activeSessionId;
      const cached = activeSessionId ? state.sessionCost[activeSessionId] : undefined;
      // Also get the session's messages for on-demand computation if cached is empty
      const session = activeSessionId ? state.sessions.find(s => s.id === activeSessionId) : undefined;
      const messages = session?.messages;
      return { activeSessionId, cached, messages };
    },
    (a, b) => a.activeSessionId === b.activeSessionId && a.cached === b.cached && a.messages === b.messages,
  );

  return useMemo(() => {
    const empty: SessionCostState = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      messageCount: 0,
      formattedCost: formatCost(0),
      averageCostPerMessage: 0,
      formattedInputTokens: formatTokenCount(0),
      formattedOutputTokens: formatTokenCount(0),
      formattedTotalTokens: formatTokenCount(0),
      hasUsage: false,
      providerBreakdown: [],
      breakdownTitle: 'No token usage reported yet',
    };

    if (!snapshot.activeSessionId) {
      return empty;
    }

    // If cached value exists and has usage data, use it
    // Otherwise, compute on-demand from messages
    let costData = snapshot.cached;
    if (!costData || costData.messageCount === 0) {
      // Compute on-demand from messages
      if (snapshot.messages && snapshot.messages.length > 0) {
        const messagesWithUsage = snapshot.messages.filter(m => m.usage);
        if (messagesWithUsage.length > 0) {
          let totalInputTokens = 0;
          let totalOutputTokens = 0;
          let totalCost = 0;
          const byProvider = new Map<string, { totalCost: number; totalTokens: number; messageCount: number }>();

          for (const msg of messagesWithUsage) {
            const usage = msg.usage!;
            totalInputTokens += usage.input;
            totalOutputTokens += usage.output;
            // Use shared cost calculation with model-specific pricing
            const costEstimate = calculateMessageCost(usage, msg.modelId, msg.provider);
            const msgCost = costEstimate.totalCost;
            totalCost += msgCost;

            if (msg.provider) {
              const current = byProvider.get(msg.provider) ?? { totalCost: 0, totalTokens: 0, messageCount: 0 };
              byProvider.set(msg.provider, {
                totalCost: current.totalCost + msgCost,
                totalTokens: current.totalTokens + (usage.total ?? (usage.input + usage.output)),
                messageCount: current.messageCount + 1,
              });
            }
          }

          costData = {
            totalInputTokens,
            totalOutputTokens,
            totalCost,
            messageCount: messagesWithUsage.length,
            byProvider: Object.fromEntries(byProvider.entries()),
          };
        }
      }
    }

    if (!costData || costData.messageCount === 0) {
      return empty;
    }

    const summary: SessionCostSummary = {
      totalInputTokens: costData.totalInputTokens,
      totalOutputTokens: costData.totalOutputTokens,
      totalCost: costData.totalCost,
      messageCount: costData.messageCount,
      formattedCost: formatCost(costData.totalCost),
      averageCostPerMessage: costData.messageCount > 0
        ? costData.totalCost / costData.messageCount
        : 0,
    };

    const totalTokens = summary.totalInputTokens + summary.totalOutputTokens;
    const providerBreakdown = Object.entries(costData.byProvider)
      .map(([provider, data]) => ({
        provider: provider as LLMProviderName,
        totalCost: data.totalCost,
        formattedCost: formatCost(data.totalCost),
        totalTokens: data.totalTokens,
        formattedTokens: formatTokenCount(data.totalTokens),
        messageCount: data.messageCount,
      }))
      .sort((a, b) => b.totalCost - a.totalCost);

    const breakdownTitle = providerBreakdown.length > 0
      ? [
          `Total: ${formatCost(summary.totalCost)} • ${formatTokenCount(totalTokens)} tokens`,
          `  Input: ${formatTokenCount(summary.totalInputTokens)} • Output: ${formatTokenCount(summary.totalOutputTokens)}`,
          '',
          ...providerBreakdown.map(p => `${p.provider}: ${p.formattedCost} • ${p.formattedTokens} tokens • ${p.messageCount} msgs`),
        ].join('\n')
      : 'No token usage reported yet';

    return {
      ...summary,
      formattedInputTokens: formatTokenCount(summary.totalInputTokens),
      formattedOutputTokens: formatTokenCount(summary.totalOutputTokens),
      formattedTotalTokens: formatTokenCount(totalTokens),
      hasUsage: summary.messageCount > 0,
      providerBreakdown,
      breakdownTitle,
    };
  }, [snapshot.activeSessionId, snapshot.cached, snapshot.messages]);
}

/**
 * Get cost for a specific message
 */
export function useMessageCost(messageId: string) {
  const snapshot = useAgentSelector(
    (state) => {
      const session = state.activeSessionId
        ? state.sessions.find((s) => s.id === state.activeSessionId)
        : undefined;
      const message = session?.messages.find((m) => m.id === messageId);
      return { usage: message?.usage, modelId: message?.modelId, provider: message?.provider };
    },
    (a, b) => a.usage === b.usage && a.modelId === b.modelId && a.provider === b.provider,
  );

  return useMemo(() => {
    const messageUsage = snapshot.usage;
    
    if (!messageUsage) {
      return {
        cost: 0,
        formattedCost: '$0.00',
        inputTokens: 0,
        outputTokens: 0,
        hasUsage: false,
      };
    }
    
    const { input, output, total } = messageUsage;
    // Use shared cost calculation with model-specific pricing
    const costEstimate = calculateMessageCost(messageUsage, snapshot.modelId, snapshot.provider);
    
    return {
      cost: costEstimate.totalCost,
      formattedCost: formatCost(costEstimate.totalCost),
      inputTokens: input,
      outputTokens: output,
      totalTokens: total,
      hasUsage: true,
    };
  }, [snapshot.usage, snapshot.modelId, snapshot.provider]);
}
