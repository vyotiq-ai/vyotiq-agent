/**
 * MCP Store View Component
 *
 * Displays the MCP server marketplace/store with search,
 * category filters, and install functionality.
 *
 * @module renderer/features/settings/components/mcp/MCPStoreView
 */

import React, { memo, useState, useCallback, useEffect } from 'react';
import {
  Server,
  Search,
  Download,
  RefreshCw,
} from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { Button } from '../../../../components/ui/Button';
import { Spinner } from '../../../../components/ui/LoadingState';
import { Input } from '../../../../components/ui/Input';
import type {
  MCPStoreListing,
  MCPServerCategory,
} from '../../../../../shared/types/mcp';

// =============================================================================
// Types
// =============================================================================

export interface MCPStoreViewProps {
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

// =============================================================================
// Category Labels
// =============================================================================

const CATEGORY_LABELS: Record<MCPServerCategory, string> = {
  database: 'database',
  api: 'api',
  'file-system': 'file-system',
  browser: 'browser',
  'developer-tools': 'dev-tools',
  productivity: 'productivity',
  cloud: 'cloud',
  communication: 'comms',
  ai: 'ai',
  analytics: 'analytics',
  security: 'security',
  other: 'other',
};

// =============================================================================
// Store Listing Card
// =============================================================================

interface StoreCardProps {
  listing: MCPStoreListing;
  isInstalled: boolean;
  onInstall: () => void;
  isInstalling?: boolean;
}

const StoreCard: React.FC<StoreCardProps> = memo(
  ({ listing, isInstalled, onInstall, isInstalling }) => {
    return (
      <div
        className={cn(
          'border px-3 py-2 font-mono',
          'bg-[var(--color-surface-elevated)] border-[var(--color-border)]',
          'hover:border-[var(--color-accent)]',
          isInstalled && 'border-[var(--color-success)]'
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[var(--color-text-primary)] truncate">
                {listing.name}
              </span>
              {listing.verified && (
                <span className="text-[9px] text-[var(--color-success)]">[verified]</span>
              )}
              {isInstalled && (
                <span className="text-[9px] text-[var(--color-success)]">[installed]</span>
              )}
            </div>
            <div className="text-[10px] text-[var(--color-text-muted)] line-clamp-2 mt-0.5">
              # {listing.description}
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mt-2">
          <span className="text-[9px] text-[var(--color-accent)]">
            [{CATEGORY_LABELS[listing.category] || listing.category}]
          </span>
          {listing.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-[9px] text-[var(--color-text-dim)]"
            >
              #{tag}
            </span>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-3 text-[9px] text-[var(--color-text-dim)]">
            <span>{listing.author}</span>
            <span>v{listing.version}</span>
            {listing.downloads !== undefined && listing.downloads > 0 && (
              <span>
                {listing.downloads > 1000
                  ? `${(listing.downloads / 1000).toFixed(1)}k`
                  : listing.downloads}{' '}
                dl
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

StoreCard.displayName = 'StoreCard';

// =============================================================================
// Main Component
// =============================================================================

export const MCPStoreView: React.FC<MCPStoreViewProps> = memo(
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
        if (viewMode === 'all') {
          onSearch('');
        }
      } finally {
        setRefreshing(false);
      }
    };

    const displayListings = viewMode === 'featured' ? featured : listings;
    const showFeatured = viewMode === 'featured';

    return (
      <div className="space-y-3 font-mono">
        {/* Search Bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="search mcp servers..."
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
            variant="ghost"
            onClick={handleRefresh}
            isLoading={refreshing}
            title="Refresh registry"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => handleCategorySelect(undefined)}
            className={cn(
              'px-2 py-0.5 text-[10px] transition-colors',
              !selectedCategory && viewMode !== 'featured'
                ? 'text-[var(--color-accent)] bg-[var(--color-accent)]/10'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            )}
          >
            [all]
          </button>
          {categories.map(({ category, count }) => {
            const label = CATEGORY_LABELS[category as MCPServerCategory] || category;
            return (
              <button
                key={category}
                onClick={() => handleCategorySelect(category)}
                className={cn(
                  'px-2 py-0.5 text-[10px] transition-colors',
                  selectedCategory === category
                    ? 'text-[var(--color-accent)] bg-[var(--color-accent)]/10'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                )}
              >
                [{label}:{count}]
              </button>
            );
          })}
        </div>

        {/* Listings */}
        {loading && displayListings.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="md" colorVariant="secondary" />
          </div>
        ) : displayListings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Server className="w-8 h-8 text-[var(--color-text-muted)] mb-2" />
            <p className="text-[11px] text-[var(--color-text-muted)]">no servers found</p>
            <p className="text-[10px] text-[var(--color-text-dim)] mt-1">
              {viewMode === 'all' ? '# loading...' : '# try different search terms'}
            </p>
          </div>
        ) : (
          <>
            {/* View Mode Header */}
            <div className="flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-2">
                <span className="text-[var(--color-text-muted)]">
                  {showFeatured ? '# featured servers' : '# all servers'}
                </span>
                {!showFeatured && (
                  <span className="text-[var(--color-text-dim)]">
                    ({displayListings.length}{hasMore ? ` of ${total}` : ''})
                  </span>
                )}
              </div>
              {showFeatured && total > 0 && (
                <button
                  onClick={() => handleCategorySelect(undefined)}
                  className="text-[var(--color-accent)] hover:underline"
                >
                  view all {total} servers →
                </button>
              )}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {displayListings.map((listing) => (
                <StoreCard
                  key={listing.id}
                  listing={listing}
                  isInstalled={isInstalled(listing)}
                  onInstall={() => handleInstall(listing.id)}
                  isInstalling={installingId === listing.id}
                />
              ))}
            </div>

            {/* Load More */}
            {hasMore && !showFeatured && (
              <div className="flex justify-center pt-2">
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

MCPStoreView.displayName = 'MCPStoreView';

export default MCPStoreView;
