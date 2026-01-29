/**
 * Browser Settings Component
 * 
 * Settings for the embedded browser security and behavior.
 * Consistent with terminal-style design used across all settings panels.
 */
import React, { useState } from 'react';
import {
  Globe,
  Shield,
  ShieldCheck,
  Ban,
  Check,
  Plus,
  X,
  Server,
  FileText,
  Info,
} from 'lucide-react';
import type { BrowserSettings } from '../../../../shared/types';
import { Toggle } from '../../../components/ui/Toggle';
import { cn } from '../../../utils/cn';

interface SettingsBrowserProps {
  settings: BrowserSettings;
  onChange: <K extends keyof BrowserSettings>(key: K, value: BrowserSettings[K]) => void;
}

export const SettingsBrowser: React.FC<SettingsBrowserProps> = ({ settings, onChange }) => {
  const [allowListInput, setAllowListInput] = useState('');
  const [blockListInput, setBlockListInput] = useState('');
  const [portInput, setPortInput] = useState('');

  const handleAddToAllowList = () => {
    const trimmed = allowListInput.trim();
    if (trimmed && !settings.allowList.includes(trimmed)) {
      onChange('allowList', [...settings.allowList, trimmed]);
      setAllowListInput('');
    }
  };

  const handleAddToBlockList = () => {
    const trimmed = blockListInput.trim();
    if (trimmed && !settings.customBlockList.includes(trimmed)) {
      onChange('customBlockList', [...settings.customBlockList, trimmed]);
      setBlockListInput('');
    }
  };

  const handleAddPort = () => {
    const port = parseInt(portInput, 10);
    if (port >= 1 && port <= 65535 && !settings.trustedLocalhostPorts.includes(port)) {
      onChange('trustedLocalhostPorts', [...settings.trustedLocalhostPorts, port]);
      setPortInput('');
    }
  };

  return (
    <section className="space-y-4 font-mono">
      <header>
        <div className="flex items-center gap-2 mb-1">
          <Shield size={11} className="text-[var(--color-accent-primary)]" />
          <h3 className="text-[11px] text-[var(--color-text-primary)]">browser</h3>
        </div>
        <p className="text-[10px] text-[var(--color-text-dim)]">
          # Configure embedded browser security and behavior
        </p>
      </header>

      {/* Security Protection */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <ShieldCheck size={11} className="text-[var(--color-accent-primary)]" />
          security
        </div>

        <Toggle
          label="--url-filtering"
          description="# block phishing, malware, dangerous sites"
          checked={settings.urlFilteringEnabled}
          onToggle={() => onChange('urlFilteringEnabled', !settings.urlFilteringEnabled)}
        />

        <Toggle
          label="--popup-blocking"
          description="# block popup windows and new tabs"
          checked={settings.popupBlockingEnabled}
          onToggle={() => onChange('popupBlockingEnabled', !settings.popupBlockingEnabled)}
        />

        <Toggle
          label="--ad-blocking"
          description="# block advertisements from ad networks"
          checked={settings.adBlockingEnabled}
          onToggle={() => onChange('adBlockingEnabled', !settings.adBlockingEnabled)}
        />

        <Toggle
          label="--tracker-blocking"
          description="# block tracking scripts and analytics"
          checked={settings.trackerBlockingEnabled}
          onToggle={() => onChange('trackerBlockingEnabled', !settings.trackerBlockingEnabled)}
        />

        <Toggle
          label="--download-protection"
          description="# block dangerous file types (.exe, .bat)"
          checked={settings.downloadProtectionEnabled}
          onToggle={() => onChange('downloadProtectionEnabled', !settings.downloadProtectionEnabled)}
        />

        <Toggle
          label="--block-mixed-content"
          description="# block HTTP resources on HTTPS pages"
          checked={settings.blockMixedContent}
          onToggle={() => onChange('blockMixedContent', !settings.blockMixedContent)}
        />
      </div>

      {/* Allow List */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Check size={11} className="text-[var(--color-success)]" />
          allow list
        </div>

        <p className="text-[9px] text-[var(--color-text-dim)]">
          # trusted domains that bypass security checks
        </p>

        <div className="space-y-2">
          {settings.allowList.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {settings.allowList.map((domain) => (
                <span
                  key={domain}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)]"
                >
                  {domain}
                  <button
                    onClick={() => onChange('allowList', settings.allowList.filter(d => d !== domain))}
                    className="hover:text-[var(--color-error)] transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
                    aria-label={`Remove ${domain} from allow list`}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-1">
            <input
              type="text"
              value={allowListInput}
              onChange={(e) => setAllowListInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddToAllowList()}
              placeholder="domain.com"
              className="flex-1 px-2 py-1.5 text-[10px] bg-[var(--color-surface-editor)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30"
            />
            <button
              onClick={handleAddToAllowList}
              disabled={!allowListInput.trim()}
              className={cn(
                "px-2 py-1 text-[10px] border transition-colors",
                allowListInput.trim()
                  ? "border-[var(--color-accent-primary)]/30 text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/10"
                  : "border-[var(--color-border-subtle)] text-[var(--color-text-dim)] cursor-not-allowed",
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
              )}
              aria-label="Add domain to allow list"
            >
              <Plus size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Block List */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Ban size={11} className="text-[var(--color-error)]" />
          block list
        </div>

        <p className="text-[9px] text-[var(--color-text-dim)]">
          # additional domains to always block
        </p>

        <div className="space-y-2">
          {settings.customBlockList.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {settings.customBlockList.map((domain) => (
                <span
                  key={domain}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] bg-[var(--color-error)]/10 border border-[var(--color-error)]/30 text-[var(--color-error)]"
                >
                  {domain}
                  <button
                    onClick={() => onChange('customBlockList', settings.customBlockList.filter(d => d !== domain))}
                    className="hover:text-[var(--color-error)] transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
                    aria-label={`Remove ${domain} from block list`}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-1">
            <input
              type="text"
              value={blockListInput}
              onChange={(e) => setBlockListInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddToBlockList()}
              placeholder="blocked-domain.com"
              className="flex-1 px-2 py-1.5 text-[10px] bg-[var(--color-surface-editor)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30"
            />
            <button
              onClick={handleAddToBlockList}
              disabled={!blockListInput.trim()}
              className={cn(
                "px-2 py-1 text-[10px] border transition-colors",
                blockListInput.trim()
                  ? "border-[var(--color-error)]/30 text-[var(--color-error)] hover:bg-[var(--color-error)]/10"
                  : "border-[var(--color-border-subtle)] text-[var(--color-text-dim)] cursor-not-allowed",
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
              )}
              aria-label="Add domain to block list"
            >
              <Plus size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Browser Behavior */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Globe size={11} className="text-[var(--color-info)]" />
          behavior
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Navigation Timeout */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-[var(--color-text-muted)]">--timeout</label>
              <span className="text-[10px] text-[var(--color-accent-primary)]">{Math.round(settings.navigationTimeout / 1000)}s</span>
            </div>
            <input
              type="range"
              min={5000}
              max={120000}
              step={5000}
              className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer"
              value={settings.navigationTimeout}
              onChange={(e) => onChange('navigationTimeout', Number(e.target.value))}
            />
            <div className="flex justify-between text-[9px] text-[var(--color-text-dim)]">
              <span>5s</span>
              <span>60s</span>
              <span>120s</span>
            </div>
            <p className="text-[9px] text-[var(--color-text-dim)]"># max wait for page load</p>
          </div>

          {/* Max Content Length */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-[var(--color-text-muted)]">--max-content</label>
              <span className="text-[10px] text-[var(--color-accent-primary)]">{Math.round(settings.maxContentLength / 1000)}K</span>
            </div>
            <input
              type="range"
              min={10000}
              max={500000}
              step={10000}
              className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer"
              value={settings.maxContentLength}
              onChange={(e) => onChange('maxContentLength', Number(e.target.value))}
            />
            <div className="flex justify-between text-[9px] text-[var(--color-text-dim)]">
              <span>10K</span>
              <span>250K</span>
              <span>500K</span>
            </div>
            <p className="text-[9px] text-[var(--color-text-dim)]"># max chars to extract</p>
          </div>
        </div>

        <Toggle
          label="--javascript"
          description="# allow JavaScript execution in pages"
          checked={settings.enableJavaScript}
          onToggle={() => onChange('enableJavaScript', !settings.enableJavaScript)}
        />

        <Toggle
          label="--cookies"
          description="# allow websites to store cookies"
          checked={settings.enableCookies}
          onToggle={() => onChange('enableCookies', !settings.enableCookies)}
        />

        <Toggle
          label="--clear-on-exit"
          description="# clear cache, cookies, storage on exit"
          checked={settings.clearDataOnExit}
          onToggle={() => onChange('clearDataOnExit', !settings.clearDataOnExit)}
        />
      </div>

      {/* Localhost Development */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Server size={11} className="text-[var(--color-accent-secondary)]" />
          localhost
        </div>

        <p className="text-[9px] text-[var(--color-text-dim)]">
          # trusted ports for local development servers
        </p>

        <div className="space-y-2">
          {settings.trustedLocalhostPorts.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {settings.trustedLocalhostPorts.map((port) => (
                <span
                  key={port}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] bg-[var(--color-success)]/10 border border-[var(--color-success)]/30 text-[var(--color-success)]"
                >
                  :{port}
                  <button
                    onClick={() => onChange('trustedLocalhostPorts', settings.trustedLocalhostPorts.filter(p => p !== port))}
                    className="hover:text-[var(--color-error)] transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
                    aria-label={`Remove port ${port} from trusted localhost ports`}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-1">
            <input
              type="number"
              min={1}
              max={65535}
              value={portInput}
              onChange={(e) => setPortInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddPort()}
              placeholder="3000"
              className="w-24 px-2 py-1.5 text-[10px] bg-[var(--color-surface-editor)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30"
            />
            <button
              onClick={handleAddPort}
              disabled={!portInput || parseInt(portInput, 10) < 1 || parseInt(portInput, 10) > 65535}
              className={cn(
                "px-2 py-1 text-[10px] border transition-colors",
                portInput && parseInt(portInput, 10) >= 1 && parseInt(portInput, 10) <= 65535
                  ? "border-[var(--color-accent-primary)]/30 text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/10"
                  : "border-[var(--color-border-subtle)] text-[var(--color-text-dim)] cursor-not-allowed",
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
              )}
              aria-label="Add trusted localhost port"
            >
              <Plus size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Advanced */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <FileText size={11} className="text-[var(--color-warning)]" />
          advanced
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] text-[var(--color-text-muted)]">--user-agent</label>
          <input
            type="text"
            value={settings.customUserAgent}
            onChange={(e) => onChange('customUserAgent', e.target.value)}
            placeholder="# default Chrome user agent"
            className="w-full px-2 py-1.5 text-[10px] bg-[var(--color-surface-editor)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30"
          />
          <p className="text-[9px] text-[var(--color-text-dim)]"># custom user agent string (leave empty for default)</p>
        </div>
      </div>

      {/* Info box */}
      <div className="p-2 border border-[var(--color-info)]/20 bg-[var(--color-info)]/5">
        <div className="flex gap-2">
          <Info size={12} className="text-[var(--color-info)] flex-shrink-0 mt-0.5" />
          <div className="text-[9px] text-[var(--color-text-secondary)] space-y-1">
            <p className="text-[var(--color-info)]">[INFO] browser security active</p>
            <p>
              # the embedded browser protects against phishing, malware, and threats.
              use localhost ports list to trust your development servers.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SettingsBrowser;
