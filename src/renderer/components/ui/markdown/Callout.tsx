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
    },
    tip: {
      icon: CheckCircle2,
      bg: 'bg-[var(--color-success)]/8',
      border: 'border-l-[var(--color-success)]',
      iconColor: 'text-[var(--color-success)]',
      title: 'Tip',
    },
    warning: {
      icon: AlertCircle,
      bg: 'bg-[var(--color-warning)]/8',
      border: 'border-l-[var(--color-warning)]',
      iconColor: 'text-[var(--color-warning)]',
      title: 'Warning',
    },
    caution: {
      icon: XCircle,
      bg: 'bg-[var(--color-error)]/8',
      border: 'border-l-[var(--color-error)]',
      iconColor: 'text-[var(--color-error)]',
      title: 'Caution',
    },
    important: {
      icon: AlertCircle,
      bg: 'bg-[var(--color-accent-secondary)]/8',
      border: 'border-l-[var(--color-accent-secondary)]',
      iconColor: 'text-[var(--color-accent-secondary)]',
      title: 'Important',
    },
  };

  const { icon: Icon, bg, border, iconColor, title } = config[type];

  return (
    <div className={cn(
      'my-3 p-3 rounded border-l-2 border border-[var(--color-border-subtle)]/50',
      bg, border
    )}>
      <div className="flex items-start gap-2">
        <Icon size={14} className={cn('flex-shrink-0 mt-0.5', iconColor)} />
        <div className="min-w-0 flex-1">
          <div className={cn('text-[10px] font-semibold uppercase tracking-wide mb-1', iconColor)}>
            {title}
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
      'my-3 pl-4 py-2 border-l-2 border-[var(--color-accent-primary)]/40',
      'text-[var(--color-text-secondary)] italic text-[11px] leading-relaxed',
      'bg-[var(--color-surface-1)]/30 rounded-r'
    )}
  >
    {children}
  </blockquote>
);
