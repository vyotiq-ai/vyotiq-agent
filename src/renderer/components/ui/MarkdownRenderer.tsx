/**
 * Markdown Renderer Component
 *
 * Uses `react-markdown` + remark/rehype plugins for:
 * - GFM (tables, task lists, strikethrough)
 * - Math (KaTeX)
 * - Syntax highlighting (highlight.js via rehype-highlight)
 *
 * Features:
 * - Code blocks with copy, run, and insert actions
 * - Styled tables, blockquotes, lists
 * - Task list checkboxes
 * - Link previews with external indicator
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
  /** Whether to enable interactive features like code actions */
  interactive?: boolean;
}


export const MarkdownRenderer: React.FC<MarkdownRendererProps> = memo(({ 
  content, 
  compact = false, 
  className,
  onRunCode,
  onInsertCode,
  interactive = true,
}) => {
  const plugins = useMemo(
    () => ({
      remarkPlugins: [remarkGfm, remarkMath],
      rehypePlugins: [rehypeKatex, rehypeHighlight],
    }),
    [],
  );

  const components = useMemo(
    () => ({
      // Enhanced links with external indicator
      a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
        const isExternal = href?.startsWith('http') || href?.startsWith('//');
        return (
          <a
            href={href}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noopener noreferrer' : undefined}
            className={cn(
              'text-[var(--color-accent-primary)] hover:text-[var(--color-accent-hover)]',
              'underline decoration-[var(--color-accent-primary)]/30 hover:decoration-[var(--color-accent-primary)]',
              'transition-colors inline-flex items-center gap-0.5'
            )}
          >
            {children}
            {isExternal && <ExternalLink size={10} className="opacity-50" />}
          </a>
        );
      },

      // Enhanced blockquotes with callout support
      blockquote: ({ children }: { children?: React.ReactNode }) => {
        const callout = parseCallout(children);
        if (callout) {
          return <Callout type={callout.type}>{callout.content}</Callout>;
        }

        return <DefaultBlockquote>{children}</DefaultBlockquote>;
      },

      // Styled tables
      table: ({ children }: { children?: React.ReactNode }) => (
        <div className="my-3 overflow-x-auto rounded-lg border border-[var(--color-border-subtle)]">
          <table className="w-full text-[11px]">
            {children}
          </table>
        </div>
      ),

      thead: ({ children }: { children?: React.ReactNode }) => (
        <thead className="bg-[var(--color-surface-2)] text-[var(--color-text-primary)]">
          {children}
        </thead>
      ),

      th: ({ children }: { children?: React.ReactNode }) => (
        <th className="px-3 py-2 text-left font-semibold border-b border-[var(--color-border-subtle)]">
          {children}
        </th>
      ),

      td: ({ children }: { children?: React.ReactNode }) => (
        <td className="px-3 py-2 border-b border-[var(--color-border-subtle)]/50">
          {children}
        </td>
      ),

      tr: ({ children }: { children?: React.ReactNode }) => (
        <tr className="hover:bg-[var(--color-surface-1)]/50 transition-colors">
          {children}
        </tr>
      ),

      // Enhanced lists
      ul: ({ children }: { children?: React.ReactNode }) => (
        <ul className="my-2 ml-4 space-y-1 list-none">
          {children}
        </ul>
      ),

      ol: ({ children }: { children?: React.ReactNode }) => (
        <ol className="my-2 ml-4 space-y-1 list-decimal list-inside">
          {children}
        </ol>
      ),

      li: ({ children, className: liClassName }: { children?: React.ReactNode; className?: string }) => {
        // Check if this is a task list item
        const isTaskList = liClassName?.includes('task-list-item');
        
        return (
          <li className={cn(
            'relative pl-4',
            !isTaskList && "before:content-['•'] before:absolute before:left-0 before:text-[var(--color-accent-primary)] before:font-bold",
            isTaskList && 'list-none pl-0'
          )}>
            {children}
          </li>
        );
      },

      // Task list checkbox styling
      input: ({ type, checked, disabled }: { type?: string; checked?: boolean; disabled?: boolean }) => {
        if (type === 'checkbox') {
          return (
            <span className={cn(
              'inline-flex items-center justify-center w-4 h-4 mr-2 rounded',
              'border border-[var(--color-border-default)]',
              checked 
                ? 'bg-[var(--color-accent-primary)] border-[var(--color-accent-primary)]' 
                : 'bg-[var(--color-surface-1)]',
              disabled && 'cursor-default'
            )}>
              {checked && <Check size={10} className="text-[var(--color-text-on-accent)]" />}
            </span>
          );
        }
        return null;
      },

      // Enhanced headings
      h1: ({ children }: { children?: React.ReactNode }) => (
        <h1 className="text-[1.4em] font-bold text-[var(--color-text-primary)] mt-4 mb-2 pb-1 border-b border-[var(--color-border-subtle)]">
          {children}
        </h1>
      ),

      h2: ({ children }: { children?: React.ReactNode }) => (
        <h2 className="text-[1.25em] font-semibold text-[var(--color-text-primary)] mt-3 mb-2">
          {children}
        </h2>
      ),

      h3: ({ children }: { children?: React.ReactNode }) => (
        <h3 className="text-[1.1em] font-semibold text-[var(--color-text-primary)] mt-3 mb-1">
          {children}
        </h3>
      ),

      h4: ({ children }: { children?: React.ReactNode }) => (
        <h4 className="text-[1em] font-semibold text-[var(--color-text-primary)] mt-2 mb-1">
          {children}
        </h4>
      ),

      // Horizontal rule
      hr: () => (
        <hr className="my-4 border-none h-px bg-gradient-to-r from-transparent via-[var(--color-border-default)] to-transparent" />
      ),

      // Paragraphs with proper spacing
      p: ({ children }: { children?: React.ReactNode }) => (
        <p className="my-2 leading-relaxed">
          {children}
        </p>
      ),

      // Block code lives under <pre><code/></pre>. Render it here so we never
      // accidentally place block-level wrappers inside a <p>.
      pre: ({ children }: { children?: React.ReactNode }) => {
        const childArray = React.Children.toArray(children);
        const codeChild = childArray.find(
          (child) => React.isValidElement(child) && (child as { type?: unknown }).type === 'code',
        ) as React.ReactElement<{ className?: string; children?: React.ReactNode }> | undefined;

        if (!codeChild) {
          return (
            <pre className="my-2 overflow-x-auto rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-3 text-[11px] leading-relaxed font-mono">
              {children}
            </pre>
          );
        }

        const codeClassName = codeChild.props.className;
        const raw = extractPlainText(codeChild.props.children);

        // className is usually like: "language-ts"
        const languageMatch = /language-([^\s]+)/.exec(codeClassName ?? '');
        const language = languageMatch?.[1] ?? 'text';

        // react-markdown gives trailing newline sometimes; normalize
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

      // Strong/bold text
      strong: ({ children }: { children?: React.ReactNode }) => (
        <strong className="font-semibold text-[var(--color-text-primary)]">
          {children}
        </strong>
      ),

      // Emphasis/italic text
      em: ({ children }: { children?: React.ReactNode }) => (
        <em className="italic text-[var(--color-text-secondary)]">
          {children}
        </em>
      ),

      // Strikethrough
      del: ({ children }: { children?: React.ReactNode }) => (
        <del className="line-through text-[var(--color-text-muted)]">
          {children}
        </del>
      ),

      // Code blocks with actions + inline code styling + interactive components
      code: ({
        inline,
        className: codeClassName,
        children,
      }: {
        inline?: boolean;
        className?: string;
        children?: React.ReactNode;
      }) => {
        const raw = extractPlainText(children);
        const isInline = inline ?? (!/language-/.test(codeClassName ?? '') && !raw.includes('\n'));

        if (isInline) {
          return (
            <code className={cn(
              'px-1.5 py-0.5 rounded text-[0.9em]',
              'bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]',
              'text-[var(--color-accent-secondary)] font-mono',
              codeClassName
            )}>
              {children}
            </code>
          );
        }

        // For fenced blocks, keep this a plain <code> and let the `pre` renderer
        // handle the block wrapper/actions to avoid invalid DOM nesting.
        return <code className={codeClassName}>{children}</code>;
      },

      // Images with styling
      img: ({ src, alt }: { src?: string; alt?: string }) => (
        <span className="block my-3">
          <img
            src={src}
            alt={alt}
            className="max-w-full h-auto rounded-lg border border-[var(--color-border-subtle)]"
            loading="lazy"
          />
          {alt && (
            <span className="block mt-1 text-[10px] text-[var(--color-text-muted)] text-center italic">
              {alt}
            </span>
          )}
        </span>
      ),
    }),
    [interactive, onInsertCode, onRunCode],
  );
  
  return (
    <div className={cn(
      'markdown-content min-w-0 max-w-full overflow-hidden',
      'text-[var(--color-text-primary)] leading-relaxed break-words',
      compact ? 'text-[10px]' : 'text-[12px]',
      className
    )}>
      <ReactMarkdown
        remarkPlugins={plugins.remarkPlugins}
        rehypePlugins={plugins.rehypePlugins}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

MarkdownRenderer.displayName = 'MarkdownRenderer';

export default MarkdownRenderer;
