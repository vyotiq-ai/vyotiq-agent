import type { ChatMessage } from '../../../../../shared/types';

/**
 * Dynamic tool info for tool management
 */
export interface DynamicToolMetadata {
  createdBy?: string;
  usageCount?: number;
  successRate?: number;
  status?: 'active' | 'disabled' | 'deprecated';
}

/**
 * Internal representation of a tool call for inline rendering.
 */
export interface ToolCall {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
  _argsJson?: string; // Raw JSON string for partial streaming
  result?: ChatMessage;
  fullOutput?: string;
  resultMetadata?: Record<string, unknown>;
  status: 'running' | 'completed' | 'error' | 'pending';
  startTime?: number;
  // Phase 7: Dynamic tool support
  isDynamic?: boolean;
  dynamicToolInfo?: DynamicToolMetadata;
}
