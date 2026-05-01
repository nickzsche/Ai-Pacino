import { describe, expect, it } from 'bun:test'
import { parseSseStream } from '../../src/provider/sse'

const enc = (s: string) => new TextEncoder().encode(s)

const stream = (chunks: string[]): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc(ch))
      c.close()
    },
  })

describe('parseSseStream', () => {
  it('parses a single complete event', async () => {
    const events: { event?: string; data: string }[] = []
    for await (const e of parseSseStream(stream(['event: ping\ndata: hello\n\n']))) {
      events.push(e)
    }
    expect(events).toEqual([{ event: 'ping', data: 'hello' }])
  })

  it('parses event with no event name (data only)', async () => {
    const events: { event?: string; data: string }[] = []
    for await (const e of parseSseStream(stream(['data: bare\n\n']))) {
      events.push(e)
    }
    expect(events).toEqual([{ event: undefined, data: 'bare' }])
  })

  it('joins partial chunks across boundaries', async () => {
    const events: { event?: string; data: string }[] = []
    for await (const e of parseSseStream(
      stream(['event: a\nda', 'ta: split\n\nevent: b\ndata: ', 'second\n\n']),
    )) {
      events.push(e)
    }
    expect(events).toEqual([
      { event: 'a', data: 'split' },
      { event: 'b', data: 'second' },
    ])
  })

  it('handles multi-line data fields by joining with newline', async () => {
    const events: { event?: string; data: string }[] = []
    for await (const e of parseSseStream(stream(['data: line1\ndata: line2\n\n']))) {
      events.push(e)
    }
    expect(events).toEqual([{ event: undefined, data: 'line1\nline2' }])
  })

  it('skips comment lines starting with colon', async () => {
    const events: { event?: string; data: string }[] = []
    for await (const e of parseSseStream(stream([': keepalive\nevent: x\ndata: y\n\n']))) {
      events.push(e)
    }
    expect(events).toEqual([{ event: 'x', data: 'y' }])
  })
})
