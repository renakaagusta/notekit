// MCP stdout = protocol wire — ALL logs MUST go to stderr only.
type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 }

const _level: LogLevel = (process.env['LOG_LEVEL'] as LogLevel | undefined) ??
  (process.env['NODE_ENV'] === 'production' ? 'warn' : 'debug')

function emit(level: LogLevel, args: unknown[]): void {
  if (LEVELS[_level] > LEVELS[level]) return
  const line = `[mcp:${level}] ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}`
  process.stderr.write(line + '\n')
}

export const logger = {
  debug(...args: unknown[]): void { emit('debug', args) },
  info(...args: unknown[]): void { emit('info', args) },
  warn(...args: unknown[]): void { emit('warn', args) },
  error(...args: unknown[]): void { emit('error', args) },
}
