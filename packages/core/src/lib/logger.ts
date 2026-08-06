type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 }

function resolveLevel(): LogLevel {
  if (typeof import.meta !== 'undefined' && (import.meta as { env?: { VITE_LOG_LEVEL?: string } }).env?.VITE_LOG_LEVEL) {
    return ((import.meta as { env?: { VITE_LOG_LEVEL?: string } }).env?.VITE_LOG_LEVEL as LogLevel) ?? 'warn'
  }
  if (typeof process !== 'undefined' && process.env['LOG_LEVEL']) {
    return (process.env['LOG_LEVEL'] as LogLevel)
  }
  return (typeof process !== 'undefined' && process.env['NODE_ENV'] === 'production') ? 'warn' : 'debug'
}

let _level: LogLevel = resolveLevel()

export const logger = {
  setLevel(level: LogLevel): void {
    _level = level
  },
  getLevel(): LogLevel {
    return _level
  },
  debug(...args: unknown[]): void {
    if (LEVELS[_level] <= LEVELS.debug) console.debug('[debug]', ...args)
  },
  info(...args: unknown[]): void {
    if (LEVELS[_level] <= LEVELS.info) console.info('[info]', ...args)
  },
  warn(...args: unknown[]): void {
    if (LEVELS[_level] <= LEVELS.warn) console.warn('[warn]', ...args)
  },
  error(...args: unknown[]): void {
    if (LEVELS[_level] <= LEVELS.error) console.error('[error]', ...args)
  },
}
