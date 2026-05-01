#!/usr/bin/env bun
import { homedir } from 'node:os'
import { join } from 'node:path'
import { render } from 'ink'
import { createElement } from 'react'
import { MissingApiKeyError, resolveAnthropicKey } from './auth/keys'
import { App } from './cli/App'
import { createAppStore } from './cli/store'
import { registerBuiltins } from './commands/builtins'
import { createRegistry } from './commands/registry'
import { loadConfig } from './config/loader'
import { createLogger } from './logging/logger'
import { AnthropicProvider } from './provider/anthropic'
import { createSessionStore } from './session/store'

const xdg = (envName: string, fallback: string): string =>
  process.env[envName] ?? join(homedir(), fallback)

const main = async () => {
  const globalPath = join(xdg('XDG_CONFIG_HOME', '.config'), 'aipacino', 'config.json')
  const projectPath = join(process.cwd(), '.aipacino', 'config.json')

  let config: ReturnType<typeof loadConfig>
  try {
    config = loadConfig({ globalPath, projectPath, env: process.env })
  } catch (err) {
    process.stderr.write(`Config error: ${(err as Error).message}\n`)
    process.exit(1)
  }

  const logFile =
    config.logging.file ?? join(xdg('XDG_STATE_HOME', '.local/state'), 'aipacino', 'aipacino.log')
  const logger = createLogger({ level: config.logging.level, file: logFile })

  let apiKey: string
  try {
    apiKey = resolveAnthropicKey(config)
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      process.stderr.write(`${err.message}\n`)
      process.exit(2)
    }
    throw err
  }

  const dbPath = join(xdg('XDG_DATA_HOME', '.local/share'), 'aipacino', 'sessions.db')
  const sessionStore = createSessionStore(dbPath)
  const recent = sessionStore.listSessions({ limit: 1 })
  const session =
    recent[0] ?? sessionStore.createSession({ title: 'new chat', model: config.defaultModel })

  const provider = new AnthropicProvider({
    apiKey,
    baseUrl: config.anthropic.baseUrl,
  })

  const stored = sessionStore.getMessages(session.id)
  const store = createAppStore({
    currentSessionId: session.id,
    currentModel: session.model,
  })
  store.setMessages(stored.map((m) => ({ role: m.role, content: m.content })))

  const registry = createRegistry()
  registerBuiltins(registry)

  logger.info('aipacino started', { sessionId: session.id, model: session.model })

  const shutdown = () => {
    try {
      logger.info('aipacino shutting down (signal)')
      sessionStore.close()
    } finally {
      process.exit(0)
    }
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  const app = render(
    createElement(App, {
      store,
      registry,
      provider,
      sessionStore,
      contextWindow: 200_000,
      maxTokens: config.maxTokens,
      logger,
      onQuit: () => {
        sessionStore.close()
      },
    }),
  )

  await app.waitUntilExit()
  sessionStore.close()
  logger.info('aipacino exited')
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${(err as Error).message}\n`)
  process.exit(99)
})
