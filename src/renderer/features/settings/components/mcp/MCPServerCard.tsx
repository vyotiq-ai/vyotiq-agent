/**
 * MCP Server Card Component
 *
 * Displays an individual MCP server with status, actions, and expandable details.
 * Uses terminal CLI aesthetic with simple text status indicators.
 *
 * @module renderer/features/settings/components/mcp/MCPServerCard
 */

import React, { memo, useState } from 'react';
import {
  Server,
  ChevronDown,
  Play,
  Pause,
  Power,
  RefreshCw,
  Trash2,
  Eye,
} from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { Button } from '../../../../components/ui/Button';
import type { MCPServerSummary } from '../../../../../shared/types/mcp';

// =============================================================================
// Types
// =============================================================================

export interface MCPServerCardProps {
  server: MCPServerSummary;
  onConnect: () => void;
  onDisconnect: () => void;
  onRestart: () => void;
  onEnable: () => void;
  onDisable: () => void;
  onUninstall: () => void;
  onViewDetails: () => void;
  isLoading?: boolean;
  onConfirmUninstall: (serverName: string) => Promise<boolean>;
}

// =============================================================================
// Status Text Helper
// =============================================================================

const getStatusText = (status: string): { text: string; className: string } => {
  switch (status) {
    case 'connected':
      return { text: '[running]', className: 'text-[var(--color-success)]' };
    case 'connecting':
      return { text: '[starting...]', className: 'text-[var(--color-warning)]' };
    case 'disconnected':
      return { text: '[stopped]', className: 'text-[var(--color-text-muted)]' };
    case 'disabled':
      return { text: '[disabled]', className: 'text-[var(--color-text-dim)]' };
    case 'error':
      return { text: '[error]', className: 'text-[var(--color-error)]' };
    default:
      return { text: '[unknown]', className: 'text-[var(--color-text-muted)]' };
  }
};

// =============================================================================
// Component
// =============================================================================

export const MCPServerCard: React.FC<MCPServerCardProps> = memo(
  ({
    server,
    onConnect,
    onDisconnect,
    onRestart,
    onEnable,
    onDisable,
    onUninstall,
    onViewDetails,
    isLoading,
    onConfirmUninstall,
  }) => {
    const [expanded, setExpanded] = useState(false);

    const isConnected = server.status === 'connected';
    const isDisabled = server.status === 'disabled';
    const status = getStatusText(server.status);

    return (
      <div
        className={cn(
          'border font-mono',
          'bg-[var(--color-surface-elevated)] border-[var(--color-border)]',
          expanded && 'border-[var(--color-accent)]'
        )}
      >
        {/* Header Row */}
        <div
          className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-[var(--color-surface-hover)]"
          onClick={() => setExpanded(!expanded)}
        >
          {/* Server Icon */}
          <Server className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />

          {/* Name & Status */}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="text-[11px] text-[var(--color-text-primary)] truncate">
              {server.name}
            </span>
            <span className={cn('text-[10px]', status.className)}>
              {status.text}
            </span>
          </div>

          {/* Stats (when connected) */}
          {isConnected && (
            <span className="text-[10px] text-[var(--color-text-muted)]">
              {server.toolCount} tools
            </span>
          )}

          {/* Expand Arrow */}
          <ChevronDown
            className={cn(
              'w-4 h-4 text-[var(--color-text-muted)] transition-transform',
              expanded && 'rotate-180'
            )}
          />
        </div>

        {/* Expanded Content */}
        {expanded && (
          <div className="border-t border-[var(--color-border)] px-2 sm:px-3 py-2 space-y-2">
            {/* Details Grid */}
            <div className="grid gap-x-3 sm:gap-x-4 gap-y-1 text-[9px] sm:text-[10px] sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <span className="text-[var(--color-text-muted)]">category:</span>
                <span className="text-[var(--color-text-secondary)]">{server.category}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[var(--color-text-muted)]">source:</span>
                <span className="text-[var(--color-text-secondary)]">{server.source}</span>
              </div>
              {isConnected && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--color-text-muted)]">tools:</span>
                    <span className="text-[var(--color-text-secondary)]">{server.toolCount}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--color-text-muted)]">resources:</span>
                    <span className="text-[var(--color-text-secondary)]">{server.resourceCount}</span>
                  </div>
                </>
              )}
            </div>

            {/* Description */}
            {server.description && (
              <div className="text-[9px] sm:text-[10px] text-[var(--color-text-dim)]">
                # {server.description}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--color-border)]">
              {isDisabled ? (
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEnable();
                  }}
                  disabled={isLoading}
                  leftIcon={<Power className="w-3 h-3" />}
                >
                  Enable
                </Button>
              ) : isConnected ? (
                <>
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDisconnect();
                    }}
                    disabled={isLoading}
                    leftIcon={<Pause className="w-3 h-3" />}
                  >
                    Stop
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestart();
                    }}
                    disabled={isLoading}
                    leftIcon={<RefreshCw className="w-3 h-3" />}
                  >
                    Restart
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="xs"
                    variant="primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onConnect();
                    }}
                    disabled={isLoading}
                    leftIcon={<Play className="w-3 h-3" />}
                  >
                    Start
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDisable();
                    }}
                    disabled={isLoading}
                    leftIcon={<Pause className="w-3 h-3" />}
                  >
                    Disable
                  </Button>
                </>
              )}

              <div className="flex-1" />

              <Button
                size="xs"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewDetails();
                }}
                disabled={isLoading}
                leftIcon={<Eye className="w-3 h-3" />}
              >
                Details
              </Button>
              <Button
                size="xs"
                variant="danger"
                onClick={async (e) => {
                  e.stopPropagation();
                  const confirmed = await onConfirmUninstall(server.name);
                  if (confirmed) {
                    onUninstall();
                  }
                }}
                disabled={isLoading}
                leftIcon={<Trash2 className="w-3 h-3" />}
              >
                Uninstall
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }
);

MCPServerCard.displayName = 'MCPServerCard';

export default MCPServerCard;
