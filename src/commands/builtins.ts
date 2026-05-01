import type { Command, CommandRegistry } from './registry'

const helpCommand: Command = {
  name: 'help',
  description: 'list all available commands',
  async run(ctx) {
    ctx.state.setStatusMessage('')
  },
}

const newCommand: Command = {
  name: 'new',
  description: 'start a new conversation. usage: /new [title]',
  async run(ctx, args) {
    const title = args.join(' ').trim() || 'untitled'
    const created = ctx.store.createSession({
      title,
      model: ctx.state.currentSession.model,
    })
    ctx.state.setCurrentSession(created)
    ctx.state.setStatusMessage(`new session: ${created.title}`)
  },
}

const sessionsCommand: Command = {
  name: 'sessions',
  description: 'list recent sessions. usage: /sessions',
  async run(ctx) {
    const all = ctx.store.listSessions({ limit: 20 })
    if (all.length === 0) {
      ctx.state.setStatusMessage('no sessions yet')
      return
    }
    const summary = all.map((s, i) => `${i + 1}. ${s.title} [${s.id.slice(-6)}]`).join(' · ')
    ctx.state.setStatusMessage(summary)
  },
}

const loadCommand: Command = {
  name: 'load',
  description: 'load a session by id or list index. usage: /load <id|index>',
  async run(ctx, args) {
    const arg = args[0]
    if (!arg) {
      ctx.state.setStatusMessage('usage: /load <id|index>')
      return
    }
    let target = ctx.store.getSession(arg)
    if (!target) {
      const idx = Number.parseInt(arg, 10)
      if (Number.isFinite(idx) && idx > 0) {
        const list = ctx.store.listSessions({ limit: 50 })
        target = list[idx - 1] ?? null
      }
    }
    if (!target) {
      ctx.state.setStatusMessage(`session not found: ${arg}`)
      return
    }
    ctx.state.setCurrentSession(target)
    ctx.state.setStatusMessage(`loaded: ${target.title}`)
  },
}

const modelCommand: Command = {
  name: 'model',
  description: 'show or change the active model. usage: /model [name]',
  async run(ctx, args) {
    if (args.length === 0) {
      ctx.state.setStatusMessage(`current model: ${ctx.state.currentSession.model}`)
      return
    }
    const next = args[0]!
    ctx.store.updateSession(ctx.state.currentSession.id, { model: next })
    const updated = ctx.store.getSession(ctx.state.currentSession.id)!
    ctx.state.setCurrentSession(updated)
    ctx.state.setStatusMessage(`model → ${next}`)
  },
}

const clearCommand: Command = {
  name: 'clear',
  description: 'clear the on-screen status message',
  async run(ctx) {
    ctx.state.setStatusMessage('')
  },
}

const quitCommand: Command = {
  name: 'quit',
  description: 'exit aipacino',
  async run(ctx) {
    ctx.state.quit()
  },
}

const debugCommand: Command = {
  name: 'debug',
  description: 'show recent log entries (last 20 lines)',
  async run(ctx) {
    // logger has no read-back API; dump the recent log file path so the user can tail -f
    ctx.state.setStatusMessage('logs at $XDG_STATE_HOME/aipacino/aipacino.log — `tail -f` for live')
  },
}

export const registerBuiltins = (registry: CommandRegistry): void => {
  registry.register(newCommand)
  registry.register(sessionsCommand)
  registry.register(loadCommand)
  registry.register(modelCommand)
  registry.register(clearCommand)
  registry.register(quitCommand)
  registry.register(debugCommand)
  // help is special: needs registry to enumerate all commands
  registry.register({
    name: helpCommand.name,
    description: helpCommand.description,
    async run(ctx) {
      const all = registry.list()
      const summary = all.map((c) => `/${c.name}: ${c.description}`).join(' · ')
      ctx.state.setStatusMessage(summary)
    },
  })
}
