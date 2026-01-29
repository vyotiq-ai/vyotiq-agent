/**
 * DiagnosticEngine
 *
 * Analyzes errors to find root causes and suggest solutions.
 * Uses pattern matching and historical comparison for diagnosis.
 */

import type {
  ClassifiedError,
  DiagnosticInfo,
  RootCause,
  SuggestedFix,
  DiagnosticEngineConfig,
  RecoveryDeps,
} from './types';
import { DEFAULT_DIAGNOSTIC_ENGINE_CONFIG } from './types';

// =============================================================================
// Diagnostic Patterns
// =============================================================================

interface DiagnosticPattern {
  /** Pattern to match */
  match: (error: ClassifiedError) => boolean;
  /** Root cause template */
  cause: string;
  /** Evidence generator */
  getEvidence: (error: ClassifiedError) => string[];
  /** Contributing factors */
  contributingFactors: string[];
  /** Suggested fixes */
  fixes: SuggestedFix[];
}

const DIAGNOSTIC_PATTERNS: DiagnosticPattern[] = [
  // Rate limit pattern
  {
    match: (e) => e.category === 'transient' && /rate.?limit|429/i.test(e.original.message),
    cause: 'API rate limit exceeded',
    getEvidence: (e) => [
      'Error message indicates rate limiting',
      `HTTP status: ${e.httpStatus || 'N/A'}`,
      'Too many requests in short time period',
    ],
    contributingFactors: [
      'High request frequency',
      'Parallel operations',
      'No request throttling',
    ],
    fixes: [
      {
        description: 'Wait and retry with exponential backoff',
        type: 'automatic',
        steps: ['Wait for suggested delay', 'Retry with backoff', 'Reduce parallel requests'],
        successProbability: 0.9,
      },
      {
        description: 'Switch to a different provider temporarily',
        type: 'automatic',
        steps: ['Fallback to secondary provider', 'Queue requests for primary'],
        successProbability: 0.85,
      },
    ],
  },
  // Authentication pattern
  {
    match: (e) => e.category === 'configuration' && /401|unauthorized|api.?key/i.test(e.original.message),
    cause: 'Authentication failure - invalid or missing API key',
    getEvidence: (e) => [
      'Error indicates authentication failure',
      `Provider: ${e.context.provider || 'unknown'}`,
    ],
    contributingFactors: [
      'Expired API key',
      'Incorrect key format',
      'Key not configured',
    ],
    fixes: [
      {
        description: 'Verify API key configuration',
        type: 'user-action',
        steps: [
          'Check provider settings',
          'Verify API key is correct',
          'Regenerate key if needed',
        ],
        successProbability: 0.95,
      },
    ],
  },
  // Context overflow pattern
  {
    match: (_e) => _e.category === 'resource' && /token.?limit|context.?length/i.test(_e.original.message),
    cause: 'Context window exceeded - too many tokens in conversation',
    getEvidence: (_e) => [
      'Error indicates token/context limit',
      'Conversation history may be too long',
      'Large tool outputs may have accumulated',
    ],
    contributingFactors: [
      'Long conversation history',
      'Large file contents in context',
      'Verbose tool outputs',
      'No context summarization',
    ],
    fixes: [
      {
        description: 'Summarize and compress context',
        type: 'automatic',
        steps: ['Summarize older messages', 'Compress tool results', 'Retry with smaller context'],
        successProbability: 0.85,
      },
      {
        description: 'Start fresh conversation',
        type: 'user-action',
        steps: ['Create new session', 'Provide only essential context'],
        successProbability: 0.95,
      },
    ],
  },
  // Tool execution failure pattern
  {
    match: (e) => e.context.toolName !== undefined || /tool/i.test(e.original.message),
    cause: 'Tool execution failure',
    getEvidence: (e) => [
      `Tool: ${e.context.toolName || 'unknown'}`,
      'Tool returned an error',
      e.context.recentOperations?.slice(-3).join(', ') || 'No recent operations',
    ],
    contributingFactors: [
      'Invalid tool arguments',
      'File/resource not found',
      'Permission issues',
      'External service failure',
    ],
    fixes: [
      {
        description: 'Retry with corrected arguments',
        type: 'automatic',
        steps: ['Analyze error message', 'Fix arguments', 'Retry tool call'],
        successProbability: 0.7,
      },
      {
        description: 'Try alternative approach',
        type: 'automatic',
        steps: ['Find alternative tool', 'Modify strategy', 'Proceed without this operation'],
        successProbability: 0.6,
      },
    ],
  },
  // Network/connectivity pattern
  {
    match: (e) => e.category === 'transient' && /network|connection|ECONNREFUSED/i.test(e.original.message),
    cause: 'Network connectivity issue',
    getEvidence: (e) => [
      'Network error detected',
      `Error code: ${e.code || 'N/A'}`,
    ],
    contributingFactors: [
      'Internet connectivity issues',
      'Service temporarily unavailable',
      'Firewall/proxy blocking',
    ],
    fixes: [
      {
        description: 'Retry after brief delay',
        type: 'automatic',
        steps: ['Wait for connectivity', 'Retry request'],
        successProbability: 0.8,
      },
      {
        description: 'Check network configuration',
        type: 'user-action',
        steps: ['Verify internet connection', 'Check proxy settings'],
        successProbability: 0.9,
      },
    ],
  },
  // JSON parsing pattern
  {
    match: (_e) => _e.category === 'validation' && /JSON|parse|syntax/i.test(_e.original.message),
    cause: 'Invalid JSON response from model',
    getEvidence: (_e) => [
      'JSON parsing failed',
      'Model output may be malformed',
    ],
    contributingFactors: [
      'Model generated invalid JSON',
      'Response truncated',
      'Encoding issues',
    ],
    fixes: [
      {
        description: 'Request reformatted response',
        type: 'automatic',
        steps: ['Provide corrective feedback', 'Request valid JSON', 'Parse alternative formats'],
        successProbability: 0.75,
      },
    ],
  },
  // File system pattern
  {
    match: (e) => e.category === 'external' && /ENOENT|EACCES|file/i.test(e.original.message),
    cause: 'File system operation failed',
    getEvidence: (e) => [
      `Error code: ${e.code || 'N/A'}`,
      'File or directory operation failed',
    ],
    contributingFactors: [
      'File does not exist',
      'Insufficient permissions',
      'Path is incorrect',
    ],
    fixes: [
      {
        description: 'Verify file path and permissions',
        type: 'automatic',
        steps: ['Check if file exists', 'Verify path is correct', 'Check permissions'],
        successProbability: 0.7,
      },
      {
        description: 'Create missing file/directory',
        type: 'automatic',
        steps: ['Create parent directories', 'Create file if needed'],
        successProbability: 0.6,
      },
    ],
  },
];

