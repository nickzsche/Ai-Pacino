# Çekirdek CLI İskeleti — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bun + TypeScript + Ink ile çalışan, Anthropic Claude'a streaming mesaj gönderen, SQLite'ta oturum geçmişi tutan, slash komutlu bir terminal istemcisi (AI Pacino sub-project A) inşa et.

**Architecture:** Katmanlı: Ink TUI → Session Manager → Provider Layer → Anthropic API. Provider arayüzü baştan soyut tutulur (sub-project C'de OpenAI/MCP eklenecek). SQLite (`bun:sqlite`) sessions+messages, Zod config, structured JSONL logger. Tek process, tek kullanıcı, tool/agent/MCP yok.

**Tech Stack:** Bun runtime, TypeScript (strict), Ink + React, Zod, marked + marked-terminal, ulid, biome, lefthook, `bun:test`, `bun:sqlite`.

**Spec:** `docs/superpowers/specs/2026-04-30-cekirdek-cli-iskeleti-design.md`

**File structure:**
```
Ai-Pacino/
├── src/
│   ├── cli/
│   │   ├── App.tsx                # Root component
│   │   ├── ChatPanel.tsx          # Message list + markdown
│   │   ├── StatusBar.tsx          # model · session · tokens
│   │   ├── InputBar.tsx           # Multi-line input + slash palette
│   │   └── store.ts               # Tiny global state container
│   ├── provider/
│   │   ├── types.ts               # Provider, ChatMessage, StreamChunk, ProviderError
│   │   ├── sse.ts                 # SSE chunk parser
│   │   └── anthropic.ts           # AnthropicProvider implementation
│   ├── session/
│   │   ├── store.ts               # SQLite-backed CRUD
│   │   ├── manager.ts             # SessionManager facade
│   │   └── context.ts             # Token-aware truncation
│   ├── config/
│   │   ├── schema.ts              # Zod schema
│   │   └── loader.ts              # Merge env > project > global
│   ├── auth/
│   │   └── keys.ts                # Resolve API key
│   ├── logging/
│   │   └── logger.ts              # JSONL file logger with rotation
│   ├── commands/
│   │   ├── parser.ts              # Parse slash command line
│   │   ├── registry.ts            # Command registry
│   │   └── builtins.ts            # /help /new /sessions /load /model /clear /debug /quit
│   └── index.ts                   # CLI entry: argv, init, mount Ink
├── tests/
│   ├── provider/
│   ├── session/
│   ├── config/
│   ├── auth/
│   ├── logging/
│   ├── commands/
│   ├── cli/
│   └── integration/
├── package.json
├── tsconfig.json
├── biome.json
├── lefthook.yml
├── .gitignore
└── README.md
```

**Phasing:**
- **Phase 1 (Tasks 1-2):** Repo bootstrap + Ink/Bun POC (validate stack early)
- **Phase 2 (Tasks 3-5):** Logging + Config + Auth (foundation utilities)
- **Phase 3 (Tasks 6-8):** Provider types + SSE parser + Anthropic adapter
- **Phase 4 (Tasks 9-10):** Session store + context manager
- **Phase 5 (Task 11):** Slash command parser & registry
- **Phase 6 (Tasks 12-15):** TUI components (store, ChatPanel, StatusBar, InputBar, App)
- **Phase 7 (Task 16):** Slash command implementations
- **Phase 8 (Tasks 17-18):** Entry point + integration test
- **Phase 9 (Task 19):** README

---

## Phase 1: Bootstrap & Stack Validation

### Task 1: Repo bootstrap

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `biome.json`
- Create: `lefthook.yml`
- Create: `.gitignore`
- Create: `src/.gitkeep`

- [ ] **Step 1: Verify Bun installed**

Run: `bun --version`
Expected: prints version (must be ≥1.1.0). If missing, install from https://bun.sh.

- [ ] **Step 2: Create package.json**

Path: `/Users/sahanhasret/Desktop/Ai-Pacino/package.json`

```json
{
  "name": "aipacino",
  "version": "0.0.1",
  "description": "AI Pacino — terminal AI coding companion",
  "type": "module",
  "module": "src/index.ts",
  "bin": { "aipacino": "./src/index.ts" },
  "scripts": {
    "start": "bun run src/index.ts",
    "dev": "bun --watch run src/index.ts",
    "test": "bun test",
    "test:watch": "bun test --watch",
    "lint": "biome check src tests",
    "format": "biome format --write src tests",
    "build": "bun build src/index.ts --compile --outfile dist/aipacino"
  },
  "dependencies": {
    "ink": "^5.0.1",
    "react": "^18.3.1",
    "zod": "^3.23.8",
    "marked": "^14.1.2",
    "marked-terminal": "^7.1.0",
    "ulid": "^2.3.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "@types/react": "^18.3.10",
    "ink-testing-library": "^4.0.0",
    "lefthook": "^1.7.18"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

Path: `/Users/sahanhasret/Desktop/Ai-Pacino/tsconfig.json`

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowJs": false,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "types": ["bun-types", "react"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 4: Create biome.json**

Path: `/Users/sahanhasret/Desktop/Ai-Pacino/biome.json`

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "files": { "ignore": ["dist", "node_modules"] },
  "formatter": { "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": { "noNonNullAssertion": "off" },
      "suspicious": { "noExplicitAny": "warn" }
    }
  },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "asNeeded" } }
}
```

- [ ] **Step 5: Create lefthook.yml**

Path: `/Users/sahanhasret/Desktop/Ai-Pacino/lefthook.yml`

```yaml
pre-commit:
  parallel: true
  commands:
    biome:
      glob: "*.{ts,tsx,json}"
      run: bunx biome check --no-errors-on-unmatched {staged_files}
    test:
      run: bun test --bail
```

- [ ] **Step 6: Create .gitignore**

Path: `/Users/sahanhasret/Desktop/Ai-Pacino/.gitignore`

```
node_modules/
dist/
*.log
.DS_Store
.env
.env.*
!.env.example
bun.lockb
```

- [ ] **Step 7: Create src dir placeholder**

Run: `mkdir -p src tests && touch src/.gitkeep tests/.gitkeep`

- [ ] **Step 8: Install deps**

Run from `/Users/sahanhasret/Desktop/Ai-Pacino`: `bun install`
Expected: `bun install` completes without errors. `bun.lockb` created.

- [ ] **Step 9: Initialize lefthook**

Run: `bunx lefthook install`
Expected: hooks installed in `.git/hooks/`.

- [ ] **Step 10: Commit**

```bash
cd /Users/sahanhasret/Desktop/Ai-Pacino
git add package.json tsconfig.json biome.json lefthook.yml .gitignore src/.gitkeep tests/.gitkeep bun.lockb
git commit -m "chore: bootstrap bun + ts + ink + biome + lefthook"
```

---

### Task 2: Ink + Bun POC

Validate that Ink renders correctly under Bun before committing to the full TUI build.

**Files:**
- Create: `src/poc.tsx`

- [ ] **Step 1: Write minimal Ink app**

Path: `src/poc.tsx`

```tsx
import { render, Text, Box } from 'ink'
import React from 'react'

const App = () => (
  <Box borderStyle="round" paddingX={1}>
    <Text color="green">AI Pacino POC — Ink + Bun çalışıyor</Text>
  </Box>
)

render(<App />)
setTimeout(() => process.exit(0), 500)
```

- [ ] **Step 2: Run POC**

Run: `bun run src/poc.tsx`
Expected: A bordered box with green text appears for ~500ms then exits cleanly. If it crashes with module errors, Ink/Bun ESM mismatch — try `bun add ink@latest react@latest` and rerun.

- [ ] **Step 3: Delete POC and commit validation**

Run: `rm src/poc.tsx`

```bash
git commit --allow-empty -m "chore: validate ink + bun poc renders correctly"
```

---

## Phase 2: Foundation Utilities

### Task 3: Logging module

**Files:**
- Create: `src/logging/logger.ts`
- Create: `tests/logging/logger.test.ts`

- [ ] **Step 1: Write failing test**

Path: `tests/logging/logger.test.ts`

```ts
import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from '../../src/logging/logger'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aipacino-log-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('logger', () => {
  it('writes a JSONL line to the configured file', () => {
    const file = join(dir, 'app.log')
    const log = createLogger({ level: 'info', file })
    log.info('hello', { foo: 'bar' })
    const contents = readFileSync(file, 'utf8').trim()
    const parsed = JSON.parse(contents)
    expect(parsed.level).toBe('info')
    expect(parsed.msg).toBe('hello')
    expect(parsed.foo).toBe('bar')
    expect(typeof parsed.ts).toBe('number')
  })

  it('skips messages below the configured level', () => {
    const file = join(dir, 'app.log')
    const log = createLogger({ level: 'warn', file })
    log.debug('skip me')
    log.info('skip me')
    log.warn('keep me')
    const contents = existsSync(file) ? readFileSync(file, 'utf8').trim() : ''
    const lines = contents ? contents.split('\n') : []
    expect(lines.length).toBe(1)
    expect(JSON.parse(lines[0]!).msg).toBe('keep me')
  })

  it('appends multiple log lines without overwriting', () => {
    const file = join(dir, 'app.log')
    const log = createLogger({ level: 'info', file })
    log.info('one')
    log.info('two')
    log.info('three')
    const lines = readFileSync(file, 'utf8').trim().split('\n')
    expect(lines.length).toBe(3)
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test tests/logging/logger.test.ts`
Expected: FAIL — module `../../src/logging/logger` does not exist.

- [ ] **Step 3: Implement logger**

Path: `src/logging/logger.ts`

```ts
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void
  info(msg: string, fields?: Record<string, unknown>): void
  warn(msg: string, fields?: Record<string, unknown>): void
  error(msg: string, fields?: Record<string, unknown>): void
}

export interface LoggerOptions {
  level: LogLevel
  file: string
}

export const createLogger = (opts: LoggerOptions): Logger => {
  const threshold = LEVEL_ORDER[opts.level]
  mkdirSync(dirname(opts.file), { recursive: true })

  const write = (level: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (LEVEL_ORDER[level] < threshold) return
    const entry = { ts: Date.now(), level, msg, ...(fields ?? {}) }
    try {
      appendFileSync(opts.file, `${JSON.stringify(entry)}\n`)
    } catch {
      // logger must never throw into the app
    }
  }

  return {
    debug: (msg, f) => write('debug', msg, f),
    info: (msg, f) => write('info', msg, f),
    warn: (msg, f) => write('warn', msg, f),
    error: (msg, f) => write('error', msg, f),
  }
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `bun test tests/logging/logger.test.ts`
Expected: 3 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/logging tests/logging
git commit -m "feat(logging): JSONL file logger with level filtering"
```

---

### Task 4: Config module

**Files:**
- Create: `src/config/schema.ts`
- Create: `src/config/loader.ts`
- Create: `tests/config/loader.test.ts`

- [ ] **Step 1: Write failing test**

Path: `tests/config/loader.test.ts`

```ts
import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
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
```

- [ ] **Step 2: Run, confirm failure**

Run: `bun test tests/config/loader.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement Zod schema**

Path: `src/config/schema.ts`

```ts
import { z } from 'zod'

export const ConfigSchema = z.object({
  version: z.literal(1).default(1),
  defaultModel: z.string().default('claude-sonnet-4-6'),
  maxTokens: z.number().int().positive().default(8192),
  anthropic: z
    .object({
      apiKey: z.string().optional(),
      baseUrl: z.string().url().default('https://api.anthropic.com'),
    })
    .default({}),
  ui: z
    .object({
      theme: z.enum(['dark', 'light']).default('dark'),
      markdown: z.boolean().default(true),
    })
    .default({}),
  logging: z
    .object({
      level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
      file: z.string().optional(),
    })
    .default({}),
})

export type Config = z.infer<typeof ConfigSchema>
```

- [ ] **Step 4: Implement loader**

Path: `src/config/loader.ts`

```ts
import { existsSync, readFileSync } from 'node:fs'
import { ConfigSchema, type Config } from './schema'

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

const deepMerge = <T extends Record<string, unknown>>(base: T, over: Record<string, unknown>): T => {
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
    throw new Error(
      `Config validation failed at ${issue.path.join('.')}: ${issue.message}`,
    )
  }
  return result.data
}
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `bun test tests/config/loader.test.ts`
Expected: 7 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add src/config tests/config
git commit -m "feat(config): zod-validated config loader with env/project/global merge"
```

---

### Task 5: Auth module

**Files:**
- Create: `src/auth/keys.ts`
- Create: `tests/auth/keys.test.ts`

- [ ] **Step 1: Write failing test**

Path: `tests/auth/keys.test.ts`

```ts
import { describe, expect, it } from 'bun:test'
import { resolveAnthropicKey, MissingApiKeyError } from '../../src/auth/keys'

