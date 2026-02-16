/**
 * Error Telemetry Service
 * 
 * Centralized error tracking, reporting, and analytics for the application.
 * Provides structured error collection with context for debugging.
 */

// =============================================================================
// Types
// =============================================================================

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ErrorCategory = 
  | 'ui'
  | 'network'
  | 'ai'
  | 'file'
  | 'terminal'
  | 'state'
  | 'unknown';

export interface TelemetryError {
  id: string;
  timestamp: number;
  message: string;
  stack?: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  context: ErrorContext;
  userAgent?: string;
  sessionId?: string;
  handled: boolean;
}

export interface ErrorContext {
  component?: string;
  action?: string;
  filePath?: string;
  provider?: string;
  tool?: string;
  metadata?: Record<string, unknown>;
}

export interface TelemetryStats {
  totalErrors: number;
  byCategory: Record<ErrorCategory, number>;
  bySeverity: Record<ErrorSeverity, number>;
  lastError?: TelemetryError;
  sessionStart: number;
  errorsPerMinute: number;
}

// =============================================================================
// Error Telemetry Service
// =============================================================================

class ErrorTelemetryService {
  private errors: TelemetryError[] = [];
  private maxErrors = 100; // Keep last 100 errors in memory
  private sessionId: string;
  private sessionStart: number;
  private listeners: Set<(error: TelemetryError) => void> = new Set();
  private enabled = true;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.sessionStart = Date.now();
    this.setupGlobalErrorHandlers();
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Setup global error handlers
   */
  private setupGlobalErrorHandlers(): void {
    // Global error/rejection handlers are already installed in main.tsx
    // (which forwards to the main process logger for persistent storage).
    // Installing a second set here causes duplicate processing and potential
    // race conditions.  Instead, expose a public `captureError` method that
    // main.tsx calls so telemetry still records the errors without duplicate
    // listeners.
    //
    // NOTE: Keeping the method for backward compatibility; it's now a no-op.
  }

  /**
   * Enable or disable telemetry
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Capture an error with context
   */
  captureError(
    error: Error | string,
    context: ErrorContext = {},
    options?: {
      severity?: ErrorSeverity;
      category?: ErrorCategory;
      handled?: boolean;
    }
  ): TelemetryError {
    if (!this.enabled) {
      return this.createErrorObject(error, context, options);
    }

    const telemetryError = this.createErrorObject(error, context, options);
    
    // Add to errors array
    this.errors.push(telemetryError);
    
    // Trim if exceeds max
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }

    // Notify listeners
    this.listeners.forEach(listener => listener(telemetryError));



