/**
 * Mock Event Emitter
 *
 * Captures emitted events for testing and provides assertion helpers.
 * Supports event sequence verification and filtering.
 */
import { vi } from 'vitest';
import type { RendererEvent, AgentEvent } from '../../shared/types';

// =============================================================================
// Types
// =============================================================================

export interface CapturedEvent<T = unknown> {
  type: string;
  data: T;
  timestamp: number;
}

export interface EventFilter {
  type?: string | string[];
  sessionId?: string;
  runId?: string;
  after?: number;
  before?: number;
}

// =============================================================================
// MockEventEmitter Class
// =============================================================================

export class MockEventEmitter {
  private events: CapturedEvent[] = [];
  private listeners = new Map<string, Set<(event: unknown) => void>>();
  private allListeners = new Set<(event: unknown) => void>();

  /**
   * Emit an event (captures it for testing)
   */
  emit(event: RendererEvent | AgentEvent | Record<string, unknown>): void {
    const captured: CapturedEvent = {
      type: (event as { type?: string }).type ?? 'unknown',
      data: event,
      timestamp: Date.now(),
    };
    
    this.events.push(captured);

    // Notify type-specific listeners
    const typeListeners = this.listeners.get(captured.type);
    if (typeListeners) {
      for (const listener of typeListeners) {
        listener(event);
      }
    }

    // Notify all-event listeners
    for (const listener of this.allListeners) {
      listener(event);
    }
  }

  /**
   * Subscribe to events of a specific type
   */
  on(type: string, listener: (event: unknown) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
    
    return () => {
      this.listeners.get(type)?.delete(listener);
    };
  }

  /**
   * Subscribe to all events
   */
  onAny(listener: (event: unknown) => void): () => void {
    this.allListeners.add(listener);
    return () => {
      this.allListeners.delete(listener);
    };
  }

  /**
   * Get all captured events
   */
  getEvents(): CapturedEvent[] {
    return [...this.events];
  }

  /**
   * Get events by type
   */
  getEventsByType<T = unknown>(type: string): CapturedEvent<T>[] {
    return this.events.filter(e => e.type === type) as CapturedEvent<T>[];
  }

  /**
   * Get events matching a filter
   */
  getEventsMatching(filter: EventFilter): CapturedEvent[] {
    return this.events.filter(e => {
      if (filter.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
        if (!types.includes(e.type)) return false;
      }
      if (filter.sessionId) {
        const data = e.data as { sessionId?: string };
        if (data.sessionId !== filter.sessionId) return false;
      }
      if (filter.runId) {
        const data = e.data as { runId?: string };
        if (data.runId !== filter.runId) return false;
      }
      if (filter.after && e.timestamp < filter.after) return false;
      if (filter.before && e.timestamp > filter.before) return false;
      return true;
    });
  }

  /**
   * Get the last event
   */
  getLastEvent(): CapturedEvent | undefined {
    return this.events[this.events.length - 1];
  }

