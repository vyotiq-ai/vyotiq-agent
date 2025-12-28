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

// Language display names and colors
const LANGUAGE_INFO: Record<string, { name: string; color: string }> = {
  typescript: { name: 'TypeScript', color: 'text-[#3178c6]' },
  ts: { name: 'TypeScript', color: 'text-[#3178c6]' },
  tsx: { name: 'TSX', color: 'text-[#3178c6]' },
  javascript: { name: 'JavaScript', color: 'text-[#f7df1e]' },
  js: { name: 'JavaScript', color: 'text-[#f7df1e]' },
  jsx: { name: 'JSX', color: 'text-[#61dafb]' },
  python: { name: 'Python', color: 'text-[#3776ab]' },
  py: { name: 'Python', color: 'text-[#3776ab]' },
  rust: { name: 'Rust', color: 'text-[#dea584]' },
  rs: { name: 'Rust', color: 'text-[#dea584]' },
  go: { name: 'Go', color: 'text-[#00add8]' },
  java: { name: 'Java', color: 'text-[#b07219]' },
  cpp: { name: 'C++', color: 'text-[#f34b7d]' },
  c: { name: 'C', color: 'text-[#555555]' },
  csharp: { name: 'C#', color: 'text-[#178600]' },
  cs: { name: 'C#', color: 'text-[#178600]' },
  ruby: { name: 'Ruby', color: 'text-[#701516]' },
  rb: { name: 'Ruby', color: 'text-[#701516]' },
  php: { name: 'PHP', color: 'text-[#4f5d95]' },
  swift: { name: 'Swift', color: 'text-[#ffac45]' },
  kotlin: { name: 'Kotlin', color: 'text-[#a97bff]' },
  html: { name: 'HTML', color: 'text-[#e34c26]' },
  css: { name: 'CSS', color: 'text-[#563d7c]' },
  scss: { name: 'SCSS', color: 'text-[#c6538c]' },
  json: { name: 'JSON', color: 'text-[var(--color-warning)]' },
  yaml: { name: 'YAML', color: 'text-[#cb171e]' },
  yml: { name: 'YAML', color: 'text-[#cb171e]' },
  markdown: { name: 'Markdown', color: 'text-[var(--color-text-muted)]' },
  md: { name: 'Markdown', color: 'text-[var(--color-text-muted)]' },
  sql: { name: 'SQL', color: 'text-[#e38c00]' },
  bash: { name: 'Bash', color: 'text-[#89e051]' },
  sh: { name: 'Shell', color: 'text-[#89e051]' },
  shell: { name: 'Shell', color: 'text-[#89e051]' },
  powershell: { name: 'PowerShell', color: 'text-[#012456]' },
  ps1: { name: 'PowerShell', color: 'text-[#012456]' },
  cmd: { name: 'CMD', color: 'text-[var(--color-text-muted)]' },
  dockerfile: { name: 'Dockerfile', color: 'text-[#384d54]' },
  docker: { name: 'Docker', color: 'text-[#384d54]' },
  graphql: { name: 'GraphQL', color: 'text-[#e10098]' },
  xml: { name: 'XML', color: 'text-[#0060ac]' },
  toml: { name: 'TOML', color: 'text-[#9c4221]' },
  ini: { name: 'INI', color: 'text-[var(--color-text-muted)]' },
  diff: { name: 'Diff', color: 'text-[var(--color-success)]' },
  text: { name: 'Text', color: 'text-[var(--color-text-muted)]' },
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
    <div className="relative group my-2 rounded-md overflow-hidden border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--color-surface-header)] border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] font-mono font-medium', langInfo.color)}>
            {langInfo.name}
          </span>
          <span className="text-[9px] text-[var(--color-text-dim)]">
            {lineCount} line{lineCount !== 1 ? 's' : ''}
          </span>
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
