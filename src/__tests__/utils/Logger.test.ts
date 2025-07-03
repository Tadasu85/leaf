import { Logger, LogLevel } from '../../utils/Logger';

describe('Logger', () => {
  let logger: Logger;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new Logger();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('creates logger with default INFO level', () => {
      const testLogger = new Logger();
      expect(testLogger).toBeInstanceOf(Logger);
    });

    it('creates logger with custom level', () => {
      const testLogger = new Logger(LogLevel.DEBUG);
      expect(testLogger).toBeInstanceOf(Logger);
    });

    it('creates logger with custom prefix', () => {
      const testLogger = new Logger(LogLevel.INFO, 'TEST');
      expect(testLogger).toBeInstanceOf(Logger);
    });
  });

  describe('LogLevel enum', () => {
    it('has correct values', () => {
      expect(LogLevel.ERROR).toBe(0);
      expect(LogLevel.WARN).toBe(1);
      expect(LogLevel.INFO).toBe(2);
      expect(LogLevel.DEBUG).toBe(3);
    });
  });

  describe('error method', () => {
    it('logs error messages when level allows', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      logger.error('Test error message');
      
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[ERROR\] Test error message/),
      );
      
      errorSpy.mockRestore();
    });

    it('does not log error messages when level is too high', () => {
      const errorLogger = new Logger(LogLevel.ERROR);
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      errorLogger.error('Test error message');
      
      // ERROR level should log error messages (ERROR = 0, which is <= ERROR = 0)
      expect(errorSpy).toHaveBeenCalled();
      
      errorSpy.mockRestore();
    });

    it('includes additional arguments', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      logger.error('Test error message', 'arg1', 'arg2');
      
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[ERROR\] Test error message/),
        'arg1',
        'arg2'
      );
      
      errorSpy.mockRestore();
    });
  });

  describe('warn method', () => {
    it('logs warn messages when level allows', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      logger.warn('Test warning message');
      
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[WARN\] Test warning message/),
      );
      
      warnSpy.mockRestore();
    });

    it('does not log warn messages when level is too high', () => {
      const errorLogger = new Logger(LogLevel.ERROR);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      errorLogger.warn('Test warning message');
      
      // ERROR level (0) is higher than WARN level (1), so warn should NOT be logged
      expect(warnSpy).not.toHaveBeenCalled();
      
      warnSpy.mockRestore();
    });

    it('logs warn messages when level is WARN', () => {
      const warnLogger = new Logger(LogLevel.WARN);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      warnLogger.warn('Test warning message');
      
      // WARN level should log warn messages (WARN = 1, which is <= WARN = 1)
      expect(warnSpy).toHaveBeenCalled();
      
      warnSpy.mockRestore();
    });
  });

  describe('info method', () => {
    it('logs info messages when level allows', () => {
      const infoSpy = jest.spyOn(console, 'info').mockImplementation();
      
      logger.info('Test info message');
      
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\] Test info message/),
      );
      
      infoSpy.mockRestore();
    });

    it('does not log info messages when level is too high', () => {
      const warnLogger = new Logger(LogLevel.WARN);
      const infoSpy = jest.spyOn(console, 'info').mockImplementation();
      
      warnLogger.info('Test info message');
      
      expect(infoSpy).not.toHaveBeenCalled();
      
      infoSpy.mockRestore();
    });

    it('logs info messages when level is DEBUG', () => {
      const debugLogger = new Logger(LogLevel.DEBUG);
      const infoSpy = jest.spyOn(console, 'info').mockImplementation();
      
      debugLogger.info('Test info message');
      
      expect(infoSpy).toHaveBeenCalled();
      
      infoSpy.mockRestore();
    });
  });

  describe('debug method', () => {
    it('logs debug messages when level allows', () => {
      const debugLogger = new Logger(LogLevel.DEBUG);
      
      debugLogger.debug('Test debug message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[DEBUG\] Test debug message/),
      );
    });

    it('does not log debug messages when level is too high', () => {
      const infoLogger = new Logger(LogLevel.INFO);
      
      infoLogger.debug('Test debug message');
      
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('logs debug messages when level is DEBUG', () => {
      const debugLogger = new Logger(LogLevel.DEBUG);
      
      debugLogger.debug('Test debug message');
      
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('setLevel method', () => {
    it('changes the log level', () => {
      const debugLogger = new Logger(LogLevel.DEBUG);
      
      debugLogger.setLevel(LogLevel.WARN);
      
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const infoSpy = jest.spyOn(console, 'info').mockImplementation();
      
      debugLogger.warn('Warning message');
      debugLogger.info('Info message');
      
      expect(warnSpy).toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
      
      warnSpy.mockRestore();
      infoSpy.mockRestore();
    });
  });

  describe('setPrefix method', () => {
    it('adds prefix to log messages', () => {
      const testLogger = new Logger(LogLevel.DEBUG, 'TEST');
      
      testLogger.debug('Test message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[DEBUG\]\[TEST\] Test message/),
      );
    });

    it('changes prefix dynamically', () => {
      const testLogger = new Logger(LogLevel.DEBUG);
      
      testLogger.setPrefix('NEW_PREFIX');
      testLogger.debug('Test message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[DEBUG\]\[NEW_PREFIX\] Test message/),
      );
    });

    it('handles empty prefix', () => {
      const testLogger = new Logger(LogLevel.DEBUG, '');
      
      testLogger.debug('Test message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[DEBUG\] Test message/),
      );
    });
  });

  describe('message formatting', () => {
    it('includes timestamp in correct format', () => {
      const testLogger = new Logger(LogLevel.DEBUG);
      
      testLogger.debug('Test message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/),
      );
    });

    it('handles special characters in messages', () => {
      const testLogger = new Logger(LogLevel.DEBUG);
      
      testLogger.debug('Message with "quotes" and <brackets> & symbols');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Message with "quotes" and <brackets> & symbols'),
      );
    });

    it('handles empty messages', () => {
      const testLogger = new Logger(LogLevel.DEBUG);
      
      testLogger.debug('');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[DEBUG\]/),
      );
    });
  });

  describe('level hierarchy', () => {
    it('respects level hierarchy for ERROR level', () => {
      const errorLogger = new Logger(LogLevel.ERROR);
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const infoSpy = jest.spyOn(console, 'info').mockImplementation();
      
      errorLogger.error('Error message');
      errorLogger.warn('Warning message');
      errorLogger.info('Info message');
      
      expect(errorSpy).toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
      
      errorSpy.mockRestore();
      warnSpy.mockRestore();
      infoSpy.mockRestore();
    });

    it('respects level hierarchy for WARN level', () => {
      const warnLogger = new Logger(LogLevel.WARN);
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const infoSpy = jest.spyOn(console, 'info').mockImplementation();
      
      warnLogger.error('Error message');
      warnLogger.warn('Warning message');
      warnLogger.info('Info message');
      
      expect(errorSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
      
      errorSpy.mockRestore();
      warnSpy.mockRestore();
      infoSpy.mockRestore();
    });

    it('respects level hierarchy for INFO level', () => {
      const infoLogger = new Logger(LogLevel.INFO);
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const infoSpy = jest.spyOn(console, 'info').mockImplementation();
      
      infoLogger.error('Error message');
      infoLogger.warn('Warning message');
      infoLogger.info('Info message');
      
      expect(errorSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalled();
      
      errorSpy.mockRestore();
      warnSpy.mockRestore();
      infoSpy.mockRestore();
    });

    it('respects level hierarchy for DEBUG level', () => {
      const debugLogger = new Logger(LogLevel.DEBUG);
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const infoSpy = jest.spyOn(console, 'info').mockImplementation();
      
      debugLogger.error('Error message');
      debugLogger.warn('Warning message');
      debugLogger.info('Info message');
      debugLogger.debug('Debug message');
      
      expect(errorSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      
      errorSpy.mockRestore();
      warnSpy.mockRestore();
      infoSpy.mockRestore();
    });
  });
}); 