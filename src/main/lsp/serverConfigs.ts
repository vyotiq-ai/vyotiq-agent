/**
 * Language Server Configurations
 * 
 * Defines configurations for supported language servers.
 * Each config specifies how to start and communicate with a language server.
 */

import type { LanguageServerConfig, SupportedLanguage } from './types';

/**
 * Default language server configurations.
 * These use commonly available language servers that can be installed via npm/pip/cargo.
 */
export const LANGUAGE_SERVER_CONFIGS: Record<SupportedLanguage, LanguageServerConfig> = {
  typescript: {
    language: 'typescript',
    displayName: 'TypeScript',
    extensions: ['.ts', '.tsx', '.mts', '.cts'],
    command: 'typescript-language-server',
    args: ['--stdio'],
    rootPatterns: ['tsconfig.json', 'package.json'],
  },
  javascript: {
    language: 'javascript',
    displayName: 'JavaScript',
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    command: 'typescript-language-server',
    args: ['--stdio'],
    rootPatterns: ['package.json', 'jsconfig.json'],
  },
  python: {
    language: 'python',
    displayName: 'Python',
    extensions: ['.py', '.pyi', '.pyw'],
    command: 'pylsp',
    args: [],
    rootPatterns: ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile'],
    initializationOptions: {
      pylsp: {
        plugins: {
          pycodestyle: { enabled: true },
          pyflakes: { enabled: true },
          pylint: { enabled: false },
          yapf: { enabled: false },
          autopep8: { enabled: false },
        },
      },
    },
  },
  rust: {
    language: 'rust',
    displayName: 'Rust',
    extensions: ['.rs'],
    command: 'rust-analyzer',
    args: [],
    rootPatterns: ['Cargo.toml'],
    initializationOptions: {
      checkOnSave: { command: 'clippy' },
    },
  },
  go: {
    language: 'go',
    displayName: 'Go',
    extensions: ['.go'],
    command: 'gopls',
    args: [],
    rootPatterns: ['go.mod', 'go.sum'],
  },
  java: {
    language: 'java',
    displayName: 'Java',
    extensions: ['.java'],
    command: 'jdtls',
    args: [],
    rootPatterns: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
  },
  csharp: {
    language: 'csharp',
    displayName: 'C#',
    extensions: ['.cs', '.csx'],
    command: 'OmniSharp',
    args: ['-lsp'],
    rootPatterns: ['*.csproj', '*.sln'],
  },
  cpp: {
    language: 'cpp',
    displayName: 'C++',
    extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx', '.h'],
    command: 'clangd',
    args: [],
    rootPatterns: ['compile_commands.json', 'CMakeLists.txt', '.clangd'],
  },
  c: {
    language: 'c',
    displayName: 'C',
    extensions: ['.c', '.h'],
    command: 'clangd',
    args: [],
    rootPatterns: ['compile_commands.json', 'CMakeLists.txt', 'Makefile'],
  },
  ruby: {
    language: 'ruby',
    displayName: 'Ruby',
    extensions: ['.rb', '.rake', '.gemspec'],
    command: 'solargraph',
    args: ['stdio'],
    rootPatterns: ['Gemfile', '.ruby-version'],
  },
  php: {
    language: 'php',
    displayName: 'PHP',
    extensions: ['.php', '.phtml'],
    command: 'phpactor',
    args: ['language-server'],
    rootPatterns: ['composer.json'],
  },
  swift: {
    language: 'swift',
    displayName: 'Swift',
    extensions: ['.swift'],
    command: 'sourcekit-lsp',
    args: [],
    rootPatterns: ['Package.swift', '*.xcodeproj'],
  },
  kotlin: {
    language: 'kotlin',
    displayName: 'Kotlin',
    extensions: ['.kt', '.kts'],
    command: 'kotlin-language-server',
    args: [],
    rootPatterns: ['build.gradle.kts', 'build.gradle'],
  },
  scala: {
    language: 'scala',
    displayName: 'Scala',
    extensions: ['.scala', '.sc'],
    command: 'metals',
    args: [],
    rootPatterns: ['build.sbt', 'build.sc'],
  },
  html: {
    language: 'html',
    displayName: 'HTML',
    extensions: ['.html', '.htm'],
    command: 'vscode-html-language-server',
    args: ['--stdio'],
    rootPatterns: ['index.html'],
  },
  css: {
    language: 'css',
    displayName: 'CSS',
    extensions: ['.css', '.scss', '.sass', '.less'],
    command: 'vscode-css-language-server',
    args: ['--stdio'],
    rootPatterns: [],
  },
  json: {
    language: 'json',
    displayName: 'JSON',
    extensions: ['.json', '.jsonc'],
    command: 'vscode-json-language-server',
    args: ['--stdio'],
    rootPatterns: [],
  },
  yaml: {
    language: 'yaml',
    displayName: 'YAML',
    extensions: ['.yaml', '.yml'],
    command: 'yaml-language-server',
    args: ['--stdio'],
    rootPatterns: [],
  },
  markdown: {
    language: 'markdown',
    displayName: 'Markdown',
    extensions: ['.md', '.mdx'],
    command: 'marksman',
    args: [],
    rootPatterns: [],
  },
};

