/**
 * Session Welcome Component
 * 
 * Displays a welcome message when a session is active but has no messages yet.
 * Shows typewriter effect with helpful hints.
 */
import React, { useState, useEffect, useRef } from 'react';
import { cn } from '../../../utils/cn';
import { SESSION_HINTS } from '../utils/welcomeHints';

export const SessionWelcome: React.FC = () => {
  const [showCursor, setShowCursor] = useState(true);
  const [displayedText, setDisplayedText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  const typewriterRef = useRef<NodeJS.Timeout | null>(null);

  // Cursor blink effect
  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor(v => !v);
    }, 530);
    return () => clearInterval(interval);
  }, []);

  const currentHint = SESSION_HINTS[hintIndex % SESSION_HINTS.length];

  // Typewriter effect with delete and cycle
  useEffect(() => {
    if (typewriterRef.current) {
      clearTimeout(typewriterRef.current);
    }

    const tick = () => {
      if (isDeleting) {
        if (displayedText.length > 0) {
          setDisplayedText(prev => prev.slice(0, -1));
          typewriterRef.current = setTimeout(tick, 20);
        } else {
          setIsDeleting(false);
          setHintIndex(prev => prev + 1);
          typewriterRef.current = setTimeout(tick, 300);
        }
      } else {
        if (displayedText.length < currentHint.length) {
          setDisplayedText(currentHint.slice(0, displayedText.length + 1));
          typewriterRef.current = setTimeout(tick, 35 + Math.random() * 35);
        } else {
          typewriterRef.current = setTimeout(() => {
            setIsDeleting(true);
            tick();
          }, 2500);
        }
      }
    };

    typewriterRef.current = setTimeout(tick, 100);

    return () => {
      if (typewriterRef.current) {
        clearTimeout(typewriterRef.current);
      }
    };
  }, [displayedText, isDeleting, currentHint]);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] font-mono px-4">
      <div className="text-center space-y-6 max-w-lg w-full">
        {/* Lambda icon */}
        <div className="text-4xl text-[var(--color-accent-primary)] opacity-40">λ</div>
        
        {/* Typewriter prompt */}
        <div className="flex items-center justify-center gap-1.5 text-xs min-w-0 overflow-hidden">
          <span className="text-[var(--color-accent-primary)] flex-shrink-0">›</span>
          <span className="text-[var(--color-text-secondary)] min-w-0 text-left truncate">{displayedText}</span>
          <span className={cn(
            "w-[8px] h-[16px] bg-[var(--color-accent-primary)] rounded-[1px] flex-shrink-0",
            showCursor ? 'opacity-100' : 'opacity-30'
          )} />
        </div>

        {/* Subtle hint */}
        <p className="text-[10px] text-[var(--color-text-dim)]">
          type a message below to get started
        </p>
      </div>
    </div>
  );
};
