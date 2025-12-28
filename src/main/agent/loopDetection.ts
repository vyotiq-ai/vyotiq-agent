/**
 * Loop Detection Module
 * 
 * Intelligently detects infinite loops while allowing legitimate exploration.
 * 
 * Key principles:
 * 1. Reading different files is NOT a loop - it's exploration
 * 2. Listing different directories is NOT a loop - it's discovery
 * 3. A loop is when the EXACT same action is repeated without progress
 * 4. Exploration tools (read, ls, grep) have higher tolerance
 * 5. Action tools (write, delete, run) have lower tolerance
 */

import type { ToolCallPayload, ChatMessage } from '../../shared/types';
import { createLogger } from '../logger';

const logger = createLogger('LoopDetection');

// =============================================================================
// Types
// =============================================================================

export interface LoopDetectionConfig {
  /** Enable loop detection */
  enabled: boolean;
  /** Maximum consecutive identical tool calls before triggering */
  maxConsecutiveIdenticalCalls: number;
  /** Maximum identical calls in a window before warning */
  maxIdenticalCallsInWindow: number;
  /** Time window for analysis (ms) */
  windowMs: number;
  /** Minimum iterations before loop detection activates */
  minIterationsForDetection: number;
  /** Similarity threshold for pattern matching (0-1) */
  patternSimilarityThreshold: number;
}

export interface ToolCallPattern {
  toolName: string;
  argumentsHash: string;
  /** Key argument value for semantic comparison (e.g., file path) */
  keyArgument?: string;
  timestamp: number;
  iteration: number;
  /** Whether the tool succeeded */
  success?: boolean;
}

export interface LoopDetectionResult {
  /** Whether a loop was detected */
  loopDetected: boolean;
  /** Type of loop detected */
  loopType?: 'identical-calls' | 'repetitive-pattern' | 'no-progress' | 'repeated-failures';
  /** Confidence level (0-1) */
  confidence: number;
  /** Description of the detected pattern */
  description: string;
  /** Suggested action */
  suggestion: string;
  /** Tool(s) involved in the loop */
  involvedTools: string[];
  /** Number of repetitions detected */
  repetitionCount: number;
}

export interface LoopDetectionState {
  runId: string;
  sessionId: string;
  patterns: ToolCallPattern[];
  consecutiveIdenticalCalls: number;
  lastToolCall?: ToolCallPattern;
  /** Track unique resources accessed (files, directories) */
  uniqueResourcesAccessed: Set<string>;
  /** Track consecutive failures */
  consecutiveFailures: number;
  circuitBreakerTriggered: boolean;
  warningIssued: boolean;
}

// =============================================================================
// Tool Categories - Different tools have different loop thresholds
// =============================================================================

/** Exploration tools - high tolerance, reading many files is normal */
const EXPLORATION_TOOLS = new Set([
  'read', 'ls', 'grep', 'search', 'find', 'glob', 'list',
  'readFile', 'listDirectory', 'grepSearch', 'fileSearch',
  'cat', 'head', 'tail', 'tree',
]);

/** Action tools - lower tolerance, repeated actions are suspicious */
const ACTION_TOOLS = new Set([
  'write', 'delete', 'run', 'exec', 'create', 'modify',
  'writeFile', 'deleteFile', 'runCommand', 'executeCommand',
  'mkdir', 'rm', 'mv', 'cp',
]);

// =============================================================================
// Default Configuration
// =============================================================================

export const DEFAULT_LOOP_DETECTION_CONFIG: LoopDetectionConfig = {
  enabled: true,
  maxConsecutiveIdenticalCalls: 4,
  maxIdenticalCallsInWindow: 8,
  windowMs: 120000, // 2 minutes
  minIterationsForDetection: 8,
  patternSimilarityThreshold: 0.95,
};

// =============================================================================
// Loop Detector Class
// =============================================================================

export class LoopDetector {
  private config: LoopDetectionConfig;
  private states = new Map<string, LoopDetectionState>();

  constructor(config: Partial<LoopDetectionConfig> = {}) {
    this.config = { ...DEFAULT_LOOP_DETECTION_CONFIG, ...config };
  }

  /**
   * Initialize detection state for a new run
   */
  initializeRun(runId: string, sessionId: string): void {
    this.states.set(runId, {
      runId,
      sessionId,
      patterns: [],
      consecutiveIdenticalCalls: 0,
      uniqueResourcesAccessed: new Set(),
      consecutiveFailures: 0,
      circuitBreakerTriggered: false,
      warningIssued: false,
    });
  }

