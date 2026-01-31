/**
 * ImportExportPanel Component
 * 
 * Component for importing and exporting MCP server configurations.
 * Supports JSON format for easy backup and sharing.
 * 
 * @module renderer/features/settings/components/mcp/ImportExportPanel
 */

import React, { memo, useState, useCallback, useRef } from 'react';
import {
  Download,
  Upload,
  FileJson,
  CheckCircle,
  AlertCircle,
  Loader2,
  Copy,
  ClipboardPaste,
} from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { Button } from '../../../../components/ui/Button';
import type { MCPServerConfig } from '../../../../../shared/types/mcp';

interface ImportExportPanelProps {
  /** Callback to import servers */
  onImport: (configs: MCPServerConfig[]) => Promise<{ success: boolean; imported: number; errors: string[] }>;
  /** Additional class name */
  className?: string;
}

interface ImportResult {
  success: boolean;
  imported: number;
  errors: string[];
}

export const ImportExportPanel: React.FC<ImportExportPanelProps> = memo(
  ({ onImport, className }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [copied, setCopied] = useState(false);

    // Fetch server configs for export
    const fetchServerConfigs = useCallback(async (): Promise<MCPServerConfig[]> => {
      return window.vyotiq.mcp.getServers();
    }, []);

    // Export servers to JSON file
    const handleExport = useCallback(async () => {
      setExporting(true);
      try {
        const servers = await fetchServerConfigs();
        const exportData = {
          version: '1.0',
          exportedAt: new Date().toISOString(),
          servers: servers.map((server) => {
            // Create a sanitized copy without env vars for security
            const sanitizedTransport = { ...server.transport };
            if ('env' in sanitizedTransport) {
              delete (sanitizedTransport as { env?: Record<string, string> }).env;
            }
            return {
              ...server,
              transport: sanitizedTransport,
            };
          }),
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mcp-servers-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } finally {
        setExporting(false);
      }
    }, [fetchServerConfigs]);

    // Copy config to clipboard
    const handleCopyToClipboard = useCallback(async () => {
      setExporting(true);
      try {
        const servers = await fetchServerConfigs();
        const exportData = {
          version: '1.0',
          servers: servers.map((server) => {
            // Create a sanitized copy without env vars for security
            const sanitizedTransport = { ...server.transport };
            if ('env' in sanitizedTransport) {
              delete (sanitizedTransport as { env?: Record<string, string> }).env;
            }
            return {
              ...server,
              transport: sanitizedTransport,
            };
          }),
        };

        await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } finally {
        setExporting(false);
      }
    }, [fetchServerConfigs]);

    // Handle file selection
    const handleFileSelect = useCallback(
      async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setImporting(true);
        setImportResult(null);

        try {
          const text = await file.text();
          const data = JSON.parse(text);

          if (!data.servers || !Array.isArray(data.servers)) {
            throw new Error('Invalid format: missing servers array');
          }

          const result = await onImport(data.servers);
          setImportResult(result);
        } catch (error) {
          setImportResult({
            success: false,
            imported: 0,
            errors: [error instanceof Error ? error.message : 'Failed to parse file'],
          });
        } finally {
          setImporting(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }
      },
      [onImport]
    );

    // Handle paste from clipboard
    const handlePasteFromClipboard = useCallback(async () => {
      setImporting(true);
      setImportResult(null);

      try {
        const text = await navigator.clipboard.readText();
        const data = JSON.parse(text);

        if (!data.servers || !Array.isArray(data.servers)) {
          throw new Error('Invalid format: missing servers array');
        }

        const result = await onImport(data.servers);
        setImportResult(result);
      } catch (error) {
        setImportResult({
          success: false,
          imported: 0,
          errors: [error instanceof Error ? error.message : 'Failed to parse clipboard content'],
        });
      } finally {
        setImporting(false);
      }
    }, [onImport]);

    return (
      <div className={cn('space-y-4', className)}>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-[var(--color-text-primary)] flex items-center gap-2">
            <FileJson className="w-4 h-4" />
            Import / Export
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Export section */}
          <div className="p-4 rounded-lg bg-[var(--color-surface-base)] border border-[var(--color-border)] space-y-3">
            <h4 className="text-[11px] font-medium text-[var(--color-text-primary)]">Export</h4>
            <p className="text-[10px] text-[var(--color-text-muted)]">
              Download your server configurations as JSON. Environment variables are excluded for
              security.
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleExport}
                disabled={exporting}
                leftIcon={
                  exporting ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Download className="w-3 h-3" />
                  )
                }
              >
                Export File
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCopyToClipboard}
                disabled={exporting}
                leftIcon={
                  copied ? (
                    <CheckCircle className="w-3 h-3 text-[var(--color-success)]" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )
                }
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="text-[9px] text-[var(--color-text-muted)]">
              All installed servers will be exported
            </p>
          </div>

          {/* Import section */}
          <div className="p-4 rounded-lg bg-[var(--color-surface-base)] border border-[var(--color-border)] space-y-3">
            <h4 className="text-[11px] font-medium text-[var(--color-text-primary)]">Import</h4>
            <p className="text-[10px] text-[var(--color-text-muted)]">
              Import server configurations from a JSON file or clipboard. You'll need to
              reconfigure environment variables.
            </p>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                leftIcon={
                  importing ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Upload className="w-3 h-3" />
                  )
                }
              >
                Import File
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handlePasteFromClipboard}
                disabled={importing}
                leftIcon={<ClipboardPaste className="w-3 h-3" />}
              >
                Paste
              </Button>
            </div>
          </div>
        </div>

        {/* Import result */}
        {importResult && (
          <div
            className={cn(
              'flex items-start gap-3 p-3 rounded-lg border',
              importResult.success
                ? 'bg-[var(--color-success)]/5 border-[var(--color-success)]/30'
                : 'bg-[var(--color-error)]/5 border-[var(--color-error)]/30'
            )}
          >
            {importResult.success ? (
              <CheckCircle className="w-5 h-5 text-[var(--color-success)] flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-[var(--color-error)] flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              {importResult.success ? (
                <p className="text-xs text-[var(--color-success)]">
                  Successfully imported {importResult.imported} server
                  {importResult.imported !== 1 ? 's' : ''}
                </p>
              ) : (
                <>
                  <p className="text-xs text-[var(--color-error)]">Import failed</p>
                  {importResult.errors.map((error, i) => (
                    <p key={i} className="text-[10px] text-[var(--color-error)]/80 mt-1">
                      {error}
                    </p>
                  ))}
                </>
              )}
            </div>
            <button
              onClick={() => setImportResult(null)}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              ×
            </button>
          </div>
        )}
      </div>
    );
  }
);

ImportExportPanel.displayName = 'ImportExportPanel';

export default ImportExportPanel;
