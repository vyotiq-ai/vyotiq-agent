/**
 * SettingsMCP Component
 *
 * Settings panel for MCP (Model Context Protocol) configuration:
 * - Installed servers management
 * - Server store browser
 * - Connection settings
 * - Tool visibility settings
 * - Custom server installation
 * - Import/export configurations
 */

import React, { memo, useState, useCallback, useEffect, useMemo } from 'react';
import {
  Server,
  Package,
  Plus,
  Trash2,
  RefreshCw,
  Power,
  PowerOff,
  Play,
  Pause,
  Search,
  Settings2,
  Activity,
  Zap,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  Info,
  Download,
  Tag,
  Database,
  Globe,
  Folder,
  Terminal,
  Wrench,
  Store,
  Eye,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Toggle } from '../../../components/ui/Toggle';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useMCPSettings, useMCPServers, useMCPStore } from '../../../hooks/useMCP';
import { createLogger } from '../../../utils/logger';
import { AddServerModal } from './mcp/AddServerModal';
import { ServerDetailModal } from './mcp/ServerDetailModal';
import { ImportExportPanel } from './mcp/ImportExportPanel';
import { MCPToolsList } from './mcp/MCPToolsList';
import type {
  MCPSettings,
  MCPServerSummary,
  MCPStoreListing,
  MCPServerCategory,
  MCPServerConfig,
  MCPInstallRequest,
} from '../../../../shared/types/mcp';

const logger = createLogger('SettingsMCP');

// Log component initialization for debugging
logger.debug('SettingsMCP module loaded');

// =============================================================================
// Types
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface SettingsMCPProps {
  // Settings are managed internally via hooks
  // Props are intentionally empty as state is managed via context hooks
}

type ViewMode = 'servers' | 'store' | 'tools' | 'settings';

// =============================================================================
// Category Icons and Labels
// =============================================================================

const CATEGORY_CONFIG: Record<
  MCPServerCategory,
  { icon: React.ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & React.RefAttributes<SVGSVGElement>>; label: string; color: string }
> = {
  database: { icon: Database, label: 'Database', color: 'var(--color-info)' },
  api: { icon: Globe, label: 'API', color: 'var(--color-success)' },
  'file-system': { icon: Folder, label: 'File System', color: 'var(--color-warning)' },
  browser: { icon: Globe, label: 'Browser', color: 'var(--color-accent)' },
  'developer-tools': { icon: Wrench, label: 'Developer Tools', color: 'var(--color-text-secondary)' },
  productivity: { icon: Zap, label: 'Productivity', color: 'var(--color-success)' },
  cloud: { icon: Server, label: 'Cloud', color: 'var(--color-info)' },
  communication: { icon: Terminal, label: 'Communication', color: 'var(--color-accent)' },
  ai: { icon: Zap, label: 'AI', color: 'var(--color-warning)' },
  analytics: { icon: Activity, label: 'Analytics', color: 'var(--color-info)' },
  security: { icon: AlertCircle, label: 'Security', color: 'var(--color-error)' },
  other: { icon: Package, label: 'Other', color: 'var(--color-text-muted)' },
};

