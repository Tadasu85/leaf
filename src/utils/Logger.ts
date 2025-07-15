export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

class Logger {
  private level: LogLevel;
  private prefix: string;

  constructor(level: LogLevel = LogLevel.INFO, prefix: string = '') {
    this.level = level;
    this.prefix = prefix;
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.level;
  }

  private formatMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const prefix = this.prefix ? `[${this.prefix}]` : '';
    return `[${timestamp}] [${level}]${prefix} ${message}`;
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage('ERROR', message), ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', message), ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage('INFO', message), ...args);
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage('DEBUG', message), ...args);
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setPrefix(prefix: string): void {
    this.prefix = prefix;
  }
}

// Create default logger instance
const getLogLevel = (): LogLevel => {
  // Allow environment variable override
  if (process.env.REACT_APP_LOG_LEVEL) {
    const level = process.env.REACT_APP_LOG_LEVEL.toUpperCase();
    if (level === 'ERROR') return LogLevel.ERROR;
    if (level === 'WARN') return LogLevel.WARN;
    if (level === 'INFO') return LogLevel.INFO;
    if (level === 'DEBUG') return LogLevel.DEBUG;
  }
  
  // Default behavior - show debug in development for better debugging
  return process.env.NODE_ENV === 'production' ? LogLevel.ERROR : LogLevel.DEBUG;
};

const defaultLogger = new Logger(getLogLevel());

// Export the default logger and the Logger class
export default defaultLogger;
export { Logger }; 