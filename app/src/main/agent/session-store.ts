import { randomUUID } from 'node:crypto'
import type {
  AgentArtifact,
  AgentEntry,
  AgentRun,
  AgentRunStatus,
  AgentSessionDetail,
  AgentSessionStatus,
  AgentSessionSummary,
  ModelRef,
  TokenUsage,
} from '../../shared/ipc.js'
import { LocalDatabase } from '../db/database.js'

interface SessionRow {
  id: string
  app_id: string
  title: string
  model_provider_id: string | null
  model_id: string | null
  status: AgentSessionStatus
  created_at: number
  updated_at: number
}

interface EntryRow {
  id: string
  session_id: string
  sequence: number
  type: AgentEntry['type']
  data_json: string
  token_usage_json: string | null
  created_at: number
}

interface RunRow {
  id: string
  session_id: string
  user_entry_id: string
  status: AgentRunStatus
  partial_message_json: string | null
  error_json: string | null
  started_at: number
  completed_at: number | null
}

interface ArtifactRow {
  id: string
  session_id: string
  extension_id: string
  type: string
  name: string | null
  content_json: string
  updated_at: number
}

export class SessionStore {
  constructor(private db: LocalDatabase) {}

  recoverInterruptedRuns(): void {
    const now = Date.now()
    this.db.transaction(() => {
      const sessionIds = (this.db.raw.prepare("SELECT DISTINCT session_id FROM agent_runs WHERE status = 'running'").all() as Array<{ session_id: string }>)
        .map((row) => row.session_id)
      this.db.raw.prepare("UPDATE agent_runs SET status = 'interrupted', completed_at = ? WHERE status = 'running'").run(now)
      if (sessionIds.length > 0) {
        const update = this.db.raw.prepare("UPDATE agent_sessions SET status = 'interrupted', updated_at = ? WHERE id = ?")
        for (const sessionId of sessionIds) update.run(now, sessionId)
      }
    })
  }

  list(appId: string, limit = 50): AgentSessionSummary[] {
    const rows = this.db.raw.prepare(`
      SELECT * FROM agent_sessions WHERE app_id = ? ORDER BY updated_at DESC LIMIT ?
    `).all(appId, Math.max(1, Math.min(limit, 100))) as unknown as SessionRow[]
    return rows.map(toSession)
  }

  create(appId: string): AgentSessionSummary {
    const now = Date.now()
    const row: SessionRow = {
      id: randomUUID(),
      app_id: appId,
      title: '',
      model_provider_id: null,
      model_id: null,
      status: 'idle',
      created_at: now,
      updated_at: now,
    }
    this.db.raw.prepare(`
      INSERT INTO agent_sessions (id, app_id, title, model_provider_id, model_id, status, created_at, updated_at)
      VALUES (@id, @app_id, @title, @model_provider_id, @model_id, @status, @created_at, @updated_at)
    `).run(row as unknown as Record<string, string | number | null>)
    return toSession(row)
  }

  get(sessionId: string): AgentSessionDetail | null {
    const row = this.db.raw.prepare('SELECT * FROM agent_sessions WHERE id = ?').get(sessionId) as SessionRow | undefined
    if (!row) return null
    return {
      ...toSession(row),
      entries: this.getEntries(sessionId),
      artifacts: this.getArtifacts(sessionId),
      latestRun: this.getLatestRun(sessionId),
    }
  }

  getSession(sessionId: string): AgentSessionSummary | null {
    const row = this.db.raw.prepare('SELECT * FROM agent_sessions WHERE id = ?').get(sessionId) as SessionRow | undefined
    return row ? toSession(row) : null
  }

  rename(sessionId: string, title: string): void {
    const normalized = title.trim()
    if (!normalized) throw new Error('Session title cannot be empty')
    const result = this.db.raw.prepare('UPDATE agent_sessions SET title = ?, updated_at = ? WHERE id = ?').run(normalized, Date.now(), sessionId)
    if (result.changes === 0) throw new Error('Session not found')
  }

