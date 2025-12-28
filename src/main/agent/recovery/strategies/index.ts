/**
 * Recovery Strategies Index
 *
 * Exports all recovery strategy definitions and executors.
 */

// Strategy definitions
export { RETRY_STRATEGY, RetryExecutor } from './RetryStrategy';
export { FALLBACK_STRATEGY, FallbackExecutor } from './FallbackStrategy';
export { ROLLBACK_STRATEGY, RollbackExecutor } from './RollbackStrategy';
export { SCALE_DOWN_STRATEGY, ScaleDownExecutor } from './ScaleDownStrategy';
export { ESCALATE_STRATEGY, EscalateExecutor } from './EscalateStrategy';

import type { RecoveryStrategy } from '../types';
import { RETRY_STRATEGY } from './RetryStrategy';
import { FALLBACK_STRATEGY } from './FallbackStrategy';
import { ROLLBACK_STRATEGY } from './RollbackStrategy';
import { SCALE_DOWN_STRATEGY } from './ScaleDownStrategy';
import { ESCALATE_STRATEGY } from './EscalateStrategy';

/**
 * All available recovery strategies, ordered by priority (lowest = try first)
 */
export const ALL_STRATEGIES: RecoveryStrategy[] = [
  RETRY_STRATEGY,       // Priority 1 - Try again first
  FALLBACK_STRATEGY,    // Priority 2 - Switch to alternative
  ROLLBACK_STRATEGY,    // Priority 3 - Undo and retry
  SCALE_DOWN_STRATEGY,  // Priority 5 - Reduce scope
  ESCALATE_STRATEGY,    // Priority 10 - Ask user (last resort)
].sort((a, b) => a.priority - b.priority);

/**
 * Get strategies applicable to a specific error category
 */
export function getStrategiesForCategory(category: string): RecoveryStrategy[] {
  return ALL_STRATEGIES.filter(
    strategy => strategy.applicableCategories.includes(category as never)
  );
}

/**
 * Get strategies applicable to a specific severity level
 */
export function getStrategiesForSeverity(severity: string): RecoveryStrategy[] {
  return ALL_STRATEGIES.filter(
    strategy => strategy.applicableSeverities.includes(severity as never)
  );
}

/**
 * Get strategy by type
 */
export function getStrategyByType(type: string): RecoveryStrategy | undefined {
  return ALL_STRATEGIES.find(s => s.type === type);
}
