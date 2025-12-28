/**
 * Browser Panel Component
 * 
 * Embedded browser panel with navigation controls, URL bar, and browser view.
 * Uses terminal/CLI styling consistent with the rest of the application.
 */
import React, { useState, useCallback, useEffect, useRef, memo } from 'react';
import {
  Globe,
  X,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Square,
  Maximize2,
  Minimize2,
  ExternalLink,
  Camera,
  FileText,
  Loader2,
  AlertCircle,
  Home,
  Lock,
  Unlock,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Ban,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { useBrowser } from './useBrowser';

interface BrowserPanelProps {
  /** Whether the panel is open */
  isOpen: boolean;
  /** Callback when panel is closed */
  onClose: () => void;
  /** Optional callback when maximized */
  onToggleMaximize?: () => void;
  /** Whether the panel is maximized */
  isMaximized?: boolean;
  /** Initial URL to navigate to */
  initialUrl?: string;
}

// URL validation helper
const isValidUrl = (url: string): boolean => {
  try {
    const normalized = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://')
      ? url
      : `https://${url}`;
    new URL(normalized);
    return true;
  } catch {
    return false;
  }
};

// Check if URL is secure (https)
const isSecureUrl = (url: string): boolean => {
  return url.startsWith('https://') || url.startsWith('file://');
};

export const BrowserPanel: React.FC<BrowserPanelProps> = memo(({
  isOpen,
  onClose,
  onToggleMaximize,
  isMaximized = false,
  initialUrl,
}) => {
  const browser = useBrowser({ pollInterval: 1000 });
  
  const [urlInput, setUrlInput] = useState('');
  const [showExtractedContent, setShowExtractedContent] = useState(false);
  const [extractedContent, setExtractedContent] = useState<string>('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [showSecurityStats, setShowSecurityStats] = useState(false);
  const [securityStats, setSecurityStats] = useState<{
    blockedUrls: number;
    blockedPopups: number;
    blockedAds: number;
    blockedTrackers: number;
    blockedDownloads: number;
    warnings: number;
  } | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const browserContentRef = useRef<HTMLDivElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Fetch security stats periodically
  useEffect(() => {
    if (!isOpen) return;
    
    const fetchStats = async () => {
      const stats = await browser.getSecurityStats();
      if (stats) {
        setSecurityStats(stats);
      }
    };
    
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [isOpen, browser]);

  // Store browser functions in refs to avoid effect re-runs
  const browserRef = useRef(browser);
  browserRef.current = browser;

  // Attach browser view when panel opens
  useEffect(() => {
    if (!isOpen || !browserContentRef.current) return;

    const currentBrowser = browserRef.current;

    const updateBounds = () => {
      if (!browserContentRef.current) return;
      
      // Get the bounds of the browser content area (not the whole panel)
      const rect = browserContentRef.current.getBoundingClientRect();
      currentBrowser.setBounds({
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };

    // Attach with initial bounds after a short delay to ensure layout is complete
    const attachTimer = setTimeout(() => {
      if (!browserContentRef.current) return;
      
      const rect = browserContentRef.current.getBoundingClientRect();
      currentBrowser.attach({
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }).then((attached) => {
        if (attached && initialUrl) {
          currentBrowser.navigate(initialUrl);
          setUrlInput(initialUrl);
        }
      });
    }, 100);

    // Setup resize observer on the content area
    resizeObserverRef.current = new ResizeObserver(() => {
      // Debounce bounds updates
      requestAnimationFrame(updateBounds);
    });
    resizeObserverRef.current.observe(browserContentRef.current);

    // Also update on window resize
    const handleResize = () => updateBounds();
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(attachTimer);
      resizeObserverRef.current?.disconnect();
      window.removeEventListener('resize', handleResize);
      void currentBrowser.detach();
    };
  }, [isOpen, initialUrl]);

  // Update URL input when browser navigates
  useEffect(() => {
    if (browser.state.url && browser.state.url !== urlInput) {
      setUrlInput(browser.state.url);
    }
  }, [browser.state.url, urlInput]);

  // Handle URL submission
  const handleNavigate = useCallback(() => {
    if (!urlInput.trim()) return;
    
    let url = urlInput.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
      // Check if it looks like a domain
      if (url.includes('.') && !url.includes(' ')) {
        url = `https://${url}`;
      } else {
        // Treat as search query
        url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
      }
    }
    
    browser.navigate(url);
  }, [urlInput, browser]);

  // Handle key press in URL bar
  const handleUrlKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNavigate();
    } else if (e.key === 'Escape') {
      setUrlInput(browser.state.url);
      urlInputRef.current?.blur();
    }
  }, [handleNavigate, browser.state.url]);

  // Extract content from current page
  const handleExtractContent = useCallback(async () => {
    const content = await browser.extractContent({ maxLength: 30000 });
    if (content) {
      setExtractedContent(
        `# ${content.title}\n\n` +
        `**URL:** ${content.url}\n\n` +
        (content.metadata.description ? `**Description:** ${content.metadata.description}\n\n` : '') +
        `## Content\n\n${content.text.slice(0, 10000)}${content.text.length > 10000 ? '\n\n...[truncated]' : ''}`
      );
      setShowExtractedContent(true);
      setScreenshot(null);
    }
  }, [browser]);

  // Take screenshot
  const handleScreenshot = useCallback(async () => {
    const img = await browser.takeScreenshot({ format: 'png' });
    if (img) {
      setScreenshot(`data:image/png;base64,${img}`);
      setShowExtractedContent(false);
    }
  }, [browser]);

  // Navigate to home
  const handleHome = useCallback(() => {
    browser.navigate('https://www.google.com');
  }, [browser]);

  // Close extracted content/screenshot overlay
  const handleCloseOverlay = useCallback(() => {
    setShowExtractedContent(false);
    setScreenshot(null);
    setExtractedContent('');
  }, []);

  if (!isOpen) return null;

  const isSecure = isSecureUrl(browser.state.url);

  return (
    <div 
      ref={containerRef}
      className="h-full w-full flex flex-col border-l border-[var(--color-border-subtle)] font-mono"
      style={{ backgroundColor: 'transparent' }}
    >
      {/* Header - matches terminal panel styling */}
      <div className="h-8 flex items-center justify-between bg-[var(--color-surface-header)] border-b border-[var(--color-border-subtle)]">
        {/* Title section */}
        <div className="flex items-center gap-2 px-3 h-full">
          <Globe size={12} className="text-[var(--color-accent-primary)]" />
          <span className="text-[10px] text-[var(--color-text-primary)]">Browser</span>
          {browser.isLoading && (
            <Loader2 size={10} className="animate-spin text-[var(--color-accent-primary)]" />
          )}
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-1 px-2">
          {onToggleMaximize && (
            <button
              onClick={onToggleMaximize}
              className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
              title={isMaximized ? 'Minimize' : 'Maximize'}
            >
              {isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
            title="Close"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Navigation Bar */}
      <div className="h-8 flex items-center gap-2 px-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-base)]">
        {/* Navigation Buttons */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={browser.goBack}
            disabled={!browser.state.canGoBack}
            className={cn(
              "p-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40",
              browser.state.canGoBack
                ? "hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
                : "text-[var(--color-text-dim)] cursor-not-allowed opacity-50"
            )}
            title="Back"
          >
            <ArrowLeft size={12} />
          </button>
          
          <button
            onClick={browser.goForward}
            disabled={!browser.state.canGoForward}
            className={cn(
              "p-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40",
              browser.state.canGoForward
                ? "hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
                : "text-[var(--color-text-dim)] cursor-not-allowed opacity-50"
            )}
            title="Forward"
          >
            <ArrowRight size={12} />
          </button>
          
          <button
            onClick={browser.isLoading ? browser.stop : browser.reload}
            className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
            title={browser.isLoading ? 'Stop' : 'Reload'}
          >
            {browser.isLoading ? (
              <Square size={12} />
            ) : (
              <RotateCw size={12} />
            )}
          </button>

          <button
            onClick={handleHome}
            className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
            title="Home"
          >
            <Home size={12} />
          </button>
        </div>

        {/* URL Bar */}
        <div className="flex-1 h-6 flex items-center gap-1.5 px-2 bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] rounded-sm focus-within:border-[var(--color-accent-primary)]/50 transition-colors">
          {browser.state.url && (
            <span className="flex-none" title={isSecure ? 'Secure connection' : 'Not secure'}>
              {isSecure ? (
                <Lock size={10} className="text-[var(--color-success)]" />
              ) : (
                <Unlock size={10} className="text-[var(--color-warning)]" />
              )}
            </span>
          )}
          <input
            ref={urlInputRef}
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={handleUrlKeyDown}
            placeholder="Enter URL or search..."
            className="flex-1 h-full bg-transparent text-[11px] text-[var(--color-text-primary)] placeholder-[var(--color-text-placeholder)] outline-none"
          />
          {urlInput && isValidUrl(urlInput) && (
            <button
              onClick={() => window.open(urlInput, '_blank')}
              className="flex-none p-0.5 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
              title="Open in external browser"
            >
              <ExternalLink size={10} />
            </button>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleScreenshot}
            disabled={!browser.state.url || browser.isLoading}
            className={cn(
              "p-1 rounded transition-colors",
              browser.state.url && !browser.isLoading
                ? "hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
                : "text-[var(--color-text-dim)] cursor-not-allowed opacity-50"
            )}
            title="Take Screenshot"
          >
            <Camera size={12} />
          </button>
          
          <button
            onClick={handleExtractContent}
            disabled={!browser.state.url || browser.isLoading}
            className={cn(
              "p-1 rounded transition-colors",
              browser.state.url && !browser.isLoading
                ? "hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
                : "text-[var(--color-text-dim)] cursor-not-allowed opacity-50"
            )}
            title="Extract Content"
          >
            <FileText size={12} />
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {browser.error && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-error)]/10 border-b border-[var(--color-error)]/20">
          <AlertCircle size={12} className="text-[var(--color-error)] flex-none" />
          <span className="text-[10px] text-[var(--color-error)] truncate">{browser.error}</span>
        </div>
      )}

      {/* Browser View Container - this is where Electron's BrowserView will render */}
      {/* IMPORTANT: This div must be transparent to allow the native BrowserView to show through */}
      {/* The BrowserView renders at the OS level BEHIND the React UI */}
      <div 
        ref={browserContentRef}
        className="flex-1 relative"
        style={{ backgroundColor: 'transparent' }}
      >
        {/* Placeholder when no URL - terminal style */}
        {!browser.state.url && !browser.isLoading && !browser.isAttached && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--color-surface-base)] z-10">
            <div className="text-center max-w-sm px-4 space-y-4">
              {/* Terminal-style icon */}
              <div className="flex items-center justify-center">
                <Globe size={32} className="text-[var(--color-text-dim)]" />
              </div>
              
              {/* Terminal-style title */}
              <div className="space-y-1">
                <h3 className="text-[12px] font-medium text-[var(--color-text-primary)]">
                  Agent Browser
                </h3>
                <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
                  This embedded browser allows the AI agent to fetch real-time
                  documentation, test web applications, and extract content from
                  web pages.
                </p>
              </div>
              
              {/* Quick links - terminal style */}
              <div className="pt-2 space-y-2">
                <p className="text-[9px] text-[var(--color-text-dim)]">Try navigating to:</p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => browser.navigate('https://react.dev')}
                    className="px-2 py-1 text-[10px] rounded-sm bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
                  >
                    React Docs
                  </button>
                  <button
                    onClick={() => browser.navigate('https://developer.mozilla.org')}
                    className="px-2 py-1 text-[10px] rounded-sm bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
                  >
                    MDN
                  </button>
                  <button
                    onClick={() => browser.navigate('http://localhost:3000')}
                    className="px-2 py-1 text-[10px] rounded-sm bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
                  >
                    localhost:3000
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Initial loading state when attaching */}
        {browser.isLoading && !browser.state.url && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--color-surface-base)] z-10">
            <Loader2 size={24} className="animate-spin text-[var(--color-accent-primary)] mb-2" />
            <span className="text-[10px] text-[var(--color-text-muted)]">Loading...</span>
          </div>
        )}

        {/* Loading Indicator */}
        {browser.isLoading && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-[var(--color-surface-2)] overflow-hidden z-10">
            <div 
              className="h-full w-1/3 bg-[var(--color-accent-primary)]" 
              style={{ animation: 'loading-bar 1s ease-in-out infinite' }} 
            />
          </div>
        )}

        {/* Screenshot/Content Overlay */}
        {(showExtractedContent || screenshot) && (
          <div className="absolute inset-0 bg-[var(--color-surface-base)] z-20 overflow-auto">
            <div className="sticky top-0 h-8 flex items-center justify-between px-3 bg-[var(--color-surface-header)] border-b border-[var(--color-border-subtle)]">
              <span className="text-[10px] text-[var(--color-text-primary)]">
                {showExtractedContent ? 'Extracted Content' : 'Screenshot'}
              </span>
              <button
                onClick={handleCloseOverlay}
                className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
              >
                <X size={12} />
              </button>
            </div>
            
            {showExtractedContent && (
              <pre className="p-3 text-[10px] text-[var(--color-text-primary)] whitespace-pre-wrap">
                {extractedContent}
              </pre>
            )}
            
            {screenshot && (
              <div className="p-3">
                <img 
                  src={screenshot} 
                  alt="Page screenshot" 
                  className="max-w-full rounded-sm border border-[var(--color-border-subtle)]" 
                />
              </div>
            )}
          </div>
        )}

        {/* The actual BrowserView is rendered by Electron in this space */}
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-2 py-1 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-header)] text-[9px] text-[var(--color-text-muted)]">
        <span className="truncate max-w-[40%]">
          {browser.state.title || 'New Tab'}
        </span>
        
        {/* Security Stats */}
        <div className="flex items-center gap-2">
          {securityStats && (
            <button
              onClick={() => setShowSecurityStats(!showSecurityStats)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm hover:bg-[var(--color-surface-2)] transition-colors relative focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
              title="Security Status"
            >
              {(securityStats.blockedUrls + securityStats.blockedPopups + securityStats.blockedAds + securityStats.blockedTrackers + securityStats.blockedDownloads) > 0 ? (
                <ShieldCheck size={10} className="text-[var(--color-success)]" />
              ) : (
                <Shield size={10} className="text-[var(--color-text-muted)]" />
              )}
              <span className="text-[9px]">
                {securityStats.blockedUrls + securityStats.blockedPopups + securityStats.blockedAds + securityStats.blockedTrackers + securityStats.blockedDownloads} blocked
              </span>
            </button>
          )}
          
          {browser.isLoading && (
            <span className="flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" />
              Loading...
            </span>
          )}
        </div>
      </div>
      
      {/* Security Stats Popup */}
      {showSecurityStats && securityStats && (
        <div className="absolute bottom-8 right-3 z-50 bg-[var(--color-surface-1)] border border-[var(--color-border-default)] rounded-sm shadow-lg p-3 min-w-[200px]">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[10px] font-medium text-[var(--color-text-primary)] flex items-center gap-1.5">
              <ShieldCheck size={12} className="text-[var(--color-success)]" />
              Security Status
            </h4>
            <button
              onClick={() => setShowSecurityStats(false)}
              className="p-0.5 hover:bg-[var(--color-surface-2)] rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
            >
              <X size={10} className="text-[var(--color-text-muted)]" />
            </button>
          </div>
          <div className="space-y-1.5 text-[9px]">
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-muted)]">Dangerous URLs</span>
              <span className="font-medium text-[var(--color-text-primary)]">
                {securityStats.blockedUrls > 0 ? (
                  <span className="text-[var(--color-error)] flex items-center gap-0.5">
                    <Ban size={10} />
                    {securityStats.blockedUrls}
                  </span>
                ) : (
                  <span className="text-[var(--color-success)]">0</span>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-muted)]">Popups Blocked</span>
              <span className="font-medium text-[var(--color-text-primary)]">{securityStats.blockedPopups}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-muted)]">Ads Blocked</span>
              <span className="font-medium text-[var(--color-text-primary)]">{securityStats.blockedAds}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-muted)]">Trackers Blocked</span>
              <span className="font-medium text-[var(--color-text-primary)]">{securityStats.blockedTrackers}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-muted)]">Downloads Blocked</span>
              <span className="font-medium text-[var(--color-text-primary)]">{securityStats.blockedDownloads}</span>
            </div>
            {securityStats.warnings > 0 && (
              <div className="flex items-center justify-between pt-1.5 border-t border-[var(--color-border-subtle)]">
                <span className="text-[var(--color-text-muted)]">Warnings</span>
                <span className="text-[var(--color-warning)] font-medium flex items-center gap-0.5">
                  <ShieldAlert size={10} />
                  {securityStats.warnings}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Loading bar animation styles */}
      <style>{`
        @keyframes loading-bar {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
});

BrowserPanel.displayName = 'BrowserPanel';

export default BrowserPanel;
