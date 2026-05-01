import { describe, expect, it } from 'bun:test'
import { type Command, createRegistry } from '../../src/commands/registry'

const makeCmd = (name: string): Command => ({
  name,
  description: `${name} command`,
  run: async () => {
    /* noop */
  },
})

describe('CommandRegistry', () => {
  it('registers and looks up by name', () => {
    const reg = createRegistry()
    reg.register(makeCmd('help'))
    expect(reg.get('help')?.name).toBe('help')
  })

  it('returns undefined for unknown command', () => {
    const reg = createRegistry()
    expect(reg.get('nope')).toBeUndefined()
  })

  it('list returns all registered commands sorted by name', () => {
    const reg = createRegistry()
    reg.register(makeCmd('zeta'))
    reg.register(makeCmd('alpha'))
    reg.register(makeCmd('mid'))
    expect(reg.list().map((c) => c.name)).toEqual(['alpha', 'mid', 'zeta'])
  })

  it('throws on duplicate registration', () => {
    const reg = createRegistry()
    reg.register(makeCmd('help'))
    expect(() => reg.register(makeCmd('help'))).toThrow(/already registered/)
  })
})
