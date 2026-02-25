/**
 * Recovery Module
 *
 * Simplified error recovery system. Provides pattern-based error analysis
 * and tool suggestions via ErrorRecoveryManager.
 *
 * The SelfHealingAgent, DiagnosticEngine, ErrorClassifier, and strategy
 * classes were removed as part of the Vercel-inspired simplification.
 * Their functionality was either unused, duplicative, or better handled
 * by the LLM itself.
 */

export {
  ErrorRecoveryManager,
  getErrorRecoveryManager,
  resetErrorRecoveryManager,
  type ErrorRecoveryConfig,
  type ErrorPatternCategory,
  type RecoverySuggestion,
  type SessionErrorRecord,
} from './ErrorRecoveryManager';
