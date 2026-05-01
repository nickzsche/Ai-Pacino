import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { AnthropicProvider } from '../../src/provider/anthropic'
import type { ProviderError, StreamChunk } from '../../src/provider/types'

const mockSseResponse = (events: string[]): Response => {
  const body = events.map((e) => `event: ${e.split('|')[0]}\ndata: ${e.split('|')[1]}\n\n`).join('')
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

const collect = async (iter: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> => {
  const out: StreamChunk[] = []
  for await (const c of iter) out.push(c)
  return out
}

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('AnthropicProvider', () => {
  it('streams text deltas and emits done on message_stop', async () => {
    const events = [
      `message_start|${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 5, output_tokens: 0 } } })}`,
      `content_block_delta|${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } })}`,
      `content_block_delta|${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } })}`,
      `message_delta|${JSON.stringify({ type: 'message_delta', usage: { output_tokens: 7 } })}`,
      `message_stop|${JSON.stringify({ type: 'message_stop' })}`,
    ]
    globalThis.fetch = mock(async () => mockSseResponse(events)) as never

    const p = new AnthropicProvider({ apiKey: 'sk-test', baseUrl: 'https://api.anthropic.com' })
    const chunks = await collect(
      p.streamMessage({
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 100,
      }),
    )

    const texts = chunks.filter((c) => c.type === 'text').map((c) => (c as { text: string }).text)
    expect(texts.join('')).toBe('Hello')
    expect(chunks.find((c) => c.type === 'usage')).toBeDefined()
    expect(chunks[chunks.length - 1]!.type).toBe('done')
  })

  it('emits error chunk on 401', async () => {
    globalThis.fetch = mock(
      async () => new Response('{"error":{"message":"invalid key"}}', { status: 401 }),
    ) as never
    const p = new AnthropicProvider({ apiKey: 'bad', baseUrl: 'https://api.anthropic.com' })
    const chunks = await collect(
      p.streamMessage({
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 100,
      }),
    )
    const errChunk = chunks.find((c) => c.type === 'error')
    expect(errChunk).toBeDefined()
    expect((errChunk as { error: ProviderError }).error.kind).toBe('auth')
    expect((errChunk as { error: ProviderError }).error.retryable).toBe(false)
  })

  it('retries on 429 with backoff and eventually succeeds', async () => {
    let calls = 0
    const okEvents = [
      `content_block_delta|${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok' } })}`,
      `message_stop|${JSON.stringify({ type: 'message_stop' })}`,
    ]
    globalThis.fetch = mock(async () => {
      calls += 1
      if (calls < 2) return new Response('{"error":{"message":"rate"}}', { status: 429 })
      return mockSseResponse(okEvents)
    }) as never

    const p = new AnthropicProvider({
      apiKey: 'sk-test',
      baseUrl: 'https://api.anthropic.com',
      retryBaseMs: 1,
    })
    const chunks = await collect(
      p.streamMessage({
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 100,
      }),
    )
    expect(calls).toBe(2)
    expect(chunks.some((c) => c.type === 'text')).toBe(true)
    expect(chunks[chunks.length - 1]!.type).toBe('done')
  })

  it('emits error after max retries on persistent 5xx', async () => {
    globalThis.fetch = mock(
      async () => new Response('{"error":{"message":"boom"}}', { status: 500 }),
    ) as never
    const p = new AnthropicProvider({
      apiKey: 'sk-test',
      baseUrl: 'https://api.anthropic.com',
      retryBaseMs: 1,
      maxRetries: 2,
    })
    const chunks = await collect(
      p.streamMessage({
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 100,
      }),
    )
    const errChunk = chunks.find((c) => c.type === 'error')
    expect(errChunk).toBeDefined()
    expect((errChunk as { error: ProviderError }).error.kind).toBe('server')
  })
})
