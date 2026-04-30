# AI Pacino — Çekirdek CLI İskeleti (Sub-project A)

**Tarih:** 2026-04-30
**Durum:** Brainstorming → Spec
**Hedef süre:** 1-2 hafta full-time
**Kapsam:** AI Pacino platformunun ilk alt projesi. Tek kullanıcılık, tek provider'lı, tool'suz, agent'sız çekirdek terminal istemcisi.

---

## 1. Amaç ve Başarı Kriteri

### Amaç
Bun + TypeScript ile çalışan, terminal üzerinden Anthropic Claude'a streaming mesaj gönderebilen, çoklu konuşmayı SQLite'ta kalıcı tutan minimum işlevsel CLI. Bu iskelet üzerine sonraki alt-projelerde tool execution (B), MCP (C), agent sistemi (D), plugin sistemi (E) ve web dashboard (F) eklenecek.

### Başarı kriteri (Definition of Done)
- `bun run start` veya `aipacino` komutu Ink tabanlı TUI'yi açar.
- Kullanıcı mesaj yazar → Anthropic API'ye streaming istek gider → cevap satır satır canlı render edilir.
- Konuşma geçmişi `~/.local/share/aipacino/sessions.db` SQLite veritabanında otomatik kalıcı olur.
- `/sessions` ile geçmiş oturumlar listelenir, `/load <id>` ile birine geri dönülür, `/new` yeni oturum açar.
- `/model` ile aktif model değiştirilir (Sonnet 4.6 ↔ Opus 4.7).
- API key `ANTHROPIC_API_KEY` env veya `~/.config/aipacino/config.json` üzerinden çözülür; ikisi de yoksa kullanıcıya net hata mesajı.
- Markdown render edilir (kalın, italik, kod bloğu, başlık).
- Status bar: aktif model · oturum başlığı · kullanılan token / pencere
- API hatası, network kesintisi, geçersiz API key gibi durumlarda TUI çökmez; mesaj olarak gösterilir, bir sonraki istek denenebilir.
- `bun test` ile çekirdek modüller (provider adapter, session store, config loader, command parser) yeşil geçer.

### Out of Scope (sonraki alt-projeler)
- Tool execution (bash/read/write/edit/grep) → **B**
- MCP client → **C**
- OpenAI / GLM / DeepSeek / Bedrock / vb. provider'lar → **C**
- Agent persona sistemi (Michael/Tony/Carlito) → **D**
- Plugin loader → **E**
- macOS Keychain / libsecret entegrasyonu → **E**
- Auto-update, Homebrew, npm publish → **E**
- Web dashboard → **F**
- Anthropic prompt caching, vision, Files API gibi ileri özellikler → ileri sürüm
- Çoklu kullanıcı, kimlik doğrulama OAuth → kapsam dışı (CLI single-user)

---

## 2. Mimari Genel Bakış

```
┌──────────────────────────────────────────────────────────┐
│ Ink TUI (React)                                          │
│ ┌──────────────────────────┐  ┌────────────────────────┐ │
│ │ Chat Panel (markdown)    │  │ Status Bar             │ │
│ │  user / assistant turns  │  │ model · session · tok  │ │
│ └──────────────────────────┘  └────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Input + Slash Commands                               │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
          │ user message               ▲ assistant chunks
          ▼                            │
┌─────────────────────────────────────────────────────────┐
│ Session Manager   ←→   SQLite (bun:sqlite)              │
│   - load/save messages, sessions                        │
│   - context window mgmt (token count)                   │
└─────────────────────────────────────────────────────────┘
          │ messages
          ▼
┌─────────────────────────────────────────────────────────┐
│ Provider Layer (Anthropic only)                         │
│   - streamMessage(messages, model) → AsyncIterable      │
│   - SSE parse, error normalize                          │
└─────────────────────────────────────────────────────────┘
          │ HTTPS POST /v1/messages?stream=true
          ▼
                  api.anthropic.com
```

### Modül haritası ve LOC tahmini

| Modül | Sorumluluk | LOC tahmini |
|-------|------------|-------------|
| `src/cli/` | Ink components, slash command UI | 800 |
| `src/provider/` | Anthropic adapter, SSE parse, retry, error normalize | 600 |
| `src/session/` | SQLite-backed session store, context window mgmt | 500 |
| `src/config/` | Zod schema, config merge (env + global + project) | 200 |
| `src/auth/` | API key resolution (env > project config > global config) | 80 |
| `src/logging/` | Structured logger to file with daily rotation | 150 |
| `src/commands/` | Slash command parser & dispatcher | 200 |
| `src/index.ts` | Entry: parse argv, init config/log/session/provider, mount Ink | 100 |
| **Toplam** | | **~2,600** |