/**
 * Get language from file extension
 */
export function getLanguageFromExtension(filePath: string): SupportedLanguage | null {
  const ext = '.' + filePath.split('.').pop()?.toLowerCase();
  
  for (const [language, config] of Object.entries(LANGUAGE_SERVER_CONFIGS)) {
    if (config.extensions.includes(ext)) {
      return language as SupportedLanguage;
    }
  }
  
  return null;
}

/**
 * Get language server config for a file
 */
export function getConfigForFile(filePath: string): LanguageServerConfig | null {
  const language = getLanguageFromExtension(filePath);
  return language ? LANGUAGE_SERVER_CONFIGS[language] : null;
}

/**
 * Check if a language is supported
 */
export function isLanguageSupported(language: string): language is SupportedLanguage {
  return language in LANGUAGE_SERVER_CONFIGS;
}

/**
 * Get all supported languages
 */
export function getSupportedLanguages(): SupportedLanguage[] {
  return Object.keys(LANGUAGE_SERVER_CONFIGS) as SupportedLanguage[];
}

/**
 * Symbol kind number to string mapping
 */
export const SYMBOL_KIND_NAMES: Record<number, string> = {
  1: 'File',
  2: 'Module',
  3: 'Namespace',
  4: 'Package',
  5: 'Class',
  6: 'Method',
  7: 'Property',
  8: 'Field',
  9: 'Constructor',
  10: 'Enum',
  11: 'Interface',
  12: 'Function',
  13: 'Variable',
  14: 'Constant',
  15: 'String',
  16: 'Number',
  17: 'Boolean',
  18: 'Array',
  19: 'Object',
  20: 'Key',
  21: 'Null',
  22: 'EnumMember',
  23: 'Struct',
  24: 'Event',
  25: 'Operator',
  26: 'TypeParameter',
};

/**
 * Completion item kind number to string mapping
 */
export const COMPLETION_KIND_NAMES: Record<number, string> = {
  1: 'Text',
  2: 'Method',
  3: 'Function',
  4: 'Constructor',
  5: 'Field',
  6: 'Variable',
  7: 'Class',
  8: 'Interface',
  9: 'Module',
  10: 'Property',
  11: 'Unit',
  12: 'Value',
  13: 'Enum',
  14: 'Keyword',
  15: 'Snippet',
  16: 'Color',
  17: 'File',
  18: 'Reference',
  19: 'Folder',
  20: 'EnumMember',
  21: 'Constant',
  22: 'Struct',
  23: 'Event',
  24: 'Operator',
  25: 'TypeParameter',
};
