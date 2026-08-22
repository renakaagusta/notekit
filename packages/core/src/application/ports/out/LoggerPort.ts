/**
 * Outbound port for logging. Use cases depend on this instead of calling
 * console directly, so logging is injectable and can be configured or
 * redirected by the composition root. Implemented by a driven adapter
 * (console, file, remote service, etc).
 */
export interface LoggerPort {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}
