import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { render } from 'ink-testing-library'
import React from 'react'
import { App } from '../../src/cli/App'
import { createAppStore } from '../../src/cli/store'
import { registerBuiltins } from '../../src/commands/builtins'
import { createRegistry } from '../../src/commands/registry'
import type { Provider, StreamChunk } from '../../src/provider/types'
import { createSessionStore } from '../../src/session/store'
import type { SessionStore } from '../../src/session/store'

const scriptedProvider = (replies: string[]): Provider => {
  const queue = [...replies]
  return {
    name: 'mock',
    async *streamMessage(): AsyncIterable<StreamChunk> {
      const text = queue.shift() ?? ''
      for (const ch of text) yield { type: 'text', text: ch }
      yield { type: 'usage', input: 10, output: text.length }
      yield { type: 'done' }
    },
    async countTokens() {
      return 0
    },
  }
}

let dir: string
let sessionStore: SessionStore

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aipacino-int-'))
  sessionStore = createSessionStore(join(dir, 's.db'))
})

afterEach(() => {
  sessionStore.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('integration: send message → assistant reply persisted', () => {
  it('user message and assistant reply are stored in SQLite', async () => {
    const session = sessionStore.createSession({ title: 'int', model: 'claude-sonnet-4-6' })
    const store = createAppStore({ currentSessionId: session.id, currentModel: session.model })
    const provider = scriptedProvider(['Hello back'])
    const registry = createRegistry()
    registerBuiltins(registry)

    const { stdin, lastFrame } = render(
      <App
        store={store}
        registry={registry}
        provider={provider}
        sessionStore={sessionStore}
        contextWindow={200_000}
        maxTokens={1024}
        logger={{ debug() {}, info() {}, warn() {}, error() {} }}
        onQuit={() => {}}
      />,
    )

    // Wait briefly for ink's useEffect to register the stdin handler
    await new Promise((r) => setTimeout(r, 50))

    stdin.write('hi')
    await new Promise((r) => setTimeout(r, 10))
    stdin.write('\r')

    // Wait for async stream to complete
    await new Promise((r) => setTimeout(r, 200))

    const messages = sessionStore.getMessages(session.id)
    expect(messages.length).toBe(2)
    expect(messages[0]!.role).toBe('user')
    expect(messages[0]!.content).toBe('hi')
    expect(messages[1]!.role).toBe('assistant')
    expect(messages[1]!.content).toBe('Hello back')
    expect(lastFrame()).toMatch(/hello back/i)
  })
})
