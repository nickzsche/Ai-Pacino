import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { render } from 'ink-testing-library'
import React from 'react'
import { App } from '../../src/cli/App'
import { createAppStore } from '../../src/cli/store'
import { createRegistry } from '../../src/commands/registry'
import type { Provider, StreamChunk } from '../../src/provider/types'
import { createSessionStore } from '../../src/session/store'

const noopProvider: Provider = {
  name: 'noop',
  async *streamMessage(): AsyncIterable<StreamChunk> {
    yield { type: 'text', text: 'hi' }
    yield { type: 'usage', input: 1, output: 1 }
    yield { type: 'done' }
  },
  async countTokens() {
    return 1
  },
}

describe('App', () => {
  it('renders status bar, chat panel, and input bar on mount', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aipacino-app-'))
    try {
      const sessionStore = createSessionStore(join(dir, 'sess.db'))
      const session = sessionStore.createSession({ title: 'test', model: 'claude-sonnet-4-6' })
      const store = createAppStore({
        currentSessionId: session.id,
        currentModel: session.model,
      })
      const registry = createRegistry()

      const { lastFrame } = render(
        <App
          store={store}
          registry={registry}
          provider={noopProvider}
          sessionStore={sessionStore}
          contextWindow={200_000}
          maxTokens={1024}
          logger={{ debug() {}, info() {}, warn() {}, error() {} }}
          onQuit={() => {}}
        />,
      )
      const frame = lastFrame() ?? ''
      expect(frame).toMatch(/claude-sonnet-4-6/)
      expect(frame).toMatch(/test/)
      expect(frame).toMatch(/start a conversation/i)
      sessionStore.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