  delete(sessionId: string): void {
    this.db.raw.prepare('DELETE FROM agent_sessions WHERE id = ?').run(sessionId)
  }

  setModel(sessionId: string, model: ModelRef): void {
    this.assertSession(sessionId)
    this.db.transaction(() => {
      this.appendEntry(sessionId, 'model_change', model as unknown as Record<string, unknown>)
      this.db.raw.prepare(`
        UPDATE agent_sessions
        SET model_provider_id = ?, model_id = ?, updated_at = ?
        WHERE id = ?
      `).run(model.providerId, model.modelId, Date.now(), sessionId)
    })
  }

  appendMessage(sessionId: string, message: Record<string, unknown>, tokenUsage?: TokenUsage | null): AgentEntry {
    this.assertSession(sessionId)
    return this.appendEntry(sessionId, 'message', message, tokenUsage)
  }

  startRun(sessionId: string, userEntryId: string): AgentRun {
    this.assertSession(sessionId)
    const now = Date.now()
    const row: RunRow = {
      id: randomUUID(),
      session_id: sessionId,
      user_entry_id: userEntryId,
      status: 'running',
      partial_message_json: null,
      error_json: null,
      started_at: now,
      completed_at: null,
    }
    this.db.transaction(() => {
      this.db.raw.prepare(`
        INSERT INTO agent_runs (id, session_id, user_entry_id, status, partial_message_json, error_json, started_at, completed_at)
        VALUES (@id, @session_id, @user_entry_id, @status, @partial_message_json, @error_json, @started_at, @completed_at)
      `).run(row as unknown as Record<string, string | number | null>)
      this.db.raw.prepare("UPDATE agent_sessions SET status = 'running', updated_at = ? WHERE id = ?").run(now, sessionId)
    })
    return toRun(row)
  }

  updateRunSnapshot(runId: string, message: Record<string, unknown>): void {
    this.db.raw.prepare("UPDATE agent_runs SET partial_message_json = ? WHERE id = ? AND status = 'running'")
      .run(JSON.stringify(message), runId)
  }

  completeRun(runId: string, status: Exclude<AgentRunStatus, 'running'>, error?: { message: string; code?: string }): void {
    const run = this.db.raw.prepare('SELECT * FROM agent_runs WHERE id = ?').get(runId) as RunRow | undefined
    if (!run) return
    const now = Date.now()
    const sessionStatus: AgentSessionStatus = status === 'failed' ? 'failed' : status === 'interrupted' ? 'interrupted' : 'idle'
    this.db.transaction(() => {
      this.db.raw.prepare(`
        UPDATE agent_runs
        SET status = ?, error_json = ?, completed_at = ?
        WHERE id = ?
      `).run(status, error ? JSON.stringify(error) : null, now, runId)
      this.db.raw.prepare('UPDATE agent_sessions SET status = ?, updated_at = ? WHERE id = ?')
        .run(sessionStatus, now, run.session_id)
    })
  }

  upsertArtifact(input: Omit<AgentArtifact, 'updatedAt'>): void {
    this.assertSession(input.sessionId)
    this.db.raw.prepare(`
      INSERT INTO agent_artifacts (id, session_id, extension_id, type, name, content_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, id) DO UPDATE SET
        extension_id = excluded.extension_id,
        type = excluded.type,
        name = excluded.name,
        content_json = excluded.content_json,
        updated_at = excluded.updated_at
    `).run(
      input.id,
      input.sessionId,
      input.extensionId,
      input.type,
      input.name,
      JSON.stringify(input.content),
      Date.now(),
    )
  }

