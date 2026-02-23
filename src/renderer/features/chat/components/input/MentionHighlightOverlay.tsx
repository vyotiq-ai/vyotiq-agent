/**
 * Mention Highlight Overlay
 * 
 * A synchronized mirror layer rendered over the textarea that
 * colorizes @file mentions inline. Uses the "mirror div" pattern:
 * the overlay renders the EXACT same text content as the textarea
 * (character-for-character, identical width) but with different
 * colors for mention segments. The textarea text is transparent
 * when mentions are present, so the overlay's colored text shows
 * through.
 * 
 * CRITICAL: The overlay must render the same characters as the
 * textarea — no icons, no badges, no extra padding — otherwise
 * the text positions drift and the overlay misaligns.
 * 
 * #### Requirements
 * - Identical font, size, padding, line-height, word-wrap as the textarea
 * - Scroll in sync with the textarea
 * - pointer-events: none so clicks pass through to the textarea
 */
import React, { memo, useMemo } from 'react';
import { cn } from '../../../../utils/cn';
import { MENTION_MATCH_REGEX } from '../../utils/mentionPatterns';

// =============================================================================
// Types
// =============================================================================

export interface MentionHighlightOverlayProps {
  /** Current textarea value */
  value: string;
  /** Scroll top of the textarea (for sync) */
  scrollTop?: number;
  /** Scroll left of the textarea (for sync) */
  scrollLeft?: number;
}

// =============================================================================
// Mention parsing for highlights
// =============================================================================

interface TextSegment {
  type: 'text' | 'mention';
  content: string;
}

/**
 * Parse text into segments of plain text and @file mentions.
 * Segments are character-accurate — no content is added or removed.
 */
function parseSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  MENTION_MATCH_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = MENTION_MATCH_REGEX.exec(text)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
      });
    }

    // Add the mention segment (exact same text, just tagged as mention)
    segments.push({
      type: 'mention',
      content: match[0],
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.slice(lastIndex),
    });
  }

  return segments;
}

// =============================================================================
// Main Overlay Component
// =============================================================================

export const MentionHighlightOverlay: React.FC<MentionHighlightOverlayProps> = memo(({
  value,
  scrollTop = 0,
  scrollLeft = 0,
}) => {
  // Parse text into segments
  const segments = useMemo(() => parseSegments(value), [value]);

  return (
    <div
      className={cn(
        // Position exactly over the textarea
        'absolute inset-0',
        'pointer-events-none select-none',
        'overflow-hidden',
        'z-[1]',
      )}
      aria-hidden="true"
    >
      {/* Inner content div — shifted to match textarea scroll position */}
      <div
        className={cn(
          // Must match textarea font/size/line-height/wrapping EXACTLY
          'font-mono text-xs leading-relaxed',
          'whitespace-pre-wrap break-words',
          'w-full',
        )}
        style={{
          // Sync scroll position with textarea via transform
          transform: `translate(${-scrollLeft}px, ${-scrollTop}px)`,
          // Match browser default textarea padding (2px)
          padding: '2px',
        }}
      >
        {segments.map((segment, index) => {
          if (segment.type === 'mention') {
            // Render mention text with accent color + subtle background
            // SAME characters as textarea — only color differs
            return (
              <span
                key={`m-${index}`}
                className={cn(
                  'text-[var(--color-accent-primary)]',
                  'bg-[var(--color-accent-primary)]/8',
                  'rounded-[2px]',
                )}
              >
                {segment.content}
              </span>
            );
          }
          // Plain text — render in normal text color
          return (
            <span
              key={`t-${index}`}
              className="text-[var(--color-text-primary)]"
            >
              {segment.content}
            </span>
          );
        })}
      </div>
    </div>
  );
});

MentionHighlightOverlay.displayName = 'MentionHighlightOverlay';
