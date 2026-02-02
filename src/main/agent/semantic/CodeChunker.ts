/**
 * Code Chunker
 *
 * Splits code files into semantic chunks for embedding.
 * Uses language-aware parsing to create meaningful chunks
 * that preserve context and structure.
 */
import { createLogger } from '../../logger';

const logger = createLogger('CodeChunker');

// =============================================================================
// Types
// =============================================================================

export interface CodeChunk {
  /** Chunk content */
  content: string;
  /** Chunk index within file */
  index: number;
  /** Start line (1-based) */
  startLine: number;
  /** End line (1-based) */
  endLine: number;
  /** Symbol type if detected */
  symbolType?: ChunkSymbolType;
  /** Symbol name if detected */
  symbolName?: string;
  /** Programming language */
  language: string;
  /** Additional context from surrounding code */
  context?: string;
}

export type ChunkSymbolType =
  | 'function'
  | 'class'
  | 'method'
  | 'interface'
  | 'type'
  | 'enum'
  | 'constant'
  | 'variable'
  | 'import'
  | 'export'
  | 'comment'
  | 'unknown';

export interface ChunkerConfig {
  /** Target chunk size in characters */
  targetChunkSize: number;
  /** Minimum chunk size */
  minChunkSize: number;
  /** Maximum chunk size */
  maxChunkSize: number;
  /** Overlap between chunks */
  overlapSize: number;
  /** Include imports in separate chunk */
  separateImports: boolean;
  /** Include file-level comment as context */
  includeFileComment: boolean;
}

export const DEFAULT_CHUNKER_CONFIG: ChunkerConfig = {
  targetChunkSize: 1500,
  minChunkSize: 200,
  maxChunkSize: 3000,
  overlapSize: 100,
  separateImports: true,
  includeFileComment: true,
};

// =============================================================================
// Language Detection
// =============================================================================

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.scala': 'scala',
  '.rb': 'ruby',
  '.php': 'php',
  '.cs': 'csharp',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.c': 'c',
  '.h': 'c',
  '.hpp': 'cpp',
  '.swift': 'swift',
  '.m': 'objective-c',
  '.mm': 'objective-c',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.lua': 'lua',
  '.r': 'r',
  '.R': 'r',
  '.sql': 'sql',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'zsh',
  '.ps1': 'powershell',
  '.psm1': 'powershell',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.txt': 'text',
  // Additional languages
  '.dart': 'dart',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.hrl': 'erlang',
  '.hs': 'haskell',
  '.lhs': 'haskell',
  '.ml': 'ocaml',
  '.mli': 'ocaml',
  '.fs': 'fsharp',
  '.fsi': 'fsharp',
  '.fsx': 'fsharp',
  '.clj': 'clojure',
  '.cljs': 'clojure',
  '.cljc': 'clojure',
  '.edn': 'clojure',
  '.jl': 'julia',
  '.zig': 'zig',
  '.nim': 'nim',
  '.nimble': 'nim',
};

/**
 * Detect language from file extension
 */
export function detectLanguage(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  return EXTENSION_TO_LANGUAGE[ext.toLowerCase()] || 'unknown';
}

// =============================================================================
// Language-specific patterns
// =============================================================================

interface LanguagePatterns {
  /** Pattern to match function definitions */
  functionPattern: RegExp;
  /** Pattern to match class definitions */
  classPattern: RegExp;
  /** Pattern to match interface definitions */
  interfacePattern?: RegExp;
  /** Pattern to match type definitions */
  typePattern?: RegExp;
  /** Pattern to match enum definitions */
  enumPattern?: RegExp;
  /** Pattern to match imports */
  importPattern: RegExp;
  /** Single-line comment start */
  singleLineComment: string;
  /** Multi-line comment start */
  multiLineCommentStart: string;
  /** Multi-line comment end */
  multiLineCommentEnd: string;
  /** Block delimiters */
  blockStart: string;
  blockEnd: string;
}

const TYPESCRIPT_PATTERNS: LanguagePatterns = {
  functionPattern: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
  classPattern: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/,
  interfacePattern: /^(?:export\s+)?interface\s+(\w+)/,
  typePattern: /^(?:export\s+)?type\s+(\w+)/,
  enumPattern: /^(?:export\s+)?(?:const\s+)?enum\s+(\w+)/,
  importPattern: /^import\s+/,
  singleLineComment: '//',
  multiLineCommentStart: '/*',
  multiLineCommentEnd: '*/',
  blockStart: '{',
  blockEnd: '}',
};

const PYTHON_PATTERNS: LanguagePatterns = {
  functionPattern: /^(?:async\s+)?def\s+(\w+)/,
  classPattern: /^class\s+(\w+)/,
  importPattern: /^(?:from\s+\S+\s+)?import\s+/,
  singleLineComment: '#',
  multiLineCommentStart: '"""',
  multiLineCommentEnd: '"""',
  blockStart: ':',
  blockEnd: '', // Python uses indentation
};

