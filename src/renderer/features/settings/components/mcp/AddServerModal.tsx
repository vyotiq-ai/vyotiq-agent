/**
 * AddServerModal Component
 * 
 * Modal for adding custom MCP servers from various sources:
 * - npm packages
 * - Python (pip/uvx) packages
 * - Git repositories
 * - Local files/directories
 * 
 * @module renderer/features/settings/components/mcp/AddServerModal
 */

import React, { memo, useState, useCallback, useMemo } from 'react';
import {
  Package,
  GitBranch,
  Folder,
  Terminal,
  Server,
  CheckCircle,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { Spinner } from '../../../../components/ui/LoadingState';
import type { LucideProps } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { Toggle } from '../../../../components/ui/Toggle';
import { EnvVarEditor } from './EnvVarEditor';
import type {
  MCPServerSource,
  MCPServerCategory,
  MCPInstallRequest,
  MCPInstallResult,
} from '../../../../../shared/types/mcp';

interface AddServerModalProps {
  open: boolean;
  onClose: () => void;
  onInstall: (request: MCPInstallRequest) => Promise<MCPInstallResult>;
}

type Step = 'source' | 'config' | 'env' | 'installing' | 'result';

interface SourceOption {
  id: MCPServerSource;
  name: string;
  description: string;
  icon: React.ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & React.RefAttributes<SVGSVGElement>>;
  placeholder: string;
  hint: string;
}

const SOURCE_OPTIONS: SourceOption[] = [
  {
    id: 'npm',
    name: 'NPM Package',
    description: 'Install from npm registry',
    icon: Package,
    placeholder: '@modelcontextprotocol/server-filesystem',
    hint: 'Enter the npm package name (e.g., @org/package)',
  },
  {
    id: 'pypi',
    name: 'Python Package',
    description: 'Install via pip/uvx',
    icon: Terminal,
    placeholder: 'mcp-server-example',
    hint: 'Enter the Python package name',
  },
  {
    id: 'git',
    name: 'Git Repository',
    description: 'Clone and install from git',
    icon: GitBranch,
    placeholder: 'https://github.com/user/mcp-server.git',
    hint: 'Enter the git repository URL',
  },
  {
    id: 'mcpb',
    name: 'MCP Bundle',
    description: 'Install from .mcpb bundle file',
    icon: Package,
    placeholder: '/path/to/server.mcpb',
    hint: 'Enter the path to a .mcpb bundle file',
  },
  {
    id: 'local',
    name: 'Local Path',
    description: 'Use local file or directory',
    icon: Folder,
    placeholder: '/path/to/server.js',
    hint: 'Enter the path to a JS, Python file, or project directory',
  },
];

const CATEGORY_OPTIONS: { value: MCPServerCategory; label: string }[] = [
  { value: 'database', label: 'Database' },
  { value: 'api', label: 'API' },
  { value: 'file-system', label: 'File System' },
  { value: 'browser', label: 'Browser' },
  { value: 'developer-tools', label: 'Developer Tools' },
  { value: 'productivity', label: 'Productivity' },
  { value: 'cloud', label: 'Cloud' },
  { value: 'communication', label: 'Communication' },
  { value: 'ai', label: 'AI' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'security', label: 'Security' },
  { value: 'other', label: 'Other' },
];

export const AddServerModal: React.FC<AddServerModalProps> = memo(
  ({ open, onClose, onInstall }) => {
    const [step, setStep] = useState<Step>('source');
    const [selectedSource, setSelectedSource] = useState<MCPServerSource | null>(null);
    const [packageId, setPackageId] = useState('');
    const [serverName, setServerName] = useState('');
    const [category, setCategory] = useState<MCPServerCategory>('other');
    const [autoStart, setAutoStart] = useState(true);
    const [envVars, setEnvVars] = useState<Record<string, string>>({});
    const [installResult, setInstallResult] = useState<MCPInstallResult | null>(null);
    const [installLogs, setInstallLogs] = useState<string[]>([]);

    const selectedSourceConfig = useMemo(
      () => SOURCE_OPTIONS.find((s) => s.id === selectedSource),
      [selectedSource]
    );

    const resetForm = useCallback(() => {
      setStep('source');
      setSelectedSource(null);
      setPackageId('');
      setServerName('');
      setCategory('other');
      setAutoStart(true);
      setEnvVars({});
      setInstallResult(null);
      setInstallLogs([]);
    }, []);

    const handleClose = useCallback(() => {
      resetForm();
      onClose();
    }, [onClose, resetForm]);

    const handleSourceSelect = useCallback((source: MCPServerSource) => {
      setSelectedSource(source);
      setStep('config');
    }, []);

    const handleContinueToEnv = useCallback(() => {
      if (!packageId.trim()) return;
      setStep('env');
    }, [packageId]);

    const handleInstall = useCallback(async () => {
      if (!selectedSource || !packageId.trim()) return;

      setStep('installing');
      setInstallLogs([`Starting installation from ${selectedSource}...`]);

      try {
        const request: MCPInstallRequest = {
          source: selectedSource,
          packageId: packageId.trim(),
          name: serverName.trim() || undefined,
          category,
          env: Object.keys(envVars).length > 0 ? envVars : undefined,
          autoStart,
        };

        const result = await onInstall(request);
        setInstallResult(result);
        if (result.logs) {
          setInstallLogs(result.logs);
        }
        setStep('result');
      } catch (error) {
        setInstallResult({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
        setStep('result');
      }
    }, [selectedSource, packageId, serverName, category, envVars, autoStart, onInstall]);

    const renderSourceStep = () => (
      <div className="space-y-3 sm:space-y-4">
        <p className="text-[10px] sm:text-[11px] text-[var(--color-text-secondary)]">
          Select how you want to add your MCP server
        </p>
        <div className="grid gap-2 sm:gap-3 sm:grid-cols-2">
          {SOURCE_OPTIONS.map((source) => {
            const Icon = source.icon;
            return (
              <button
                key={source.id}
                onClick={() => handleSourceSelect(source.id)}
                className={cn(
                  'flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 border text-left transition-all',
                  'bg-[var(--color-surface-base)] border-[var(--color-border)]',
                  'hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-elevated)]'
                )}
              >
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded flex items-center justify-center bg-[var(--color-accent)]/10 flex-shrink-0">
                  <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--color-accent)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] sm:text-xs font-mono text-[var(--color-text-primary)]">
                    {source.name}
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-[var(--color-text-muted)] mt-0.5">
                    {source.description}
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--color-text-muted)]" />
              </button>
            );
          })}
        </div>
      </div>
    );

    const renderConfigStep = () => (
      <div className="space-y-4">
        {/* Source badge */}
        {selectedSourceConfig && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStep('source')}
              className="text-[10px] text-[var(--color-accent)] hover:underline"
            >
              ← Change source
            </button>
            <span className="text-[10px] text-[var(--color-text-muted)]">|</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--color-accent)]/10 text-[10px] text-[var(--color-accent)]">
              {React.createElement(selectedSourceConfig.icon, { className: 'w-3 h-3' })}
              {selectedSourceConfig.name}
            </span>
          </div>
        )}

        {/* Package ID */}
        <Input
          label="Package / Path"
          value={packageId}
          onChange={(e) => setPackageId(e.target.value)}
          placeholder={selectedSourceConfig?.placeholder}
          hint={selectedSourceConfig?.hint}
        />

        {/* Server Name (optional) */}
        <Input
          label="Display Name (optional)"
          value={serverName}
          onChange={(e) => setServerName(e.target.value)}
          placeholder="My Custom Server"
          hint="Custom name for the server"
        />

        {/* Category */}
        <div className="space-y-1.5">
          <label className="text-[10px] text-[var(--color-text-muted)] ml-0.5 flex items-center gap-1">
            <span className="text-[var(--color-accent)]">--</span>
            category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as MCPServerCategory)}
            className={cn(
              'w-full px-2.5 py-2 text-[11px] font-mono rounded-sm',
              'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]',
              'text-[var(--color-text-primary)]',
              'focus:outline-none focus:border-[var(--color-accent)]/50'
            )}
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Auto-start toggle */}
        <div className="flex items-center justify-between p-3 bg-[var(--color-surface-base)] border border-[var(--color-border)]">
          <div>
            <div className="text-xs text-[var(--color-text-primary)]">Auto-start</div>
            <div className="text-[10px] text-[var(--color-text-muted)]">
              Connect automatically after installation
            </div>
          </div>
          <Toggle checked={autoStart} onToggle={() => setAutoStart(!autoStart)} size="sm" />
        </div>
      </div>
    );

    const renderEnvStep = () => (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStep('config')}
            className="text-[10px] text-[var(--color-accent)] hover:underline"
          >
            ← Back to config
          </button>
        </div>

        <div>
          <h3 className="text-xs font-medium text-[var(--color-text-primary)] mb-1">
            Environment Variables
          </h3>
          <p className="text-[10px] text-[var(--color-text-muted)]">
            Configure environment variables required by the server
          </p>
        </div>

        <EnvVarEditor envVars={envVars} onChange={setEnvVars} />
      </div>
    );

    const renderInstallingStep = () => (
      <div className="space-y-4">
        <div className="flex items-center justify-center py-8">
          <div className="flex flex-col items-center gap-3">
            <Spinner size="lg" className="w-8 h-8 text-[var(--color-accent)]" />
            <p className="text-xs text-[var(--color-text-secondary)]">Installing server...</p>
          </div>
        </div>

        {/* Install logs */}
        {installLogs.length > 0 && (
          <div className="p-3 rounded bg-[var(--color-surface-base)] border border-[var(--color-border)]">
            <div className="text-[10px] font-mono text-[var(--color-text-muted)] space-y-0.5 max-h-32 overflow-y-auto">
              {installLogs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    );

    const renderResultStep = () => (
      <div className="space-y-4">
        {installResult?.success ? (
          <div className="flex flex-col items-center py-6 text-center">
            <div className="w-12 h-12 rounded-full bg-[var(--color-success)]/10 flex items-center justify-center mb-3">
              <CheckCircle className="w-6 h-6 text-[var(--color-success)]" />
            </div>
            <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
              Server Installed
            </h3>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
              {installResult.server?.name || 'Server'} is ready to use
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center py-6 text-center">
            <div className="w-12 h-12 rounded-full bg-[var(--color-error)]/10 flex items-center justify-center mb-3">
              <AlertCircle className="w-6 h-6 text-[var(--color-error)]" />
            </div>
            <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
              Installation Failed
            </h3>
            <p className="text-[11px] text-[var(--color-error)] mt-1">
              {installResult?.error || 'Unknown error occurred'}
            </p>
          </div>
        )}

        {/* Logs */}
        {installLogs.length > 0 && (
          <div className="p-3 rounded bg-[var(--color-surface-base)] border border-[var(--color-border)]">
            <div className="text-[10px] font-mono text-[var(--color-text-muted)] space-y-0.5 max-h-40 overflow-y-auto">
              {installLogs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    );

    const renderStepContent = () => {
      switch (step) {
        case 'source':
          return renderSourceStep();
        case 'config':
          return renderConfigStep();
        case 'env':
          return renderEnvStep();
        case 'installing':
          return renderInstallingStep();
        case 'result':
          return renderResultStep();
        default:
          return null;
      }
    };

    const renderFooter = () => {
      switch (step) {
        case 'source':
          return (
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
          );
        case 'config':
          return (
            <>
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                variant="secondary"
                onClick={handleContinueToEnv}
                disabled={!packageId.trim()}
              >
                Configure Env Vars
              </Button>
              <Button
                variant="primary"
                onClick={handleInstall}
                disabled={!packageId.trim()}
                leftIcon={<Server className="w-3 h-3" />}
              >
                Install
              </Button>
            </>
          );
        case 'env':
          return (
            <>
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleInstall}
                leftIcon={<Server className="w-3 h-3" />}
              >
                Install Server
              </Button>
            </>
          );
        case 'result':
          return (
            <>
              {!installResult?.success && (
                <Button variant="secondary" onClick={() => setStep('config')}>
                  Try Again
                </Button>
              )}
              <Button variant="primary" onClick={handleClose}>
                Done
              </Button>
            </>
          );
        default:
          return null;
      }
    };

    return (
      <Modal
        open={open}
        onClose={step === 'installing' ? () => { } : handleClose}
        title="Add MCP Server"
        description="Install and configure a new MCP server"
        footer={renderFooter()}
      >
        {renderStepContent()}
      </Modal>
    );
  }
);

AddServerModal.displayName = 'AddServerModal';

export default AddServerModal;
