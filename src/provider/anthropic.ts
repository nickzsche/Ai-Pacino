import { parseSseStream } from './sse'
import { type Provider, ProviderError, type StreamChunk, type StreamOptions } from './types'

export interface AnthropicProviderOptions {
  apiKey: string
  baseUrl: string
  maxRetries?: number
  retryBaseMs?: number
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])

export class AnthropicProvider implements Provider {
  readonly name = 'anthropic'
  private readonly opts: Required<AnthropicProviderOptions>

  constructor(opts: AnthropicProviderOptions) {
    this.opts = {
      maxRetries: 3,
      retryBaseMs: 250,
      ...opts,
    }
  }

  async *streamMessage(opts: StreamOptions): AsyncIterable<StreamChunk> {
    const url = `${this.opts.baseUrl}/v1/messages`
    const body = JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      stream: true,
      system: opts.system,
      messages: opts.messages.filter((m) => m.role !== 'system'),
    })

    let attempt = 0
    let lastError: ProviderError | null = null

    while (attempt <= this.opts.maxRetries) {
      let response: Response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': this.opts.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body,
          signal: opts.signal,
        })
      } catch (err) {
        lastError = new ProviderError(
          (err as Error).name === 'AbortError' ? 'aborted' : 'network',
          (err as Error).message,
          (err as Error).name !== 'AbortError',
          err,
        )
        if (!lastError.retryable || attempt >= this.opts.maxRetries) {
          yield { type: 'error', error: lastError }
          return
        }
        await sleep(this.opts.retryBaseMs * 2 ** attempt)
        attempt += 1
        continue
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        const kind = mapStatusToKind(response.status)
        const retryable = RETRYABLE_STATUS.has(response.status)
        lastError = new ProviderError(
          kind,
          `Anthropic API ${response.status}: ${text || response.statusText}`,
          retryable,
        )
        if (!retryable || attempt >= this.opts.maxRetries) {
          yield { type: 'error', error: lastError }
          return
        }
        await sleep(this.opts.retryBaseMs * 2 ** attempt)
        attempt += 1
        continue
      }

      if (!response.body) {
        yield {
          type: 'error',
          error: new ProviderError('server', 'Empty response body', false),
        }
        return
      }

      yield* this.consumeStream(response.body)
      return
    }

    if (lastError) yield { type: 'error', error: lastError }
  }

  async countTokens(text: string, model: string): Promise<number> {
    try {
      const res = await fetch(`${this.opts.baseUrl}/v1/messages/count_tokens`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.opts.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: text }],
        }),
      })
      if (!res.ok) return Math.ceil(text.length / 4)
      const data = (await res.json()) as { input_tokens?: number }
      return data.input_tokens ?? Math.ceil(text.length / 4)
    } catch {
      return Math.ceil(text.length / 4)
    }
  }

  private async *consumeStream(body: ReadableStream<Uint8Array>): AsyncIterable<StreamChunk> {
    let inputTokens = 0
    let outputTokens = 0
    let usageEmitted = false

    try {
      for await (const ev of parseSseStream(body)) {
        if (!ev.data) continue
        let payload: Record<string, unknown>
        try {
          payload = JSON.parse(ev.data) as Record<string, unknown>
        } catch {
          continue
        }
        const type = payload.type as string

        if (type === 'message_start') {
          const usage = (payload.message as Record<string, unknown> | undefined)?.usage as
            | { input_tokens?: number; output_tokens?: number }
            | undefined
          if (usage?.input_tokens) inputTokens = usage.input_tokens
          if (usage?.output_tokens) outputTokens = usage.output_tokens
        } else if (type === 'content_block_delta') {
          const delta = payload.delta as { type?: string; text?: string } | undefined
          if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
            yield { type: 'text', text: delta.text }
          }
        } else if (type === 'message_delta') {
          const usage = payload.usage as { output_tokens?: number } | undefined
          if (usage?.output_tokens != null) outputTokens = usage.output_tokens
        } else if (type === 'message_stop') {
          if (!usageEmitted) {
            yield { type: 'usage', input: inputTokens, output: outputTokens }
            usageEmitted = true
          }
          yield { type: 'done' }
          return
        }
      }
      if (!usageEmitted) yield { type: 'usage', input: inputTokens, output: outputTokens }
      yield { type: 'done' }
    } catch (err) {
      yield {
        type: 'error',
        error: new ProviderError(
          (err as Error).name === 'AbortError' ? 'aborted' : 'network',
          (err as Error).message,
          false,
          err,
        ),
      }
    }
  }
}

const mapStatusToKind = (status: number): ProviderError['kind'] => {
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate_limit'
  if (status >= 400 && status < 500) return 'invalid_request'
  return 'server'
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
