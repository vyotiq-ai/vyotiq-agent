/**
 * Provider Selector
 * Handles provider selection, fallback logic, and cooldown management
 */

import type { LLMProviderName, RoutingDecision } from '../../../shared/types';
import type { InternalSession } from '../types';
import type { Logger } from '../../logger';
import type { ProviderMap } from '../providers';
import type { LLMProvider } from '../providers/baseProvider';
import type { ProviderSelectionResult } from './types';
import { analyzeUserQuery, selectBestModel, hasCapableProvider } from '../routing';
import { ensureModelsCached } from '../providers/modelCache';

export class ProviderSelector {
  private readonly providers: ProviderMap;
  private readonly logger: Logger;
  
  // Provider cooldown tracking
  private readonly providerCooldownUntil = new Map<LLMProviderName, { until: number; reason: string }>();

  constructor(providers: ProviderMap, logger: Logger) {
    this.providers = providers;
    this.logger = logger;
  }

  /**
   * Update providers reference
   */
  updateProviders(providers: ProviderMap): void {
    (this as unknown as { providers: ProviderMap }).providers = providers;
  }

  /**
   * Mark a provider as temporarily unavailable
   */
  markProviderCooldown(provider: LLMProviderName, durationMs: number, reason: string): void {
    const until = Date.now() + durationMs;
    const existing = this.providerCooldownUntil.get(provider);
    if (!existing || existing.until < until) {
      this.providerCooldownUntil.set(provider, { until, reason });
      this.logger.warn('Provider temporarily unavailable (cooldown)', {
        provider,
        until,
        durationMs,
        reason,
      });
    }
  }

  /**
   * Check if a provider is in cooldown
   */
  isProviderInCooldown(provider: LLMProviderName): boolean {
    const cooldown = this.providerCooldownUntil.get(provider);
    if (!cooldown) return false;
    return cooldown.until > Date.now();
  }

  /**
   * Get cooldown info for a provider
   */
  getProviderCooldownInfo(provider: LLMProviderName): { until: number; reason: string; remainingMs: number } | null {
    const cooldown = this.providerCooldownUntil.get(provider);
    if (!cooldown) return null;
    const remainingMs = cooldown.until - Date.now();
    if (remainingMs <= 0) return null;
    return { until: cooldown.until, reason: cooldown.reason, remainingMs };
  }

