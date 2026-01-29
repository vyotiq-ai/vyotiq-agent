/**
 * Animation System
 * 
 * Centralized animation utilities and micro-interactions for consistent
 * motion design across the application.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

// =============================================================================
// Animation Constants
// =============================================================================

export const DURATION = {
  instant: 0,
  fast: 100,
  normal: 200,
  slow: 300,
  slower: 500,
  slowest: 1000,
} as const;

export const EASING = {
  linear: 'linear',
  ease: 'ease',
  easeIn: 'ease-in',
  easeOut: 'ease-out',
  easeInOut: 'ease-in-out',
  // Custom spring-like easings
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
  // Terminal-specific
  terminal: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const;

// =============================================================================
// Tailwind Animation Classes
// =============================================================================

/**
 * Pre-defined animation class combinations for common animations
 */
export const ANIMATIONS = {
  // Fade animations
  fadeIn: 'animate-in fade-in duration-200',
  fadeOut: 'animate-out fade-out duration-200',
  fadeInFast: 'animate-in fade-in duration-100',
  fadeOutFast: 'animate-out fade-out duration-100',
  fadeInSlow: 'animate-in fade-in duration-300',
  
  // Slide animations
  slideInFromTop: 'animate-in slide-in-from-top-2 fade-in duration-200',
  slideInFromBottom: 'animate-in slide-in-from-bottom-2 fade-in duration-200',
  slideInFromLeft: 'animate-in slide-in-from-left-2 fade-in duration-200',
  slideInFromRight: 'animate-in slide-in-from-right-2 fade-in duration-200',
  slideOutToTop: 'animate-out slide-out-to-top-2 fade-out duration-200',
  slideOutToBottom: 'animate-out slide-out-to-bottom-2 fade-out duration-200',
  slideOutToLeft: 'animate-out slide-out-to-left-2 fade-out duration-200',
  slideOutToRight: 'animate-out slide-out-to-right-2 fade-out duration-200',
  
  // Scale animations
  scaleIn: 'animate-in zoom-in-95 fade-in duration-200',
  scaleOut: 'animate-out zoom-out-95 fade-out duration-150',
  scaleInSubtle: 'animate-in zoom-in-98 fade-in duration-150',
  
  // Combined animations for modals/dialogs
  dialogEnter: 'animate-in fade-in zoom-in-95 duration-200',
  dialogExit: 'animate-out fade-out zoom-out-95 duration-150',
  
  // Terminal-specific animations
  terminalTypeIn: 'animate-in fade-in slide-in-from-left-1 duration-150',
  terminalFlash: 'animate-pulse',
  terminalBlink: 'animate-blink',
  terminalGlow: 'animate-pulse-glow',
  terminalExecute: 'animate-in fade-in slide-in-from-bottom-1 duration-200',
  terminalResult: 'animate-in fade-in slide-in-from-left-2 duration-250',
  
  // Message animations
  messageIn: 'animate-in slide-in-from-bottom-2 fade-in duration-300',
  messageOut: 'animate-out slide-out-to-bottom-2 fade-out duration-200',
  
  // Tool execution animations
  toolStart: 'animate-in fade-in zoom-in-95 duration-200',
  toolComplete: 'animate-in fade-in slide-in-from-left-1 duration-150',
  toolPending: 'animate-pulse',
  
  // Skeleton/loading
  shimmer: 'animate-pulse bg-gradient-to-r from-[var(--color-surface-2)] via-[var(--color-surface-3)] to-[var(--color-surface-2)] bg-[length:200%_100%]',
  skeleton: 'animate-pulse bg-[var(--color-surface-2)]',
  
  // Status indicators
  pulse: 'animate-pulse',
  spin: 'animate-spin',
  ping: 'animate-ping',
  bounce: 'animate-bounce',
  spinSlow: 'animate-spin-slow',
  glowPulse: 'animate-pulse-glow',
  
  // Interactive feedback
  press: 'active:scale-[0.97] transition-transform duration-100',
  hover: 'hover:scale-[1.02] transition-transform duration-150',
  focus: 'focus:ring-2 focus:ring-[var(--color-accent-primary)]/30 focus:ring-offset-0',
} as const;

// =============================================================================
// Micro-interaction Utilities
// =============================================================================

/**
 * Get hover animation classes based on interaction type
 */
export const getHoverAnimation = (type: 'lift' | 'glow' | 'scale' | 'highlight' | 'border' = 'highlight') => {
  const animations: Record<string, string> = {
    lift: 'transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg',
    glow: 'transition-all duration-200 hover:shadow-[var(--color-accent-primary)]/20 hover:shadow-lg',
    scale: 'transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]',
    highlight: 'transition-colors duration-150 hover:bg-[var(--color-surface-2)]/50',
    border: 'transition-colors duration-150 hover:border-[var(--color-border-default)]',
  };
  return animations[type];
};

/**
 * Get focus animation classes
 */
export const getFocusAnimation = (type: 'ring' | 'border' | 'glow' = 'ring') => {
  const animations: Record<string, string> = {
    ring: 'focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30 focus:ring-offset-0',
    border: 'focus:outline-none focus:border-[var(--color-accent-primary)]/50',
    glow: 'focus:outline-none focus:shadow-[0_0_0_2px_rgba(var(--color-accent-primary-rgb),0.2)]',
  };
  return animations[type];
};

/**
 * Get press/active animation classes
 */
export const getPressAnimation = (intensity: 'light' | 'medium' | 'heavy' = 'medium') => {
  const animations: Record<string, string> = {
    light: 'active:scale-[0.99] transition-transform duration-100',
    medium: 'active:scale-[0.97] transition-transform duration-100',
    heavy: 'active:scale-[0.95] transition-transform duration-100',
  };
  return animations[intensity];
};

