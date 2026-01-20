/**
 * Editor AI Service
 * 
 * Provides AI-powered features for the code editor:
 * - Inline code completions (ghost text)
 * - Code actions (explain, refactor, fix, etc.)
 * - Quick fixes for errors
 * - File-level operations (summarize, find issues, etc.)
 */

import type { LLMProviderName, EditorAISettings } from '../../../shared/types';
import { DEFAULT_EDITOR_AI_SETTINGS } from '../../../shared/types';
import type { ProviderMap } from '../providers';
import { PROVIDER_CONFIGS } from '../providers/registry';
import type { Logger } from '../../logger';
import type {
  EditorAIRequest,
  EditorAIResponse,
  EditorAIAction,
  InlineCompletionRequest,
  InlineCompletionResponse,
  QuickFixRequest,
  QuickFixResponse,
  CodeEdit,
} from './types';
import { EditorAICache } from './cache';
import { buildEditorPrompt, parseAIResponse } from './prompts';

/** Fast models for inline completions */
const FAST_MODELS: Partial<Record<LLMProviderName, string[]>> = {
  gemini: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash-8b'],
  openai: ['gpt-4o-mini', 'gpt-4.1-mini'],
  anthropic: ['claude-3-5-haiku-latest'],
  deepseek: ['deepseek-chat'],
  glm: ['glm-4.5', 'glm-4-32b-0414-128k'],
  openrouter: [], // OpenRouter uses model IDs directly
};

/** Provider priority for speed (includes all supported providers) */
const PROVIDER_PRIORITY: LLMProviderName[] = ['gemini', 'openai', 'deepseek', 'glm', 'anthropic', 'openrouter'];

interface EditorAIServiceDeps {
  getProviders: () => ProviderMap;
  getConfig: () => EditorAISettings | undefined;
  logger: Logger;
}

export class EditorAIService {
  private readonly getProviders: () => ProviderMap;
  private readonly getConfig: () => EditorAISettings | undefined;
  private readonly logger: Logger;
  private readonly cache: EditorAICache;
  private pendingController: AbortController | null = null;

  constructor(deps: EditorAIServiceDeps) {
    this.getProviders = deps.getProviders;
    this.getConfig = deps.getConfig;
    this.logger = deps.logger;
    this.cache = new EditorAICache(200, 120000); // 200 entries, 2 min TTL
  }

  private get config(): EditorAISettings {
    return this.getConfig() ?? DEFAULT_EDITOR_AI_SETTINGS;
  }

  /**
   * Select the best provider for the given action
   */
  private selectProvider(action: EditorAIAction): { name: LLMProviderName; modelId: string } | null {
    const providers = this.getProviders();
    const config = this.config;

    this.logger.debug('Selecting provider for editor AI action', {
      action,
      preferredProvider: config.preferredProvider,
      availableProviders: Array.from(providers.keys()),
    });

    // Use fast models for inline completions
    const useFastModel = action === 'complete-inline';
    
    // Check preferred provider first
    if (config.preferredProvider !== 'auto') {
      const info = providers.get(config.preferredProvider);
      if (info?.hasApiKey && info.enabled) {
        const models = useFastModel 
          ? FAST_MODELS[config.preferredProvider] 
          : PROVIDER_CONFIGS[config.preferredProvider]?.models.map(m => m.id);
        const modelId = models?.[0] ?? PROVIDER_CONFIGS[config.preferredProvider]?.defaultModel;
        if (modelId) {
          this.logger.debug('Selected preferred provider', {
            provider: config.preferredProvider,
            modelId,
            useFastModel,
          });
          return { name: config.preferredProvider, modelId };
        }
      } else {
        this.logger.warn('Preferred provider not available', {
          provider: config.preferredProvider,
          hasApiKey: info?.hasApiKey,
          enabled: info?.enabled,
        });
      }
    }

    // Auto-select based on priority
    for (const providerName of PROVIDER_PRIORITY) {
      const info = providers.get(providerName);
      if (!info?.hasApiKey || !info.enabled) {
        this.logger.debug('Skipping provider', {
          provider: providerName,
          hasApiKey: info?.hasApiKey,
          enabled: info?.enabled,
        });
        continue;
      }

      const models = useFastModel
        ? FAST_MODELS[providerName]
        : PROVIDER_CONFIGS[providerName]?.models.map(m => m.id);
      
      const providerModels = PROVIDER_CONFIGS[providerName]?.models ?? [];
      const modelId = models?.find(m => providerModels.some(pm => pm.id === m))
        ?? PROVIDER_CONFIGS[providerName]?.defaultModel
        ?? providerModels[0]?.id;

      if (modelId) {
        this.logger.debug('Auto-selected provider', {
          provider: providerName,
          modelId,
          useFastModel,
        });
        return { name: providerName, modelId };
      }
    }

    // Build detailed error info
    const allProviders = Array.from(providers.keys());
    const enabledProviders = Array.from(providers.entries())
      .filter(([, info]) => info.enabled && info.hasApiKey)
      .map(([name]) => name);
    const disabledProviders = Array.from(providers.entries())
      .filter(([, info]) => !info.enabled)
      .map(([name]) => name);
    const missingApiKeyProviders = Array.from(providers.entries())
      .filter(([, info]) => info.enabled && !info.hasApiKey)
      .map(([name]) => name);

    this.logger.error('No suitable provider found for editor AI action', {
      action,
      allProviders,
      enabledProviders,
      disabledProviders,
      missingApiKeyProviders,
      hint: missingApiKeyProviders.length > 0 
        ? `Configure API keys for: ${missingApiKeyProviders.join(', ')}`
        : disabledProviders.length > 0
          ? `Enable providers: ${disabledProviders.join(', ')}`
          : 'No providers configured',
    });

    return null;
  }

