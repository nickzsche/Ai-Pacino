import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type SessionStore, createSessionStore } from '../../src/session/store'

let dir: string
let store: SessionStore

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aipacino-sess-'))
  store = createSessionStore(join(dir, 'sessions.db'))
})

afterEach(() => {
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('SessionStore', () => {
  it('creates and retrieves a session', () => {
    const s = store.createSession({ title: 'first', model: 'claude-sonnet-4-6' })
    const fetched = store.getSession(s.id)
    expect(fetched?.title).toBe('first')
    expect(fetched?.model).toBe('claude-sonnet-4-6')
  })

  it('appends and lists messages in insertion order', () => {
    const s = store.createSession({ title: 't', model: 'm' })
    store.appendMessage(s.id, { role: 'user', content: 'first' })
    store.appendMessage(s.id, { role: 'assistant', content: 'second' })
    store.appendMessage(s.id, { role: 'user', content: 'third' })
    const msgs = store.getMessages(s.id)
    expect(msgs.map((m) => m.content)).toEqual(['first', 'second', 'third'])
  })

  it('lists sessions sorted by updated_at desc', async () => {
    const a = store.createSession({ title: 'A', model: 'm' })
    await new Promise((r) => setTimeout(r, 5))
    const b = store.createSession({ title: 'B', model: 'm' })
    await new Promise((r) => setTimeout(r, 5))
    store.appendMessage(a.id, { role: 'user', content: 'bump A' })
    const list = store.listSessions({ limit: 10 })
    expect(list[0]!.id).toBe(a.id)
    expect(list[1]!.id).toBe(b.id)
  })

  it('updateUsage stores token counts on message', () => {
    const s = store.createSession({ title: 't', model: 'm' })
    const m = store.appendMessage(s.id, { role: 'assistant', content: 'hi' })
    store.updateUsage(m.id, { input: 12, output: 7 })
    const msgs = store.getMessages(s.id)
    expect(msgs[0]!.tokensIn).toBe(12)
    expect(msgs[0]!.tokensOut).toBe(7)
  })

  it('cascade-deletes messages when session deleted', () => {
    const s = store.createSession({ title: 't', model: 'm' })
    store.appendMessage(s.id, { role: 'user', content: 'hi' })
    store.deleteSession(s.id)
    expect(store.getSession(s.id)).toBeNull()
    expect(store.getMessages(s.id)).toEqual([])
  })

  it('updateSession renames title and model', () => {
    const s = store.createSession({ title: 'old', model: 'a' })
    store.updateSession(s.id, { title: 'new', model: 'b' })
    const fetched = store.getSession(s.id)
    expect(fetched?.title).toBe('new')
    expect(fetched?.model).toBe('b')
  })
})
