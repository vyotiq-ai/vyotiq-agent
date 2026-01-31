/**
 * Symbol Resolver
 *
 * Resolves symbols for agent queries, providing symbol lookup,
 * definition finding, and reference tracking.
 * 
 * Uses LSP (Language Server Protocol) when available for accurate
 * results, falling back to regex-based parsing when LSP is not ready.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Logger } from '../../logger';
import { getLSPManager, type NormalizedSymbol, type NormalizedLocation } from '../../lsp';

// =============================================================================
// Types
// =============================================================================

export type SymbolKind =
  | 'file'
  | 'module'
  | 'namespace'
  | 'package'
  | 'class'
  | 'method'
  | 'property'
  | 'field'
  | 'constructor'
  | 'enum'
  | 'interface'
  | 'function'
  | 'variable'
  | 'constant'
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'key'
  | 'null'
  | 'enumMember'
  | 'struct'
  | 'event'
  | 'operator'
  | 'typeParameter';

export interface Symbol {
  id: string;
  name: string;
  kind: SymbolKind;
  filePath: string;
  range: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  selectionRange?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  containerName?: string;
  detail?: string;
  children?: Symbol[];
}

export interface SymbolLocation {
  filePath: string;
  range: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
}

export interface SymbolReference {
  location: SymbolLocation;
  isDefinition: boolean;
  isDeclaration: boolean;
  isWrite: boolean;
}

export interface SymbolResolverConfig {
  maxSymbolsPerFile: number;
  maxSearchResults: number;
  cacheEnabled: boolean;
  cacheTtlMs: number;
}

export const DEFAULT_SYMBOL_RESOLVER_CONFIG: SymbolResolverConfig = {
  maxSymbolsPerFile: 500,
  maxSearchResults: 100,
  cacheEnabled: true,
  cacheTtlMs: 60000, // 1 minute
};

// =============================================================================
// SymbolResolver
// =============================================================================

export class SymbolResolver extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: SymbolResolverConfig;
  private readonly symbolCache = new Map<string, { symbols: Symbol[]; timestamp: number }>();
  private readonly definitionCache = new Map<string, { location: SymbolLocation; timestamp: number }>();

  constructor(logger: Logger, config: Partial<SymbolResolverConfig> = {}) {
    super();
    this.logger = logger;
    this.config = { ...DEFAULT_SYMBOL_RESOLVER_CONFIG, ...config };
  }

  /**
   * Get symbols in a file
   * Uses LSP when available, falls back to regex parsing
   */
  async getFileSymbols(filePath: string): Promise<Symbol[]> {
    // Check cache
    if (this.config.cacheEnabled) {
      const cached = this.symbolCache.get(filePath);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTtlMs) {
        return cached.symbols;
      }
    }

    // Try LSP first for accurate results
    let symbols: Symbol[] = [];
    try {
      const lspManager = getLSPManager();
      if (lspManager) {
        const lspSymbols = await lspManager.getDocumentSymbols(filePath);
        if (lspSymbols.length > 0) {
          symbols = this.convertLSPSymbols(lspSymbols);
          this.logger.debug('Got symbols from LSP', { filePath, count: symbols.length });
        }
      }
    } catch (error) {
      this.logger.debug('LSP symbol fetch failed, falling back to regex', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Fall back to regex-based parsing if LSP didn't return results
    if (symbols.length === 0) {
      symbols = await this.parseFileSymbols(filePath);
    }

    // Cache result
    if (this.config.cacheEnabled) {
      this.symbolCache.set(filePath, {
        symbols,
        timestamp: Date.now(),
      });
    }

    return symbols;
  }

  /**
   * Find symbol definition
   * Uses LSP when available for accurate cross-file navigation
   */
  async findDefinition(
    filePath: string,
    line: number,
    column: number
  ): Promise<SymbolLocation | null> {
    const cacheKey = `${filePath}:${line}:${column}`;

    // Check cache
    if (this.config.cacheEnabled) {
      const cached = this.definitionCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTtlMs) {
        return cached.location;
      }
    }

    // Try LSP first for accurate cross-file definition lookup
    try {
      const lspManager = getLSPManager();
      if (lspManager) {
        const locations = await lspManager.getDefinition(filePath, line, column);
        if (locations.length > 0) {
          const location = this.convertLSPLocation(locations[0]);
          
          // Cache result
          if (this.config.cacheEnabled) {
            this.definitionCache.set(cacheKey, {
              location,
              timestamp: Date.now(),
            });
          }
          
          this.logger.debug('Got definition from LSP', { filePath, line, column, targetFile: location.filePath });
          return location;
        }
      }
    } catch (error) {
      this.logger.debug('LSP definition lookup failed, falling back to local symbols', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Fall back to local symbol lookup
    const symbols = await this.getFileSymbols(filePath);
    const symbol = this.findSymbolAtPosition(symbols, line, column);

    if (!symbol) {
      return null;
    }

    const location: SymbolLocation = {
      filePath: symbol.filePath,
      range: symbol.selectionRange || symbol.range,
    };

    // Cache result
    if (this.config.cacheEnabled) {
      this.definitionCache.set(cacheKey, {
        location,
        timestamp: Date.now(),
      });
    }

    return location;
  }

  /**
   * Find symbol references
   * Uses LSP when available for cross-file reference finding
   */
  async findReferences(
    filePath: string,
    line: number,
    column: number,
    includeDeclaration: boolean = true
  ): Promise<SymbolReference[]> {
    // Try LSP first for accurate cross-file reference finding
    try {
      const lspManager = getLSPManager();
      if (lspManager) {
        const lspRefs = await lspManager.getReferences(filePath, line, column, includeDeclaration);
        if (lspRefs.length > 0) {
          const references = lspRefs.map(loc => this.convertLSPToReference(loc));
          this.logger.debug('Got references from LSP', { 
            filePath, 
            line, 
            column, 
            count: references.length 
          });
          return references;
        }
      }
    } catch (error) {
      this.logger.debug('LSP reference lookup failed, falling back to local symbols', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Fall back to local symbol lookup
    const references: SymbolReference[] = [];
    const symbols = await this.getFileSymbols(filePath);
    const symbol = this.findSymbolAtPosition(symbols, line, column);

    if (!symbol) {
      return references;
    }

    // Add definition as reference if requested
    if (includeDeclaration) {
      references.push({
        location: {
          filePath: symbol.filePath,
          range: symbol.selectionRange || symbol.range,
        },
        isDefinition: true,
        isDeclaration: true,
        isWrite: false,
      });
    }

    return references;
  }

  /**
   * Search for symbols by name
   */
  async searchSymbols(
    query: string,
    options: { filePaths?: string[]; kinds?: SymbolKind[] } = {}
  ): Promise<Symbol[]> {
    const results: Symbol[] = [];
    const queryLower = query.toLowerCase();

    // Search in specified files or all cached files
    const filesToSearch = options.filePaths || Array.from(this.symbolCache.keys());

    for (const filePath of filesToSearch) {
      const symbols = await this.getFileSymbols(filePath);
      const matches = this.searchInSymbols(symbols, queryLower, options.kinds);
      results.push(...matches);

      if (results.length >= this.config.maxSearchResults) {
        break;
      }
    }

    return results.slice(0, this.config.maxSearchResults);
  }

  /**
   * Get symbol at position
   */
  async getSymbolAtPosition(
    filePath: string,
    line: number,
    column: number
  ): Promise<Symbol | null> {
    const symbols = await this.getFileSymbols(filePath);
    return this.findSymbolAtPosition(symbols, line, column);
  }

  /**
   * Get symbol hierarchy (outline)
   */
  async getSymbolHierarchy(filePath: string): Promise<Symbol[]> {
    const symbols = await this.getFileSymbols(filePath);

    // Build hierarchy from flat list
    return this.buildHierarchy(symbols);
  }

  /**
   * Clear cache for a file
   */
  clearCache(filePath?: string): void {
    if (filePath) {
      this.symbolCache.delete(filePath);
      // Clear definition cache entries for this file
      for (const key of this.definitionCache.keys()) {
        if (key.startsWith(filePath)) {
          this.definitionCache.delete(key);
        }
      }
    } else {
      this.symbolCache.clear();
      this.definitionCache.clear();
    }
  }

  /**
   * Get statistics
   */
  getStats(): SymbolResolverStats {
    let totalSymbols = 0;
    for (const cached of this.symbolCache.values()) {
      totalSymbols += cached.symbols.length;
    }

    return {
      cachedFiles: this.symbolCache.size,
      totalSymbols,
      cachedDefinitions: this.definitionCache.size,
    };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private async parseFileSymbols(filePath: string): Promise<Symbol[]> {
    // This is a simplified implementation
    // In a real implementation, this would use a language server or parser

    try {
      const fs = await import('node:fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      const symbols: Symbol[] = [];
      const ext = filePath.split('.').pop()?.toLowerCase();

      // Skip non-code files
      const codeExtensions = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'hpp'];
      if (ext && !codeExtensions.includes(ext)) {
        return symbols;
      }

      // Simple regex-based symbol extraction with language-specific patterns
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Function declarations
        const funcMatch = line.match(/(?:function|async function)\s+(\w+)/);
        if (funcMatch) {
          symbols.push(this.createSymbol(funcMatch[1], 'function', filePath, i, funcMatch.index || 0));
        }

        // Arrow functions assigned to const/let/var
        const arrowMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/);
        if (arrowMatch) {
          symbols.push(this.createSymbol(arrowMatch[1], 'function', filePath, i, arrowMatch.index || 0));
        }

        // Class declarations
        const classMatch = line.match(/class\s+(\w+)/);
        if (classMatch) {
          symbols.push(this.createSymbol(classMatch[1], 'class', filePath, i, classMatch.index || 0));
        }

        // Interface declarations (TypeScript)
        const interfaceMatch = line.match(/interface\s+(\w+)/);
        if (interfaceMatch) {
          symbols.push(this.createSymbol(interfaceMatch[1], 'interface', filePath, i, interfaceMatch.index || 0));
        }

        // Type declarations (TypeScript)
        const typeMatch = line.match(/type\s+(\w+)\s*=/);
        if (typeMatch) {
          symbols.push(this.createSymbol(typeMatch[1], 'typeParameter', filePath, i, typeMatch.index || 0));
        }

        // Enum declarations
        const enumMatch = line.match(/enum\s+(\w+)/);
        if (enumMatch) {
          symbols.push(this.createSymbol(enumMatch[1], 'enum', filePath, i, enumMatch.index || 0));
        }

        // Export declarations
        const exportMatch = line.match(/export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/);
        if (exportMatch && !symbols.some(s => s.name === exportMatch[1] && s.range.startLine === i)) {
          // Already captured by other patterns
        }
      }

      return symbols.slice(0, this.config.maxSymbolsPerFile);
    } catch (error) {
      this.logger.debug('Failed to parse file symbols', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private createSymbol(
    name: string,
    kind: SymbolKind,
    filePath: string,
    line: number,
    column: number
  ): Symbol {
    return {
      id: randomUUID(),
      name,
      kind,
      filePath,
      range: {
        startLine: line,
        startColumn: column,
        endLine: line,
        endColumn: column + name.length,
      },
      selectionRange: {
        startLine: line,
        startColumn: column,
        endLine: line,
        endColumn: column + name.length,
      },
    };
  }

  private findSymbolAtPosition(symbols: Symbol[], line: number, column: number): Symbol | null {
    for (const symbol of symbols) {
      if (this.isPositionInRange(line, column, symbol.range)) {
        // Check children first for more specific match
        if (symbol.children) {
          const childMatch = this.findSymbolAtPosition(symbol.children, line, column);
          if (childMatch) return childMatch;
        }
        return symbol;
      }
    }
    return null;
  }

  private isPositionInRange(
    line: number,
    column: number,
    range: { startLine: number; startColumn: number; endLine: number; endColumn: number }
  ): boolean {
    if (line < range.startLine || line > range.endLine) return false;
    if (line === range.startLine && column < range.startColumn) return false;
    if (line === range.endLine && column > range.endColumn) return false;
    return true;
  }

  private searchInSymbols(
    symbols: Symbol[],
    query: string,
    kinds?: SymbolKind[]
  ): Symbol[] {
    const results: Symbol[] = [];

    for (const symbol of symbols) {
      // Check kind filter
      if (kinds && !kinds.includes(symbol.kind)) continue;

      // Check name match
      if (symbol.name.toLowerCase().includes(query)) {
        results.push(symbol);
      }

      // Search children
      if (symbol.children) {
        results.push(...this.searchInSymbols(symbol.children, query, kinds));
      }
    }

    return results;
  }

  private buildHierarchy(symbols: Symbol[]): Symbol[] {
    // Simple hierarchy based on container names
    const roots: Symbol[] = [];
    const byName = new Map<string, Symbol>();

    for (const symbol of symbols) {
      byName.set(symbol.name, symbol);
    }

    for (const symbol of symbols) {
      if (symbol.containerName && byName.has(symbol.containerName)) {
        const parent = byName.get(symbol.containerName)!;
        if (!parent.children) parent.children = [];
        parent.children.push(symbol);
      } else {
        roots.push(symbol);
      }
    }

    return roots;
  }

  // ===========================================================================
  // LSP Conversion Helpers
  // ===========================================================================

  /**
   * Convert LSP normalized symbols to internal Symbol format
   */
  private convertLSPSymbols(lspSymbols: NormalizedSymbol[]): Symbol[] {
    return lspSymbols.map(lsp => this.convertLSPSymbol(lsp));
  }

  private convertLSPSymbol(lsp: NormalizedSymbol): Symbol {
    // NormalizedSymbol uses line/column/endLine/endColumn instead of range object
    const symbol: Symbol = {
      id: randomUUID(),
      name: lsp.name,
      kind: this.lspKindToSymbolKind(lsp.kind),
      filePath: lsp.filePath,
      range: {
        startLine: lsp.line,
        startColumn: lsp.column,
        endLine: lsp.endLine ?? lsp.line,
        endColumn: lsp.endColumn ?? lsp.column,
      },
      // NormalizedSymbol doesn't have selectionRange, so we use the same range
      selectionRange: undefined,
      containerName: lsp.containerName,
      // NormalizedSymbol doesn't have detail property
      detail: undefined,
    };

    if (lsp.children && lsp.children.length > 0) {
      symbol.children = lsp.children.map(child => this.convertLSPSymbol(child));
    }

    return symbol;
  }

  /**
   * Convert LSP symbol kind to internal SymbolKind
   * NormalizedSymbol.kind is a string (e.g., 'class', 'function') not a number
   */
  private lspKindToSymbolKind(kind: string | number): SymbolKind {
    // If it's already a string, validate and return
    if (typeof kind === 'string') {
      const validKinds: SymbolKind[] = [
        'file', 'module', 'namespace', 'package', 'class', 'method', 'property',
        'field', 'constructor', 'enum', 'interface', 'function', 'variable',
        'constant', 'string', 'number', 'boolean', 'array', 'object', 'key',
        'null', 'enumMember', 'struct', 'event', 'operator', 'typeParameter',
      ];
      const lowerKind = kind.toLowerCase();
      if (validKinds.includes(lowerKind as SymbolKind)) {
        return lowerKind as SymbolKind;
      }
      return 'variable';
    }
    
    // LSP SymbolKind number mapping (from LSP spec)
    const kindMap: Record<number, SymbolKind> = {
      1: 'file',
      2: 'module',
      3: 'namespace',
      4: 'package',
      5: 'class',
      6: 'method',
      7: 'property',
      8: 'field',
      9: 'constructor',
      10: 'enum',
      11: 'interface',
      12: 'function',
      13: 'variable',
      14: 'constant',
      15: 'string',
      16: 'number',
      17: 'boolean',
      18: 'array',
      19: 'object',
      20: 'key',
      21: 'null',
      22: 'enumMember',
      23: 'struct',
      24: 'event',
      25: 'operator',
      26: 'typeParameter',
    };
    return kindMap[kind] ?? 'variable';
  }

  /**
   * Convert LSP location to internal SymbolLocation format
   */
  private convertLSPLocation(loc: NormalizedLocation): SymbolLocation {
    // NormalizedLocation uses line/column/endLine/endColumn instead of range object
    return {
      filePath: loc.filePath,
      range: {
        startLine: loc.line,
        startColumn: loc.column,
        endLine: loc.endLine ?? loc.line,
        endColumn: loc.endColumn ?? loc.column,
      },
    };
  }

  /**
   * Convert LSP location to internal SymbolReference format
   */
  private convertLSPToReference(loc: NormalizedLocation): SymbolReference {
    return {
      location: this.convertLSPLocation(loc),
      isDefinition: false, // LSP doesn't tell us this directly
      isDeclaration: false,
      isWrite: false,
    };
  }
}

// =============================================================================
// Types
// =============================================================================

interface SymbolResolverStats {
  cachedFiles: number;
  totalSymbols: number;
  cachedDefinitions: number;
}