  /**
   * Get inline code completion (ghost text)
   */
  async getInlineCompletion(request: InlineCompletionRequest): Promise<InlineCompletionResponse> {
    const startTime = Date.now();

    if (!this.config.enableInlineCompletions) {
      return { text: null, error: 'Inline completions disabled' };
    }

    // Cancel any pending request
    this.cancelPending();

    // Check minimum prefix length
    if (request.prefix.trim().length < 2) {
      return { text: null };
    }

    // Build cache key
    const cacheKey = `inline:${request.filePath}:${request.line}:${request.column}:${request.prefix.slice(-50)}`;
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        text: cached.text,
        provider: cached.provider,
        modelId: cached.modelId,
        latencyMs: Date.now() - startTime,
        cached: true,
      };
    }

    // Select provider
    const selected = this.selectProvider('complete-inline');
    if (!selected) {
      return { text: null, error: 'No provider available. Please configure at least one LLM provider with an API key in Settings.' };
    }

    const providers = this.getProviders();
    const providerInfo = providers.get(selected.name);
    if (!providerInfo) {
      return { text: null, error: 'Provider not found' };
    }

    // Create abort controller
    this.pendingController = new AbortController();
    const signal = request.signal 
      ? this.combineSignals(request.signal, this.pendingController.signal)
      : this.pendingController.signal;

    try {
      const prompt = buildEditorPrompt('complete-inline', {
        language: request.language,
        prefix: request.prefix,
        suffix: request.suffix,
        contextBefore: request.contextBefore?.join('\n'),
        contextAfter: request.contextAfter?.join('\n'),
      });

      this.logger.debug('Requesting inline completion', {
        provider: selected.name,
        model: selected.modelId,
        line: request.line,
      });

      const response = await providerInfo.provider.generate({
        systemPrompt: 'You are a code completion assistant. Output ONLY the code that should be inserted at the cursor position. No explanations, no markdown, just the raw code.',
        messages: [{ role: 'user', content: prompt }],
        tools: [],
        config: {
          model: selected.modelId,
          temperature: this.config.completionTemperature,
          maxOutputTokens: this.config.inlineCompletionMaxTokens,
        },
        signal,
      });

      if (signal.aborted) {
        return { text: null };
      }

      let text = response.content?.trim() ?? '';
      
      // Clean up the response
      text = this.cleanCompletionText(text);

      if (text.length < 1) {
        return { text: null };
      }

      // Cache the result
      this.cache.set(cacheKey, {
        text,
        provider: selected.name,
        modelId: selected.modelId,
      });

      return {
        text,
        provider: selected.name,
        modelId: selected.modelId,
        latencyMs: Date.now() - startTime,
        cached: false,
      };
    } catch (error) {
      if (signal.aborted) {
        return { text: null };
      }
      const message = error instanceof Error ? error.message : String(error);
      
      // Handle quota exceeded errors gracefully
      if (message.includes('exceeded') && message.includes('quota')) {
        this.logger.warn('Inline completion quota exceeded - temporarily disabling', { 
          provider: selected.name,
          error: message.slice(0, 200), // Truncate long error messages
        });
        // Return a user-friendly error without spamming logs
        return { 
          text: null, 
          error: 'API quota exceeded. Inline completions temporarily unavailable.',
          quotaExceeded: true,
        };
      }
      
      // Handle rate limit errors
      if (message.includes('rate') && message.includes('limit')) {
        this.logger.debug('Inline completion rate limited', { provider: selected.name });
        return { 
          text: null, 
          error: 'Rate limited. Please wait a moment.',
          rateLimited: true,
        };
      }
      
      this.logger.error('Inline completion error', { error: message });
      return { text: null, error: message };
    } finally {
      this.pendingController = null;
    }
  }

  /**
   * Validate that the action is supported
   */
  private validateAction(action: string): action is EditorAIAction {
    const validActions: EditorAIAction[] = [
      'explain',
      'refactor',
      'fix-errors',
      'generate-tests',
      'add-documentation',
      'optimize',
      'complete-inline',
      'summarize-file',
      'find-issues',
      'convert',
    ];
    return validActions.includes(action as EditorAIAction);
  }

  /**
   * Execute an AI action on code
   */
  async executeAction(request: EditorAIRequest): Promise<EditorAIResponse> {
    const startTime = Date.now();

    // Validate action type
    if (!this.validateAction(request.action)) {
      this.logger.error('Invalid editor AI action', { action: request.action });
      return {
        success: false,
        action: request.action,
        error: `Invalid action: ${request.action}. Valid actions are: explain, refactor, fix-errors, generate-tests, add-documentation, optimize, complete-inline, summarize-file, find-issues, convert`,
      };
    }

    const selected = this.selectProvider(request.action);
    if (!selected) {
      return {
        success: false,
        action: request.action,
        error: 'No provider available. Please configure at least one LLM provider with an API key in Settings → Providers.',
      };
    }

    const providers = this.getProviders();
    const providerInfo = providers.get(selected.name);
    if (!providerInfo) {
      return {
        success: false,
        action: request.action,
        error: 'Provider not found',
      };
    }

    try {
      const { systemPrompt, userPrompt } = this.buildActionPrompts(request);

      this.logger.info('Executing editor AI action', {
        action: request.action,
        provider: selected.name,
        filePath: request.filePath,
      });

      const response = await providerInfo.provider.generate({
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        tools: [],
        config: {
          model: selected.modelId,
          temperature: request.action === 'explain' ? 0.3 : 0.2,
          maxOutputTokens: 2048,
        },
        signal: request.signal,
      });

      const result = parseAIResponse(request.action, response.content ?? '');

      return {
        success: true,
        action: request.action,
        result,
        provider: selected.name,
        modelId: selected.modelId,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Editor AI action error', { action: request.action, error: message });
      return {
        success: false,
        action: request.action,
        error: message,
      };
    }
  }

  /**
   * Get AI-powered quick fixes for a diagnostic
   */
  async getQuickFixes(request: QuickFixRequest): Promise<QuickFixResponse> {
    const startTime = Date.now();

    if (!this.config.enableQuickFixes) {
      return { fixes: [], error: 'Quick fixes disabled' };
    }

    const selected = this.selectProvider('fix-errors');
    if (!selected) {
      return { fixes: [], error: 'No provider available. Please configure at least one LLM provider with an API key in Settings.' };
    }

    const providers = this.getProviders();
    const providerInfo = providers.get(selected.name);
    if (!providerInfo) {
      return { fixes: [], error: 'Provider not found' };
    }

    try {
      const prompt = buildEditorPrompt('fix-errors', {
        language: request.language,
        code: request.codeContext,
        error: `${request.diagnostic.message} (${request.diagnostic.source ?? 'unknown'})`,
        line: request.diagnostic.line,
      });

      const response = await providerInfo.provider.generate({
        systemPrompt: `You are a code fix assistant. Analyze the error and provide fixes.
Output your response in this exact JSON format:
{
  "fixes": [
    {
      "title": "Fix description",
      "code": "corrected code",
      "isPreferred": true
    }
  ]
}`,
        messages: [{ role: 'user', content: prompt }],
        tools: [],
        config: {
          model: selected.modelId,
          temperature: 0.1,
          maxOutputTokens: 1024,
        },
        signal: request.signal,
      });

      const fixes = this.parseQuickFixes(response.content ?? '', request);

      return {
        fixes,
        provider: selected.name,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Quick fix error', { error: message });
      return { fixes: [], error: message };
    }
  }

  /**
   * Cancel pending requests
   */
  cancelPending(): void {
    if (this.pendingController) {
      this.pendingController.abort();
      this.pendingController = null;
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { hits: number; misses: number; hitRate: number } {
    return this.cache.getStats();
  }

  /**
   * Build prompts for different actions
   */
  private buildActionPrompts(request: EditorAIRequest): { systemPrompt: string; userPrompt: string } {
    const code = request.selectedCode || request.fileContent || '';
    
    const systemPrompts: Record<EditorAIAction, string> = {
      'explain': 'You are a code explanation assistant. Explain the code clearly and concisely.',
      'refactor': 'You are a code refactoring assistant. Suggest improvements while maintaining functionality.',
      'fix-errors': 'You are a code debugging assistant. Identify and fix errors in the code.',
      'generate-tests': 'You are a test generation assistant. Create comprehensive unit tests.',
      'add-documentation': 'You are a documentation assistant. Add clear JSDoc/TSDoc comments.',
      'optimize': 'You are a code optimization assistant. Improve performance and efficiency.',
      'complete-inline': 'You are a code completion assistant. Complete the code naturally.',
      'summarize-file': 'You are a code analysis assistant. Summarize what this file does.',
      'find-issues': 'You are a code review assistant. Find potential bugs and improvements.',
      'convert': 'You are a code conversion assistant. Convert code to the requested format.',
    };

    const userPrompt = buildEditorPrompt(request.action, {
      language: request.language,
      code,
      filePath: request.filePath,
      diagnostics: request.context?.diagnostics,
      userInstructions: request.context?.userInstructions,
    });

    return {
      systemPrompt: systemPrompts[request.action],
      userPrompt,
    };
  }

  /**
   * Parse quick fix response
   */
  private parseQuickFixes(content: string, request: QuickFixRequest): Array<{
    title: string;
    description?: string;
    edits: CodeEdit[];
    isPreferred?: boolean;
    kind?: string;
  }> {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.fixes || !Array.isArray(parsed.fixes)) return [];

      return parsed.fixes.map((fix: { title?: string; code?: string; isPreferred?: boolean }, index: number) => ({
        title: fix.title || `Fix ${index + 1}`,
        edits: [{
          range: {
            startLine: request.diagnostic.line,
            startColumn: request.diagnostic.column,
            endLine: request.diagnostic.endLine ?? request.diagnostic.line,
            endColumn: request.diagnostic.endColumn ?? request.diagnostic.column + 10,
          },
          newText: fix.code || '',
        }],
        isPreferred: fix.isPreferred ?? index === 0,
        kind: 'quickfix',
      }));
    } catch {
      return [];
    }
  }

  /**
   * Clean up completion text
   */
  private cleanCompletionText(text: string): string {
    // Remove markdown code blocks
    text = text.replace(/^```[\w]*\n?/gm, '').replace(/\n?```$/gm, '');
    // Remove leading/trailing quotes
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      text = text.slice(1, -1);
    }
    return text.trim();
  }

  /**
   * Combine multiple abort signals
   */
  private combineSignals(...signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();
    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort();
        break;
      }
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    return controller.signal;
  }
}

// Singleton instance
let instance: EditorAIService | null = null;

export function getEditorAIService(): EditorAIService | null {
  return instance;
}

export function initEditorAIService(deps: EditorAIServiceDeps): EditorAIService {
  if (instance) {
    instance.clearCache();
  }
  instance = new EditorAIService(deps);
  
  // Log initialization status
  const providers = deps.getProviders();
  const availableProviders = Array.from(providers.entries())
    .filter(([, info]) => info.hasApiKey && info.enabled)
    .map(([name]) => name);
  
  deps.logger.info('EditorAIService initialized', {
    totalProviders: providers.size,
    availableProviders,
    config: deps.getConfig(),
  });
  
  if (availableProviders.length === 0) {
    deps.logger.warn('EditorAIService: No providers available - AI features will not work until at least one provider is configured with an API key');
  }
  
  return instance;
}
