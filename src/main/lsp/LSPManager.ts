/**
 * LSP Manager
 * 
 * Manages multiple language server clients for a workspace.
 * Handles server lifecycle, document synchronization, and provides
 * a unified API for LSP features across all languages.
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import type { Logger } from '../logger';
import { LSPClient } from './LSPClient';
import {
  LANGUAGE_SERVER_CONFIGS,
  getLanguageFromExtension,
  SYMBOL_KIND_NAMES,
  COMPLETION_KIND_NAMES,
} from './serverConfigs';
import type {
  SupportedLanguage,
  LSPClientInfo,
  NormalizedDiagnostic,
  NormalizedHover,
  NormalizedCompletion,
  NormalizedLocation,
  NormalizedSymbol,
  NormalizedCodeAction,
  NormalizedSignatureHelp,
  Diagnostic,
  Position,
  Range,
  DocumentSymbol,
  SymbolInformation,
  MarkupContent,
} from './types';

// =============================================================================
// Types
// =============================================================================

export interface LSPManagerConfig {
  /** Auto-start servers when files are opened */
  autoStart: boolean;
  /** Languages to enable (empty = all available) */
  enabledLanguages: SupportedLanguage[];
  /** Maximum concurrent servers */
  maxServers: number;
  /** Timeout for server startup (ms) */
  startupTimeout: number;
}

export const DEFAULT_LSP_MANAGER_CONFIG: LSPManagerConfig = {
  autoStart: true,
  enabledLanguages: [],
  maxServers: 5,
  startupTimeout: 30000,
};

interface DiagnosticsCache {
  uri: string;
  diagnostics: NormalizedDiagnostic[];
  timestamp: number;
}

// =============================================================================
// LSPManager
// =============================================================================

