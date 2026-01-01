/**
 * Markdown Renderer Component
 * Enhanced terminal-style markdown rendering with improved visual hierarchy
 */
import React, { memo, useMemo } from 'react';
import { Check, ExternalLink, Terminal } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { cn } from '../../utils/cn';
import { CodeBlock } from './markdown/CodeBlock';
import { Callout, DefaultBlockquote, parseCallout, extractPlainText } from './markdown/Callout';

interface MarkdownRendererProps {
  content: string;
  compact?: boolean;
  className?: string;
  onRunCode?: (code: string, language: string) => void;
  onInsertCode?: (code: string, language: string) => void;
  interactive?: boolean;
  messageType?: 'user' | 'assistant';
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = memo(({
  content,
  compact = false,
  className,
  onRunCode,
  onInsertCode,
  interactive = true,
  messageType = 'assistant',
}) => {
  const plugins = useMemo(() => ({
    remarkPlugins: [remarkGfm, remarkMath],
    rehypePlugins: [rehypeKatex, rehypeHighlight],
  }), []);

  // Define text colors based on message type
  const textColors = useMemo(() => ({
    primary: messageType === 'user' ? 'text-white' : 'text-[var(--color-text-primary)]',
    secondary: messageType === 'user' ? 'text-gray-100' : 'text-[var(--color-text-secondary)]',
    muted: messageType === 'user' ? 'text-gray-300' : 'text-[var(--color-text-muted)]',
  }), [messageType]);

  const components = useMemo(() => ({
    // Links - Enhanced with better visual indicators
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
      const isExternal = href?.startsWith('http') || href?.startsWith('//');
      return (
        <a
          href={href}
          target={isExternal ? '_blank' : undefined}
          rel={isExternal ? 'noopener noreferrer' : undefined}
          className={cn(
            'text-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary)]/80',
            'underline decoration-dotted underline-offset-2 decoration-1',
            'hover:decoration-solid transition-all duration-200',
            'inline-flex items-center gap-1 font-medium'
          )}
        >
          {children}
          {isExternal && (
            <ExternalLink size={10} className="opacity-60 hover:opacity-100 transition-opacity" />
          )}
        </a>
      );
    },

    // Blockquotes with callout support
    blockquote: ({ children }: { children?: React.ReactNode }) => {
      const callout = parseCallout(children);
      if (callout) return <Callout type={callout.type}>{callout.content}</Callout>;
      return <DefaultBlockquote>{children}</DefaultBlockquote>;
    },

    // Tables - Enhanced terminal-style formatting with better visual hierarchy
    table: ({ children }: { children?: React.ReactNode }) => (
      <div className={cn(
        'my-4 overflow-x-auto rounded-lg border border-[var(--color-border-subtle)]',
        'bg-[var(--color-surface-1)] shadow-sm'
      )}>
        <table className="w-full text-[11px] border-collapse font-mono">{children}</table>
      </div>
    ),
    thead: ({ children }: { children?: React.ReactNode }) => (
      <thead className={cn(
        'bg-[var(--color-surface-2)]',
        'border-b-2 border-[var(--color-accent-primary)]/20'
      )}>{children}</thead>
    ),
    th: ({ children }: { children?: React.ReactNode }) => (
      <th className={cn(
        'px-4 py-3 text-left font-bold text-[var(--color-text-primary)]',
        'border-r border-[var(--color-border-subtle)]/30 last:border-r-0',
        'bg-gradient-to-b from-[var(--color-surface-2)] to-[var(--color-surface-1)]'
      )}>
        <div className="flex items-center gap-2">
          <Terminal size={10} className="text-[var(--color-accent-primary)] opacity-60" />
          <span>{children}</span>
        </div>
      </th>
    ),
    td: ({ children }: { children?: React.ReactNode }) => (
      <td className={cn(
        'px-4 py-2.5 border-b border-[var(--color-border-subtle)]/20',
        'border-r border-[var(--color-border-subtle)]/30 last:border-r-0',
        'text-[var(--color-text-secondary)]'
      )}>
        {children}
      </td>
    ),
    tr: ({ children }: { children?: React.ReactNode }) => (
      <tr className={cn(
        'hover:bg-[var(--color-surface-2)]/40 transition-colors duration-200',
        'border-b border-[var(--color-border-subtle)]/10 last:border-b-0'
      )}>{children}</tr>
    ),

    // Lists - Enhanced terminal-style formatting with better spacing
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="my-3 ml-0 space-y-1.5 list-none">{children}</ul>
    ),
    ol: ({ children, start }: { children?: React.ReactNode; start?: number }) => (
      <ol className="my-3 ml-0 space-y-1.5 list-none" start={start}>{children}</ol>
    ),
    li: ({ children, className: liClassName, ...props }: { children?: React.ReactNode; className?: string; node?: { tagName?: string; parent?: { tagName?: string } } }) => {
      const isTaskList = liClassName?.includes('task-list-item');
      const isOrdered = props.node?.tagName === 'li' && props.node?.parent?.tagName === 'ol';
      
      if (isTaskList) {
        return (
          <li className={`list-none flex items-start gap-2.5 ${textColors.secondary} leading-relaxed ml-0 py-0.5`}>
            {children}
          </li>
        );
      }
      
      return (
        <li className={cn(
          `${textColors.secondary} leading-relaxed flex items-start gap-2.5 list-none ml-0 py-0.5`,
          `hover:${textColors.primary} transition-colors duration-200`
        )} style={{ listStyle: 'none' }}>
          <span className={cn(
            'font-mono text-sm mt-0.5 flex-shrink-0 w-4 text-center',
            'text-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary)]/80 transition-colors'
          )}>
            {isOrdered ? '→' : '•'}
          </span>
          <span className="min-w-0 flex-1">{children}</span>
        </li>
      );
    },

    // Task list checkbox - Enhanced styling
    input: ({ type, checked }: { type?: string; checked?: boolean }) => {
      if (type !== 'checkbox') return null;
      return (
        <span className={cn(
          'inline-flex items-center justify-center w-4 h-4 mr-2 rounded border-2 transition-all duration-200',
          checked 
            ? 'bg-[var(--color-accent-primary)] border-[var(--color-accent-primary)] shadow-sm' 
            : 'bg-transparent border-[var(--color-border-default)] hover:border-[var(--color-accent-primary)]/50'
        )}>
          {checked && <Check size={10} className="text-[var(--color-surface-base)] font-bold" />}
        </span>
      );
    },

    // Headings - Enhanced visual hierarchy with terminal-style prefixes and dynamic colors
    h1: ({ children }: { children?: React.ReactNode }) => (
      <h1 className={cn(
        `text-lg font-bold ${textColors.primary} mt-6 mb-3 pb-2`,
        'border-b-2 border-[var(--color-accent-primary)]/30',
        'flex items-center gap-2 group'
      )}>
        <span className="text-[var(--color-accent-primary)] font-mono text-base group-hover:text-[var(--color-accent-primary)]/80 transition-colors">
          #
        </span>
        <span className="flex-1">{children}</span>
      </h1>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
      <h2 className={cn(
        `text-base font-bold ${textColors.primary} mt-5 mb-2`,
        'flex items-center gap-2 group'
      )}>
        <span className="text-[var(--color-accent-primary)] font-mono text-sm group-hover:text-[var(--color-accent-primary)]/80 transition-colors">
          ##
        </span>
        <span className="flex-1">{children}</span>
      </h2>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <h3 className={cn(
        `text-sm font-semibold ${textColors.primary} mt-4 mb-2`,
        'flex items-center gap-2 group'
      )}>
        <span className="text-[var(--color-accent-primary)] font-mono text-xs group-hover:text-[var(--color-accent-primary)]/80 transition-colors">
          ###
        </span>
        <span className="flex-1">{children}</span>
      </h3>
    ),
    h4: ({ children }: { children?: React.ReactNode }) => (
      <h4 className={cn(
        `text-sm font-medium ${textColors.primary} mt-3 mb-1`,
        'flex items-center gap-1.5 group'
      )}>
        <span className="text-[var(--color-accent-primary)] font-mono text-xs group-hover:text-[var(--color-accent-primary)]/80 transition-colors">
          ####
        </span>
        <span className="flex-1">{children}</span>
      </h4>
    ),
    h5: ({ children }: { children?: React.ReactNode }) => (
      <h5 className={cn(
        `text-xs font-medium ${textColors.secondary} mt-3 mb-1`,
        'flex items-center gap-1.5 group'
      )}>
        <span className="text-[var(--color-accent-primary)] font-mono text-xs group-hover:text-[var(--color-accent-primary)]/80 transition-colors">
          #####
        </span>
        <span className="flex-1">{children}</span>
      </h5>
    ),
    h6: ({ children }: { children?: React.ReactNode }) => (
      <h6 className={cn(
        `text-xs font-medium ${textColors.muted} mt-2 mb-1`,
        'flex items-center gap-1.5 group'
      )}>
        <span className="text-[var(--color-accent-primary)] font-mono text-xs group-hover:text-[var(--color-accent-primary)]/80 transition-colors">
          ######
        </span>
        <span className="flex-1">{children}</span>
      </h6>
    ),

    // Other elements - Enhanced styling with dynamic colors
    hr: () => (
      <hr className={cn(
        'my-6 border-0 h-px bg-gradient-to-r',
        'from-transparent via-[var(--color-border-subtle)] to-transparent'
      )} />
    ),
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className={`my-2.5 ${textColors.secondary} leading-relaxed`}>{children}</p>
    ),
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong className={`font-bold ${textColors.primary}`}>{children}</strong>
    ),
    em: ({ children }: { children?: React.ReactNode }) => (
      <em className={`italic ${textColors.primary}`}>{children}</em>
    ),
    del: ({ children }: { children?: React.ReactNode }) => (
      <del className={`line-through opacity-70 ${textColors.muted}`}>{children}</del>
    ),

    // Images - Enhanced with better presentation
    img: ({ src, alt }: { src?: string; alt?: string }) => (
      <div className="block my-4 group">
        <div className={cn(
          'relative overflow-hidden rounded-lg border border-[var(--color-border-subtle)]',
          'bg-[var(--color-surface-1)] shadow-sm hover:shadow-md transition-shadow duration-200'
        )}>
          <img 
            src={src} 
            alt={alt} 
            className="max-w-full h-auto block" 
            loading="lazy" 
          />
          {alt && (
            <div className={cn(
              'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent',
              'p-2 text-white text-[10px] font-mono opacity-0 group-hover:opacity-100 transition-opacity'
            )}>
              {alt}
            </div>
          )}
        </div>
      </div>
    ),

    // Code blocks
    pre: ({ children }: { children?: React.ReactNode }) => {
      const childArray = React.Children.toArray(children);
      const codeChild = childArray.find(
        (child) => React.isValidElement(child) && (child as { type?: unknown }).type === 'code',
      ) as React.ReactElement<{ className?: string; children?: React.ReactNode }> | undefined;

      if (!codeChild) {
        return (
          <pre className="my-2 p-3 overflow-x-auto rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] text-[11px] font-mono">
            {children}
          </pre>
        );
      }

      const codeClassName = codeChild.props.className;
      const raw = extractPlainText(codeChild.props.children);
      const languageMatch = /language-([^\s]+)/.exec(codeClassName ?? '');
      const language = languageMatch?.[1] ?? 'text';
      const code = raw.replace(/\n$/, '');

      return (
        <CodeBlock
          code={code}
          language={language}
          onRun={interactive ? onRunCode : undefined}
          onInsert={interactive ? onInsertCode : undefined}
        />
      );
    },

    // Inline code - Enhanced terminal-style with better visual indicators
    code: ({ inline, className: codeClassName, children }: { inline?: boolean; className?: string; children?: React.ReactNode }) => {
      const raw = extractPlainText(children);
      const isInline = inline ?? (!/language-/.test(codeClassName ?? '') && !raw.includes('\n'));

      if (isInline) {
        return (
          <code className={cn(
            'relative px-2 py-1 mx-0.5 rounded-md text-[0.9em] font-mono',
            'bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]',
            'text-[var(--color-accent-primary)] font-medium',
            'hover:bg-[var(--color-surface-header)] transition-colors duration-200',
            'before:content-["‹"] before:absolute before:-left-1 before:top-0 before:text-[8px] before:text-[var(--color-accent-primary)]/40',
            'after:content-["›"] after:absolute after:-right-1 after:top-0 after:text-[8px] after:text-[var(--color-accent-primary)]/40'
          )}>
            {children}
          </code>
        );
      }
      return <code className={codeClassName}>{children}</code>;
    },
  }), [interactive, onRunCode, onInsertCode, textColors]);

  return (
    <div className={cn(
      'markdown-content text-left',
      compact ? 'text-[11px]' : 'text-[12px]',
      '[&_ul]:list-none [&_ol]:list-none [&_li]:list-none', // Ensure no default list styling
      className
    )}>
      <ReactMarkdown remarkPlugins={plugins.remarkPlugins} rehypePlugins={plugins.rehypePlugins} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
});

MarkdownRenderer.displayName = 'MarkdownRenderer';
export default MarkdownRenderer;
