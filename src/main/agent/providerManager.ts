import type { AgentSettings } from '../../shared/types';
import { buildProviderMap, type ProviderMap } from './providers';
import type { SettingsStore } from './settingsStore';
import type { Logger } from '../logger';
import { RunExecutor } from './runExecutor';

export class ProviderManager {
    private providers: ProviderMap;
    private settings: AgentSettings;

    constructor(
        private readonly settingsStore: SettingsStore,
        private readonly logger: Logger,
        private readonly runExecutor: RunExecutor
    ) {
        this.settings = this.settingsStore.get();
        this.providers = buildProviderMap(this.settings);
    }

    public getProviders(): ProviderMap {
        return this.providers;
    }

    public refreshProviders(): void {
        this.settings = this.settingsStore.get();
        this.providers = buildProviderMap(this.settings);

        // Update the run executor with new providers
        this.runExecutor.updateProviders(this.providers);

        const availableProviders: string[] = [];
        for (const [name, info] of this.providers) {
            if (info.hasApiKey && info.enabled) {
                availableProviders.push(name);
                this.logger.debug('Provider available', { provider: name });
            }
        }
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
        return Array.from(this.providers.entries())
            .filter(([, info]) => info.hasApiKey && info.enabled)
            .sort((a, b) => (a[1].priority ?? 99) - (b[1].priority ?? 99))
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
