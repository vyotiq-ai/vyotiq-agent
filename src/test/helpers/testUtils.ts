/**
 * Test Utilities
 * 
 * Common test helper functions and utilities.
 */

import type { AutonomousFeatureFlags } from '../../shared/types';

/**
 * Create default feature flags for testing
 */
export function createDefaultFeatureFlags(overrides?: Partial<AutonomousFeatureFlags>): AutonomousFeatureFlags {
  return {
    enableAutonomousMode: false,
    enableTaskPlanning: false,
    enableDynamicTools: true,
    enableSafetyFramework: true,
    enablePerformanceMonitoring: false,
    enableAdvancedDebugging: false,
    ...overrides,
  };
}

/**
 * Delay utility for tests
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}