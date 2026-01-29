/**
 * Tests for OutputTruncator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  OutputTruncator, 
  getOutputTruncator, 
  truncateToolOutput,
  needsTruncation,
  type TruncatedOutput 
} from './OutputTruncator';

describe('OutputTruncator', () => {
  let truncator: OutputTruncator;

  beforeEach(() => {
    truncator = new OutputTruncator({ maxTokens: 100 });
  });

  describe('truncate', () => {
    it('should not truncate output within token limit', () => {
      const output = 'Short output';
      const result: TruncatedOutput = truncator.truncate(output, 'read');
      
      expect(result.wasTruncated).toBe(false);
      expect(result.content).toBe(output);
      expect(result.linesRemoved).toBe(0);
      expect(result.summary).toBe('');
    });

    it('should truncate output exceeding token limit with summary', () => {
      // Create a large output that exceeds 100 tokens
      const lines = Array.from({ length: 500 }, (_, i) => `Line ${i + 1}: This is some content that will make the output large enough to require truncation.`);
      const output = lines.join('\n');
      
      const result = truncator.truncate(output, 'read');
      
      expect(result.wasTruncated).toBe(true);
      expect(result.originalLines).toBe(500);
      expect(result.linesRemoved).toBeGreaterThan(0);
      expect(result.finalTokens).toBeLessThan(result.originalTokens);
      expect(result.summary).toContain('truncated');
      expect(result.content).toContain('[...');
    });

    it('should use head-tail strategy for file read tools', () => {
      const lines = Array.from({ length: 200 }, (_, i) => `Line ${i + 1}`);
      const output = lines.join('\n');
      
      const result = truncator.truncate(output, 'read');
      
      expect(result.wasTruncated).toBe(true);
      // Should contain indicator of truncated lines
      expect(result.content).toContain('truncated');
    });

    it('should use tail strategy for terminal output', () => {
      const lines = Array.from({ length: 500 }, (_, i) => `Output line ${i + 1}`);
      const output = lines.join('\n');
      
      const result = truncator.truncate(output, 'run');
      
      expect(result.wasTruncated).toBe(true);
      // Tail strategy should preserve the end
      expect(result.content).toContain('earlier output truncated');
    });

    it('should use count-summary strategy for directory listings', () => {
      const entries = [
        ...Array.from({ length: 50 }, (_, i) => `dir${i}/`),
        ...Array.from({ length: 150 }, (_, i) => `file${i}.txt`),
      ];
      const output = entries.join('\n');
      
      const result = truncator.truncate(output, 'ls');
      
      expect(result.wasTruncated).toBe(true);
      expect(result.content).toContain('Total entries:');
    });
  });

  describe('getSection', () => {
    it('should return specific line range', () => {
      const output = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
      
      const section = truncator.getSection(output, 2, 4);
      
      expect(section).toBe('Line 2\nLine 3\nLine 4');
    });

    it('should handle out of bounds gracefully', () => {
      const output = 'Line 1\nLine 2\nLine 3';
      
      const section = truncator.getSection(output, 1, 10);
      
      expect(section).toBe('Line 1\nLine 2\nLine 3');
    });
  });

  describe('getConfig and setConfig', () => {
    it('should return current configuration', () => {
      const config = truncator.getConfig();
      
      expect(config.maxTokens).toBe(100);
      expect(config.tokenizerModel).toBe('default');
    });

    it('should update configuration', () => {
      truncator.setConfig({ maxTokens: 200 });
      
      const config = truncator.getConfig();
      expect(config.maxTokens).toBe(200);
    });
  });

  describe('singleton instance', () => {
    it('should return the same instance', () => {
      const instance1 = getOutputTruncator();
      const instance2 = getOutputTruncator();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('convenience functions', () => {
    it('truncateToolOutput should work', () => {
      const output = 'Short output';
      const result = truncateToolOutput(output, 'read');
      
      expect(result.wasTruncated).toBe(false);
      expect(result.content).toBe(output);
    });

    it('needsTruncation should detect large outputs', () => {
      const smallOutput = 'Small';
      const largeOutput = 'x'.repeat(50000);
      
      expect(needsTruncation(smallOutput)).toBe(false);
      expect(needsTruncation(largeOutput)).toBe(true);
    });
  });
});
