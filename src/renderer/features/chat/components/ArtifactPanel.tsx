/**
 * ArtifactPanel Component
 * 
 * Renders session-level artifacts as a collapsible section in the chat area.
 * Shows all artifacts produced during the current session grouped by type.
 * 
 * Follows the terminal aesthetic with monospace fonts and CSS variable theming.
 */
import React, { memo, useState, useMemo, useCallback } from 'react';
import { Package, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { useAgentSelector } from '../../../state/AgentProvider';
import type { AgentUIState } from '../../../state/types';
import type { ArtifactCard } from '../../../../shared/types';
import { ArtifactCardComponent } from './ArtifactCard';

// =============================================================================
// Types
// =============================================================================

interface ArtifactPanelProps {
  /** Session ID to show artifacts for */
  sessionId: string;
  /** Additional CSS class */
  className?: string;
}

// =============================================================================
// Selectors
// =============================================================================

const selectArtifacts = (state: AgentUIState) => state.artifacts;

// =============================================================================
// Main Component
// =============================================================================

const ArtifactPanelInternal: React.FC<ArtifactPanelProps> = ({
  sessionId,
  className,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const artifactsMap = useAgentSelector(selectArtifacts);
  const sessionArtifacts = useMemo<ArtifactCard[]>(
    () => artifactsMap[sessionId] ?? [],
    [artifactsMap, sessionId],
  );

  const toggleCollapse = useCallback(() => setIsCollapsed(p => !p), []);

  if (sessionArtifacts.length === 0) return null;

  // Count by type
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of sessionArtifacts) {
      counts[a.type] = (counts[a.type] ?? 0) + 1;
    }
    return counts;
  }, [sessionArtifacts]);

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
        onClick={toggleCollapse}
        className="flex items-center gap-1.5 px-2 py-1 w-full text-left hover:bg-[var(--color-surface-2)] transition-colors duration-100"
      >
        {isCollapsed ? (
          <ChevronRight size={9} className="shrink-0 text-[var(--color-text-dim)]" />
        ) : (
          <ChevronDown size={9} className="shrink-0 text-[var(--color-text-dim)]" />
        )}
        <Package size={10} className="shrink-0" style={{ color: 'var(--color-accent-secondary)' }} />
        <span className="text-[9px] uppercase tracking-wider text-[var(--color-accent-secondary)]">
          artifacts
        </span>
        <span className="text-[8px] tabular-nums text-[var(--color-text-dim)]">
          {sessionArtifacts.length}
        </span>
        {/* Type badges */}
        <div className="flex items-center gap-1 ml-auto">
          {Object.entries(typeCounts).map(([type, count]) => (
            <span key={type} className="text-[8px] text-[var(--color-text-dim)]">
              {count} {type}
            </span>
          ))}
        </div>
      </button>

      {/* Artifact list */}
      {!isCollapsed && (
        <div className="px-2 py-1.5 border-t border-[var(--color-border-subtle)] flex flex-col gap-1">
          {sessionArtifacts.map(artifact => (
            <ArtifactCardComponent
              key={artifact.id}
              artifact={artifact}
              defaultCollapsed
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const ArtifactPanel = memo(ArtifactPanelInternal);
ArtifactPanel.displayName = 'ArtifactPanel';
