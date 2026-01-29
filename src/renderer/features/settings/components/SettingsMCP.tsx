/**
 * SettingsMCP Component
 * 
 * Settings panel for MCP (Model Context Protocol) server management:
 * - Add/remove/configure MCP servers
 * - Server presets for common integrations
 * - Connection status monitoring
 * - Tool/resource/prompt discovery
 * - Server health and diagnostics
 * - Auto-discovery of available servers
 */

import React, { memo, useState, useCallback, useEffect, useMemo } from 'react';
import {
  Server,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  RefreshCw,
  Plug,
  PlugZap,
  AlertCircle,
  CheckCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Settings2,
  Terminal,
  Globe,
  Wrench,
  FileText,
  MessageSquare,
  Power,
  PowerOff,
  Info,
  Database,
  Cpu,
  GitBranch,
  Search,
  FolderOpen,
  Code2,
  Braces,
  Clock,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Toggle } from '../../../components/ui/Toggle';
import { Button } from '../../../components/ui/Button';
import { createLogger } from '../../../utils/logger';
import { MCPDiscoveryPanel } from './mcp/MCPDiscoveryPanel';
import { MCPHealthDashboard } from './mcp/MCPHealthDashboard';
import type { MCPServerCandidate } from './mcp/MCPDiscoveryPanel';
import type { MCPServerHealthMetrics } from './mcp/MCPHealthDashboard';
import type {
  MCPSettings,
  MCPServerConfig,
  MCPServerState,
} from '../../../../shared/types/mcp';
import { MCP_SERVER_PRESETS } from '../../../../shared/types/mcp';

const logger = createLogger('SettingsMCP');

// =============================================================================
// Types
// =============================================================================

interface SettingsMCPProps {
  settings: MCPSettings;
  serverStates: MCPServerState[];
  onSettingChange: (field: keyof MCPSettings, value: MCPSettings[keyof MCPSettings]) => void;
  onAddServer: (server: Omit<MCPServerConfig, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onUpdateServer: (id: string, updates: Partial<MCPServerConfig>) => Promise<void>;
  onRemoveServer: (id: string) => Promise<void>;
  onConnectServer: (id: string) => Promise<void>;
  onDisconnectServer: (id: string) => Promise<void>;
  onRefreshServers: () => void;
  isLoading?: boolean;
  // Discovery props
  discoveredServers?: MCPServerCandidate[];
  isDiscovering?: boolean;
  onDiscoverServers?: (options?: { workspacePaths?: string[]; includeUnverified?: boolean }) => Promise<void>;
  onAddDiscoveredServer?: (candidate: MCPServerCandidate) => Promise<void>;
  onClearDiscoveryCache?: () => Promise<void>;
  // Health props
  healthMetrics?: MCPServerHealthMetrics[];
  onRefreshHealth?: () => Promise<void>;
  onTriggerRecovery?: (serverId: string) => Promise<void>;
}

// =============================================================================
// Status Badge Component
// =============================================================================

interface StatusBadgeProps {
  status: MCPServerState['status'];
  className?: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = memo(({ status, className }) => {
  const statusConfig: Record<MCPServerState['status'], { color: string; bgColor: string; icon: typeof PowerOff; label: string }> = {
    disconnected: {
      color: 'var(--color-text-muted)',
      bgColor: 'var(--color-surface-3)',
      icon: PowerOff,
      label: 'DISCONNECTED',
    },
    connecting: {
      color: 'var(--color-warning)',
      bgColor: 'var(--color-warning)',
      icon: Loader2,
      label: 'CONNECTING',
    },
    initializing: {
      color: 'var(--color-warning)',
      bgColor: 'var(--color-warning)',
      icon: Loader2,
      label: 'INITIALIZING',
    },
    connected: {
      color: 'var(--color-success)',
      bgColor: 'var(--color-success)',
      icon: CheckCircle,
      label: 'CONNECTED',
    },
    error: {
      color: 'var(--color-error)',
      bgColor: 'var(--color-error)',
      icon: AlertCircle,
      label: 'ERROR',
    },
    reconnecting: {
      color: 'var(--color-warning)',
      bgColor: 'var(--color-warning)',
      icon: RefreshCw,
      label: 'RECONNECTING',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-mono rounded",
        className
      )}
      style={{
        color: config.color,
        backgroundColor: `color-mix(in srgb, ${config.bgColor} 10%, transparent)`,
        borderWidth: '1px',
        borderColor: `color-mix(in srgb, ${config.bgColor} 20%, transparent)`,
      }}
    >
      <Icon
        size={10}
        className={cn(
          status === 'connecting' && 'animate-spin',
          status === 'reconnecting' && 'animate-spin'
        )}
      />
      {config.label}
    </div>
  );
});

StatusBadge.displayName = 'StatusBadge';

// =============================================================================
// Transport Badge Component
// =============================================================================

interface TransportBadgeProps {
  transport: MCPServerConfig['transport'];
}

const TransportBadge: React.FC<TransportBadgeProps> = memo(({ transport }) => {
  const isHttp = transport.type === 'http';
  const Icon = isHttp ? Globe : Terminal;
  const label = isHttp ? 'HTTP' : 'STDIO';

  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[var(--color-surface-2)] text-[var(--color-text-muted)] text-[8px] font-mono rounded">
      <Icon size={8} />
      {label}
    </span>
  );
});