// =============================================================================
// DiagnosticEngine
// =============================================================================

export class DiagnosticEngine {
  private readonly logger: RecoveryDeps['logger'];
  private readonly config: DiagnosticEngineConfig;
  private errorHistory: Array<{ error: ClassifiedError; timestamp: number }> = [];

  constructor(
    deps: RecoveryDeps,
    config: Partial<DiagnosticEngineConfig> = {}
  ) {
    this.logger = deps.logger;
    this.config = { ...DEFAULT_DIAGNOSTIC_ENGINE_CONFIG, ...config };
  }

  // ===========================================================================
  // Diagnosis Methods
  // ===========================================================================

  /**
   * Perform full diagnosis on an error
   */
  diagnose(error: ClassifiedError): DiagnosticInfo {
    const startTime = Date.now();

    // Find matching pattern
    const pattern = this.findMatchingPattern(error);

    // Build root cause
    const rootCause = this.buildRootCause(error, pattern);

    // Build suggested fixes
    const suggestedFixes = this.buildSuggestedFixes(error, pattern);

    // Find related errors
    const relatedErrors = this.config.enableHistoricalComparison
      ? this.findRelatedErrors(error)
      : undefined;

    // Store in history
    this.recordError(error);

    const diagnosisTimeMs = Date.now() - startTime;

    const diagnostic: DiagnosticInfo = {
      error,
      rootCause,
      suggestedFixes,
      relatedErrors,
      timestamp: Date.now(),
      diagnosisTimeMs,
    };

    this.logger.debug('Diagnosis complete', {
      cause: rootCause.cause,
      confidence: rootCause.confidence,
      fixCount: suggestedFixes.length,
      diagnosisTimeMs,
    });

    return diagnostic;
  }

  /**
   * Find root cause for an error
   */
  findRootCause(error: ClassifiedError): RootCause {
    const pattern = this.findMatchingPattern(error);
    return this.buildRootCause(error, pattern);
  }

  /**
   * Suggest fixes for an error
   */
  suggestFix(diagnostic: DiagnosticInfo): SuggestedFix | null {
    if (diagnostic.suggestedFixes.length === 0) {
      return null;
    }

    // Return the fix with highest success probability
    return diagnostic.suggestedFixes.reduce((best, fix) =>
      fix.successProbability > best.successProbability ? fix : best
    );
  }

