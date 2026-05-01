import { describe, expect, it } from 'bun:test'
import { MissingApiKeyError, resolveAnthropicKey } from '../../src/auth/keys'

describe('resolveAnthropicKey', () => {
  it('returns config key when present', () => {
    expect(resolveAnthropicKey({ anthropic: { apiKey: 'sk-cfg', baseUrl: '' } } as never)).toBe(
      'sk-cfg',
    )
  })

  it('throws MissingApiKeyError when no key', () => {
    expect(() =>
      resolveAnthropicKey({ anthropic: { apiKey: undefined, baseUrl: '' } } as never),
    ).toThrow(MissingApiKeyError)
  })

  it('error message tells the user how to fix it', () => {
    try {
      resolveAnthropicKey({ anthropic: { apiKey: undefined, baseUrl: '' } } as never)
    } catch (err) {
      const message = (err as Error).message
      expect(message).toContain('ANTHROPIC_API_KEY')
      expect(message).toContain('config.json')
    }
  })
})
