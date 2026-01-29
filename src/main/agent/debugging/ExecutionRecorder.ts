/**
 * Execution Recorder
 *
 * Records agent execution for replay and debugging,
 * capturing inputs, outputs, and decision points.
 */

import { EventEmitter } from 'node:events';
import { randomUUID, createHash } from 'node:crypto';
import type { Logger } from '../../logger';

// =============================================================================
// Types
// =============================================================================

export interface Recording {
  id: string;
  name: string;
  sessionId: string;
  startedAt: number;
  completedAt?: number;
  status: 'recording' | 'completed' | 'failed';
  entries: RecordingEntry[];
  metadata: RecordingMetadata;
}

export interface RecordingEntry {
  id: string;
  timestamp: number;
  agentId: string;
  entryType: RecordingEntryType;
  data: Record<string, unknown>;
  inputHash?: string;
  outputHash?: string;
}

export type RecordingEntryType =
  | 'user-input'
  | 'llm-request'
  | 'llm-response'
  | 'tool-call'
  | 'tool-result'
  | 'agent-complete'
  | 'decision-point'
  | 'state-snapshot';

export interface RecordingMetadata {
  totalEntries: number;
  agentCount: number;
  llmCalls: number;
  toolCalls: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ExecutionRecorderConfig {
  maxRecordings: number;
  maxEntriesPerRecording: number;
  autoSave: boolean;
  captureFullResponses: boolean;
  hashSensitiveData: boolean;
}

export const DEFAULT_EXECUTION_RECORDER_CONFIG: ExecutionRecorderConfig = {
  maxRecordings: 20,
  maxEntriesPerRecording: 50000,
  autoSave: false,
  captureFullResponses: true,
  hashSensitiveData: true,
};

// =============================================================================
// ExecutionRecorder
// =============================================================================

export class ExecutionRecorder extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: ExecutionRecorderConfig;
  private readonly recordings = new Map<string, Recording>();
  private activeRecordingId: string | null = null;

  constructor(logger: Logger, config: Partial<ExecutionRecorderConfig> = {}) {
    super();
    this.logger = logger;
    this.config = { ...DEFAULT_EXECUTION_RECORDER_CONFIG, ...config };
  }

  /**
   * Start a new recording
   */
  startRecording(sessionId: string, name?: string): Recording {
    // Check recording limit
    if (this.recordings.size >= this.config.maxRecordings) {
      this.pruneOldRecordings();
    }

    const recording: Recording = {
      id: randomUUID(),
      name: name || `Recording ${new Date().toISOString()}`,
      sessionId,
      startedAt: Date.now(),
      status: 'recording',
      entries: [],
      metadata: this.createEmptyMetadata(),
    };

    this.recordings.set(recording.id, recording);
    this.activeRecordingId = recording.id;

    this.logger.info('Recording started', { recordingId: recording.id, sessionId });
    this.emit('recording-started', { recordingId: recording.id });

    return recording;
  }

  /**
   * Stop the current recording
   */
  stopRecording(): Recording | null {
    if (!this.activeRecordingId) return null;

    const recording = this.recordings.get(this.activeRecordingId);
    if (!recording) return null;

    recording.completedAt = Date.now();
    recording.status = 'completed';
    this.finalizeMetadata(recording);

    this.activeRecordingId = null;

    this.logger.info('Recording stopped', {
      recordingId: recording.id,
      entries: recording.entries.length,
    });

    this.emit('recording-stopped', { recordingId: recording.id });

    return recording;
  }

  /**
   * Record a user input
   */
  recordUserInput(agentId: string, input: string): void {
    this.addEntry(agentId, 'user-input', {
      input: this.config.hashSensitiveData ? this.hashContent(input) : input,
      inputLength: input.length,
    });
  }

  /**
   * Record an LLM request
   */
  recordLLMRequest(
    agentId: string,
    provider: string,
    model: string,
    messages: unknown[],
    tools: unknown[]
  ): void {
    this.addEntry(agentId, 'llm-request', {
      provider,
      model,
      messageCount: messages.length,
      toolCount: tools.length,
      messages: this.config.captureFullResponses ? messages : undefined,
    });

    const recording = this.getActiveRecording();
    if (recording) {
      recording.metadata.llmCalls++;
    }
  }

  /**
   * Record an LLM response
   */
  recordLLMResponse(
    agentId: string,
    content: string,
    inputTokens: number,
    outputTokens: number,
    toolCalls?: unknown[]
  ): void {
    this.addEntry(agentId, 'llm-response', {
      contentLength: content.length,
      content: this.config.captureFullResponses ? content : undefined,
      inputTokens,
      outputTokens,
      toolCallCount: toolCalls?.length || 0,
    });

    const recording = this.getActiveRecording();
    if (recording) {
      recording.metadata.inputTokens += inputTokens;
      recording.metadata.outputTokens += outputTokens;
    }
  }

  /**
   * Record a tool call
   */
  recordToolCall(agentId: string, toolName: string, args: Record<string, unknown>): void {
    this.addEntry(agentId, 'tool-call', {
      toolName,
      args: this.config.captureFullResponses ? args : { keys: Object.keys(args) },
    });

    const recording = this.getActiveRecording();
    if (recording) {
      recording.metadata.toolCalls++;
    }
  }

