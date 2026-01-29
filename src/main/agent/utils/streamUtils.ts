/**
 * Stream Utilities
 * 
 * Functions for handling streaming responses and detecting issues.
 */

const MAX_RECENT_CHUNKS = 20;
const REPETITION_THRESHOLD = 3;

/**
 * Stream state for tracking repetition detection
 */
export interface StreamState {
  recentChunks: string[];
  repetitionDetected: boolean;
}

/**
 * Create a new stream state
 */
export function createStreamState(): StreamState {
  return {
    recentChunks: [],
    repetitionDetected: false,
  };
}

/**
 * Track a chunk for repetition detection
 */
export function trackChunk(state: StreamState, chunk: string): void {
  if (chunk.length > 5) {
    state.recentChunks.push(chunk);
    if (state.recentChunks.length > MAX_RECENT_CHUNKS) {
      state.recentChunks.shift();
    }
  }
}

/**
 * Detect if the LLM is generating repetitive content
 * Returns true if the same phrase appears multiple times consecutively
 */
export function detectRepetition(content: string, state: StreamState): boolean {
  if (content.length < 100) return false;
  
  // Look for repeated phrases in the last ~500 chars
  const checkWindow = content.slice(-500);
  
  // Common repetition patterns: same sentence repeated
  const sentences = checkWindow.split(/[.!?:]\s+/).filter(s => s.length > 15);
  if (sentences.length >= REPETITION_THRESHOLD) {
    const lastSentences = sentences.slice(-REPETITION_THRESHOLD);
    const firstSentence = lastSentences[0].trim().toLowerCase();
    const allSame = lastSentences.every(s => 
      s.trim().toLowerCase() === firstSentence ||
      s.trim().toLowerCase().startsWith(firstSentence.slice(0, 30))
    );
    if (allSame && firstSentence.length > 20) {
      return true;
    }
  }
  
  // Check for repeated chunks in recent history
  if (state.recentChunks.length >= REPETITION_THRESHOLD) {
    const lastChunks = state.recentChunks.slice(-REPETITION_THRESHOLD);
    const normalized = lastChunks.map(c => c.trim().toLowerCase());
    const allSameChunks = normalized.every(c => c === normalized[0] && c.length > 10);
    if (allSameChunks) {
      return true;
    }
  }
  
  return false;
}
