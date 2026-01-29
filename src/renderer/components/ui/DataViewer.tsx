/**
 * Interactive Data Viewer Component
 * 
 * Renders structured data in an interactive, collapsible tree view.
 * Supports JSON, objects, arrays, and nested structures.
 */
import React, { memo, useState, useCallback, useMemo } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  Copy, 
  Check,
  Hash,
  Type,
  ToggleLeft,
  List,
  Braces,
  AlertCircle,
} from 'lucide-react';
import { cn } from '../../utils/cn';

interface DataViewerProps {
  /** Data to display */
  data: unknown;
  /** Title for the viewer */
  title?: string;
  /** Initial expanded depth (default: 2) */
  initialDepth?: number;
  /** Maximum depth to render (default: 10) */
  maxDepth?: number;
  /** Whether to show root brackets */
  showRoot?: boolean;
  /** Compact mode with less spacing */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// Type detection helpers
const getType = (value: unknown): string => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'string': return Type;
    case 'number': return Hash;
    case 'boolean': return ToggleLeft;
    case 'array': return List;
    case 'object': return Braces;
    default: return AlertCircle;
  }
};

const getTypeColor = (type: string): string => {
  switch (type) {
    case 'string': return 'text-[var(--color-success)]';
    case 'number': return 'text-[var(--color-info)]';
    case 'boolean': return 'text-[var(--color-warning)]';
    case 'null':
    case 'undefined': return 'text-[var(--color-text-dim)]';
    default: return 'text-[var(--color-text-secondary)]';
  }
};

interface TreeNodeProps {
  keyName?: string;
  value: unknown;
  depth: number;
  initialExpanded: boolean;
  maxDepth: number;
  isLast: boolean;
  compact: boolean;
}

const TreeNode: React.FC<TreeNodeProps> = memo(({
  keyName,
  value,
  depth,
  initialExpanded,
  maxDepth,
  compact,
}) => {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const [copied, setCopied] = useState(false);

  const type = getType(value);
  const isExpandable = type === 'object' || type === 'array';
  const TypeIcon = getTypeIcon(type);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  const renderValue = () => {
    switch (type) {
      case 'string': {
        const strVal = value as string;
        const truncated = strVal.length > 100;
        return (
          <span className={cn(getTypeColor(type), "font-mono text-[10px]")}>
            "{truncated ? strVal.slice(0, 100) + '...' : strVal}"
          </span>
        );
      }
      case 'number':
        return (
          <span className={cn(getTypeColor(type), "font-mono text-[10px]")}>
            {String(value)}
          </span>
        );
      case 'boolean':
        return (
          <span className={cn(getTypeColor(type), "font-mono text-[10px]")}>
            {String(value)}
          </span>
        );
      case 'null':
        return (
          <span className={cn(getTypeColor(type), "font-mono text-[10px] italic")}>
            null
          </span>
        );
      case 'undefined':
        return (
          <span className={cn(getTypeColor(type), "font-mono text-[10px] italic")}>
            undefined
          </span>
        );
      case 'array': {
        const arr = value as unknown[];
        if (!isExpanded) {
          return (
            <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
              [{arr.length} items]
            </span>
          );
        }
        return null;
      }
      case 'object': {
        const obj = value as Record<string, unknown>;
        const keys = Object.keys(obj);
        if (!isExpanded) {
          return (
            <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
              {'{' + keys.length + ' keys}'}
            </span>
          );
        }
        return null;
      }
      default:
        return (
          <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
            {String(value)}
          </span>
        );
    }
  };

  const renderChildren = () => {
    if (!isExpanded || depth >= maxDepth) return null;

    if (type === 'array') {
      const arr = value as unknown[];
      return arr.map((item, idx) => (
        <TreeNode
          key={idx}
          keyName={String(idx)}
          value={item}
          depth={depth + 1}
          initialExpanded={depth + 1 < 2}
          maxDepth={maxDepth}
          isLast={idx === arr.length - 1}
          compact={compact}
        />
      ));
    }

    if (type === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      const entries = Object.entries(obj);
      return entries.map(([key, val], idx) => (
        <TreeNode
          key={key}
          keyName={key}
          value={val}
          depth={depth + 1}
          initialExpanded={depth + 1 < 2}
          maxDepth={maxDepth}
          isLast={idx === entries.length - 1}
          compact={compact}
        />
      ));
    }

    return null;
  };

  const indent = depth * (compact ? 12 : 16);

  return (
    <div className="select-text">
      {/* Node row */}
      <div
        className={cn(
          "flex items-center gap-1 group",
          "hover:bg-[var(--color-surface-2)]/50 rounded-sm",
          compact ? "py-0.5" : "py-1"
        )}
        style={{ paddingLeft: indent }}
      >
        {/* Expand/collapse button */}
        {isExpandable ? (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
            className={cn(
              "p-0.5 rounded hover:bg-[var(--color-surface-3)] text-[var(--color-text-muted)]",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
            )}
          >
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-4" />
        )}

        {/* Type icon */}
        <TypeIcon size={10} className={cn(getTypeColor(type), "flex-shrink-0")} />

        {/* Key name */}
        {keyName !== undefined && (
          <>
            <span className="font-mono text-[10px] text-[var(--color-accent-secondary)]">
              {keyName}
            </span>
            <span className="text-[10px] text-[var(--color-text-dim)]">:</span>
          </>
        )}

        {/* Value or summary */}
        {renderValue()}

        {/* Copy button */}
        <button
          onClick={handleCopy}
          className={cn(
            "ml-auto p-0.5 rounded opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity",
            "hover:bg-[var(--color-surface-3)]",
            copied ? "text-[var(--color-success)]" : "text-[var(--color-text-muted)]",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
          )}
          title="Copy value"
          aria-label="Copy value"
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
        </button>
      </div>

      {/* Children */}
      {renderChildren()}
    </div>
  );
});

