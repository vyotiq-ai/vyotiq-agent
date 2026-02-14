/**
 * Recovery Module Index
 *
 * Exports recovery system components and provides singleton instances.
 */

// Export types
export * from './types';

// Export main components
export { ErrorClassifier } from './ErrorClassifier';
export { DiagnosticEngine } from './DiagnosticEngine';
export { RecoveryManager } from './RecoveryManager';
export { SelfHealingAgent } from './SelfHealingAgent';
export { UserCommunication } from './UserCommunication';
export {
  ErrorRecoveryManager,
  getErrorRecoveryManager,
  resetErrorRecoveryManager,
  type RecoverySuggestion,
  type ErrorRecoveryConfig,
  type ErrorPatternCategory,
  type SessionErrorRecord,
} from './ErrorRecoveryManager';
export {
  DeadLetterQueue,
  getDeadLetterQueue,
  initDeadLetterQueue,
  closeDeadLetterQueue,
  type DeadLetterEntry,
  type DeadLetterQueueConfig,
  type DeadLetterQueueStats,
  type OperationType,
  type FailureReason,
} from './DeadLetterQueue';
export {
  CrashRecoveryJournal,
  getCrashRecoveryJournal,
  initCrashRecoveryJournal,
  closeCrashRecoveryJournal,
  type JournalEntry,
  type JournalOperationType,
  type JournalStatus,
  type RecoveryCheckpoint,
  type CrashRecoveryJournalConfig,
  type JournalStats,
} from './CrashRecoveryJournal';

// Export strategies
export {
  ALL_STRATEGIES,
  getStrategiesForCategory,
  getStrategiesForSeverity,
  getStrategyByType,
  RETRY_STRATEGY,
  FALLBACK_STRATEGY,
  ROLLBACK_STRATEGY,
  SCALE_DOWN_STRATEGY,
  ESCALATE_STRATEGY,
  RetryExecutor,
  FallbackExecutor,
  RollbackExecutor,
  ScaleDownExecutor,
  EscalateExecutor,
} from './strategies';

import type { RecoveryDeps } from './types';
import { RecoveryManager } from './RecoveryManager';
import { SelfHealingAgent } from './SelfHealingAgent';
import { UserCommunication } from './UserCommunication';
import { initDeadLetterQueue, closeDeadLetterQueue } from './DeadLetterQueue';
import { initCrashRecoveryJournal, closeCrashRecoveryJournal } from './CrashRecoveryJournal';
import { createLogger } from '../../logger';

const logger = createLogger('Recovery');

// =============================================================================
// Singleton Instances
// =============================================================================

let recoveryManager: RecoveryManager | null = null;
let selfHealingAgent: SelfHealingAgent | null = null;
let userCommunication: UserCommunication | null = null;
let initialized = false;

/**
 * Initialize recovery system
 */
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

  // Create user communication
  userCommunication = new UserCommunication(recoveryDeps);

  // Create recovery manager
  recoveryManager = new RecoveryManager({}, recoveryDeps);

  // Create self-healing agent
  selfHealingAgent = new SelfHealingAgent(recoveryManager, {}, recoveryDeps);

  // Initialize crash resilience subsystems
  try {
    await initDeadLetterQueue();
    logger.debug('Dead letter queue initialized');
  } catch (error) {
    logger.warn('Failed to initialize dead letter queue', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await initCrashRecoveryJournal();
    logger.debug('Crash recovery journal initialized');
  } catch (error) {
    logger.warn('Failed to initialize crash recovery journal', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  initialized = true;
  logger.info('Recovery system initialized');
}

/**
 * Get recovery manager instance
 */
export function getRecoveryManager(): RecoveryManager {
  if (!recoveryManager) {
    throw new Error('Recovery system not initialized. Call initRecovery() first.');
  }
  return recoveryManager;
}

/**
 * Get self-healing agent instance
 */
export function getSelfHealingAgent(): SelfHealingAgent {
  if (!selfHealingAgent) {
    throw new Error('Recovery system not initialized. Call initRecovery() first.');
  }
  return selfHealingAgent;
}

/**
 * Get user communication instance
 */
export function getUserCommunication(): UserCommunication {
  if (!userCommunication) {
    throw new Error('Recovery system not initialized. Call initRecovery() first.');
  }
  return userCommunication;
}

/**
 * Start self-healing monitoring
 */
export function startSelfHealing(): void {
  getSelfHealingAgent().start();
}

/**
 * Stop self-healing monitoring
 */
export function stopSelfHealing(): void {
  if (selfHealingAgent) {
    selfHealingAgent.stop();
  }
}

/**
 * Attempt to recover from an error
 */
export async function recoverFromError<T>(
  error: Error,
  operation: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<{ success: boolean; result?: T }> {
  const manager = getRecoveryManager();
  const { success, result } = await manager.recover(error, operation, context);
  return { success, result };
}

/**
 * Reset recovery system
 */
export function resetRecovery(): void {
  if (selfHealingAgent) {
    selfHealingAgent.stop();
    selfHealingAgent.clearHistory();
  }
  if (userCommunication) {
    userCommunication.clear();
  }
  if (recoveryManager) {
    recoveryManager.clearOldSessions(0);
  }

  // Close crash resilience subsystems
  closeDeadLetterQueue();
  closeCrashRecoveryJournal();

  recoveryManager = null;
  selfHealingAgent = null;
  userCommunication = null;
  initialized = false;
  logger.info('Recovery system reset');
}

/**
 * Check if recovery system is initialized
 */
export function isRecoveryInitialized(): boolean {
  return initialized;
}

/**
 * Get recovery system statistics
 */
export function getRecoveryStats(): {
  recovery: ReturnType<RecoveryManager['getStats']>;
  selfHealing: ReturnType<SelfHealingAgent['getStats']>;
  communication: ReturnType<UserCommunication['getStats']>;
} | null {
  if (!initialized) {
    return null;
  }

  return {
    recovery: getRecoveryManager().getStats(),
    selfHealing: getSelfHealingAgent().getStats(),
    communication: getUserCommunication().getStats(),
  };
}