  private appendEntry(
    sessionId: string,
    type: AgentEntry['type'],
    data: Record<string, unknown>,
    tokenUsage?: TokenUsage | null,
  ): AgentEntry {
    const now = Date.now()
    const sequenceRow = this.db.raw.prepare('SELECT COALESCE(MAX(sequence), 0) AS max_sequence FROM agent_entries WHERE session_id = ?')
      .get(sessionId) as { max_sequence: number }
    const row: EntryRow = {
      id: randomUUID(),
      session_id: sessionId,
      sequence: sequenceRow.max_sequence + 1,
      type,
      data_json: JSON.stringify(data),
      token_usage_json: tokenUsage ? JSON.stringify(tokenUsage) : null,
      created_at: now,
    }
    this.db.raw.prepare(`
      INSERT INTO agent_entries (id, session_id, sequence, type, data_json, token_usage_json, created_at)
      VALUES (@id, @session_id, @sequence, @type, @data_json, @token_usage_json, @created_at)
    `).run(row as unknown as Record<string, string | number | null>)

    const session = this.assertSession(sessionId)
    const title = session.title || (type === 'message' ? deriveSessionTitle(data) : null)
    this.db.raw.prepare('UPDATE agent_sessions SET title = ?, updated_at = ? WHERE id = ?').run(title ?? session.title, now, sessionId)
    return toEntry(row)
  }

  private getEntries(sessionId: string): AgentEntry[] {
    const rows = this.db.raw.prepare('SELECT * FROM agent_entries WHERE session_id = ? ORDER BY sequence ASC').all(sessionId) as unknown as EntryRow[]
    return rows.map(toEntry)
  }

  private getArtifacts(sessionId: string): AgentArtifact[] {
    const rows = this.db.raw.prepare('SELECT * FROM agent_artifacts WHERE session_id = ? ORDER BY updated_at DESC').all(sessionId) as unknown as ArtifactRow[]
    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      extensionId: row.extension_id,
      type: row.type,
      name: row.name,
      content: parseObject(row.content_json),
      updatedAt: row.updated_at,
    }))
  }

  private getLatestRun(sessionId: string): AgentRun | null {
    const row = this.db.raw.prepare('SELECT * FROM agent_runs WHERE session_id = ? ORDER BY started_at DESC LIMIT 1').get(sessionId) as RunRow | undefined
    return row ? toRun(row) : null
  }

  private assertSession(sessionId: string): AgentSessionSummary {
    const session = this.getSession(sessionId)
    if (!session) throw new Error('Session not found')
    return session
  }
}

function toSession(row: SessionRow): AgentSessionSummary {
  return {
    id: row.id,
    appId: row.app_id,
    title: row.title,
    model: row.model_provider_id && row.model_id ? { providerId: row.model_provider_id, modelId: row.model_id } : null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toEntry(row: EntryRow): AgentEntry {
  return {
    id: row.id,
    sessionId: row.session_id,
    sequence: row.sequence,
    type: row.type,
    data: parseObject(row.data_json),
    tokenUsage: row.token_usage_json ? parseTokenUsage(row.token_usage_json) : null,
    createdAt: row.created_at,
  }
}

function toRun(row: RunRow): AgentRun {
  return {
    id: row.id,
    sessionId: row.session_id,
    userEntryId: row.user_entry_id,
    status: row.status,
    partialMessage: row.partial_message_json ? parseObject(row.partial_message_json) : null,
    error: row.error_json ? parseError(row.error_json) : null,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }
}

function deriveSessionTitle(data: Record<string, unknown>): string | null {
  if (data.role !== 'user') return null
  const text = extractMessageText(data.content)
  if (!text) return null
  return text.length <= 40 ? text : `${text.slice(0, 37).trimEnd()}...`
}

function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => typeof part === 'object' && part !== null && typeof (part as { text?: unknown }).text === 'string'
      ? (part as { text: string }).text.trim()
      : '')
    .filter(Boolean)
    .join(' ')
    .trim()
}

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function parseTokenUsage(value: string): TokenUsage | null {
  const parsed = parseObject(value)
  return 'turn' in parsed && 'latestCall' in parsed ? parsed as unknown as TokenUsage : null
}

function parseError(value: string): { message: string; code?: string } {
  const parsed = parseObject(value)
  return {
    message: typeof parsed.message === 'string' ? parsed.message : 'Agent run failed',
    ...(typeof parsed.code === 'string' ? { code: parsed.code } : {}),
  }
}
