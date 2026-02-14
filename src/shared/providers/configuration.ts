/**
 * Provider Configuration Utilities
 * 
 * Functions for checking provider configuration status
 * and getting configured providers.
 */

import type { LLMProviderName } from '../types';
import { PROVIDERS, PROVIDER_ORDER } from './definitions';

// =============================================================================
// Provider Configuration Functions
// =============================================================================

/**
 * Check if a provider has an API key configured
 */
export function isProviderConfigured(
  provider: LLMProviderName, 
  apiKeys: Partial<Record<LLMProviderName, string>>
): boolean {
  const key = apiKeys[provider];
  return !!key && key.trim().length > 0;
}

/**
 * Get configured providers (those with API keys)
 */
export function getConfiguredProviders(
  apiKeys: Partial<Record<LLMProviderName, string>>
): LLMProviderName[] {
  return PROVIDER_ORDER.filter(p => isProviderConfigured(p, apiKeys));
}

/**
 * Get the first configured provider (based on priority order)
 */
export function getFirstConfiguredProvider(
  apiKeys: Partial<Record<LLMProviderName, string>>
): LLMProviderName | null {
  const configured = getConfiguredProviders(apiKeys);
  return configured.length > 0 ? configured[0] : null;
}

/**
 * Get provider info by name
 */
export function getProviderInfo(provider: LLMProviderName) {
  return PROVIDERS[provider] ?? null;
}

/**
 * Get all available provider names
 */
export function getAvailableProviders(): LLMProviderName[] {
  return [...PROVIDER_ORDER];
}

/** Alias for getAvailableProviders for backward compatibility */
export const getAllProviderIds = getAvailableProviders;

/**
 * Check if a provider exists
 */
export function isValidProvider(provider: string): provider is LLMProviderName {
  return provider in PROVIDERS;
}

/**
 * Get display name for a provider
 */
export function getProviderDisplayName(provider: LLMProviderName): string {
  return PROVIDERS[provider]?.name ?? provider;
}

/**
 * Get provider website URL
 */
export function getProviderWebsite(provider: LLMProviderName): string | undefined {
  return PROVIDERS[provider]?.website;
}

/**
 * Get provider documentation URL
 */
export function getProviderDocsUrl(provider: LLMProviderName): string | undefined {
  return PROVIDERS[provider]?.docsUrl;
}

/**
 * Get provider description
 */
export function getProviderDescription(provider: LLMProviderName): string {
  return PROVIDERS[provider]?.description ?? '';
}
