// Utilities barrel export
export { cn } from './cn';
export * from './constants';
export * from './styles';

// Path helper utilities
export {
  getFileName,
  getFileExtension,
  getDirectoryPath,
  normalizePath,
} from './pathHelpers';

// Time formatting utilities
export {
  formatRelativeTime,
  formatRelativeTimeWithSuffix,
  formatTimeShort,
  formatFullDateTime,
  formatPlaybackDuration,
  formatMs,
  formatElapsedTime,
  formatDuration,
} from './timeFormatting';

// ANSI escape code utilities
export {
  stripAnsi,
  hasAnsi,
  cleanTerminalOutput,
  visibleLength,
} from './ansi';

// Terminal/CLI Theme system
export {
  terminalColors,
  terminalTypography,
  terminalStyles,
  terminalPrompts,
  cliLabels,
  formatFlag,
  formatTokens,
  formatFileSize,
  getProviderColor,
  getProviderLabel,
} from './theme';

// Performance profiling utilities (development-time)
export { 
  useRenderProfiler, 
  useLifecycleProfiler,
  useRenderGuard,
  useProfilerKeyboard,
  withProfiler, 
  measureTime,
  getAllMetrics,
  getMetrics,
  clearMetrics,
  logMetricsSummary,
} from './profiler';
export type { 
  RenderMetrics,
} from './profiler';

// Performance optimization utilities
export {
  rafThrottle,
  useRafThrottle,
  useStableObject,
  useStableCallback,
  createPerfTracker,
  lazyValue,
  useLazyInit,
  batchUpdates,
} from './performance';
export type { PerfMetrics } from './performance';

// Animation utilities
export {
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
  useMicroInteraction,
  EXTRA_KEYFRAMES,
} from './animations';
export type { MicroInteractionOptions } from './animations';

// Accessibility utilities
export {
  focusTrap,
  useFocusTrap,
  KeyboardNavigation,
  useKeyboardNavigation,
  Announcer,
  useAnnouncer,
  getAriaLabel,
  getLiveRegionProps,
  getA11yProps,
  useSkipLink,
  useReducedMotion,
  useHighContrast,
} from './accessibility';
export type {
  FocusTrapOptions,
  KeyboardNavigationOptions,
  LiveRegionProps,
  A11yOptions,
} from './accessibility';

// Responsive utilities
export {
  BREAKPOINTS,
  useMediaQuery,
  useCurrentBreakpoint,
  useBreakpoint,  // Alias for useCurrentBreakpoint
  useResponsive,
  useTouchDevice,
  useTouchHandler,
  useSwipeGesture,
  useOrientation,
  useSafeArea,
  useViewportHeight,
  useContainerSize,
  usePreventBodyScroll,
  useKeyboardOpen,
  responsive,
} from './responsive';
export type {
  Breakpoint,
  SwipeHandlers,
  Orientation,
} from './responsive';

// Error telemetry utilities
export {
  getErrorTelemetry,
  useErrorCapture,
  useErrorStats,
  useErrorListener,
  captureComponentError,
} from './telemetry';
export type {
  ErrorSeverity,
  ErrorCategory,
  TelemetryError,
  ErrorContext,
  TelemetryStats,
} from './telemetry';

// Renderer logger
export {
  RendererLogger,
  createLogger,
  getGlobalLogger,
  configureLogging,
  flushLogs,
  logger,
} from './logger';
export type { LogLevel } from './logger';

// Theme mode system (light/dark)
export {
  darkTheme,
  lightTheme,
  ThemeProvider,
  useTheme,
  useThemeColors,
  useResolvedTheme,
  themeVar,
  themeTransition,
  applyThemeToDocument,
  enableThemeTransition,
  disableThemeTransition,
} from './themeMode.tsx';
export type {
  ThemeMode,
  ResolvedTheme,
  ThemeColors,
} from './themeMode.tsx';

// Status message utilities
export {
  getStatusDisplayMessage,
  isSignificantStatus,
} from './statusMessages';

// Model utilities
export {
  apiModelToModelInfo,
  fetchProviderModels,
  clearModelsCache,
  getCachedModels,
} from './models';
export type { ApiModel } from './models';

// IPC retry utilities for robust backend communication
export {
  isHandlerNotRegisteredError,
  delay,
  withIpcRetry,
  withIpcRetryAll,
} from './ipcRetry';
export type { RetryConfig } from './ipcRetry';