TransportBadge.displayName = 'TransportBadge';

// =============================================================================
// Server Card Component
// =============================================================================

interface ServerCardProps {
  server: MCPServerConfig;
  state: MCPServerState | undefined;
  onEdit: () => void;
  onRemove: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const ServerCard: React.FC<ServerCardProps> = memo(({
  server,
  state,
  onEdit,
  onRemove,
  onConnect,
  onDisconnect,
  isExpanded,
  onToggleExpand,
}) => {
  const status = state?.status ?? 'disconnected';
  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting' || status === 'reconnecting';
  const hasError = status === 'error';

  const toolCount = state?.tools?.length ?? 0;
  const resourceCount = state?.resources?.length ?? 0;
  const promptCount = state?.prompts?.length ?? 0;

  return (
    <div
      className={cn(
        "border rounded transition-all duration-150",
        hasError
          ? "border-[var(--color-error)]/30 bg-[var(--color-error)]/5"
          : isConnected
          ? "border-[var(--color-success)]/30 bg-[var(--color-success)]/5"
          : "border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-3">
        <button
          onClick={onToggleExpand}
          className="p-1 hover:bg-[var(--color-surface-3)] rounded transition-colors"
        >
          {isExpanded ? (
            <ChevronDown size={12} className="text-[var(--color-text-muted)]" />
          ) : (
            <ChevronRight size={12} className="text-[var(--color-text-muted)]" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--color-text-primary)] font-medium truncate">
              {server.name}
            </span>
            <TransportBadge transport={server.transport} />
            <StatusBadge status={status} />
          </div>
          {server.description && (
            <p className="text-[9px] text-[var(--color-text-muted)] truncate mt-0.5">
              {server.description}
            </p>
          )}
        </div>

        {/* Quick stats */}
        {isConnected && (
          <div className="flex items-center gap-3 text-[9px] text-[var(--color-text-muted)]">
            <span className="flex items-center gap-1">
              <Wrench size={10} /> {toolCount}
            </span>
            <span className="flex items-center gap-1">
              <FileText size={10} /> {resourceCount}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare size={10} /> {promptCount}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1">
          {isConnected || isConnecting ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onDisconnect}
              disabled={isConnecting}
              className="h-6 w-6"
              title="Disconnect"
            >
              <PowerOff size={12} />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={onConnect}
              className="h-6 w-6"
              title="Connect"
            >
              <Power size={12} className="text-[var(--color-success)]" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
            className="h-6 w-6"
            title="Edit"
          >
            <Edit2 size={12} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="h-6 w-6"
            title="Remove"
          >
            <Trash2 size={12} className="text-[var(--color-error)]" />
          </Button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-[var(--color-border-subtle)] p-3 space-y-3 animate-in slide-in-from-top-1 fade-in duration-150">
          {/* Connection details with copy functionality */}
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="flex items-center gap-1">
              <span className="text-[var(--color-text-muted)]"># Transport:</span>
              <span className="ml-2 text-[var(--color-text-secondary)] font-mono">
                {server.transport.type === 'stdio'
                  ? server.transport.command
                  : server.transport.url}
              </span>
              <button
                onClick={() => {
                  const text = server.transport.type === 'stdio'
                    ? `${server.transport.command} ${server.transport.args?.join(' ') ?? ''}`
                    : server.transport.url;
                  navigator.clipboard.writeText(text);
                }}
                className="p-0.5 hover:bg-[var(--color-surface-3)] rounded"
                title="Copy to clipboard"
              >
                <Copy size={10} className="text-[var(--color-text-muted)]" />
              </button>
              {server.transport.type === 'http' && (
                <a
                  href={server.transport.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-0.5 hover:bg-[var(--color-surface-3)] rounded"
                  title="Open in browser"
                >
                  <ExternalLink size={10} className="text-[var(--color-text-muted)]" />
                </a>
              )}
            </div>
            {server.transport.type === 'stdio' && server.transport.args && (
              <div>
                <span className="text-[var(--color-text-muted)]"># Args:</span>
                <span className="ml-2 text-[var(--color-text-secondary)] font-mono">
                  {server.transport.args.join(' ')}
                </span>
              </div>
            )}
          </div>

          {/* Connection timing */}
          {state?.connectedAt && (
            <div className="flex items-center gap-2 text-[9px] text-[var(--color-text-muted)]">
              <Clock size={10} />
              Connected since: {new Date(state.connectedAt).toLocaleString()}
            </div>
          )}

          {/* Error message */}
          {state?.error && (
            <div className="flex items-start gap-2 p-2 rounded bg-[var(--color-error)]/10 border border-[var(--color-error)]/20">
              <AlertCircle size={12} className="text-[var(--color-error)] mt-0.5" />
              <p className="text-[9px] text-[var(--color-error)]">{state.error}</p>
            </div>
          )}

          {/* Server info */}
          {state?.serverInfo && (
            <div className="p-2 rounded bg-[var(--color-surface-3)] text-[9px]">
              <div className="flex items-center gap-2 mb-1">
                <Info size={10} className="text-[var(--color-accent-secondary)]" />
                <span className="text-[var(--color-text-muted)]">Server Info</span>
              </div>
              <div className="grid grid-cols-2 gap-1 ml-4">
                <span className="text-[var(--color-text-muted)]">Name:</span>
                <span className="text-[var(--color-text-secondary)]">{state.serverInfo.name}</span>
                <span className="text-[var(--color-text-muted)]">Version:</span>
                <span className="text-[var(--color-text-secondary)]">{state.serverInfo.version}</span>
              </div>
            </div>
          )}

          {/* Tools list */}
          {state?.tools && state.tools.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Wrench size={10} className="text-[var(--color-accent-primary)]" />
                <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider">
                  Tools ({state.tools.length})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {state.tools.map((tool) => (
                  <div
                    key={tool.name}
                    className="flex items-center gap-2 p-1.5 rounded bg-[var(--color-surface-3)] text-[9px]"
                    title={tool.description}
                  >
                    <Code2 size={10} className="text-[var(--color-accent-primary)]" />
                    <span className="text-[var(--color-text-secondary)] truncate">
                      {tool.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resources list */}
          {state?.resources && state.resources.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileText size={10} className="text-[var(--color-accent-secondary)]" />
                <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider">
                  Resources ({state.resources.length})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {state.resources.slice(0, 6).map((resource) => (
                  <div
                    key={resource.uri}
                    className="flex items-center gap-2 p-1.5 rounded bg-[var(--color-surface-3)] text-[9px]"
                    title={resource.description}
                  >
                    <Database size={10} className="text-[var(--color-accent-secondary)]" />
                    <span className="text-[var(--color-text-secondary)] truncate">
                      {resource.name}
                    </span>
                  </div>
                ))}
                {state.resources.length > 6 && (
                  <div className="flex items-center gap-2 p-1.5 text-[9px] text-[var(--color-text-muted)]">
                    +{state.resources.length - 6} more...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Prompts list */}
          {state?.prompts && state.prompts.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare size={10} className="text-[var(--color-warning)]" />
                <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider">
                  Prompts ({state.prompts.length})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {state.prompts.map((prompt) => (
                  <div
                    key={prompt.name}
                    className="flex items-center gap-2 p-1.5 rounded bg-[var(--color-surface-3)] text-[9px]"
                    title={prompt.description}
                  >
                    <Braces size={10} className="text-[var(--color-warning)]" />
                    <span className="text-[var(--color-text-secondary)] truncate">
                      {prompt.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

ServerCard.displayName = 'ServerCard';

// =============================================================================
// Add Server Modal Component
// =============================================================================

interface AddServerModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (server: Omit<MCPServerConfig, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  editServer?: MCPServerConfig;
  onUpdate?: (id: string, updates: Partial<MCPServerConfig>) => Promise<void>;
}

const AddServerModal: React.FC<AddServerModalProps> = memo(({
  open,
  onClose,
  onAdd,
  editServer,
  onUpdate,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [transportType, setTransportType] = useState<'stdio' | 'http'>('stdio');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');
  const [env, setEnv] = useState('');
  const [autoConnect, setAutoConnect] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!editServer;

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      if (editServer) {
        setName(editServer.name);
        setDescription(editServer.description || '');
        setTransportType(editServer.transport.type);
        if (editServer.transport.type === 'stdio') {
          setCommand(editServer.transport.command);
          setArgs(editServer.transport.args?.join(' ') || '');
          setEnv(editServer.transport.env
            ? Object.entries(editServer.transport.env).map(([k, v]) => `${k}=${v}`).join('\n')
            : '');
        } else {
          setUrl(editServer.transport.url);
        }
        setAutoConnect(editServer.autoConnect);
      } else {
        setName('');
        setDescription('');
        setTransportType('stdio');
        setCommand('');
        setArgs('');
        setUrl('');
        setEnv('');
        setAutoConnect(false);
      }
      setError(null);
    }
  }, [open, editServer]);

  const handleSubmit = async () => {
    setError(null);

    // Validation
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (transportType === 'stdio' && !command.trim()) {
      setError('Command is required for stdio transport');
      return;
    }

    if (transportType === 'http' && !url.trim()) {
      setError('URL is required for HTTP transport');
      return;
    }

    // Parse environment variables
    const envMap: Record<string, string> = {};
    if (env.trim()) {
      for (const line of env.split('\n')) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          envMap[key.trim()] = valueParts.join('=').trim();
        }
      }
    }

    const serverConfig: Omit<MCPServerConfig, 'id' | 'createdAt' | 'updatedAt'> = {
      name: name.trim(),
      description: description.trim() || undefined,
      enabled: true,
      autoConnect,
      transport: transportType === 'stdio'
        ? {
            type: 'stdio',
            command: command.trim(),
            args: args.trim() ? args.trim().split(/\s+/) : undefined,
            env: Object.keys(envMap).length > 0 ? envMap : undefined,
          }
        : {
            type: 'http',
            url: url.trim(),
          },
    };

    setIsSubmitting(true);
    try {
      if (isEditing && editServer && onUpdate) {
        await onUpdate(editServer.id, serverConfig);
      } else {
        await onAdd(serverConfig);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save server');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-100">
      <div className="w-full max-w-lg mx-4 border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] rounded animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-header)]">
          <div className="flex items-center gap-2">
            <Server size={14} className="text-[var(--color-accent-primary)]" />
            <span className="text-[11px] text-[var(--color-text-primary)] font-medium">
              {isEditing ? 'Edit MCP Server' : 'Add MCP Server'}
            </span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6">
            <X size={12} />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-[10px] text-[var(--color-text-muted)] mb-1">
              # Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-mcp-server"
              className="w-full px-3 py-2 text-[11px] font-mono bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded focus:border-[var(--color-accent-primary)] focus:outline-none text-[var(--color-text-primary)]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] text-[var(--color-text-muted)] mb-1">
              # Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              className="w-full px-3 py-2 text-[11px] font-mono bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded focus:border-[var(--color-accent-primary)] focus:outline-none text-[var(--color-text-primary)]"
            />
          </div>

          {/* Transport Type */}
          <div>
            <label className="block text-[10px] text-[var(--color-text-muted)] mb-2">
              # Transport Type
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setTransportType('stdio')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-3 py-2 text-[10px] font-mono rounded border transition-colors",
                  transportType === 'stdio'
                    ? "bg-[var(--color-accent-primary)]/10 border-[var(--color-accent-primary)]/30 text-[var(--color-accent-primary)]"
                    : "bg-[var(--color-surface-2)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:border-[var(--color-border-default)]"
                )}
              >
                <Terminal size={12} />
                STDIO
              </button>
              <button
                onClick={() => setTransportType('http')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-3 py-2 text-[10px] font-mono rounded border transition-colors",
                  transportType === 'http'
                    ? "bg-[var(--color-accent-primary)]/10 border-[var(--color-accent-primary)]/30 text-[var(--color-accent-primary)]"
                    : "bg-[var(--color-surface-2)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:border-[var(--color-border-default)]"
                )}
              >
                <Globe size={12} />
                HTTP
              </button>
            </div>
          </div>

          {/* STDIO fields */}
          {transportType === 'stdio' && (
            <>
              <div>
                <label className="block text-[10px] text-[var(--color-text-muted)] mb-1">
                  # Command *
                </label>
                <input
                  type="text"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="npx, uvx, node, python..."
                  className="w-full px-3 py-2 text-[11px] font-mono bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded focus:border-[var(--color-accent-primary)] focus:outline-none text-[var(--color-text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[10px] text-[var(--color-text-muted)] mb-1">
                  # Arguments
                </label>
                <input
                  type="text"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder="-y @modelcontextprotocol/server-filesystem /path"
                  className="w-full px-3 py-2 text-[11px] font-mono bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded focus:border-[var(--color-accent-primary)] focus:outline-none text-[var(--color-text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[10px] text-[var(--color-text-muted)] mb-1">
                  # Environment Variables (KEY=value, one per line)
                </label>
                <textarea
                  value={env}
                  onChange={(e) => setEnv(e.target.value)}
                  placeholder="GITHUB_TOKEN=ghp_xxx&#10;API_KEY=sk-xxx"
                  rows={3}
                  className="w-full px-3 py-2 text-[11px] font-mono bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded focus:border-[var(--color-accent-primary)] focus:outline-none text-[var(--color-text-primary)] resize-none"
                />
              </div>
            </>
          )}

          {/* HTTP fields */}
          {transportType === 'http' && (
            <div>
              <label className="block text-[10px] text-[var(--color-text-muted)] mb-1">
                # URL *
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://localhost:3000/mcp"
                className="w-full px-3 py-2 text-[11px] font-mono bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded focus:border-[var(--color-accent-primary)] focus:outline-none text-[var(--color-text-primary)]"
              />
            </div>
          )}

          {/* Auto Connect */}
          <Toggle
            checked={autoConnect}
            onToggle={() => setAutoConnect(!autoConnect)}
            label="Auto Connect"
            description="Connect automatically when agent starts"
          />

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-2 rounded bg-[var(--color-error)]/10 border border-[var(--color-error)]/20">
              <AlertCircle size={12} className="text-[var(--color-error)]" />
              <p className="text-[10px] text-[var(--color-error)]">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-header)]">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={isSubmitting}
            isLoading={isSubmitting}
            leftIcon={!isSubmitting && <Check size={12} />}
          >
            {isEditing ? 'Update' : 'Add Server'}
          </Button>
        </div>
      </div>
    </div>
  );
});

AddServerModal.displayName = 'AddServerModal';

// =============================================================================
// Presets Panel Component
// =============================================================================

interface PresetsPanelProps {
  onSelectPreset: (preset: typeof MCP_SERVER_PRESETS[0]) => void;
}

const PresetsPanel: React.FC<PresetsPanelProps> = memo(({ onSelectPreset }) => {
  const [expanded, setExpanded] = useState(false);

  // Import presets from utils (we'll need to make them available)
  const presets = [
    { id: 'filesystem', name: 'Filesystem', description: 'Read/write local files', icon: FolderOpen },
    { id: 'fetch', name: 'Fetch', description: 'HTTP requests', icon: Globe },
    { id: 'github', name: 'GitHub', description: 'GitHub API', icon: GitBranch },
    { id: 'sqlite', name: 'SQLite', description: 'Database queries', icon: Database },
    { id: 'memory', name: 'Memory', description: 'Knowledge graph', icon: Cpu },
    { id: 'puppeteer', name: 'Puppeteer', description: 'Browser automation', icon: Search },
  ];

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left py-2"
      >
        <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-2">
          <PlugZap size={10} />
          # Quick Add from Presets
        </div>
        <ChevronDown
          size={12}
          className={cn(
            "text-[var(--color-text-muted)] transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <div className="grid grid-cols-3 gap-2 mt-2 animate-in slide-in-from-top-1 fade-in duration-150">
          {presets.map((preset) => {
            const Icon = preset.icon;
            return (
              <button
                key={preset.id}
                onClick={() => {
                  // Find matching preset from actual presets
                  const actualPreset = MCP_SERVER_PRESETS.find(p => p.id === preset.id);
                  if (actualPreset) {
                    onSelectPreset(actualPreset);
                  }
                }}
                className="flex items-center gap-2 p-2 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] hover:border-[var(--color-accent-primary)]/50 hover:bg-[var(--color-surface-3)] transition-all"
              >
                <Icon size={12} className="text-[var(--color-accent-primary)]" />
                <div className="text-left">
                  <p className="text-[10px] text-[var(--color-text-secondary)]">{preset.name}</p>
                  <p className="text-[8px] text-[var(--color-text-muted)]">{preset.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

PresetsPanel.displayName = 'PresetsPanel';

// =============================================================================
// Main SettingsMCP Component
// =============================================================================

export const SettingsMCP: React.FC<SettingsMCPProps> = memo(({
  settings,
  serverStates,
  onSettingChange,
  onAddServer,
  onUpdateServer,
  onRemoveServer,
  onConnectServer,
  onDisconnectServer,
  onRefreshServers,
  isLoading,
  discoveredServers = [],
  isDiscovering = false,
  onDiscoverServers,
  onAddDiscoveredServer,
  onClearDiscoveryCache,
  healthMetrics = [],
  onRefreshHealth,
  onTriggerRecovery,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingServer, setEditingServer] = useState<MCPServerConfig | undefined>();
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());
  const [isRefreshingHealth, setIsRefreshingHealth] = useState(false);

  const servers = settings.servers;
  const existingServerNames = servers.map(s => s.name);

  const toggleServerExpanded = useCallback((serverId: string) => {
    setExpandedServers((prev) => {
      const next = new Set(prev);
      if (next.has(serverId)) {
        next.delete(serverId);
      } else {
        next.add(serverId);
      }
      return next;
    });
  }, []);

  const handleEditServer = useCallback((server: MCPServerConfig) => {
    setEditingServer(server);
    setShowAddModal(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowAddModal(false);
    setEditingServer(undefined);
  }, []);

  const handlePresetSelect = useCallback(async (preset: typeof MCP_SERVER_PRESETS[0]) => {
    // Create server from preset
    const serverConfig: Omit<MCPServerConfig, 'id' | 'createdAt' | 'updatedAt'> = {
      name: preset.name,
      description: preset.description,
      enabled: true,
      autoConnect: false,
      transport: preset.transport,
    };

    // Open modal with preset values pre-filled
    setEditingServer(undefined);
    // We'll show a custom modal for presets or just add directly
    try {
      await onAddServer(serverConfig);
    } catch (err) {
      logger.error('Failed to add preset server', err);
    }
  }, [onAddServer]);

  // Handler for refreshing health metrics
  const handleRefreshHealth = useCallback(async () => {
    if (!onRefreshHealth) return;
    setIsRefreshingHealth(true);
    try {
      await onRefreshHealth();
    } finally {
      setIsRefreshingHealth(false);
    }
  }, [onRefreshHealth]);

  // Stats - memoized to avoid recalculation on every render
  const serverStats = useMemo(() => {
    const connectedCount = serverStates.filter(s => s.status === 'connected').length;
    const totalTools = serverStates.reduce((acc, s) => acc + (s.tools?.length ?? 0), 0);
    const totalResources = serverStates.reduce((acc, s) => acc + (s.resources?.length ?? 0), 0);
    const totalPrompts = serverStates.reduce((acc, s) => acc + (s.prompts?.length ?? 0), 0);
    const errorCount = serverStates.filter(s => s.status === 'error').length;
    return { connectedCount, totalTools, totalResources, totalPrompts, errorCount };
  }, [serverStates]);

  return (
    <div className="space-y-6 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[13px] text-[var(--color-text-primary)] font-medium flex items-center gap-2">
            <Server size={14} className="text-[var(--color-accent-primary)]" />
            MCP Servers
          </h3>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
            # Connect to Model Context Protocol servers for extended capabilities
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefreshServers}
            disabled={isLoading}
            leftIcon={<RefreshCw size={12} className={cn(isLoading && 'animate-spin')} />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowAddModal(true)}
            leftIcon={<Plus size={12} />}
          >
            Add Server
          </Button>
        </div>
      </div>

      {/* Global Settings */}
      <div className="space-y-3 p-3 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]">
        <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-2">
          <Settings2 size={10} />
          # Global Settings
        </div>

        <Toggle
          checked={settings.enabled}
          onToggle={() => onSettingChange('enabled', !settings.enabled)}
          label="Enable MCP"
          description="Allow the agent to use MCP servers"
        />

        <Toggle
          checked={settings.autoReconnect}
          onToggle={() => onSettingChange('autoReconnect', !settings.autoReconnect)}
          label="Auto Reconnect"
          description="Automatically reconnect to servers on connection loss"
        />

        <div>
          <label className="block text-[10px] text-[var(--color-text-muted)] mb-1">
            # Default Timeout (ms)
          </label>
          <input
            type="number"
            value={settings.defaultTimeout}
            onChange={(e) => onSettingChange('defaultTimeout', parseInt(e.target.value) || 30000)}
            min={5000}
            max={120000}
            step={1000}
            className="w-32 px-2 py-1 text-[10px] font-mono bg-[var(--color-surface-3)] border border-[var(--color-border-subtle)] rounded focus:border-[var(--color-accent-primary)] focus:outline-none text-[var(--color-text-primary)]"
          />
        </div>
      </div>

      {/* Stats */}
      {servers.length > 0 && (
        <div className="flex items-center gap-4 text-[10px]">
          <span className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
            <Server size={10} />
            {servers.length} server{servers.length !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1.5 text-[var(--color-success)]">
            <CheckCircle size={10} />
            {serverStats.connectedCount} connected
          </span>
          {serverStats.errorCount > 0 && (
            <span className="flex items-center gap-1.5 text-[var(--color-error)]">
              <AlertCircle size={10} />
              {serverStats.errorCount} error{serverStats.errorCount !== 1 ? 's' : ''}
            </span>
          )}
          <span className="flex items-center gap-1.5 text-[var(--color-accent-primary)]">
            <Wrench size={10} />
            {serverStats.totalTools} tools
          </span>
          <span className="flex items-center gap-1.5 text-[var(--color-accent-secondary)]">
            <FileText size={10} />
            {serverStats.totalResources} resources
          </span>
          <span className="flex items-center gap-1.5 text-[var(--color-warning)]">
            <MessageSquare size={10} />
            {serverStats.totalPrompts} prompts
          </span>
        </div>
      )}

      {/* Presets */}
      <PresetsPanel onSelectPreset={handlePresetSelect} />

      {/* Server Discovery Panel */}
      {onDiscoverServers && onAddDiscoveredServer && onClearDiscoveryCache && (
        <MCPDiscoveryPanel
          discoveredServers={discoveredServers}
          isDiscovering={isDiscovering}
          existingServerNames={existingServerNames}
          onDiscover={onDiscoverServers}
          onAddServer={onAddDiscoveredServer}
          onClearCache={onClearDiscoveryCache}
        />
      )}

      {/* Server Health Dashboard */}
      {healthMetrics.length > 0 && onTriggerRecovery && (
        <MCPHealthDashboard
          healthMetrics={healthMetrics}
          onRefresh={handleRefreshHealth}
          onTriggerRecovery={onTriggerRecovery}
          isRefreshing={isRefreshingHealth}
        />
      )}

      {/* Server List */}
      <div className="space-y-2">
        <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-2">
          <Plug size={10} />
          # Configured Servers
        </div>

        {servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center border border-dashed border-[var(--color-border-subtle)] rounded">
            <Server size={24} className="text-[var(--color-text-muted)] mb-2" />
            <p className="text-[11px] text-[var(--color-text-muted)]">No MCP servers configured</p>
            <p className="text-[9px] text-[var(--color-text-muted)] mt-1">
              Add a server to extend agent capabilities
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowAddModal(true)}
              className="mt-3"
              leftIcon={<Plus size={12} />}
            >
              Add Server
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {servers.map((server) => {
              const state = serverStates.find(s => s.config.id === server.id);
              return (
                <ServerCard
                  key={server.id}
                  server={server}
                  state={state}
                  onEdit={() => handleEditServer(server)}
                  onRemove={() => onRemoveServer(server.id)}
                  onConnect={() => onConnectServer(server.id)}
                  onDisconnect={() => onDisconnectServer(server.id)}
                  isExpanded={expandedServers.has(server.id)}
                  onToggleExpand={() => toggleServerExpanded(server.id)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <AddServerModal
        open={showAddModal}
        onClose={handleCloseModal}
        onAdd={onAddServer}
        editServer={editingServer}
        onUpdate={onUpdateServer}
      />
    </div>
  );
});

SettingsMCP.displayName = 'SettingsMCP';

export default SettingsMCP;
