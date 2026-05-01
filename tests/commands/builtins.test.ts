import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerBuiltins } from '../../src/commands/builtins'
import { createRegistry } from '../../src/commands/registry'
import type { Provider, StreamChunk } from '../../src/provider/types'
import { type SessionStore, createSessionStore } from '../../src/session/store'

const provider: Provider = {
  name: 'noop',
  async *streamMessage(): AsyncIterable<StreamChunk> {
    yield { type: 'done' }
  },
  async countTokens() {
    return 0
  },
}

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} }

let dir: string
let store: SessionStore

const makeCtx = (
  overrides: Partial<{
    status: string[]
    quit: number
    setSession: (s: { id: string; model: string }) => void
  }> = {},
) => {
  const sess = store.createSession({ title: 'init', model: 'claude-sonnet-4-6' })
  const status = overrides.status ?? []
  let quitCount = overrides.quit ?? 0
  return {
    sess,
    status,
    quitCount: () => quitCount,
    ctx: {
      store,
      provider,
      logger: noopLogger,
      state: {
        currentSession: sess,
        setCurrentSession: overrides.setSession ?? (() => {}),
        setStatusMessage: (m: string) => status.push(m),
        quit: () => {
          quitCount += 1
        },
      },
    },
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aipacino-built-'))
  store = createSessionStore(join(dir, 's.db'))
})

afterEach(() => {
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('builtins', () => {
  it('/help lists all registered commands', async () => {
    const reg = createRegistry()
    registerBuiltins(reg)
    const { ctx, status } = makeCtx()
    await reg.get('help')!.run(ctx, [])
    const last = status[status.length - 1] ?? ''
    expect(last).toMatch(/help/)
    expect(last).toMatch(/new/)
    expect(last).toMatch(/quit/)
  })

  it('/quit invokes state.quit', async () => {
    const reg = createRegistry()
    registerBuiltins(reg)
    const helper = makeCtx()
    await reg.get('quit')!.run(helper.ctx, [])
    expect(helper.quitCount()).toBe(1)
  })

  it('/new creates a new session and switches to it', async () => {
    const reg = createRegistry()
    registerBuiltins(reg)
    let switched: { id: string; model: string } | null = null
    const helper = makeCtx({
      setSession: (s) => {
        switched = s
      },
    })
    await reg.get('new')!.run(helper.ctx, ['fresh chat'])
    expect(switched).not.toBeNull()
    expect(switched!.id).not.toBe(helper.sess.id)
    const all = store.listSessions({ limit: 10 })
    expect(all.find((s) => s.title === 'fresh chat')).toBeDefined()
  })

  it('/sessions writes a numbered list to status', async () => {
    const reg = createRegistry()
    registerBuiltins(reg)
    store.createSession({ title: 'one', model: 'm' })
    store.createSession({ title: 'two', model: 'm' })
    const helper = makeCtx()
    await reg.get('sessions')!.run(helper.ctx, [])
    const last = helper.status[helper.status.length - 1] ?? ''
    expect(last).toMatch(/one/)
    expect(last).toMatch(/two/)
  })

  it('/model with no arg reports current model', async () => {
    const reg = createRegistry()
    registerBuiltins(reg)
    const helper = makeCtx()
    await reg.get('model')!.run(helper.ctx, [])
    expect(helper.status[helper.status.length - 1]).toMatch(/claude-sonnet-4-6/)
  })

  it('/model with arg switches model on session', async () => {
    const reg = createRegistry()
    registerBuiltins(reg)
    let switched: { id: string; model: string } | null = null
    const helper = makeCtx({
      setSession: (s) => {
        switched = s
      },
    })
    await reg.get('model')!.run(helper.ctx, ['claude-opus-4-7'])
    expect(switched!.model).toBe('claude-opus-4-7')
    const updated = store.getSession(helper.sess.id)!
    expect(updated.model).toBe('claude-opus-4-7')
  })

  it('/debug reports the log file location', async () => {
    const reg = createRegistry()
    registerBuiltins(reg)
    const helper = makeCtx()
    await reg.get('debug')!.run(helper.ctx, [])
    expect(helper.status[helper.status.length - 1]).toMatch(/log/i)
  })
})
