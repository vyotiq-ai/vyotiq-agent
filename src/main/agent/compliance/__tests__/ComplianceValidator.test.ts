/**
 * ComplianceValidator Unit Tests
 * 
 * Tests for the runtime compliance validation system.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComplianceValidator } from '../ComplianceValidator';
import type { ComplianceViolationEvent } from '../../../../shared/types';

describe('ComplianceValidator', () => {
  let validator: ComplianceValidator;
  let mockLogger: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
  let mockEmitEvent: ReturnType<typeof vi.fn<(event: ComplianceViolationEvent) => void>>;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn<(msg: string, meta?: Record<string, unknown>) => void>(),
      warn: vi.fn<(msg: string, meta?: Record<string, unknown>) => void>(),
      error: vi.fn<(msg: string, meta?: Record<string, unknown>) => void>(),
    };
    mockEmitEvent = vi.fn<(event: ComplianceViolationEvent) => void>();
    validator = new ComplianceValidator({}, mockLogger, mockEmitEvent);
  });

  describe('configuration', () => {
    it('should use default config when none provided', () => {
      const config = validator.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.enforceReadBeforeWrite).toBe(true);
    });

    it('should merge custom config with defaults', () => {
      const customValidator = new ComplianceValidator({
        enforceReadBeforeWrite: false,
        strictMode: true,
      });
      const config = customValidator.getConfig();
      expect(config.enforceReadBeforeWrite).toBe(false);
      expect(config.strictMode).toBe(true);
      expect(config.enabled).toBe(true); // default
    });

    it('should update config at runtime', () => {
      validator.updateConfig({ strictMode: true });
      const config = validator.getConfig();
      expect(config.strictMode).toBe(true);
    });
  });

  describe('run state management', () => {
    it('should initialize run state correctly', () => {
      validator.initializeRun('run-1', 'session-1', 'fix the bug');
      const state = validator.getRunState('run-1');

      expect(state).toBeDefined();
      expect(state?.runId).toBe('run-1');
      expect(state?.sessionId).toBe('session-1');
      expect(state?.userRequest).toBe('fix the bug');
      expect(state?.filesRead.size).toBe(0);
      expect(state?.filesEdited.size).toBe(0);
    });

    it('should return undefined for unknown run', () => {
      const state = validator.getRunState('unknown-run');
      expect(state).toBeUndefined();
    });

    it('should cleanup old runs', () => {
      validator.initializeRun('run-1', 'session-1', 'test');
      
      // Manually set the startedAt to simulate old run
      const state = validator.getRunState('run-1');
      if (state) {
        state.startedAt = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      }

      validator.cleanupOldRuns(24 * 60 * 60 * 1000);
      expect(validator.getRunState('run-1')).toBeUndefined();
    });
  });

  describe('read tool validation', () => {
    beforeEach(() => {
      validator.initializeRun('run-1', 'session-1', 'test');
    });

    it('should track file reads', () => {
      validator.validateToolCall('run-1', 'read_file', { file_path: '/src/test.ts' });
      
      const state = validator.getRunState('run-1');
      expect(state?.filesRead.has('/src/test.ts')).toBe(true);
    });

    it('should normalize file paths', () => {
      validator.validateToolCall('run-1', 'read_file', { file_path: 'C:\\src\\test.ts' });
      
      const state = validator.getRunState('run-1');
      expect(state?.filesRead.has('c:/src/test.ts')).toBe(true);
    });
  });

  describe('edit tool validation', () => {
    beforeEach(() => {
      validator.initializeRun('run-1', 'session-1', 'test');
    });

    it('should allow edit after read', () => {
      validator.validateToolCall('run-1', 'read_file', { file_path: '/src/test.ts' });
      const result = validator.validateToolCall('run-1', 'edit', { 
        file_path: '/src/test.ts',
        old_string: 'some content here\nmore lines\neven more',
        new_string: 'replaced content',
      });

      expect(result.isCompliant).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect edit without read', () => {
      const result = validator.validateToolCall('run-1', 'edit', { 
        file_path: '/src/test.ts',
        old_string: 'some content',
        new_string: 'replaced',
      });

      expect(result.isCompliant).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].type).toBe('file-not-read-before-edit');
      expect(result.violations[0].severity).toBe('error');
    });

    it('should warn about insufficient context in old_string', () => {
      validator.validateToolCall('run-1', 'read_file', { file_path: '/src/test.ts' });
      const result = validator.validateToolCall('run-1', 'edit', { 
        file_path: '/src/test.ts',
        old_string: 'x', // Too short
        new_string: 'y',
      });

      // Should have warning about missing context
      const contextWarning = result.violations.find(v => v.type === 'missing-context-in-edit');
      expect(contextWarning).toBeDefined();
      expect(contextWarning?.severity).toBe('warning');
    });

    it('should track files needing lint check', () => {
      validator.updateConfig({ enforceLintAfterEdit: true });
      validator.validateToolCall('run-1', 'read_file', { file_path: '/src/test.ts' });
      validator.validateToolCall('run-1', 'edit', { 
        file_path: '/src/test.ts',
        old_string: 'multi\nline\ncontent\nhere',
        new_string: 'replaced',
      });

      const state = validator.getRunState('run-1');
      expect(state?.filesNeedingLintCheck.has('/src/test.ts')).toBe(true);
    });
  });

  describe('write tool validation', () => {
    beforeEach(() => {
      validator.initializeRun('run-1', 'session-1', 'test');
    });

    it('should track new file creation', () => {
      const result = validator.validateToolCall('run-1', 'create_file', { 
        file_path: '/src/new.ts',
        content: 'new file content',
      });

      expect(result.isCompliant).toBe(true);
    });

    it('should warn when creating file that was read', () => {
      validator.updateConfig({ blockUnnecessaryFiles: true });
      validator.validateToolCall('run-1', 'read_file', { file_path: '/src/existing.ts' });
      
      const result = validator.validateToolCall('run-1', 'create_file', { 
        file_path: '/src/existing.ts',
        content: 'overwrite content',
      });

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].type).toBe('unnecessary-file-creation');
    });
  });

  describe('lint tool tracking', () => {
    beforeEach(() => {
      validator.updateConfig({ enforceLintAfterEdit: true });
      validator.initializeRun('run-1', 'session-1', 'test');
    });

    it('should clear lint check requirement after running lints', () => {
      validator.validateToolCall('run-1', 'read_file', { file_path: '/src/test.ts' });
      validator.validateToolCall('run-1', 'edit', { 
        file_path: '/src/test.ts',
        old_string: 'multi\nline\ncontent',
        new_string: 'replaced',
      });

      let state = validator.getRunState('run-1');
      expect(state?.filesNeedingLintCheck.size).toBe(1);

      validator.validateToolCall('run-1', 'read_lints', { files: ['/src/test.ts'] });
      
      state = validator.getRunState('run-1');
      expect(state?.filesNeedingLintCheck.size).toBe(0);
    });

    it('should detect pending lint checks at end of iteration', () => {
      validator.validateToolCall('run-1', 'read_file', { file_path: '/src/test.ts' });
      validator.validateToolCall('run-1', 'edit', { 
        file_path: '/src/test.ts',
        old_string: 'multi\nline\ncontent',
        new_string: 'replaced',
      });

      const result = validator.checkPendingLintChecks('run-1');
      
      expect(result.isCompliant).toBe(false);
      expect(result.violations[0].type).toBe('no-lint-check-after-edit');
    });
  });

  describe('event emission', () => {
    beforeEach(() => {
      validator.initializeRun('run-1', 'session-1', 'test');
    });

    it('should emit events for violations', () => {
      validator.validateToolCall('run-1', 'edit', { 
        file_path: '/src/test.ts',
        old_string: 'content',
        new_string: 'replaced',
      });

      expect(mockEmitEvent).toHaveBeenCalled();
      const event = mockEmitEvent.mock.calls[0][0] as ComplianceViolationEvent;
      expect(event.type).toBe('compliance-violation');
      expect(event.sessionId).toBe('session-1');
      expect(event.runId).toBe('run-1');
      expect(event.violation.type).toBe('file-not-read-before-edit');
    });

    it('should not emit events when disabled', () => {
      validator.updateConfig({ enabled: false });
      validator.validateToolCall('run-1', 'edit', { 
        file_path: '/src/test.ts',
        old_string: 'content',
        new_string: 'replaced',
      });

      expect(mockEmitEvent).not.toHaveBeenCalled();
    });
  });

  describe('blocking behavior', () => {
    beforeEach(() => {
      validator.initializeRun('run-1', 'session-1', 'test');
    });

    it('should block on error violations by default', () => {
      const result = validator.validateToolCall('run-1', 'edit', { 
        file_path: '/src/test.ts',
        old_string: 'content',
        new_string: 'replaced',
      });

      expect(result.shouldBlock).toBe(true);
    });

    it('should block on any violation in strict mode', () => {
      validator.updateConfig({ strictMode: true });
      validator.validateToolCall('run-1', 'read_file', { file_path: '/src/test.ts' });
      
      const result = validator.validateToolCall('run-1', 'edit', { 
        file_path: '/src/test.ts',
        old_string: 'x', // Warning only
        new_string: 'y',
      });

      expect(result.shouldBlock).toBe(true);
    });

    it('should block after max violations exceeded', () => {
      validator.updateConfig({ maxViolationsBeforeBlock: 2 });
      validator.validateToolCall('run-1', 'read_file', { file_path: '/src/test.ts' });
      
      // First warning - no block
      validator.validateToolCall('run-1', 'edit', { 
        file_path: '/src/test.ts',
        old_string: 'x',
        new_string: 'y',
      });
      
      // Second warning - no block
      validator.validateToolCall('run-1', 'edit', { 
        file_path: '/src/test.ts',
        old_string: 'a',
        new_string: 'b',
      });
      
      // Third warning - should block
      const result = validator.validateToolCall('run-1', 'edit', { 
        file_path: '/src/test.ts',
        old_string: 'c',
        new_string: 'd',
      });

      expect(result.shouldBlock).toBe(true);
    });
  });

  describe('violation summary', () => {
    beforeEach(() => {
      validator.initializeRun('run-1', 'session-1', 'test');
    });

    it('should return empty summary for unknown run', () => {
      const summary = validator.getViolationSummary('unknown');
      expect(summary.total).toBe(0);
    });

    it('should correctly categorize violations', () => {
      // Create error violation
      validator.validateToolCall('run-1', 'edit', { 
        file_path: '/src/test.ts',
        old_string: 'content',
        new_string: 'replaced',
      });

      const summary = validator.getViolationSummary('run-1');
      expect(summary.total).toBe(1);
      expect(summary.errors).toBe(1);
      expect(summary.byType['file-not-read-before-edit']).toBe(1);
    });
  });

  describe('corrective messages', () => {
    beforeEach(() => {
      validator.initializeRun('run-1', 'session-1', 'test');
    });

    it('should generate corrective message for violations', () => {
      const result = validator.validateToolCall('run-1', 'edit', { 
        file_path: '/src/test.ts',
        old_string: 'content',
        new_string: 'replaced',
      });

      expect(result.correctiveMessage).toBeDefined();
      expect(result.correctiveMessage).toContain('COMPLIANCE REMINDER');
    });

    it('should not generate corrective message when disabled', () => {
      validator.updateConfig({ injectCorrectiveMessages: false });
      
      const result = validator.validateToolCall('run-1', 'edit', { 
        file_path: '/src/test.ts',
        old_string: 'content',
        new_string: 'replaced',
      });

      expect(result.correctiveMessage).toBeUndefined();
    });
  });
});
