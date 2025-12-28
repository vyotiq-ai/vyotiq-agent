/**
 * EscalateStrategy
 *
 * Escalate to user when automatic recovery is not possible.
 * Provides clear explanation and options for user to decide.
 */

import type {
  RecoveryStrategy,
  RecoveryAttempt,
  RecoveryOutcome as _RecoveryOutcome,
  ClassifiedError,
  DiagnosticInfo,
  ErrorExplanation,
  UserAction,
  HelpRequest,
  RecoveryDeps,
} from '../types';

// Re-export for potential external use
export type RecoveryOutcome = _RecoveryOutcome;
import { randomUUID } from 'node:crypto';

// =============================================================================
// Strategy Definition
// =============================================================================

export const ESCALATE_STRATEGY: RecoveryStrategy = {
  type: 'escalate',
  name: 'Ask for Help',
  description: 'Request user assistance when automatic recovery fails',
  priority: 10, // Last resort
  applicableCategories: ['configuration', 'logic', 'resource', 'external', 'validation', 'unknown'],
  applicableSeverities: ['medium', 'high', 'critical'],
  maxAttempts: 1,
  timeoutMs: 300000, // 5 minutes for user response
  requiresUserInteraction: true,
};

// =============================================================================
// EscalateExecutor
// =============================================================================

export class EscalateExecutor {
  private readonly logger: RecoveryDeps['logger'];
  private readonly emitEvent: RecoveryDeps['emitEvent'];
  private pendingRequests: Map<string, {
    request: HelpRequest;
    resolve: (response: { action: UserAction; data?: unknown }) => void;
    reject: (reason: Error) => void;
  }> = new Map();

  constructor(deps: RecoveryDeps) {
    this.logger = deps.logger;
    this.emitEvent = deps.emitEvent;
  }

  /**
   * Check if this strategy should be used
   * (Always returns true as escalation is the fallback)
   */
  canHandle(): boolean {
    return true;
  }

  /**
   * Build user-friendly error explanation
   */
  buildExplanation(error: ClassifiedError, diagnostic?: DiagnosticInfo): ErrorExplanation {
    const summary = this.buildSummary(error);
    const details = this.buildDetails(error, diagnostic);
    const whatHappened = this.buildWhatHappened(error, diagnostic);
    const whatYouCanDo = this.buildWhatYouCanDo(error, diagnostic);
    const suggestedActions = this.buildSuggestedActions(error, diagnostic);

    return {
      summary,
      details,
      whatHappened,
      whatYouCanDo,
      technicalDetails: this.buildTechnicalDetails(error),
      isRecoverable: error.severity !== 'critical',
      suggestedActions,
    };
  }

  /**
   * Create a help request for the user
   */
  createHelpRequest(
    error: ClassifiedError,
    explanation: ErrorExplanation,
    timeoutMs: number = ESCALATE_STRATEGY.timeoutMs
  ): HelpRequest {
    const requestId = randomUUID();

    return {
      id: requestId,
      question: explanation.summary,
      context: explanation.details,
      options: explanation.suggestedActions,
      defaultOption: explanation.suggestedActions.find(a => a.isRecommended)?.id,
      timeoutMs,
      createdAt: Date.now(),
    };
  }

  /**
   * Execute escalation strategy
   */
  async execute(
    error: ClassifiedError,
    diagnostic?: DiagnosticInfo,
    getUserResponse?: (request: HelpRequest) => Promise<{ action: UserAction; data?: unknown }>
  ): Promise<{ response?: { action: UserAction; data?: unknown }; attempt: RecoveryAttempt }> {
    const attemptId = randomUUID();
    const startedAt = Date.now();

    const attempt: RecoveryAttempt = {
      id: attemptId,
      strategy: 'escalate',
      attemptNumber: 1,
      startedAt,
      outcome: 'failed',
      actionsTaken: [],
    };

    try {
      // Build explanation
      const explanation = this.buildExplanation(error, diagnostic);
      attempt.actionsTaken.push('Built user-friendly explanation');

      // Create help request
      const request = this.createHelpRequest(error, explanation);
      attempt.actionsTaken.push('Created help request');

      this.logger.info('Escalate strategy: requesting user help', {
        requestId: request.id,
        summary: explanation.summary,
      });

      // Emit event for UI
      this.emitEvent({
        type: 'recovery-escalation',
        request,
        explanation,
        error: {
          message: error.original.message,
          category: error.category,
          severity: error.severity,
        },
        timestamp: Date.now(),
      });

      // Wait for user response if handler provided
      if (getUserResponse) {
        attempt.actionsTaken.push('Waiting for user response');

        const response = await Promise.race([
          getUserResponse(request),
          this.createTimeout(request.timeoutMs),
        ]);

        if (response) {
          attempt.actionsTaken.push(`User selected: ${response.action.label}`);
          attempt.outcome = 'success';
          attempt.endedAt = Date.now();
          attempt.durationMs = attempt.endedAt - startedAt;

          this.logger.info('Escalate strategy: user responded', {
            action: response.action.type,
          });

          return { response, attempt };
        }
      }

      // No handler or waiting - mark as pending
      attempt.outcome = 'success'; // Successfully escalated
      attempt.actionsTaken.push('Escalation sent to user');
      attempt.endedAt = Date.now();
      attempt.durationMs = attempt.endedAt - startedAt;

      return { attempt };
    } catch (escalateError) {
      if ((escalateError as Error).message === 'timeout') {
        attempt.outcome = 'timeout';
        attempt.error = 'User did not respond in time';
      } else {
        attempt.outcome = 'failed';
        attempt.error = escalateError instanceof Error ? escalateError.message : String(escalateError);
      }

      attempt.actionsTaken.push(`Escalation failed: ${attempt.error}`);
      attempt.endedAt = Date.now();
      attempt.durationMs = attempt.endedAt - startedAt;

      this.logger.warn('Escalate strategy: failed', { error: attempt.error });

      return { attempt };
    }
  }

