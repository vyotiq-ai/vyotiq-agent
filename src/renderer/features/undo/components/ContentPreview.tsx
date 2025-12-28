/**
 * Content Preview Component
 * 
 * Shows a hover preview of file content for undo history items.
 */
import React, { memo, useState, useEffect } from 'react';
import { Eye } from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { FileChange } from '../types';

interface ContentPreviewProps {
  change: FileChange;
  position: { x: number; y: number };
}

function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    css: 'css',
    scss: 'scss',
    html: 'html',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
  };
  return langMap[ext] || 'text';
}

function truncateContent(content: string | null, maxLines: number = 20): string {
  if (!content) return '(empty)';
  const lines = content.split('\n');
  if (lines.length <= maxLines) return content;
  return lines.slice(0, maxLines).join('\n') + `\n... (+${lines.length - maxLines} more lines)`;
}

export const ContentPreview: React.FC<ContentPreviewProps> = memo(({ change, position }) => {
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // Adjust position to keep preview in viewport
  useEffect(() => {
    const previewWidth = 400;
    const previewHeight = 300;
    const padding = 16;

    let x = position.x + 10;
    let y = position.y;

    // Adjust horizontal position
    if (x + previewWidth > window.innerWidth - padding) {
      x = position.x - previewWidth - 10;
    }

    // Adjust vertical position
    if (y + previewHeight > window.innerHeight - padding) {
      y = window.innerHeight - previewHeight - padding;
    }
    if (y < padding) {
      y = padding;
    }

    setAdjustedPosition({ x, y });
  }, [position]);

  const language = getLanguageFromPath(change.filePath);
  const currentContent = change.status === 'undone' ? change.previousContent : change.newContent;
  const previewContent = truncateContent(currentContent);

  return (
    <div
      className={cn(
        'fixed z-50 w-[400px] max-h-[300px]',
        'bg-[var(--color-surface-base)] border border-[var(--color-border-subtle)]',
        'rounded-lg shadow-xl overflow-hidden',
        'animate-fade-in'
      )}
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-header)]">
        <Eye size={12} className="text-[var(--color-accent-primary)]" />
        <span className="text-[10px] font-medium text-[var(--color-text-primary)] truncate">
          {change.status === 'undone' ? 'Previous Content' : 'Current Content'}
        </span>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-text-muted)]">
          {language}
        </span>
      </div>

      {/* Content */}
      <div className="overflow-auto max-h-[250px] p-2">
        <pre className="text-[10px] font-mono text-[var(--color-text-primary)] whitespace-pre-wrap break-all">
          {previewContent}
        </pre>
      </div>
    </div>
  );
});

ContentPreview.displayName = 'ContentPreview';

export default ContentPreview;
