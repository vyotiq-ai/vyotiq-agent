/**
 * Settings Browser Component
 * 
 * Configure embedded browser security and behavior.
 */
import React, { useState } from 'react';
import { Shield, Check, Plus, X, Server } from 'lucide-react';
import type { BrowserSettings } from '../../../../shared/types';
import { cn } from '../../../utils/cn';
import { SettingsSection, SettingsGroup, SettingsToggleRow, SettingsSlider, SettingsListManager, SettingsInfoBox } from '../primitives';

interface SettingsBrowserProps {
  settings: BrowserSettings;
  onChange: <K extends keyof BrowserSettings>(key: K, value: BrowserSettings[K]) => void;
}

export const SettingsBrowser: React.FC<SettingsBrowserProps> = ({ settings, onChange }) => {
  const [portInput, setPortInput] = useState('');

  const handleAddPort = () => {
    const port = parseInt(portInput, 10);
    if (port >= 1 && port <= 65535 && !settings.trustedLocalhostPorts.includes(port)) {
      onChange('trustedLocalhostPorts', [...settings.trustedLocalhostPorts, port]);
      setPortInput('');
    }
  };

  return (
    <SettingsSection title="browser" description="Configure embedded browser security and behavior">
      {/* Security Protection */}
      <SettingsGroup title="security" icon={<Shield size={11} />}>
        <SettingsToggleRow label="url-filtering" description="block phishing, malware, dangerous sites" checked={settings.urlFilteringEnabled} onToggle={() => onChange('urlFilteringEnabled', !settings.urlFilteringEnabled)} />
        <SettingsToggleRow label="popup-blocking" description="block popup windows and new tabs" checked={settings.popupBlockingEnabled} onToggle={() => onChange('popupBlockingEnabled', !settings.popupBlockingEnabled)} />
        <SettingsToggleRow label="ad-blocking" description="block advertisements from ad networks" checked={settings.adBlockingEnabled} onToggle={() => onChange('adBlockingEnabled', !settings.adBlockingEnabled)} />
        <SettingsToggleRow label="tracker-blocking" description="block tracking scripts and analytics" checked={settings.trackerBlockingEnabled} onToggle={() => onChange('trackerBlockingEnabled', !settings.trackerBlockingEnabled)} />
        <SettingsToggleRow label="download-protection" description="block dangerous file types (.exe, .bat)" checked={settings.downloadProtectionEnabled} onToggle={() => onChange('downloadProtectionEnabled', !settings.downloadProtectionEnabled)} />
        <SettingsToggleRow label="block-mixed-content" description="block HTTP resources on HTTPS pages" checked={settings.blockMixedContent} onToggle={() => onChange('blockMixedContent', !settings.blockMixedContent)} />
      </SettingsGroup>

      {/* Allow List */}
      <SettingsGroup title="allow list" icon={<Check size={11} />}>
        <p className="text-[9px] text-[var(--color-text-dim)]"># trusted domains that bypass security checks</p>
        <SettingsListManager
          items={settings.allowList}
          onAdd={(domain) => onChange('allowList', [...settings.allowList, domain])}
          onRemove={(index) => onChange('allowList', settings.allowList.filter((_, i) => i !== index))}
          placeholder="domain.com"
        />
      </SettingsGroup>

      {/* Block List */}
      <SettingsGroup title="block list">
        <p className="text-[9px] text-[var(--color-text-dim)]"># additional domains to always block</p>
        <SettingsListManager
          items={settings.customBlockList}
          onAdd={(domain) => onChange('customBlockList', [...settings.customBlockList, domain])}
          onRemove={(index) => onChange('customBlockList', settings.customBlockList.filter((_, i) => i !== index))}
          placeholder="blocked-domain.com"
        />
      </SettingsGroup>

      {/* Browser Behavior */}
      <SettingsGroup title="behavior">
        <div className="grid gap-3 sm:grid-cols-2">
          <SettingsSlider label="timeout" description="max wait for page load" value={settings.navigationTimeout} onChange={(v) => onChange('navigationTimeout', v)} min={5000} max={120000} step={5000} format={(v) => `${Math.round(v / 1000)}s`} />
          <SettingsSlider label="max-content" description="max chars to extract" value={settings.maxContentLength} onChange={(v) => onChange('maxContentLength', v)} min={10000} max={500000} step={10000} format={(v) => `${Math.round(v / 1000)}K`} />
        </div>
        <SettingsToggleRow label="javascript" description="allow JavaScript execution in pages" checked={settings.enableJavaScript} onToggle={() => onChange('enableJavaScript', !settings.enableJavaScript)} />
        <SettingsToggleRow label="cookies" description="allow websites to store cookies" checked={settings.enableCookies} onToggle={() => onChange('enableCookies', !settings.enableCookies)} />
        <SettingsToggleRow label="clear-on-exit" description="clear cache, cookies, storage on exit" checked={settings.clearDataOnExit} onToggle={() => onChange('clearDataOnExit', !settings.clearDataOnExit)} />
      </SettingsGroup>

      {/* Localhost Development */}
      <SettingsGroup title="localhost" icon={<Server size={11} />}>
        <p className="text-[9px] text-[var(--color-text-dim)]"># trusted ports for local development servers</p>
        <div className="space-y-2">
          {settings.trustedLocalhostPorts.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {settings.trustedLocalhostPorts.map((port) => (
                <span key={port} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] bg-[var(--color-success)]/10 border border-[var(--color-success)]/30 text-[var(--color-success)]">
                  :{port}
                  <button
                    onClick={() => onChange('trustedLocalhostPorts', settings.trustedLocalhostPorts.filter(p => p !== port))}
                    className="hover:text-[var(--color-error)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
                    aria-label={`Remove port ${port}`}
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
              className="w-24 px-2 py-1.5 text-[10px] bg-[var(--color-surface-editor)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] outline-none transition-colors focus-visible:border-[var(--color-accent-primary)]/30"
            />
            <button
              onClick={handleAddPort}
              disabled={!portInput || parseInt(portInput, 10) < 1 || parseInt(portInput, 10) > 65535}
              className={cn(
                "px-2 py-1 text-[10px] border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40",
                portInput && parseInt(portInput, 10) >= 1 && parseInt(portInput, 10) <= 65535
                  ? "border-[var(--color-accent-primary)]/30 text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/10"
                  : "border-[var(--color-border-subtle)] text-[var(--color-text-dim)] cursor-not-allowed"
              )}
              aria-label="Add trusted localhost port"
            >
              <Plus size={12} />
            </button>
          </div>
        </div>
      </SettingsGroup>

      {/* Advanced */}
      <SettingsGroup title="advanced">
        <div className="space-y-1.5">
          <label className="text-[10px] text-[var(--color-text-muted)]">--user-agent</label>
          <input
            type="text"
            value={settings.customUserAgent}
            onChange={(e) => onChange('customUserAgent', e.target.value)}
            placeholder="# default Chrome user agent"
            className="w-full px-2 py-1.5 text-[10px] bg-[var(--color-surface-editor)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] outline-none transition-colors focus-visible:border-[var(--color-accent-primary)]/30"
          />
          <p className="text-[9px] text-[var(--color-text-dim)]"># custom user agent string (leave empty for default)</p>
        </div>
      </SettingsGroup>

      {/* Info box */}
      <SettingsInfoBox variant="info" icon={<Shield size={12} />} title="[INFO] browser security active">
        # the embedded browser protects against phishing, malware, and threats. use localhost ports list to trust your development servers.
      </SettingsInfoBox>
    </SettingsSection>
  );
};

export default SettingsBrowser;