  /**
   * Select primary and fallback providers for resilient execution
   */
  async selectProvidersWithFallback(
    session: InternalSession,
    emitEvent?: (event: { type: string; sessionId: string; status: string; message: string; timestamp: number }) => void
  ): Promise<ProviderSelectionResult> {
    const preferredProvider = session.state.config.preferredProvider;
    const fallbackProviderName = session.state.config.fallbackProvider;
    const enableProviderFallback = session.state.config.enableProviderFallback !== false;
    
    const userExplicitlySelectedProvider = preferredProvider && preferredProvider !== 'auto';

    // Build list of available providers
    const availableProviders: Array<{ name: string; provider: LLMProvider; priority: number }> = [];
    
    let preferredProviderInCooldown = false;
    let cooldownReason = '';

    const now = Date.now();
    for (const [name, info] of this.providers) {
      const providerName = name as LLMProviderName;
      const cooldown = this.providerCooldownUntil.get(providerName);
      
      if (userExplicitlySelectedProvider && providerName === preferredProvider && cooldown && cooldown.until > now) {
        preferredProviderInCooldown = true;
        cooldownReason = cooldown.reason;
        continue;
      }
      
      if (cooldown && cooldown.until > now) {
        continue;
      }
      if (info.hasApiKey && info.enabled && info.provider) {
        availableProviders.push({
          name,
          provider: info.provider,
          priority: info.priority,
        });
      }
    }

    availableProviders.sort((a, b) => a.priority - b.priority);

    // Handle cooldown fallback
    if (userExplicitlySelectedProvider && preferredProviderInCooldown) {
      if (availableProviders.length > 0) {
        this.logger.warn('User-selected provider is in cooldown, falling back to alternative', {
          preferredProvider,
          cooldownReason: cooldownReason.split('\n')[0],
          fallbackProvider: availableProviders[0].name,
          availableAlternatives: availableProviders.map(p => p.name),
        });
        
        if (emitEvent) {
          emitEvent({
            type: 'agent-status',
            sessionId: '',
            status: 'recovering',
            message: `${preferredProvider} is temporarily unavailable (rate limited). Using ${availableProviders[0].name} instead.`,
            timestamp: Date.now(),
          });
        }
      } else {
        this.logger.warn('User-selected provider is in cooldown, no alternatives available', {
          preferredProvider,
          cooldownReason,
        });
        return { primary: null, fallback: null, allAvailable: [] };
      }
    }

    if (availableProviders.length === 0) {
      return { primary: null, fallback: null, allAvailable: [] };
    }

    let primary: LLMProvider | null = null;
    let fallback: LLMProvider | null = null;
    let routingDecision: RoutingDecision | undefined;

    // Select primary provider
    if (userExplicitlySelectedProvider && !preferredProviderInCooldown) {
      const preferred = availableProviders.find(p => p.name === preferredProvider);
      if (preferred) {
        primary = preferred.provider;
      } else {
        this.logger.warn('User-selected provider is not available', {
          preferredProvider,
          availableProviders: availableProviders.map(p => p.name),
        });
        return { primary: null, fallback: null, allAvailable: [] };
      }
    } else if (userExplicitlySelectedProvider && preferredProviderInCooldown) {
      primary = availableProviders[0].provider;
      this.logger.info('Using fallback provider due to cooldown', {
        originalPreference: preferredProvider,
        usingProvider: availableProviders[0].name,
      });
    } else {
      // Auto mode: Use intelligent routing
      const lastUserMessage = session.state.messages.filter(m => m.role === 'user').pop();
      if (lastUserMessage?.content) {
        const taskAnalysis = analyzeUserQuery(lastUserMessage.content);
        const availableProviderNames = availableProviders.map(p => p.name as LLMProviderName);
        
        await Promise.all(
          availableProviders.map(p => 
            ensureModelsCached(p.provider, p.name as LLMProviderName)
          )
        );
        
        const canHandleTask = hasCapableProvider(taskAnalysis.requiredCapabilities, availableProviderNames);
        
        if (!canHandleTask && Object.keys(taskAnalysis.requiredCapabilities).length > 0) {
          this.logger.warn('No provider supports required capabilities for task', {
            taskType: taskAnalysis.taskType,
            requiredCapabilities: taskAnalysis.requiredCapabilities,
            availableProviders: availableProviderNames,
          });
        }
        
        routingDecision = selectBestModel(taskAnalysis, availableProviderNames) ?? undefined;
        
        if (routingDecision) {
          const bestProvider = availableProviders.find(p => p.name === routingDecision!.selectedProvider);
          if (bestProvider) {
            primary = bestProvider.provider;
            
            this.logger.info('Auto mode: Intelligent routing selected provider', {
              selectedProvider: routingDecision.selectedProvider,
              selectedModel: routingDecision.selectedModel,
              taskType: routingDecision.detectedTaskType,
              confidence: routingDecision.confidence,
              reason: routingDecision.reason,
            });

            // Reorder available providers
            const reorderedProviders = [
              bestProvider,
              ...availableProviders.filter(p => p.name !== routingDecision!.selectedProvider),
            ];
            availableProviders.length = 0;
            availableProviders.push(...reorderedProviders);
          }
        }
      }
    }

    if (!primary) {
      primary = availableProviders[0].provider;
    }

    // Select fallback provider
    if (enableProviderFallback && !userExplicitlySelectedProvider) {
      if (fallbackProviderName) {
        const specified = availableProviders.find(
          p => p.name === fallbackProviderName && p.provider !== primary
        );
        if (specified) {
          fallback = specified.provider;
        }
      }

      if (!fallback) {
        const alternative = availableProviders.find(p => p.provider !== primary);
        if (alternative) {
          fallback = alternative.provider;
        }
      }
    }

    const allAvailable = userExplicitlySelectedProvider 
      ? [primary].filter((p): p is LLMProvider => p !== null)
      : availableProviders.map(p => p.provider);

    this.logger.debug('Selected providers', {
      primary: primary?.name,
      fallback: fallback?.name,
      availableCount: availableProviders.length,
      allAvailableCount: allAvailable.length,
      enableProviderFallback,
      isAutoMode: !userExplicitlySelectedProvider,
      routingDecision: routingDecision ? {
        model: routingDecision.selectedModel,
        taskType: routingDecision.detectedTaskType,
      } : undefined,
    });

    return { primary, fallback, allAvailable, routingDecision };
  }
}
