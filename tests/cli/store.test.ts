import { describe, expect, it } from 'bun:test'
import { createAppStore } from '../../src/cli/store'

describe('app store', () => {
  it('starts with empty messages and no streaming text', () => {
    const store = createAppStore({
      currentSessionId: 'sess-1',
      currentModel: 'm',
    })
    const s = store.getState()
    expect(s.messages).toEqual([])
    expect(s.streamingText).toBe('')
  })

  it('appendMessage adds and notifies subscribers', () => {
    const store = createAppStore({ currentSessionId: 'sess-1', currentModel: 'm' })
    let notified = 0
    const unsub = store.subscribe(() => {
      notified += 1
    })
    store.appendMessage({ role: 'user', content: 'hi' })
    expect(store.getState().messages.length).toBe(1)
    expect(notified).toBe(1)
    unsub()
  })

  it('streaming append concatenates text and clears on finalize', () => {
    const store = createAppStore({ currentSessionId: 'sess-1', currentModel: 'm' })
    store.appendStreaming('Hel')
    store.appendStreaming('lo')
    expect(store.getState().streamingText).toBe('Hello')
    store.finalizeStreaming()
    expect(store.getState().streamingText).toBe('')
    expect(store.getState().messages[0]).toEqual({ role: 'assistant', content: 'Hello' })
  })

  it('setStatusMessage updates status field', () => {
    const store = createAppStore({ currentSessionId: 'sess-1', currentModel: 'm' })
    store.setStatusMessage('hello')
    expect(store.getState().statusMessage).toBe('hello')
  })
})
