import { describe, expect, it } from 'bun:test'
import { parseArgs } from '../../src/cli/args'

describe('parseArgs', () => {
  it('defaults to a run action with no options', () => {
    expect(parseArgs([])).toEqual({ type: 'run', options: {} })
  })

  it('recognises --help and -h', () => {
    expect(parseArgs(['--help'])).toEqual({ type: 'help' })
    expect(parseArgs(['-h'])).toEqual({ type: 'help' })
  })

  it('recognises --version and -v', () => {
    expect(parseArgs(['--version'])).toEqual({ type: 'version' })
    expect(parseArgs(['-v'])).toEqual({ type: 'version' })
  })

  it('parses --model and --session with values', () => {
    expect(parseArgs(['--model', 'claude-opus-4-7'])).toEqual({
      type: 'run',
      options: { model: 'claude-opus-4-7' },
    })
    expect(parseArgs(['-s', '01HXY'])).toEqual({
      type: 'run',
      options: { session: '01HXY' },
    })
  })

  it('errors when an option is missing its value', () => {
    const result = parseArgs(['--model'])
    expect(result.type).toBe('error')
  })

  it('errors on unknown options', () => {
    const result = parseArgs(['--nope'])
    expect(result).toEqual({ type: 'error', message: 'unknown option: --nope' })
  })
})