  /**
   * Get the last event of a specific type
   */
  getLastEventOfType<T = unknown>(type: string): CapturedEvent<T> | undefined {
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].type === type) {
        return this.events[i] as CapturedEvent<T>;
      }
    }
    return undefined;
  }

  /**
   * Get event count
   */
  getEventCount(type?: string): number {
    if (type) {
      return this.events.filter(e => e.type === type).length;
    }
    return this.events.length;
  }

  /**
   * Check if an event type was emitted
   */
  wasEmitted(type: string): boolean {
    return this.events.some(e => e.type === type);
  }

  /**
   * Get event types in order
   */
  getEventSequence(): string[] {
    return this.events.map(e => e.type);
  }

  /**
   * Clear all captured events
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Reset emitter (clear events and listeners)
   */
  reset(): void {
    this.events = [];
    this.listeners.clear();
    this.allListeners.clear();
  }

  /**
   * Wait for an event of a specific type
   */
  waitForEvent(type: string, timeoutMs: number = 5000): Promise<CapturedEvent> {
    return new Promise((resolve, reject) => {
      // Check if already emitted
      const existing = this.getLastEventOfType(type);
      if (existing) {
        resolve(existing);
        return;
      }

      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timeout waiting for event "${type}"`));
      }, timeoutMs);

      const unsubscribe = this.on(type, (event) => {
        clearTimeout(timeout);
        unsubscribe();
        resolve({
          type,
          data: event,
          timestamp: Date.now(),
        });
      });
    });
  }

  /**
   * Wait for multiple events
   */
  async waitForEvents(types: string[], timeoutMs: number = 5000): Promise<CapturedEvent[]> {
    const results: CapturedEvent[] = [];
    for (const type of types) {
      const event = await this.waitForEvent(type, timeoutMs);
      results.push(event);
    }
    return results;
  }

  // ===========================================================================
  // Assertion Helpers
  // ===========================================================================

  /**
   * Assert that an event was emitted
   */
  assertEmitted(type: string, message?: string): void {
    if (!this.wasEmitted(type)) {
      throw new Error(message ?? `Expected event "${type}" to be emitted, but it was not`);
    }
  }

  /**
   * Assert that an event was NOT emitted
   */
  assertNotEmitted(type: string, message?: string): void {
    if (this.wasEmitted(type)) {
      throw new Error(message ?? `Expected event "${type}" NOT to be emitted, but it was`);
    }
  }

  /**
   * Assert event count
   */
  assertEventCount(type: string, expectedCount: number): void {
    const actualCount = this.getEventCount(type);
    if (actualCount !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} "${type}" events, but got ${actualCount}`
      );
    }
  }

  /**
   * Assert event sequence
   */
  assertEventSequence(expectedSequence: string[]): void {
    const actualSequence = this.getEventSequence();
    
    // Check if expected sequence is a subsequence of actual
    let expectedIndex = 0;
    for (const actual of actualSequence) {
      if (actual === expectedSequence[expectedIndex]) {
        expectedIndex++;
        if (expectedIndex === expectedSequence.length) {
          return; // Found complete sequence
        }
      }
    }
    
    throw new Error(
      `Expected event sequence ${expectedSequence.join(' -> ')} not found. ` +
      `Actual sequence: ${actualSequence.join(' -> ')}`
    );
  }

  /**
   * Assert exact event sequence
   */
  assertExactEventSequence(expectedSequence: string[]): void {
    const actualSequence = this.getEventSequence();
    
    if (actualSequence.length !== expectedSequence.length) {
      throw new Error(
        `Expected ${expectedSequence.length} events, but got ${actualSequence.length}. ` +
        `Expected: ${expectedSequence.join(' -> ')}, Actual: ${actualSequence.join(' -> ')}`
      );
    }
    
    for (let i = 0; i < expectedSequence.length; i++) {
      if (actualSequence[i] !== expectedSequence[i]) {
        throw new Error(
          `Expected event "${expectedSequence[i]}" at position ${i}, but got "${actualSequence[i]}"`
        );
      }
    }
  }

  /**
   * Assert event data matches
   */
  assertEventData<T>(type: string, matcher: (data: T) => boolean, message?: string): void {
    const events = this.getEventsByType<T>(type);
    if (events.length === 0) {
      throw new Error(`No events of type "${type}" found`);
    }
    
    const matching = events.find(e => matcher(e.data));
    if (!matching) {
      throw new Error(
        message ?? `No "${type}" event matched the expected data`
      );
    }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a mock event emitter
 */
export function createMockEventEmitter(): MockEventEmitter {
  return new MockEventEmitter();
}

/**
 * Create a vitest mock emit function that captures events
 */
export function createMockEmitFn(): {
  emit: ReturnType<typeof vi.fn>;
  emitter: MockEventEmitter;
} {
  const emitter = new MockEventEmitter();
  const emit = vi.fn((event: unknown) => {
    emitter.emit(event as RendererEvent);
  });
  return { emit, emitter };
}

/**
 * Create event emitter with pre-configured event types
 */
export function createAgentEventEmitter(): MockEventEmitter {
  return new MockEventEmitter();
}