// =============================================================================
// Status Badge Component
// =============================================================================

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = memo(({ status, className }) => {
  const config: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    connected: {
      color: 'var(--color-success)',
      icon: <CheckCircle className="w-3 h-3" />,
      label: 'Connected',
    },
    connecting: {
      color: 'var(--color-warning)',
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
      label: 'Connecting',
    },
    disconnected: {
      color: 'var(--color-text-muted)',
      icon: <PowerOff className="w-3 h-3" />,
      label: 'Disconnected',
    },
    disabled: {
      color: 'var(--color-text-muted)',
      icon: <Pause className="w-3 h-3" />,
      label: 'Disabled',
    },
    error: {
      color: 'var(--color-error)',
      icon: <AlertCircle className="w-3 h-3" />,
      label: 'Error',
    },
  };

  const { color, icon, label } = config[status] || config.disconnected;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono',
        className
      )}
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` }}
    >
      {icon}
      {label}
    </span>
  );
});

StatusBadge.displayName = 'StatusBadge';

// =============================================================================
// Server Card Component
// =============================================================================

interface ServerCardProps {
  server: MCPServerSummary;
  onConnect: () => void;
  onDisconnect: () => void;
  onRestart: () => void;
  onEnable: () => void;
  onDisable: () => void;
  onUninstall: () => void;
  onViewDetails: () => void;
  isLoading?: boolean;
}

const ServerCard: React.FC<ServerCardProps> = memo(
  ({ server, onConnect, onDisconnect, onRestart, onEnable, onDisable, onUninstall, onViewDetails, isLoading }) => {
    const [expanded, setExpanded] = useState(false);
    const categoryConfig = CATEGORY_CONFIG[server.category] || CATEGORY_CONFIG.other;
    const CategoryIcon = categoryConfig.icon;

    const isConnected = server.status === 'connected';
    const isDisabled = server.status === 'disabled';

    return (
      <div
        className={cn(
          'border rounded-lg overflow-hidden transition-all',
          'bg-[var(--color-surface-elevated)] border-[var(--color-border)]',
          expanded && 'ring-1 ring-[var(--color-accent)]'
        )}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 p-3 cursor-pointer hover:bg-[var(--color-surface-hover)]"
          onClick={() => setExpanded(!expanded)}
        >
          {/* Icon */}
          <div
            className="w-8 h-8 rounded flex items-center justify-center"
            style={{ backgroundColor: `color-mix(in srgb, ${categoryConfig.color} 20%, transparent)` }}
          >
            <CategoryIcon className="w-4 h-4" color={categoryConfig.color} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-[var(--color-text-primary)] truncate">
                {server.name}
              </span>
              <StatusBadge status={server.status} />
            </div>
            <div className="text-[10px] text-[var(--color-text-muted)] truncate">
              {server.description || 'No description'}
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 text-[10px] text-[var(--color-text-muted)]">
            {isConnected && (
              <>
                <span className="flex items-center gap-1">
                  <Wrench className="w-3 h-3" />
                  {server.toolCount}
                </span>
              </>
            )}
            <ChevronDown
              className={cn(
                'w-4 h-4 transition-transform',
                expanded && 'transform rotate-180'
              )}
            />
          </div>
        </div>

        {/* Expanded Content */}
        {expanded && (
          <div className="border-t border-[var(--color-border)] p-3 space-y-3">
            {/* Details */}
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="flex items-center gap-2">
                <Tag className="w-3 h-3 text-[var(--color-text-muted)]" />
                <span className="text-[var(--color-text-muted)]">Category:</span>
                <span className="text-[var(--color-text-secondary)]">{categoryConfig.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <Package className="w-3 h-3 text-[var(--color-text-muted)]" />
                <span className="text-[var(--color-text-muted)]">Source:</span>
                <span className="text-[var(--color-text-secondary)]">{server.source}</span>
              </div>
              {isConnected && (
                <>
                  <div className="flex items-center gap-2">
                    <Wrench className="w-3 h-3 text-[var(--color-text-muted)]" />
                    <span className="text-[var(--color-text-muted)]">Tools:</span>
                    <span className="text-[var(--color-text-secondary)]">{server.toolCount}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Database className="w-3 h-3 text-[var(--color-text-muted)]" />
                    <span className="text-[var(--color-text-muted)]">Resources:</span>
                    <span className="text-[var(--color-text-secondary)]">{server.resourceCount}</span>
                  </div>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-[var(--color-border)]">
              {isDisabled ? (
                <Button
                  size="sm"
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
                    size="sm"
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDisconnect();
                    }}
                    disabled={isLoading}
                    leftIcon={<PowerOff className="w-3 h-3" />}
                  >
                    Disconnect
                  </Button>
                  <Button
                    size="sm"
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
                    size="sm"
                    variant="primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onConnect();
                    }}
                    disabled={isLoading}
                    leftIcon={<Play className="w-3 h-3" />}
                  >
                    Connect
                  </Button>
                  <Button
                    size="sm"
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
                size="sm"
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
                size="sm"
                variant="danger"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Uninstall "${server.name}"?`)) {
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

ServerCard.displayName = 'ServerCard';

// =============================================================================
// Store Listing Card Component
// =============================================================================

interface StoreListingCardProps {
  listing: MCPStoreListing;
  isInstalled: boolean;
  onInstall: () => void;
  isInstalling?: boolean;
}

const StoreListingCard: React.FC<StoreListingCardProps> = memo(
  ({ listing, isInstalled, onInstall, isInstalling }) => {
    const categoryConfig = CATEGORY_CONFIG[listing.category] || CATEGORY_CONFIG.other;
    const CategoryIcon = categoryConfig.icon;

    return (
      <div
        className={cn(
          'border rounded-lg p-3 transition-all relative',
          'bg-[var(--color-surface-elevated)] border-[var(--color-border)]',
          'hover:border-[var(--color-accent)]',
          isInstalled && 'ring-1 ring-[var(--color-success)] border-[var(--color-success)]'
        )}
      >
        {/* Installed Badge */}
        {isInstalled && (
          <div className="absolute -top-2 -right-2 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-[var(--color-success)] text-white">
            <CheckCircle className="w-3 h-3" />
            Installed
          </div>
        )}

        {/* Header */}
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `color-mix(in srgb, ${categoryConfig.color} 20%, transparent)` }}
          >
            <CategoryIcon className="w-5 h-5" color={categoryConfig.color} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-[var(--color-text-primary)]">
                {listing.name}
              </span>
              {listing.verified && (
                <span title="Verified">
                  <CheckCircle className="w-3 h-3 text-[var(--color-success)]" />
                </span>
              )}
            </div>
            <div className="text-[10px] text-[var(--color-text-muted)] line-clamp-2 mt-0.5">
              {listing.description}
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mt-2">
          {listing.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[var(--color-surface-base)] text-[var(--color-text-muted)]"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-3 text-[10px] text-[var(--color-text-muted)]">
            <span>{listing.author}</span>
            <span>v{listing.version}</span>
            {listing.downloads !== undefined && listing.downloads > 0 && (
              <span className="flex items-center gap-0.5">
                <Download className="w-3 h-3" />
                {listing.downloads > 1000
                  ? `${(listing.downloads / 1000).toFixed(1)}k`
                  : listing.downloads}
              </span>
            )}
          </div>
          {!isInstalled && (
            <Button
              size="xs"
              variant="primary"
              onClick={onInstall}
              disabled={isInstalling}
              isLoading={isInstalling}
              leftIcon={<Download className="w-3 h-3" />}
            >
              Install
            </Button>
          )}
        </div>
      </div>
    );
  }
);