// =============================================================================
// Animation Hooks
// =============================================================================

/**
 * Hook for entrance/exit animations
 */
export function useEnterAnimation(delay = 0) {
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  
  return isVisible;
}

/**
 * Hook for staggered list animations
 */
export function useStaggeredAnimation(itemCount: number, staggerDelay = 50) {
  const [visibleItems, setVisibleItems] = useState<number[]>([]);
  
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    
    for (let i = 0; i < itemCount; i++) {
      const timer = setTimeout(() => {
        setVisibleItems(prev => [...prev, i]);
      }, i * staggerDelay);
      timers.push(timer);
    }
    
    return () => timers.forEach(clearTimeout);
  }, [itemCount, staggerDelay]);
  
  return (index: number) => visibleItems.includes(index);
}

/**
 * Hook for element visibility with intersection observer
 */
export function useScrollAnimation(options?: IntersectionObserverInit) {
  const ref = useRef<HTMLElement>(null);
  const [isInView, setIsInView] = useState(false);
  
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    
    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { threshold: 0.1, ...options }
    );
    
    observer.observe(element);
    return () => observer.disconnect();
  }, [options]);
  
  return { ref, isInView };
}

/**
 * Hook for animated number transitions
 */
export function useAnimatedNumber(value: number, duration = 500) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);
  
  useEffect(() => {
    const start = previousValue.current;
    const end = value;
    const diff = end - start;
    const startTime = performance.now();
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + diff * eased;
      
      setDisplayValue(Math.round(current));
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        previousValue.current = value;
      }
    };
    
    requestAnimationFrame(animate);
  }, [value, duration]);
  
  return displayValue;
}

/**
 * Hook for typing animation effect
 */
export function useTypingAnimation(text: string, speed = 50) {
  const [displayText, setDisplayText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  
  useEffect(() => {
    setDisplayText('');
    setIsComplete(false);
    
    let index = 0;
    const timer = setInterval(() => {
      if (index < text.length) {
        setDisplayText(text.slice(0, index + 1));
        index++;
      } else {
        setIsComplete(true);
        clearInterval(timer);
      }
    }, speed);
    
    return () => clearInterval(timer);
  }, [text, speed]);
  
  return { displayText, isComplete };
}

/**
 * Hook for smooth height transitions
 */
export function useAnimatedHeight<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number | 'auto'>('auto');
  
  const updateHeight = useCallback(() => {
    if (ref.current) {
      setHeight(ref.current.scrollHeight);
    }
  }, []);
  
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    
    return () => observer.disconnect();
  }, [updateHeight]);
  
  return { ref, height };
}

/**
 * Hook for shake animation (error feedback)
 * Properly cleans up timeout to prevent memory leaks and state updates on unmounted components
 */
export function useShakeAnimation() {
  const [isShaking, setIsShaking] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  const shake = useCallback(() => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsShaking(true);
    timeoutRef.current = setTimeout(() => {
      setIsShaking(false);
      timeoutRef.current = null;
    }, DURATION.slower); // Use constant instead of magic number
  }, []);
  
  const shakeClass = isShaking ? 'animate-[shake_0.5s_ease-in-out]' : '';
  
  return { shake, shakeClass, isShaking };
}

/**
 * Hook for micro-interactions on buttons and interactive elements
 */
export interface MicroInteractionOptions {
  scale?: number;
  duration?: number;
  disabled?: boolean;
}

export function useMicroInteraction(options: MicroInteractionOptions = {}) {
  const { scale = 0.97, duration = 100, disabled = false } = options;
  const [isPressed, setIsPressed] = useState(false);
  
  const handlers = {
    onMouseDown: () => !disabled && setIsPressed(true),
    onMouseUp: () => setIsPressed(false),
    onMouseLeave: () => setIsPressed(false),
    onTouchStart: () => !disabled && setIsPressed(true),
    onTouchEnd: () => setIsPressed(false),
  };
  
  const style = {
    transform: isPressed ? `scale(${scale})` : 'scale(1)',
    transition: `transform ${duration}ms ease-out`,
  };
  
  return { handlers, style, isPressed };
}

// =============================================================================
// CSS Keyframe Definitions (for index.css)
// =============================================================================

/**
 * Additional keyframes to add to index.css:
 * 
 * @keyframes shake {
 *   0%, 100% { transform: translateX(0); }
 *   10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
 *   20%, 40%, 60%, 80% { transform: translateX(2px); }
 * }
 * 
 * @keyframes shimmer {
 *   0% { background-position: -200% 0; }
 *   100% { background-position: 200% 0; }
 * }
 * 
 * @keyframes typewriter {
 *   from { width: 0; }
 *   to { width: 100%; }
 * }
 * 
 * @keyframes float {
 *   0%, 100% { transform: translateY(0px); }
 *   50% { transform: translateY(-4px); }
 * }
 * 
 * @keyframes glow-pulse {
 *   0%, 100% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0); }
 *   50% { box-shadow: 0 0 12px 4px rgba(52, 211, 153, 0.3); }
 * }
 */

export const EXTRA_KEYFRAMES = `
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
  20%, 40%, 60%, 80% { transform: translateX(2px); }
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-4px); }
}

@keyframes glow-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0); }
  50% { box-shadow: 0 0 12px 4px rgba(52, 211, 153, 0.3); }
}

@keyframes typewriter {
  from { width: 0; }
  to { width: 100%; }
}
`;

export default {
  DURATION,
  EASING,
  ANIMATIONS,
  getHoverAnimation,
  getFocusAnimation,
  getPressAnimation,
  useEnterAnimation,
  useStaggeredAnimation,
  useScrollAnimation,
  useAnimatedNumber,
  useTypingAnimation,
  useAnimatedHeight,
  useShakeAnimation,
};