    return telemetryError;
  }

  /**
   * Create error object from error and context
   */
  private createErrorObject(
    error: Error | string,
    context: ErrorContext,
    options?: {
      severity?: ErrorSeverity;
      category?: ErrorCategory;
      handled?: boolean;
    }
  ): TelemetryError {
    const errorInstance = typeof error === 'string' ? new Error(error) : error;
    
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
      message: errorInstance.message,
      stack: errorInstance.stack,
      category: options?.category ?? this.inferCategory(errorInstance, context),
      severity: options?.severity ?? this.inferSeverity(errorInstance, context),
      context,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      sessionId: this.sessionId,
      handled: options?.handled ?? true,
    };
  }

  /**
   * Infer error category from error and context
   */
  private inferCategory(error: Error, context: ErrorContext): ErrorCategory {
    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || '';
    
    if (context.provider || message.includes('api') || message.includes('fetch')) {
      return 'network';
    }
    if (context.tool || message.includes('tool')) {
      return 'ai';
    }
    if (context.filePath || message.includes('file') || message.includes('fs')) {
      return 'file';
    }
    if (message.includes('terminal') || message.includes('shell')) {
      return 'terminal';
    }
    if (context.component && (
      stack.includes('react') || 
      message.includes('component') ||
      message.includes('render')
    )) {
      return 'ui';
    }
    if (message.includes('state') || message.includes('reducer')) {
      return 'state';
    }
    
    return 'unknown';
  }

  /**
   * Infer error severity from error and context
   */
  private inferSeverity(error: Error, context: ErrorContext): ErrorSeverity {
    const message = error.message.toLowerCase();
    
    // Critical: API key issues, auth failures
    if (message.includes('api key') || message.includes('unauthorized') || message.includes('401')) {
      return 'critical';
    }
    
    // High: Network errors, provider failures
    if (message.includes('network') || message.includes('timeout') || context.provider) {
      return 'high';
    }
    
    // Medium: File operations, state errors
    if (context.filePath || message.includes('file') || message.includes('state')) {
      return 'medium';
    }
    
    // Low: UI errors, non-critical issues
    return 'low';
  }

  /**
   * Subscribe to error events
   */
  subscribe(listener: (error: TelemetryError) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get all captured errors
   */
  getErrors(): TelemetryError[] {
    return [...this.errors];
  }

  /**
   * Get errors by category
   */
  getErrorsByCategory(category: ErrorCategory): TelemetryError[] {
    return this.errors.filter(e => e.category === category);
  }

  /**
   * Get errors by severity
   */
  getErrorsBySeverity(severity: ErrorSeverity): TelemetryError[] {
    return this.errors.filter(e => e.severity === severity);
  }

  /**
   * Get errors in time range
   */
  getErrorsInRange(startTime: number, endTime: number): TelemetryError[] {
    return this.errors.filter(e => e.timestamp >= startTime && e.timestamp <= endTime);
  }

  /**
   * Get telemetry statistics
   */
  getStats(): TelemetryStats {
    const now = Date.now();
    const sessionDurationMinutes = (now - this.sessionStart) / 60000;
    
    const byCategory: Record<ErrorCategory, number> = {
      ui: 0,
      network: 0,
      ai: 0,
      file: 0,
      terminal: 0,
      state: 0,
      unknown: 0,
    };
    
    const bySeverity: Record<ErrorSeverity, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };
    
    for (const error of this.errors) {
      byCategory[error.category]++;
      bySeverity[error.severity]++;
    }
    
    return {
      totalErrors: this.errors.length,
      byCategory,
      bySeverity,
      lastError: this.errors[this.errors.length - 1],
      sessionStart: this.sessionStart,
      errorsPerMinute: sessionDurationMinutes > 0 
        ? this.errors.length / sessionDurationMinutes 
        : 0,
    };
  }

  /**
   * Clear all errors
   */
  clearErrors(): void {
    this.errors = [];
  }

  /**
   * Export errors as JSON
   */
  exportErrors(): string {
    return JSON.stringify({
      sessionId: this.sessionId,
      sessionStart: this.sessionStart,
      exportTime: Date.now(),
      stats: this.getStats(),
      errors: this.errors,
    }, null, 2);
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let telemetryInstance: ErrorTelemetryService | null = null;

export function getErrorTelemetry(): ErrorTelemetryService {
  if (!telemetryInstance) {
    telemetryInstance = new ErrorTelemetryService();
  }
  return telemetryInstance;
}

// =============================================================================
// React Hook
// =============================================================================

import { useEffect, useCallback, useRef, useState } from 'react';

/**
 * Hook to capture errors with component context
 */
export function useErrorCapture(componentName: string) {
  const telemetry = getErrorTelemetry();
  
  const captureError = useCallback((
    error: Error | string,
    context?: Omit<ErrorContext, 'component'>
  ) => {
    return telemetry.captureError(error, {
      ...context,
      component: componentName,
    });
  }, [componentName, telemetry]);
  
  return captureError;
}

/**
 * Hook to monitor error telemetry stats
 */
export function useErrorStats() {
  const telemetry = getErrorTelemetry();
  const [stats, setStats] = useState<TelemetryStats>(() => telemetry.getStats());
  
  useEffect(() => {
    // Update stats on new errors
    const unsubscribe = telemetry.subscribe(() => {
      setStats(telemetry.getStats());
    });
    
    return unsubscribe;
  }, [telemetry]);
  
  return stats;
}

/**
 * Hook to listen for errors
 */
export function useErrorListener(
  callback: (error: TelemetryError) => void,
  deps: unknown[] = []
) {
  const telemetry = getErrorTelemetry();

  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  useEffect(() => {
    const unsubscribe = telemetry.subscribe((err) => callbackRef.current(err));
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps is a caller-provided dependency list; spreading preserves element-wise tracking.
  }, [telemetry, ...deps]);
}

// =============================================================================
// Error Boundary Helper
// =============================================================================

/**
 * Capture error from React error boundary
 */
export function captureComponentError(
  error: Error,
  errorInfo: { componentStack?: string },
  componentName?: string
): TelemetryError {
  const telemetry = getErrorTelemetry();
  
  return telemetry.captureError(error, {
    component: componentName,
    metadata: {
      componentStack: errorInfo.componentStack,
    },
  }, {
    category: 'ui',
    severity: 'high',
    handled: true,
  });
}

export default {
  getErrorTelemetry,
  useErrorCapture,
  useErrorStats,
  useErrorListener,
  captureComponentError,
};
