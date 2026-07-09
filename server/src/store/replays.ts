import type { Database } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { RrwebReplay, RrwebReplayIngestBody, RrwebReplaySummary } from '@traceability/protocol'

export function createRrwebReplaysRepo(db: Database) {
  const rowToSummary = (r: Record<string, unknown>): RrwebReplaySummary => ({
    id: r.id as string,
    appId: r.app_id as string,
    issueId: (r.issue_id as string | null) ?? undefined,
    sentryEventId: (r.sentry_event_id as string | null) ?? undefined,
    receivedAt: r.received_at as string,
    capturedAt: (r.captured_at as string | null) ?? undefined,
    startAt: (r.start_at as number | null) ?? undefined,
    endAt: (r.end_at as number | null) ?? undefined,
    eventCount: r.event_count as number,
    sizeBytes: r.size_bytes as number,
    metadata: JSON.parse(r.metadata as string) as Record<string, unknown>,
  })

  const rowToReplay = (r: Record<string, unknown>): RrwebReplay => ({
    ...rowToSummary(r),
    events: JSON.parse(r.payload as string) as unknown[],
  })

  return {
    save(appId: string, body: RrwebReplayIngestBody): RrwebReplay {
      const replayId = body.replayId ?? randomUUID()
      const payload = JSON.stringify(body.events)
      const now = new Date().toISOString()
      const metadata = JSON.stringify(body.metadata ?? {})
      db.prepare(
        `INSERT INTO rrweb_replays
          (id, app_id, sentry_event_id, received_at, captured_at, start_at, end_at, event_count, size_bytes, payload, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
          app_id = excluded.app_id,
          sentry_event_id = COALESCE(excluded.sentry_event_id, rrweb_replays.sentry_event_id),
          received_at = excluded.received_at,
          captured_at = excluded.captured_at,
          start_at = excluded.start_at,
          end_at = excluded.end_at,
          event_count = excluded.event_count,
          size_bytes = excluded.size_bytes,
          payload = excluded.payload,
          metadata = excluded.metadata`,
      ).run(
        replayId,
        appId,
        body.sentryEventId ?? null,
        now,
        body.capturedAt ?? null,
        body.startAt ?? null,
        body.endAt ?? null,
        body.events.length,
        Buffer.byteLength(payload, 'utf8'),
        payload,
        metadata,
      )
      return this.get(replayId)!
    },

    attachToIssue(replayId: string, issueId: string, appId: string, sentryEventId?: string): RrwebReplaySummary {
      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO rrweb_replays
          (id, app_id, issue_id, sentry_event_id, received_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
          app_id = excluded.app_id,
          issue_id = excluded.issue_id,
          sentry_event_id = COALESCE(rrweb_replays.sentry_event_id, excluded.sentry_event_id)`,
      ).run(replayId, appId, issueId, sentryEventId ?? null, now)
      return this.getSummary(replayId)!
    },

    getSummary(id: string): RrwebReplaySummary | undefined {
      const row = db.prepare('SELECT * FROM rrweb_replays WHERE id = ?').get(id) as Record<string, unknown> | undefined
      return row ? rowToSummary(row) : undefined
    },

    get(id: string): RrwebReplay | undefined {
      const row = db.prepare('SELECT * FROM rrweb_replays WHERE id = ?').get(id) as Record<string, unknown> | undefined
      return row ? rowToReplay(row) : undefined
    },

    getForIssue(issueId: string, replayId: string): RrwebReplay | undefined {
      const row = db
        .prepare('SELECT * FROM rrweb_replays WHERE issue_id = ? AND id = ?')
        .get(issueId, replayId) as Record<string, unknown> | undefined
      return row ? rowToReplay(row) : undefined
    },

    listByIssue(issueId: string, limit = 20): RrwebReplaySummary[] {
      const rows = db
        .prepare('SELECT * FROM rrweb_replays WHERE issue_id = ? ORDER BY received_at DESC LIMIT ?')
        .all(issueId, Math.min(limit, 100)) as Array<Record<string, unknown>>
      return rows.map(rowToSummary)
    },
  }
}
