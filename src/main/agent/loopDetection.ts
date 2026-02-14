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
  /** Track consecutive edit failures with identical strings */
  consecutiveIdenticalEditFailures: number;
  circuitBreakerTriggered: boolean;
  warningIssued: boolean;
  /** Track file content hashes to detect legitimate retries after changes */
  fileContentHashes: Map<string, string>;
  /** Track when files were last modified by this run */
  fileModificationTimes: Map<string, number>;
}

// =============================================================================
// Tool Categories - Different tools have different loop thresholds
// =============================================================================

/** Exploration tools - high tolerance, reading many files is normal.
 *  All names are stored in lowercase for consistent matching. */
const EXPLORATION_TOOLS = new Set([
  'read', 'ls', 'grep', 'search', 'find', 'glob', 'list',
  'readfile', 'listdirectory', 'grepsearch', 'filesearch',
  'cat', 'head', 'tail', 'tree',
  // Browser tools - fetching different URLs is exploration
  'browser_fetch', 'browserfetch', 'fetch', 'web_fetch',
  // Research tools
  'research', 'web_search', 'websearch',
]);

/** Action tools - lower tolerance, repeated actions are suspicious.
 *  All names are stored in lowercase for consistent matching. */
const ACTION_TOOLS = new Set([
  'write', 'delete', 'run', 'exec', 'create', 'modify',
  'writefile', 'deletefile', 'runcommand', 'executecommand',
  'mkdir', 'rm', 'mv', 'cp',
]);

/** Edit tool - special handling for repeated failures.
 *  All names are stored in lowercase for consistent matching. */
const EDIT_TOOLS = new Set(['edit', 'editfile', 'str_replace', 'strreplace']);

// =============================================================================
// Default Configuration
// =============================================================================

export const DEFAULT_LOOP_DETECTION_CONFIG: LoopDetectionConfig = {
  enabled: true,
  maxConsecutiveIdenticalCalls: 8,  // Increased - more tolerance for exploration
  maxIdenticalCallsInWindow: 15,    // Increased - allow more repeated calls in window
  windowMs: 300000, // 5 minutes - longer window for complex tasks
  minIterationsForDetection: 20,    // Increased - wait longer before detecting loops
  patternSimilarityThreshold: 0.99, // Increased - require very high confidence before flagging
};

// =============================================================================
// Loop Detector Class
// =============================================================================

export class LoopDetector {
  private config: LoopDetectionConfig;
  private states = new Map<string, LoopDetectionState>();
  /** Maximum patterns stored per run to prevent unbounded memory growth */
  private static readonly MAX_PATTERNS_PER_RUN = 200;
  /** Maximum age for orphaned run states (30 minutes) */
  private static readonly ORPHAN_STATE_MAX_AGE_MS = 30 * 60 * 1000;
  /** Interval timer for periodic state cleanup */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  // --- Detection threshold constants (previously hardcoded magic numbers) ---
  /** Consecutive identical edit-string failures before flagging immediately */
  private static readonly MAX_IDENTICAL_EDIT_FAILURES = 2;
  /** Consecutive tool failures before flagging as repeated-failures loop */
  private static readonly MAX_CONSECUTIVE_FAILURES = 7;
  /** Minimum iterations before no-progress detection activates */
  private static readonly NO_PROGRESS_MIN_ITERATIONS = 30;
  /** Minimum unique resources in recent window to NOT flag as no-progress */
  private static readonly NO_PROGRESS_MIN_UNIQUE_RESOURCES = 1;
  /** Minimum repetitions of a single signature to flag no-progress */
  private static readonly NO_PROGRESS_MAX_REPETITION = 15;
  /** Extra leniency added to consecutive threshold for exploration tools */
  private static readonly EXPLORATION_CONSECUTIVE_LENIENCY = 4;
  /** Reduction applied to consecutive threshold for action tools */
  private static readonly ACTION_CONSECUTIVE_STRICTNESS = 1;
  /** Extra leniency added to frequency threshold for exploration tools */
  private static readonly EXPLORATION_FREQUENCY_LENIENCY = 6;
  /** Minimum unique resources before exploration tools are allowed to reset consecutive counter */
  private static readonly EXPLORATION_RESET_MIN_RESOURCES = 5;
  /** Minimum repetitions in repeating-sequence check (Check 5) */
  private static readonly REPEATING_SEQUENCE_MIN_REPS = 6;
  /** Confidence required for exploration tools in repeating-sequence check */
  private static readonly EXPLORATION_SEQUENCE_CONFIDENCE = 0.995;
  /** Cap for unique resources tracked per run */
  private static readonly MAX_UNIQUE_RESOURCES = 2000;