const RUST_PATTERNS: LanguagePatterns = {
  functionPattern: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/,
  classPattern: /^(?:pub\s+)?struct\s+(\w+)/,
  interfacePattern: /^(?:pub\s+)?trait\s+(\w+)/,
  enumPattern: /^(?:pub\s+)?enum\s+(\w+)/,
  importPattern: /^use\s+/,
  singleLineComment: '//',
  multiLineCommentStart: '/*',
  multiLineCommentEnd: '*/',
  blockStart: '{',
  blockEnd: '}',
};

const GO_PATTERNS: LanguagePatterns = {
  functionPattern: /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)/,
  classPattern: /^type\s+(\w+)\s+struct/,
  interfacePattern: /^type\s+(\w+)\s+interface/,
  importPattern: /^import\s+/,
  singleLineComment: '//',
  multiLineCommentStart: '/*',
  multiLineCommentEnd: '*/',
  blockStart: '{',
  blockEnd: '}',
};

const JAVA_PATTERNS: LanguagePatterns = {
  functionPattern: /^(?:public|private|protected|static|\s)*(?:<[\w\s,<>]+>\s+)?[\w<>,\[\]\s]+\s+(\w+)\s*\(/,
  classPattern: /^(?:public|private|protected|abstract|static|final|\s)*class\s+(\w+)/,
  interfacePattern: /^(?:public|private|protected|\s)*interface\s+(\w+)/,
  enumPattern: /^(?:public|private|protected|\s)*enum\s+(\w+)/,
  importPattern: /^import\s+/,
  singleLineComment: '//',
  multiLineCommentStart: '/*',
  multiLineCommentEnd: '*/',
  blockStart: '{',
  blockEnd: '}',
};

const CSHARP_PATTERNS: LanguagePatterns = {
  functionPattern: /^(?:public|private|protected|internal|static|virtual|override|async|partial|\s)*[\w<>,\[\]\?]+\s+(\w+)\s*\(/,
  classPattern: /^(?:public|private|protected|internal|abstract|sealed|static|partial|\s)*class\s+(\w+)/,
  interfacePattern: /^(?:public|private|protected|internal|\s)*interface\s+(\w+)/,
  typePattern: /^(?:public|private|protected|internal|\s)*(?:struct|record)\s+(\w+)/,
  enumPattern: /^(?:public|private|protected|internal|\s)*enum\s+(\w+)/,
  importPattern: /^using\s+/,
  singleLineComment: '//',
  multiLineCommentStart: '/*',
  multiLineCommentEnd: '*/',
  blockStart: '{',
  blockEnd: '}',
};

const CPP_PATTERNS: LanguagePatterns = {
  functionPattern: /^(?:virtual|static|inline|explicit|const|constexpr|\s)*[\w:<>*&\s]+\s+(\w+)\s*\(/,
  classPattern: /^(?:template\s*<[^>]+>\s*)?(?:class|struct)\s+(\w+)/,
  interfacePattern: /^class\s+(\w+)\s*{[^}]*virtual\s+\w+/,
  enumPattern: /^enum(?:\s+class)?\s+(\w+)/,
  importPattern: /^#include\s+/,
  singleLineComment: '//',
  multiLineCommentStart: '/*',
  multiLineCommentEnd: '*/',
  blockStart: '{',
  blockEnd: '}',
};

const RUBY_PATTERNS: LanguagePatterns = {
  functionPattern: /^(?:def|define_method)\s+(\w+[!?]?)/,
  classPattern: /^class\s+(\w+)/,
  interfacePattern: /^module\s+(\w+)/,
  importPattern: /^require(?:_relative)?\s+/,
  singleLineComment: '#',
  multiLineCommentStart: '=begin',
  multiLineCommentEnd: '=end',
  blockStart: '',  // Ruby uses keywords like 'do', 'class', 'def' as block start
  blockEnd: 'end',
};

const PHP_PATTERNS: LanguagePatterns = {
  functionPattern: /^(?:public|private|protected|static|final|\s)*function\s+(\w+)/,
  classPattern: /^(?:abstract|final|\s)*class\s+(\w+)/,
  interfacePattern: /^interface\s+(\w+)/,
  enumPattern: /^enum\s+(\w+)/,
  typePattern: /^trait\s+(\w+)/,
  importPattern: /^(?:use|require(?:_once)?|include(?:_once)?)\s+/,
  singleLineComment: '//',
  multiLineCommentStart: '/*',
  multiLineCommentEnd: '*/',
  blockStart: '{',
  blockEnd: '}',
};

const KOTLIN_PATTERNS: LanguagePatterns = {
  functionPattern: /^(?:suspend|inline|private|protected|internal|public|override|\s)*fun\s+(?:<[\w\s,<>]+>\s+)?(\w+)/,
  classPattern: /^(?:data|sealed|abstract|open|private|protected|internal|public|\s)*class\s+(\w+)/,
  interfacePattern: /^(?:private|protected|internal|public|\s)*interface\s+(\w+)/,
  enumPattern: /^(?:private|protected|internal|public|\s)*enum\s+class\s+(\w+)/,
  typePattern: /^(?:private|protected|internal|public|\s)*object\s+(\w+)/,
  importPattern: /^import\s+/,
  singleLineComment: '//',
  multiLineCommentStart: '/*',
  multiLineCommentEnd: '*/',
  blockStart: '{',
  blockEnd: '}',
};

const SWIFT_PATTERNS: LanguagePatterns = {
  functionPattern: /^(?:@\w+\s*)*(?:public|private|fileprivate|internal|open|static|class|\s)*func\s+(\w+)/,
  classPattern: /^(?:public|private|fileprivate|internal|open|final|\s)*class\s+(\w+)/,
  interfacePattern: /^(?:public|private|fileprivate|internal|\s)*protocol\s+(\w+)/,
  typePattern: /^(?:public|private|fileprivate|internal|\s)*struct\s+(\w+)/,
  enumPattern: /^(?:public|private|fileprivate|internal|\s)*enum\s+(\w+)/,
  importPattern: /^import\s+/,
  singleLineComment: '//',
  multiLineCommentStart: '/*',
  multiLineCommentEnd: '*/',
  blockStart: '{',
  blockEnd: '}',
};

const SCALA_PATTERNS: LanguagePatterns = {
  functionPattern: /^(?:override|private|protected|final|\s)*def\s+(\w+)/,
  classPattern: /^(?:abstract|sealed|final|case|\s)*class\s+(\w+)/,
  interfacePattern: /^trait\s+(\w+)/,
  typePattern: /^(?:case\s+)?object\s+(\w+)/,
  importPattern: /^import\s+/,
  singleLineComment: '//',
  multiLineCommentStart: '/*',
  multiLineCommentEnd: '*/',
  blockStart: '{',
  blockEnd: '}',
};

// =============================================================================
// Additional Language Patterns (Lua, SQL, Shell, Vue, Svelte, etc.)
// =============================================================================

const LUA_PATTERNS: LanguagePatterns = {
  functionPattern: /^(?:local\s+)?function\s+(\w+(?:\.\w+)*)\s*\(/,
  classPattern: /^local\s+(\w+)\s*=\s*(?:class|setmetatable)\s*\(/,
  importPattern: /^(?:require|dofile|loadfile)\s*[\("']/,
  singleLineComment: '--',
  multiLineCommentStart: '--[[',
  multiLineCommentEnd: ']]',
  blockStart: 'function',
  blockEnd: 'end',
};

const SQL_PATTERNS: LanguagePatterns = {
  functionPattern: /^CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\s+(\w+)/i,
  classPattern: /^CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i,
  typePattern: /^CREATE\s+(?:OR\s+REPLACE\s+)?TYPE\s+(\w+)/i,
  importPattern: /^(?:USE|INCLUDE)\s+/i,
  singleLineComment: '--',
  multiLineCommentStart: '/*',
  multiLineCommentEnd: '*/',
  blockStart: 'BEGIN',
  blockEnd: 'END',
};

const BASH_PATTERNS: LanguagePatterns = {
  functionPattern: /^(?:function\s+)?(\w+)\s*\(\s*\)\s*{?/,
  classPattern: /^#!/,  // Shebang as "class" for file identification
  importPattern: /^(?:source|\.|import)\s+/,
  singleLineComment: '#',
  multiLineCommentStart: ": '",
  multiLineCommentEnd: "'",
  blockStart: '{',
  blockEnd: '}',
};

const POWERSHELL_PATTERNS: LanguagePatterns = {
  functionPattern: /^(?:function|filter)\s+(\w+(?:-\w+)*)/i,
  classPattern: /^class\s+(\w+)/i,
  enumPattern: /^enum\s+(\w+)/i,
  importPattern: /^(?:Import-Module|using\s+(?:module|namespace))\s+/i,
  singleLineComment: '#',
  multiLineCommentStart: '<#',
  multiLineCommentEnd: '#>',
  blockStart: '{',
  blockEnd: '}',
};

const VUE_PATTERNS: LanguagePatterns = {
  functionPattern: /^(?:export\s+)?(?:async\s+)?(?:function|const)\s+(\w+)|^\s*(\w+)\s*\(.*\)\s*{/,
  classPattern: /^export\s+default\s+(?:defineComponent|{)|^<script/,
  typePattern: /^(?:interface|type)\s+(\w+)/,
  importPattern: /^import\s+/,
  singleLineComment: '//',
  multiLineCommentStart: '/*',
  multiLineCommentEnd: '*/',
  blockStart: '{',
  blockEnd: '}',
};

const SVELTE_PATTERNS: LanguagePatterns = {
  functionPattern: /^(?:export\s+)?(?:async\s+)?(?:function|const)\s+(\w+)|^\s*(\w+)\s*=/,
  classPattern: /^<script/,
  typePattern: /^(?:interface|type)\s+(\w+)/,
  importPattern: /^import\s+/,
  singleLineComment: '//',
  multiLineCommentStart: '/*',
  multiLineCommentEnd: '*/',
  blockStart: '{',
  blockEnd: '}',
};

const HTML_PATTERNS: LanguagePatterns = {
  functionPattern: /^<(\w+)(?:\s|>)/,  // HTML tags as "functions"
  classPattern: /^<!DOCTYPE|^<html/i,
  importPattern: /^<(?:link|script)\s+.*(?:href|src)=/i,
  singleLineComment: '<!--',
  multiLineCommentStart: '<!--',
  multiLineCommentEnd: '-->',
  blockStart: '<',
  blockEnd: '>',
};

const CSS_PATTERNS: LanguagePatterns = {
  functionPattern: /^@(?:mixin|function)\s+(\w+)/,
  classPattern: /^\.(\w[\w-]*)|^#(\w[\w-]*)|^(\w+)\s*{/,
  typePattern: /^@keyframes\s+(\w+)/,
  importPattern: /^@import\s+/,
  singleLineComment: '//',  // SCSS/Less
  multiLineCommentStart: '/*',
  multiLineCommentEnd: '*/',
  blockStart: '{',
  blockEnd: '}',
};

const MARKDOWN_PATTERNS: LanguagePatterns = {
  functionPattern: /^#{1,6}\s+(.+)/,  // Headers as "functions"
  classPattern: /^---$/,  // Frontmatter delimiter
  importPattern: /^!\[|^\[.*\]\(.*\)/,  // Images and links
  singleLineComment: '<!--',
  multiLineCommentStart: '<!--',
  multiLineCommentEnd: '-->',
  blockStart: '```',
  blockEnd: '```',
};

const R_PATTERNS: LanguagePatterns = {
  functionPattern: /^(\w+)\s*<-\s*function\s*\(/,
  classPattern: /^setClass\s*\(\s*["'](\w+)["']/,
  importPattern: /^(?:library|require|source)\s*\(/,
  singleLineComment: '#',
  multiLineCommentStart: '#',  // R doesn't have multi-line comments
  multiLineCommentEnd: '#',
  blockStart: '{',
  blockEnd: '}',
};

// =============================================================================
// Additional Language Patterns (Dart, Elixir, Erlang, Haskell, OCaml, F#, etc.)
// =============================================================================

const OBJECTIVE_C_PATTERNS: LanguagePatterns = {
  functionPattern: /^[-+]\s*\([^)]+\)\s*(\w+)/,
  classPattern: /^@(?:interface|implementation)\s+(\w+)/,
  interfacePattern: /^@protocol\s+(\w+)/,
  typePattern: /^typedef\s+(?:struct|enum)\s+(\w+)/,
  importPattern: /^#import\s+|^@import\s+/,
  singleLineComment: '//',
  multiLineCommentStart: '/*',
  multiLineCommentEnd: '*/',
  blockStart: '{',
  blockEnd: '}',
};

const DART_PATTERNS: LanguagePatterns = {
  functionPattern: /^(?:@\w+\s*)*(?:static\s+)?(?:async\s+)?(?:[\w<>]+\s+)?(\w+)\s*\(/,
  classPattern: /^(?:abstract\s+)?class\s+(\w+)/,
  interfacePattern: /^(?:abstract\s+)?class\s+(\w+)/,  // Dart uses abstract classes as interfaces
  enumPattern: /^enum\s+(\w+)/,
  typePattern: /^typedef\s+(\w+)/,
  importPattern: /^import\s+/,
  singleLineComment: '//',
  multiLineCommentStart: '/*',
  multiLineCommentEnd: '*/',
  blockStart: '{',
  blockEnd: '}',
};

const ELIXIR_PATTERNS: LanguagePatterns = {
  functionPattern: /^\s*(?:def|defp|defmacro|defmacrop)\s+(\w+[!?]?)/,
  classPattern: /^\s*defmodule\s+([\w.]+)/,
  interfacePattern: /^\s*defprotocol\s+([\w.]+)/,
  typePattern: /^\s*@type\s+(\w+)/,
  importPattern: /^\s*(?:import|alias|use|require)\s+/,
  singleLineComment: '#',
  multiLineCommentStart: '@moduledoc """',
  multiLineCommentEnd: '"""',
  blockStart: 'do',
  blockEnd: 'end',
};

const ERLANG_PATTERNS: LanguagePatterns = {
  functionPattern: /^(\w+)\s*\([^)]*\)\s*->/,
  classPattern: /^-module\s*\((\w+)\)/,
  typePattern: /^-type\s+(\w+)/,
  importPattern: /^-(?:include|include_lib)\s*\(/,
  singleLineComment: '%',
  multiLineCommentStart: '%',
  multiLineCommentEnd: '%',
  blockStart: '->',
  blockEnd: '.',
};

const HASKELL_PATTERNS: LanguagePatterns = {
  functionPattern: /^(\w+)\s*::|^(\w+)\s+[^=]*=/,
  classPattern: /^(?:data|newtype)\s+(\w+)/,
  interfacePattern: /^class\s+(\w+)/,
  typePattern: /^type\s+(\w+)/,
  importPattern: /^import\s+(?:qualified\s+)?/,
  singleLineComment: '--',
  multiLineCommentStart: '{-',
  multiLineCommentEnd: '-}',
  blockStart: 'where',
  blockEnd: '',
};

const OCAML_PATTERNS: LanguagePatterns = {
  functionPattern: /^let\s+(?:rec\s+)?(\w+)/,
  classPattern: /^class\s+(\w+)/,
  interfacePattern: /^module\s+type\s+(\w+)/,
  typePattern: /^type\s+(\w+)/,
  importPattern: /^open\s+/,
  singleLineComment: '(*',
  multiLineCommentStart: '(*',
  multiLineCommentEnd: '*)',
  blockStart: 'struct',
  blockEnd: 'end',
};

const FSHARP_PATTERNS: LanguagePatterns = {
  functionPattern: /^let\s+(?:rec\s+)?(?:inline\s+)?(\w+)/,
  classPattern: /^type\s+(\w+)\s*=/,
  interfacePattern: /^type\s+(\w+)\s*=/,
  typePattern: /^type\s+(\w+)/,
  importPattern: /^open\s+/,
  singleLineComment: '//',
  multiLineCommentStart: '(*',
  multiLineCommentEnd: '*)',
  blockStart: '',
  blockEnd: '',
};

const CLOJURE_PATTERNS: LanguagePatterns = {
  functionPattern: /^\(defn?-?\s+(\S+)/,
  classPattern: /^\(defprotocol\s+(\S+)/,
  interfacePattern: /^\(defprotocol\s+(\S+)/,
  typePattern: /^\(defrecord\s+(\S+)/,
  importPattern: /^\((?:ns|require|use|import)\s+/,
  singleLineComment: ';',
  multiLineCommentStart: '#_',
  multiLineCommentEnd: '',
  blockStart: '(',
  blockEnd: ')',
};

const JULIA_PATTERNS: LanguagePatterns = {
  functionPattern: /^function\s+(\w+)|^(\w+)\([^)]*\)\s*=/,
  classPattern: /^(?:abstract\s+type|struct|mutable\s+struct)\s+(\w+)/,
  interfacePattern: /^abstract\s+type\s+(\w+)/,
  typePattern: /^const\s+(\w+)/,
  importPattern: /^(?:using|import)\s+/,
  singleLineComment: '#',
  multiLineCommentStart: '#=',
  multiLineCommentEnd: '=#',
  blockStart: '',
  blockEnd: 'end',
};

const ZIG_PATTERNS: LanguagePatterns = {
  functionPattern: /^(?:pub\s+)?fn\s+(\w+)/,
  classPattern: /^(?:pub\s+)?const\s+(\w+)\s*=\s*struct/,
  interfacePattern: /^(?:pub\s+)?const\s+(\w+)\s*=\s*struct/,
  enumPattern: /^(?:pub\s+)?const\s+(\w+)\s*=\s*enum/,
  typePattern: /^(?:pub\s+)?const\s+(\w+)/,
  importPattern: /^const\s+\w+\s*=\s*@import/,
  singleLineComment: '//',
  multiLineCommentStart: '/*',
  multiLineCommentEnd: '*/',
  blockStart: '{',
  blockEnd: '}',
};

const NIM_PATTERNS: LanguagePatterns = {
  functionPattern: /^(?:proc|func|method|template|macro|iterator)\s+(\w+)/,
  classPattern: /^type\s+(\w+)\s*=\s*(?:object|ref\s+object)/,
  interfacePattern: /^type\s+(\w+)\s*=\s*concept/,
  enumPattern: /^type\s+(\w+)\s*=\s*enum/,
  typePattern: /^type\s+(\w+)/,
  importPattern: /^import\s+/,
  singleLineComment: '#',
  multiLineCommentStart: '#[',
  multiLineCommentEnd: ']#',
  blockStart: '',
  blockEnd: '',
};

const LANGUAGE_PATTERNS: Record<string, LanguagePatterns> = {
  typescript: TYPESCRIPT_PATTERNS,
  javascript: TYPESCRIPT_PATTERNS,
  python: PYTHON_PATTERNS,
  rust: RUST_PATTERNS,
  go: GO_PATTERNS,
  java: JAVA_PATTERNS,
  csharp: CSHARP_PATTERNS,
  cpp: CPP_PATTERNS,
  c: CPP_PATTERNS,
  ruby: RUBY_PATTERNS,
  php: PHP_PATTERNS,
  kotlin: KOTLIN_PATTERNS,
  swift: SWIFT_PATTERNS,
  scala: SCALA_PATTERNS,
  // Additional languages
  lua: LUA_PATTERNS,
  sql: SQL_PATTERNS,
  bash: BASH_PATTERNS,
  zsh: BASH_PATTERNS,
  powershell: POWERSHELL_PATTERNS,
  vue: VUE_PATTERNS,
  svelte: SVELTE_PATTERNS,
  html: HTML_PATTERNS,
  css: CSS_PATTERNS,
  scss: CSS_PATTERNS,
  sass: CSS_PATTERNS,
  less: CSS_PATTERNS,
  markdown: MARKDOWN_PATTERNS,
  r: R_PATTERNS,
  // New languages
  'objective-c': OBJECTIVE_C_PATTERNS,
  dart: DART_PATTERNS,
  elixir: ELIXIR_PATTERNS,
  erlang: ERLANG_PATTERNS,
  haskell: HASKELL_PATTERNS,
  ocaml: OCAML_PATTERNS,
  fsharp: FSHARP_PATTERNS,
  clojure: CLOJURE_PATTERNS,
  julia: JULIA_PATTERNS,
  zig: ZIG_PATTERNS,
  nim: NIM_PATTERNS,
};

// =============================================================================
// Code Chunker
// =============================================================================

export class CodeChunker {
  private config: ChunkerConfig;

  constructor(config: Partial<ChunkerConfig> = {}) {
    this.config = { ...DEFAULT_CHUNKER_CONFIG, ...config };
  }

  /**
   * Chunk a file into semantic pieces
   */
  chunk(content: string, filePath: string): CodeChunk[] {
    const language = detectLanguage(filePath);
    const patterns = LANGUAGE_PATTERNS[language];

    // For languages without specific patterns, use generic chunking
    if (!patterns) {
      return this.genericChunk(content, language);
    }

    // Use language-specific chunking
    return this.semanticChunk(content, language, patterns);
  }

  /**
   * Generic chunking by size with line boundaries
   */
  private genericChunk(content: string, language: string): CodeChunk[] {
    const lines = content.split('\n');
    const chunks: CodeChunk[] = [];
    
    let currentChunk = '';
    let chunkStartLine = 1;
    let chunkIndex = 0;

    logger.debug('Starting generic chunking', {
      language,
      totalLines: lines.length,
      targetChunkSize: this.config.targetChunkSize,
    });

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const potentialChunk = currentChunk + (currentChunk ? '\n' : '') + line;

      // Check if adding this line exceeds max size
      if (potentialChunk.length > this.config.maxChunkSize && currentChunk.length >= this.config.minChunkSize) {
        // Save current chunk
        chunks.push({
          content: currentChunk,
          index: chunkIndex++,
          startLine: chunkStartLine,
          endLine: i,
          language,
          symbolType: 'unknown',
        });

        // Start new chunk with overlap
        const overlapLines = this.getOverlapLines(currentChunk, this.config.overlapSize);
        currentChunk = overlapLines + line;
        chunkStartLine = i + 1 - this.countLines(overlapLines);
      } else {
        currentChunk = potentialChunk;
      }
    }

    // Add remaining content
    if (currentChunk.length >= this.config.minChunkSize) {
      chunks.push({
        content: currentChunk,
        index: chunkIndex,
        startLine: chunkStartLine,
        endLine: lines.length,
        language,
        symbolType: 'unknown',
      });
    } else if (chunks.length > 0) {
      // Append to last chunk if remaining is too small
      const lastChunk = chunks[chunks.length - 1];
      lastChunk.content += '\n' + currentChunk;
      lastChunk.endLine = lines.length;
    } else {
      // Single small chunk
      chunks.push({
        content: currentChunk,
        index: 0,
        startLine: 1,
        endLine: lines.length,
        language,
        symbolType: 'unknown',
      });
    }

    logger.debug('Generic chunking completed', {
      language,
      chunksCreated: chunks.length,
    });

    return chunks;
  }

  /**
   * Language-aware semantic chunking
   */
  private semanticChunk(content: string, language: string, patterns: LanguagePatterns): CodeChunk[] {
    const lines = content.split('\n');
    const chunks: CodeChunk[] = [];
    
    let chunkIndex = 0;
    let i = 0;

    // Extract imports as first chunk if configured
    if (this.config.separateImports) {
      const importChunk = this.extractImports(lines, language, patterns);
      if (importChunk) {
        importChunk.index = chunkIndex++;
        chunks.push(importChunk);
        i = importChunk.endLine;
      }
    }

    // Extract file-level comment if configured
    if (this.config.includeFileComment && i === 0) {
      const commentChunk = this.extractFileComment(lines, patterns);
      if (commentChunk) {
        commentChunk.index = chunkIndex++;
        chunks.push(commentChunk);
        i = commentChunk.endLine;
      }
    }

    // Process remaining content
    while (i < lines.length) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Skip empty lines
      if (!trimmedLine) {
        i++;
        continue;
      }

      // Detect symbol type and name
      const detected = this.detectSymbol(trimmedLine, patterns);

      if (detected) {
        // Extract the full block
        const block = this.extractBlock(lines, i, patterns, language);
        
        if (block.content.length >= this.config.minChunkSize || detected.type !== 'unknown') {
          // Split if too large
          if (block.content.length > this.config.maxChunkSize) {
            const subChunks = this.splitLargeBlock(block, language, detected, chunkIndex);
            for (const subChunk of subChunks) {
              subChunk.index = chunkIndex++;
              chunks.push(subChunk);
            }
          } else {
            chunks.push({
              content: block.content,
              index: chunkIndex++,
              startLine: i + 1,
              endLine: block.endLine + 1,
              language,
              symbolType: detected.type,
              symbolName: detected.name,
            });
          }
          i = block.endLine + 1;
          continue;
        }
      }

      // Accumulate non-symbol lines
      const accumulated = this.accumulateLines(lines, i, patterns, language);
      if (accumulated.content.trim()) {
        chunks.push({
          content: accumulated.content,
          index: chunkIndex++,
          startLine: i + 1,
          endLine: accumulated.endLine + 1,
          language,
          symbolType: 'unknown',
        });
      }
      i = accumulated.endLine + 1;
    }

    return chunks.length > 0 ? chunks : [{
      content,
      index: 0,
      startLine: 1,
      endLine: lines.length,
      language,
      symbolType: 'unknown',
    }];
  }

  /**
   * Extract import statements as a chunk
   */
  private extractImports(lines: string[], language: string, patterns: LanguagePatterns): CodeChunk | null {
    const importLines: string[] = [];
    let endLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      
      // Skip empty lines and comments at the start
      if (!trimmed || trimmed.startsWith(patterns.singleLineComment)) {
        if (importLines.length === 0) continue;
      }

      // Check for import
      if (patterns.importPattern.test(trimmed)) {
        importLines.push(lines[i]);
        endLine = i + 1;
      } else if (importLines.length > 0 && !trimmed) {
        // Allow empty lines within imports block
        importLines.push(lines[i]);
      } else if (importLines.length > 0) {
        // End of imports section
        break;
      }
    }

    if (importLines.length === 0) return null;

    const content = importLines.join('\n').trim();
    if (content.length < this.config.minChunkSize) return null;

    return {
      content,
      index: 0,
      startLine: 1,
      endLine,
      language,
      symbolType: 'import',
    };
  }

  /**
   * Extract file-level comment
   */
  private extractFileComment(lines: string[], patterns: LanguagePatterns): CodeChunk | null {
    const commentLines: string[] = [];
    let inMultiLine = false;
    let endLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      
      // Skip empty lines at start
      if (!trimmed && commentLines.length === 0) continue;

      // Check for multi-line comment
      if (trimmed.startsWith(patterns.multiLineCommentStart)) {
        inMultiLine = true;
        commentLines.push(lines[i]);
        
        if (trimmed.includes(patterns.multiLineCommentEnd) && 
            trimmed.indexOf(patterns.multiLineCommentEnd) > trimmed.indexOf(patterns.multiLineCommentStart)) {
          inMultiLine = false;
          endLine = i + 1;
          break;
        }
        continue;
      }

      if (inMultiLine) {
        commentLines.push(lines[i]);
        if (trimmed.includes(patterns.multiLineCommentEnd)) {
          inMultiLine = false;
          endLine = i + 1;
          break;
        }
        continue;
      }

      // Check for single-line comment
      if (trimmed.startsWith(patterns.singleLineComment)) {
        commentLines.push(lines[i]);
        endLine = i + 1;
        continue;
      }

      // Non-comment line - stop
      break;
    }

    if (commentLines.length === 0) return null;

    const content = commentLines.join('\n');
    if (content.length < this.config.minChunkSize) return null;

    return {
      content,
      index: 0,
      startLine: 1,
      endLine,
      language: 'comment',
      symbolType: 'comment',
    };
  }

  /**
   * Detect symbol type and name from a line
   */
  private detectSymbol(line: string, patterns: LanguagePatterns): { type: ChunkSymbolType; name?: string } | null {
    // Check function
    const funcMatch = patterns.functionPattern.exec(line);
    if (funcMatch) return { type: 'function', name: funcMatch[1] };

    // Check class
    const classMatch = patterns.classPattern.exec(line);
    if (classMatch) return { type: 'class', name: classMatch[1] };

    // Check interface
    if (patterns.interfacePattern) {
      const ifaceMatch = patterns.interfacePattern.exec(line);
      if (ifaceMatch) return { type: 'interface', name: ifaceMatch[1] };
    }

    // Check type
    if (patterns.typePattern) {
      const typeMatch = patterns.typePattern.exec(line);
      if (typeMatch) return { type: 'type', name: typeMatch[1] };
    }

    // Check enum
    if (patterns.enumPattern) {
      const enumMatch = patterns.enumPattern.exec(line);
      if (enumMatch) return { type: 'enum', name: enumMatch[1] };
    }

    return null;
  }

  /**
   * Extract a complete code block
   */
  private extractBlock(
    lines: string[],
    startIndex: number,
    patterns: LanguagePatterns,
    language: string
  ): { content: string; endLine: number } {
    // For Python, use indentation-based extraction
    if (language === 'python') {
      return this.extractPythonBlock(lines, startIndex);
    }

    // For brace-based languages
    const blockLines: string[] = [];
    let braceCount = 0;
    let foundOpen = false;
    let endLine = startIndex;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      blockLines.push(line);
      endLine = i;

      // Count braces
      for (const char of line) {
        if (char === patterns.blockStart) {
          braceCount++;
          foundOpen = true;
        } else if (char === patterns.blockEnd) {
          braceCount--;
        }
      }

      // Block complete when we've found opening brace and count returns to 0
      if (foundOpen && braceCount === 0) {
        break;
      }

      // Safety limit - expected for very large code blocks
      if (blockLines.length > 500) {
        break;
      }
    }

    return {
      content: blockLines.join('\n'),
      endLine,
    };
  }

  /**
   * Extract Python block using indentation
   */
  private extractPythonBlock(lines: string[], startIndex: number): { content: string; endLine: number } {
    const blockLines: string[] = [lines[startIndex]];
    const baseIndent = this.getIndentation(lines[startIndex]);
    let endLine = startIndex;

    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Empty line or comment - include
      if (!trimmed || trimmed.startsWith('#')) {
        blockLines.push(line);
        endLine = i;
        continue;
      }

      // Check indentation
      const indent = this.getIndentation(line);
      
      if (indent > baseIndent) {
        // Inside block
        blockLines.push(line);
        endLine = i;
      } else if (indent === baseIndent && (trimmed.startsWith('def ') || trimmed.startsWith('class ') || trimmed.startsWith('@'))) {
        // New definition at same level - stop
        break;
      } else if (indent < baseIndent) {
        // Dedented - stop
        break;
      } else {
        // Same level, continuation
        blockLines.push(line);
        endLine = i;
      }

      // Safety limit
      if (blockLines.length > 500) break;
    }

    return {
      content: blockLines.join('\n'),
      endLine,
    };
  }

  /**
   * Accumulate non-symbol lines into a chunk
   */
  private accumulateLines(
    lines: string[],
    startIndex: number,
    patterns: LanguagePatterns,
    language: string
  ): { content: string; endLine: number } {
    const accumulated: string[] = [];
    let endLine = startIndex;

    // Language-specific size adjustment for more verbose languages
    const targetSize = language === 'java' || language === 'csharp' 
      ? this.config.targetChunkSize * 1.2  // Java/C# tend to be verbose
      : this.config.targetChunkSize;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Check if we hit a symbol definition
      if (this.detectSymbol(trimmed, patterns)) {
        break;
      }

      accumulated.push(line);
      endLine = i;

      // Check size limit
      const currentSize = accumulated.join('\n').length;
      if (currentSize >= targetSize) {
        break;
      }
    }

    return {
      content: accumulated.join('\n'),
      endLine,
    };
  }

  /**
   * Split a large block into smaller chunks
   */
  private splitLargeBlock(
    block: { content: string; endLine: number },
    language: string,
    detected: { type: ChunkSymbolType; name?: string },
    startIndex: number
  ): CodeChunk[] {
    const lines = block.content.split('\n');
    const chunks: CodeChunk[] = [];
    
    let currentLines: string[] = [];
    let chunkStartLine = 0;
    let chunkIndex = startIndex;

    for (let i = 0; i < lines.length; i++) {
      currentLines.push(lines[i]);
      
      const currentSize = currentLines.join('\n').length;
      
      if (currentSize >= this.config.targetChunkSize) {
        chunks.push({
          content: currentLines.join('\n'),
          index: chunkIndex++,
          startLine: chunkStartLine + 1,
          endLine: i + 1,
          language,
          symbolType: chunks.length === 0 ? detected.type : 'unknown',
          symbolName: chunks.length === 0 ? detected.name : undefined,
        });
        
        // Start new chunk with overlap
        const overlap = currentLines.slice(-3);
        currentLines = overlap;
        chunkStartLine = i - overlap.length + 1;
      }
    }

    // Add remaining
    if (currentLines.length > 0) {
      chunks.push({
        content: currentLines.join('\n'),
        index: chunkIndex,
        startLine: chunkStartLine + 1,
        endLine: lines.length,
        language,
        symbolType: 'unknown',
      });
    }

    return chunks;
  }

  /**
   * Get overlap from end of content
   */
  private getOverlapLines(content: string, targetSize: number): string {
    const lines = content.split('\n');
    const result: string[] = [];
    let size = 0;

    for (let i = lines.length - 1; i >= 0 && size < targetSize; i--) {
      result.unshift(lines[i]);
      size += lines[i].length + 1;
    }

    return result.join('\n');
  }

  /**
   * Count lines in text
   */
  private countLines(text: string): number {
    return text.split('\n').length;
  }

  /**
   * Get indentation level of a line
   */
  private getIndentation(line: string): number {
    let indent = 0;
    for (const char of line) {
      if (char === ' ') indent++;
      else if (char === '\t') indent += 4;
      else break;
    }
    return indent;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let chunkerInstance: CodeChunker | null = null;

/**
 * Get the singleton chunker instance
 */
export function getCodeChunker(): CodeChunker {
  if (!chunkerInstance) {
    chunkerInstance = new CodeChunker();
  }
  return chunkerInstance;
}

/**
 * Reset the chunker (for testing)
 */
export function resetCodeChunker(): void {
  chunkerInstance = null;
}
