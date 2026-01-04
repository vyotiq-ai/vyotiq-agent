/**
 * Status Messages Utility
 * 
 * Provides context-aware status messages for the agent typewriter display.
 * Maps agent phases and tool operations to human-readable status messages.
 * 
 * These messages are shown in the status bar area (not the chat) to provide
 * real-time visibility into what the agent is doing without duplicating
 * the conversation content.
 */

import type { AgentStatusInfo } from '../state/agentReducer';

/** Status phase type from agent status */
type StatusPhase = AgentStatusInfo['status'] | 'idle' | 'running';

/**
 * Phase-specific status message prefixes that describe agent activity.
 * These provide context when the raw message might not be descriptive enough.
 */
const PHASE_PREFIXES: Record<StatusPhase, string> = {
  idle: '',
  running: 'processing',
  planning: 'planning',
  analyzing: 'analyzing',
  reasoning: 'thinking',
  executing: '',  // Tool execution has its own messages
  recovering: 'recovering',
  error: 'error',
  completed: 'completed',
  summarizing: 'summarizing',
  paused: 'paused',
};

/**
 * Extract tool name from execution status messages
 * Messages from the backend come in format: "Executing: toolName"
 */
function extractToolName(message: string): string | null {
  const match = message.match(/^Executing:\s*(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Get human-friendly tool activity description
 * Maps tool names to descriptive action phrases
 */
function getToolActivityDescription(toolName: string): string {
  // Normalize tool name for matching
  const normalizedTool = toolName.toLowerCase();
  
  // File operations
  if (normalizedTool.includes('read_file') || normalizedTool.includes('readfile')) {
    return 'reading file';
  }
  if (normalizedTool.includes('write_file') || normalizedTool.includes('writefile') || normalizedTool.includes('create_file')) {
    return 'writing file';
  }
  if (normalizedTool.includes('edit_file') || normalizedTool.includes('replace_string')) {
    return 'editing file';
  }
  if (normalizedTool.includes('delete_file')) {
    return 'deleting file';
  }
  if (normalizedTool.includes('list_dir') || normalizedTool.includes('list_files')) {
    return 'listing directory';
  }
  if (normalizedTool.includes('search') || normalizedTool.includes('grep') || normalizedTool.includes('find')) {
    return 'searching files';
  }
  if (normalizedTool.includes('glob')) {
    return 'finding files';
  }
  
  // Terminal operations
  if (normalizedTool.includes('terminal') || normalizedTool.includes('shell') || normalizedTool.includes('bash') || normalizedTool.includes('run_command')) {
    return 'running command';
  }
  if (normalizedTool.includes('spawn') || normalizedTool.includes('exec')) {
    return 'executing process';
  }
  
  // Git operations
  if (normalizedTool.includes('git_status')) {
    return 'checking git status';
  }
  if (normalizedTool.includes('git_commit')) {
    return 'committing changes';
  }
  if (normalizedTool.includes('git_log')) {
    return 'reading git history';
  }
  if (normalizedTool.includes('git')) {
    return 'git operation';
  }
  
  // Browser operations
  if (normalizedTool.includes('browse') || normalizedTool.includes('fetch_url') || normalizedTool.includes('web')) {
    return 'fetching web content';
  }
  if (normalizedTool.includes('screenshot')) {
    return 'taking screenshot';
  }
  if (normalizedTool.includes('navigate')) {
    return 'navigating browser';
  }
  if (normalizedTool.includes('click')) {
    return 'interacting with page';
  }
  
  // Analysis tools
  if (normalizedTool.includes('analyze') || normalizedTool.includes('lint')) {
    return 'analyzing code';
  }
  if (normalizedTool.includes('test')) {
    return 'running tests';
  }
  if (normalizedTool.includes('build') || normalizedTool.includes('compile')) {
    return 'building project';
  }
  
  // Image operations
  if (normalizedTool.includes('image') || normalizedTool.includes('generate_image')) {
    return 'generating image';
  }
  
  // Task operations
  if (normalizedTool.includes('task')) {
    return 'processing task';
  }
  
  // Default: use the tool name with "using" prefix
  // Clean up common prefixes/suffixes
  const cleanName = toolName
    .replace(/^(tool_|mcp_|internal_)/i, '')
    .replace(/_/g, ' ');
  
  return cleanName;
}

/**
 * Get phase-specific activity description when no specific tool is running
 */
function getPhaseDescription(phase: StatusPhase): string {
  switch (phase) {
    case 'planning':
      return 'analyzing task requirements';
    case 'analyzing':
      return 'examining context';
    case 'reasoning':
      return 'determining approach';
    case 'summarizing':
      return 'generating summary';
    case 'recovering':
      return 'handling error';
    case 'paused':
      return 'paused';
    case 'completed':
      return 'done';
    case 'error':
      return 'encountered error';
    default:
      return '';
  }
}

/**
 * Process context-related messages for better display
 */
function processContextMessage(message: string): string | null {
  // Context pruning messages
  if (message.includes('pruned') && message.includes('messages')) {
    const match = message.match(/pruned\s+(\d+)/i);
    const count = match ? match[1] : 'some';
    return `optimizing context (${count} msgs)`;
  }
  
  // Context overflow
  if (message.toLowerCase().includes('context overflow')) {
    return 'managing context window';
  }
  
  // Rate limiting
  if (message.toLowerCase().includes('rate limit')) {
    const match = message.match(/waiting\s+(\d+)s/i);
    const seconds = match ? match[1] : '';
    return seconds ? `rate limited (${seconds}s)` : 'rate limited';
  }
  
  // Switching providers
  if (message.toLowerCase().includes('switching to')) {
    const match = message.match(/switching to\s+(\w+)/i);
    const provider = match ? match[1] : 'fallback';
    return `switching to ${provider}`;
  }
  
  // Max iterations
  if (message.toLowerCase().includes('maximum iterations')) {
    return 'iteration limit reached';
  }
  
  return null;
}

/**
 * Get a context-aware display message for the status bar
 * 
 * This function takes the raw status phase and message from the backend
 * and transforms it into a concise, user-friendly status message.
 * 
 * The goal is to show what the agent is doing without duplicating
 * the conversation content (which shows in the chat area).
 * 
 * @param phase - Current agent status phase
 * @param rawMessage - Raw message from the backend
 * @param isPaused - Whether the agent is currently paused
 * @returns Human-readable status message for display
 */
export function getStatusDisplayMessage(
  phase: StatusPhase | undefined,
  rawMessage: string | undefined,
  isPaused?: boolean
): string {
  // Handle paused state first
  if (isPaused || phase === 'paused') {
    return 'paused';
  }
  
  // No phase means idle
  if (!phase || phase === 'idle') {
    return '';
  }
  
  // If we have a raw message, process it
  if (rawMessage && rawMessage.trim()) {
    // Check for tool execution message
    const toolName = extractToolName(rawMessage);
    if (toolName) {
      return getToolActivityDescription(toolName);
    }
    
    // Check for context-related messages
    const contextMessage = processContextMessage(rawMessage);
    if (contextMessage) {
      return contextMessage;
    }
    
    // For phase-specific activity that has a clear description
    if (phase === 'error') {
      // Keep error messages but truncate if too long
      const errorPreview = rawMessage.length > 60 
        ? rawMessage.slice(0, 57) + '...'
        : rawMessage;
      return errorPreview;
    }
    
    // For recovery messages, show the actual message
    if (phase === 'recovering') {
      const recoveryPreview = rawMessage.length > 50
        ? rawMessage.slice(0, 47) + '...'
        : rawMessage;
      return recoveryPreview;
    }
    
    // For completed, just show completed
    if (phase === 'completed') {
      return 'completed';
    }
  }
  
  // Fall back to phase description if no specific message
  const phaseDescription = getPhaseDescription(phase);
  if (phaseDescription) {
    return phaseDescription;
  }
  
  // Last resort: use phase prefix or generic "processing"
  return PHASE_PREFIXES[phase] || 'processing';
}

/**
 * Determine if a status message is significant enough to show
 * 
 * Some messages are transient or don't add value to show in the status bar.
 * This helps filter out noise.
 */
export function isSignificantStatus(
  phase: StatusPhase | undefined,
  message: string | undefined
): boolean {
  // Always show these phases
  if (phase === 'error' || phase === 'recovering' || phase === 'paused') {
    return true;
  }
  
  // Don't show empty messages for non-executing phases
  if (!message?.trim()) {
    return phase === 'executing' || phase === 'planning' || phase === 'analyzing';
  }
  
  // Don't show very short generic messages
  if (message.length < 3) {
    return false;
  }
  
  return true;
}