describe('resolveAnthropicKey', () => {
  it('returns config key when present', () => {
    expect(resolveAnthropicKey({ anthropic: { apiKey: 'sk-cfg', baseUrl: '' } } as never)).toBe(
      'sk-cfg',
    )
  })

  it('throws MissingApiKeyError when no key', () => {
    expect(() =>
      resolveAnthropicKey({ anthropic: { apiKey: undefined, baseUrl: '' } } as never),
    ).toThrow(MissingApiKeyError)
  })

  it('error message tells the user how to fix it', () => {
    try {
      resolveAnthropicKey({ anthropic: { apiKey: undefined, baseUrl: '' } } as never)
    } catch (err) {
      const message = (err as Error).message
      expect(message).toContain('ANTHROPIC_API_KEY')
      expect(message).toContain('config.json')
    }
  })
})
```

- [ ] **Step 2: Run, confirm failure**

Run: `bun test tests/auth/keys.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Path: `src/auth/keys.ts`

```ts
import type { Config } from '../config/schema'

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      'Anthropic API key not found.\n' +
        'Set ANTHROPIC_API_KEY environment variable, or add\n' +
        '  { "anthropic": { "apiKey": "sk-..." } }\n' +
        'to ~/.config/aipacino/config.json or .aipacino/config.json in your project.',
    )
    this.name = 'MissingApiKeyError'
  }
}

export const resolveAnthropicKey = (config: Config): string => {
  const key = config.anthropic.apiKey
  if (!key || key.trim().length === 0) {
    throw new MissingApiKeyError()
  }
  return key
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `bun test tests/auth/keys.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add src/auth tests/auth
git commit -m "feat(auth): resolve anthropic api key with helpful missing-key error"
```

---

## Phase 3: Provider Layer

### Task 6: Provider types & errors

**Files:**
- Create: `src/provider/types.ts`

- [ ] **Step 1: Write types module (no test — types only)**

Path: `src/provider/types.ts`

```ts
export type Role = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  role: Role
  content: string
}

export type StreamChunk =
  | { type: 'text'; text: string }
  | { type: 'usage'; input: number; output: number }
  | { type: 'done' }
  | { type: 'error'; error: ProviderError }

export type ProviderErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'network'
  | 'invalid_request'
  | 'server'
  | 'aborted'

export class ProviderError extends Error {
  constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly retryable: boolean,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

export interface StreamOptions {
  model: string
  messages: ChatMessage[]
  system?: string
  maxTokens: number
  signal?: AbortSignal
}

export interface Provider {
  readonly name: string
  streamMessage(opts: StreamOptions): AsyncIterable<StreamChunk>
  countTokens(text: string, model: string): Promise<number>
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/provider/types.ts
git commit -m "feat(provider): define provider interface, message types, error class"
```

---

### Task 7: SSE parser

**Files:**
- Create: `src/provider/sse.ts`
- Create: `tests/provider/sse.test.ts`

- [ ] **Step 1: Write failing test**

Path: `tests/provider/sse.test.ts`

```ts
import { describe, expect, it } from 'bun:test'
import { parseSseStream } from '../../src/provider/sse'

const enc = (s: string) => new TextEncoder().encode(s)

const stream = (chunks: string[]): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc(ch))
      c.close()
    },
  })

describe('parseSseStream', () => {
  it('parses a single complete event', async () => {
    const events: { event?: string; data: string }[] = []
    for await (const e of parseSseStream(stream(['event: ping\ndata: hello\n\n']))) {
      events.push(e)
    }
    expect(events).toEqual([{ event: 'ping', data: 'hello' }])
  })

  it('parses event with no event name (data only)', async () => {
    const events: { event?: string; data: string }[] = []
    for await (const e of parseSseStream(stream(['data: bare\n\n']))) {
      events.push(e)
    }
    expect(events).toEqual([{ event: undefined, data: 'bare' }])
  })

  it('joins partial chunks across boundaries', async () => {
    const events: { event?: string; data: string }[] = []
    for await (const e of parseSseStream(
      stream(['event: a\nda', 'ta: split\n\nevent: b\ndata: ', 'second\n\n']),
    )) {
      events.push(e)
    }
    expect(events).toEqual([
      { event: 'a', data: 'split' },
      { event: 'b', data: 'second' },
    ])
  })

  it('handles multi-line data fields by joining with newline', async () => {
    const events: { event?: string; data: string }[] = []
    for await (const e of parseSseStream(stream(['data: line1\ndata: line2\n\n']))) {
      events.push(e)
    }
    expect(events).toEqual([{ event: undefined, data: 'line1\nline2' }])
  })

  it('skips comment lines starting with colon', async () => {
    const events: { event?: string; data: string }[] = []
    for await (const e of parseSseStream(stream([': keepalive\nevent: x\ndata: y\n\n']))) {
      events.push(e)
    }
    expect(events).toEqual([{ event: 'x', data: 'y' }])
  })
})
```

- [ ] **Step 2: Run, confirm failure**

Run: `bun test tests/provider/sse.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement parser**

Path: `src/provider/sse.ts`

