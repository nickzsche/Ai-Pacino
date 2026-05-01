# AI Pacino

Terminal AI coding companion. Sub-project A — çekirdek CLI iskeleti.

## Install

```bash
git clone <repo>
cd Ai-Pacino
bun install
```

## Configure

Set your Anthropic API key. Choose one:

**Env var:**
```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

**Config file:** create `~/.config/aipacino/config.json`:
```json
{
  "anthropic": { "apiKey": "sk-ant-..." },
  "defaultModel": "claude-sonnet-4-6",
  "maxTokens": 8192,
  "logging": { "level": "info" }
}
```

Project-local config at `.aipacino/config.json` overrides global.

## Run

```bash
bun run start
# or after `bun build`:
./dist/aipacino
```

## Slash commands

| Command | Description |
|---------|-------------|
| `/help` | List all commands |
| `/new [title]` | Start a fresh session |
| `/sessions` | List recent sessions |
| `/load <id\|index>` | Load a session by id or list index |
| `/model [name]` | Show or switch active model |
| `/clear` | Clear the status message |
| `/debug` | Show log file location for live tailing |
| `/quit` | Exit |

## File locations

- Sessions DB: `$XDG_DATA_HOME/aipacino/sessions.db` (default `~/.local/share/aipacino/sessions.db`)
- Logs: `$XDG_STATE_HOME/aipacino/aipacino.log` (default `~/.local/state/aipacino/aipacino.log`)
- Global config: `$XDG_CONFIG_HOME/aipacino/config.json` (default `~/.config/aipacino/config.json`)

## Develop

```bash
bun run dev       # watch mode
bun test          # run all tests
bun test --watch  # watch mode tests
bun run lint      # biome check
bun run format    # biome format
bun run build     # compile single binary to dist/
```

## What's next

This is sub-project **A** of the AI Pacino platform. See `project.md` for the full roadmap. Next sub-projects:

- **B** — tool execution (bash, read, write, edit, grep) with permission system
- **C** — multi-provider (OpenAI, GLM, DeepSeek, Bedrock) + MCP client
- **D** — agent system (Michael / Tony / Carlito personas)
- **E** — plugin system, auto-update, distribution (npm, Homebrew)
- **F** — web dashboard (Astro + Hono + PocketBase)