export class LSPManager extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: LSPManagerConfig;
  private workspacePath: string | null = null;
  
  private clients = new Map<SupportedLanguage, LSPClient>();
  private startingClients = new Set<SupportedLanguage>();
  private diagnosticsCache = new Map<string, DiagnosticsCache>();
  private installedServers = new Set<SupportedLanguage>();

  constructor(logger: Logger, config: Partial<LSPManagerConfig> = {}) {
    super();
    this.logger = logger;
    this.config = { ...DEFAULT_LSP_MANAGER_CONFIG, ...config };
  }

  /**
   * Initialize the LSP manager for a workspace
   */
  async initialize(workspacePath: string): Promise<void> {
    this.workspacePath = workspacePath;
    
    // Check which servers are installed
    await this.detectInstalledServers();
    
    this.logger.info('LSP Manager initialized', {
      workspacePath,
      installedServers: Array.from(this.installedServers),
    });
  }

  /**
   * Shutdown all language servers
   */
  async shutdown(): Promise<void> {
    const stopPromises = Array.from(this.clients.values()).map(client => client.stop());
    await Promise.allSettled(stopPromises);
    
    this.clients.clear();
    this.diagnosticsCache.clear();
    this.workspacePath = null;
    
    this.logger.info('LSP Manager shutdown complete');
  }

  /**
   * Get client info for all active servers
   */
  getClientInfo(): LSPClientInfo[] {
    const info: LSPClientInfo[] = [];
    
    for (const [language, client] of this.clients) {
      info.push({
        language,
        state: client.currentState,
        capabilities: client.serverCapabilities,
      });
    }
    
    return info;
  }

  /**
   * Check if a language server is available
   */
  isServerAvailable(language: SupportedLanguage): boolean {
    return this.installedServers.has(language);
  }

  /**
   * Get list of installed/available servers
   */
  getAvailableServers(): SupportedLanguage[] {
    return Array.from(this.installedServers);
  }

  /**
   * Start a language server
   */
  async startServer(language: SupportedLanguage): Promise<boolean> {
    if (!this.workspacePath) {
      // This is expected when no workspace is open - not an error
      this.logger.debug('LSP server start skipped: no workspace initialized', { language });
      return false;
    }

    if (this.clients.has(language)) {
      return this.clients.get(language)!.currentState === 'running';
    }

    if (this.startingClients.has(language)) {
      return false; // Already starting
    }

    if (!this.installedServers.has(language)) {
      this.logger.warn(`Server not installed: ${language}`);
      return false;
    }

    if (this.clients.size >= this.config.maxServers) {
      this.logger.warn('Maximum server limit reached', { max: this.config.maxServers });
      return false;
    }

    const config = LANGUAGE_SERVER_CONFIGS[language];
    if (!config) {
      this.logger.error(`No config for language: ${language}`);
      return false;
    }

    this.startingClients.add(language);

    try {
      const client = new LSPClient(this.logger, config, this.workspacePath);
      
      // Forward diagnostics events
      client.on('diagnostics', ({ uri, diagnostics }) => {
        const normalized = this.normalizeDiagnostics(uri, diagnostics, language);
        this.diagnosticsCache.set(uri, {
          uri,
          diagnostics: normalized,
          timestamp: Date.now(),
        });
        this.emit('diagnostics', { uri, diagnostics: normalized, language });
      });

      client.on('state-change', (state) => {
        this.emit('server-state-change', { language, state });
      });

      client.on('error', (error) => {
        this.emit('server-error', { language, error });
      });

      const started = await client.start();
      
      if (started) {
        this.clients.set(language, client);
        this.logger.info(`Started ${language} language server`);
      }

      return started;
    } catch (error) {
      this.logger.error(`Failed to start ${language} server`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    } finally {
      this.startingClients.delete(language);
    }
  }

  /**
   * Stop a language server
   */
  async stopServer(language: SupportedLanguage): Promise<void> {
    const client = this.clients.get(language);
    if (client) {
      await client.stop();
      this.clients.delete(language);
      this.logger.info(`Stopped ${language} language server`);
    }
  }

  /**
   * Ensure a server is running for a file
   */
  async ensureServerForFile(filePath: string): Promise<LSPClient | null> {
    const language = getLanguageFromExtension(filePath);
    if (!language) return null;

    if (!this.config.autoStart) return null;

    if (this.config.enabledLanguages.length > 0 && 
        !this.config.enabledLanguages.includes(language)) {
      return null;
    }

    const client = this.clients.get(language);
    if (client?.currentState === 'running') {
      return client;
    }

    const started = await this.startServer(language);
    return started ? this.clients.get(language) || null : null;
  }

  // ===========================================================================
  // Document Management
  // ===========================================================================

  /**
   * Open a document in the appropriate language server
   */
  async openDocument(filePath: string, content?: string): Promise<void> {
    const client = await this.ensureServerForFile(filePath);
    if (!client) return;

    const uri = pathToFileURL(filePath).href;
    const text = content ?? await this.readFile(filePath);
    if (text === null) return;

    client.openDocument(uri, text);
  }

  /**
   * Update a document in the language server
   */
  updateDocument(filePath: string, content: string): void {
    const language = getLanguageFromExtension(filePath);
    if (!language) return;

    const client = this.clients.get(language);
    if (!client || client.currentState !== 'running') return;

    const uri = pathToFileURL(filePath).href;
    client.updateDocument(uri, content);
  }

  /**
   * Close a document in the language server
   */
  closeDocument(filePath: string): void {
    const language = getLanguageFromExtension(filePath);
    if (!language) return;

    const client = this.clients.get(language);
    if (!client) return;

    const uri = pathToFileURL(filePath).href;
    client.closeDocument(uri);
  }

  /**
   * Notify document save
   */
  saveDocument(filePath: string, content?: string): void {
    const language = getLanguageFromExtension(filePath);
    if (!language) return;

    const client = this.clients.get(language);
    if (!client || client.currentState !== 'running') return;

    const uri = pathToFileURL(filePath).href;
    client.saveDocument(uri, content);
  }

  // ===========================================================================
  // LSP Features (Normalized API)
  // ===========================================================================

  /**
   * Get hover information
   */
  async getHover(filePath: string, line: number, column: number): Promise<NormalizedHover | null> {
    const client = await this.ensureServerForFile(filePath);
    if (!client) return null;

    const uri = pathToFileURL(filePath).href;
    const position: Position = { line: line - 1, character: column - 1 };

    const hover = await client.hover(uri, position);
    if (!hover) return null;

    return this.normalizeHover(hover);
  }

  /**
   * Get completions
   */
  async getCompletions(filePath: string, line: number, column: number): Promise<NormalizedCompletion[]> {
    const client = await this.ensureServerForFile(filePath);
    if (!client) return [];

    const uri = pathToFileURL(filePath).href;
    const position: Position = { line: line - 1, character: column - 1 };

    const items = await client.completion(uri, position);
    return items.map(item => this.normalizeCompletion(item));
  }

  /**
   * Get definition location(s)
   */
  async getDefinition(filePath: string, line: number, column: number): Promise<NormalizedLocation[]> {
    const client = await this.ensureServerForFile(filePath);
    if (!client) return [];

    const uri = pathToFileURL(filePath).href;
    const position: Position = { line: line - 1, character: column - 1 };

    const locations = await client.definition(uri, position);
    return locations.map(loc => this.normalizeLocation(loc));
  }

  /**
   * Get type definition location(s)
   */
  async getTypeDefinition(filePath: string, line: number, column: number): Promise<NormalizedLocation[]> {
    const client = await this.ensureServerForFile(filePath);
    if (!client) return [];

    const uri = pathToFileURL(filePath).href;
    const position: Position = { line: line - 1, character: column - 1 };

    const locations = await client.typeDefinition(uri, position);
    return locations.map(loc => this.normalizeLocation(loc));
  }

  /**
   * Get implementation location(s)
   */
  async getImplementation(filePath: string, line: number, column: number): Promise<NormalizedLocation[]> {
    const client = await this.ensureServerForFile(filePath);
    if (!client) return [];

    const uri = pathToFileURL(filePath).href;
    const position: Position = { line: line - 1, character: column - 1 };

    const locations = await client.implementation(uri, position);
    return locations.map(loc => this.normalizeLocation(loc));
  }

  /**
   * Get references to a symbol
   */
  async getReferences(
    filePath: string,
    line: number,
    column: number,
    includeDeclaration = true
  ): Promise<NormalizedLocation[]> {
    const client = await this.ensureServerForFile(filePath);
    if (!client) return [];

    const uri = pathToFileURL(filePath).href;
    const position: Position = { line: line - 1, character: column - 1 };

    const locations = await client.references(uri, position, includeDeclaration);
    return locations.map(loc => this.normalizeLocation(loc));
  }

  /**
   * Get document symbols (outline)
   */
  async getDocumentSymbols(filePath: string): Promise<NormalizedSymbol[]> {
    const client = await this.ensureServerForFile(filePath);
    if (!client) return [];

    const uri = pathToFileURL(filePath).href;
    const symbols = await client.documentSymbols(uri);

    if (symbols.length === 0) return [];

    // Check if it's DocumentSymbol[] or SymbolInformation[]
    if ('range' in symbols[0] && 'selectionRange' in symbols[0]) {
      return this.normalizeDocumentSymbols(filePath, symbols as DocumentSymbol[]);
    } else {
      return (symbols as SymbolInformation[]).map(s => this.normalizeSymbolInfo(s));
    }
  }

  /**
   * Search workspace symbols
   */
  async searchWorkspaceSymbols(query: string): Promise<NormalizedSymbol[]> {
    const results: NormalizedSymbol[] = [];

    for (const client of this.clients.values()) {
      if (client.currentState !== 'running') continue;

      const symbols = await client.workspaceSymbols(query);
      results.push(...symbols.map(s => this.normalizeSymbolInfo(s)));
    }

    return results;
  }

  /**
   * Get code actions for a range
   */
  async getCodeActions(
    filePath: string,
    startLine: number,
    startColumn: number,
    endLine: number,
    endColumn: number
  ): Promise<NormalizedCodeAction[]> {
    const client = await this.ensureServerForFile(filePath);
    if (!client) return [];

    const uri = pathToFileURL(filePath).href;
    const range: Range = {
      start: { line: startLine - 1, character: startColumn - 1 },
      end: { line: endLine - 1, character: endColumn - 1 },
    };

    // Get diagnostics for this range
    const cached = this.diagnosticsCache.get(uri);
    const diagnostics = cached?.diagnostics
      .filter(d => 
        d.line >= startLine && d.line <= endLine
      )
      .map(d => this.denormalizeDiagnostic(d)) || [];

    const actions = await client.codeActions(uri, range, diagnostics);
    return actions.map(a => this.normalizeCodeAction(a, filePath));
  }

  /**
   * Get signature help
   */
  async getSignatureHelp(filePath: string, line: number, column: number): Promise<NormalizedSignatureHelp | null> {
    const client = await this.ensureServerForFile(filePath);
    if (!client) return null;

    const uri = pathToFileURL(filePath).href;
    const position: Position = { line: line - 1, character: column - 1 };

    const help = await client.signatureHelp(uri, position);
    if (!help) return null;

    return this.normalizeSignatureHelp(help);
  }

  /**
   * Get diagnostics for a file (from cache or request)
   */
  async getDiagnostics(filePath: string): Promise<NormalizedDiagnostic[]> {
    const uri = pathToFileURL(filePath).href;
    
    // Check cache first
    const cached = this.diagnosticsCache.get(uri);
    if (cached && Date.now() - cached.timestamp < 5000) {
      return cached.diagnostics;
    }

    // Try to get fresh diagnostics
    const client = await this.ensureServerForFile(filePath);
    if (!client) return cached?.diagnostics || [];

    const diagnostics = await client.diagnostics(uri);
    const language = getLanguageFromExtension(filePath);
    const normalized = this.normalizeDiagnostics(uri, diagnostics, language || 'typescript');

    this.diagnosticsCache.set(uri, {
      uri,
      diagnostics: normalized,
      timestamp: Date.now(),
    });

    return normalized;
  }

  /**
   * Get all cached diagnostics
   */
  getAllDiagnostics(): NormalizedDiagnostic[] {
    const all: NormalizedDiagnostic[] = [];
    for (const cached of this.diagnosticsCache.values()) {
      all.push(...cached.diagnostics);
    }
    return all;
  }

  /**
   * Format a document
   */
  async formatDocument(filePath: string): Promise<Array<{ range: { startLine: number; startColumn: number; endLine: number; endColumn: number }; newText: string }>> {
    const client = await this.ensureServerForFile(filePath);
    if (!client) return [];

    const uri = pathToFileURL(filePath).href;
    const edits = await client.formatting(uri);

    return edits.map(edit => ({
      range: {
        startLine: edit.range.start.line + 1,
        startColumn: edit.range.start.character + 1,
        endLine: edit.range.end.line + 1,
        endColumn: edit.range.end.character + 1,
      },
      newText: edit.newText,
    }));
  }

  /**
   * Rename a symbol
   */
  async renameSymbol(
    filePath: string,
    line: number,
    column: number,
    newName: string
  ): Promise<Array<{ filePath: string; edits: Array<{ range: { startLine: number; startColumn: number; endLine: number; endColumn: number }; newText: string }> }>> {
    const client = await this.ensureServerForFile(filePath);
    if (!client) return [];

    const uri = pathToFileURL(filePath).href;
    const position: Position = { line: line - 1, character: column - 1 };

    const result = await client.rename(uri, position, newName);
    if (!result?.changes) return [];

    return Object.entries(result.changes).map(([fileUri, edits]) => ({
      filePath: fileURLToPath(fileUri),
      edits: edits.map(edit => ({
        range: {
          startLine: edit.range.start.line + 1,
          startColumn: edit.range.start.character + 1,
          endLine: edit.range.end.line + 1,
          endColumn: edit.range.end.character + 1,
        },
        newText: edit.newText,
      })),
    }));
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private async detectInstalledServers(): Promise<void> {
    const { execSync } = await import('node:child_process');
    
    for (const [language, config] of Object.entries(LANGUAGE_SERVER_CONFIGS)) {
      try {
        // Try to find the command
        const cmd = process.platform === 'win32' ? 'where' : 'which';
        execSync(`${cmd} ${config.command}`, { stdio: 'ignore' });
        this.installedServers.add(language as SupportedLanguage);
      } catch {
        // Server not installed
      }
    }

    // TypeScript server is often available via npx
    if (!this.installedServers.has('typescript')) {
      try {
        const { execSync } = await import('node:child_process');
        execSync('npx --yes typescript-language-server --version', { 
          stdio: 'ignore',
          timeout: 10000,
        });
        this.installedServers.add('typescript');
        this.installedServers.add('javascript');
        
        // Update config to use npx
        LANGUAGE_SERVER_CONFIGS.typescript.command = 'npx';
        LANGUAGE_SERVER_CONFIGS.typescript.args = ['--yes', 'typescript-language-server', '--stdio'];
        LANGUAGE_SERVER_CONFIGS.javascript.command = 'npx';
        LANGUAGE_SERVER_CONFIGS.javascript.args = ['--yes', 'typescript-language-server', '--stdio'];
      } catch {
        // Not available via npx either
      }
    }
  }

  private async readFile(filePath: string): Promise<string | null> {
    try {
      return await fs.promises.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  private normalizeDiagnostics(
    uri: string,
    diagnostics: Diagnostic[],
    source: string
  ): NormalizedDiagnostic[] {
    const filePath = fileURLToPath(uri);
    
    return diagnostics.map(d => ({
      filePath,
      line: d.range.start.line + 1,
      column: d.range.start.character + 1,
      endLine: d.range.end.line + 1,
      endColumn: d.range.end.character + 1,
      message: d.message,
      severity: this.normalizeSeverity(d.severity),
      source: d.source || source,
      code: d.code,
    }));
  }

  private normalizeSeverity(severity?: number): 'error' | 'warning' | 'info' | 'hint' {
    switch (severity) {
      case 1: return 'error';
      case 2: return 'warning';
      case 3: return 'info';
      case 4: return 'hint';
      default: return 'error';
    }
  }

  private denormalizeDiagnostic(d: NormalizedDiagnostic): Diagnostic {
    return {
      range: {
        start: { line: d.line - 1, character: d.column - 1 },
        end: { line: (d.endLine || d.line) - 1, character: (d.endColumn || d.column) - 1 },
      },
      message: d.message,
      severity: d.severity === 'error' ? 1 : d.severity === 'warning' ? 2 : d.severity === 'info' ? 3 : 4,
      source: d.source,
      code: d.code,
    };
  }

  private normalizeHover(hover: { contents: unknown; range?: Range }): NormalizedHover {
    let contents = '';
    
    if (typeof hover.contents === 'string') {
      contents = hover.contents;
    } else if (Array.isArray(hover.contents)) {
      contents = hover.contents
        .map(c => typeof c === 'string' ? c : (c as MarkupContent).value)
        .join('\n\n');
    } else if (hover.contents && typeof hover.contents === 'object' && 'value' in hover.contents) {
      contents = (hover.contents as MarkupContent).value;
    }

    return {
      contents,
      range: hover.range ? {
        startLine: hover.range.start.line + 1,
        startColumn: hover.range.start.character + 1,
        endLine: hover.range.end.line + 1,
        endColumn: hover.range.end.character + 1,
      } : undefined,
    };
  }

  private normalizeCompletion(item: { label: string; kind?: number; detail?: string; documentation?: unknown; insertText?: string; sortText?: string }): NormalizedCompletion {
    let documentation: string | undefined;
    
    if (typeof item.documentation === 'string') {
      documentation = item.documentation;
    } else if (item.documentation && typeof item.documentation === 'object' && 'value' in item.documentation) {
      documentation = (item.documentation as MarkupContent).value;
    }

    return {
      label: item.label,
      kind: item.kind ? COMPLETION_KIND_NAMES[item.kind] || 'Unknown' : 'Unknown',
      detail: item.detail,
      documentation,
      insertText: item.insertText,
      sortText: item.sortText,
    };
  }

  private normalizeLocation(loc: { uri: string; range: Range }): NormalizedLocation {
    return {
      filePath: fileURLToPath(loc.uri),
      line: loc.range.start.line + 1,
      column: loc.range.start.character + 1,
      endLine: loc.range.end.line + 1,
      endColumn: loc.range.end.character + 1,
    };
  }

  private normalizeDocumentSymbols(filePath: string, symbols: DocumentSymbol[]): NormalizedSymbol[] {
    const normalize = (s: DocumentSymbol): NormalizedSymbol => ({
      name: s.name,
      kind: SYMBOL_KIND_NAMES[s.kind] || 'Unknown',
      filePath,
      line: s.selectionRange.start.line + 1,
      column: s.selectionRange.start.character + 1,
      endLine: s.range.end.line + 1,
      endColumn: s.range.end.character + 1,
      children: s.children?.map(normalize),
    });

    return symbols.map(normalize);
  }

  private normalizeSymbolInfo(s: SymbolInformation): NormalizedSymbol {
    return {
      name: s.name,
      kind: SYMBOL_KIND_NAMES[s.kind] || 'Unknown',
      filePath: fileURLToPath(s.location.uri),
      line: s.location.range.start.line + 1,
      column: s.location.range.start.character + 1,
      endLine: s.location.range.end.line + 1,
      endColumn: s.location.range.end.character + 1,
      containerName: s.containerName,
    };
  }

  private normalizeCodeAction(action: { title: string; kind?: string; isPreferred?: boolean; edit?: { changes?: Record<string, Array<{ range: Range; newText: string }>> } }, _filePath: string): NormalizedCodeAction {
    const edits: NormalizedCodeAction['edits'] = [];

    if (action.edit?.changes) {
      for (const [uri, changes] of Object.entries(action.edit.changes)) {
        for (const change of changes) {
          edits.push({
            filePath: fileURLToPath(uri),
            range: {
              startLine: change.range.start.line + 1,
              startColumn: change.range.start.character + 1,
              endLine: change.range.end.line + 1,
              endColumn: change.range.end.character + 1,
            },
            newText: change.newText,
          });
        }
      }
    }

    return {
      title: action.title,
      kind: action.kind,
      isPreferred: action.isPreferred,
      edits: edits.length > 0 ? edits : undefined,
    };
  }

  private normalizeSignatureHelp(help: { signatures: Array<{ label: string; documentation?: unknown; parameters?: Array<{ label: unknown; documentation?: unknown }> }>; activeSignature?: number; activeParameter?: number }): NormalizedSignatureHelp {
    return {
      signatures: help.signatures.map(sig => ({
        label: sig.label,
        documentation: typeof sig.documentation === 'string' 
          ? sig.documentation 
          : sig.documentation && typeof sig.documentation === 'object' && 'value' in sig.documentation
            ? (sig.documentation as MarkupContent).value
            : undefined,
        parameters: sig.parameters?.map(p => ({
          label: typeof p.label === 'string' ? p.label : `${(p.label as [number, number])[0]}-${(p.label as [number, number])[1]}`,
          documentation: typeof p.documentation === 'string'
            ? p.documentation
            : p.documentation && typeof p.documentation === 'object' && 'value' in p.documentation
              ? (p.documentation as MarkupContent).value
              : undefined,
        })),
      })),
      activeSignature: help.activeSignature,
      activeParameter: help.activeParameter,
    };
  }
}
