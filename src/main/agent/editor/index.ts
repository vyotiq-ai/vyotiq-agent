/**
 * Editor AI Module
 * 
 * Exports for AI-powered editor features including:
 * - Editor AI service for completions and actions
 * - Editor bridge for system integration
 * - Diagnostics collection and management
 * - Code action provider
 * - Symbol resolution
 */

export { EditorAIService, getEditorAIService, initEditorAIService } from './EditorAIService';
export { EditorAICache } from './cache';
export { buildEditorPrompt, parseAIResponse } from './prompts';
export * from './types';

// Editor integration
export {
  EditorBridge,
  type EditorRequest,
  type EditorBridgeEvent,
  type EditorBridgeConfig,
  DEFAULT_EDITOR_BRIDGE_CONFIG,
} from './EditorBridge';

export {
  DiagnosticsCollector,
  type Diagnostic,
  type DiagnosticSet,
  type DiagnosticsSubscription,
  type DiagnosticsCollectorConfig,
  DEFAULT_DIAGNOSTICS_COLLECTOR_CONFIG,
} from './DiagnosticsCollector';

export {
  CodeActionProvider,
  type CodeActionKind,
  type CodeAction,
  type CodeActionEdit,
  type CodeActionCommand,
  type CodeActionContext,
  type CodeActionProviderConfig,
  DEFAULT_CODE_ACTION_PROVIDER_CONFIG,
} from './CodeActionProvider';

export {
  SymbolResolver,
  type SymbolKind,
  type Symbol,
  type SymbolLocation,
  type SymbolReference,
  type SymbolResolverConfig,
  DEFAULT_SYMBOL_RESOLVER_CONFIG,
} from './SymbolResolver';
