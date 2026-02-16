/**
 * Editor Breadcrumb Component
 * 
 * Shows the file path as navigable breadcrumb segments,
 * similar to VS Code's breadcrumb bar.
 */

import React, { memo, useMemo } from 'react';
import { ChevronRight, FileText, Folder } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { getMonacoLanguage } from '../monaco/monacoSetup';

interface EditorBreadcrumbProps {
  filePath: string;
  language: string;
}

export const EditorBreadcrumb: React.FC<EditorBreadcrumbProps> = memo(({ filePath, language }) => {
  const segments = useMemo(() => {
    // Normalize path separators
    const normalized = filePath.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    return parts;
  }, [filePath]);

  if (segments.length === 0) return null;

  return (
    <div className={cn(
      'flex items-center gap-0 px-3 py-1 min-h-[22px]',
      'bg-[var(--color-surface-1)]/50 border-b border-[var(--color-border-subtle)]/20',
      'overflow-x-auto scrollbar-none'
    )}>
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        return (
          <React.Fragment key={index}>
            <span
              className={cn(
                'flex items-center gap-1 text-[9px] font-mono shrink-0',
                'transition-colors duration-75',
                isLast
                  ? 'text-[var(--color-text-secondary)]'
                  : 'text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] cursor-pointer'
              )}
              title={segments.slice(0, index + 1).join('/')}
            >
              {isLast ? (
                <FileText size={10} className="opacity-50" />
              ) : (
                <Folder size={10} className="opacity-40" />
              )}
              <span className={cn(isLast && 'font-medium')}>{segment}</span>
            </span>
            {!isLast && (
              <ChevronRight
                size={10}
                className="mx-0.5 text-[var(--color-text-dim)] opacity-30 shrink-0"
              />
            )}
          </React.Fragment>
        );
      })}
      <span className="ml-2 text-[9px] font-mono text-[var(--color-text-dim)] opacity-50 shrink-0">
        {language}
      </span>
    </div>
  );
});

EditorBreadcrumb.displayName = 'EditorBreadcrumb';