  /**
   * Collect evidence for an error
   */
  collectEvidence(error: ClassifiedError): string[] {
    const evidence: string[] = [];

    // Basic error info
    evidence.push(`Error: ${error.original.message}`);
    evidence.push(`Category: ${error.category}`);
    evidence.push(`Severity: ${error.severity}`);

    // Context info
    if (error.context.operation) {
      evidence.push(`Operation: ${error.context.operation}`);
    }
    if (error.context.toolName) {
      evidence.push(`Tool: ${error.context.toolName}`);
    }
    if (error.context.provider) {
      evidence.push(`Provider: ${error.context.provider}`);
    }
    if (error.httpStatus) {
      evidence.push(`HTTP Status: ${error.httpStatus}`);
    }
    if (error.code) {
      evidence.push(`Error Code: ${error.code}`);
    }

    // Recent operations
    if (error.context.recentOperations?.length) {
      evidence.push(`Recent operations: ${error.context.recentOperations.join(', ')}`);
    }

    return evidence;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private findMatchingPattern(error: ClassifiedError): DiagnosticPattern | null {
    if (!this.config.enablePatternMatching) {
      return null;
    }

    for (const pattern of DIAGNOSTIC_PATTERNS) {
      if (pattern.match(error)) {
        return pattern;
      }
    }

    return null;
  }

  private buildRootCause(error: ClassifiedError, pattern: DiagnosticPattern | null): RootCause {
    if (pattern) {
      return {
        cause: pattern.cause,
        confidence: 0.8,
        evidence: pattern.getEvidence(error),
        contributingFactors: pattern.contributingFactors,
      };
    }

    // Generic root cause based on category
    return {
      cause: this.getGenericCause(error),
      confidence: 0.5,
      evidence: this.collectEvidence(error),
      contributingFactors: this.getGenericFactors(error),
    };
  }

  private getGenericCause(error: ClassifiedError): string {
    switch (error.category) {
      case 'transient':
        return 'Temporary service issue';
      case 'configuration':
        return 'Configuration or setup problem';
      case 'logic':
        return 'Incorrect operation or decision';
      case 'resource':
        return 'Resource limit exceeded';
      case 'external':
        return 'External service failure';
      case 'validation':
        return 'Input or output validation failure';
      default:
        return 'Unknown error occurred';
    }
  }

  private getGenericFactors(error: ClassifiedError): string[] {
    const factors: string[] = [];

    switch (error.category) {
      case 'transient':
        factors.push('Service temporarily unavailable', 'High load on service');
        break;
      case 'configuration':
        factors.push('Missing configuration', 'Invalid settings');
        break;
      case 'logic':
        factors.push('Incorrect tool usage', 'Wrong assumptions');
        break;
      case 'resource':
        factors.push('Resource exhaustion', 'Quota exceeded');
        break;
      case 'external':
        factors.push('Third-party service issue', 'Integration problem');
        break;
      case 'validation':
        factors.push('Invalid input', 'Unexpected output format');
        break;
    }

    return factors;
  }

  private buildSuggestedFixes(error: ClassifiedError, pattern: DiagnosticPattern | null): SuggestedFix[] {
    const fixes: SuggestedFix[] = [];

    // Pattern-specific fixes
    if (pattern) {
      fixes.push(...pattern.fixes);
    }

    // Generic fixes based on category
    const genericFixes = this.getGenericFixes(error);
    fixes.push(...genericFixes);

    // Deduplicate and limit
    const uniqueFixes = this.deduplicateFixes(fixes);
    return uniqueFixes.slice(0, this.config.maxSuggestedFixes);
  }

  private getGenericFixes(error: ClassifiedError): SuggestedFix[] {
    const fixes: SuggestedFix[] = [];

    if (error.isRetryable) {
      fixes.push({
        description: 'Retry the operation',
        type: 'automatic',
        steps: ['Wait briefly', 'Retry the failed operation'],
        successProbability: 0.5,
      });
    }

    if (error.category === 'configuration') {
      fixes.push({
        description: 'Check and update configuration',
        type: 'user-action',
        steps: ['Review settings', 'Verify credentials', 'Update configuration'],
        successProbability: 0.8,
      });
    }

    if (error.severity === 'critical') {
      fixes.push({
        description: 'Seek manual intervention',
        type: 'user-action',
        steps: ['Review error details', 'Contact support if needed', 'Provide manual fix'],
        successProbability: 0.7,
      });
    }

    return fixes;
  }

  private deduplicateFixes(fixes: SuggestedFix[]): SuggestedFix[] {
    const seen = new Set<string>();
    return fixes.filter(fix => {
      if (seen.has(fix.description)) {
        return false;
      }
      seen.add(fix.description);
      return true;
    });
  }

  private findRelatedErrors(error: ClassifiedError): string[] {
    const related: string[] = [];
    const oneHourAgo = Date.now() - 3600000;

    for (const entry of this.errorHistory) {
      if (entry.timestamp < oneHourAgo) continue;
      if (entry.error.original.message === error.original.message) continue;

      // Check for similarity
      if (
        entry.error.category === error.category ||
        entry.error.context.toolName === error.context.toolName ||
        entry.error.context.operation === error.context.operation
      ) {
        related.push(entry.error.original.message);
      }
    }

    return related.slice(0, 5);
  }

  private recordError(error: ClassifiedError): void {
    this.errorHistory.push({ error, timestamp: Date.now() });

    // Keep only last hour
    const oneHourAgo = Date.now() - 3600000;
    this.errorHistory = this.errorHistory.filter(e => e.timestamp >= oneHourAgo);
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errorHistory = [];
  }

  /**
   * Get statistics
   */
  getStats(): {
    patternsCount: number;
    errorHistoryCount: number;
  } {
    return {
      patternsCount: DIAGNOSTIC_PATTERNS.length,
      errorHistoryCount: this.errorHistory.length,
    };
  }
}
