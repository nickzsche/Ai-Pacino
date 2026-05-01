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
      const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
        | SessionRow
        | undefined
      return row ? toSession(row) : null
    },
    listSessions(opts) {
      const limit = opts?.limit ?? 20
      const archived = opts?.archived ?? false
      const rows = db
        .prepare('SELECT * FROM sessions WHERE archived = ? ORDER BY updated_at DESC LIMIT ?')
        .all(archived ? 1 : 0, limit) as SessionRow[]
      return rows.map(toSession)
    },
    updateSession(id, patch) {
      const sets: string[] = []
      const params: (string | number | null)[] = []
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