TreeNode.displayName = 'TreeNode';

export const DataViewer: React.FC<DataViewerProps> = memo(({
  data,
  title,
  initialDepth: _initialDepth = 2,
  maxDepth = 10,
  showRoot = true,
  compact = false,
  className,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyAll = useCallback(async () => {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data]);

  const type = getType(data);
  const summary = useMemo(() => {
    if (type === 'array') {
      return `${(data as unknown[]).length} items`;
    }
    if (type === 'object' && data !== null) {
      return `${Object.keys(data as Record<string, unknown>).length} keys`;
    }
    return type;
  }, [data, type]);

  return (
    <div className={cn(
      "rounded-lg border border-[var(--color-border-subtle)] overflow-hidden",
      "bg-[var(--color-surface-1)]",
      className
    )}>
      {/* Header */}
      {(title || showRoot) && (
        <div className="flex items-center justify-between px-3 py-2 bg-[var(--color-surface-2)] border-b border-[var(--color-border-subtle)]">
          <div className="flex items-center gap-2">
            <Braces size={12} className="text-[var(--color-text-muted)]" />
            <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">
              {title || 'Data'}
            </span>
            <span className="text-[9px] text-[var(--color-text-dim)]">
              ({summary})
            </span>
          </div>
          <button
            onClick={handleCopyAll}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 text-[9px] rounded transition-colors",
              "hover:bg-[var(--color-surface-3)]",
              copied ? "text-[var(--color-success)]" : "text-[var(--color-text-muted)]",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
            )}
            aria-label={copied ? 'Copied' : 'Copy all'}
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
            <span>{copied ? 'Copied' : 'Copy all'}</span>
          </button>
        </div>
      )}

      {/* Tree content */}
      <div className={cn(
        "overflow-auto max-h-[400px]",
        compact ? "p-2" : "p-3",
        "scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)]"
      )}>
        <TreeNode
          value={data}
          depth={0}
          initialExpanded={true}
          maxDepth={maxDepth}
          isLast={true}
          compact={compact}
        />
      </div>
    </div>
  );
});

DataViewer.displayName = 'DataViewer';

export default DataViewer;
