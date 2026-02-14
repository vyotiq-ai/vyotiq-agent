import type { AgentSettings, LLMProviderName } from '../../shared/types';
import { buildProviderMap, type ProviderMap } from './providers';
import type { SettingsStore } from './settingsStore';
import type { Logger } from '../logger';
import { RunExecutor } from './runExecutor';
import { FailoverManager } from './providers/FailoverManager';
import { ProviderHealthMonitor } from './providers/ProviderHealthMonitor';

export class ProviderManager {
    private providers: ProviderMap;
    private settings: AgentSettings;
    private readonly failoverManager: FailoverManager;
    private readonly healthMonitor: ProviderHealthMonitor;

    constructor(
        private readonly settingsStore: SettingsStore,
        private readonly logger: Logger,
        private readonly runExecutor: RunExecutor
    ) {
        this.settings = this.settingsStore.get();
        this.providers = buildProviderMap(this.settings);
        
        // Initialize health monitor and failover manager
        this.healthMonitor = new ProviderHealthMonitor(this.logger);
        this.failoverManager = new FailoverManager(this.logger, this.healthMonitor, {
            enabled: true,
            maxFailovers: 3,
            maxRetries: 3,
        });
    }

    public getProviders(): ProviderMap {
        return this.providers;
    }

    /**
     * Get the failover manager for handling provider failures
     */
    public getFailoverManager(): FailoverManager {
        return this.failoverManager;
    }

    /**
     * Get the health monitor for provider health tracking
     */
    public getHealthMonitor(): ProviderHealthMonitor {
        return this.healthMonitor;
    }

    /**
     * Record a successful provider request (updates health metrics)
     */
    public recordProviderSuccess(provider: LLMProviderName, latencyMs: number): void {
        this.healthMonitor.recordRequest(provider, latencyMs, true);
        this.failoverManager.recordSuccess(provider);
    }

    /**
     * Record a failed provider request (updates health metrics and circuit breaker)
     */
    public recordProviderFailure(provider: LLMProviderName, latencyMs: number): void {
        this.healthMonitor.recordRequest(provider, latencyMs, false);
        this.failoverManager.recordFailure(provider);
    }

    /**
     * Get the best provider to use based on health metrics
     */
    public getBestProvider(candidates?: LLMProviderName[]): LLMProviderName | null {
        return this.healthMonitor.getBestProvider(candidates);
    }

    /**
     * Check if a failover is needed and get the target provider
     */
    public decideFailover(currentProvider: LLMProviderName, error: Error, capability?: string) {
        return this.failoverManager.decideFailover(currentProvider, error, capability);
    }

    public refreshProviders(): void {
        this.settings = this.settingsStore.get();
        this.providers = buildProviderMap(this.settings);

        // Update the run executor with new providers
        this.runExecutor.updateProviders(this.providers);

        const availableProviders: string[] = [];
        const configuredProviderSet = new Set<LLMProviderName>();
        for (const [name, info] of this.providers) {
            if (info.hasApiKey && info.enabled) {
                availableProviders.push(name);
                configuredProviderSet.add(name as LLMProviderName);
                this.logger.debug('Provider available', { provider: name });
            }
        }

        // Update failover manager with currently configured providers
        // This also resets circuit breakers since provider config has changed
        this.failoverManager.updateConfiguredProviders(configuredProviderSet);

        if (availableProviders.length === 0) {
            this.logger.warn('No LLM providers are configured. Please add at least one API key in settings.');
        } else {
            this.logger.info('Providers refreshed', { available: availableProviders });
        }
    }

    public validateConfiguration(): void {
        const hasAnyProvider = Array.from(this.providers.values()).some(info => info.hasApiKey && info.enabled);

        if (!hasAnyProvider) {
            this.logger.warn(
                'System initialization complete but no LLM providers are configured. ' +
                'Users will not be able to send messages until at least one provider API key is added in settings.'
            );
        }
    }

    public hasAvailableProviders(): boolean {
        return Array.from(this.providers.values()).some(info => info.hasApiKey && info.enabled);
    }

    public getAvailableProviders(): string[] {
        const available = Array.from(this.providers.entries())
            .filter(([, info]) => info.hasApiKey && info.enabled);

        // Use health monitor to sort: healthy providers first, then by static priority
        const bestProvider = this.healthMonitor.getBestProvider(
            available.map(([name]) => name as LLMProviderName)
        );

        return available
            .sort((a, b) => {
                const aName = a[0] as LLMProviderName;
                const bName = b[0] as LLMProviderName;

                // Prefer the health-monitor's best pick
                if (bestProvider) {
                    if (aName === bestProvider && bName !== bestProvider) return -1;
                    if (bName === bestProvider && aName !== bestProvider) return 1;
                }

                // Fall back to static priority
                return (a[1].priority ?? 99) - (b[1].priority ?? 99);
            })
            .map(([name]) => name);
    }

    /**
     * Get detailed info about all providers (for diagnostics)
     */
    public getProvidersInfo(): Array<{ name: string; enabled: boolean; hasApiKey: boolean; priority: number }> {
        return Array.from(this.providers.entries())
            .map(([name, info]) => ({
                name,
                enabled: info.enabled,
                hasApiKey: info.hasApiKey,
                priority: info.priority,
            }))
            .sort((a, b) => a.priority - b.priority);
    }

    /**
     * Get cooldown status for all providers
     */
    public getProvidersCooldownStatus(): Record<string, { inCooldown: boolean; remainingMs: number; reason: string } | null> {
        const result: Record<string, { inCooldown: boolean; remainingMs: number; reason: string } | null> = {};
        for (const [name] of this.providers) {
            const cooldownInfo = this.runExecutor.getProviderCooldownInfo(name);
            if (cooldownInfo) {
                result[name] = {
                    inCooldown: true,
                    remainingMs: cooldownInfo.remainingMs,
                    reason: cooldownInfo.reason,
                };
            } else {
                result[name] = null;
            }
        }
        return result;
    }
}
