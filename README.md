# AI Pacino

**Terminal AI coding companion.** A single-user, streaming CLI that talks to Anthropic
Claude from your terminal, keeps every conversation in a local SQLite database, and lets
you switch models and sessions on the fly — all wrapped in an Ink (React for CLI) TUI.

```
╭──────────────────────────────────────────────────────────────╮
│ you                                                          │
│ refactor the parser to handle escaped quotes                 │
│                                                              │
│ claude                                                       │
│ Here's a tokenizer that tracks the active quote character…   │
╰──────────────────────────────────────────────────────────────╯
 claude-sonnet-4-6 · new chat · 1.2k / 200k · thinking…
 ╭──────────────────────────────────────────────────────────╮
 │ ❯ type a message — / for commands, shift+enter for newline│
 ╰──────────────────────────────────────────────────────────╯
```

## Features

- **Streaming responses** — tokens render live via Anthropic's SSE stream, with a
  hand-written SSE parser (handles partial chunks, multi-line `data:`, CRLF).
- **Persistent sessions** — conversations and per-message token usage are stored in a
  local SQLite database (`bun:sqlite`). Resume any past session by index or id.
- **Context-window management** — oldest turns are dropped automatically when the
  history would overflow the model window, with a system notice inserted in their place.
- **Slash commands** — `/new`, `/sessions`, `/load`, `/model`, `/clear`, `/debug`,
  `/help`, `/quit` for everything you do mid-conversation.
- **Markdown rendering** — bold, italics, headings, lists and code blocks are formatted
  for the terminal with `marked-terminal`.
- **Resilient networking** — retries with exponential backoff on `408/429/5xx`,
  normalised error kinds (`auth`, `rate_limit`, `network`, `invalid_request`, `server`,
  `aborted`). A failed request never crashes the TUI.
- **Layered configuration** — env vars → project config → global config, validated with
  Zod.
- **Structured logging** — JSONL logs to disk with level filtering; the logger is
  guaranteed never to throw into the app.
- **Single-binary build** — `bun build --compile` produces a standalone executable.

## Requirements