  constructor(config: Partial<LoopDetectionConfig> = {}) {
    this.config = { ...DEFAULT_LOOP_DETECTION_CONFIG, ...config };
    // Periodic cleanup of orphaned run states every 5 minutes
    // .unref() prevents this timer from keeping the Node.js process alive during shutdown
    this.cleanupTimer = setInterval(() => this.cleanupOrphanedStates(), 5 * 60 * 1000);
    if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Clean up states for runs that were not properly cleaned up (orphans).
   * Removes states older than MAX_ORPHAN_STATE_AGE_MS based on the latest pattern timestamp.
   */
  private cleanupOrphanedStates(): void {
    const now = Date.now();
    for (const [runId, state] of this.states) {
      const lastActivity = state.patterns.length > 0
        ? state.patterns[state.patterns.length - 1].timestamp
        : 0;
      if (now - lastActivity > LoopDetector.ORPHAN_STATE_MAX_AGE_MS) {
        this.states.delete(runId);
        logger.debug('Cleaned up orphaned loop detection state', { runId });
      }
    }
  }

  /**
   * Dispose the loop detector and clean up timers
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.states.clear();
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
      consecutiveIdenticalEditFailures: 0,
      circuitBreakerTriggered: false,
      warningIssued: false,
      fileContentHashes: new Map(),
      fileModificationTimes: new Map(),
    });
  }

  /**
   * Record file content hash to track changes
   * Call this after reading a file to detect legitimate retries
   */
  recordFileContentHash(runId: string, filePath: string, contentHash: string): void {
    const state = this.states.get(runId);
    if (!state) return;
    
    const previousHash = state.fileContentHashes.get(filePath);
    state.fileContentHashes.set(filePath, contentHash);
    
    // If the file content changed, reset the consecutive calls counter
    // as this could be a legitimate retry after a change
    if (previousHash && previousHash !== contentHash) {
      logger.debug('File content changed, resetting consecutive call counter', {
        runId,
        filePath,
        previousHash: previousHash.slice(0, 8),
        newHash: contentHash.slice(0, 8),
      });
      state.consecutiveIdenticalCalls = Math.max(0, state.consecutiveIdenticalCalls - 1);
    }
  }

  /**
   * Record file modification to track write operations
   */
  recordFileModification(runId: string, filePath: string): void {
    const state = this.states.get(runId);
    if (!state) return;
    
    state.fileModificationTimes.set(filePath, Date.now());
    // Clear the content hash as the file has been modified
    state.fileContentHashes.delete(filePath);
  }

  /**
   * Check if a file was recently modified by this run
   * Used to determine if a retry is legitimate (file changed since last read)
   */
  wasFileRecentlyModified(runId: string, filePath: string, thresholdMs: number = 5000): boolean {
    const state = this.states.get(runId);
    if (!state) return false;
    
    const lastModified = state.fileModificationTimes.get(filePath);
    if (!lastModified) return false;
    
    return Date.now() - lastModified < thresholdMs;
  }

  /**
   * Record a tool call and check for loops
   */
  recordToolCall(
    runId: string,
    toolCall: ToolCallPayload,
    iteration: number,
    success: boolean = true,
    failureReason?: string
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
    
    // Check if this is a retry on a recently modified file
    // If so, don't count it as a consecutive identical call
    const isRetryAfterModification = keyArgument && 
      this.wasFileRecentlyModified(runId, keyArgument) &&
      EXPLORATION_TOOLS.has(toolCall.name.toLowerCase());
    
    // Create pattern from tool call
    const pattern: ToolCallPattern = {
      toolName: toolCall.name,
      argumentsHash: this.hashArguments(toolCall.arguments),
      keyArgument,
      timestamp: Date.now(),
      iteration,
      success,
    };

    // Track unique resources accessed (cap to prevent unbounded memory growth)
    if (keyArgument && state.uniqueResourcesAccessed.size < LoopDetector.MAX_UNIQUE_RESOURCES) {
      state.uniqueResourcesAccessed.add(keyArgument);
    }

    // Track consecutive failures
    if (!success) {
      state.consecutiveFailures++;
      
      // Track specific "identical strings" edit failures
      const isEditTool = EDIT_TOOLS.has(toolCall.name.toLowerCase());
      if (isEditTool && failureReason?.includes('identical')) {
        state.consecutiveIdenticalEditFailures++;
        
        // If we've had repeated consecutive identical string failures, flag it immediately
        if (state.consecutiveIdenticalEditFailures >= LoopDetector.MAX_IDENTICAL_EDIT_FAILURES) {
          logger.warn('Repeated identical edit string failures detected', {
            runId,
            sessionId: state.sessionId,
            count: state.consecutiveIdenticalEditFailures,
            toolName: toolCall.name,
          });
          return {
            loopDetected: true,
            loopType: 'repeated-failures',
            confidence: 0.95,
            description: `Edit tool called ${state.consecutiveIdenticalEditFailures} times with identical old_string and new_string`,
            suggestion: 'The agent keeps trying to edit with identical strings. The change may already be applied - read the file to verify, or the agent may be confused about what changes to make.',
            involvedTools: [toolCall.name],
            repetitionCount: state.consecutiveIdenticalEditFailures,
          };
        }
      } else {
        // Reset if it's a different type of failure
        state.consecutiveIdenticalEditFailures = 0;
      }
    } else {
      state.consecutiveFailures = 0;
      state.consecutiveIdenticalEditFailures = 0;
    }

    // Update state - cap patterns array to prevent unbounded memory growth
    state.patterns.push(pattern);
    if (state.patterns.length > LoopDetector.MAX_PATTERNS_PER_RUN) {
      // Remove oldest patterns beyond the analysis window
      state.patterns.splice(0, state.patterns.length - LoopDetector.MAX_PATTERNS_PER_RUN);
    }

    // Check for identical consecutive calls
    // But don't count retries after file modifications as consecutive identical calls
    if (state.lastToolCall) {
      if (this.patternsMatch(pattern, state.lastToolCall)) {
        // If this is a retry after a file modification, don't count it
        if (isRetryAfterModification) {
          logger.debug('Skipping consecutive call count for retry after file modification', {
            runId,
            toolName: toolCall.name,
            keyArgument,
          });
          // Don't increment, just update the last tool call
        } else {
          state.consecutiveIdenticalCalls++;
        }
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
    // Determine tool category for threshold adjustment (all Sets use lowercase)
    const normalizedTool = currentTool.toLowerCase();
    const isExplorationTool = EXPLORATION_TOOLS.has(normalizedTool);
    const isActionTool = ACTION_TOOLS.has(normalizedTool);

    // Adjust thresholds based on tool type - be much more lenient for exploration
    const consecutiveThreshold = isExplorationTool 
      ? this.config.maxConsecutiveIdenticalCalls + LoopDetector.EXPLORATION_CONSECUTIVE_LENIENCY
      : isActionTool 
        ? this.config.maxConsecutiveIdenticalCalls - LoopDetector.ACTION_CONSECUTIVE_STRICTNESS
        : this.config.maxConsecutiveIdenticalCalls;

    // Check 1: Consecutive identical calls (same tool + same arguments)
    // For exploration tools, also check if we're accessing different resources
    if (state.consecutiveIdenticalCalls >= consecutiveThreshold) {
      // For exploration tools, only flag if we're truly stuck (same resource repeatedly)
      if (isExplorationTool && state.uniqueResourcesAccessed.size > LoopDetector.EXPLORATION_RESET_MIN_RESOURCES) {
        // We're accessing many different resources, this is legitimate exploration
        // Reset the counter to allow continued exploration
        state.consecutiveIdenticalCalls = 1;
      } else {
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
    }

    // Check 2: Repeated failures - agent keeps trying something that fails
    // Be more lenient - require more failures before flagging
    if (state.consecutiveFailures >= LoopDetector.MAX_CONSECUTIVE_FAILURES) {
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
    // Much more lenient: require more iterations and check for actual stagnation
    if (iteration >= LoopDetector.NO_PROGRESS_MIN_ITERATIONS && state.patterns.length >= LoopDetector.NO_PROGRESS_MIN_ITERATIONS) {
      const recentPatterns = state.patterns.slice(-LoopDetector.NO_PROGRESS_MIN_ITERATIONS);
      const recentUniqueResources = new Set(
        recentPatterns.map(p => p.keyArgument).filter(Boolean)
      );
      
      // If we've done 30+ iterations but only accessed 1 or fewer unique resources
      // AND we're not using action tools (which might legitimately repeat)
      // AND we have a high repetition of the same exact calls
      if (recentUniqueResources.size <= LoopDetector.NO_PROGRESS_MIN_UNIQUE_RESOURCES && !isActionTool) {
        const recentTools = [...new Set(recentPatterns.map(p => p.toolName))];
        
        // Only flag if it's exploration tools that should be accessing different resources
        // AND we have significant repetition (same signature appearing 15+ times)
        const signatureCounts = new Map<string, number>();
        for (const p of recentPatterns) {
          const sig = `${p.toolName}:${p.argumentsHash}`;
          signatureCounts.set(sig, (signatureCounts.get(sig) || 0) + 1);
        }
        const maxRepetition = Math.max(...signatureCounts.values());
        
        if (recentTools.some(t => EXPLORATION_TOOLS.has(t.toLowerCase())) && maxRepetition >= LoopDetector.NO_PROGRESS_MAX_REPETITION) {
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

    // Adjust threshold for exploration tools - be much more lenient
    const frequencyThreshold = isExplorationTool
      ? this.config.maxIdenticalCallsInWindow + LoopDetector.EXPLORATION_FREQUENCY_LENIENCY
      : this.config.maxIdenticalCallsInWindow;

    for (const [signature, count] of signatureFrequency) {
      if (count >= frequencyThreshold) {
        const toolName = signature.split(':')[0];
        
        // For exploration tools, check if we're making progress (accessing different resources)
        if (isExplorationTool && state.uniqueResourcesAccessed.size > count / 2) {
          // We're accessing many different resources, this is legitimate
          continue;
        }
        
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
    if (iteration >= this.config.minIterationsForDetection && state.patterns.length >= 12) {
      const recentSignatures = state.patterns.slice(-18).map(p => `${p.toolName}:${p.argumentsHash}`);
      const patternResult = this.detectRepeatingSequence(recentSignatures);
      
      // Require higher confidence for exploration tools
      const requiredConfidence = isExplorationTool ? LoopDetector.EXPLORATION_SEQUENCE_CONFIDENCE : this.config.patternSimilarityThreshold;
      
      // Require more repetitions before flagging
      if (patternResult.detected && 
          patternResult.confidence >= requiredConfidence &&
          patternResult.repetitions >= LoopDetector.REPEATING_SEQUENCE_MIN_REPS) {
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
    const pathKeys = ['path', 'file', 'filePath', 'file_path', 'filename', 'fileName', 'directory', 'dir', 'target', 'source', 'src', 'dest', 'destination', 'url'];
    
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
        hash |= 0;
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
  // Dispose the previous instance to prevent interval timer leaks
  loopDetectorInstance?.dispose();
  loopDetectorInstance = new LoopDetector(config);
  return loopDetectorInstance;
}
