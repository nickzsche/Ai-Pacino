export interface SseEvent {
  event?: string
  data: string
}

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (value) buffer += decoder.decode(value, { stream: true })
      if (done) {
        buffer += decoder.decode()
        if (buffer.length > 0) {
          const ev = parseEvent(buffer)
          if (ev) yield ev
        }
        return
      }

      let idx = indexOfBoundary(buffer)
      while (idx !== -1) {
        const raw = buffer.slice(0, idx)
        buffer = buffer.slice(idx).replace(/^(\r?\n){2}/, '')
        const ev = parseEvent(raw)
        if (ev) yield ev
        idx = indexOfBoundary(buffer)
      }
    }
  } finally {
    reader.releaseLock()
  }
}

const indexOfBoundary = (buf: string): number => {
  const a = buf.indexOf('\n\n')
  const b = buf.indexOf('\r\n\r\n')
  if (a === -1) return b
  if (b === -1) return a
  return Math.min(a, b)
}

const parseEvent = (raw: string): SseEvent | null => {
  let event: string | undefined
  const dataParts: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (line.length === 0 || line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '')
    if (field === 'event') event = value
    else if (field === 'data') dataParts.push(value)
  }
  if (dataParts.length === 0 && event === undefined) return null
  return { event, data: dataParts.join('\n') }
}
