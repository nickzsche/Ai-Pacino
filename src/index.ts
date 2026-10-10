#!/usr/bin/env bun
import { homedir } from 'node:os'
import { join } from 'node:path'
import { render } from 'ink'
import { createElement } from 'react'
import pkg from '../package.json'
import { MissingApiKeyError, resolveAnthropicKey } from './auth/keys'
import { App } from './cli/App'
import { helpText, parseArgs } from './cli/args'
import { createAppStore } from './cli/store'
import { registerBuiltins } from './commands/builtins'
import { createRegistry } from './commands/registry'
import { loadConfig } from './config/loader'
import { createLogger } from './logging/logger'
import { AnthropicProvider } from './provider/anthropic'
import { type Session, createSessionStore } from './session/store'

const SYSTEM_PROMPT =
  'You are AI Pacino, a concise terminal-based coding companion. ' +
  "Answer in the user's language, use Markdown for code and structure, and prefer " +
  'concrete, runnable answers over generalities.'

const xdg = (envName: string, fallback: string): string =>
  process.env[envName] ?? join(homedir(), fallback)

function die(message: string, code: number): never {
  process.stderr.write(`${message}\n`)
  process.exit(code)
}

const main = async (argv: string[]): Promise<void> => {
  const action = parseArgs(argv)
  if (action.type === 'help') {
    process.stdout.write(`${helpText(pkg.version)}\n`)
    return
  }
  if (action.type === 'version') {
    process.stdout.write(`${pkg.name} v${pkg.version}\n`)
    return
  }
  if (action.type === 'error') {
    process.stderr.write(`Error: ${action.message}\n\n${helpText(pkg.version)}\n`)
    process.exitCode = 2
    return
  }

  const globalPath = join(xdg('XDG_CONFIG_HOME', '.config'), 'aipacino', 'config.json')
  const projectPath = join(process.cwd(), '.aipacino', 'config.json')

  let config: ReturnType<typeof loadConfig>
  try {
    config = loadConfig({ globalPath, projectPath, env: process.env })
  } catch (err) {
    die(`Config error: ${(err as Error).message}`, 1)
  }

  const logFile =
    config.logging.file ?? join(xdg('XDG_STATE_HOME', '.local/state'), 'aipacino', 'aipacino.log')
  const logger = createLogger({ level: config.logging.level, file: logFile })

  let apiKey: string
  try {
    apiKey = resolveAnthropicKey(config)
  } catch (err) {
    if (err instanceof MissingApiKeyError) die(err.message, 2)
    throw err
  }

  const dbPath = join(xdg('XDG_DATA_HOME', '.local/share'), 'aipacino', 'sessions.db')
  const sessionStore = createSessionStore(dbPath)

  let session: Session
  if (action.options.session) {
    const found = sessionStore.getSession(action.options.session)
    if (!found) {
      sessionStore.close()
      die(`Session not found: ${action.options.session}`, 2)
    }
    session = found
  } else {
    const recent = sessionStore.listSessions({ limit: 1 })
    session =
      recent[0] ?? sessionStore.createSession({ title: 'new chat', model: config.defaultModel })
  }

  if (action.options.model && action.options.model !== session.model) {
    sessionStore.updateSession(session.id, { model: action.options.model })
    session = sessionStore.getSession(session.id) ?? session
  }

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
      system: SYSTEM_PROMPT,
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

main(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`Fatal: ${(err as Error).message}\n`)
  process.exit(99)
})
