/**
 * MCPToolsList Component
 * 
 * Displays all available MCP tools across all connected servers.
 * Provides search, filtering, and tool details view.
 * 
 * @module renderer/features/settings/components/mcp/MCPToolsList
 */

import React, { memo, useState, useMemo } from 'react';
import {
  Wrench,
  Search,
  Server,
  ChevronDown,
  ChevronRight,
  Copy,
  CheckCircle,
  Filter,
} from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { Input } from '../../../../components/ui/Input';
import { useMCPTools } from '../../../../hooks/useMCP';
import type { MCPToolWithContext } from '../../../../../shared/types/mcp';

interface MCPToolsListProps {
  /** Optional filter to specific server */
  serverId?: string;
  /** Optional search query */
  initialSearch?: string;
  /** Maximum height */
  maxHeight?: string;
  /** Additional class name */
  className?: string;
}

interface ToolCardProps {
  tool: MCPToolWithContext;
  expanded: boolean;
  onToggle: () => void;
}

const ToolCard: React.FC<ToolCardProps> = memo(({ tool, expanded, onToggle }) => {
  const [copied, setCopied] = useState(false);

  const handleCopySchema = () => {
    navigator.clipboard.writeText(JSON.stringify(tool.tool.inputSchema, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        'border overflow-hidden transition-all',
        'bg-[var(--color-surface-elevated)] border-[var(--color-border)]',
        expanded && 'border-[var(--color-accent)]'
      )}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-[var(--color-surface-hover)] transition-colors"
      >
        <div className="w-8 h-8 rounded flex items-center justify-center bg-[var(--color-accent)]/10">
          <Wrench className="w-4 h-4 text-[var(--color-accent)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-[var(--color-text-primary)]">
              {tool.tool.name}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[8px] bg-[var(--color-surface-base)] text-[var(--color-text-muted)]">
              {tool.serverName}
            </span>
          </div>
          <div className="text-[10px] text-[var(--color-text-muted)] line-clamp-1">
            {tool.tool.description}
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)]" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)]" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-[var(--color-border)] p-3 space-y-3">
          {/* Full description */}
          <div>
            <div className="text-[10px] text-[var(--color-text-muted)] mb-1">Description</div>
            <div className="text-[11px] text-[var(--color-text-secondary)]">
              {tool.tool.description}
            </div>
          </div>

          {/* Server info */}
          <div className="flex items-center gap-2">
            <Server className="w-3 h-3 text-[var(--color-text-muted)]" />
            <span className="text-[10px] text-[var(--color-text-muted)]">Server:</span>
            <span className="text-[10px] font-mono text-[var(--color-text-secondary)]">
              {tool.serverName}
            </span>
          </div>

          {/* Parameters */}
          {tool.tool.inputSchema.properties && Object.keys(tool.tool.inputSchema.properties).length > 0 && (
            <div>
              <div className="text-[10px] text-[var(--color-text-muted)] mb-2">Parameters</div>
              <div className="space-y-1">
                {Object.entries(tool.tool.inputSchema.properties).map(([key, value]) => {
                  const prop = value as Record<string, unknown>;
                  const isRequired = tool.tool.inputSchema.required?.includes(key);
                  return (
                    <div
                      key={key}
                      className="flex items-start gap-2 p-2 rounded bg-[var(--color-surface-base)]"
                    >
                      <code
                        className={cn(
                          'text-[10px] font-mono',
                          isRequired
                            ? 'text-[var(--color-warning)]'
                            : 'text-[var(--color-text-secondary)]'
                        )}
                      >
                        {key}
                        {isRequired && '*'}
                      </code>
                      <span className="text-[9px] text-[var(--color-text-muted)]">
                        {String(prop.type || 'unknown')}
                      </span>
                      {prop.description && (
                        <span className="text-[10px] text-[var(--color-text-muted)] flex-1">
                          {String(prop.description)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Copy schema button */}
          <div className="flex justify-end pt-2 border-t border-[var(--color-border)]">
            <button
              onClick={handleCopySchema}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors',
                copied
                  ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
                  : 'bg-[var(--color-surface-base)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
              )}
            >
              {copied ? (
                <>
                  <CheckCircle className="w-3 h-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy Schema
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

ToolCard.displayName = 'ToolCard';

export const MCPToolsList: React.FC<MCPToolsListProps> = memo(
  ({ serverId, initialSearch = '', maxHeight = '400px', className }) => {
    const { tools, loading } = useMCPTools();
    const [searchQuery, setSearchQuery] = useState(initialSearch);
    const [expandedTool, setExpandedTool] = useState<string | null>(null);
    const [serverFilter, setServerFilter] = useState<string | null>(serverId ?? null);

    // Get unique servers
    const servers = useMemo(() => {
      const serverMap = new Map<string, string>();
      tools.forEach((t) => serverMap.set(t.serverId, t.serverName));
      return Array.from(serverMap.entries()).map(([id, name]) => ({ id, name }));
    }, [tools]);

    // Filter tools
    const filteredTools = useMemo(() => {
      return tools.filter((tool) => {
        // Server filter
        if (serverFilter && tool.serverId !== serverFilter) return false;

        // Search filter
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          return (
            tool.tool.name.toLowerCase().includes(query) ||
            tool.tool.description.toLowerCase().includes(query) ||
            tool.serverName.toLowerCase().includes(query)
          );
        }

        return true;
      });
    }, [tools, searchQuery, serverFilter]);

    // Group by server
    const groupedTools = useMemo(() => {
      const groups = new Map<string, MCPToolWithContext[]>();
      filteredTools.forEach((tool) => {
        const existing = groups.get(tool.serverId) || [];
        existing.push(tool);
        groups.set(tool.serverId, existing);
      });
      return groups;
    }, [filteredTools]);

    const handleToggle = (toolKey: string) => {
      setExpandedTool((prev) => (prev === toolKey ? null : toolKey));
    };

    return (
      <div className={cn('space-y-3', className)}>
        {/* Search and filters */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tools..."
              leftIcon={<Search className="w-3.5 h-3.5" />}
              inputSize="sm"
            />
          </div>
          {servers.length > 1 && (
            <div className="relative">
              <select
                value={serverFilter || ''}
                onChange={(e) => setServerFilter(e.target.value || null)}
                className={cn(
                  'appearance-none px-2 py-1.5 pr-7 text-[10px] font-mono rounded-sm',
                  'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]',
                  'text-[var(--color-text-primary)]',
                  'focus:outline-none focus:border-[var(--color-accent)]/50'
                )}
              >
                <option value="">All Servers</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <Filter className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--color-text-muted)] pointer-events-none" />
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-[10px] text-[var(--color-text-muted)]">
          <span>
            <strong className="text-[var(--color-text-secondary)]">{filteredTools.length}</strong> tools
          </span>
          <span>
            <strong className="text-[var(--color-text-secondary)]">{groupedTools.size}</strong> servers
          </span>
        </div>

        {/* Tools list */}
        <div
          className="space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent"
          style={{ maxHeight }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-8 text-[var(--color-text-muted)]">
              Loading tools...
            </div>
          ) : filteredTools.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Wrench className="w-8 h-8 text-[var(--color-text-muted)] mb-2" />
              <p className="text-xs text-[var(--color-text-muted)]">No tools found</p>
              {searchQuery && (
                <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
                  Try a different search term
                </p>
              )}
            </div>
          ) : (
            filteredTools.map((tool) => {
              const toolKey = `${tool.serverId}:${tool.tool.name}`;
              return (
                <ToolCard
                  key={toolKey}
                  tool={tool}
                  expanded={expandedTool === toolKey}
                  onToggle={() => handleToggle(toolKey)}
                />
              );
            })
          )}
        </div>
      </div>
    );
  }
);

MCPToolsList.displayName = 'MCPToolsList';

export default MCPToolsList;
