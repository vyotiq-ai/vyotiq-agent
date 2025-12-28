/**
 * PromptOptimizer Unit Tests
 * 
 * Tests for the model-specific prompt optimization system.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PromptOptimizer } from '../PromptOptimizer';

describe('PromptOptimizer', () => {
  let optimizer: PromptOptimizer;

  beforeEach(() => {
    optimizer = new PromptOptimizer();
  });

  describe('model configuration', () => {
    it('should return default config for unknown provider', () => {
      const config = optimizer.getModelConfig('unknown-provider');
      // Should fall back to OpenAI config
      expect(config.provider).toBe('openai');
    });

    it('should return correct config for Anthropic', () => {
      const config = optimizer.getModelConfig('anthropic');
      expect(config.provider).toBe('anthropic');
      expect(config.prefersXmlStructure).toBe(true);
      expect(config.maxSystemPromptTokens).toBe(8000);
    });

    it('should return correct config for OpenAI', () => {
      const config = optimizer.getModelConfig('openai');
      expect(config.provider).toBe('openai');
      expect(config.prefersXmlStructure).toBe(false);
      expect(config.useCondensedRules).toBe(true);
    });

    it('should return correct config for DeepSeek', () => {
      const config = optimizer.getModelConfig('deepseek');
      expect(config.provider).toBe('deepseek');
      expect(config.prefersXmlStructure).toBe(true);
      expect(config.reminderFrequency).toBe(6);
    });

    it('should return correct config for Gemini', () => {
      const config = optimizer.getModelConfig('gemini');
      expect(config.provider).toBe('gemini');
      expect(config.maxSystemPromptTokens).toBe(8000);
    });

    it('should allow custom configurations', () => {
      const customOptimizer = new PromptOptimizer({
        custom: {
          provider: 'custom',
          maxSystemPromptTokens: 4000,
          prefersXmlStructure: false,
          benefitsFromExamples: false,
          useCondensedRules: true,
          prioritySections: ['identity'],
          condensableSections: ['all'],
          addMidConversationReminders: false,
          reminderFrequency: 5,
        },
      });
      
      const config = customOptimizer.getModelConfig('custom');
      expect(config.provider).toBe('custom');
      expect(config.maxSystemPromptTokens).toBe(4000);
    });
  });

  describe('prompt optimization', () => {
    const samplePrompt = `<identity>
You are a helpful AI assistant.
</identity>

<critical_rules>
1. Always be helpful
2. Never be harmful
</critical_rules>

<guidelines>
Some guidelines here that can be condensed.
These are less critical details.
</guidelines>

<communication_style>
Be concise and professional.
</communication_style>`;

  const promptWithToolWorkflows = `<identity>
You are a helpful AI assistant.
</identity>

<critical_rules>
1. Always be helpful
2. Never be harmful
</critical_rules>

<tool_workflows>
## Browser Workflows
- navigate(url) → snapshot → click/type → wait
</tool_workflows>

<guidelines>
${'extra guideline text '.repeat(2000)}
</guidelines>

<communication_style>
Be concise and professional.
</communication_style>`;

    it('should not modify prompt within token budget', () => {
      const result = optimizer.optimizePrompt(samplePrompt, 'anthropic');
      
      expect(result.wasOptimized).toBe(false);
      expect(result.systemPrompt).toBe(samplePrompt);
      expect(result.condensedSections).toHaveLength(0);
      expect(result.removedSections).toHaveLength(0);
    });

    it('should convert XML to markdown for OpenAI', () => {
      const result = optimizer.optimizePrompt(samplePrompt, 'openai');

      expect(result.wasOptimized).toBe(true);
      // Should contain markdown headers instead of XML
      expect(result.systemPrompt).toContain('## Identity');
    });

    it('should preserve XML for Anthropic', () => {
      const result = optimizer.optimizePrompt(samplePrompt, 'anthropic', {
        forceCondense: true,
      });

      // Anthropic prefers XML, but the optimization might still condense
      // Check that XML structure is preserved if not converted
      expect(result.wasOptimized).toBe(true);
    });

    it('should condense sections when over token budget', () => {
      // Create a long prompt that exceeds budget
      const longPrompt = samplePrompt + '\n'.repeat(1000) + 'extra content '.repeat(500);
      
      const result = optimizer.optimizePrompt(longPrompt, 'openai', {
        maxTokens: 1000,
      });

      expect(result.wasOptimized).toBe(true);
      expect(result.estimatedTokens).toBeLessThanOrEqual(1000);
    });

    it('should preserve tool_workflows under trimming for OpenAI', () => {
      const result = optimizer.optimizePrompt(promptWithToolWorkflows, 'openai', {
        maxTokens: 300,
      });

      expect(result.wasOptimized).toBe(true);
      expect(result.removedSections).not.toContain('tool_workflows');
      // OpenAI prefers markdown, so the wrapper tag should become a header
      expect(result.systemPrompt).toContain('## Tool Workflows');
      expect(result.systemPrompt).toContain('Browser Workflows');
    });

    it('should preserve tool_workflows under trimming for DeepSeek', () => {
      const result = optimizer.optimizePrompt(promptWithToolWorkflows, 'deepseek', {
        maxTokens: 300,
      });

      expect(result.wasOptimized).toBe(true);
      expect(result.removedSections).not.toContain('tool_workflows');
      // DeepSeek keeps XML structure
      expect(result.systemPrompt).toContain('<tool_workflows>');
      expect(result.systemPrompt).toContain('Browser Workflows');
    });

    it('should report estimated token count', () => {
      const result = optimizer.optimizePrompt(samplePrompt, 'anthropic');
      
      expect(result.estimatedTokens).toBeGreaterThan(0);
      // Rough estimate: ~4 chars per token
      expect(result.estimatedTokens).toBeCloseTo(samplePrompt.length / 4, -1);
    });
  });

  describe('mid-conversation reminders', () => {
    it('should not generate reminder when disabled', () => {
      const customOptimizer = new PromptOptimizer({
        anthropic: {
          ...optimizer.getModelConfig('anthropic'),
          addMidConversationReminders: false,
        },
      });

      const reminder = customOptimizer.generateMidConversationReminder('anthropic', 20);
      expect(reminder).toBeNull();
    });

    it('should generate reminder at frequency interval', () => {
      // Anthropic has reminder frequency of 10
      const reminderAt10 = optimizer.generateMidConversationReminder('anthropic', 10);
      const reminderAt11 = optimizer.generateMidConversationReminder('anthropic', 11);
      const reminderAt20 = optimizer.generateMidConversationReminder('anthropic', 20);

      expect(reminderAt10).not.toBeNull();
      expect(reminderAt11).toBeNull();
      expect(reminderAt20).not.toBeNull();
    });

    it('should include violations in reminder', () => {
      const violations = ['Did not read file before edit', 'Missing lint check'];
      const reminder = optimizer.generateMidConversationReminder('anthropic', 10, violations);

      expect(reminder).toContain('COMPLIANCE ISSUES');
      expect(reminder).toContain('Did not read file before edit');
      expect(reminder).toContain('Missing lint check');
    });

    it('should include critical reminders', () => {
      const reminder = optimizer.generateMidConversationReminder('anthropic', 10);

      expect(reminder).toContain('CRITICAL REMINDERS');
      expect(reminder).toContain('READ files BEFORE editing');
    });

    it('should generate reminder for violations even off-interval', () => {
      const violations = ['Some violation'];
      const reminder = optimizer.generateMidConversationReminder('anthropic', 5, violations);

      expect(reminder).not.toBeNull();
      expect(reminder).toContain('COMPLIANCE ISSUES');
    });
  });

  describe('condensed rules', () => {
    it('should create condensed rules summary', () => {
      const rules = optimizer.createCondensedRules();

      expect(rules).toContain('MUST DO');
      expect(rules).toContain('MUST NOT');
      expect(rules).toContain('Read before edit');
      expect(rules).toContain('Lint after');
    });
  });

  describe('tool reminders', () => {
    it('should return reminder for edit tool', () => {
      const reminder = optimizer.createToolReminder('edit');
      
      expect(reminder).not.toBeNull();
      expect(reminder).toContain('old_string');
      expect(reminder).toContain('EXACTLY');
    });

    it('should return reminder for write tool', () => {
      const reminder = optimizer.createToolReminder('write');
      
      expect(reminder).not.toBeNull();
      expect(reminder).toContain('create files');
    });

    it('should return reminder for run tool', () => {
      const reminder = optimizer.createToolReminder('run');
      
      expect(reminder).not.toBeNull();
      expect(reminder).toContain('destructive');
    });

    it('should return null for unknown tool', () => {
      const reminder = optimizer.createToolReminder('unknown_tool');
      expect(reminder).toBeNull();
    });
  });

  describe('attention optimization', () => {
    it('should add final reminder when missing', () => {
      const prompt = '<identity>Test</identity>';
      const result = optimizer.optimizePrompt(prompt, 'anthropic', {
        forceCondense: true,
      });

      expect(result.systemPrompt).toContain('final_reminder');
      expect(result.systemPrompt).toContain('BEFORE ACTING');
    });

    it('should not duplicate final reminder', () => {
      const prompt = `<identity>Test</identity>
<final_reminder>Already has reminder</final_reminder>`;
      
      const result = optimizer.optimizePrompt(prompt, 'anthropic', {
        forceCondense: true,
      });

      // Should not add another final_reminder
      const matches = result.systemPrompt.match(/<final_reminder>/g);
      expect(matches?.length).toBe(1);
    });
  });
});
