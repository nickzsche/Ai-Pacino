import type { ChatMessage } from '../provider/types'

export interface ContextOptions {
  contextWindow: number
  reserveOutput: number
}

export interface TruncationResult {
  messages: ChatMessage[]
  truncated: number
}

const estimateTokens = (text: string): number => Math.ceil(text.length / 4)

export const truncateForContext = (
  messages: ChatMessage[],
  opts: ContextOptions,
): TruncationResult => {
  const budget = opts.contextWindow - opts.reserveOutput
  if (budget <= 0 || messages.length === 0) return { messages, truncated: 0 }

  let total = 0
  const reversed: ChatMessage[] = []
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    const tokens = estimateTokens(m.content)
    if (i === messages.length - 1) {
      reversed.push(m)
      total += tokens
      continue
    }
    if (total + tokens > budget) break
    reversed.push(m)
    total += tokens
  }
  reversed.reverse()

  // Anthropic's API requires the first message to be `user`; a kept suffix of
  // an alternating transcript can begin on `assistant`, so drop leading ones.
  const firstUser = reversed.findIndex((m) => m.role === 'user')
  const kept = firstUser > 0 ? reversed.slice(firstUser) : reversed

  const truncated = messages.length - kept.length
  if (truncated === 0) return { messages: kept, truncated: 0 }

  const notice: ChatMessage = {
    role: 'system',
    content: `[${truncated} earlier conversation truncated to fit context window]`,
  }
  return { messages: [notice, ...kept], truncated }
}
