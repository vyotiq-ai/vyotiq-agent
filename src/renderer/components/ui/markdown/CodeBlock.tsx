import React, { memo, useCallback, useState, useMemo } from 'react';
import { Check, ChevronDown, ChevronUp, Copy, FileCode, Play } from 'lucide-react';
import { cn } from '../../../utils/cn';

export interface CodeBlockProps {
  code: string;
  language: string;
  onRun?: (code: string, language: string) => void;
  onInsert?: (code: string, language: string) => void;
  /** Max lines before collapsing (0 = never collapse) */
  collapseThreshold?: number;
}

// Language display names and colors - Enhanced with more languages
const LANGUAGE_INFO: Record<string, { name: string; color: string; icon?: string }> = {
  typescript: { name: 'TypeScript', color: 'text-[#3178c6]', icon: 'TS' },
  ts: { name: 'TypeScript', color: 'text-[#3178c6]', icon: 'TS' },
  tsx: { name: 'TSX', color: 'text-[#3178c6]', icon: 'TSX' },
  javascript: { name: 'JavaScript', color: 'text-[#f7df1e]', icon: 'JS' },
  js: { name: 'JavaScript', color: 'text-[#f7df1e]', icon: 'JS' },
  jsx: { name: 'JSX', color: 'text-[#61dafb]', icon: 'JSX' },
  python: { name: 'Python', color: 'text-[#3776ab]', icon: 'PY' },
  py: { name: 'Python', color: 'text-[#3776ab]', icon: 'PY' },
  rust: { name: 'Rust', color: 'text-[#dea584]', icon: 'RS' },
  rs: { name: 'Rust', color: 'text-[#dea584]', icon: 'RS' },
  go: { name: 'Go', color: 'text-[#00add8]', icon: 'GO' },
  java: { name: 'Java', color: 'text-[#b07219]', icon: 'JAVA' },
  cpp: { name: 'C++', color: 'text-[#f34b7d]', icon: 'C++' },
  c: { name: 'C', color: 'text-[#555555]', icon: 'C' },
  csharp: { name: 'C#', color: 'text-[#178600]', icon: 'C#' },
  cs: { name: 'C#', color: 'text-[#178600]', icon: 'C#' },
  ruby: { name: 'Ruby', color: 'text-[#701516]', icon: 'RB' },
  rb: { name: 'Ruby', color: 'text-[#701516]', icon: 'RB' },
  php: { name: 'PHP', color: 'text-[#4f5d95]', icon: 'PHP' },
  swift: { name: 'Swift', color: 'text-[#ffac45]', icon: 'SWIFT' },
  kotlin: { name: 'Kotlin', color: 'text-[#a97bff]', icon: 'KT' },
  html: { name: 'HTML', color: 'text-[#e34c26]', icon: 'HTML' },
  css: { name: 'CSS', color: 'text-[#563d7c]', icon: 'CSS' },
  scss: { name: 'SCSS', color: 'text-[#c6538c]', icon: 'SCSS' },
  sass: { name: 'Sass', color: 'text-[#c6538c]', icon: 'SASS' },
  json: { name: 'JSON', color: 'text-[var(--color-warning)]', icon: 'JSON' },
  yaml: { name: 'YAML', color: 'text-[#cb171e]', icon: 'YAML' },
  yml: { name: 'YAML', color: 'text-[#cb171e]', icon: 'YAML' },
  toml: { name: 'TOML', color: 'text-[#9c4221]', icon: 'TOML' },
  xml: { name: 'XML', color: 'text-[#0060ac]', icon: 'XML' },
  markdown: { name: 'Markdown', color: 'text-[var(--color-text-muted)]', icon: 'MD' },
  md: { name: 'Markdown', color: 'text-[var(--color-text-muted)]', icon: 'MD' },
  sql: { name: 'SQL', color: 'text-[#e38c00]', icon: 'SQL' },
  bash: { name: 'Bash', color: 'text-[#89e051]', icon: 'BASH' },
  sh: { name: 'Shell', color: 'text-[#89e051]', icon: 'SH' },
  shell: { name: 'Shell', color: 'text-[#89e051]', icon: 'SH' },
  zsh: { name: 'Zsh', color: 'text-[#89e051]', icon: 'ZSH' },
  fish: { name: 'Fish', color: 'text-[#89e051]', icon: 'FISH' },
  powershell: { name: 'PowerShell', color: 'text-[#012456]', icon: 'PS1' },
  ps1: { name: 'PowerShell', color: 'text-[#012456]', icon: 'PS1' },
  cmd: { name: 'CMD', color: 'text-[var(--color-text-muted)]', icon: 'CMD' },
  dockerfile: { name: 'Dockerfile', color: 'text-[#384d54]', icon: 'DOCKER' },
  docker: { name: 'Docker', color: 'text-[#384d54]', icon: 'DOCKER' },
  graphql: { name: 'GraphQL', color: 'text-[#e10098]', icon: 'GQL' },
  ini: { name: 'INI', color: 'text-[var(--color-text-muted)]', icon: 'INI' },
  patch: { name: 'Patch', color: 'text-[var(--color-success)]', icon: 'PATCH' },
  log: { name: 'Log', color: 'text-[var(--color-text-muted)]', icon: 'LOG' },
  text: { name: 'Text', color: 'text-[var(--color-text-muted)]', icon: 'TXT' },
  plaintext: { name: 'Text', color: 'text-[var(--color-text-muted)]', icon: 'TXT' },
};

