/**
 * Recovery Module
 *
 * Provides error recovery, self-healing, and error pattern tracking.
 */

// Export types needed by internal modules
export * from './types';

// Core components
export { ErrorClassifier } from './ErrorClassifier';
export { DiagnosticEngine } from './DiagnosticEngine';
export { RecoveryManager } from './RecoveryManager';
export { SelfHealingAgent } from './SelfHealingAgent';

// Error recovery manager (used by toolQueueProcessor, requestTools)
export {
  ErrorRecoveryManager,
  getErrorRecoveryManager,
  resetErrorRecoveryManager,
  type RecoverySuggestion,
  type ErrorRecoveryConfig,
  type ErrorPatternCategory,
  type SessionErrorRecord,
} from './ErrorRecoveryManager';

// Strategies (used internally by RecoveryManager)
export { ALL_STRATEGIES, getStrategiesForCategory, getStrategiesForSeverity, getStrategyByType } from './strategies';

import type { RecoveryDeps } from './types';
import { RecoveryManager } from './RecoveryManager';
import { SelfHealingAgent } from './SelfHealingAgent';
import { createLogger } from '../../logger';

const logger = createLogger('Recovery');

// =============================================================================
// Singleton Instances (used by orchestrator.ts)
// =============================================================================

let recoveryManager: RecoveryManager | null = null;
let selfHealingAgent: SelfHealingAgent | null = null;
let initialized = false;

/** Initialize recovery system */
export async function initRecovery(deps?: Partial<RecoveryDeps>): Promise<void> {
  if (initialized) {
    logger.warn('Recovery system already initialized');
    return;
  }

  const recoveryDeps: RecoveryDeps = {
    logger: deps?.logger ?? logger,
    emitEvent: deps?.emitEvent ?? (() => {}),
    getSystemState: deps?.getSystemState ?? (() => ({})),
    clearCaches: deps?.clearCaches,
  };

  recoveryManager = new RecoveryManager({}, recoveryDeps);
  selfHealingAgent = new SelfHealingAgent(recoveryManager, {}, recoveryDeps);

  initialized = true;
  logger.info('Recovery system initialized');
}

/** Get self-healing agent instance */
export function getSelfHealingAgent(): SelfHealingAgent {
  if (!selfHealingAgent) {
    throw new Error('Recovery system not initialized. Call initRecovery() first.');
  }
  return selfHealingAgent;
}

/** Reset recovery system */
export function resetRecovery(): void {
  if (selfHealingAgent) {
    selfHealingAgent.stop();
    selfHealingAgent.clearHistory();
  }
  if (recoveryManager) {
    recoveryManager.clearOldSessions(0);
  }

  recoveryManager = null;
  selfHealingAgent = null;
  initialized = false;
  logger.info('Recovery system reset');
}

/** Check if recovery system is initialized */
export function isRecoveryInitialized(): boolean {
  return initialized;
}
