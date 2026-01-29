/**
 * Renderer Logger
 * 
 * A lightweight, high-performance logging system for the renderer process.
 * Provides structured logging with log levels, scoped loggers, and performance tracking.
 * 
 * Features:
 * - Log levels: debug, info, warn, error
 * - Scoped loggers for component/module isolation
 * - Buffered output to minimize console overhead
 * - Conditional logging based on environment
 * - Performance timing utilities
 * - Structured metadata support
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: number;
  level: LogLevel;
  scope: string;
  message: string;
  meta?: Record<string, unknown>;
}

interface LoggerConfig {
  /** Minimum log level to output */
  minLevel: LogLevel;
  /** Enable styled console output */
  styled: boolean;
  /** Maximum buffer size before auto-flush */
  maxBufferSize: number;
  /** Buffer flush interval in ms */
  flushInterval: number;
  /** Enable logging (can be disabled in production) */
  enabled: boolean;
}

const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
  styled: true,
  maxBufferSize: 50,
  flushInterval: 100,
  enabled: process.env.NODE_ENV !== 'production' || process.env.VYOTIQ_LOGGING === 'true',
};

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_STYLES: Record<LogLevel, { color: string; bgColor: string; icon: string }> = {
  debug: { color: '#9CA3AF', bgColor: 'transparent', icon: '[D]' },
  info: { color: '#3B82F6', bgColor: 'transparent', icon: '[I]' },
  warn: { color: '#F59E0B', bgColor: 'transparent', icon: '[W]' },
  error: { color: '#EF4444', bgColor: 'transparent', icon: '[E]' },
};

class LogBuffer {
  private entries: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private config: LoggerConfig;
  
  constructor(config: LoggerConfig) {
    this.config = config;
  }
  
  push(entry: LogEntry): void {
    if (!this.config.enabled) return;
    
    this.entries.push(entry);
    
    if (this.entries.length >= this.config.maxBufferSize) {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.config.flushInterval);
    }
  }
  
  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    
    if (this.entries.length === 0) return;
    
    const entriesToFlush = [...this.entries];
    this.entries = [];
    
    // Process entries
    entriesToFlush.forEach(entry => this.output(entry));
  }
  
  private output(entry: LogEntry): void {
    const { level, scope, message, meta, timestamp } = entry;
    const style = LEVEL_STYLES[level];
    const time = new Date(timestamp).toISOString().split('T')[1].slice(0, -1);
    
    // Build console arguments
    const consoleMethod = level === 'debug' ? 'debug' : level === 'info' ? 'info' : level === 'warn' ? 'warn' : 'error';
    
    if (this.config.styled && typeof window !== 'undefined') {
      const labelStyle = `color: ${style.color}; font-weight: bold;`;
      const scopeStyle = 'color: #8B5CF6; font-weight: 500;';
      const timeStyle = 'color: #6B7280; font-size: 0.85em;';
      const messageStyle = 'color: inherit;';
      
      if (meta && Object.keys(meta).length > 0) {
        console[consoleMethod](
          `%c[${level.toUpperCase()}]%c [${scope}]%c ${time}%c ${message}`,
          labelStyle,
          scopeStyle,
          timeStyle,
          messageStyle,
          meta
        );
      } else {
        console[consoleMethod](
          `%c[${level.toUpperCase()}]%c [${scope}]%c ${time}%c ${message}`,
          labelStyle,
          scopeStyle,
          timeStyle,
          messageStyle
        );
      }
    } else {
      // Plain output for Node.js or unstyled mode
      const prefix = `[${level.toUpperCase()}] [${scope}] ${time}`;
      if (meta && Object.keys(meta).length > 0) {
        console[consoleMethod](`${prefix} ${message}`, meta);
      } else {
        console[consoleMethod](`${prefix} ${message}`);
      }
    }
  }
  
  updateConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Global buffer instance
let globalBuffer: LogBuffer | null = null;

function getBuffer(): LogBuffer {
  if (!globalBuffer) {
    globalBuffer = new LogBuffer(DEFAULT_CONFIG);
  }
  return globalBuffer;
}

/**
 * Renderer Logger class
 */
export class RendererLogger {
  private scope: string;
  private config: LoggerConfig;
  
  constructor(scope: string, config: Partial<LoggerConfig> = {}) {
    this.scope = scope;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  private shouldLog(level: LogLevel): boolean {
    return this.config.enabled && LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.config.minLevel];
  }
  
  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;
    
    getBuffer().push({
      timestamp: Date.now(),
      level,
      scope: this.scope,
      message,
      meta,
    });
  }
  
  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }
  
  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }
  
  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }
  
  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', message, meta);
  }
  
  /**
   * Start a performance timer
   * @returns Function that when called, returns the duration in ms and logs it
   */
  startTimer(label: string): () => number {
    const start = performance.now();
    return () => {
      const duration = Math.round(performance.now() - start);
      this.debug(`Timer [${label}] completed`, { duration, label });
      return duration;
    };
  }
  
  /**
   * Create a child logger with a sub-scope
   */
  child(childScope: string): RendererLogger {
    return new RendererLogger(`${this.scope}:${childScope}`, this.config);
  }
  
  /**
   * Flush any buffered logs immediately
   */
  flush(): void {
    getBuffer().flush();
  }
  
  /**
   * Update logger configuration
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
    getBuffer().updateConfig(config);
  }
}

// Singleton map for scoped loggers
const loggerInstances = new Map<string, RendererLogger>();

/**
 * Create or get a scoped logger
 * Reuses existing logger instances for the same scope
 */
export function createLogger(scope: string): RendererLogger {
  let logger = loggerInstances.get(scope);
  if (!logger) {
    logger = new RendererLogger(scope);
    loggerInstances.set(scope, logger);
  }
  return logger;
}

/**
 * Get the global logger instance
 */
export function getGlobalLogger(): RendererLogger {
  return createLogger('Vyotiq');
}

/**
 * Configure all loggers
 */
export function configureLogging(config: Partial<LoggerConfig>): void {
  loggerInstances.forEach(logger => logger.configure(config));
  getBuffer().updateConfig(config);
}

/**
 * Flush all pending logs
 */
export function flushLogs(): void {
  getBuffer().flush();
}

// Export default logger for quick usage
export const logger = getGlobalLogger();

// Attach to window for debugging in development
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  (window as unknown as Record<string, unknown>).__vyotiq_logger = {
    createLogger,
    configureLogging,
    flushLogs,
    setLevel: (level: LogLevel) => configureLogging({ minLevel: level }),
    enable: () => configureLogging({ enabled: true }),
    disable: () => configureLogging({ enabled: false }),
  };
}
