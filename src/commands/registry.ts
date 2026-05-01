import type { Logger } from '../logging/logger'
import type { Provider } from '../provider/types'
import type { Session, SessionStore } from '../session/store'

export interface CommandContext {
  store: SessionStore
  provider: Provider
  logger: Logger
  state: {
    currentSession: Session
    setCurrentSession(s: Session): void
    setStatusMessage(msg: string): void
    quit(): void
  }
}

export interface Command {
  name: string
  description: string
  run(ctx: CommandContext, args: string[]): Promise<void>
}

export interface CommandRegistry {
  register(cmd: Command): void
  get(name: string): Command | undefined
  list(): Command[]
}

export const createRegistry = (): CommandRegistry => {
  const map = new Map<string, Command>()
  return {
    register(cmd) {
      if (map.has(cmd.name)) throw new Error(`Command "${cmd.name}" already registered`)
      map.set(cmd.name, cmd)
    },
    get(name) {
      return map.get(name)
    },
    list() {
      return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
    },
  }
}