```ts
export interface SseEvent {
  event?: string
  data: string
}

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (value) buffer += decoder.decode(value, { stream: true })
      if (done) {
        buffer += decoder.decode()
        if (buffer.length > 0) {
          const ev = parseEvent(buffer)
          if (ev) yield ev
        }
        return
      }

      let idx: number
      while ((idx = indexOfBoundary(buffer)) !== -1) {
        const raw = buffer.slice(0, idx)
        buffer = buffer.slice(idx).replace(/^(\r?\n){2}/, '')
        const ev = parseEvent(raw)
        if (ev) yield ev
      }
    }
  } finally {
    reader.releaseLock()
  }
}

const indexOfBoundary = (buf: string): number => {
  const a = buf.indexOf('\n\n')
  const b = buf.indexOf('\r\n\r\n')
  if (a === -1) return b
  if (b === -1) return a
  return Math.min(a, b)
}

const parseEvent = (raw: string): SseEvent | null => {
  let event: string | undefined
  const dataParts: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (line.length === 0 || line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '')
    if (field === 'event') event = value
    else if (field === 'data') dataParts.push(value)
  }
  if (dataParts.length === 0 && event === undefined) return null
  return { event, data: dataParts.join('\n') }
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `bun test tests/provider/sse.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add src/provider/sse.ts tests/provider/sse.test.ts
git commit -m "feat(provider): SSE stream parser handling partial chunks and multi-line data"
```

---

### Task 8: Anthropic adapter

**Files:**
- Create: `src/provider/anthropic.ts`
- Create: `tests/provider/anthropic.test.ts`

- [ ] **Step 1: Write failing test**

Path: `tests/provider/anthropic.test.ts`

```ts
import { describe, expect, it, beforeEach, afterEach, mock } from 'bun:test'
import { AnthropicProvider } from '../../src/provider/anthropic'
import { ProviderError, type StreamChunk } from '../../src/provider/types'

const mockSseResponse = (events: string[]): Response => {
  const body = events
    .map((e) => `event: ${e.split('|')[0]}\ndata: ${e.split('|')[1]}\n\n`)
    .join('')
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

const collect = async (iter: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> => {
  const out: StreamChunk[] = []
  for await (const c of iter) out.push(c)
  return out
}

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('AnthropicProvider', () => {
  it('streams text deltas and emits done on message_stop', async () => {
    const events = [
      `message_start|${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 5, output_tokens: 0 } } })}`,
      `content_block_delta|${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } })}`,
      `content_block_delta|${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } })}`,
      `message_delta|${JSON.stringify({ type: 'message_delta', usage: { output_tokens: 7 } })}`,
      `message_stop|${JSON.stringify({ type: 'message_stop' })}`,
    ]
    globalThis.fetch = mock(async () => mockSseResponse(events)) as never

    const p = new AnthropicProvider({ apiKey: 'sk-test', baseUrl: 'https://api.anthropic.com' })
    const chunks = await collect(
      p.streamMessage({
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 100,
      }),
    )

    const texts = chunks.filter((c) => c.type === 'text').map((c) => (c as { text: string }).text)
    expect(texts.join('')).toBe('Hello')
    expect(chunks.find((c) => c.type === 'usage')).toBeDefined()
    expect(chunks[chunks.length - 1]!.type).toBe('done')
  })

  it('emits error chunk on 401', async () => {
    globalThis.fetch = mock(
      async () => new Response('{"error":{"message":"invalid key"}}', { status: 401 }),
    ) as never
    const p = new AnthropicProvider({ apiKey: 'bad', baseUrl: 'https://api.anthropic.com' })
    const chunks = await collect(
      p.streamMessage({
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 100,
      }),
    )
    const errChunk = chunks.find((c) => c.type === 'error')
    expect(errChunk).toBeDefined()
    expect((errChunk as { error: ProviderError }).error.kind).toBe('auth')
    expect((errChunk as { error: ProviderError }).error.retryable).toBe(false)
  })

  it('retries on 429 with backoff and eventually succeeds', async () => {
    let calls = 0
    const okEvents = [
      `content_block_delta|${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok' } })}`,
      `message_stop|${JSON.stringify({ type: 'message_stop' })}`,
    ]
    globalThis.fetch = mock(async () => {
      calls += 1
      if (calls < 2) return new Response('{"error":{"message":"rate"}}', { status: 429 })
      return mockSseResponse(okEvents)
    }) as never

    const p = new AnthropicProvider({
      apiKey: 'sk-test',
      baseUrl: 'https://api.anthropic.com',
      retryBaseMs: 1,
    })
    const chunks = await collect(
      p.streamMessage({
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 100,
      }),
    )
    expect(calls).toBe(2)
    expect(chunks.some((c) => c.type === 'text')).toBe(true)
    expect(chunks[chunks.length - 1]!.type).toBe('done')
  })

  it('emits error after max retries on persistent 5xx', async () => {
    globalThis.fetch = mock(
      async () => new Response('{"error":{"message":"boom"}}', { status: 500 }),
    ) as never
    const p = new AnthropicProvider({
      apiKey: 'sk-test',
      baseUrl: 'https://api.anthropic.com',
      retryBaseMs: 1,
      maxRetries: 2,
    })
    const chunks = await collect(
      p.streamMessage({
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 100,
      }),
    )
    const errChunk = chunks.find((c) => c.type === 'error')
    expect(errChunk).toBeDefined()
    expect((errChunk as { error: ProviderError }).error.kind).toBe('server')
  })
})
```

- [ ] **Step 2: Run, confirm failure**

Run: `bun test tests/provider/anthropic.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement adapter**

Path: `src/provider/anthropic.ts`

```ts
import { parseSseStream } from './sse'
import {
  ProviderError,
  type Provider,
  type StreamChunk,
  type StreamOptions,
} from './types'

export interface AnthropicProviderOptions {
  apiKey: string
  baseUrl: string
  maxRetries?: number
  retryBaseMs?: number
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])

export class AnthropicProvider implements Provider {
  readonly name = 'anthropic'
  private readonly opts: Required<AnthropicProviderOptions>

  constructor(opts: AnthropicProviderOptions) {
    this.opts = {
      maxRetries: 3,
      retryBaseMs: 250,
      ...opts,
    }
  }

  async *streamMessage(opts: StreamOptions): AsyncIterable<StreamChunk> {
    const url = `${this.opts.baseUrl}/v1/messages`
    const body = JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      stream: true,
      system: opts.system,
      messages: opts.messages.filter((m) => m.role !== 'system'),
    })

    let attempt = 0
    let lastError: ProviderError | null = null

    while (attempt <= this.opts.maxRetries) {
      let response: Response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': this.opts.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body,
          signal: opts.signal,
        })
      } catch (err) {
        lastError = new ProviderError(
          (err as Error).name === 'AbortError' ? 'aborted' : 'network',
          (err as Error).message,
          (err as Error).name !== 'AbortError',
          err,
        )
        if (!lastError.retryable || attempt >= this.opts.maxRetries) {
          yield { type: 'error', error: lastError }
          return
        }
        await sleep(this.opts.retryBaseMs * 2 ** attempt)
        attempt += 1
        continue
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        const kind = mapStatusToKind(response.status)
        const retryable = RETRYABLE_STATUS.has(response.status)
        lastError = new ProviderError(
          kind,
          `Anthropic API ${response.status}: ${text || response.statusText}`,
          retryable,
        )
        if (!retryable || attempt >= this.opts.maxRetries) {
          yield { type: 'error', error: lastError }
          return
        }
        await sleep(this.opts.retryBaseMs * 2 ** attempt)
        attempt += 1
        continue
      }

      if (!response.body) {
        yield {
          type: 'error',
          error: new ProviderError('server', 'Empty response body', false),
        }
        return
      }

      yield* this.consumeStream(response.body)
      return
    }

    if (lastError) yield { type: 'error', error: lastError }
  }

  async countTokens(text: string, model: string): Promise<number> {
    try {
      const res = await fetch(`${this.opts.baseUrl}/v1/messages/count_tokens`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.opts.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: text }],
        }),
      })
      if (!res.ok) return Math.ceil(text.length / 4)
      const data = (await res.json()) as { input_tokens?: number }
      return data.input_tokens ?? Math.ceil(text.length / 4)
    } catch {
      return Math.ceil(text.length / 4)
    }
  }

  private async *consumeStream(
    body: ReadableStream<Uint8Array>,
  ): AsyncIterable<StreamChunk> {
    let inputTokens = 0
    let outputTokens = 0
    let usageEmitted = false

    try {
      for await (const ev of parseSseStream(body)) {
        if (!ev.data) continue
        let payload: Record<string, unknown>
        try {
          payload = JSON.parse(ev.data) as Record<string, unknown>
        } catch {
          continue
        }
        const type = payload.type as string

        if (type === 'message_start') {
          const usage = ((payload.message as Record<string, unknown> | undefined)
            ?.usage as { input_tokens?: number; output_tokens?: number } | undefined)
          if (usage?.input_tokens) inputTokens = usage.input_tokens
          if (usage?.output_tokens) outputTokens = usage.output_tokens
        } else if (type === 'content_block_delta') {
          const delta = payload.delta as { type?: string; text?: string } | undefined
          if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
            yield { type: 'text', text: delta.text }
          }
        } else if (type === 'message_delta') {
          const usage = payload.usage as { output_tokens?: number } | undefined
          if (usage?.output_tokens != null) outputTokens = usage.output_tokens
        } else if (type === 'message_stop') {
          if (!usageEmitted) {
            yield { type: 'usage', input: inputTokens, output: outputTokens }
            usageEmitted = true
          }
          yield { type: 'done' }
          return
        }
      }
      if (!usageEmitted) yield { type: 'usage', input: inputTokens, output: outputTokens }
      yield { type: 'done' }
    } catch (err) {
      yield {
        type: 'error',
        error: new ProviderError(
          (err as Error).name === 'AbortError' ? 'aborted' : 'network',
          (err as Error).message,
          false,
          err,
        ),
      }
    }
  }
}

const mapStatusToKind = (status: number): ProviderError['kind'] => {
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate_limit'
  if (status >= 400 && status < 500) return 'invalid_request'
  return 'server'
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `bun test tests/provider/anthropic.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add src/provider/anthropic.ts tests/provider/anthropic.test.ts
git commit -m "feat(provider): anthropic streaming adapter with retry and error normalization"
```

---

## Phase 4: Session

### Task 9: SQLite session store

**Files:**
- Create: `src/session/store.ts`
- Create: `tests/session/store.test.ts`

- [ ] **Step 1: Write failing test**

Path: `tests/session/store.test.ts`

```ts
import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSessionStore, type SessionStore } from '../../src/session/store'

let dir: string
let store: SessionStore

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aipacino-sess-'))
  store = createSessionStore(join(dir, 'sessions.db'))
})

