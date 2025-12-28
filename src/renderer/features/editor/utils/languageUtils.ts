/**
 * Language Utilities
 * 
 * Maps file extensions to Monaco Editor language IDs.
 */

/** Extension to language ID mapping */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  // JavaScript/TypeScript
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  
  // Web
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  
  // Data formats
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  svg: 'xml',
  toml: 'ini',
  ini: 'ini',
  
  // Markdown
  md: 'markdown',
  mdx: 'markdown',
  markdown: 'markdown',
  
  // Python
  py: 'python',
  pyw: 'python',
  pyi: 'python',
  
  // Rust
  rs: 'rust',
  
  // Go
  go: 'go',
  mod: 'go',
  
  // Java/Kotlin
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  
  // C/C++
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hxx: 'cpp',
  
  // C#
  cs: 'csharp',
  
  // PHP
  php: 'php',
  
  // Ruby
  rb: 'ruby',
  rake: 'ruby',
  gemspec: 'ruby',
  
  // Shell
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  ps1: 'powershell',
  psm1: 'powershell',
  psd1: 'powershell',
  bat: 'bat',
  cmd: 'bat',
  
  // SQL
  sql: 'sql',
  mysql: 'sql',
  pgsql: 'sql',
  
  // GraphQL
  graphql: 'graphql',
  gql: 'graphql',
  
  // Docker
  dockerfile: 'dockerfile',
  
  // Config files
  env: 'ini',
  gitignore: 'ignore',
  dockerignore: 'ignore',
  editorconfig: 'ini',
  
  // Other
  txt: 'plaintext',
  log: 'log',
  diff: 'diff',
  patch: 'diff',
};

/** Filename to language ID mapping (for special files) */
const FILENAME_TO_LANGUAGE: Record<string, string> = {
  'Dockerfile': 'dockerfile',
  'Makefile': 'makefile',
  'Rakefile': 'ruby',
  'Gemfile': 'ruby',
  'Vagrantfile': 'ruby',
  '.gitignore': 'ignore',
  '.dockerignore': 'ignore',
  '.npmignore': 'ignore',
  '.eslintignore': 'ignore',
  '.prettierignore': 'ignore',
  '.env': 'ini',
  '.env.local': 'ini',
  '.env.development': 'ini',
  '.env.production': 'ini',
  '.env.test': 'ini',
  '.editorconfig': 'ini',
  '.prettierrc': 'json',
  '.eslintrc': 'json',
  '.babelrc': 'json',
  'tsconfig.json': 'json',
  'jsconfig.json': 'json',
  'package.json': 'json',
  'package-lock.json': 'json',
  'yarn.lock': 'yaml',
  'pnpm-lock.yaml': 'yaml',
  'Cargo.toml': 'toml',
  'Cargo.lock': 'toml',
  'go.mod': 'go',
  'go.sum': 'plaintext',
};

/**
 * Get Monaco language ID from file path
 */
export function getLanguageFromPath(filePath: string): string {
  const fileName = filePath.split(/[/\\]/).pop() || '';
  
  // Check filename first (for special files)
  if (FILENAME_TO_LANGUAGE[fileName]) {
    return FILENAME_TO_LANGUAGE[fileName];
  }
  
  // Get extension
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1) {
    return 'plaintext';
  }
  
  const extension = fileName.slice(lastDot + 1).toLowerCase();
  return EXTENSION_TO_LANGUAGE[extension] || 'plaintext';
}

/**
 * Get file extension from path
 */
export function getExtension(filePath: string): string {
  const fileName = filePath.split(/[/\\]/).pop() || '';
  const lastDot = fileName.lastIndexOf('.');
  return lastDot > 0 ? fileName.slice(lastDot + 1).toLowerCase() : '';
}

/**
 * Get file name from path
 */
export function getFileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath;
}

/**
 * Check if file is a text file (editable)
 */
export function isTextFile(filePath: string): boolean {
  const extension = getExtension(filePath);
  const binaryExtensions = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'svg',
    'mp3', 'mp4', 'wav', 'ogg', 'webm', 'avi', 'mov',
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'zip', 'tar', 'gz', 'rar', '7z',
    'exe', 'dll', 'so', 'dylib',
    'woff', 'woff2', 'ttf', 'otf', 'eot',
  ]);
  return !binaryExtensions.has(extension);
}

/**
 * Get language display name
 */
export function getLanguageDisplayName(languageId: string): string {
  const displayNames: Record<string, string> = {
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    html: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    less: 'Less',
    json: 'JSON',
    yaml: 'YAML',
    xml: 'XML',
    markdown: 'Markdown',
    python: 'Python',
    rust: 'Rust',
    go: 'Go',
    java: 'Java',
    kotlin: 'Kotlin',
    c: 'C',
    cpp: 'C++',
    csharp: 'C#',
    php: 'PHP',
    ruby: 'Ruby',
    shell: 'Shell',
    powershell: 'PowerShell',
    bat: 'Batch',
    sql: 'SQL',
    graphql: 'GraphQL',
    dockerfile: 'Dockerfile',
    plaintext: 'Plain Text',
    ini: 'INI',
    toml: 'TOML',
    ignore: 'Ignore',
    log: 'Log',
    diff: 'Diff',
  };
  return displayNames[languageId] || languageId;
}
