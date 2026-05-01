import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void
  info(msg: string, fields?: Record<string, unknown>): void
  warn(msg: string, fields?: Record<string, unknown>): void
  error(msg: string, fields?: Record<string, unknown>): void
}

export interface LoggerOptions {
  level: LogLevel
  file: string
}

export const createLogger = (opts: LoggerOptions): Logger => {
  const threshold = LEVEL_ORDER[opts.level]
  mkdirSync(dirname(opts.file), { recursive: true })

  const write = (level: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (LEVEL_ORDER[level] < threshold) return
    const entry = { ts: Date.now(), level, msg, ...(fields ?? {}) }
    try {
      appendFileSync(opts.file, `${JSON.stringify(entry)}\n`)
    } catch {
      // logger must never throw into the app
    }
  }

  return {
    debug: (msg, f) => write('debug', msg, f),
    info: (msg, f) => write('info', msg, f),
    warn: (msg, f) => write('warn', msg, f),
    error: (msg, f) => write('error', msg, f),
  }
}