afterEach(() => {
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('SessionStore', () => {
  it('creates and retrieves a session', () => {
    const s = store.createSession({ title: 'first', model: 'claude-sonnet-4-6' })
    const fetched = store.getSession(s.id)
    expect(fetched?.title).toBe('first')
    expect(fetched?.model).toBe('claude-sonnet-4-6')
  })

  it('appends and lists messages in insertion order', () => {
    const s = store.createSession({ title: 't', model: 'm' })
    store.appendMessage(s.id, { role: 'user', content: 'first' })
    store.appendMessage(s.id, { role: 'assistant', content: 'second' })
    store.appendMessage(s.id, { role: 'user', content: 'third' })
    const msgs = store.getMessages(s.id)
    expect(msgs.map((m) => m.content)).toEqual(['first', 'second', 'third'])
  })

  it('lists sessions sorted by updated_at desc', async () => {
    const a = store.createSession({ title: 'A', model: 'm' })
    await new Promise((r) => setTimeout(r, 5))
    const b = store.createSession({ title: 'B', model: 'm' })
    await new Promise((r) => setTimeout(r, 5))
    store.appendMessage(a.id, { role: 'user', content: 'bump A' })
    const list = store.listSessions({ limit: 10 })
    expect(list[0]!.id).toBe(a.id)
    expect(list[1]!.id).toBe(b.id)
  })

  it('updateUsage stores token counts on message', () => {
    const s = store.createSession({ title: 't', model: 'm' })
    const m = store.appendMessage(s.id, { role: 'assistant', content: 'hi' })
    store.updateUsage(m.id, { input: 12, output: 7 })
    const msgs = store.getMessages(s.id)
    expect(msgs[0]!.tokensIn).toBe(12)
    expect(msgs[0]!.tokensOut).toBe(7)
  })

  it('cascade-deletes messages when session deleted', () => {
    const s = store.createSession({ title: 't', model: 'm' })
    store.appendMessage(s.id, { role: 'user', content: 'hi' })
    store.deleteSession(s.id)
    expect(store.getSession(s.id)).toBeNull()
    expect(store.getMessages(s.id)).toEqual([])
  })

  it('updateSession renames title and model', () => {
    const s = store.createSession({ title: 'old', model: 'a' })
    store.updateSession(s.id, { title: 'new', model: 'b' })
    const fetched = store.getSession(s.id)
    expect(fetched?.title).toBe('new')
    expect(fetched?.model).toBe('b')
  })
})
```

- [ ] **Step 2: Run, confirm failure**

Run: `bun test tests/session/store.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement store**

Path: `src/session/store.ts`

```ts
import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { ulid } from 'ulid'
import type { Role } from '../provider/types'

export interface Session {
  id: string
  title: string
  model: string
  createdAt: number
  updatedAt: number
  archived: boolean
}

export interface StoredMessage {
  id: string
  sessionId: string
  role: Role
  content: string
  tokensIn: number | null
  tokensOut: number | null
  createdAt: number
}

export interface SessionStore {
  createSession(input: { title: string; model: string }): Session
  getSession(id: string): Session | null
  listSessions(opts?: { limit?: number; archived?: boolean }): Session[]
  updateSession(id: string, patch: Partial<Pick<Session, 'title' | 'model' | 'archived'>>): void
  deleteSession(id: string): void
  appendMessage(sessionId: string, msg: { role: Role; content: string }): StoredMessage
  getMessages(sessionId: string): StoredMessage[]
  updateUsage(messageId: string, usage: { input: number; output: number }): void
  close(): void
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  model       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  archived    INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS messages (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content      TEXT NOT NULL,
  tokens_in    INTEGER,
  tokens_out   INTEGER,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
`

interface SessionRow {
  id: string
  title: string
  model: string
  created_at: number
  updated_at: number
  archived: number
}

interface MessageRow {
  id: string
  session_id: string
  role: Role
  content: string
  tokens_in: number | null
  tokens_out: number | null
  created_at: number
}

export const createSessionStore = (dbPath: string): SessionStore => {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA foreign_keys = ON;')
  for (const stmt of SCHEMA.split(';')) {
    const trimmed = stmt.trim()
    if (trimmed) db.exec(`${trimmed};`)
  }

  const toSession = (r: SessionRow): Session => ({
    id: r.id,
    title: r.title,
    model: r.model,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archived: r.archived === 1,
  })

  const toMessage = (r: MessageRow): StoredMessage => ({
    id: r.id,
    sessionId: r.session_id,
    role: r.role,
    content: r.content,
    tokensIn: r.tokens_in,
    tokensOut: r.tokens_out,
    createdAt: r.created_at,
  })

  return {
    createSession({ title, model }) {
      const id = ulid()
      const now = Date.now()
      db.prepare(
        'INSERT INTO sessions (id, title, model, created_at, updated_at, archived) VALUES (?, ?, ?, ?, ?, 0)',
      ).run(id, title, model, now, now)
      return { id, title, model, createdAt: now, updatedAt: now, archived: false }
    },
    getSession(id) {
      const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined
      return row ? toSession(row) : null
    },
    listSessions(opts) {
      const limit = opts?.limit ?? 20
      const archived = opts?.archived ?? false
      const rows = db
        .prepare(
          'SELECT * FROM sessions WHERE archived = ? ORDER BY updated_at DESC LIMIT ?',
        )
        .all(archived ? 1 : 0, limit) as SessionRow[]
      return rows.map(toSession)
    },
    updateSession(id, patch) {
      const sets: string[] = []
      const params: unknown[] = []
      if (patch.title !== undefined) {
        sets.push('title = ?')
        params.push(patch.title)
      }
      if (patch.model !== undefined) {
        sets.push('model = ?')
        params.push(patch.model)
      }
      if (patch.archived !== undefined) {
        sets.push('archived = ?')
        params.push(patch.archived ? 1 : 0)
      }
      sets.push('updated_at = ?')
      params.push(Date.now())
      params.push(id)
      db.prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    },
    deleteSession(id) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
    },
    appendMessage(sessionId, msg) {
      const id = ulid()
      const now = Date.now()
      db.prepare(
        'INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(id, sessionId, msg.role, msg.content, now)
      db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, sessionId)
      return {
        id,
        sessionId,
        role: msg.role,
        content: msg.content,
        tokensIn: null,
        tokensOut: null,
        createdAt: now,
      }
    },
    getMessages(sessionId) {
      const rows = db
        .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC')
        .all(sessionId) as MessageRow[]
      return rows.map(toMessage)
    },
    updateUsage(messageId, usage) {
      db.prepare('UPDATE messages SET tokens_in = ?, tokens_out = ? WHERE id = ?').run(
        usage.input,
        usage.output,
        messageId,
      )
    },
    close() {
      db.close()
    },
  }
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `bun test tests/session/store.test.ts`
Expected: 6 pass.

- [ ] **Step 5: Commit**

```bash
git add src/session/store.ts tests/session/store.test.ts
git commit -m "feat(session): SQLite-backed session and message store with cascade delete"
```

---

### Task 10: Context window manager

**Files:**
- Create: `src/session/context.ts`
- Create: `tests/session/context.test.ts`

- [ ] **Step 1: Write failing test**

Path: `tests/session/context.test.ts`

```ts
import { describe, expect, it } from 'bun:test'
import { truncateForContext } from '../../src/session/context'
import type { ChatMessage } from '../../src/provider/types'

const make = (n: number): ChatMessage[] =>
  Array.from({ length: n }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: 'x'.repeat(400), // ~100 tokens at 4 chars/token
  }))

describe('truncateForContext', () => {
  it('returns all messages when under threshold', () => {
    const msgs = make(5) // ~500 tokens
    const { messages, truncated } = truncateForContext(msgs, {
      contextWindow: 10000,
      reserveOutput: 1000,
    })
    expect(messages.length).toBe(5)
    expect(truncated).toBe(0)
  })

  it('truncates oldest messages and prepends a notice when over threshold', () => {
    const msgs = make(50) // ~5000 tokens
    const { messages, truncated } = truncateForContext(msgs, {
      contextWindow: 1000,
      reserveOutput: 200,
    })
    expect(truncated).toBeGreaterThan(0)
    expect(messages[0]!.role).toBe('system')
    expect(messages[0]!.content).toMatch(/earlier conversation truncated/i)
    // Newest message preserved
    expect(messages[messages.length - 1]!.content).toBe(msgs[msgs.length - 1]!.content)
  })

  it('always preserves the most recent message even if huge', () => {
    const huge: ChatMessage = { role: 'user', content: 'x'.repeat(20000) }
    const { messages } = truncateForContext([huge], {
      contextWindow: 100,
      reserveOutput: 10,
    })
    expect(messages[messages.length - 1]).toBe(huge)
  })
})
```

- [ ] **Step 2: Run, confirm failure**

Run: `bun test tests/session/context.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement context manager**

Path: `src/session/context.ts`

```ts
import type { ChatMessage } from '../provider/types'

export interface ContextOptions {
  contextWindow: number
  reserveOutput: number
}

export interface TruncationResult {
  messages: ChatMessage[]
  truncated: number
}

const estimateTokens = (text: string): number => Math.ceil(text.length / 4)

export const truncateForContext = (
  messages: ChatMessage[],
  opts: ContextOptions,
): TruncationResult => {
  const budget = opts.contextWindow - opts.reserveOutput
  if (budget <= 0 || messages.length === 0) return { messages, truncated: 0 }

  let total = 0
  const reversed: ChatMessage[] = []
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    const tokens = estimateTokens(m.content)
    if (i === messages.length - 1) {
      reversed.push(m)
      total += tokens
      continue
    }
    if (total + tokens > budget) break
    reversed.push(m)
    total += tokens
  }
  reversed.reverse()

  const truncated = messages.length - reversed.length
  if (truncated === 0) return { messages: reversed, truncated: 0 }

  const notice: ChatMessage = {
    role: 'system',
    content: `[${truncated} earlier conversation message(s) truncated to fit context window]`,
  }
  return { messages: [notice, ...reversed], truncated }
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `bun test tests/session/context.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add src/session/context.ts tests/session/context.test.ts
git commit -m "feat(session): token-aware context window truncation"
```

---

## Phase 5: Slash Commands

### Task 11: Command parser & registry

**Files:**
- Create: `src/commands/parser.ts`
- Create: `src/commands/registry.ts`
- Create: `tests/commands/parser.test.ts`
- Create: `tests/commands/registry.test.ts`

- [ ] **Step 1: Write failing parser test**

Path: `tests/commands/parser.test.ts`

```ts
import { describe, expect, it } from 'bun:test'
import { parseCommand } from '../../src/commands/parser'

describe('parseCommand', () => {
  it('returns null for non-slash input', () => {
    expect(parseCommand('hello world')).toBeNull()
    expect(parseCommand('   /not at start')).toBeNull()
    expect(parseCommand('')).toBeNull()
  })

  it('parses bare command with no args', () => {
    expect(parseCommand('/help')).toEqual({ name: 'help', args: [] })
  })

  it('parses command with whitespace-separated args', () => {
    expect(parseCommand('/load 01HXY')).toEqual({ name: 'load', args: ['01HXY'] })
    expect(parseCommand('/model claude-opus-4-7')).toEqual({
      name: 'model',
      args: ['claude-opus-4-7'],
    })
  })

  it('preserves quoted args with spaces', () => {
    expect(parseCommand('/new "long session title"')).toEqual({
      name: 'new',
      args: ['long session title'],
    })
  })

  it('lowercases command name', () => {
    expect(parseCommand('/HELP')).toEqual({ name: 'help', args: [] })
  })
})
```

- [ ] **Step 2: Implement parser**

Path: `src/commands/parser.ts`

```ts
export interface ParsedCommand {
  name: string
  args: string[]
}

export const parseCommand = (input: string): ParsedCommand | null => {
  if (!input.startsWith('/')) return null
  const rest = input.slice(1).trim()
  if (rest.length === 0) return null
  const tokens = tokenize(rest)
  if (tokens.length === 0) return null
  const [name, ...args] = tokens
  return { name: name!.toLowerCase(), args }
}

const tokenize = (input: string): string[] => {
  const out: string[] = []
  let cur = ''
  let quote: string | null = null
  for (const ch of input) {
    if (quote) {
      if (ch === quote) {
        quote = null
      } else {
        cur += ch
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === ' ' || ch === '\t') {
      if (cur.length > 0) {
        out.push(cur)
        cur = ''
      }
      continue
    }
    cur += ch
  }
  if (cur.length > 0) out.push(cur)
  return out
}
```

- [ ] **Step 3: Run parser tests, confirm pass**

Run: `bun test tests/commands/parser.test.ts`
Expected: 5 pass.

- [ ] **Step 4: Write failing registry test**

Path: `tests/commands/registry.test.ts`

```ts
import { describe, expect, it } from 'bun:test'
import { createRegistry, type Command } from '../../src/commands/registry'

const makeCmd = (name: string): Command => ({
  name,
  description: `${name} command`,
  run: async () => {
    /* noop */
  },
})

describe('CommandRegistry', () => {
  it('registers and looks up by name', () => {
    const reg = createRegistry()
    reg.register(makeCmd('help'))
    expect(reg.get('help')?.name).toBe('help')
  })

  it('returns undefined for unknown command', () => {
    const reg = createRegistry()
    expect(reg.get('nope')).toBeUndefined()
  })

  it('list returns all registered commands sorted by name', () => {
    const reg = createRegistry()
    reg.register(makeCmd('zeta'))
    reg.register(makeCmd('alpha'))
    reg.register(makeCmd('mid'))
    expect(reg.list().map((c) => c.name)).toEqual(['alpha', 'mid', 'zeta'])
  })

  it('throws on duplicate registration', () => {
    const reg = createRegistry()
    reg.register(makeCmd('help'))
    expect(() => reg.register(makeCmd('help'))).toThrow(/already registered/)
  })
})
```

- [ ] **Step 5: Implement registry**

Path: `src/commands/registry.ts`

```ts
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
```

- [ ] **Step 6: Run registry tests, confirm pass**

Run: `bun test tests/commands/registry.test.ts`
Expected: 4 pass.

- [ ] **Step 7: Commit**

```bash
git add src/commands tests/commands
git commit -m "feat(commands): slash command parser and registry"
```

---

## Phase 6: TUI Components

### Task 12: State store

**Files:**
- Create: `src/cli/store.ts`
- Create: `tests/cli/store.test.ts`

- [ ] **Step 1: Write failing test**

Path: `tests/cli/store.test.ts`

```ts
import { describe, expect, it } from 'bun:test'
import { createAppStore } from '../../src/cli/store'

describe('app store', () => {
  it('starts with empty messages and no streaming text', () => {
    const store = createAppStore({
      currentSessionId: 'sess-1',
      currentModel: 'm',
    })
    const s = store.getState()
    expect(s.messages).toEqual([])
    expect(s.streamingText).toBe('')
  })

  it('appendMessage adds and notifies subscribers', () => {
    const store = createAppStore({ currentSessionId: 'sess-1', currentModel: 'm' })
    let notified = 0
    const unsub = store.subscribe(() => {
      notified += 1
    })
    store.appendMessage({ role: 'user', content: 'hi' })
    expect(store.getState().messages.length).toBe(1)
    expect(notified).toBe(1)
    unsub()
  })

  it('streaming append concatenates text and clears on finalize', () => {
    const store = createAppStore({ currentSessionId: 'sess-1', currentModel: 'm' })
    store.appendStreaming('Hel')
    store.appendStreaming('lo')
    expect(store.getState().streamingText).toBe('Hello')
    store.finalizeStreaming()
    expect(store.getState().streamingText).toBe('')
    expect(store.getState().messages[0]).toEqual({ role: 'assistant', content: 'Hello' })
  })

  it('setStatusMessage updates status field', () => {
    const store = createAppStore({ currentSessionId: 'sess-1', currentModel: 'm' })
    store.setStatusMessage('hello')
    expect(store.getState().statusMessage).toBe('hello')
  })
})
```

- [ ] **Step 2: Implement store**

Path: `src/cli/store.ts`

```ts
import type { ChatMessage } from '../provider/types'

export interface AppState {
  currentSessionId: string
  currentModel: string
  messages: ChatMessage[]
  streamingText: string
  statusMessage: string
  tokenUsage: { input: number; output: number; window: number }
  busy: boolean
}

export interface AppStore {
  getState(): AppState
  subscribe(fn: () => void): () => void
  appendMessage(m: ChatMessage): void
  appendStreaming(text: string): void
  finalizeStreaming(): void
  setMessages(messages: ChatMessage[]): void
  setStatusMessage(msg: string): void
  setBusy(busy: boolean): void
  setTokenUsage(u: { input: number; output: number; window: number }): void
  setSession(id: string, model: string, messages: ChatMessage[]): void
}

export interface AppStoreInit {
  currentSessionId: string
  currentModel: string
  contextWindow?: number
}

export const createAppStore = (init: AppStoreInit): AppStore => {
  let state: AppState = {
    currentSessionId: init.currentSessionId,
    currentModel: init.currentModel,
    messages: [],
    streamingText: '',
    statusMessage: '',
    tokenUsage: { input: 0, output: 0, window: init.contextWindow ?? 200_000 },
    busy: false,
  }
  const subs = new Set<() => void>()
  const notify = () => {
    for (const s of subs) s()
  }
  const set = (patch: Partial<AppState>) => {
    state = { ...state, ...patch }
    notify()
  }
  return {
    getState: () => state,
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    appendMessage(m) {
      set({ messages: [...state.messages, m] })
    },
    appendStreaming(text) {
      set({ streamingText: state.streamingText + text })
    },
    finalizeStreaming() {
      const text = state.streamingText
      const msgs =
        text.length > 0
          ? [...state.messages, { role: 'assistant' as const, content: text }]
          : state.messages
      set({ messages: msgs, streamingText: '' })
    },
    setMessages(messages) {
      set({ messages })
    },
    setStatusMessage(msg) {
      set({ statusMessage: msg })
    },
    setBusy(busy) {
      set({ busy })
    },
    setTokenUsage(u) {
      set({ tokenUsage: u })
    },
    setSession(id, model, messages) {
      set({ currentSessionId: id, currentModel: model, messages, streamingText: '' })
    },
  }
}
```

- [ ] **Step 3: Run, confirm pass**

Run: `bun test tests/cli/store.test.ts`
Expected: 4 pass.

- [ ] **Step 4: Commit**

```bash
git add src/cli/store.ts tests/cli/store.test.ts
git commit -m "feat(cli): app state store with subscription model"
```

---

### Task 13: ChatPanel and StatusBar components

**Files:**
- Create: `src/cli/markdown.ts`
- Create: `src/cli/ChatPanel.tsx`
- Create: `src/cli/StatusBar.tsx`
- Create: `tests/cli/ChatPanel.test.tsx`
- Create: `tests/cli/StatusBar.test.tsx`

- [ ] **Step 1: Implement markdown renderer helper**

Path: `src/cli/markdown.ts`

```ts
import { marked } from 'marked'
import { markedTerminal } from 'marked-terminal'

const renderer = marked.use(
  markedTerminal({
    width: 100,
    reflowText: true,
    tab: 2,
    showSectionPrefix: false,
  }) as never,
)

export const renderMarkdown = (md: string): string => {
  try {
    return (renderer.parse(md) as string).trimEnd()
  } catch {
    return md
  }
}
```

- [ ] **Step 2: Write failing ChatPanel test**

Path: `tests/cli/ChatPanel.test.tsx`

```tsx
import { describe, expect, it } from 'bun:test'
import { render } from 'ink-testing-library'
import React from 'react'
import { ChatPanel } from '../../src/cli/ChatPanel'

describe('ChatPanel', () => {
  it('renders empty placeholder when no messages', () => {
    const { lastFrame } = render(<ChatPanel messages={[]} streamingText="" />)
    expect(lastFrame()).toMatch(/start a conversation/i)
  })

  it('renders user and assistant messages with role labels', () => {
    const { lastFrame } = render(
      <ChatPanel
        messages={[
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' },
        ]}
        streamingText=""
      />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toMatch(/you/i)
    expect(frame).toMatch(/hello/i)
    expect(frame).toMatch(/claude/i)
    expect(frame).toMatch(/hi there/i)
  })

  it('renders streaming text below messages', () => {
    const { lastFrame } = render(
      <ChatPanel
        messages={[{ role: 'user', content: 'q' }]}
        streamingText="streaming response"
      />,
    )
    expect(lastFrame()).toMatch(/streaming response/)
  })
})
```

- [ ] **Step 3: Implement ChatPanel**

Path: `src/cli/ChatPanel.tsx`

```tsx
import { Box, Text } from 'ink'
import React from 'react'
import type { ChatMessage } from '../provider/types'
import { renderMarkdown } from './markdown'

interface Props {
  messages: ChatMessage[]
  streamingText: string
}

const roleLabel = (role: ChatMessage['role']): { label: string; color: string } => {
  if (role === 'user') return { label: 'you', color: 'cyan' }
  if (role === 'assistant') return { label: 'claude', color: 'magenta' }
  return { label: 'system', color: 'gray' }
}

export const ChatPanel: React.FC<Props> = ({ messages, streamingText }) => {
  if (messages.length === 0 && streamingText.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text dimColor>Start a conversation — type a message and press Enter.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {messages.map((m, i) => {
        const { label, color } = roleLabel(m.role)
        return (
          <Box key={i} flexDirection="column" marginBottom={1}>
            <Text color={color} bold>
              {label}
            </Text>
            <Text>{renderMarkdown(m.content)}</Text>
          </Box>
        )
      })}
      {streamingText.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="magenta" bold>
            claude
          </Text>
          <Text>{renderMarkdown(streamingText)}</Text>
        </Box>
      )}
    </Box>
  )
}
```

- [ ] **Step 4: Run ChatPanel tests, confirm pass**

Run: `bun test tests/cli/ChatPanel.test.tsx`
Expected: 3 pass.

- [ ] **Step 5: Write failing StatusBar test**

Path: `tests/cli/StatusBar.test.tsx`

```tsx
import { describe, expect, it } from 'bun:test'
import { render } from 'ink-testing-library'
import React from 'react'
import { StatusBar } from '../../src/cli/StatusBar'

describe('StatusBar', () => {
  it('renders model, session title, and token usage', () => {
    const { lastFrame } = render(
      <StatusBar
        model="claude-sonnet-4-6"
        sessionTitle="my chat"
        usage={{ input: 1234, output: 56, window: 200000 }}
        busy={false}
        statusMessage=""
      />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toMatch(/claude-sonnet-4-6/)
    expect(frame).toMatch(/my chat/)
    expect(frame).toMatch(/200k/)
  })

  it('shows busy indicator when busy', () => {
    const { lastFrame } = render(
      <StatusBar
        model="m"
        sessionTitle="s"
        usage={{ input: 0, output: 0, window: 1000 }}
        busy={true}
        statusMessage=""
      />,
    )
    expect(lastFrame()).toMatch(/thinking/i)
  })

  it('renders status message when set', () => {
    const { lastFrame } = render(
      <StatusBar
        model="m"
        sessionTitle="s"
        usage={{ input: 0, output: 0, window: 1000 }}
        busy={false}
        statusMessage="session loaded"
      />,
    )
    expect(lastFrame()).toMatch(/session loaded/)
  })
})
```

- [ ] **Step 6: Implement StatusBar**

Path: `src/cli/StatusBar.tsx`

```tsx
import { Box, Text } from 'ink'
import React from 'react'

interface Props {
  model: string
  sessionTitle: string
  usage: { input: number; output: number; window: number }
  busy: boolean
  statusMessage: string
}

const fmtTokens = (n: number): string => {
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`
  return `${Math.round(n / 1000)}k`
}

export const StatusBar: React.FC<Props> = ({ model, sessionTitle, usage, busy, statusMessage }) => {
  const usedTokens = usage.input + usage.output
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text>
        <Text color="magenta">{model}</Text>
        <Text dimColor> · </Text>
        <Text>{sessionTitle}</Text>
        <Text dimColor> · </Text>
        <Text color="yellow">
          {fmtTokens(usedTokens)} / {fmtTokens(usage.window)}
        </Text>
        {busy && (
          <>
            <Text dimColor> · </Text>
            <Text color="green">thinking…</Text>
          </>
        )}
        {statusMessage && (
          <>
            <Text dimColor> · </Text>
            <Text color="cyan">{statusMessage}</Text>
          </>
        )}
      </Text>
    </Box>
  )
}
```

- [ ] **Step 7: Run StatusBar tests, confirm pass**

Run: `bun test tests/cli/StatusBar.test.tsx`
Expected: 3 pass.

- [ ] **Step 8: Commit**

```bash
git add src/cli/markdown.ts src/cli/ChatPanel.tsx src/cli/StatusBar.tsx tests/cli/ChatPanel.test.tsx tests/cli/StatusBar.test.tsx
git commit -m "feat(cli): ChatPanel with markdown rendering and StatusBar"
```

---

### Task 14: InputBar component

**Files:**
- Create: `src/cli/InputBar.tsx`
- Create: `tests/cli/InputBar.test.tsx`

- [ ] **Step 1: Write failing test**

Path: `tests/cli/InputBar.test.tsx`

```tsx
import { describe, expect, it } from 'bun:test'
import { render } from 'ink-testing-library'
import React from 'react'
import { InputBar } from '../../src/cli/InputBar'

