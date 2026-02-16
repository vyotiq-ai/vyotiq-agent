/**
 * ArtifactCard Component
 * 
 * Renders an individual artifact card with type icon, title, preview,
 * and action indicator. Supports file, code, document, and link artifacts.
 * 
 * Follows the terminal aesthetic with monospace fonts and CSS variable theming.
 */
import React, { memo, useState, useCallback } from 'react';
import {
  FileText,
  Code,
  FileCode,
  Link as LinkIcon,
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { ArtifactCard as ArtifactCardType } from '../../../../shared/types';

// =============================================================================
// Types
// =============================================================================

interface ArtifactCardProps {
  /** The artifact to render */
  artifact: ArtifactCardType;
  /** Whether to start collapsed */
  defaultCollapsed?: boolean;
  /** Additional CSS class */
  className?: string;
}

// =============================================================================
// Helpers
// =============================================================================

const typeConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  file: { icon: FileText, color: 'var(--color-info)', label: 'FILE' },
  code: { icon: Code, color: 'var(--color-accent-primary)', label: 'CODE' },
  document: { icon: FileCode, color: 'var(--color-accent-secondary)', label: 'DOC' },
  link: { icon: LinkIcon, color: 'var(--color-accent-tertiary)', label: 'LINK' },
};

const actionConfig: Record<string, { color: string; label: string; icon: React.ElementType }> = {
  created: { color: 'var(--color-success)', label: 'CREATED', icon: Plus },
  modified: { color: 'var(--color-warning)', label: 'MODIFIED', icon: Pencil },
  deleted: { color: 'var(--color-error)', label: 'DELETED', icon: Trash2 },
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// =============================================================================
// Main Component
// =============================================================================

const ArtifactCardInternal: React.FC<ArtifactCardProps> = ({
  artifact,
  defaultCollapsed = true,
  className,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [copied, setCopied] = useState(false);

  const config = typeConfig[artifact.type] ?? typeConfig.file;
  const action = artifact.action ? actionConfig[artifact.action] : null;
  const Icon = config.icon;

  const handleCopy = useCallback(() => {
    if (!artifact.preview) return;
    navigator.clipboard.writeText(artifact.preview);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [artifact.preview]);

  return (
    <div
      className={cn(
        'rounded border font-mono',
        'bg-[var(--color-surface-1)]',
        'border-[var(--color-border-subtle)]',
        className,
      )}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsCollapsed(p => !p)}
        className="flex items-center gap-1.5 px-2 py-1 w-full text-left hover:bg-[var(--color-surface-2)] transition-colors duration-100"
      >
        {isCollapsed ? (
          <ChevronRight size={9} className="shrink-0 text-[var(--color-text-dim)]" />
        ) : (
          <ChevronDown size={9} className="shrink-0 text-[var(--color-text-dim)]" />
        )}
        <Icon size={10} className="shrink-0" style={{ color: config.color }} />
        <span className="text-[9px] uppercase tracking-wider" style={{ color: config.color }}>
          {config.label}
        </span>
        <span className="text-[10px] text-[var(--color-text-primary)] truncate flex-1">
          {artifact.title}
        </span>
        {action && (
          <span className="text-[8px] uppercase tracking-wider shrink-0" style={{ color: action.color }}>
            {action.label}
          </span>
        )}
        <span className="text-[8px] tabular-nums text-[var(--color-text-dim)] shrink-0">
          {formatTimestamp(artifact.createdAt)}
        </span>
      </button>

      {/* Content */}
      {!isCollapsed && (
        <div className="border-t border-[var(--color-border-subtle)]">
          {/* Path */}
          {artifact.path && (
            <div className="px-2 py-0.5 text-[9px] text-[var(--color-text-muted)] truncate">
              {artifact.path}
            </div>
          )}

          {/* Description */}
          {artifact.description && (
            <div className="px-2 py-1 text-[9px] text-[var(--color-text-secondary)] leading-relaxed">
              {artifact.description}
            </div>
          )}

          {/* Preview */}
          {artifact.preview && (
            <div className="relative">
              <pre className="px-2 py-1.5 text-[9px] text-[var(--color-text-secondary)] overflow-x-auto max-h-[200px] bg-[var(--color-surface-2)]">
                {artifact.preview}
              </pre>
              <button
                type="button"
                onClick={handleCopy}
                className="absolute top-1 right-1 p-0.5 text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors"
                title={copied ? 'Copied' : 'Copy preview'}
              >
                {copied ? <Check size={9} style={{ color: 'var(--color-success)' }} /> : <Copy size={9} />}
              </button>
            </div>
          )}

          {/* Language badge */}
          {artifact.language && (
            <div className="px-2 py-0.5 border-t border-[var(--color-border-subtle)]">
              <span className="text-[8px] text-[var(--color-text-dim)]">{artifact.language}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ArtifactCardComponent = memo(ArtifactCardInternal);
ArtifactCardComponent.displayName = 'ArtifactCard';