export const CodeBlock: React.FC<CodeBlockProps> = memo(({ 
  code, 
  language, 
  onRun, 
  onInsert,
  collapseThreshold = 30,
}) => {
  const [copied, setCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);

  const lineCount = useMemo(() => code.split('\n').length, [code]);
  const shouldCollapse = collapseThreshold > 0 && lineCount > collapseThreshold;
  const displayCode = shouldCollapse && isCollapsed 
    ? code.split('\n').slice(0, collapseThreshold).join('\n') + '\n...'
    : code;

  const langInfo = LANGUAGE_INFO[language.toLowerCase()] || { name: language || 'code', color: 'text-[var(--color-text-muted)]' };

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const handleRun = useCallback(() => {
    onRun?.(code, language);
  }, [code, language, onRun]);

  const handleInsert = useCallback(() => {
    onInsert?.(code, language);
  }, [code, language, onInsert]);

  const isRunnable = ['bash', 'sh', 'shell', 'zsh', 'cmd', 'powershell', 'ps1'].includes(language.toLowerCase());

  return (
    <div className="relative group my-3 rounded-lg overflow-hidden border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--color-surface-header)] border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {langInfo.icon && (
              <span className={cn(
                'text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-md border',
                langInfo.color, 
                'bg-current/10 border-current/20'
              )}>
                {langInfo.icon}
              </span>
            )}
            <span className={cn('text-[10px] font-mono font-semibold', langInfo.color)}>
              {langInfo.name}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[9px] text-[var(--color-text-dim)]">
            <span>{lineCount} line{lineCount !== 1 ? 's' : ''}</span>
            {shouldCollapse && (
              <span className="opacity-60">
                {isCollapsed ? `(showing ${collapseThreshold})` : '(full)'}
              </span>
            )}
          </div>
        </div>
        
        {/* Always visible copy button + hover actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            aria-label="Copy code"
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 rounded text-[10px]',
              'bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-primary)]/10',
              'text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)]',
              'transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40',
            )}
            title="Copy code (click)"
          >
            {copied ? (
              <>
                <Check size={12} className="text-[var(--color-success)]" />
                <span className="text-[var(--color-success)]">Copied!</span>
              </>
            ) : (
              <>
                <Copy size={12} />
                <span>Copy</span>
              </>
            )}
          </button>

          {isRunnable && onRun && (
            <button
              onClick={handleRun}
              aria-label="Run in terminal"
              className={cn(
                'p-1 rounded opacity-0 group-hover:opacity-100',
                'hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)]',
                'transition-all',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40',
              )}
              title="Run in terminal"
            >
              <Play size={12} />
            </button>
          )}

          {onInsert && (
            <button
              onClick={handleInsert}
              aria-label="Insert into file"
              className={cn(
                'p-1 rounded opacity-0 group-hover:opacity-100',
                'hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-info)]',
                'transition-all',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40',
              )}
              title="Insert into file"
            >
              <FileCode size={12} />
            </button>
          )}
        </div>
      </div>

      <pre className="p-3 overflow-x-auto text-[11px] leading-relaxed font-mono">
        <code className={cn('text-[var(--color-text-primary)]', language ? `language-${language}` : undefined)}>
          {displayCode}
        </code>
      </pre>

      {/* Collapse/Expand button */}
      {shouldCollapse && (
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(
            'w-full py-1.5 flex items-center justify-center gap-1',
            'bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-header)]',
            'text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
            'border-t border-[var(--color-border-subtle)] transition-colors'
          )}
        >
          {isCollapsed ? (
            <>
              <ChevronDown size={12} />
              Show all {lineCount} lines
            </>
          ) : (
            <>
              <ChevronUp size={12} />
              Collapse
            </>
          )}
        </button>
      )}
    </div>
  );
});

CodeBlock.displayName = 'CodeBlock';