  /**
   * Record a tool call and check for loops
   */
  recordToolCall(
    runId: string,
    toolCall: ToolCallPayload,
    iteration: number,
    success: boolean = true
  ): LoopDetectionResult {
    if (!this.config.enabled) {
      return this.noLoopResult();
    }

    const state = this.states.get(runId);
    if (!state) {
      return this.noLoopResult();
    }

    // Extract key argument (file path, directory, etc.) for semantic comparison
    const keyArgument = this.extractKeyArgument(toolCall);
    
    // Create pattern from tool call
    const pattern: ToolCallPattern = {
      toolName: toolCall.name,
      argumentsHash: this.hashArguments(toolCall.arguments),
      keyArgument,
      timestamp: Date.now(),
      iteration,
      success,
    };

    // Track unique resources accessed
    if (keyArgument) {
      state.uniqueResourcesAccessed.add(keyArgument);
    }

    // Track consecutive failures
    if (!success) {
      state.consecutiveFailures++;
    } else {
      state.consecutiveFailures = 0;
    }

    // Update state
    state.patterns.push(pattern);

    // Check for identical consecutive calls
    if (state.lastToolCall) {
      if (this.patternsMatch(pattern, state.lastToolCall)) {
        state.consecutiveIdenticalCalls++;
      } else {
        state.consecutiveIdenticalCalls = 1;
      }
    } else {
      state.consecutiveIdenticalCalls = 1;
    }
    state.lastToolCall = pattern;

    // Run intelligent detection
    const result = this.detectLoop(state, iteration, toolCall.name);

    if (result.loopDetected) {
      logger.warn('Loop detected', {
        runId,
        sessionId: state.sessionId,
        loopType: result.loopType,
        confidence: result.confidence,
        involvedTools: result.involvedTools,
        repetitionCount: result.repetitionCount,
        uniqueResourcesAccessed: state.uniqueResourcesAccessed.size,
      });
    }

    return result;
  }


