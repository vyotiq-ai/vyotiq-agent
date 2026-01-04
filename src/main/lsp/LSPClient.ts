/**
 * LSP Client
 * 
 * Manages communication with a single language server using JSON-RPC over stdio.
 * Handles the LSP lifecycle: initialize, open/close documents, requests, and shutdown.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import type { Logger } from '../logger';
import type {
  LanguageServerConfig,
  SupportedLanguage,
  LSPClientState,
  ServerCapabilities,
  Diagnostic,
  Position,
  CompletionItem,
  Hover,
  Location,
  DocumentSymbol,
  SymbolInformation,
  CodeAction,
  SignatureHelp,
  TextEdit,
  Range,
} from './types';

// =============================================================================
// JSON-RPC Types
// =============================================================================

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: JsonRpcError;
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  method: string;
  timeout: NodeJS.Timeout;
}

// =============================================================================
// LSPClient
// =============================================================================

export class LSPClient extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: LanguageServerConfig;
  private readonly workspaceRoot: string;
  
  private process: ChildProcess | null = null;
  private state: LSPClientState = 'stopped';
  private capabilities: ServerCapabilities | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number | string, PendingRequest>();
  private buffer = '';
  private contentLength = -1;
  private openDocuments = new Set<string>();
  private documentVersions = new Map<string, number>();

  constructor(
    logger: Logger,
    config: LanguageServerConfig,
    workspaceRoot: string
  ) {
    super();
    this.logger = logger;
    this.config = config;
    this.workspaceRoot = workspaceRoot;
  }

  get language(): SupportedLanguage {
    return this.config.language;
  }

  get currentState(): LSPClientState {
    return this.state;
  }

  get serverCapabilities(): ServerCapabilities | null {
    return this.capabilities;
  }

  /**
   * Start the language server and initialize
   */
  async start(): Promise<boolean> {
    if (this.state === 'running') {
      return true;
    }

    this.state = 'starting';
    this.emit('state-change', this.state);

    try {
      // Spawn the language server process
      // Use shell: true on Windows to properly resolve npx and other commands
      this.process = spawn(this.config.command, this.config.args, {
        cwd: this.workspaceRoot,
        env: { ...process.env, ...this.config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      });

      if (!this.process.stdout || !this.process.stdin) {
        throw new Error('Failed to create stdio pipes');
      }

      // Handle stdout (LSP messages)
      this.process.stdout.on('data', (data: Buffer) => {
        this.handleData(data.toString());
      });

      // Handle stderr (logs)
      this.process.stderr?.on('data', (data: Buffer) => {
        this.logger.debug(`[${this.config.language}] stderr: ${data.toString().trim()}`);
      });

      // Handle process exit
      this.process.on('exit', (code) => {
        this.logger.info(`[${this.config.language}] Server exited with code ${code}`);
        this.state = 'stopped';
        this.emit('state-change', this.state);
        this.rejectAllPending(new Error(`Server exited with code ${code}`));
      });

      this.process.on('error', (error) => {
        this.logger.error(`[${this.config.language}] Server error`, { error: error.message });
        this.state = 'error';
        this.emit('state-change', this.state);
        this.emit('error', error);
      });

      // Initialize the server
      const initResult = await this.initialize();
      this.capabilities = initResult.capabilities;

      // Send initialized notification
      this.sendNotification('initialized', {});

      this.state = 'running';
      this.emit('state-change', this.state);
      
      this.logger.info(`[${this.config.language}] Server started successfully`, {
        capabilities: Object.keys(this.capabilities || {}),
      });

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check for common recoverable errors
      const isTypeScriptNotInstalled = errorMessage.includes('Could not find a valid TypeScript installation') ||
                                        errorMessage.includes('typescript') && errorMessage.includes('not found');
      
      if (isTypeScriptNotInstalled) {
        // This is expected when workspace doesn't have TypeScript - log as warning, not error
        this.logger.warn(`[${this.config.language}] TypeScript not installed in workspace - LSP features disabled`, {
          workspaceRoot: this.workspaceRoot,
        });
      } else {
        this.logger.error(`[${this.config.language}] Failed to start server`, { error: errorMessage });
      }
      
      this.state = 'error';
      this.emit('state-change', this.state);
      this.emit('error', error);
      
      // Clean up the process if it's still running
      if (this.process && !this.process.killed) {
        this.process.kill('SIGTERM');
      }
      this.process = null;
      
      return false;
    }
  }

  /**
   * Stop the language server
   */
  async stop(): Promise<void> {
    if (this.state === 'stopped' || !this.process) {
      return;
    }

    try {
      // Send shutdown request
      await this.sendRequest('shutdown', null, 5000);
      // Send exit notification
      this.sendNotification('exit', null);
    } catch {
      // Ignore errors during shutdown
    }

    // Force kill if still running
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 1000);
    }

    this.state = 'stopped';
    this.emit('state-change', this.state);
    this.openDocuments.clear();
    this.documentVersions.clear();
    this.rejectAllPending(new Error('Server stopped'));
  }

  /**
   * Open a document in the language server
   */
  openDocument(uri: string, text: string, languageId?: string): void {
    if (this.state !== 'running') return;

    const version = 1;
    this.documentVersions.set(uri, version);
    this.openDocuments.add(uri);

    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: languageId || this.config.language,
        version,
        text,
      },
    });
  }

  /**
   * Update a document in the language server
   */
  updateDocument(uri: string, text: string): void {
    if (this.state !== 'running' || !this.openDocuments.has(uri)) return;

    const version = (this.documentVersions.get(uri) || 0) + 1;
    this.documentVersions.set(uri, version);

    this.sendNotification('textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    });
  }

  /**
   * Close a document in the language server
   */
  closeDocument(uri: string): void {
    if (this.state !== 'running' || !this.openDocuments.has(uri)) return;

    this.openDocuments.delete(uri);
    this.documentVersions.delete(uri);

    this.sendNotification('textDocument/didClose', {
      textDocument: { uri },
    });
  }

  /**
   * Save a document notification
   */
  saveDocument(uri: string, text?: string): void {
    if (this.state !== 'running') return;

    this.sendNotification('textDocument/didSave', {
      textDocument: { uri },
      ...(text !== undefined && { text }),
    });
  }

  // ===========================================================================
  // LSP Feature Methods
  // ===========================================================================

  /**
   * Get hover information at a position
   */
  async hover(uri: string, position: Position): Promise<Hover | null> {
    if (!this.capabilities?.hoverProvider) return null;

    try {
      return await this.sendRequest('textDocument/hover', {
        textDocument: { uri },
        position,
      }, 5000) as Hover | null;
    } catch {
      return null;
    }
  }

  /**
   * Get completions at a position
   */
  async completion(uri: string, position: Position): Promise<CompletionItem[]> {
    if (!this.capabilities?.completionProvider) return [];

    try {
      const result = await this.sendRequest('textDocument/completion', {
        textDocument: { uri },
        position,
      }, 10000);

      if (Array.isArray(result)) {
        return result;
      }
      if (result && typeof result === 'object' && 'items' in result) {
        return (result as { items: CompletionItem[] }).items;
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Get definition location(s)
   */
  async definition(uri: string, position: Position): Promise<Location[]> {
    if (!this.capabilities?.definitionProvider) return [];

    try {
      const result = await this.sendRequest('textDocument/definition', {
        textDocument: { uri },
        position,
      }, 5000);

      return this.normalizeLocations(result);
    } catch {
      return [];
    }
  }

  /**
   * Get type definition location(s)
   */
  async typeDefinition(uri: string, position: Position): Promise<Location[]> {
    if (!this.capabilities?.typeDefinitionProvider) return [];

    try {
      const result = await this.sendRequest('textDocument/typeDefinition', {
        textDocument: { uri },
        position,
      }, 5000);

      return this.normalizeLocations(result);
    } catch {
      return [];
    }
  }

  /**
   * Get implementation location(s)
   */
  async implementation(uri: string, position: Position): Promise<Location[]> {
    if (!this.capabilities?.implementationProvider) return [];

    try {
      const result = await this.sendRequest('textDocument/implementation', {
        textDocument: { uri },
        position,
      }, 5000);

      return this.normalizeLocations(result);
    } catch {
      return [];
    }
  }

  /**
   * Get references to a symbol
   */
  async references(uri: string, position: Position, includeDeclaration = true): Promise<Location[]> {
    if (!this.capabilities?.referencesProvider) return [];

    try {
      const result = await this.sendRequest('textDocument/references', {
        textDocument: { uri },
        position,
        context: { includeDeclaration },
      }, 10000);

      return this.normalizeLocations(result);
    } catch {
      return [];
    }
  }

  /**
   * Get document symbols
   */
  async documentSymbols(uri: string): Promise<DocumentSymbol[] | SymbolInformation[]> {
    if (!this.capabilities?.documentSymbolProvider) return [];

    try {
      const result = await this.sendRequest('textDocument/documentSymbol', {
        textDocument: { uri },
      }, 10000);

      return (result as DocumentSymbol[] | SymbolInformation[]) || [];
    } catch {
      return [];
    }
  }

  /**
   * Get workspace symbols matching a query
   */
  async workspaceSymbols(query: string): Promise<SymbolInformation[]> {
    if (!this.capabilities?.workspaceSymbolProvider) return [];

    try {
      const result = await this.sendRequest('workspace/symbol', {
        query,
      }, 15000);

      return (result as SymbolInformation[]) || [];
    } catch {
      return [];
    }
  }

  /**
   * Get code actions for a range
   */
  async codeActions(
    uri: string,
    range: Range,
    diagnostics: Diagnostic[] = []
  ): Promise<CodeAction[]> {
    if (!this.capabilities?.codeActionProvider) return [];

    try {
      const result = await this.sendRequest('textDocument/codeAction', {
        textDocument: { uri },
        range,
        context: { diagnostics },
      }, 10000);

      return (result as CodeAction[]) || [];
    } catch {
      return [];
    }
  }

  /**
   * Get signature help at a position
   */
  async signatureHelp(uri: string, position: Position): Promise<SignatureHelp | null> {
    if (!this.capabilities?.signatureHelpProvider) return null;

    try {
      return await this.sendRequest('textDocument/signatureHelp', {
        textDocument: { uri },
        position,
      }, 5000) as SignatureHelp | null;
    } catch {
      return null;
    }
  }

  /**
   * Format a document
   */
  async formatting(uri: string): Promise<TextEdit[]> {
    if (!this.capabilities?.documentFormattingProvider) return [];

    try {
      const result = await this.sendRequest('textDocument/formatting', {
        textDocument: { uri },
        options: {
          tabSize: 2,
          insertSpaces: true,
        },
      }, 10000);

      return (result as TextEdit[]) || [];
    } catch {
      return [];
    }
  }

  /**
   * Rename a symbol
   */
  async rename(uri: string, position: Position, newName: string): Promise<{ changes?: Record<string, TextEdit[]> } | null> {
    if (!this.capabilities?.renameProvider) return null;

    try {
      return await this.sendRequest('textDocument/rename', {
        textDocument: { uri },
        position,
        newName,
      }, 10000) as { changes?: Record<string, TextEdit[]> } | null;
    } catch {
      return null;
    }
  }

  /**
   * Request diagnostics for a document (pull model)
   */
  async diagnostics(uri: string): Promise<Diagnostic[]> {
    // Try pull diagnostics if supported
    if (this.capabilities?.diagnosticProvider) {
      try {
        const result = await this.sendRequest('textDocument/diagnostic', {
          textDocument: { uri },
        }, 10000);

        if (result && typeof result === 'object' && 'items' in result) {
          return (result as { items: Diagnostic[] }).items;
        }
      } catch {
        // Fall through to return empty
      }
    }
    return [];
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private async initialize(): Promise<{ capabilities: ServerCapabilities }> {
    const result = await this.sendRequest('initialize', {
      processId: process.pid,
      clientInfo: {
        name: 'Vyotiq',
        version: '1.0.0',
      },
      rootUri: `file://${this.workspaceRoot}`,
      rootPath: this.workspaceRoot,
      capabilities: {
        textDocument: {
          synchronization: {
            dynamicRegistration: false,
            willSave: false,
            willSaveWaitUntil: false,
            didSave: true,
          },
          completion: {
            dynamicRegistration: false,
            completionItem: {
              snippetSupport: true,
              documentationFormat: ['markdown', 'plaintext'],
            },
          },
          hover: {
            dynamicRegistration: false,
            contentFormat: ['markdown', 'plaintext'],
          },
          signatureHelp: {
            dynamicRegistration: false,
            signatureInformation: {
              documentationFormat: ['markdown', 'plaintext'],
            },
          },
          definition: { dynamicRegistration: false },
          typeDefinition: { dynamicRegistration: false },
          implementation: { dynamicRegistration: false },
          references: { dynamicRegistration: false },
          documentSymbol: { dynamicRegistration: false },
          codeAction: { dynamicRegistration: false },
          formatting: { dynamicRegistration: false },
          rename: { dynamicRegistration: false },
          publishDiagnostics: {
            relatedInformation: true,
          },
        },
        workspace: {
          workspaceFolders: true,
          symbol: { dynamicRegistration: false },
        },
      },
      workspaceFolders: [
        {
          uri: `file://${this.workspaceRoot}`,
          name: path.basename(this.workspaceRoot),
        },
      ],
      initializationOptions: this.config.initializationOptions,
    }, 30000);

    return result as { capabilities: ServerCapabilities };
  }

  private sendRequest(method: string, params: unknown, timeout = 30000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('Server not running'));
        return;
      }

      const id = ++this.requestId;
      const message: JsonRpcMessage = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${method} timed out after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        method,
        timeout: timeoutHandle,
      });

      this.sendMessage(message);
    });
  }

  private sendNotification(method: string, params: unknown): void {
    if (!this.process?.stdin) return;

    const message: JsonRpcMessage = {
      jsonrpc: '2.0',
      method,
      params,
    };

    this.sendMessage(message);
  }

  private sendMessage(message: JsonRpcMessage): void {
    const content = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
    
    try {
      this.process?.stdin?.write(header + content);
    } catch (error) {
      this.logger.error(`[${this.config.language}] Failed to send message`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private handleData(data: string): void {
    this.buffer += data;

    // Process messages until buffer is exhausted
    while (this.buffer.length > 0) {
      // Parse header if we don't have content length yet
      if (this.contentLength === -1) {
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;

        const header = this.buffer.slice(0, headerEnd);
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          this.logger.error(`[${this.config.language}] Invalid LSP header`);
          this.buffer = this.buffer.slice(headerEnd + 4);
          continue;
        }

        this.contentLength = parseInt(match[1], 10);
        this.buffer = this.buffer.slice(headerEnd + 4);
      }

      // Check if we have the full message
      if (this.buffer.length < this.contentLength) break;

      const content = this.buffer.slice(0, this.contentLength);
      this.buffer = this.buffer.slice(this.contentLength);
      this.contentLength = -1;

      try {
        const message = JSON.parse(content) as JsonRpcMessage;
        this.handleMessage(message);
      } catch (error) {
        this.logger.error(`[${this.config.language}] Failed to parse message`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private handleMessage(message: JsonRpcMessage): void {
    // Response to a request
    if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.id);

        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
      return;
    }

    // Notification from server
    if (message.method) {
      this.handleNotification(message.method, message.params);
    }
  }

  private handleNotification(method: string, params: unknown): void {
    switch (method) {
      case 'textDocument/publishDiagnostics': {
        const { uri, diagnostics } = params as { uri: string; diagnostics: Diagnostic[] };
        this.emit('diagnostics', { uri, diagnostics });
        break;
      }
      case 'window/logMessage':
      case 'window/showMessage': {
        const { type, message } = params as { type: number; message: string };
        const level = type === 1 ? 'error' : type === 2 ? 'warn' : 'info';
        this.logger.debug(`[${this.config.language}] ${level}: ${message}`);
        break;
      }
      default:
        this.logger.debug(`[${this.config.language}] Unhandled notification: ${method}`);
    }
  }

  private normalizeLocations(result: unknown): Location[] {
    if (!result) return [];
    if (Array.isArray(result)) return result as Location[];
    if (typeof result === 'object' && 'uri' in result) return [result as Location];
    return [];
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pendingRequests.delete(id);
    }
  }
}