- [Bun](https://bun.sh) ≥ 1.1 (`bun --version`). Bun is required — the app uses
  `bun:sqlite` and runs TypeScript directly.
- An Anthropic API key.

## Install

```bash
git clone https://github.com/nickzsche/Ai-Pacino.git
cd Ai-Pacino
bun install
```

Build a standalone binary (optional):

```bash
bun run build          # → dist/aipacino
./dist/aipacino --help
```

## Configure

Set your API key with **any one** of the following (highest precedence first):

| Source | Example |
|--------|---------|
| Env var | `export ANTHROPIC_API_KEY=sk-ant-…` |
| Project config (`.aipacino/config.json`) | overrides global |
| Global config (`~/.config/aipacino/config.json`) | lowest precedence |

Global config example:

```json
{
  "defaultModel": "claude-sonnet-4-6",
  "maxTokens": 8192,
  "anthropic": {
    "apiKey": "sk-ant-…",
    "baseUrl": "https://api.anthropic.com"
  },
  "ui": { "theme": "dark", "markdown": true },
  "logging": { "level": "info" }
}
```

### Environment variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `AIPACINO_DEFAULT_MODEL` | Override the default model |
| `AIPACINO_LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error` |
| `XDG_CONFIG_HOME` / `XDG_DATA_HOME` / `XDG_STATE_HOME` | Relocate config / data / logs |

## Usage

Launch the interactive TUI:

```bash
bun run start
# or, after building:
./dist/aipacino
```

### Command-line flags

| Flag | Description |
|------|-------------|
| `-h`, `--help` | Show usage and exit |
| `-v`, `--version` | Print the version and exit |
| `-m`, `--model <id>` | Override the model for this run |
| `-s`, `--session <id>` | Resume a specific session by id |

```bash
aipacino --model claude-opus-4-7
aipacino --session 01HXY3K9…
aipacino --help
```

### Interactive commands

Type `/` in the input bar to enter command mode (the border turns cyan).

| Command | Description |
|---------|-------------|
| `/help` | List all available commands |
| `/new [title]` | Start a fresh session |
| `/sessions` | List recent sessions (numbered) |
| `/load <id\|index>` | Load a session by id or list index |
| `/model [name]` | Show or switch the active model |
| `/clear` | Clear the on-screen status message |
| `/debug` | Show the log file location for live tailing |
| `/quit` | Exit |

**Input keys:** `Enter` submits, `Shift+Enter` inserts a newline, `Backspace`
deletes, `Ctrl+C` exits.

## Architecture

Layered, single-process. The provider interface is abstracted from day one so more
providers can be added without touching the TUI.

```
Ink TUI (React)
  App → ChatPanel / StatusBar / InputBar
        │  user input               ▲ streamed chunks
        ▼                           │
Command layer (parser → registry → builtins)
        │
        ▼
Provider layer (Provider interface → AnthropicProvider → SSE parser)
        │
        ▼
Session layer (SQLite store + context-window truncation)
```

| Path | Responsibility |
|------|----------------|
| `src/index.ts` | Entry point: arg parsing, config, wiring, Ink mount |
| `src/cli/args.ts` | CLI flag parsing (`--help`, `--version`, `--model`, `--session`) |
| `src/cli/App.tsx` | Root component; routes input to commands or the provider |
| `src/cli/ChatPanel.tsx` | Message list + streaming text |
| `src/cli/StatusBar.tsx` | Model · session · token usage |
| `src/cli/InputBar.tsx` | Multi-line input with command-mode indicator |
| `src/cli/markdown.ts` | Markdown → terminal renderer |
| `src/cli/store.ts` | Tiny observable app-state container |
| `src/commands/{parser,registry,builtins}.ts` | Slash-command parsing, registry, built-ins |
| `src/provider/types.ts` | `Provider` interface, message/chunk types, `ProviderError` |
| `src/provider/sse.ts` | Incremental SSE parser |
| `src/provider/anthropic.ts` | Anthropic streaming adapter with retry + error normalisation |
| `src/session/store.ts` | SQLite CRUD for sessions and messages |
| `src/session/context.ts` | Token-aware history truncation |
| `src/config/{schema,loader}.ts` | Zod schema + env/project/global merge |
| `src/auth/keys.ts` | API-key resolution with a helpful error |
| `src/logging/logger.ts` | JSONL file logger with level filtering |

## File locations

| What | Default path |
|------|--------------|
| Sessions DB | `$XDG_DATA_HOME/aipacino/sessions.db` (`~/.local/share/…`) |
| Logs | `$XDG_STATE_HOME/aipacino/aipacino.log` (`~/.local/state/…`) |
| Global config | `$XDG_CONFIG_HOME/aipacino/config.json` (`~/.config/…`) |
| Project config | `./.aipacino/config.json` |

## Development

```bash
bun run dev        # watch mode
bun test           # run the test suite
bun test --watch   # watch mode
bun run typecheck  # tsc --noEmit (strict)
bun run lint       # biome check
bun run format     # biome format --write
bun run build      # compile a single binary to dist/
```

Tests live in `tests/` and mirror the `src/` layout, plus an end-to-end integration
test that drives the TUI with `ink-testing-library` and asserts the assistant reply is
persisted to SQLite.

## Roadmap

AI Pacino is being built as a sequence of sub-projects. **Sub-project A (this repo) —
the core CLI — is complete and runnable.** Upcoming sub-projects:

- **B** — tool execution (bash, read, write, edit, grep) with a permission system
- **C** — multi-provider support (OpenAI, GLM, DeepSeek, Bedrock) + MCP client
- **D** — agent system (Michael / Tony / Carlito personas)
- **E** — plugin system, auto-update, distribution (npm, Homebrew)
- **F** — web dashboard (Astro + Hono + PocketBase)

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Anthropic API key not found` | Export `ANTHROPIC_API_KEY` or add it to a config file |
| `Config error: … invalid JSON` | Fix the JSON in the named config file |
| `Config validation failed at <field>` | A config value failed schema validation (e.g. `logging.level`) |
| `unknown option: …` | Check `--help` for the supported flags |
| `bun: command not found` | Install Bun from <https://bun.sh> |
