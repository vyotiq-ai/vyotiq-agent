/**
 * Test Utilities
 * 
 * Common test helper functions and utilities.
 */

interface FeatureFlags {
  enableAutonomousMode: boolean;
  enableTaskPlanning: boolean;
  enableDynamicTools: boolean;
  enableSafetyFramework: boolean;
  enablePerformanceMonitoring: boolean;
  enableAdvancedDebugging: boolean;
  maxDynamicToolsPerSession?: number;
}

/**
 * Create default feature flags for testing
 */
export function createDefaultFeatureFlags(overrides?: Partial<FeatureFlags>): FeatureFlags {
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