describe('InputBar', () => {
  it('shows placeholder when empty', () => {
    const { lastFrame } = render(
      <InputBar value="" onChange={() => {}} onSubmit={() => {}} disabled={false} />,
    )
    expect(lastFrame()).toMatch(/type a message/i)
  })

  it('renders the current value', () => {
    const { lastFrame } = render(
      <InputBar value="hello world" onChange={() => {}} onSubmit={() => {}} disabled={false} />,
    )
    expect(lastFrame()).toMatch(/hello world/)
  })

  it('shows command hint when value starts with slash', () => {
    const { lastFrame } = render(
      <InputBar value="/he" onChange={() => {}} onSubmit={() => {}} disabled={false} />,
    )
    expect(lastFrame()).toMatch(/command/i)
  })

  it('submits on Enter and clears via callback', () => {
    let submitted = ''
    const { stdin } = render(
      <InputBar
        value="hi"
        onChange={() => {}}
        onSubmit={(v) => {
          submitted = v
        }}
        disabled={false}
      />,
    )
    stdin.write('\r')
    expect(submitted).toBe('hi')
  })
})
```

- [ ] **Step 2: Implement InputBar**

Path: `src/cli/InputBar.tsx`

```tsx
import { Box, Text, useInput } from 'ink'
import React from 'react'

