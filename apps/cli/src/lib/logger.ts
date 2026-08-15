type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 }

const _level: LogLevel = (process.env['LOG_LEVEL'] as LogLevel | undefined) ??
  (process.env['NODE_ENV'] === 'production' ? 'warn' : 'debug')

export const logger = {
  debug(...args: unknown[]): void {
    if (LEVELS[_level] <= LEVELS.debug) process.stderr.write(`[debug] ${args.join(' ')}\n`)
  },
  info(...args: unknown[]): void {
    if (LEVELS[_level] <= LEVELS.info) process.stderr.write(`[info] ${args.join(' ')}\n`)
  },
  warn(...args: unknown[]): void {
    if (LEVELS[_level] <= LEVELS.warn) process.stderr.write(`[warn] ${args.join(' ')}\n`)
  },
  error(...args: unknown[]): void {
    if (LEVELS[_level] <= LEVELS.error) process.stderr.write(`[error] ${args.join(' ')}\n`)
  },
}
