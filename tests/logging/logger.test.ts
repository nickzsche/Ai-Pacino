import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from '../../src/logging/logger'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aipacino-log-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('logger', () => {
  it('writes a JSONL line to the configured file', () => {
    const file = join(dir, 'app.log')
    const log = createLogger({ level: 'info', file })
    log.info('hello', { foo: 'bar' })
    const contents = readFileSync(file, 'utf8').trim()
    const parsed = JSON.parse(contents)
    expect(parsed.level).toBe('info')
    expect(parsed.msg).toBe('hello')
    expect(parsed.foo).toBe('bar')
    expect(typeof parsed.ts).toBe('number')
  })

  it('skips messages below the configured level', () => {
    const file = join(dir, 'app.log')
    const log = createLogger({ level: 'warn', file })
    log.debug('skip me')
    log.info('skip me')
    log.warn('keep me')
    const contents = existsSync(file) ? readFileSync(file, 'utf8').trim() : ''
    const lines = contents ? contents.split('\n') : []
    expect(lines.length).toBe(1)
    expect(JSON.parse(lines[0]!).msg).toBe('keep me')
  })

  it('appends multiple log lines without overwriting', () => {
    const file = join(dir, 'app.log')
    const log = createLogger({ level: 'info', file })
    log.info('one')
    log.info('two')
    log.info('three')
    const lines = readFileSync(file, 'utf8').trim().split('\n')
    expect(lines.length).toBe(3)
  })
})
