export interface CliOptions {
  model?: string
  session?: string
}

export type CliAction =
  | { type: 'help' }
  | { type: 'version' }
  | { type: 'run'; options: CliOptions }
  | { type: 'error'; message: string }

/**
 * Parse process.argv (already sliced past `node`/`bun` and the script path).
 * Unknown flags and missing option values are reported as errors rather than
 * launching the TUI, so typos fail fast instead of opening a hung prompt.
 */
export const parseArgs = (argv: string[]): CliAction => {
  const options: CliOptions = {}

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    switch (arg) {
      case '-h':
      case '--help':
        return { type: 'help' }
      case '-v':
      case '--version':
        return { type: 'version' }
      case '-m':
      case '--model': {
        const value = argv[++i]
        if (!value) return { type: 'error', message: `option ${arg} requires a value` }
        options.model = value
        break
      }
      case '-s':
      case '--session': {
        const value = argv[++i]
        if (!value) return { type: 'error', message: `option ${arg} requires a value` }
        options.session = value
        break
      }
      default:
        return { type: 'error', message: `unknown option: ${arg}` }
    }
  }

  return { type: 'run', options }
}

export const helpText = (version: string): string =>
  `AI Pacino — terminal AI coding companion

Usage
  aipacino [options]

Options
  -h, --help             Show this help and exit
  -v, --version          Print the version and exit
  -m, --model <id>       Override the model for this run
  -s, --session <id>     Resume a specific session by id

Environment
  ANTHROPIC_API_KEY      Anthropic API key (required unless set in a config file)
  AIPACINO_DEFAULT_MODEL Override the default model
  AIPACINO_LOG_LEVEL     debug | info | warn | error

Interactive commands (type / inside the TUI)
  /help  /new  /sessions  /load  /model  /clear  /debug  /quit

Files
  Config    ~/.config/aipacino/config.json   (.aipacino/config.json overrides)
  Sessions  ~/.local/share/aipacino/sessions.db
  Logs      ~/.local/state/aipacino/aipacino.log

Version ${version}`