  /**
   * Analyze messages for loop patterns (for existing conversations)
   */
  analyzeMessages(
    runId: string,
    messages: ChatMessage[],
    currentIteration: number
  ): LoopDetectionResult {
    if (!this.config.enabled) {
      return this.noLoopResult();
    }

    const state = this.states.get(runId);
    if (!state) {
      return this.noLoopResult();
    }

    // Extract tool calls from recent assistant messages
    const recentAssistantMessages = messages
      .filter(m => m.role === 'assistant' && m.runId === runId && m.toolCalls?.length)
      .slice(-20);

    if (recentAssistantMessages.length < this.config.minIterationsForDetection) {
      return this.noLoopResult();
    }

    // Build sequence with full context
    const toolSequence: Array<{ signature: string; keyArg?: string }> = [];
    for (const msg of recentAssistantMessages) {
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          const argsHash = this.hashArguments(tc.arguments || {});
          const keyArg = this.extractKeyArgument(tc);
          toolSequence.push({
            signature: `${tc.name}:${argsHash}`,
            keyArg,
          });
        }
      }
    }

    // Check for true repetition (same signature AND same key argument)
    const sequenceResult = this.detectRepeatingSequence(
      toolSequence.map(t => t.signature)
    );
    
    if (sequenceResult.detected && sequenceResult.confidence >= this.config.patternSimilarityThreshold) {
      const toolNames = sequenceResult.pattern.map(sig => sig.split(':')[0]);
      return {
        loopDetected: true,
        loopType: 'repetitive-pattern',
        confidence: sequenceResult.confidence,
        description: `Detected repeating identical call sequence: ${toolNames.join(' → ')}`,
        suggestion: 'The agent is making the exact same calls repeatedly. Consider providing more specific instructions.',
        involvedTools: [...new Set(toolNames)],
        repetitionCount: sequenceResult.repetitions,
      };
    }

    return this.detectLoop(state, currentIteration, '');
  }

  /**
   * Check if circuit breaker should trigger
   */
  shouldTriggerCircuitBreaker(runId: string): boolean {
    const state = this.states.get(runId);
    if (!state) return false;
    return state.circuitBreakerTriggered;
  }

  /**
   * Get current state for a run
   */
  getState(runId: string): LoopDetectionState | undefined {
    return this.states.get(runId);
  }

  /**
   * Clean up state for a completed run
   */
  cleanupRun(runId: string): void {
    this.states.delete(runId);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LoopDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private detectLoop(
    state: LoopDetectionState,
    iteration: number,
    currentTool: string
  ): LoopDetectionResult {
    // Determine tool category for threshold adjustment
    const isExplorationTool = EXPLORATION_TOOLS.has(currentTool) || 
      EXPLORATION_TOOLS.has(currentTool.toLowerCase());
    const isActionTool = ACTION_TOOLS.has(currentTool) ||
      ACTION_TOOLS.has(currentTool.toLowerCase());

    // Adjust thresholds based on tool type
    const consecutiveThreshold = isExplorationTool 
      ? this.config.maxConsecutiveIdenticalCalls + 2  // More lenient for exploration
      : isActionTool 
        ? this.config.maxConsecutiveIdenticalCalls - 1  // Stricter for actions
        : this.config.maxConsecutiveIdenticalCalls;

    // Check 1: Consecutive identical calls (same tool + same arguments)
    if (state.consecutiveIdenticalCalls >= consecutiveThreshold) {
      state.circuitBreakerTriggered = true;
      return {
        loopDetected: true,
        loopType: 'identical-calls',
        confidence: 0.95,
        description: `Same tool '${state.lastToolCall?.toolName}' called ${state.consecutiveIdenticalCalls} times with identical arguments`,
        suggestion: 'The agent is repeating the exact same action. This indicates it may be stuck or confused.',
        involvedTools: state.lastToolCall ? [state.lastToolCall.toolName] : [],
        repetitionCount: state.consecutiveIdenticalCalls,
      };
    }

    // Check 2: Repeated failures - agent keeps trying something that fails
    if (state.consecutiveFailures >= 5) {
      return {
        loopDetected: true,
        loopType: 'repeated-failures',
        confidence: 0.9,
        description: `${state.consecutiveFailures} consecutive tool calls have failed`,
        suggestion: 'Multiple operations are failing. The agent may need different instructions or the task may not be possible.',
        involvedTools: state.lastToolCall ? [state.lastToolCall.toolName] : [],
        repetitionCount: state.consecutiveFailures,
      };
    }

    // Check 3: No progress detection - many iterations but no new resources accessed
    if (iteration >= 15 && state.patterns.length >= 15) {
      const recentPatterns = state.patterns.slice(-15);
      const recentUniqueResources = new Set(
        recentPatterns.map(p => p.keyArgument).filter(Boolean)
      );
      
      // If we've done 15+ iterations but only accessed 2 or fewer unique resources
      // AND we're not using action tools (which might legitimately repeat)
      if (recentUniqueResources.size <= 2 && !isActionTool) {
        const recentTools = [...new Set(recentPatterns.map(p => p.toolName))];
        
        // Only flag if it's exploration tools that should be accessing different resources
        if (recentTools.some(t => EXPLORATION_TOOLS.has(t) || EXPLORATION_TOOLS.has(t.toLowerCase()))) {
          return {
            loopDetected: true,
            loopType: 'no-progress',
            confidence: 0.75,
            description: `${recentPatterns.length} iterations with only ${recentUniqueResources.size} unique resources accessed`,
            suggestion: 'The agent may be stuck exploring the same resources. Try providing more specific guidance.',
            involvedTools: recentTools,
            repetitionCount: recentPatterns.length,
          };
        }
      }
    }

    // Check 4: Identical call frequency in time window
    const now = Date.now();
    const recentPatterns = state.patterns.filter(
      p => now - p.timestamp < this.config.windowMs
    );
    
    // Group by full signature (tool + args)
    const signatureFrequency = new Map<string, number>();
    for (const p of recentPatterns) {
      const signature = `${p.toolName}:${p.argumentsHash}`;
      signatureFrequency.set(signature, (signatureFrequency.get(signature) || 0) + 1);
    }

    // Adjust threshold for exploration tools
    const frequencyThreshold = isExplorationTool
      ? this.config.maxIdenticalCallsInWindow + 4
      : this.config.maxIdenticalCallsInWindow;

    for (const [signature, count] of signatureFrequency) {
      if (count >= frequencyThreshold) {
        const toolName = signature.split(':')[0];
        state.warningIssued = true;
        return {
          loopDetected: true,
          loopType: 'identical-calls',
          confidence: 0.85,
          description: `Identical call to '${toolName}' made ${count} times in ${Math.round(this.config.windowMs / 60000)} minutes`,
          suggestion: 'The agent is making the same exact call repeatedly. This indicates it may be stuck.',
          involvedTools: [toolName],
          repetitionCount: count,
        };
      }
    }

    // Check 5: Repeating sequence pattern (only for non-exploration tools or very long sequences)
    if (iteration >= this.config.minIterationsForDetection && state.patterns.length >= 8) {
      const recentSignatures = state.patterns.slice(-12).map(p => `${p.toolName}:${p.argumentsHash}`);
      const patternResult = this.detectRepeatingSequence(recentSignatures);
      
      // Require higher confidence for exploration tools
      const requiredConfidence = isExplorationTool ? 0.98 : this.config.patternSimilarityThreshold;
      
      if (patternResult.detected && 
          patternResult.confidence >= requiredConfidence &&
          patternResult.repetitions >= 4) {
        const toolNames = patternResult.pattern.map(sig => sig.split(':')[0]);
        return {
          loopDetected: true,
          loopType: 'repetitive-pattern',
          confidence: patternResult.confidence,
          description: `Detected repeating pattern (${patternResult.repetitions}x): ${toolNames.join(' → ')}`,
          suggestion: 'The agent is following a repetitive pattern. Try providing clearer instructions.',
          involvedTools: [...new Set(toolNames)],
          repetitionCount: patternResult.repetitions,
        };
      }
    }

    return this.noLoopResult();
  }

  /**
   * Extract the key argument from a tool call for semantic comparison.
   * This helps distinguish between "read file1.ts" and "read file2.ts"
   */
  private extractKeyArgument(toolCall: ToolCallPayload): string | undefined {
    const args = toolCall.arguments || {};
    
    // Common argument names for file/directory paths
    const pathKeys = ['path', 'file', 'filePath', 'directory', 'dir', 'target', 'source', 'url'];
    
    for (const key of pathKeys) {
      if (typeof args[key] === 'string' && args[key]) {
        return args[key] as string;
      }
    }
    
    // For commands, use the command itself
    if (typeof args['command'] === 'string') {
      return args['command'] as string;
    }
    
    // For search/grep, use the query
    if (typeof args['query'] === 'string' || typeof args['pattern'] === 'string') {
      return (args['query'] || args['pattern']) as string;
    }
    
    return undefined;
  }

  private detectRepeatingSequence(sequence: string[]): {
    detected: boolean;
    pattern: string[];
    repetitions: number;
    confidence: number;
  } {
    if (sequence.length < 6) {
      return { detected: false, pattern: [], repetitions: 0, confidence: 0 };
    }

    // Try different pattern lengths (2 to half the sequence length)
    const maxPatternLength = Math.floor(sequence.length / 2);
    
    for (let patternLen = 2; patternLen <= Math.min(maxPatternLength, 4); patternLen++) {
      const pattern = sequence.slice(-patternLen);
      let repetitions = 1;
      
      // Count how many times this pattern repeats backwards
      for (let i = sequence.length - patternLen * 2; i >= 0; i -= patternLen) {
        const segment = sequence.slice(i, i + patternLen);
        if (this.arraysEqual(segment, pattern)) {
          repetitions++;
        } else {
          break;
        }
      }

      // Require more repetitions for shorter patterns
      const minRepetitions = patternLen <= 2 ? 4 : 3;
      
      if (repetitions >= minRepetitions) {
        return {
          detected: true,
          pattern,
          repetitions,
          confidence: Math.min(0.98, 0.75 + (repetitions * 0.05)),
        };
      }
    }

    return { detected: false, pattern: [], repetitions: 0, confidence: 0 };
  }

  private patternsMatch(a: ToolCallPattern, b: ToolCallPattern): boolean {
    return a.toolName === b.toolName && a.argumentsHash === b.argumentsHash;
  }

  private hashArguments(args: Record<string, unknown>): string {
    try {
      const sorted = JSON.stringify(args, Object.keys(args).sort());
      let hash = 0;
      for (let i = 0; i < sorted.length; i++) {
        const char = sorted.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return hash.toString(16);
    } catch {
      return 'unknown';
    }
  }

  private arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  private noLoopResult(): LoopDetectionResult {
    return {
      loopDetected: false,
      confidence: 0,
      description: '',
      suggestion: '',
      involvedTools: [],
      repetitionCount: 0,
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let loopDetectorInstance: LoopDetector | null = null;

export function getLoopDetector(): LoopDetector {
  if (!loopDetectorInstance) {
    loopDetectorInstance = new LoopDetector();
  }
  return loopDetectorInstance;
}

export function initLoopDetector(config?: Partial<LoopDetectionConfig>): LoopDetector {
  loopDetectorInstance = new LoopDetector(config);
  return loopDetectorInstance;
}
