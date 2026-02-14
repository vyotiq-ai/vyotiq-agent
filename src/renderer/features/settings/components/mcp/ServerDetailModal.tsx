/**
 * ServerDetailModal Component
 * 
 * Modal showing comprehensive details about an MCP server:
 * - Server info and status
 * - Available tools with schemas
 * - Resources and prompts
 * - Connection stats
 * - Environment configuration
 * 
 * @module renderer/features/settings/components/mcp/ServerDetailModal
 */

import React, { memo, useState, useEffect } from 'react';
import {
  Server,
  Wrench,
  Database,
  MessageSquare,
  Settings2,
  CheckCircle,
  AlertCircle,
  Clock,
  Tag,
  Package,
  Globe,
  Copy,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Spinner } from '../../../../components/ui/LoadingState';
import { cn } from '../../../../utils/cn';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { EnvVarEditor } from './EnvVarEditor';
import { useToast } from '../../../../components/ui/Toast';
import { Tabs, TabList, TabTrigger, TabContent } from '../../../../components/ui/Tabs';
import { createLogger } from '../../../../utils/logger';
import type {
  MCPServerConfig,
  MCPServerState,
  MCPToolDefinition,
  MCPResourceDefinition,
  MCPPromptDefinition,
} from '../../../../../shared/types/mcp';

interface ServerDetailModalProps {
  open: boolean;
  onClose: () => void;
  serverId: string | null;
}

const logger = createLogger('ServerDetailModal');

