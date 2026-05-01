import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig } from '../../src/config/loader'

let dir: string
let global: string
let project: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aipacino-cfg-'))
  global = join(dir, 'global.json')
  project = join(dir, 'project.json')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('loadConfig', () => {
  it('returns defaults when no files and no env', () => {
    const cfg = loadConfig({ globalPath: global, projectPath: project, env: {} })
    expect(cfg.defaultModel).toBe('claude-sonnet-4-6')
    expect(cfg.maxTokens).toBe(8192)
    expect(cfg.ui.theme).toBe('dark')
    expect(cfg.logging.level).toBe('info')
  })

  it('global config overrides defaults', () => {
    writeFileSync(global, JSON.stringify({ defaultModel: 'claude-opus-4-7', maxTokens: 16000 }))
    const cfg = loadConfig({ globalPath: global, projectPath: project, env: {} })
    expect(cfg.defaultModel).toBe('claude-opus-4-7')
    expect(cfg.maxTokens).toBe(16000)
  })

  it('project config overrides global', () => {
    writeFileSync(global, JSON.stringify({ defaultModel: 'claude-opus-4-7' }))
    writeFileSync(project, JSON.stringify({ defaultModel: 'claude-sonnet-4-6' }))
    const cfg = loadConfig({ globalPath: global, projectPath: project, env: {} })
    expect(cfg.defaultModel).toBe('claude-sonnet-4-6')
  })

  it('env overrides project and global', () => {
    writeFileSync(project, JSON.stringify({ anthropic: { apiKey: 'from-project' } }))
    const cfg = loadConfig({
      globalPath: global,
      projectPath: project,
      env: { ANTHROPIC_API_KEY: 'from-env' },
    })
    expect(cfg.anthropic.apiKey).toBe('from-env')
  })

  it('throws a meaningful error on invalid JSON', () => {
    writeFileSync(global, '{ not valid json')
    expect(() => loadConfig({ globalPath: global, projectPath: project, env: {} })).toThrow(
      /global.*invalid json/i,
    )
  })

  it('throws with field info on schema violation', () => {
    writeFileSync(global, JSON.stringify({ logging: { level: 'verbose' } }))
    expect(() => loadConfig({ globalPath: global, projectPath: project, env: {} })).toThrow(
      /logging\.level/,
    )
  })

  it('creates nested project dir for default-only call', () => {
    mkdirSync(join(dir, 'sub'), { recursive: true })
    const cfg = loadConfig({ globalPath: global, projectPath: project, env: {} })
    expect(cfg.anthropic.baseUrl).toBe('https://api.anthropic.com')
  })
})
