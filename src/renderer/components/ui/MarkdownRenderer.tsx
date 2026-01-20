/**
 * Markdown Renderer Component
 * Enhanced terminal-style markdown rendering with improved visual hierarchy
 */
import React, { memo, useMemo } from 'react';
import { Check, ExternalLink } from 'lucide-react';
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
    // Links
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
      const isExternal = href?.startsWith('http') || href?.startsWith('//');
      return (
        <a
          href={href}
          target={isExternal ? '_blank' : undefined}
          rel={isExternal ? 'noopener noreferrer' : undefined}
          className="text-[var(--color-accent-primary)] hover:underline inline-flex items-center gap-0.5"
        >
          {children}
          {isExternal && <ExternalLink size={10} className="opacity-50" />}
        </a>
      );
    },

    // Blockquotes with callout support
    blockquote: ({ children }: { children?: React.ReactNode }) => {
      const callout = parseCallout(children);
      if (callout) return <Callout type={callout.type}>{callout.content}</Callout>;
      return <DefaultBlockquote>{children}</DefaultBlockquote>;
    },

    // Tables - Clean styling
    table: ({ children }: { children?: React.ReactNode }) => (
      <div className="my-3 overflow-x-auto rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]">
        <table className="w-full text-[11px] border-collapse">{children}</table>
      </div>
    ),
    thead: ({ children }: { children?: React.ReactNode }) => (
      <thead className="bg-[var(--color-surface-2)] border-b border-[var(--color-border-subtle)]">
        {children}
      </thead>
    ),
    th: ({ children }: { children?: React.ReactNode }) => (
      <th className="px-3 py-2 text-left font-semibold text-[var(--color-text-primary)] border-r border-[var(--color-border-subtle)]/30 last:border-r-0">
        {children}
      </th>
    ),
    td: ({ children }: { children?: React.ReactNode }) => (
      <td className="px-3 py-2 text-[var(--color-text-secondary)] border-r border-[var(--color-border-subtle)]/20 last:border-r-0">
        {children}
      </td>
    ),
    tr: ({ children }: { children?: React.ReactNode }) => (
      <tr className="border-b border-[var(--color-border-subtle)]/20 last:border-b-0 hover:bg-[var(--color-surface-2)]/30">
        {children}
      </tr>
    ),

    // Lists - Enhanced terminal-style formatting with better spacing
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="my-2 ml-1 space-y-1 list-none">{children}</ul>
    ),
    ol: ({ children, start }: { children?: React.ReactNode; start?: number }) => (
      <ol className="my-2 ml-1 space-y-1 list-none" start={start}>{children}</ol>
    ),
    li: ({ children, className: liClassName, node, ...props }: { children?: React.ReactNode; className?: string; node?: { position?: unknown; parent?: { tagName?: string } }; ordered?: boolean; index?: number }) => {
      const isTaskList = liClassName?.includes('task-list-item');
      // Check if parent is ordered list via node or fallback to checking props
      const isOrdered = node?.parent?.tagName === 'ol' || (props as { ordered?: boolean }).ordered === true;
      const index = (props as { index?: number }).index;
      
      // Unwrap children if they're wrapped in a paragraph (react-markdown v10 behavior)
      const unwrappedChildren = React.Children.map(children, (child) => {
        if (React.isValidElement(child) && (child.type === 'p' || (child.props as { node?: { tagName?: string } })?.node?.tagName === 'p')) {
          return (child.props as { children?: React.ReactNode }).children;
        }
        return child;
      });
      
      if (isTaskList) {
        return (
          <li className={`list-none flex items-start gap-2 ${textColors.secondary} leading-relaxed ml-0 py-0.5`}>
            {unwrappedChildren}
          </li>
        );
      }
      
      return (
        <li className={cn(
          `${textColors.secondary} leading-relaxed flex items-start gap-2 list-none ml-0 py-0.5`
        )} style={{ listStyle: 'none' }}>
          <span className={cn(
            'font-mono text-xs flex-shrink-0 w-4',
            'text-[var(--color-accent-primary)]'
          )}>
            {isOrdered ? `${(index ?? 0) + 1}.` : '•'}
          </span>
          <span className="min-w-0 flex-1">{unwrappedChildren}</span>
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

    // Headings - Clean visual hierarchy without terminal-style prefixes
    h1: ({ children }: { children?: React.ReactNode }) => (
      <h1 className={cn(
        `text-lg font-bold ${textColors.primary} mt-5 mb-2 pb-1.5`,
        'border-b border-[var(--color-border-subtle)]/50'
      )}>
        {children}
      </h1>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
      <h2 className={`text-base font-bold ${textColors.primary} mt-4 mb-2`}>
        {children}
      </h2>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <h3 className={`text-sm font-semibold ${textColors.primary} mt-3 mb-1.5`}>
        {children}
      </h3>
    ),
    h4: ({ children }: { children?: React.ReactNode }) => (
      <h4 className={`text-sm font-medium ${textColors.primary} mt-2.5 mb-1`}>
        {children}
      </h4>
    ),
    h5: ({ children }: { children?: React.ReactNode }) => (
      <h5 className={`text-xs font-medium ${textColors.secondary} mt-2 mb-1`}>
        {children}
      </h5>
    ),
    h6: ({ children }: { children?: React.ReactNode }) => (
      <h6 className={`text-xs font-medium ${textColors.muted} mt-2 mb-1`}>
        {children}
      </h6>
    ),

    // Other elements - Clean styling with dynamic colors
    hr: () => (
      <hr className="my-4 border-0 h-px bg-[var(--color-border-subtle)]/50" />
    ),
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className={`my-2 ${textColors.secondary} leading-relaxed`}>{children}</p>
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

    // Images
    img: ({ src, alt }: { src?: string; alt?: string }) => (
      <img 
        src={src} 
        alt={alt} 
        className="my-2 max-w-full h-auto rounded border border-[var(--color-border-subtle)]" 
        loading="lazy" 
      />
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

    // Inline code - Clean styling without decorative brackets
    code: ({ inline, className: codeClassName, children }: { inline?: boolean; className?: string; children?: React.ReactNode }) => {
      const raw = extractPlainText(children);
      const isInline = inline ?? (!/language-/.test(codeClassName ?? '') && !raw.includes('\n'));

      if (isInline) {
        return (
          <code className={cn(
            'px-1.5 py-0.5 mx-0.5 rounded text-[0.9em] font-mono',
            'bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]',
            'text-[var(--color-accent-primary)]'
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