// Tool schema viewer component
const ToolSchemaViewer: React.FC<{ tool: MCPToolDefinition }> = memo(({ tool }) => {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();

  return (
    <div className="border border-[var(--color-border)] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-[var(--color-surface-elevated)] transition-colors"
      >
        <div className="w-8 h-8 rounded flex items-center justify-center bg-[var(--color-accent)]/10">
          <Wrench className="w-4 h-4 text-[var(--color-accent)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-mono text-[var(--color-text-primary)]">{tool.name}</div>
          <div className="text-[10px] text-[var(--color-text-muted)] line-clamp-1">
            {tool.description}
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
          {/* Description */}
          <div>
            <div className="text-[10px] text-[var(--color-text-muted)] mb-1">Description</div>
            <div className="text-[11px] text-[var(--color-text-secondary)]">{tool.description}</div>
          </div>

          {/* Input Schema */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] text-[var(--color-text-muted)]">Input Schema</div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(tool.inputSchema, null, 2));
                  toast({ type: 'success', message: 'Schema copied to clipboard' });
                }}
                className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                title="Copy schema"
              >
                <Copy className="w-3 h-3" />
              </button>
            </div>
            <pre className="p-2 rounded bg-[var(--color-surface-base)] text-[10px] font-mono text-[var(--color-text-secondary)] overflow-x-auto max-h-40">
              {JSON.stringify(tool.inputSchema, null, 2)}
            </pre>
          </div>

          {/* Required params */}
          {tool.inputSchema.required && tool.inputSchema.required.length > 0 && (
            <div>
              <div className="text-[10px] text-[var(--color-text-muted)] mb-1">Required Parameters</div>
              <div className="flex flex-wrap gap-1">
                {tool.inputSchema.required.map((param) => (
                  <span
                    key={param}
                    className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[var(--color-warning)]/10 text-[var(--color-warning)]"
                  >
                    {param}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

ToolSchemaViewer.displayName = 'ToolSchemaViewer';

// Resource item component
const ResourceItem: React.FC<{ resource: MCPResourceDefinition }> = memo(({ resource }) => (
  <div className="flex items-start gap-3 p-3 border border-[var(--color-border)]">
    <div className="w-8 h-8 rounded flex items-center justify-center bg-[var(--color-info)]/10">
      <Database className="w-4 h-4 text-[var(--color-info)]" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-xs font-mono text-[var(--color-text-primary)]">{resource.name}</div>
      <div className="text-[10px] text-[var(--color-text-muted)] font-mono break-all">
        {resource.uri}
      </div>
      {resource.description && (
        <div className="text-[10px] text-[var(--color-text-secondary)] mt-1">
          {resource.description}
        </div>
      )}
      {resource.mimeType && (
        <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-[var(--color-surface-base)] text-[var(--color-text-muted)]">
          {resource.mimeType}
        </span>
      )}
    </div>
  </div>
));

ResourceItem.displayName = 'ResourceItem';

// Prompt item component
const PromptItem: React.FC<{ prompt: MCPPromptDefinition }> = memo(({ prompt }) => (
  <div className="flex items-start gap-3 p-3 border border-[var(--color-border)]">
    <div className="w-8 h-8 rounded flex items-center justify-center bg-[var(--color-success)]/10">
      <MessageSquare className="w-4 h-4 text-[var(--color-success)]" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-xs font-mono text-[var(--color-text-primary)]">{prompt.name}</div>
      {prompt.description && (
        <div className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">
          {prompt.description}
        </div>
      )}
      {prompt.arguments && prompt.arguments.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {prompt.arguments.map((arg) => (
            <span
              key={arg.name}
              className={cn(
                'px-1.5 py-0.5 rounded text-[9px] font-mono',
                arg.required
                  ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
                  : 'bg-[var(--color-surface-base)] text-[var(--color-text-muted)]'
              )}
              title={arg.description}
            >
              {arg.name}
            </span>
          ))}
        </div>
      )}
    </div>
  </div>
));

PromptItem.displayName = 'PromptItem';

export const ServerDetailModal: React.FC<ServerDetailModalProps> = memo(
  ({ open, onClose, serverId }) => {
    const [config, setConfig] = useState<MCPServerConfig | null>(null);
    const [state, setState] = useState<MCPServerState | null>(null);
    const [loading, setLoading] = useState(true);
    const [envVars, setEnvVars] = useState<Record<string, string>>({});
    const { toast: _toast } = useToast();

    useEffect(() => {
      if (!open || !serverId) return;

      const loadData = async () => {
        setLoading(true);
        try {
          const [serverConfig, serverState] = await Promise.all([
            window.vyotiq.mcp.getServer(serverId),
            window.vyotiq.mcp.getServerState(serverId),
          ]);
          setConfig(serverConfig);
          setState(serverState);
          // Extract env vars from transport config if present
          if (serverConfig?.transport && 'env' in serverConfig.transport) {
            setEnvVars((serverConfig.transport as { env?: Record<string, string> }).env || {});
          }
        } catch (err) {
          logger.error('Failed to load server details', { error: err instanceof Error ? err.message : String(err) });
        } finally {
          setLoading(false);
        }
      };

      loadData();
    }, [open, serverId]);

    const renderOverview = () => {
      if (!config || !state) return null;

      const isConnected = state.status === 'connected';

      return (
        <div className="space-y-4">
          {/* Status banner */}
          <div
            className={cn(
              'flex items-center gap-3 p-3 border',
              isConnected
                ? 'bg-[var(--color-success)]/5 border-[var(--color-success)]/30'
                : 'bg-[var(--color-surface-base)] border-[var(--color-border)]'
            )}
          >
            {isConnected ? (
              <CheckCircle className="w-5 h-5 text-[var(--color-success)]" />
            ) : state.status === 'error' ? (
              <AlertCircle className="w-5 h-5 text-[var(--color-error)]" />
            ) : state.status === 'connecting' ? (
              <Spinner size="md" className="w-5 h-5 text-[var(--color-warning)]" />
            ) : (
              <Server className="w-5 h-5 text-[var(--color-text-muted)]" />
            )}
            <div className="flex-1">
              <div className="text-xs font-medium text-[var(--color-text-primary)] capitalize">
                {state.status}
              </div>
              {state.error && (
                <div className="text-[10px] text-[var(--color-error)]">{state.error}</div>
              )}
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-[var(--color-surface-base)] border border-[var(--color-border)]">
              <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)] mb-1">
                <Package className="w-3 h-3" />
                Source
              </div>
              <div className="text-xs text-[var(--color-text-primary)]">{config.source}</div>
              {config.sourceId && (
                <div className="text-[10px] text-[var(--color-text-muted)] truncate">{config.sourceId}</div>
              )}
            </div>

            <div className="p-3 bg-[var(--color-surface-base)] border border-[var(--color-border)]">
              <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)] mb-1">
                <Tag className="w-3 h-3" />
                Category
              </div>
              <div className="text-xs text-[var(--color-text-primary)] capitalize">
                {config.category.replace('-', ' ')}
              </div>
            </div>

            <div className="p-3 bg-[var(--color-surface-base)] border border-[var(--color-border)]">
              <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)] mb-1">
                <Globe className="w-3 h-3" />
                Protocol
              </div>
              <div className="text-xs text-[var(--color-text-primary)]">
                {state.protocolVersion || 'Unknown'}
              </div>
            </div>

            <div className="p-3 bg-[var(--color-surface-base)] border border-[var(--color-border)]">
              <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)] mb-1">
                <Clock className="w-3 h-3" />
                Installed
              </div>
              <div className="text-xs text-[var(--color-text-primary)]">
                {config.installedAt ? new Date(config.installedAt).toLocaleDateString() : 'Unknown'}
              </div>
            </div>
          </div>

          {/* Stats */}
          {isConnected && (
            <div className="space-y-2">
              <h4 className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                Statistics
              </h4>
              <div className="grid grid-cols-2 xs:grid-cols-4 gap-2">
                <div className="p-1.5 sm:p-2 rounded bg-[var(--color-surface-base)] border border-[var(--color-border)] text-center">
                  <div className="text-xs sm:text-sm font-mono text-[var(--color-text-primary)]">
                    {state.stats.totalCalls}
                  </div>
                  <div className="text-[8px] sm:text-[9px] text-[var(--color-text-muted)]">Total Calls</div>
                </div>
                <div className="p-1.5 sm:p-2 rounded bg-[var(--color-surface-base)] border border-[var(--color-border)] text-center">
                  <div className="text-xs sm:text-sm font-mono text-[var(--color-success)]">
                    {state.stats.successfulCalls}
                  </div>
                  <div className="text-[8px] sm:text-[9px] text-[var(--color-text-muted)]">Success</div>
                </div>
                <div className="p-1.5 sm:p-2 rounded bg-[var(--color-surface-base)] border border-[var(--color-border)] text-center">
                  <div className="text-xs sm:text-sm font-mono text-[var(--color-error)]">
                    {state.stats.failedCalls}
                  </div>
                  <div className="text-[8px] sm:text-[9px] text-[var(--color-text-muted)]">Failed</div>
                </div>
                <div className="p-1.5 sm:p-2 rounded bg-[var(--color-surface-base)] border border-[var(--color-border)] text-center">
                  <div className="text-xs sm:text-sm font-mono text-[var(--color-text-primary)]">
                    {state.stats.averageLatencyMs.toFixed(0)}ms
                  </div>
                  <div className="text-[8px] sm:text-[9px] text-[var(--color-text-muted)]">Avg Latency</div>
                </div>
              </div>
            </div>
          )}

          {/* Capabilities */}
          {state.capabilities && (
            <div className="space-y-2">
              <h4 className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                Capabilities
              </h4>
              <div className="flex flex-wrap gap-1">
                {state.capabilities.tools && (
                  <span className="px-2 py-1 rounded text-[10px] bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                    Tools
                  </span>
                )}
                {state.capabilities.resources && (
                  <span className="px-2 py-1 rounded text-[10px] bg-[var(--color-info)]/10 text-[var(--color-info)]">
                    Resources
                  </span>
                )}
                {state.capabilities.prompts && (
                  <span className="px-2 py-1 rounded text-[10px] bg-[var(--color-success)]/10 text-[var(--color-success)]">
                    Prompts
                  </span>
                )}
                {state.capabilities.logging && (
                  <span className="px-2 py-1 rounded text-[10px] bg-[var(--color-warning)]/10 text-[var(--color-warning)]">
                    Logging
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      );
    };

    const renderTools = () => {
      if (!state) return null;

      if (state.tools.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Wrench className="w-10 h-10 text-[var(--color-text-muted)] mb-3" />
            <p className="text-sm text-[var(--color-text-muted)]">No tools available</p>
            <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
              Connect the server to discover tools
            </p>
          </div>
        );
      }

      return (
        <div className="space-y-2">
          {state.tools.map((tool) => (
            <ToolSchemaViewer key={tool.name} tool={tool} />
          ))}
        </div>
      );
    };

    const renderResources = () => {
      if (!state) return null;

      if (state.resources.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Database className="w-10 h-10 text-[var(--color-text-muted)] mb-3" />
            <p className="text-sm text-[var(--color-text-muted)]">No resources available</p>
          </div>
        );
      }

      return (
        <div className="space-y-2">
          {state.resources.map((resource) => (
            <ResourceItem key={resource.uri} resource={resource} />
          ))}
        </div>
      );
    };

    const renderPrompts = () => {
      if (!state) return null;

      if (state.prompts.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="w-10 h-10 text-[var(--color-text-muted)] mb-3" />
            <p className="text-sm text-[var(--color-text-muted)]">No prompts available</p>
          </div>
        );
      }

      return (
        <div className="space-y-2">
          {state.prompts.map((prompt) => (
            <PromptItem key={prompt.name} prompt={prompt} />
          ))}
        </div>
      );
    };

    const renderConfig = () => {
      if (!config) return null;

      return (
        <div className="space-y-4">
          {/* Transport config */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
              Transport Configuration
            </h4>
            <pre className="p-3 rounded bg-[var(--color-surface-base)] border border-[var(--color-border)] text-[10px] font-mono text-[var(--color-text-secondary)] overflow-x-auto">
              {JSON.stringify(config.transport, null, 2)}
            </pre>
          </div>

          {/* Environment Variables */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
              Environment Variables
            </h4>
            <EnvVarEditor
              envVars={envVars}
              onChange={setEnvVars}
              disabled
            />
          </div>
        </div>
      );
    };

    return (
      <Modal
        open={open}
        onClose={onClose}
        title={config?.name || 'Server Details'}
        description={config?.description}
        footer={
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" className="w-6 h-6 text-[var(--color-text-muted)]" />
          </div>
        ) : !config ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="w-10 h-10 text-[var(--color-error)] mb-3" />
            <p className="text-sm text-[var(--color-text-muted)]">Server not found</p>
          </div>
        ) : (
          <Tabs defaultValue="overview" className="space-y-4">
            {/* Tabs */}
            <TabList variant="pills" className="p-1 bg-[var(--color-surface-base)]">
              <TabTrigger value="overview" variant="pills" icon={<Server className="w-3 h-3" />}>Overview</TabTrigger>
              <TabTrigger value="tools" variant="pills" icon={<Wrench className="w-3 h-3" />}>
                Tools{state && state.tools.length > 0 && <span className="px-1 py-0.5 rounded text-[8px] bg-[var(--color-surface-elevated)]">{state.tools.length}</span>}
              </TabTrigger>
              <TabTrigger value="resources" variant="pills" icon={<Database className="w-3 h-3" />}>
                Resources{state && state.resources.length > 0 && <span className="px-1 py-0.5 rounded text-[8px] bg-[var(--color-surface-elevated)]">{state.resources.length}</span>}
              </TabTrigger>
              <TabTrigger value="prompts" variant="pills" icon={<MessageSquare className="w-3 h-3" />}>
                Prompts{state && state.prompts.length > 0 && <span className="px-1 py-0.5 rounded text-[8px] bg-[var(--color-surface-elevated)]">{state.prompts.length}</span>}
              </TabTrigger>
              <TabTrigger value="config" variant="pills" icon={<Settings2 className="w-3 h-3" />}>Config</TabTrigger>
            </TabList>

            {/* Tab content */}
            <div className="min-h-[300px]">
              <TabContent value="overview">{renderOverview()}</TabContent>
              <TabContent value="tools">{renderTools()}</TabContent>
              <TabContent value="resources">{renderResources()}</TabContent>
              <TabContent value="prompts">{renderPrompts()}</TabContent>
              <TabContent value="config">{renderConfig()}</TabContent>
            </div>
          </Tabs>
        )}
      </Modal>
    );
  }
);

ServerDetailModal.displayName = 'ServerDetailModal';

export default ServerDetailModal;
