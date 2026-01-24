/**
 * Provider Selector
 * Handles provider selection, fallback logic, and cooldown management
 */

import type { LLMProviderName, RoutingDecision, TaskRoutingSettings, RoutingTaskType, TaskModelMapping } from '../../../shared/types';
import type { InternalSession } from '../types';
import type { Logger } from '../../logger';
import type { ProviderMap } from '../providers';
import type { LLMProvider } from '../providers/baseProvider';
import type { ProviderSelectionResult } from './types';
import { analyzeUserQuery, selectBestModel, hasCapableProvider, type TaskAnalysis, type TaskType } from '../routing';
import { ensureModelsCached } from '../providers/modelCache';
import { ROUTING_TASK_INFO } from '../../../shared/types';

/**
 * Map from routing system's TaskType to user-facing RoutingTaskType
 * This bridges the automatic task detection to user's configured task mappings
 */
function mapTaskTypeToRoutingType(taskType: TaskType): RoutingTaskType[] {
  // Return array of potential matches since one routing type might map to multiple user types
  switch (taskType) {
    case 'coding':
      // Coding tasks could be frontend, backend, or general coding
      return ['frontend', 'backend', 'general'];
    case 'reasoning':
      // Reasoning maps to planning and analysis
      return ['planning', 'analysis'];
    case 'analysis':
      // Analysis maps directly to analysis
      return ['analysis', 'debugging'];
    case 'creative':
      // Creative could be documentation or frontend design
      return ['documentation', 'frontend'];
    case 'vision':
      // Vision analysis could be debugging or analysis
      return ['debugging', 'analysis'];
    case 'image-generation':
      // Image generation is a special case, use general
      return ['general'];
    case 'general':
    default:
      return ['general'];
  }
}

/**
 * Apply user's task routing settings to override automatic routing
 */
function applyTaskRoutingSettings(
  taskAnalysis: TaskAnalysis,
  routingSettings: TaskRoutingSettings | undefined,
  availableProviders: LLMProviderName[],
  logger: Logger
): { provider: LLMProviderName | null; modelId?: string; mapping?: TaskModelMapping } | null {
  // If routing is disabled or no settings, return null to use default routing
  if (!routingSettings?.enabled) {
    return null;
  }

  // Map the detected task type from routing to potential user task types
  const detectedType = taskAnalysis.taskType;
  const potentialUserTypes = mapTaskTypeToRoutingType(detectedType);
  
  // Find enabled mapping for any of the potential task types (in priority order)
  const mapping = routingSettings.taskMappings.find(
    m => m.enabled && potentialUserTypes.includes(m.taskType) && m.provider !== 'auto'
  );

  if (mapping && mapping.provider !== 'auto') {
    // Check if the mapped provider is available
    if (availableProviders.includes(mapping.provider)) {
      logger.info('Applying user task routing settings', {
        detectedTaskType: detectedType,
        mappedToUserType: mapping.taskType,
        provider: mapping.provider,
        modelId: mapping.modelId,
        confidence: taskAnalysis.confidence,
      });
      return { 
        provider: mapping.provider, 
        modelId: mapping.modelId,
        mapping
      };
    } else {
      // Try fallback provider if configured
      if (mapping.fallbackProvider && availableProviders.includes(mapping.fallbackProvider)) {
        logger.info('Using fallback provider from task routing', {
          detectedTaskType: detectedType,
          mappedToUserType: mapping.taskType,
          primaryProvider: mapping.provider,
          fallbackProvider: mapping.fallbackProvider,
          fallbackModelId: mapping.fallbackModelId,
        });
        return { 
          provider: mapping.fallbackProvider, 
          modelId: mapping.fallbackModelId,
          mapping
        };
      }
      logger.warn('Task routing provider not available, falling back to default', {
        detectedTaskType: detectedType,
        mappedToUserType: mapping.taskType,
        configuredProvider: mapping.provider,
        availableProviders,
      });
    }
  }

  // Check default mapping if no specific task mapping found
  if (routingSettings.defaultMapping?.enabled && routingSettings.defaultMapping.provider !== 'auto') {
    const defaultProvider = routingSettings.defaultMapping.provider;
    if (availableProviders.includes(defaultProvider)) {
      logger.info('Applying default task routing mapping', {
        detectedTaskType: detectedType,
        potentialUserTypes,
        provider: defaultProvider,
        modelId: routingSettings.defaultMapping.modelId,
      });
      return { 
        provider: defaultProvider, 
        modelId: routingSettings.defaultMapping.modelId,
        mapping: routingSettings.defaultMapping
      };
    }
  }

  return null;
}

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
    emitEvent?: (event: { type: string; sessionId: string; status: string; message: string; timestamp: number }) => void,
    taskRoutingSettings?: TaskRoutingSettings
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
      // Auto mode: Use intelligent routing (with optional user task mappings)
      const lastUserMessage = session.state.messages.filter(m => m.role === 'user').pop();
      if (lastUserMessage?.content) {
        const taskAnalysis = analyzeUserQuery(lastUserMessage.content);
        const availableProviderNames = availableProviders.map(p => p.name as LLMProviderName);
        
        await Promise.all(
          availableProviders.map(p => 
            ensureModelsCached(p.provider, p.name as LLMProviderName)
          )
        );
        
        // First try user's task routing settings if enabled
        const userRouting = applyTaskRoutingSettings(
          taskAnalysis,
          taskRoutingSettings,
          availableProviderNames,
          this.logger
        );
        
        if (userRouting?.provider) {
          // User has configured a specific provider for this task type
          const userProvider = availableProviders.find(p => p.name === userRouting.provider);
          if (userProvider) {
            primary = userProvider.provider;
            
            routingDecision = {
              detectedTaskType: taskAnalysis.taskType,
              confidence: taskAnalysis.confidence,
              selectedProvider: userRouting.provider,
              selectedModel: userRouting.modelId || '',
              reason: `User task routing: ${taskAnalysis.taskType} → ${userRouting.provider}${userRouting.modelId ? ` (${userRouting.modelId})` : ''}`,
              usedDefault: false,
              appliedMapping: userRouting.mapping,
            };
            
            this.logger.info('Auto mode: User task routing applied', {
              selectedProvider: userRouting.provider,
              selectedModel: userRouting.modelId,
              taskType: taskAnalysis.taskType,
              confidence: taskAnalysis.confidence,
            });
            
            // Reorder providers with user-selected first
            const reorderedProviders = [
              userProvider,
              ...availableProviders.filter(p => p.name !== userRouting.provider),
            ];
            availableProviders.length = 0;
            availableProviders.push(...reorderedProviders);
          }
        }
        
        // Fall back to automatic model selection if no user routing applied
        if (!primary) {
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