interface Props {
  value: string
  onChange(next: string): void
  onSubmit(value: string): void
  disabled: boolean
}

export const InputBar: React.FC<Props> = ({ value, onChange, onSubmit, disabled }) => {
  useInput(
    (input, key) => {
      if (disabled) return
      if (key.return && !key.shift) {
        const trimmed = value.trim()
        if (trimmed.length > 0) onSubmit(trimmed)
        return
      }
      if (key.return && key.shift) {
        onChange(`${value}\n`)
        return
      }
      if (key.backspace || key.delete) {
        onChange(value.slice(0, -1))
        return
      }
      if (key.ctrl || key.meta) return
      if (input) onChange(value + input)
    },
    { isActive: !disabled },
  )

  const isCommand = value.startsWith('/')

  return (
    <Box borderStyle="round" borderColor={isCommand ? 'cyan' : 'gray'} paddingX={1} flexDirection="column">
      <Box>
        <Text color={isCommand ? 'cyan' : 'green'}>{'❯ '}</Text>
        {value.length === 0 ? (
          <Text dimColor>type a message — / for commands, shift+enter for newline</Text>
        ) : (
          <Text>{value}</Text>
        )}
      </Box>
      {isCommand && (
        <Box>
          <Text dimColor>command mode — try /help</Text>
        </Box>
      )}
    </Box>
  )
}
```

- [ ] **Step 3: Run tests, confirm pass**

Run: `bun test tests/cli/InputBar.test.tsx`
Expected: 4 pass.

- [ ] **Step 4: Commit**

```bash
git add src/cli/InputBar.tsx tests/cli/InputBar.test.tsx
git commit -m "feat(cli): InputBar with command-mode visual hint and Enter submit"
```

---

### Task 15: App composition

**Files:**
- Create: `src/cli/App.tsx`
- Create: `tests/cli/App.test.tsx`

- [ ] **Step 1: Write failing integration test**

Path: `tests/cli/App.test.tsx`

```tsx
import { describe, expect, it } from 'bun:test'
import { render } from 'ink-testing-library'
import React from 'react'
import { App } from '../../src/cli/App'
import { createAppStore } from '../../src/cli/store'
import { createRegistry } from '../../src/commands/registry'
import type { Provider, StreamChunk } from '../../src/provider/types'
import { createSessionStore } from '../../src/session/store'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const noopProvider: Provider = {
  name: 'noop',
  async *streamMessage(): AsyncIterable<StreamChunk> {
    yield { type: 'text', text: 'hi' }
    yield { type: 'usage', input: 1, output: 1 }
    yield { type: 'done' }
  },
  async countTokens() {
    return 1
  },
}

