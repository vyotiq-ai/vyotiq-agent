 import type {
  AgentSessionState,
  RendererEvent,
  AgentEvent,
  StartSessionPayload,
  AgentConfig,
  SessionSummary,
} from '../../shared/types';
import type { Logger } from '../logger';
import type { SessionManager } from './sessionManager';

/**
 * Handles session management operations - create, delete, regenerate, etc.
 * Decoupled from main orchestrator for better testability and clarity
 */
export class SessionManagementHandler {
  constructor(
    private sessionManager: SessionManager,
    private logger: Logger,
    private emitEvent: (event: RendererEvent | AgentEvent) => void,
  ) {}

  async startSession(payload: StartSessionPayload, defaultConfig: AgentConfig): Promise<AgentSessionState> {
    const session = this.sessionManager.createSession(payload, defaultConfig);

    this.emitEvent({ type: 'session-state', session: session.state });
    const allSessions = this.sessionManager.getAllSessions();
    this.emitEvent({ type: 'sessions-update', sessions: allSessions });
    return session.state;
  }

  deleteSession(sessionId: string): void {
    this.sessionManager.deleteSession(sessionId);
    this.logger.info('Session deleted', { sessionId });
    const remainingSessions = this.sessionManager.getAllSessions();
    this.emitEvent({ type: 'sessions-update', sessions: remainingSessions });
  }

  getSessions(): AgentSessionState[] {
    return this.sessionManager.getAllSessions();
  }

  /**
   * Get session summaries for lazy loading (faster than full sessions)
   */
  async getSessionSummaries(): Promise<SessionSummary[]> {
    return this.sessionManager.getSessionSummaries();
  }

  async regenerate(sessionId: string): Promise<void> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.state.status === 'running' || session.state.status === 'awaiting-confirmation') {
      throw new Error('Cannot regenerate while session is running');
    }

    // Find the last user message and remove all subsequent messages
    const messages = session.state.messages;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        // Remove all messages after this user message
        session.state.messages = messages.slice(0, i + 1);
        break;
      }
    }

    // Reset session state for new run
    session.state.status = 'idle';
    session.state.updatedAt = Date.now();
    session.agenticContext = undefined;
    session.pendingTool = undefined;
    session.toolQueue = undefined;

    this.sessionManager.updateSessionState(sessionId, {
      messages: session.state.messages,
      status: session.state.status,
      updatedAt: session.state.updatedAt,
    });

    this.logger.info('Session regenerated', { sessionId });
    this.emitEvent({ type: 'session-state', session: session.state });
  }

  generateSessionTitle(content: string): string {
    // Remove markdown, code blocks, and special characters
    const cleaned = content
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`[^`]+`/g, '')        // Remove inline code
      .replace(/[#*_~[\]()]/g, '')    // Remove markdown chars
      .replace(/\s+/g, ' ')           // Normalize whitespace
      .trim();
    
    // Take first 50 chars, try to break at word boundary
    if (cleaned.length > 50) {
      const lastSpace = cleaned.lastIndexOf(' ', 50);
      if (lastSpace > 30) {
        return cleaned.slice(0, lastSpace) + '...';
      }
      return cleaned.slice(0, 50) + '...';
    }
    
    return cleaned || 'New Session';
  }
}