  /**
   * Record a tool result
   */
  recordToolResult(agentId: string, toolName: string, success: boolean, result: unknown): void {
    this.addEntry(agentId, 'tool-result', {
      toolName,
      success,
      resultType: typeof result,
      result: this.config.captureFullResponses ? result : undefined,
    });
  }

  /**
   * Record agent completion
   */
  recordAgentCompletion(agentId: string, parentAgentId: string | undefined, result: Record<string, unknown>): void {
    this.addEntry(agentId, 'agent-complete', {
      parentAgentId,
      result,
    });

    const recording = this.getActiveRecording();
    if (recording) {
      recording.metadata.agentCount++;
    }
  }

  /**
   * Record agent completion
   */
  recordAgentComplete(agentId: string, success: boolean, output: string): void {
    this.addEntry(agentId, 'agent-complete', {
      success,
      outputLength: output.length,
      output: this.config.captureFullResponses ? output : undefined,
    });
  }

  /**
   * Record a decision point
   */
  recordDecisionPoint(
    agentId: string,
    decision: string,
    options: string[],
    chosen: string,
    reasoning?: string
  ): void {
    this.addEntry(agentId, 'decision-point', {
      decision,
      options,
      chosen,
      reasoning,
    });
  }

  /**
   * Record a state snapshot
   */
  recordStateSnapshot(agentId: string, state: Record<string, unknown>): void {
    this.addEntry(agentId, 'state-snapshot', {
      state: this.config.captureFullResponses ? state : { keys: Object.keys(state) },
    });
  }

  /**
   * Get active recording
   */
  getActiveRecording(): Recording | null {
    if (!this.activeRecordingId) return null;
    return this.recordings.get(this.activeRecordingId) || null;
  }

  /**
   * Get recording by ID
   */
  getRecording(recordingId: string): Recording | undefined {
    return this.recordings.get(recordingId);
  }

  /**
   * Save recording to storage
   */
  async saveRecording(recordingId: string): Promise<string> {
    const recording = this.recordings.get(recordingId);
    if (!recording) {
      throw new Error(`Recording ${recordingId} not found`);
    }

    const data = JSON.stringify(recording, null, 2);

    // In a real implementation, this would save to disk or database
    this.emit('recording-saved', { recordingId, size: data.length });

    return data;
  }

  /**
   * Load recording from data
   */
  loadRecording(data: string): Recording {
    const recording = JSON.parse(data) as Recording;
    this.recordings.set(recording.id, recording);
    return recording;
  }

  /**
   * Get recording info (without full entries)
   */
  getRecordingInfo(recordingId: string): Omit<Recording, 'entries'> | undefined {
    const recording = this.recordings.get(recordingId);
    if (!recording) return undefined;

    const { entries: _entries, ...info } = recording;
    return info;
  }

  /**
   * List all recordings
   */
  listRecordings(): Array<Omit<Recording, 'entries'>> {
    return Array.from(this.recordings.values()).map(({ entries: _entries, ...info }) => info);
  }

  /**
   * Delete a recording
   */
  deleteRecording(recordingId: string): boolean {
    if (this.activeRecordingId === recordingId) {
      this.activeRecordingId = null;
    }
    return this.recordings.delete(recordingId);
  }

  /**
   * Clear all recordings
   */
  clearAllRecordings(): void {
    this.recordings.clear();
    this.activeRecordingId = null;
  }

  /**
   * Check if recording is active
   */
  isRecording(): boolean {
    return this.activeRecordingId !== null;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private addEntry(
    agentId: string,
    entryType: RecordingEntryType,
    data: Record<string, unknown>
  ): void {
    const recording = this.getActiveRecording();
    if (!recording) return;

    if (recording.entries.length >= this.config.maxEntriesPerRecording) {
      this.logger.warn('Recording entry limit reached', { recordingId: recording.id });
      return;
    }

    const entry: RecordingEntry = {
      id: randomUUID(),
      timestamp: Date.now(),
      agentId,
      entryType,
      data,
    };

    recording.entries.push(entry);
    recording.metadata.totalEntries++;

    this.emit('entry-recorded', { recordingId: recording.id, entryType, agentId });
  }

  private createEmptyMetadata(): RecordingMetadata {
    return {
      totalEntries: 0,
      agentCount: 0,
      llmCalls: 0,
      toolCalls: 0,
      durationMs: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  private finalizeMetadata(recording: Recording): void {
    recording.metadata.durationMs = (recording.completedAt || Date.now()) - recording.startedAt;
  }

  private hashContent(content: string): string {
    // Simple hash for privacy using already imported crypto
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  private pruneOldRecordings(): void {
    const sortedRecordings = Array.from(this.recordings.entries())
      .filter(([id]) => id !== this.activeRecordingId)
      .sort((a, b) => a[1].startedAt - b[1].startedAt);

    // Remove oldest 20%
    const toRemove = Math.ceil(sortedRecordings.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      this.recordings.delete(sortedRecordings[i][0]);
    }
  }
}
