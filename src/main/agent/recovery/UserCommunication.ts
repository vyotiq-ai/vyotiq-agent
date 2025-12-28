/**
 * UserCommunication
 *
 * Handles communication with users during error recovery.
 * Formats errors into understandable messages and manages
 * user interaction for recovery decisions.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type {
  ClassifiedError,
  DiagnosticInfo,
  ErrorExplanation,
  UserAction,
  HelpRequest,
  RecoveryDeps,
} from './types';
import { createLogger } from '../../logger';

const logger = createLogger('UserCommunication');

// =============================================================================
// Types
// =============================================================================

interface NotificationLevel {
  type: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  persistent: boolean;
}

interface UserNotification {
  id: string;
  level: NotificationLevel;
  message: string;
  details?: string;
  actions?: UserAction[];
  createdAt: number;
  expiresAt?: number;
  dismissed: boolean;
}

interface PendingDecision {
  id: string;
  request: HelpRequest;
  resolve: (action: UserAction, data?: unknown) => void;
  reject: (reason: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

// =============================================================================
// UserCommunication
// =============================================================================

export class UserCommunication extends EventEmitter {
  private readonly deps: RecoveryDeps;

  private notifications: Map<string, UserNotification> = new Map();
  private pendingDecisions: Map<string, PendingDecision> = new Map();
  private notificationHistory: UserNotification[] = [];

  private readonly maxHistory = 100;

  constructor(deps?: Partial<RecoveryDeps>) {
    super();

    this.deps = {
      logger: deps?.logger ?? logger,
      emitEvent: deps?.emitEvent ?? (() => {}),
      getSystemState: deps?.getSystemState ?? (() => ({})),
    };
  }

  // ===========================================================================
  // Error Explanation
  // ===========================================================================

  /**
   * Format error into user-friendly explanation
   */
  explainError(error: ClassifiedError, diagnostic?: DiagnosticInfo): ErrorExplanation {
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
   * Build concise summary
   */
  private buildSummary(error: ClassifiedError): string {
    const categoryMessages: Record<string, string> = {
      transient: 'A temporary issue occurred',
      rate_limit: 'Rate limit reached',
      authentication: 'Authentication failed',
      authorization: 'Permission denied',
      not_found: 'Resource not found',
      validation: 'Invalid input',
      configuration: 'Configuration error',
      resource: 'Resource limit reached',
      network: 'Network error',
      timeout: 'Operation timed out',
      external: 'External service error',
      logic: 'Unexpected error',
      unknown: 'An error occurred',
    };

    return categoryMessages[error.category] || error.original.message;
  }

  /**
   * Build detailed explanation
   */
  private buildDetails(error: ClassifiedError, diagnostic?: DiagnosticInfo): string {
    const parts: string[] = [];

    // Add error message
    parts.push(error.original.message);

    // Add root cause if available
    if (diagnostic?.rootCause) {
      parts.push(`\nCause: ${diagnostic.rootCause.cause}`);
    }

    // Add context
    if (error.context.operation) {
      parts.push(`\nDuring: ${error.context.operation}`);
    }

    return parts.join('');
  }

  /**
   * Build what happened section
   */
  private buildWhatHappened(error: ClassifiedError, diagnostic?: DiagnosticInfo): string {
    if (diagnostic?.rootCause) {
      return diagnostic.rootCause.cause;
    }

    switch (error.category) {
      case 'transient':
        return 'A temporary issue occurred. This usually resolves on its own.';
      case 'configuration':
        return 'There is an issue with the configuration or credentials.';
      case 'external':
        return 'An external service or resource is unavailable.';
      case 'resource':
        return 'System resources (memory, CPU, or context window) are running low.';
      case 'validation':
        return 'The input provided did not meet the expected format or constraints.';
      case 'logic':
        return 'The agent made an incorrect decision that needs to be corrected.';
      default:
        return error.original.message;
    }
  }

  /**
   * Build what you can do section
   */
  private buildWhatYouCanDo(error: ClassifiedError, diagnostic?: DiagnosticInfo): string[] {
    const options: string[] = [];

    // Add diagnostic suggestions
    if (diagnostic?.suggestedFixes) {
      for (const fix of diagnostic.suggestedFixes) {
        if (fix.type === 'user-action') {
          options.push(fix.description);
        }
      }
    }

    // Category-specific suggestions
    switch (error.category) {
      case 'transient':
        options.push('Wait a moment before trying again');
        break;
      case 'configuration':
        options.push('Check your settings and API keys');
        options.push('Verify your configuration is correct');
        break;
      case 'external':
        options.push('Check your internet connection');
        options.push('Try again in a moment');
        break;
      case 'resource':
        options.push('Try with a shorter message');
        options.push('Clear conversation history');
        break;
      case 'logic':
        options.push('Provide more specific instructions');
        break;
    }

    // Always available options
    if (error.isRetryable) {
      options.push('Retry the operation');
    }
    options.push('Cancel and start fresh');

    return [...new Set(options)]; // Remove duplicates
  }

  /**
   * Build suggested actions
   */
  private buildSuggestedActions(error: ClassifiedError, _diagnostic?: DiagnosticInfo): UserAction[] {
    const actions: UserAction[] = [];

    // Retry action
    if (error.isRetryable) {
      actions.push({
        id: 'retry',
        label: 'Retry',
        description: 'Try the operation again',
        type: 'retry',
        isRecommended: error.category === 'transient',
      });
    }

    // Category-specific actions
    switch (error.category) {
      case 'configuration':
        actions.push({
          id: 'settings',
          label: 'Open Settings',
          description: 'Review and update API keys',
          type: 'modify',
          isRecommended: true,
        });
        break;

      case 'resource':
        actions.push({
          id: 'simplify',
          label: 'Simplify Request',
          description: 'Reduce context size and try again',
          type: 'modify',
          isRecommended: true,
        });
        break;
    }

    // Cancel action
    actions.push({
      id: 'cancel',
      label: 'Cancel',
      description: 'Stop the current operation',
      type: 'cancel',
      isRecommended: false,
    });

    return actions;
  }

  /**
   * Build technical details
   */
  private buildTechnicalDetails(error: ClassifiedError): string {
    const parts: string[] = [];

    parts.push(`Error: ${error.original.message}`);
    parts.push(`Category: ${error.category}`);
    parts.push(`Severity: ${error.severity}`);

    if (error.code) parts.push(`Code: ${error.code}`);
    if (error.httpStatus) parts.push(`HTTP: ${error.httpStatus}`);
    if (error.context.provider) parts.push(`Provider: ${error.context.provider}`);
    if (error.context.toolName) parts.push(`Tool: ${error.context.toolName}`);

    if (error.context.stack) {
      parts.push(`\nStack:\n${error.context.stack.split('\n').slice(0, 5).join('\n')}`);
    }

    return parts.join('\n');
  }

  // ===========================================================================
  // Notifications
  // ===========================================================================

  /**
   * Show notification to user
   */
  notify(
    level: 'info' | 'warning' | 'error' | 'critical',
    message: string,
    options: {
      details?: string;
      actions?: UserAction[];
      expiresInMs?: number;
    } = {}
  ): string {
    const id = randomUUID();

    const notification: UserNotification = {
      id,
      level: this.getNotificationLevel(level),
      message,
      details: options.details,
      actions: options.actions,
      createdAt: Date.now(),
      expiresAt: options.expiresInMs ? Date.now() + options.expiresInMs : undefined,
      dismissed: false,
    };

    this.notifications.set(id, notification);

    this.deps.emitEvent({
      type: 'user-notification',
      notification: {
        id,
        level: level,
        title: notification.level.title,
        message,
        details: options.details,
        actions: options.actions,
        persistent: notification.level.persistent,
      },
      timestamp: Date.now(),
    });

    this.emit('notification', notification);

    // Auto-expire if configured
    if (notification.expiresAt) {
      setTimeout(() => {
        this.dismissNotification(id);
      }, options.expiresInMs);
    }

    return id;
  }

  /**
   * Get notification level config
   */
  private getNotificationLevel(level: 'info' | 'warning' | 'error' | 'critical'): NotificationLevel {
    const configs: Record<string, NotificationLevel> = {
      info: { type: 'info', title: 'Info', persistent: false },
      warning: { type: 'warning', title: 'Warning', persistent: false },
      error: { type: 'error', title: 'Error', persistent: true },
      critical: { type: 'critical', title: 'Critical Error', persistent: true },
    };
    return configs[level];
  }

  /**
   * Dismiss notification
   */
  dismissNotification(id: string): boolean {
    const notification = this.notifications.get(id);
    if (!notification) return false;

    notification.dismissed = true;
    this.notifications.delete(id);
    this.notificationHistory.push(notification);

    // Trim history
    if (this.notificationHistory.length > this.maxHistory) {
      this.notificationHistory = this.notificationHistory.slice(-this.maxHistory);
    }

    this.emit('notification-dismissed', notification);
    return true;
  }

  /**
   * Get active notifications
   */
  getActiveNotifications(): UserNotification[] {
    return Array.from(this.notifications.values());
  }

  // ===========================================================================
  // User Decisions
  // ===========================================================================

  /**
   * Request decision from user
   */
  async requestDecision(request: HelpRequest): Promise<{ action: UserAction; data?: unknown }> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingDecisions.delete(request.id);
        reject(new Error('Decision timeout'));
      }, request.timeoutMs);

      const pending: PendingDecision = {
        id: request.id,
        request,
        resolve: (action, data) => resolve({ action, data }),
        reject,
        timeoutId,
      };

      this.pendingDecisions.set(request.id, pending);

      this.deps.emitEvent({
        type: 'user-decision-required',
        request: {
          id: request.id,
          question: request.question,
          context: request.context,
          options: request.options,
          defaultOption: request.defaultOption,
          timeoutMs: request.timeoutMs,
        },
        timestamp: Date.now(),
      });

      this.emit('decision-required', request);
    });
  }

  /**
   * Handle user's decision
   */
  handleDecision(requestId: string, action: UserAction, data?: unknown): boolean {
    const pending = this.pendingDecisions.get(requestId);
    if (!pending) return false;

    clearTimeout(pending.timeoutId);
    pending.resolve(action, data);
    this.pendingDecisions.delete(requestId);

    this.emit('decision-made', { requestId, action, data });
    return true;
  }

  /**
   * Cancel pending decision
   */
  cancelDecision(requestId: string, reason?: string): boolean {
    const pending = this.pendingDecisions.get(requestId);
    if (!pending) return false;

    clearTimeout(pending.timeoutId);
    pending.reject(new Error(reason || 'Decision cancelled'));
    this.pendingDecisions.delete(requestId);

    return true;
  }

  /**
   * Get pending decisions
   */
  getPendingDecisions(): HelpRequest[] {
    return Array.from(this.pendingDecisions.values()).map(p => p.request);
  }

  // ===========================================================================
  // Convenience Methods
  // ===========================================================================

  /**
   * Notify about error
   */
  notifyError(error: ClassifiedError, diagnostic?: DiagnosticInfo): string {
    const explanation = this.explainError(error, diagnostic);

    return this.notify(
      error.severity === 'critical' ? 'critical' : 'error',
      explanation.summary,
      {
        details: explanation.details,
        actions: explanation.suggestedActions,
      }
    );
  }

  /**
   * Notify about recovery attempt
   */
  notifyRecoveryAttempt(strategyName: string): string {
    return this.notify('info', `Attempting recovery: ${strategyName}`, {
      expiresInMs: 10000,
    });
  }

  /**
   * Notify about successful recovery
   */
  notifyRecoverySuccess(strategyName: string): string {
    return this.notify('info', `Recovered successfully via ${strategyName}`, {
      expiresInMs: 5000,
    });
  }

  /**
   * Notify about rate limiting
   */
  notifyRateLimit(waitTimeMs: number): string {
    const waitSeconds = Math.ceil(waitTimeMs / 1000);
    return this.notify('warning', `Rate limited. Waiting ${waitSeconds} seconds...`, {
      expiresInMs: waitTimeMs,
    });
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get statistics
   */
  getStats(): {
    activeNotifications: number;
    pendingDecisions: number;
    totalNotifications: number;
    notificationsByLevel: Record<string, number>;
  } {
    const allNotifications = [
      ...this.notificationHistory,
      ...Array.from(this.notifications.values()),
    ];

    const byLevel: Record<string, number> = {};
    for (const n of allNotifications) {
      byLevel[n.level.type] = (byLevel[n.level.type] || 0) + 1;
    }

    return {
      activeNotifications: this.notifications.size,
      pendingDecisions: this.pendingDecisions.size,
      totalNotifications: allNotifications.length,
      notificationsByLevel: byLevel,
    };
  }

  /**
   * Clear all state
   */
  clear(): void {
    // Cancel pending decisions
    for (const pending of this.pendingDecisions.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('Cleared'));
    }

    this.notifications.clear();
    this.pendingDecisions.clear();
  }
}
