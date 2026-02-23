/**
 * BrowserResultPreview Component
 * 
 * Specialized preview renderer for browser tool execution results.
 * Displays screenshots as inline images, navigation results with URL info,
 * extracted content previews, and interaction feedback — all rendered
 * directly in the chat interface for a seamless experience.
 * 
 * Supports:
 * - Screenshot display (browser_screenshot) with expand/download
 * - Navigation results (browser_navigate) with URL, title, load time, thumbnail
 * - Content extraction previews (browser_extract, browser_fetch) with inline images
 * - Interaction feedback (browser_click, browser_type, browser_fill_form)
 * - Page snapshot summaries (browser_snapshot)
 * - Console logs (browser_console)
 * - Network requests (browser_network)
 * - Evaluate results (browser_evaluate)
 * - Inline image galleries from extracted content
 * - OG image previews for fetched pages
 * - Link previews with favicons
 */
import React, { memo, useState, useCallback, useMemo } from 'react';
import {
  Globe,
  Camera,
  FileText,
  MousePointer2,
  Type,
  Maximize2,
  Download,
  X,
  Clock,
  CheckCircle2,
  XCircle,
  ScrollText,
  Code2,
  Network,
  FormInput,
  Eye,
  Layers,
  Shield,
  Terminal,
  ExternalLink,
  ImageIcon,
  Link2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '../../../../utils/cn';
import type { ToolCall } from './types';

// =============================================================================
// Types
// =============================================================================

interface BrowserResultPreviewProps {
  /** The browser tool call to render */
  tool: ToolCall;
  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// Sub-components
// =============================================================================

/** 
 * Inline screenshot viewer with expand modal and download 
 */
const ScreenshotPreview: React.FC<{
  screenshot: string;
  format?: string;
  url?: string;
  title?: string;
  fullPage?: boolean;
  selector?: string;
}> = memo(({ screenshot, format = 'png', url, title, fullPage, selector }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const dataUrl = `data:${mimeType};base64,${screenshot}`;

  const handleDownload = useCallback(() => {
    const link = document.createElement('a');
    link.href = dataUrl;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.download = `screenshot-${timestamp}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [dataUrl, format]);

  const captureLabel = useMemo(() => {
    if (selector) return `Element: ${selector}`;
    if (fullPage) return 'Full page';
    return 'Viewport';
  }, [selector, fullPage]);

  return (
    <>
      <div className="px-1.5 py-1.5">
        {/* URL bar info */}
        {(url || title) && (
          <div className="flex items-center gap-1 mb-1 text-[8px] text-[var(--color-text-dim)]">
            <Globe size={8} className="shrink-0" />
            <span className="truncate">{title || url}</span>
          </div>
        )}

        {/* Screenshot image */}
        <div className="group relative inline-block rounded-sm overflow-hidden border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]">
          <img
            src={dataUrl}
            alt={`Browser screenshot${selector ? ` of ${selector}` : ''}`}
            className={cn(
              'max-w-full max-h-[240px] object-contain cursor-pointer',
              'transition-transform hover:scale-[1.01]',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40',
            )}
            onClick={() => setIsExpanded(true)}
            role="button"
            tabIndex={0}
            aria-label="Expand screenshot"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsExpanded(true);
              }
            }}
          />

          {/* Hover controls */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
          <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setIsExpanded(true)}
              className="p-1 bg-black/50 hover:bg-black/70 rounded text-white/80 hover:text-white transition-colors text-[8px]"
              title="Expand"
            >
              <Maximize2 size={9} />
            </button>
            <button
              onClick={handleDownload}
              className="p-1 bg-black/50 hover:bg-black/70 rounded text-white/80 hover:text-white transition-colors text-[8px]"
              title="Download"
            >
              <Download size={9} />
            </button>
          </div>

          {/* Capture info badge */}
          <div className="absolute bottom-1 left-1 text-[7px] bg-black/50 text-white/80 px-1 py-0.5 rounded">
            <Camera size={7} className="inline mr-0.5" />
            {captureLabel}
          </div>
        </div>
      </div>

      {/* Expanded modal */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setIsExpanded(false)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={dataUrl}
              alt="Screenshot expanded"
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
            {/* Info bar */}
            {(url || title) && (
              <div className="absolute bottom-4 left-4 right-16 text-[10px] bg-black/60 text-white/80 px-2 py-1 rounded-md truncate">
                {title && <span className="font-medium">{title}</span>}
                {title && url && <span className="mx-1 opacity-50">|</span>}
                {url && <span className="opacity-70">{url}</span>}
              </div>
            )}
            {/* Modal controls */}
            <div className="absolute top-4 right-4 flex gap-2">
              <button
                onClick={handleDownload}
                className="p-2 bg-black/60 hover:bg-black/80 rounded-lg text-white/80 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50"
                title="Download"
              >
                <Download size={16} />
              </button>
              <button
                onClick={() => setIsExpanded(false)}
                className="p-2 bg-black/60 hover:bg-black/80 rounded-lg text-white/80 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
ScreenshotPreview.displayName = 'ScreenshotPreview';

/**
 * Inline image gallery for images found on extracted pages
 */
const InlineImageGallery: React.FC<{
  images: Array<{ src: string; alt?: string; width?: number; height?: number }>;
  pageUrl?: string;
}> = memo(({ images, pageUrl }) => {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set());

  const handleImageError = useCallback((idx: number) => {
    setFailedImages(prev => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
  }, []);

  const visibleImages = images.filter((_, idx) => !failedImages.has(idx));

  if (visibleImages.length === 0) return null;

  return (
    <>
      <div className="px-1.5 py-1">
        <div className="flex items-center gap-1 mb-1 text-[8px] text-[var(--color-text-dim)]">
          <ImageIcon size={8} className="shrink-0" />
          <span>{visibleImages.length} image{visibleImages.length !== 1 ? 's' : ''} found</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {images.map((img, idx) => {
            if (failedImages.has(idx)) return null;
            // Resolve relative URLs
            let imgSrc = img.src;
            if (pageUrl && !imgSrc.startsWith('http') && !imgSrc.startsWith('data:')) {
              try {
                imgSrc = new URL(imgSrc, pageUrl).href;
              } catch {
                // Use as-is
              }
            }
            return (
              <div
                key={idx}
                className="group relative rounded-sm overflow-hidden border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] cursor-pointer hover:border-[var(--color-accent-primary)]/40 transition-colors"
                onClick={() => setExpandedIdx(idx)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setExpandedIdx(idx);
                  }
                }}
              >
                <img
                  src={imgSrc}
                  alt={img.alt || `Image ${idx + 1}`}
                  className="w-[72px] h-[54px] object-cover"
                  onError={() => handleImageError(idx)}
                  loading="lazy"
                />
                {img.alt && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-[6px] text-white/80 px-0.5 py-px truncate">
                    {img.alt.slice(0, 30)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Expanded image modal */}
      {expandedIdx !== null && !failedImages.has(expandedIdx) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setExpandedIdx(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={(() => {
                let src = images[expandedIdx].src;
                if (pageUrl && !src.startsWith('http') && !src.startsWith('data:')) {
                  try { src = new URL(src, pageUrl).href; } catch { /* use as-is */ }
                }
                return src;
              })()}
              alt={images[expandedIdx].alt || 'Page image'}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
            {images[expandedIdx].alt && (
              <div className="absolute bottom-4 left-4 right-16 text-[10px] bg-black/60 text-white/80 px-2 py-1 rounded-md truncate">
                {images[expandedIdx].alt}
              </div>
            )}
            <button
              onClick={() => setExpandedIdx(null)}
              className="absolute top-4 right-4 p-2 bg-black/60 hover:bg-black/80 rounded-lg text-white/80 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
});
InlineImageGallery.displayName = 'InlineImageGallery';

/**
 * OG image / hero image preview for fetched pages
 */
const OgImagePreview: React.FC<{
  ogImage: string;
  title?: string;
  pageUrl?: string;
}> = memo(({ ogImage, title, pageUrl }) => {
  const [failed, setFailed] = useState(false);
  
  if (failed || !ogImage) return null;

  let imgSrc = ogImage;
  if (pageUrl && !imgSrc.startsWith('http') && !imgSrc.startsWith('data:')) {
    try { imgSrc = new URL(imgSrc, pageUrl).href; } catch { /* use as-is */ }
  }

  return (
    <div className="px-1.5 py-1">
      <div className="rounded-sm overflow-hidden border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]">
        <img
          src={imgSrc}
          alt={title || 'Page preview'}
          className="w-full max-h-[120px] object-cover"
          onError={() => setFailed(true)}
          loading="lazy"
        />
      </div>
    </div>
  );
});
OgImagePreview.displayName = 'OgImagePreview';

/**
 * Inline link previews from extracted content
 */
const LinkPreviewList: React.FC<{
  links: Array<{ text: string; href: string; isExternal?: boolean }>;
}> = memo(({ links }) => {
  const [showAll, setShowAll] = useState(false);
  const displayLinks = showAll ? links : links.slice(0, 5);

  if (links.length === 0) return null;

  return (
    <div className="px-1.5 py-1">
      <div className="flex items-center gap-1 mb-0.5 text-[8px] text-[var(--color-text-dim)]">
        <Link2 size={8} className="shrink-0" />
        <span>{links.length} link{links.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="space-y-px">
        {displayLinks.map((link, idx) => {
          let domain = '';
          try { domain = new URL(link.href).hostname; } catch { /* ignore */ }
          return (
            <div
              key={idx}
              className="flex items-center gap-1 px-1 py-0.5 rounded-sm hover:bg-[var(--color-surface-2)] transition-colors group"
            >
              {domain && (
                <img
                  src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                  alt=""
                  className="w-[10px] h-[10px] shrink-0 rounded-sm"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[8px] text-[var(--color-accent-primary)]/80 hover:text-[var(--color-accent-primary)] hover:underline truncate flex-1 transition-colors"
                title={link.href}
              >
                {link.text || domain || link.href}
              </a>
              {link.isExternal && (
                <ExternalLink size={7} className="shrink-0 text-[var(--color-text-dim)]/40 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          );
        })}
      </div>
      {links.length > 5 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="flex items-center gap-0.5 mt-0.5 text-[7px] text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] transition-colors"
        >
          {showAll ? <ChevronDown size={7} /> : <ChevronRight size={7} />}
          <span>{showAll ? 'show less' : `+${links.length - 5} more`}</span>
        </button>
      )}
    </div>
  );
});
LinkPreviewList.displayName = 'LinkPreviewList';

/**
 * Navigation result display (browser_navigate, browser_back, browser_forward, browser_reload)
 */
const NavigationResultPreview: React.FC<{
  output: string;
  metadata: Record<string, unknown>;
  success: boolean;
}> = memo(({ output, metadata, success }) => {
  const url = typeof metadata.url === 'string' ? metadata.url : '';
  const title = typeof metadata.title === 'string' ? metadata.title : '';
  const loadTime = typeof metadata.loadTime === 'number' ? metadata.loadTime : undefined;
  const thumbnail = typeof metadata.thumbnail === 'string' ? metadata.thumbnail : '';
  const [thumbFailed, setThumbFailed] = useState(false);

  return (
    <div className="px-1.5 py-1">
      <div className="flex items-start gap-1.5">
        {success ? (
          <CheckCircle2 size={10} className="shrink-0 mt-0.5" style={{ color: 'var(--color-success)' }} />
        ) : (
          <XCircle size={10} className="shrink-0 mt-0.5" style={{ color: 'var(--color-error)' }} />
        )}
        <div className="min-w-0 flex-1">
          {/* Title */}
          {title && (
            <div className="text-[9px] text-[var(--color-text-primary)] font-medium truncate">{title}</div>
          )}
          {/* URL */}
          {url && (
            <div className="flex items-center gap-1 text-[8px] text-[var(--color-text-dim)] truncate">
              <Globe size={8} className="shrink-0" />
              <span className="truncate">{url}</span>
            </div>
          )}
          {/* Load time */}
          {loadTime != null && (
            <div className="flex items-center gap-1 text-[8px] text-[var(--color-text-dim)] mt-0.5">
              <Clock size={7} className="shrink-0" />
              <span>{loadTime < 1000 ? `${loadTime}ms` : `${(loadTime / 1000).toFixed(1)}s`}</span>
            </div>
          )}
          {/* Error output */}
          {!success && output && (
            <pre className="mt-1 text-[8px] text-[var(--color-error)] leading-relaxed whitespace-pre-wrap break-words">
              {output.slice(0, 500)}
            </pre>
          )}
        </div>
      </div>

      {/* Auto-captured thumbnail from navigation */}
      {success && thumbnail && !thumbFailed && (
        <div className="mt-1.5">
          <div className="rounded-sm overflow-hidden border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] inline-block">
            <img
              src={`data:image/jpeg;base64,${thumbnail}`}
              alt={`Page preview: ${title || url}`}
              className="max-w-full max-h-[140px] object-contain"
              onError={() => setThumbFailed(true)}
              loading="lazy"
            />
            <div className="flex items-center gap-0.5 px-1 py-0.5 bg-[var(--color-surface-1)] text-[7px] text-[var(--color-text-dim)]">
              <Camera size={7} className="shrink-0" />
              <span>page preview</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
NavigationResultPreview.displayName = 'NavigationResultPreview';

/**
 * Content extraction preview (browser_extract, browser_fetch)
 */
const ContentExtractionPreview: React.FC<{
  output: string;
  metadata: Record<string, unknown>;
  toolName: string;
}> = memo(({ output, metadata, toolName }) => {
  const url = typeof metadata.url === 'string' ? metadata.url : '';
  const title = typeof metadata.title === 'string' ? metadata.title : '';
  const linkCount = typeof metadata.linkCount === 'number' ? metadata.linkCount : undefined;
  const imageCount = typeof metadata.imageCount === 'number' ? metadata.imageCount : undefined;
  const contentLength = typeof metadata.contentLength === 'number' ? metadata.contentLength
    : typeof metadata.textLength === 'number' ? metadata.textLength : undefined;
  const headingCount = typeof metadata.headingCount === 'number' ? metadata.headingCount : undefined;
  const loadTime = typeof metadata.loadTime === 'number' ? metadata.loadTime : undefined;
  const isFetch = toolName === 'browser_fetch';
  const ogImage = typeof metadata.ogImage === 'string' ? metadata.ogImage : '';
  const description = typeof metadata.description === 'string' ? metadata.description : '';
  const inlineImages = Array.isArray(metadata.inlineImages)
    ? (metadata.inlineImages as Array<{ src: string; alt?: string; width?: number; height?: number }>)
    : [];
  const links = Array.isArray(metadata.links)
    ? (metadata.links as Array<{ text: string; href: string; isExternal?: boolean }>)
    : [];
  const [showContent, setShowContent] = useState(false);

  return (
    <div className="px-1.5 py-1">
      {/* OG Image hero banner */}
      {ogImage && <OgImagePreview ogImage={ogImage} title={title} pageUrl={url} />}

      {/* Header info */}
      <div className="flex items-center gap-1 mb-1">
        {isFetch ? <Globe size={9} className="shrink-0 text-[var(--color-text-dim)]" /> : <FileText size={9} className="shrink-0 text-[var(--color-text-dim)]" />}
        <span className="text-[9px] text-[var(--color-text-primary)] font-medium truncate">
          {title || 'Content extracted'}
        </span>
      </div>

      {/* URL */}
      {url && (
        <div className="flex items-center gap-1 mb-1 text-[8px] text-[var(--color-text-dim)]">
          <Globe size={7} className="shrink-0" />
          <span className="truncate">{url}</span>
        </div>
      )}

      {/* Description */}
      {description && (
        <div className="text-[8px] text-[var(--color-text-secondary)] mb-1 leading-relaxed line-clamp-2">
          {description}
        </div>
      )}

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-2 mb-1 text-[8px] text-[var(--color-text-dim)]">
        {contentLength != null && (
          <span>{contentLength > 1000 ? `${(contentLength / 1000).toFixed(1)}k` : contentLength} chars</span>
        )}
        {linkCount != null && linkCount > 0 && <span>{linkCount} links</span>}
        {imageCount != null && imageCount > 0 && <span>{imageCount} images</span>}
        {headingCount != null && headingCount > 0 && <span>{headingCount} headings</span>}
        {loadTime != null && (
          <span>{loadTime < 1000 ? `${loadTime}ms` : `${(loadTime / 1000).toFixed(1)}s`}</span>
        )}
      </div>

      {/* Inline images gallery */}
      {inlineImages.length > 0 && (
        <InlineImageGallery images={inlineImages} pageUrl={url} />
      )}

      {/* Link previews */}
      {links.length > 0 && (
        <LinkPreviewList links={links} />
      )}

      {/* Content toggle */}
      {output && (
        <>
          <button
            onClick={() => setShowContent(!showContent)}
            className="flex items-center gap-0.5 mt-0.5 text-[8px] text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] transition-colors"
          >
            {showContent ? <ChevronDown size={8} /> : <ChevronRight size={8} />}
            <span>{showContent ? 'hide content' : 'show content preview'}</span>
          </button>

          {showContent && (
            <pre className={cn(
              'mt-1 text-[8px] leading-relaxed overflow-x-auto',
              'text-[var(--color-text-secondary)]',
              'max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words',
            )}>
              {output.slice(0, 1500)}
              {output.length > 1500 && '\n...(truncated)'}
            </pre>
          )}
        </>
      )}
    </div>
  );
});
ContentExtractionPreview.displayName = 'ContentExtractionPreview';

/**
 * Interaction feedback (browser_click, browser_type, browser_hover, browser_fill_form)
 */
const InteractionPreview: React.FC<{
  output: string;
  metadata: Record<string, unknown>;
  toolName: string;
  success: boolean;
}> = memo(({ output, metadata, toolName, success }) => {
  const selector = typeof metadata.selector === 'string' ? metadata.selector : '';
  const text = typeof metadata.text === 'string' ? metadata.text : '';
  const url = typeof metadata.url === 'string' ? metadata.url : '';
  const filledFields = typeof metadata.filledCount === 'number' ? metadata.filledCount : undefined;
  const failedFields = typeof metadata.failedCount === 'number' ? metadata.failedCount : undefined;
  const submitted = metadata.submitted === true;

  const icon = useMemo(() => {
    switch (toolName) {
      case 'browser_click': return <MousePointer2 size={9} className="shrink-0" />;
      case 'browser_type': return <Type size={9} className="shrink-0" />;
      case 'browser_hover': return <Eye size={9} className="shrink-0" />;
      case 'browser_fill_form': return <FormInput size={9} className="shrink-0" />;
      case 'browser_scroll': return <ScrollText size={9} className="shrink-0" />;
      default: return <MousePointer2 size={9} className="shrink-0" />;
    }
  }, [toolName]);

  return (
    <div className="px-1.5 py-1">
      <div className="flex items-start gap-1.5">
        {success ? (
          <CheckCircle2 size={9} className="shrink-0 mt-0.5" style={{ color: 'var(--color-success)' }} />
        ) : (
          <XCircle size={9} className="shrink-0 mt-0.5" style={{ color: 'var(--color-error)' }} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[9px] text-[var(--color-text-secondary)]">
            {icon}
            <span className="truncate">{output.split('\n')[0]?.slice(0, 120) || toolName}</span>
          </div>
          {selector && (
            <div className="text-[8px] text-[var(--color-text-dim)] mt-0.5 font-mono truncate">
              {selector}
            </div>
          )}
          {text && (
            <div className="text-[8px] text-[var(--color-text-dim)] mt-0.5 truncate">
              text: &quot;{text.slice(0, 80)}&quot;
            </div>
          )}
          {url && (
            <div className="flex items-center gap-0.5 text-[8px] text-[var(--color-text-dim)] mt-0.5 truncate">
              <Globe size={7} className="shrink-0" />
              <span className="truncate">{url}</span>
            </div>
          )}
          {/* Form fill details */}
          {toolName === 'browser_fill_form' && (filledFields != null || failedFields != null) && (
            <div className="flex items-center gap-2 mt-1 text-[8px]">
              {filledFields != null && (
                <span className="flex items-center gap-0.5 text-[var(--color-success)]">
                  <CheckCircle2 size={7} />
                  {filledFields} filled
                </span>
              )}
              {failedFields != null && failedFields > 0 && (
                <span className="flex items-center gap-0.5 text-[var(--color-error)]">
                  <XCircle size={7} />
                  {failedFields} failed
                </span>
              )}
              {submitted && (
                <span className="text-[var(--color-accent-primary)]">submitted</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
InteractionPreview.displayName = 'InteractionPreview';

/**
 * Snapshot/accessibility tree preview
 */
const SnapshotPreview: React.FC<{
  output: string;
}> = memo(({ output }) => {
  return (
    <div className="px-1.5 py-1">
      <div className="flex items-center gap-1 mb-1 text-[8px] text-[var(--color-text-dim)]">
        <Layers size={8} className="shrink-0" />
        <span>Accessibility snapshot</span>
      </div>
      <pre className={cn(
        'text-[8px] leading-relaxed overflow-x-auto',
        'text-[var(--color-text-secondary)]',
        'max-h-[250px] overflow-y-auto whitespace-pre-wrap break-words',
      )}>
        {output.slice(0, 2000)}
        {output.length > 2000 && '\n...(truncated)'}
      </pre>
    </div>
  );
});
SnapshotPreview.displayName = 'SnapshotPreview';

/**
 * Console logs preview (browser_console)
 */
const ConsoleLogsPreview: React.FC<{
  output: string;
}> = memo(({ output }) => {
  return (
    <div className="px-1.5 py-1">
      <div className="flex items-center gap-1 mb-1 text-[8px] text-[var(--color-text-dim)]">
        <Terminal size={8} className="shrink-0" />
        <span>Console output</span>
      </div>
      <pre className={cn(
        'text-[8px] leading-relaxed overflow-x-auto font-mono',
        'text-[var(--color-text-secondary)]',
        'max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words',
      )}>
        {output.slice(0, 1500)}
        {output.length > 1500 && '\n...(truncated)'}
      </pre>
    </div>
  );
});
ConsoleLogsPreview.displayName = 'ConsoleLogsPreview';

/**
 * Network requests preview (browser_network)
 */
const NetworkPreview: React.FC<{
  output: string;
}> = memo(({ output }) => {
  return (
    <div className="px-1.5 py-1">
      <div className="flex items-center gap-1 mb-1 text-[8px] text-[var(--color-text-dim)]">
        <Network size={8} className="shrink-0" />
        <span>Network requests</span>
      </div>
      <pre className={cn(
        'text-[8px] leading-relaxed overflow-x-auto font-mono',
        'text-[var(--color-text-secondary)]',
        'max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words',
      )}>
        {output.slice(0, 1500)}
        {output.length > 1500 && '\n...(truncated)'}
      </pre>
    </div>
  );
});
NetworkPreview.displayName = 'NetworkPreview';

/**
 * Evaluate result preview (browser_evaluate)
 */
const EvaluatePreview: React.FC<{
  output: string;
  success: boolean;
}> = memo(({ output, success }) => {
  return (
    <div className="px-1.5 py-1">
      <div className="flex items-center gap-1 mb-1 text-[8px] text-[var(--color-text-dim)]">
        <Code2 size={8} className="shrink-0" />
        <span>JavaScript {success ? 'result' : 'error'}</span>
      </div>
      <pre className={cn(
        'text-[8px] leading-relaxed overflow-x-auto font-mono',
        success ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-error)]',
        'max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words',
      )}>
        {output.slice(0, 1500)}
        {output.length > 1500 && '\n...(truncated)'}
      </pre>
    </div>
  );
});
EvaluatePreview.displayName = 'EvaluatePreview';

/**
 * Browser state preview (browser_state)
 */
const BrowserStatePreview: React.FC<{
  output: string;
  metadata: Record<string, unknown>;
}> = memo(({ output, metadata }) => {
  const url = typeof metadata.url === 'string' ? metadata.url : '';
  const title = typeof metadata.title === 'string' ? metadata.title : '';
  const isLoading = metadata.isLoading === true;

  return (
    <div className="px-1.5 py-1">
      <div className="flex items-center gap-1 mb-1 text-[8px] text-[var(--color-text-dim)]">
        <Globe size={8} className="shrink-0" />
        <span>Browser state</span>
        {isLoading && <span className="text-[var(--color-accent-primary)]">(loading)</span>}
      </div>
      {title && (
        <div className="text-[9px] text-[var(--color-text-primary)] truncate">{title}</div>
      )}
      {url && (
        <div className="text-[8px] text-[var(--color-text-dim)] truncate mt-0.5">{url}</div>
      )}
      {!title && !url && output && (
        <pre className="text-[8px] text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap break-words max-h-[150px] overflow-y-auto">
          {output.slice(0, 1000)}
        </pre>
      )}
    </div>
  );
});
BrowserStatePreview.displayName = 'BrowserStatePreview';

/**
 * Security status preview (browser_security_status, browser_check_url)
 */
const SecurityPreview: React.FC<{
  output: string;
  success: boolean;
}> = memo(({ output, success }) => {
  return (
    <div className="px-1.5 py-1">
      <div className="flex items-center gap-1 mb-1 text-[8px] text-[var(--color-text-dim)]">
        <Shield size={8} className="shrink-0" />
        <span>Security check</span>
      </div>
      <pre className={cn(
        'text-[8px] leading-relaxed overflow-x-auto',
        success ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-error)]',
        'max-h-[150px] overflow-y-auto whitespace-pre-wrap break-words',
      )}>
        {output.slice(0, 1000)}
      </pre>
    </div>
  );
});
SecurityPreview.displayName = 'SecurityPreview';

// =============================================================================
// Tool Name Sets
// =============================================================================

const SCREENSHOT_TOOLS = new Set(['browser_screenshot']);
const NAVIGATION_TOOLS = new Set(['browser_navigate', 'browser_back', 'browser_forward', 'browser_reload']);
const EXTRACTION_TOOLS = new Set(['browser_extract', 'browser_fetch']);
const INTERACTION_TOOLS = new Set(['browser_click', 'browser_type', 'browser_hover', 'browser_fill_form', 'browser_scroll']);
const SNAPSHOT_TOOLS = new Set(['browser_snapshot']);
const CONSOLE_TOOLS = new Set(['browser_console']);
const NETWORK_TOOLS = new Set(['browser_network']);
const EVALUATE_TOOLS = new Set(['browser_evaluate']);
const STATE_TOOLS = new Set(['browser_state', 'browser_tabs']);
const SECURITY_TOOLS = new Set(['browser_security_status', 'browser_check_url']);
const WAIT_TOOLS = new Set(['browser_wait']);

/** All browser tool names for external matching */
export const ALL_BROWSER_TOOL_NAMES = new Set([
  ...SCREENSHOT_TOOLS,
  ...NAVIGATION_TOOLS,
  ...EXTRACTION_TOOLS,
  ...INTERACTION_TOOLS,
  ...SNAPSHOT_TOOLS,
  ...CONSOLE_TOOLS,
  ...NETWORK_TOOLS,
  ...EVALUATE_TOOLS,
  ...STATE_TOOLS,
  ...SECURITY_TOOLS,
  ...WAIT_TOOLS,
]);

// =============================================================================
// Main Component
// =============================================================================

/**
 * Renders browser tool results with specialized previews.
 * 
 * Screenshot results are displayed as inline images with expand/download.
 * Navigation results show URL, title, and load time.
 * Content extraction shows a truncated text preview with stats.
 * Interaction results show success/failure with selector info.
 */
const BrowserResultPreviewInternal: React.FC<BrowserResultPreviewProps> = ({
  tool,
  className,
}) => {
  const meta = tool.resultMetadata ?? tool.result?.resultMetadata ?? {};
  const output = tool.fullOutput ?? tool.result?.content ?? '';
  const success = tool.result?.toolSuccess !== false;
  const name = tool.name;

  // Screenshot tool - render the captured image inline
  if (SCREENSHOT_TOOLS.has(name)) {
    const screenshot = typeof meta.screenshot === 'string' ? meta.screenshot : '';
    if (screenshot) {
      return (
        <div className={className}>
          <ScreenshotPreview
            screenshot={screenshot}
            format={typeof meta.format === 'string' ? meta.format : 'png'}
            url={typeof meta.url === 'string' ? meta.url : undefined}
            title={typeof meta.title === 'string' ? meta.title : undefined}
            fullPage={meta.fullPage === true}
            selector={typeof meta.selector === 'string' ? meta.selector : undefined}
          />
        </div>
      );
    }
    // Fallback: no screenshot data, show text output
  }

  // Navigation tools
  if (NAVIGATION_TOOLS.has(name)) {
    return (
      <div className={className}>
        <NavigationResultPreview output={output} metadata={meta} success={success} />
      </div>
    );
  }

  // Content extraction tools
  if (EXTRACTION_TOOLS.has(name)) {
    return (
      <div className={className}>
        <ContentExtractionPreview output={output} metadata={meta} toolName={name} />
      </div>
    );
  }

  // Interaction tools
  if (INTERACTION_TOOLS.has(name)) {
    return (
      <div className={className}>
        <InteractionPreview output={output} metadata={meta} toolName={name} success={success} />
      </div>
    );
  }

  // Snapshot
  if (SNAPSHOT_TOOLS.has(name)) {
    return (
      <div className={className}>
        <SnapshotPreview output={output} />
      </div>
    );
  }

  // Console logs
  if (CONSOLE_TOOLS.has(name)) {
    return (
      <div className={className}>
        <ConsoleLogsPreview output={output} />
      </div>
    );
  }

  // Network requests
  if (NETWORK_TOOLS.has(name)) {
    return (
      <div className={className}>
        <NetworkPreview output={output} />
      </div>
    );
  }

  // Evaluate
  if (EVALUATE_TOOLS.has(name)) {
    return (
      <div className={className}>
        <EvaluatePreview output={output} success={success} />
      </div>
    );
  }

  // Browser state / tabs
  if (STATE_TOOLS.has(name)) {
    return (
      <div className={className}>
        <BrowserStatePreview output={output} metadata={meta} />
      </div>
    );
  }

  // Security tools
  if (SECURITY_TOOLS.has(name)) {
    return (
      <div className={className}>
        <SecurityPreview output={output} success={success} />
      </div>
    );
  }

  // Wait tool - simple interaction-style display
  if (WAIT_TOOLS.has(name)) {
    return (
      <div className={className}>
        <InteractionPreview output={output} metadata={meta} toolName={name} success={success} />
      </div>
    );
  }

  // Fallback: generic output
  if (output) {
    const maxLen = 1500;
    const truncated = output.length > maxLen ? output.slice(0, maxLen) + '\n...(truncated)' : output;
    return (
      <div className={className}>
        <pre className={cn(
          'px-1.5 py-1 text-[8px] leading-relaxed overflow-x-auto',
          'text-[var(--color-text-secondary)]',
          'max-h-[250px] overflow-y-auto whitespace-pre-wrap break-words',
        )}>
          {truncated}
        </pre>
      </div>
    );
  }

  return null;
};

export const BrowserResultPreview = memo(BrowserResultPreviewInternal);
BrowserResultPreview.displayName = 'BrowserResultPreview';
