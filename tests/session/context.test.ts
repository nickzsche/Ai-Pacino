import { describe, expect, it } from 'bun:test'
import type { ChatMessage } from '../../src/provider/types'
import { truncateForContext } from '../../src/session/context'

const make = (n: number): ChatMessage[] =>
  Array.from({ length: n }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: 'x'.repeat(400), // ~100 tokens at 4 chars/token
  }))

describe('truncateForContext', () => {
  it('returns all messages when under threshold', () => {
    const msgs = make(5) // ~500 tokens
    const { messages, truncated } = truncateForContext(msgs, {
      contextWindow: 10000,
      reserveOutput: 1000,
    })
    expect(messages.length).toBe(5)
    expect(truncated).toBe(0)
  })

  it('truncates oldest messages and prepends a notice when over threshold', () => {
    const msgs = make(50) // ~5000 tokens
    const { messages, truncated } = truncateForContext(msgs, {
      contextWindow: 1000,
      reserveOutput: 200,
    })
    expect(truncated).toBeGreaterThan(0)
    expect(messages[0]!.role).toBe('system')
    expect(messages[0]!.content).toMatch(/earlier conversation truncated/i)
    // Newest message preserved
    expect(messages[messages.length - 1]!.content).toBe(msgs[msgs.length - 1]!.content)
  })

  it('always preserves the most recent message even if huge', () => {
    const huge: ChatMessage = { role: 'user', content: 'x'.repeat(20000) }
    const { messages } = truncateForContext([huge], {
      contextWindow: 100,
      reserveOutput: 10,
    })
    expect(messages[messages.length - 1]).toBe(huge)
  })
})
