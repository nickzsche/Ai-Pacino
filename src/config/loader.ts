import { existsSync, readFileSync } from 'node:fs'
import { type Config, ConfigSchema } from './schema'

export interface LoadConfigOptions {
  globalPath: string
  projectPath: string
  env: Record<string, string | undefined>
}

const readJson = (path: string, label: string): Record<string, unknown> => {
  if (!existsSync(path)) return {}
  const raw = readFileSync(path, 'utf8')
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch (err) {
    throw new Error(`${label} config (${path}) is invalid JSON: ${(err as Error).message}`)
  }
}

const deepMerge = <T extends Record<string, unknown>>(
  base: T,
  over: Record<string, unknown>,
): T => {
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue
    const existing = out[k]
    if (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      existing !== null &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      out[k] = deepMerge(existing as Record<string, unknown>, v as Record<string, unknown>)
    } else {
      out[k] = v
    }
  }
  return out as T
}

const envOverlay = (env: Record<string, string | undefined>): Record<string, unknown> => {
  const overlay: Record<string, unknown> = {}
  if (env.ANTHROPIC_API_KEY) {
    overlay.anthropic = { apiKey: env.ANTHROPIC_API_KEY }
  }
  if (env.AIPACINO_DEFAULT_MODEL) {
    overlay.defaultModel = env.AIPACINO_DEFAULT_MODEL
  }
  if (env.AIPACINO_LOG_LEVEL) {
    overlay.logging = { level: env.AIPACINO_LOG_LEVEL }
  }
  return overlay
}

export const loadConfig = (opts: LoadConfigOptions): Config => {
  const global = readJson(opts.globalPath, 'global')
  const project = readJson(opts.projectPath, 'project')
  const env = envOverlay(opts.env)
  const merged = deepMerge(deepMerge(global, project), env)
  const result = ConfigSchema.safeParse(merged)
  if (!result.success) {
    const issue = result.error.issues[0]!
    throw new Error(`Config validation failed at ${issue.path.join('.')}: ${issue.message}`)
  }
  return result.data
}
