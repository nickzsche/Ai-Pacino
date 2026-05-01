import { describe, expect, it } from 'bun:test'
import { parseCommand } from '../../src/commands/parser'

describe('parseCommand', () => {
  it('returns null for non-slash input', () => {
    expect(parseCommand('hello world')).toBeNull()
    expect(parseCommand('   /not at start')).toBeNull()
    expect(parseCommand('')).toBeNull()
  })

  it('parses bare command with no args', () => {
    expect(parseCommand('/help')).toEqual({ name: 'help', args: [] })
  })

  it('parses command with whitespace-separated args', () => {
    expect(parseCommand('/load 01HXY')).toEqual({ name: 'load', args: ['01HXY'] })
    expect(parseCommand('/model claude-opus-4-7')).toEqual({
      name: 'model',
      args: ['claude-opus-4-7'],
    })
  })

  it('preserves quoted args with spaces', () => {
    expect(parseCommand('/new "long session title"')).toEqual({
      name: 'new',
      args: ['long session title'],
    })
  })

  it('lowercases command name', () => {
    expect(parseCommand('/HELP')).toEqual({ name: 'help', args: [] })
  })
})