`project.md` toplam ~24,500 LOC tahmini içinde A için ~5,000 öngörmüştü; tool engine ve OpenAI/MCP/agent şu anda kapsam dışı olduğu için A çok daha küçük çıkıyor.

---

## 3. Bileşen Detayları

### 3.1 CLI / TUI Layer (`src/cli/`)

**Bileşen:** Ink + React. Tek `<App>` kök bileşeni; alt bileşenler `<ChatPanel>`, `<StatusBar>`, `<InputBar>`.

**State yönetimi:** React useState/useReducer + Zustand benzeri tek store (kendi yazımı, ~50 satır — bağımlılık eklemek gereksiz). Store: `currentSessionId`, `messages`, `streamingAssistantText`, `model`, `inputDraft`, `commandPaletteOpen`.

**Render:**
- ChatPanel: tüm mesajları markdown olarak render eder. `marked` + `marked-terminal` veya doğrudan `cli-markdown`. Kod blokları için sözdizimi vurgulama yok (B'de gelir).
- StatusBar: tek satır — `model · session: <başlık> · ctx: 12.3k / 200k`
- InputBar: çok satırlı input (Ink `<TextInput>` türevi); Enter gönderir, Shift+Enter yeni satır, `/` slash command palette açar.

**Slash command UX:** Input `/` ile başlayınca alttan komut listesi açılır (autocomplete). Komut seçilince çalıştırılır.

**Stream render:** Provider'dan gelen her chunk store'a append edilir; React re-render eder. Throttle yok — Ink kendi hallediyor; sorun çıkarsa 30ms throttle.

**Test edilebilirlik:** UI bileşenleri için `ink-testing-library` ile en az iki snapshot/davranış testi (`<App>` boş halde render olur; user mesajı eklendiğinde ChatPanel'da görünür).

### 3.2 Provider Layer (`src/provider/`)

**Arayüz (gelecekteki çoklu provider için baştan soyut):**

```ts
type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string }
type StreamChunk =
  | { type: 'text'; text: string }
  | { type: 'usage'; input: number; output: number }
  | { type: 'done' }
  | { type: 'error'; error: ProviderError }

interface Provider {
  readonly name: string
  streamMessage(opts: {
    model: string
    messages: ChatMessage[]
    system?: string
    signal?: AbortSignal
  }): AsyncIterable<StreamChunk>
  countTokens(text: string, model: string): Promise<number>
}
```

**Anthropic adapter:**
- `POST https://api.anthropic.com/v1/messages` with `stream: true`
- Header: `x-api-key`, `anthropic-version: 2023-06-01`
- Body: `{ model, max_tokens, messages, system }`
- SSE parser: native `Response.body` ReadableStream üstünden satır satır; Anthropic'in `event:` + `data:` formatını parse et. `content_block_delta`/`message_delta`/`message_stop` event'lerini StreamChunk'a normalize et.
- Token sayımı: `/v1/messages/count_tokens` endpoint'i veya local `@anthropic-ai/tokenizer`. İlk sürümde Anthropic count_tokens endpoint'i (1 req/saniye limit; sadece session değişince çağır).
- Retry: 429 ve 5xx için exponential backoff, max 3 deneme. 401/400 retry yok.

**Error normalization:** Tüm hatalar `ProviderError { kind: 'auth' | 'rate_limit' | 'network' | 'invalid_request' | 'server'; message: string; retryable: boolean }`.

### 3.3 Session / State (`src/session/`)

**Storage:** `bun:sqlite` (built-in, sıfır dependency). DB yolu: `${XDG_DATA_HOME:-~/.local/share}/aipacino/sessions.db`.

**Schema:**
```sql
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,            -- ulid
  title       TEXT NOT NULL,
  model       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  archived    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE messages (
  id           TEXT PRIMARY KEY,           -- ulid
  session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content      TEXT NOT NULL,
  tokens_in    INTEGER,                    -- assistant turn sonrası provider usage
  tokens_out   INTEGER,
  created_at   INTEGER NOT NULL
);

CREATE INDEX idx_messages_session ON messages(session_id, created_at);
```

**SessionManager API:**
```ts
createSession(model: string): Promise<Session>
loadSession(id: string): Promise<Session>
listSessions(opts?: { limit?: number; archived?: boolean }): Promise<SessionSummary[]>
appendMessage(sessionId: string, msg: ChatMessage): Promise<void>
updateUsage(messageId: string, usage: { in: number; out: number }): Promise<void>
generateTitle(sessionId: string): Promise<void>  // ilk user msg'den ilk 60 karakter; LLM özetlemesi ileri sürüm
```

**Context window:** İlk sürümde basit — toplam token sayısı `model.contextWindow * 0.85` aşarsa eski mesajları siler ve baş kısma `[earlier conversation truncated]` system note ekler. Akıllı özetleme (LLM ile compact) sub-project D'ye.

### 3.4 Config (`src/config/`)

**Sıralama (sonra gelen önce kazanır):**
1. `~/.config/aipacino/config.json` (global)
2. `${cwd}/.aipacino/config.json` (proje)
3. Env vars: `AIPACINO_*`, `ANTHROPIC_API_KEY`

**Zod schema:**
```ts
const Config = z.object({
  defaultModel: z.string().default('claude-sonnet-4-6'),
  maxTokens: z.number().int().positive().default(8192),
  anthropic: z.object({
    apiKey: z.string().optional(),
    baseUrl: z.string().url().default('https://api.anthropic.com'),
  }).default({}),
  ui: z.object({
    theme: z.enum(['dark', 'light']).default('dark'),
    markdown: z.boolean().default(true),
  }).default({}),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    file: z.string().optional(),  // default: ~/.local/state/aipacino/aipacino.log
  }).default({}),
})
```

**Migration:** Config'e `version` alanı eklenir, schema değişince migrate fonksiyonu çağrılır. İlk sürümde `version: 1`.

### 3.5 Auth (`src/auth/`)

API key çözümleme önceliği:
1. `ANTHROPIC_API_KEY` env
2. Project config `anthropic.apiKey`
3. Global config `anthropic.apiKey`

Yoksa CLI başlangıçta açıklayıcı hata: nereye yazılacağı + env var nasıl set edileceği. Keychain/libsecret **bu alt-projede yok** (E'de gelir).

### 3.6 Logging (`src/logging/`)

- Structured: `{ts, level, msg, ...fields}` JSON Lines
- Default: `~/.local/state/aipacino/aipacino.log`, daily rotation, 7 dosya retention
- TUI'ya yazmaz (Ink output'unu bozar); sadece dosya
- `/debug` slash komutu son 50 log satırını panelde gösterir

### 3.7 Slash Commands (`src/commands/`)

```ts
type Command = {
  name: string
  description: string
  args?: { name: string; required: boolean }[]
  run(ctx: CmdContext, args: string[]): Promise<void>
}
```

İlk sürüm:
- `/help` — komut listesi
- `/new [başlık?]` — yeni oturum
- `/sessions` — son 20 oturumu liste
- `/load <id|index>` — oturumu yükle
- `/model [name?]` — modeli göster veya değiştir
- `/clear` — ekranı temizle (geçmiş silinmez)
- `/debug` — son log satırları
- `/quit` — çık

---

## 4. Veri Akışı (Happy Path)

1. `bun run start` → `src/index.ts`
2. Config yüklenir, logger başlatılır, API key çözülür.
3. SessionManager: aktif oturum yoksa yeni oturum oluştur.
4. Ink mount: `<App />`.
5. Kullanıcı input yazar, Enter.
6. Store: user message append → SQLite'a yaz → ChatPanel re-render.
7. Provider'a streamMessage çağrılır (mevcut tüm mesajlar + system).
8. Her chunk store'da `streamingAssistantText`'e eklenir → ChatPanel canlı render.
9. `done` chunk geldiğinde: assistant message append → SQLite'a yaz → usage güncellenir → status bar token sayısı güncellenir.
10. Kullanıcı `/quit` → SQLite'a son state yaz → process exit.

---

## 5. Hata Yönetimi

| Senaryo | Davranış |
|---------|----------|
| API key yok | CLI başlangıçta net hata, çıkış (TUI açılmaz) |
| Network down | Stream sırasında `error` chunk → ChatPanel'da kırmızı satır, retry butonu (Enter ile aynı mesaj tekrar gönderilir); TUI çökmez |
| 429 rate limit | Provider içinde 3x exponential backoff; sonra hata fırlatır |
| 401 invalid key | Tek deneme, kullanıcıya "API key geçersiz, /config aç" mesajı |
| Context overflow | Provider'a göndermeden önce SessionManager truncate eder; kullanıcıya `[older messages truncated]` görünür uyarı |
| SQLite write error | Logger'a yazılır, kullanıcıya "session kaydı başarısız, geçici devam ediyor" uyarısı; TUI çökmez |
| Geçersiz slash command | Input bar altında inline hata, gönderilmez |
| Ink render exception | Top-level error boundary; "TUI çöktü, log dosyasına yazıldı" mesajı + temiz çıkış |

---

## 6. Test Stratejisi

`bun:test` ile birim testler:

| Modül | Test |
|-------|------|
| `provider/anthropic` | Mock fetch ile SSE chunk parse, retry, error normalize |
| `provider/sse-parser` | Çeşitli SSE event formatları, partial chunk birleştirme |
| `session/store` | CRUD, listSessions sıralama, cascade delete |
| `session/context` | Token threshold aşıldığında truncate doğru |
| `config/loader` | Üç kaynaktan merge, env override, geçersiz JSON hatası |
| `commands/parser` | `/foo bar baz` parse, bilinmeyen komut, eksik arg |

UI için `ink-testing-library`:
- Boş app render olur, "type a message" placeholder görünür
- Mesaj eklendikten sonra ChatPanel'da görünür
- `/help` yazınca komut listesi açılır

Integration testi (gerçek API çağırmaz, mock provider):
- "Mesaj gönder, stream gelsin, SQLite'a yazılsın" end-to-end senaryo

Coverage hedefi: çekirdek modüllerde %70+ (UI hariç).

---

## 7. Repo / Tooling

- **Bun:** runtime + test + bundler + sqlite. Node.js gerekmez.
- **TypeScript:** strict mode, `tsconfig.json` Bun preset
- **Lint/format:** `biome` (eslint+prettier'den hızlı, tek tool, sıfır config)
- **Pre-commit:** `lefthook` ile `biome check` + `bun test --bail`
- **`package.json` scripts:** `start`, `dev` (watch), `test`, `test:watch`, `lint`, `build` (bun build --compile)
- **Bağımlılıklar (production):** `ink`, `react`, `zod`, `marked`, `marked-terminal`, `ulid`, `@anthropic-ai/tokenizer` (opsiyonel, count_tokens endpoint başarısız olursa fallback). Toplam: <10 paket.
- **Bağımlılıklar (dev):** `@types/react`, `ink-testing-library`, `biome`, `lefthook`, `@types/node` (Bun için minimum).
- **Repo layout:**
  ```
  Ai-Pacino/
    src/
      cli/
      provider/
      session/
      config/
      auth/
      logging/
      commands/
      index.ts
    tests/
    docs/
      superpowers/specs/
    package.json
    tsconfig.json
    biome.json
    lefthook.yml
    README.md
    project.md
  ```

---

## 8. Risk ve Açık Noktalar

| Risk | Etki | Azaltma |
|------|------|---------|
| Ink + Bun uyumluluğu (Ink Node.js'i hedefliyor) | TUI render çalışmaz | İlk PR öncesi 30 dk POC: basit Ink uygulaması Bun ile çalışıyor mu? Çalışmazsa Clack veya enquirer'a geç. |
| Anthropic SSE format değişiklikleri | Stream parse kırılır | Provider katmanı izole; düzeltme tek dosyada |
| Token sayım gecikmesi (count_tokens endpoint 1 req/s) | Status bar yavaş | Yerel `@anthropic-ai/tokenizer` fallback, sadece oturum başında ve N mesajda bir |
| SQLite concurrent write (tek process ama Ink async) | Rare data race | Tüm yazmalar tek async kuyruktan; basit `await` zinciri |
| Markdown render terminalde bozuk (geniş tablolar, emoji width) | UX sorun | `marked-terminal` default config, sorun çıkarsa fallback plain text |

---

## 9. Sonraki Alt-projelere Devir

A bittiğinde elde olan API'lar:
- `Provider` arayüzü → C'de OpenAI/GLM eklenir
- `SessionManager` → B'de tool call message'ları için `tool_use`/`tool_result` türleri eklenir
- `Config` schema → her sub-project kendi alanını ekler
- `Slash command` registry → B'de `/tools`, C'de `/mcp`, D'de `/agent` eklenir

A'nın ürettiği `Provider`, `SessionManager`, `Config`, `Logger` arayüzleri stabil olduğunda B'ye başlanabilir.

---

## 10. Tahmini Süre

| Faz | Süre |
|-----|------|
| POC: Ink + Bun + tek Anthropic streaming çağrısı | 0.5 gün |
| Provider katmanı + retry + error normalize + testler | 1.5 gün |
| Session/SQLite + context window | 1 gün |
| Config + Auth + Logging | 0.5 gün |
| Slash commands + dispatcher | 0.5 gün |
| Ink TUI (chat + statusbar + input + markdown) | 2 gün |
| Integration test, polish, README | 1 gün |
| Buffer (edge case, debug) | 1 gün |
| **Toplam** | **~8 iş günü** |

Tek kişi full-time, AI yardımıyla. project.md "1 hafta" tahmininin biraz üstünde, gerçekçi.
