export type Role = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  role: Role
  content: string
}

export type StreamChunk =
  | { type: 'text'; text: string }
  | { type: 'usage'; input: number; output: number }
  | { type: 'done' }
  | { type: 'error'; error: ProviderError }

export type ProviderErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'network'
  | 'invalid_request'
  | 'server'
  | 'aborted'

export class ProviderError extends Error {
  override name = 'ProviderError'

  constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly retryable: boolean,
    public override readonly cause?: unknown,
  ) {
    super(message)
  }
}

export interface StreamOptions {
  model: string
  messages: ChatMessage[]
  system?: string
  maxTokens: number
  signal?: AbortSignal
}

export interface Provider {
  readonly name: string
  streamMessage(opts: StreamOptions): AsyncIterable<StreamChunk>
  countTokens(text: string, model: string): Promise<number>
}
