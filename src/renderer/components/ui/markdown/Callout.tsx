import React, { memo } from 'react';
import { AlertCircle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '../../../utils/cn';

export interface CalloutProps {
  type: 'note' | 'tip' | 'warning' | 'caution' | 'important';
  children: React.ReactNode;
}

export const extractPlainText = (value: React.ReactNode): string => {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(extractPlainText).join('');
  if (React.isValidElement(value)) {
    return extractPlainText((value.props as { children?: React.ReactNode }).children);
  }
  return '';
};

export const Callout: React.FC<CalloutProps> = memo(({ type, children }) => {
  const config = {
    note: {
      icon: Info,
      bg: 'bg-[var(--color-info)]/8',
      border: 'border-l-[var(--color-info)]',
      iconColor: 'text-[var(--color-info)]',
      title: 'Note',
      prefix: 'ℹ',
    },
    tip: {
      icon: CheckCircle2,
      bg: 'bg-[var(--color-success)]/8',
      border: 'border-l-[var(--color-success)]',
      iconColor: 'text-[var(--color-success)]',
      title: 'Tip',
      prefix: '💡',
    },
    warning: {
      icon: AlertCircle,
      bg: 'bg-[var(--color-warning)]/8',
      border: 'border-l-[var(--color-warning)]',
      iconColor: 'text-[var(--color-warning)]',
      title: 'Warning',
      prefix: '⚠',
    },
    caution: {
      icon: XCircle,
      bg: 'bg-[var(--color-error)]/8',
      border: 'border-l-[var(--color-error)]',
      iconColor: 'text-[var(--color-error)]',
      title: 'Caution',
      prefix: '🚨',
    },
    important: {
      icon: AlertCircle,
      bg: 'bg-[var(--color-accent-secondary)]/8',
      border: 'border-l-[var(--color-accent-secondary)]',
      iconColor: 'text-[var(--color-accent-secondary)]',
      title: 'Important',
      prefix: '❗',
    },
  };

  const { icon: Icon, bg, border, iconColor, title, prefix } = config[type];

  return (
    <div className={cn(
      'my-4 p-4 rounded-lg border-l-4 border border-[var(--color-border-subtle)]',
      'shadow-sm hover:shadow-md transition-shadow duration-200',
      bg, border
    )}>
      <div className="flex items-start gap-3">
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-base">{prefix}</span>
          <Icon size={14} className={cn('flex-shrink-0', iconColor)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn(
            'text-[10px] font-mono font-bold uppercase tracking-wider mb-2',
            'flex items-center gap-2', iconColor
          )}>
            <span>{title}</span>
            <div className={cn('h-px flex-1 opacity-30', iconColor.replace('text-', 'bg-'))} />
          </div>
          <div className="text-[var(--color-text-secondary)] text-[11px] leading-relaxed">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
});

Callout.displayName = 'Callout';

export function parseCallout(children: React.ReactNode): { type: CalloutProps['type']; content: React.ReactNode } | null {
  if (!React.Children.count(children)) return null;

  const firstChild = React.Children.toArray(children)[0];
  if (!React.isValidElement(firstChild)) return null;

  const firstText = extractPlainText((firstChild.props as { children?: React.ReactNode }).children);
  const match = firstText.match(/^\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]\s*/i);
  if (!match) return null;

  const type = match[1].toLowerCase() as CalloutProps['type'];
  const remaining = firstText.slice(match[0].length);

  const newChildren = React.Children.map(children, (child, idx) => {
    if (idx === 0 && React.isValidElement(child)) {
      return React.cloneElement(
        child as React.ReactElement<{ children?: React.ReactNode }>,
        { children: remaining },
      );
    }
    return child;
  });

  return { type, content: newChildren };
}

export const DefaultBlockquote: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <blockquote
    className={cn(
      'my-4 pl-6 py-3 border-l-4 border-[var(--color-accent-primary)]/40',
      'text-[var(--color-text-secondary)] italic text-[11px] leading-relaxed',
      'bg-[var(--color-surface-1)]/50 rounded-r-lg relative',
      'shadow-sm hover:shadow-md transition-shadow duration-200'
    )}
  >
    <span className={cn(
      'absolute left-3 top-2 text-[var(--color-accent-primary)]/60 text-lg font-serif',
      'select-none pointer-events-none'
    )}>
      "
    </span>
    <div className="ml-2 relative">
      {children}
      <span className={cn(
        'absolute -bottom-1 right-0 text-[var(--color-accent-primary)]/60 text-lg font-serif',
        'select-none pointer-events-none'
      )}>
        "
      </span>
    </div>
  </blockquote>
);