  /**
   * Register a pending help request
   */
  registerPendingRequest(request: HelpRequest): Promise<{ action: UserAction; data?: unknown }> {
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(request.id, { request, resolve, reject });

      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(request.id)) {
          this.pendingRequests.delete(request.id);
          reject(new Error('timeout'));
        }
      }, request.timeoutMs);
    });
  }

  /**
   * Handle user response to a pending request
   */
  handleUserResponse(requestId: string, action: UserAction, data?: unknown): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return false;
    }

    pending.resolve({ action, data });
    this.pendingRequests.delete(requestId);
    return true;
  }

  /**
   * Cancel a pending request
   */
  cancelRequest(requestId: string, reason?: string): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return false;
    }

    pending.reject(new Error(reason || 'Request cancelled'));
    this.pendingRequests.delete(requestId);
    return true;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private buildSummary(error: ClassifiedError): string {
    switch (error.category) {
      case 'transient':
        return 'A temporary issue occurred. Would you like to retry?';
      case 'configuration':
        return 'There seems to be a configuration issue that needs your attention.';
      case 'logic':
        return 'I encountered an unexpected situation. Can you help me understand?';
      case 'resource':
        return 'Resource limits were reached. How would you like to proceed?';
      case 'external':
        return 'An external service is having issues. What should I do?';
      case 'validation':
        return 'There was a validation error. Please review the details.';
      default:
        return 'An unexpected error occurred. Your input is needed.';
    }
  }

  private buildDetails(error: ClassifiedError, diagnostic?: DiagnosticInfo): string {
    let details = `Error: ${error.original.message}\n`;
    details += `Category: ${error.category}\n`;
    details += `Severity: ${error.severity}\n`;

    if (diagnostic?.rootCause) {
      details += `\nLikely cause: ${diagnostic.rootCause.cause}`;
    }

    return details;
  }

  private buildWhatHappened(error: ClassifiedError, diagnostic?: DiagnosticInfo): string {
    if (diagnostic?.rootCause) {
      return diagnostic.rootCause.cause;
    }

    return `An error occurred during ${error.context.operation || 'the operation'}: ${error.original.message}`;
  }

  private buildWhatYouCanDo(error: ClassifiedError, diagnostic?: DiagnosticInfo): string[] {
    const options: string[] = [];

    if (error.isRetryable) {
      options.push('Wait a moment and try again');
    }

    if (error.category === 'configuration') {
      options.push('Check your settings and API keys');
    }

    if (diagnostic?.suggestedFixes) {
      for (const fix of diagnostic.suggestedFixes.slice(0, 3)) {
        if (fix.type === 'user-action') {
          options.push(fix.description);
        }
      }
    }

    options.push('Cancel this operation');
    options.push('Get more help');

    return options;
  }

  private buildSuggestedActions(error: ClassifiedError, _diagnostic?: DiagnosticInfo): UserAction[] {
    const actions: UserAction[] = [];

    // Retry action (if retryable)
    if (error.isRetryable) {
      actions.push({
        id: 'retry',
        label: 'Retry',
        description: 'Try the operation again',
        type: 'retry',
        isRecommended: error.category === 'transient',
      });
    }

    // Modify action (for logic/validation errors)
    if (error.category === 'logic' || error.category === 'validation') {
      actions.push({
        id: 'modify',
        label: 'Modify Approach',
        description: 'Try a different approach to the task',
        type: 'modify',
        isRecommended: true,
      });
    }

    // Cancel action
    actions.push({
      id: 'cancel',
      label: 'Cancel',
      description: 'Stop the current operation',
      type: 'cancel',
      isRecommended: false,
    });

    // Ignore action (for non-critical)
    if (error.severity !== 'critical') {
      actions.push({
        id: 'ignore',
        label: 'Skip and Continue',
        description: 'Skip this step and continue with the rest',
        type: 'ignore',
        isRecommended: false,
      });
    }

    // Help action
    actions.push({
      id: 'help',
      label: 'Get Help',
      description: 'View more details about this error',
      type: 'help',
      isRecommended: false,
    });

    return actions;
  }

  private buildTechnicalDetails(error: ClassifiedError): string {
    const parts: string[] = [];

    parts.push(`Error: ${error.original.message}`);
    if (error.code) parts.push(`Code: ${error.code}`);
    if (error.httpStatus) parts.push(`HTTP Status: ${error.httpStatus}`);
    if (error.context.operation) parts.push(`Operation: ${error.context.operation}`);
    if (error.context.toolName) parts.push(`Tool: ${error.context.toolName}`);
    if (error.context.provider) parts.push(`Provider: ${error.context.provider}`);
    if (error.context.stack) parts.push(`\nStack:\n${error.context.stack}`);

    return parts.join('\n');
  }

  private createTimeout(ms: number): Promise<null> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), ms);
    });
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Clear all pending requests
   */
  clearPendingRequests(): void {
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error('Cleared'));
    }
    this.pendingRequests.clear();
  }

  /**
   * Get statistics
   */
  getStats(): { pendingRequests: number } {
    return {
      pendingRequests: this.pendingRequests.size,
    };
  }
}