describe('App', () => {
  it('renders status bar, chat panel, and input bar on mount', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aipacino-app-'))
    try {
      const sessionStore = createSessionStore(join(dir, 'sess.db'))
      const session = sessionStore.createSession({ title: 'test', model: 'claude-sonnet-4-6' })
      const store = createAppStore({
        currentSessionId: session.id,
        currentModel: session.model,
      })
      const registry = createRegistry()

      const { lastFrame } = render(
        <App
          store={store}
          registry={registry}
          provider={noopProvider}
          sessionStore={sessionStore}
          contextWindow={200_000}
          maxTokens={1024}
          onQuit={() => {}}
        />,
      )
      const frame = lastFrame() ?? ''
      expect(frame).toMatch(/claude-sonnet-4-6/)
      expect(frame).toMatch(/test/)
      expect(frame).toMatch(/start a conversation/i)
      sessionStore.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: Implement App**

Path: `src/cli/App.tsx`

```tsx
import { Box, useApp } from 'ink'
import React, { useEffect, useState } from 'react'
import { parseCommand } from '../commands/parser'
import type { CommandRegistry } from '../commands/registry'
import type { Provider } from '../provider/types'
import { truncateForContext } from '../session/context'
import type { SessionStore } from '../session/store'
import { ChatPanel } from './ChatPanel'
import { InputBar } from './InputBar'
import { StatusBar } from './StatusBar'
import type { AppStore } from './store'

interface Props {
  store: AppStore
  registry: CommandRegistry
  provider: Provider
  sessionStore: SessionStore
  contextWindow: number
  maxTokens: number
  onQuit(): void
}

export const App: React.FC<Props> = ({
  store,
  registry,
  provider,
  sessionStore,
  contextWindow,
  maxTokens,
  onQuit,
}) => {
  const [, force] = useState(0)
  const [draft, setDraft] = useState('')
  const { exit } = useApp()

  useEffect(() => store.subscribe(() => force((n) => n + 1)), [store])

  const state = store.getState()
  const session = sessionStore.getSession(state.currentSessionId)

  const handleSubmit = async (value: string) => {
    setDraft('')
    const parsed = parseCommand(value)
    if (parsed) {
      const cmd = registry.get(parsed.name)
      if (!cmd) {
        store.setStatusMessage(`unknown command: /${parsed.name}`)
        return
      }
      try {
        await cmd.run(
          {
            store: sessionStore,
            provider,
            logger: { debug() {}, info() {}, warn() {}, error() {} },
            state: {
              currentSession: session!,
              setCurrentSession(s) {
                store.setSession(s.id, s.model, sessionStore.getMessages(s.id).map((m) => ({ role: m.role, content: m.content })))
              },
              setStatusMessage: (m) => store.setStatusMessage(m),
              quit: () => {
                onQuit()
                exit()
              },
            },
          },
          parsed.args,
        )
      } catch (err) {
        store.setStatusMessage(`error: ${(err as Error).message}`)
      }
      return
    }

    const sid = state.currentSessionId
    sessionStore.appendMessage(sid, { role: 'user', content: value })
    store.appendMessage({ role: 'user', content: value })
    store.setBusy(true)
    store.setStatusMessage('')

    const allMessages = store.getState().messages
    const { messages: trimmed } = truncateForContext(allMessages, {
      contextWindow,
      reserveOutput: maxTokens,
    })

    try {
      for await (const chunk of provider.streamMessage({
        model: state.currentModel,
        messages: trimmed,
        maxTokens,
      })) {
        if (chunk.type === 'text') {
          store.appendStreaming(chunk.text)
        } else if (chunk.type === 'usage') {
          store.setTokenUsage({
            input: chunk.input,
            output: chunk.output,
            window: contextWindow,
          })
        } else if (chunk.type === 'error') {
          store.setStatusMessage(`error: ${chunk.error.message}`)
          store.finalizeStreaming()
          break
        } else if (chunk.type === 'done') {
          const finalText = store.getState().streamingText
          store.finalizeStreaming()
          if (finalText.length > 0) {
            const stored = sessionStore.appendMessage(sid, {
              role: 'assistant',
              content: finalText,
            })
            const usage = store.getState().tokenUsage
            sessionStore.updateUsage(stored.id, { input: usage.input, output: usage.output })
          }
        }
      }
    } finally {
      store.setBusy(false)
    }
  }

  return (
    <Box flexDirection="column">
      <ChatPanel messages={state.messages} streamingText={state.streamingText} />
      <StatusBar
        model={state.currentModel}
        sessionTitle={session?.title ?? 'unknown'}
        usage={state.tokenUsage}
        busy={state.busy}
        statusMessage={state.statusMessage}
      />
      <InputBar value={draft} onChange={setDraft} onSubmit={handleSubmit} disabled={state.busy} />
    </Box>
  )
}
```

- [ ] **Step 3: Run app test, confirm pass**

Run: `bun test tests/cli/App.test.tsx`
Expected: 1 pass.

- [ ] **Step 4: Commit**

```bash
git add src/cli/App.tsx tests/cli/App.test.tsx
git commit -m "feat(cli): App composition wiring chat, status, input, commands, provider"
```

---

## Phase 7: Built-in Slash Commands

### Task 16: Implement built-in commands

**Files:**
- Create: `src/commands/builtins.ts`
- Create: `tests/commands/builtins.test.ts`

- [ ] **Step 1: Write failing test**

Path: `tests/commands/builtins.test.ts`

```ts
import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerBuiltins } from '../../src/commands/builtins'
import { createRegistry } from '../../src/commands/registry'
import { createSessionStore, type SessionStore } from '../../src/session/store'
import type { Provider, StreamChunk } from '../../src/provider/types'

const provider: Provider = {
  name: 'noop',
  async *streamMessage(): AsyncIterable<StreamChunk> {
    yield { type: 'done' }
  },
  async countTokens() {
    return 0
  },
}

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} }

let dir: string
let store: SessionStore

const makeCtx = (overrides: Partial<{
  status: string[]
  quit: number
  setSession: ((s: { id: string; model: string }) => void)
}> = {}) => {
  const sess = store.createSession({ title: 'init', model: 'claude-sonnet-4-6' })
  const status = overrides.status ?? []
  let quitCount = overrides.quit ?? 0
  return {
    sess,
    status,
    quitCount: () => quitCount,
    ctx: {
      store,
      provider,
      logger: noopLogger,
      state: {
        currentSession: sess,
        setCurrentSession: overrides.setSession ?? (() => {}),
        setStatusMessage: (m: string) => status.push(m),
        quit: () => {
          quitCount += 1
        },
      },
    },
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aipacino-built-'))
  store = createSessionStore(join(dir, 's.db'))
})

afterEach(() => {
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('builtins', () => {
  it('/help lists all registered commands', async () => {
    const reg = createRegistry()
    registerBuiltins(reg)
    const { ctx, status } = makeCtx()
    await reg.get('help')!.run(ctx, [])
    const last = status[status.length - 1] ?? ''
    expect(last).toMatch(/help/)
    expect(last).toMatch(/new/)
    expect(last).toMatch(/quit/)
  })

  it('/quit invokes state.quit', async () => {
    const reg = createRegistry()
    registerBuiltins(reg)
    const helper = makeCtx()
    await reg.get('quit')!.run(helper.ctx, [])
    expect(helper.quitCount()).toBe(1)
  })

  it('/new creates a new session and switches to it', async () => {
    const reg = createRegistry()
    registerBuiltins(reg)
    let switched: { id: string; model: string } | null = null
    const helper = makeCtx({ setSession: (s) => (switched = s) })
    await reg.get('new')!.run(helper.ctx, ['fresh chat'])
    expect(switched).not.toBeNull()
    expect(switched!.id).not.toBe(helper.sess.id)
    const all = store.listSessions({ limit: 10 })
    expect(all.find((s) => s.title === 'fresh chat')).toBeDefined()
  })

  it('/sessions writes a numbered list to status', async () => {
    const reg = createRegistry()
    registerBuiltins(reg)
    store.createSession({ title: 'one', model: 'm' })
    store.createSession({ title: 'two', model: 'm' })
    const helper = makeCtx()
    await reg.get('sessions')!.run(helper.ctx, [])
    const last = helper.status[helper.status.length - 1] ?? ''
    expect(last).toMatch(/one/)
    expect(last).toMatch(/two/)
  })

  it('/model with no arg reports current model', async () => {
    const reg = createRegistry()
    registerBuiltins(reg)
    const helper = makeCtx()
    await reg.get('model')!.run(helper.ctx, [])
    expect(helper.status[helper.status.length - 1]).toMatch(/claude-sonnet-4-6/)
  })

  it('/model with arg switches model on session', async () => {
    const reg = createRegistry()
    registerBuiltins(reg)
    let switched: { id: string; model: string } | null = null
    const helper = makeCtx({ setSession: (s) => (switched = s) })
    await reg.get('model')!.run(helper.ctx, ['claude-opus-4-7'])
    expect(switched?.model).toBe('claude-opus-4-7')
    const updated = store.getSession(helper.sess.id)!
    expect(updated.model).toBe('claude-opus-4-7')
  })
})
```

- [ ] **Step 2: Implement builtins**

Path: `src/commands/builtins.ts`

```ts
import type { Command, CommandRegistry } from './registry'

const helpCommand: Command = {
  name: 'help',
  description: 'list all available commands',
  async run(ctx) {
    const lines: string[] = []
    // We do not have direct registry access here; use known command list from registry via context
    // Instead, expose via state — registry passed in registerBuiltins closure
    ctx.state.setStatusMessage(lines.join(' · '))
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
    const summary = all
      .map((s, i) => `${i + 1}. ${s.title} [${s.id.slice(-6)}]`)
      .join(' · ')
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

export const registerBuiltins = (registry: CommandRegistry): void => {
  registry.register(newCommand)
  registry.register(sessionsCommand)
  registry.register(loadCommand)
  registry.register(modelCommand)
  registry.register(clearCommand)
  registry.register(quitCommand)
  // help is special: needs registry to enumerate
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
```

- [ ] **Step 3: Run tests, confirm pass**

Run: `bun test tests/commands/builtins.test.ts`
Expected: 6 pass.

- [ ] **Step 4: Commit**

```bash
git add src/commands/builtins.ts tests/commands/builtins.test.ts
git commit -m "feat(commands): built-in commands /help /new /sessions /load /model /clear /quit"
```

---

## Phase 8: Entry & Integration

### Task 17: Entry point (src/index.ts)

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Implement entry point**

Path: `src/index.ts`

```ts
#!/usr/bin/env bun
import { render } from 'ink'
import { homedir } from 'node:os'
import { join } from 'node:path'
import React from 'react'
import { App } from './cli/App'
import { createAppStore } from './cli/store'
import { registerBuiltins } from './commands/builtins'
import { createRegistry } from './commands/registry'
import { loadConfig } from './config/loader'
import { resolveAnthropicKey, MissingApiKeyError } from './auth/keys'
import { createLogger } from './logging/logger'
import { AnthropicProvider } from './provider/anthropic'
import { createSessionStore } from './session/store'

const xdg = (envName: string, fallback: string): string =>
  process.env[envName] ?? join(homedir(), fallback)

const main = async () => {
  const globalPath = join(xdg('XDG_CONFIG_HOME', '.config'), 'aipacino', 'config.json')
  const projectPath = join(process.cwd(), '.aipacino', 'config.json')

  let config
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
    recent[0] ??
    sessionStore.createSession({ title: 'new chat', model: config.defaultModel })

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

  const app = render(
    React.createElement(App, {
      store,
      registry,
      provider,
      sessionStore,
      contextWindow: 200_000,
      maxTokens: config.maxTokens,
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
```

- [ ] **Step 2: Smoke test (no API call)**

This test relies on missing API key triggering the friendly error path.

Run: `ANTHROPIC_API_KEY= bun run src/index.ts`
Expected: prints the MissingApiKeyError text and exits with code 2 within ~1s.

- [ ] **Step 3: Type-check the whole project**

Run: `bunx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: cli entry point wires config, auth, logging, session, provider, ui"
```

---

### Task 18: Integration test

**Files:**
- Create: `tests/integration/end-to-end.test.tsx`

- [ ] **Step 1: Write integration test**

Path: `tests/integration/end-to-end.test.tsx`

```tsx
import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { render } from 'ink-testing-library'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import React from 'react'
import { App } from '../../src/cli/App'
import { createAppStore } from '../../src/cli/store'
import { registerBuiltins } from '../../src/commands/builtins'
import { createRegistry } from '../../src/commands/registry'
import { type Provider, type StreamChunk } from '../../src/provider/types'
import { createSessionStore, type SessionStore } from '../../src/session/store'

const scriptedProvider = (replies: string[]): Provider => {
  const queue = [...replies]
  return {
    name: 'mock',
    async *streamMessage(): AsyncIterable<StreamChunk> {
      const text = queue.shift() ?? ''
      for (const ch of text) yield { type: 'text', text: ch }
      yield { type: 'usage', input: 10, output: text.length }
      yield { type: 'done' }
    },
    async countTokens() {
      return 0
    },
  }
}

let dir: string
let sessionStore: SessionStore

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aipacino-int-'))
  sessionStore = createSessionStore(join(dir, 's.db'))
})

afterEach(() => {
  sessionStore.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('integration: send message → assistant reply persisted', () => {
  it('user message and assistant reply are stored in SQLite', async () => {
    const session = sessionStore.createSession({ title: 'int', model: 'claude-sonnet-4-6' })
    const store = createAppStore({ currentSessionId: session.id, currentModel: session.model })
    const provider = scriptedProvider(['Hello back'])
    const registry = createRegistry()
    registerBuiltins(registry)

    const { stdin, lastFrame } = render(
      <App
        store={store}
        registry={registry}
        provider={provider}
        sessionStore={sessionStore}
        contextWindow={200_000}
        maxTokens={1024}
        onQuit={() => {}}
      />,
    )

    stdin.write('hi')
    stdin.write('\r')

    // Wait briefly for async stream to complete
    await new Promise((r) => setTimeout(r, 50))

    const messages = sessionStore.getMessages(session.id)
    expect(messages.length).toBe(2)
    expect(messages[0]!.role).toBe('user')
    expect(messages[0]!.content).toBe('hi')
    expect(messages[1]!.role).toBe('assistant')
    expect(messages[1]!.content).toBe('Hello back')
    expect(lastFrame()).toMatch(/hello back/i)
  })
})
```

- [ ] **Step 2: Run integration test**

Run: `bun test tests/integration/end-to-end.test.tsx`
Expected: 1 pass.

- [ ] **Step 3: Run the full test suite**

Run: `bun test`
Expected: all suites green. ≥40 tests pass total.

- [ ] **Step 4: Commit**

```bash
git add tests/integration
git commit -m "test(integration): end-to-end send message and persist assistant reply"
```

---

## Phase 9: Polish

### Task 19: README and final cleanup

**Files:**
- Create: `README.md`
- Modify: `package.json` (no changes expected; verify scripts work)

- [ ] **Step 1: Write README**

Path: `README.md`

````markdown
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
````

- [ ] **Step 2: Verify build works**

Run: `bun run build`
Expected: `dist/aipacino` binary created.

- [ ] **Step 3: Verify lint passes**

Run: `bun run lint`
Expected: no errors. Warnings acceptable.

- [ ] **Step 4: Run full test suite one more time**

Run: `bun test`
Expected: all suites green.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: README with install, config, commands, dev workflow"
```

---

## Acceptance Checklist

Before declaring sub-project A complete, verify:

- [ ] `bun test` — all tests green
- [ ] `bunx tsc --noEmit` — zero type errors
- [ ] `bun run lint` — clean
- [ ] `bun run build` — `dist/aipacino` produced
- [ ] `ANTHROPIC_API_KEY=<real key> bun run start` — TUI opens, send a message, assistant streams a real response
- [ ] Quit with `/quit`, restart, last session is loaded with prior messages visible
- [ ] `/new` creates a fresh session, `/sessions` lists both, `/load 2` switches back
- [ ] `/model claude-opus-4-7` switches model; next message uses Opus
- [ ] Disconnect network mid-stream → status bar shows error, TUI stays alive, can retry

When all boxes checked, sub-project A is done. Move on to sub-project B (tool execution) — write a new spec via brainstorming.