StoreListingCard.displayName = 'StoreListingCard';

// =============================================================================
// Servers View Component
// =============================================================================

interface ServersViewProps {
  servers: MCPServerSummary[];
  loading: boolean;
  onConnect: (serverId: string) => Promise<unknown>;
  onDisconnect: (serverId: string) => Promise<unknown>;
  onRestart: (serverId: string) => Promise<unknown>;
  onEnable: (serverId: string) => Promise<unknown>;
  onDisable: (serverId: string) => Promise<unknown>;
  onUninstall: (serverId: string) => Promise<unknown>;
  onConnectAll: () => Promise<unknown>;
  onDisconnectAll: () => Promise<unknown>;
  onRefresh: () => Promise<void>;
  onAddServer: () => void;
  onViewDetails: (serverId: string) => void;
}

const ServersView: React.FC<ServersViewProps> = memo(
  ({
    servers,
    loading,
    onConnect,
    onDisconnect,
    onRestart,
    onEnable,
    onDisable,
    onUninstall,
    onConnectAll,
    onDisconnectAll,
    onRefresh,
    onAddServer,
    onViewDetails,
  }) => {
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const connectedCount = servers.filter((s) => s.status === 'connected').length;
    const totalToolCount = servers.reduce((acc, s) => acc + s.toolCount, 0);

    const handleAction = async (serverId: string, action: () => Promise<unknown>) => {
      setActionLoading(serverId);
      try {
        await action();
      } finally {
        setActionLoading(null);
      }
    };

    return (
      <div className="space-y-4">
        {/* Stats Bar */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-surface-base)] border border-[var(--color-border)]">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-[var(--color-text-muted)]" />
              <span className="text-xs text-[var(--color-text-muted)]">Servers:</span>
              <span className="text-xs font-mono text-[var(--color-text-primary)]">
                {connectedCount}/{servers.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-[var(--color-text-muted)]" />
              <span className="text-xs text-[var(--color-text-muted)]">Tools:</span>
              <span className="text-xs font-mono text-[var(--color-text-primary)]">{totalToolCount}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant="secondary"
              onClick={() => onConnectAll()}
              leftIcon={<Play className="w-3 h-3" />}
            >
              Connect All
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => onDisconnectAll()}
              leftIcon={<PowerOff className="w-3 h-3" />}
            >
              Disconnect All
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={onRefresh}
              leftIcon={<RefreshCw className="w-3 h-3" />}
            >
              Refresh
            </Button>
            <div className="w-px h-4 bg-[var(--color-border)]" />
            <Button
              size="xs"
              variant="primary"
              onClick={onAddServer}
              leftIcon={<Plus className="w-3 h-3" />}
            >
              Add Server
            </Button>
          </div>
        </div>

        {/* Server List */}
        {loading && servers.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
          </div>
        ) : servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Server className="w-12 h-12 text-[var(--color-text-muted)] mb-3" />
            <p className="text-sm text-[var(--color-text-muted)]">No MCP servers installed</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              Browse the store to install servers
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {servers.map((server) => (
              <ServerCard
                key={server.id}
                server={server}
                onConnect={() => handleAction(server.id, () => onConnect(server.id))}
                onDisconnect={() => handleAction(server.id, () => onDisconnect(server.id))}
                onRestart={() => handleAction(server.id, () => onRestart(server.id))}
                onEnable={() => handleAction(server.id, () => onEnable(server.id))}
                onDisable={() => handleAction(server.id, () => onDisable(server.id))}
                onUninstall={() => handleAction(server.id, () => onUninstall(server.id))}
                onViewDetails={() => onViewDetails(server.id)}
                isLoading={actionLoading === server.id}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
);

ServersView.displayName = 'ServersView';

// =============================================================================
// Store View Component
// =============================================================================

interface StoreViewProps {
  listings: MCPStoreListing[];
  featured: MCPStoreListing[];
  categories: { category: string; count: number }[];
  loading: boolean;
  hasMore: boolean;
  total: number;
  onSearch: (query: string) => void;
  onCategoryFilter: (category: string | undefined) => void;
  onLoadMore: () => void;
  onInstall: (listingId: string) => Promise<unknown>;
  onRefresh: () => Promise<void>;
  isInstalled: (listing: MCPStoreListing) => boolean;
}

const StoreView: React.FC<StoreViewProps> = memo(
  ({
    listings,
    featured,
    categories,
    loading,
    hasMore,
    total,
    onSearch,
    onCategoryFilter,
    onLoadMore,
    onInstall,
    onRefresh,
    isInstalled,
  }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
    const [installingId, setInstallingId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'featured' | 'all' | 'search'>('featured');
    const [refreshing, setRefreshing] = useState(false);

    // Load all servers when view mode changes to 'all'
    useEffect(() => {
      if (viewMode === 'all' && listings.length === 0 && !loading) {
        onSearch('');
      }
    }, [viewMode, listings.length, loading, onSearch]);

    const handleSearch = useCallback(() => {
      setViewMode('search');
      onSearch(searchQuery);
    }, [searchQuery, onSearch]);

    const handleCategorySelect = useCallback(
      (category: string | undefined) => {
        setSelectedCategory(category);
        if (category === undefined) {
          // Clicking "All" should show all servers, not just featured
          setViewMode('all');
          onSearch('');
        } else {
          setViewMode('search');
          onCategoryFilter(category);
        }
      },
      [onCategoryFilter, onSearch]
    );

    const handleInstall = async (listingId: string) => {
      setInstallingId(listingId);
      try {
        await onInstall(listingId);
      } finally {
        setInstallingId(null);
      }
    };

    const handleRefresh = async () => {
      setRefreshing(true);
      try {
        await onRefresh();
        // Keep the current view mode but refresh data
        if (viewMode === 'all') {
          onSearch('');
        }
      } finally {
        setRefreshing(false);
      }
    };

    // Determine what to display based on view mode
    const displayListings = viewMode === 'featured' ? featured : listings;
    const showFeatured = viewMode === 'featured';

    return (
      <div className="space-y-4">
        {/* Search Bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search MCP servers..."
              leftIcon={<Search className="w-3.5 h-3.5" />}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch();
              }}
            />
          </div>
          <Button size="sm" variant="primary" onClick={handleSearch}>
            Search
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleRefresh}
            isLoading={refreshing}
            title="Refresh server registry"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => handleCategorySelect(undefined)}
            className={cn(
              'px-2 py-1 rounded text-[10px] font-mono transition-colors',
              !selectedCategory && viewMode !== 'featured'
                ? 'bg-[var(--color-accent)] text-white'
                : 'bg-[var(--color-surface-base)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            )}
          >
            All
          </button>
          {categories.map(({ category, count }) => {
            const config = CATEGORY_CONFIG[category as MCPServerCategory];
            return (
              <button
                key={category}
                onClick={() => handleCategorySelect(category)}
                className={cn(
                  'px-2 py-1 rounded text-[10px] font-mono transition-colors',
                  selectedCategory === category
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'bg-[var(--color-surface-base)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                )}
              >
                {config?.label || category} ({count})
              </button>
            );
          })}
        </div>

        {/* Listings Grid */}
        {loading && displayListings.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
          </div>
        ) : displayListings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="w-12 h-12 text-[var(--color-text-muted)] mb-3" />
            <p className="text-sm text-[var(--color-text-muted)]">No servers found</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {viewMode === 'all' ? 'Loading servers...' : 'Try a different search term'}
            </p>
          </div>
        ) : (
          <>
            {/* View Mode Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {showFeatured ? (
                  <>
                    <Zap className="w-4 h-4 text-[var(--color-warning)]" />
                    <span className="text-xs font-medium text-[var(--color-text-primary)]">
                      Featured Servers
                    </span>
                  </>
                ) : (
                  <>
                    <Package className="w-4 h-4 text-[var(--color-accent)]" />
                    <span className="text-xs font-medium text-[var(--color-text-primary)]">
                      {selectedCategory
                        ? `${CATEGORY_CONFIG[selectedCategory as MCPServerCategory]?.label || selectedCategory} Servers`
                        : 'All Servers'}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-muted)]">
                      ({displayListings.length}{hasMore ? ` of ${total}` : ''})
                    </span>
                  </>
                )}
              </div>
              {showFeatured && (
                <button
                  onClick={() => handleCategorySelect(undefined)}
                  className="text-[10px] text-[var(--color-accent)] hover:underline"
                >
                  View all {total > 0 ? `${total} ` : ''}servers
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {displayListings.map((listing) => (
                <StoreListingCard
                  key={listing.id}
                  listing={listing}
                  isInstalled={isInstalled(listing)}
                  onInstall={() => handleInstall(listing.id)}
                  isInstalling={installingId === listing.id}
                />
              ))}
            </div>
            {hasMore && !showFeatured && (
              <div className="flex justify-center pt-4">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={onLoadMore}
                  isLoading={loading}
                >
                  Load More
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }
);

StoreView.displayName = 'StoreView';

// =============================================================================
// Settings View Component
// =============================================================================

interface SettingsViewProps {
  settings: MCPSettings | null;
  loading: boolean;
  onUpdate: (updates: Partial<MCPSettings>) => Promise<void>;
}

// Registry source configuration
const REGISTRY_SOURCES = [
  { id: 'smithery', name: 'Smithery.ai', description: 'Primary MCP server registry with 3,800+ servers', icon: Store },
  { id: 'npm', name: 'NPM Registry', description: 'Node.js packages with @modelcontextprotocol scope', icon: Package },
  { id: 'pypi', name: 'PyPI Registry', description: 'Python packages with mcp-server prefix', icon: Package },
  { id: 'github', name: 'GitHub Official', description: 'Official MCP servers from modelcontextprotocol repo', icon: Globe },
  { id: 'glama', name: 'Glama.ai', description: 'Additional curated MCP server listings', icon: Zap },
] as const;

const SettingsView: React.FC<SettingsViewProps> = memo(({ settings, loading, onUpdate }) => {
  const store = useMCPStore();

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
      </div>
    );
  }

  // enabledRegistrySources is an object with boolean values, not an array
  const enabledSources = settings.enabledRegistrySources || {
    smithery: true,
    npm: true,
    pypi: true,
    github: true,
    glama: false,
  };

  const isSourceEnabled = (sourceId: string): boolean => {
    return enabledSources[sourceId as keyof typeof enabledSources] ?? false;
  };

  const handleSourceToggle = async (sourceId: string) => {
    const current = settings.enabledRegistrySources || {
      smithery: true,
      npm: true,
      pypi: true,
      github: true,
      glama: false,
    };
    const updated = {
      ...current,
      [sourceId]: !current[sourceId as keyof typeof current],
    };

    await onUpdate({ enabledRegistrySources: updated });
    // Also update through the store hook
    await store.setSourceEnabled(sourceId, !current[sourceId as keyof typeof current]);
  };

  return (
    <div className="space-y-6">
      {/* Registry Sources */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-[var(--color-text-primary)] flex items-center gap-2">
            <Database className="w-4 h-4" />
            Registry Sources
          </h3>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => store.refreshRegistry()}
            leftIcon={store.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            disabled={store.loading}
          >
            Refresh All
          </Button>
        </div>

        {/* Stats Summary */}
        {store.registryStats && (
          <div className="flex items-center gap-4 p-2 rounded bg-[var(--color-surface-base)] border border-[var(--color-border)]">
            <div className="flex items-center gap-2">
              <Server className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
              <span className="text-[10px] text-[var(--color-text-muted)]">Total Servers:</span>
              <span className="text-[10px] font-mono text-[var(--color-accent)]">{store.registryStats.total.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
              <span className="text-[10px] text-[var(--color-text-muted)]">Last Refresh:</span>
              <span className="text-[10px] font-mono text-[var(--color-text-secondary)]">
                {store.registryStats.lastFullRefresh > 0
                  ? new Date(store.registryStats.lastFullRefresh).toLocaleTimeString()
                  : 'Never'}
              </span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {REGISTRY_SOURCES.map((source) => {
            const SourceIcon = source.icon;
            const isEnabled = isSourceEnabled(source.id);
            const stats = store.registryStats?.sources[source.id];

            return (
              <div
                key={source.id}
                className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-surface-base)] border border-[var(--color-border)]"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded flex items-center justify-center"
                    style={{
                      backgroundColor: isEnabled
                        ? 'color-mix(in srgb, var(--color-accent) 20%, transparent)'
                        : 'color-mix(in srgb, var(--color-text-muted) 10%, transparent)'
                    }}
                  >
                    <SourceIcon
                      className="w-4 h-4"
                      style={{ color: isEnabled ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-[var(--color-text-primary)] flex items-center gap-2">
                      {source.name}
                      {stats && (
                        <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
                          ({stats.count.toLocaleString()} servers)
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[var(--color-text-muted)]">
                      {source.description}
                    </div>
                    {stats && !stats.fresh && (
                      <div className="text-[10px] text-[var(--color-warning)] flex items-center gap-1 mt-0.5">
                        <AlertCircle className="w-3 h-3" />
                        Cache stale, will refresh on next search
                      </div>
                    )}
                  </div>
                </div>
                <Toggle
                  checked={isEnabled}
                  onToggle={() => handleSourceToggle(source.id)}
                  size="sm"
                />
              </div>
            );
          })}
        </div>

        <div className="p-2 rounded bg-[var(--color-surface-base)] border border-[var(--color-border)]">
          <div className="flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-[var(--color-text-muted)] mt-0.5 flex-shrink-0" />
            <p className="text-[10px] text-[var(--color-text-muted)]">
              Servers are fetched dynamically from enabled registries. Results are cached for 30-60 minutes for performance.
              Disable sources you don't need to speed up searches.
            </p>
          </div>
        </div>
      </div>

      {/* General Settings */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-[var(--color-text-primary)] flex items-center gap-2">
          <Settings2 className="w-4 h-4" />
          General Settings
        </h3>

        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-surface-base)] border border-[var(--color-border)]">
            <div>
              <div className="text-xs text-[var(--color-text-primary)]">Enable MCP Integration</div>
              <div className="text-[10px] text-[var(--color-text-muted)]">
                Allow agent to use MCP server tools
              </div>
            </div>
            <Toggle
              checked={settings.enabled ?? true}
              onToggle={() => onUpdate({ enabled: !(settings.enabled ?? true) })}
              size="sm"
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-surface-base)] border border-[var(--color-border)]">
            <div>
              <div className="text-xs text-[var(--color-text-primary)]">Auto-Start Servers</div>
              <div className="text-[10px] text-[var(--color-text-muted)]">
                Automatically connect enabled servers when agent starts
              </div>
            </div>
            <Toggle
              checked={settings.autoStartServers ?? true}
              onToggle={() => onUpdate({ autoStartServers: !(settings.autoStartServers ?? true) })}
              size="sm"
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-surface-base)] border border-[var(--color-border)]">
            <div>
              <div className="text-xs text-[var(--color-text-primary)]">Show in Tool Selection</div>
              <div className="text-[10px] text-[var(--color-text-muted)]">
                Display MCP tools in the agent's tool selection UI
              </div>
            </div>
            <Toggle
              checked={settings.showInToolSelection ?? true}
              onToggle={() => onUpdate({ showInToolSelection: !(settings.showInToolSelection ?? true) })}
              size="sm"
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-surface-base)] border border-[var(--color-border)]">
            <div>
              <div className="text-xs text-[var(--color-text-primary)]">Cache Tool Results</div>
              <div className="text-[10px] text-[var(--color-text-muted)]">
                Cache repeated tool calls for faster responses
              </div>
            </div>
            <Toggle
              checked={settings.cacheToolResults ?? true}
              onToggle={() => onUpdate({ cacheToolResults: !(settings.cacheToolResults ?? true) })}
              size="sm"
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-surface-base)] border border-[var(--color-border)]">
            <div>
              <div className="text-xs text-[var(--color-text-primary)]">Debug Logging</div>
              <div className="text-[10px] text-[var(--color-text-muted)]">
                Log MCP communications for debugging
              </div>
            </div>
            <Toggle
              checked={settings.debugLogging ?? false}
              onToggle={() => onUpdate({ debugLogging: !(settings.debugLogging ?? false) })}
              size="sm"
            />
          </div>
        </div>
      </div>

      {/* Timeout Settings */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-[var(--color-text-primary)] flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Timeout Settings
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-[var(--color-surface-base)] border border-[var(--color-border)]">
            <div className="text-xs text-[var(--color-text-primary)] mb-2">Connection Timeout</div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={(settings.connectionTimeoutMs ?? 30000) / 1000}
                onChange={(e) =>
                  onUpdate({ connectionTimeoutMs: Number(e.target.value) * 1000 })
                }
                min={5}
                max={300}
                className="flex-1 px-2 py-1 text-xs font-mono rounded bg-[var(--color-surface-elevated)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
              />
              <span className="text-[10px] text-[var(--color-text-muted)]">seconds</span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[var(--color-surface-base)] border border-[var(--color-border)]">
            <div className="text-xs text-[var(--color-text-primary)] mb-2">Tool Execution Timeout</div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={(settings.toolTimeoutMs ?? 60000) / 1000}
                onChange={(e) => onUpdate({ toolTimeoutMs: Number(e.target.value) * 1000 })}
                min={10}
                max={600}
                className="flex-1 px-2 py-1 text-xs font-mono rounded bg-[var(--color-surface-elevated)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
              />
              <span className="text-[10px] text-[var(--color-text-muted)]">seconds</span>
            </div>
          </div>
        </div>
      </div>

      {/* Connection Settings */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-[var(--color-text-primary)] flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Connection Settings
        </h3>

        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-surface-base)] border border-[var(--color-border)]">
            <div>
              <div className="text-xs text-[var(--color-text-primary)]">Retry Failed Connections</div>
              <div className="text-[10px] text-[var(--color-text-muted)]">
                Automatically retry when connection fails
              </div>
            </div>
            <Toggle
              checked={settings.retryFailedConnections ?? true}
              onToggle={() => onUpdate({ retryFailedConnections: !(settings.retryFailedConnections ?? true) })}
              size="sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-[var(--color-surface-base)] border border-[var(--color-border)]">
              <div className="text-xs text-[var(--color-text-primary)] mb-2">Max Connections</div>
              <input
                type="number"
                value={settings.maxConcurrentConnections ?? 10}
                onChange={(e) =>
                  onUpdate({ maxConcurrentConnections: Number(e.target.value) })
                }
                min={1}
                max={50}
                className="w-full px-2 py-1 text-xs font-mono rounded bg-[var(--color-surface-elevated)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
              />
            </div>

            <div className="p-3 rounded-lg bg-[var(--color-surface-base)] border border-[var(--color-border)]">
              <div className="text-xs text-[var(--color-text-primary)] mb-2">Retry Count</div>
              <input
                type="number"
                value={settings.retryCount ?? 3}
                onChange={(e) => onUpdate({ retryCount: Number(e.target.value) })}
                min={0}
                max={10}
                className="w-full px-2 py-1 text-xs font-mono rounded bg-[var(--color-surface-elevated)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

SettingsView.displayName = 'SettingsView';

// =============================================================================
// Main Component
// =============================================================================

export const SettingsMCP: React.FC<SettingsMCPProps> = memo(() => {
  const [viewMode, setViewMode] = useState<ViewMode>('servers');
  const { settings, loading: settingsLoading, updateSettings } = useMCPSettings();
  const servers = useMCPServers();
  const store = useMCPStore();

  // Modal state
  const [addServerModalOpen, setAddServerModalOpen] = useState(false);
  const [detailServerId, setDetailServerId] = useState<string | null>(null);

  // Build set of installed server identifiers for matching with store listings
  // Include: id, name, sourceId (npm package, smithery URL, etc.)
  const installedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const server of servers.servers) {
      // Add all possible identifiers
      ids.add(server.id);
      ids.add(server.id.toLowerCase());
      ids.add(server.name);
      ids.add(server.name.toLowerCase());
      if (server.sourceId) {
        ids.add(server.sourceId);
        ids.add(server.sourceId.toLowerCase());
      }
    }
    return ids;
  }, [servers.servers]);

  // Helper function to check if a listing is installed
  const isListingInstalled = useCallback((listing: MCPStoreListing): boolean => {
    // Check multiple fields for a match
    const checks = [
      listing.id,
      listing.id.toLowerCase(),
      listing.name,
      listing.name.toLowerCase(),
      listing.installCommand,
      listing.installCommand.toLowerCase(),
    ];
    return checks.some((check) => installedIds.has(check));
  }, [installedIds]);

  // Handle store search
  const handleStoreSearch = useCallback(
    (query: string) => {
      if (!query) {
        // Empty query means load all servers
        store.loadAll();
      } else {
        store.setFilters({ ...store.filters, query, offset: 0 });
        store.search();
      }
    },
    [store]
  );

  const handleCategoryFilter = useCallback(
    (category: string | undefined) => {
      if (category === undefined) {
        // Load all servers when "All" is selected
        store.loadAll();
      } else {
        store.setFilters({
          ...store.filters,
          category: category as MCPServerCategory | undefined,
          offset: 0,
        });
        store.search();
      }
    },
    [store]
  );

  const handleInstallFromStore = useCallback(
    async (listingId: string) => {
      const result = await store.installFromStore(listingId, { autoStart: true });
      if (result.success) {
        await servers.refresh();
      }
      return result;
    },
    [store, servers]
  );

  // Handle custom server installation
  const handleInstallServer = useCallback(
    async (request: MCPInstallRequest) => {
      const result = await window.vyotiq.mcp.installServer(request);
      if (result.success) {
        await servers.refresh();
      }
      return result;
    },
    [servers]
  );

  // Handle import of server configs
  const handleImportServers = useCallback(
    async (configs: MCPServerConfig[]) => {
      const results = { success: true, imported: 0, errors: [] as string[] };
      for (const config of configs) {
        try {
          const installRequest: MCPInstallRequest = {
            source: config.source,
            packageId: config.sourceId || config.id,
            name: config.name,
            category: config.category,
            autoStart: false, // Don't auto-start imported servers
          };
          const result = await window.vyotiq.mcp.installServer(installRequest);
          if (result.success) {
            results.imported++;
          } else {
            results.errors.push(`${config.name}: ${result.error}`);
          }
        } catch (error) {
          results.errors.push(`${config.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      results.success = results.imported > 0;
      await servers.refresh();
      return results;
    },
    [servers]
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-[var(--color-accent)]" />
          <h2 className="text-sm font-medium text-[var(--color-text-primary)]">
            MCP Servers
          </h2>
        </div>

        {/* View Mode Tabs */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--color-surface-base)]">
          <button
            onClick={() => setViewMode('servers')}
            className={cn(
              'px-3 py-1.5 text-[10px] font-mono rounded transition-colors',
              viewMode === 'servers'
                ? 'bg-[var(--color-accent)] text-white'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            )}
          >
            <Server className="w-3 h-3 inline-block mr-1" />
            Servers
          </button>
          <button
            onClick={() => setViewMode('store')}
            className={cn(
              'px-3 py-1.5 text-[10px] font-mono rounded transition-colors',
              viewMode === 'store'
                ? 'bg-[var(--color-accent)] text-white'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            )}
          >
            <Store className="w-3 h-3 inline-block mr-1" />
            Store
          </button>
          <button
            onClick={() => setViewMode('tools')}
            className={cn(
              'px-3 py-1.5 text-[10px] font-mono rounded transition-colors',
              viewMode === 'tools'
                ? 'bg-[var(--color-accent)] text-white'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            )}
          >
            <Wrench className="w-3 h-3 inline-block mr-1" />
            Tools
          </button>
          <button
            onClick={() => setViewMode('settings')}
            className={cn(
              'px-3 py-1.5 text-[10px] font-mono rounded transition-colors',
              viewMode === 'settings'
                ? 'bg-[var(--color-accent)] text-white'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            )}
          >
            <Settings2 className="w-3 h-3 inline-block mr-1" />
            Settings
          </button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'servers' && (
        <ServersView
          servers={servers.servers}
          loading={servers.loading}
          onConnect={servers.connectServer}
          onDisconnect={servers.disconnectServer}
          onRestart={servers.restartServer}
          onEnable={servers.enableServer}
          onDisable={servers.disableServer}
          onUninstall={servers.uninstallServer}
          onConnectAll={servers.connectAll}
          onDisconnectAll={servers.disconnectAll}
          onRefresh={servers.refresh}
          onAddServer={() => setAddServerModalOpen(true)}
          onViewDetails={(serverId) => setDetailServerId(serverId)}
        />
      )}

      {viewMode === 'store' && (
        <StoreView
          listings={store.listings}
          featured={store.featured}
          categories={store.categories}
          loading={store.loading}
          hasMore={store.hasMore}
          total={store.total}
          onSearch={handleStoreSearch}
          onCategoryFilter={handleCategoryFilter}
          onLoadMore={store.loadMore}
          onInstall={handleInstallFromStore}
          onRefresh={store.refreshRegistry}
          isInstalled={isListingInstalled}
        />
      )}

      {viewMode === 'tools' && (
        <MCPToolsList maxHeight="calc(100vh - 300px)" />
      )}

      {viewMode === 'settings' && (
        <div className="space-y-6">
          <SettingsView
            settings={settings}
            loading={settingsLoading}
            onUpdate={updateSettings}
          />
          <ImportExportPanel onImport={handleImportServers} />
        </div>
      )}

      {/* Modals */}
      <AddServerModal
        open={addServerModalOpen}
        onClose={() => setAddServerModalOpen(false)}
        onInstall={handleInstallServer}
      />

      {detailServerId && (
        <ServerDetailModal
          open={!!detailServerId}
          onClose={() => setDetailServerId(null)}
          serverId={detailServerId}
        />
      )}
    </div>
  );
});

SettingsMCP.displayName = 'SettingsMCP';

export default SettingsMCP;
