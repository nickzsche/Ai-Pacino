export interface ParsedCommand {
  name: string
  args: string[]
}

export const parseCommand = (input: string): ParsedCommand | null => {
  if (!input.startsWith('/')) return null
  const rest = input.slice(1).trim()
  if (rest.length === 0) return null
  const tokens = tokenize(rest)
  if (tokens.length === 0) return null
  const [name, ...args] = tokens
  return { name: name!.toLowerCase(), args }
}

const tokenize = (input: string): string[] => {
  const out: string[] = []
  let cur = ''
  let quote: string | null = null
  for (const ch of input) {
    if (quote) {
      if (ch === quote) {
        quote = null
      } else {
        cur += ch
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === ' ' || ch === '\t') {
      if (cur.length > 0) {
        out.push(cur)
        cur = ''
      }
      continue
    }
    cur += ch
  }
  if (cur.length > 0) out.push(cur)
  return out
}
